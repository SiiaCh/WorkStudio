import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { facility, addDays, bookingInterval, localParts, openingBounds } from "../config/facility.js";
import { AppError } from "../utils/errors.js";
import { activeWhere, blockedReason, type Interval } from "./booking-rules.js";
import { workspaceView } from "./views.js";
import type { availabilitySchema } from "../validation/bookings.js";
import type { z } from "zod";

export async function availability(input: z.infer<typeof availabilitySchema>) {
  const now = new Date();
  const date = input.date ?? localParts(now).date;
  if (date < localParts(now).date) throw new AppError(400, "DATE_IN_PAST", "Choose today or a future availability date.");
  const bounds = openingBounds(date);
  let interval: Interval | null = null;
  if (input.startTime && input.endTime) {
    interval = bookingInterval({ date, startTime: input.startTime, endTime: input.endTime }, true);
  } else if (bounds && bounds.endsAt > now) {
    const anchor = bounds.startsAt > now ? bounds.startsAt : now;
    interval = { startsAt: anchor, endsAt: new Date(anchor.getTime() + 1) };
  }
  const searchEnd = openingBounds(addDays(date, env.AVAILABILITY_SUGGESTION_DAYS))?.endsAt ??
    new Date(addDays(date, env.AVAILABILITY_SUGGESTION_DAYS + 1) + "T23:59:59Z");
  const [workspaces, bookings] = await prisma.$transaction([
    prisma.workspace.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.booking.findMany({ where: { ...activeWhere(now), startsAt: { lt: searchEnd }, endsAt: { gt: interval?.startsAt ?? now } } }),
  ], { isolationLevel: "RepeatableRead" });
  const results = workspaces.map(workspace => {
    const reason = !interval ? "FACILITY_CLOSED" : interval.endsAt <= now ? "INTERVAL_IN_PAST" : blockedReason(workspace, interval, bookings, now);
    const next = interval ? bookings.filter(booking => booking.workspaceId === workspace.id && booking.startsAt >= interval.startsAt).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0] : undefined;
    const until = !reason && bounds ? new Date(Math.min(bounds.endsAt.getTime(), next?.startsAt.getTime() ?? Infinity)) : null;
    return { ...workspaceView(workspace), available: !reason, unavailableReason: reason, availableUntil: until };
  });
  const suggestedDates: Array<{ date: string; workspaceIds: string[]; locations: string[] }> = [];
  if (!results.some(workspace => workspace.available)) {
    for (let day = 1; day <= env.AVAILABILITY_SUGGESTION_DAYS && suggestedDates.length < 3; day++) {
      const suggestionDate = addDays(date, day);
      const opening = openingBounds(suggestionDate);
      if (!opening) continue;
      let candidate: Interval;
      try {
        candidate = input.startTime && input.endTime
          ? bookingInterval({ date: suggestionDate, startTime: input.startTime, endTime: input.endTime }, true)
          : { startsAt: opening.startsAt, endsAt: new Date(opening.startsAt.getTime() + 1) };
      } catch (error) { if (error instanceof AppError) continue; throw error; }
      const free = workspaces.filter(workspace => !blockedReason(workspace, candidate, bookings, now));
      if (free.length) suggestedDates.push({ date: suggestionDate, workspaceIds: free.map(workspace => workspace.id), locations: [...new Set(free.map(workspace => workspace.location))] });
    }
  }
  return {
    asOf: now, facility, date, requestedInterval: input.startTime ? interval : null,
    workspaces: results, suggestedDates, suggestionSearchDays: env.AVAILABILITY_SUGGESTION_DAYS,
    message: results.some(workspace => workspace.available) ? null : "No workspaces are available for the selected time. Try a suggested date or another interval.",
    recommendedPollIntervalMs: 1000,
  };
}
