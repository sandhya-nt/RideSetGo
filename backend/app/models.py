"""
SQLAlchemy models for RideSetGo.

Tables: users, rides, payments, ratings, ride_categories.
Role-based access: customer, driver, admin.
"""
from __future__ import annotations

from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    Float,
    DateTime,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship as rel
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="customer")  # customer | driver | admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rides = rel("Ride", foreign_keys="Ride.user_id", back_populates="user")
    ratings = rel("Rating", foreign_keys="Rating.user_id", back_populates="user")


class RideCategory(Base):
    __tablename__ = "ride_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)  # Bike, Auto, Mini, Sedan, SUV
    display_name = Column(String(100), nullable=False)
    base_multiplier = Column(Float, default=1.0)  # multiplier on base fare
    min_fare = Column(Float, default=40.0)
    icon_name = Column(String(50), nullable=True)  # e.g. "bike", "car"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Ride(Base):
    __tablename__ = "rides"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    pickup_location = Column(String(255), nullable=False)
    dropoff_location = Column(String(255), nullable=False)
    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    dropoff_lat = Column(Float, nullable=False)
    dropoff_lng = Column(Float, nullable=False)
    distance_km = Column(Float, nullable=False)
    estimated_duration_min = Column(Integer, nullable=True)

    category = Column(String(50), nullable=False)  # Bike, Auto, Mini, Sedan, SUV
    base_fare = Column(Float, nullable=False)
    final_fare = Column(Float, nullable=False)
    currency = Column(String(3), default="INR")

    status = Column(String(30), default="requested", index=True)  # requested, accepted, started, completed, cancelled
    passenger_count = Column(Integer, default=1)
    hour = Column(Integer, nullable=True)
    cancellation_reason = Column(Text, nullable=True)  # reason provided by customer on cancellation
    cancelled_at = Column(DateTime(timezone=True), nullable=True)  # timestamp when ride was cancelled

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = rel("User", foreign_keys=[user_id], back_populates="rides")
    driver = rel("User", foreign_keys=[driver_id])
    payment = rel("Payment", back_populates="ride", uselist=False)
    rating = rel("Rating", foreign_keys="Rating.ride_id", back_populates="ride", uselist=False)
    notifications = rel("Notification", back_populates="ride", cascade="all, delete-orphan")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    ride_id = Column(Integer, ForeignKey("rides.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(3), default="INR")
    method = Column(String(50), nullable=False)  # mock_wallet, upi, card, cash
    status = Column(String(30), default="pending", index=True)  # pending, completed, failed, refunded
    transaction_id = Column(String(255), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ride = rel("Ride", back_populates="payment")


class TrustedContact(Base):
    __tablename__ = "trusted_contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(30), nullable=False)
    relationship = Column(String(50), nullable=True)  # e.g. "Spouse", "Parent", "Friend"
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = rel("User")


class SafetyReport(Base):
    __tablename__ = "safety_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ride_id = Column(Integer, ForeignKey("rides.id"), nullable=True)
    category = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(30), default="submitted")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = rel("User")
    ride = rel("Ride")


class IdempotencyRecord(Base):
    """
    Stores the outcome of a non-idempotent request (currently booking).

    Purpose (Phase 19): if a booking request times out on the client, the
    client may retry it. Without this table a retry would create a second
    ride (and a second payment record). With it, a retry that carries the
    same ``Idempotency-Key`` returns the original result instead of creating
    a duplicate operation.

    The unique constraint on (user_id, endpoint, key) is what actually
    prevents a duplicate: a second concurrent request cannot claim the same
    key.
    """

    __tablename__ = "idempotency_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    endpoint = Column(String(64), nullable=False)
    key = Column(String(128), nullable=False)
    # NULL while the request is still being processed.
    status_code = Column(Integer, nullable=True)
    # JSON encoded response body, NULL while the request is in progress.
    response_body = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "user_id", "endpoint", "key", name="uq_idempotency_user_endpoint_key"
        ),
    )

    user = rel("User")


class Rating(Base):
    __tablename__ = "ratings"

    id = Column(Integer, primary_key=True, index=True)
    ride_id = Column(Integer, ForeignKey("rides.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    score = Column(Integer, nullable=False)  # 1-5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    ride = rel("Ride", back_populates="rating")
    user = rel("User", back_populates="ratings")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    ride_id = Column(Integer, ForeignKey("rides.id"), nullable=True, index=True)

    type = Column(String(50), nullable=False)  # ride_cancelled, payment_pending, etc.
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = rel("User")
    ride = rel("Ride", back_populates="notifications")
class DriverApplication(Base):
    __tablename__ = "driver_applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, unique=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(30), nullable=True)
    vehicle_category = Column(String(50), nullable=False)
    vehicle_registration_number = Column(String(50), nullable=False)
    licence_number = Column(String(100), nullable=False)
    city = Column(String(100), nullable=False)
    notes = Column(Text, nullable=True)
    status = Column(String(30), default="submitted")
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = rel("User")
