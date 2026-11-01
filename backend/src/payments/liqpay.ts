import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { z } from "zod";

export const LIQPAY_CHECKOUT_URL = "https://www.liqpay.ua/api/3/checkout";
export function liqpayConfig() {
  if (!env.LIQPAY_TEST_ENABLED) throw new AppError(503, "PAYMENTS_DISABLED", "LiqPay test payments are disabled.");
  const publicKey = env.LIQPAY_PUBLIC_KEY;
  const privateKey = env.LIQPAY_PRIVATE_KEY;
  const testKey = /^sandbox_[A-Za-z0-9_-]{3,240}$/;
  const unavailable = () => new AppError(503, "PAYMENTS_NOT_CONFIGURED", "Configure sandbox LiqPay keys and public HTTPS URLs to enable test checkout.");
  if (!publicKey || !privateKey || publicKey.length > 100 || !testKey.test(publicKey) || !testKey.test(privateKey) || /REPLACE|YOUR_/i.test(publicKey + privateKey)) throw unavailable();
  const callbackUrl = new URL("/api/payments/liqpay/callback", env.PUBLIC_API_URL).toString();
  const resultUrl = env.LIQPAY_RESULT_URL;
  for (const value of [callbackUrl, ...(resultUrl ? [resultUrl] : [])]) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || value.length > 510) throw unavailable();
    } catch { throw unavailable(); }
  }
  return { publicKey, privateKey, callbackUrl, resultUrl };
}
export function liqpayAvailable() {
  try { liqpayConfig(); return true; } catch { return false; }
}
export function signLiqPay(data: string, privateKey: string) {
  // Official API v7: binary SHA3-256 digest, then base64. No legacy SHA-1 fallback.
  return createHash("sha3-256").update(privateKey + data + privateKey, "utf8").digest("base64");
}
export function checkoutFields(input: {
  id: string; amount: { toFixed(dp: number): string }; paymentDeadline: Date;
  publicKey: string; callbackUrl: string; resultUrl?: string | null; privateKey: string;
}) {
  const data = Buffer.from(JSON.stringify({
    version: 7, public_key: input.publicKey, action: "pay", amount: input.amount.toFixed(2),
    currency: "UAH", description: "WorkStudio test booking", order_id: "workstudio_" + input.id,
    server_url: input.callbackUrl, ...(input.resultUrl ? { result_url: input.resultUrl } : {}),
    expired_date: input.paymentDeadline.toISOString().slice(0, 19).replace("T", " "), language: "uk",
  }), "utf8").toString("base64");
  return { url: LIQPAY_CHECKOUT_URL, method: "POST" as const, fields: { data, signature: signLiqPay(data, input.privateKey) } };
}
const callbackSchema = z.object({
  version: z.union([z.literal(7), z.literal("7")]),
  action: z.literal("pay"),
  public_key: z.string().min(1).max(100),
  order_id: z.string().regex(/^workstudio_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  amount: z.union([z.number().positive().finite(), z.string()]).transform(String)
    .pipe(z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)),
  currency: z.literal("UAH"),
  payment_id: z.union([z.number().int().positive().max(Number.MAX_SAFE_INTEGER), z.string().regex(/^[1-9]\d{0,39}$/)]).transform(String),
  status: z.string().regex(/^(?:3ds_verify|[a-z][a-z0-9_]{0,79})$/),
});
export function verifyCallback(data: string, signature: string, privateKey: string) {
  const expected = Buffer.from(signLiqPay(data, privateKey), "base64");
  const supplied = Buffer.from(signature, "base64");
  if (supplied.length !== expected.length || supplied.toString("base64") !== signature || !timingSafeEqual(expected, supplied)) {
    throw new AppError(400, "INVALID_PAYMENT_SIGNATURE", "The LiqPay signature is invalid.");
  }
  const bytes = Buffer.from(data, "base64");
  if (bytes.toString("base64") !== data) throw new AppError(400, "INVALID_PAYMENT_CALLBACK", "Invalid callback encoding.");
  let decoded: unknown;
  try { decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new AppError(400, "INVALID_PAYMENT_CALLBACK", "Invalid callback data."); }
  const parsed = callbackSchema.safeParse(decoded);
  if (!parsed.success) throw new AppError(400, "INVALID_PAYMENT_CALLBACK", "The callback has invalid payment fields.");
  // Only these fields leave the provider adapter; card/token/customer fields are discarded.
  return parsed.data;
}
export const failedStatuses = new Set(["error", "failure", "reversed"]);
export const pendingStatuses = new Set([
  "3ds_verify", "captcha_verify", "cvv_verify", "ivr_verify", "otp_verify", "password_verify", "phone_verify",
  "pin_verify", "senderapp_verify", "wait_qr", "wait_sender", "cash_wait", "hold_wait", "invoice_wait",
  "prepared", "processing", "wait_accept", "wait_card", "wait_compensation", "wait_lc", "wait_reserve", "wait_secure",
]);
