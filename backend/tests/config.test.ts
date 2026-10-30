import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { databaseUrlSchema } from "../src/config/database-url.js";
import { localInstant, localParts } from "../src/config/facility.js";

test("test configuration refuses the development database and other database names", () => {
  assert.equal(databaseUrlSchema.safeParse("postgresql://user:password@localhost/workstudio_db").success, false);
  assert.equal(databaseUrlSchema.safeParse("postgresql://user:password@localhost/another_database").success, false);
  assert.equal(databaseUrlSchema.safeParse(process.env.DATABASE_URL).success, true);
});
test("production cannot enable mock payments", () => {
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/config/env.ts')"], {
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgresql://placeholder:placeholder@localhost/workstudio_db",
      MOCK_PAYMENTS_ENABLED: "true", EMAIL_TRANSPORT: "smtp", SMTP_HOST: "localhost", SMTP_FROM: "test@example.com",
      PUBLIC_API_URL: "https://example.com", CORS_ORIGINS: "https://example.com", TRUST_PROXY_HOPS: "1" },
    encoding: "utf8", windowsHide: true,
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Mock payments are forbidden in production/);
});
test("facility timestamps round-trip and reject missing or ambiguous DST times", () => {
  assert.deepEqual(localParts(localInstant("2027-01-15", "10:00")), { date: "2027-01-15", time: "10:00" });
  assert.throws(() => localInstant("2027-03-28", "03:30"), /missing or ambiguous/);
  assert.throws(() => localInstant("2027-10-31", "03:30"), /missing or ambiguous/);
});
