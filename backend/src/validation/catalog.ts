import { z } from "zod";

export const idSchema = z.uuid();
export const versionSchema = z.number().int().positive();
export const operationKeySchema = z.uuid();
const name = z.string().trim().min(1).max(100);
const mapPosition = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict().nullable().optional();
export const workspaceCreateSchema = z.strictObject({
  name, type: z.string().trim().min(1).max(100), location: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000), mapPosition,
});
export const workspaceUpdateSchema = workspaceCreateSchema.partial().extend({ version: versionSchema })
  .refine(value => Object.keys(value).some(key => key !== "version"), "Provide at least one changed field.");
export const priceSchema = z.union([z.string(), z.number().finite()]).transform(String)
  .pipe(z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, "Use a positive UAH amount with at most two decimal places."))
  .refine(value => Number(value) > 0, "Price must be positive.");
export const tariffCreateSchema = z.strictObject({ name, price: priceSchema });
export const tariffUpdateSchema = tariffCreateSchema.partial().extend({ version: versionSchema })
  .refine(value => value.name !== undefined || value.price !== undefined, "Provide at least one changed field.");
export const deleteSchema = z.strictObject({ version: versionSchema, confirm: z.literal(true) });
export const statusSchema = z.strictObject({
  version: versionSchema,
  status: z.enum(["FREE", "OCCUPIED", "UNAVAILABLE"]),
  confirm: z.boolean().optional(),
  resolutions: z.array(z.discriminatedUnion("action", [
    z.strictObject({ bookingId: idSchema, action: z.literal("CANCEL") }),
    z.strictObject({ bookingId: idSchema, action: z.literal("REASSIGN"), workspaceId: idSchema }),
  ])).max(1000).default([]),
}).refine(value => value.status !== "UNAVAILABLE" || value.confirm === true, "Confirm the UNAVAILABLE change explicitly.")
  .refine(value => new Set(value.resolutions.map(item => item.bookingId)).size === value.resolutions.length, "Resolve each booking only once.");
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;
export type StatusInput = z.infer<typeof statusSchema>;
