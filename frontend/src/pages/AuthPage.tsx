import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";
import { apiRequest, setAccessToken } from "../services/api";
import type { User } from "../types";

type AuthResult = { accessToken: string; user: User };
type RegisterResult = { user: User; emailDelivery?: { status: string; message: string; verificationUrl?: string } };
export default function AuthPage({ mode, onLogin }: { mode: "login" | "register"; onLogin: (user: User) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const register = mode === "register";
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setMessage("");
    if (register && password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      if (register) {
        const result = await apiRequest<RegisterResult>("/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
        setMessage(result.emailDelivery?.message ?? "Account created. Check your email to confirm your address before booking.");
        if (result.emailDelivery?.verificationUrl) setMessage(`${result.emailDelivery.message} Development confirmation link: ${result.emailDelivery.verificationUrl}`);
      } else {
        const result = await apiRequest<AuthResult>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setAccessToken(result.accessToken); onLogin(result.user); navigate("/");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed."); }
    finally { setBusy(false); }
  }
  return <div className="auth-wrap"><div className="auth-card"><Brand/><div className="auth-heading"><h1>{register ? "Create account" : "Welcome back!"}</h1><p>{register ? "Join WorkStudio and book your workspace" : "Sign in to continue to WorkStudio"}</p></div>
    <form onSubmit={submit} className="form-stack">{register && <label>Full name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={register ? "new-password" : "current-password"} minLength={8} required/></label>{register && <label>Confirm password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required/></label>}
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}<button className="button primary full" type="submit" disabled={busy}>{busy ? "Please wait…" : register ? "Create Account" : "Sign In"}</button></form>
    <p className="auth-switch">{register ? "Already have an account?" : "Don't have an account?"} <Link to={register ? "/login" : "/register"}>{register ? "Sign In" : "Sign Up"}</Link></p>
  </div></div>;
}
