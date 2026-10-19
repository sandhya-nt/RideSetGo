"""
Idempotency support for non-idempotent RideSetGo endpoints (Phase 19).

Booking creates a ride *and* a payment record. If the client loses the
response (timeout, dropped connection, tab closed) and retries, a naive
implementation would create a second ride and a second payment.

The client therefore sends an ``Idempotency-Key`` header with every booking
attempt and reuses the *same* key when the user retries. The server stores the
outcome of the first successful request and replays it for any later request
carrying the same key.

Guarantees
----------
* The key is scoped to ``(user_id, endpoint, key)`` — one user can never
  replay another user's response, and two different endpoints never collide.
* A unique constraint means two concurrent requests with the same key cannot
  both create a ride: the loser is told the request is already in progress.
* If the original request failed, the record is released so the user can
  retry cleanly.
* A request without the header keeps the original behaviour exactly (no
  behaviour change for existing API clients).
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional, Tuple

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.logging_config import get_logger
from app.models import IdempotencyRecord

logger = get_logger("ridesetgo.idempotency")

#: Header carrying the idempotency key.
IDEMPOTENCY_HEADER = "Idempotency-Key"

#: Strict allowlist for the key: no whitespace, no control characters.
_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")

#: Claim outcomes.
CLAIMED = "claimed"
REPLAY = "replay"
IN_PROGRESS = "in_progress"


def sanitize_idempotency_key(value: Optional[str]) -> Optional[str]:
    """Return a safe idempotency key, or ``None`` when the value is unusable."""
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate or not _KEY_RE.match(candidate):
        return None
    return candidate


def claim(
    db: Session, user_id: int, endpoint: str, key: str
) -> Tuple[str, Optional[IdempotencyRecord]]:
    """
    Try to claim ``key`` for this user and endpoint.

    Returns ``(CLAIMED, record)`` when the caller may execute the operation,
    ``(REPLAY, record)`` when a previous successful response can be returned
    verbatim, and ``(IN_PROGRESS, record)`` when a concurrent request with the
    same key is still running.
    """
    existing = (
        db.query(IdempotencyRecord)
        .filter(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.endpoint == endpoint,
            IdempotencyRecord.key == key,
        )
        .first()
    )
    if existing is not None:
        if existing.response_body is not None and existing.status_code is not None:
            return REPLAY, existing
        return IN_PROGRESS, existing

    record = IdempotencyRecord(
        user_id=user_id, endpoint=endpoint, key=key, status_code=None, response_body=None
    )
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request claimed the same key first.
        db.rollback()
        existing = (
            db.query(IdempotencyRecord)
            .filter(
                IdempotencyRecord.user_id == user_id,
                IdempotencyRecord.endpoint == endpoint,
                IdempotencyRecord.key == key,
            )
            .first()
        )
        if existing is None:  # pragma: no cover - defensive
            return CLAIMED, None
        if existing.response_body is not None and existing.status_code is not None:
            return REPLAY, existing
        return IN_PROGRESS, existing
    return CLAIMED, record


def store_response(
    db: Session, record: Optional[IdempotencyRecord], status_code: int, body: Any
) -> None:
    """Persist the response of a successful request so it can be replayed."""
    if record is None:
        return
    record.status_code = int(status_code)
    record.response_body = json.dumps(body, default=str)
    db.commit()


def release(db: Session, record: Optional[IdempotencyRecord]) -> None:
    """Release a claimed key so the user can retry after a failure."""
    if record is None:
        return
    try:
        db.delete(record)
        db.commit()
    except Exception:  # pragma: no cover - defensive
        db.rollback()
        logger.warning("idempotency_release_failed", extra={"endpoint": record.endpoint})


def load_response(record: IdempotencyRecord) -> Tuple[int, Any]:
    """Return the stored ``(status_code, body)`` of a completed request."""
    body: Any = None
    if record.response_body:
        try:
            body = json.loads(record.response_body)
        except json.JSONDecodeError:  # pragma: no cover - defensive
            body = None
    return int(record.status_code or 200), body
