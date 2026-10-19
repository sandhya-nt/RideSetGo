"""
ML prediction service for the FastAPI backend.

Wraps ml/pipeline.py (FarePipeline) and provides a clean predict interface
plus category-based fare estimates. All estimates are clearly labelled as
demo/estimated pricing — not official Uber/Ola/Rapido quotes.
"""
from __future__ import annotations

import os
import sys

# Ensure project root is on sys.path so `ml` package (at project root) is importable
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from typing import Dict, List, Optional

from ml.pipeline import FarePipeline, get_pipeline

# Ride categories with demo multipliers applied on top of the base ML fare.
# These multipliers are heuristic (not trained per-category models) and are
# clearly labelled as estimated/demo pricing in the frontend.
CATEGORY_CONFIG: List[dict] = [
    {"name": "Bike", "display_name": "Bike", "multiplier": 0.70, "icon": "bike", "min_fare": 30.0},
    {"name": "Auto", "display_name": "Auto Rickshaw", "multiplier": 0.80, "icon": "auto", "min_fare": 35.0},
    {"name": "Mini", "display_name": "Mini", "multiplier": 0.90, "icon": "car", "min_fare": 40.0},
    {"name": "Sedan", "display_name": "Sedan", "multiplier": 1.15, "icon": "car", "min_fare": 50.0},
    {"name": "SUV", "display_name": "SUV", "multiplier": 1.40, "icon": "car", "min_fare": 70.0},
]

CATEGORY_BY_NAME = {c["name"]: c for c in CATEGORY_CONFIG}


def estimate_duration_min(distance_km: float) -> int:
    """Rough estimated duration in minutes (average ~25 km/h city speed + buffer)."""
    if distance_km <= 0:
        return 5
    return max(5, int((distance_km / 25.0) * 60) + 5)


class FarePredictor:
    def __init__(self):
        self.pipeline: Optional[FarePipeline] = None

    def _ensure_loaded(self) -> bool:
        if self.pipeline is None:
            self.pipeline = get_pipeline()
        return self.pipeline.is_loaded()

    def predict_fare(
        self, pickup_location: str, dropoff_location: str,
        passenger_count: int = 1, hour: int = 12,
    ) -> dict:
        """
        Run the ML model for a single fare prediction.

        Returns a dict with fare, distance, coords, and any error.
        """
        if not self._ensure_loaded():
            return {
                "ok": False,
                "error": "ML model not loaded. Train artifacts first (ml/train_model.py).",
            }

        result = self.pipeline.predict(
            pickup_location=pickup_location,
            dropoff_location=dropoff_location,
            passenger_count=passenger_count,
            hour=hour,
        )

        if result.error:
            return {
                "ok": False,
                "error": result.error,
                "pickup_location": result.pickup_name,
                "dropoff_location": result.dropoff_name,
                "pickup_coords": result.pickup_coords,
                "dropoff_coords": result.dropoff_coords,
                "location_resolved": result.location_resolved,
                "distance_km": result.distance_km,
            }

        return {
            "ok": True,
            "base_fare_inr": round(result.fare_inr, 2),
            "distance_km": result.distance_km,
            "duration_min": estimate_duration_min(result.distance_km),
            "pickup_location": result.pickup_name,
            "dropoff_location": result.dropoff_name,
            "pickup_coords": result.pickup_coords,
            "dropoff_coords": result.dropoff_coords,
            "location_resolved": True,
        }

    def get_category_estimates(self, base_fare_inr: float) -> List[dict]:
        """Return per-category demo fare estimates based on base ML fare."""
        estimates = []
        for cat in CATEGORY_CONFIG:
            raw = base_fare_inr * cat["multiplier"]
            final = max(cat["min_fare"], round(raw, 2))
            estimates.append({
                "name": cat["name"],
                "display_name": cat["display_name"],
                "icon": cat["icon"],
                "multiplier": cat["multiplier"],
                "estimated_fare_inr": final,
                "min_fare": cat["min_fare"],
            })
        return estimates

    def get_locations(self) -> List[str]:
        if not self._ensure_loaded():
            return []
        return self.pipeline.get_locations()

    def get_location_coords(self, name: str) -> Optional[tuple]:
        if not self._ensure_loaded():
            return None
        return self.pipeline.get_coords(name)

    def get_model_metrics(self) -> Optional[dict]:
        if not self._ensure_loaded() or self.pipeline.preprocessor is None:
            return None
        return self.pipeline.preprocessor.get("metrics")


predictor = FarePredictor()
