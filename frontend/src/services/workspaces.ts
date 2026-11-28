import type { MapPosition, Workspace, WorkspaceStatus } from "../types";

export type ApiStatus = "FREE" | "OCCUPIED" | "UNAVAILABLE";
export type ApiWorkspace = {
  id: string; name: string; type: string; location: string; description: string;
  status: ApiStatus; version: number; mapPosition?: MapPosition | null;
};
export type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
export type Resolution = { bookingId: string; action: "CANCEL" } | { bookingId: string; action: "REASSIGN"; workspaceId: string };
export type AffectedBooking = {
  booking: { id: string; date: string; startTime: string; endTime: string; workspaceName?: string; amount?: string; currency?: string; status?: string };
  alternatives: ApiWorkspace[];
};

const toUi: Record<ApiStatus, WorkspaceStatus> = { FREE: "Available", OCCUPIED: "Occupied", UNAVAILABLE: "Unavailable" };
const toApi: Record<WorkspaceStatus, ApiStatus> = { Available: "FREE", Occupied: "OCCUPIED", Unavailable: "UNAVAILABLE" };
export const STATUS_OPTIONS: { value: WorkspaceStatus; label: string }[] = [
  { value: "Available", label: "Free" }, { value: "Occupied", label: "Occupied" }, { value: "Unavailable", label: "Unavailable" },
];
export const statusLabel = (s: WorkspaceStatus) => STATUS_OPTIONS.find(o => o.value === s)?.label ?? s;
export const toApiStatus = (s: WorkspaceStatus): ApiStatus => toApi[s];

export function normalizePosition(p: unknown): MapPosition | null {
  if (!p || typeof p !== "object") return null;
  const { x, y } = p as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}
export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Round to 4 decimals: precise enough for a floor plan, keeps payloads small. */
export const roundPosition = (p: MapPosition): MapPosition => ({ x: Math.round(clamp01(p.x) * 1e4) / 1e4, y: Math.round(clamp01(p.y) * 1e4) / 1e4 });

export function mapWorkspace(w: ApiWorkspace): Workspace {
  return { id: w.id, name: w.name, type: w.type, zone: w.location, seats: 1, description: w.description, status: toUi[w.status] ?? "Unavailable", version: w.version, features: [], mapPosition: normalizePosition(w.mapPosition) };
}

/** Converts a pointer position inside a rect to a normalized 0..1 map position. */
export function pointToPosition(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): MapPosition | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return roundPosition({ x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height });
}

export const placedWorkspaces = (list: Workspace[]) => list.filter(w => w.mapPosition);
export const unplacedWorkspaces = (list: Workspace[]) => list.filter(w => !w.mapPosition);

export function countByStatus(list: Workspace[]): Record<WorkspaceStatus, number> {
  const out: Record<WorkspaceStatus, number> = { Available: 0, Occupied: 0, Unavailable: 0 };
  for (const w of list) out[w.status] += 1;
  return out;
}

/** Marker offsets so several workspaces stored at the same point stay clickable. */
export function spreadOverlaps(list: Workspace[], step = 0.012): Map<string, MapPosition> {
  const seen = new Map<string, number>(); const out = new Map<string, MapPosition>();
  for (const w of list) {
    if (!w.mapPosition) continue;
    const key = `${w.mapPosition.x.toFixed(3)}:${w.mapPosition.y.toFixed(3)}`;
    const n = seen.get(key) ?? 0; seen.set(key, n + 1);
    out.set(w.id, n === 0 ? w.mapPosition : { x: clamp01(w.mapPosition.x + step * n), y: clamp01(w.mapPosition.y + step * n) });
  }
  return out;
}

export function filterWorkspaces(list: Workspace[], query: string, status: WorkspaceStatus | "all") {
  const q = query.trim().toLowerCase();
  return list.filter(w => (status === "all" || w.status === status) && (!q || `${w.name} ${w.type} ${w.zone}`.toLowerCase().includes(q)));
}

/** Resolutions must cover every affected booking exactly once. Returns ids that still need a decision. */
export function unresolvedIds(affected: AffectedBooking[], decisions: Record<string, Resolution | undefined>): string[] {
  return affected.filter(a => {
    const d = decisions[a.booking.id];
    if (!d) return true;
    return d.action === "REASSIGN" && !d.workspaceId;
  }).map(a => a.booking.id);
}
export function buildResolutions(affected: AffectedBooking[], decisions: Record<string, Resolution | undefined>): Resolution[] {
  return affected.map(a => decisions[a.booking.id]).filter((d): d is Resolution => !!d && (d.action === "CANCEL" || !!d.workspaceId));
}

export async function fetchAffectedBookings(request: Request, workspaceId: string): Promise<AffectedBooking[]> {
  const r = await request<{ affectedBookings: AffectedBooking[] }>(`/admin/workspaces/${encodeURIComponent(workspaceId)}/affected-bookings`);
  return r.affectedBookings ?? [];
}

export type StatusChange = { workspace: Workspace; version: number; status: WorkspaceStatus; resolutions?: Resolution[]; idempotencyKey: string };
/**
 * PATCH /admin/workspaces/:id/status. The same Idempotency-Key must be reused when retrying the SAME
 * request (e.g. RESOURCE_BUSY 503), and a new key must be used when the payload changes.
 */
export async function changeStatus(request: Request, change: StatusChange): Promise<Workspace> {
  const status = toApi[change.status];
  const body: Record<string, unknown> = { version: change.version, status };
  if (status === "UNAVAILABLE") { body.confirm = true; body.resolutions = change.resolutions ?? []; }
  const r = await request<{ workspace: ApiWorkspace }>(`/admin/workspaces/${encodeURIComponent(change.workspace.id)}/status`, {
    method: "PATCH", headers: { "Idempotency-Key": change.idempotencyKey }, body: JSON.stringify(body),
  });
  return mapWorkspace(r.workspace);
}

export async function savePosition(request: Request, w: Workspace, position: MapPosition | null, idempotencyKey: string): Promise<Workspace> {
  const r = await request<{ workspace: ApiWorkspace }>(`/admin/workspaces/${encodeURIComponent(w.id)}`, {
    method: "PATCH", headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ version: w.version, mapPosition: position ? roundPosition(position) : null }),
  });
  return mapWorkspace(r.workspace);
}

export const RETRYABLE_CODES = ["RESOURCE_BUSY"];
export function describeStatusError(e: unknown): { message: string; refresh: boolean; retrySameKey: boolean } {
  const code = (e as { code?: string })?.code; const raw = e instanceof Error ? e.message : "Could not change the status.";
  if (code === "VERSION_CONFLICT") return { message: "Someone else changed this workspace. The map was refreshed — review it and try again.", refresh: true, retrySameKey: false };
  if (code === "UNRESOLVED_BOOKINGS" || code === "UNEXPECTED_RESOLUTIONS" || code === "INVALID_REASSIGNMENT") return { message: "Bookings changed while you were deciding. The list was reloaded — review the decisions again.", refresh: true, retrySameKey: false };
  if (code === "RESOURCE_BUSY") return { message: "The server is busy. Press retry to send the same request again.", refresh: false, retrySameKey: true };
  return { message: raw, refresh: false, retrySameKey: false };
}
