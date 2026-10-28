export type WorkspaceStatus = "Available" | "Occupied" | "Unavailable";
export interface Workspace {
  id: number; name: string; type: string; zone: string; seats: number;
  pricePerHour: number; description: string; status: WorkspaceStatus;
  availableUntil?: string; features: string[];
}
export interface Tariff {
  id: number; name: string; price: number; unit: "hour" | "day" | "week"; description: string;
}
export interface Booking {
  id: number; workspaceId: number; workspaceName: string; date: string;
  startTime: string; endTime: string; tariffId: number; tariffName: string;
  total: number; status: "Pending Payment" | "Confirmed" | "Cancelled";
  createdAt: string;
}
