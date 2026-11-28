import { facilityNow } from "./services/facility";
import { mapWorkspace, type ApiWorkspace } from "./services/workspaces";
import { mapTariff, tariffPayload, tariffListPath, type ApiTariff } from "./services/tariffs";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import BottomNav from "./components/BottomNav";
import WorkspacesPage from "./pages/WorkspacesPage";
import TariffsPage from "./pages/TariffsPage";
import AuthPage from "./pages/AuthPage";
import BookingPage from "./pages/BookingPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import MyBookingsPage from "./pages/MyBookingsPage";
import PaymentPage from "./pages/PaymentPage";
import RecurringPage from "./pages/RecurringPage";
import type { Tariff, User, Workspace } from "./types";
import { CheckCircle2, Menu, X } from "lucide-react";
import { apiRequest, getAccessToken, idempotencyHeaders, setAccessToken } from "./services/api";

function localDateString() { return facilityNow().date; }

function VerifyEmailPage() {
  const [params] = useSearchParams(); const [message,setMessage]=useState("Confirming your email address…"); const [error,setError]=useState(false);
  useEffect(()=>{ const token=params.get("token"); if(!token){setError(true);setMessage("The confirmation link is missing its token. Request a new email.");return;} apiRequest<{message:string}>("/auth/verify-email",{method:"POST",body:JSON.stringify({token})}).then(r=>setMessage(r.message)).catch(e=>{setError(true);setMessage(e instanceof Error?e.message:"Email confirmation failed.");}); },[params]);
  return <div className="auth-wrap"><section className="auth-card"><h1>Email confirmation</h1><p className={error?"form-error":"notice"} role="status">{message}</p><a className="button primary inline-button" href="/login">Continue to sign in</a></section></div>;
}

export default function App() {
  const [workspaces,setWorkspaces]=useState<Workspace[]>([]); const [tariffs,setTariffs]=useState<Tariff[]>([]);
  const [tariffError,setTariffError]=useState(""); const [tariffsLoading,setTariffsLoading]=useState(false);
  const [selectedWorkspace,setSelectedWorkspace]=useState<Workspace|null>(null); const [selectedTariff,setSelectedTariff]=useState<Tariff|null>(null);
  const [date,setDate]=useState(localDateString()); const [startTime,setStartTime]=useState("10:00"); const [endTime,setEndTime]=useState("11:00");
  const [user,setUser]=useState<User|null>(null); const [authReady,setAuthReady]=useState(!getAccessToken()); const [mobileMenu,setMobileMenu]=useState(false); const [toast,setToast]=useState(""); const [busy,setBusy]=useState(false);
  const location=useLocation(); const navigate=useNavigate(); const isAuth=["/login","/register","/verify-email"].includes(location.pathname);
  function notify(message:string){setToast(message);window.setTimeout(()=>setToast(""),5000);}
  async function loadWorkspaces(){const r=await apiRequest<{workspaces:ApiWorkspace[]}> ("/workspaces");setWorkspaces(r.workspaces.map(mapWorkspace));}
  async function loadTariffs(){if(!getAccessToken()){setTariffs([]);return;} setTariffsLoading(true);setTariffError("");const token=getAccessToken();try{const r=await apiRequest<{tariffs:ApiTariff[]}> (tariffListPath(user?.role??"CLIENT"));if(token===getAccessToken())setTariffs(r.tariffs.map(mapTariff));}catch(e){setTariffError(e instanceof Error?e.message:"Could not load tariffs.");throw e;}finally{setTariffsLoading(false);}}
  useEffect(()=>{const expired=()=>{setUser(null);setTariffs([]);setSelectedTariff(null);setSelectedWorkspace(null);setAuthReady(true);notify("Your session ended. Sign in again.");navigate("/login",{replace:true});};window.addEventListener("ws-session-expired",expired);return()=>window.removeEventListener("ws-session-expired",expired);},[navigate]);
  useEffect(()=>{loadWorkspaces().catch(e=>notify(e.message)); if(getAccessToken()) apiRequest<{user:User}>("/auth/me").then(r=>setUser(r.user)).catch(e=>{if(e.status===401){setAccessToken(null);setUser(null);}else notify("Account could not be restored. Please retry by reloading the page.");}).finally(()=>setAuthReady(true)); else setAuthReady(true);},[]);
  useEffect(()=>{if(user)loadTariffs().catch(e=>notify(e.message));else setTariffs([]);},[user]);
  function book(workspace:Workspace,selectedDate:string,start:string,end:string){if(!user){setSelectedWorkspace(workspace);setDate(selectedDate);setStartTime(start);setEndTime(end);notify("Sign in to view tariffs and create a booking.");navigate("/login");return;}if(user.role!=="CLIENT"){notify("Client account required to create a booking.");return;}setSelectedWorkspace(workspace);setDate(selectedDate);setStartTime(start);setEndTime(end);setSelectedTariff(tariffs[0]??null);navigate("/booking");}
  async function confirmBooking(){
    const tariff=selectedTariff??tariffs[0];
    if(!user||user.role!=="CLIENT"||!selectedWorkspace||!tariff){notify("Sign in and select a tariff before booking.");return;}
    setBusy(true);
    try{
      const result=await apiRequest<{booking:{id:string;amount:string;currency:string;status:string;paymentProvider:"MOCK"|"LIQPAY_TEST"|null;paymentIntegrationAvailable:boolean}}>("/bookings",{method:"POST",body:JSON.stringify({workspaceId:selectedWorkspace.id,tariffId:tariff.id,date,startTime,endTime,confirm:true})});
      notify(`Booking created. Total: ${result.booking.amount} ${result.booking.currency}.`);
      navigate(`/payment/${result.booking.id}`);
    }catch(e){const err=e as Error&{code?:string};notify(err.code==="EMAIL_NOT_VERIFIED"?"Confirm your email address before creating a booking. Use Profile → Resend confirmation email.":err.message);}
    finally{setBusy(false);}
  }
  async function saveWorkspace(w:Workspace){const payload={name:w.name,type:w.type,location:w.zone,description:w.description};
    if(w.id) await apiRequest(`/admin/workspaces/${w.id}`,{method:"PATCH",headers:idempotencyHeaders(),body:JSON.stringify({...payload,version:w.version})});
    else await apiRequest("/admin/workspaces",{method:"POST",headers:idempotencyHeaders(),body:JSON.stringify(payload)});
    await loadWorkspaces();notify("Workspace saved on the server.");
  }
  async function deleteWorkspace(w:Workspace){await apiRequest(`/admin/workspaces/${w.id}`,{method:"DELETE",headers:idempotencyHeaders(),body:JSON.stringify({version:w.version,confirm:true})});await loadWorkspaces();notify("Workspace deleted.");}
  async function saveTariff(t:Tariff){const payload=tariffPayload(t);
    if(t.id) await apiRequest(`/admin/tariffs/${t.id}`,{method:"PATCH",headers:idempotencyHeaders(),body:JSON.stringify({...payload,version:t.version})});
    else await apiRequest("/admin/tariffs",{method:"POST",headers:idempotencyHeaders(),body:JSON.stringify(payload)});
    await loadTariffs();notify("Tariff saved on the server.");
  }
  async function deleteTariff(t:Tariff){await apiRequest(`/admin/tariffs/${t.id}`,{method:"DELETE",headers:idempotencyHeaders(),body:JSON.stringify({version:t.version,confirm:true})});await loadTariffs();notify("Tariff deleted.");}
  async function logout(){try{await apiRequest("/auth/logout",{method:"POST",body:JSON.stringify({})});}catch{/* Expired sessions are cleared locally either way. */}setAccessToken(null);setUser(null);setSelectedWorkspace(null);setSelectedTariff(null);setTariffs([]);notify("Signed out.");navigate("/login");}
  return <div className={`app-shell ${isAuth?"auth-shell":""}`}>
    {!isAuth&&<><div className={`sidebar-wrap ${mobileMenu?"open":""}`}><Sidebar user={user} onLogout={logout}/><button className="mobile-close" onClick={()=>setMobileMenu(false)} aria-label="Close menu"><X/></button></div><div className="mobile-topbar"><button onClick={()=>setMobileMenu(!mobileMenu)} aria-label="Toggle menu"><Menu/></button><strong>WorkStudio</strong></div></>}
    <main className={isAuth?"auth-main":"main-content"}>{!authReady?<p className="notice">Restoring account...</p>:<Routes>
      <Route path="/" element={<WorkspacesPage workspaces={workspaces} onBook={book} date={date} onDateChange={setDate}/>}/>
      <Route path="/tariffs" element={user?<TariffsPage tariffs={tariffs} onSelect={t=>{setSelectedTariff(t);if(!selectedWorkspace){notify("Choose a workspace first.");navigate("/");}else navigate("/booking");}}/>:<Navigate to="/login" replace/>}/>
      <Route path="/booking" element={user?.role==="CLIENT"?<BookingPage selectedWorkspace={selectedWorkspace} selectedTariff={selectedTariff} tariffs={tariffs} date={date} startTime={startTime} endTime={endTime} onDateChange={setDate} onStartChange={setStartTime} onEndChange={setEndTime} onTariffChange={setSelectedTariff} onConfirm={confirmBooking}/>:<Navigate to="/login" replace/>}/>
      <Route path="/bookings" element={user?.role==="CLIENT"?<MyBookingsPage/>:<Navigate to={user?"/admin":"/login"} replace/>}/>
      <Route path="/payment/:id" element={user?.role==="CLIENT"?<PaymentPage/>:<Navigate to={user?"/admin":"/login"} replace/>}/>
      <Route path="/recurring" element={user?.role==="CLIENT"?<RecurringPage workspaces={workspaces} tariffs={tariffs}/>:<Navigate to={user?"/admin":"/login"} replace/>}/>
      <Route path="/login" element={<AuthPage mode="login" onLogin={setUser}/>}/><Route path="/register" element={<AuthPage mode="register" onLogin={setUser}/>}/><Route path="/verify-email" element={<VerifyEmailPage/>}/>
      <Route path="/profile" element={<ProfilePage user={user} onLogout={logout}/>}/>
      <Route path="/admin" element={!authReady?<p className="notice">Loading account…</p>:user?.role==="ADMINISTRATOR"?<AdminPage tariffsLoading={tariffsLoading} tariffError={tariffError} workspaces={workspaces} tariffs={tariffs} onSaveWorkspace={saveWorkspace} onDeleteWorkspace={deleteWorkspace} onSaveTariff={saveTariff} onDeleteTariff={deleteTariff} onReloadWorkspaces={loadWorkspaces}/>:<Navigate to={user?"/":"/login"} replace/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>}{tariffError&&<p className="form-error" role="alert">Tariffs could not be loaded: {tariffError} <button onClick={()=>void loadTariffs().catch(()=>{})}>Retry</button></p>}{busy&&<p className="notice" role="status">Saving your booking…</p>}{!isAuth&&<BottomNav user={user}/>}</main>
    {toast&&<div className="toast" role="status"><CheckCircle2 size={18}/>{toast}</div>}
  </div>;
}
