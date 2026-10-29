# WorkStudio Backend - Stage 1

Independent Node.js 24 / TypeScript / Express REST API using the existing local PostgreSQL installation, Prisma, Zod, bcrypt and JWT. No frontend files or future-stage features are implemented.

## Requirements and decisions

Read against `../docs/SRS document.pdf`: GC-1/4/5/6/9, AS-4/7, FR-AUTH-01 through FR-AUTH-08, User section 3.4.1, NFR-SEC-01 through NFR-SEC-06, IR-04/05/09 and section 3.8.

- Registration requires **name, email, password**, with passwords at least **8 characters** (FR-AUTH-01/02). Maximum 72 UTF-8 bytes prevents bcrypt's silent truncation. Passwords are not trimmed.
- Emails are trimmed and lowercased before validation/storage/lookup; uniqueness is enforced in PostgreSQL, including concurrent registrations.
- Public registration rejects unknown properties, including `role`. It always creates `CLIENT`.
- AS-7 requires verification **before booking**, not before login. Unverified users can log in and read their own profile. `requireVerifiedEmail` is provided for future booking routes; bookings are not implemented.
- JWTs expire after 8 hours by default. Database sessions also expire after 30 minutes without an authenticated request (FR-AUTH-07). No refresh-token flow: log in again. Logout invalidates only the current session, immediately for subsequent requests; other sessions remain active.
- These timeouts, verification expiry (24 hours), and login limits are configurable implementation defaults, not durations specified by the SRS.
- Five failed logins within a rolling 15-minute inactivity window block that account for 15 minutes (FR-AUTH-08). Counters and locks persist in PostgreSQL and serialize concurrent attempts. A successful login resets counters; an expired block starts a new count.
- Additional per-IP limits use process memory: all requests 300/15 minutes; login and verification together 100/15 minutes; registration 10/hour; resend 10/hour. They reset on process restart. The account login limit remains effective across restarts and instances.
- Only bcrypt password hashes and SHA-256 token digests are stored in the database. Raw JWTs and verification tokens are never logged. Roles and verification status come from the database on each authenticated request.
- Optional Google login and integrations are excluded.

The SRS does not choose a database product; PostgreSQL/Prisma are explicitly selected by the project instructions. The frontend demo accepts 6-character passwords; integration must use the SRS minimum of 8. NFR-MNT-03 specifies automated coverage: that remains QA acceptance work because this task explicitly forbids creating an automated suite.

## Folder structure and important files

```text
backend/
  .env.example                 configuration reference (no secrets)
  .gitignore                   excludes .env, generated client, build and dependencies
  package.json / package-lock.json
  tsconfig.json
  prisma.config.ts             migration URL, restricted to workstudio_db/public
  prisma/
    schema.prisma              User, Session, EmailVerificationToken and Role
    migrations/
      migration_lock.toml
      20261029000000_stage1_auth/migration.sql
  scripts/
    check-database.ts
    create-admin.ts            operator-only administrator provisioning
  src/
    app.ts / server.ts         middleware, startup, TLS and shutdown
    config/                    validated environment and database URL
    controllers/               HTTP handlers
    db/                        Prisma PostgreSQL adapter
    middleware/                authentication, roles, email gate, security, errors
    routes/                    auth, health and administrator session check
    services/                  authentication, email delivery and profile retrieval
    types/                     authenticated Express request type
    utils/                     token hashing and safe error reporting
    validation/                Zod request schemas
    generated/prisma/          generated locally; ignored by Git
  docs/
    API.md                     endpoint contracts and examples
    requests.http              manual request examples
    VERIFICATION.md            performed checks and QA checklist
```

## Install and configure

Use Node.js **24.14 or newer within the 24.x LTS line**. Prisma 7.10.1 is pinned; do not switch to the Prisma 8 release candidate. All runtime dependencies are pinned and the lock file records the complete installation.

From the repository root:

```powershell
cd backend
npm ci
# Only if .env does not already exist:
Copy-Item .env.example .env
# Generate a random secret and put its output in JWT_SECRET (do not commit or log it):
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

A local ignored `.env` was created during implementation with a generated JWT secret and an initially empty `DATABASE_URL`. Preserve any values already configured. Put the actual connection URL in `.env`:

```dotenv
DATABASE_URL=postgresql://YOUR_USER:YOUR_URL_ENCODED_PASSWORD@YOUR_HOST:YOUR_PORT/workstudio_db
```

Use the same PostgreSQL host, port, role and password that work in DBeaver. The role needs connection and schema/table creation rights on **workstudio_db**. Do not assume default credentials. Percent-encode special characters in the username/password. The app and Prisma config reject URLs naming another database or a non-public schema. A PostgreSQL DBA/operator must create the database or grant privileges if missing; no database installation, Docker setup, role creation, reset or unrelated-database changes are performed by this project.

Environment variable validation reports field names, never secret values. Missing/invalid database credentials prevent normal server startup. Keep `.env` private and out of Git. Application and Prisma commands must be run from `backend/`.

## Migrations and database connectivity

The initial SQL migration creates `Role`, `User`, `Session`, and `EmailVerificationToken`, unique email/token indexes and user foreign keys. Prisma assigns UUIDs. No workspace, tariff, booking or payment tables are created.

```powershell
npm run db:validate
npm run prisma:generate
npm run db:migrate
npm run db:status
npm run db:check
```

`db:migrate` uses **prisma migrate deploy**, which applies the committed migration without a shadow database or database reset. It creates Prisma's `_prisma_migrations` tracking table. If the database already contains conflicting tables or existing data, stop and reconcile/baseline the schema with the operator; do not run `migrate reset` or accept destructive reset prompts.

Future authorized schema changes should use `npx prisma migrate dev --name DESCRIPTION` in a development database with appropriate shadow-database privileges. Review the generated SQL and commit the schema and migration together. This is not required to apply the existing Stage 1 migration.

In **DBeaver**:

1. Open the existing PostgreSQL connection, or create a PostgreSQL connection using your actual host, port, database `workstudio_db`, username and password.
2. Test Connection, then connect. After applying the migration, refresh the navigator.
3. Expand `workstudio_db > Schemas > public > Tables`. Expect `User`, `Session`, `EmailVerificationToken` and `_prisma_migrations`. The `Role` enum is under data types.
4. Inspect user roles, verification timestamps and session expiry. Treat password/token hashes as sensitive; do not share them in screenshots. Table names are case sensitive in SQL: quote `"User"` and other capitalized names.

## Start

```powershell
npm run dev
```

Production build and start:

```powershell
npm run build
npm start
```

The server checks PostgreSQL and the User table before accepting requests. Default development base URL: `http://127.0.0.1:3000/api`. `GET /api/health` returns 200 when PostgreSQL responds and 503 when unavailable after startup. SIGINT/SIGTERM close the listener and database pool.

## Email verification

The selected local setting is `EMAIL_TRANSPORT=preview`. Registration (and resend for an unverified account) returns `emailDelivery.status=development_preview` and `verificationUrl`. **No real email is sent.** Open that URL or submit its token to `POST /api/auth/verify-email`. The preview is returned only in development; it is never written to disk/logs. Anyone with the link can confirm the account, so never use preview mode in a shared/public deployment.

For actual delivery set `EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, and your provider's `SMTP_USER`/`SMTP_PASSWORD` in the environment. TLS certificates are verified; SMTP requires implicit TLS or STARTTLS. Configure the public API URL so confirmation links reach this backend. SMTP acceptance is reported accurately, not as guaranteed inbox delivery. If sending fails after account creation, registration still returns 201 with `emailDelivery.status=failed`; the account exists and resend can recover it.

Tokens expire after 24 hours by default, are single-use, and are stored only as SHA-256 digests. Resending replaces the previous token. Verification sets `emailVerifiedAt` and consumes the token atomically.

## Initial administrator

Only the system operator runs this command locally; there is no public administrator registration or promotion endpoint.

1. Temporarily set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the ignored `.env` or process environment. Use a strong unique password meeting the registration policy.
2. Run `npm run admin:create`.
3. Remove `ADMIN_PASSWORD` and other provisioning values afterward.
4. Log in normally, then call `GET /api/admin/session` with its Bearer token.

The script creates a new administrator only. An existing email is refused; an existing client is never promoted or overwritten. Administrators are not falsely marked email-verified: they may request a confirmation link through resend. Email verification does not gate the Stage 1 administrator session check.

## HTTPS and deployment

GC-5 and NFR-SEC-01 require HTTPS. The default loopback HTTP URL is a **local development configuration, not an SRS-compliant deployed transport**. For encrypted local operation configure `TLS_CERT_PATH` and `TLS_KEY_PATH`, trust the certificate on the client, and use an HTTPS `PUBLIC_API_URL`.

Production configuration requires `NODE_ENV=production`, SMTP, HTTPS public URL and HTTPS CORS origins, plus either direct TLS certificate/key paths or an HTTPS reverse proxy with an accurately configured `TRUST_PROXY_HOPS`. Production requests recognized as insecure are rejected. A reverse proxy must sanitize forwarded headers; block direct access to the backend port, and use an encrypted/private loopback upstream. Do not enable arbitrary proxy trust. Configure PostgreSQL transport encryption for remote connections. No TLS certificates or production infrastructure are provisioned here.

## React, Android and QA handoff

See [API contracts and examples](docs/API.md), [manual requests](docs/requests.http), and [verification record](docs/VERIFICATION.md).

The React app currently uses demo state in `AuthPage.tsx`/`App.tsx`. Its `services/api.ts` wrapper reads `VITE_API_BASE_URL` but is not wired to those forms. Its stored `ws-demo-user` data has no backend authority. Future frontend work must call these endpoints, add Bearer authorization, handle envelopes/401/403/429, require an 8-character password, implement confirmation feedback, and obtain the current role/profile from the API. No integration was made.

React should keep access tokens in memory for this selected Bearer approach, avoid browser localStorage for sensitive tokens, and sign in again after reload/expiry unless a separate secure storage design is agreed. Android should use platform-protected storage and never logs/backups for tokens. Both applications must call logout before discarding a session token; deleting a local token alone does not invalidate a server session. Do not attach tokens to third-party requests. On 401 show login; on 403 show permission/verification feedback; on 429 respect Retry-After.

Deployment requirements such as automated backups, uptime/recovery targets, formal coverage and performance acceptance remain team/operations work and are not claimed as verified by this foundation.

## Next stage

Stage 2 remains workspace and tariff models, administrator management, operational status, availability queries and tariff retrieval. No Stage 2 schema or endpoints have been added. The later SRS inconsistencies around cancellation/expiration terminology should be clarified before booking/payment stages; Stage 1 does not decide that behavior.
