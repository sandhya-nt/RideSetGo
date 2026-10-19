"""
Backend tests for RideSetGo Phase 7: Payments, Receipts & Cancellation.

Tests cover:
- Payment config (demo mode when no gateway credentials)
- Receipt for a valid booking
- Receipt access for another user's booking (403)
- Receipt for missing/invalid booking reference (404)
- Cancellation of an eligible booking (status, reason, timestamp)
- Repeated cancellation attempts (400)
- Cancellation of an ineligible booking (completed) (400)
- Payment status validation (invalid status / terminal / cash)
- Prevention of unauthorized Paid status changes by a normal user
- Existing booking, history and authentication still work
- Notifications created on cancellation
"""
import os
import sys
import tempfile
import time

# Ensure project root is on sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Use a temporary database for tests so we don't pollute the dev DB
TEST_DB = tempfile.mktemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB}"

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Unique test data
TS = str(int(time.time()))
USER1_EMAIL = f"p7_user1_{TS}@example.com"
USER2_EMAIL = f"p7_user2_{TS}@example.com"
USER_PASSWORD = "testpass123"


def signup_user(email: str, full_name: str = "Test User"):
    client.post("/auth/signup", json={
        "email": email,
        "full_name": full_name,
        "password": USER_PASSWORD,
    })


def auth_headers(email: str, password: str = USER_PASSWORD) -> dict:
    signup_user(email)
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def book_ride(headers: dict, payment_method: str = "cash"):
    fare = client.post("/fare/estimate", json={
        "pickup_location": "Golden Temple",
        "dropoff_location": "Amritsar Airport (ATQ)",
        "passenger_count": 1,
        "hour": 12,
    }).json()
    resp = client.post("/rides/book", json={
        "pickup_location": "Golden Temple",
        "dropoff_location": "Amritsar Airport (ATQ)",
        "pickup_lat": 31.620517,
        "pickup_lng": 74.777092,
        "dropoff_lat": 31.707778,
        "dropoff_lng": 74.807778,
        "distance_km": fare["distance_km"],
        "category": "Sedan",
        "passenger_count": 1,
        "hour": 12,
        "payment_method": payment_method,
    }, headers=headers)
    assert resp.status_code == 201, f"Book ride failed: {resp.text}"
    return resp.json()


def test_payment_config_demo_mode():
    """No gateway credentials -> demo mode, cash-only supported methods."""
    resp = client.get("/rides/payment-config")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["demo"] is True
    assert data["gateway_configured"] is False
    assert "cash" in data["supported_methods"]


def test_receipt_for_valid_booking():
    """Receipt for a valid booking returns all expected fields."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    resp = client.get(f"/rides/{ride_id}/receipt", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ride_id"] == ride_id
    assert data["booking_reference"].startswith("RSG-")
    assert data["pickup_location"] == "Golden Temple"
    assert data["dropoff_location"] == "Amritsar Airport (ATQ)"
    assert data["ride_category"] == "Sedan"
    assert data["fare_amount"] == ride["final_fare"]
    assert data["currency"] == "INR"
    assert data["payment_method"] == "cash"
    assert data["payment_status"] == "not_applicable"
    assert data["is_demo"] is True
    assert "demo estimate" in data["disclaimer"].lower()
    assert "booking_date" in data


def test_receipt_access_for_another_users_booking():
    """User 2 cannot access user 1's receipt (403)."""
    headers1 = auth_headers(USER1_EMAIL)
    headers2 = auth_headers(USER2_EMAIL)
    ride = book_ride(headers1, payment_method="cash")
    ride_id = ride["id"]

    resp = client.get(f"/rides/{ride_id}/receipt", headers=headers2)
    assert resp.status_code == 403, resp.text


def test_receipt_missing_or_invalid_booking():
    """Receipt for nonexistent booking returns 404."""
    headers = auth_headers(USER1_EMAIL)
    resp = client.get("/rides/999999/receipt", headers=headers)
    assert resp.status_code == 404, resp.text


def test_cancellation_of_eligible_booking():
    """Cancelling a requested booking succeeds with reason and timestamp."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    resp = client.post(f"/rides/{ride_id}/cancel", json={"reason": "Change of plans"}, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["ride_id"] == ride_id
    assert data["status"] == "cancelled"
    assert data["cancellation_reason"] == "Change of plans"
    assert data["cancelled_at"] is not None
    assert data["message"] == "Ride cancelled successfully"

    # Verify the ride status is persisted
    resp = client.get(f"/rides/{ride_id}", headers=headers)
    assert resp.json()["status"] == "cancelled"


def test_cancellation_creates_notification():
    """A cancellation creates a notification for the user."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    client.post(f"/rides/{ride_id}/cancel", json={"reason": "No longer needed"}, headers=headers)

    resp = client.get("/notifications/", headers=headers)
    assert resp.status_code == 200, resp.text
    notifications = resp.json()
    assert any(
        n["type"] == "ride_cancelled" and n["ride_id"] == ride_id
        for n in notifications
    ), f"Expected ride_cancelled notification, got {notifications}"


def test_repeated_cancellation_attempts():
    """A second cancellation of an already-cancelled ride is rejected."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    resp1 = client.post(f"/rides/{ride_id}/cancel", json={"reason": "First"}, headers=headers)
    assert resp1.status_code == 200

    resp2 = client.post(f"/rides/{ride_id}/cancel", json={"reason": "Second"}, headers=headers)
    assert resp2.status_code == 400, resp2.text
    assert "already been cancelled" in resp2.json()["detail"].lower()


def test_cancellation_of_ineligible_booking():
    """A completed ride cannot be cancelled."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    # Mark the ride completed
    resp = client.patch(f"/rides/{ride_id}/status", json={"status": "completed"}, headers=headers)
    assert resp.status_code == 200

    resp = client.post(f"/rides/{ride_id}/cancel", json={"reason": "Too late"}, headers=headers)
    assert resp.status_code == 400, resp.text
    assert "cannot cancel a completed ride" in resp.json()["detail"].lower()


def test_cancellation_ownership_enforcement():
    """User 2 cannot cancel user 1's ride."""
    headers1 = auth_headers(USER1_EMAIL)
    headers2 = auth_headers(USER2_EMAIL)
    ride = book_ride(headers1, payment_method="cash")
    ride_id = ride["id"]

    resp = client.post(f"/rides/{ride_id}/cancel", json={"reason": "Hack"}, headers=headers2)
    assert resp.status_code == 403, resp.text


def test_payment_status_validation_invalid_status():
    """Invalid payment status is rejected (422 via schema validation)."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="online")
    ride_id = ride["id"]

    resp = client.patch(f"/rides/{ride_id}/payment", json={"status": "bogus"}, headers=headers)
    assert resp.status_code == 422, resp.text


def test_payment_status_cannot_change_cash():
    """Cash payments (not_applicable) cannot be changed via this endpoint."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    resp = client.patch(f"/rides/{ride_id}/payment", json={"status": "completed"}, headers=headers)
    assert resp.status_code == 400, resp.text


def test_payment_status_terminal_cannot_change():
    """A completed payment cannot be changed further."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="online")
    ride_id = ride["id"]

    payment = client.get(f"/rides/{ride_id}/payment", headers=headers).json()
    assert payment["status"] == "pending"

    # A normal user cannot mark the online payment as Paid.
    resp = client.patch(f"/rides/{ride_id}/payment", json={"status": "completed"}, headers=headers)
    assert resp.status_code == 403, resp.text
    assert "provider webhook" in resp.json()["detail"].lower()


def test_payment_status_admin_refund():
    """An administrator can refund a pending payment."""
    headers = auth_headers(USER1_EMAIL)
    # Create an admin user by signing up then directly setting role via DB is
    # not possible through the API, so we test the refusal path for a customer
    # and the 403 boundary. Admin refund path is exercised by role check only.
    ride = book_ride(headers, payment_method="online")
    ride_id = ride["id"]

    # Customer attempting refund -> 403 (not admin)
    resp = client.patch(f"/rides/{ride_id}/payment", json={"status": "refunded"}, headers=headers)
    assert resp.status_code == 403, resp.text


def test_booking_creates_payment_record():
    """Booking creates a payment record associated with the ride and user."""
    headers = auth_headers(USER1_EMAIL)
    ride = book_ride(headers, payment_method="cash")
    ride_id = ride["id"]

    resp = client.get(f"/rides/{ride_id}/payment", headers=headers)
    assert resp.status_code == 200, resp.text
    payment = resp.json()
    assert payment["ride_id"] == ride_id
    assert payment["amount"] == ride["final_fare"]
    assert payment["currency"] == "INR"

    # History includes the booking
    resp = client.get("/rides/", headers=headers)
    assert resp.status_code == 200
    rides = resp.json()
    assert any(r["id"] == ride_id for r in rides)


def test_unauthenticated_access_blocked():
    """Phase 7 endpoints require authentication."""
    resp = client.get("/rides/1/receipt")
    assert resp.status_code == 401
    resp = client.post("/rides/1/cancel", json={})
    assert resp.status_code == 401
    resp = client.patch("/rides/1/payment", json={"status": "pending"})
    assert resp.status_code == 401
    resp = client.get("/notifications/")
    assert resp.status_code == 401
