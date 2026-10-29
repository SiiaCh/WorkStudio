# Stage 1 REST API

Base path: `/api`. Requests use UTF-8 JSON (`Content-Type: application/json`). Success envelopes are `{"data":...}`; errors are `{"error":{"code":"...","message":"...","details":...}}`. `details` is optional. Dates are ISO 8601 UTC. All responses use `Cache-Control: no-store`. Local examples use development HTTP on loopback; use HTTPS in deployment.

## Endpoints

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

`/api/admin/session` is a minimal role check for Stage 1, not an administrator management API. No user-ID lookup endpoint is exposed. Unverified clients can log in and read their profile (AS-7 gates future bookings).

## Register

`POST /api/auth/register`:

```json
{"name":"QA Client","email":"qa.client@example.com","password":"Stage1-example-password!"}
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
{"email":"qa.client@example.com","password":"Stage1-example-password!"}
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

`GET /api/health`: 200 `{"data":{"status":"ok","database":"reachable"}}`. Once running, loss of database connectivity returns 503 `DATABASE_UNAVAILABLE`. Normal server startup requires both database connectivity and the initial User table.

- 400: field validation, invalid JSON, invalid/expired verification token, or insecure production transport.
- 401: invalid credentials, missing/invalid/inactive token.
- 403: role denied or disallowed browser origin.
- 404: unknown route.
- 409: duplicate registration.
- 413: body larger than 16 KB.
- 415: missing/wrong JSON Content-Type or unsupported compression/encoding.
- 429: IP or account limit; observe Retry-After.
- 500: unexpected server/database failure; internal details are logged safely and never returned.
- 503: database unavailable on health check.

Validation error example:

```json
{"error":{"code":"VALIDATION_ERROR","message":"Check the submitted fields.","details":[{"field":"password","message":"Too small: expected string to have >=8 characters"}]}}
```

Use error codes as the stable application contract; human-readable validation messages may change with Zod. CORS allows only configured origins and the Content-Type/Authorization headers. CORS is not authentication; Android and non-browser clients still need Bearer tokens.

## PowerShell walkthrough

Run the backend first with the configured database, then execute these requests in a separate PowerShell terminal. These are manual examples, not an automated test suite.

```powershell
$api = "http://127.0.0.1:3000/api"
$registrationBody = @{
  name = "QA Client"
  email = "qa.client@example.com"
  password = "Stage1-example-password!"
} | ConvertTo-Json
$registration = Invoke-RestMethod "$api/auth/register" -Method Post -ContentType "application/json" -Body $registrationBody

# Development preview only: use the returned URL without printing the token.
$confirmation = Invoke-RestMethod $registration.data.emailDelivery.verificationUrl

$loginBody = @{
  email = "qa.client@example.com"
  password = "Stage1-example-password!"
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
