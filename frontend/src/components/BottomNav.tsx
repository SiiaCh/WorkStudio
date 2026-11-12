import { NavLink } from "react-router-dom";
import { Armchair, CalendarDays, History, CircleUserRound } from "lucide-react";
type User={role:"CLIENT"|"ADMINISTRATOR"}|null;
export default function BottomNav({user}:{user:User}){return <nav className="bottom-nav"><NavLink to="/" end><Armchair/><span>Spaces</span></NavLink><NavLink to="/booking"><CalendarDays/><span>Booking</span></NavLink>{user?.role==="CLIENT"?<NavLink to="/bookings"><History/><span>My bookings</span></NavLink>:<NavLink to="/admin"><History/><span>Admin</span></NavLink>}<NavLink to="/profile"><CircleUserRound/><span>Profile</span></NavLink></nav>;}
