import { before, after, describe, test, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import bcrypt from "bcrypt";
import { Client } from "pg";
import { app } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { env } from "../src/config/env.js";
import { addDays, localParts, localInstant, weekday, facility, weekdayNames } from "../src/config/facility.js";
import { refreshLifecycle, startReservationWorker } from "../src/services/lifecycle.js";
import { password, setBase, request, ok, error, register, paymentPath, pay as simulate } from "./helpers.js";

assert.equal(env.NODE_ENV, "test");
assert.match(new URL(env.DATABASE_URL).pathname, /^\/workstudio_test_[a-f0-9]{32}$/);
const date = addDays(localParts(new Date()).date, 7);
let server: ReturnType<typeof app.listen>;
let admin: string, client: string, other: string, unverified: string;
let ownerId: string;
let sequence = 0;
const pay = (id: string, scenario = "success", key = randomUUID()) => simulate(client, id, scenario, key);
const adminOptions = (method: string, body: unknown, key = randomUUID()) => ({ token: admin, method, body, key });
async function catalog() {
  const workspace = (await ok("/admin/workspaces", adminOptions("POST", {
    name: "Desk " + (++sequence), type: "Desk", location: "Hall", description: "Integration fixture", mapPosition: { x: 0.25, y: 0.5 },
  }), 201)).workspace;
  const tariff = (await ok("/admin/tariffs", adminOptions("POST", { name: "Tariff " + (++sequence), price: "150.00" }), 201)).tariff;
  return { workspace, tariff };
}
async function booking(workspace: any, tariff: any, changes = {}) {
  return (await ok("/bookings", { token: client, method: "POST", body: {
    workspaceId: workspace.id, tariffId: tariff.id, date, startTime: "10:00", endTime: "11:00", confirm: true, ...changes,
  } }, 201)).booking;
}
async function fixture(workspace: any, tariff: any, changes: Record<string, unknown> = {}) {
  const now = Date.now();
  return prisma.booking.create({ data: {
    userId: ownerId, workspaceId: workspace.id, workspaceName: workspace.name,
    tariffId: tariff.id, tariffName: tariff.name, amount: tariff.price,
    startsAt: new Date(now + 86400000), endsAt: new Date(now + 90000000),
    createdAt: new Date(now - 120000), paymentDeadline: new Date(now - 60000), ...changes,
  } });
}
before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  setBase("http://127.0.0.1:" + address.port + "/api");
  await prisma.user.create({ data: { name: "Test administrator", email: "admin@example.com", passwordHash: await bcrypt.hash(password, 10), role: "ADMINISTRATOR", emailVerifiedAt: new Date() } });
  admin = (await ok("/auth/login", { method: "POST", body: { email: "admin@example.com", password } })).accessToken;
  ({ token: client, id: ownerId } = await register("client@example.com"));
  other = (await register("other@example.com")).token;
  unverified = (await register("unverified@example.com", false)).token;
});
after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});
describe("HTTP integration", { concurrency: false }, () => {
  test("health, login errors, private profiles, roles and session logout", async () => {
    await ok("/health");
    await error("/auth/me", {}, 401);
    await error("/auth/me", { token: "invalid" }, 401);
    await error("/auth/login", { method: "POST", body: { email: "client@example.com", password: "incorrect-password" } }, 401, "INVALID_CREDENTIALS");
    await error("/admin/session", { token: client }, 403);
    await ok("/admin/session", { token: admin });
    const login = await ok("/auth/login", { method: "POST", body: { email: "client@example.com", password } });
    await ok("/auth/logout", { token: login.accessToken, method: "POST", body: {} });
    await error("/auth/me", { token: login.accessToken }, 401);
    await ok("/auth/me", { token: client });
  });
  test("registration validation, duplicate email and public privilege escalation", async () => {
    await error("/auth/register", { method: "POST", body: { name: "Client", email: "invalid", password } }, 400);
    await error("/auth/register", { method: "POST", body: { name: "Client", email: "client@example.com", password } }, 409, "EMAIL_ALREADY_REGISTERED");
    await error("/auth/register", { method: "POST", body: { name: "Client", email: "escalate@example.com", password, role: "ADMINISTRATOR" } }, 400);
    await error("/auth/verify-email", { method: "POST", body: { token: "a".repeat(64) } }, 400);
  });
  test("workspace and tariff CRUD validates roles, names, prices and versions", async () => {
    const { workspace, tariff } = await catalog();
    assert.equal(workspace.status, "FREE");
    assert.deepEqual(workspace.mapPosition, { x: 0.25, y: 0.5 });
    await error("/admin/tariffs", { token: client, method: "POST", key: randomUUID(), body: { name: "No", price: "1" } }, 403);
    await error("/admin/tariffs", adminOptions("POST", { name: "No", price: "0" }), 400);
    await error("/admin/tariffs", adminOptions("POST", { name: tariff.name.toUpperCase(), price: "1.00" }), 409);
    const key = randomUUID(), body = { version: 1, description: "Updated" };
    const first = await ok("/admin/workspaces/" + workspace.id, adminOptions("PATCH", body, key));
    assert.deepEqual(await ok("/admin/workspaces/" + workspace.id, adminOptions("PATCH", body, key)), first);
    await error("/admin/workspaces/" + workspace.id, adminOptions("PATCH", body), 409, "VERSION_CONFLICT");
    await ok("/tariffs", { token: client });
    await ok("/admin/workspaces/" + workspace.id, adminOptions("DELETE", { version: 2, confirm: true }));
    await ok("/admin/tariffs/" + tariff.id, adminOptions("DELETE", { version: 1, confirm: true }));
  });
  test("booking validation and verified-owner isolation", async () => {
    const { workspace, tariff } = await catalog();
    await error("/bookings", { token: unverified, method: "POST", body: {} }, 403, "EMAIL_NOT_VERIFIED");
    await error("/bookings", { token: admin, method: "POST", body: {} }, 403);
    for (const [startTime, endTime] of [["12:00","10:00"],["07:00","09:00"]]) {
      await error("/bookings", { token: client, method: "POST", body: { workspaceId: workspace.id, tariffId: tariff.id, date, startTime, endTime, confirm: true } }, 400);
    }
    const b = await booking(workspace, tariff);
    await error("/bookings/" + b.id, { token: other }, 404);
    await error("/bookings/" + b.id, { token: client, method: "PATCH", body: {} }, 404);
    const history = await ok("/bookings/history", { token: other });
    assert.equal(history.bookings.some((item: any) => item.id === b.id), false);
    await error(paymentPath(b.id), { token: other, method: "POST", key: randomUUID(), body: { scenario: "success" } }, 404);
    await error(paymentPath(b.id), { token: unverified, method: "POST", key: randomUUID(), body: { scenario: "success" } }, 403);
    await error("/bookings/" + b.id + "/payments", { token: other }, 404);
  });
  test("concurrent bookings have one winner, adjacent intervals remain available", async () => {
    const { workspace, tariff } = await catalog();
    const body = { workspaceId: workspace.id, tariffId: tariff.id, date, startTime: "10:00", endTime: "11:00", confirm: true };
    const results = await Promise.all(Array.from({ length: 6 }, () => request("/bookings", { token: client, method: "POST", body })));
    assert.equal(results.filter(result => result.status === 201).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 5);
    await booking(workspace, tariff, { startTime: "11:00", endTime: "12:00" });
    const availability = await ok("/workspaces/availability?date=" + date + "&startTime=10:00&endTime=11:00");
    assert.equal(availability.workspaces.find((item: any) => item.id === workspace.id).available, false);
    assert.equal(JSON.stringify(availability).includes(ownerId), false);
    const morning = await ok("/workspaces/availability?date=" + date + "&startTime=08:00&endTime=09:00");
    const desk = morning.workspaces.find((item: any) => item.id === workspace.id);
    assert.equal(desk.available, true);
    assert.equal(localParts(new Date(desk.availableUntil)).time, "10:00");
  });
  test("failed payment retains hold and deadline; new attempt succeeds using saved price", async () => {
    const { workspace, tariff } = await catalog();
    const b = await booking(workspace, tariff);
    await ok("/admin/tariffs/" + tariff.id, adminOptions("PATCH", { version: 1, price: "999.00" }));
    const key = randomUUID(), failed = await pay(b.id, "failure", key);
    assert.equal(failed.status, 200);
    assert.equal(failed.body.data.payment.status, "FAILED");
    assert.deepEqual((await pay(b.id, "failure", key)).body, failed.body);
    assert.equal((await ok("/bookings/" + b.id, { token: client })).booking.paymentDeadline, b.paymentDeadline);
    await error("/admin/tariffs/" + tariff.id, adminOptions("DELETE", { version: 2, confirm: true }), 409, "TARIFF_HAS_PAYMENTS");
    const success = await pay(b.id);
    assert.equal(success.status, 200, JSON.stringify(success.body));
    assert.equal(success.body.data.payment.amount, "150.00");
    const current = (await ok("/bookings/" + b.id, { token: client })).booking;
    assert.equal(current.status, "CONFIRMED");
    assert.equal(current.paymentStatus, "SUCCEEDED");
    assert.equal(current.paymentProvider, "MOCK");
    assert.equal("payments" in current, false);
    assert.equal(current.paymentDeadline, b.paymentDeadline);
    assert.equal((await ok("/bookings/" + b.id + "/payments", { token: client })).payments.length, 2);
    const calendar = await ok("/bookings/calendar?fromDate=" + date + "&toDate=" + date, { token: client });
    assert.equal(calendar.bookings.find((item: any) => item.id === b.id).paymentStatus, "SUCCEEDED");
    const availability = await ok("/workspaces/availability?date=" + date + "&startTime=10:00&endTime=11:00");
    assert.equal(availability.workspaces.find((item: any) => item.id === workspace.id).available, false);
    await error("/admin/tariffs/" + tariff.id, adminOptions("DELETE", { version: 2, confirm: true }), 409, "TARIFF_HAS_PAYMENTS");
  });
  test("payments reject amounts/status/ownership and require UUID idempotency keys", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff);
    await error(paymentPath(b.id), { token: client, method: "POST", body: { scenario: "success" } }, 400);
    for (const extra of [{ amount: "0.01" }, { status: "SUCCEEDED" }, { userId: ownerId }, { tariffId: tariff.id }]) {
      await error(paymentPath(b.id), { token: client, method: "POST", key: randomUUID(), body: { scenario: "success", ...extra } }, 400);
    }
    await error(paymentPath(b.id), { token: admin, method: "POST", key: randomUUID(), body: { scenario: "success" } }, 403);
    env.MOCK_PAYMENTS_ENABLED = false;
    try { await error(paymentPath(b.id), { token: client, method: "POST", key: randomUUID(), body: { scenario: "success" } }, 404); }
    finally { env.MOCK_PAYMENTS_ENABLED = true; }
  });
  test("concurrent identical payments return one result and one confirmation notification", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff), key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(b.id, "success", key)));
    results.forEach(result => { assert.equal(result.status, 200, JSON.stringify(result.body)); assert.deepEqual(result.body, results[0]!.body); });
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { bookingId: b.id, event: "PAYMENT_SUCCEEDED" } }), 1);
    assert.equal((await pay(b.id)).status, 409);
    await error(paymentPath(b.id), { token: client, method: "POST", key, body: { scenario: "failure" } }, 409, "IDEMPOTENCY_KEY_REUSED");
  });
  test("different concurrent keys cannot confirm a booking twice", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff);
    const results = await Promise.all(Array.from({ length: 6 }, () => pay(b.id)));
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 5);
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id, status: "SUCCEEDED" } }), 1);
  });
  test("expired payment commits cancellation, releases its slot and creates no payment", async () => {
    const { workspace, tariff } = await catalog(), b = await fixture(workspace, tariff);
    await error(paymentPath(b.id), { token: client, method: "POST", key: randomUUID(), body: { scenario: "success" } }, 409, "PAYMENT_WINDOW_EXPIRED");
    const expired = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    assert.equal(expired.status, "CANCELLED");
    assert.equal(expired.cancellationReason, "PAYMENT_TIMEOUT");
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id } }), 0);
    await refreshLifecycle();
    assert.equal(await prisma.notification.count({ where: { bookingId: b.id, event: "BOOKING_EXPIRED" } }), 1);
    const replacement = await fixture(workspace, tariff, { createdAt: new Date(), paymentDeadline: new Date(Date.now() + 60000) });
    assert.equal(replacement.status, "PENDING_PAYMENT");
  });
  test("payment deadline is rechecked after waiting for a workspace lock", async () => {
    const { workspace, tariff } = await catalog();
    const databaseTime = (await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0]!.now;
    const b = await fixture(workspace, tariff, { paymentDeadline: new Date(databaseTime.getTime() + 1200) });
    const blocker = new Client({ connectionString: env.DATABASE_URL });
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query('SELECT id FROM "Workspace" WHERE id=$1 FOR UPDATE', [workspace.id]);
      const pending = pay(b.id);
      await blocker.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ($1::timestamptz - clock_timestamp())) + 0.05))", [b.paymentDeadline]);
      await blocker.query("COMMIT");
      const result = await pending;
      assert.equal(result.status, 409, JSON.stringify(result.body));
      assert.equal(result.body.error.code, "PAYMENT_WINDOW_EXPIRED");
      assert.equal(await prisma.payment.count({ where: { bookingId: b.id } }), 0);
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); }
  });
  test("reservation worker expires holds and completes confirmed bookings once", async () => {
    const { workspace, tariff } = await catalog(), expired = await fixture(workspace, tariff);
    // Historical fixtures exist only in this isolated database; no development bookings are altered.
    const completed = await fixture(workspace, tariff, { status: "CONFIRMED", startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() - 1800000) });
    const stop = startReservationWorker();
    try {
      for (let n = 0; n < 30; n++) {
        if ((await prisma.booking.findUniqueOrThrow({ where: { id: completed.id } })).status === "COMPLETED") break;
        await delay(50);
      }
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: expired.id } })).status, "CANCELLED");
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: completed.id } })).status, "COMPLETED");
      await refreshLifecycle();
      assert.equal(await prisma.notification.count({ where: { bookingId: completed.id, event: "BOOKING_COMPLETED" } }), 1);
      await assert.rejects(prisma.booking.update({ where: { id: completed.id }, data: { status: "CONFIRMED" } }));
    } finally { await stop(); }
  });
  test("fixed occurrence pricing and public free ranges preserve integration contracts", async () => {
    const { workspace, tariff } = await catalog(); // Existing {name, price} request, no unit.
    const b = await booking(workspace, tariff, { endTime: "11:01" });
    assert.equal(b.amount, "150.00");
    assert.equal((await pay(b.id)).status, 200);
    const path = "/workspaces/" + workspace.id + "/available-slots?date=" + date;
    const ranges = await ok(path);
    assert.deepEqual(ranges.availableRanges.map((r: any) => [r.startTime, r.endTime]), [["08:00", "10:00"], ["11:01", "22:00"]]);
    const publicJson = JSON.stringify(ranges);
    for (const privateId of [b.id, ownerId, tariff.id]) assert.equal(publicJson.includes(privateId), false);
    await booking(workspace, tariff, { startTime: "11:01", endTime: "12:02" });
    assert.deepEqual((await ok(path)).availableRanges.map((r: any) => [r.startTime, r.endTime]), [["08:00", "10:00"], ["12:02", "22:00"]]);
    const input = { workspaceId: workspace.id, tariffId: tariff.id, fromDate: addDays(date, 14), toDate: addDays(date, 21), weekdays: [weekday(date) || 7], startTime: "10:00", endTime: "11:01" };
    const preview = await ok("/bookings/recurring/preview", { token: client, method: "POST", body: input });
    assert.equal(preview.totalAmount, "300.00");
    const series = await ok("/bookings/recurring", { token: client, method: "POST", body: { ...input, confirm: true } }, 201);
    assert.equal(series.totalAmount, "300.00");
    assert.equal(series.bookings.length, 2);
    for (const occurrence of series.bookings) assert.equal(occurrence.amount, "150.00");
    await error("/workspaces/" + workspace.id + "/available-slots?date=2027-02-30", {}, 400);
  });
  test("recurrence is atomic and accepted alternative occurrences are independently payable", async () => {
    const { workspace, tariff } = await catalog(), alternative = (await catalog()).workspace;
    await booking(workspace, tariff);
    const input = { workspaceId: workspace.id, tariffId: tariff.id, fromDate: date, toDate: addDays(date, 7),
      weekdays: [weekday(date) || 7], startTime: "10:00", endTime: "11:00" };
    const count = await prisma.booking.count();
    const preview = await ok("/bookings/recurring/preview", { token: client, method: "POST", body: input });
    assert.equal(preview.canCreate, false);
    assert.equal(preview.reservationCreated, false);
    await error("/bookings/recurring", { token: client, method: "POST", body: { ...input, confirm: true } }, 409, "RECURRING_CONFLICT");
    assert.equal(await prisma.booking.count(), count);
    const series = await ok("/bookings/recurring", { token: client, method: "POST", body: { ...input, alternatives: [{ date, workspaceId: alternative.id }], confirm: true } }, 201);
    assert.equal(series.bookings.length, 2);
    assert.equal(series.totalAmount, "300.00");
    assert.equal((await pay(series.bookings[0].id)).status, 200);
    assert.equal((await pay(series.bookings[1].id, "failure")).status, 200);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: series.bookings[1].id } })).status, "PENDING_PAYMENT");
  });
  test("administrator edits preserve paid prices; cancellation releases slots and keeps payment history", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff);
    assert.equal((await pay(b.id)).status, 200);
    const edited = (await ok("/admin/bookings/" + b.id, adminOptions("PATCH", {
      workspaceId: workspace.id, date, startTime: "12:00", endTime: "13:00", version: 2, confirm: true,
    }))).booking;
    assert.equal(edited.amount, "150.00");
    assert.equal(edited.paymentStatus, "SUCCEEDED");
    const cancelled = (await ok("/admin/bookings/" + b.id + "/cancel", adminOptions("POST", { version: 3, confirm: true }))).booking;
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.paymentStatus, "SUCCEEDED");
    assert.equal((await pay(b.id)).status, 409);
    const available = await ok("/workspaces/availability?date=" + date + "&startTime=12:00&endTime=13:00");
    assert.equal(available.workspaces.find((item: any) => item.id === workspace.id).available, true);
    assert.equal(await prisma.auditLog.count({ where: { resourceId: b.id } }), 2);
  });
  test("administrator cancellation and payment serialize without reopening a cancelled booking", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff);
    const [payment, cancel] = await Promise.all([pay(b.id), request("/admin/bookings/" + b.id + "/cancel", adminOptions("POST", { version: 1, confirm: true }))]);
    assert.deepEqual([payment.status, cancel.status].sort(), [200, 409]);
    const final = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    assert(["CONFIRMED", "CANCELLED"].includes(final.status));
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id } }), final.status === "CONFIRMED" ? 1 : 0);
  });
  test("Unavailable requires full resolution and atomically reassigns confirmed bookings", async () => {
    const { workspace, tariff } = await catalog(), destination = (await catalog()).workspace, b = await booking(workspace, tariff);
    assert.equal((await pay(b.id)).status, 200);
    const path = "/admin/workspaces/" + workspace.id + "/status";
    await error(path, { token: client, method: "PATCH", key: randomUUID(), body: { version: 1, status: "UNAVAILABLE", confirm: true } }, 403);
    await error(path, adminOptions("PATCH", { version: 1, status: "UNAVAILABLE", confirm: true }), 409, "UNRESOLVED_BOOKINGS");
    assert.equal((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).status, "FREE");
    const affected = await ok("/admin/workspaces/" + workspace.id + "/affected-bookings", { token: admin });
    assert.equal(affected.affectedBookings[0].booking.paymentStatus, "SUCCEEDED");
    const result = await ok(path, adminOptions("PATCH", { version: 1, status: "UNAVAILABLE", confirm: true,
      resolutions: [{ bookingId: b.id, action: "REASSIGN", workspaceId: destination.id }] }));
    assert.equal(result.workspace.status, "UNAVAILABLE");
    assert.equal(result.affectedBookings[0].workspaceId, destination.id);
    assert.equal(result.affectedBookings[0].status, "CONFIRMED");
    const notices = await ok("/notifications", { token: client });
    const notice = notices.notifications.find((item: any) => item.bookingId === b.id && item.event === "BOOKING_REASSIGNED");
    assert(notice);
    await error("/notifications/" + notice.id + "/read", { token: other, method: "POST", body: {} }, 404);
    await ok("/notifications/" + notice.id + "/read", { token: client, method: "POST", body: {} });
  });
  test("Occupied permits future bookings and deleted tariffs preserve pending snapshots", async () => {
    const { workspace, tariff } = await catalog();
    await ok("/admin/workspaces/" + workspace.id + "/status", adminOptions("PATCH", { status: "OCCUPIED", version: 1 }));
    const b = await booking(workspace, tariff);
    await ok("/admin/tariffs/" + tariff.id, adminOptions("DELETE", { version: 1, confirm: true }));
    assert.equal((await pay(b.id)).status, 200);
    assert.equal((await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).status, "OCCUPIED");
  });
  test("database guards reject unpaid confirmation and finalized payment mutation", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff);
    await assert.rejects(prisma.booking.update({ where: { id: b.id }, data: { status: "CONFIRMED" } }));
    assert.equal((await pay(b.id)).status, 200);
    const payment = await prisma.payment.findFirstOrThrow({ where: { bookingId: b.id } });
    await assert.rejects(prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } }));
    await assert.rejects(prisma.payment.delete({ where: { id: payment.id } }));
    await assert.rejects(prisma.booking.update({ where: { id: b.id }, data: { amount: "1.00" } }));
  });
  test("administrator creation is idempotent, notifies the owner and still requires payment", async () => {
    const { workspace, tariff } = await catalog(), key = randomUUID();
    const body = { userId: ownerId, workspaceId: workspace.id, tariffId: tariff.id, date, startTime: "14:00", endTime: "15:00", confirm: true };
    const first = await ok("/admin/bookings", adminOptions("POST", body, key), 201);
    assert.deepEqual(await ok("/admin/bookings", adminOptions("POST", body, key), 201), first);
    assert.equal(first.booking.status, "PENDING_PAYMENT");
    assert.equal(await prisma.auditLog.count({ where: { resourceId: first.booking.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { bookingId: first.booking.id, event: "BOOKING_CREATED" } }), 1);
    assert.equal((await pay(first.booking.id)).status, 200);
  });
  test("failed/successful concurrent attempts preserve a single successful result", async () => {
    const { workspace, tariff } = await catalog(), b = await booking(workspace, tariff);
    const [failure, success] = await Promise.all([pay(b.id, "failure"), pay(b.id)]);
    assert.equal(success.status, 200, JSON.stringify(success.body));
    assert([200,409].includes(failure.status));
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "CONFIRMED");
    assert.equal(await prisma.payment.count({ where: { bookingId: b.id, status: "SUCCEEDED" } }), 1);
  });
  test("an idempotency key cannot be reused for another booking and replay never reopens cancellation", async () => {
    const { workspace, tariff } = await catalog(), first = await booking(workspace, tariff);
    const second = await booking(workspace, tariff, { startTime: "11:00", endTime: "12:00" }), key = randomUUID();
    const paid = await pay(first.id, "success", key);
    await error(paymentPath(second.id), { token: client, method: "POST", key, body: { scenario: "success" } }, 409, "IDEMPOTENCY_KEY_REUSED");
    await ok("/admin/bookings/" + first.id + "/cancel", adminOptions("POST", { version: 2, confirm: true }));
    assert.deepEqual((await pay(first.id, "success", key)).body, paid.body);
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: first.id } })).status, "CANCELLED");
    assert.equal((await pay(first.id)).status, 409);
  });
  test("administrator requests cannot mutate a booking after its workspace changes while waiting", async () => {
    const { workspace, tariff } = await catalog(), destination = (await catalog()).workspace, b = await booking(workspace, tariff);
    const blocker = new Client({ connectionString: env.DATABASE_URL });
    await blocker.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query('SELECT id FROM "Workspace" WHERE id=$1 FOR UPDATE', [workspace.id]);
      // Deliberately supplying the next version must not bypass locking the booking's actual workspace.
      const pending = request("/admin/bookings/" + b.id + "/cancel", adminOptions("POST", { version: 2, confirm: true }));
      let waiting = false;
      for (let n = 0; n < 40; n++) {
        await blocker.query("SELECT pg_stat_clear_snapshot()");
        const result = await blocker.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Workspace%'");
        if (result.rowCount) { waiting = true; break; }
        await delay(20);
      }
      assert(waiting, "Administrator request did not reach the workspace lock.");
      // Model another already committed administrator reassignment before the waiting request resumes.
      await blocker.query('UPDATE "Booking" SET "workspaceId"=$1, "workspaceName"=$2, version=version+1 WHERE id=$3', [destination.id, destination.name, b.id]);
      await blocker.query("COMMIT");
      const result = await pending;
      assert.equal(result.status, 409, JSON.stringify(result.body));
      assert.equal(result.body.error.code, "BOOKING_CHANGED");
      assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).status, "PENDING_PAYMENT");
    } finally { await blocker.query("ROLLBACK"); await blocker.end(); }
  });
  test("recurring permissions, limits, concurrent conflicts and series links", async () => {
    const {workspace,tariff}=await catalog();
    const input={workspaceId:workspace.id,tariffId:tariff.id,fromDate:date,toDate:addDays(date,7),weekdays:[weekday(date)||7],startTime:"08:00",endTime:"12:00",confirm:true};
    await error("/bookings/recurring",{method:"POST",body:input},401);
    await error("/bookings/recurring",{token:admin,method:"POST",body:input},403);
    await error("/bookings/recurring",{token:unverified,method:"POST",body:input},403);
    for(const change of [{weekdays:[1,1]},{toDate:addDays(date,-1)},{startTime:"07:59"},{endTime:"22:01"},{toDate:addDays(date,env.MAX_RECURRING_OCCURRENCES*7+8)}]) await error("/bookings/recurring",{token:client,method:"POST",body:{...input,...change}},400);
    const before=await prisma.bookingSeries.count();
    const results=await Promise.all([client,other].map(token=>request("/bookings/recurring",{token,method:"POST",body:input})));
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    assert.equal(await prisma.bookingSeries.count(),before+1);
    const result=results.find(r=>r.status===201)!.body.data;
    assert.equal(result.bookings.length,2);assert.equal(result.totalAmount,"300.00");
    for(const b of result.bookings){assert.equal(b.seriesId,result.series.id);assert.equal(b.amount,"150.00");assert.equal(b.status,"PENDING_PAYMENT");}
  });
  test("history pagination/filtering and calendar distinguish ongoing, future and past without owner leaks", async()=>{
    const {workspace,tariff}=await catalog();const now=Date.now();
    const ongoing=await fixture(workspace,tariff,{status:"CONFIRMED",startsAt:new Date(now-60000),endsAt:new Date(now+600000)});
    const past=await fixture(workspace,tariff,{status:"CONFIRMED",startsAt:new Date(now-7200000),endsAt:new Date(now-3600000)});
    const future=await booking(workspace,tariff);
    const path="/bookings/history?fromDate="+addDays(localParts(new Date()).date,-1)+"&toDate="+date;
    const history=await ok(path+"&pageSize=100",{token:client});
    for(const id of [ongoing.id,past.id,future.id])assert(history.bookings.some((b:any)=>b.id===id), "Missing fixture "+id+"; returned "+history.bookings.length+" of "+history.total);
    const page1=await ok(path+"&pageSize=1&page=1",{token:client}),page2=await ok(path+"&pageSize=1&page=2",{token:client});
    assert.equal(page1.bookings.length,1);assert.equal(page1.total,page2.total);assert.notEqual(page1.bookings[0].id,page2.bookings[0].id);
    const completed=await ok(path+"&status=COMPLETED",{token:client});assert(completed.bookings.some((b:any)=>b.id===past.id));
    const calendar=await ok("/bookings/calendar?fromDate="+addDays(localParts(new Date()).date,-1)+"&toDate="+date,{token:client});
    assert(calendar.bookings.some((b:any)=>b.id===ongoing.id));assert(calendar.bookings.some((b:any)=>b.id===future.id));assert(!calendar.bookings.some((b:any)=>b.id===past.id));
    const otherCalendar=await ok("/bookings/calendar?fromDate="+addDays(localParts(new Date()).date,-1)+"&toDate="+date,{token:other});
    for(const b of otherCalendar.bookings)assert.notEqual(b.userId,ownerId);
    await error("/bookings/history?userId="+ownerId,{token:other},400);
    await error("/bookings/calendar",{},401);
  });
  test("public map/status data excludes archives and private fields; status updates remain administrator-only",async()=>{
    const {workspace}=await catalog();const catalogData=await ok("/workspaces");const view=catalogData.workspaces.find((w:any)=>w.id===workspace.id);
    assert.deepEqual(view.mapPosition,{x:0.25,y:0.5});assert.equal(view.status,"FREE");
    for(const field of ["userId","bookings","passwordHash","deletedAt"])assert.equal(field in view,false);
    const path="/admin/workspaces/"+workspace.id+"/status";
    await error(path,{method:"PATCH",key:randomUUID(),body:{status:"OCCUPIED",version:1}},401);
    await error(path,{token:client,method:"PATCH",key:randomUUID(),body:{status:"OCCUPIED",version:1}},403);
    await ok(path,adminOptions("PATCH",{status:"OCCUPIED",version:1}));
    assert.equal((await ok("/workspaces/"+workspace.id)).workspace.status,"OCCUPIED");
    await ok("/admin/workspaces/"+workspace.id,adminOptions("DELETE",{version:2,confirm:true}));
    assert(!(await ok("/workspaces")).workspaces.some((w:any)=>w.id===workspace.id));
    await error("/workspaces/"+workspace.id+"/available-slots?date="+date,{},404);
  });
  test("availability excludes partial-past intervals, expired holds, adjacent blocks and operating boundaries",async()=>{
    const {workspace,tariff}=await catalog();
    await fixture(workspace,tariff,{status:"CONFIRMED",startsAt:localInstant(date,"10:00"),endsAt:localInstant(date,"11:00")});
    await fixture(workspace,tariff,{status:"CONFIRMED",startsAt:localInstant(date,"11:00"),endsAt:localInstant(date,"12:00")});
    await fixture(workspace,tariff,{startsAt:localInstant(date,"14:00"),endsAt:localInstant(date,"15:00")}); // expired hold
    const slotsPath="/workspaces/"+workspace.id+"/available-slots?date="+date;
    const slots=await ok(slotsPath);assert.deepEqual(slots.availableRanges.map((r:any)=>[r.startTime,r.endTime]),[["08:00","10:00"],["12:00","22:00"]]);
    for(const range of slots.availableRanges){const result=await ok("/workspaces/availability?date="+date+"&startTime="+range.startTime+"&endTime="+range.endTime);assert(result.workspaces.find((w:any)=>w.id===workspace.id).available);}
    await error("/workspaces/availability?date="+date+"&startTime=07:59&endTime=09:00",{},400);
    await error("/workspaces/availability?date="+date+"&startTime=21:00&endTime=22:01",{},400);
    await error("/workspaces/"+workspace.id+"/available-slots?date=2027-02-30",{},400);
    mock.timers.enable({apis:["Date"],now:localInstant(date,"09:30").getTime()});
    try{
      const result=await ok("/workspaces/availability?date="+date+"&startTime=09:00&endTime=10:00");const w=result.workspaces.find((w:any)=>w.id===workspace.id);assert.equal(w.available,false);assert.equal(w.unavailableReason,"INTERVAL_IN_PAST");
      assert.equal((await ok(slotsPath)).availableRanges[0].startTime,"09:31");
      await error("/workspaces/"+workspace.id+"/available-slots?date="+addDays(date,-1),{},400);
    }finally{mock.timers.reset();}
    const key=weekdayNames[weekday(date)]!;const hours=facility.openingHours[key];facility.openingHours[key]=null;
    try{const closed=await ok(slotsPath);assert.equal(closed.unavailableReason,"FACILITY_CLOSED");assert.deepEqual(closed.availableRanges,[]);}finally{facility.openingHours[key]=hours;}
  });
  test("recurrence preserves local times across DST with a fixed 100 UAH price per occurrence",async()=>{
    const {workspace,tariff}=await catalog();
    await ok("/admin/tariffs/"+tariff.id,adminOptions("PATCH",{version:1,price:"100.00"}));
    const year=new Date().getUTCFullYear()+1;
    const marchEnd=new Date(Date.UTC(year,2,31,12));
    const transition=addDays(marchEnd.toISOString().slice(0,10),-marchEnd.getUTCDay());
    const input={workspaceId:workspace.id,tariffId:tariff.id,fromDate:addDays(transition,-7),toDate:transition,weekdays:[7],startTime:"08:00",endTime:"12:00",confirm:true};
    const preview=await ok("/bookings/recurring/preview",{token:client,method:"POST",body:input});
    assert.equal(preview.totalAmount,"200.00");
    const result=await ok("/bookings/recurring",{token:client,method:"POST",body:input},201);
    assert.equal(result.bookings.length,2);assert.equal(result.totalAmount,"200.00");
    for(const b of result.bookings){assert.equal(b.startTime,"08:00");assert.equal(b.endTime,"12:00");assert.equal(b.amount,"100.00");assert.equal(b.seriesId,result.series.id);}
    assert.equal(new Date(result.bookings[1].startsAt).getTime()-new Date(result.bookings[0].startsAt).getTime(),(7*24-1)*3600000);
  });
  test("full-day holds, Unavailable and Occupied remain consistent across availability APIs",async()=>{
    const {workspace,tariff}=await catalog();
    const b=await booking(workspace,tariff,{startTime:"08:00",endTime:"22:00"});
    const slots="/workspaces/"+workspace.id+"/available-slots?date="+date;
    const interval="/workspaces/availability?date="+date+"&startTime=08:00&endTime=22:00";
    assert.equal((await ok(slots)).unavailableReason,"NO_AVAILABLE_RANGES");
    assert.equal((await ok(interval)).workspaces.find((w:any)=>w.id===workspace.id).available,false);
    await ok("/admin/bookings/"+b.id+"/cancel",adminOptions("POST",{version:1,confirm:true}));
    assert.deepEqual((await ok(slots)).availableRanges.map((r:any)=>[r.startTime,r.endTime]),[["08:00","22:00"]]);
    const status="/admin/workspaces/"+workspace.id+"/status";
    await ok(status,adminOptions("PATCH",{version:1,status:"OCCUPIED"}));
    assert.equal((await ok(interval)).workspaces.find((w:any)=>w.id===workspace.id).available,true);
    assert.equal((await ok(slots)).availableRanges.length,1);
    await ok(status,adminOptions("PATCH",{version:2,status:"UNAVAILABLE",confirm:true}));
    const unavailable=await ok(slots);assert.deepEqual(unavailable.availableRanges,[]);assert.equal(unavailable.unavailableReason,"WORKSPACE_UNAVAILABLE");
    assert.equal((await ok(interval)).workspaces.find((w:any)=>w.id===workspace.id).unavailableReason,"WORKSPACE_UNAVAILABLE");
  });
  test("idle sessions expire and persistent failed-login limits block correct-password bypass", async () => {
    const login = await ok("/auth/login", { method: "POST", body: { email: "other@example.com", password } });
    const session = await prisma.session.findFirstOrThrow({ where: { user: { email: "other@example.com" } }, orderBy: { createdAt: "desc" } });
    await prisma.session.update({ where: { id: session.id }, data: { lastActivityAt: new Date(Date.now() - env.SESSION_IDLE_MINUTES * 60000 - 1000) } });
    await error("/auth/me", { token: login.accessToken }, 401);
    for (let n = 1; n <= env.LOGIN_MAX_FAILURES; n++) {
      await error("/auth/login", { method: "POST", body: { email: "other@example.com", password: "incorrect-password" } }, n === env.LOGIN_MAX_FAILURES ? 429 : 401);
    }
    await error("/auth/login", { method: "POST", body: { email: "other@example.com", password } }, 429, "LOGIN_TEMPORARILY_LIMITED");
  });

});
