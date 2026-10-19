# Demonstration Guide

**RideSetGo** — repeatable walkthrough for the final evaluation.

This guide is written so that a second person can run the demonstration
without the original author in the room, and so that the result is the same
every time.

**Everything below was executed against the running application while writing
this document.** The `scripts/smoke_test.py` output quoted in Step 0 is real.

---

## Principles for the demonstration

1. **Use the seeded demo accounts only.** Never a real passenger's details,
   never a real phone number, never a real payment.
2. **Never claim something works that the application labels as unavailable.**
   The application is deliberately honest — for example, the tracking screen
   says in plain text that live GPS is not available. Point at that text. It
   is a strength, not a weakness.
3. **Show the negative cases.** The examiner is more impressed by a working
   403 than by a list of features. The access-control demonstration in
   Step 7 is the part most students skip.
4. **Use a fresh browser window** before each run so no stale session is left
   over.

---

## Step 0 — Pre-flight (5 minutes, before you are called in)

### 0.1 Start the backend

```bash
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Expected startup lines:

```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Started server process
```

In another terminal, confirm it is alive:

```bash
curl http://127.0.0.1:8000/health
```

Expected:

```json
{"app":"RideSetGo","version":"0.1.0","status":"ok","database":"connected","uptime_seconds":12.3,"time":"..."}
```

### 0.2 Seed the demo accounts

```bash
# from the repository root
.venv\Scripts\python.exe scripts\seed_demo_accounts.py
```

Expected:

```
Database: sqlite:///./ridesetgo.db

  existing customer passenger@ridesetgo.demo (id=36) role verified
  existing driver   driver@ridesetgo.demo   (id=37) role verified
  existing admin    admin@ridesetgo.demo    (id=38) role verified
  ride_categories rows inserted: 0

Summary: 41 users, 13 rides in the database.
```

### 0.3 Start the frontend

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the
backend, so no CORS configuration is needed.

### 0.4 Run the automated check (optional but recommended)

```bash
.venv\Scripts\python.exe scripts\smoke_test.py
```

This runs 83 assertions against the live server and prints `PASS`/`FAIL` for
each. **The last verified run was 83 passed, 0 failed.**

If you show this output at the start of the demonstration, it proves the
system works end to end before you click anything. It also creates a few
extra ride records, which is harmless.

### 0.5 Open the API documentation

<http://127.0.0.1:8000/docs> — the interactive Swagger UI. Keep this in a
second browser tab. It is the fastest way to answer a question like *"show me
the endpoint for that"*.

---

## Step 1 — Landing page (1 minute)

**Show:** <http://localhost:5173/>

**Say:**

> RideSetGo is a ride-hailing platform for Amritsar. The landing page
> explains what the service does and is explicit that it is a demonstration —
> no real drivers, no live tracking, no real payments.

**Point at:** the "Now serving Amritsar" region, and the honest disclaimer in
the footer.

**Screenshot:** `docs/screenshots/01-landing-page.png`

---

## Step 2 — Passenger sign-up and login (2 minutes)

### 2.1 Sign up a brand-new passenger

**Show:** <http://localhost:5173/signup>

Fill in a fresh account. Use a **demo** address, for example
`demo.pax.<timestamp>@ridesetgo.demo`, a name like `Demo Passenger`, and a
password of at least 6 characters.

**Say:**

> Sign-up hashes the password with bcrypt — a salted adaptive hash — and
> returns a JWT. The plaintext password is never stored or logged.

**Watch for:** the duplicate-email error if you try to sign up with an
address that already exists. That is a good 10-second demonstration of
server-side validation.

### 2.2 Log out and log back in

**Show:** the profile menu → Logout → <http://localhost:5173/login> → sign in
with the same credentials.

**Say:**

> Logout is client-side: the token is discarded from local storage. There is
> no server-side session to revoke — that is one of the limitations I will
> come back to.

**Alternative, faster:** sign in as the seeded `passenger@ridesetgo.demo` /
`Demo@1234` account. Use the brand-new account for sign-up and the seeded
one for everything else, so the seeded data stays tidy.

**Screenshots:** `docs/screenshots/02-login.png`, `03-signup.png`

---

## Step 3 — Fare estimation (2 minutes)

**Show:** <http://localhost:5173/home>

1. Type **Golden Temple** in the "Where are you?" field and pick it from the
   dropdown.
2. Type **Amritsar Airport (ATQ)** in the "Where are you going?" field.
3. Click **Ride Options** to open the vehicle selection panel.

**Say:**

> The estimate comes from a Random Forest trained on 49,310 real Amritsar trip
> records. It resolves both locations against a database of 37 real
> coordinates, computes the great-circle distance with the haversine formula,
> and predicts the fare. The model achieved an R² of 0.9968, a mean absolute
> error of ₹7.33.

**Point at:** the per-category fares (Bike, Auto, Mini, Sedan, SUV) and the
note that says the category multipliers are heuristic, not per-category
trained models.

**Try the validation** (optional, 30 seconds): set pickup and drop-off to the
same place. The request is rejected with a 400 and the message *"Pickup and
dropoff locations cannot be the same."* That validation lives in the
prediction pipeline, not just in the UI.

**Screenshots:** `docs/screenshots/04-home-fare-search.png`,
`05-fare-estimate.png`, `05b-vehicle-selection.png`

---

## Step 4 — Create a booking (1 minute)

In the vehicle selection panel, pick a category and confirm the booking.

**Say:**

> Booking is atomic: the ride, the payment record and the notification are
> created together. The request carries an `Idempotency-Key`, so if the
> network drops and the user presses the button again, the server returns the
> original booking rather than creating a second ride and charging twice.

**After booking**, note the ride id — it appears in the URL of the trip
details page, and you will need it later.

**Screenshot of the trip details:** `docs/screenshots/08-trip-details.png`

---

## Step 5 — Driver workflow (2 minutes, second browser)

Open a **second, separate browser profile** (or a private window) so the
passenger session stays intact.

1. Go to <http://localhost:5173/login>
2. Sign in as `driver@ridesetgo.demo` / `Demo@1234`
3. Go to <http://localhost:5173/driver>

**Say:**

> The driver dashboard polls the request queue every eight seconds. The
> endpoint is role-gated: a passenger who calls it directly gets a 403, not an
> empty list.

**Do:**

1. Click **Accept** on the ride you just booked.
2. Click **Start**.
3. Leave it on `started` for a moment so the passenger's tracking screen has
   something live to show, then come back and click **Complete**.

**Show the guards** (this is the impressive part):

- Try to accept a second ride while one is active → the server returns
  **409** *"Driver already has an active trip"*.
- Point out the `Accept` button disappears once the ride is claimed.

**Screenshot:** `docs/screenshots/12-driver-dashboard.png`

---

## Step 6 — Trip status updates and history (1 minute)

Switch back to the passenger window.

1. Open **My Trips** (<http://localhost:5173/history>).
2. The new ride appears under the appropriate tab.
3. Open the trip to see the detail view.

**Say:**

> Every status change is stored on the ride row with a timestamp, and the
> history is read from the database — not from the browser's local state. The
> customer and the driver are looking at the same row.

**Screenshot:** `docs/screenshots/06-trip-history.png`

---

## Step 7 — Trip tracking (1 minute)

Open <http://localhost:5173/trips/{ride_id}/track>.

**Say this honestly:**

> This is the trip tracking screen. It shows the live status timeline, the
> real driver assigned to the ride — name and contact number — the pickup and
> drop-off coordinates, and the booking reference.

**Then point at the notice on the screen and read it out:**

> The screen also states explicitly that live driver tracking is not
> available, because the backend stores no GPS positions and no routing
> provider is integrated. The API returns a `capabilities` object with
> `live_tracking_available: false` and null `driver_location` and
> `route_geometry`. We chose to report that honestly rather than fake a
> moving marker. The response shape is designed so a real data source can be
> added later without changing the contract.

**If asked "why not implement it?":** the project has a fixed scope and a
limited timeline; storing a driver's position needs a location table, a
position-ingestion endpoint, a privacy and retention policy, and a map
provider with a paid API. The API contract is already designed for it, so it
is a contained addition rather than a rewrite.

**Screenshot:** `docs/screenshots/07-live-trip-tracking.png`

---

## Step 8 — Payment status and receipt (1 minute)

1. Open the receipt: <http://localhost:5173/trips/{ride_id}/receipt>
2. Click **Print** to show the print stylesheet.

**Say:**

> The receipt carries a booking reference of the form `RSG-000042`, the trip
> details, the fare breakdown and the payment method and status. It is
> explicitly labelled a demo estimate.

**If asked about the payment status**, give the honest answer:

> With cash, the payment is marked `not_applicable` because the money goes
> directly to the driver, not through the platform. With an online method it
> would be a `pending` mock-wallet payment. Critically, **no user can ever
> mark their own online payment as paid** — the API returns 403 and says the
> outcome must come from a verified provider webhook. The webhook endpoint
> exists but does not yet verify signatures, so in this demonstration no
> payment ever reaches `completed`, and the admin revenue figure correctly
> reads zero.

**Screenshot:** `docs/screenshots/09-receipt.png`

---

## Step 9 — Submit a review (30 seconds)

**Show:** the completed trip, and the rating control.

Rate it 5 stars with a short comment.

**Say:**

> A rating can only be left on a completed ride, only by the passenger who
> booked it, and only once — all three checks are enforced on the server, not
> in the UI.

**If asked to prove it**, try rating the same ride again → **400** *"Rating
already exists for this ride"*.

---

## Step 10 — Admin dashboard (2 minutes)

Switch to a third browser profile and sign in as `admin@ridesetgo.demo` /
`Demo@1234`. Open <http://localhost:5173/admin>.

**Say:**

> The admin dashboard reads directly from the database. There is no
> hard-coded or sample data anywhere in this screen — the code comment says
> so, and it is true.

**Show:**

1. The stat tiles: total users, total rides, confirmed revenue, rides by
   status.
2. The rides table with filters by status, date and free text.
3. The payments list and the payment summary grouped by status.
4. The **system health** panel: uptime, request counters, latency
   percentiles, database readiness, error counts.

**On revenue showing ₹0**, explain it as in Step 8 — it is the sum of
*completed* payments, and no payment can be completed without a gateway. It
is the correct number, not a bug.

**On the latency figures**, be careful:

> These are in-process measurements collected on this machine since the
> process started. The maximum is dominated by the first request that loads
> the 300 MB model artifact into memory. They are a sanity check, not a
> benchmark — the project has no load test suite.

**Screenshot:** `docs/screenshots/13-admin-dashboard.png`

---

## Step 11 — Validation, error handling and access restrictions (2 minutes)

This is the part that proves the system is real. Do it in the Swagger UI tab
(<http://127.0.0.1:8000/docs>) so the status codes are visible.

### 11.1 Unauthenticated access

Send any authenticated request without a token.

> **401** — "Invalid or expired token".

### 11.2 A passenger trying to reach the admin API

Sign in as the passenger in Swagger UI, then call `GET /admin/stats`.

> **403** — "Admin access required".

### 11.3 A passenger trying to use the driver queue

Call `GET /rides/available` with the passenger token.

> **403** — "Driver role required".

### 11.4 Cross-user access

Book a ride as the passenger, then try to read it with the driver's token or
with a second passenger's token.

> **403** — "Not authorized".

### 11.5 Illegal state transitions

- Cancel a completed ride → **400** — "Cannot cancel a completed ride".
- Cancel the same ride twice → **400** — "This ride has already been
  cancelled".
- Accept an already-accepted ride → **409**.
- Set an unknown status → **400** — "Invalid status. Allowed: [...]".
- Rate an incomplete ride → **400** — "Can only rate completed rides".

### 11.6 Input validation

- `POST /fare/estimate` with `passenger_count: 99` → **422**.
- `POST /fare/estimate` with an unknown location → **400**.
- Sign up with an existing email → **400** — "Email already registered".

### 11.7 Error handling and observability

Call `GET /health`, `GET /health/live` and `GET /health/ready`.

> The liveness probe never touches the database, so it stays green during a
> database outage — that is what a liveness probe is for. The readiness probe
> checks the database and returns 503 when it is unavailable.

Then show the terminal running the backend.

> Every request produces one structured log line with a correlation id, and
> the same `X-Request-ID` comes back in the response header, so a
> user-reported id maps to exactly one log line. An unhandled exception is
> logged in full but the client receives a sanitised body — no stack trace,
> no SQL, no connection string.

**Optional:** set `ENABLE_CLIENT_ERROR_REPORTING=true`, restart the backend,
and trigger a React error. The browser error is reported to the backend and
appears in the log — with the stack sanitised and rate limited. Leave it off
by default.

---

## Step 12 — Safety centre and responsive layout (1 minute, optional)

**Show:** <http://localhost:5173/safety>

> Trusted contacts and incident reports, both scoped to the signed-in user. A
> report can be linked to one of the user's own rides; a foreign ride id is
> rejected. The page is explicit that no emergency dispatch, live tracking or
> driver verification is provided — this is a data-entry feature, not a
> safety service.

**Show responsive:** narrow the browser window to phone width, or use the
device toolbar. The layout reflows to a single column with a bottom
navigation bar.

**Screenshots:** `docs/screenshots/10-safety.png`, `11-help.png`,
`14-mobile-landing.png`, `15-mobile-home.png`

---

## Timing

| Step | Topic | Time |
|---|---|---|
| 0 | Pre-flight | 5 min (before you start) |
| 1 | Landing | 1 min |
| 2 | Sign-up and login | 2 min |
| 3 | Fare estimation | 2 min |
| 4 | Booking | 1 min |
| 5 | Driver workflow | 2 min |
| 6 | History | 1 min |
| 7 | Tracking | 1 min |
| 8 | Payment and receipt | 1 min |
| 9 | Rating | 0.5 min |
| 10 | Admin dashboard | 2 min |
| 11 | Validation and access control | 2 min |
| 12 | Safety and responsive | 1 min |
| | **Total** | **~17 minutes** |

If you are given 10 minutes, keep Steps 1, 3, 5, 7, 10 and 11 and summarise
the rest.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Frontend shows a network error | Backend not running | Start Uvicorn; check <http://127.0.0.1:8000/health> |
| "Driver role required" on the driver page | Signed in with the passenger account | Sign out; use `driver@ridesetgo.demo` |
| Admin page shows "Admin access required" | Signed in with a non-admin account | Sign out; use `admin@ridesetgo.demo` |
| Driver dashboard shows no requests | The queue only lists unclaimed `requested` rides | Book a ride as the passenger first, then refresh the driver page |
| Driver cannot accept a ride | The driver already holds an active trip | Complete the current trip first |
| "Invalid or expired token" | Token expired, or `SECRET_KEY` changed after the token was issued | Sign in again |
| The admin dashboard shows ₹0 revenue | No payment can be completed without a gateway | Expected — explain Step 8 |
| Rides do not appear in history | The server is using a different database | Set `DATABASE_URL` explicitly, or always start the server from `backend/` |
| The ML endpoints return 503 | The model artifacts are missing | Check `ml/artifacts/*.joblib` exist |
| Port 8000 or 5173 already in use | Another process is running | Stop it, or change `--port` and the Vite proxy target together |

---

## Cleanup after the demonstration

```bash
# Stop the dev servers with Ctrl+C in each terminal.
```

The database keeps the demo records. That is useful if the examiner wants to
look again, and it is harmless — every account uses a `@ridesetgo.demo`
address and a synthetic phone number. There is no real personal data in it.

If you want a completely clean database for the submission, delete
`backend/ridesetgo.db`, restart the backend (which recreates the schema), and
re-run `scripts/seed_demo_accounts.py`.

---

## What to do if a question exposes a limitation

Do not improvise. The honest answer is always stronger, and this project was
built to be honest about its limits.

Three that come up most often, with the answers:

1. **"Is the tracking live?"** — No. The backend stores no driver GPS and
   integrates no routing provider. The API reports this through its
   `capabilities` object and the UI says so on the screen. The response
   contract is designed so a real data source can be added without breaking
   the client.

2. **"Can you show a successful payment?"** — No, and that is deliberate. A
   client can never mark its own payment as paid; only a verified provider
   webhook can, and the webhook does not yet verify signatures. So in the
   demo the revenue figure is zero, which is the truthful number.

3. **"What are the performance figures?"** — There are none. The project has
   79 backend tests and 83 end-to-end checks, and an in-process metrics
   registry, but no load test suite was written, so I cannot quote a
   throughput number. The latency values in the system-health panel are
   in-process measurements from this machine, not a benchmark.

The full list is in [`FEATURE_STATUS.md`](FEATURE_STATUS.md) and in the
"Known limitations" section of the [README](../README.md).
