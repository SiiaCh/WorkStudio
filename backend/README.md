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
- Email verification required before creating bookings.

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

Bookings start as Pending Payment. Payment processing is not integrated, and no API automatically confirms unpaid bookings.

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
| `EMAIL_TRANSPORT` | preview for local use, or smtp for delivery |
| `FACILITY_TIME_ZONE` | Europe/Kyiv |
| `FACILITY_OPENING_HOURS` | Weekly JSON schedule; daily 08:00-22:00 by default |
| `BOOKING_HOLD_MINUTES` | Payment hold duration; 15 minutes |

Use your actual database credentials and percent-encode special characters in connection URL credentials. The configuration rejects other database names and non-public schemas.

Generate a signing secret and place its output in JWT_SECRET:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Keep the opening-hours JSON single-quoted in a dotenv file. Define all seven weekdays; use null for a closed day. Session timeouts, login limits, SMTP, TLS, polling and recurrence settings are documented in .env.example and the [configuration and booking guide](docs/API.md).

In preview mode, registration/resend returns a development confirmation link; **no email is sent**. For real delivery, configure EMAIL_TRANSPORT=smtp, SMTP_HOST, SMTP_FROM, the provider's port/TLS settings, and credentials where required.

## Database migrations

```powershell
npm run db:validate
npm run prisma:generate
npm run db:migrate
npm run db:status
npm run db:check
```

db:migrate applies the committed migrations with Prisma Migrate Deploy. It does not reset the database or require a shadow database. db:check verifies connectivity, application tables, and the booking exclusion constraint.

The schema includes users, sessions, email-verification tokens, workspaces, tariffs, bookings, recurring series, audit records, and notifications. In DBeaver, refresh workstudio_db > Schemas > public > Tables after applying migrations.

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

## API and documentation

Default local API base URL: **http://127.0.0.1:3000/api**.

- `GET /api/health` checks database reachability.
- Protected endpoints use `Authorization: Bearer TOKEN`.
- Requests use JSON; responses use consistent data/error envelopes.
- Administrator mutations require a UUID Idempotency-Key; updates/deletes also use the current record version.

Detailed contracts and examples:

- [REST API reference](docs/API.md)
- [REST Client request examples](docs/requests.http)

## Administrator provisioning

There is no public administrator registration. The operator provisions a new account using the CLI:

1. Temporarily set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in the private .env or process environment.
2. Run `npm run admin:create`.
3. Remove the provisioning values afterward, especially ADMIN_PASSWORD.
4. Log in through the normal authentication endpoint.

The script refuses an existing email and never promotes or overwrites an existing client. Passwords must contain at least eight characters and fit bcrypt's 72-byte limit. Administrators are not automatically marked email-verified; they can use the resend-verification endpoint.

## Development and security notes

- Keep .env files, credentials, tokens, node_modules, compiled output and generated Prisma files out of Git. Commit .env.example, package-lock.json, the schema and migrations.
- Use loopback HTTP only for local development. Production requires HTTPS, SMTP, HTTPS public/CORS origins, and direct TLS or an accurately configured trusted reverse proxy.
- Store bearer tokens securely and call logout to invalidate a session. Do not log passwords, raw tokens or confirmation links.
- Expired unpaid holds become CANCELLED with PAYMENT_TIMEOUT; editing or retrying does not extend their original deadline. Clients cannot edit or cancel bookings.
- Notifications are durable API records, not email or native push delivery. Logical deletion retains booking and audit history.
- Manual request examples are provided for QA. No automated test framework is configured.
