"""
Global exception handlers for RideSetGo (Phase 19).

Every error that leaves the API is produced here, which guarantees that:

* the response body never contains a stack trace, a SQL statement, a
  connection string or any other internal detail;
* the client always receives a ``request_id`` it can quote in a bug report;
* the server-side log keeps the full traceback for developers.

The handlers deliberately avoid echoing back the *value* that failed
validation. FastAPI's default 422 response contains the rejected input, which
for ``POST /auth/login`` would be the plaintext password — that is stripped
here and only the field name and the reason are returned.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from fastapi import HTTPException as FastAPIHTTPException

from app.core.logging_config import get_logger
from app.core.metrics import metrics
from app.core.request_context import get_request_id

logger = get_logger("ridesetgo.errors")

#: Maximum number of validation problems echoed back to the client.
MAX_VALIDATION_ERRORS = 20
#: Maximum length of a single validation message.
MAX_VALIDATION_MESSAGE = 200


def _request_id(request: Request) -> str:
    return get_request_id() or str(request.scope.get("state", {}).get("request_id", ""))


def _error_body(
    detail: str, request: Request, extra: Dict[str, Any] | None = None
) -> Dict[str, Any]:
    body: Dict[str, Any] = {"detail": detail, "request_id": _request_id(request)}
    if extra:
        body.update(extra)
    return body


def _sanitize_validation_errors(exc: RequestValidationError) -> List[Dict[str, Any]]:
    """
    Convert pydantic errors into a safe, compact list.

    The rejected *input* value and the raw ``ctx`` are dropped on purpose:
    the input can be a password, a token or payment data.
    """
    errors: List[Dict[str, Any]] = []
    for raw in exc.errors()[:MAX_VALIDATION_ERRORS]:
        location = raw.get("loc") or ()
        field = ".".join(str(part) for part in location)
        message = str(raw.get("msg", "Invalid value"))[:MAX_VALIDATION_MESSAGE]
        errors.append(
            {
                "field": field,
                "message": message,
                "type": str(raw.get("type", "value_error")),
            }
        )
    return errors


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle raised HTTPException objects (including FastAPI's subclass)."""
    detail = exc.detail
    if not isinstance(detail, str):
        # Never serialise an arbitrary object into the response body.
        detail = "Request failed"
    status_code = exc.status_code
    if status_code >= 500:
        logger.error(
            "http_exception",
            extra={
                "status_code": status_code,
                "route": request.scope.get("path"),
                "method": request.method,
            },
        )
    else:
        # 4xx responses are already captured by the access log, so they are
        # only recorded at DEBUG level to avoid duplicate noise.
        logger.debug(
            "http_exception",
            extra={
                "status_code": status_code,
                "route": request.scope.get("path"),
                "method": request.method,
            },
        )
    headers = getattr(exc, "headers", None)
    return JSONResponse(
        status_code=status_code,
        content=_error_body(detail, request),
        headers=headers,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Return a sanitized 422 response (no rejected values)."""
    errors = _sanitize_validation_errors(exc)
    logger.debug(
        "validation_error",
        extra={
            "status_code": 422,
            "route": request.scope.get("path"),
            "method": request.method,
            "error_count": len(errors),
        },
    )
    return JSONResponse(
        status_code=422,
        content=_error_body(
            "Request validation failed", request, {"errors": errors}
        ),
    )


async def database_exception_handler(
    request: Request, exc: SQLAlchemyError
) -> JSONResponse:
    """
    Convert a database failure into a generic 503.

    The connection string, driver message and SQL statement stay in the
    server log; the client only learns that the service is temporarily
    unavailable.
    """
    metrics.record_db_failure()
    logger.error(
        "database_unavailable",
        extra={
            "status_code": 503,
            "route": request.scope.get("path"),
            "method": request.method,
            "exception_type": type(exc).__name__,
        },
        exc_info=True,
    )
    return JSONResponse(
        status_code=503,
        content=_error_body(
            "The service is temporarily unavailable. Please try again shortly.",
            request,
        ),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Last-resort handler for unexpected exceptions.

    The traceback is written to the log only. The response body contains a
    generic message plus the request id.
    """
    metrics.record_unhandled_exception()
    scope_state = request.scope.setdefault("state", {})
    scope_state["ridesetgo_exception_handled"] = True
    logger.error(
        "unhandled_exception",
        extra={
            "status_code": 500,
            "route": request.scope.get("path"),
            "method": request.method,
            "exception_type": type(exc).__name__,
        },
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content=_error_body(
            "An unexpected error occurred. Please try again.", request
        ),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register every global exception handler on ``app``.

    Both ``fastapi.HTTPException`` and ``starlette.exceptions.HTTPException``
    are registered because FastAPI registers a default handler for its own
    subclass, and the MRO lookup would otherwise pick that default instead
    of ours.
    """
    app.add_exception_handler(FastAPIHTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(SQLAlchemyError, database_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
