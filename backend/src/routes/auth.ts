import { Router } from "express";
import * as controller from "../controllers/auth.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { authIpLimit, registrationIpLimit, resendIpLimit } from "../middleware/security.js";

export const authRouter = Router();
authRouter.post("/register", registrationIpLimit, controller.register);
authRouter.get("/verify-email", authIpLimit, controller.verifyEmail);
authRouter.post("/verify-email", authIpLimit, controller.verifyEmail);
authRouter.post("/resend-verification", resendIpLimit, controller.resend);
authRouter.post("/login", authIpLimit, controller.login);
authRouter.post("/logout", authenticate, controller.logout);
authRouter.get("/me", authenticate, controller.profile);

// Stage 1 authorization check only; no future administrator operations.
export const adminRouter = Router();
adminRouter.get("/session", authenticate, requireRole("ADMINISTRATOR"), controller.profile);
