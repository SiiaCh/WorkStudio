import { Router } from "express";
import * as controller from "../controllers/bookings.js";
import { authenticate, requireRole, requireVerifiedEmail } from "../middleware/auth.js";
import { ipLimit } from "../middleware/security.js";

export const bookingRouter = Router();
bookingRouter.use(authenticate, requireRole("CLIENT"));
bookingRouter.get("/history", controller.history);
bookingRouter.get("/calendar", controller.calendar);
bookingRouter.post("/recurring/preview", controller.recurringPreview);
bookingRouter.post("/recurring", requireVerifiedEmail, controller.recurringCreate);
bookingRouter.post("/", requireVerifiedEmail, controller.create);
bookingRouter.get("/:id", controller.detail);

export const adminBookingRouter = Router();
adminBookingRouter.use(authenticate, requireRole("ADMINISTRATOR"));
adminBookingRouter.get("/", controller.adminList);
adminBookingRouter.post("/", controller.adminCreate);
adminBookingRouter.get("/:id", controller.adminDetail);
adminBookingRouter.patch("/:id", controller.adminEdit);
adminBookingRouter.post("/:id/cancel", controller.adminCancel);

export const notificationRouter = Router();
notificationRouter.use(ipLimit(12000, 60_000), authenticate, requireRole("CLIENT"));
notificationRouter.get("/", controller.notificationList);
notificationRouter.post("/:id/read", controller.notificationRead);
