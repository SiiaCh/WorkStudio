import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Clock3, CalendarDays } from "lucide-react";
import WorkspaceCard from "../components/WorkspaceCard";
import type { Workspace } from "../types";

const slots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

export default function WorkspacesPage({ workspaces, onBook, date, onDateChange }: {
  workspaces: Workspace[]; onBook: (workspace: Workspace, date: string, startTime: string, endTime: string) => void;
  date: string; onDateChange: (date: string) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedStart, setSelectedStart] = useState("10:00");
  const [selectedEnd, setSelectedEnd] = useState("11:00");
  const filtered = useMemo(() => workspaces.filter(w =>
    (filter === "All" || w.status === filter) &&
    `${w.name} ${w.type} ${w.zone} ${w.description}`.toLowerCase().includes(search.toLowerCase())
  ), [workspaces, filter, search]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const selectedStartDateTime = new Date(`${date}T${selectedStart}:00`);
  const pastDate = date < today;
  const pastTime = date === today && selectedStartDateTime <= now;
  const endSlots = slots.filter(s => s > selectedStart);
  return <>
    <header className="page-header"><div><p className="eyebrow">01 — WORKSPACE LIST</p><h1>Find a workspace</h1><p className="muted">Choose a place and time that works for you.</p></div><div className="avatar">W</div></header>
    <section className="panel date-panel booking-filters">
      <label htmlFor="booking-date"><CalendarDays size={16}/> Booking date
        <input id="booking-date" type="date" value={date} min={today} onChange={e => onDateChange(e.target.value)} required />
      </label>
      <label htmlFor="start-time"><Clock3 size={16}/> Start time
        <select id="start-time" value={selectedStart} onChange={e => {setSelectedStart(e.target.value); if (selectedEnd <= e.target.value) setSelectedEnd(slots[slots.indexOf(e.target.value)+1] ?? "18:00");}}>
          {slots.slice(0, -1).map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label htmlFor="end-time"><Clock3 size={16}/> End time
        <select id="end-time" value={selectedEnd} onChange={e => setSelectedEnd(e.target.value)}>
          {endSlots.map(s => <option key={s}>{s}</option>)}
        </select>
      </label>
      {(pastDate || pastTime) && <p className="form-error date-validation" role="alert">{pastDate ? "The booking date cannot be in the past." : "The selected start time has already passed. Choose a later time."}</p>}
    </section>
    <div className="section-heading"><div><h2>Workspaces</h2><p className="muted">Availability is shown by operational status; time-slot conflicts must be verified by the server.</p></div><span className="result-count">{filtered.length} spaces</span></div>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input aria-label="Search workspaces" placeholder="Search workspace..." value={search} onChange={e => setSearch(e.target.value)}/></div><div className="filter-box"><SlidersHorizontal size={16}/><select aria-label="Filter status" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option>Available</option><option>Occupied</option><option>Unavailable</option></select></div></div>
    {filtered.length ? <div className="workspace-grid">{filtered.map(w => <WorkspaceCard key={w.id} workspace={w} onBook={() => { if (pastDate || pastTime) return; onBook(w, date, selectedStart, selectedEnd); }}/>)}</div> : <div className="empty-state"><h3>No workspaces found</h3><p>Try changing your search or filter.</p></div>}
  </>;
}