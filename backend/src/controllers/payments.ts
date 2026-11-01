import { z } from "zod";
import { initiateLiqPay } from "../services/liqpay.js";
import type { RequestHandler } from "express";
import { mockPaymentSchema } from "../validation/payments.js";
import { mockPayment, listPayments } from "../services/payments.js";
import { operationKey, resourceId } from "./catalog.js";

export const simulate: RequestHandler = async (req, res) => {
  const input = mockPaymentSchema.parse(req.body);
  res.json({ data: await mockPayment(req.auth!.userId, resourceId(req), operationKey(req), input.scenario) });
};
export const history: RequestHandler = async (req, res) => {
  res.json({ data: await listPayments(req.auth!.userId, resourceId(req)) });
};

export const initiate: RequestHandler = async (req, res) => {
  z.strictObject({}).parse(req.body);
  res.json({ data: await initiateLiqPay(req.auth!.userId, resourceId(req), operationKey(req)) });
};
