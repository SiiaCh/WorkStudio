import { prisma } from "../src/db/prisma.js";
import { logFailure } from "../src/utils/errors.js";
try {
  await prisma.$connect();
  const result = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
  await Promise.all([prisma.user.count(), prisma.workspace.count(), prisma.tariff.count(), prisma.booking.count(), prisma.bookingSeries.count(), prisma.auditLog.count(), prisma.notification.count(), prisma.payment.count()]);
  const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE conrelid = '"Booking"'::regclass AND conname = 'Booking_no_active_overlap'`;
  if (!constraints.length) throw new Error("Missing booking exclusion constraint.");
  const paymentGuards = await prisma.$queryRaw<Array<{ name: string }>>`SELECT tgname AS name FROM pg_trigger WHERE tgrelid IN ('"Booking"'::regclass, '"Payment"'::regclass) AND tgname IN ('Booking_payment_guard', 'Payment_history_guard', 'Payment_no_delete', 'Payment_no_truncate')`;
  const paymentIndex = await prisma.$queryRaw<Array<{ name: string }>>`SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Payment' AND indexname = 'Payment_one_success_per_booking'`;
  if (paymentGuards.length !== 4 || paymentIndex.length !== 1) throw new Error("Missing payment integrity safeguards.");
  console.info("Connected to " + result[0]?.database + "; Application tables and booking/payment integrity safeguards are present.");
} catch (error) {
  logFailure("database_check_failed", error);
  console.error("Check DATABASE_URL and run npm run db:migrate.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
