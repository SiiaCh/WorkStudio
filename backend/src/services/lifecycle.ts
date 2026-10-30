import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { logFailure } from "../utils/errors.js";
import { databaseNow, lockWorkspaces, transaction, type Tx } from "./transactions.js";

export async function settleBookings(tx: Tx, workspaceIds: string[], now: Date) {
  if (!workspaceIds.length) return;
  const expired = await tx.booking.updateManyAndReturn({
    where: { workspaceId: { in: workspaceIds }, status: "PENDING_PAYMENT", paymentDeadline: { lte: now } },
    data: { status: "CANCELLED", cancellationReason: "PAYMENT_TIMEOUT", version: { increment: 1 } },
  });
  const completed = await tx.booking.updateManyAndReturn({
    where: { workspaceId: { in: workspaceIds }, status: "CONFIRMED", endsAt: { lte: now } },
    data: { status: "COMPLETED", version: { increment: 1 } },
  });
  const notifications = [
    ...expired.map(booking => ({ userId: booking.userId, bookingId: booking.id, event: "BOOKING_EXPIRED", message: "Your unpaid booking expired and its interval was released." })),
    ...completed.map(booking => ({ userId: booking.userId, bookingId: booking.id, event: "BOOKING_COMPLETED", message: "Your confirmed booking has completed." })),
  ];
  if (notifications.length) await tx.notification.createMany({ data: notifications });
}
export async function refreshLifecycle() {
  const now = new Date();
  const due = await prisma.booking.findMany({
    where: { OR: [
      { status: "PENDING_PAYMENT", paymentDeadline: { lte: now } },
      { status: "CONFIRMED", endsAt: { lte: now } },
    ] },
    distinct: ["workspaceId"], select: { workspaceId: true },
  });
  if (!due.length) return;
  await transaction(async tx => {
    const ids = due.map(item => item.workspaceId);
    await lockWorkspaces(tx, ids);
    await settleBookings(tx, ids, await databaseNow(tx));
  });
}
export function startReservationWorker() {
  let running = false;
  let stopped = false;
  let active: Promise<void> = Promise.resolve();
  const tick = () => {
    if (running || stopped) return;
    running = true;
    active = refreshLifecycle().catch(error => logFailure("reservation_sweep_failed", error)).finally(() => { running = false; });
  };
  const timer = setInterval(tick, env.RESERVATION_SWEEP_INTERVAL_MS);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
