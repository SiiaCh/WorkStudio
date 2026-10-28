import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Brand from "../components/Brand";

export default function AuthPage({ mode, onLogin }: { mode: "login" | "register"; onLogin: (name: string, email: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const register = mode === "register";
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@") || !email.includes(".")) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must contain at least 6 characters.");
    if (register && !name.trim()) return setError("Enter your full name.");
    if (register && password !== confirm) return setError("Passwords do not match.");
    onLogin(register ? name : email.split("@")[0], email);
    navigate("/");
  }
  return <div className="auth-wrap"><div className="auth-card"><Brand/><div className="auth-heading"><h1>{register ? "Create account" : "Welcome back!"}</h1><p>{register ? "Join WorkStudio and book your workspace" : "Sign in to continue to WorkStudio"}</p></div>
    <form onSubmit={submit} className="form-stack">{register && <label>Full name<input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" autoComplete="name" required/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={register ? "new-password" : "current-password"} required/></label>{register && <label>Confirm password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required/></label>}
      {error && <p className="form-error" role="alert">{error}</p>}<button className="button primary full" type="submit">{register ? "Create Account" : "Sign In"}</button></form>
    <div className="or-divider"><span>OR</span></div><button className="button outline full" type="button" onClick={() => setError("Google Sign-In will be available after authentication is connected.")}>{register ? "Sign up with Google" : "Continue with Google"}</button>
    <p className="auth-switch">{register ? "Already have an account?" : "Don't have an account?"} <Link to={register ? "/login" : "/register"}>{register ? "Sign In" : "Sign Up"}</Link></p><p className="demo-note centered">Demo authentication only — connect backend before production.</p>
  </div></div>;
}