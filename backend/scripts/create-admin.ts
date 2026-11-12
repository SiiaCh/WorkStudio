import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../src/db/prisma.js";
import { env } from "../src/config/env.js";
import { emailSchema, nameSchema, passwordSchema } from "../src/validation/auth.js";
import { logFailure } from "../src/utils/errors.js";

const parsed = z.object({ ADMIN_NAME: nameSchema, ADMIN_EMAIL: emailSchema, ADMIN_PASSWORD: passwordSchema }).safeParse(process.env);
try {
  if (!parsed.success) throw new Error("Set a valid ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD in your local environment.");
  const input = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email: input.ADMIN_EMAIL }, select: { id: true } });
  if (existing) {
    console.error("Email already exists. No account was changed or promoted.");
    process.exitCode = 1;
  } else {
    await prisma.user.create({
      data: { name: input.ADMIN_NAME, email: input.ADMIN_EMAIL, passwordHash: await bcrypt.hash(input.ADMIN_PASSWORD, env.BCRYPT_ROUNDS), role: "ADMINISTRATOR" },
    });
    console.info("Administrator created. Remove ADMIN_PASSWORD from your environment. Email remains unverified; use resend-verification to confirm it.");
  }
} catch (error) {
  logFailure("admin_provision_failed", error);
  console.error("Provisioning failed. Check the database, unique email and ADMIN_* configuration.");
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
