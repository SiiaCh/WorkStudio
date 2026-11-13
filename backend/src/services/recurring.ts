import { env } from "../config/env.js";
import { addDays, bookingInterval, weekday } from "../config/facility.js";
import { AppError } from "../utils/errors.js";
import type { RecurringInput } from "../validation/bookings.js";
import { alternativesFor, blockedReason, bookingOwner, conflictSnapshot, selectedTariff } from "./booking-rules.js";
import { databaseNow, lockWorkspaces, transaction, type Tx } from "./transactions.js";
import { settleBookings } from "./lifecycle.js";
import { bookingInclude, bookingView } from "./views.js";

function occurrences(input: RecurringInput) {
  const span = (new Date(input.toDate).getTime() - new Date(input.fromDate).getTime()) / 86400_000;
  if (span > env.MAX_RECURRING_OCCURRENCES * 7 + 7) throw new AppError(400, "RECURRENCE_LIMIT", "The series exceeds the configured occurrence/request limit.");
  const dates: string[] = [];
  for (let date = input.fromDate; date <= input.toDate; date = addDays(date, 1)) {
    if (input.weekdays.includes(weekday(date) || 7)) dates.push(date);
    if (dates.length > env.MAX_RECURRING_OCCURRENCES) throw new AppError(400, "RECURRENCE_LIMIT", "Reduce the series to at most " + env.MAX_RECURRING_OCCURRENCES + " occurrences.");
  }
  if (!dates.length) throw new AppError(400, "NO_OCCURRENCES", "The selected weekdays do not occur in this period.");
  if (input.alternatives.some(item => !dates.includes(item.date))) throw new AppError(400, "INVALID_ALTERNATIVE_DATE", "An alternative must refer to a date in this series.");
  return dates.map(date => ({
    date, workspaceId: input.alternatives.find(item => item.date === date)?.workspaceId ?? input.workspaceId,
    ...bookingInterval({ date, startTime: input.startTime, endTime: input.endTime }),
  }));
}
async function assess(tx: Tx, input: RecurringInput, items: ReturnType<typeof occurrences>, now: Date) {
  const tariff = await selectedTariff(tx, input.tariffId);
  const snapshot = await conflictSnapshot(tx, { startsAt: items[0]!.startsAt, endsAt: items[items.length - 1]!.endsAt }, now);
  if (!snapshot.workspaces.some(workspace => workspace.id === input.workspaceId)) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The requested workspace does not exist.");
  const proposals = items.map(item => {
    const workspace = snapshot.workspaces.find(workspace => workspace.id === item.workspaceId);
    const reason = !workspace ? "WORKSPACE_NOT_FOUND" : item.startsAt < now ? "BOOKING_IN_PAST" : blockedReason(workspace, item, snapshot.bookings, now);
    return {
      ...item, workspaceName: workspace?.name ?? null, available: !reason, unavailableReason: reason,
      amount: tariff.price.toFixed(2), currency: "UAH",
      alternatives: reason ? alternativesFor(snapshot, item, now, item.workspaceId) : [],
    };
  });
  return { tariff, proposals, conflicts: proposals.filter(item => !item.available) };
}
export async function previewSeries(userId: string, input: RecurringInput) {
  const items = occurrences(input);
  return transaction(async tx => {
    await bookingOwner(tx, userId);
    const assessment = await assess(tx, input, items, await databaseNow(tx));
    return {
      canCreate: !assessment.conflicts.length, occurrences: assessment.proposals, conflicts: assessment.conflicts,
      totalAmount: assessment.tariff.price.mul(items.length).toFixed(2), currency: "UAH",
      confirmationRequired: true, reservationCreated: false,
    };
  });
}
export async function createSeries(userId: string, input: RecurringInput) {
  if (!input.confirm) throw new AppError(400, "CONFIRMATION_REQUIRED", "Confirm the entire recurring series before creating reservations.");
  const items = occurrences(input);
  return transaction(async tx => {
    const ids = items.map(item => item.workspaceId);
    await lockWorkspaces(tx, ids);
    const now = await databaseNow(tx);
    await settleBookings(tx, ids, now);
    await bookingOwner(tx, userId);
    const assessment = await assess(tx, input, items, now);
    if (assessment.conflicts.length) throw new AppError(409, "RECURRING_CONFLICT", "No occurrence was created. Change the recurrence settings or accept an alternative for every conflicting date, then confirm again.", {
      conflicts: assessment.conflicts, choices: ["CHANGE_SETTINGS", "ACCEPT_ALTERNATIVES"],
    });
    const series = await tx.bookingSeries.create({ data: {
      userId, weekdays: [...input.weekdays].sort((a, b) => a - b), fromDate: new Date(input.fromDate + "T00:00:00Z"),
      toDate: new Date(input.toDate + "T00:00:00Z"), startTime: input.startTime, endTime: input.endTime,
    } });
    await tx.booking.createMany({ data: assessment.proposals.map(item => ({
      userId, seriesId: series.id, workspaceId: item.workspaceId, workspaceName: item.workspaceName!,
      tariffId: assessment.tariff.id, tariffName: assessment.tariff.name, amount: assessment.tariff.price,
      startsAt: item.startsAt, endsAt: item.endsAt, createdAt: now,
      paymentDeadline: new Date(now.getTime() + env.BOOKING_HOLD_MINUTES * 60_000),
    })) });
    const bookings = await tx.booking.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" }, include: bookingInclude });
    if (bookings.length !== items.length) throw new Error("Incomplete recurring series");
    return { series, bookings: bookings.map(bookingView), totalAmount: assessment.tariff.price.mul(items.length).toFixed(2), currency: "UAH" };
  });
}
