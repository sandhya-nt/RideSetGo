# API Reference

**RideSetGo** — Amritsar ride-hailing platform with ML fare prediction.

Every endpoint in this document was read from the FastAPI application and
confirmed against the running server. The machine-readable source of truth is
the OpenAPI 3.1 document the application generates itself:

- **`docs/openapi.json`** — exported from the running app
- **`GET /openapi.json`** — live from the running server
- **`GET /docs`** — interactive Swagger UI, with *Try it out* enabled
- **`GET /redoc`** — reference-style rendering

**Totals: 36 paths, 41 operations, 10 tags.**

| Tag | Paths | Purpose |
|---|---|---|
| `auth` | 4 | Signup, login, logout, current user |
| `rides` | 14 | Booking, lifecycle, history, payments, receipts, ratings, tracking |
| `fare` | 1 | Fare estimation |
| `locations` | 1 | Known Amritsar locations |
| `categories` | 1 | Vehicle categories |
| `notifications` | 2 | In-app notifications |
| `safety` | 6 | Trusted contacts and incident reports |
| `admin` | 6 | Operations dashboard |
| `health` | 3 | Liveness, readiness, combined check |
| `diagnostics` | 1 | Optional client error reporting |

---

## Conventions

### Authentication

Authenticated endpoints use a bearer token:

```
Authorization: Bearer <access_token>
```

The token is a JWT signed with `SECRET_KEY` using `HS256`. It carries a `sub`
claim (the user id) and an `exp` claim (default lifetime 7 days).

`OAuth2PasswordBearer(tokenUrl="auth/login")` is used, so Swagger UI shows an
**Authorize** button at <http://127.0.0.1:8000/docs>.

### Status codes

| Code | Meaning in this API |
|---|---|
| `200` | Success |
| `201` | Resource created |
| `202` | Accepted for processing (client error report) |
| `204` | Deleted, no body |
| `400` | Business-rule violation (illegal state transition, ineligible cancellation) |
| `401` | Missing, invalid or expired token, or wrong credentials |
| `403` | Authenticated but not permitted (wrong role, or not the resource owner) |
| `404` | Resource does not exist |
| `409` | Conflict (ride already accepted, driver already busy, request in progress) |
| `422` | Request validation failed (FastAPI schema validation) |
| `429` | Rate limited |
| `503` | Service not ready (database unreachable) |

### Error body

FastAPI's default error shape is used:

```json
{ "detail": "Ride not found" }
```

Validation failures use FastAPI's `HTTPValidationError` shape with a `loc`,
`msg` and `type` for each rejected field. The global exception handlers
(`app/core/exceptions.py`) guarantee that an unhandled error never returns a
stack trace, an SQL statement or a connection string — the detail goes to the
log instead.

### The `X-Request-ID` header

Every response carries an `X-Request-ID`. The client may supply its own; the
server validates it and falls back to generating a UUID. The same id appears
in the server log for that request, so a user-visible id maps to exactly one
log line.

---

## 0. Service metadata — `/`

### `GET /` → `200`

Service identity. **Public.** This is the cheapest possible liveness check
that also confirms the version you are talking to.

**Response**

```json
{
  "app": "RideSetGo",
  "version": "0.1.0",
  "status": "running",
  "docs": "/docs"
}
```

**Errors** — none. The endpoint does not touch the database, so it keeps
answering during a database outage.

**Note.** For a real health check use `/health` or `/health/ready` instead —
they also verify the database. See [section 7](#7-health-and-monitoring).

---

## 1. Authentication — `/auth`

### `POST /auth/signup` → `201`

Create a customer account. **Public.**

**Request body** — `UserSignup`

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | Yes | Valid email format. Must not already exist |
| `full_name` | string | Yes | 2–255 characters |
| `phone` | string | No | Must not already be registered |
| `password` | string | Yes | 6–128 characters |

**Response** — `Token`

```json
{ "access_token": "eyJhbGciOiJIUzI1NiIs...", "token_type": "bearer" }
```

**Errors**

| Code | Cause |
|---|---|
| `400` | Email already registered, or phone already registered |
| `422` | Field validation failed |
| `500` | Account could not be created (generic message; the reason is logged, not returned) |

**Notes.** The role is always `customer` — the endpoint does not accept a role
field, and no public endpoint can create a `driver` or `admin`. The password
is hashed with bcrypt before it is stored; the plaintext is never written to
the database or the log.

---

### `POST /auth/login` → `200`

Exchange credentials for a token. **Public.**

**Request body** — `UserLogin`: `email` (string, required), `password`
(string, required)

**Response** — `Token`

**Errors**

| Code | Cause |
|---|---|
| `401` | Wrong email or password, or the account is deactivated |
| `422` | Field validation failed |

**Notes.** The error message is deliberately identical for "no such user" and
"wrong password", so the endpoint does not reveal which emails are registered.

---

### `POST /auth/logout` → `200`

**Public.** Returns `{"message": "Logged out. Discard your access token on the client."}`

There is no server-side session to invalidate — the endpoint is advisory. The
frontend discards the token from `localStorage`.

---

### `GET /auth/me` → `200`

Return the authenticated user's profile. **Requires authentication.**

**Response** — `UserOut`

```json
{
  "id": 36,
  "email": "passenger@ridesetgo.demo",
  "full_name": "Demo Passenger",
  "phone": "9800000001",
  "role": "customer",
  "is_active": true
}
```

**Errors** — `401` (missing, invalid or expired token), `404` (the token
references a user that no longer exists).

---

## 2. Fare, locations and categories

### `POST /fare/estimate` → `200`

Estimate the fare for a route. **Public.**

**Request body** — `FareRequest`

| Field | Type | Required | Rules |
|---|---|---|---|
| `pickup_location` | string | Yes | Must be a known location name |
| `dropoff_location` | string | Yes | Must be a known location name, and different from the pickup |
| `passenger_count` | integer | No | 1–6, default `1` |
| `hour` | integer | No | 0–23, default `12` |

**Response** — `FareEstimate`

```json
{
  "pickup_location": "Golden Temple",
  "dropoff_location": "Amritsar Airport (ATQ)",
  "distance_km": 9.35,
  "duration_min": 27,
  "base_fare_inr": 143.2,
  "category_multipliers": {
    "Bike": 100.24, "Auto": 114.56, "Mini": 128.88, "Sedan": 164.68, "SUV": 200.48
  },
  "currency": "INR",
  "note": "Estimated/demo pricing only. Not an official Uber, Ola, or Rapido quote. Category multipliers are heuristic and not per-category trained models."
}
```

`category_multipliers` maps each category name to its estimated fare. The key
is named "multipliers" but the value is the **fare in rupees**, not a ratio.

**Errors**

| Code | Cause |
|---|---|
| `400` | Pickup equals dropoff, unknown location, or the model could not encode the locations |
| `422` | Schema validation failed (for example `passenger_count: 99`) |
| `503` | The ML model is not loaded (artifacts missing) |

---

### `GET /locations/` → `200`

List the known Amritsar locations with real coordinates. **Public.**

**Response** — array of `{ name, lat, lng }`. 37 locations.

**Errors** — `503` if the ML model is not loaded.

---

### `GET /categories/` → `200`

List the vehicle categories. **Public.**

**Response** — array of `{ name, display_name, multiplier, icon, min_fare }`.

> This is served from the hard-coded `CATEGORY_CONFIG` list in
> `app/ml/predictor.py`, **not** from the `ride_categories` database table.

---

## 3. Rides — `/rides`

### `POST /rides/book` → `201`

Create a booking. **Requires authentication** (any role).

**Request body** — `RideRequest`

| Field | Type | Required | Rules |
|---|---|---|---|
| `pickup_location` | string | Yes | — |
| `dropoff_location` | string | Yes | — |
| `pickup_lat` | float | Yes | — |
| `pickup_lng` | float | Yes | — |
| `dropoff_lat` | float | Yes | — |
| `dropoff_lng` | float | Yes | — |
| `distance_km` | float | Yes | — |
| `category` | string | Yes | `Bike`, `Auto`, `Mini`, `Sedan` or `SUV` |
| `passenger_count` | integer | No | 1–6, default `1` |
| `hour` | integer | No | 0–23, default `null` |
| `payment_method` | string | No | `cash` or `online`, default `cash` |

**Response** — `RideOut`, with `status` set to `requested`.

**Errors**

| Code | Cause |
|---|---|
| `401` | No token |
| `409` | An identical request with the same `Idempotency-Key` is still being processed |
| `422` | Schema validation failed |

**Side effects.** One `rides` row, one `payments` row and one `notifications`
row are created. A cash booking gets a payment with status `not_applicable`;
an online booking gets a `mock_wallet` payment with status `pending` and a
transaction id of `MOCK-{ride_id}`.

**`Idempotency-Key` header (optional).** Send a key to make the request safe
to retry. A retry with the same key returns the original status code and body
instead of creating a second ride and a second payment. The key is scoped per
user and per endpoint. A failed booking releases the key so the customer can
retry. Requests without the header behave exactly as before.

**Fare.** The stored fare is `distance_km * 15.0`, a flat demo formula — **not**
the ML estimate from `/fare/estimate`. The two can differ.

---

### `GET /rides/` → `200`

The authenticated user's ride history, newest first. **Requires authentication.**

**Response** — array of `RideOut`.

Returns only rides where `user_id` is the caller. A driver sees the rides they
booked as a customer, **not** the rides assigned to them as a driver — there
is no separate endpoint for that.

---

### `GET /rides/{ride_id}` → `200`

One ride by id. **Requires authentication.**

**Access** — the ride owner, an admin, or a driver. Anyone else gets `403`.

**Errors** — `404` (no such ride), `403` (not permitted), `401` (no token).

---

### `GET /rides/available` → `200`

Rides waiting for a driver: `status == "requested"` and `driver_id IS NULL`,
newest first. **Requires authentication.**

**Access** — `driver` or `admin` role. A customer gets `403`
("Driver role required").

> **Route ordering note.** This handler must stay declared *above*
> `@router.get("/{ride_id}")`. FastAPI matches routes in declaration order, so
> a static sub-path declared after the `int`-typed `/{ride_id}` route is
> captured by it and rejected with `422`. This was a real bug in this
> repository and has been fixed; the ordering constraint is documented in the
> handler's docstring so it is not reintroduced.

---

### `POST /rides/{ride_id}/accept` → `200`

A driver accepts a ride. **Requires authentication.**

**Access** — `driver` or `admin` role. Others get `403`.

**Side effects** — `driver_id` is set to the caller and `status` becomes
`accepted`.

**Errors**

| Code | Cause |
|---|---|
| `403` | The caller is not a driver or admin |
| `404` | No such ride |
| `409` | The ride is no longer `requested`, or already has a driver, or the driver already holds a ride in `accepted`/`started` |

---

### `PATCH /rides/{ride_id}/status` → `200`

Change the ride status. **Requires authentication.**

**Request body** — `RideStatusUpdate`: `status` (string, required)

Allowed values: `requested`, `accepted`, `started`, `completed`, `cancelled`.

**Access** — the ride owner, an admin, or a driver.

**Errors** — `400` (unknown status), `403` (not permitted), `404` (no such ride).

**Note.** This endpoint performs no state-machine validation. It accepts any
of the five statuses from any permitted caller, so it can move a ride
backwards. The lifecycle rules are enforced in the dedicated endpoints
(`/accept`, `/cancel`); this one is the general-purpose setter.

---

### `POST /rides/{ride_id}/cancel` → `200`

Cancel a ride with an optional reason. **Requires authentication.**

**Request body** — `CancelRideRequest`: `reason` (string, optional)

**Response** — `CancelRideResponse`

```json
{
  "message": "Ride cancelled successfully",
  "ride_id": 42,
  "status": "cancelled",
  "cancellation_reason": "Change of plans",
  "cancelled_at": "2026-10-19T14:22:31.402118+00:00"
}
```

**Rules** — the caller must be the ride owner; only a `requested` or `accepted`
ride may be cancelled; a ride that is already cancelled cannot be cancelled
again. The reason and a timestamp are stored, and a `ride_cancelled`
notification is created for the customer.

**Errors** — `400` ("This ride has already been cancelled" / "Cannot cancel a
{status} ride"), `403` (not the owner), `404` (no such ride).

---

### `DELETE /rides/{ride_id}` → `200`

Cancel a ride without a reason. **Requires authentication.**

Backward-compatible alias for `POST /rides/{ride_id}/cancel`; the same
eligibility rules apply. The reason and timestamp are still recorded — the
reason is simply `null`.

---

### `GET /rides/{ride_id}/tracking` → `200`

Everything the tracking screen needs for one ride. **Requires authentication.**

**Access** — the passenger who booked it, the driver assigned to **that
specific ride**, or an admin. Any other passenger gets `403`, so a shared URL
cannot expose someone else's trip.

**Response** — `RideTrackingOut`

| Field | Type | Notes |
|---|---|---|
| `id` | int | Ride id |
| `status` | string | Current status |
| `status_label` | string | Human label, e.g. "Driver assigned" |
| `is_terminal` | bool | `true` for `completed` and `cancelled` |
| `stages` | array | The four happy-path stages with a key, label and description |
| `booking_reference` | string | `RSG-{id:06d}` |
| `pickup_location`, `dropoff_location` | string | — |
| `pickup_lat/lng`, `dropoff_lat/lng` | float | Real stored coordinates |
| `distance_km` | float | — |
| `estimated_duration_min` | int / null | The stored column — `null` in practice |
| `category`, `base_fare`, `final_fare`, `currency` | — | — |
| `passenger_count`, `created_at`, `updated_at` | — | — |
| `cancelled_at`, `cancellation_reason` | — | Null unless cancelled |
| `driver` | object / null | The assigned driver's real `name` and `phone` |
| `driver_location` | object / null | **Always `null`** |
| `route_geometry` | array / null | **Always `null`** |
| `capabilities` | object | See below |

`capabilities`:

```json
{
  "live_tracking_available": false,
  "driver_location_available": false,
  "route_geometry_available": false,
  "eta_available": false,
  "message": "Live driver tracking is not currently available for this ride. RideSetGo does not store or stream driver GPS positions, so no vehicle marker or ETA can be shown. Your trip status is kept up to date below."
}
```

**This endpoint is honest about its limits.** There is no driver GPS table
and no routing provider, so `driver_location` and `route_geometry` are `null`
and `live_tracking_available` is `false`. The response shape is designed so a
real data source can be added later without changing the contract.

---

### `GET /rides/{ride_id}/payment` → `200`

The payment record for a ride. **Requires authentication.**

**Access** — the ride owner, an admin, or a driver.

**Response** — `PaymentOut`

```json
{
  "id": 31, "ride_id": 42, "amount": 140.25, "currency": "INR",
  "method": "cash", "status": "not_applicable",
  "transaction_id": null, "created_at": "2026-10-19T14:20:02.118Z"
}
```

**Errors** — `404` (no such ride, or no payment record for it), `403`.

---

### `PATCH /rides/{ride_id}/payment` → `200`

Change a payment's status. **Requires authentication.**

**Request body** — `PaymentStatusUpdate`: `status` (string, required).
Schema-validated against `pending`, `completed`, `failed`, `refunded`,
`not_applicable`.

**Access** — the ride owner or an admin. A driver gets `403`.

**Rules**

| Transition | Who may do it | Result |
|---|---|---|
| Any terminal state → anything | — | `400` — "Payment is already {status} and cannot be changed" |
| `cash` → anything | — | `400` — cash is paid to the driver, not through the platform |
| `pending` → `completed` or `failed` | **Nobody** via this endpoint | `403` — only a verified provider webhook may set it |
| `pending` → `refunded` | Admin only | `403` for anyone else |
| `pending` → `pending` | Owner or admin | `200` |

**The `403` on `completed` is the important behaviour.** The frontend can
never mark its own payment as paid. Because no gateway is configured in this
project, no payment can ever reach `completed`, and the admin revenue figure
correctly reads ₹0.

---

### `GET /rides/payment-config` → `200`

The configured payment gateway state. **Public.**

**Response** — `PaymentConfig`

```json
{
  "gateway": "demo",
  "gateway_configured": false,
  "supported_methods": ["cash"],
  "demo": true
}
```

`online` is added to `supported_methods` only when `STRIPE_SECRET_KEY` is set
and `PAYMENT_GATEWAY` is not `demo`.

---

### `POST /rides/payments/webhook` → `200`

The provider webhook endpoint. **Public** (a provider cannot present a user
token).

**Response**

```json
{ "message": "No payment gateway configured — running in demo mode", "processed": false }
```

**It does not process anything.** With no gateway configured it reports demo
mode. With a gateway configured it still returns `processed: false` — the
signature verification and the payment update are **not implemented**. This
endpoint is a placeholder, not a working integration.

---

### `GET /rides/{ride_id}/receipt` → `200`

A printable receipt for a stored booking. **Requires authentication.**

**Access** — the ride owner, an admin, or a driver.

**Response** — `ReceiptOut`

```json
{
  "ride_id": 42,
  "booking_reference": "RSG-000042",
  "booking_date": "2026-10-19T14:20:02.118Z",
  "pickup_location": "Golden Temple",
  "dropoff_location": "Amritsar Airport (ATQ)",
  "ride_category": "Sedan",
  "fare_amount": 140.25,
  "currency": "INR",
  "payment_method": "cash",
  "payment_status": "not_applicable",
  "is_demo": true,
  "disclaimer": "This is a demo estimate, not an official receipt. No real payment was processed."
}
```

`is_demo` is `true` when the gateway is in demo mode, when there is no
payment record, or when the payment method is `mock_wallet`.

**Errors** — `404` (no such ride — a receipt is never generated for a booking
that does not exist), `403`.

---

### `POST /rides/{ride_id}/rating` → `201`

Rate a completed ride. **Requires authentication.**

**Request body** — `RatingCreate`: `score` (integer, 1–5, required),
`comment` (string, optional)

**Response** — `RatingOut`

**Rules** — the caller must be the ride owner; the ride must be `completed`;
one rating per ride.

**Errors** — `400` ("Can only rate completed rides" / "Rating already exists
for this ride"), `403` (not the owner), `404`.

---

## 4. Notifications — `/notifications`

### `GET /notifications/` → `200`

The authenticated user's notifications, newest first. **Requires authentication.**

**Query parameter** — `unread_only` (boolean, optional, default `false`)

**Response** — array of `NotificationOut` with `id`, `user_id`, `ride_id`,
`type`, `title`, `message`, `is_read`, `created_at`.

**Errors** — `401`.

### `PATCH /notifications/{notification_id}/read` → `200`

Mark one notification as read. **Requires authentication.**

**Access** — the owner only. Otherwise `403`.

**Response** — the updated `NotificationOut`. **Errors** — `404`, `403`, `401`.

---

## 5. Safety — `/safety`

### `GET /safety/contacts` → `200` — the caller's trusted contacts. **Auth required.**

### `POST /safety/contacts` → `201` — create a contact. **Auth required.**

**Request body** — `TrustedContactCreate`: `name` (2–255), `phone` (7–30),
`relationship` (optional, ≤50)

**Response** — `TrustedContactOut`. **Errors** — `422`, `401`.

### `PUT /safety/contacts/{contact_id}` → `200` — update a contact. **Auth required.**

**Request body** — `TrustedContactUpdate`; all fields optional, only the
supplied ones are written.

**Access** — the owner only. **Errors** — `404` (no such contact for this
user), `401`.

### `DELETE /safety/contacts/{contact_id}` → `204` — delete a contact. **Auth required.**

**Access** — the owner only. **Errors** — `404`, `401`.

### `GET /safety/reports` → `200` — the caller's incident reports. **Auth required.**

### `POST /safety/reports` → `201` — file an incident report. **Auth required.**

**Request body** — `SafetyReportCreate`: `ride_id` (int, optional),
`category` (3–50), `description` (5–2000)

If `ride_id` is supplied it must be a ride owned by the caller, otherwise
`404`.

**Response** — `SafetyReportOut` with `id`, `ride_id`, `category`,
`description`, `status`, `created_at`.

---

## 6. Admin — `/admin`

**Every endpoint in this group requires the `admin` role.** A customer or a
driver receives `403` with the detail "Admin access required".

### `GET /admin/stats` → `200`

Aggregate statistics, computed from the database only — no fabricated figures.

**Response** — `AdminStats`

```json
{
  "total_users": 41,
  "total_rides": 13,
  "total_revenue_inr": 0.0,
  "rides_by_status": { "requested": 5, "accepted": 2, "completed": 4, "cancelled": 2 },
  "rides_by_category": { "Sedan": 7, "Auto": 3, "Mini": 2, "SUV": 1 }
}
```

`total_revenue_inr` sums `payments.amount` where `status == "completed"`. Since
no payment can reach `completed` without a gateway, this is **₹0** in a
demonstration — which is the honest number.

---

### `GET /admin/rides` → `200`

Browse rides. **Query parameters (all optional):**

| Parameter | Type | Effect |
|---|---|---|
| `status` | string | Exact status match |
| `date_from` | date | `created_at >= date_from 00:00:00` |
| `date_to` | date | `created_at <= date_to 23:59:59` |
| `q` | string | A ride id, or a case-insensitive substring of the pickup or drop-off location |

**Response** — an array of objects with `id`, `user_id`, `driver_id`,
`pickup_location`, `dropoff_location`, `category`, `base_fare`, `final_fare`,
`status`, `created_at`, `cancelled_at`, `cancellation_reason`.

**Limit** — the most recent 200 matching rides.

**Errors** — `422` (an unparseable date), `403`, `401`.

---

### `GET /admin/payments` → `200`

Browse payment records. **Query parameters:** `status`, `date_from`,
`date_to`, `q` (matches `transaction_id` or `method`).

**Response** — an array of objects with `id`, `ride_id`, `booking_reference`,
`amount`, `currency`, `method`, `status`, `transaction_id`, `created_at`,
`pickup_location`, `dropoff_location`.

**Limit** — 200.

---

### `GET /admin/payments/summary` → `200`

**Response**

```json
{
  "counts": { "not_applicable": 4, "pending": 9 },
  "total_confirmed": 0.0
}
```

---

### `GET /admin/users` → `200`

**Response** — an array of `{ id, email, full_name, role, is_active }`.

---

### `GET /admin/system-health` → `200`

Live operational statistics for the running service. **Admin only.**

**Response**

```json
{
  "generated_at": "2026-10-19T14:40:12Z",
  "service":   { "app": "RideSetGo", "version": "0.1.0", "status": "ok",
                 "uptime_seconds": 670.7, "started_at": "2026-10-19T14:29:01Z" },
  "database":  { "ready": true, "latency_ms": 229.15,
                 "failures_total": 0, "last_failure_at": null },
  "requests":  { "total": 59, "by_status_class": { "2xx": 40, "4xx": 19 },
                 "by_method": { "GET": 33, "POST": 22, "PATCH": 4 },
                 "error_rate_4xx_percent": 32.2, "error_rate_5xx_percent": 0.0 },
  "latency_ms":{ "count": 59, "min": 1.69, "max": 13484.15, "avg": 444.03,
                 "p50": 19.63, "p95": 906.76, "p99": 3002.42 },
  "health_checks": { "total": 2, "ok": 2, "failed": 0, "last": { "status": "ok" } },
  "errors":    { "unhandled_exceptions": 0,
                 "external_failures": { "ml_model": 2 },
                 "client_errors_reported": 0 },
  "top_routes": [ { "route": "/auth/login 2xx", "count": 4 } ]
}
```

**Important.** These are **in-process** measurements from a single development
machine, collected since the process started. They are not a benchmark and
must not be presented as one. The `max` latency is dominated by the first
call that loads the 300 MB ML artifact into memory.

---

## 7. Health and monitoring

### `GET /health` → `200` / `503`

Combined liveness and database readiness.

```json
{
  "app": "RideSetGo", "version": "0.1.0", "status": "ok",
  "database": "connected", "uptime_seconds": 666.3,
  "time": "2026-10-19T14:40:07+00:00"
}
```

Returns **503** with `"status": "degraded"` and `"database": "disconnected"`
when the database is unreachable.

### `GET /health/live` → `200`

Pure liveness — the process is answering. It never touches the database, so
it stays green during a database outage. This is the correct probe for a
restart policy.

```json
{ "status": "alive", "app": "RideSetGo", "version": "0.1.0", "time": "..." }
```

### `GET /health/ready` → `200` / `503`

Readiness — the process is running **and** the database is reachable.

```json
{
  "status": "ready",
  "checks": { "database": { "status": "ok", "latency_ms": 229.15 } },
  "uptime_seconds": 667.9,
  "time": "2026-10-19T14:40:09+00:00"
}
```

Returns **503** with `"status": "not_ready"` when the database is down. The
probe result is cached for `HEALTH_CHECK_CACHE_SECONDS` (default 5) so
frequent polling does not turn into a stream of queries.

### `POST /diagnostics/client-errors` → `202`

Optional browser error reporting. **Public** in the sense that the React error
boundary cannot present a user token — but the endpoint **returns 404 unless
`ENABLE_CLIENT_ERROR_REPORTING=true`**, so by default it does not exist.

**Request body** — `ClientErrorReport`

| Field | Type | Rules |
|---|---|---|
| `component` | string | ≤120 characters, default `"unknown"` |
| `message` | string | ≤500 characters |
| `stack` | string | ≤4000 characters, optional |
| `route` | string | ≤200 characters, optional |
| `request_id` | string | ≤64 characters, optional |
| `app_version` | string | ≤40 characters, optional |
| `kind` | string | ≤40 characters, optional |

**There is deliberately no field for a request body, a response body, a
cookie, a token or a user identity**, so those cannot be collected even
accidentally.

**Response** — `{"accepted": true}` with **202**.

**Errors** — `404` (reporting is disabled), `429` (rate limited — 30 reports
per minute per client address), `422`.

**Safeguards.** Every client-supplied string is passed through a sanitiser
that strips newlines and control characters, so a crafted message cannot forge
extra log lines.

---

## 8. Endpoints the frontend calls that do not exist

`frontend/src/services/api.ts` defines four calls with no matching backend
route. **No page uses any of them**, so nothing in the running application
breaks — they are dead code awaiting either implementation or removal.

| Frontend call | Backend status |
|---|---|
| `POST /driver-applications` | **Does not exist.** The `driver_applications` table and model exist, but no route serves them |
| `GET /driver-applications/me` | **Does not exist** |
| `GET /admin/categories` | **Does not exist** |
| `GET /admin/drivers/applications` | **Does not exist.** `list_driver_applications` is defined in `app/api/admin.py` but has no route decorator, so it is unreachable |

---

## 9. Errors the API deliberately returns

| Scenario | Response | Why it matters |
|---|---|---|
| A customer tries to mark their own online payment as paid | `403` | The payment outcome must come from a verified provider, never the client |
| A customer tries to mark a cash payment as paid | `400` | Cash is paid to the driver, not through the platform |
| Another passenger reads your receipt | `403` | Ownership is enforced server-side, not just hidden in the UI |
| A customer lists available rides | `403` | The driver queue is role-gated |
| A driver or customer calls an admin endpoint | `403` | Admin is a separate role |
| A ride is cancelled twice | `400` | The second attempt is rejected with a clear message |
| A completed ride is cancelled | `400` | The lifecycle is enforced server-side |
| The same ride is accepted twice | `409` | Race-condition guard on the accept path |
| A driver already has an active trip | `409` | One active trip per driver |
| An unknown location is used for an estimate | `400` | Locations must come from the real dataset |
| Pickup equals dropoff | `400` | Rejected by the prediction pipeline |
| `passenger_count` is 99 | `422` | Schema validation, before any business logic |
| A rating is posted for an incomplete ride | `400` | Only completed rides may be rated |
| The database is down | `503` from `/health` and `/health/ready` | The load balancer stops sending traffic |
