"""
Backend tests for RideSetGo Phase 11: Live Trip Tracking Dashboard.

These tests lock down the exact backend contract that
frontend/src/pages/LiveTripTrackingPage.tsx depends on:

- GET /rides/{id}/tracking -> the tracking payload the page renders
  (status model, real stored coordinates, real driver details, and explicit
  capability flags for the parts of the screen the backend cannot support)
- Ownership enforcement: another passenger can never read someone else's
  trip, even with a valid session and the correct ride id
- The payload never contains fabricated tracking data: no driver GPS
  position, no invented route geometry, no invented ETA
- The tracking payload follows the real status transitions, including
  cancellation

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
PASSENGER1 = f"phase11_p1_{TS}@example.com"
PASSENGER2 = f"phase11_p2_{TS}@example.com"
DRIVER = f"phase11_driver_{TS}@example.com"
PASSWORD = "testpass123"

PICKUP = "Golden Temple"
DROPOFF = "Amritsar Airport (ATQ)"

# Coordinates used for the booking; the tracking payload must echo exactly
# these stored values.
PICKUP_LAT, PICKUP_LNG = 31.620517, 74.777092
DROPOFF_LAT, DROPOFF_LNG = 31.707778, 74.807778


def _auth_headers(email: str, name: str = "Phase Eleven User", phone: str = None) -> dict:
    client.post("/auth/signup", json={
        "email": email,
        "full_name": name,
        "phone": phone,
        "password": PASSWORD,
    })
    resp = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _book_ride(headers: dict) -> dict:
    resp = client.post("/rides/book", json={
        "pickup_location": PICKUP,
        "dropoff_location": DROPOFF,
        "pickup_lat": PICKUP_LAT,
        "pickup_lng": PICKUP_LNG,
        "dropoff_lat": DROPOFF_LAT,
        "dropoff_lng": DROPOFF_LNG,
        "distance_km": 12.5,
        "category": "Sedan",
        "passenger_count": 2,
        "hour": 12,
    }, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _make_driver(email: str, name: str, phone: str) -> dict:
    """Create a driver-role account.

    The public signup endpoint always creates a 'customer', so the driver
    account is promoted directly in the database - the same way an
    administrator would provision a driver in this demo deployment.
    """
    from app.database import SessionLocal
    from app.models import User

    headers = _auth_headers(email, name=name, phone=phone)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        user.role = "driver"
        db.commit()
    finally:
        db.close()
    return headers


# ---------- Happy path ----------

def test_tracking_returns_real_booking_data_for_the_owner():
    """The owner sees the stored booking, not invented values."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    resp = client.get(f"/rides/{ride['id']}/tracking", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["id"] == ride["id"]
    assert data["status"] == "requested"
    assert data["status_label"]
    assert data["is_terminal"] is False
    assert data["booking_reference"].startswith("RSG-")
    assert data["pickup_location"] == PICKUP
    assert data["dropoff_location"] == DROPOFF

    # Coordinates must be the ones stored with the booking.
    assert data["pickup_lat"] == PICKUP_LAT
    assert data["pickup_lng"] == PICKUP_LNG
    assert data["dropoff_lat"] == DROPOFF_LAT
    assert data["dropoff_lng"] == DROPOFF_LNG

    assert data["distance_km"] == 12.5
    assert data["category"] == "Sedan"
    assert data["passenger_count"] == 2
    assert data["final_fare"] == ride["final_fare"]
    assert data["currency"] == "INR"
    assert data["created_at"]


def test_tracking_stages_match_the_real_status_model():
    """Stages must only describe statuses the backend actually supports."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    data = client.get(f"/rides/{ride['id']}/tracking", headers=headers).json()
    stage_keys = [s["key"] for s in data["stages"]]
    assert stage_keys == ["requested", "accepted", "started", "completed"]
    for stage in data["stages"]:
        assert stage["label"] and stage["description"]


def test_tracking_never_fabricates_gps_data():
    """No driver GPS, no route geometry, no invented ETA."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    data = client.get(f"/rides/{ride['id']}/tracking", headers=headers).json()

    assert data["driver_location"] is None
    assert data["route_geometry"] is None
    assert data["estimated_duration_min"] is None

    caps = data["capabilities"]
    assert caps["live_tracking_available"] is False
    assert caps["driver_location_available"] is False
    assert caps["route_geometry_available"] is False
    assert caps["eta_available"] is False
    assert "not currently available" in caps["message"].lower()


def test_tracking_for_a_ride_with_no_driver_assigned():
    """A requested booking must not be presented as having a driver."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    data = client.get(f"/rides/{ride['id']}/tracking", headers=headers).json()
    assert data["driver"] is None
    assert data["status"] == "requested"


# ---------- Access control ----------

def test_tracking_blocks_another_passengers_ride():
    """Changing the id in the URL must not expose another passenger's trip."""
    owner = _auth_headers(PASSENGER1)
    other = _auth_headers(PASSENGER2)
    ride = _book_ride(owner)

    resp = client.get(f"/rides/{ride['id']}/tracking", headers=other)
    assert resp.status_code == 403, resp.text
    assert "pickup_location" not in resp.text


def test_tracking_requires_authentication():
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    resp = client.get(f"/rides/{ride['id']}/tracking")
    assert resp.status_code == 401, resp.text


def test_tracking_for_unknown_ride_returns_404():
    headers = _auth_headers(PASSENGER1)
    resp = client.get("/rides/999999/tracking", headers=headers)
    assert resp.status_code == 404, resp.text


def test_assigned_driver_can_read_tracking_but_never_driver_email():
    """The assigned driver sees the ride; private fields stay private."""
    passenger = _auth_headers(PASSENGER1)
    driver = _make_driver(DRIVER, "Driver Dev", "+91 98765 43210")
    ride = _book_ride(passenger)

    accept = client.post(f"/rides/{ride['id']}/accept", headers=driver)
    assert accept.status_code == 200, accept.text
    assert accept.json()["status"] == "accepted"

    data = client.get(f"/rides/{ride['id']}/tracking", headers=passenger).json()
    assert data["status"] == "accepted"
    assert data["status_label"]
    assert data["driver"] is not None
    assert data["driver"]["name"] == "Driver Dev"
    assert data["driver"]["phone"] == "+91 98765 43210"
    # The driver's email must never be exposed to a passenger.
    assert "email" not in data["driver"]

    driver_view = client.get(f"/rides/{ride['id']}/tracking", headers=driver)
    assert driver_view.status_code == 200, driver_view.text


# ---------- Status transitions ----------

def test_tracking_reflects_cancellation():
    """After cancelling, the tracking payload shows the terminal state."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    cancel = client.post(
        f"/rides/{ride['id']}/cancel",
        json={"reason": "Change of plans"},
        headers=headers,
    )
    assert cancel.status_code == 200, cancel.text

    data = client.get(f"/rides/{ride['id']}/tracking", headers=headers).json()
    assert data["status"] == "cancelled"
    assert data["is_terminal"] is True
    assert data["cancellation_reason"] == "Change of plans"
    assert data["cancelled_at"]


def test_tracking_reflects_completed_ride():
    """A completed ride is terminal and still reports its real data."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    # A driver advances the ride through the existing status endpoint.
    driver = _make_driver(f"phase11_driver2_{TS}@example.com", "Driver Two", "+91 90000 00000")
    assert client.post(f"/rides/{ride['id']}/accept", headers=driver).status_code == 200
    assert client.patch(
        f"/rides/{ride['id']}/status", json={"status": "started"}, headers=driver
    ).status_code == 200
    assert client.patch(
        f"/rides/{ride['id']}/status", json={"status": "completed"}, headers=driver
    ).status_code == 200

    data = client.get(f"/rides/{ride['id']}/tracking", headers=headers).json()
    assert data["status"] == "completed"
    assert data["is_terminal"] is True
    assert data["driver"]["name"] == "Driver Two"


def test_tracking_endpoint_does_not_break_existing_ride_endpoints():
    """The new route must not disturb the existing ride API."""
    headers = _auth_headers(PASSENGER1)
    ride = _book_ride(headers)

    assert client.get(f"/rides/{ride['id']}", headers=headers).status_code == 200
    assert client.get("/rides/", headers=headers).status_code == 200
    assert client.get(f"/rides/{ride['id']}/payment", headers=headers).status_code == 200
    assert client.get(f"/rides/{ride['id']}/receipt", headers=headers).status_code == 200
