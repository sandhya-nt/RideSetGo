"""
Backend tests for RideSetGo Phase 4: Safety Center & Trusted Contacts.

Tests cover:
- Auth (signup/login) for two users
- Trusted contact CRUD (create, read, update, delete) with relationship field
- Incident report submit + list
- Ownership enforcement (cross-user access blocked)
- Unauthenticated access blocked
- Existing ride booking and trip history still work
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
USER1_EMAIL = f"user1_{TS}@example.com"
USER2_EMAIL = f"user2_{TS}@example.com"
USER_PASSWORD = "testpass123"


def signup_user(email: str, full_name: str = "Test User"):
    """Signup a user (ignores if already exists)."""
    client.post("/auth/signup", json={
        "email": email,
        "full_name": full_name,
        "password": USER_PASSWORD,
    })


def auth_headers(email: str, password: str = USER_PASSWORD) -> dict:
    """Ensure user exists, login and return Bearer token headers."""
    signup_user(email)
    resp = client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_signup_and_login():
    """Test user signup and login for two users."""
    # Signup user 1
    resp = client.post("/auth/signup", json={
        "email": USER1_EMAIL,
        "full_name": "Test User One",
        "password": USER_PASSWORD,
    })
    assert resp.status_code == 201, f"Signup user1 failed: {resp.text}"

    # Signup user 2
    resp = client.post("/auth/signup", json={
        "email": USER2_EMAIL,
        "full_name": "Test User Two",
        "password": USER_PASSWORD,
    })
    assert resp.status_code == 201, f"Signup user2 failed: {resp.text}"

    # Duplicate signup should fail
    resp = client.post("/auth/signup", json={
        "email": USER1_EMAIL,
        "full_name": "Test User One",
        "password": USER_PASSWORD,
    })
    assert resp.status_code == 400

    # Login user 1
    resp = client.post("/auth/login", json={
        "email": USER1_EMAIL,
        "password": USER_PASSWORD,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    # Login user 2
    resp = client.post("/auth/login", json={
        "email": USER2_EMAIL,
        "password": USER_PASSWORD,
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_unauthenticated_safety_blocked():
    """Unauthenticated requests to safety endpoints should return 401."""
    resp = client.get("/safety/contacts")
    assert resp.status_code == 401

    resp = client.post("/safety/contacts", json={"name": "X", "phone": "+919876543210"})
    assert resp.status_code == 401

    resp = client.get("/safety/reports")
    assert resp.status_code == 401

    resp = client.post("/safety/reports", json={"category": "general", "description": "test"})
    assert resp.status_code == 401


def test_contact_crud():
    """Test trusted contact create, read, update, delete for user 1."""
    headers = auth_headers(USER1_EMAIL)

    # Create contact with relationship
    resp = client.post("/safety/contacts", json={
        "name": "Aman Singh",
        "phone": "+919876543210",
        "relationship": "Spouse",
    }, headers=headers)
    assert resp.status_code == 201, f"Create contact failed: {resp.text}"
    data = resp.json()
    assert data["name"] == "Aman Singh"
    assert data["phone"] == "+919876543210"
    assert data["relationship"] == "Spouse"
    assert "id" in data
    assert "created_at" in data
    contact_id = data["id"]

    # Create contact without relationship
    resp = client.post("/safety/contacts", json={
        "name": "Priya Sharma",
        "phone": "+919123456789",
    }, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["relationship"] is None
    contact_id_2 = data["id"]

    # List contacts
    resp = client.get("/safety/contacts", headers=headers)
    assert resp.status_code == 200
    contacts = resp.json()
    assert len(contacts) == 2

    # Update contact (PUT)
    resp = client.put(f"/safety/contacts/{contact_id}", json={
        "name": "Aman Singh Updated",
        "relationship": "Parent",
    }, headers=headers)
    assert resp.status_code == 200, f"Update contact failed: {resp.text}"
    data = resp.json()
    assert data["name"] == "Aman Singh Updated"
    assert data["relationship"] == "Parent"
    assert data["phone"] == "+919876543210"  # unchanged

    # Partial update (phone only)
    resp = client.put(f"/safety/contacts/{contact_id}", json={
        "phone": "+919999999999",
    }, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["phone"] == "+919999999999"
    assert data["name"] == "Aman Singh Updated"

    # Delete contact
    resp = client.delete(f"/safety/contacts/{contact_id_2}", headers=headers)
    assert resp.status_code == 204, f"Delete contact failed: {resp.text}"

    # Verify deletion
    resp = client.get("/safety/contacts", headers=headers)
    assert resp.status_code == 200
    contacts = resp.json()
    assert len(contacts) == 1
    assert contacts[0]["id"] == contact_id


def test_contact_validation():
    """Test validation on contact creation."""
    headers = auth_headers(USER1_EMAIL)

    # Name too short
    resp = client.post("/safety/contacts", json={
        "name": "A",
        "phone": "+919876543210",
    }, headers=headers)
    assert resp.status_code == 422

    # Phone too short
    resp = client.post("/safety/contacts", json={
        "name": "Valid Name",
        "phone": "123",
    }, headers=headers)
    assert resp.status_code == 422

    # Missing name
    resp = client.post("/safety/contacts", json={
        "phone": "+919876543210",
    }, headers=headers)
    assert resp.status_code == 422


def test_contact_ownership_enforcement():
    """User 2 cannot access user 1's contacts."""
    headers1 = auth_headers(USER1_EMAIL)
    headers2 = auth_headers(USER2_EMAIL)

    # User 1 creates a contact
    resp = client.post("/safety/contacts", json={
        "name": "User1 Contact",
        "phone": "+919876543210",
        "relationship": "Friend",
    }, headers=headers1)
    assert resp.status_code == 201
    contact_id = resp.json()["id"]

    # User 2 tries to read user 1's contact via list (should not see it)
    resp = client.get("/safety/contacts", headers=headers2)
    assert resp.status_code == 200
    contacts = resp.json()
    assert not any(c["id"] == contact_id for c in contacts)

    # User 2 tries to update user 1's contact (should 404)
    resp = client.put(f"/safety/contacts/{contact_id}", json={
        "name": "Hacked",
    }, headers=headers2)
    assert resp.status_code == 404

    # User 2 tries to delete user 1's contact (should 404)
    resp = client.delete(f"/safety/contacts/{contact_id}", headers=headers2)
    assert resp.status_code == 404


def test_report_crud():
    """Test incident report submit and list."""
    headers = auth_headers(USER1_EMAIL)

    # Submit report without ride reference
    resp = client.post("/safety/reports", json={
        "category": "safety",
        "description": "Driver was speeding on the highway.",
    }, headers=headers)
    assert resp.status_code == 201, f"Create report failed: {resp.text}"
    data = resp.json()
    assert data["category"] == "safety"
    assert data["description"] == "Driver was speeding on the highway."
    assert data["ride_id"] is None
    assert data["status"] == "submitted"
    assert "id" in data
    assert "created_at" in data
    report_id = data["id"]

    # Submit report with ride reference (if rides exist)
    resp = client.get("/rides/", headers=headers)
    rides = resp.json()
    if rides:
        ride_id = rides[0]["id"]
        resp = client.post("/safety/reports", json={
            "category": "booking",
            "description": "Issue with booking confirmation.",
            "ride_id": ride_id,
        }, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["ride_id"] == ride_id

    # List reports
    resp = client.get("/safety/reports", headers=headers)
    assert resp.status_code == 200
    reports = resp.json()
    assert len(reports) >= 1
    assert any(r["id"] == report_id for r in reports)


def test_report_ownership_enforcement():
    """User 2 cannot access user 1's reports."""
    headers1 = auth_headers(USER1_EMAIL)
    headers2 = auth_headers(USER2_EMAIL)

    # User 1 submits a report
    resp = client.post("/safety/reports", json={
        "category": "general",
        "description": "User1's private report.",
    }, headers=headers1)
    assert resp.status_code == 201
    report_id = resp.json()["id"]

    # User 2 lists reports (should not see user 1's report)
    resp = client.get("/safety/reports", headers=headers2)
    assert resp.status_code == 200
    reports = resp.json()
    assert not any(r["id"] == report_id for r in reports)


def test_ride_booking_and_history():
    """Test that existing ride booking and history still work."""
    headers = auth_headers(USER1_EMAIL)

    # Get fare estimate first
    resp = client.post("/fare/estimate", json={
        "pickup_location": "Golden Temple",
        "dropoff_location": "Amritsar Airport (ATQ)",
        "passenger_count": 1,
        "hour": 12,
    })
    assert resp.status_code == 200
    fare = resp.json()
    assert fare["base_fare_inr"] > 0

    # Book a ride
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
    }, headers=headers)
    assert resp.status_code == 201, f"Book ride failed: {resp.text}"
    ride = resp.json()
    assert ride["id"] > 0
    assert ride["status"] == "requested"
    ride_id = ride["id"]

    # List rides (history)
    resp = client.get("/rides/", headers=headers)
    assert resp.status_code == 200
    rides = resp.json()
    assert len(rides) >= 1
    assert any(r["id"] == ride_id for r in rides)

    # Get single ride
    resp = client.get(f"/rides/{ride_id}", headers=headers)
    assert resp.status_code == 200

    # Update ride status
    resp = client.patch(f"/rides/{ride_id}/status", json={
        "status": "completed",
    }, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"

    # Add rating
    resp = client.post(f"/rides/{ride_id}/rating", json={
        "score": 5,
        "comment": "Great ride!",
    }, headers=headers)
    assert resp.status_code == 201

    # Get payment
    resp = client.get(f"/rides/{ride_id}/payment", headers=headers)
    assert resp.status_code == 200


def test_cross_user_ride_access():
    """User 2 cannot access user 1's rides."""
    headers1 = auth_headers(USER1_EMAIL)
    headers2 = auth_headers(USER2_EMAIL)

    # User 1 books a ride
    resp = client.post("/fare/estimate", json={
        "pickup_location": "Golden Temple",
        "dropoff_location": "Amritsar Airport (ATQ)",
        "passenger_count": 1,
        "hour": 12,
    })
    fare = resp.json()
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
    }, headers=headers1)
    ride_id = resp.json()["id"]

    # User 2 tries to access user 1's ride
    resp = client.get(f"/rides/{ride_id}", headers=headers2)
    assert resp.status_code == 403
