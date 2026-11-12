import { createHash } from "node:crypto";
import type { Payment } from "../generated/prisma/client.js";
import { AppError } from "../utils/errors.js";
import { liqpayConfig, checkoutFields, verifyCallback, failedStatuses, pendingStatuses } from "../payments/liqpay.js";
import { transaction, lockWorkspaces, databaseNow } from "./transactions.js";
import { bookingOwner, notifyBooking } from "./booking-rules.js";
import { settleBookings } from "./lifecycle.js";
import { paymentView } from "./payments.js";

export async function initiateLiqPay(userId: string, bookingId: string, key: string) {
  const config = liqpayConfig(); // Optional integration never blocks application startup.
  const requestHash = createHash("sha256").update(JSON.stringify({ bookingId, provider: "LIQPAY_TEST" })).digest("hex");
  const outcome = await transaction(async tx => {
    await bookingOwner(tx, userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"payment:" + userId + ":" + key}, 0))`;
    let previous = await tx.payment.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
    if (previous && previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new Idempotency-Key for a different attempt.");
    const initial = await tx.booking.findFirst({ where: { id: bookingId, userId } });
    if (!initial) throw new AppError(404, "BOOKING_NOT_FOUND", "The booking does not exist.");
    await lockWorkspaces(tx, [initial.workspaceId]);
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${bookingId}::uuid FOR UPDATE`;
    let booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.workspaceId !== initial.workspaceId) throw new AppError(409, "BOOKING_CHANGED", "The booking moved. Refresh and retry.");
    await settleBookings(tx, [booking.workspaceId], await databaseNow(tx));
    booking = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    if (booking.cancellationReason === "PAYMENT_TIMEOUT") return { error: new AppError(409, "PAYMENT_WINDOW_EXPIRED", "The original payment deadline expired.") };
    if (booking.status !== "PENDING_PAYMENT" || booking.endsAt <= await databaseNow(tx)) return { error: new AppError(409, "BOOKING_NOT_PAYABLE", "Only an active Pending Payment booking can be paid.") };
    // A callback may have finalized the attempt while this request waited for the workspace lock.
    if (previous) previous = await tx.payment.findUniqueOrThrow({ where: { id: previous.id } });
    if (previous && previous.status !== "PENDING") throw new AppError(409, "PAYMENT_ATTEMPT_FINISHED", "This attempt is finalized. Read payment history; use a new key for an eligible retry.");
    if (await tx.payment.count({ where: { bookingId, OR: [{ status: "REQUIRES_REVIEW" }, { callbacks: { some: { disposition: "REQUIRES_REVIEW" } } }] } })) {
      throw new AppError(409, "PAYMENT_REQUIRES_REVIEW", "Contact the operator before retrying this payment.");
    }
    if (!previous && await tx.payment.count({ where: { bookingId, provider: "LIQPAY_TEST", status: "PENDING" } })) throw new AppError(409, "PAYMENT_ATTEMPT_PENDING", "Reuse the original checkout operation key while its attempt is pending.");
    await tx.$queryRaw`SELECT id FROM "Tariff" WHERE id = ${booking.tariffId}::uuid FOR SHARE`;
    const payment = previous ?? await tx.payment.create({ data: {
      userId, bookingId, tariffId: booking.tariffId, amount: booking.amount, provider: "LIQPAY_TEST",
      idempotencyKey: key, requestHash, createdAt: await databaseNow(tx),
      checkoutPublicKey: config.publicKey, checkoutServerUrl: config.callbackUrl, checkoutResultUrl: config.resultUrl,
    } });
    if (payment.checkoutPublicKey !== config.publicKey) throw new AppError(409, "PAYMENT_CONFIGURATION_CHANGED", "The test merchant changed. Contact the operator.");
    return { data: {
      payment: paymentView(payment), booking: { id: booking.id, status: booking.status },
      checkout: checkoutFields({
        id: payment.id, amount: payment.amount, paymentDeadline: booking.paymentDeadline, publicKey: payment.checkoutPublicKey!,
        privateKey: config.privateKey, callbackUrl: payment.checkoutServerUrl!, resultUrl: payment.checkoutResultUrl,
      }),
    } };
  });
  if (outcome.error) throw outcome.error;
  return outcome.data!;
}

export async function processLiqPayCallback(data: string, signature: string) {
  const config = liqpayConfig();
  const callback = verifyCallback(data, signature, config.privateKey);
  if (callback.public_key !== config.publicKey) throw new AppError(400, "PAYMENT_REFERENCE_MISMATCH", "The callback merchant does not match.");
  const id = callback.order_id.slice("workstudio_".length);
  const payloadHash = createHash("sha256").update(data).digest("hex");
  await transaction(async tx => {
    const initial = await tx.payment.findFirst({ where: { id, provider: "LIQPAY_TEST" }, include: { booking: true } });
    if (!initial) throw new AppError(404, "PAYMENT_NOT_FOUND", "Unknown payment reference.");
    await lockWorkspaces(tx, [initial.booking.workspaceId]);
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${initial.bookingId}::uuid FOR UPDATE`;
    const current = await tx.booking.findUniqueOrThrow({ where: { id: initial.bookingId } });
    if (current.workspaceId !== initial.booking.workspaceId) throw new AppError(503, "RESOURCE_BUSY", "Booking changed; retry callback.", { retryAfterSeconds: 1 });
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${id}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
    if (payment.checkoutPublicKey !== callback.public_key || !payment.amount.eq(callback.amount) || payment.currency !== callback.currency ||
        payment.tariffId !== current.tariffId || payment.userId !== current.userId || !payment.amount.eq(current.amount)) {
      throw new AppError(400, "PAYMENT_REFERENCE_MISMATCH", "The callback does not match the saved booking and amount.");
    }
    if (payment.providerPaymentId && payment.providerPaymentId !== callback.payment_id) throw new AppError(409, "PAYMENT_REFERENCE_MISMATCH", "The provider payment identifier changed.");
    const reused = await tx.payment.findUnique({ where: { providerPaymentId: callback.payment_id } });
    if (reused && reused.id !== id) throw new AppError(409, "PAYMENT_REFERENCE_MISMATCH", "The provider payment identifier belongs to another attempt.");
    if (await tx.paymentCallback.findUnique({ where: { paymentId_payloadHash: { paymentId: id, payloadHash } } })) return;
    const now = await databaseNow(tx);
    await settleBookings(tx, [current.workspaceId], now);
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: current.id } });
    const success = callback.status === "success";
    const failure = failedStatuses.has(callback.status);
    const pending = pendingStatuses.has(callback.status);
    let disposition: "PENDING" | "APPLIED" | "IGNORED" | "REQUIRES_REVIEW";
    if (payment.status !== "PENDING") {
      disposition = (payment.status === "SUCCEEDED" && success || payment.status === "FAILED" && failure) ? "IGNORED" : "REQUIRES_REVIEW";
    } else if (pending) {
      await tx.payment.update({ where: { id }, data: { providerPaymentId: callback.payment_id } });
      disposition = "PENDING";
    } else {
      const payable = booking.status === "PENDING_PAYMENT" && booking.paymentDeadline > now && booking.endsAt > now &&
        !await tx.payment.count({ where: { bookingId: booking.id, status: "SUCCEEDED" } });
      const status: Payment["status"] = failure ? "FAILED" : success && payable ? "SUCCEEDED" : "REQUIRES_REVIEW";
      await tx.payment.update({ where: { id }, data: {
        status, providerReference: id, providerPaymentId: callback.payment_id, completedAt: await databaseNow(tx),
      } });
      if (status === "SUCCEEDED") {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED", version: { increment: 1 } } });
        await notifyBooking(tx, booking, "PAYMENT_SUCCEEDED", "Your LiqPay test payment succeeded and your booking is confirmed. No real money was processed.");
      } else if (status === "FAILED") {
        await notifyBooking(tx, booking, "PAYMENT_FAILED", "Your LiqPay test payment failed. Review your booking and retry only before its original deadline.");
      }
      disposition = status === "REQUIRES_REVIEW" ? "REQUIRES_REVIEW" : "APPLIED";
    }
    const alreadyReview = await tx.paymentCallback.count({ where: { paymentId: id, disposition: "REQUIRES_REVIEW" } });
    await tx.paymentCallback.create({ data: {
      paymentId: id, payloadHash, providerStatus: callback.status, providerPaymentId: callback.payment_id, disposition, receivedAt: now,
    } });
    if (disposition === "REQUIRES_REVIEW" && !alreadyReview) await notifyBooking(tx, booking, "PAYMENT_REQUIRES_REVIEW", "A LiqPay test result needs operator review. Your booking was not reopened; contact the coworking operator.");
  });
}
