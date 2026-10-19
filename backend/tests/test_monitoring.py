"""
Backend tests for RideSetGo Phase 19: Monitoring, Error Logging & Alerts.

Covers:
- Liveness / readiness health endpoints and their HTTP status codes
- Database failure handling that does not leak internal details
- Request correlation ids (generation, propagation and injection safety)
- Log redaction (passwords, tokens, cookies, API keys never reach the log)
- Unexpected exceptions are logged safely and never returned to the client
- In-process metrics (request counts, error rates, latency percentiles)
- Admin-only operational visibility
- Duplicate-submission protection for booking
- Optional client-error reporting (off by default)

Uses a temporary database so the development database is untouched.
"""
import logging
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
from app.core import health as health_module  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.logging_config import (  # noqa: E402
    REDACTED,
    redact_mapping,
    redact_text,
)
from app.core.metrics import MetricsRegistry  # noqa: E402
from app.core.request_context import (  # noqa: E402
    sanitize_request_id,
)
from app.database import SessionLocal  # noqa: E402
from app.models import IdempotencyRecord, User  # noqa: E402

client = TestClient(app)

TS = str(int(time.time()))
EMAIL = f"phase19_{TS}@example.com"
PASSWORD = "testpass123"

PICKUP = "Golden Temple"
DROPOFF = "Amritsar Airport (ATQ)"

BOOKING_BODY = {
    "pickup_location": PICKUP,
    "dropoff_location": DROPOFF,
    "pickup_lat": 31.620517,
    "pickup_lng": 74.777092,
    "dropoff_lat": 31.707778,
    "dropoff_lng": 74.807778,
    "distance_km": 10.0,
    "category": "Sedan",
    "passenger_count": 1,
    "hour": 12,
}


def _promote_to_admin(user_id: int) -> None:
    """Grant the admin role directly in the test database."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        assert user is not None
        user.role = "admin"
        db.commit()
    finally:
        db.close()


def _auth_headers(email: str = EMAIL) -> dict:
    client.post(
        "/auth/signup",
        json={
            "email": email,
            "full_name": "Phase Nineteen User",
            "password": PASSWORD,
        },
    )
    resp = client.post(
        "/auth/login", json={"email": email, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Health checks
# ---------------------------------------------------------------------------

def test_liveness_endpoint_reports_alive():
    """A liveness probe confirms the process answers, without touching the DB."""
    resp = client.get("/health/live")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "alive"
    assert body["app"] == settings.APP_NAME


def test_liveness_stays_up_when_the_database_is_down(monkeypatch):
    """Liveness must not fail just because the database is unavailable."""
    monkeypatch.setattr(
        health_module, "_probe_database", lambda: (False, 1.0)
    )
    health_module.reset_health_cache()
    try:
        resp = client.get("/health/live")
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "alive"
    finally:
        health_module.reset_health_cache()


def test_readiness_reports_ready_when_the_database_works():
    resp = client.get("/health/ready")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"]["status"] == "ok"


def test_readiness_returns_503_when_the_database_is_down(monkeypatch):
    """A required dependency that is down must produce a 503."""
    monkeypatch.setattr(
        health_module, "_probe_database", lambda: (False, 2.5)
    )
    health_module.reset_health_cache()
    try:
        resp = client.get("/health/ready")
        assert resp.status_code == 503, resp.text
        body = resp.json()
        assert body["status"] == "not_ready"
        assert body["checks"]["database"]["status"] == "unavailable"
    finally:
        health_module.reset_health_cache()


def test_health_responses_never_expose_internal_details(monkeypatch):
    """No connection string, driver error or stack trace in a health body."""
    monkeypatch.setattr(
        health_module,
        "_probe_database",
        lambda: (False, 1.0),
    )
    health_module.reset_health_cache()
    try:
        for path in ("/health", "/health/ready", "/health/live"):
            resp = client.get(path)
            text = resp.text.lower()
            for forbidden in (
                "sqlite",
                "select 1",
                "traceback",
                "password",
                "secret",
                "operationalerror",
                "connection",
            ):
                assert forbidden not in text, f"{path} leaked {forbidden!r}"
    finally:
        health_module.reset_health_cache()


def test_health_check_is_cheap_and_cached(monkeypatch):
    """Repeated readiness probes must not hammer the database."""
    calls = {"count": 0}

    def _counting_probe():
        calls["count"] += 1
        return True, 1.0

    monkeypatch.setattr(health_module, "_probe_database", _counting_probe)
    health_module.reset_health_cache()
    try:
        for _ in range(5):
            assert client.get("/health/ready").status_code == 200
        assert calls["count"] == 1, "readiness probe was not cached"
    finally:
        health_module.reset_health_cache()


# ---------------------------------------------------------------------------
# Request correlation ids
# ---------------------------------------------------------------------------

def test_request_id_is_generated_when_absent():
    resp = client.get("/health/live")
    request_id = resp.headers.get("X-Request-ID")
    assert request_id, "every response must carry a request id"
    assert len(request_id) >= 8


def test_safe_client_request_id_is_propagated():
    resp = client.get("/health/live", headers={"X-Request-ID": "trace-abc-123"})
    assert resp.headers.get("X-Request-ID") == "trace-abc-123"


def test_unsafe_client_request_id_is_replaced():
    """A newline in the request id must never reach the log or the header."""
    hostile = "abc\r\nFAKE LOG LINE: injected"
    resp = client.get("/health/live", headers={"X-Request-ID": hostile})
    returned = resp.headers.get("X-Request-ID")
    assert returned != hostile
    assert "\n" not in returned and "\r" not in returned


def test_sanitize_request_id_rejects_unsafe_values():
    assert sanitize_request_id("abc-123_X.y") == "abc-123_X.y"
    assert sanitize_request_id("bad id") is None
    assert sanitize_request_id("bad\nid") is None
    assert sanitize_request_id("") is None
    assert sanitize_request_id(None) is None
    assert sanitize_request_id("x" * 200) is None


def test_request_id_appears_in_error_responses():
    resp = client.get("/auth/me")
    assert resp.status_code == 401, resp.text
    body = resp.json()
    assert body.get("request_id"), "error responses must carry a request id"


# ---------------------------------------------------------------------------
# Log redaction and safe error handling
# ---------------------------------------------------------------------------

def test_redact_text_masks_common_secrets():
    assert "hunter2" not in redact_text("password=hunter2")
    assert "hunter2" not in redact_text('{"password": "hunter2"}')
    assert "abc.def.ghi" not in redact_text("Authorization: Bearer abc.def.ghi")
    assert "sk_live_abcdef" not in redact_text("key=sk_live_abcdef123456")
    assert REDACTED in redact_text("password=hunter2")


def test_redact_mapping_masks_sensitive_keys():
    clean = redact_mapping(
        {
            "email": "user@example.com",
            "password": "hunter2",
            "access_token": "abc",
            "user_password": "x",
        }
    )
    assert clean["email"] == "user@example.com"
    assert clean["password"] == REDACTED
    assert clean["access_token"] == REDACTED
    assert clean["user_password"] == REDACTED


def test_password_is_never_written_to_the_log(caplog):
    """A login attempt must not leave the password in the log."""
    with caplog.at_level(logging.INFO, logger="ridesetgo"):
        client.post(
            "/auth/login",
            json={"email": EMAIL, "password": "sup3rsecretvalue"},
        )
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert "sup3rsecretvalue" not in text


def test_authorization_header_is_never_written_to_the_log(caplog):
    headers = _auth_headers()
    with caplog.at_level(logging.INFO, logger="ridesetgo"):
        client.get("/rides/", headers=headers)
    text = "\n".join(record.getMessage() for record in caplog.records)
    assert headers["Authorization"] not in text
    assert headers["Authorization"].split(" ")[1] not in text


def test_validation_errors_do_not_echo_the_submitted_password(caplog):
    """FastAPI's default 422 body contains the rejected input — we strip it."""
    secret = "sup3rsecretvalue"
    with caplog.at_level(logging.INFO, logger="ridesetgo"):
        resp = client.post(
            "/auth/login", json={"email": "not-an-email", "password": secret}
        )
    assert resp.status_code == 422, resp.text
    assert secret not in resp.text
    body = resp.json()
    assert body["detail"] == "Request validation failed"
    assert body["errors"][0]["field"] == "body.email"
    assert "input" not in body["errors"][0]


def test_unexpected_exception_is_logged_and_never_returned(caplog):
    """A crash must produce a generic 500 plus a server-side traceback."""

    @app.get("/_test/boom")
    def _boom():  # pragma: no cover - exercised through the client
        raise RuntimeError("database password is hunter2 at /secret/path")

    # `raise_server_exceptions=False` lets the test inspect the 500 response
    # instead of the re-raised exception (Starlette always re-raises after
    # the response has been sent).
    crash_client = TestClient(app, raise_server_exceptions=False)
    with caplog.at_level(logging.ERROR, logger="ridesetgo"):
        resp = crash_client.get("/_test/boom")

    assert resp.status_code == 500, resp.text
    body = resp.json()
    assert body["detail"] == "An unexpected error occurred. Please try again."
    assert "Traceback" not in resp.text
    assert "hunter2" not in resp.text
    assert "/secret/path" not in resp.text

    # The developer-facing log keeps the traceback.
    logged = "\n".join(
        record.getMessage() + (record.exc_text or "")
        for record in caplog.records
    )
    assert "RuntimeError" in logged


def test_database_failure_returns_503_without_internal_details():
    """A database outage must not leak the connection string or SQL."""

    @app.get("/_test/db-failure")
    def _db_failure():  # pragma: no cover - exercised through the client
        from sqlalchemy.exc import OperationalError

        raise OperationalError(
            "SELECT * FROM rides",
            {},
            Exception("unable to open database file: /var/data/ridesetgo.db"),
        )

    resp = client.get("/_test/db-failure")
    assert resp.status_code == 503, resp.text
    body = resp.json()
    assert "temporarily unavailable" in body["detail"].lower()
    assert "ridesetgo.db" not in resp.text
    assert "SELECT" not in resp.text
    assert body.get("request_id")


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def test_metrics_registry_counts_requests_and_errors():
    registry = MetricsRegistry()
    registry.record_request("GET", "/rides/", 200, 10.0)
    registry.record_request("GET", "/rides/", 200, 30.0)
    registry.record_request("POST", "/rides/book", 500, 90.0)
    registry.record_request("GET", "/rides/", 404, 5.0)

    snapshot = registry.snapshot()
    assert snapshot["requests"]["total"] == 4
    assert snapshot["requests"]["by_status_class"] == {"2xx": 2, "4xx": 1, "5xx": 1}
    assert snapshot["requests"]["error_rate_5xx_percent"] == 25.0
    assert snapshot["requests"]["error_rate_4xx_percent"] == 25.0
    assert snapshot["latency_ms"]["p50"] is not None
    assert snapshot["latency_ms"]["max"] == 90.0
    assert snapshot["latency_ms"]["avg"] == 33.75


def test_metrics_error_rate_is_zero_without_traffic():
    registry = MetricsRegistry()
    snapshot = registry.snapshot()
    assert snapshot["requests"]["total"] == 0
    assert snapshot["requests"]["error_rate_5xx_percent"] == 0.0


def test_metrics_collection_can_be_switched_off():
    """ENABLE_METRICS=false must stop every counter from being updated."""
    registry = MetricsRegistry(enabled=False)
    registry.record_request("GET", "/rides/", 200, 10.0)
    registry.record_db_failure()
    registry.record_unhandled_exception()
    registry.record_external_failure("ml_model")
    registry.record_health_check(True)
    registry.record_client_error_report()

    snapshot = registry.snapshot()
    assert snapshot["requests"]["total"] == 0
    assert snapshot["database"]["failures_total"] == 0
    assert snapshot["unhandled_exceptions"] == 0
    assert snapshot["external_failures"] == {}
    assert snapshot["health_checks"]["total"] == 0
    assert snapshot["client_errors_reported"] == 0


def test_requests_are_counted_by_the_middleware():
    before = client.get("/health/live")
    assert before.status_code == 200
    from app.core.metrics import metrics

    snapshot = metrics.snapshot()
    assert snapshot["requests"]["total"] >= 1


# ---------------------------------------------------------------------------
# Admin operational visibility
# ---------------------------------------------------------------------------

def test_system_health_requires_admin_role():
    headers = _auth_headers()
    resp = client.get("/admin/system-health", headers=headers)
    assert resp.status_code == 403, resp.text


def test_system_health_returns_real_measurements_for_admin():
    headers = _auth_headers()
    me = client.get("/auth/me", headers=headers).json()
    _promote_to_admin(me["id"])

    client.get("/health/live")
    resp = client.get("/admin/system-health", headers=headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["service"]["app"] == settings.APP_NAME
    assert body["database"]["ready"] is True
    assert body["requests"]["total"] > 0
    assert "p95" in body["latency_ms"]
    assert body["health_checks"]["total"] >= 1
    # No secrets, no stack traces, no log lines.
    text = resp.text.lower()
    for forbidden in ("traceback", "password", "sqlite:///", "secret"):
        assert forbidden not in text, f"system-health leaked {forbidden!r}"


# ---------------------------------------------------------------------------
# Duplicate-submission protection
# ---------------------------------------------------------------------------

def test_booking_retry_with_same_idempotency_key_does_not_duplicate():
    """The retry of a timed-out booking must not create a second ride."""
    headers = _auth_headers()
    key = f"booking-{TS}-1"

    first = client.post(
        "/rides/book", json=BOOKING_BODY, headers={**headers, "Idempotency-Key": key}
    )
    assert first.status_code == 201, first.text
    first_id = first.json()["id"]

    retry = client.post(
        "/rides/book", json=BOOKING_BODY, headers={**headers, "Idempotency-Key": key}
    )
    assert retry.status_code == 201, retry.text
    assert retry.json()["id"] == first_id, "the retry created a duplicate ride"

    rides = client.get("/rides/", headers=headers).json()
    assert len(rides) == 1, f"expected 1 ride, found {len(rides)}"


def test_booking_without_idempotency_key_still_works():
    """Existing API clients (no header) keep the original behaviour."""
    headers = _auth_headers()
    resp = client.post("/rides/book", json=BOOKING_BODY, headers=headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["id"] > 0


def test_idempotency_keys_are_scoped_per_user():
    """One user can never replay another user's booking response."""
    headers_a = _auth_headers()
    first = client.post(
        "/rides/book",
        json=BOOKING_BODY,
        headers={**headers_a, "Idempotency-Key": "shared-key"},
    )
    assert first.status_code == 201, first.text

    headers_b = _auth_headers(f"phase19b_{TS}@example.com")
    second = client.post(
        "/rides/book",
        json=BOOKING_BODY,
        headers={**headers_b, "Idempotency-Key": "shared-key"},
    )
    assert second.status_code == 201, second.text
    assert second.json()["id"] != first.json()["id"]


def test_unsafe_idempotency_key_is_ignored():
    """An unusable key must not break the request."""
    headers = _auth_headers()
    resp = client.post(
        "/rides/book",
        json=BOOKING_BODY,
        headers={**headers, "Idempotency-Key": "bad key with spaces"},
    )
    assert resp.status_code == 201, resp.text


def test_idempotency_record_is_stored_without_sensitive_data():
    headers = _auth_headers()
    key = f"booking-{TS}-stored"
    client.post(
        "/rides/book", json=BOOKING_BODY, headers={**headers, "Idempotency-Key": key}
    )
    db = SessionLocal()
    try:
        record = (
            db.query(IdempotencyRecord)
            .filter(IdempotencyRecord.key == key)
            .first()
        )
        assert record is not None
        assert record.endpoint == "rides.book"
        assert record.status_code == 201
        assert PASSWORD not in (record.response_body or "")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Optional client-error reporting
# ---------------------------------------------------------------------------

def test_client_error_reporting_is_disabled_by_default():
    """The endpoint must not exist unless it is explicitly enabled."""
    resp = client.post(
        "/diagnostics/client-errors",
        json={"component": "VehicleSelectionPanel", "message": "boom"},
    )
    assert resp.status_code == 404, resp.text


def test_client_error_reporting_works_when_enabled(monkeypatch, caplog):
    """With the flag on, a report is accepted, logged and counted."""
    monkeypatch.setattr(
        settings, "ENABLE_CLIENT_ERROR_REPORTING", True, raising=False
    )
    with caplog.at_level(logging.WARNING, logger="ridesetgo"):
        resp = client.post(
            "/diagnostics/client-errors",
            json={
                "component": "VehicleSelectionPanel",
                "message": "boom\nFAKE LOG LINE",
                "stack": "Error: boom\n  at Foo",
                "route": "/home",
            },
        )
    assert resp.status_code == 202, resp.text
    assert resp.json() == {"accepted": True}

    # The client supplied newline must not create a second log line.
    client_error_records = [
        r for r in caplog.records if r.getMessage().startswith("client_error")
    ]
    assert client_error_records, "the client error was not logged"
    # The raw client message is stored under "error_message" (logging
    # reserves "message" for the record itself) and is flattened onto one line.
    reported = str(client_error_records[0].error_message)
    assert "FAKE LOG LINE" in reported
    assert "\n" not in reported
    assert str(client_error_records[0].stack).count("\n") == 0


def test_client_error_report_rejects_oversized_payload():
    resp = client.post(
        "/diagnostics/client-errors",
        json={"component": "x" * 5000, "message": "boom"},
    )
    # The feature is disabled by default, so the route is absent (404).
    # When enabled the payload is rejected by the schema (422).
    assert resp.status_code in (404, 422), resp.text


# ---------------------------------------------------------------------------
# Existing behaviour is preserved
# ---------------------------------------------------------------------------

def test_existing_booking_and_history_flow_still_works():
    headers = _auth_headers()
    ride = client.post("/rides/book", json=BOOKING_BODY, headers=headers)
    assert ride.status_code == 201, ride.text
    ride_id = ride.json()["id"]

    history = client.get("/rides/", headers=headers)
    assert history.status_code == 200
    assert any(r["id"] == ride_id for r in history.json())

    detail = client.get(f"/rides/{ride_id}", headers=headers)
    assert detail.status_code == 200, detail.text

    receipt = client.get(f"/rides/{ride_id}/receipt", headers=headers)
    assert receipt.status_code == 200, receipt.text
    assert receipt.json()["is_demo"] is True

    payment = client.get(f"/rides/{ride_id}/payment", headers=headers)
    assert payment.status_code == 200, payment.text


def test_fare_estimate_still_works():
    resp = client.post(
        "/fare/estimate",
        json={
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "passenger_count": 1,
            "hour": 12,
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["base_fare_inr"] > 0
