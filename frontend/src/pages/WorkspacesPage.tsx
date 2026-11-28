import { facilityNow } from "../services/facility";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, Clock3, CalendarDays } from "lucide-react";
import WorkspaceCard from "../components/WorkspaceCard";
import type { Workspace } from "../types";
import { apiRequest } from "../services/api";


export default function WorkspacesPage({ workspaces, onBook, date, onDateChange }: {
  workspaces: Workspace[]; onBook: (workspace: Workspace, date: string, startTime: string, endTime: string) => void;
  date: string; onDateChange: (date: string) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedStart, setSelectedStart] = useState("10:00");
  const [selectedEnd, setSelectedEnd] = useState("11:00");
  const [checkingWorkspace,setCheckingWorkspace]=useState<string|null>(null);
  const [availabilityError,setAvailabilityError]=useState("");
  const filtered = useMemo(() => workspaces.filter(w =>
    (filter === "All" || w.status === filter) &&
    `${w.name} ${w.type} ${w.zone} ${w.description}`.toLowerCase().includes(search.toLowerCase())
  ), [workspaces, filter, search]);
  const now = facilityNow();
  const today = now.date;
  const pastDate = date < today;
  const pastTime = date === today && selectedStart <= now.time;
  async function requestBooking(workspace:Workspace){
    if(pastDate||pastTime||selectedEnd<=selectedStart||checkingWorkspace)return;
    setCheckingWorkspace(workspace.id);setAvailabilityError("");
    try{
      const result=await apiRequest<{workspaces:Array<{id:string;available:boolean;unavailableReason:string|null}>}>(`/workspaces/availability?date=${date}&startTime=${selectedStart}&endTime=${selectedEnd}`);
      const found=result.workspaces.find(item=>item.id===workspace.id);
      if(!found?.available){setAvailabilityError(`${workspace.name}: ${found?.unavailableReason??"This time slot is unavailable"}. Choose another time or date.`);return;}
      onBook(workspace,date,selectedStart,selectedEnd);
    }catch(e){setAvailabilityError(e instanceof Error?e.message:"Could not verify availability. Please retry.");}
    finally{setCheckingWorkspace(null);}
  }
  return <>
    <header className="page-header"><div><p className="eyebrow">01 — WORKSPACE LIST</p><h1>Find a workspace</h1><p className="muted">Choose a place and time that works for you.</p></div><div className="avatar">W</div></header>
    <section className="panel date-panel booking-filters">
      <label htmlFor="booking-date"><CalendarDays size={16}/> Booking date
        <input id="booking-date" type="date" value={date} min={today} onChange={e => onDateChange(e.target.value)} required />
      </label>
      <label htmlFor="start-time"><Clock3 size={16}/> Start time
        <input id="start-time" type="time" value={selectedStart} onChange={e=>setSelectedStart(e.target.value)} required/>
      </label>
      <label htmlFor="end-time"><Clock3 size={16}/> End time
        <input id="end-time" type="time" value={selectedEnd} onChange={e=>setSelectedEnd(e.target.value)} required/>
      </label>
      {(pastDate || pastTime) && <p className="form-error date-validation" role="alert">{pastDate ? "The booking date cannot be in the past." : "The selected start time has already passed. Choose a later time."}</p>}
    </section>
    <div className="section-heading"><div><h2>Workspaces</h2><p className="muted">Availability is shown by operational status; time-slot conflicts must be verified by the server.</p></div><span className="result-count">{filtered.length} spaces</span></div>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input aria-label="Search workspaces" placeholder="Search workspace..." value={search} onChange={e => setSearch(e.target.value)}/></div><div className="filter-box"><SlidersHorizontal size={16}/><select aria-label="Filter status" value={filter} onChange={e => setFilter(e.target.value)}><option>All</option><option>Available</option><option>Occupied</option><option>Unavailable</option></select></div></div>
    {availabilityError&&<p className="form-error" role="alert">{availabilityError}</p>}
    {filtered.length ? <div className="workspace-grid">{filtered.map(w => <WorkspaceCard key={w.id} workspace={w} onBook={() => { void requestBooking(w); }}/>)}</div> : <div className="empty-state"><h3>No workspaces found</h3><p>Try changing your search or filter.</p></div>}
  </>;
}