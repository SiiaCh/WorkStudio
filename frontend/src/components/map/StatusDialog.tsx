import { useEffect, useMemo, useState } from "react";
import type { Workspace } from "../../types";
import { buildResolutions, unresolvedIds, type AffectedBooking, type Resolution } from "../../services/workspaces";

type Props = {
  workspace: Workspace;
  affected: AffectedBooking[];
  busy: boolean;
  error: string;
  canRetry: boolean;
  onCancel: () => void;
  onConfirm: (resolutions: Resolution[]) => void;
};

/** Confirms the "Unavailable" change and collects a CANCEL / REASSIGN decision for every affected booking. */
export default function StatusDialog({ workspace, affected, busy, error, canRetry, onCancel, onConfirm }: Props) {
  const [decisions, setDecisions] = useState<Record<string, Resolution | undefined>>({});
  const missing = useMemo(() => unresolvedIds(affected, decisions), [affected, decisions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function set(id: string, value: string) {
    setDecisions(d => ({
      ...d,
      [id]: value === "" ? undefined : value === "CANCEL" ? { bookingId: id, action: "CANCEL" } : { bookingId: id, action: "REASSIGN", workspaceId: value },
    }));
  }
  const setAll = (action: "CANCEL") => setDecisions(Object.fromEntries(affected.map(a => [a.booking.id, { bookingId: a.booking.id, action } as Resolution])));

  return (
    <div className="ws-dialog-backdrop" role="presentation">
      <div className="ws-dialog" role="dialog" aria-modal="true" aria-labelledby="ws-dialog-title">
        <h3 id="ws-dialog-title">Mark “{workspace.name}” as unavailable?</h3>
        {affected.length === 0
          ? <p>No active or upcoming bookings are affected.</p>
          : <>
              <p>{affected.length} booking{affected.length === 1 ? "" : "s"} will be affected. Decide what to do with each one.</p>
              <div className="form-actions"><button type="button" className="button outline" onClick={() => setAll("CANCEL")} disabled={busy}>Cancel all</button></div>
              <ul className="ws-affected">
                {affected.map(({ booking, alternatives }) => (
                  <li key={booking.id}>
                    <div><strong>{booking.date}</strong> · {booking.startTime}–{booking.endTime}</div>
                    <label>Decision
                      <select
                        value={decisions[booking.id] ? (decisions[booking.id]!.action === "CANCEL" ? "CANCEL" : (decisions[booking.id] as { workspaceId: string }).workspaceId) : ""}
                        onChange={e => set(booking.id, e.target.value)}
                        disabled={busy}
                      >
                        <option value="">Choose…</option>
                        <option value="CANCEL">Cancel booking</option>
                        {alternatives.map(a => <option key={a.id} value={a.id}>Move to {a.name} ({a.location})</option>)}
                      </select>
                    </label>
                    {alternatives.length === 0 && <p className="muted">No free alternatives for this time — it can only be cancelled.</p>}
                  </li>
                ))}
              </ul>
            </>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button primary" disabled={busy || missing.length > 0}
            onClick={() => onConfirm(buildResolutions(affected, decisions))}>
            {busy ? "Saving…" : canRetry ? "Retry" : "Confirm unavailable"}
          </button>
          <button type="button" className="button outline" onClick={onCancel} disabled={busy}>Back</button>
        </div>
        {missing.length > 0 && <p className="muted">Decisions left: {missing.length}</p>}
      </div>
    </div>
  );
}
