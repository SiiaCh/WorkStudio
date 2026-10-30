import express from "express";
import { workspaceRouter, tariffRouter, adminCatalogRouter } from "./routes/catalog.js";
import { bookingRouter, adminBookingRouter, notificationRouter } from "./routes/bookings.js";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import { authRouter, adminRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { errorHandler } from "./middleware/errors.js";
import { ipLimit, requireJson, requireSecureTransport } from "./middleware/security.js";
import { AppError } from "./utils/errors.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(helmet({ strictTransportSecurity: env.NODE_ENV === "production" ? undefined : false }));
app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(requireSecureTransport);
const allowedOrigins = env.CORS_ORIGINS.split(",").map(item => item.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new AppError(403, "ORIGIN_NOT_ALLOWED", "This application origin is not allowed."));
  },
  credentials: false, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"], exposedHeaders: ["Retry-After"],
}));
const generalLimit = ipLimit(300, 15 * 60_000);
app.use((req, res, next) => {
  // Polling reads have their own limit, sized for shared coworking network addresses.
  if (req.method === "GET" && ["/api/workspaces/availability", "/api/notifications"].includes(req.path.replace(/\/$/, ""))) return next();
  return generalLimit(req, res, next);
});
app.use(requireJson);
app.use(express.json({ limit: "16kb", inflate: false }));
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/tariffs", tariffRouter);
app.use("/api/bookings", bookingRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/admin/bookings", adminBookingRouter);
app.use("/api/admin", adminCatalogRouter);
app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "The requested endpoint does not exist.")));
app.use(errorHandler);
