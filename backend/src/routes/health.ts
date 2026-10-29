import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { logFailure } from "../utils/errors.js";

export const healthRouter = Router();
healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { status: "ok", database: "reachable" } });
  } catch (error) {
    logFailure("health_database_failed", error);
    res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "The service is not ready." } });
  }
});
