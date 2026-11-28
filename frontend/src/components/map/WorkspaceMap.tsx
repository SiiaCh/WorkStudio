import { useMemo, useRef } from "react";
import type { Workspace } from "../../types";
import { placedWorkspaces, pointToPosition, spreadOverlaps, statusLabel } from "../../services/workspaces";

type Props = {
  workspaces: Workspace[];
  selectedId: string | null;
  /** When set, the next click on the plan places this workspace. */
  placingId: string | null;
  onSelect: (id: string) => void;
  onPlace: (id: string, position: { x: number; y: number }) => void;
  disabled?: boolean;
};

/**
 * Schematic floor plan. Positions are normalized (0..1), so the plan scales with its container.
 * The backend stores no floor-plan image; this canvas is a neutral grid that can be swapped for a real plan.
 */
export default function WorkspaceMap({ workspaces, selectedId, placingId, onSelect, onPlace, disabled }: Props) {
  const planRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => placedWorkspaces(workspaces), [workspaces]);
  const positions = useMemo(() => spreadOverlaps(placed), [placed]);
  const placing = placingId ? workspaces.find(w => w.id === placingId) : undefined;

  function place(clientX: number, clientY: number) {
    if (!placingId || disabled || !planRef.current) return;
    const pos = pointToPosition(clientX, clientY, planRef.current.getBoundingClientRect());
    if (pos) onPlace(placingId, pos);
  }

  return (
    <div className="ws-map-wrap">
      {placing && <p className="notice ws-map-hint" role="status">Click on the plan to place “{placing.name}”.</p>}
      <div
        ref={planRef}
        className={`ws-map ${placing ? "ws-map-placing" : ""}`}
        role="group"
        aria-label="Workspace map"
        onClick={e => { if ((e.target as HTMLElement).closest(".ws-marker")) return; place(e.clientX, e.clientY); }}
      >
        {placed.length === 0 && !placing && <p className="ws-map-empty">No workspaces are placed on the map yet. Pick one from “Not on the map” and place it.</p>}
        {placed.map(w => {
          const p = positions.get(w.id)!;
          return (
            <button
              key={w.id}
              type="button"
              className={`ws-marker ws-marker-${w.status.toLowerCase()} ${w.id === selectedId ? "selected" : ""}`}
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              aria-pressed={w.id === selectedId}
              aria-label={`${w.name}, ${statusLabel(w.status)}`}
              title={`${w.name} — ${statusLabel(w.status)}`}
              onClick={e => { e.stopPropagation(); if (placingId) place(e.clientX, e.clientY); else onSelect(w.id); }}
            >
              <span className="ws-marker-label">{w.name}</span>
            </button>
          );
        })}
      </div>
      <ul className="ws-legend" aria-label="Legend">
        <li><span className="dot dot-available" />Free</li>
        <li><span className="dot dot-occupied" />Occupied</li>
        <li><span className="dot dot-unavailable" />Unavailable</li>
      </ul>
    </div>
  );
}
