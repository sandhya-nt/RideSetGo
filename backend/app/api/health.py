"""
Health-check API for RideSetGo (Phase 19).

Three endpoints, each with a clearly defined purpose:

``GET /health``        Liveness + a coarse readiness signal. Backwards
                       compatible with the endpoint that already existed in
                       this project; it is what a platform health check or
                       uptime monitor should point at.
``GET /health/live``   Pure liveness: the process is running and able to
                       answer. It never touches the database, so it stays
                       available even when the database is down.
``GET /health/ready``  Readiness: the process is running *and* the database
                       is reachable. Returns ``503`` when the database is
                       unavailable so a load balancer stops sending traffic.

None of these responses contain credentials, connection strings, database
names, host names, stack traces or query results.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Response, status

from app.core.config import settings
from app.core.health import check_database
from app.core.logging_config import get_logger
from app.core.metrics import metrics

logger = get_logger("ridesetgo.health")

router = APIRouter(prefix="/health", tags=["health"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@router.get("")
def health(response: Response) -> Dict[str, Any]:
    """
    Combined health check (liveness + database readiness).

    Returns HTTP 200 when the database is reachable and HTTP 503 when it is
    not, so a platform health check reflects real service availability.
    """
    db_ok, db_latency_ms = check_database()
    metrics.record_health_check(db_ok)
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "uptime_seconds": metrics.snapshot()["uptime_seconds"],
        "time": _now(),
    }


@router.get("/live")
def liveness() -> Dict[str, Any]:
    """
    Liveness probe.

    Confirms only that the application process is responding. It performs no
    dependency check, so it stays green while the database is unavailable —
    which is exactly what a liveness probe is for (a failing liveness probe
    would trigger a restart of a process that is still healthy).
    """
    return {
        "status": "alive",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "time": _now(),
    }


@router.get("/ready")
def readiness(response: Response) -> Dict[str, Any]:
    """
    Readiness probe.

    Checks the essential dependency (the database) and answers ``503`` when
    it is unavailable, with a generic message that reveals nothing about the
    internal infrastructure.
    """
    db_ok, db_latency_ms = check_database()
    metrics.record_health_check(db_ok)
    checks = {
        "database": {
            "status": "ok" if db_ok else "unavailable",
            "latency_ms": round(db_latency_ms, 2),
        }
    }
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        logger.warning("readiness_check_failed", extra={"checks": "database"})
    return {
        "status": "ready" if db_ok else "not_ready",
        "checks": checks,
        "uptime_seconds": metrics.snapshot()["uptime_seconds"],
        "time": _now(),
    }
