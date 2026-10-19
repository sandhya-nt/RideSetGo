"""
Lightweight in-process operational metrics for RideSetGo (Phase 19).

This deliberately avoids a new dependency (Prometheus client, statsd, …) and
instead keeps a small, thread-safe counter registry in the application
process. The data is:

* **real** — every value is measured from live requests handled by this
  process, never estimated or seeded with placeholder numbers;
* **non-personal** — only route templates (e.g. ``/rides/{ride_id}``), status
  classes and timings are recorded. No user id, email, phone number, pickup
  or destination is ever stored;
* **in-memory** — counters reset when the process restarts, which is the
  correct behaviour for a single-instance deployment and is documented as a
  limitation in ``docs/MONITORING.md``.

Metric definitions
------------------
``requests_total``
    Every HTTP request handled by this process (including health checks and
    CORS pre-flight requests).
``error_rate_5xx``
    ``requests_5xx / requests_total * 100`` — the share of requests answered
    with a server error. ``error_rate_4xx`` is defined the same way for
    client errors. A rate of 0 with ``requests_total == 0`` is reported as
    ``0.0`` rather than ``None``.
``latency_ms``
    ``p50``/``p95``/``p99`` are computed over a rolling window of the most
    recent ``LATENCY_WINDOW`` request durations (default 1000), not over all
    time, so the percentiles stay representative of current behaviour.
    ``avg``/``min``/``max`` are lifetime values.
"""
from __future__ import annotations

import threading
import time
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Any, Deque, Dict, List, Optional, Tuple

from app.core.config import settings

#: Number of recent request durations kept for percentile calculation.
LATENCY_WINDOW = 1000

#: Maximum number of distinct routes kept in the per-route breakdown.
MAX_TRACKED_ROUTES = 100


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _percentile(sorted_values: List[float], fraction: float) -> Optional[float]:
    """Nearest-rank percentile over an already sorted list."""
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return round(sorted_values[0], 2)
    index = int(round(fraction * (len(sorted_values) - 1)))
    index = max(0, min(index, len(sorted_values) - 1))
    return round(sorted_values[index], 2)


class MetricsRegistry:
    """Thread-safe registry of operational counters and latency samples."""

    def __init__(
        self, latency_window: int = LATENCY_WINDOW, enabled: bool = True
    ) -> None:
        self._lock = threading.Lock()
        self._enabled = enabled
        self._latency_window = latency_window
        self._started_at = time.time()
        self._latencies: Deque[float] = deque(maxlen=latency_window)
        self._latency_sum = 0.0
        self._latency_min: Optional[float] = None
        self._latency_max: Optional[float] = None
        self._requests_total = 0
        self._status_classes: Counter = Counter()
        self._routes: Counter = Counter()
        self._methods: Counter = Counter()
        self._db_failures = 0
        self._db_last_failure_at: Optional[str] = None
        self._unhandled_exceptions = 0
        self._external_failures: Counter = Counter()
        self._health_total = 0
        self._health_ok = 0
        self._health_failed = 0
        self._health_last: Optional[Dict[str, Any]] = None
        self._client_errors = 0

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------
    @property
    def enabled(self) -> bool:
        """True when metrics collection is switched on."""
        return self._enabled

    def record_request(
        self,
        method: str,
        route: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        """Record a completed HTTP request."""
        if not self._enabled:
            return
        status_class = f"{int(status_code) // 100}xx"
        with self._lock:
            self._requests_total += 1
            self._status_classes[status_class] += 1
            self._methods[str(method).upper()] += 1
            self._routes[f"{route} {status_class}"] += 1
            self._latencies.append(round(float(duration_ms), 3))
            self._latency_sum += float(duration_ms)
            if self._latency_min is None or duration_ms < self._latency_min:
                self._latency_min = float(duration_ms)
            if self._latency_max is None or duration_ms > self._latency_max:
                self._latency_max = float(duration_ms)

    def record_db_failure(self) -> None:
        """Record a database connectivity failure."""
        if not self._enabled:
            return
        with self._lock:
            self._db_failures += 1
            self._db_last_failure_at = _utc_now_iso()

    def record_unhandled_exception(self) -> None:
        """Record an unexpected application exception."""
        if not self._enabled:
            return
        with self._lock:
            self._unhandled_exceptions += 1

    def record_external_failure(self, provider: str) -> None:
        """Record a failure of an external dependency (ML model, gateway …)."""
        if not self._enabled:
            return
        with self._lock:
            self._external_failures[str(provider)] += 1

    def record_health_check(self, ok: bool, detail: Optional[str] = None) -> None:
        """Record the outcome of a readiness probe."""
        if not self._enabled:
            return
        with self._lock:
            self._health_total += 1
            if ok:
                self._health_ok += 1
            else:
                self._health_failed += 1
            self._health_last = {
                "status": "ok" if ok else "failed",
                "checked_at": _utc_now_iso(),
                "detail": detail or ("ready" if ok else "dependency unavailable"),
            }

    def record_client_error_report(self) -> None:
        """Record a client-side (browser) error report."""
        if not self._enabled:
            return
        with self._lock:
            self._client_errors += 1

    # ------------------------------------------------------------------
    # Reporting
    # ------------------------------------------------------------------
    def snapshot(self) -> Dict[str, Any]:
        """Return an immutable snapshot of the current metrics."""
        with self._lock:
            total = self._requests_total
            status_classes = dict(self._status_classes)
            routes = dict(self._routes)
            methods = dict(self._methods)
            latencies = sorted(self._latencies)
            latency_sum = self._latency_sum
            latency_min = self._latency_min
            latency_max = self._latency_max
            started_at = self._started_at
            db_failures = self._db_failures
            db_last_failure_at = self._db_last_failure_at
            unhandled = self._unhandled_exceptions
            external = dict(self._external_failures)
            health_total = self._health_total
            health_ok = self._health_ok
            health_failed = self._health_failed
            health_last = dict(self._health_last) if self._health_last else None
            client_errors = self._client_errors
            window = len(latencies)

        def rate(count: int) -> float:
            return round((count / total) * 100, 2) if total else 0.0

        error_rate_5xx = rate(status_classes.get("5xx", 0))
        error_rate_4xx = rate(status_classes.get("4xx", 0))

        top_routes = [
            {"route": key, "count": value}
            for key, value in sorted(routes.items(), key=lambda kv: -kv[1])[
                :MAX_TRACKED_ROUTES
            ]
        ]

        return {
            "started_at": datetime.fromtimestamp(
                started_at, tz=timezone.utc
            ).isoformat(timespec="seconds"),
            "uptime_seconds": round(time.time() - started_at, 1),
            "requests": {
                "total": total,
                "by_status_class": status_classes,
                "by_method": methods,
                "error_rate_4xx_percent": error_rate_4xx,
                "error_rate_5xx_percent": error_rate_5xx,
            },
            "latency_ms": {
                "count": total,
                "window_size": window,
                "min": round(latency_min, 2) if latency_min is not None else None,
                "max": round(latency_max, 2) if latency_max is not None else None,
                "avg": round(latency_sum / total, 2) if total else None,
                "p50": _percentile(latencies, 0.50),
                "p95": _percentile(latencies, 0.95),
                "p99": _percentile(latencies, 0.99),
            },
            "database": {
                "failures_total": db_failures,
                "last_failure_at": db_last_failure_at,
            },
            "health_checks": {
                "total": health_total,
                "ok": health_ok,
                "failed": health_failed,
                "last": health_last,
            },
            "unhandled_exceptions": unhandled,
            "external_failures": external,
            "client_errors_reported": client_errors,
            "top_routes": top_routes,
        }

    def reset(self) -> None:
        """Reset every counter (used by tests)."""
        with self._lock:
            self._started_at = time.time()
            self._latencies.clear()
            self._latency_sum = 0.0
            self._latency_min = None
            self._latency_max = None
            self._requests_total = 0
            self._status_classes.clear()
            self._routes.clear()
            self._methods.clear()
            self._db_failures = 0
            self._db_last_failure_at = None
            self._unhandled_exceptions = 0
            self._external_failures.clear()
            self._health_total = 0
            self._health_ok = 0
            self._health_failed = 0
            self._health_last = None
            self._client_errors = 0


#: Process-wide registry instance.
metrics = MetricsRegistry(enabled=bool(getattr(settings, "ENABLE_METRICS", True)))
