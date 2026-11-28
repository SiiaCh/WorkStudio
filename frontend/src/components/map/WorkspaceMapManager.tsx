import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinOff, Move, RefreshCw } from "lucide-react";
import type { Workspace, WorkspaceStatus } from "../../types";
import { apiRequest } from "../../services/api";
import {
  STATUS_OPTIONS, changeStatus, countByStatus, describeStatusError, fetchAffectedBookings, filterWorkspaces,
  savePosition, statusLabel, unplacedWorkspaces, type AffectedBooking, type Resolution,
} from "../../services/workspaces";
import WorkspaceMap from "./WorkspaceMap";
import StatusDialog from "./StatusDialog";

type Props = { workspaces: Workspace[]; onReload: () => Promise<void> };
type Pending = { workspace: Workspace; affected: AffectedBooking[] } | null;

export default function WorkspaceMapManager({ workspaces, onReload }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [target, setTarget] = useState<WorkspaceStatus>("Available");
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState<WorkspaceStatus | "all">("all");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [info, setInfo] = useState("");
  const [pending, setPending] = useState<Pending>(null); const [dialogError, setDialogError] = useState(""); const [canRetry, setCanRetry] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // One Idempotency-Key per logical request; reused only when the identical request is retried.
  const keyRef = useRef<{ signature: string; key: string } | null>(null);
  const keyFor = (signature: string) => {
    if (keyRef.current?.signature !== signature) keyRef.current = { signature, key: crypto.randomUUID() };
    return keyRef.current.key;
  };

  const selected = workspaces.find(w => w.id === selectedId) ?? null;
  const counts = useMemo(() => countByStatus(workspaces), [workspaces]);
  const unplaced = useMemo(() => unplacedWorkspaces(workspaces), [workspaces]);
  const visible = useMemo(() => filterWorkspaces(workspaces, query, filter), [workspaces, query, filter]);
  const visibleIds = useMemo(() => new Set(visible.map(w => w.id)), [visible]);

  useEffect(() => { if (selected) setTarget(selected.status); }, [selected?.id, selected?.status, selected?.version]);
  useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);

  async function guarded(action: () => Promise<void>) {
    setBusy(true); setError(""); setInfo("");
    try { await action(); } catch (e) {
      const d = describeStatusError(e); setError(d.message);
      if (d.refresh) await onReload().catch(() => {});
    } finally { setBusy(false); }
  }

  async function refresh() {
    setRefreshing(true); setError("");
    try { await onReload(); setInfo("Map refreshed."); } catch (e) { setError(e instanceof Error ? e.message : "Could not refresh."); } finally { setRefreshing(false); }
  }

  function applyStatus() {
    if (!selected || target === selected.status) return;
    void guarded(async () => {
      if (target === "Unavailable") {
        const affected = await fetchAffectedBookings(apiRequest, selected.id);
        setDialogError(""); setCanRetry(false); setPending({ workspace: selected, affected });
        return;
      }
      await submitStatus(selected, target);
    });
  }

  async function submitStatus(w: Workspace, status: WorkspaceStatus, resolutions?: Resolution[]) {
    const signature = JSON.stringify({ id: w.id, v: w.version, status, resolutions });
    await changeStatus(apiRequest, { workspace: w, version: w.version, status, resolutions, idempotencyKey: keyFor(signature) });
    keyRef.current = null;
    await onReload();
    setInfo(`“${w.name}” is now ${statusLabel(status).toLowerCase()}.`);
  }

  async function confirmUnavailable(resolutions: Resolution[]) {
    if (!pending) return;
    setBusy(true); setDialogError("");
    try { await submitStatus(pending.workspace, "Unavailable", resolutions); setPending(null); setCanRetry(false); }
    catch (e) {
      const d = describeStatusError(e); setDialogError(d.message); setCanRetry(d.retrySameKey);
      if (d.refresh) {
        keyRef.current = null;
        // Reload both the map and the affected bookings so the admin re-decides on fresh data.
        try { await onReload(); const fresh = await fetchAffectedBookings(apiRequest, pending.workspace.id); setPending(p => p && { ...p, affected: fresh }); } catch { /* shown error stays */ }
      }
    } finally { setBusy(false); }
  }

  function place(id: string, position: { x: number; y: number }) {
    const w = workspaces.find(x => x.id === id); if (!w) return;
    setPlacingId(null);
    void guarded(async () => {
      const sig = JSON.stringify({ id, v: w.version, position });
      await savePosition(apiRequest, w, position, keyFor(sig)); keyRef.current = null;
      await onReload(); setSelectedId(id); setInfo(`“${w.name}” placed on the map.`);
    });
  }
  function removeFromMap(w: Workspace) {
    void guarded(async () => {
      await savePosition(apiRequest, w, null, keyFor(JSON.stringify({ id: w.id, v: w.version, position: null }))); keyRef.current = null;
      await onReload(); setInfo(`“${w.name}” removed from the map.`);
    });
  }

  return (
    <section className="ws-manager" aria-label="Workspace map management">
      <div className="ws-toolbar">
        <div className="ws-counts" aria-label="Workspace counts">
          <span className="status status-available">Free {counts.Available}</span>
          <span className="status status-occupied">Occupied {counts.Occupied}</span>
          <span className="status status-unavailable">Unavailable {counts.Unavailable}</span>
        </div>
        <div className="ws-filters">
          <input type="search" placeholder="Search by name, type, location" aria-label="Search workspaces" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="Filter by status" value={filter} onChange={e => setFilter(e.target.value as WorkspaceStatus | "all")}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className="button outline" onClick={() => void refresh()} disabled={refreshing || busy}><RefreshCw size={16} />Refresh</button>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {info && <p className="notice" role="status">{info}</p>}

      <div className="ws-layout">
        <WorkspaceMap
          workspaces={workspaces.filter(w => visibleIds.has(w.id) || w.id === selectedId)}
          selectedId={selectedId} placingId={placingId} disabled={busy}
          onSelect={setSelectedId} onPlace={place}
        />
        <aside className="ws-side">
          {selected ? (
            <div className="panel ws-details">
              <h3>{selected.name}</h3>
              <p className="muted">{selected.type} · {selected.zone}</p>
              <p><span className={`status status-${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span></p>
              <fieldset disabled={busy}>
                <legend>Change status</legend>
                {STATUS_OPTIONS.map(o => (
                  <label key={o.value} className="ws-radio">
                    <input type="radio" name="ws-status" value={o.value} checked={target === o.value} onChange={() => setTarget(o.value)} />{o.label}
                  </label>
                ))}
              </fieldset>
              <div className="form-actions">
                <button type="button" className="button primary" disabled={busy || target === selected.status} onClick={applyStatus}>{busy ? "Saving…" : "Apply status"}</button>
              </div>
              <div className="form-actions">
                <button type="button" className="button outline" disabled={busy} onClick={() => setPlacingId(selected.id)}><Move size={16} />{selected.mapPosition ? "Move on map" : "Place on map"}</button>
                {selected.mapPosition && <button type="button" className="button outline" disabled={busy} onClick={() => removeFromMap(selected)}><MapPinOff size={16} />Remove from map</button>}
              </div>
              {placingId === selected.id && <button type="button" className="button outline" onClick={() => setPlacingId(null)}>Cancel placing</button>}
            </div>
          ) : <p className="notice">Select a workspace on the map to change its status.</p>}

          <div className="panel">
            <h3>Not on the map ({unplaced.length})</h3>
            {unplaced.length === 0 ? <p className="muted">All workspaces are placed.</p> : (
              <ul className="ws-unplaced">
                {unplaced.map(w => (
                  <li key={w.id}>
                    <button type="button" className={w.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(w.id)}>
                      <span className={`dot dot-${w.status.toLowerCase()}`} />{w.name}
                    </button>
                    <button type="button" className="button outline" disabled={busy} onClick={() => { setSelectedId(w.id); setPlacingId(w.id); }}>Place</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {pending && (
        <StatusDialog
          workspace={pending.workspace} affected={pending.affected} busy={busy} error={dialogError} canRetry={canRetry}
          onCancel={() => { setPending(null); setDialogError(""); }} onConfirm={r => void confirmUnavailable(r)}
        />
      )}
    </section>
  );
}
