"""
Inference pipeline for RideSetGo fare prediction.

Loads joblib artifacts (model + preprocessor + location DB) and provides a
validate + predict interface used by the FastAPI backend.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd

ARTIFACT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")

MODEL_PATH = os.path.join(ARTIFACT_DIR, "fare_model.joblib")
PREPROCESSOR_PATH = os.path.join(ARTIFACT_DIR, "preprocessor.joblib")
LOCATION_DB_PATH = os.path.join(ARTIFACT_DIR, "location_db.joblib")


@dataclass
class PredictionResult:
    fare_inr: float
    distance_km: float
    location_resolved: bool
    pickup_name: str
    dropoff_name: str
    pickup_coords: Optional[Tuple[float, float]]
    dropoff_coords: Optional[Tuple[float, float]]
    error: Optional[str] = None


class FarePipeline:
    def __init__(self):
        self.model = None
        self.preprocessor = None
        self.location_db = None
        self.le_pickup = None
        self.le_dropoff = None
        self.features = None
        self._loaded = False

    def load(self) -> bool:
        """Load all joblib artifacts. Returns True on success."""
        if not all(
            os.path.exists(p) for p in [MODEL_PATH, PREPROCESSOR_PATH, LOCATION_DB_PATH]
        ):
            return False
        try:
            self.model = joblib.load(MODEL_PATH)
            self.preprocessor = joblib.load(PREPROCESSOR_PATH)
            self.location_db = joblib.load(LOCATION_DB_PATH)
            self.le_pickup = self.preprocessor["le_pickup"]
            self.le_dropoff = self.preprocessor["le_dropoff"]
            self.features = self.preprocessor["features"]
            self._loaded = True
            return True
        except Exception:
            self._loaded = False
            return False

    def is_loaded(self) -> bool:
        return self._loaded

    def get_locations(self) -> List[str]:
        """Return sorted list of known location names (for dropdowns)."""
        if not self._loaded:
            return []
        return sorted(self.location_db.keys())

    def get_coords(self, location_name: str) -> Optional[Tuple[float, float]]:
        """Return (lat, lng) for a known location, or None."""
        if not self._loaded:
            return None
        entry = self.location_db.get(location_name)
        if entry is None:
            return None
        return (entry["lat"], entry["lng"])

    @staticmethod
    def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371.0
        lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
        c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
        return float(R * c)

    def encode_location(self, le: LabelEncoderType, name: str) -> Optional[int]:
        """Safely encode a location name; returns None if unknown."""
        try:
            return int(le.transform([name])[0])
        except (ValueError, KeyError):
            return None

    def predict(
        self,
        pickup_location: str,
        dropoff_location: str,
        passenger_count: int = 1,
        hour: int = 12,
    ) -> PredictionResult:
        """
        Predict fare for a trip.

        Validates inputs, resolves coordinates from the real location DB,
        computes haversine distance, encodes locations, and runs the model.
        Returns a PredictionResult with fare or an error message.
        """
        if not self._loaded:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=0.0,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=None,
                dropoff_coords=None,
                error="Model not loaded. Train artifacts first.",
            )

        # Validate passenger count
        if not isinstance(passenger_count, int) or passenger_count < 1 or passenger_count > 6:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=0.0,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=None,
                dropoff_coords=None,
                error="Passenger count must be between 1 and 6.",
            )

        # Validate hour
        if not isinstance(hour, int) or hour < 0 or hour > 23:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=0.0,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=None,
                dropoff_coords=None,
                error="Hour must be between 0 and 23.",
            )

        # Same location check
        if pickup_location.strip().lower() == dropoff_location.strip().lower():
            return PredictionResult(
                fare_inr=0.0,
                distance_km=0.0,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=None,
                dropoff_coords=None,
                error="Pickup and dropoff locations cannot be the same.",
            )

        # Resolve coordinates from real location DB
        p_coords = self.get_coords(pickup_location)
        d_coords = self.get_coords(dropoff_location)

        if p_coords is None:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=0.0,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=None,
                dropoff_coords=d_coords,
                error=f"Pickup location '{pickup_location}' not recognized. Choose from the location list.",
            )

        if d_coords is None:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=0.0,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=p_coords,
                dropoff_coords=None,
                error=f"Dropoff location '{dropoff_location}' not recognized. Choose from the location list.",
            )

        # Compute distance (haversine, same formula used in training)
        distance_km = self.haversine_km(p_coords[0], p_coords[1], d_coords[0], d_coords[1])

        # Encode locations
        p_code = self.encode_location(self.le_pickup, pickup_location)
        d_code = self.encode_location(self.le_dropoff, dropoff_location)

        if p_code is None or d_code is None:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=distance_km,
                location_resolved=False,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=p_coords,
                dropoff_coords=d_coords,
                error="One or both locations could not be encoded by the model.",
            )

        # Build input frame matching training feature order
        input_df = pd.DataFrame(
            [[p_code, d_code, distance_km, passenger_count, hour]],
            columns=self.features,
        )

        # Predict
        try:
            fare = float(self.model.predict(input_df)[0])
        except Exception as exc:
            return PredictionResult(
                fare_inr=0.0,
                distance_km=distance_km,
                location_resolved=True,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=p_coords,
                dropoff_coords=d_coords,
                error=f"Prediction failed: {exc}",
            )

        # Sanity check: fare should be non-negative and within a sane range
        if fare < 0 or not np.isfinite(fare):
            return PredictionResult(
                fare_inr=0.0,
                distance_km=distance_km,
                location_resolved=True,
                pickup_name=pickup_location,
                dropoff_name=dropoff_location,
                pickup_coords=p_coords,
                dropoff_coords=d_coords,
                error="Model returned an unexpected fare value.",
            )

        return PredictionResult(
            fare_inr=round(fare, 2),
            distance_km=round(distance_km, 2),
            location_resolved=True,
            pickup_name=pickup_location,
            dropoff_name=dropoff_location,
            pickup_coords=p_coords,
            dropoff_coords=d_coords,
            error=None,
        )


# Lightweight type alias for mypy / readability
LabelEncoderType = object

_pipeline: Optional[FarePipeline] = None


def get_pipeline() -> FarePipeline:
    """Singleton pipeline accessor."""
    global _pipeline
    if _pipeline is None:
        _pipeline = FarePipeline()
        _pipeline.load()
    return _pipeline
