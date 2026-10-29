import { createServer as httpServer } from "node:http";
import { createServer as httpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { app } from "./app.js";
import { prisma } from "./db/prisma.js";
import { env } from "./config/env.js";
import { logFailure } from "./utils/errors.js";

async function main() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
  const server = env.TLS_CERT_PATH && env.TLS_KEY_PATH
    ? httpsServer({ cert: readFileSync(env.TLS_CERT_PATH), key: readFileSync(env.TLS_KEY_PATH), minVersion: "TLSv1.2" }, app)
    : httpServer(app);
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.on("error", error => { logFailure("server_failed", error); process.exitCode = 1; void prisma.$disconnect(); });
  server.listen(env.PORT, env.HOST, () => {
    console.info("WorkStudio API listening on port " + env.PORT + " (" + env.NODE_ENV + ").");
    if (env.EMAIL_TRANSPORT === "preview") console.info("Development email preview enabled: no email will be sent.");
  });
  function shutdown() {
    const timer = setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => { void prisma.$disconnect().finally(() => { clearTimeout(timer); process.exit(0); }); });
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch(async error => {
  logFailure("startup_failed", error);
  console.error("Check DATABASE_URL, PostgreSQL availability and migrations. No credentials were logged.");
  await prisma.$disconnect();
  process.exitCode = 1;
});
