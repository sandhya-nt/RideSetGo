"""
Backend tests for RideSetGo Phase 10: Vehicle Selection & Fare Comparison.

These tests lock down the exact backend contract the new
frontend/src/components/VehicleSelectionPanel.tsx depends on:

- GET  /categories/      -> vehicle categories the panel may display
- POST /fare/estimate    -> fields the panel reads (base fare + per-category
                             estimated fares + currency)
- POST /rides/book       -> booking accepts the selected category
- GET  /rides/{id}/receipt -> data shown on the confirmation page
- Input validation and auth enforcement (no false success)

Uses a temporary database so the dev database is untouched.
"""
import os
import sys
import tempfile
import time

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

TEST_DB = tempfile.mktemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)

TS = str(int(time.time()))
EMAIL = f"phase10_{TS}@example.com"
PASSWORD = "testpass123"

PICKUP = "Golden Temple"
DROPOFF = "Amritsar Airport (ATQ)"


def _auth_headers(email: str = EMAIL) -> dict:
    client.post("/auth/signup", json={
        "email": email,
        "full_name": "Phase Ten User",
        "password": PASSWORD,
    })
    resp = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _estimate(pickup: str = PICKUP, dropoff: str = DROPOFF) -> dict:
    resp = client.post("/fare/estimate", json={
        "pickup_location": pickup,
        "dropoff_location": dropoff,
        "passenger_count": 1,
        "hour": 12,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


# ---------- Categories ----------

def test_categories_endpoint_returns_supported_categories():
    """The panel may only display categories the backend actually returns."""
    resp = client.get("/categories/")
    assert resp.status_code == 200, resp.text
    cats = resp.json()
    assert isinstance(cats, list) and len(cats) > 0
    for cat in cats:
        # Fields the frontend RideCategory type relies on.
        assert isinstance(cat["name"], str) and cat["name"]
        assert isinstance(cat["display_name"], str) and cat["display_name"]
        assert isinstance(cat["multiplier"], (int, float))
        assert isinstance(cat["min_fare"], (int, float))
        assert isinstance(cat["icon"], str)


def test_known_category_names():
    """The documented backend categories are the ones the app supports."""
    names = {c["name"] for c in client.get("/categories/").json()}
    assert names == {"Bike", "Auto", "Mini", "Sedan", "SUV"}


# ---------- Fare estimate ----------

def test_fare_estimate_response_schema():
    """Every field the panel reads is present in the estimate response."""
    est = _estimate()
    for field in (
        "pickup_location",
        "dropoff_location",
        "distance_km",
        "duration_min",
        "base_fare_inr",
        "category_multipliers",
        "currency",
        "note",
    ):
        assert field in est, f"missing {field}"
    assert est["currency"] == "INR"
    assert est["distance_km"] > 0
    assert est["duration_min"] > 0
    assert est["base_fare_inr"] > 0


def test_fare_estimate_covers_every_category():
    """category_multipliers must contain an estimated fare for every category."""
    cats = client.get("/categories/").json()
    est = _estimate()
    for cat in cats:
        assert cat["name"] in est["category_multipliers"]
        assert est["category_multipliers"][cat["name"]] > 0


def test_fare_estimate_rejects_same_pickup_and_dropoff():
    resp = client.post("/fare/estimate", json={
        "pickup_location": PICKUP,
        "dropoff_location": PICKUP,
        "passenger_count": 1,
        "hour": 12,
    })
    assert resp.status_code == 400, resp.text


def test_fare_estimate_rejects_unknown_location():
    resp = client.post("/fare/estimate", json={
        "pickup_location": "Nowhere Land",
        "dropoff_location": DROPOFF,
        "passenger_count": 1,
        "hour": 12,
    })
    assert resp.status_code == 400, resp.text


def test_fare_estimate_validates_passenger_count():
    resp = client.post("/fare/estimate", json={
        "pickup_location": PICKUP,
        "dropoff_location": DROPOFF,
        "passenger_count": 99,
        "hour": 12,
    })
    assert resp.status_code == 422, resp.text


# ---------- Booking ----------

def test_booking_accepts_and_stores_selected_category():
    """The booking schema supports the selected vehicle category."""
    headers = _auth_headers()
    est = _estimate()
    resp = client.post("/rides/book", json={
        "pickup_location": PICKUP,
        "dropoff_location": DROPOFF,
        "pickup_lat": 31.620517,
        "pickup_lng": 74.777092,
        "dropoff_lat": 31.707778,
        "dropoff_lng": 74.807778,
        "distance_km": est["distance_km"],
        "category": "Sedan",
        "passenger_count": 1,
        "hour": 12,
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    ride = resp.json()
    assert ride["category"] == "Sedan"
    assert abs(ride["distance_km"] - est["distance_km"]) < 1e-6
    assert ride["currency"] == "INR"
    assert ride["status"] == "requested"


def test_booking_requires_authentication():
    """A booking must never succeed without a valid session."""
    est = _estimate()
    resp = client.post("/rides/book", json={
        "pickup_location": PICKUP,
        "dropoff_location": DROPOFF,
        "pickup_lat": 31.620517,
        "pickup_lng": 74.777092,
        "dropoff_lat": 31.707778,
        "dropoff_lng": 74.807778,
        "distance_km": est["distance_km"],
        "category": "Sedan",
        "passenger_count": 1,
        "hour": 12,
    })
    assert resp.status_code == 401, resp.text


def test_confirmation_receipt_reports_booked_category():
    """The confirmation page can read back the category that was booked."""
    headers = _auth_headers()
    est = _estimate()
    ride = client.post("/rides/book", json={
        "pickup_location": PICKUP,
        "dropoff_location": DROPOFF,
        "pickup_lat": 31.620517,
        "pickup_lng": 74.777092,
        "dropoff_lat": 31.707778,
        "dropoff_lng": 74.807778,
        "distance_km": est["distance_km"],
        "category": "SUV",
        "passenger_count": 1,
        "hour": 12,
    }, headers=headers).json()

    resp = client.get(f"/rides/{ride['id']}/receipt", headers=headers)
    assert resp.status_code == 200, resp.text
    receipt = resp.json()
    assert receipt["ride_category"] == "SUV"
    assert receipt["currency"] == "INR"
    assert receipt["is_demo"] is True
