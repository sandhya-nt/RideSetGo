"""
Optional client-side (browser) error reporting (Phase 19).

The React error boundary reports render errors and unhandled promise
rejections here so that frontend failures show up in the same operational log
as backend failures.

Safeguards
----------
* **Disabled by default.** The endpoint only accepts reports when
  ``ENABLE_CLIENT_ERROR_REPORTING=true``. When it is off the route answers
  ``404`` — the feature simply does not exist.
* **No sensitive data is ever collected.** The schema only accepts a
  component name, a short error message, a truncated stack, the route path
  and a request id. There is no field for a request body, a response body, a
  cookie, a token or a user identity, so none can be sent.
* **Log-injection safe.** Every client supplied string is stripped of
  newlines and control characters before it is written to the log, so a
  crafted message cannot forge extra log lines.
* **Rate limited.** A single process accepts at most a small number of
  reports per minute per client address, which keeps a broken frontend from
  flooding the log.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.logging_config import get_logger
from app.core.metrics import metrics

logger = get_logger("ridesetgo.client_errors")

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])

#: Maximum number of reports accepted per client address per window.
RATE_LIMIT_REPORTS = 30
#: Rate limit window in seconds.
RATE_LIMIT_WINDOW_SECONDS = 60

_rate_lock = threading.Lock()
_rate_buckets: Dict[str, Deque[float]] = defaultdict(deque)


class ClientErrorReport(BaseModel):
    """Payload accepted from the browser error boundary.

    Deliberately minimal: there is no field for request data, credentials or
    user identity.
    """

    component: str = Field(default="unknown", max_length=120)
    message: str = Field(default="", max_length=500)
    stack: Optional[str] = Field(default=None, max_length=4000)
    route: Optional[str] = Field(default=None, max_length=200)
    request_id: Optional[str] = Field(default=None, max_length=64)
    app_version: Optional[str] = Field(default=None, max_length=40)
    kind: Optional[str] = Field(default=None, max_length=40)


def _sanitize(value: Optional[str], limit: int) -> Optional[str]:
    """Flatten a client supplied string so it cannot break the log format."""
    if value is None:
        return None
    cleaned = "".join(
        ch if ch.isprintable() else " " for ch in value
    )
    cleaned = " ".join(cleaned.split())
    return cleaned[:limit]


def _client_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _rate_limited(address: str) -> bool:
    now = time.monotonic()
    with _rate_lock:
        bucket = _rate_buckets[address]
        while bucket and (now - bucket[0]) > RATE_LIMIT_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT_REPORTS:
            return True
        bucket.append(now)
        return False


@router.post("/client-errors", status_code=status.HTTP_202_ACCEPTED)
def report_client_error(report: ClientErrorReport, request: Request) -> Dict[str, bool]:
    """Accept a client-side error report (only when explicitly enabled)."""
    if not settings.ENABLE_CLIENT_ERROR_REPORTING:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    address = _client_address(request)
    if _rate_limited(address):
        logger.warning(
            "client_error_rate_limited",
            extra={"client": _sanitize(address, 64)},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many error reports. Please try again later.",
        )

    metrics.record_client_error_report()
    logger.warning(
        "client_error",
        extra={
            "component": _sanitize(report.component, 120),
            # NB: "message" is reserved by logging.LogRecord, so the client's
            # message is stored under "error_message".
            "error_message": _sanitize(report.message, 500),
            "stack": _sanitize(report.stack, 4000),
            "route": _sanitize(report.route, 200),
            "client_request_id": _sanitize(report.request_id, 64),
            "app_version": _sanitize(report.app_version, 40),
            "kind": _sanitize(report.kind, 40),
        },
    )
    return {"accepted": True}
