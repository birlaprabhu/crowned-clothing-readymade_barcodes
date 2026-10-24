const API_BASE = "/api";

export async function fetchSession() {
  const res = await fetch(`${API_BASE}/session`, { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user || null;
}

export async function fetchPublicUsers() {
  const res = await fetch(`${API_BASE}/users/public`, { credentials: "include" });
  if (!res.ok) return [];
  return res.json();
}

export async function login(userId, pin) {
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data;
}

export async function logout() {
  await fetch(`${API_BASE}/logout`, { method: "POST", credentials: "include" });
}

// User management (admin only) — separate from the generic KV store since
// users live in their own database table, not a JSON blob.
export async function apiListUsers() {
  const res = await fetch(`${API_BASE}/users`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load users");
  return res.json();
}
export async function apiCreateUser(user) {
  const res = await fetch(`${API_BASE}/users`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create user");
  return data;
}
export async function apiUpdateUser(id, user) {
  const res = await fetch(`${API_BASE}/users/${id}`, {
    method: "PUT", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update user");
  return data;
}
export async function apiDeleteUser(id) {
  const res = await fetch(`${API_BASE}/users/${id}`, { method: "DELETE", credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete user");
  return data;
}

export async function apiFetchAuditLog(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/audit-log${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load audit log");
  return res.json();
}

// Installs window.storage backed by the local Express + SQLite backend,
// matching the same get/set/delete/list contract the app already uses.
export function installStorage() {
  window.storage = {
    async get(key) {
      const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Key not found: ${key}`);
      const data = await res.json();
      return { key, value: data.value, shared: false };
    },
    async set(key, value) {
      const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      return { key, value, shared: false };
    },
    async delete(key) {
      const res = await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) return null;
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const res = await fetch(`${API_BASE}/kv?prefix=${encodeURIComponent(prefix)}`, { credentials: "include" });
      if (!res.ok) return { keys: [], prefix, shared: false };
      return res.json();
    },
  };
}
