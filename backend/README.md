# WorkStudio Backend

WorkStudio Backend is the REST API for a coworking workspace reservation and management platform. It centralizes authentication, workspace availability, pricing, and booking rules for the React administrator interface and Android client.

## Technology stack

- **Node.js 24** and **TypeScript**
- **Express** for the REST API
- **PostgreSQL** with **Prisma ORM** and migrations
- **Zod** for request validation
- **JWT**, database-backed sessions, and **bcrypt** for authentication
- **Nodemailer** for SMTP email verification; Helmet, CORS, and rate limiting for API protection

## Features

**Authentication and access**

- Client registration, email verification and resend, login, and session-specific logout.
- Client and Administrator roles, protected profiles, inactivity expiry, and failed-login limits.
- Email verification required before creating bookings or initiating payment attempts.

**Catalog and availability**

- Administrator workspace and tariff management, with logical deletion to preserve history.
- Separate operational statuses: Free, Occupied, and Unavailable.
- Interval availability, available-until times, alternative-date suggestions, and optional map coordinates.
- Configurable facility timezone and weekly opening hours, with UTC timestamp storage.

**Bookings and administration**

- Single and recurring bookings with atomic conflict checks and database-enforced overlap prevention.
- Fixed UAH prices per occurrence, calculated and snapshotted on the server.
- Pending Payment holds, automatic timeout cancellation, private history, and calendar data.
- Administrator edits, cancellations, and atomic resolution of affected bookings before making a workspace Unavailable.
- Version checks, idempotent administrator mutations, append-only audit records, and client-owned notifications.

**Payments for the university demonstration**

- Optional official LiqPay hosted test checkout with sandbox keys, signed callbacks and safe late-result reconciliation.
- Local success/failure mock for offline tests, separately enabled only outside production.
- Per-occurrence payment records, immutable results, idempotent retries and atomic confirmation.
- Failed attempts keep the original hold; confirmed bookings retain the interval until completion/cancellation.

Live payments are not supported. Sandbox LiqPay is opt-in and needs merchant test keys; the local mock stays disabled by default and forbidden in production.

## Prerequisites

- Node.js **24.14.0 or newer within 24.x**, with npm.
- An existing PostgreSQL database named **workstudio_db**, using the **public** schema.
- A migration role with schema/table creation permissions and permission to enable the bundled **btree_gist** extension.

The project uses the existing PostgreSQL installation. It does not provision PostgreSQL, database roles, or Docker.

## Installation and environment

Run commands from `backend/`:

```powershell
cd backend
npm ci
# Preserve an existing local configuration.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit the private `.env` using [.env.example](.env.example) as the configuration reference.

| Setting | Purpose / default |
| --- | --- |
| `DATABASE_URL` | Your PostgreSQL connection URL targeting workstudio_db/public |
| `JWT_SECRET` | A strong random signing secret; replace the example placeholder |
| `HOST`, `PORT` | Listener address; 127.0.0.1 and 3000 |
| `PUBLIC_API_URL` | API origin used in confirmation links; http://127.0.0.1:3000 |
| `CORS_ORIGINS` | Comma-separated allowed browser origins; http://localhost:5173 |
| `EMAIL_TRANSPORT` | preview for the demonstration (including Render), or smtp for delivery |
| `FACILITY_TIME_ZONE` | Europe/Kyiv |
| `FACILITY_OPENING_HOURS` | Weekly JSON schedule; daily 08:00-22:00 by default |
| `BOOKING_HOLD_MINUTES` | Payment hold duration; 15 minutes |
| `MOCK_PAYMENTS_ENABLED` | false; set true explicitly for local mock demonstrations |
| `LIQPAY_TEST_ENABLED` | false; opt-in official sandbox checkout |
| `LIQPAY_PUBLIC_KEY`, `LIQPAY_PRIVATE_KEY` | Both actual sandbox_ merchant test keys; optional for startup |
| `LIQPAY_RESULT_URL` | Optional HTTPS frontend return page |

Use your actual database credentials and percent-encode special characters in connection URL credentials. The configuration rejects other database names and non-public schemas. The automated test runner uses a separately generated temporary test database.

Generate a signing secret and place its output in JWT_SECRET:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep the opening-hours JSON single-quoted in a dotenv file. Define all seven weekdays; use null for a closed day. Session timeouts, login limits, SMTP, TLS, polling and recurrence settings are documented in .env.example and the [configuration and booking guide](docs/API.md).

In preview mode, registration/resend returns a demonstration confirmation link; **no email is sent**. For real delivery, configure EMAIL_TRANSPORT=smtp, SMTP_HOST, SMTP_FROM, the provider's port/TLS settings, and credentials where required.

## Database migrations

```powershell
npm run db:validate
npm run prisma:generate
npm run db:migrate
npm run db:status
npm run db:check
```

db:migrate applies the committed migrations with Prisma Migrate Deploy. It does not reset the database or require a shadow database. db:check verifies connectivity, application tables and booking/payment integrity safeguards.

The schema includes users, sessions, email-verification tokens, workspaces, tariffs, bookings, recurring series, audit records, notifications, and payment attempts. In DBeaver, refresh workstudio_db > Schemas > public > Tables after applying migrations.

For schema changes, use Prisma migrations and review their SQL. Preserve the custom exclusion constraint, partial indexes and triggers. Do not use db push or a database reset to replace the migration history.

## Run the server

Development with automatic reload:

```powershell
npm run dev
```

Compile and run the production build:

```powershell
npm run build
npm start
```

The server checks database connectivity and required tables before listening. The reservation worker starts with the server. SIGINT/SIGTERM close the listener, worker and database connection.

## npm scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run with tsx watch |
| `npm run build` | Generate Prisma Client and compile TypeScript |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:status` | Inspect migration status |
| `npm run db:check` | Verify database connectivity and schema safeguards |
| `npm run admin:create` | Provision a new administrator locally |
| `npm test` | Migrate a fresh isolated database, run native Node tests, then remove it |

## Automated tests

Run `npm test` from backend/. The configured PostgreSQL role needs CREATEDB permission and permission to enable btree_gist in a new database. The runner creates a randomly named workstudio_test_<32 hex characters> database, applies all migrations, runs TypeScript tests through Node's built-in test runner and tsx, and drops only that database afterward. It never resets, truncates or migrates workstudio_db during testing.

The test application refuses the development database URL. Test configuration uses a separate signing secret and fixture accounts, preview email, mock payments, generated LiqPay test-double keys and the documented default facility schedule. No external checkout/payment is performed. Tests exercise real HTTP endpoints, PostgreSQL transactions/constraints, concurrent requests and the expiry worker. If PostgreSQL cannot create the isolated database, the command fails without falling back to development data. An interrupted run may leave the printed test database for manual removal; confirm its exact name before removing it.

## API and documentation

Default local API base URL: **http://127.0.0.1:3000/api**.

- `GET /api/health` checks database reachability.
- Protected endpoints use `Authorization: Bearer TOKEN`.
- Requests use JSON; responses use consistent data/error envelopes.
- Administrator mutations require a UUID Idempotency-Key; updates/deletes also use the current record version.

Detailed contracts and examples:

- [REST API reference](docs/API.md)
- [REST Client request examples](docs/requests.http)

## Render demonstration deployment

The existing API origin is **https://workstudio-api.onrender.com** (base path /api), with Neon PostgreSQL. Keep existing Render build/start commands, Node.js 24, DATABASE_URL, JWT secret, HTTPS/CORS configuration and proxy settings. Package scripts are unchanged.

Before deploying this update, run `npm run db:migrate` against the intended Neon database through the team's existing migration/deployment process. The additive migration 20261101000000_liqpay_test preserves existing bookings/payment history and adds sanitized callback records and provider metadata. Do not run db push/reset. This repository change does not deploy the service or apply its migration to the main Neon database automatically.

| Render variable | Value |
| --- | --- |
| NODE_ENV | production |
| HOST | 0.0.0.0; keep Render's supplied PORT |
| PUBLIC_API_URL | https://workstudio-api.onrender.com |
| TRUST_PROXY_HOPS | 1 for the existing HTTPS-terminating Render proxy |
| EMAIL_TRANSPORT | preview is supported; SMTP is optional |
| MOCK_PAYMENTS_ENABLED | false |
| LIQPAY_TEST_ENABLED | false until ready; true explicitly enables test checkout |
| LIQPAY_PUBLIC_KEY | Actual sandbox_ public key from the LiqPay business account |
| LIQPAY_PRIVATE_KEY | Actual sandbox_ private key; Render secret only |
| LIQPAY_RESULT_URL | Optional HTTPS frontend return page; omit until a real page exists |

Keep CORS_ORIGINS set to the actual HTTPS frontend origin(s). The callback is https://workstudio-api.onrender.com/api/payments/liqpay/callback; no extra callback URL setting or SMTP credentials are required. Missing/invalid LiqPay credentials produce a clear 503 only on payment operations; startup and /api/health remain available. Live keys are rejected even with NODE_ENV=production.

Preview email returns a confirmation link and sends no email; it does not verify inbox ownership. The demonstration may run this way in production mode without weakening JWT, session, RBAC, HTTPS or signature checks. Local mock payments remain forbidden in production.

[Render Free services can sleep after inactivity](https://render.com/docs/free). Cold starts and sleeping workers can delay callbacks and cleanup. Deadlines remain absolute, are rechecked when processing resumes, and are never extended to cover a cold start. The free demonstration is not a payment-service uptime guarantee; provider callbacks and operator reconciliation require manual sandbox validation. No real money is supported.

## Administrator provisioning

There is no public administrator registration. The operator provisions a new account using the CLI:

1. Temporarily set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in the private .env or process environment.
2. Run `npm run admin:create`.
3. Remove the provisioning values afterward, especially ADMIN_PASSWORD.
4. Log in through the normal authentication endpoint.

The script refuses an existing email and never promotes or overwrites an existing client. Passwords must contain at least eight characters and fit bcrypt's 72-byte limit. Administrators are not automatically marked email-verified; they can use the resend-verification endpoint.

## Development and security notes

- Keep .env files, credentials, tokens, node_modules, compiled output and generated Prisma files out of Git. Commit .env.example, package-lock.json, the schema and migrations.
- Use loopback HTTP only for local development. Production requires HTTPS, HTTPS public/CORS origins, and direct TLS or an accurately configured trusted reverse proxy.
- Store bearer tokens securely and call logout to invalidate a session. Do not log passwords, raw tokens or confirmation links.
- Expired unpaid holds become CANCELLED with PAYMENT_TIMEOUT; editing or retrying does not extend their original deadline. Clients cannot edit or cancel bookings.
- Notifications are durable API records, not email or native push delivery. Logical deletion retains booking and audit history.
- LiqPay checkout/callback and TC-08 session/frontend contracts are documented in docs/API.md. Automated signed fixtures are not proof of a merchant sandbox transaction.
- Native Node automated tests and manual request examples cover the API. No additional testing framework is required.
