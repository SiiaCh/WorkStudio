import { Clock3, MapPin, Users } from "lucide-react";
import type { Workspace } from "../types";
export default function WorkspaceCard({ workspace, onBook }: { workspace: Workspace; onBook: (workspace: Workspace) => void }) {
  const statusClass = workspace.status.toLowerCase();
  return <article className="workspace-card">
    <div className={`workspace-photo photo-${workspace.id % 4}`}><span>{workspace.type}</span></div>
    <div className="workspace-info">
      <div className="card-title-row"><div><h3>{workspace.name}</h3><p>{workspace.type}</p></div><span className={`status status-${statusClass}`}>{workspace.status}</span></div>
      <p className="muted description">{workspace.description}</p>
      <div className="workspace-meta"><span><MapPin size={14}/>{workspace.zone}</span><span><Users size={14}/>{workspace.seats} {workspace.seats === 1 ? "seat" : "seats"}</span><span><Clock3 size={14}/>{workspace.availableUntil ? `Until ${workspace.availableUntil}` : "Schedule required"}</span></div>
      <div className="card-footer"><strong>₴{workspace.pricePerHour}<small> / hour</small></strong><button className="button primary" disabled={workspace.status === "Unavailable"} onClick={() => onBook(workspace)}>{workspace.status === "Available" ? "Book workspace" : workspace.status === "Occupied" ? "Check another time" : "Unavailable"}</button></div>
    </div>
  </article>;
}