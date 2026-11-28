export type WorkspaceStatus = "Available" | "Occupied" | "Unavailable";
export interface MapPosition { x: number; y: number }
export interface Workspace {
  id: string; name: string; type: string; zone: string; seats: number;
  description: string; status: WorkspaceStatus;
  version: number; features: string[];
  /** Normalized 0..1 floor-plan position; null/undefined = not placed on the map yet. */
  mapPosition?: MapPosition | null;
}
export interface Tariff {
  id: string; name: string; price: number; version: number;
}
export interface User { id: string; name: string; email: string; role: "CLIENT" | "ADMINISTRATOR"; emailVerifiedAt: string | null; }
export interface Booking {
  id: string; workspaceId: string; workspaceName: string; date: string;
  startTime: string; endTime: string; tariffId: string; tariffName: string;
  amount: number; status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  createdAt: string;
}
