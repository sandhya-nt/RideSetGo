# RideSetGo — Monitoring, Error Logging & Operational Alerts

Phase 19 reference for the RideSetGo backend and frontend.
Last updated: 2026-10-19.

---

## 1. Current deployment status

**RideSetGo is not deployed.** This is a verified fact, not an assumption:

| Item | State |
| --- | --- |
| Hosting configuration (Dockerfile, `render.yaml`, `vercel.json`, `netlify.toml`, `fly.toml`, `Procfile`, …) | **absent** — none exists in the repository |
| CI/CD workflow (`.github/workflows`, GitLab CI, …) | **absent** — the project is not even a git repository |
| Provider-managed secrets / environment | **absent** — there is no `.env` file, only `backend/.env.example` |
| Public frontend URL | **none** |
| Public backend URL | **none** |
| External error-reporting service (Sentry, Datadog, Rollbar, …) | **not configured** — no SDK, no DSN, no dependency |

Everything in this document was therefore implemented and **verified locally**
against the real backend (FastAPI on `127.0.0.1:8000` and the Vite dev
server). Sections marked *Production requirement* describe what still has to
be done once a host is chosen; those steps are **not** claimed to be done.

---

## 2. Logging

### 2.1 What is configured

Logging is set up once, at import time of `app.main`, by
`app/core/logging_config.py`. It uses only the Python standard library — no
new dependency was added.

* One root logger configuration for the whole process (`configure_logging()`).
* Two output formats, selected with `LOG_FORMAT`:
  * `text` — human readable, `key=value` structured fields appended.
  * `json` — **one JSON object per line**; this is the recommended production
    mode because any log aggregator can parse it without extra tooling.
* Optional rotating file output (`LOG_FILE`, `LOG_MAX_BYTES`,
  `LOG_BACKUP_COUNT`) — useful when the process does not run in a container.
* `uvicorn.access` is silenced so the access log is not duplicated;
  `uvicorn.error` is re-routed through the same handlers.
* `sqlalchemy.engine`, `sqlalchemy.pool`, `httpx` and `httpcore` are pinned
  to `WARNING` — SQL statements and outbound URLs are not useful operational
  data and can contain bound parameter values.

### 2.2 What is logged

| Event | Level | Logger |
| --- | --- | --- |
| Service start / stop | `INFO` | `ridesetgo.startup` |
| Every HTTP request (method, route template, status, duration) | `INFO` (`WARNING` for 4xx, `ERROR` for 5xx) | `ridesetgo.access` |
| Unexpected application exception (with traceback) | `ERROR` | `ridesetgo.errors` / `ridesetgo.access` |
| Database connectivity failure | `ERROR` | `ridesetgo.health` / `ridesetgo.errors` |
| External dependency failure (ML model, payment gateway) | `ERROR` | `ridesetgo.fare` / `ridesetgo.rides` |
| Client-side (browser) error report | `WARNING` | `ridesetgo.client_errors` |
| Replayed booking (idempotency hit) | `INFO` | `ridesetgo.rides` |
| Readiness probe failure | `WARNING` | `ridesetgo.health` |

The **route template** is logged (`/rides/{ride_id}`), never the raw URL with
its query string, so no user identifier ends up in the log.

### 2.3 What is never logged

* Passwords, password hashes, tokens, API keys, `Authorization` headers,
  cookies, session ids, card numbers, CVVs, UPI ids, Stripe keys.
* Request or response bodies.
* The database connection string, SQL statements or driver messages.
* Stack traces in any HTTP response body.

Redaction is applied in two layers (`app/core/logging_config.py`):

1. **Key based** — any structured field whose name looks like a secret
   (`password`, `token`, `authorization`, `cookie`, `api_key`, `secret`,
   `card_number`, `database_url`, …) is replaced with `***REDACTED***`.
2. **Pattern based** — the formatted message and its arguments are scanned
   for `Bearer <token>`, `password=…` / `"password": "…"` style pairs,
   `sk_live_…` style keys and bare JWTs, and those are masked as well.

The same masking is applied to the traceback text, so a secret that appears
inside an exception message is masked in the log too.

### 2.4 Request correlation id

Every request gets an id that is echoed back in the `X-Request-ID` response
header and included in every log record emitted while handling it.

* The client may supply `X-Request-ID`. The value is matched against a strict
  allowlist (`[A-Za-z0-9._-]{1,64}`). Anything else — including a value with
  `CR`/`LF` — is **discarded** and a fresh id is generated. This makes log
  injection through the header impossible and keeps the value safe to echo
  in a response header.
* The frontend sends its own id on every request (`frontend/src/services/api.ts`),
  so a user-visible error can be matched to a single backend log line.
* Error responses include `request_id` in the body, and the UI shows it as a
  "Reference for support".

---

## 3. Health checks

All three endpoints are public (a platform health check must be able to reach
them) and none of them expose credentials, connection strings, database
names, host names, query results or stack traces.

| Endpoint | Purpose | Success | Failure |
| --- | --- | --- | --- |
| `GET /health` | Combined: liveness **and** database readiness | `200` | `503` when the database is down |
| `GET /health/live` | Pure liveness — the process is answering | `200` | — (never fails because of the database) |
| `GET /health/ready` | Readiness — the database is reachable | `200` | `503` when the database is down |

`GET /health` keeps the field names the project already used (`app`,
`version`, `status`, `database`) and adds `uptime_seconds` and `time`.

Example responses:

```json
// GET /health/live
{ "status": "alive", "app": "RideSetGo", "version": "0.1.0", "time": "2026-10-19T14:20:44+00:00" }

// GET /health/ready
{ "status": "ready",
  "checks": { "database": { "status": "ok", "latency_ms": 1.21 } },
  "uptime_seconds": 5.2, "time": "2026-10-19T14:20:44+00:00" }
```

**Cost control.** The readiness probe runs a single `SELECT 1` and the result
is cached for `HEALTH_CHECK_CACHE_SECONDS` (default 5 s). A platform polling
every few seconds therefore causes at most one database round trip per cache
window, not one per request. There are no external API calls in the health
path at all.

**Liveness vs. readiness.** Point a *restart* policy at `/health/live` (a
liveness failure should mean "restart me") and a *traffic* policy at
`/health/ready` (a readiness failure should mean "stop sending me traffic").
Pointing a restart policy at `/health` would restart a perfectly healthy
process whenever the database has a hiccup.

---

## 4. Metrics

Metrics are collected **in-process** by `app/core/metrics.py`. There is no
new dependency (no Prometheus client, no statsd, no agent) and no background
thread — the counters are updated inline while a request is being handled.

### 4.1 Definitions

| Metric | Definition |
| --- | --- |
| `requests.total` | Every HTTP request handled by this process, including health checks and CORS pre-flight requests. |
| `requests.by_status_class` | Request count per status class (`2xx`, `3xx`, `4xx`, `5xx`). |
| `requests.error_rate_5xx_percent` | `5xx / total × 100`. `0.0` when there has been no traffic. |
| `requests.error_rate_4xx_percent` | `4xx / total × 100`. |
| `latency_ms.p50 / p95 / p99` | Nearest-rank percentiles over a **rolling window of the most recent 1000 request durations** — not over all time. `window_size` in the payload reports how many samples the percentiles are based on. |
| `latency_ms.avg / min / max` | Lifetime values. |
| `database.failures_total` | Number of failed database connectivity checks. |
| `health_checks` | Count of readiness probes, split into ok / failed, plus the last result and its timestamp. |
| `errors.unhandled_exceptions` | Unexpected application exceptions. |
| `errors.external_failures` | Failures of internal/external dependencies, keyed by name (`ml_model`, `payment_gateway`). |
| `errors.client_errors_reported` | Browser error reports received (only when client error reporting is enabled). |
| `top_routes` | Request counts per route template and status class (top 100). |

### 4.2 Privacy

The registry stores **no personal data**: only route templates, status
classes, methods and timings. No user id, email, phone number, pickup or
destination is ever recorded.

### 4.3 Where to read the metrics

`GET /admin/system-health` — **admin role required** (returns `403`
otherwise). It returns the live snapshot plus the current database readiness.
It is intentionally *not* a public endpoint.

There is deliberately **no** public `/metrics` endpoint: it would expose
internal operational data to anyone on the internet.

---

## 5. Admin operations visibility

The admin dashboard (`/admin` in the app) now shows a **System Health**
section sourced from `GET /admin/system-health`:

* API availability — service status, version, uptime, requests handled,
  4xx / 5xx error rates.
* Database readiness — ready / unavailable, probe latency, connection failure
  count.
* API latency — p50, p95, p99, max.
* Last successful health check and the ok / failed split.
* Recent error counts — unhandled exceptions, client error reports, external
  dependency failures.

Every value is a **real measurement** taken by the running backend. Nothing
is estimated or seeded with placeholder numbers, and the dashboard does not
depend on any external monitoring service: if the service is not configured,
the section simply is not there.

The section is restricted to the admin role by the existing `require_admin`
dependency. It never exposes stack traces, connection strings, log lines or
user data.

---

## 6. Environment variables

### 6.1 Backend (`backend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` / `CRITICAL` |
| `LOG_FORMAT` | `text` | `text` or `json` (one JSON object per line) |
| `LOG_FILE` | *(unset)* | Optional rotating log file; unset = stdout only |
| `LOG_MAX_BYTES` | `5000000` | Rotation threshold |
| `LOG_BACKUP_COUNT` | `5` | Number of rotated files kept |
| `LOG_CLIENT_IP` | `false` | Log the masked client IP (an IP is personal data) |
| `REQUEST_ID_HEADER` | `X-Request-ID` | Correlation header name |
| `HEALTH_CHECK_CACHE_SECONDS` | `5` | Readiness probe cache window |
| `ENABLE_METRICS` | `true` | Collect the in-process metrics |
| `ENABLE_CLIENT_ERROR_REPORTING` | `false` | Accept browser error reports |

All of these are non-sensitive. **No secret value belongs in `.env.example`
or `.env` for the monitoring subsystem** — there is nothing to store.

### 6.2 Frontend (`frontend/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE` | `/api` | Backend base URL. Use the absolute URL when the frontend and backend are on different domains. |
| `VITE_CLIENT_ERROR_REPORTING` | `false` | Send browser errors to the backend |
| `VITE_APP_VERSION` | `0.1.0` | Version reported with browser error reports |

Everything prefixed `VITE_` is compiled into the shipped JavaScript, so no
secret may ever be placed in it.

---

## 7. Error reporting

### 7.1 What exists today

There is **no external error-reporting service** configured for this project
(no Sentry, no Datadog, no Rollbar, no Bugsnag), and none was added:

* adding a hosted error-reporting SDK would introduce an external account, an
  outbound data flow and a recurring cost, and
* the brief explicitly says not to claim an external integration works
  without verifying it.

What *is* implemented and verified:

1. **Local logging** works with no external credentials at all.
2. **A self-hosted client-error channel** (`POST /diagnostics/client-errors`)
   lets browser render errors and unhandled promise rejections reach the same
   structured log as the backend errors. It is **disabled by default** and
   answers `404` while disabled.

### 7.2 Enabling client error reporting

Both sides must be switched on:

```bash
# backend/.env
ENABLE_CLIENT_ERROR_REPORTING=true
```

```bash
# frontend/.env (baked in at build time)
VITE_CLIENT_ERROR_REPORTING=true
```

What the endpoint accepts (`app/api/diagnostics.py`):

| Field | Purpose |
| --- | --- |
| `component` | Which screen failed |
| `message` | Short error message (≤ 500 chars) |
| `stack` | Truncated stack (≤ 4000 chars) |
| `route` | Current path (never the query string) |
| `request_id` | Backend request id, if any |
| `app_version`, `kind` | Bookkeeping |

What it **cannot** accept: there is no field for a request body, a response
body, a cookie, a token or a user identity — so none of those can be
collected even by mistake. Every client-supplied string is flattened to a
single line before it is written to the log, so a crafted message cannot
forge extra log lines. The endpoint is rate limited to 30 reports per minute
per client address.

### 7.3 If an external service is added later

* Put the DSN / API key in the **backend** environment (or the provider's own
  secret store). **Never** in `VITE_*` — those end up in the browser bundle.
* Keep request-data collection disabled (`sendDefaultPii: false` /
  `attachStacktrace` handled deliberately).
* Document the cost and the data-processing location before enabling it.

---

## 8. Operational alerts

### 8.1 Alerts that are ready to use today

These are the alert rules that the implemented signals support. **None of them
are wired to a real notification channel in this project**, because no
hosting provider, webhook, email provider or paid monitoring plan has been
connected — see §8.2.

| Alert | Source | Suggested threshold | Why not noisier |
| --- | --- | --- | --- |
| Backend unreachable | `GET /health/live` | 3 consecutive failures (≈ 1 min) | One failure can be a deploy restart |
| Database unavailable | `GET /health/ready` → `503` | 2 consecutive failures | The probe is cached, so a flapping database cannot spam |
| Sustained 5xx | `requests.error_rate_5xx_percent` | > 5 % over 15 min **and** ≥ 20 requests | A single 500 during a deploy is normal |
| Latency regression | `latency_ms.p95` | p95 above 3× the 7-day baseline for 10 min | Percentiles ignore a single slow request |
| Crash / restart | Process manager or platform restart counter | any restart outside a deploy | Only real crashes, not 4xx noise |
| Health-check failures | `health_checks.failed` counter | ≥ 3 in 5 min | Uses the cumulative counter, not a per-request alarm |

Individual 4xx responses are deliberately **not** alerted on: a user typing
a wrong password or a stale page is normal traffic.

### 8.2 Wiring the alerts to a real channel

This requires an account that this project does not have. Pick one and
follow its own documentation — the steps are identical in all cases:

1. **Platform-native (cheapest, recommended first).** Most hosts offer
   uptime checks on a URL and restart alerts on the process. Point the uptime
   check at `/health/ready` and the restart policy at `/health/live`. The
   provider sends the notification to the account's own email/SMS — no extra
   service, usually no extra cost.
2. **Log-based alerting.** If the host ships logs to a managed log store
   (e.g. CloudWatch, Log Analytics, Papertrail), create an alert rule on the
   JSON log fields. With `LOG_FORMAT=json` each record has stable field
   names (`level`, `message`, `status_code`, `duration_ms`, `request_id`),
   so a query such as *"level = ERROR over 15 minutes"* works directly.
3. **Webhook.** If you have a monitoring service that accepts webhooks, point
   it at the health endpoints. **Do not send test alerts to real recipients
   without authorisation** — verify the rule against a staging endpoint first.

*Production requirement* — before any of these can be turned on, the project
must first be deployed (see §11). Until then there is no public URL for a
monitoring service to poll.

---

## 9. Log retention and privacy

**What is retained.** Access logs (route, status, duration, request id) and
error logs (exception type, traceback, request id). The traceback can contain
file paths and function names of the application — internal implementation
detail, but no user data.

**What is not retained anywhere.** Request bodies, response bodies, tokens,
passwords, cookies, payment details, the database connection string, and the
personal data of users (no email, phone, pickup or destination is logged).

**Client IP addresses** are *not* logged by default (`LOG_CLIENT_IP=false`).
If they are switched on, only the first three octets are stored
(`203.0.113.0`), which keeps the record useful for abuse tracing while
reducing its identifiability. An IP address is personal data under GDPR and
the IT Act, so this is a decision to make deliberately.

**Retention.** The application itself does not manage retention — the hosting
platform or log aggregator does. Recommended starting points:

| Environment | Retention | Rationale |
| --- | --- | --- |
| Local development | 7 days | Enough to debug a session |
| Staging | 14 days | |
| Production | 30 days for access logs, 90 days for error logs | Enough to investigate an incident, short enough to limit exposure |

If `LOG_FILE` is used instead of stdout, the application rotates at
`LOG_MAX_BYTES` and keeps `LOG_BACKUP_COUNT` files, so the on-disk footprint
is bounded at roughly `LOG_MAX_BYTES × (LOG_BACKUP_COUNT + 1)`. On a
container host, prefer stdout and let the platform handle retention and
shipping.

**Access control.** Operational data (the log stream and
`/admin/system-health`) is restricted to the admin role. There is no public
endpoint that exposes metrics, and no endpoint that exposes log content.

---

## 10. Troubleshooting common failures

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `/health/ready` returns `503` | The database is unreachable | Check the `database_unavailable` log record. It contains the driver error but no connection string. Confirm `DATABASE_URL` and that the database file / host is reachable. |
| `/health/live` also fails | The process itself is down | Check the process manager (systemd, Docker, the platform). The app cannot answer if it is not running. |
| `GET /admin/system-health` returns `403` | The signed-in user is not an admin | `require_admin` checks `role == "admin"`. |
| A user sees "Your session has expired" | The JWT expired or was invalidated | The frontend clears the session on a `401` and returns the user to the login page. The `http_exception` log record has the matching request id. |
| A user sees "Network error" | The request never reached the backend | The frontend shows a retry. A booking retry reuses the same idempotency key, so it cannot create a duplicate booking. |
| A booking appears twice in the history | Two bookings were made with different idempotency keys | This happens when the pickup, destination or vehicle changed between attempts (each is a genuinely new booking). Each attempt is logged as `route=/rides/book`. |
| `POST /diagnostics/client-errors` returns `404` | Client error reporting is disabled | Enable `ENABLE_CLIENT_ERROR_REPORTING=true` in the backend **and** `VITE_CLIENT_ERROR_REPORTING=true` in the frontend build. |
| Logs are not JSON | `LOG_FORMAT` is not `json` | Set `LOG_FORMAT=json` and restart. |
| The log shows `request_id=""` | The record was emitted outside a request (e.g. at start-up) | Expected — start-up and shutdown records have no request context. |

---

## 11. Local testing instructions

### 11.1 Backend

```bash
cd backend

# Full test suite (uses a temporary database — the dev database is untouched)
..\.venv\Scripts\python.exe -m pytest tests -q

# Only the monitoring tests
..\.venv\Scripts\python.exe -m pytest tests/test_monitoring.py -q

# Run the API locally
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Useful checks while it is running:

```bash
curl -i http://127.0.0.1:8000/health          # 200 + database status
curl -i http://127.0.0.1:8000/health/live     # 200 always while the process runs
curl -i http://127.0.0.1:8000/health/ready    # 200, or 503 when the DB is down
curl -i -H "X-Request-ID: my-trace-1" http://127.0.0.1:8000/health/live
```

To see JSON logs, run with `LOG_FORMAT=json LOG_LEVEL=DEBUG`.

### 11.2 Frontend

```bash
cd frontend
npm run build             # type-check + production build
npm run verify:resilience # frontend error-handling checks (24 assertions)
npm run dev               # dev server on :5173, proxies /api to :8000
```

`npm run verify:resilience` bundles `scripts/verify_error_handling.tsx` with
the already-installed `esbuild` and runs it with Node. It verifies that the
error boundary renders its fallback UI, that the API error normaliser maps
401 / 403 / 5xx / network / 422 correctly, that a stack trace in a response
body is never surfaced, and that request and idempotency ids are unique and
header-safe. **No new dependency and no test framework was added for this** —
the project has no JavaScript test runner, and adding one was not justified
by this phase.

The dev proxy in `vite.config.ts` forwards `/api` to the backend, so the
frontend works unchanged in development.

### 11.3 Verifying the duplicate-submission protection

```bash
# Two identical bookings with the same idempotency key return the same ride.
curl -X POST http://127.0.0.1:8000/rides/book \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-key-1" \
  -d '{"pickup_location":"Golden Temple", ... }'
```

The second call returns the *same* ride id and the ride history still shows a
single ride. This is covered by
`backend/tests/test_monitoring.py::test_booking_retry_with_same_idempotency_key_does_not_duplicate`.

---

## 12. Production requirements (not yet done)

Because the project has not been deployed, the following still have to be
done by whoever deploys it. None of them can be completed from inside this
repository alone.

1. **Choose and configure a host** for the FastAPI backend and for the
   Vite static frontend. Nothing in the repository configures a host today.
2. **Set the environment variables** from §6.1 and §6.2 in the host's secret
   store (never in the repository). In particular set a real `SECRET_KEY`,
   the production `ALLOWED_ORIGINS` and `DATABASE_URL`.
3. **Use `LOG_FORMAT=json`** so the platform's log store can index the
   records, and configure retention on the platform.
4. **Configure the database** — the current setup is SQLite with
   `Base.metadata.create_all` at start-up. Apply the Alembic migrations
   (`alembic upgrade head`, including the new `c4e1a7b93d21` migration that
   creates `idempotency_records`) instead of relying on `create_all` for a
   managed database.
5. **Point the platform's uptime check at `/health/ready`** and its restart
   policy at `/health/live`.
6. **Decide whether to enable client error reporting** (both flags, §7.2).
7. **Consider an external error-reporting service** only if the team wants
   browser-side error grouping and alerting beyond the local log; document
   the cost and the data-processing location first.
8. **Point `VITE_API_BASE`** at the deployed backend if the two are on
   different domains, and rebuild the frontend.

---

## 13. Known limitations

* **Metrics are per-process and in-memory.** They reset when the backend
  restarts and are not aggregated across instances. If the backend is ever
  scaled to more than one instance, the dashboard shows only the instance
  that served the request. A shared metrics store would be the fix, and it
  is deliberately out of scope for a single-instance deployment.
* **No log shipping is configured.** Logs go to stdout (or a local rotating
  file). Centralised collection requires a platform that ships stdout, which
  depends on the hosting choice.
* **No alert notifications are wired up**, because there is no account,
  webhook or paid plan connected. §8.1 defines the rules; §8.2 describes
  the setup.
* **The error-rate and latency thresholds in §8.1 are starting points, not
  measured baselines.** They should be tuned once real production traffic
  exists.
* **Client error reporting is off by default**, so browser errors are only
  visible in the browser console until it is explicitly enabled.
* **Readiness reflects the database only.** There is no external provider in
  production to probe — the ML model runs in-process and the payment gateway
  is in demo mode.
* **The `top_routes` breakdown is limited to 100 entries** and is a rolling
  view of the process lifetime.
