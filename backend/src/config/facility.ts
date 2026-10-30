import { z } from "zod";
import { env } from "./env.js";
import { AppError } from "../utils/errors.js";

export const weekdayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const scheduleSchema = z.record(z.enum(weekdayNames), z.object({ open: time, close: time }).strict()
  .refine(day => day.open < day.close, "Opening time must precede closing time.").nullable());
let scheduleInput: unknown;
try { scheduleInput = JSON.parse(env.FACILITY_OPENING_HOURS); }
catch { throw new Error("FACILITY_OPENING_HOURS must be valid JSON."); }
const parsed = scheduleSchema.safeParse(scheduleInput);
if (!parsed.success) throw new Error("FACILITY_OPENING_HOURS must define all seven weekdays as null or {open, close}, with valid same-day hours.");
try { new Intl.DateTimeFormat("en", { timeZone: env.FACILITY_TIME_ZONE }).format(); }
catch { throw new Error("FACILITY_TIME_ZONE must be a valid IANA timezone."); }
export const facility = { timeZone: env.FACILITY_TIME_ZONE, openingHours: parsed.data, currency: "UAH" as const };
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: facility.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function localParts(instant: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
  return { date: parts.year + "-" + parts.month + "-" + parts.day, time: parts.hour + ":" + parts.minute };
}
export function addDays(date: string, days: number) {
  const instant = new Date(date + "T12:00:00Z");
  instant.setUTCDate(instant.getUTCDate() + days);
  const result = instant.toISOString();
  if (!/^\d{4}-/.test(result)) throw new AppError(400, "DATE_OUT_OF_RANGE", "The requested date range exceeds the supported calendar range.");
  return result.slice(0, 10);
}
export function weekday(date: string) { return new Date(date + "T12:00:00Z").getUTCDay(); }

export function localInstant(date: string, clock: string): Date {
  const desired = new Date(date + "T" + clock + ":00Z").getTime();
  const offsetFormatter = new Intl.DateTimeFormat("en", { timeZone: facility.timeZone, timeZoneName: "shortOffset" });
  const offsets = new Set<number>();
  for (const delta of [-36, 0, 36]) {
    const label = offsetFormatter.formatToParts(new Date(desired + delta * 3_600_000)).find(part => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(label);
    if (!match) throw new Error("Unsupported IANA timezone offset.");
    offsets.add((match[1] === "-" ? -1 : 1) * (Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)));
  }
  const candidates = [...offsets].map(offset => new Date(desired - offset * 60_000)).filter(instant => {
    const local = localParts(instant);
    return local.date === date && local.time === clock;
  });
  if (candidates.length !== 1) throw new AppError(400, "INVALID_LOCAL_TIME", "The selected local time is missing or ambiguous because of a timezone transition. Choose another time.");
  return candidates[0]!;
}

export function openingBounds(date: string) {
  const hours = facility.openingHours[weekdayNames[weekday(date)]!];
  return hours ? { startsAt: localInstant(date, hours.open), endsAt: localInstant(date, hours.close) } : null;
}
export interface IntervalInput { date: string; startTime: string; endTime: string }
export function bookingInterval(input: IntervalInput, allowPast = false) {
  if (input.startTime >= input.endTime) throw new AppError(400, "INVALID_INTERVAL", "End time must be later than start time on the selected date.");
  const bounds = openingBounds(input.date);
  const startsAt = localInstant(input.date, input.startTime);
  const endsAt = localInstant(input.date, input.endTime);
  if (!bounds || startsAt < bounds.startsAt || endsAt > bounds.endsAt) throw new AppError(400, "OUTSIDE_OPENING_HOURS", "Choose an interval within the facility's opening hours.");
  if (!allowPast && startsAt < new Date()) throw new AppError(400, "BOOKING_IN_PAST", "The booking must start in the future.");
  return { startsAt, endsAt };
}
