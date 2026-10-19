# RideSetGo

**RideSetGo — Amritsar ride-hailing platform with ML fare prediction.**

A full-stack ride-booking web application for Amritsar, India. Passengers get a
machine-learning fare estimate and can book, track, cancel and rate a ride.
Drivers accept incoming requests and move trips through their lifecycle. An
administrator sees live operational statistics.

> **This is a demonstration project.** It does not dispatch real drivers, does
> not stream live GPS positions, and does not process real money. Every screen
> that could be mistaken for a real transaction is explicitly labelled as a demo.
> See [Known limitations](#known-limitations) for the full list.

---

## Table of contents

- [Problem statement](#problem-statement)
- [Objectives](#objectives)
- [Technology stack](#technology-stack)
- [Implemented features](#implemented-features)
- [System requirements](#system-requirements)
- [Repository structure](#repository-structure)
- [Getting started](#getting-started)
  - [1. Backend setup](#1-backend-setup)
  - [2. Environment configuration](#2-environment-configuration)
  - [3. Database initialization and migrations](#3-database-initialization-and-migrations)
  - [4. Frontend setup](#4-frontend-setup)
  - [5. Demo accounts](#5-demo-accounts)
- [Development commands](#development-commands)
- [Testing](#testing)
- [Production build](#production-build)
- [API documentation](#api-documentation)
- [Deployment](#deployment)
- [Documentation index](#documentation-index)
- [Known limitations](#known-limitations)
- [License](#license)

---

## Problem statement

Ride-hailing is well established in metropolitan markets, but in a city like
Amritsar a rider still has to guess what a trip will cost. The price quoted by
one operator is rarely comparable with the next, and there is no transparent way
to check whether a fare is reasonable before committing to a booking. For the
driver side, incoming ride requests are handled over phone calls, and neither
party has a single record of what was agreed.

The core problem this project addresses is **price opacity and the absence of a
shared, auditable trip record**. Concretely:

1. Riders cannot obtain a reliable, explainable fare estimate before booking.
2. Operators cannot justify a quoted fare from data.
3. Trips are not tracked through a single, auditable status lifecycle.
4. There is no administrative view over bookings, payments and ride status.

RideSetGo addresses these with a **data-driven fare estimator trained on a real
Amritsar trip dataset**, a **role-based application** that gives passengers,
drivers and administrators exactly the access each needs, and a **transparent
ride lifecycle** in which every status change is recorded.

### Data source

The estimator is trained on `amritsar_uber_dataset.csv` — **49,310 real trip
records** with 21 columns, covering **37 distinct Amritsar locations** with
genuine coordinates. The model computes great-circle (haversine) distance
between the real pickup and drop-off coordinates and predicts the fare from
five features:

```
pickup_code, dropoff_code, distance_km, passenger_count, hour
```

Because the coordinates in the dataset are real, the distance between any two
listed locations is a real distance, and the estimate for a real Amritsar route
is meaningful rather than synthetic.

---

## Objectives

| # | Objective | Status |
|---|-----------|--------|
| 1 | Predict a fare for a real Amritsar route using a trained ML model | **Complete** |
| 2 | Provide per-category fares (Bike / Auto / Mini / Sedan / SUV) from one base estimate | **Complete** |
| 3 | Passenger accounts with secure password hashing and JWT sessions | **Complete** |
| 4 | Booking, ride status lifecycle, cancellation with reason and timestamp | **Complete** |
| 5 | Driver dashboard: request queue, accept, start, complete | **Complete** |
| 6 | Admin dashboard: users, rides, payments, live system health | **Complete** |
| 7 | Trip history, trip details, digital receipt | **Complete** |
| 8 | Trip tracking screen with honest capability reporting | **Complete** (status timeline; no GPS) |
| 9 | Ratings and reviews on completed rides | **Complete** |
| 10 | In-app notifications | **Complete** (in-app only) |
| 11 | Safety centre: trusted contacts and incident reports | **Complete** |
| 12 | Payment status machine that cannot be faked by the client | **Complete** (no live gateway) |
| 13 | Structured logging, request correlation, metrics, health probes | **Complete** |
| 14 | Idempotent booking retries | **Complete** |
| 15 | Real payment gateway, driver GPS, push notifications, OTP/SMS auth | **Not implemented** — see [Known limitations](#known-limitations) |

A full status table with source files, endpoints and evidence is in
[`docs/FEATURE_STATUS.md`](docs/FEATURE_STATUS.md).

---

## Technology stack

### Frontend

| Technology | Version in `package.json` | Purpose |
|---|---|---|
| React | ^18.3.1 | Component model |
| TypeScript | ~5.6.3 | Static typing across API contracts |
| Vite | ^5.4.10 | Dev server and production bundling |
| Tailwind CSS | ^3.4.14 | Utility-first styling |
| React Router | ^6.27.0 | Client-side routing and route guards |
| Zustand | ^5.0.1 | Auth and trip state, with `persist` for session restore |
| Axios | ^1.7.9 | HTTP client with auth and error interceptors |
| React Hook Form | ^7.53.2 | Form handling and validation |
| Leaflet + React Leaflet | ^1.9.4 / ^4.2.1 | OpenStreetMap map rendering |
| lucide-react | ^0.454.0 | Icon set |
| clsx + tailwind-merge | ^2.1.1 / ^2.5.4 | Conditional class composition |

### Backend

| Technology | Pinned in `requirements.txt` | Purpose |
|---|---|---|
| FastAPI | 0.115.0 | ASGI web framework, automatic OpenAPI docs |
| Uvicorn | 0.32.1 | ASGI server |
| SQLAlchemy | 2.0.36 | ORM and query builder |
| Alembic | 1.14.0 | Schema migrations |
| Pydantic | 2.10.0 | Request/response validation |
| pydantic-settings | 2.4.0 | Environment-driven configuration |
| python-jose | 3.3.0 | JWT sign/verify |
| bcrypt (via passlib) | 1.7.4 | Password hashing |
| joblib | 1.6.0 | Model artifact serialisation |
| scikit-learn | 1.9.1 | Random Forest model training and inference |
| pandas / numpy | 3.0.6 / 2.5.4 | Dataset handling |
| pytest | 8.3.0 | Test runner |
| httpx | 0.28.1 | Test HTTP client |

### Database

**SQLite** via SQLAlchemy. The default URL is `sqlite:///./ridesetgo.db`.
`app/database.py` is written against the SQLAlchemy 2.x API and the connection
string is configurable, so the intended migration path to PostgreSQL is to
change `DATABASE_URL` and replace the SQLite-only `connect_args` line.

### Machine learning

| Item | Value |
|---|---|
| Algorithm | `RandomForestRegressor` (`n_estimators=100`, `random_state=42`) |
| Features | `pickup_code`, `dropoff_code`, `distance_km`, `passenger_count`, `hour` |
| Training rows | 49,310 (80/20 split, `random_state=42`) |
| Locations | 37, with real coordinates |
| **MAE** | **₹7.33** |
| **RMSE** | **₹9.19** |
| **R²** | **0.9968** |
| Artifacts | `ml/artifacts/fare_model.joblib`, `preprocessor.joblib`, `location_db.joblib` |

These metrics are read from the saved `preprocessor.joblib` and are the values
produced by the committed training run. They describe agreement with the
historical dataset, not accuracy against live Uber pricing.

### External services

| Service | Status |
|---|---|
| OpenStreetMap tiles via Leaflet | **Integrated** — no API key required |
| Google Maps | Configurable (`GOOGLE_MAPS_API_KEY`) but **not required and not used by default** |
| Stripe | Configurable, **not configured** — the app runs in clearly-labelled demo mode |
| SMS / OTP / push notifications | **Not integrated** |

---

## Implemented features

### Passenger

- **Authentication** — sign up, sign in, sign out, restore an existing session on page reload, profile view.
- **Fare estimation** — pick a real pickup and drop-off from the 37 known locations, get a base ML estimate plus a fare for each of the five vehicle categories.
- **Booking** — choose a category, confirm the fare breakdown and book. Booking sends an `Idempotency-Key`, so a retry never creates a duplicate ride or a duplicate payment.
- **Ride lifecycle** — see status, track progress, cancel with a reason while the ride is still `requested` or `accepted`.
- **History and details** — upcoming / completed / cancelled tabs, per-trip detail view.
- **Digital receipt** — printable receipt with booking reference `RSG-######`, fare breakdown, payment method and status, and an explicit demo disclaimer.
- **Trip tracking** — a live-updating status timeline with the real assigned driver's name and phone, and an explicit statement of what tracking cannot do.
- **Ratings** — rate a completed ride once, with an optional comment.
- **Safety centre** — manage trusted contacts, file an incident report against a trip.

### Driver

- **Request queue** — every unassigned `requested` ride, polled every 8 seconds.
- **Accept / start / complete** — with server-side rules: a driver can hold only one active trip, and a ride can only be accepted while it is still unclaimed.
- **Own trip list** — see the rides assigned to you and their current status.

### Administrator

- **Operations dashboard** — total users, total rides, confirmed revenue, rides grouped by status and by category, all computed from the database.
- **Rides browser** — filter by status, date range or free text; see cancellation reason and timestamp.
- **Payments browser and summary** — every payment record, grouped by status, with the confirmed total.
- **User list** — id, email, name, role and active flag.
- **System health** — live service, database, request, latency and error statistics.

### Platform

- **Observability** — structured logging (text or JSON), per-request correlation id, in-process metrics with latency percentiles, and `/health`, `/health/live`, `/health/ready` probes.
- **Safe error handling** — global exception handlers guarantee that no stack trace, SQL statement or connection string reaches a client; the full detail goes to the log.
- **Client error reporting** — optional, disabled by default, rate-limited, and unable to collect request data, credentials or personal data.

---

## System requirements

| Component | Requirement | Verified on |
|---|---|---|
| Python | 3.10+ (3.13 recommended) | 3.13.5 |
| Node.js | 18+ (20+ recommended) | 24.22.0 |
| npm | 9+ | 11.19.1 |
| Disk | ~1.5 GB — the trained model artifact is ~300 MB | — |
| RAM | 2 GB minimum (4 GB comfortable) — loading the Random Forest needs ~1 GB | — |
| OS | Windows, macOS or Linux | Windows 11 |

> The `fare_model.joblib` artifact is 300 MB because a 100-tree Random Forest
> over 49,310 rows is stored unpruned. Compressing it with `joblib.dump(...,
> compress=3)` is a straightforward future optimisation.

---

## Repository structure

```
Amritsar_Uber_Project/
├── README.md                     # This file
├── amritsar_uber_dataset.csv     # 49,310 real Amritsar trip records
├── ridesetgo.db                  # Root SQLite database (schema only)
├── backend/
│   ├── app/
│   │   ├── main.py               # FastAPI app, middleware, router registration
│   │   ├── models.py             # SQLAlchemy models (10 tables)
│   │   ├── schemas.py            # Pydantic request/response models
│   │   ├── database.py           # Engine, session factory, Base
│   │   ├── api/                  # Routers: auth, rides, admin, fare,
│   │   │                         #   locations, categories, notifications,
│   │   │                         #   safety, health, diagnostics
│   │   ├── core/                 # config, security, logging_config, metrics,
│   │   │                         #   middleware, exceptions, health,
│   │   │                         #   idempotency, request_context
│   │   └── ml/predictor.py       # Fare prediction service + category config
│   ├── alembic/                  # Migrations (4 revisions)
│   ├── alembic.ini
│   ├── tests/                    # pytest suites (79 tests)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── pages/                # 15 route components
│   │   ├── components/           # Shared UI, map, vehicle selection panel
│   │   ├── services/api.ts       # Typed Axios client
│   │   ├── store/                # Zustand stores (auth, trip)
│   │   ├── lib/                  # Error normalisation, observability
│   │   └── types/                # TypeScript API types
│   ├── package.json
│   └── vite.config.ts            # Dev server + /api proxy to :8000
├── ml/
│   ├── train_model.py            # Trains and saves the artifacts
│   ├── pipeline.py               # Load + validate + predict
│   ├── evaluate.py
│   └── artifacts/                # fare_model / preprocessor / location_db
├── scripts/
│   ├── seed_demo_accounts.py     # Creates the demo customer/driver/admin
│   └── smoke_test.py             # 83-check end-to-end verification
└── docs/                         # Architecture, database, API, demo, report,
                                  #   presentation, viva, screenshots
```

---

## Getting started

### 1. Backend setup

```bash
git clone <repository-url>
cd Amritsar_Uber_Project

# Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# Install dependencies
cd backend
pip install -r requirements.txt
cd ..
```

> The committed `.venv` is Windows-specific. Create your own, as above, on any
> platform.

### 2. Environment configuration

The backend reads configuration from environment variables, falling back to
`backend/.env` (see `backend/.env.example`).

```bash
cd backend
copy .env.example .env      # Windows
cp .env.example .env        # macOS / Linux
```

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | `RideSetGo` | Application name shown in the API docs |
| `APP_VERSION` | `0.1.0` | Version reported by `/` and `/health` |
| `DEBUG` | `false` | Log verbosity only — never enables FastAPI debug mode |
| `HOST` / `PORT` | `127.0.0.1` / `8000` | Where the API listens |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated CORS origins |
| `DATABASE_URL` | `sqlite:///./ridesetgo.db` | SQLAlchemy connection URL |
| `SECRET_KEY` | `dev-secret-change-me-in-production` | **JWT signing key — must be changed** |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Token lifetime |
| `ML_ARTIFACT_DIR` | `../ml/artifacts` | Where the model artifacts live |
| `MAP_PROVIDER` | `openstreetmap` | Map tile provider |
| `GOOGLE_MAPS_API_KEY` | *(unset)* | Optional |
| `PAYMENT_GATEWAY` | `demo` | `demo` or `stripe` |
| `STRIPE_SECRET_KEY` | *(unset)* | Optional — leave unset for demo mode |
| `STRIPE_PUBLISHABLE_KEY` | *(unset)* | Optional |
| `STRIPE_WEBHOOK_SECRET` | *(unset)* | Optional |
| `LOG_LEVEL` | `INFO` | `DEBUG` … `CRITICAL` |
| `LOG_FORMAT` | `text` | `text` or `json` (recommended for production) |
| `LOG_FILE` | *(unset)* | Optional rotating log file |
| `LOG_MAX_BYTES` | `5000000` | Rotation size |
| `LOG_BACKUP_COUNT` | `5` | Rotated files kept |
| `LOG_CLIENT_IP` | `false` | Log the client IP (off by default — it is personal data) |
| `REQUEST_ID_HEADER` | `X-Request-ID` | Correlation-id header name |
| `HEALTH_CHECK_CACHE_SECONDS` | `5.0` | Readiness probe cache window |
| `ENABLE_METRICS` | `true` | Collect in-process metrics |
| `ENABLE_CLIENT_ERROR_REPORTING` | `false` | Accept browser error reports |

**Never commit a `.env` file containing a real `SECRET_KEY`.** The
repository's `.gitignore` excludes `.env`, `*.db`, `node_modules/` and
`frontend/dist/`, so none of those are committed by accident.

### 3. Database initialization and migrations

Tables are created automatically at import time by
`Base.metadata.create_all(bind=engine)` in `backend/app/main.py`, so a fresh
checkout works with no manual step. To manage the schema with Alembic instead:

```bash
cd backend

# Apply all migrations to a fresh database
alembic upgrade head

# Create a new migration after changing app/models.py
alembic revision --autogenerate -m "describe your change"

# Inspect the current state
alembic current
alembic history
```

The migration chain is:

```
6afbbc46177c  add relationship column to trusted_contacts
   └── 89f7ab2b06a1  add user_id column to ratings
          └── 1d67a3ef848e  add cancellation fields and payment status
                 └── c4e1a7b93d21  add idempotency_records table  (head)
```

> **The database path is relative to the working directory.** Starting Uvicorn
> from `backend/` uses `backend/ridesetgo.db`; starting it from the repository
> root uses the root `ridesetgo.db`. Always set `DATABASE_URL` explicitly, or
> always start the server from the same directory, so you always know which
> database you are looking at.

### 4. Frontend setup

```bash
cd frontend
npm install
```

### 5. Demo accounts

The Driver and Admin dashboards need accounts with the `driver` and `admin`
roles. `POST /auth/signup` always creates a `customer`, and no public endpoint
can promote an account, so a small seeding script is provided:

```bash
# From the repository root
.venv\Scripts\python.exe scripts\seed_demo_accounts.py
```

| Role | Email | Password |
|---|---|---|
| Customer | `passenger@ridesetgo.demo` | `Demo@1234` |
| Driver | `driver@ridesetgo.demo` | `Demo@1234` |
| Admin | `admin@ridesetgo.demo` | `Demo@1234` |

The script is idempotent and also seeds the `ride_categories` table. Set
`DATABASE_URL` first if you want it to target a specific database.

> These are demo credentials intended to be shown on screen. Change them before
> deploying anywhere real, and never use real passenger data in a demo.

---

## Development commands

### Run the backend

```bash
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API is then on <http://127.0.0.1:8000> and the interactive docs on
<http://127.0.0.1:8000/docs>.

### Run the frontend

```bash
cd frontend
npm run dev
```

The app is then on <http://localhost:5173>. The Vite dev server proxies
`/api/*` to `http://127.0.0.1:8000` and strips the `/api` prefix, so the
frontend code always calls relative `/api/...` URLs and there is no CORS
pre-flight in development.

### Available npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload on port 5173 |
| `npm run build` | Type-check with `tsc`, then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `.ts`/`.tsx` |

### Retrain the model (optional)

The artifacts are committed, so retraining is only needed after changing the
model or the dataset.

```bash
.venv\Scripts\python.exe ml\train_model.py
```

This rewrites `ml/artifacts/`. It takes a few minutes and prints the MAE, RMSE
and R² it achieved.

---

## Testing

### Backend tests

```bash
cd backend
..\.venv\Scripts\python.exe -m pytest tests -v
```

**Last verified result: 79 passed, 0 failed** (1m 24s).

The suites use a temporary SQLite database, so the development database is not
touched. They cover authentication, fare estimation and its validation errors,
booking, the ride lifecycle, cancellation rules, the payment status machine,
receipts, ratings, notifications, ownership isolation, role-based access
control, health probes and idempotent booking.

### End-to-end smoke test

```bash
# Terminal 1: start the API
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2: run the checks
.venv\Scripts\python.exe scripts\smoke_test.py
```

**Last verified result: 83 passed, 0 failed.** This runs the complete walkthrough
against a live server — including every negative case (a passenger cannot read
another passenger's receipt, a customer cannot mark their own payment as paid,
a completed ride cannot be cancelled, a driver cannot reach the admin API).

---

## Production build

```bash
cd frontend
npm run build
```

**Last verified result: build succeeded**, 1,700+ modules transformed, output in
`frontend/dist/`. The command runs `tsc` first, so a type error fails the build
rather than shipping broken code.

To preview the production bundle:

```bash
npm run preview
```

> The production build serves static files only. It has no API server, so
> `/api/*` requests will 404 unless a reverse proxy forwards them to the
> backend — see [Deployment](#deployment).

---

## API documentation

With the backend running:

| URL | What it is |
|---|---|
| <http://127.0.0.1:8000/docs> | Swagger UI — interactive, "Try it out" enabled |
| <http://127.0.0.1:8000/redoc> | ReDoc — reference-style rendering |
| <http://127.0.0.1:8000/openapi.json> | Raw OpenAPI 3.1 document |

The application exposes **36 paths / 41 operations** across 10 tags: `auth`,
`rides`, `fare`, `locations`, `categories`, `notifications`, `safety`, `admin`,
`health` and `diagnostics`.

A hand-written inventory of every endpoint, its auth requirement, parameters,
schemas and error responses is in [`docs/API.md`](docs/API.md).

---

## Deployment

**No deployment has been performed or verified for this project.** The
instructions below describe what the code supports; treat them as a starting
point rather than a proven procedure.

### Backend

The app is a standard ASGI application, so any ASGI server works:

```bash
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
```

> Use a single worker. The metrics collector and the idempotency claim logic
> are in-process; multiple workers would each keep their own counters, and
> SQLite would serialise writes anyway. Moving to PostgreSQL and a shared
> metrics store is the prerequisite for scaling out.

### Frontend

```bash
cd frontend
npm run build
# Serve frontend/dist/ with any static file server or CDN.
```

### Reverse proxy

The frontend build calls `/api/...`. Configure the reverse proxy to forward
`/api/*` to the backend and strip the prefix, matching the Vite dev proxy:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8000/;
    proxy_set_header Host $host;
    proxy_set_header X-Request-ID $http_x_request_id;
}
location / {
    root /srv/ridesetgo/frontend/dist;
    try_files $uri /index.html;   # SPA fallback
}
```

### Before going live

- [ ] Set a strong, unique `SECRET_KEY` (the default is a placeholder).
- [ ] Set `ALLOWED_ORIGINS` to the real frontend origin.
- [ ] Set `LOG_FORMAT=json` so logs are machine-parseable.
- [ ] Leave `STRIPE_SECRET_KEY` unset unless a real gateway is configured.
- [ ] Move to PostgreSQL by changing `DATABASE_URL`.
- [ ] Terminate TLS in front of both tiers.
- [ ] Set `LOG_CLIENT_IP` only if your privacy policy allows it.

---

## Documentation index

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layer diagram, request lifecycle, Mermaid component and deployment views |
| [`docs/DATABASE.md`](docs/DATABASE.md) | ER diagram, per-table data dictionary, constraints, status fields |
| [`docs/API.md`](docs/API.md) | Every endpoint with auth, parameters, schemas and errors |
| [`docs/MONITORING.md`](docs/MONITORING.md) | Logging, metrics, health probes and troubleshooting |
| [`docs/FEATURE_STATUS.md`](docs/FEATURE_STATUS.md) | Feature-by-feature completion table with evidence |
| [`docs/DEMO.md`](docs/DEMO.md) | Repeatable demonstration script and speaker notes |
| [`docs/REPORT.md`](docs/REPORT.md) | Final-year project report |
| [`docs/PRESENTATION.md`](docs/PRESENTATION.md) | Slide-by-slide presentation outline |
| [`docs/VIVA.md`](docs/VIVA.md) | Viva questions with answers grounded in the actual code |
| [`docs/screenshots/`](docs/screenshots/) | Captured application screenshots |

---

## Known limitations

These are real, verified limitations — not placeholders.

**Functional**

1. **No real payment processing.** `PAYMENT_GATEWAY=demo` and no Stripe
   credentials are configured. Cash bookings create a `not_applicable` payment;
   online bookings create a `pending` `mock_wallet` payment with a
   `MOCK-######` transaction id. The webhook endpoint at
   `POST /rides/payments/webhook` is a stub that does not verify signatures or
   update a payment. **A customer can never mark their own payment as paid** —
   the server rejects it, which is the correct behaviour but means no payment
   can ever be confirmed in a demo.
2. **No live driver tracking.** The tracking screen is a status timeline. The
   backend stores no driver GPS and integrates no routing provider, and
   `GET /rides/{ride_id}/tracking` returns `driver_location: null`,
   `route_geometry: null` and `capabilities.live_tracking_available: false`.
   The API is designed so a real source can be added without changing the
   response shape.
3. **No real driver dispatch.** A booking stays `requested` until a driver
   account explicitly accepts it from the Driver Dashboard. There is no
   automatic matching, no proximity search and no notification to drivers.
4. **Notifications are in-app only.** They are rows in the `notifications`
   table; there is no email, SMS or push delivery.
5. **No driver-facing location updates.** A driver cannot publish their
   position, so the passenger cannot see the vehicle move.
6. **No scheduled rides.** The "Schedule a Ride" control is present in the UI
   and is explicitly labelled *Coming Soon*.
7. **No rating aggregation.** Ratings are stored and returned, but there is no
   average-per-driver endpoint and no driver leaderboard.
8. **Driver applications are not wired up.** The `driver_applications` table and
   the `DriverApplication` model exist, but no backend route serves them — the
   `list_driver_applications` function in `app/api/admin.py` is defined without
   a route decorator, so it is unreachable. The frontend
   `driverApplicationService` in `services/api.ts` calls
   `POST /driver-applications` and `GET /driver-applications/me`, which do not
   exist. **No screen uses that service**, so nothing in the app breaks — it is
   dead code waiting to be either implemented or removed.
9. **`GET /admin/categories` and `GET /admin/drivers/applications` are called by
   `services/api.ts` but do not exist.** Again, no page uses them.

**Security**

10. `SECRET_KEY` has a placeholder default. It must be set before any real use.
11. Tokens live in `localStorage`, which is readable by any script on the
    origin. An httpOnly cookie with CSRF protection would be stronger.
12. The token lifetime defaults to 7 days with no refresh-token rotation and no
    server-side revocation, so `POST /auth/logout` only discards the token
    client-side.
13. There is no rate limiting on the authentication endpoints, so the login form
    is not protected against credential stuffing. (The client-error reporting
    endpoint *is* rate-limited.)
14. `role` is a plain string column, not an enum, and there is no
    admin-only account-creation endpoint — roles are set directly in the
    database.

**Operational**

15. SQLite only. Fine for a demonstration, not for concurrent production load.
16. Metrics and the idempotency cache are in-process, so they do not survive a
    restart and are not shared between workers.
17. The `fare_model.joblib` artifact is ~300 MB and takes about a second to
    load. It is loaded lazily on the first request that needs it.
18. The 300 MB artifact is committed to the repository.

**Code quality**

19. `requirements.txt` pins versions that differ from what is actually
    installed in the development environment (for example FastAPI 0.115.0
    pinned vs 0.143.3 installed, SQLAlchemy 2.0.36 vs 2.1.5, pytest 8.3.0 vs
    9.1.1). The application runs correctly on the installed versions.
20. Pydantic v2 deprecation warnings are emitted: class-based `Config` on the
    schema models and `Field(env=...)` in `core/config.py`. They are warnings,
    not errors.
21. `app/api/rides.py` defines `_require_ride_owner_or_admin`, which is never
    called — each handler inlines its own ownership check.
22. `app.tsx` declares the `/driver` route twice. Both render the same
    component, so there is no visible effect, but it should be removed.
23. `frontend/src/components/ProtectedRoute.tsx` is a no-op passthrough. The
    real guard is the `SessionGate` layout route in `App.tsx`.

**Testing**

24. The backend tests are API-level integration tests using `TestClient`. There
    are no unit tests for the SQLAlchemy models in isolation, and no
    browser-level (Playwright/Cypress) test suite in the repository.
25. There is no load, performance or concurrency test suite, so **no throughput
    or latency-under-load figures exist for this project.** The latency numbers
    in the admin system-health screen are in-process measurements from a single
    development machine and must not be presented as benchmark results.

---

## License

Academic project, submitted for a final-year degree. The dataset
(`amritsar_uber_dataset.csv`) contains real Amritsar trip records collected for
research purposes.
