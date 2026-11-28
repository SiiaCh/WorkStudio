import { facilityNow } from "../services/facility";
import { Link } from "react-router-dom";
import type { Tariff, Workspace } from "../types";
export default function BookingPage({ selectedWorkspace, selectedTariff, tariffs, date, startTime, endTime, onDateChange, onStartChange, onEndChange, onTariffChange, onConfirm }: {
  selectedWorkspace: Workspace | null; selectedTariff: Tariff | null; tariffs: Tariff[];
  date: string; startTime: string; endTime: string;
  onDateChange: (v: string) => void; onStartChange: (v: string) => void; onEndChange: (v: string) => void;
  onTariffChange: (t: Tariff) => void; onConfirm: () => void;
}) {
  if (!selectedWorkspace) return <div className="empty-state"><h1>Your booking</h1><p>Select a workspace first to start a booking.</p><Link className="button primary inline-button" to="/">Browse workspaces</Link></div>;
  const toMinutes = (value: string) => Number(value.slice(0,2))*60 + Number(value.slice(3,5));
  const durationMinutes = Math.max(0, toMinutes(endTime) - toMinutes(startTime));
  const duration = durationMinutes / 60;
  const tariff = selectedTariff ?? tariffs[0];
  const total = tariff?.price ?? 0;
  const now = facilityNow();
  const today = now.date;
  const dateIsPast = date < today;
  const timeIsPast = date === today && startTime <= now.time;
  const valid = !dateIsPast && !timeIsPast && duration > 0 && selectedWorkspace.status !== "Unavailable";
  return <><header className="page-header"><div><p className="eyebrow">03 — BOOKING SUMMARY</p><h1>Review your booking</h1><p className="muted">Choose a date, time and tariff before continuing.</p></div></header>
    <section className="summary-card"><div className="summary-top"><div className="workspace-symbol">W</div><div><h2>{selectedWorkspace.name}</h2><p className="muted">{selectedWorkspace.type} · {selectedWorkspace.zone}</p></div></div>
      <div className="booking-edit-grid"><label>Date<input type="date" min={today} value={date} onChange={e => onDateChange(e.target.value)} required/></label><label>Start time<input type="time" value={startTime} onChange={e=>onStartChange(e.target.value)} required/></label><label>End time<input type="time" value={endTime} onChange={e=>onEndChange(e.target.value)} required/></label></div>
      <label className="tariff-select-label">Pricing plan<select value={tariff?.id ?? ""} onChange={e => {const found=tariffs.find(t=>t.id===e.target.value); if(found) onTariffChange(found);}}>{tariffs.map(t=><option key={t.id} value={t.id}>{t.name} — ₴{t.price.toLocaleString("en-US")} / booking</option>)}</select></label>
      <div className="summary-row"><span>Workspace</span><strong>{selectedWorkspace.name}</strong></div><div className="summary-row"><span>Date</span><strong>{date}</strong></div><div className="summary-row"><span>Time</span><strong>{startTime}–{endTime} ({duration} h)</strong></div><div className="summary-row"><span>Tariff</span><strong>{tariff?.name ?? "Select a tariff"}</strong></div><div className="summary-row total"><span>Estimated total</span><strong>₴{total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
      <p className="notice">Fixed UAH price per booking occurrence, regardless of duration. The server validates the final amount.</p>
      {!valid && <p className="form-error" role="alert">{dateIsPast ? "The booking date cannot be in the past." : timeIsPast ? "The start time has already passed. Choose a later time or another date." : duration <= 0 ? "The end time must be later than the start time." : "This workspace is not available for booking."}</p>}
      <button className="button primary full" disabled={!valid||!tariff} onClick={onConfirm}>Create booking</button><Link className="back-link" to="/">Change workspace</Link>
    </section></>;
}