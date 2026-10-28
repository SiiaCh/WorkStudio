import { Link } from "react-router-dom";
import { LogOut } from "lucide-react";

export default function ProfilePage({ user, onLogout }: { user: { name: string; email: string } | null; onLogout: () => void }) {
  return <><header className="page-header"><div><p className="eyebrow">ACCOUNT</p><h1>Your profile</h1><p className="muted">Manage your WorkStudio account.</p></div></header><section className="profile-card"><div className="profile-avatar">{user?.name?.[0]?.toUpperCase() ?? "G"}</div><h2>{user?.name ?? "Guest user"}</h2><p className="muted">{user?.email ?? "You are browsing in demo mode."}</p>{user ? <><p className="notice">You are signed in locally for this demo. Account data is not sent to a server.</p><button className="button outline" type="button" onClick={onLogout}><LogOut size={16}/> Sign out</button></> : <Link className="button primary inline-button" to="/login">Sign in</Link>}</section></>;
}
