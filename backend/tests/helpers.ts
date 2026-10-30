import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

let base = "";
export const password = "Integration-example-password!";
export function setBase(value: string) { base = value; }
export interface Options { token?: string; method?: string; body?: unknown; key?: string }
export async function request(path: string, { token, method = "GET", body, key }: Options = {}) {
  const response = await fetch(base + path, {
    method, headers: { ...(token ? { Authorization: "Bearer " + token } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(key ? { "Idempotency-Key": key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as any };
}
export async function ok(path: string, options: Options = {}, status = 200) {
  const result = await request(path, options);
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body.data;
}
export async function error(path: string, options: Options, status: number, code?: string) {
  const result = await request(path, options);
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(result.body.error.code, code);
}
export async function register(email: string, verify = true) {
  const data = await ok("/auth/register", { method: "POST", body: { name: "Test client", email, password } }, 201);
  assert.equal(data.user.role, "CLIENT");
  assert.equal("passwordHash" in data.user, false);
  if (verify) {
    const token = new URL(data.emailDelivery.verificationUrl).searchParams.get("token");
    await ok("/auth/verify-email", { method: "POST", body: { token } });
  }
  const login = await ok("/auth/login", { method: "POST", body: { email, password } });
  return { token: login.accessToken as string, id: data.user.id as string };
}
export const paymentPath = (id: string) => "/bookings/" + id + "/mock-payments";
export const pay = (token: string, id: string, scenario = "success", key = randomUUID()) =>
  request(paymentPath(id), { token, method: "POST", key, body: { scenario } });
