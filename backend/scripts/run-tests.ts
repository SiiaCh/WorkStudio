import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Client } from "pg";
import { fileURLToPath } from "node:url";
import { databaseUrlSchema } from "../src/config/database-url.js";

// Always create a fresh database; never reset or migrate the configured development database.
if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") throw new Error("Run npm test from a development environment.");
const sourceUrl = databaseUrlSchema.parse(process.env.DATABASE_URL);
const databaseName = "workstudio_test_" + randomUUID().replaceAll("-", "");
if (!/^workstudio_test_[a-f0-9]{32}$/.test(databaseName)) throw new Error("Unsafe test database name.");
const testUrl = new URL(sourceUrl);
testUrl.pathname = "/" + databaseName;
testUrl.searchParams.delete("schema");
const cwd = fileURLToPath(new URL("../", import.meta.url));
const childEnv = {
  ...process.env, NODE_ENV: "test", DATABASE_URL: testUrl.toString(),
  MOCK_PAYMENTS_ENABLED: "true", JWT_SECRET: randomBytes(48).toString("base64url"),
  EMAIL_TRANSPORT: "preview", HOST: "127.0.0.1", BCRYPT_ROUNDS: "10",
  TLS_CERT_PATH: "", TLS_KEY_PATH: "", TRUST_PROXY_HOPS: "0",
  PUBLIC_API_URL: "http://127.0.0.1:3000", CORS_ORIGINS: "http://localhost:5173",
  FACILITY_TIME_ZONE: "Europe/Kyiv",
  FACILITY_OPENING_HOURS: JSON.stringify(Object.fromEntries(["MON","TUE","WED","THU","FRI","SAT","SUN"].map(day => [day, { open: "08:00", close: "22:00" }]))),
  BOOKING_HOLD_MINUTES: "15", RESERVATION_SWEEP_INTERVAL_MS: "100",
  MAX_RECURRING_OCCURRENCES: "366", AVAILABILITY_SUGGESTION_DAYS: "14",
};
function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: "inherit", windowsHide: true });
    const stop = () => child.kill("SIGTERM");
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.once("error", reject);
    child.once("exit", code => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      code === 0 ? resolve() : reject(new Error("Test command failed (exit " + code + ")."));
    });
  });
}
const admin = new Client({ connectionString: sourceUrl, connectionTimeoutMillis: 5000 });
let created = false;
try {
  await admin.connect();
  // Only a locally generated, validated identifier is interpolated.
  await admin.query('CREATE DATABASE "' + databaseName + '"');
  created = true;
  console.info("Created isolated database " + databaseName + ".");
  await run(["node_modules/prisma/build/index.js", "generate"]);
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await run(["--import", "tsx", "--test", "--test-concurrency=1", "tests/config.test.ts", "tests/api.test.ts"]);
} catch {
  console.error("Tests could not complete. Check test output, PostgreSQL and CREATEDB permission; development data was not reset.");
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      // Drop only the exact database successfully created by this run.
      await admin.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
      console.info("Removed isolated test database.");
    } catch { console.error("Could not remove " + databaseName + ". Remove this test database manually when connections close."); process.exitCode = 1; }
  }
  await admin.end();
}
