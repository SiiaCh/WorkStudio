import { z } from "zod";

export const emailSchema = z.string().trim().email().toLowerCase().max(254);
export const nameSchema = z.string().trim().min(1).max(100);
export const passwordSchema = z.string().min(8).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 UTF-8 bytes (bcrypt limit).");
export const registrationSchema = z.strictObject({ name: nameSchema, email: emailSchema, password: passwordSchema });
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password must not exceed 72 UTF-8 bytes."),
});
export const verificationSchema = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid verification token.") });
export const resendSchema = z.strictObject({ email: emailSchema });
export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
