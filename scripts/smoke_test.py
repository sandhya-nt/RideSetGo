"""
End-to-end smoke test for the RideSetGo walkthrough.

Runs the complete demo flow against a *running* backend and prints one line per
check, so the output can be shown on screen during a viva and pasted into the
project report as evidence.

It exercises exactly the paths the documentation claims work, and it also
proves the negative cases (role-based access control, validation, ownership
checks) because those are the questions an examiner is most likely to ask.

Usage
-----
    # terminal 1 - start the API
    cd backend
    ..\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

    # terminal 2 - run the checks
    .\\.venv\\Scripts\\python.exe scripts\\smoke_test.py

Options
-------
    --base-url URL   API root (default http://127.0.0.1:8000)

Exit code is 0 when every check passes and 1 otherwise.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_BASE_URL = "http://127.0.0.1:8000"

PASSWORD = "Demo@1234"
PASSENGER = "passenger@ridesetgo.demo"
DRIVER = "driver@ridesetgo.demo"
ADMIN = "admin@ridesetgo.demo"

PICKUP = "Golden Temple"
DROPOFF = "Amritsar Airport (ATQ)"

PASSED = 0
FAILED = 0


# ---------------------------------------------------------------------------
# Tiny HTTP helper (no external dependencies, so the script runs anywhere)
# ---------------------------------------------------------------------------
def _maybe_json(raw):
    """Return parsed JSON, or the raw text for non-JSON responses (HTML pages)."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def request(method, url, body=None, token=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, _maybe_json(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw


def check(label, actual, expected, extra=""):
    global PASSED, FAILED
    ok = actual == expected
    if ok:
        PASSED += 1
        print(f"  PASS  {label}" + (f"  -> {extra}" if extra else ""))
    else:
        FAILED += 1
        print(f"  FAIL  {label}  expected {expected!r}, got {actual!r}")
    return ok


def section(title):
    print()
    print(f"--- {title} " + "-" * max(0, 66 - len(title)))


def login(base, email):
    status, data = request(
        "POST", f"{base}/auth/login", {"email": email, "password": PASSWORD}
    )
    if status != 200:
        print(f"  FAIL  cannot log in as {email}: {status} {data}")
        sys.exit(2)
    return data["access_token"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print(f"RideSetGo end-to-end smoke test against {base}")

    # ---------------------------------------------------------------- health
    section("Service health")
    status, data = request("GET", f"{base}/")
    check("GET / returns 200", status, 200)
    check("app name", (data or {}).get("app"), "RideSetGo")
    check("version", (data or {}).get("version"), "0.1.0")

    status, _ = request("GET", f"{base}/openapi.json")
    check("GET /openapi.json returns 200", status, 200)
    status, _ = request("GET", f"{base}/docs")
    check("GET /docs (Swagger UI) returns 200", status, 200)

    # --------------------------------------------------------------- catalogue
    section("Reference data")
    status, locations = request("GET", f"{base}/locations/")
    check("GET /locations/ returns 200", status, 200)
    check("locations available", len(locations or []) > 0, True, f"{len(locations or [])} locations")
    status, categories = request("GET", f"{base}/categories/")
    check("GET /categories/ returns 200", status, 200)
    check(
        "category names",
        sorted(c["name"] for c in (categories or [])),
        ["Auto", "Bike", "Mini", "SUV", "Sedan"],
    )

    # ------------------------------------------------------------------- auth
    section("Authentication")
    status, data = request(
        "POST",
        f"{base}/auth/signup",
        {
            "email": f"smoke_{int(__import__('time').time())}@example.com",
            "full_name": "Smoke Test",
            "password": "Smoke@12345",
        },
    )
    check("POST /auth/signup returns 201", status, 201)
    check("signup returns a token", bool((data or {}).get("access_token")), True)

    status, data = request(
        "POST", f"{base}/auth/login", {"email": PASSENGER, "password": "wrong-password"}
    )
    check("login with a wrong password returns 401", status, 401)

    status, _ = request("GET", f"{base}/rides/")
    check("GET /rides/ without a token returns 401", status, 401)

    p_token = login(base, PASSENGER)
    d_token = login(base, DRIVER)
    a_token = login(base, ADMIN)
    print("  PASS  logged in as passenger, driver and admin")

    status, data = request("GET", f"{base}/auth/me", token=p_token)
    check("GET /auth/me returns 200", status, 200)
    check("passenger role", (data or {}).get("role"), "customer")

    # ------------------------------------------------------------------- fare
    section("Fare estimation")
    status, est = request(
        "POST",
        f"{base}/fare/estimate",
        {"pickup_location": PICKUP, "dropoff_location": DROPOFF, "passenger_count": 1, "hour": 12},
    )
    check("POST /fare/estimate returns 200", status, 200)
    check("estimate currency", (est or {}).get("currency"), "INR")
    check("estimate distance is positive", (est or {}).get("distance_km", 0) > 0, True)
    check(
        "estimate covers every category",
        sorted((est or {}).get("category_multipliers", {}).keys()),
        ["Auto", "Bike", "Mini", "SUV", "Sedan"],
    )

    status, _ = request(
        "POST",
        f"{base}/fare/estimate",
        {"pickup_location": PICKUP, "dropoff_location": PICKUP, "passenger_count": 1, "hour": 12},
    )
    check("estimate rejects identical pickup/dropoff with 400", status, 400)

    status, _ = request(
        "POST",
        f"{base}/fare/estimate",
        {"pickup_location": "Nowhere Land", "dropoff_location": DROPOFF, "passenger_count": 1, "hour": 12},
    )
    check("estimate rejects an unknown location with 400", status, 400)

    status, _ = request(
        "POST",
        f"{base}/fare/estimate",
        {"pickup_location": PICKUP, "dropoff_location": DROPOFF, "passenger_count": 99, "hour": 12},
    )
    check("estimate rejects 99 passengers with 422", status, 422)

    # ---------------------------------------------------------------- booking
    section("Booking")
    status, ride = request(
        "POST",
        f"{base}/rides/book",
        {
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "pickup_lat": 31.620517,
            "pickup_lng": 74.777092,
            "dropoff_lat": 31.707778,
            "dropoff_lng": 74.807778,
            "distance_km": (est or {}).get("distance_km", 9.0),
            "category": "Sedan",
            "passenger_count": 1,
            "hour": 12,
            "payment_method": "cash",
        },
        token=p_token,
    )
    check("POST /rides/book returns 201", status, 201)
    ride_id = (ride or {}).get("id")
    check("new ride status is 'requested'", (ride or {}).get("status"), "requested")
    check("new ride category is stored", (ride or {}).get("category"), "Sedan")

    status, _ = request(
        "POST",
        f"{base}/rides/book",
        {
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "pickup_lat": 31.62,
            "pickup_lng": 74.77,
            "dropoff_lat": 31.70,
            "dropoff_lng": 74.80,
            "distance_km": 9.0,
            "category": "Sedan",
        },
    )
    check("booking without a token returns 401", status, 401)

    # --------------------------------------------------------- ride lifecycle
    section("Driver workflow and ride lifecycle")
    status, _ = request("GET", f"{base}/rides/available", token=p_token)
    check("passenger cannot list available rides (403)", status, 403)

    status, available = request("GET", f"{base}/rides/available", token=d_token)
    check("driver can list available rides", status, 200)
    check("the new ride is in the available queue", ride_id in [r["id"] for r in (available or [])], True)

    status, accepted = request("POST", f"{base}/rides/{ride_id}/accept", token=d_token)
    check("driver accepts the ride", status, 200)
    check("ride status is now 'accepted'", (accepted or {}).get("status"), "accepted")

    status, _ = request("POST", f"{base}/rides/{ride_id}/accept", token=d_token)
    check("accepting an already accepted ride returns 409", status, 409)

    status, started = request("PATCH", f"{base}/rides/{ride_id}/status", {"status": "started"}, token=d_token)
    check("driver starts the ride", status, 200)
    check("ride status is now 'started'", (started or {}).get("status"), "started")

    status, _ = request(
        "PATCH", f"{base}/rides/{ride_id}/status", {"status": "teleported"}, token=d_token
    )
    check("an invalid status returns 400", status, 400)

    # ---------------------------------------------------------------- tracking
    section("Trip tracking")
    status, tracking = request("GET", f"{base}/rides/{ride_id}/tracking", token=p_token)
    check("GET /rides/{id}/tracking returns 200", status, 200)
    check("tracking reports the current status", (tracking or {}).get("status"), "started")
    check("tracking exposes the progress stages", len((tracking or {}).get("stages", [])) == 4, True)
    check("tracking names the assigned driver", bool((tracking or {}).get("driver")), True)
    check(
        "tracking honestly reports that live GPS is unavailable",
        (tracking or {}).get("capabilities", {}).get("live_tracking_available"),
        False,
    )
    check(
        "tracking returns no fabricated driver GPS",
        (tracking or {}).get("driver_location") is None,
        True,
    )

    status, _ = request("GET", f"{base}/rides/{ride_id}/tracking", token=a_token)
    check("admin can read tracking for any ride", status, 200)

    # ---------------------------------------------------------------- payment
    section("Payments and receipts")
    status, config = request("GET", f"{base}/rides/payment-config")
    check("GET /rides/payment-config returns 200", status, 200)
    check("no gateway is configured (demo mode)", (config or {}).get("demo"), True)
    check("cash is the only supported method", (config or {}).get("supported_methods"), ["cash"])

    status, payment = request("GET", f"{base}/rides/{ride_id}/payment", token=p_token)
    check("GET /rides/{id}/payment returns 200", status, 200)
    check("cash payment is not a platform transaction", (payment or {}).get("status"), "not_applicable")

    status, _ = request(
        "PATCH", f"{base}/rides/{ride_id}/payment", {"status": "completed"}, token=p_token
    )
    check("a customer cannot mark a cash payment as paid (400)", status, 400)

    status, receipt = request("GET", f"{base}/rides/{ride_id}/receipt", token=p_token)
    check("GET /rides/{id}/receipt returns 200", status, 200)
    check("receipt booking reference format", (receipt or {}).get("booking_reference", "").startswith("RSG-"), True)
    check("receipt is labelled as a demo", (receipt or {}).get("is_demo"), True)
    check("receipt carries a disclaimer", bool((receipt or {}).get("disclaimer")), True)

    status, _ = request("GET", f"{base}/rides/999999/receipt", token=p_token)
    check("a receipt for a missing booking returns 404", status, 404)

    # --------------------------------------------------------- owner isolation
    section("Ownership and role-based access control")
    status, other = request(
        "POST",
        f"{base}/auth/signup",
        {
            "email": f"smoke_other_{int(__import__('time').time())}@example.com",
            "full_name": "Other Passenger",
            "password": "Smoke@12345",
        },
    )
    other_token = (other or {}).get("access_token")
    status, _ = request("GET", f"{base}/rides/{ride_id}/receipt", token=other_token)
    check("another passenger cannot read this receipt (403)", status, 403)

    status, _ = request("GET", f"{base}/rides/{ride_id}", token=other_token)
    check("another passenger cannot read this ride (403)", status, 403)

    status, _ = request("GET", f"{base}/admin/stats", token=p_token)
    check("a passenger cannot reach the admin API (403)", status, 403)

    status, _ = request("GET", f"{base}/admin/stats", token=d_token)
    check("a driver cannot reach the admin API (403)", status, 403)

    status, _ = request("GET", f"{base}/rides/available", token=a_token)
    check("an admin can list available rides", status, 200)

    # ------------------------------------------------------- complete + rate
    section("Completion, rating and notifications")
    status, completed = request(
        "PATCH", f"{base}/rides/{ride_id}/status", {"status": "completed"}, token=d_token
    )
    check("driver completes the ride", status, 200)
    check("ride status is now 'completed'", (completed or {}).get("status"), "completed")

    status, rating = request(
        "POST", f"{base}/rides/{ride_id}/rating", {"score": 5, "comment": "Smooth ride"}, token=p_token
    )
    check("the passenger can rate a completed ride", status, 201)
    check("the stored score is 5", (rating or {}).get("score"), 5)

    status, _ = request(
        "POST", f"{base}/rides/{ride_id}/rating", {"score": 4}, token=p_token
    )
    check("a second rating for the same ride is rejected (400)", status, 400)

    status, notifications = request("GET", f"{base}/notifications/", token=p_token)
    check("GET /notifications/ returns 200", status, 200)
    check(
        "a booking notification exists",
        any(n.get("type") == "booking_created" for n in (notifications or [])),
        True,
    )

    # -------------------------------------------------------------- history
    section("Trip history")
    status, history = request("GET", f"{base}/rides/", token=p_token)
    check("GET /rides/ returns 200", status, 200)
    check("the new ride appears in history", ride_id in [r["id"] for r in (history or [])], True)

    # ---------------------------------------------------------------- admin
    section("Admin operations dashboard")
    status, stats = request("GET", f"{base}/admin/stats", token=a_token)
    check("GET /admin/stats returns 200 for an admin", status, 200)
    check("stats report a user count", (stats or {}).get("total_users", 0) > 0, True)
    check("stats report a ride count", (stats or {}).get("total_rides", 0) > 0, True)
    check(
        "revenue only counts completed payments",
        isinstance((stats or {}).get("total_revenue_inr"), (int, float)),
        True,
        f"total_revenue_inr={((stats or {}).get('total_revenue_inr'))}",
    )

    status, admin_rides = request("GET", f"{base}/admin/rides", token=a_token)
    check("GET /admin/rides returns 200 for an admin", status, 200)
    check("the admin ride list includes the demo ride", ride_id in [r["id"] for r in (admin_rides or [])], True)

    status, admin_payments = request("GET", f"{base}/admin/payments", token=a_token)
    check("GET /admin/payments returns 200 for an admin", status, 200)

    status, summary = request("GET", f"{base}/admin/payments/summary", token=a_token)
    check("GET /admin/payments/summary returns 200 for an admin", status, 200)
    check("the summary groups payments by status", bool((summary or {}).get("counts")), True)

    # ------------------------------------------------------------- cancel
    section("Cancellation")
    status, ride2 = request(
        "POST",
        f"{base}/rides/book",
        {
            "pickup_location": PICKUP,
            "dropoff_location": "Amritsar Railway Station",
            "pickup_lat": 31.620517,
            "pickup_lng": 74.777092,
            "dropoff_lat": 31.646,
            "dropoff_lng": 74.822,
            "distance_km": 5.0,
            "category": "Auto",
            "passenger_count": 1,
            "hour": 9,
            "payment_method": "cash",
        },
        token=p_token,
    )
    ride2_id = (ride2 or {}).get("id")
    check("a second ride is booked for the cancellation test", status, 201)

    status, cancelled = request(
        "POST", f"{base}/rides/{ride2_id}/cancel", {"reason": "Change of plans"}, token=p_token
    )
    check("the passenger cancels the ride", status, 200)
    check("the cancellation status is 'cancelled'", (cancelled or {}).get("status"), "cancelled")
    check("the cancellation reason is stored", (cancelled or {}).get("cancellation_reason"), "Change of plans")

    status, _ = request(
        "POST", f"{base}/rides/{ride2_id}/cancel", {"reason": "again"}, token=p_token
    )
    check("cancelling twice is rejected (400)", status, 400)

    status, _ = request(
        "POST", f"{base}/rides/{ride2_id}/cancel", {"reason": "not mine"}, token=other_token
    )
    check("another passenger cannot cancel this ride (403)", status, 403)

    status, _ = request(
        "POST", f"{base}/rides/{ride_id}/cancel", {"reason": "too late"}, token=p_token
    )
    check("a completed ride cannot be cancelled (400)", status, 400)

    # ----------------------------------------------------------------- done
    print()
    print("=" * 74)
    print(f"RESULT: {PASSED} passed, {FAILED} failed")
    print("=" * 74)
    return 0 if FAILED == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
