import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { hashToken, minutes, verificationToken } from "../utils/tokens.js";
import { type LoginInput, type RegistrationInput } from "../validation/auth.js";
import { publicUserSelect } from "./users.js";
import { sendVerification } from "./email.js";

const dummyHash = bcrypt.hash("unrelated-" + randomUUID(), env.BCRYPT_ROUNDS);

export async function register(input: RegistrationInput) {
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const token = verificationToken();
  const user = await prisma.user.create({
    data: {
      name: input.name, email: input.email, passwordHash, role: "CLIENT",
      emailVerification: { create: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + minutes(env.EMAIL_VERIFICATION_TTL_MINUTES)) } },
    },
    select: publicUserSelect,
  });
  return { user, emailDelivery: await sendVerification(user.email, token) };
}

export async function confirmEmail(token: string) {
  await prisma.$transaction(async tx => {
    const record = await tx.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record) throw new AppError(400, "INVALID_VERIFICATION_TOKEN", "The confirmation link is invalid or has already been used.");
    // Lock the user first, consistently with resend, to prevent deadlocks and stale resends.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${record.userId}::uuid FOR UPDATE`;
    const consumed = await tx.emailVerificationToken.deleteMany({
      where: { id: record.id, tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
    });
    if (!consumed.count) throw new AppError(400, "EXPIRED_VERIFICATION_TOKEN", "The confirmation link expired or has already been used. Request a new link.");
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  });
}

export async function resendVerification(email: string) {
  const token = verificationToken();
  const user = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE email = ${email} FOR UPDATE`;
    const found = await tx.user.findUnique({ where: { email } });
    if (!found || found.emailVerifiedAt) return null;
    await tx.emailVerificationToken.upsert({
      where: { userId: found.id },
      create: { userId: found.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + minutes(env.EMAIL_VERIFICATION_TTL_MINUTES)) },
      update: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + minutes(env.EMAIL_VERIFICATION_TTL_MINUTES)), createdAt: new Date() },
    });
    return found;
  });
  const message = "If this address belongs to an unverified account, a new confirmation link has been requested.";
  const delivery = user ? await sendVerification(user.email, token) : undefined;
  // Production responses do not disclose whether this account exists.
  return delivery?.status === "development_preview" ? { message, emailDelivery: delivery } : { message };
}

export async function login(input: LoginInput) {
  const result = await prisma.$transaction(async tx => {
    // Row locking makes the account failure limit effective across concurrent requests.
    await tx.$queryRaw`SELECT id FROM "User" WHERE email = ${input.email} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { email: input.email } });
    const now = new Date();
    if (!user) {
      await bcrypt.compare(input.password, await dummyHash);
      return { kind: "invalid" as const };
    }
    if (user.loginBlockedUntil && user.loginBlockedUntil > now) {
      return { kind: "limited" as const, retryAfter: Math.ceil((user.loginBlockedUntil.getTime() - now.getTime()) / 1000) };
    }
    if (!await bcrypt.compare(input.password, user.passwordHash)) {
      const withinWindow = user.lastFailedLoginAt && user.lastFailedLoginAt.getTime() > now.getTime() - minutes(env.LOGIN_FAILURE_WINDOW_MINUTES);
      const failures = withinWindow && !user.loginBlockedUntil ? user.failedLoginAttempts + 1 : 1;
      const blocked = failures >= env.LOGIN_MAX_FAILURES;
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: failures, lastFailedLoginAt: now, loginBlockedUntil: blocked ? new Date(now.getTime() + minutes(env.LOGIN_BLOCK_MINUTES)) : null },
      });
      // Return instead of throwing here so that the counter commits.
      return blocked ? { kind: "limited" as const, retryAfter: env.LOGIN_BLOCK_MINUTES * 60 } : { kind: "invalid" as const };
    }
    await tx.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lastFailedLoginAt: null, loginBlockedUntil: null } });
    const id = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((issuedAt + env.SESSION_TTL_MINUTES * 60) * 1000);
    const accessToken = jwt.sign({ iat: issuedAt, exp: Math.floor(expiresAt.getTime() / 1000) }, env.JWT_SECRET, {
      algorithm: "HS256", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, subject: user.id, jwtid: id,
    });
    await tx.session.create({ data: { id, userId: user.id, tokenHash: hashToken(accessToken), expiresAt } });
    const profile = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: publicUserSelect });
    return { kind: "success" as const, accessToken, expiresAt, user: profile };
  }, { maxWait: 5000, timeout: 15000 });
  if (result.kind === "invalid") throw new AppError(401, "INVALID_CREDENTIALS", "The email or password is incorrect.");
  if (result.kind === "limited") throw new AppError(429, "LOGIN_TEMPORARILY_LIMITED", "Login is temporarily limited. Try again later.", { retryAfterSeconds: result.retryAfter });
  return { accessToken: result.accessToken, tokenType: "Bearer", expiresAt: result.expiresAt, idleTimeoutSeconds: env.SESSION_IDLE_MINUTES * 60, user: result.user };
}

export async function logout(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}
