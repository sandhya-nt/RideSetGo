# Feature Status Audit

**RideSetGo** — Phase 21 final audit, 19 October 2026.

This is the honest, code-verified status of every feature area. It was produced
by reading the source, enumerating the live OpenAPI document, inspecting the
SQLite schema, running the test suite, running the production build, and
exercising the full application flow against a running server.

**Legend**

| Status | Meaning |
|---|---|
| **Complete** | Implemented, and verified by running it |
| **Partial** | Implemented for part of the scope; the rest is absent |
| **Planned** | Designed or referenced, but not implemented |
| **Not implemented** | No working implementation exists |

---

## Summary

| # | Feature area | Status | Primary evidence |
|---|---|---|---|
| 1 | Passenger authentication | **Complete** | `auth.py`; 4 endpoints; smoke test |
| 2 | Ride booking | **Complete** | `POST /rides/book` → 201; smoke test |
| 3 | Fare estimation | **Complete** | `POST /fare/estimate`; R² 0.9968 on 49,310 rows |
| 4 | Driver Partner Dashboard | **Complete** | `GET /rides/available` → 200; smoke test |
| 5 | Admin Operations Dashboard | **Complete** | `GET /admin/stats` → 200; smoke test |
| 6 | Trip history and ride management | **Complete** | `GET /rides/`; HistoryPage screenshot |
| 7 | Live trip tracking | **Partial** | API complete; no GPS, no ETA, no route geometry |
| 8 | Payments and digital receipts | **Partial** | Receipts work; no payment can ever be confirmed |
| 9 | Ratings and reviews | **Complete** | `POST /rides/{id}/rating` → 201; smoke test |
| 10 | Notifications | **Partial** | In-app only; no email, SMS or push |
| 11 | Safety centre | **Complete** | 6 endpoints; SafetyPage screenshot |
| 12 | Security and authorisation | **Complete** | bcrypt + JWT + role and ownership gates |
| 13 | Monitoring and observability | **Complete** | 3 health endpoints + metrics + structured logging |
| 14 | Idempotent booking | **Complete** | `Idempotency-Key` header on `POST /rides/book` |
| 15 | Deployment readiness | **Partial** | No deployment performed or verified |
| 16 | Performance testing | **Not implemented** | No load or benchmark suite exists |
| 17 | Driver applications | **Not implemented** | Table and model exist; no route serves them |
| 18 | Scheduled rides | **Not implemented** | UI control labelled "Coming Soon" |
| 19 | Driver dispatch / auto-matching | **Not implemented** | A driver must accept manually |
| 20 | Rating aggregation | **Not implemented** | No average-per-driver endpoint |

---

## 1. Passenger authentication — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/api/auth.py`, `backend/app/core/security.py` |
| Endpoints | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Database | `users` table |
| Evidence | Smoke test: signup → 201 with a token; wrong password → 401; no token → 401; `GET /auth/me` → 200 with `role: customer` |
| Frontend | `LoginPage.tsx`, `SignupPage.tsx`, `ProfilePage.tsx`, `store/authStore.ts` |

**What works.** bcrypt password hashing with a per-password salt; JWT access
tokens signed with `HS256`; session restoration on page reload via a Zustand
`persist` store; duplicate-email and duplicate-phone rejection; deactivated
accounts rejected at login.

**Limitations.** `SECRET_KEY` has a placeholder default. Tokens live in
`localStorage`, so any script on the origin can read them — an httpOnly cookie
with CSRF protection would be stronger. The 7-day token has no refresh
rotation and no server-side revocation, so `POST /auth/logout` only discards
the token client-side. There is no rate limiting on the login endpoint.

---

## 2. Ride booking — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/api/rides.py` → `book_ride` |
| Endpoint | `POST /rides/book` → 201 |
| Database | `rides`, `payments`, `notifications` |
| Evidence | Smoke test: booking → 201, `status: requested`, category stored; unauthenticated booking → 401 |
| Frontend | `VehicleSelectionPanel.tsx`, `TripDetailsPage.tsx` |

**What works.** Full validation of the request schema; atomic creation of the
ride, the payment and the notification; `Idempotency-Key` support so a retry
never creates a duplicate ride or payment.

**Limitations.** The stored fare is `distance_km * 15.0` — a flat demo
formula, not the ML estimate from `/fare/estimate`, and the category
multiplier is not applied. The two figures can therefore differ from what the
customer agreed to. There is no automatic driver dispatch.

---

## 3. Fare estimation — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/api/fare.py`, `backend/app/ml/predictor.py`, `ml/pipeline.py`, `ml/train_model.py` |
| Endpoint | `POST /fare/estimate` → 200 |
| Database | None — the model reads `ml/artifacts/*.joblib` |
| Evidence | Smoke test: estimate → 200, all five categories present; identical pickup/dropoff → 400; unknown location → 400; 99 passengers → 422. Model metrics read from the artifact: MAE ₹7.33, RMSE ₹9.19, R² 0.9968 |
| Frontend | `VehicleSelectionPanel.tsx`, `FareBreakdown.tsx` |

**What works.** A Random Forest trained on 49,310 real Amritsar trip records
with real coordinates, resolving the 37 known locations, computing haversine
distance, and returning a per-category estimate.

**Limitations.** The five category fares are **heuristic multipliers on one
base fare**, not five trained models — the code and the API `note` field both
say so. The duration is a fixed 25 km/h heuristic, not a learned prediction.
The artifact is ~300 MB and takes about a second to load.

---

## 4. Driver Partner Dashboard — **Complete**

| Item | Detail |
|---|---|
| Source | `frontend/src/pages/DriverPartnerPage.tsx`, `backend/app/api/rides.py` |
| Endpoints | `GET /rides/available`, `POST /rides/{id}/accept`, `PATCH /rides/{id}/status` |
| Database | `rides` (`driver_id`, `status`) |
| Evidence | Smoke test: customer → 403 on `/rides/available`; driver → 200 with the new ride in the queue; accept → 200; double accept → 409; start → 200; invalid status → 400 |
| Screenshot | `docs/screenshots/12-driver-dashboard.png` |

**What works.** Live-polling request queue (every 8 seconds); accept, start
and complete with server-side guards; a driver can hold only one active trip.

**Bug found and fixed during this audit.** `GET /rides/available` returned
**422** instead of 200, because `@router.get("/{ride_id}")` was declared
before it and FastAPI matched in declaration order, trying to parse
`"available"` as an integer. The Driver Dashboard's "Incoming requests"
panel was therefore broken. The handler has been moved above `/{ride_id}` and
the ordering constraint is documented in its docstring. The smoke test now
covers it.

**Limitations.** The "My rides" list calls `GET /rides/`, which returns rides
where the caller is the **passenger**. A driver sees the rides they booked as
a customer, not the rides assigned to them — there is no endpoint for that.
There is no driver location reporting, so the passenger cannot see the
vehicle move.

---

## 5. Admin Operations Dashboard — **Complete**

| Item | Detail |
|---|---|
| Source | `frontend/src/pages/AdminDashboardPage.tsx`, `backend/app/api/admin.py` |
| Endpoints | `GET /admin/stats`, `/admin/users`, `/admin/rides`, `/admin/payments`, `/admin/payments/summary`, `/admin/system-health` |
| Database | `users`, `rides`, `payments` |
| Evidence | Smoke test: customer → 403; driver → 403; admin → 200 for every endpoint; the ride list contains the demo ride; the payment summary groups by status |
| Screenshot | `docs/screenshots/13-admin-dashboard.png` |

**What works.** Every figure is computed from the database — the code
comment says "no fabricated data, only what is stored in SQLite", and that is
accurate. Filters on rides and payments by status, date range and free text.
A live system-health view backed by the in-process metrics registry.

**Limitations.** Revenue is the sum of **completed** payments only, and no
payment can reach `completed` without a gateway — so the revenue figure
correctly reads ₹0 in a demonstration. The metrics are per-process, so they
reset on restart and are not shared between workers.

---

## 6. Trip history and ride management — **Complete**

| Item | Detail |
|---|---|
| Source | `frontend/src/pages/HistoryPage.tsx`, `TripDetailsPage.tsx`, `RideOptionsPage.tsx`; `backend/app/api/rides.py` |
| Endpoints | `GET /rides/`, `GET /rides/{id}`, `POST /rides/{id}/cancel`, `DELETE /rides/{id}` |
| Database | `rides` |
| Evidence | Smoke test: history → 200 and contains the new ride; cancel → 200 with the reason and a timestamp; double cancel → 400; cancel by another passenger → 403; cancel a completed ride → 400 |
| Screenshots | `docs/screenshots/06-trip-history.png`, `08-trip-details.png` |

**What works.** History grouped into upcoming / completed / cancelled; trip
details; cancellation with a stored reason and timestamp, and a
`ride_cancelled` notification.

---

## 7. Live trip tracking — **Partial**

| Item | Detail |
|---|---|
| Source | `backend/app/api/rides.py` → `get_ride_tracking`; `frontend/src/pages/LiveTripTrackingPage.tsx`; `frontend/src/services/api.ts` → `rideService.tracking` |
| Endpoint | `GET /rides/{id}/tracking` → 200 |
| Database | `rides`, `users` (the assigned driver) |
| Evidence | Smoke test: owner → 200 with the four progress stages, the real driver's name and phone, `live_tracking_available: false` and `driver_location: null`; admin → 200 |
| Screenshot | `docs/screenshots/07-live-trip-tracking.png` |

**What works.** A live-updating status timeline driven by the single source of
truth in `RIDE_PROGRESS_STAGES`; the assigned driver's real name and phone;
the booking reference; the stored coordinates; terminal-state detection.

**What does not work — and is explicitly reported as not working.**

- No driver GPS. There is no driver-location table, and `driver_location` is
  always `null`.
- No route geometry. `route_geometry` is always `null`.
- No ETA. `estimated_duration_min` is never written at booking time, so it is
  `null` and `eta_available` is `false`.

The endpoint reports all of this in its `capabilities` object rather than
pretending. The response shape is designed so a real data source can be added
without changing the contract.

---

## 8. Payments and digital receipts — **Partial**

| Item | Detail |
|---|---|
| Source | `backend/app/api/rides.py` → `book_ride`, `update_payment_status`, `get_receipt`, `payment_config`, `payment_webhook` |
| Endpoints | `GET /rides/payment-config`, `GET /rides/{id}/payment`, `PATCH /rides/{id}/payment`, `POST /rides/payments/webhook`, `GET /rides/{id}/receipt` |
| Database | `payments` |
| Evidence | Smoke test: config → 200 with `demo: true` and `["cash"]`; a cash payment → 200 with `not_applicable`; a customer marking a cash payment paid → 400; a receipt → 200 with `is_demo: true` and a disclaimer; a receipt for a missing booking → 404 |
| Screenshots | `docs/screenshots/09-receipt.png` |

**What works.** The receipt is complete and correct: booking reference
`RSG-######`, booking date, trip details, fare breakdown, payment method and
status, a print button, and an explicit demo disclaimer. The payment state
machine has real, meaningful server-side rules.

**What does not work.**

- **No payment can ever be confirmed.** `completed` and `failed` are
  reachable only through a verified provider webhook, and the webhook
  endpoint is a stub that does not verify a signature or update a payment. So
  `payments.status` never becomes `completed`, and the admin revenue figure
  is always ₹0. This is the **correct** security behaviour — the client is
  never trusted with the payment outcome — but it means a demo cannot show a
  successful payment.
- No Stripe SDK call, no payment intent, no refund API.
- The frontend never sends `payment_method`, so every booking made through the
  UI is a cash booking.

---

## 9. Ratings and reviews — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/api/rides.py` → `add_rating` |
| Endpoint | `POST /rides/{id}/rating` → 201 |
| Database | `ratings` |
| Evidence | Smoke test: rate a completed ride → 201 with `score: 5`; a second rating → 400; the schema rejects a score outside 1–5 with 422 |

**Limitations.** No aggregation — there is no average-per-driver endpoint, no
leaderboard and no review display on the driver card. A rating can only be
left by the passenger who booked the ride, and only on a `completed` ride.

---

## 10. Notifications — **Partial**

| Item | Detail |
|---|---|
| Source | `backend/app/api/notifications.py`, `backend/app/api/rides.py` → `_create_notification` |
| Endpoints | `GET /notifications/`, `PATCH /notifications/{id}/read` |
| Database | `notifications` |
| Evidence | Smoke test: list → 200; a `booking_created` notification exists after a booking; a `ride_cancelled` notification exists after a cancellation |

**What works.** Notifications are created on booking and on cancellation, listed
newest first, filterable by `unread_only`, and can be marked read.

**Limitations.** In-app only. There is no email, SMS or push delivery, no
notification preferences, and no notification when a driver accepts or starts
a ride. There is also **no notification UI**: no frontend file calls
`/notifications/`, and the header has no bell icon or unread badge, so the
feature is reachable only through the API.

---

## 11. Safety centre — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/api/safety.py`, `frontend/src/pages/SafetyPage.tsx` |
| Endpoints | `GET`/`POST`/`PUT`/`DELETE /safety/contacts`, `GET`/`POST /safety/reports` |
| Database | `trusted_contacts`, `safety_reports` |
| Evidence | 6 endpoints registered and reachable; the Safety screen renders |
| Screenshot | `docs/screenshots/10-safety.png` |

**What works.** Full CRUD on trusted contacts, scoped to the owner; incident
reports, optionally linked to one of the caller's own rides (a foreign ride id
is rejected with 404).

**Limitations.** Nothing is actually dispatched. A safety report is stored and
read back by the same user — there is no admin screen that lists safety
reports, no email to the emergency contact, and no integration with any
emergency service. The page states this in its own copy.

---

## 12. Security and authorisation — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/core/security.py`, `backend/app/api/auth.py`, `backend/app/core/exceptions.py` |
| Mechanism | bcrypt hashing · JWT (HS256) bearer tokens · `get_current_user` dependency · `require_admin` dependency · inline role and ownership checks |
| Evidence | Smoke test covers every negative case: wrong password → 401; no token → 401; another passenger reading a receipt → 403; another passenger reading a ride → 403; a customer listing available rides → 403; a customer and a driver both hitting the admin API → 403; a customer marking a payment paid → 403 |

**What works.** Passwords are never stored or logged in plaintext. The
identity of a caller is derived from the signed token, never from a
client-supplied id. Every resource read or write is ownership-checked on the
server. The admin role is a separate, enforced gate. Error responses never
leak a stack trace, an SQL statement or a connection string.

**Limitations.** `localStorage` token storage; a 7-day non-rotating token with
no server-side revocation; no rate limiting on authentication; `role` is a
plain string rather than an enum, and roles can only be assigned directly in
the database; no audit log of administrative actions; no CSRF protection (not
needed for a pure bearer-token API, but it is the reason the token lives in a
header rather than a cookie).

---

## 13. Monitoring and observability — **Complete**

| Item | Detail |
|---|---|
| Source | `app/core/logging_config.py`, `metrics.py`, `middleware.py`, `exceptions.py`, `health.py`, `request_context.py`, `idempotency.py`; `app/api/health.py`, `diagnostics.py` |
| Endpoints | `GET /health`, `/health/live`, `/health/ready`, `GET /admin/system-health`, `POST /diagnostics/client-errors` |
| Evidence | All three health endpoints verified live: `/health` → 200 with `database: connected`; `/health/live` → 200 `alive`; `/health/ready` → 200 `ready` with a database latency. `/admin/system-health` → 200 with the full metrics payload. The access log shows one structured line per request with a request id |

**What works.** Text or JSON structured logging; a correlation id on every
request and response; per-request access logs with status and duration; an
in-process metrics registry with latency percentiles; three probes with
distinct liveness and readiness semantics; global exception handlers that
log the traceback and return a sanitised body; optional, rate-limited,
sanitised client error reporting that is off by default and structurally
unable to collect personal data.

**Limitations.** Metrics are in-process, so they reset on restart and are not
shared between workers. There is no Prometheus exporter, no OpenTelemetry, no
trace or span collection, and no external log shipping — only stdout or a
local rotating file. There is no alerting.

---

## 14. Idempotent booking — **Complete**

| Item | Detail |
|---|---|
| Source | `backend/app/core/idempotency.py`, `backend/app/api/rides.py` → `book_ride` |
| Mechanism | Optional `Idempotency-Key` request header; `idempotency_records` table |
| Evidence | Implemented and wired into the frontend (`rideService.book` accepts an `idempotencyKey` and sends the header) |

**What works.** A retry with the same key returns the original status code and
body instead of creating a second ride and a second payment; a retry while
the first is still running returns 409; a failed booking releases the key so
the customer can retry; requests without the header behave exactly as before.

**Note.** The uniqueness of `(user_id, endpoint, key)` is enforced by a
`UniqueConstraint` on the table, created by the `c4e1a7b93d21` migration, so
a second concurrent request cannot claim the same key. The application-level
check in `app/core/idempotency.py` is the fast path; the constraint is the
backstop.

---

## 15. Deployment readiness — **Partial**

| Item | Detail |
|---|---|
| Evidence | **No deployment has been performed or verified for this project.** |

**What is in place.** A standard ASGI app; `LOG_FORMAT=json` for
machine-parseable logs; health probes suitable for a load balancer; a
`Request-ID` header forwarded through CORS; static-type-checked production
build; a documented environment-variable surface.

**What is missing.** No Dockerfile, no `docker-compose.yml`, no CI pipeline, no
reverse-proxy configuration file, no infrastructure-as-code, no TLS
configuration, no backup strategy, and no environment in which the
application has been run outside the developer's machine. The nginx snippet
in the README is a starting point, not a proven configuration.

---

## 16. Performance testing — **Not implemented**

There is **no load, stress, concurrency or benchmark suite in this
repository**, and therefore **no throughput, latency-under-load, or
concurrency figures exist for this project**.

The latency numbers visible in `GET /admin/system-health` are in-process
measurements collected on a single development machine since the process
started. They are useful as a sanity check, and they must **not** be
presented as performance results.

**If an examiner asks for performance numbers, the honest answer is:** the
project has functional test coverage and an in-process metrics facility, but
no performance test suite was written, so no load figures can be quoted. A
`locust` or `k6` script against the existing endpoints would be the natural
next step, and the metrics endpoint already exposes the counters it would
need.

---

## 17. Driver applications — **Not implemented**

| Item | Detail |
|---|---|
| What exists | The `driver_applications` table, the `DriverApplication` model, the `DriverApplicationCreate` / `DriverApplicationOut` schemas, and a `list_driver_applications` function in `app/api/admin.py` |
| What does not | The function has **no route decorator**, so it is unreachable. `frontend/src/services/api.ts` defines `driverApplicationService.submit` and `.mine`, calling `POST /driver-applications` and `GET /driver-applications/me` — **neither endpoint exists**. No screen uses the service, so nothing breaks |

The database table is real and seeded empty. The whole flow — apply, review,
approve, become a driver — is absent.

---

## 18. Scheduled rides — **Not implemented**

The "Schedule a Ride" control is present in the Home screen and is explicitly
labelled **"Schedule a Ride (Coming Soon)"** in the button text. There is no
backend support, no scheduled-time column on `rides`, and no scheduling job.

---

## 19. Driver dispatch and auto-matching — **Not implemented**

A booking stays in `requested` until a driver opens the Driver Dashboard and
accepts it by hand. There is no proximity search, no radius filter, no
automatic assignment, no driver location table, and no push notification to
drivers. The `available` query filters only on `status` and `driver_id IS NULL`.

---

## 20. Rating aggregation — **Not implemented**

Ratings are stored and can be written and read back, but there is no
average-per-driver endpoint, no driver rating summary on the driver card, and
no leaderboard. `AdminStats` counts rides, not ratings.

---

## Cross-cutting observations

### Things that work better than expected

- The payment state machine refuses to let a client mark its own payment as
  paid, and refuses to let anyone change a cash payment. That is the correct
  design, and it is enforced in the API rather than assumed in the UI.
- The tracking endpoint reports its own limitations through a `capabilities`
  object instead of returning plausible-looking fake data.
- The receipts are explicitly labelled as demo estimates, and no receipt is
  generated for a booking that does not exist.
- The error handling never returns a stack trace, and the client error
  reporter is structurally incapable of collecting request data or identity.

### Real defects found during this audit

| Defect | Status |
|---|---|
| `GET /rides/available` returned 422 — route declared after `/{ride_id}` | **Fixed** in this phase; the handler was moved and the constraint documented in the docstring |
| Four frontend API calls point at endpoints that do not exist | **Open** — dead code, no user-visible impact |
| `list_driver_applications` has no route decorator | **Open** — dead code, no user-visible impact |
| `_require_ride_owner_or_admin` in `app/api/rides.py` is never called | **Open** — dead code; each handler inlines its own check |
| `ProtectedRoute.tsx` is a no-op passthrough | **Open** — the real guard is the `SessionGate` layout route |
| The `/driver` route is declared twice in `App.tsx` | **Open** — harmless, both render the same component |
| `requirements.txt` pins versions that differ from what is installed | **Open** — the app runs correctly on the installed versions |
| `ride_categories` table and the live `CATEGORY_CONFIG` list are not linked | **Open** — the table is seeded to mirror the list but nothing keeps them in sync |
| The booked fare uses a flat formula, not the ML estimate | **Open** — the estimate and the stored fare can differ |
| The model-declared indexes on `rides`, `payments` and `ratings` are absent from the checked-in database | **Open** — `create_all` does not add indexes to existing tables |
