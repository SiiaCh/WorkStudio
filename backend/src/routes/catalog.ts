import { Router } from "express";
import * as controller from "../controllers/catalog.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { ipLimit } from "../middleware/security.js";

export const workspaceRouter = Router();
workspaceRouter.get("/", controller.workspaces);
workspaceRouter.get("/availability", ipLimit(12000, 60_000), controller.availabilityQuery);
workspaceRouter.get("/:id", controller.workspace);

export const tariffRouter = Router();
tariffRouter.use(authenticate);
tariffRouter.get("/", controller.tariffs);

export const adminCatalogRouter = Router();
adminCatalogRouter.use(authenticate, requireRole("ADMINISTRATOR"));
adminCatalogRouter.get("/workspaces", controller.workspaces);
adminCatalogRouter.post("/workspaces", controller.createWorkspace);
adminCatalogRouter.get("/workspaces/:id", controller.workspace);
adminCatalogRouter.patch("/workspaces/:id", controller.updateWorkspace);
adminCatalogRouter.delete("/workspaces/:id", controller.deleteWorkspace);
adminCatalogRouter.get("/workspaces/:id/affected-bookings", controller.affectedBookings);
adminCatalogRouter.patch("/workspaces/:id/status", controller.changeStatus);
adminCatalogRouter.get("/tariffs", controller.tariffs);
adminCatalogRouter.post("/tariffs", controller.createTariff);
adminCatalogRouter.patch("/tariffs/:id", controller.updateTariff);
adminCatalogRouter.delete("/tariffs/:id", controller.deleteTariff);
