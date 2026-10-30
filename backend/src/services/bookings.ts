import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { bookingInterval, localParts, localInstant, addDays } from "../config/facility.js";
import { AppError } from "../utils/errors.js";
import type { BookingCreate } from "../validation/bookings.js";
import { activeWhere, bookingOwner, checkWorkspace, notifyBooking, selectedTariff } from "./booking-rules.js";
import { adminMutation, checkVersion, databaseNow, lockWorkspaces, transaction, type Tx } from "./transactions.js";
import { refreshLifecycle, settleBookings } from "./lifecycle.js";
import { bookingView } from "./views.js";
import type { BookingStatus, Prisma } from "../generated/prisma/client.js";

async function createOne(tx: Tx, userId: string, input: BookingCreate) {
  const interval = bookingInterval(input);
  await lockWorkspaces(tx, [input.workspaceId]);
  const now = await databaseNow(tx);
  await settleBookings(tx, [input.workspaceId], now);
  if (interval.startsAt < now) throw new AppError(400, "BOOKING_IN_PAST", "The booking must start in the future.");
  await bookingOwner(tx, userId);
  const workspace = await checkWorkspace(tx, input.workspaceId, interval, now);
  const tariff = await selectedTariff(tx, input.tariffId);
  return tx.booking.create({ data: {
    userId, workspaceId: workspace.id, workspaceName: workspace.name, tariffId: tariff.id, tariffName: tariff.name,
    amount: tariff.price, ...interval, createdAt: now,
    paymentDeadline: new Date(now.getTime() + env.BOOKING_HOLD_MINUTES * 60_000),
  }, include: { series: true } });
}
export async function createClientBooking(userId: string, input: BookingCreate) {
  const booking = await transaction(tx => createOne(tx, userId, input));
  return { booking: bookingView(booking) };
}
export function createAdminBooking(actorId: string, key: string, input: BookingCreate & { userId: string }) {
  return adminMutation(actorId, key, { operation: "booking.create", input }, async tx => {
    const booking = await createOne(tx, input.userId, input);
    await notifyBooking(tx, booking, "BOOKING_CREATED", "An administrator created a booking for you. It is awaiting payment.");
    return { result: { booking: bookingView(booking) }, action: "BOOKING_CREATED", resourceType: "Booking", resourceId: booking.id, details: { after: bookingView(booking) } };
  });
}
export async function getBooking(id: string, userId?: string) {
  await refreshLifecycle();
  const booking = await prisma.booking.findFirst({ where: { id, ...(userId ? { userId } : {}) }, include: { series: true } });
  if (!booking) throw new AppError(404, "BOOKING_NOT_FOUND", "The booking does not exist.");
  return { booking: bookingView(booking) };
}
interface ListInput {
  fromDate?: string; toDate?: string; status?: BookingStatus; page: number; pageSize: number;
  userId?: string; workspaceId?: string; reference?: string;
}
export async function listBookings(input: ListInput, ownerId?: string) {
  await refreshLifecycle();
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) throw new AppError(400, "INVALID_PERIOD", "toDate must not precede fromDate.");
  const fromDate = input.fromDate ?? (ownerId ? undefined : addDays(localParts(new Date()).date, -30));
  const where: Prisma.BookingWhereInput = {
    userId: ownerId ?? input.userId, workspaceId: input.workspaceId, id: input.reference, status: input.status,
    startsAt: {
      ...(fromDate ? { gte: localInstant(fromDate, "00:00") } : {}),
      ...(input.toDate ? { lt: localInstant(addDays(input.toDate, 1), "00:00") } : {}),
    },
  };
  const [total, bookings] = await prisma.$transaction([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where, orderBy: [{ startsAt: ownerId ? "desc" : "asc" }, { id: "asc" }],
      skip: (input.page - 1) * input.pageSize, take: input.pageSize, include: { series: true },
    }),
  ], { isolationLevel: "RepeatableRead" });
  return { bookings: bookings.map(bookingView), total, page: input.page, pageSize: input.pageSize, message: total ? null : "No bookings found." };
}
export async function calendar(userId: string, input: { fromDate?: string; toDate?: string }) {
  await refreshLifecycle();
  const today = localParts(new Date()).date;
  const fromDate = input.fromDate ?? today.slice(0, 7) + "-01";
  const month = new Date(fromDate + "T12:00:00Z");
  const toDate = input.toDate ?? new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  if (fromDate > toDate || new Date(toDate).getTime() - new Date(fromDate).getTime() > 366 * 86400_000) throw new AppError(400, "INVALID_PERIOD", "Choose a calendar period of at most 366 days with toDate on or after fromDate.");
  const now = new Date();
  const bookings = await prisma.booking.findMany({
    where: { userId, ...activeWhere(now), endsAt: { gt: now }, startsAt: { gte: localInstant(fromDate, "00:00"), lt: localInstant(addDays(toDate, 1), "00:00") } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }], include: { series: true },
  });
  return { fromDate, toDate, bookings: bookings.map(bookingView), message: bookings.length ? null : "No upcoming bookings found." };
}
export function editAdminBooking(actorId: string, key: string, id: string, input: { workspaceId: string; date: string; startTime: string; endTime: string; version: number; confirm: true }) {
  return adminMutation(actorId, key, { operation: "booking.edit", id, input }, async tx => {
    const initial = await tx.booking.findUnique({ where: { id } });
    if (!initial) throw new AppError(404, "BOOKING_NOT_FOUND", "The booking does not exist.");
    await lockWorkspaces(tx, [initial.workspaceId, input.workspaceId]);
    const now = await databaseNow(tx);
    await settleBookings(tx, [initial.workspaceId, input.workspaceId], now);
    const before = await tx.booking.findUniqueOrThrow({ where: { id } });
    checkVersion(before.version, input.version);
    if (!["PENDING_PAYMENT", "CONFIRMED"].includes(before.status)) throw new AppError(409, "BOOKING_TERMINAL", "Completed or cancelled bookings cannot be edited.");
    const interval = bookingInterval(input);
    const workspace = await checkWorkspace(tx, input.workspaceId, interval, now, id);
    const booking = await tx.booking.update({
      where: { id }, data: { workspaceId: workspace.id, workspaceName: workspace.name, ...interval, version: { increment: 1 } }, include: { series: true },
    });
    await notifyBooking(tx, booking, "BOOKING_UPDATED", "An administrator changed your booking. Review its workspace and times.");
    return { result: { booking: bookingView(booking) }, action: "BOOKING_UPDATED", resourceType: "Booking", resourceId: id, details: { before: bookingView(before), after: bookingView(booking) } };
  });
}
export function cancelAdminBooking(actorId: string, key: string, id: string, version: number) {
  return adminMutation(actorId, key, { operation: "booking.cancel", id, version }, async tx => {
    const initial = await tx.booking.findUnique({ where: { id } });
    if (!initial) throw new AppError(404, "BOOKING_NOT_FOUND", "The booking does not exist.");
    await lockWorkspaces(tx, [initial.workspaceId]);
    const now = await databaseNow(tx);
    await settleBookings(tx, [initial.workspaceId], now);
    const before = await tx.booking.findUniqueOrThrow({ where: { id } });
    checkVersion(before.version, version);
    if (!["PENDING_PAYMENT", "CONFIRMED"].includes(before.status)) throw new AppError(409, "BOOKING_TERMINAL", "The booking is already completed or cancelled.");
    const booking = await tx.booking.update({ where: { id }, data: { status: "CANCELLED", cancellationReason: "ADMINISTRATOR", version: { increment: 1 } }, include: { series: true } });
    await notifyBooking(tx, booking, "BOOKING_CANCELLED", "An administrator cancelled your booking. Any refund is handled by the coworking operator outside this system.");
    return { result: { booking: bookingView(booking) }, action: "BOOKING_CANCELLED", resourceType: "Booking", resourceId: id, details: { before: bookingView(before), after: bookingView(booking) } };
  });
}
