"""
Location API: list known Amritsar locations with real coordinates.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from app.ml.predictor import predictor

router = APIRouter(prefix="/locations", tags=["locations"])


@router.get("/", response_model=list[dict])
def list_locations():
    """Return all known locations with name, lat, lng (from real CSV data)."""
    if not predictor._ensure_loaded():
        raise HTTPException(
            status_code=503, detail="ML model not loaded"
        )
    locations = predictor.pipeline.get_locations()
    result = []
    for name in locations:
        coords = predictor.pipeline.get_coords(name)
        if coords:
            result.append({"name": name, "lat": coords[0], "lng": coords[1]})
    return result
