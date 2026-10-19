"""
Request correlation context for RideSetGo.

A single request id is generated (or safely propagated from the client) and
stored in a :class:`contextvars.ContextVar` so that every log record emitted
while handling that request can be tied back to it.

Safety rules implemented here:

* The client supplied id is matched against a strict allowlist
  (``[A-Za-z0-9._-]``, max 64 chars). Anything else — including values that
  contain CR/LF — is discarded and a fresh id is generated. This makes log
  injection through the ``X-Request-ID`` header impossible and keeps the value
  safe to echo back in a response header.
* Ids are never derived from user input such as emails, tokens or query
  parameters, so they cannot leak personal data.
"""
from __future__ import annotations

import re
import uuid
from contextvars import ContextVar, Token
from typing import Optional

#: Default header name used to propagate the request id.
REQUEST_ID_HEADER = "X-Request-ID"

#: Strict allowlist for client supplied request ids.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

_request_id: ContextVar[str] = ContextVar("ridesetgo_request_id", default="")


def new_request_id() -> str:
    """Generate a fresh, random request id."""
    return uuid.uuid4().hex


def sanitize_request_id(value: Optional[str]) -> Optional[str]:
    """
    Return ``value`` if it is a safe request id, otherwise ``None``.

    A safe id matches ``[A-Za-z0-9._-]{1,64}``. This rejects newlines (log
    injection / header injection), whitespace, and any other character that
    could corrupt a log line or a response header.
    """
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    if not candidate or not _REQUEST_ID_RE.match(candidate):
        return None
    return candidate


def resolve_request_id(incoming: Optional[str]) -> str:
    """
    Return a usable request id.

    A safe client supplied id is propagated so a request can be traced across
    services; otherwise a new id is generated.
    """
    return sanitize_request_id(incoming) or new_request_id()


def set_request_id(value: str) -> Token:
    """Bind ``value`` to the current context and return the reset token."""
    return _request_id.set(value)


def reset_request_id(token: Token) -> None:
    """Restore the previous request id binding."""
    try:
        _request_id.reset(token)
    except ValueError:  # pragma: no cover - token from another context
        _request_id.set("")


def get_request_id() -> str:
    """Return the current request id, or an empty string outside a request."""
    return _request_id.get()
