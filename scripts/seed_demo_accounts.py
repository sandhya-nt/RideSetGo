"""
Create the demo accounts needed for the RideSetGo walkthrough.

Why this script exists
----------------------
`POST /auth/signup` always creates an account with role "customer". There is no
public API to create a `driver` or an `admin` account, and no admin endpoint
that can promote an account. The only way to obtain the roles that the Driver
Dashboard and the Admin Operations Dashboard require is to write the `role`
column directly in the database.

This script is therefore part of the demo setup, not part of the application.
It uses the application's own SQLAlchemy models and the same bcrypt hashing
helper as `app/core/security.py`, so the accounts it creates are indistinguishable
from accounts created through the API.

Usage
-----
    # from the repository root
    .\\.venv\\Scripts\\python.exe scripts\\seed_demo_accounts.py

    # to use a different database
    set DATABASE_URL=sqlite:///./backend/ridesetgo.db
    .\\.venv\\Scripts\\python.exe scripts\\seed_demo_accounts.py

The script is idempotent: running it twice does not create duplicates and does
not reset the password of an existing account.
"""
from __future__ import annotations

import os
import sys

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")

# The application reads its configuration from the environment / `.env` file
# relative to the working directory. Importing `app.*` requires the backend
# directory on sys.path.
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from sqlalchemy import or_  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.models import Base, Ride, RideCategory, User  # noqa: E402


# ---------------------------------------------------------------------------
# Demo accounts. These credentials are demo-only and are meant to be shown on
# screen during a walkthrough. Change them before using the app anywhere real.
# ---------------------------------------------------------------------------
DEMO_ACCOUNTS = [
    {
        "email": "passenger@ridesetgo.demo",
        "full_name": "Demo Passenger",
        "phone": "9800000001",
        "password": "Demo@1234",
        "role": "customer",
    },
    {
        "email": "driver@ridesetgo.demo",
        "full_name": "Demo Driver",
        "phone": "9800000002",
        "password": "Demo@1234",
        "role": "driver",
    },
    {
        "email": "admin@ridesetgo.demo",
        "full_name": "Demo Admin",
        "phone": "9800000003",
        "password": "Demo@1234",
        "role": "admin",
    },
]

# The ride categories the booking screen offers. The live `/categories/`
# endpoint is served from the ML module (app/ml/predictor.py), but the
# `ride_categories` table is a real table in the schema, so it is seeded to
# match the values the API returns.
RIDE_CATEGORIES = [
    {"name": "Bike", "display_name": "Bike", "base_multiplier": 0.70, "min_fare": 30.0, "icon_name": "bike"},
    {"name": "Auto", "display_name": "Auto Rickshaw", "base_multiplier": 0.80, "min_fare": 35.0, "icon_name": "auto"},
    {"name": "Mini", "display_name": "Mini", "base_multiplier": 0.90, "min_fare": 40.0, "icon_name": "car"},
    {"name": "Sedan", "display_name": "Sedan", "base_multiplier": 1.15, "min_fare": 50.0, "icon_name": "car"},
    {"name": "SUV", "display_name": "SUV", "base_multiplier": 1.40, "min_fare": 70.0, "icon_name": "car"},
]


def seed_accounts(db) -> list[str]:
    """Create or top-up the demo accounts. Returns one status line per account."""
    messages = []
    for spec in DEMO_ACCOUNTS:
        user = (
            db.query(User)
            .filter(or_(User.email == spec["email"], User.phone == spec["phone"]))
            .first()
        )
        if user is None:
            user = User(
                email=spec["email"],
                full_name=spec["full_name"],
                phone=spec["phone"],
                hashed_password=hash_password(spec["password"]),
                role=spec["role"],
                is_active=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            messages.append(f"created  {spec['role']:8} {spec['email']} (id={user.id})")
        else:
            changed = False
            if user.role != spec["role"]:
                user.role = spec["role"]
                changed = True
            if not user.is_active:
                user.is_active = True
                changed = True
            if changed:
                db.commit()
                db.refresh(user)
            messages.append(f"existing {spec['role']:8} {spec['email']} (id={user.id}) role verified")
    return messages


def seed_categories(db) -> int:
    """Seed the `ride_categories` table to match the live `/categories/` output."""
    created = 0
    for spec in RIDE_CATEGORIES:
        exists = db.query(RideCategory).filter(RideCategory.name == spec["name"]).first()
        if exists is None:
            db.add(
                RideCategory(
                    name=spec["name"],
                    display_name=spec["display_name"],
                    base_multiplier=spec["base_multiplier"],
                    min_fare=spec["min_fare"],
                    icon_name=spec["icon_name"],
                    is_active=True,
                )
            )
            created += 1
    db.commit()
    return created


def main() -> int:
    # `app.main` calls Base.metadata.create_all(), but importing it also pulls in
    # the whole FastAPI application. Creating the tables directly keeps this
    # script usable even if the web application is not running.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        print(f"Database: {engine.url}")
        print()
        for line in seed_accounts(db):
            print("  " + line)
        created = seed_categories(db)
        print(f"  ride_categories rows inserted: {created}")

        rides = db.query(Ride).count()
        users = db.query(User).count()
        print()
        print(f"Summary: {users} users, {rides} rides in the database.")
        print()
        print("Demo credentials (demo only - never use real data):")
        for spec in DEMO_ACCOUNTS:
            print(f"  {spec['role']:8} {spec['email']:28} password: {spec['password']}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
