# Stage 1 verification record

Date: 29 October 2026. This is a record of development checks and a manual QA handoff, not an automated test suite.

## Completed

| Check | Result |
| --- | --- |
| Read root AGENTS.md and relevant SRS sections | Completed, including full authentication/password/inactivity requirements and AS-7 |
| Inspect React frontend | Demo authentication/local state identified; no frontend modifications |
| Dependency installation | npm install succeeded; npm reported 0 vulnerabilities |
| Prisma SQL migration generation | Generated from empty schema without connecting to or modifying a database |
| Prisma schema validation | npm run db:validate passed |
| Prisma client generation | Passed using Prisma 7.10.1 |
| Production compilation | npm run build passed |
| TypeScript checking | npm run typecheck passed |
| Manual runtime validation probes | Names/emails normalize; malformed email, short password, empty name, 73-byte password and role injection rejected |
| Manual bcrypt probe | Hash/compare succeeds for matching password, rejects another password |
| Manual token/JWT probes | Random token validates; digest format passes; JWT signing/verification works and wrong issuer is rejected |
| Git boundary/ignore checks | No frontend diff; backend .env, node_modules, dist and generated client are ignored |

The manual runtime probes ran directly in the terminal against compiled validation/utility code and installed bcrypt/JWT libraries. They did **not** exercise HTTP authentication or PostgreSQL, and no test files/frameworks were added.

## Completed live verification

The initial migration was successfully applied to the user's existing **workstudio_db** on local PostgreSQL. `npm run db:status` reported the database up to date and `npm run db:check` confirmed connectivity and User-table access. The compiled server started through `npm start` on port 3000 in development preview mode.

A one-off terminal walkthrough completed **48 HTTP checks**, plus direct database assertions and the operator CLI checks below. No test framework or persistent automated test suite was added.

| Check | Actual result |
| --- | --- |
| GET health | 200, database reachable |
| Missing authentication | 401 UNAUTHENTICATED |
| Invalid email, short password, public role injection | 400 VALIDATION_ERROR |
| Registration | 201; CLIENT role; initially unverified; explicit development preview |
| Password storage | bcrypt digest matched the password; plaintext was not stored |
| Verification/session token storage | SHA-256 digests matched the raw tokens; raw values were not stored |
| Duplicate email with changed case | 409 EMAIL_ALREADY_REGISTERED |
| Wrong password and unknown email | Both 401 INVALID_CREDENTIALS with identical general messages |
| Login before email confirmation | 200; unverified profile preserved as required by AS-7 |
| Own-profile privacy | 200 own profile; a supplied different user ID did not select other data; no passwordHash |
| Client on administrator route | 403 FORBIDDEN |
| Malformed / unknown verification token | 400 VALIDATION_ERROR / INVALID_VERIFICATION_TOKEN |
| Resend | 202; previous link rejected; new link accepted |
| Confirmation and token reuse | First confirmation 200; repeat 400; profile showed verification timestamp |
| GET confirmation link | 200; address confirmed |
| Expired verification token | 400 EXPIRED_VERIFICATION_TOKEN |
| Logout | 200; token subsequently rejected with 401, including repeated logout |
| Separate session after another session's logout | Remained usable with 200 |
| Inactive session | 401 after simulating inactivity on the newly created QA session |
| Expired database session | 401 after simulating expiry on the newly created QA session |
| Cryptographically signed expired JWT / altered JWT | Both 401 |
| Failed-login limit | Four failures 401; fifth 429; correct password also 429 while blocked; Retry-After present |
| Persistent account limit state | Counter and blocked-until timestamp confirmed in PostgreSQL |
| Block expiration and successful-login reset | Login 200 after simulating the QA block's expiry; persisted counters reset |
| Operator CLI with existing client email | Refused with exit code 1; client role unchanged |
| Operator CLI creating new administrator | Exit code 0; ADMINISTRATOR role; not falsely marked verified |
| Administrator on administrator route | 200 with own administrator profile |
| Malformed JSON / oversized body | 400 INVALID_JSON / 413 PAYLOAD_TOO_LARGE |
| Wrong Content-Type / disallowed origin / unknown route | 415 / 403 / 404 |

Only two newly created, uniquely named QA accounts were used. They were removed after the walkthrough; related sessions and verification tokens cascaded. No pre-existing accounts were modified or deleted. Passwords, JWTs and verification links were not printed.

**Verification limits:** inactivity, database-session expiry, verification-token expiry and block expiry were exercised by changing timestamps only on those temporary QA records, rather than waiting for default durations. Persistence was inspected in PostgreSQL; a server-restart lockout experiment and distributed-load/concurrency acceptance tests were not performed. The walkthrough checked rejection/permissions and lifecycle behavior; it is not proof of production performance or formal security acceptance.

## Checks still pending or intentionally not configured

- Actual SMTP delivery and mailbox arrival: not performed; the user selected development preview.
- Production HTTPS certificates, reverse-proxy behavior, remote-database TLS and deployed browser/Android integration: not provisioned or verified.
- Database outage/recovery behavior during a running service: code implemented but no service disruption was introduced.
- Formal automated coverage, sustained-load/concurrency testing, uptime, backups and recovery targets: remain QA/operations work.

## Manual QA sequence after configuration

Use a disposable account on the development database. Keep emails, passwords, verification links and tokens private. Record actual status codes and behavior.

1. Run `npm ci`, `npm run build`, `npm run db:validate`, `npm run db:migrate`, `npm run db:status`, `npm run db:check`.
2. Start `npm run dev` or `npm start`; call GET /api/health and expect 200 plus database reachable. Missing database/table/configuration should prevent normal startup. A later database outage should return 503 on health.
3. POST /api/auth/register with name/email/password. Expect 201, CLIENT, emailVerifiedAt=null, public profile fields only, and a development preview link. Check that the password is a bcrypt hash in DBeaver without copying it into a report.
4. Invalid email, password shorter than eight characters, >72 UTF-8 bytes, empty name, extra fields and role=ADMINISTRATOR should return 400. Reusing email/case variants should return 409. Concurrent identical registrations should create one user.
5. Login before confirmation should work and show emailVerifiedAt=null; verification is a future-booking prerequisite, not a login prerequisite.
6. Follow the preview link or POST its token. Expect 200; GET /auth/me with an active token should show the verification timestamp. Token reuse and random/invalid tokens should return 400.
7. For a separate unverified disposable user, request a resend and check that the old link fails and the new link succeeds. Use a one-minute EMAIL_VERIFICATION_TTL_MINUTES and let a new token expire to check expiration without editing real accounts. Restore defaults afterward.
8. Compare wrong-password and nonexistent-email responses: both 401 with the same general INVALID_CREDENTIALS message. A valid login returns a JWT, role, expiry and idle timeout.
9. GET /auth/me without a token, with a malformed/altered token, and with a token in a query parameter should return 401. An authenticated user sees only their profile even if another user ID is added to the query.
10. GET /admin/session with a client token should return 403. Provision a disposable administrator through the operator CLI, log in and expect 200. Reusing an existing client's email in the CLI must fail without promoting/changing that client.
11. Create two sessions. Logout one; GET /auth/me with that token should return 401 and the other token should still work. A second logout with the revoked token should return 401.
12. Set SESSION_IDLE_MINUTES=1 temporarily, log in, wait over one minute without authenticated requests, and expect 401. With regular authenticated activity, verify the session remains usable until its absolute JWT expiry. Set SESSION_TTL_MINUTES=1 separately to check absolute expiry; restore defaults.
13. Use a separate disposable account for failed-login throttling: the first four wrong-password requests return 401, the fifth returns 429 with Retry-After, and a correct password remains blocked until the configured block ends. Restart the server and confirm the account block persists. After expiry, valid login succeeds and resets counters.
14. Check malformed JSON (400), missing/wrong Content-Type (415), oversized JSON (413), unknown endpoint (404), unknown CORS origin (403), and consistent JSON error envelopes without stack traces.
15. With real SMTP credentials separately configured, check accepted/failed send reporting, link delivery and resend recovery; an SMTP acceptance response does not prove inbox delivery.
16. In a production-like HTTPS environment, check insecure transport rejection, trusted proxy configuration, TLS and CORS settings. Preview mode must be rejected when NODE_ENV=production.

No workspace, tariff, booking, payment, Google or frontend integration behavior is part of this verification.
