import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db, uid, logAudit } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";

// A random session secret would log everyone out on every restart/deploy.
// Use SESSION_SECRET from the environment if set (recommended for cloud
// deployments); otherwise generate one once and persist it to a local file
// so restarts don't invalidate existing logins.
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const secretPath = path.join(__dirname, ".session-secret");
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, "utf8").trim();
  const generated = uid() + uid() + uid();
  fs.writeFileSync(secretPath, generated);
  return generated;
}

// Persists sessions to the same SQLite database instead of the default
// in-memory store, so logins survive service restarts (deploys, crashes,
// server reboots) instead of forcing everyone to log in again each time.
class SQLiteSessionStore extends session.Store {
  get(sid, cb) {
    try {
      const row = db.prepare("SELECT data, expires FROM sessions WHERE sid = ?").get(sid);
      if (!row) return cb(null, null);
      if (row.expires && new Date(row.expires) < new Date()) {
        db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (e) {
      cb(e);
    }
  }
  set(sid, sessionData, cb) {
    try {
      const expires = sessionData.cookie?.expires
        ? new Date(sessionData.cookie.expires).toISOString()
        : new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
      db.prepare(
        `INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
         ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`
      ).run(sid, JSON.stringify(sessionData), expires);
      cb && cb(null);
    } catch (e) {
      cb && cb(e);
    }
  }
  destroy(sid, cb) {
    try {
      db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
      cb && cb(null);
    } catch (e) {
      cb && cb(e);
    }
  }
  touch(sid, sessionData, cb) {
    this.set(sid, sessionData, cb);
  }
}

const app = express();
// When running behind a reverse proxy (Caddy/nginx on a cloud server), this
// lets Express correctly see the original protocol (https) so secure
// cookies work.
if (IS_PRODUCTION) app.set("trust proxy", 1);

app.use(express.json({ limit: "10mb" }));
app.use(
  session({
    store: new SQLiteSessionStore(),
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: IS_PRODUCTION, // only sent over HTTPS in production
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

// ---------------- Role permissions ----------------
// Which roles may WRITE (create/update/delete) each data category.
// Reads are allowed for any logged-in user, since the app cross-references
// data across tabs (e.g. New Bill needs to read inventory). This is a
// meaningful safeguard against accidental/unauthorized changes, not a full
// row-level read ACL.
const KEY_WRITE_ROLES = {
  inventory: ["admin", "inventory"],
  purchases: ["admin", "inventory"],
  suppliers: ["admin", "inventory"],
  payments: ["admin", "inventory"],
  bills: ["admin", "biller"],
  expenses: ["admin"],
  "shop-name": ["admin"],
  gstin: ["admin"],
  "print-width": ["admin", "biller", "inventory"],
};
function canWrite(role, key) {
  const allowed = KEY_WRITE_ROLES[key];
  if (!allowed) return role === "admin";
  return allowed.includes(role);
}

// ---------------- Auth middleware ----------------
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
  const user = db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: "Session invalid" });
  }
  req.user = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Not permitted for your role" });
    next();
  };
}

// ---------------- Auth routes ----------------
app.get("/api/users/public", (req, res) => {
  const users = db.prepare("SELECT id, name, role FROM users ORDER BY name").all();
  res.json(users);
});

app.post("/api/login", (req, res) => {
  const { userId, pin } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user || !bcrypt.compareSync(String(pin || ""), user.pin_hash)) {
    return res.status(401).json({ error: "Incorrect PIN" });
  }
  req.session.userId = user.id;
  logAudit({ userId: user.id, userName: user.name, role: user.role, action: "login", details: `${user.name} logged in` });
  res.json({ id: user.id, name: user.name, role: user.role });
});

app.post("/api/logout", requireAuth, (req, res) => {
  logAudit({ userId: req.user.id, userName: req.user.name, role: req.user.role, action: "logout", details: `${req.user.name} logged out` });
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/session", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ user: null });
  const user = db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(req.session.userId);
  if (!user) return res.status(401).json({ user: null });
  res.json({ user });
});

// ---------------- Users management (admin only) ----------------
app.get("/api/users", requireAuth, requireRole("admin"), (req, res) => {
  res.json(db.prepare("SELECT id, name, role, created_at FROM users ORDER BY created_at").all());
});

app.post("/api/users", requireAuth, requireRole("admin"), (req, res) => {
  const { name, role, pin } = req.body || {};
  if (!name?.trim() || !["admin", "biller", "inventory"].includes(role) || !/^\d{4,6}$/.test(String(pin || ""))) {
    return res.status(400).json({ error: "Name, valid role, and a 4-6 digit PIN are required" });
  }
  const id = uid();
  db.prepare("INSERT INTO users (id, name, role, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id, name.trim(), role, bcrypt.hashSync(String(pin), 10), new Date().toISOString()
  );
  logAudit({ userId: req.user.id, userName: req.user.name, role: req.user.role, action: "user_create", details: `Created user ${name.trim()} (${role})` });
  res.json({ id, name: name.trim(), role });
});

app.put("/api/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  const { name, role, pin } = req.body || {};
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (existing.role === "admin" && role !== "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: "Can't remove the last admin's admin role" });
  }
  const newName = name?.trim() || existing.name;
  const newRole = ["admin", "biller", "inventory"].includes(role) ? role : existing.role;
  const newPinHash = pin ? bcrypt.hashSync(String(pin), 10) : existing.pin_hash;
  db.prepare("UPDATE users SET name = ?, role = ?, pin_hash = ? WHERE id = ?").run(newName, newRole, newPinHash, req.params.id);
  logAudit({ userId: req.user.id, userName: req.user.name, role: req.user.role, action: "user_update", details: `Updated user ${newName}` });
  res.json({ id: req.params.id, name: newName, role: newRole });
});

app.delete("/api/users/:id", requireAuth, requireRole("admin"), (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (existing.role === "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get().c;
    if (adminCount <= 1) return res.status(400).json({ error: "Can't delete the last admin" });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  logAudit({ userId: req.user.id, userName: req.user.name, role: req.user.role, action: "user_delete", details: `Deleted user ${existing.name}` });
  res.json({ ok: true });
});

// ---------------- Key-value storage (matches window.storage contract) ----------------
app.get("/api/kv", requireAuth, (req, res) => {
  const prefix = req.query.prefix || "";
  const rows = db.prepare("SELECT key FROM kv_store WHERE key LIKE ?").all(prefix + "%");
  res.json({ keys: rows.map((r) => r.key), prefix, shared: false });
});

app.get("/api/kv/:key", requireAuth, (req, res) => {
  const row = db.prepare("SELECT value FROM kv_store WHERE key = ?").get(req.params.key);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json({ key: req.params.key, value: row.value, shared: false });
});

// ---------------- Semantic audit diffing ----------------
// The app stores each data category (bills, inventory, etc.) as one JSON
// array per key. To produce a meaningful audit trail ("added item X",
// "deleted bill Y") rather than just "key was updated", we diff the old and
// new arrays by id whenever a write happens to a known array-shaped key.
const ENTITY_LABELS = {
  inventory: (i) => `${i.name || "item"} (${i.productType || "item"}, ${i.stockQty ?? "?"} ${i.unitMode === "set" ? "set" : i.productType === "readymade" ? "pc" : "m"})`,
  bills: (b) => `Bill ${b.billNumber || b.id} - ${b.customerName || "customer"} - ${money(b.total)}`,
  purchases: (p) => `Purchase from ${p.supplierName || "supplier"} - ${money(p.totalAmount)}`,
  expenses: (e) => `${e.category || "expense"} - ${money(e.amount)}${e.description ? " (" + e.description + ")" : ""}`,
  suppliers: (s) => `Supplier ${s.name || s.id}`,
  payments: (p) => `Payment of ${money(p.amount)}${p.note ? " - " + p.note : ""}`,
};
function money(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function diffEntities(key, oldValue, newValue) {
  const labelFn = ENTITY_LABELS[key];
  if (!labelFn) return null; // not a known array-of-entities key
  let oldArr, newArr;
  try {
    oldArr = oldValue ? JSON.parse(oldValue) : [];
    newArr = JSON.parse(newValue);
  } catch {
    return null;
  }
  if (!Array.isArray(oldArr) || !Array.isArray(newArr)) return null;

  const oldMap = new Map(oldArr.filter((x) => x && x.id).map((x) => [x.id, x]));
  const newMap = new Map(newArr.filter((x) => x && x.id).map((x) => [x.id, x]));

  const added = [];
  const modified = [];
  for (const [id, item] of newMap) {
    if (!oldMap.has(id)) added.push(item);
    else if (JSON.stringify(oldMap.get(id)) !== JSON.stringify(item)) modified.push(item);
  }
  const deleted = [];
  for (const [id, item] of oldMap) {
    if (!newMap.has(id)) deleted.push(item);
  }

  if (added.length === 0 && modified.length === 0 && deleted.length === 0) return null;

  const describe = (arr, verb) => arr.map((item) => {
    try { return `${verb}: ${labelFn(item)}`; } catch { return `${verb}: (id ${item.id})`; }
  });
  const lines = [...describe(added, "Added"), ...describe(modified, "Edited"), ...describe(deleted, "Deleted")];
  // Keep the log readable — cap how many individual lines we store per write.
  const MAX_LINES = 10;
  const shown = lines.slice(0, MAX_LINES);
  if (lines.length > MAX_LINES) shown.push(`...and ${lines.length - MAX_LINES} more change(s)`);
  return shown.join(" | ");
}

app.put("/api/kv/:key", requireAuth, (req, res) => {
  const key = req.params.key;
  if (!canWrite(req.user.role, key)) {
    return res.status(403).json({ error: `Your role (${req.user.role}) can't modify ${key}` });
  }
  const { value } = req.body || {};
  if (typeof value !== "string") return res.status(400).json({ error: "value must be a string" });

  const existing = db.prepare("SELECT value FROM kv_store WHERE key = ?").get(key);
  const semanticDetails = diffEntities(key, existing?.value, value);

  db.prepare(
    `INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, new Date().toISOString());
  logAudit({
    userId: req.user.id, userName: req.user.name, role: req.user.role,
    action: "write", entityKey: key,
    details: semanticDetails || `Updated "${key}" (${(value.length / 1024).toFixed(1)} KB)`,
  });
  res.json({ key, value, shared: false });
});

app.delete("/api/kv/:key", requireAuth, (req, res) => {
  const key = req.params.key;
  if (!canWrite(req.user.role, key)) {
    return res.status(403).json({ error: `Your role (${req.user.role}) can't modify ${key}` });
  }
  db.prepare("DELETE FROM kv_store WHERE key = ?").run(key);
  logAudit({ userId: req.user.id, userName: req.user.name, role: req.user.role, action: "delete", entityKey: key, details: `Deleted "${key}"` });
  res.json({ key, deleted: true, shared: false });
});

// ---------------- Audit log (admin only) ----------------
app.get("/api/audit-log", requireAuth, requireRole("admin"), (req, res) => {
  const { from, to, user: userFilter, action, limit = 500 } = req.query;
  let sql = "SELECT * FROM audit_log WHERE 1=1";
  const params = [];
  if (from) { sql += " AND date(timestamp) >= date(?)"; params.push(from); }
  if (to) { sql += " AND date(timestamp) <= date(?)"; params.push(to); }
  if (userFilter) { sql += " AND user_name LIKE ?"; params.push(`%${userFilter}%`); }
  if (action) { sql += " AND action = ?"; params.push(action); }
  sql += " ORDER BY timestamp DESC LIMIT ?";
  params.push(Math.min(Number(limit) || 500, 5000));
  res.json(db.prepare(sql).all(...params));
});

// ---------------- Serve built frontend in production ----------------
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"), (err) => {
    if (err) res.status(404).send("Run `npm run build` first, or use `npm run dev` for development.");
  });
});

app.listen(PORT, () => {
  console.log(`Textile Shop Manager backend running at http://localhost:${PORT}`);
});
