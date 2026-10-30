import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError, logFailure } from "../utils/errors.js";

function sqlState(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const record = error as Record<string, unknown>;
  for (const key of ["code", "originalCode"]) {
    if (typeof record[key] === "string" && /^[0-9A-Z]{5}$/.test(record[key] as string) && !String(record[key]).startsWith("P20")) return record[key] as string;
  }
  for (const key of ["meta", "cause", "driverAdapterError"]) {
    const value = sqlState(record[key]);
    if (value) return value;
  }
}
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let problem: AppError;
  const state = sqlState(error);
  if (error instanceof AppError) problem = error;
  else if (error instanceof ZodError) {
    problem = new AppError(400, "VALIDATION_ERROR", "Check the submitted fields.", error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })));
  } else if (error instanceof SyntaxError && "body" in error) {
    problem = new AppError(400, "INVALID_JSON", "Request body must contain valid JSON.");
  } else if (error?.type === "entity.too.large") {
    problem = new AppError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  } else if (error?.type === "encoding.unsupported" || error?.type === "charset.unsupported") {
    problem = new AppError(415, "UNSUPPORTED_ENCODING", "Use an uncompressed UTF-8 JSON request body.");
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" || state === "23505") {
    const isRegistration = req.originalUrl.split("?")[0]?.replace(/\/$/, "") === "/api/auth/register";
    problem = isRegistration
      ? new AppError(409, "EMAIL_ALREADY_REGISTERED", "This email address is already registered.")
      : new AppError(409, "NAME_ALREADY_EXISTS", "An active workspace or tariff already has this name.");
  } else if (state === "23514" && req.originalUrl.split("?")[0]?.replace(/\/$/, "").endsWith("/mock-payments")) {
    problem = new AppError(409, "BOOKING_NOT_PAYABLE", "Payment eligibility changed. Refresh the booking before retrying.");
  } else if (state === "23P01") {
    problem = new AppError(409, "BOOKING_CONFLICT", "The interval conflicts with another active booking. Refresh availability and try again.");
  } else if (["55P03", "40P01", "40001"].includes(state ?? "") || error?.code === "P2034" || error?.code === "P2028") {
    problem = new AppError(503, "RESOURCE_BUSY", "The requested resource is busy. Retry the operation.", { retryAfterSeconds: 1 });
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003" || state === "23503") {
    problem = new AppError(409, "RESOURCE_IN_USE", "This record is referenced by other data and cannot be removed.");
  } else {
    logFailure("request_failed:" + req.method + ":" + (req.route?.path ?? "unmatched"), error);
    problem = new AppError(500, "INTERNAL_ERROR", "The request could not be completed. Please try again later.");
  }
  if (problem.status === 401) res.setHeader("WWW-Authenticate", "Bearer");
  if ([429, 503].includes(problem.status) && problem.details && typeof problem.details === "object" && "retryAfterSeconds" in problem.details) res.setHeader("Retry-After", String(problem.details.retryAfterSeconds));
  res.status(problem.status).json({ error: { code: problem.code, message: problem.message, ...(problem.details ? { details: problem.details } : {}) } });
};
