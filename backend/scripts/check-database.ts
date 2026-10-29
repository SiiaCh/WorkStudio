import { prisma } from "../src/db/prisma.js";
import { logFailure } from "../src/utils/errors.js";
try {
  await prisma.$connect();
  const result = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  await prisma.user.count();
  console.info("Connected to " + result[0]?.database + "; Stage 1 User table is readable.");
} catch (error) {
  logFailure("database_check_failed", error);
  console.error("Check DATABASE_URL and run npm run db:migrate.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
