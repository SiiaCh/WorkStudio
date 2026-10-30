# WorkStudio Backend API

Base path: `/api`. Requests use UTF-8 JSON (`Content-Type: application/json`). Success envelopes are `{"data":...}`; errors are `{"error":{"code":"...","message":"...","details":...}}`. `details` is optional. Timestamp fields use ISO 8601 UTC; date-only and clock-time inputs use the facility timezone. Currency amounts are decimal strings in responses. All responses use `Cache-Control: no-store`. Local examples use development HTTP on loopback; use HTTPS in deployment.

## Authentication endpoints

| Method | Path | Authentication | Success |
| --- | --- | --- | --- |
| GET | /api/health | Public | 200 database reachable; 503 unavailable |
| POST | /api/auth/register | Public, IP limited | 201 account created |
| GET | /api/auth/verify-email?token=TOKEN | Single-use email token | 200 confirmed |
| POST | /api/auth/verify-email | Single-use email token in JSON | 200 confirmed |
| POST | /api/auth/resend-verification | Public, IP limited | 202 generic confirmation |
| POST | /api/auth/login | Public, account/IP limited | 200 Bearer token and own profile |
| POST | /api/auth/logout | Active Bearer token | 200 current session invalidated |
| GET | /api/auth/me | Active Bearer token | 200 own profile only |
| GET | /api/admin/session | Active administrator Bearer token | 200 administrator's own profile |

`/api/admin/session` returns the authenticated administrator's own profile. No public user-ID lookup endpoint is exposed. Unverified clients can log in and read their profile, but must confirm their email before creating bookings.

## Register

`POST /api/auth/register`:

```json
{"name":"QA Client","email":"qa.client@example.com","password":"WorkStudio-example-password!"}
```

Name is required, trimmed, 1-100 characters. Email is trimmed, normalized to lowercase, validated, and limited to 254 characters. Password is at least 8 characters and at most 72 UTF-8 bytes; whitespace is significant. Unknown properties, including `role`, are rejected with 400. No plaintext password/hash is returned.

201 in the selected development preview mode:

```json
{
  "data": {
    "user": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "QA Client",
      "email": "qa.client@example.com",
      "role": "CLIENT",
      "emailVerifiedAt": null,
      "createdAt": "2026-10-29T10:00:00.000Z"
    },
    "emailDelivery": {
      "status": "development_preview",
      "message": "No email was sent. Open this development-only link to verify.",
      "verificationUrl": "http://127.0.0.1:3000/api/auth/verify-email?token=REPLACE_WITH_64_HEX_CHARACTERS"
    }
  }
}
```

The example UUID/date are illustrative. SMTP mode returns `accepted_by_smtp` or `failed` with an explanation, never a preview link. A failed email send does not roll back the account; use resend. Duplicate email, including case variants, returns 409 `EMAIL_ALREADY_REGISTERED`. Invalid fields return 400 `VALIDATION_ERROR`.

## Verify email and resend

Open the supplied GET confirmation URL, or send:

`POST /api/auth/verify-email`:

```json
{"token":"COPY_THE_64_CHARACTER_HEX_TOKEN_FROM_THE_LINK"}
```

200: `{"data":{"message":"Your email address has been confirmed."}}`.

Malformed tokens return 400 `VALIDATION_ERROR`; unknown/consumed tokens return 400 `INVALID_VERIFICATION_TOKEN`; an expired or concurrently replaced/consumed token returns 400 `EXPIRED_VERIFICATION_TOKEN`. Verification is atomic, single-use, and sets the user's verification timestamp. GET returns JSON; it does not render or redirect to a frontend page.

`POST /api/auth/resend-verification`:

```json
{"email":"qa.client@example.com"}
```

202: `{"data":{"message":"If this address belongs to an unverified account, a new confirmation link has been requested."}}`.

Development preview additionally includes `data.emailDelivery.verificationUrl` for existing unverified accounts. In SMTP mode the response is generic even if delivery failed; failures are logged without token/recipient data. Existing confirmed and unknown accounts also receive the generic response. A successful resend replaces the prior token, so use the latest email/link. No registration retry is necessary.

## Login

`POST /api/auth/login`:

```json
{"email":"qa.client@example.com","password":"WorkStudio-example-password!"}
```

200:

```json
{
  "data": {
    "accessToken": "JWT_RETURNED_BY_LOGIN",
    "tokenType": "Bearer",
    "expiresAt": "2026-10-29T18:00:00.000Z",
    "idleTimeoutSeconds": 1800,
    "user": {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "QA Client",
      "email": "qa.client@example.com",
      "role": "CLIENT",
      "emailVerifiedAt": "2026-10-29T10:01:00.000Z",
      "createdAt": "2026-10-29T10:00:00.000Z"
    }
  }
}
```

Wrong email or password: 401 `INVALID_CREDENTIALS`, with the same message for both. Unknown fields or malformed bodies return 400. A correct password does not bypass an active account block. Account throttling: 429 `LOGIN_TEMPORARILY_LIMITED`, `Retry-After` header, and `error.details.retryAfterSeconds`. IP throttling returns 429 `TOO_MANY_REQUESTS`.

## Protected routes and logout

Use `Authorization: Bearer JWT_RETURNED_BY_LOGIN`. Tokens must not be supplied as query parameters, request-body fields or cookies. Roles in request bodies or JWT payload alterations never grant authority.

`GET /api/auth/me` returns `{"data":{"user":{...}}}` with the same public user fields shown above. It returns only the authenticated user's profile; no password hash or other clients' data is exposed. Additional query fields cannot select a different user.

`GET /api/admin/session` returns that same envelope for administrators. A client receives 403 `FORBIDDEN`. An unauthenticated request receives 401.

`POST /api/auth/logout` with JSON `{}` and the Bearer header returns:

```json
{"data":{"message":"This session has been signed out."}}
```

Reusing that token on any protected endpoint then returns 401 `UNAUTHENTICATED`, including a repeated logout. Other login sessions remain valid. Missing, altered, expired, inactive or logged-out tokens return 401 and `WWW-Authenticate: Bearer`. JWT algorithm, signature, issuer, audience, expiry and required claims are checked before the live database session check. There are no refresh tokens.

## Health and common errors

`GET /api/health`: 200 `{"data":{"status":"ok","database":"reachable"}}`. Once running, loss of database connectivity returns 503 `DATABASE_UNAVAILABLE`. Normal server startup checks database connectivity and the User and Booking tables.

- 400: field validation, invalid JSON, invalid/expired verification token, or insecure production transport.
- 401: invalid credentials, missing/invalid/inactive token.
- 403: role denied or disallowed browser origin.
- 404: unknown route.
- 409: duplicate registration, catalog-name conflicts, booking conflicts, stale versions, or idempotency conflicts.
- 413: body larger than 16 KB.
- 415: missing/wrong JSON Content-Type or unsupported compression/encoding.
- 429: IP or account limit; observe Retry-After.
- 500: unexpected server/database failure; internal details are logged safely and never returned.
- 503: database unavailable on health check or temporary resource contention.

Validation error example:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Check the submitted fields.","details":[{"field":"password","message":"Too small: expected string to have >=8 characters"}]}}
```

Use error codes as the stable application contract; human-readable validation messages may change with Zod. CORS allows only configured origins and the Content-Type/Authorization/Idempotency-Key headers. CORS is not authentication; Android and non-browser clients still need Bearer tokens.

## PowerShell walkthrough

Run the backend first with the configured database, then execute these requests in a separate PowerShell terminal. These are manual examples, not an automated test suite.

```powershell
$api = "http://127.0.0.1:3000/api"
$registrationBody = @{
  name = "QA Client"
  email = "qa.client@example.com"
  password = "WorkStudio-example-password!"
} | ConvertTo-Json
$registration = Invoke-RestMethod "$api/auth/register" -Method Post -ContentType "application/json" -Body $registrationBody

# Development preview only: use the returned URL without printing the token.
$confirmation = Invoke-RestMethod $registration.data.emailDelivery.verificationUrl

$loginBody = @{
  email = "qa.client@example.com"
  password = "WorkStudio-example-password!"
} | ConvertTo-Json
$login = Invoke-RestMethod "$api/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$authHeaders = @{ Authorization = "Bearer " + $login.data.accessToken }
Invoke-RestMethod "$api/auth/me" -Headers $authHeaders
# A client should receive HTTP 403 here:
Invoke-RestMethod "$api/admin/session" -Headers $authHeaders
Invoke-RestMethod "$api/auth/logout" -Method Post -ContentType "application/json" -Body "{}" -Headers $authHeaders
# The logged-out token should now receive HTTP 401:
Invoke-RestMethod "$api/auth/me" -Headers $authHeaders
```

Use a new disposable email when repeating registration. Avoid sharing terminal output containing tokens, links or private user information.

## Booking rules

- Unpaid holds become **CANCELLED** with **PAYMENT_TIMEOUT** when their original deadline is reached. The default hold is 15 minutes, configurable with BOOKING_HOLD_MINUTES. There is no EXPIRED status.
- Tariffs are fixed positive UAH amounts per occurrence. The selected tariff name and amount are snapshotted at booking creation; later catalog edits do not reprice reservations.
- Only administrators can edit or cancel bookings. Clients can retrieve only their own bookings and notifications.
- Facility-local dates and hours are interpreted in the configured IANA timezone; booking instants are stored in UTC.
- The calendar defaults to the current month and supports explicit date bounds for day, week or month views.

## Facility configuration and request limits

Add or customize these environment variables in the ignored backend/.env:

```dotenv
FACILITY_TIME_ZONE=Europe/Kyiv
FACILITY_OPENING_HOURS='{"MON":{"open":"08:00","close":"22:00"},"TUE":{"open":"08:00","close":"22:00"},"WED":{"open":"08:00","close":"22:00"},"THU":{"open":"08:00","close":"22:00"},"FRI":{"open":"08:00","close":"22:00"},"SAT":{"open":"08:00","close":"22:00"},"SUN":{"open":"08:00","close":"22:00"}}'
BOOKING_HOLD_MINUTES=15
RESERVATION_SWEEP_INTERVAL_MS=1000
MAX_RECURRING_OCCURRENCES=366
AVAILABILITY_SUGGESTION_DAYS=14
```

Use single quotes around the JSON value in a dotenv file. Define all seven weekdays; use `null` for a closed day. Each open day has one same-day opening interval; overnight/multiple daily opening windows are not supported by the current configuration format. Missing or ambiguous local times around DST transitions are rejected; timestamps are never silently normalized. Opening hours use HH:mm and the facility timezone, not the browser/host timezone.

The sweep interval must be 100-1000 ms. MAX_RECURRING_OCCURRENCES is a configurable request-size safeguard. Calendar queries are limited to a 366-day range; paginated results allow pageSize 1-100. Availability suggestions search the configured number of following days and return at most three matching dates, explicitly reporting the search horizon.

## Data integrity and retention

| Model | Purpose |
| --- | --- |
| Workspace | Name/type/location/description, operational status, optional normalized map coordinates, version and logical deletion |
| Tariff | Name, Decimal(12,2) price, version and logical deletion |
| Booking | Client/workspace/tariff references, UTC interval, saved names/price, status, immutable hold deadline, cancellation reason, optional series, version |
| BookingSeries | Client, weekdays (Monday=1 through Sunday=7), date period and local occurrence times |
| AuditLog | Administrator/action/resource/timestamp/details, with optional idempotency request hash and original result |
| Notification | Durable client-owned booking-change notification and read timestamp |

These models reference User records. Payment records are not implemented.

Database safeguards include:

- Case-insensitive unique names among non-deleted workspaces/tariffs, positive prices, interval and map-coordinate checks, foreign keys and query indexes.
- A PostgreSQL GiST exclusion constraint on workspaceId and the half-open UTC interval `[startsAt, endsAt)`, applying to PENDING_PAYMENT and CONFIRMED. Adjacent bookings are valid; overlapping active rows are rejected even if a writer bypasses the service.
- A trigger protecting the original tariff/price snapshot, creation time and payment deadline from later mutation. Edits never extend the payment hold.
- Terminal-status and permitted-transition checks; Cancelled bookings require a reason.
- Triggers rejecting audit UPDATE, DELETE and TRUNCATE. No audit mutation endpoint exists. Production database-role/owner privileges still need appropriate operational management; these triggers are not a claim of protection from a database superuser.

Custom exclusion constraints, partial expression indexes and triggers are intentionally recorded in SQL rather than Prisma schema syntax. Preserve them when reviewing future migrations; do not replace migrations with db push.

Deletion is logical: deleted items disappear from the catalog and cannot be selected for new bookings, while foreign keys/history remain intact. Workspace deletion is refused while current/upcoming active bookings exist. Deleting an unused item permits reuse of its name. Payment records are not implemented; when payment processing is introduced, its reference check must prevent deletion of a tariff used by any payment, as required by FR-WTM-09. Logical deletion already preserves the referenced row.

## Administrator mutations and concurrency

Every administrator **mutation** also requires `Idempotency-Key: UUID`. Generate a new UUID for each new intended operation. Retrying exactly the same operation with the same key returns the original response without duplicate changes, audit records or notifications. Reusing the key for a different URL/body returns 409 IDEMPOTENCY_KEY_REUSED. Cached results describe the original action; GET the resource again for current status/version.

Administrator updates/deletes/status changes supply the latest `version`. A stale version returns 409 VERSION_CONFLICT and the current version; refresh and retry with a new operation key. Deletion, booking creation/edit/cancel, and Unavailable status changes require explicit confirmation as shown below.

Workspace rows are locked in UUID order for booking creation, edits, cancellations, status resolution and hold release. Conflict checks, price reads and saves share one transaction, with the exclusion constraint as the final guard. Failed operations leave no partially created booking/series or partially applied status resolution. Lock/contention timeouts return 503 RESOURCE_BUSY with Retry-After; retry administrator operations with their original idempotency key.

CORS allows GET/POST/PATCH/DELETE/OPTIONS and the Idempotency-Key header for configured origins. Availability and notification polling reads have a dedicated 12,000 requests/minute per-IP limit, accommodating a shared coworking network; other request limits are listed below. Client-side authentication and privacy checks remain necessary regardless of CORS.

Non-polling requests are limited to 300 per 15 minutes per IP; login and confirmation requests share 100 per 15 minutes; registration and resend each allow 10 per hour. IP limits use process memory and reset on restart. Account login limits persist in PostgreSQL: by default, five failed attempts within a 15-minute inactivity window block login for 15 minutes. A successful login resets the counter. Session defaults are eight hours absolute expiry and 30 minutes inactivity; verification links expire after 24 hours. These values are configurable through .env.example.

## Catalog, booking and notification endpoints

All paths below are relative to `/api`.

| Method | Path | Access |
| --- | --- | --- |
| GET | /workspaces | Public workspace catalog/map data |
| GET | /workspaces/:id | Public non-deleted workspace |
| GET | /workspaces/availability | Public availability, no client/booking identifiers |
| GET | /tariffs | Authenticated Client or Administrator |
| GET | /admin/workspaces | Administrator |
| GET | /admin/workspaces/:id | Administrator |
| POST | /admin/workspaces | Administrator, idempotency key |
| PATCH | /admin/workspaces/:id | Administrator, key and version |
| DELETE | /admin/workspaces/:id | Administrator, key/version/confirmation |
| GET | /admin/workspaces/:id/affected-bookings | Administrator; affected private bookings and alternative desks |
| PATCH | /admin/workspaces/:id/status | Administrator, key/version; full resolution when Unavailable |
| GET | /admin/tariffs | Administrator |
| POST | /admin/tariffs | Administrator, key |
| PATCH | /admin/tariffs/:id | Administrator, key/version |
| DELETE | /admin/tariffs/:id | Administrator, key/version/confirmation |
| POST | /bookings | Authenticated email-verified Client |
| POST | /bookings/recurring/preview | Authenticated Client; target client must be email-verified |
| POST | /bookings/recurring | Authenticated email-verified Client, confirm=true |
| GET | /bookings/history | Client, own records only |
| GET | /bookings/calendar | Client, own current/upcoming active records |
| GET | /bookings/:id | Client, own record only; another client's reference returns 404 |
| GET | /admin/bookings | Administrator; filtered/paginated list |
| GET | /admin/bookings/:id | Administrator |
| POST | /admin/bookings | Administrator, key; selected owner must be an email-verified Client |
| PATCH | /admin/bookings/:id | Administrator, key/version/confirmation |
| POST | /admin/bookings/:id/cancel | Administrator, key/version/confirmation |
| GET | /notifications | Client, own notifications |
| POST | /notifications/:id/read | Client, own notification; JSON {} |

There is no public administrator provisioning, client cancellation/edit, or booking-confirmation endpoint. There is no price or status field accepted from the client when creating a booking.

## Catalog and map-data examples

POST /admin/workspaces:

```json
{"name":"Desk A1","type":"Desk","location":"Main hall, zone A","description":"Desk next to the window","mapPosition":{"x":0.25,"y":0.40}}
```

The workspace is always created FREE, version 1. mapPosition is optional (or null to clear it), with x/y in [0,1] relative to the frontend team's floorplan. No physical measurements or rendering are assumed. IDs, location, status and optional coordinates are supplied; the React/Android teams provide the visual floorplan. A catalog update cannot change operational status.

PATCH /admin/workspaces/:id can contain any changed catalog fields plus version:

```json
{"version":1,"description":"Desk with a monitor","mapPosition":{"x":0.30,"y":0.40}}
```

POST /admin/tariffs:

```json
{"name":"Standard reservation","price":"150.00"}
```

JSON numeric prices are also accepted when representable with at most two decimal places. Values must be positive and fit Decimal(12,2). PATCH accepts name/price plus version. DELETE uses `{"version":1,"confirm":true}`. Names are trimmed and unique ignoring case among active catalog records.

## Availability for seat selection

`GET /workspaces/availability?date=2026-11-02&startTime=10:00&endTime=11:00`

date is YYYY-MM-DD in the facility timezone; clock values are HH:mm. Supply both startTime and endTime or neither. If supplying times, date is required. Invalid dates, reversed intervals, past dates and intervals outside configured hours are rejected. A same-day interval that has already ended is reported unavailable.

With date only, the response describes availability at opening time on a future date, or now during today's working hours. After closing or on a closed day it reports no current availability and suggests later dates. A currently blocked interval does not automatically imply the desk is unavailable for the whole day; request another interval.

Response excerpt:

```json
{
  "data": {
    "asOf":"2026-11-02T07:00:00.000Z",
    "date":"2026-11-02",
    "facility":{"timeZone":"Europe/Kyiv","openingHours":{"MON":{"open":"08:00","close":"22:00"}},"currency":"UAH"},
    "requestedInterval":{"startsAt":"2026-11-02T08:00:00.000Z","endsAt":"2026-11-02T09:00:00.000Z"},
    "workspaces":[{
      "id":"WORKSPACE_UUID","name":"Desk A1","status":"FREE","location":"Main hall, zone A",
      "mapPosition":{"x":0.25,"y":0.40},"available":true,
      "unavailableReason":null,"availableUntil":"2026-11-02T10:00:00.000Z"
    }],
    "suggestedDates":[],
    "suggestionSearchDays":14,
    "recommendedPollIntervalMs":1000,
    "message":null
  }
}
```

The real facility object contains all seven weekdays and workspace objects contain their remaining public catalog fields. availableUntil is the start of the next blocking booking or closing time, whichever is earlier; it is null for an unavailable requested interval.

UNAVAILABLE blocks every interval until changed. OCCUPIED blocks an interval including the current moment, but permits later free intervals. FREE does not override bookings. Pending Payment bookings block until their payment deadline; Confirmed bookings block their booked intervals. Cancelled/Completed bookings do not. Public responses contain no private client identities or booking references.

The API reads live database state and uses Cache-Control: no-store. Poll this endpoint every second while the selection screen is visible to meet the SRS two-second display target under normal conditions; stop polling when hidden. No WebSocket or UI rendering is implemented. Selecting/previewing a desk **does not reserve it**. Only successful confirmed POST creation creates a hold; always handle a subsequent 409 conflict even if the last availability response was free.

## Booking and lifecycle examples

POST /bookings:

```json
{"workspaceId":"WORKSPACE_UUID","tariffId":"TARIFF_UUID","date":"2026-11-02","startTime":"10:00","endTime":"11:00","confirm":true}
```

201 returns `data.booking` with id/reference, userId, workspaceId/workspaceName, tariffId/tariffName, amount, currency=UAH, date/startTime/endTime/timeZone, startsAt/endsAt (UTC), status=PENDING_PAYMENT, paymentDeadline, cancellationReason=null, version, timestamps and series information.

`paymentStatus=null` and `paymentIntegrationAvailable=false` explicitly mean there is no payment attempt/provider integration. No payment success is simulated.

The owner comes from the authenticated session. Unknown fields such as userId, amount, total, role, paymentStatus or status are rejected. The selected workspace and tariff must still exist in the catalog; the interval must be future, within opening hours and conflict-free. Identity/verification is rechecked in the transaction. Adjacent intervals are allowed.

| Transition | Behavior now |
| --- | --- |
| New client/admin booking -> PENDING_PAYMENT | Implemented; reserves immediately |
| PENDING_PAYMENT -> CANCELLED / PAYMENT_TIMEOUT | Implemented; deadline reached, interval released |
| PENDING_PAYMENT or CONFIRMED -> CANCELLED / ADMINISTRATOR | Implemented administrator action; history retained, notification written |
| CONFIRMED -> COMPLETED | Lifecycle worker supports this after endsAt; no API produces Confirmed yet |
| PENDING_PAYMENT -> CONFIRMED | Deferred until a verified successful LiqPay payment |
| CANCELLED or COMPLETED -> active | Forbidden; create a new booking through a new availability check |

By default, the worker runs every second, with an immediate sweep on startup, and safely settles expired holds and ended Confirmed bookings. Availability ignores an expired hold immediately, even before cleanup. Booking transactions clean up expired holds under the workspace lock before inserting a replacement. History/detail/calendar reads also refresh lifecycle state. Deadlines are fixed at creation and are not extended by editing or retries. Operational workspace status is never automatically changed by booking or expiry.

PATCH /admin/bookings/:id requires the full replacement workspace/date/time plus version and confirm=true. It ignores the booking itself when checking overlaps, preserves owner, price and deadline, and rejects terminal bookings. Moving an already ongoing booking to resolve workspace unavailability preserves its original interval; it is not a general ability to create a past booking.

POST /admin/bookings uses the same creation body plus userId. POST /admin/bookings/:id/cancel uses `{"version":1,"confirm":true}`. Changes write an audit event and durable notification in the same transaction.

## History, calendar and administrator filtering

- GET /bookings/history: optional fromDate, toDate (inclusive local dates), status, page (default 1), pageSize (default 25). Newest booking start first. Returns bookings, total, page, pageSize, and an empty-state message.
- GET /bookings/calendar: optional fromDate/toDate, default current month, maximum 366-day range. Returns fromDate, toDate, ordered current/upcoming PENDING_PAYMENT/CONFIRMED entries and empty-state message. Use explicit ranges for day/week/month navigation.
- GET /bookings/:id: full owned booking and recurring metadata; another client's ID returns 404.
- GET /admin/bookings: filters above plus userId, workspaceId and reference (UUID). Default fromDate is 30 days ago; sort by booking start ascending. To include older history, supply fromDate.
- GET /notifications: page/pageSize; newest first, with event/message/bookingId/readAt. POST /notifications/:id/read with {} is idempotent and cannot acknowledge another client's notification.

Only administrators can see other clients' booking data. No notification emails, native push messages or frontend notification widgets are claimed; the durable notification API is the implemented channel. Poll it while the client's app is active.

## Atomic Unavailable workflow

1. GET /admin/workspaces/:id/affected-bookings. It returns the current workspace/version and every current/upcoming active booking with free alternative workspaces for the same interval.
2. Collect an explicit CANCEL or REASSIGN decision for each booking. If alternatives became stale, refresh and choose again.
3. Submit one PATCH /admin/workspaces/:id/status with a new Idempotency-Key:

```json
{
  "version":3,
  "status":"UNAVAILABLE",
  "confirm":true,
  "resolutions":[
    {"bookingId":"FIRST_BOOKING_UUID","action":"REASSIGN","workspaceId":"ALTERNATIVE_UUID"},
    {"bookingId":"SECOND_BOOKING_UUID","action":"CANCEL"}
  ]
}
```

If any booking is missing, extra, duplicated or cannot be reassigned, nothing from this requested operation is saved. UNRESOLVED_BOOKINGS includes affected records and suggestions. A valid transaction moves/cancels every affected booking, sets Unavailable, records the root status action plus per-booking audit events, and notifies each affected client. Cancellation releases the interval and preserves history; refunds remain outside WorkStudio. Setting FREE or OCCUPIED requires version and status but no booking resolutions, and never changes existing bookings.

## Recurring bookings

POST /bookings/recurring/preview:

```json
{
  "workspaceId":"WORKSPACE_UUID","tariffId":"TARIFF_UUID",
  "fromDate":"2026-11-02","toDate":"2026-11-13",
  "weekdays":[1,3,5],"startTime":"10:00","endTime":"11:00"
}
```

Weekdays are Monday=1 through Sunday=7. Preview creates no hold. It returns canCreate, proposed occurrences, conflicts and alternative workspaces, totalAmount, currency, confirmationRequired and reservationCreated=false.

If conflicts exist, change the settings or explicitly accept an alternative for every conflicting date. Example additions:

```json
{"alternatives":[{"date":"2026-11-04","workspaceId":"ALTERNATIVE_UUID"}],"confirm":true}
```

Submit the full input plus accepted alternatives and confirm=true to POST /bookings/recurring. The server rechecks every date/workspace inside one transaction; it never automatically accepts a suggested alternative. Any conflict returns 409 RECURRING_CONFLICT with dates/options and creates no series/occurrences. Success returns series, all occurrences, totalAmount and UAH. Each occurrence has its own booking/reference/price snapshot and the same initial hold deadline, appears in history/calendar, and starts Pending Payment. Series payment and automatic confirmation are not implemented.

## Catalog and booking error codes

| HTTP | Codes / meaning |
| --- | --- |
| 400 | VALIDATION_ERROR, INVALID_INTERVAL, INVALID_LOCAL_TIME, OUTSIDE_OPENING_HOURS, BOOKING_IN_PAST, DATE_IN_PAST, DATE_OUT_OF_RANGE, INVALID_PERIOD, INVALID_ALTERNATIVE_DATE, RECURRENCE_LIMIT, NO_OCCURRENCES, CONFIRMATION_REQUIRED, INVALID_REASSIGNMENT, UNEXPECTED_RESOLUTIONS |
| 401 | Existing UNAUTHENTICATED / INVALID_CREDENTIALS behavior |
| 403 | FORBIDDEN, EMAIL_NOT_VERIFIED |
| 404 | WORKSPACE_NOT_FOUND, TARIFF_NOT_FOUND, BOOKING_NOT_FOUND, CLIENT_NOT_FOUND, NOTIFICATION_NOT_FOUND |
| 409 | NAME_ALREADY_EXISTS, BOOKING_CONFLICT, WORKSPACE_UNAVAILABLE, WORKSPACE_OCCUPIED_NOW, VERSION_CONFLICT, IDEMPOTENCY_KEY_REUSED, WORKSPACE_HAS_BOOKINGS, UNRESOLVED_BOOKINGS, RECURRING_CONFLICT, BOOKING_TERMINAL, RESOURCE_IN_USE |
| 413/415/429 | Existing JSON-size, media-type and rate-limit errors |
| 503 | RESOURCE_BUSY with Retry-After; health retains DATABASE_UNAVAILABLE |

A missing/malformed Idempotency-Key is a 400 validation error. Availability uses the unavailableReason values WORKSPACE_UNAVAILABLE, WORKSPACE_OCCUPIED_NOW, BOOKING_CONFLICT, FACILITY_CLOSED or INTERVAL_IN_PAST rather than failing the entire catalog query for an unavailable individual desk.

## Payment integration boundary

Payment processing and Payment records are not implemented. The API returns paymentStatus=null and paymentIntegrationAvailable=false; it does not produce successful-payment confirmations.

A future LiqPay integration must use the saved booking amount, verify signed notifications, process duplicates idempotently, allow retries only before the original payment deadline, and reconcile late notifications against terminal/cancelled holds. Only a verified successful payment may change Pending Payment to Confirmed. Expired or cancelled slots must not be silently resurrected. Payment-backed tariff deletion checks and recurring-series settlement semantics must be added with that integration. Refunds remain the operator's responsibility outside the application.

For setup and administrator provisioning, see [README](../README.md). For runnable request examples, see [requests.http](requests.http).
