import { before, after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import { addDays, localParts } from "../src/config/facility.js";
import { signLiqPay } from "../src/payments/liqpay.js";
import { password, setBase, request, ok, error, register } from "./helpers.js";

assert.equal(env.NODE_ENV, "test");
assert.match(new URL(env.DATABASE_URL).pathname, /^\/workstudio_test_[a-f0-9]{32}$/);
let server: ReturnType<typeof app.listen>, base: string;
let owner: string, ownerId: string, other: string, unverified: string, admin: string, adminId: string;
const date = addDays(localParts(new Date()).date, 7);
let number = 0;
const initiatePath = (id: string) => "/bookings/" + id + "/payments/liqpay";
const initiate = (id: string, key = randomUUID(), token = owner) => request(initiatePath(id), { token, method: "POST", key, body: {} });
async function createBooking(shortHold = false) {
  const workspace = await prisma.workspace.create({ data: { name: "LiqPay desk " + (++number), type: "Desk", location: "Test hall", description: "Isolated test fixture" } });
  const tariff = await prisma.tariff.create({ data: { name: "LiqPay tariff " + number, price: "150.25" } });
  const databaseTime = (await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0]!.now;
  if (shortHold) return prisma.booking.create({ data: {
    userId: ownerId, workspaceId: workspace.id, workspaceName: workspace.name, tariffId: tariff.id, tariffName: tariff.name, amount: tariff.price,
    startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 90000000),
    createdAt: new Date(Date.now() - 60000), paymentDeadline: new Date(databaseTime.getTime() + 2000),
  } });
  return (await ok("/bookings", { token: owner, method: "POST", body: {
    workspaceId: workspace.id, tariffId: tariff.id, date, startTime: "10:00", endTime: "11:00", confirm: true,
  } }, 201)).booking;
}
function signed(paymentId: string, status = "success", changes: Record<string, unknown> = {}) {
  const data = Buffer.from(JSON.stringify({
    version: 7, action: "pay", public_key: env.LIQPAY_PUBLIC_KEY,
    order_id: "workstudio_" + paymentId, amount: 150.25, currency: "UAH", status,
    payment_id: String(BigInt("0x" + paymentId.replaceAll("-", "").slice(0, 12))), ...changes,
  })).toString("base64");
  const signature = createHash("sha3-256").update(env.LIQPAY_PRIVATE_KEY! + data + env.LIQPAY_PRIVATE_KEY!).digest("base64");
  return { data, signature };
}
async function callback(fields: Record<string, string>, expected = 200) {
  const response = await fetch(base + "/payments/liqpay/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
  const body = await response.json() as any;
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
async function attempt(booking: { id: string }) {
  const response = await initiate(booking.id);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body.data;
}
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  base = "http://127.0.0.1:" + address.port + "/api";
  setBase(base);
  ({ token: owner, id: ownerId } = await register("liqpay-owner@example.com"));
  other = (await register("liqpay-other@example.com")).token;
  unverified = (await register("liqpay-unverified@example.com", false)).token;
  const account = await prisma.user.create({ data: { name: "LiqPay test administrator", email: "liqpay-admin@example.com", passwordHash: await bcrypt.hash(password, 10), role: "ADMINISTRATOR" } });
  adminId = account.id;
  admin = (await ok("/auth/login", { method: "POST", body: { email: account.email, password } })).accessToken;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});
describe("LiqPay test checkout and callbacks (offline fixtures)", { concurrency: false }, () => {
  test("v7 signature matches the official published SHA3-256 vector", () => {
    const data = "eyJwdWJsaWNfa2V5IjoiaTAwMDAwMDAwIiwidmVyc2lvbiI6NywiYWN0aW9uIjoicGF5IiwiYW1vdW50IjoiMyIsImN1cnJlbmN5IjoiVUFIIiwiZGVzY3JpcHRpb24iOiJ0ZXN0Iiwib3JkZXJfaWQiOiIwMDAwMDEifQ==";
    assert.equal(signLiqPay(data, "a4825234f4bae72a0be04eafe9e8e2bada209255"), "0adgJ8F2Ds5HCVkcz4AlmdLMRoIJf7IxsL3QmeFRz/s=");
  });
  test("checkout uses the snapshotted amount, unique attempt reference, HTTPS callback and original deadline", async () => {
    const b = await createBooking(), first = await attempt(b);
    await prisma.tariff.update({ where: { id: b.tariffId }, data: { price: "999.99" } });
    const input = JSON.parse(Buffer.from(first.checkout.fields.data, "base64").toString("utf8"));
    assert.equal(input.amount, "150.25");
    assert.equal(input.order_id, "workstudio_" + first.payment.id);
    assert.equal(input.public_key, env.LIQPAY_PUBLIC_KEY);
    assert.equal(input.version, 7);
    assert.equal(input.action, "pay");
    assert.equal(input.currency, "UAH");
    assert.equal(input.server_url, env.PUBLIC_API_URL + "/api/payments/liqpay/callback");
    assert.equal(input.expired_date, new Date(b.paymentDeadline).toISOString().slice(0,19).replace("T"," "));
    assert.equal(first.checkout.url, "https://www.liqpay.ua/api/3/checkout");
    assert.equal(first.checkout.method, "POST");
    assert.equal(first.payment.status, "PENDING");
    assert.equal(first.checkout.fields.signature, signLiqPay(first.checkout.fields.data, env.LIQPAY_PRIVATE_KEY!));
    assert.equal(JSON.stringify(first).includes(env.LIQPAY_PRIVATE_KEY!), false);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "PENDING_PAYMENT");
    // A client can see its signed checkout request; replaying it is not a signed provider result.
    await callback(first.checkout.fields, 400);
  });
  test("ownership, role, verification and strict client input are enforced", async () => {
    const b = await createBooking();
    await error(initiatePath(b.id), { method: "POST", body: {}, key: randomUUID() }, 401);
    assert.equal((await initiate(b.id, randomUUID(), other)).status, 404);
    assert.equal((await initiate(b.id, randomUUID(), unverified)).status, 403);
    assert.equal((await initiate(b.id, randomUUID(), admin)).status, 403);
    await error(initiatePath(b.id), { token: owner, method: "POST", key: randomUUID(), body: { amount: "0.01", success: true } }, 400);
  });
  test("concurrent identical initiation is idempotent and distinct keys cannot create competing checkouts", async () => {
    const b = await createBooking(), key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => initiate(b.id, key)));
    results.forEach(result => { assert.equal(result.status, 200, JSON.stringify(result.body)); assert.deepEqual(result.body, results[0]!.body); });
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id } }), 1);
    await error(initiatePath(b.id), { token: owner, method: "POST", key: randomUUID(), body: {} }, 409, "PAYMENT_ATTEMPT_PENDING");
    await error("/bookings/" + b.id + "/mock-payments", { token: owner, method: "POST", key: randomUUID(), body: { scenario: "success" } }, 409, "PAYMENT_ATTEMPT_PENDING");
    const second = await createBooking();
    await error(initiatePath(second.id), { token: owner, method: "POST", key, body: {} }, 409, "IDEMPOTENCY_KEY_REUSED");
  });
  test("missing, invalid, SHA-1 and altered signatures cannot modify state", async () => {
    const b = await createBooking(), data = await attempt(b), valid = signed(data.payment.id);
    await callback({ data: valid.data }, 400);
    await callback({ data: valid.data, signature: "invalid" }, 400);
    await callback({ data: valid.data, signature: createHash("sha1").update(env.LIQPAY_PRIVATE_KEY! + valid.data + env.LIQPAY_PRIVATE_KEY!).digest("base64") }, 400);
    await callback({ ...valid, data: valid.data.slice(0,-2) + "AA" }, 400);
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: data.payment.id } })).status, "PENDING");
    assert.equal(await prisma.paymentCallback.count({ where: { paymentId: data.payment.id } }), 0);
  });
  test("signed amount, currency, merchant, action, version and reference mismatches are rejected", async () => {
    const b = await createBooking(), data = await attempt(b);
    for (const change of [{ amount: 1 }, { currency: "USD" }, { public_key: "sandbox_other" }, { action: "hold" }, { version: 3 }]) {
      await callback(signed(data.payment.id, "success", change), 400);
    }
    await callback(signed(randomUUID()), 404);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "PENDING_PAYMENT");
  });
  test("verified test success confirms atomically; duplicates and concurrent callbacks do not repeat side effects", async () => {
    const b = await createBooking(), data = await attempt(b), result = signed(data.payment.id);
    await Promise.all(Array.from({ length: 6 }, () => callback(result)));
    await callback(signed(data.payment.id, "success", { completion_date: "different_delivery_metadata" }));
    const saved = await prisma.payment.findUniqueOrThrow({ where: { id: data.payment.id } });
    assert.equal(saved.status, "SUCCEEDED");
    assert.equal(saved.providerPaymentId, JSON.parse(Buffer.from(result.data, "base64").toString()).payment_id);
    assert.equal(await prisma.paymentCallback.count({ where: { paymentId: data.payment.id } }), 2);
    assert.equal(await prisma.notification.count({ where: { bookingId: b.id, event: "PAYMENT_SUCCEEDED" } }), 1);
    const booking = (await ok("/bookings/" + b.id, { token: owner })).booking;
    assert.equal(booking.status, "CONFIRMED");
    assert.equal(booking.version, 2);
    assert.equal(booking.paymentStatus, "SUCCEEDED");
    assert.equal(booking.paymentProvider, "LIQPAY_TEST");
    assert.equal(booking.paymentDeadline, b.paymentDeadline);
  });
  test("processing/3DS statuses stay pending; failure permits a new-key retry without extending the hold", async () => {
    const b = await createBooking(), first = await attempt(b);
    await callback(signed(first.payment.id, "3ds_verify"));
    await callback(signed(first.payment.id, "processing"));
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } })).status, "PENDING");
    await callback(signed(first.payment.id, "failure"));
    await callback(signed(first.payment.id, "failure"));
    assert.equal(await prisma.notification.count({ where: { bookingId: b.id, event: "PAYMENT_FAILED" } }), 1);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "PENDING_PAYMENT");
    const second = await attempt(b);
    assert.notEqual(second.payment.id, first.payment.id);
    await callback(signed(second.payment.id));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).paymentDeadline.toISOString(), b.paymentDeadline);
  });
  test("success after expiration is retained for reconciliation and never reopens a booking", async () => {
    const b = await createBooking(true), first = await attempt(b);
    await prisma.$executeRaw`SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM (${new Date(b.paymentDeadline)}::timestamptz - clock_timestamp())) + 0.05))`;
    const payload = signed(first.payment.id);
    await callback(payload);
    await callback(payload);
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(saved.status, "CANCELLED");
    assert.equal(saved.cancellationReason, "PAYMENT_TIMEOUT");
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } })).status, "REQUIRES_REVIEW");
    assert.equal(await prisma.notification.count({ where: { bookingId: b.id, event: "PAYMENT_SUCCEEDED" } }), 0);
    assert.equal(await prisma.notification.count({ where: { bookingId: b.id, event: "PAYMENT_REQUIRES_REVIEW" } }), 1);
    assert.equal((await initiate(b.id)).status, 409);
  });
  test("success after administrator cancellation requires review and preserves cancellation", async () => {
    const b = await createBooking(), first = await attempt(b);
    await ok("/admin/bookings/" + b.id + "/cancel", { token: admin, method: "POST", key: randomUUID(), body: { version: 1, confirm: true } });
    await callback(signed(first.payment.id));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "CANCELLED");
    const history = await ok("/bookings/" + b.id + "/payments", { token: owner });
    assert.equal(history.payments[0].status, "REQUIRES_REVIEW");
    assert.equal(history.payments[0].reconciliationRequired, true);
    assert.equal("checkoutPublicKey" in history.payments[0], false);
  });
  test("contradictory terminal callbacks are audited for review, never overwrite completed payment records", async () => {
    const b = await createBooking(), first = await attempt(b);
    await callback(signed(first.payment.id, "failure"));
    await callback(signed(first.payment.id, "success"));
    await callback(signed(first.payment.id, "success"));
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } })).status, "FAILED");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "PENDING_PAYMENT");
    const history = await ok("/bookings/" + b.id + "/payments", { token: owner });
    assert.equal(history.payments[0].reconciliationRequired, true);
    assert.equal((await initiate(b.id)).body.error.code, "PAYMENT_REQUIRES_REVIEW");
    const record = await prisma.paymentCallback.findFirstOrThrow({ where: { paymentId: first.payment.id, disposition: "REQUIRES_REVIEW" } });
    await assert.rejects(prisma.paymentCallback.delete({ where: { id: record.id } }));
    await assert.rejects(prisma.payment.update({ where: { id: first.payment.id }, data: { status: "SUCCEEDED" } }));
  });
  test("provider transaction IDs cannot be substituted or reused across attempts", async () => {
    const b = await createBooking(), first = await attempt(b), payload = signed(first.payment.id);
    await callback(payload);
    const otherBooking = await createBooking(), second = await attempt(otherBooking);
    const providerId = JSON.parse(Buffer.from(payload.data, "base64").toString()).payment_id;
    await callback(signed(second.payment.id, "success", { payment_id: providerId }), 409);
    await callback(signed(first.payment.id, "success", { payment_id: "99999" }), 409);
  });
  test("unknown signed statuses require operator review rather than an invented confirmation", async () => {
    const b = await createBooking(), first = await attempt(b);
    await callback(signed(first.payment.id, "unexpected_status"));
    assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: first.payment.id } })).status, "REQUIRES_REVIEW");
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "PENDING_PAYMENT");
  });
  test("disabled, missing or live credentials do not break health and never yield checkout", async () => {
    const b = await createBooking(), saved = { enabled: env.LIQPAY_TEST_ENABLED, publicKey: env.LIQPAY_PUBLIC_KEY, privateKey: env.LIQPAY_PRIVATE_KEY };
    try {
      env.LIQPAY_TEST_ENABLED = false;
      await error(initiatePath(b.id), { token: owner, method: "POST", key: randomUUID(), body: {} }, 503, "PAYMENTS_DISABLED");
      await ok("/health");
      env.LIQPAY_TEST_ENABLED = true;
      for (const value of [undefined, "i_live_merchant"]) {
        env.LIQPAY_PUBLIC_KEY = value;
        await error(initiatePath(b.id), { token: owner, method: "POST", key: randomUUID(), body: {} }, 503, "PAYMENTS_NOT_CONFIGURED");
        await ok("/health");
      }
      env.LIQPAY_PUBLIC_KEY = saved.publicKey;
      env.LIQPAY_PRIVATE_KEY = undefined;
      await error(initiatePath(b.id), { token: owner, method: "POST", key: randomUUID(), body: {} }, 503, "PAYMENTS_NOT_CONFIGURED");
    } finally { env.LIQPAY_TEST_ENABLED = saved.enabled; env.LIQPAY_PUBLIC_KEY = saved.publicKey; env.LIQPAY_PRIVATE_KEY = saved.privateKey; }
  });
  test("TC-08: JWT, absolute database-session and idle expiry return 401 JSON without redirects", async () => {
    const id = randomUUID(), expiredToken = jwt.sign({ iat: Math.floor(Date.now()/1000)-120, exp: Math.floor(Date.now()/1000)-60 }, env.JWT_SECRET, {
      algorithm: "HS256", issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, subject: adminId, jwtid: id,
    });
    await prisma.session.create({ data: { id, userId: adminId, tokenHash: createHash("sha256").update(expiredToken).digest("hex"), expiresAt: new Date(Date.now()+60000) } });
    async function expired(token: string) {
      const response = await fetch(base + "/admin/session", { headers: { Authorization: "Bearer " + token }, redirect: "manual" });
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("location"), null);
      assert.equal(response.headers.get("www-authenticate"), "Bearer");
      assert.equal(((await response.json()) as any).error.code, "UNAUTHENTICATED");
    }
    await expired(expiredToken);
    for (const data of [{ expiresAt: new Date(Date.now()-1000) }, { lastActivityAt: new Date(Date.now()-env.SESSION_IDLE_MINUTES*60000-1000) }]) {
      const login = await ok("/auth/login", { method: "POST", body: { email: "liqpay-admin@example.com", password } });
      const claims = jwt.decode(login.accessToken) as jwt.JwtPayload;
      await prisma.session.update({ where: { id: claims.jti! }, data });
      await expired(login.accessToken);
    }
    await error("/admin/session", { token: owner }, 403, "FORBIDDEN");
    await ok("/admin/session", { token: admin });
  });
});
