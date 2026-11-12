import { z } from "zod";

export const mockPaymentSchema = z.strictObject({ scenario: z.enum(["success", "failure"]) });
