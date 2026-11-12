import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logFailure } from "../utils/errors.js";

const transport = env.EMAIL_TRANSPORT === "smtp" ? nodemailer.createTransport({
  host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, requireTLS: !env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
}) : undefined;

export async function sendVerification(email: string, token: string) {
  const link = new URL("/api/auth/verify-email", env.PUBLIC_API_URL);
  link.searchParams.set("token", token);
  if (!transport) {
    // Explicit development-only disclosure; no token is written to disk or logs.
    return { status: "development_preview" as const, message: "No email was sent. Open this development-only link to verify.", verificationUrl: link.toString() };
  }
  try {
    const result = await transport.sendMail({
      from: env.SMTP_FROM, to: email, subject: "Confirm your WorkStudio email",
      text: "Confirm your WorkStudio email address by opening this link:\n" + link.toString() +
        "\nThe link expires in " + env.EMAIL_VERIFICATION_TTL_MINUTES + " minutes. If you did not register, ignore this message.",
    });
    if (!result.accepted.length) throw new Error("SMTP did not accept the recipient");
    return { status: "accepted_by_smtp" as const, message: "The mail server accepted the confirmation email. Inbox delivery is not guaranteed." };
  } catch (error) {
    logFailure("verification_email_failed", error);
    return { status: "failed" as const, message: "Your account is saved, but the confirmation email could not be sent. Use the resend endpoint to retry." };
  }
}
