export type WorkspaceStatus = "Available" | "Occupied" | "Unavailable";
export interface Workspace {
  id: string; name: string; type: string; zone: string; seats: number;
  pricePerHour: number; description: string; status: WorkspaceStatus;
  version: number; features: string[];
}
export interface Tariff {
  id: string; name: string; price: number; unit: "hour" | "day" | "week"; description: string; version: number;
}
export interface User { id: string; name: string; email: string; role: "CLIENT" | "ADMINISTRATOR"; emailVerifiedAt: string | null; }
export interface Booking {
  id: string; workspaceId: string; workspaceName: string; date: string;
  startTime: string; endTime: string; tariffId: string; tariffName: string;
  amount: number; status: "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  createdAt: string;
}
