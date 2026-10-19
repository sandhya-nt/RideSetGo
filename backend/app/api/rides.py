"""
Ride API: booking, status, history, cancellation, payments, receipts, ratings.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.idempotency import (
    IDEMPOTENCY_HEADER,
    IN_PROGRESS,
    REPLAY,
    claim,
    load_response,
    release,
    sanitize_idempotency_key,
    store_response,
)
from app.core.logging_config import get_logger
from app.core.metrics import metrics
from app.database import get_db
from app.api.auth import get_current_user
from app.models import User, Ride, Payment, Rating, Notification
from app.schemas import (
    RideRequest,
    RideOut,
    RideStatusUpdate,
    PaymentOut,
    PaymentStatusUpdate,
    PaymentConfig,
    ReceiptOut,
    CancelRideRequest,
    CancelRideResponse,
    RatingCreate,
    RatingOut,
    RideTrackingOut,
    TrackingCapabilities,
    TrackingDriver,
    TrackingStage,
)

router = APIRouter(prefix="/rides", tags=["rides"])

logger = get_logger("ridesetgo.rides")

#: Scope used for the booking idempotency records.
BOOKING_IDEMPOTENCY_SCOPE = "rides.book"

# ---------------------------------------------------------------------------
# Ride status model (single source of truth for the tracking screen).
#
# These are the only statuses the API accepts (see update_ride_status) and the
# only ones a booking can hold. The tracking screen renders exactly these
# stages - no "driver approaching pickup" stage exists in this backend.
# ---------------------------------------------------------------------------
RIDE_STATUS_LABELS: dict[str, str] = {
    "requested": "Ride requested",
    "accepted": "Driver assigned",
    "started": "Ride started",
    "completed": "Ride completed",
    "cancelled": "Ride cancelled",
}

# Ordered happy-path stages. "cancelled" is deliberately excluded: it is a
# terminal branch, not a step on the progress line.
RIDE_PROGRESS_STAGES: list[tuple[str, str, str]] = [
    (
        "requested",
        "Ride requested",
        "Your booking is confirmed and waiting for a driver to accept it.",
    ),
    (
        "accepted",
        "Driver assigned",
        "A driver has accepted your ride and is on the way to the pickup point.",
    ),
    (
        "started",
        "Ride started",
        "Your trip is under way towards the destination.",
    ),
    (
        "completed",
        "Ride completed",
        "Your trip has finished. The fare summary is available in the receipt.",
    ),
]

# Statuses after which nothing can change any more. The frontend uses this to
# stop refreshing the trip.
TERMINAL_RIDE_STATUSES = ("completed", "cancelled")


def _require_ride_owner_or_admin(ride: Ride, current_user: User) -> None:
    if ride.user_id != current_user.id and current_user.role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Not authorized")


def _create_notification(
    db: Session,
    user_id: int,
    ride_id: Optional[int],
    type_: str,
    title: str,
    message: str,
) -> None:
    db.add(
        Notification(
            user_id=user_id,
            ride_id=ride_id,
            type=type_,
            title=title,
            message=message,
        )
    )


@router.post("/book", response_model=RideOut, status_code=status.HTTP_201_CREATED)
def book_ride(
    ride_in: RideRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new ride booking (demo mode — no real driver dispatch).

    Status starts as 'requested'. Payment is a clearly labelled mock flow.

    Duplicate-submission protection (Phase 19)
    -------------------------------------------
    The client may send an ``Idempotency-Key`` header. When present, a retry
    of the *same* booking (for example after a network timeout) returns the
    original booking instead of creating a second ride and a second payment
    record. Requests without the header behave exactly as before.
    """
    idempotency_key = sanitize_idempotency_key(
        request.headers.get(IDEMPOTENCY_HEADER)
    )
    idempotency_record = None
    if idempotency_key:
        state, idempotency_record = claim(
            db, current_user.id, BOOKING_IDEMPOTENCY_SCOPE, idempotency_key
        )
        if state == REPLAY and idempotency_record is not None:
            status_code, body = load_response(idempotency_record)
            logger.info(
                "booking_replayed",
                extra={"status_code": status_code, "scope": BOOKING_IDEMPOTENCY_SCOPE},
            )
            return JSONResponse(status_code=status_code, content=body)
        if state == IN_PROGRESS:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This booking request is already being processed. "
                    "Please wait a moment before trying again."
                ),
            )

    try:
        ride = Ride(
            user_id=current_user.id,
            pickup_location=ride_in.pickup_location,
            dropoff_location=ride_in.dropoff_location,
            pickup_lat=ride_in.pickup_lat,
            pickup_lng=ride_in.pickup_lng,
            dropoff_lat=ride_in.dropoff_lat,
            dropoff_lng=ride_in.dropoff_lng,
            distance_km=ride_in.distance_km,
            category=ride_in.category,
            base_fare=ride_in.distance_km * 15.0,  # simple demo base fare calc
            final_fare=ride_in.distance_km * 15.0,
            currency="INR",
            status="requested",
            passenger_count=ride_in.passenger_count,
            hour=ride_in.hour,
        )
        db.add(ride)
        db.commit()
        db.refresh(ride)

        # Payment record. Cash is paid directly to the driver (not a platform
        # transaction) -> status "not_applicable". Online payments without a
        # real gateway are clearly labelled demo/pending — no real money is
        # processed.
        payment_method = (ride_in.payment_method or "cash").strip().lower()
        if payment_method == "cash":
            pm_method = "cash"
            pm_status = "not_applicable"
            pm_txn = None
        else:
            # online: demo pending payment (no real gateway configured)
            pm_method = "mock_wallet"
            pm_status = "pending"
            pm_txn = f"MOCK-{ride.id}"

        payment = Payment(
            ride_id=ride.id,
            amount=ride.final_fare,
            currency="INR",
            method=pm_method,
            status=pm_status,
            transaction_id=pm_txn,
        )
        db.add(payment)
        db.commit()

        # Notify the customer that their booking (and payment) is pending.
        _create_notification(
            db,
            current_user.id,
            ride.id,
            "booking_created",
            "Booking created",
            f"Your ride #{ride.id} from {ride.pickup_location} to {ride.dropoff_location} has been booked. Payment status: {pm_status}.",
        )
        db.commit()
    except Exception:
        # The booking did not complete: release the key so the user can retry.
        db.rollback()
        release(db, idempotency_record)
        raise

    if idempotency_record is not None:
        store_response(
            db,
            idempotency_record,
            status.HTTP_201_CREATED,
            RideOut.model_validate(ride).model_dump(mode="json"),
        )

    return ride


@router.get("/", response_model=list[RideOut])
def list_my_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the authenticated user's ride history."""
    return db.query(Ride).filter(Ride.user_id == current_user.id).order_by(Ride.created_at.desc()).all()


@router.get("/payment-config", response_model=PaymentConfig)
def payment_config():
    """Return the configured payment gateway state.

    No gateway credentials are present in this demo deployment, so the client
    should only offer Cash and present payments as clearly-labelled demo /
    payment-pending. Never process real money without a configured gateway.
    """
    gateway = settings.PAYMENT_GATEWAY
    configured = bool(settings.STRIPE_SECRET_KEY)
    supported_methods = ["cash"]
    if configured and gateway != "demo":
        supported_methods.append("online")
    return PaymentConfig(
        gateway=gateway,
        gateway_configured=configured,
        supported_methods=supported_methods,
        demo=not configured,
    )


@router.get("/available", response_model=list[RideOut])
def list_available_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List rides that are still waiting for a driver.

    NOTE: this handler must stay declared *above* `@router.get("/{ride_id}")`.
    FastAPI matches routes in declaration order, so a static sub-path such as
    "available" that is declared after the int-typed `/{ride_id}` route would
    be captured by it and rejected with a 422 validation error.
    """
    if current_user.role not in ("driver", "admin"):
        raise HTTPException(status_code=403, detail="Driver role required")
    return (
        db.query(Ride)
        .filter(Ride.status == "requested", Ride.driver_id.is_(None))
        .order_by(Ride.created_at.desc())
        .all()
    )


@router.get("/{ride_id}", response_model=RideOut)
def get_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a single ride by ID (owner only)."""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id and current_user.role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Not authorized")
    return ride


@router.get("/{ride_id}/tracking", response_model=RideTrackingOut)
def get_ride_tracking(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return everything the live tracking screen needs for one ride.

    Access control: the passenger who booked the ride, an administrator, or the
    driver assigned to this specific ride. Any other passenger gets 403 even if
    they know the ride id, so a shared URL can never expose someone else's trip.

    Honesty rules for the payload:
      * Pickup/destination coordinates come from the stored booking.
      * Driver details come from the real assigned driver account and are
        limited to the display name and contact number.
      * `driver_location` is always null: this backend stores no driver GPS.
      * `route_geometry` is always null: no routing provider is integrated.
      * `estimated_duration_min` is the stored column, which is null unless a
        duration was persisted at booking time.
    """
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    is_owner = ride.user_id == current_user.id
    is_assigned_driver = (
        ride.driver_id is not None and ride.driver_id == current_user.id
    )
    if not (is_owner or is_assigned_driver or current_user.role == "admin"):
        raise HTTPException(status_code=403, detail="Not authorized")

    driver: Optional[TrackingDriver] = None
    if ride.driver_id is not None:
        driver_user = db.query(User).filter(User.id == ride.driver_id).first()
        if driver_user is not None:
            driver = TrackingDriver(
                name=driver_user.full_name,
                phone=driver_user.phone,
            )

    # No driver GPS is stored by this backend (there is no driver location
    # table in app/models.py) and no routing provider is integrated, so both
    # stay null until a real source exists. They are never faked.
    driver_location = None
    route_geometry = None

    eta_available = ride.estimated_duration_min is not None

    return RideTrackingOut(
        id=ride.id,
        status=ride.status,
        status_label=RIDE_STATUS_LABELS.get(ride.status, ride.status.title()),
        is_terminal=ride.status in TERMINAL_RIDE_STATUSES,
        stages=[
            TrackingStage(key=key, label=label, description=description)
            for key, label, description in RIDE_PROGRESS_STAGES
        ],
        booking_reference=f"RSG-{ride.id:06d}",
        pickup_location=ride.pickup_location,
        dropoff_location=ride.dropoff_location,
        pickup_lat=ride.pickup_lat,
        pickup_lng=ride.pickup_lng,
        dropoff_lat=ride.dropoff_lat,
        dropoff_lng=ride.dropoff_lng,
        distance_km=ride.distance_km,
        estimated_duration_min=ride.estimated_duration_min,
        category=ride.category,
        base_fare=ride.base_fare,
        final_fare=ride.final_fare,
        currency=ride.currency or "INR",
        passenger_count=ride.passenger_count,
        created_at=ride.created_at,
        updated_at=ride.updated_at,
        cancelled_at=ride.cancelled_at,
        cancellation_reason=ride.cancellation_reason,
        driver=driver,
        driver_location=driver_location,
        route_geometry=route_geometry,
        capabilities=TrackingCapabilities(
            live_tracking_available=False,
            driver_location_available=False,
            route_geometry_available=False,
            eta_available=eta_available,
            message=(
                "Live driver tracking is not currently available for this ride. "
                "RideSetGo does not store or stream driver GPS positions, so no "
                "vehicle marker or ETA can be shown. Your trip status is kept up "
                "to date below."
            ),
        ),
    )


@router.patch("/{ride_id}/status", response_model=RideOut)
def update_ride_status(
    ride_id: int,
    status_update: RideStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update ride status (customer cancels; driver/admin accepts/starts/completes)."""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id and current_user.role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Not authorized")

    allowed = ["requested", "accepted", "started", "completed", "cancelled"]
    if status_update.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")

    ride.status = status_update.status
    db.commit()
    db.refresh(ride)
    return ride


@router.post("/{ride_id}/accept", response_model=RideOut)
def accept_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("driver", "admin"):
        raise HTTPException(status_code=403, detail="Driver role required")
    active = (
        db.query(Ride)
        .filter(Ride.driver_id == current_user.id, Ride.status.in_(("accepted", "started")))
        .first()
    )
    if active:
        raise HTTPException(status_code=409, detail="Driver already has an active trip")
    ride = db.query(Ride).filter(Ride.id == ride_id).with_for_update().first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.status != "requested" or ride.driver_id is not None:
        raise HTTPException(status_code=409, detail="Ride already accepted or not available")
    ride.driver_id = current_user.id
    ride.status = "accepted"
    db.commit()
    db.refresh(ride)
    return ride


@router.delete("/{ride_id}", response_model=CancelRideResponse)
def cancel_ride(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a ride (customer only, only if requested or accepted).

    Kept for backward compatibility; no cancellation reason is recorded.
    """
    return _cancel_ride_service(db, ride_id, current_user, reason=None)


@router.post("/{ride_id}/cancel", response_model=CancelRideResponse)
def cancel_ride_with_reason(
    ride_id: int,
    cancel_in: CancelRideRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancel a ride with an optional reason (customer only).

    Server-side eligibility checks: only 'requested' or 'accepted' rides can be
    cancelled. Completed, started or already-cancelled rides are rejected.
    Duplicate cancellation attempts are prevented (a cancelled ride cannot be
    cancelled again). Records a cancellation timestamp and reason.
    """
    return _cancel_ride_service(
        db, ride_id, current_user, reason=cancel_in.reason
    )


def _cancel_ride_service(
    db: Session, ride_id: int, current_user: User, reason: Optional[str]
) -> CancelRideResponse:
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Prevent duplicate cancellation and cancellation of ineligible rides.
    if ride.status == "cancelled":
        raise HTTPException(
            status_code=400, detail="This ride has already been cancelled"
        )
    if ride.status not in ("requested", "accepted"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel a {ride.status} ride",
        )

    ride.status = "cancelled"
    ride.cancellation_reason = reason
    ride.cancelled_at = datetime.now(timezone.utc)
    db.add(ride)

    # Notification after successful cancellation (history is updated via the
    # ride status change, which is reflected on the next history fetch).
    _create_notification(
        db,
        current_user.id,
        ride.id,
        "ride_cancelled",
        "Ride cancelled",
        f"Your ride #{ride.id} ({ride.pickup_location} → {ride.dropoff_location}) was cancelled."
        + (f" Reason: {reason}" if reason else ""),
    )
    db.commit()
    db.refresh(ride)

    return CancelRideResponse(
        message="Ride cancelled successfully",
        ride_id=ride.id,
        status=ride.status,
        cancellation_reason=ride.cancellation_reason,
        cancelled_at=ride.cancelled_at,
    )


@router.get("/{ride_id}/payment", response_model=PaymentOut)
def get_payment(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return payment status for a ride (owner only)."""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id and current_user.role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Not authorized")
    payment = db.query(Payment).filter(Payment.ride_id == ride_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")
    return payment


@router.patch("/{ride_id}/payment", response_model=PaymentOut)
def update_payment_status(
    ride_id: int,
    status_update: PaymentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update payment status for a ride.

    Server-side validation only. A normal user can never mark their own online
    payment as Paid — that requires a verified payment provider webhook. Cash
    payments are not platform-mediated and cannot be changed here.
    """
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")

    payment = db.query(Payment).filter(Payment.ride_id == ride_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found")

    new_status = status_update.status
    current_status = payment.status

    # Terminal states cannot be changed.
    if current_status in ("completed", "failed", "refunded", "not_applicable"):
        raise HTTPException(
            status_code=400,
            detail=f"Payment is already {current_status} and cannot be changed",
        )

    # Cash is paid directly to the driver; not a platform transaction.
    if payment.method == "cash":
        raise HTTPException(
            status_code=400,
            detail="Cash payments cannot be updated through this endpoint",
        )

    # Online payments: Paid/Failed can only be set by a verified provider
    # webhook — never by the customer through this endpoint.
    if new_status in ("completed", "failed"):
        raise HTTPException(
            status_code=403,
            detail=(
                "Online payments can only be marked Paid/Failed by a verified "
                "payment provider webhook. Never trust the frontend for payment outcome."
            ),
        )

    if new_status == "refunded":
        if current_user.role != "admin":
            raise HTTPException(
                status_code=403,
                detail="Only an administrator can refund a payment",
            )
        payment.status = "refunded"
    elif new_status == "pending":
        payment.status = "pending"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported transition: {current_status} -> {new_status}")

    db.commit()
    db.refresh(payment)
    return payment


@router.post("/payments/webhook")
def payment_webhook():
    """Provider webhook endpoint.

    Present for future integration with a real payment gateway. When no
    gateway credentials are configured it reports demo mode and does not
    process or confirm any payment.
    """
    if not settings.STRIPE_SECRET_KEY:
        return {
            "message": "No payment gateway configured — running in demo mode",
            "processed": False,
        }
    # TODO: verify webhook signature (STRIPE_WEBHOOK_SECRET) and update the
    # matching payment record based on the provider's confirmed outcome.
    # Until signature verification exists the webhook must not change any
    # payment, so the failure is recorded for the operations dashboard.
    metrics.record_external_failure("payment_gateway")
    logger.error(
        "payment_webhook_unverified",
        extra={"reason": "signature verification is not implemented"},
    )
    return {"message": "Webhook received", "processed": False}


@router.get("/{ride_id}/receipt", response_model=ReceiptOut)
def get_receipt(
    ride_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a professional receipt for a stored booking (owner only).

    Never generates receipts for nonexistent bookings. Never represents an
    estimated fare as an actual charged amount.
    """
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id and current_user.role not in ("admin", "driver"):
        raise HTTPException(status_code=403, detail="Not authorized")

    payment = db.query(Payment).filter(Payment.ride_id == ride_id).first()

    is_demo = (
        settings.PAYMENT_GATEWAY == "demo"
        or payment is None
        or payment.method == "mock_wallet"
    )

    return ReceiptOut(
        ride_id=ride.id,
        booking_reference=f"RSG-{ride.id:06d}",
        booking_date=ride.created_at,
        pickup_location=ride.pickup_location,
        dropoff_location=ride.dropoff_location,
        ride_category=ride.category,
        fare_amount=ride.final_fare,
        currency=ride.currency,
        payment_method=payment.method if payment else None,
        payment_status=payment.status if payment else None,
        is_demo=is_demo,
        disclaimer=(
            "This is a demo estimate, not an official receipt. No real payment was processed."
            if is_demo
            else "Amount charged to your selected payment method."
        ),
    )


@router.post("/{ride_id}/rating", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def add_rating(
    ride_id: int,
    rating_in: RatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a rating/feedback for a completed ride."""
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if ride.status != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed rides")

    existing = db.query(Rating).filter(Rating.ride_id == ride_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Rating already exists for this ride")

    rating = Rating(
        ride_id=ride_id,
        user_id=current_user.id,
        score=rating_in.score,
        comment=rating_in.comment,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating
