import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import type { Role } from "../generated/prisma/enums.js";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { hashToken, minutes } from "../utils/tokens.js";

const claimsSchema = z.object({ sub: z.uuid(), jti: z.uuid(), exp: z.number().int(), iat: z.number().int() });
const unauthorized = () => new AppError(401, "UNAUTHENTICATED", "A valid, active Bearer token is required. Sign in again.");

export const authenticate: RequestHandler = async (req, _res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? "");
  if (!match?.[1]) throw unauthorized();
  const token = match[1];
  let claims;
  try {
    claims = claimsSchema.parse(jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"], issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE,
    }));
  } catch { throw unauthorized(); }
  const now = new Date();
  const session = await prisma.session.findUnique({
    where: { id: claims.jti },
    include: { user: { select: { id: true, role: true, emailVerifiedAt: true } } },
  });
  if (!session || session.userId !== claims.sub) throw unauthorized();
  const touched = await prisma.session.updateMany({
    where: {
      id: session.id, userId: claims.sub, tokenHash: hashToken(token),
      expiresAt: { gt: now }, lastActivityAt: { gt: new Date(now.getTime() - minutes(env.SESSION_IDLE_MINUTES)) },
    },
    data: { lastActivityAt: now },
  });
  if (!touched.count) throw unauthorized();
  req.auth = { userId: session.userId, sessionId: session.id, role: session.user.role, emailVerifiedAt: session.user.emailVerifiedAt };
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    if (!roles.includes(req.auth.role)) throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this operation.");
    next();
  };
}

// Apply after authenticate to future booking creation routes (AS-7).
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthorized();
  if (!req.auth.emailVerifiedAt) throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email address before creating a booking.");
  next();
};
