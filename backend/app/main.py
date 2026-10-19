"""
RideSetGo FastAPI backend entry point.

Run locally:
    cd backend
    ..\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Operational notes (Phase 19):
    * Logging is configured once, before the application object is created, by
      ``app.core.logging_config.configure_logging()``.
    * ``RequestContextMiddleware`` adds a request correlation id, an access
      log entry and the in-process metrics for every request.
    * Global exception handlers guarantee that no stack trace, SQL statement
      or connection string ever reaches a client.
    * ``/health`` (liveness + database), ``/health/live`` and ``/health/ready``
      are served by ``app.api.health``.
"""
from __future__ import annotations

import sys
import os
from contextlib import asynccontextmanager

# Ensure project root is on sys.path so `ml` package (at project root) is importable
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import configure_logging, get_logger
from app.core.middleware import RequestContextMiddleware
from app.core.exceptions import register_exception_handlers
from app.core.metrics import metrics
from app.database import engine, Base
from app.api import (
    auth,
    locations,
    fare,
    categories,
    rides,
    admin,
    safety,
    notifications,
    health,
    diagnostics,
)

# Configure logging as the very first thing so startup problems are logged in
# the same format as every other record.
logger = get_logger("ridesetgo.startup")
configure_logging()

# Create database tables (Alembic migrations can manage this in production)
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Log the service start-up and shut-down (never logs secrets)."""
    logger.info(
        "service_started",
        extra={
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "log_level": settings.LOG_LEVEL,
            "log_format": settings.LOG_FORMAT,
            "metrics_enabled": settings.ENABLE_METRICS,
            "client_error_reporting": settings.ENABLE_CLIENT_ERROR_REPORTING,
        },
    )
    yield
    snapshot = metrics.snapshot()
    logger.info(
        "service_stopped",
        extra={
            "app": settings.APP_NAME,
            "uptime_seconds": snapshot["uptime_seconds"],
            "requests_total": snapshot["requests"]["total"],
            "error_rate_5xx_percent": snapshot["requests"]["error_rate_5xx_percent"],
            "unhandled_exceptions": snapshot["unhandled_exceptions"],
        },
    )


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="RideSetGo — Amritsar ride-hailing fare prediction backend (demo)",
    # Never enable FastAPI's debug mode: it replaces 500 responses with a full
    # HTML traceback. `settings.DEBUG` only influences the log level.
    debug=False,
    lifespan=lifespan,
)

# CORS — restrict to configured origins
_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    # `X-Request-ID` is accepted so a browser (or an upstream proxy) can
    # propagate its own correlation id; the value is validated server side.
    allow_headers=["Authorization", "Content-Type", settings.REQUEST_ID_HEADER],
    expose_headers=[settings.REQUEST_ID_HEADER],
)
# Added last => outermost middleware. It therefore also covers CORS
# pre-flight requests, which never reach a route handler.
app.add_middleware(RequestContextMiddleware)

# Global exception handlers (sanitised responses, full tracebacks in the log)
register_exception_handlers(app)

# Routers
app.include_router(auth.router)
app.include_router(locations.router)
app.include_router(fare.router)
app.include_router(categories.router)
app.include_router(rides.router)
app.include_router(safety.router)
app.include_router(notifications.router)
app.include_router(admin.router)
app.include_router(health.router)
app.include_router(diagnostics.router)


@app.get("/")
def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/docs",
    }
