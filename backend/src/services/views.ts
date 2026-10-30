import type { Booking, BookingSeries, Workspace, Tariff } from "../generated/prisma/client.js";
import { facility, localParts } from "../config/facility.js";

export function workspaceView(workspace: Workspace) {
  const { mapX, mapY, deletedAt, ...rest } = workspace;
  return { ...rest, mapPosition: mapX === null || mapY === null ? null : { x: mapX, y: mapY } };
}
export function tariffView(tariff: Tariff) {
  const { deletedAt, ...rest } = tariff;
  return { ...rest, price: tariff.price.toFixed(2), currency: facility.currency };
}
export function bookingView(booking: Booking & { series?: BookingSeries | null }) {
  const localStart = localParts(booking.startsAt);
  const localEnd = localParts(booking.endsAt);
  return {
    ...booking, reference: booking.id, amount: booking.amount.toFixed(2), currency: facility.currency,
    date: localStart.date, startTime: localStart.time, endTime: localEnd.time, timeZone: facility.timeZone,
    isRecurring: booking.seriesId !== null, paymentStatus: null, paymentIntegrationAvailable: false,
  };
}
