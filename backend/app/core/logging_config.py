"""
Structured logging configuration for RideSetGo (Phase 19).

Goals
-----
* One consistent log format for the whole backend.
* ``json`` mode emits exactly one JSON object per line, which any log
  aggregator (or plain ``grep``/``jq``) can consume without extra tooling.
* Secrets are redacted automatically, including secrets that end up inside a
  log message or inside ``extra=`` fields.
* Every record carries the current request id so a single user-visible error
  can be traced through the whole request.

Only the Python standard library is used — no new dependency is required.

Redaction
---------
Two layers are applied:

1. *Key based* — any structured field whose name looks like a secret
   (``password``, ``token``, ``authorization``, ``cookie``, ``api_key`` …)
   is replaced with ``***REDACTED***`` before the record is formatted.
2. *Pattern based* — the formatted message and its arguments are scanned for
   ``Bearer <token>`` style values, ``password=…`` style query strings and
   Stripe-style ``sk_live_…`` keys, and those are masked as well.

The layer based redaction intentionally does **not** remove request or response
bodies: bodies are never logged by this project.
"""
from __future__ import annotations

import json
import logging
import logging.handlers
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Iterable

from app.core.config import settings
from app.core.request_context import get_request_id

REDACTED = "***REDACTED***"

#: Structured field names whose *values* are always replaced.
SENSITIVE_KEYS = frozenset(
    {
        "password",
        "passwd",
        "pwd",
        "new_password",
        "old_password",
        "password_hash",
        "hashed_password",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "jwt",
        "bearer",
        "authorization",
        "auth",
        "cookie",
        "cookies",
        "set-cookie",
        "api_key",
        "apikey",
        "x-api-key",
        "secret",
        "client_secret",
        "secret_key",
        "private_key",
        "signing_key",
        "webhook_secret",
        "stripe_secret_key",
        "stripe_webhook_secret",
        "publishable_key",
        "card_number",
        "cardnumber",
        "cvv",
        "cvc",
        "card_cvc",
        "account_number",
        "ifsc",
        "upi_id",
        "database_url",
        "dsn",
        "connection_string",
        "sqlalchemy.url",
    }
)

_KEY_VALUE_RE = re.compile(
    r"(?i)\b(?P<key>password|passwd|pwd|token|access_token|refresh_token|"
    r"api[_-]?key|apikey|secret|client_secret|secret_key|authorization|auth|"
    r"cookie|session[_-]?id|cvv|cvc|pin)\b[\"']?(?P<sep>\s*[:=]\s*)"
    r"(?P<quote>[\"']?)(?P<value>(?!Bearer\b|Basic\b)[^\s,;&\"'}]+)(?P=quote)"
)
_BEARER_RE = re.compile(r"(?i)\b(bearer|basic)\s+([A-Za-z0-9._~+/=-]{8,})")
_SK_RE = re.compile(r"\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{6,}")
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*")

#: Attributes present on every standard :class:`logging.LogRecord`. Anything
#: else found on a record was supplied through ``extra=`` and is therefore
#: treated as structured data.
_STANDARD_RECORD_ATTRS = frozenset(
    logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()
) | {"message", "asctime", "taskName"}


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower().replace("-", "_")
    if lowered in SENSITIVE_KEYS:
        return True
    # Catch compound names such as "user_password" or "stripeSecretKey".
    return any(
        lowered.endswith(suffix) or lowered.startswith(suffix + "_")
        for suffix in ("password", "secret", "token", "api_key", "apikey")
    )


def redact_text(value: str) -> str:
    """Mask secret-looking substrings inside a free-form string."""
    if not value:
        return value
    # The bearer pattern runs first so that "Authorization: Bearer <token>"
    # masks the token itself rather than the literal word "Bearer".
    value = _BEARER_RE.sub(lambda m: f"{m.group(1)} {REDACTED}", value)
    value = _KEY_VALUE_RE.sub(
        lambda m: (
            f"{m.group('key')}{m.group('sep')}"
            f"{m.group('quote')}{REDACTED}{m.group('quote')}"
        ),
        value,
    )
    value = _SK_RE.sub(REDACTED, value)
    value = _JWT_RE.sub(REDACTED, value)
    return value


def redact_mapping(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of ``data`` with secret-looking values masked."""
    clean: Dict[str, Any] = {}
    for key, value in data.items():
        if _is_sensitive_key(str(key)):
            clean[key] = REDACTED
        elif isinstance(value, dict):
            clean[key] = redact_mapping(value)
        elif isinstance(value, str):
            clean[key] = redact_text(value)
        else:
            clean[key] = value
    return clean


class RedactingFilter(logging.Filter):
    """
    Logging filter that removes secrets from a record before it is formatted.

    It rewrites ``record.msg``/``record.args`` and every ``extra`` attribute
    whose name looks sensitive.
    """

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        if isinstance(record.msg, str):
            record.msg = redact_text(record.msg)

        if isinstance(record.args, dict):
            record.args = redact_mapping(record.args)
        elif isinstance(record.args, tuple):
            record.args = tuple(
                redact_text(a) if isinstance(a, str) else a for a in record.args
            )

        for key in list(record.__dict__.keys()):
            if key in _STANDARD_RECORD_ATTRS or key.startswith("_"):
                continue
            if _is_sensitive_key(key):
                record.__dict__[key] = REDACTED
            elif isinstance(record.__dict__[key], str):
                record.__dict__[key] = redact_text(record.__dict__[key])
        return True


class RequestIdFilter(logging.Filter):
    """Adds the current request id to every record."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        if not hasattr(record, "request_id"):
            request_id = get_request_id()
            if request_id:
                record.request_id = request_id
        return True


class JsonFormatter(logging.Formatter):
    """Formats a record as a single JSON object (one line per record)."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        payload: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", "") or get_request_id()
        if request_id:
            payload["request_id"] = request_id

        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _STANDARD_RECORD_ATTRS
            and not key.startswith("_")
            and key != "request_id"
        }
        if extras:
            payload.update(redact_mapping(extras))

        if record.exc_info:
            # The traceback is written to the log for developers, never to the
            # HTTP response body. Secret-looking values inside it are masked
            # as well.
            payload["exception"] = redact_text(self.formatException(record.exc_info))

        return json.dumps(payload, default=str, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    """Human readable single-line format used for local development."""

    default_time_format = "%Y-%m-%dT%H:%M:%S%z"

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        base = super().format(record)
        request_id = getattr(record, "request_id", "") or get_request_id()
        if request_id:
            return f"[{request_id}] {redact_text(base)}"
        return redact_text(base)


def _extra_fields(record: logging.LogRecord) -> Dict[str, Any]:
    return {
        key: value
        for key, value in record.__dict__.items()
        if key not in _STANDARD_RECORD_ATTRS
        and not key.startswith("_")
        and key != "request_id"
    }


class KeyValueTextFormatter(logging.Formatter):
    """Text format that appends structured ``extra`` fields as ``key=value``."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        base = super().format(record)
        request_id = getattr(record, "request_id", "") or get_request_id()
        if request_id:
            base = f"[{request_id}] {base}"
        extras = redact_mapping(_extra_fields(record))
        if extras:
            rendered = " ".join(
                f"{key}={_render_value(value)}" for key, value in extras.items()
            )
            base = f"{base} | {rendered}"
        return redact_text(base)


def _render_value(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, float):
        return f"{value:.2f}"
    text = str(value)
    if text == "":
        return '""'
    if any(ch.isspace() for ch in text):
        return json.dumps(text)
    return text


def build_formatter() -> logging.Formatter:
    """Return the formatter selected by ``LOG_FORMAT``."""
    if settings.LOG_FORMAT.lower() == "json":
        return JsonFormatter()
    return KeyValueTextFormatter(
        fmt="%(asctime)s %(levelname)-8s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )


_configured = False


def configure_logging(force: bool = False) -> logging.Logger:
    """
    Configure application logging.

    Safe to call more than once; subsequent calls are ignored unless
    ``force=True`` (used by the test-suite to switch formats at runtime).
    """
    global _configured
    if _configured and not force:
        return logging.getLogger("ridesetgo")

    level = getattr(logging, str(settings.LOG_LEVEL).upper(), logging.INFO)
    formatter = build_formatter()
    redactor = RedactingFilter()
    request_id_filter = RequestIdFilter()

    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    root.setLevel(level)

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    stream_handler.addFilter(redactor)
    stream_handler.addFilter(request_id_filter)
    root.addHandler(stream_handler)

    if settings.LOG_FILE:
        file_handler = logging.handlers.RotatingFileHandler(
            settings.LOG_FILE,
            maxBytes=settings.LOG_MAX_BYTES,
            backupCount=settings.LOG_BACKUP_COUNT,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.addFilter(redactor)
        file_handler.addFilter(request_id_filter)
        root.addHandler(file_handler)

    # Uvicorn's own access logger would duplicate our access log, so it is
    # silenced. Uvicorn's error logger is kept but re-routed through our
    # handlers so the format stays consistent.
    uvicorn_access = logging.getLogger("uvicorn.access")
    uvicorn_access.handlers = []
    uvicorn_access.propagate = False
    uvicorn_access.setLevel(logging.WARNING)

    uvicorn_error = logging.getLogger("uvicorn.error")
    uvicorn_error.handlers = []
    uvicorn_error.propagate = True

    # SQLAlchemy logs every statement at INFO — far too noisy and it can
    # contain bound parameter values.
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)

    # httpx logs one INFO line per outgoing request. It is noise for an
    # operational log and it can echo full request URLs.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    _configured = True
    return logging.getLogger("ridesetgo")


def get_logger(name: str) -> logging.Logger:
    """Return a module logger (e.g. ``get_logger(__name__)``)."""
    return logging.getLogger(name)


def iter_log_targets() -> Iterable[str]:
    """Names of the loggers used by the application (used by the tests)."""
    return ("ridesetgo", "uvicorn.error", "uvicorn.access")
