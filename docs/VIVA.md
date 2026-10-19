# Viva Preparation

**RideSetGo** — Amritsar Ride-Hailing Platform with ML Fare Prediction

Every answer below is grounded in the actual source code, and every figure was
read from the repository or from a command that was run. Where a question
invites a textbook answer that does not match the implementation, the
difference is called out explicitly — that is usually where the marks are.

**How to use this document.** Each question has a **short answer** (30–60
seconds, the part you say) and a **deeper explanation** (the part you say if
the examiner follows up). Practise the short answers until they are automatic.

---

## Part 1 — Architecture and technology choices

### Q1. Why did you choose React for the frontend?

**Short answer.** React's component model maps directly onto this
application's screens — a booking flow, a driver dashboard and an admin
dashboard are each a composition of components with their own state. React
Hook Form handled the form-heavy screens cleanly, and Zustand gave one
persisted store for the session.

**Deeper.** The decision that mattered most was pairing React with
**TypeScript**. Our `src/types/index.ts` mirrors the backend's Pydantic
schemas. When a field changed on the server, the change surfaced as a
*compile error* on the client rather than as `undefined` at runtime. And
because the production build runs `tsc` before Vite, a type error fails the
build rather than shipping. For a project where the front end and back end
were developed by different parts of the team, that type contract was worth
more than any component-library choice.

### Q2. Why TypeScript over plain JavaScript?

**Short answer.** Because the frontend consumes a typed REST API. The
TypeScript types are a hand-maintained mirror of the Pydantic schemas, so a
mismatch between the two is caught at compile time.

**Deeper.** It also made the error-handling layer possible. We wrote
`src/lib/errors.ts`, which normalises *any* thrown value into a single
`NormalizedApiError` shape with a machine-readable `kind` — `"offline"`,
`network"`, `"timeout"`, `"unauthorized"`, `"forbidden"`, `"not_found"`,
`"validation"`, `"conflict"`, `"rate_limited"`, `"server"` — plus a
retryability flag and the backend's request id. Screens then branch on
`error.kind` instead of each inventing its own `catch` block. That function
has to be exhaustive over many shapes, and TypeScript is what makes the
exhaustiveness checkable.

### Q3. Why FastAPI over Flask or Django?

**Short answer.** FastAPI gives automatic OpenAPI documentation, Pydantic
validation integrated into the request lifecycle, and a clean dependency
injection model for the authentication and role gates.

**Deeper.** The strongest practical argument is that **our entire API
reference is machine-generated**. `docs/API.md` and `docs/openapi.json` are
produced by FastAPI from the same code that serves the requests, so they
cannot drift out of date. For a project with 36 paths and 41 operations,
hand-writing that documentation would have been a large, error-prone task
that nobody would have kept up to date.

The second reason is the dependency model. `get_current_user` and
`require_admin` are `Depends` callables, so declaring them in a route
signature *is* the authorisation policy:

```python
@router.get("/stats", response_model=AdminStats)
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
```

You cannot forget to call the check — it is part of the route's declaration.

### Q4. Why SQLite, and would it work in production?

**Short answer.** SQLite needs no installation and no separate server, which
made the demonstration reproducible. The ORM layer and the connection string
are portable, so moving to PostgreSQL is a configuration change.

**Deeper.** Honest answer: **not for this system's real use case.** SQLite
serialises writes, so concurrent bookings contend on a single writer. The
migration path is to change `DATABASE_URL` to a PostgreSQL URL and remove the
SQLite-only `connect_args` line in `app/database.py`. Nothing in the
application code uses SQLite-specific SQL — the queries are plain SQLAlchemy
constructs. The one caveat is that the concurrent behaviour would change:
SQLite's whole-file locking gives serialisation for free, while PostgreSQL
would need proper transaction handling and, for the booking path, row-level
locking to avoid two drivers accepting the same ride.

### Q5. What are the responsibilities of the frontend and the backend?

**Short answer.** The backend owns the truth: authentication, authorisation,
validation, the fare model, the ride lifecycle rules and all persistence. The
frontend owns presentation and interaction: rendering, form state, client-side
navigation and the user experience around the API.

**Deeper.** The dividing line we enforced is that **every business rule is
enforced on the server**. The UI hides the "accept" button when a driver
already has a ride, but the server also returns 409. The UI marks a payment
as pending, but the server refuses to let the client set a payment to
completed. The UI shows the driver's own rides, but the server filters by
`user_id`.

A good test of the boundary: if you deleted the frontend entirely and called
the API with `curl`, **no rule would be violated**. That is the property I
would want an examiner to check.

### Q6. Why an API at all, rather than a monolith?

**Short answer.** The API is what makes the demo, the tests and the
documentation reusable. The end-to-end script drives the real application
over HTTP, and the OpenAPI document describes the real contract.

**Deeper.** Also: the mobile app. Not as a feature — as the reason the
contract is designed the way it is. Everything the frontend needs is a
resource with a clear owner. `GET /rides/{id}/tracking` returns one
self-contained payload, including an explicit `capabilities` object, so a
second client would not need to make five calls and infer the rest.

---

## Part 2 — REST and HTTP

### Q7. What is a REST API, and which HTTP methods did you use and why?

**Short answer.** REST models the resource and uses the HTTP method to say
what is being done. We used `GET` to read, `POST` to create or to trigger an
action, `PATCH` to partially update, `PUT` to replace, and `DELETE` to
remove.

**Deeper.** Concretely in this project:

| Method | Endpoint | Why that method |
|---|---|---|
| `GET` | `/rides/`, `/rides/{id}` | Safe, idempotent read |
| `POST` | `/rides/book` | Creates a new resource; not idempotent by nature, which is why we added `Idempotency-Key` |
| `POST` | `/rides/{id}/accept` | An **action**, not a property edit. We use `POST` because the ride's `status` field is never set to `"accepted"` by the client — the server decides |
| `PATCH` | `/rides/{id}/status` | Partial update of one field |
| `POST` | `/rides/{id}/cancel` | An action with a body (the reason) |
| `DELETE` | `/rides/{id}` | Removal — but we kept it as an alias of the cancel action, because in this domain a ride is not really deleted, it is cancelled |
| `PATCH` | `/notifications/{id}/read` | Partial update of `is_read` |

The important distinction: **`POST /rides/{id}/accept` is a server-side
decision, not a client-set field.** A client cannot `PATCH` a ride to
`accepted`; the only way to reach that state is to ask the server to accept
it, and the server decides whether it is allowed.

### Q8. What is the difference between authentication and authorisation?

**Short answer.** Authentication is *"who are you?"* — verifying the token
and loading the user. Authorisation is *"what may you do?"* — checking that
role and ownership permit this specific action.

**Deeper.** In the code they are two separate things:

```python
# Authentication — who is calling?
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = decode_access_token(token)      # verifies the signature and expiry
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(401, "Could not validate credentials")
    return user

# Authorisation — may they do this?
def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return current_user
```

Three authorisation layers, all server-side:

1. **Role** — `require_admin` for `/admin/*`; inline checks elsewhere.
2. **Ownership** — `ride.user_id != current_user.id` → 403 on every per-ride
   read and write.
3. **Legality** — a `completed` ride cannot be cancelled; a `requested` ride
   can only be accepted once.

The most useful distinction for the demo: **403 means "we know who you are,
but you may not do this"**, and 401 means "we do not know who you are". The
frontend even treats them differently — a 401 clears the session, a 403 does
not, so a user who is merely forbidden from a resource is not logged out.

### Q9. Why JSON, and how did you handle errors?

**Short answer.** JSON because both ends are JavaScript-family tools and
Pydantic serialises to it directly. Errors use FastAPI's standard shape —
`{"detail": "..."}` — and validation errors list every rejected field with
its location.

**Deeper.** The interesting part is the **global exception handlers** in
`app/core/exceptions.py`. An unhandled exception is logged in full — traceback,
so the developer can debug it — and the client receives a sanitised body. No
stack trace, no SQL statement, no connection string, no database name. That
is a real information-disclosure control, not a cosmetic one.

I also deliberately set `debug=False` on the FastAPI app, because FastAPI's
debug mode replaces 500 responses with a full HTML traceback. Our `DEBUG`
setting only changes the log level.

---

## Part 3 — Security

### Q10. How are passwords stored, and why?

**Short answer.** bcrypt, with a per-password random salt.

**Deeper.** bcrypt is an **adaptive** KDF: it is deliberately slow, and the
cost parameter can be raised over time as hardware gets faster. A stolen
database of hashes is then expensive to attack offline, because every guess
costs the attacker real time.

The salt matters as much as the algorithm. Without it, two users with the
same password produce the same hash, so an attacker can attack all of them at
once, and precomputed rainbow tables work. With a random salt per password,
identical passwords hash differently and each guess must be computed
individually.

We use `bcrypt.hashpw` and `bcrypt.checkpw` directly, with a 72-byte input
limit — bcrypt truncates beyond that, so the schema caps the password at 128
characters and validation rejects anything over bcrypt's limit rather than
silently truncating it.

### Q11. How are sessions managed? What are the weaknesses?

**Short answer.** A stateless JWT, HS256, with an expiry, stored in
`localStorage` by the Zustand persist middleware and sent as a bearer token.
The session is restored on reload only after the server confirms it with
`GET /auth/me`.

**Deeper — and this is where honesty earns marks — the weaknesses are
real:**

1. **`localStorage` is readable by any script on the origin.** An XSS
   vulnerability becomes a token theft. An httpOnly, SameSite cookie would
   not be readable by JavaScript, but it needs CSRF protection, which is
   why we kept the token in a header.
2. **No server-side revocation.** `POST /auth/logout` is advisory — it
   returns a message telling the client to discard the token. Until the
   token expires, it is still valid. A production system needs a short-lived
   access token plus a rotating refresh token with a server-side deny list.
3. **Seven-day expiry** with no rotation.
4. **`SECRET_KEY` has a placeholder default.** It must be set before any real
   deployment.

The reason we still chose a JWT: the demo is stateless, it scales
horizontally with no shared session store, and the revocation gap is an
acceptable trade-off **for a demonstration**. In production I would use
short-lived access tokens with a refresh rotation and a deny list.

### Q12. What is SQL injection, and how do you prevent it?

**Short answer.** It is passing user input as executable SQL. We prevent it
by using SQLAlchemy's ORM, which parameterises every query — the value is
sent separately from the statement, so a quote in the input is just a
character.

**Deeper.** The ORM removes the risk from the ~99% of queries we write, but
the real point is that **the parameterisation is a property of the ORM, not
of careful coding**. There is no string-concatenated SQL anywhere in the
project. The closest thing to dynamic SQL is the admin filter, where the
search term is bound as a parameter:

```python
query = query.filter(Ride.pickup_location.ilike(f"%{q}%"))
```

The `%{q}%` is Python string formatting that produces a *value*; the value
is then bound as a parameter. The `%` wildcards are intentional — they are
part of the LIKE pattern, not part of the SQL. A naive developer could easily
write `.filter(text(f"... {q} ..."))` and reintroduce the bug, so this is
one line worth being able to defend.

### Q13. What is CSRF, and does your project have that problem?

**Short answer.** Cross-Site Request Forgery is when a third-party site makes
your browser send an authenticated request. Our project is not exposed to it
because the token is sent in the `Authorization` header, which the browser
does not attach automatically — a cross-origin form or image cannot set it.

**Deeper.** That is also exactly why we could not simply move the token into
a cookie without thinking: a cookie *is* attached automatically, which is
precisely what makes CSRF possible. So the choice of `localStorage` plus a
header trades one class of risk for another. The proper fix for a cookie
approach is a CSRF token or the `SameSite=Strict` attribute plus an
`Origin`/`Referer` check — which is what I would implement if we moved to
cookies.

### Q14. How do you prevent a user from marking their own payment as paid?

**Short answer.** The server refuses it with a 403. Only a verified provider
webhook may set a payment to `completed` or `failed`.

**Deeper.** This is the single most important rule in the system, and it is
the one place where "make the demo look good" would have done real damage.
Letting the frontend say "Payment successful" would mean the `payments` table
records whatever the client asked for — the table would be worthless, and any
revenue figure derived from it would be fiction.

So the endpoint checks:

```python
if new_status in ("completed", "failed"):
    raise HTTPException(403,
        "Online payments can only be marked Paid/Failed by a verified payment "
        "provider webhook. Never trust the frontend for payment outcome.")
```

The practical consequence, which I explain rather than hide: **in the demo,
no payment can ever reach `completed`**, because no gateway is configured and
the webhook does not yet verify signatures. So the admin revenue figure
correctly reads ₹0. That is the truthful number. A demo where revenue
showed a fabricated ₹12,450 would be less impressive than one where the
examiner asks "why is it zero?" and the answer is a security control working
as designed.

The same pattern appears in the payment config: `GET /rides/payment-config`
reports `gateway_configured: false` and `demo: true` rather than pretending.

### Q15. What is idempotency, and why did you need it?

**Short answer.** Booking is not idempotent — the same request twice creates
two rides. If the network drops after the server commits but before the
response reaches the browser, the user's natural retry would double-book
them. We support an optional `Idempotency-Key` header so a retry returns
the original response.

**Deeper.** The mechanics, in `app/core/idempotency.py`:

1. The key is **sanitised** before use (length, character set).
2. `claim(user_id, "rides.book", key)` — scoped per user and per endpoint, so
   two different users may use the same key, and one user's booking key
   cannot affect another.
3. First time → the handler creates the ride, the payment and the
   notification, then **stores the status code and the response body**.
4. Retry with the same key → the stored response is returned, so the client
   gets its original ride id back and no second ride exists.
5. Retry while the first is still running → **409**, not a duplicate.
6. The booking **failed** → the key is **released**, so the customer can
   retry rather than being locked out by a cached error.

The frontend generates a fresh key for each genuinely new booking and reuses
the key for retries of the same attempt.

One thing worth pointing out: the uniqueness of
`(user_id, endpoint, key)` is enforced by a **named `UniqueConstraint` on the
table**, created by the `c4e1a7b93d21` migration. The application-level check
in `app/core/idempotency.py` is the fast path, but the constraint is the
backstop — a genuine concurrent first-time race cannot create two rows,
because the second insert fails at the database level.

### Q16. What is SQL injection... and what about the admin search?

*(Covered above.)* If the examiner pushes on the admin search specifically:
the free-text filter builds a LIKE pattern in Python and binds it as a
parameter. There is no raw SQL anywhere in the project.

---

## Part 4 — Database and ORM

### Q17. What are the main tables and their relationships?

**Short answer.** Ten tables. `users` is the hub — it relates to `rides`
twice (as passenger and as driver), and to `ratings`, `notifications`,
`trusted_contacts`, `safety_reports`, `idempotency_records` and
`driver_applications`. `rides` relates to `payments`, `ratings`,
`notifications` and `safety_reports`.

**Deeper.** The interesting design decisions:

- **One `users` table for all three roles.** A separate `drivers` table would
  split identity across two places, complicate the JWT's `sub` claim and
  duplicate the password and phone columns. One table, one `role` column,
  one identity, one token, one authorisation path.
- **`rides` has two foreign keys to `users`** — `user_id` (passenger) and
  `driver_id` (driver). SQLAlchemy needs help here: with two FKs between the
  same pair of tables, the relationship is ambiguous, so we disambiguate with
  `foreign_keys="Ride.user_id"` on both sides.
- **`ride_categories` is not referenced by `rides`.** The `category` column
  on `rides` is a plain string, and the live `/categories/` endpoint is
  served from a hard-coded list in the predictor. That is a real
  inconsistency — the table is seeded to mirror the list, but nothing keeps
  them in sync. It is on the limitations list.

### Q18. What is SQLAlchemy, and why use an ORM?

**Short answer.** SQLAlchemy maps Python classes to database tables, so we
work with objects and relationships rather than writing SQL strings.

**Deeper.** The ORM earns its place in three specific places here:

1. **Relationships become navigable.** `ride.driver` and `ride.user` are
   attributes, and the model declares how they cascade.
2. **The models are the single source of truth for the schema.** Alembic
   generates migrations from them with `--autogenerate`.
3. **Parameterisation is automatic** — see the SQL injection question.

The trade-off, honestly: the ORM can obscure what SQL is actually running.
For the admin dashboard's aggregations we use `func.count` and `func.sum`
with `group_by`, which is where a query builder starts to look like SQL
anyway — and that is the point at which the ORM stops helping and you have
learned raw SQL regardless.

### Q19. What is a primary key, a foreign key and an index?

**Short answer.** A primary key uniquely identifies a row. A foreign key
references another table's primary key and enforces the relationship. An
index is a lookup structure that speeds up reads on a column.

**Deeper.** In this project:

- **Primary keys** — every table has an integer `id` primary key.
- **Foreign keys** — `rides.user_id`, `rides.driver_id`, `payments.ride_id`,
  `ratings.ride_id`, `ratings.user_id`, `notifications.user_id`,
  `notifications.ride_id`, `safety_reports.user_id`, `safety_reports.ride_id`,
  `trusted_contacts.user_id`, `idempotency_records.user_id`,
  `driver_applications.user_id`. All reference `users.id` or `rides.id`.
- **Indexes** — on every foreign key, plus `rides.status` and
  `rides.created_at` because those are what the admin dashboard filters and
  sorts by, and `payments.status` for the payment summary.

And the honest detail: **`create_all()` only creates indexes on tables that
do not already exist.** The checked-in database was created before the
current indexes were added, so it does not have them — `create_all` never
adds an index to an existing table. A proper Alembic migration would. On the
demonstration dataset it makes no measurable difference, but it is a real
difference between the code and the shipped file, and it is item F2 on the
future-work list.

### Q20. What unique constraints do you have, and are any missing?

**Short answer.** Five: `users.email` (unique index), `ride_categories.name`
(table-level unique), `payments.transaction_id` (table-level unique, nullable),
`driver_applications.user_id` (unique index), and
`idempotency_records(user_id, endpoint, key)` (a named composite constraint).

**Deeper, honestly.** Two are **missing** and I would fix them:

- `payments.ride_id` is not unique — one payment per ride is enforced in the
  handler, not by the database.
- `ratings.ride_id` is not unique — one rating per ride is enforced in the
  handler. A concurrent double-submit could in principle create two ratings.

Both are application-level checks that work in practice, but a
`UniqueConstraint` would make them hold under concurrency. There are also no
check constraints — so `score` being 1–5 is enforced by the Pydantic schema,
and `status` being one of five values is enforced by the API layer.

The `idempotency_records` one is the interesting contrast: it *is* a
constraint, because that is a correctness guarantee under concurrency rather
than a tidiness improvement. The difference in effort was one migration
versus two handler changes, and the payoff is that the guarantee cannot be
bypassed by a race.

### Q21. How did you handle migrations?

**Short answer.** Alembic, with a linear chain of four revisions, currently
at the head: `6afbbc46177c` → `89f7ab2b06a1` → `1d67a3ef848e` →
`c4e1a7b93d21`.

**Deeper.** The workflow is `alembic revision --autogenerate -m "..."` after
changing `app/models.py`, then `alembic upgrade head`. The autogenerate
compares the models against the current database and emits the difference.

But here is the honest wrinkle: `app/main.py` also calls
`Base.metadata.create_all(bind=engine)` at import time, so a fresh database
is created automatically and the migrations are somewhat redundant for
initial setup. The chain now covers the `idempotency_records` table
(`c4e1a7b93d21`), but it still predates the indexes added to `rides`,
`payments` and `ratings`, so a database migrated with `alembic upgrade head`
alone would not have those. The clean fix is one more migration for the
current model state and making `alembic upgrade head` the only supported
initialisation path — that is item F2.

### Q22. Why SQLite for the primary key — do you use UUIDs anywhere?

**Short answer.** The tables use auto-incrementing integer primary keys. The
*booking reference* shown to users is `RSG-{id:06d}`, derived from the id.
The *request* correlation id is a UUID.

**Deeper.** Integer keys are simpler, smaller and make joins cheaper — the
right choice at this scale. The UUID appears where it matters: the
`X-Request-ID` correlation id, because it has to be generated by a client
that wants to propagate it, and it has to be globally unique without a
central allocator.

The `RSG-000042` format is a deliberate choice too: it is **not** the
database id, it is a display reference with a prefix, so it is recognisable
on a receipt and in a support conversation without exposing how many rides
exist in the database.

---

## Part 5 — The machine-learning module

### Q23. Explain the fare estimation logic end to end.

**Short answer.** Validate the inputs → look up both locations' real
coordinates → compute the haversine distance → encode the two locations as
categorical codes → predict a base fare with the Random Forest → apply the
category multiplier and the minimum fare → return all five categories.

**Deeper.** The critical detail is that **training and inference use the same
distance function on the same real coordinates**:

```python
def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1-a))
    return R * c
```

`train_model.py` computes `distance_km` for every training row from the CSV's
`pickup_latitude`/`pickup_longitude` columns. `pipeline.py` recomputes it
from `location_db.joblib` at request time. If the two differed — say one
used a straight-line distance and the other a road distance — the model
would be trained on a feature that never appears at serving time, and its
accuracy would collapse in production while looking perfect in the notebook.
This is the classic train/serve skew, and duplicating the function
deliberately is how we avoid it.

### Q24. Why Random Forest, and not a neural network or plain regression?

**Short answer.** The data is tabular with a mix of categorical and numeric
features, and Random Forest handles both without scaling, resists overfitting
on tabular data, and gives feature importances for explainability.

**Deeper.** The honest reason is partly practical: with 49,310 rows and
5 features, a Random Forest trains in a couple of minutes on a laptop, gives
good results immediately, and is interpretable. A neural network would have
needed more data, more tuning and more justification — and would have been
harder to explain to a user asking "why is this fare ₹143?".

I would also note the limitation of the approach: the model captures
non-linear relationships between distance, time and location, but it has no
concept of traffic, road conditions or demand. The dataset's
`is_pilgrimage`, `is_airport`, `is_border`, `is_market`, `is_night`,
`is_weekend` and `rush_hour` columns are all **unused** — only five features
are used. A model that used them would likely be better; that is future work.

### Q25. What do MAE, RMSE and R² mean, and what are your values?

**Short answer.** MAE is the average absolute error in rupees; RMSE penalises
large errors more; R² is the proportion of variance explained.

**Deeper.** Ours: **MAE ₹7.33, RMSE ₹9.19, R² 0.9968**, on a held-out 20%
of 49,310 records with a fixed `random_state=42` so the split is
reproducible.

Reading them: a mean absolute error of ₹7.33 on fares averaging around ₹202
is roughly 3.6% — for a fare *estimate*, that is good. The gap between MAE
and RMSE tells us the error distribution has a tail: some routes are
predicted much worse than the average. That is what you would expect from
location codes, because the model treats each location as a category and
cannot generalise to a pair it has rarely seen.

**And the honesty that matters:** R² of 0.9968 is agreement with the
*historical dataset*. It is **not** an accuracy figure against live Uber or
Ola pricing, because the dataset was not collected by us and no live
comparison was made. I would not claim this model beats any commercial
operator — that would be an unsupportable claim.

### Q26. What is overfitting, and how did you check for it?

**Short answer.** Overfitting is when a model learns the training data,
including its noise, instead of the underlying pattern — so it scores well on
training data and badly on new data.

**Deeper.** The mechanism here is a fixed 80/20 split with `random_state=42`
so the split is reproducible, and the metrics are computed on the **test
split**, not the training set.

But I should be honest about the limits of that check: **I did not run
cross-validation**, and I did not evaluate on a *route-level* hold-out. The
current split is random over rows, so a given route can appear in both the
training and the test set. Given that the model includes location codes, that
means the R² is somewhat optimistic for genuinely unseen routes. A
route-level hold-out — split by origin-destination pair — would be the
correct evaluation, and it is item F11 on the future-work list.

The reason I did not use a neural network is partly the same reason: without
a rigorous evaluation protocol, a more flexible model would look better on
the test set while being less trustworthy in practice. Simplicity bought
honesty here.

### Q27. How is the model deployed, and what happens if it is missing?

**Short answer.** The artifacts — `fare_model.joblib`, `preprocessor.joblib`
and `location_db.joblib` — are committed to the repository and loaded
lazily, on the first request that needs them. If they are missing, the
affected endpoints return 503 and the rest of the API keeps working.

**Deeper.** The artifacts are produced by `ml/train_model.py`, which also
writes the location database from the CSV's real coordinates, and stores the
metrics inside `preprocessor.joblib` — so the numbers in the report are
readable from the artifact itself rather than being typed in by hand.

The cost is real and worth stating: `fare_model.joblib` is about **300 MB**,
because a 100-tree forest over 49,310 rows is stored unpruned. Loading it
takes about a second. That is why the first estimate request in a fresh
process is slow, and it is why the maximum latency in the system-health
panel is large — it is a one-off cost, not a steady-state measurement. The
fix is `joblib.dump(..., compress=3)`, which is on the future-work list.

### Q28. How do you handle the model failing at runtime?

**Short answer.** The predictor catches the failure, records it in the
metrics registry as an external failure, and returns 503 rather than a
misleading estimate.

**Deeper.** This is what `errors.external_failures.ml_model` in
`GET /admin/system-health` reports. The design rule is that **the system
must never return a fabricated fare** — if the model is unavailable, the
honest answer is "I cannot estimate right now", not a plausible number. The
same principle appears in the tracking endpoint's `capabilities` object and
in the receipt's `is_demo` flag.

### Q29. How are the five vehicle categories priced?

**Short answer.** As **heuristic multipliers on the single base fare**, with
a minimum fare floor — Bike 0.70/₹30, Auto 0.80/₹35, Mini 0.90/₹40, Sedan
1.15/₹50, SUV 1.40/₹70. They are not five separate trained models.

**Deeper.** I want to be precise here because it is easy to overstate. The
Random Forest produces **one** base fare. The categories are derived by
multiplying and flooring. The module docstring says so, and — more
importantly — the API returns the same statement in its `note` field, which
the frontend displays: *"Category multipliers are heuristic and not
per-category trained models."*

A per-category model would need category-specific training data, because
sedan fares and bike fares in the same city follow different relationships
with distance. It is feasible and it is future work, but I would not
describe what we have as "five ML models".

---

## Part 6 — The ride lifecycle

### Q30. What is the ride lifecycle, and what enforces it?

**Short answer.** Five states — `requested → accepted → started → completed`,
with `cancelled` reachable from `requested` or `accepted`. The transitions
are enforced in the API handlers, each with a permission check and a
legality check.

**Deeper.** The rules and their rejections, all verified by the end-to-end
script:

| Transition | Rule | On violation |
|---|---|---|
| book → `requested` | Always starts here | — |
| `requested` → `accepted` | Only a driver/admin; ride must be unclaimed | 403 / 409 |
| accept | Driver may hold only one active ride | 409 |
| `accepted` → `started` | Driver/admin | 400 if the status is unknown |
| `started` → `completed` | Driver/admin | — |
| `requested`/`accepted` → `cancelled` | Owner only; ride not already cancelled | 403 / 400 |
| `completed` → anything | Terminal | 400 |

One honest caveat: `PATCH /rides/{ride_id}/status` is the general-purpose
setter and performs **no state-machine validation** — it accepts any of the
five statuses from any permitted caller, so it can move a ride backwards. The
lifecycle rules live in the dedicated `/accept` and `/cancel` endpoints. A
strict reading of the rules should live in one place, and that is a
refactor I would do.

### Q31. How does a driver get assigned to a ride? Is there auto-matching?

**Short answer.** There is **no auto-matching**. A booking stays `requested`
until a driver opens the Driver Dashboard and accepts it by hand. The
available-rides query filters only on `status == "requested"` and
`driver_id IS NULL`.

**Deeper.** Auto-matching would need a driver-location table, a spatial
query for nearby drivers, an availability model, and a way to notify them.
That is a significant subsystem, and none of it is implemented. The
`safety.py` module and the `driver_applications` table suggest the shape of
it — drivers apply, get approved, and become available — but the approval
flow is not wired up either.

What *is* implemented is the part that matters for correctness: the accept
endpoint checks the ride is still unclaimed **and** that the driver holds
no other active ride, both with 409 conflicts. So even the manual flow
cannot double-assign.

### Q32. How does the customer cancel, and what happens to the record?

**Short answer.** `POST /rides/{ride_id}/cancel` with an optional reason. The
server sets the status to `cancelled`, stores the reason and a timestamp, and
creates a `ride_cancelled` notification.

**Deeper.** Eligibility is checked server-side: only the **owner** may cancel
(403), only a `requested` or `accepted` ride may be cancelled (400), and a
ride that is already cancelled cannot be cancelled again (400). A
`DELETE /rides/{ride_id}` alias exists for backward compatibility and
applies the same rules with a null reason.

The record is never deleted — a cancelled ride stays in the history, with
its reason and timestamp. That is what makes the history auditable, which
was one of the original problems.

### Q33. How is trip tracking implemented?

**Short answer.** As a **status timeline**, not live GPS. The endpoint
returns the current status, the four progress stages, the real assigned
driver's name and phone, the stored coordinates, and an explicit
`capabilities` object stating that live tracking is unavailable.

**Deeper.** The honest part is the point: **there is no driver location
table and no routing provider**, so `driver_location` and
`route_geometry` are always `null` and `live_tracking_available` is `false`.
We could have drawn a marker animating along a straight line between pickup
and drop-off, and that would have looked better in a screenshot — but it
would have been a fabrication of a feature that does not exist.

The response contract is designed so this is a contained addition, not a
rewrite: add a location table, an ingestion endpoint and a map-provider
client, and populate `driver_location`, `route_geometry` and
`eta_available` — the client contract does not change. That is why the
capability flags are modelled as data rather than as UI convention.

Also note `estimated_duration_min` is `null` in practice, because the
booking handler never sets it — which is exactly why `eta_available` is
`false` rather than a made-up number.

### Q34. How do ratings work, and is the average calculated?

**Short answer.** A rating is 1–5 with an optional comment, on a completed
ride, by the passenger who booked it, once. **No aggregation is implemented** —
there is no average-per-driver endpoint, no leaderboard, and no driver rating
summary on the driver card.

**Deeper.** The rules are all server-side: only the owner (403), only a
`completed` ride (400), and only once per ride (400). The one-rating rule is
an application check — `ratings.ride_id` has no unique constraint — which
means a concurrent double-submit could in principle create two. I would add
the constraint.

For the aggregation, it would be a `group by` on `ratings.user_id` joined to
the driver's assigned rides. The `ratings` table already has `ride_id` and
`user_id`, so the data is there; only the query and an endpoint are missing.
It is on the future-work list rather than the limitations as an oversight.

### Q35. How do the three dashboards differ?

**Short answer.** Same application, different role, different API surface.

| | Passenger | Driver | Admin |
|---|---|---|---|
| Book a ride | ✓ | — | — |
| See a request queue | — | ✓ | ✓ |
| Accept / start / complete | — | ✓ | ✓ |
| History and receipts | own rides | own rides | all rides |
| Admin analytics | — | — | ✓ |
| System health | — | — | ✓ |

**Deeper.** The frontend's route guard only checks *authentication*, not
role — `SessionGate` in `App.tsx` checks `isAuthenticated`. So a passenger
can navigate to `/admin` and see the shell; the API then returns 403 and the
screen shows the error.

That is a deliberate trade-off worth explaining: **the client-side guard is a
user-experience affordance, not a security control.** The real enforcement is
server-side, and it is tested — the smoke test asserts that a passenger and a
driver both receive 403 from every admin endpoint. If the guard were the only
thing stopping them, the data would be exposed.

The improvement would be a role check in the route guard, purely so the
passenger does not see an error page. `ProtectedRoute.tsx` exists for exactly
this but is currently a no-op passthrough — item on the cleanup list.

### Q36. How does the admin dashboard compute its numbers?

**Short answer.** With SQLAlchemy aggregations — `func.count`, `func.sum`
and `group_by` — over the live tables. No seeded or sample data.

**Deeper.** For example, revenue is the sum of `payments.amount` where
`status == "completed"`, which is why it reads ₹0 with no gateway
configured. The rides-by-status and rides-by-category tiles are `group_by`
counts on `rides`. The code comment says *"Demo analytics — no fabricated
data, only what is stored in SQLite"*, and that is accurate — I checked that
there is no synthetic data path in the admin response.

The payments list and the ride list both cap at 200 rows, newest first.

### Q37. What are the notifications for, and how are they delivered?

**Short answer.** Two events create notifications: a booking and a
cancellation. They are **rows in the `notifications` table**, readable
through the API. There is no email, SMS or push delivery, and — honestly —
**there is no notification UI at all**: no frontend file calls
`/notifications/`, and the header has no bell.

**Deeper.** That last part was a surprise finding during the final audit: the
backend feature is complete and tested, but the front end never wired it up.
The cleanest first step is a bell icon in the header with an unread badge
that polls `/notifications/?unread_only=true` — item F5 on the future-work
list, and the cheapest way to make an existing, working feature visible.

A notification is also **not** created when a driver accepts or starts a
ride, which is arguably the notification a passenger actually wants.

---

## Part 7 — Testing, deployment and weaknesses

### Q38. How did you test the system?

**Short answer.** Three layers: 78 pytest integration tests against a
temporary database, an 83-assertion end-to-end script that drives a live
server over HTTP, and a TypeScript production build that fails on any type
error.

**Deeper.** The backend tests use FastAPI's `TestClient` with a temporary
SQLite database, so the development database is never touched. They exercise
the real HTTP path — the real auth dependency, the real Pydantic validation,
the real database — not mocked units.

The end-to-end script is the layer I would emphasise, because it is the one
that catches integration mistakes. **It found a real bug in the final
audit**: `GET /rides/available` returned 422 instead of 200, because it was
declared after `GET /rides/{ride_id}` and FastAPI matches routes in
declaration order — so `"available"` was parsed as an integer `ride_id`. The
driver dashboard's request queue was broken. The unit tests did not catch it
because they never exercised the route table. I moved the route, documented
the ordering constraint in the handler's docstring, and added a regression
check.

**What does not exist:** no unit tests for the models in isolation, no
browser-level (Playwright/Cypress) regression suite, and **no load or
performance test suite**.

### Q39. What are the actual test results?

**Short answer.** 79 backend tests passed; 83 end-to-end checks passed; the
production build succeeded. All on 19 October 2026 against the current
source.

**Deeper.** Give the real commands and outputs:

```
pytest tests -q                     → 79 passed, 41 warnings in 83.72s
python scripts/smoke_test.py        → RESULT: 83 passed, 0 failed
npm run build                       → ✓ 1706 modules transformed, built in 25.10s
```

And be ready for the follow-up: *"41 warnings — what are they?"* They are
Pydantic v2 deprecation warnings — class-based `Config` on the schema models
and `Field(env=...)` in the settings. They are warnings, not errors, and
fixing them means migrating to `ConfigDict` and `pydantic-settings`' native
env handling.

### Q40. What are the performance figures?

**Short answer.** **There are none.** The project has no load or benchmark
suite, so I cannot quote a throughput or latency-under-load number.

**Deeper — and this is the answer that matters most.** The latency figures
visible in `GET /admin/system-health` are **in-process measurements**,
collected on one development machine since the process started, and they must
**not** be presented as a benchmark. The maximum is dominated by the one-off
load of the 300 MB model artifact. The p50 of about 20 ms is a more
representative steady-state number for a SQLite-backed read, but even that is
from a single machine with no concurrent load.

The honest position is: *the project has functional test coverage and an
in-process metrics facility, but no performance testing was carried out.* The
metrics endpoint already exposes the counters a `k6` or Locust script would
need, so building the load suite is a contained piece of work — it is the
top item on the future-work list, precisely because it would turn a set of
manual demonstration steps into a measurable claim.

### Q41. Has this been deployed?

**Short answer.** **No.** No deployment has been performed or verified for
this project.

**Deeper.** What exists in the code that would support one: a standard ASGI
app, `LOG_FORMAT=json` for machine-parseable logs, three health probes
suitable for a load balancer, a forwarded `X-Request-ID` header, and a
TypeScript-checked production build. The README includes an nginx snippet
that mirrors the Vite dev proxy.

What is missing: no Dockerfile, no `docker-compose.yml`, no CI pipeline, no
infrastructure-as-code, no TLS configuration, no backup strategy, and no
environment in which this has ever been run outside the development laptop.
So the correct claim is: *"the code supports a deployment, but I have not
performed one, so I am not going to describe it as production-ready."*

One real constraint I would raise if we did deploy it: **use a single
worker**. The metrics collector and the idempotency claim logic are
in-process, so multiple workers would each keep their own counters and their
own idempotency cache — and the latter is a correctness issue, not just a
telemetry one. Moving to PostgreSQL and a shared metrics store is the
prerequisite for scaling out.

### Q42. What are the main weaknesses?

**Short answer.** The security ones first, then the functional ones.

**Security**

1. `SECRET_KEY` has a placeholder default — must be set before any real use.
2. The token is in `localStorage`, so any script on the origin can read it.
3. No refresh rotation and no server-side revocation; logout is client-side.
4. **No rate limiting on the authentication endpoints** — the login form is
   open to credential stuffing. This is the highest-severity item on the
   list. (The client-error reporter *is* rate limited, which shows I know
   the technique.)
5. No audit log of administrative actions.

**Functional**

6. No real payment processing, no GPS tracking, no auto-dispatch, no push
   notifications.
7. The booked fare uses a flat `distance_km * 15.0` formula rather than the
   ML estimate, so the stored fare can differ from the estimate shown.
8. Four dead frontend API calls and one unreachable backend function.

**Operational**

9. SQLite only; in-process metrics.
10. The model artifact is ~300 MB and is committed to the repository.
11. `requirements.txt` does not match the installed versions.

**Deeper.** If pressed for the single most important weakness, I would say
**the absence of rate limiting on login**, because it is the one where an
attacker needs no special skill and the impact is account compromise. I
would also say that the flat booking fare is the one that most undermines
the project's central claim — the whole point is a data-derived fare, and
the booking does not use it. That is the first thing I would fix.

### Q43. What would you do next?

**Short answer.** Not a new feature — the load test suite and the browser
regression suite, because the metrics infrastructure for them already exists
and because they would turn a manual demonstration into a repeatable,
measurable claim.

**Deeper.** The order I have, and the reasoning:

1. **Use the ML estimate for the booked fare.** Low effort, and it removes a
   genuine inconsistency between the estimate screen and the receipt — the
   project's central claim should be true end to end.
2. **A k6/Locust load suite** with a published report. This is what
   Chapter 13 of my report currently cannot answer.
3. **A Playwright regression suite** over the demo flow, so the 83 checks
   cover the UI as well as the API.
4. **Rate limiting on `/auth/login`.** Closes the highest-severity security
   weakness, and I already know the technique from the diagnostics endpoint.
5. **A real payment gateway with webhook signature verification.** This makes
   the revenue figure meaningful and completes the payment flow.
6. **Driver GPS and an ETA service.** The API contract is already designed
   for it, so it is a contained addition.
7. **PostgreSQL, a shared metrics store, Docker and CI.** The operational
   prerequisites for everything above.

### Q44. What did you personally find difficult?

*(A good question to practise. Keep it honest and specific.)*

**Short answer.** Route ordering, and knowing when *not* to fake something.

**Deeper.** The route-ordering bug is the concrete example. FastAPI matches
routes in declaration order, so a static path like `/rides/available`
declared after `/rides/{ride_id}` is captured by the parameterised route and
rejected as a non-integer. Nothing about the code looks wrong when you read
it, and the unit tests did not catch it — only a real request against a
running server did. The fix was trivial; finding it was the work. It is also
why the handler's docstring now explains the constraint, so the next person
does not move it back.

The second thing is harder to articulate but more valuable. There were
several points where the *easy* choice was to make the demo look better:
animate a marker along a straight line and call it live tracking; let the
browser set the payment to "Paid" so revenue is non-zero; show a plausible
ETA. Each of those would have improved the screenshots and made the
demonstration more convincing. Each would also have made the system a lie.
We chose the rule that the system reports its own limitations — and I would
argue that is the most defensible property of the whole project. It is also
the property an examiner can check in about thirty seconds, by asking to see
the tracking screen and reading what it says about itself.

---

## Quick-reference: numbers to have ready

| Fact | Value |
|---|---|
| Dataset | 49,310 rows × 21 columns |
| Locations | 37, with real coordinates |
| Model | `RandomForestRegressor(n_estimators=100, random_state=42)` |
| Features | 5 — `pickup_code`, `dropoff_code`, `distance_km`, `passenger_count`, `hour` |
| MAE / RMSE / R² | ₹7.33 / ₹9.19 / 0.9968 |
| API surface | 36 paths, 41 operations, 10 tags |
| Database | 10 tables |
| Frontend | 15 route components |
| Roles | 3 — `customer`, `driver`, `admin` |
| Ride statuses | 5 — `requested`, `accepted`, `started`, `completed`, `cancelled` |
| Categories | 5 — Bike, Auto, Mini, Sedan, SUV |
| Backend tests | 79 passed |
| End-to-end checks | 83 passed |
| Frontend build | ✓ 1706 modules, 25.10s |
| Alembic | 4 revisions, head `c4e1a7b93d21` |
| Model artifact | ~300 MB, ~1 s to load |
| Default token lifetime | 7 days |

**Be ready to say these three things, unprompted:**

1. *There is no live GPS tracking — the API reports `live_tracking_available:
   false`.*
2. *No payment can reach `completed` without a gateway, so the revenue figure
   is zero — that is the correct number.*
3. *There are no performance figures, because no load test suite was written.*
