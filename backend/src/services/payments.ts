import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import type { Payment } from "../generated/prisma/client.js";
import { simulatePayment } from "../payments/mock-provider.js";
import { AppError } from "../utils/errors.js";
import { bookingOwner, notifyBooking } from "./booking-rules.js";
import { settleBookings } from "./lifecycle.js";
import { databaseNow, lockWorkspaces, transaction } from "./transactions.js";

export function paymentView(payment: Payment) {
  const { id, bookingId, tariffId, amount, currency, provider, providerReference, status, createdAt, completedAt } = payment;
  return { id, bookingId, tariffId, amount: amount.toFixed(2), currency, provider, providerReference, status, createdAt, completedAt };
}
function result(payment: Payment) {
  // This is the outcome at the time of this attempt, including on an idempotent replay.
  return { payment: paymentView(payment), booking: { id: payment.bookingId, status: payment.status === "SUCCEEDED" ? "CONFIRMED" : "PENDING_PAYMENT" } };
}
export async function mockPayment(userId: string, bookingId: string, key: string, scenario: "success" | "failure") {
  if (!env.MOCK_PAYMENTS_ENABLED || env.NODE_ENV === "production") throw new AppError(404, "NOT_FOUND", "The requested endpoint does not exist.");
  const requestHash = createHash("sha256").update(JSON.stringify({ bookingId, scenario })).digest("hex");
  const outcome = await transaction(async tx => {
    await bookingOwner(tx, userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"payment:" + userId + ":" + key}, 0))`;
    const previous = await tx.payment.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new Idempotency-Key for a different payment attempt.");
      return { data: result(previous) };
    }
    const initial = await tx.booking.findFirst({ where: { id: bookingId, userId } });
    if (!initial) throw new AppError(404, "BOOKING_NOT_FOUND", "The booking does not exist.");
    await lockWorkspaces(tx, [initial.workspaceId]);
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId}::uuid FOR UPDATE`;
    let booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.workspaceId !== initial.workspaceId) throw new AppError(409, "BOOKING_CHANGED", "The booking moved to another workspace. Refresh it and retry.");
    const now = await databaseNow(tx);
    await settleBookings(tx, [booking.workspaceId], now);
    booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    // Return the rejection so lifecycle cleanup commits instead of rolling back on an expired request.
    if (booking.cancellationReason === "PAYMENT_TIMEOUT") return { error: new AppError(409, "PAYMENT_WINDOW_EXPIRED", "The original payment deadline has expired. Create a new booking.") };
    if (booking.status !== "PENDING_PAYMENT" || booking.endsAt <= now) return { error: new AppError(409, "BOOKING_NOT_PAYABLE", "Only an active Pending Payment booking can be paid.") };
    // Serialize with tariff deletion. Existing booking snapshots remain payable after logical deletion.
    await tx.$queryRaw`SELECT id FROM "Tariff" WHERE id = ${booking.tariffId}::uuid FOR SHARE`;
    const attempt = await tx.payment.create({ data: {
      userId, bookingId, tariffId: booking.tariffId, amount: booking.amount,
      provider: "MOCK", idempotencyKey: key, requestHash, createdAt: await databaseNow(tx),
    } });
    const providerResult = simulatePayment(scenario);
    const payment = await tx.payment.update({ where: { id: attempt.id }, data: { ...providerResult, completedAt: await databaseNow(tx) } });
    if (payment.status === "SUCCEEDED") {
      await tx.booking.update({ where: { id: bookingId }, data: { status: "CONFIRMED", version: { increment: 1 } } });
      await notifyBooking(tx, booking, "PAYMENT_SUCCEEDED", "Your mock payment succeeded and your booking is confirmed. No money was processed.");
    } else {
      await notifyBooking(tx, booking, "PAYMENT_FAILED", "Your mock payment failed. Retry before the original payment deadline. No money was processed.");
    }
    return { data: result(payment) };
  });
  if (outcome.error) throw outcome.error;
  return outcome.data!;
}
export async function listPayments(userId: string, bookingId: string) {
  if (!await prisma.booking.findFirst({ where: { id: bookingId, userId }, select: { id: true } })) throw new AppError(404, "BOOKING_NOT_FOUND", "The booking does not exist.");
  const payments = await prisma.payment.findMany({ where: { bookingId, userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return { payments: payments.map(paymentView) };
}
