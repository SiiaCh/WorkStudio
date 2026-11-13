import type { Booking, Workspace } from "../generated/prisma/client.js";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/errors.js";
import type { Tx } from "./transactions.js";
import { workspaceView } from "./views.js";

export interface Interval { startsAt: Date; endsAt: Date }
export function activeWhere(now: Date): Prisma.BookingWhereInput {
  return { OR: [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", paymentDeadline: { gt: now } }] };
}
export function overlaps(a: Interval, b: Interval) { return a.startsAt < b.endsAt && a.endsAt > b.startsAt; }
export function blockedReason(workspace: Workspace, interval: Interval, bookings: Booking[], now: Date, ignoreId?: string): string | null {
  if (workspace.deletedAt || workspace.status === "UNAVAILABLE") return "WORKSPACE_UNAVAILABLE";
  if (workspace.status === "OCCUPIED" && interval.startsAt <= now && interval.endsAt > now) return "WORKSPACE_OCCUPIED_NOW";
  if (bookings.some(booking => booking.workspaceId === workspace.id && booking.id !== ignoreId &&
    (booking.status === "CONFIRMED" || booking.status === "PENDING_PAYMENT" && booking.paymentDeadline > now) && overlaps(booking, interval))) return "BOOKING_CONFLICT";
  return null;
}
export async function conflictSnapshot(tx: Tx, interval: Interval, now: Date) {
  const [workspaces, bookings] = await Promise.all([
    tx.workspace.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    tx.booking.findMany({ where: { ...activeWhere(now), startsAt: { lt: interval.endsAt }, endsAt: { gt: interval.startsAt } } }),
  ]);
  return { workspaces, bookings };
}
export async function checkWorkspace(tx: Tx, workspaceId: string, interval: Interval, now: Date, ignoreId?: string) {
  const workspace = await tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
  if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
  const bookings = await tx.booking.findMany({ where: {
    workspaceId, ...activeWhere(now), startsAt: { lt: interval.endsAt }, endsAt: { gt: interval.startsAt },
    ...(ignoreId ? { id: { not: ignoreId } } : {}),
  } });
  const reason = blockedReason(workspace, interval, bookings, now);
  if (reason) throw new AppError(409, reason, "The workspace is not available for the selected interval. Refresh availability and choose another interval or workspace.");
  return workspace;
}
export async function bookingOwner(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, emailVerifiedAt: true } });
  if (!user || user.role !== "CLIENT") throw new AppError(404, "CLIENT_NOT_FOUND", "Select an existing client.");
  if (!user.emailVerifiedAt) throw new AppError(403, "EMAIL_NOT_VERIFIED", "The client's email address must be confirmed before a booking can be created.");
  return user;
}
export async function selectedTariff(tx: Tx, tariffId: string) {
  await tx.$queryRaw`SELECT id FROM "Tariff" WHERE id = ${tariffId}::uuid FOR SHARE`;
  const tariff = await tx.tariff.findFirst({ where: { id: tariffId, deletedAt: null } });
  if (!tariff) throw new AppError(404, "TARIFF_NOT_FOUND", "Select an existing available tariff.");
  return tariff;
}
export function alternativesFor(snapshot: Awaited<ReturnType<typeof conflictSnapshot>>, interval: Interval, now: Date, excludedWorkspaceId: string, ignoreId?: string) {
  return snapshot.workspaces.filter(workspace => workspace.id !== excludedWorkspaceId &&
    !blockedReason(workspace, interval, snapshot.bookings, now, ignoreId)).map(workspaceView);
}
export async function notifyBooking(tx: Tx, booking: { id: string; userId: string }, event: string, message: string) {
  await tx.notification.create({ data: { userId: booking.userId, bookingId: booking.id, event, message } });
}
