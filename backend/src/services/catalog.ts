import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import type { WorkspaceCreate, WorkspaceUpdate } from "../validation/catalog.js";
import { adminMutation, checkVersion, lockWorkspaces, databaseNow } from "./transactions.js";
import { settleBookings } from "./lifecycle.js";
import { workspaceView, tariffView } from "./views.js";

function coordinates(position: WorkspaceCreate["mapPosition"]) {
  return position === undefined ? {} : { mapX: position?.x ?? null, mapY: position?.y ?? null };
}
export async function listWorkspaces() {
  return { workspaces: (await prisma.workspace.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } })).map(workspaceView) };
}
export async function getWorkspace(id: string) {
  const workspace = await prisma.workspace.findFirst({ where: { id, deletedAt: null } });
  if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
  return { workspace: workspaceView(workspace) };
}
export async function listTariffs() {
  return { tariffs: (await prisma.tariff.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } })).map(tariffView) };
}
export function createWorkspace(actorId: string, key: string, input: WorkspaceCreate) {
  return adminMutation(actorId, key, { operation: "workspace.create", input }, async tx => {
    const { mapPosition, ...data } = input;
    const workspace = await tx.workspace.create({ data: { ...data, ...coordinates(mapPosition) } });
    return { result: { workspace: workspaceView(workspace) }, action: "WORKSPACE_CREATED", resourceType: "Workspace", resourceId: workspace.id, details: { after: workspaceView(workspace) } };
  });
}
export function updateWorkspace(actorId: string, key: string, id: string, input: WorkspaceUpdate) {
  return adminMutation(actorId, key, { operation: "workspace.update", id, input }, async tx => {
    await lockWorkspaces(tx, [id]);
    const before = await tx.workspace.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
    checkVersion(before.version, input.version);
    const { version, mapPosition, ...data } = input;
    const workspace = await tx.workspace.update({ where: { id }, data: { ...data, ...coordinates(mapPosition), version: { increment: 1 } } });
    return { result: { workspace: workspaceView(workspace) }, action: "WORKSPACE_UPDATED", resourceType: "Workspace", resourceId: id, details: { before: workspaceView(before), after: workspaceView(workspace) } };
  });
}
export function deleteWorkspace(actorId: string, key: string, id: string, version: number) {
  return adminMutation(actorId, key, { operation: "workspace.delete", id, version }, async tx => {
    await lockWorkspaces(tx, [id]);
    const workspace = await tx.workspace.findFirst({ where: { id, deletedAt: null } });
    if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "The workspace does not exist.");
    checkVersion(workspace.version, version);
    const now = await databaseNow(tx);
    await settleBookings(tx, [id], now);
    const active = await tx.booking.count({ where: { workspaceId: id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] }, endsAt: { gt: now } } });
    if (active) throw new AppError(409, "WORKSPACE_HAS_BOOKINGS", "Resolve current and upcoming bookings before deleting this workspace.");
    await tx.workspace.update({ where: { id }, data: { deletedAt: now, version: { increment: 1 } } });
    return { result: { id, deleted: true }, action: "WORKSPACE_DELETED", resourceType: "Workspace", resourceId: id, details: { before: workspaceView(workspace) } };
  });
}
export function createTariff(actorId: string, key: string, input: { name: string; price: string }) {
  return adminMutation(actorId, key, { operation: "tariff.create", input }, async tx => {
    const tariff = await tx.tariff.create({ data: { ...input, price: new Prisma.Decimal(input.price) } });
    return { result: { tariff: tariffView(tariff) }, action: "TARIFF_CREATED", resourceType: "Tariff", resourceId: tariff.id, details: { after: tariffView(tariff) } };
  });
}
export function updateTariff(actorId: string, key: string, id: string, input: { name?: string; price?: string; version: number }) {
  return adminMutation(actorId, key, { operation: "tariff.update", id, input }, async tx => {
    await tx.$queryRaw`SELECT id FROM "Tariff" WHERE id = ${id}::uuid FOR UPDATE`;
    const before = await tx.tariff.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new AppError(404, "TARIFF_NOT_FOUND", "The tariff does not exist.");
    checkVersion(before.version, input.version);
    const tariff = await tx.tariff.update({ where: { id }, data: { name: input.name, price: input.price === undefined ? undefined : new Prisma.Decimal(input.price), version: { increment: 1 } } });
    return { result: { tariff: tariffView(tariff) }, action: "TARIFF_UPDATED", resourceType: "Tariff", resourceId: id, details: { before: tariffView(before), after: tariffView(tariff) } };
  });
}
export function deleteTariff(actorId: string, key: string, id: string, version: number) {
  return adminMutation(actorId, key, { operation: "tariff.delete", id, version }, async tx => {
    await tx.$queryRaw`SELECT id FROM "Tariff" WHERE id = ${id}::uuid FOR UPDATE`;
    const tariff = await tx.tariff.findFirst({ where: { id, deletedAt: null } });
    if (!tariff) throw new AppError(404, "TARIFF_NOT_FOUND", "The tariff does not exist.");
    checkVersion(tariff.version, version);
    // Logical deletion preserves references/snapshots. Payment-reference checks are added with the Payment model.
    await tx.tariff.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    return { result: { id, deleted: true }, action: "TARIFF_DELETED", resourceType: "Tariff", resourceId: id, details: { before: tariffView(tariff) } };
  });
}
