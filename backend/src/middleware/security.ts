import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

export const requireSecureTransport: RequestHandler = (req, _res, next) => {
  if (env.NODE_ENV === "production" && !req.secure) throw new AppError(400, "HTTPS_REQUIRED", "Use HTTPS to access this API.");
  next();
};
export const requireJson: RequestHandler = (req, _res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json")) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Set Content-Type to application/json.");
  next();
};
export function ipLimit(limit: number, windowMs: number) {
  return rateLimit({
    limit, windowMs, standardHeaders: "draft-8", legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: "TOO_MANY_REQUESTS", message: "Too many requests. Try again later." } }),
  });
}
export const authIpLimit = ipLimit(100, 15 * 60_000);
export const registrationIpLimit = ipLimit(10, 60 * 60_000);
export const resendIpLimit = ipLimit(10, 60 * 60_000);
