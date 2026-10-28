import { NavLink } from "react-router-dom";
import { Armchair, CalendarDays, WalletCards, CircleUserRound, Settings, LogOut } from "lucide-react";
import Brand from "./Brand";

type User = { name: string; email: string } | null;

export default function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  return <aside className="sidebar"><Brand /><div className="nav-label">WORKSPACE</div><nav>
    <NavLink to="/" end><Armchair size={18}/>Spaces</NavLink>
    <NavLink to="/booking"><CalendarDays size={18}/>Booking</NavLink>
    <NavLink to="/tariffs"><WalletCards size={18}/>Tariffs</NavLink>
    <NavLink to="/profile"><CircleUserRound size={18}/>Profile</NavLink>
  </nav><div className="sidebar-bottom"><NavLink to="/admin"><Settings size={18}/>Admin panel</NavLink>{user ? <button type="button" className="sidebar-logout" onClick={onLogout}><LogOut size={18}/>Sign out</button> : <NavLink to="/login"><CircleUserRound size={18}/>Sign in</NavLink>}<span className="demo-note">Demo mode · API not connected</span></div></aside>;
}
