"""
Ride category API: list available ride categories (Bike, Auto, Mini, Sedan, SUV).
"""
from __future__ import annotations

from fastapi import APIRouter
from app.ml.predictor import CATEGORY_CONFIG

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[dict])
def list_categories():
    """Return ride categories with demo multipliers and icons."""
    return CATEGORY_CONFIG
