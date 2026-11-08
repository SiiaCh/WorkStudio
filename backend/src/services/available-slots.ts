import { prisma } from "../db/prisma.js";
import { facility, localParts, openingBounds, weekday, weekdayNames } from "../config/facility.js";
import { AppError } from "../utils/errors.js";
import { activeWhere, type Interval } from "./booking-rules.js";

const minute = 60_000;

// Clipping and the advancing cursor merge overlapping/adjacent blocks without emitting false gaps.
function subtractBookings(permitted: Interval, bookings: Interval[]) {
  const blocks = bookings.map(booking => ({
    startsAt: Math.max(permitted.startsAt.getTime(), booking.startsAt.getTime()),
    endsAt: Math.min(permitted.endsAt.getTime(), booking.endsAt.getTime()),
  })).filter(block => block.startsAt < block.endsAt).sort((a, b) => a.startsAt - b.startsAt);
  const gaps: Array<{ startsAt: number; endsAt: number }> = [];
  let cursor = permitted.startsAt.getTime();
  for (const block of blocks) {
    if (block.startsAt > cursor) gaps.push({ startsAt: cursor, endsAt: block.startsAt });
    cursor = Math.max(cursor, block.endsAt);
  }
  if (cursor < permitted.endsAt.getTime()) gaps.push({ startsAt: cursor, endsAt: permitted.endsAt.getTime() });
  return gaps.flatMap(gap => {
    // Existing booking inputs have HH:mm precision. Never round into a blocked or past interval.
    const startsAt = new Date(Math.ceil(gap.startsAt / minute) * minute);
    const endsAt = new Date(Math.floor(gap.endsAt / minute) * minute);
    return startsAt < endsAt ? [{
      startTime: localParts(startsAt).time, endTime: localParts(endsAt).time, startsAt, endsAt,
    }] : [];
  });
}

export async function availableSlots(workspaceId: string, date: string) {
  const now = new Date();
  const today = localParts(now).date;
  if (date < today) throw new AppError(400, "DATE_IN_PAST", "Choose today or a future availability date.");
  return prisma.$transaction(async tx => {
    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null }, select: { id: true, status: true },
    });
    if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
    const openingHours = facility.openingHours[weekdayNames[weekday(date)]!];
    const base = {
      workspaceId: workspace.id, workspaceStatus: workspace.status, date, timeZone: facility.timeZone,
      openingHours, asOf: now, recommendedPollIntervalMs: 1000,
    };
    const empty = (unavailableReason: string, message: string) => ({
      ...base, availableRanges: [], unavailableReason, message,
    });
    if (workspace.status === "UNAVAILABLE") return empty("WORKSPACE_UNAVAILABLE", "This workspace is unavailable for booking.");
    const bounds = openingBounds(date);
    if (!bounds) return empty("FACILITY_CLOSED", "The facility is closed on the selected date.");
    // OCCUPIED has no scheduled end time. As with interval availability, it blocks now, not future times.
    const startsAt = date === today
      ? new Date(Math.max(bounds.startsAt.getTime(), (Math.floor(now.getTime() / minute) + 1) * minute))
      : bounds.startsAt;
    if (startsAt >= bounds.endsAt) return empty("FACILITY_CLOSED", "No operating time remains on the selected date.");
    const bookings = await tx.booking.findMany({
      where: { workspaceId, ...activeWhere(now), startsAt: { lt: bounds.endsAt }, endsAt: { gt: startsAt } },
      select: { startsAt: true, endsAt: true },
    });
    const availableRanges = subtractBookings({ startsAt, endsAt: bounds.endsAt }, bookings);
    return {
      ...base, availableRanges, unavailableReason: availableRanges.length ? null : "NO_AVAILABLE_RANGES",
      message: availableRanges.length ? null : "No bookable time ranges remain on the selected date.",
    };
  }, { isolationLevel: "RepeatableRead" });
}
