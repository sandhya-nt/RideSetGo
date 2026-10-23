"""
Fare prediction API: estimate fare for a route.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from app.core.logging_config import get_logger
from app.core.metrics import metrics
from app.ml.predictor import predictor
from app.schemas import FareRequest, FareEstimate, FareCompareRequest, FareCompareResponse, FareCompareItem
from app.database import SessionLocal
from app.models import RideCategory

logger = get_logger("ridesetgo.fare")

router = APIRouter(prefix="/fare", tags=["fare"])


@router.post("/estimate", response_model=FareEstimate)
def estimate_fare(req: FareRequest):
    """
    Estimate fare for a trip.

    Uses the validated ML model for the base fare, then applies
    heuristic category multipliers (clearly labelled as demo pricing).
    """
    result = predictor.predict_fare(
        pickup_location=req.pickup_location,
        dropoff_location=req.dropoff_location,
        passenger_count=req.passenger_count,
        hour=req.hour,
    )

    if not result["ok"]:
        # The ML artifact is an internal dependency: record the failure so it
        # shows up in the operational metrics, but never leak the details.
        metrics.record_external_failure("ml_model")
        logger.error(
            "fare_prediction_failed",
            extra={"error": str(result.get("error", ""))[:200]},
        )
        raise HTTPException(status_code=400, detail=result["error"])

    base_fare = result["base_fare_inr"]
    category_estimates = predictor.get_category_estimates(base_fare)

    return FareEstimate(
        pickup_location=result["pickup_location"],
        dropoff_location=result["dropoff_location"],
        distance_km=result["distance_km"],
        duration_min=result["duration_min"],
        base_fare_inr=base_fare,
        category_multipliers={e["name"]: e["estimated_fare_inr"] for e in category_estimates},
        currency="INR",
        note=(
            "Estimated/demo pricing only. Not an official Uber, Ola, or Rapido quote. "
            "Category multipliers are heuristic and not per-category trained models."
        ),
    )


@router.post("/compare", response_model=FareCompareResponse)
def compare_fares(req: FareCompareRequest):
    result = predictor.predict_fare(
        pickup_location=req.pickup_location,
        dropoff_location=req.dropoff_location,
        passenger_count=req.passenger_count,
        hour=req.hour,
    )
    if not result["ok"]:
        metrics.record_external_failure("ml_model")
        raise HTTPException(status_code=400, detail=result["error"])

    base_fare = result["base_fare_inr"]
    db = SessionLocal()
    try:
        cats = db.query(RideCategory).filter(RideCategory.is_active.is_(True)).all()
    finally:
        db.close()

    if not cats:
        from app.ml.predictor import predictor as _p
        raw_items = _p.get_category_estimates(base_fare)
        items = [
            FareCompareItem(
                name=e["name"], display_name=e["display_name"], icon=e["icon"],
                multiplier=e["multiplier"], min_fare=e["min_fare"],
                estimated_fare_inr=e["estimated_fare_inr"],
            ) for e in raw_items
        ]
    else:
        items = []
        for c in cats:
            raw = base_fare * (c.base_multiplier or 1.0)
            final = max(c.min_fare or 0.0, round(raw, 2))
            items.append(FareCompareItem(
                name=c.name, display_name=c.display_name, icon=c.icon_name,
                multiplier=c.base_multiplier or 1.0, min_fare=c.min_fare or 0.0,
                estimated_fare_inr=final,
            ))

    if items:
        cheapest_val = min(i.estimated_fare_inr for i in items)
        for i in items:
            i.is_cheapest = i.estimated_fare_inr == cheapest_val
        fastest = min(items, key=lambda x: x.multiplier)
        fastest.is_fastest = True

    return FareCompareResponse(
        pickup_location=result["pickup_location"],
        dropoff_location=result["dropoff_location"],
        distance_km=result["distance_km"],
        duration_min=result["duration_min"],
        base_fare_inr=base_fare,
        items=items,
        note="Estimated/demo pricing. Category multipliers from ride_categories.",
    )
