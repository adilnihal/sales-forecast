"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      setError(res.status === 401 ? "Wrong password." : "Could not log in. Try again in a minute.");
    } catch {
      setError("Can't reach the server. Check your internet connection.");
    }
    setBusy(false);
  };

  return (
    <>
      <style>{`.shell{display:block}.tabbar{display:none}`}</style>
      <div style={{ maxWidth: 380, margin: "12vh auto 0", padding: "0 16px" }}>
        <h1 style={{ marginBottom: 6 }}>Shop Ledger</h1>
        <p className="muted" style={{ marginBottom: 20 }}>Enter the password to open your bills.</p>
        <form onSubmit={submit}>
          <label className="f" htmlFor="pw">Password</label>
          <input id="pw" className="pen" type="password" autoFocus autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="alert error" role="alert" style={{ marginTop: 14 }}>{error}</div>}
          <div style={{ marginTop: 18 }}>
            <button className="btn primary" type="submit" disabled={busy || !password}>{busy ? "Checking…" : "Log in"}</button>
          </div>
        </form>
      </div>
    </>
  );
}
