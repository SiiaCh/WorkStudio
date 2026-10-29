import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError, logFailure } from "../utils/errors.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let problem: AppError;
  if (error instanceof AppError) problem = error;
  else if (error instanceof ZodError) {
    problem = new AppError(400, "VALIDATION_ERROR", "Check the submitted fields.", error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })));
  } else if (error instanceof SyntaxError && "body" in error) {
    problem = new AppError(400, "INVALID_JSON", "Request body must contain valid JSON.");
  } else if (error?.type === "entity.too.large") {
    problem = new AppError(413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  } else if (error?.type === "encoding.unsupported" || error?.type === "charset.unsupported") {
    problem = new AppError(415, "UNSUPPORTED_ENCODING", "Use an uncompressed UTF-8 JSON request body.");
  } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    problem = new AppError(409, "EMAIL_ALREADY_REGISTERED", "This email address is already registered.");
  } else {
    logFailure("request_failed:" + req.method + ":" + (req.route?.path ?? "unmatched"), error);
    problem = new AppError(500, "INTERNAL_ERROR", "The request could not be completed. Please try again later.");
  }
  if (problem.status === 401) res.setHeader("WWW-Authenticate", "Bearer");
  if (problem.status === 429 && problem.details && typeof problem.details === "object" && "retryAfterSeconds" in problem.details) res.setHeader("Retry-After", String(problem.details.retryAfterSeconds));
  res.status(problem.status).json({ error: { code: problem.code, message: problem.message, ...(problem.details ? { details: problem.details } : {}) } });
};
