import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";

export type Tx = Prisma.TransactionClient;
export const transaction = <T>(work: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '2500ms'`;
    return work(tx);
  }, { maxWait: 3000, timeout: 15000 });

export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export async function databaseNow(tx: Tx) {
  return (await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0]!.now;
}
export async function lockWorkspaces(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)].sort();
  if (unique.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM "Workspace" WHERE id IN (${Prisma.join(unique.map(id => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`);
}
export async function appendAudit(tx: Tx, actorId: string, action: string, resourceType: string, resourceId: string, details: unknown) {
  await tx.auditLog.create({ data: { actorId, action, resourceType, resourceId, details: json(details) } });
}
interface MutationResult {
  result: unknown; action: string; resourceType: string; resourceId: string; details: unknown;
}
export async function adminMutation(actorId: string, operationId: string, request: unknown, work: (tx: Tx) => Promise<MutationResult>) {
  const requestHash = createHash("sha256").update(JSON.stringify(request)).digest("hex");
  return transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + ":" + operationId}, 0))`;
    const previous = await tx.auditLog.findUnique({ where: { actorId_operationId: { actorId, operationId } } });
    if (previous) {
      if (previous.requestHash !== requestHash) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Use a new Idempotency-Key for a different operation.");
      return previous.response;
    }
    const outcome = await work(tx);
    const response = json(outcome.result);
    await tx.auditLog.create({ data: {
      actorId, operationId, requestHash, response, action: outcome.action,
      resourceType: outcome.resourceType, resourceId: outcome.resourceId, details: json(outcome.details),
    } });
    return response;
  });
}
export function checkVersion(actual: number, supplied: number) {
  if (actual !== supplied) throw new AppError(409, "VERSION_CONFLICT", "This record changed. Refresh its data and repeat the action.", { currentVersion: actual });
}
