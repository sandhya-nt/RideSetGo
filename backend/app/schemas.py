"""
Pydantic schemas for RideSetGo API request/response validation.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, validator


# ---------- Auth ----------
class UserSignup(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    phone: Optional[str] = None
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str]
    role: str
    is_active: bool

    class Config:
        from_attributes = True


# ---------- Locations ----------
class LocationOut(BaseModel):
    name: str
    lat: float
    lng: float


# ---------- Fare ----------
class FareRequest(BaseModel):
    pickup_location: str
    dropoff_location: str
    passenger_count: int = Field(default=1, ge=1, le=6)
    hour: int = Field(default=12, ge=0, le=23)


class FareEstimate(BaseModel):
    pickup_location: str
    dropoff_location: str
    distance_km: float
    duration_min: int
    base_fare_inr: float
    category_multipliers: dict  # category -> estimated fare
    currency: str = "INR"
    note: str


# ---------- Ride ----------
class RideRequest(BaseModel):
    pickup_location: str
    dropoff_location: str
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    distance_km: float
    category: str
    passenger_count: int = Field(default=1, ge=1, le=6)
    hour: Optional[int] = None
    payment_method: Optional[str] = Field(default="cash")  # cash | online


class RideOut(BaseModel):
    id: int
    pickup_location: str
    dropoff_location: str
    distance_km: float
    category: str
    base_fare: float
    final_fare: float
    currency: str
    status: str
    passenger_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class RideStatusUpdate(BaseModel):
    status: str


# ---------- Live Trip Tracking ----------
#
# Schemas for GET /rides/{ride_id}/tracking.
#
# Design rules for this block (Phase 11):
#   * Every field is either stored in the database or explicitly null.
#   * `driver_location` and `route_geometry` are null because this backend has
#     no driver-GPS store and no routing provider. They exist so the contract
#     for a future real tracking source is explicit instead of guessed at.
#   * `capabilities` tells the client exactly which parts of the screen are
#     backed by real data, so the UI can show honest unavailable states.
class TrackingStage(BaseModel):
    """One step of the real backend status model."""

    key: str
    label: str
    description: str


class TrackingDriver(BaseModel):
    """Driver details a passenger is allowed to see for their own ride.

    Only the assigned driver's display name and contact number are exposed.
    Driver email, password hash and every other private field stay server side.
    """

    name: str
    phone: Optional[str] = None


class TrackingDriverLocation(BaseModel):
    """Last known driver position. Null until a real GPS source exists."""

    lat: float
    lng: float
    updated_at: datetime


class TrackingRoutePoint(BaseModel):
    """A single point of a real road route. Null until a routing provider exists."""

    lat: float
    lng: float


class TrackingCapabilities(BaseModel):
    live_tracking_available: bool
    driver_location_available: bool
    route_geometry_available: bool
    eta_available: bool
    message: str


class RideTrackingOut(BaseModel):
    id: int
    status: str
    status_label: str
    is_terminal: bool
    stages: List[TrackingStage]
    booking_reference: str
    pickup_location: str
    dropoff_location: str
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    distance_km: float
    estimated_duration_min: Optional[int]
    category: str
    base_fare: float
    final_fare: float
    currency: str
    passenger_count: int
    created_at: datetime
    updated_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    cancellation_reason: Optional[str]
    driver: Optional[TrackingDriver]
    driver_location: Optional[TrackingDriverLocation]
    route_geometry: Optional[List[TrackingRoutePoint]]
    capabilities: TrackingCapabilities

    class Config:
        from_attributes = True


# ---------- Payment ----------
class PaymentOut(BaseModel):
    id: int
    ride_id: int
    amount: float
    currency: str
    method: str
    status: str
    transaction_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class PaymentStatusUpdate(BaseModel):
    status: str

    @validator("status")
    def validate_status(cls, v: str) -> str:
        allowed = ["pending", "completed", "failed", "refunded", "not_applicable"]
        if v not in allowed:
            raise ValueError(f"Invalid status. Allowed: {allowed}")
        return v


class PaymentConfig(BaseModel):
    gateway: str  # demo | stripe
    gateway_configured: bool
    supported_methods: List[str]  # e.g. ["cash"] or ["cash", "online"]
    demo: bool


# ---------- Receipt ----------
class ReceiptOut(BaseModel):
    ride_id: int
    booking_reference: str
    booking_date: datetime
    pickup_location: str
    dropoff_location: str
    ride_category: str
    fare_amount: float
    currency: str
    payment_method: Optional[str]
    payment_status: Optional[str]
    is_demo: bool
    disclaimer: str

    class Config:
        from_attributes = True


# ---------- Cancellation ----------
class CancelRideRequest(BaseModel):
    reason: Optional[str] = None


class CancelRideResponse(BaseModel):
    message: str
    ride_id: int
    status: str
    cancellation_reason: Optional[str]
    cancelled_at: Optional[datetime]

    class Config:
        from_attributes = True


# ---------- Notifications ----------
class NotificationOut(BaseModel):
    id: int
    user_id: int
    ride_id: Optional[int]
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Rating ----------
class RatingCreate(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class RatingOut(BaseModel):
    id: int
    score: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Ride Category ----------
class RideCategoryOut(BaseModel):
    id: int
    name: str
    display_name: str
    base_multiplier: float
    min_fare: float
    icon_name: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


# ---------- Admin ----------
class AdminStats(BaseModel):
    total_users: int
    total_rides: int
    total_revenue_inr: float
    rides_by_status: dict
    rides_by_category: dict
# ---------- Driver Application ----------
class DriverApplicationCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    vehicle_category: str = Field(min_length=2, max_length=50)
    vehicle_registration_number: str = Field(min_length=3, max_length=50)
    licence_number: str = Field(min_length=3, max_length=100)
    city: str = Field(min_length=2, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=2000)

class DriverApplicationOut(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: str
    phone: Optional[str]
    vehicle_category: str
    vehicle_registration_number: str
    city: str
    status: str
    review_notes: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
