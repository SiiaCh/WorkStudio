import { AppError } from "../utils/errors.js";
import type { StatusInput } from "../validation/catalog.js";
import { adminMutation, appendAudit, checkVersion, databaseNow, lockWorkspaces, transaction, type Tx } from "./transactions.js";
import { settleBookings } from "./lifecycle.js";
import { alternativesFor, checkWorkspace, conflictSnapshot, notifyBooking } from "./booking-rules.js";
import { bookingView, workspaceView } from "./views.js";

async function affected(tx: Tx, workspaceId: string, now: Date) {
  return tx.booking.findMany({
    where: { workspaceId, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, endsAt: { gt: now } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }], include: { series: true },
  });
}
async function proposals(tx: Tx, workspaceId: string, bookings: Awaited<ReturnType<typeof affected>>, now: Date) {
  if (!bookings.length) return [];
  const snapshot = await conflictSnapshot(tx, {
    startsAt: new Date(Math.min(...bookings.map(booking => booking.startsAt.getTime()))),
    endsAt: new Date(Math.max(...bookings.map(booking => booking.endsAt.getTime()))),
  }, now);
  return bookings.map(booking => ({
    booking: bookingView(booking),
    alternatives: alternativesFor(snapshot, booking, now, workspaceId, booking.id),
  }));
}
export async function affectedBookings(workspaceId: string) {
  return transaction(async tx => {
    await lockWorkspaces(tx, [workspaceId]);
    const workspace = await tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
    if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
    const now = await databaseNow(tx);
    await settleBookings(tx, [workspaceId], now);
    return { workspace: workspaceView(workspace), affectedBookings: await proposals(tx, workspaceId, await affected(tx, workspaceId, now), now) };
  });
}
export function changeWorkspaceStatus(actorId: string, key: string, id: string, input: StatusInput) {
  return adminMutation(actorId, key, { operation: "workspace.status", id, input }, async tx => {
    const destinations = input.resolutions.flatMap(item => item.action === "REASSIGN" ? [item.workspaceId] : []);
    await lockWorkspaces(tx, [id, ...destinations]);
    const before = await tx.workspace.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
    checkVersion(before.version, input.version);
    const now = await databaseNow(tx);
    await settleBookings(tx, [id, ...destinations], now);
    const changedBookings = [];
    if (input.status === "UNAVAILABLE") {
      const bookings = await affected(tx, id, now);
      if (bookings.length !== input.resolutions.length || bookings.some(booking => !input.resolutions.some(item => item.bookingId === booking.id))) {
        throw new AppError(409, "UNRESOLVED_BOOKINGS", "Resolve every current and upcoming booking and confirm the complete action. No workspace or booking changes were saved.", {
          affectedBookings: await proposals(tx, id, bookings, now),
        });
      }
      for (const booking of bookings) {
        const resolution = input.resolutions.find(item => item.bookingId === booking.id)!;
        let updated;
        if (resolution.action === "CANCEL") {
          updated = await tx.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED", cancellationReason: "ADMINISTRATOR", version: { increment: 1 } }, include: { series: true } });
          await notifyBooking(tx, updated, "BOOKING_CANCELLED", "An administrator cancelled your booking because its workspace is unavailable. Contact the operator about any refund.");
        } else {
          if (resolution.workspaceId === id) throw new AppError(400, "INVALID_REASSIGNMENT", "Select a different workspace.");
          const target = await checkWorkspace(tx, resolution.workspaceId, booking, now, booking.id);
          updated = await tx.booking.update({ where: { id: booking.id }, data: { workspaceId: target.id, workspaceName: target.name, version: { increment: 1 } }, include: { series: true } });
          await notifyBooking(tx, updated, "BOOKING_REASSIGNED", "An administrator moved your booking to another workspace. Its times and saved price are unchanged.");
        }
        await appendAudit(tx, actorId, resolution.action === "CANCEL" ? "BOOKING_CANCELLED" : "BOOKING_REASSIGNED", "Booking", booking.id, { before: bookingView(booking), after: bookingView(updated) });
        changedBookings.push(bookingView(updated));
      }
    } else if (input.resolutions.length) {
      throw new AppError(400, "UNEXPECTED_RESOLUTIONS", "FREE and OCCUPIED changes do not modify existing bookings.");
    }
    const workspace = before.status === input.status ? before : await tx.workspace.update({ where: { id }, data: { status: input.status, version: { increment: 1 } } });
    return {
      result: { workspace: workspaceView(workspace), affectedBookings: changedBookings },
      action: before.status === input.status ? "WORKSPACE_STATUS_UNCHANGED" : "WORKSPACE_STATUS_CHANGED",
      resourceType: "Workspace", resourceId: id, details: { before: workspaceView(before), after: workspaceView(workspace), affectedBookingIds: changedBookings.map(booking => booking.id) },
    };
  });
}
