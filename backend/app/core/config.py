"""
RideSetGo backend configuration.

Reads settings from environment variables. Never hardcode secrets.
Copy .env.example to .env and fill in your own values.
"""
from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "RideSetGo"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = Field(default=False, env="DEBUG")

    # Server
    HOST: str = Field(default="127.0.0.1", env="HOST")
    PORT: int = Field(default=8000, env="PORT")

    # CORS / frontend origin(s), comma-separated
    ALLOWED_ORIGINS: str = Field(default="http://localhost:5173", env="ALLOWED_ORIGINS")

    # Database
    DATABASE_URL: str = Field(
        default="sqlite:///./ridesetgo.db", env="DATABASE_URL"
    )

    # Security
    SECRET_KEY: str = Field(
        default="dev-secret-change-me-in-production", env="SECRET_KEY"
    )
    ALGORITHM: str = Field(default="HS256", env="ALGORITHM")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(
        default=60 * 24 * 7, env="ACCESS_TOKEN_EXPIRE_MINUTES"
    )

    # ML artifact path (relative to backend dir)
    ML_ARTIFACT_DIR: str = Field(
        default="../ml/artifacts", env="ML_ARTIFACT_DIR"
    )

    # Map configuration (optional - OpenStreetMap works without a key)
    MAP_PROVIDER: str = Field(default="openstreetmap", env="MAP_PROVIDER")
    GOOGLE_MAPS_API_KEY: Optional[str] = Field(default=None, env="GOOGLE_MAPS_API_KEY")

    # Payment gateway (optional). Only configure these for real payment processing.
    # Leave unset / unset credentials to run in clearly-labelled demo mode.
    PAYMENT_GATEWAY: str = Field(default="demo", env="PAYMENT_GATEWAY")  # demo | stripe
    STRIPE_SECRET_KEY: Optional[str] = Field(default=None, env="STRIPE_SECRET_KEY")
    STRIPE_PUBLISHABLE_KEY: Optional[str] = Field(default=None, env="STRIPE_PUBLISHABLE_KEY")
    STRIPE_WEBHOOK_SECRET: Optional[str] = Field(default=None, env="STRIPE_WEBHOOK_SECRET")

    # ---------- Monitoring / logging (Phase 19) ----------
    # LOG_LEVEL: DEBUG | INFO | WARNING | ERROR | CRITICAL
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    # LOG_FORMAT: "text" (human readable) | "json" (one JSON object per line,
    # parsed by any log aggregator). "json" is the recommended production mode.
    LOG_FORMAT: str = Field(default="text", env="LOG_FORMAT")
    # Optional rotating log file. When unset, logs go to stdout only, which is
    # what container hosts (and most PaaS platforms) expect.
    LOG_FILE: Optional[str] = Field(default=None, env="LOG_FILE")
    LOG_MAX_BYTES: int = Field(default=5_000_000, env="LOG_MAX_BYTES")
    LOG_BACKUP_COUNT: int = Field(default=5, env="LOG_BACKUP_COUNT")
    # Log the (masked) client IP with access logs. Off by default because an
    # IP address is personal data under GDPR/PDPA.
    LOG_CLIENT_IP: bool = Field(default=False, env="LOG_CLIENT_IP")
    # Header used to propagate a request correlation id end-to-end.
    REQUEST_ID_HEADER: str = Field(default="X-Request-ID", env="REQUEST_ID_HEADER")
    # Cache window (seconds) for the readiness database probe, so frequent
    # health polling never turns into a stream of database queries.
    HEALTH_CHECK_CACHE_SECONDS: float = Field(default=5.0, env="HEALTH_CHECK_CACHE_SECONDS")
    # Collect in-process operational metrics (counters + latency percentiles).
    ENABLE_METRICS: bool = Field(default=True, env="ENABLE_METRICS")
    # Accept client-side error reports from the React error boundary.
    # Off by default: it must be an explicit, informed decision to start
    # accepting browser-originated error reports. No request data, cookies or
    # personal data are ever collected by the endpoint.
    ENABLE_CLIENT_ERROR_REPORTING: bool = Field(
        default=False, env="ENABLE_CLIENT_ERROR_REPORTING"
    )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


Settings.model_rebuild()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
