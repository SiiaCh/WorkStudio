import express, { Router } from "express";
import { z } from "zod";
import { processLiqPayCallback } from "../services/liqpay.js";
import { ipLimit } from "../middleware/security.js";
import { AppError, logFailure } from "../utils/errors.js";

export const liqpayCallbackRouter = Router();
const form = z.strictObject({
  data: z.string().min(1).max(48000),
  signature: z.string().min(1).max(100),
});
liqpayCallbackRouter.post("/", ipLimit(600, 60000), (req, _res, next) => {
  if (!req.is("application/x-www-form-urlencoded")) throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "LiqPay callbacks require application/x-www-form-urlencoded.");
  next();
}, express.urlencoded({ extended: false, limit: "64kb", inflate: false, parameterLimit: 2 }), async (req, res) => {
  try {
    const input = form.parse(req.body);
    await processLiqPayCallback(input.data, input.signature);
    res.json({ data: { received: true } });
  } catch (error) {
    logFailure("liqpay_callback_rejected", error);
    throw error;
  }
});
