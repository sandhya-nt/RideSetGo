"""
Request-context middleware for RideSetGo (Phase 19).

A single pure-ASGI middleware that, for every HTTP request:

1. resolves a request correlation id (propagating a *safe* client supplied
   ``X-Request-ID`` or generating a new one),
2. binds it to the request context so every log record emitted while handling
   the request carries it,
3. measures the request duration,
4. emits a structured access log entry (method, route template, status code,
   duration, request id),
5. records the request in the in-process metrics registry, and
6. echoes the request id back to the caller in the ``X-Request-ID`` response
   header so a user-visible error can be traced to the exact backend log line.

What is deliberately **not** logged: the raw URL query string, request and
response bodies, ``Authorization`` headers, cookies and any other credential
material. Only the route *template* (e.g. ``/rides/{ride_id}``) is recorded,
so no user identifier ends up in the log.
"""
from __future__ import annotations

import time
from typing import Optional

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings
from app.core.logging_config import get_logger
from app.core.metrics import metrics
from app.core.request_context import (
    REQUEST_ID_HEADER,
    reset_request_id,
    resolve_request_id,
    set_request_id,
)

logger = get_logger("ridesetgo.access")


def _mask_ip(value: Optional[str]) -> str:
    """
    Mask the last portion of an IP address.

    An IP address is personal data, so it is only logged when explicitly
    enabled (``LOG_CLIENT_IP=true``) and even then it is truncated.
    """
    if not value:
        return "-"
    if ":" in value:  # IPv6
        parts = value.split(":")
        if len(parts) > 3:
            return ":".join(parts[:3]) + ":*"
        return value
    parts = value.split(".")
    if len(parts) == 4:
        return ".".join(parts[:3]) + ".0"
    return value


def _route_template(scope: Scope) -> str:
    """
    Return the matched route template (e.g. ``/rides/{ride_id}``).

    Falls back to the raw path without the query string when no route
    matched (for example a 404), so the log never contains query parameters.
    """
    route = scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path:
        return path
    raw = scope.get("path") or "unknown"
    return str(raw).split("?", 1)[0]


class RequestContextMiddleware:
    """Pure-ASGI middleware adding correlation ids, access logs and metrics."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        incoming_id = headers.get(settings.REQUEST_ID_HEADER.lower())
        request_id = resolve_request_id(incoming_id)

        token = set_request_id(request_id)
        scope.setdefault("state", {})["request_id"] = request_id

        started = time.perf_counter()
        status_code = 500
        route = _route_template(scope)
        method = scope.get("method", "GET")
        client_ip = None
        if settings.LOG_CLIENT_IP:
            client_ip = headers.get("x-forwarded-for", "").split(",")[0].strip() or None
            if not client_ip and scope.get("client"):
                client_ip = scope["client"][0]

        async def send_wrapper(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_headers = MutableHeaders(scope=message)
                response_headers.append(settings.REQUEST_ID_HEADER, request_id)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            duration_ms = (time.perf_counter() - started) * 1000
            already_handled = bool(
                scope.get("state", {}).get("ridesetgo_exception_handled")
            )
            if not already_handled:
                # The exception was not converted into a response by one of our
                # handlers — log it with the traceback for developers.
                logger.error(
                    "unhandled_exception",
                    extra={
                        "method": method,
                        "route": route,
                        "status_code": 500,
                        "duration_ms": round(duration_ms, 2),
                        "exception_type": type(exc).__name__,
                    },
                    exc_info=True,
                )
            if settings.ENABLE_METRICS:
                metrics.record_unhandled_exception()
                metrics.record_request(method, route, 500, duration_ms)
            logger.error(
                "request_failed",
                extra={
                    "method": method,
                    "route": route,
                    "status_code": 500,
                    "duration_ms": round(duration_ms, 2),
                    "client_ip": _mask_ip(client_ip),
                },
            )
            raise
        else:
            duration_ms = (time.perf_counter() - started) * 1000
            if settings.ENABLE_METRICS:
                metrics.record_request(method, route, status_code, duration_ms)
            log = logger.error if status_code >= 500 else (
                logger.warning if status_code >= 400 else logger.info
            )
            log(
                "request",
                extra={
                    "method": method,
                    "route": route,
                    "status_code": status_code,
                    "duration_ms": round(duration_ms, 2),
                    "client_ip": _mask_ip(client_ip),
                },
            )
        finally:
            reset_request_id(token)


__all__ = ["RequestContextMiddleware", "REQUEST_ID_HEADER"]
