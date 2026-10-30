import { env } from "../config/env.js";
import type { Payment, Prisma, Booking, BookingSeries, Workspace, Tariff } from "../generated/prisma/client.js";
import { facility, localParts } from "../config/facility.js";

export function workspaceView(workspace: Workspace) {
  const { mapX, mapY, deletedAt, ...rest } = workspace;
  return { ...rest, mapPosition: mapX === null || mapY === null ? null : { x: mapX, y: mapY } };
}
export function tariffView(tariff: Tariff) {
  const { deletedAt, ...rest } = tariff;
  return { ...rest, price: tariff.price.toFixed(2), currency: facility.currency };
}
export const bookingInclude = {
  series: true,
  // PostgreSQL enum order is PENDING, SUCCEEDED, FAILED: a success takes precedence over earlier failures.
  payments: { orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }], take: 1 },
} satisfies Prisma.BookingInclude;

export function bookingView(booking: Booking & { series?: BookingSeries | null; payments?: Payment[] }) {
  const { payments, ...fields } = booking;
  const localStart = localParts(booking.startsAt);
  const localEnd = localParts(booking.endsAt);
  return {
    ...fields, reference: booking.id, amount: booking.amount.toFixed(2), currency: facility.currency,
    date: localStart.date, startTime: localStart.time, endTime: localEnd.time, timeZone: facility.timeZone,
    isRecurring: booking.seriesId !== null, paymentStatus: payments?.[0]?.status ?? null, paymentIntegrationAvailable: env.MOCK_PAYMENTS_ENABLED,
    paymentProvider: payments?.[0]?.provider ?? (env.MOCK_PAYMENTS_ENABLED ? "MOCK" : null),
  };
}
