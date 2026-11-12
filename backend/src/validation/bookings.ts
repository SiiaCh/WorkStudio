import { z } from "zod";
import { idSchema, versionSchema } from "./catalog.js";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "9999-12-31";
}, "Provide a valid calendar date.");
export const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const intervalShape = { date: dateSchema, startTime: timeSchema, endTime: timeSchema };
export const bookingCreateSchema = z.strictObject({ workspaceId: idSchema, tariffId: idSchema, ...intervalShape, confirm: z.literal(true) });
export const adminBookingCreateSchema = bookingCreateSchema.extend({ userId: idSchema });
export const bookingUpdateSchema = z.strictObject({ workspaceId: idSchema, ...intervalShape, version: versionSchema, confirm: z.literal(true) });
export const cancelSchema = z.strictObject({ version: versionSchema, confirm: z.literal(true) });
export const availabilitySchema = z.strictObject({ date: dateSchema.optional(), startTime: timeSchema.optional(), endTime: timeSchema.optional() })
  .refine(value => !!value.startTime === !!value.endTime, "Supply both startTime and endTime.")
  .refine(value => !value.startTime || !!value.date, "Supply date when requesting an interval.");
export const listShape = {
  fromDate: dateSchema.optional(), toDate: dateSchema.optional(),
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELLED"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
export const historySchema = z.strictObject(listShape);
export const calendarSchema = z.strictObject({ fromDate: dateSchema.optional(), toDate: dateSchema.optional() });
export const adminListSchema = z.strictObject({ ...listShape, userId: idSchema.optional(), workspaceId: idSchema.optional(), reference: idSchema.optional() });
export const recurringSchema = z.strictObject({
  workspaceId: idSchema, tariffId: idSchema, fromDate: dateSchema, toDate: dateSchema,
  startTime: timeSchema, endTime: timeSchema,
  weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7).refine(values => new Set(values).size === values.length, "Weekdays must be unique (Monday=1, Sunday=7)."),
  alternatives: z.array(z.strictObject({ date: dateSchema, workspaceId: idSchema })).max(1000).default([]),
  confirm: z.boolean().default(false),
}).refine(value => value.fromDate <= value.toDate, "toDate must not precede fromDate.")
  .refine(value => new Set(value.alternatives.map(item => item.date)).size === value.alternatives.length, "Choose only one alternative per date.");
export type BookingCreate = z.infer<typeof bookingCreateSchema>;
export type RecurringInput = z.infer<typeof recurringSchema>;
