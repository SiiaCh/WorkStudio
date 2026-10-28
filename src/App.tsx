import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import WorkspacesPage from "./pages/WorkspacesPage";
import TariffsPage from "./pages/TariffsPage";
import AuthPage from "./pages/AuthPage";
import BookingPage from "./pages/BookingPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import { initialTariffs, initialWorkspaces } from "./data/demoData";
import type { Booking, Tariff, Workspace } from "./types";
import { CheckCircle2, Menu, X } from "lucide-react";

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStored<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}
export default function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => readStored("ws-workspaces", initialWorkspaces));
  const [tariffs, setTariffs] = useState<Tariff[]>(() => readStored("ws-tariffs", initialTariffs));
  const [bookings, setBookings] = useState<Booking[]>(() => readStored("ws-bookings", []));
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<Tariff | null>(null);
  const [date, setDate] = useState(localDateString());
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [user, setUser] = useState<{name: string; email: string} | null>(() => readStored("ws-demo-user", null));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const isAuth = location.pathname === "/login" || location.pathname === "/register";
  useEffect(() => { localStorage.setItem("ws-workspaces", JSON.stringify(workspaces)); }, [workspaces]);
  useEffect(() => { localStorage.setItem("ws-tariffs", JSON.stringify(tariffs)); }, [tariffs]);
  useEffect(() => { localStorage.setItem("ws-bookings", JSON.stringify(bookings)); }, [bookings]);
  useEffect(() => { if (user) localStorage.setItem("ws-demo-user", JSON.stringify(user)); else localStorage.removeItem("ws-demo-user"); }, [user]);
  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 3200); }
  function book(workspace: Workspace, selectedDate: string, start: string, end: string) {
    setSelectedWorkspace(workspace); setDate(selectedDate); setStartTime(start); setEndTime(end); setSelectedTariff(tariffs.find(t => t.unit === "hour") ?? tariffs[0] ?? null); navigate("/booking");
  }
  function saveWorkspace(workspace: Workspace) {
    setWorkspaces(old => old.some(w => w.id === workspace.id) ? old.map(w => w.id === workspace.id ? workspace : w) : [workspace, ...old]);
    notify("Workspace saved on this device.");
  }
  function saveTariff(tariff: Tariff) {
    setTariffs(old => old.some(t => t.id === tariff.id) ? old.map(t => t.id === tariff.id ? tariff : t) : [...old, tariff]);
    notify("Tariff saved on this device.");
  }
  function confirmBooking() {
    if (!selectedWorkspace || !user) { notify("Please sign in before creating a booking."); navigate("/login"); return; }
    const start = Number(startTime.slice(0,2)), end = Number(endTime.slice(0,2));
    const today = localDateString();
    const now = new Date();
    const selectedStart = new Date(`${date}T${startTime}:00`);
    if (date < today || end <= start || (date === today && selectedStart <= now)) {
      notify("Choose a future date and a start time later than the current time, with the end after the start.");
      return;
    }
    if (selectedWorkspace.status !== "Available") {
      notify("This workspace is not currently marked as available.");
      return;
    }
    const conflict = bookings.some(b => b.workspaceId === selectedWorkspace.id && b.date === date && b.status !== "Cancelled" && startTime < b.endTime && endTime > b.startTime);
    if (conflict) { notify("This demo workspace has a conflicting booking for that time."); return; }
    const tariff = selectedTariff ?? tariffs[0];
    const hours = end - start;
    const total = tariff ? (tariff.unit === "hour" ? tariff.price * hours : tariff.unit === "day" ? tariff.price * Math.max(1, Math.ceil(hours/8)) : tariff.price) : selectedWorkspace.pricePerHour * hours;
    const booking: Booking = { id: Date.now(), workspaceId: selectedWorkspace.id, workspaceName: selectedWorkspace.name, date, startTime, endTime, tariffId: tariff?.id ?? 0, tariffName: tariff?.name ?? "Hourly", total, status: "Pending Payment", createdAt: new Date().toISOString() };
    setBookings(old => [booking, ...old]); notify("Demo booking created as Pending Payment. No real reservation or payment was made.");
  }
  return <div className={`app-shell ${isAuth ? "auth-shell" : ""}`}>
    {!isAuth && <><div className={`sidebar-wrap ${mobileMenu ? "open" : ""}`}><Sidebar user={user} onLogout={() => { setUser(null); notify("Signed out. You can sign in or register again."); navigate("/login"); }}/><button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X/></button></div><div className="mobile-topbar"><button onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Menu/></button><strong>WorkStudio</strong></div></>}
    <main className={isAuth ? "auth-main" : "main-content"}>
      <Routes>
        <Route path="/" element={<WorkspacesPage workspaces={workspaces} onBook={book} date={date} onDateChange={setDate}/>}/>
        <Route path="/tariffs" element={<TariffsPage tariffs={tariffs} onSelect={t => { setSelectedTariff(t); if (!selectedWorkspace) { notify("Choose a workspace first."); navigate("/"); } else navigate("/booking"); }}/>}/>
        <Route path="/booking" element={<BookingPage selectedWorkspace={selectedWorkspace} selectedTariff={selectedTariff} tariffs={tariffs} date={date} startTime={startTime} endTime={endTime} onDateChange={setDate} onStartChange={setStartTime} onEndChange={setEndTime} onTariffChange={setSelectedTariff} onConfirm={confirmBooking}/>}/>
        <Route path="/login" element={<AuthPage mode="login" onLogin={(name,email) => {setUser({name,email});notify("Signed in in demo mode.");}}/>}/>
        <Route path="/register" element={<AuthPage mode="register" onLogin={(name,email) => {setUser({name,email});notify("Account created in demo mode. Email verification requires backend support.");}}/>}/>
        <Route path="/profile" element={<ProfilePage user={user} onLogout={() => { setUser(null); notify("Signed out. You can sign in or register again."); navigate("/login"); }}/>} />
        <Route path="/admin" element={<AdminPage workspaces={workspaces} tariffs={tariffs} onSaveWorkspace={saveWorkspace} onDeleteWorkspace={id => {setWorkspaces(old => old.filter(w => w.id !== id));notify("Workspace deleted from demo data.");}} onSaveTariff={saveTariff} onDeleteTariff={id => {setTariffs(old => old.filter(t => t.id !== id));notify("Tariff deleted from demo data.");}}/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
      {!isAuth && <BottomNav/>}
    </main>
    {toast && <div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
  </div>;
}