"""
Dependency health probes for RideSetGo (Phase 19).

The readiness probe runs a single, cheap ``SELECT 1`` against the configured
database. Results are cached for ``HEALTH_CHECK_CACHE_SECONDS`` so that a
platform polling the endpoint every few seconds never turns into a stream of
database queries.

The probe never returns the connection string, the driver message or any other
internal detail — only ``ok`` / ``unavailable`` plus the probe duration.
"""
from __future__ import annotations

import threading
import time
from typing import Dict, Optional, Tuple

from sqlalchemy import text

from app.core.config import settings
from app.core.logging_config import get_logger
from app.core.metrics import metrics

logger = get_logger("ridesetgo.health")

_lock = threading.Lock()
_cache: Dict[str, object] = {"checked_at": 0.0, "result": None}


def _probe_database() -> Tuple[bool, float]:
    """Run a minimal database round trip and report whether it succeeded."""
    from app.database import engine

    started = time.perf_counter()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True, (time.perf_counter() - started) * 1000
    except Exception as exc:
        latency_ms = (time.perf_counter() - started) * 1000
        metrics.record_db_failure()
        logger.error(
            "database_probe_failed",
            extra={
                "latency_ms": round(latency_ms, 2),
                "exception_type": type(exc).__name__,
            },
        )
        return False, latency_ms


def check_database(use_cache: bool = True) -> Tuple[bool, float]:
    """
    Return ``(ok, latency_ms)`` for the database dependency.

    The result is cached for ``HEALTH_CHECK_CACHE_SECONDS`` seconds unless
    ``use_cache`` is ``False``.
    """
    now = time.monotonic()
    if use_cache:
        with _lock:
            checked_at = float(_cache["checked_at"] or 0.0)
            cached = _cache["result"]
            ttl = max(0.0, float(settings.HEALTH_CHECK_CACHE_SECONDS))
            if cached is not None and (now - checked_at) < ttl:
                ok, latency_ms = cached  # type: ignore[misc]
                return bool(ok), float(latency_ms)

    ok, latency_ms = _probe_database()
    with _lock:
        _cache["checked_at"] = now
        _cache["result"] = (ok, latency_ms)
    return ok, latency_ms


def reset_health_cache() -> None:
    """Clear the cached probe result (used by the tests)."""
    with _lock:
        _cache["checked_at"] = 0.0
        _cache["result"] = None


def last_health_check() -> Optional[Dict[str, object]]:
    """Return the most recent readiness probe result recorded in metrics."""
    return metrics.snapshot()["health_checks"]["last"]
