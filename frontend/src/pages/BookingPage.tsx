import { Link } from "react-router-dom";
import type { Tariff, Workspace } from "../types";
export default function BookingPage({ selectedWorkspace, selectedTariff, tariffs, date, startTime, endTime, onDateChange, onStartChange, onEndChange, onTariffChange, onConfirm }: {
  selectedWorkspace: Workspace | null; selectedTariff: Tariff | null; tariffs: Tariff[];
  date: string; startTime: string; endTime: string;
  onDateChange: (v: string) => void; onStartChange: (v: string) => void; onEndChange: (v: string) => void;
  onTariffChange: (t: Tariff) => void; onConfirm: () => void;
}) {
  if (!selectedWorkspace) return <div className="empty-state"><h1>Your booking</h1><p>Select a workspace first to start a booking.</p><Link className="button primary inline-button" to="/">Browse workspaces</Link></div>;
  const start = Number(startTime.split(":")[0]) + Number(startTime.split(":")[1])/60;
  const end = Number(endTime.split(":")[0]) + Number(endTime.split(":")[1])/60;
  const duration = Math.max(0, end - start);
  const tariff = selectedTariff ?? tariffs.find(t => t.unit === "hour") ?? tariffs[0];
  const total = tariff ? (tariff.unit === "hour" ? tariff.price * duration : tariff.unit === "day" ? tariff.price * Math.max(1, Math.ceil(duration/8)) : tariff.price) : selectedWorkspace.pricePerHour * duration;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const selectedStart = new Date(`${date}T${startTime}:00`);
  const dateIsPast = date < today;
  const timeIsPast = date === today && selectedStart <= now;
  const valid = !dateIsPast && !timeIsPast && duration > 0 && selectedWorkspace.status === "Available";
  return <><header className="page-header"><div><p className="eyebrow">03 — BOOKING SUMMARY</p><h1>Review your booking</h1><p className="muted">Choose a date, time and tariff before continuing.</p></div></header>
    <section className="summary-card"><div className="summary-top"><div className="workspace-symbol">W</div><div><h2>{selectedWorkspace.name}</h2><p className="muted">{selectedWorkspace.type} · {selectedWorkspace.zone}</p></div></div>
      <div className="booking-edit-grid"><label>Date<input type="date" min={today} value={date} onChange={e => onDateChange(e.target.value)} required/></label><label>Start time<select value={startTime} onChange={e => {onStartChange(e.target.value); if (e.target.value >= endTime) onEndChange(`${String(Number(e.target.value.slice(0,2))+1).padStart(2,"0")}:00`);}}>{Array.from({length:10},(_,i)=>`${String(i+9).padStart(2,"0")}:00`).slice(0,9).map(t=><option key={t}>{t}</option>)}</select></label><label>End time<select value={endTime} onChange={e => onEndChange(e.target.value)}>{Array.from({length:10},(_,i)=>`${String(i+9).padStart(2,"0")}:00`).filter(t=>t>startTime).map(t=><option key={t}>{t}</option>)}</select></label></div>
      <label className="tariff-select-label">Pricing plan<select value={tariff?.id ?? ""} onChange={e => {const found=tariffs.find(t=>t.id===Number(e.target.value)); if(found) onTariffChange(found);}}>{tariffs.map(t=><option key={t.id} value={t.id}>{t.name} — ₴{t.price.toLocaleString("en-US")} / {t.unit}</option>)}</select></label>
      <div className="summary-row"><span>Workspace</span><strong>{selectedWorkspace.name}</strong></div><div className="summary-row"><span>Date</span><strong>{date}</strong></div><div className="summary-row"><span>Time</span><strong>{startTime}–{endTime} ({duration} h)</strong></div><div className="summary-row"><span>Tariff</span><strong>{tariff?.name ?? "Hourly"}</strong></div><div className="summary-row total"><span>Estimated total</span><strong>₴{Math.round(total).toLocaleString("en-US")}</strong></div>
      <p className="notice">The total is an estimate based on demo tariff data. The server must validate availability, conflicts and the final price before confirming a real booking.</p>
      {!valid && <p className="form-error" role="alert">{dateIsPast ? "The booking date cannot be in the past." : timeIsPast ? "The start time has already passed. Choose a later time or another date." : duration <= 0 ? "The end time must be later than the start time." : "This workspace is not available for booking."}</p>}
      <button className="button primary full" disabled={!valid} onClick={onConfirm}>Confirm demo booking</button><Link className="back-link" to="/">Change workspace</Link>
    </section></>;
}