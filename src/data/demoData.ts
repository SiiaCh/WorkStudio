import type { Tariff, Workspace } from "../types";

export const initialWorkspaces: Workspace[] = [
  { id: 1, name: "Profession", type: "Open workspace", zone: "Open space", seats: 1, pricePerHour: 80, description: "A comfortable desk for focused work.", status: "Available", availableUntil: "14:00", features: ["Wi-Fi", "Power outlets"] },
  { id: 2, name: "Quiet Desk 02", type: "Open workspace", zone: "Quiet zone", seats: 1, pricePerHour: 80, description: "A quiet place for individual tasks.", status: "Occupied", availableUntil: "15:00", features: ["Wi-Fi", "Power outlets"] },
  { id: 3, name: "Meeting Room 03", type: "Meeting room", zone: "Meeting zone", seats: 6, pricePerHour: 250, description: "A room for team meetings and calls.", status: "Unavailable", features: ["Wi-Fi", "Monitor"] },
  { id: 4, name: "Focus Desk 04", type: "Desk", zone: "Quiet zone", seats: 1, pricePerHour: 100, description: "Desk with ergonomic chair and monitor.", status: "Available", availableUntil: "18:00", features: ["Wi-Fi", "Monitor", "Ergonomic chair"] }
];

export const initialTariffs: Tariff[] = [
  { id: 1, name: "Hourly", price: 250, unit: "hour", description: "Flexible booking duration" },
  { id: 2, name: "Daily", price: 1000, unit: "day", description: "Workspace for a full day" },
  { id: 3, name: "Weekly", price: 6800, unit: "week", description: "Best value for long-term work" }
];