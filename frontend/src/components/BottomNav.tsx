import { NavLink } from "react-router-dom";
import { Armchair, CalendarDays, WalletCards, CircleUserRound } from "lucide-react";

export default function BottomNav() {
  return <nav className="bottom-nav">
    <NavLink to="/" end><Armchair/><span>Spaces</span></NavLink>
    <NavLink to="/booking"><CalendarDays/><span>Booking</span></NavLink>
    <NavLink to="/tariffs"><WalletCards/><span>Tariffs</span></NavLink>
    <NavLink to="/profile"><CircleUserRound/><span>Profile</span></NavLink>
  </nav>;
}