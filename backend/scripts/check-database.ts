import { prisma } from "../src/db/prisma.js";
import { logFailure } from "../src/utils/errors.js";
try {
  await prisma.$connect();
  const result = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  await Promise.all([prisma.user.count(), prisma.workspace.count(), prisma.tariff.count(), prisma.booking.count(), prisma.bookingSeries.count(), prisma.auditLog.count(), prisma.notification.count()]);
  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE conrelid = '"Booking"'::regclass AND conname = 'Booking_no_active_overlap'`;
  if (!constraints.length) throw new Error("Missing booking exclusion constraint.");
  console.info("Connected to " + result[0]?.database + "; Stage 1/2 tables and booking exclusion constraint are present.");
} catch (error) {
  logFailure("database_check_failed", error);
  console.error("Check DATABASE_URL and run npm run db:migrate.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
