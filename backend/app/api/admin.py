"""
Admin API: users, bookings, categories, pricing config, analytics, system
health (role-gated).
"""
from __future__ import annotations

from datetime import datetime, date, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.config import settings
from app.core.health import check_database
from app.core.logging_config import get_logger
from app.core.metrics import metrics
from app.database import get_db
from app.api.auth import get_current_user
from app.models import User, Ride, Payment, RideCategory, DriverApplication
from app.schemas import AdminStats, RideCategoryOut

router = APIRouter(prefix="/admin", tags=["admin"])

logger = get_logger("ridesetgo.admin")


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/stats", response_model=AdminStats)
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Demo analytics — no fabricated data, only what is stored in SQLite."""
    total_users = db.query(User).count()
    total_rides = db.query(Ride).count()
    total_revenue = db.query(func.sum(Payment.amount)).filter(Payment.status == "completed").scalar() or 0.0

    rides_by_status = (
        db.query(Ride.status, func.count(Ride.id))
        .group_by(Ride.status)
        .all()
    )
    rides_by_category = (
        db.query(Ride.category, func.count(Ride.id))
        .group_by(Ride.category)
        .all()
    )

    return AdminStats(
        total_users=total_users,
        total_rides=total_rides,
        total_revenue_inr=round(float(total_revenue), 2),
        rides_by_status={s: c for s, c in rides_by_status},
        rides_by_category={c: n for c, n in rides_by_category},
    )


@router.get("/users", response_model=list[dict])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List all demo users (admin only)."""
    users = db.query(User).all()
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active} for u in users]


@router.get("/rides")
def list_rides_admin(
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = db.query(Ride)
    if status:
        query = query.filter(Ride.status == status)
    if date_from:
        query = query.filter(Ride.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Ride.created_at <= datetime.combine(date_to, datetime.max.time()))
    if q:
        # search by ride id or locations
        if q.isdigit():
            query = query.filter(Ride.id == int(q))
        else:
            like = f"%{q}%"
            query = query.filter((Ride.pickup_location.ilike(like)) | (Ride.dropoff_location.ilike(like)))
    rides = query.order_by(Ride.created_at.desc()).limit(200).all()
    out = []
    for r in rides:
        out.append({
            "id": r.id,
            "user_id": r.user_id,
            "driver_id": r.driver_id,
            "pickup_location": r.pickup_location,
            "dropoff_location": r.dropoff_location,
            "category": r.category,
            "base_fare": r.base_fare,
            "final_fare": r.final_fare,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
            "cancellation_reason": r.cancellation_reason,
        })
    return out


@router.get("/payments")
def list_payments_admin(
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List payment records (admin only)."""
    query = db.query(Payment)
    if status:
        query = query.filter(Payment.status == status)
    if date_from:
        query = query.filter(Payment.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        query = query.filter(Payment.created_at <= datetime.combine(date_to, datetime.max.time()))
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Payment.transaction_id.ilike(like)) | (Payment.method.ilike(like))
        )
    payments = query.order_by(Payment.created_at.desc()).limit(200).all()
    ride_ids = [p.ride_id for p in payments]
    rides_by_id = {
        r.id: r
        for r in db.query(Ride).filter(Ride.id.in_(ride_ids)).all()
    } if ride_ids else {}
    out = []
    for p in payments:
        ride = rides_by_id.get(p.ride_id)
        out.append({
            "id": p.id,
            "ride_id": p.ride_id,
            "booking_reference": f"RSG-{p.ride_id:06d}",
            "amount": p.amount,
            "currency": p.currency,
            "method": p.method,
            "status": p.status,
            "transaction_id": p.transaction_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "pickup_location": ride.pickup_location if ride else None,
            "dropoff_location": ride.dropoff_location if ride else None,
        })
    return out


@router.get("/payments/summary")
def payments_summary(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from sqlalchemy import func
    counts = (
        db.query(Payment.status, func.count(Payment.id))
        .group_by(Payment.status)
        .all()
    )
    total_confirmed = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.status == "completed")
        .scalar()
        or 0.0
    )
    return {
        "counts": {s: c for s, c in counts},
        "total_confirmed": round(float(total_confirmed), 2),
    }


@router.get("/system-health")
def system_health(
    admin: User = Depends(require_admin),
):
    """
    Live operational status of this backend (admin only).

    Every value is measured from the running process — nothing is mocked and
    nothing is estimated. The response contains counters, latency
    percentiles and dependency status only: no stack traces, no connection
    strings, no user data and no log lines.
    """
    snapshot = metrics.snapshot()
    db_ok, db_latency_ms = check_database()
    metrics.record_health_check(db_ok)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "service": {
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "status": "ok" if db_ok else "degraded",
            "uptime_seconds": snapshot["uptime_seconds"],
            "started_at": snapshot["started_at"],
        },
        "database": {
            "ready": db_ok,
            "latency_ms": round(db_latency_ms, 2),
            "failures_total": snapshot["database"]["failures_total"],
            "last_failure_at": snapshot["database"]["last_failure_at"],
        },
        "requests": snapshot["requests"],
        "latency_ms": snapshot["latency_ms"],
        "health_checks": snapshot["health_checks"],
        "errors": {
            "unhandled_exceptions": snapshot["unhandled_exceptions"],
            "external_failures": snapshot["external_failures"],
            "client_errors_reported": snapshot["client_errors_reported"],
        },
        "top_routes": snapshot["top_routes"][:20],
    }


def list_driver_applications(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    apps = db.query(DriverApplication).order_by(DriverApplication.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "full_name": a.full_name,
            "email": a.email,
            "vehicle_category": a.vehicle_category,
            "status": a.status,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in apps
    ]
