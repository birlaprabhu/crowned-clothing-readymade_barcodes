import React, { useEffect, useState } from "react";
import { fetchPublicUsers, login } from "./api-storage.js";
import logoWordmark from "./assets/logo-wordmark.jpg";
import logoWatermark from "./assets/logo-watermark.jpg";

const COLORS = {
  indigo: "#D9A64E",
  madder: "#E2694B",
  khadi: "#18181B",
  thread: "#232227",
  ink: "#F2F0EA",
};

const ROLE_LABELS = { admin: "Admin", biller: "Biller", inventory: "Inventory" };

export default function Login({ onLogin }) {
  const [users, setUsers] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPublicUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(selected.id, pin);
      onLogin(user);
    } catch (err) {
      setError(err.message || "Login failed");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: `linear-gradient(rgba(24,24,27,0.94), rgba(24,24,27,0.94)), url(${logoWatermark})`,
        backgroundSize: "auto, 460px",
        backgroundPosition: "center, center",
        backgroundRepeat: "no-repeat, no-repeat",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <style>{`
        input:not([type="checkbox"]), select, textarea {
          background-color: #1B1B1E;
          color: #F2F0EA;
        }
        input::placeholder { color: #6B6A66; }
      `}</style>
      <div className="w-full max-w-sm rounded-xl p-6 space-y-4" style={{ background: COLORS.thread, border: "1px solid #38373C" }}>
        <div className="text-center">
          <img src={logoWordmark} alt="Shop logo" className="mx-auto rounded-lg mb-2" style={{ maxWidth: "220px", width: "100%", height: "auto" }} />
          <p className="text-xs mt-1" style={{ color: "#A6A39B" }}>Sign in to continue</p>
        </div>

        {users === null && <p className="text-sm text-center" style={{ color: "#A6A39B" }}>Loading…</p>}

        {users && !selected && (
          <div className="space-y-2">
            {users.length === 0 && <p className="text-sm text-center" style={{ color: "#A6A39B" }}>No users found. Is the server running?</p>}
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSelected(u); setError(""); setPin(""); }}
                className="w-full flex justify-between items-center px-4 py-3 rounded-lg border text-left hover:bg-white/5"
                style={{ borderColor: "#38373C" }}
              >
                <span style={{ color: COLORS.ink }}>{u.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: COLORS.khadi, color: "#A6A39B" }}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <form onSubmit={submit} className="space-y-3">
            <button type="button" onClick={() => setSelected(null)} className="text-xs" style={{ color: "#A6A39B" }}>
              ← Not {selected.name}?
            </button>
            <p className="text-sm text-center" style={{ color: COLORS.ink }}>
              Enter PIN for <strong>{selected.name}</strong>
            </p>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="PIN"
              className="w-full px-3 py-2 rounded-lg border text-center text-lg tracking-widest outline-none"
              style={{ borderColor: "#38373C", fontFamily: "monospace" }}
            />
            {error && <p className="text-xs text-center" style={{ color: COLORS.madder }}>{error}</p>}
            <button
              type="submit"
              disabled={loading || pin.length < 4}
              className="w-full py-2 rounded-lg text-white text-sm disabled:opacity-40"
              style={{ background: COLORS.indigo, color: "#1B1B1E" }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        )}

        <p className="text-[10px] text-center pt-2" style={{ color: "#A6A39B" }}>
          This login organizes who can do what — it runs on your own local server, not the cloud.
        </p>
      </div>
    </div>
  );
}
