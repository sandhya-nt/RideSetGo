"""
Fare prediction API: estimate fare for a route.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from app.core.logging_config import get_logger
from app.core.metrics import metrics
from app.ml.predictor import predictor
from app.schemas import FareRequest, FareEstimate

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
