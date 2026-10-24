// SQLite database layer using sql.js (SQLite compiled to WebAssembly).
//
// Why sql.js instead of better-sqlite3: better-sqlite3 is a native addon
// that must be compiled per-platform (needs Visual Studio Build Tools on
// Windows, Xcode tools on Mac, etc.) — a common source of install failures
// on shop PCs that don't have developer tools installed. sql.js is pure
// JavaScript + WebAssembly, so `npm install` never needs to compile
// anything, on any platform.
//
// Trade-off: sql.js keeps the database in memory and we persist it to disk
// as a single file after each write. For a single shop's data this is
// fast (milliseconds) and simple; it just means writes are whole-file
// rewrites rather than incremental disk writes like a native SQLite driver.
import initSqlJs from "sql.js";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DB_PATH = path.join(__dirname, "shop.db");

const SQL = await initSqlJs({
  locateFile: (file) => path.join(path.dirname(require.resolve("sql.js")), file),
});

const rawDb = fs.existsSync(DB_PATH) ? new SQL.Database(fs.readFileSync(DB_PATH)) : new SQL.Database();

function persistToDisk() {
  fs.writeFileSync(DB_PATH, Buffer.from(rawDb.export()));
}

// Thin compatibility layer matching the small subset of the better-sqlite3
// API this app uses (db.prepare(sql).get/.all/.run(...args)), so the rest
// of the server code doesn't need to know which SQLite driver is underneath.
function prepare(sql) {
  return {
    get(...params) {
      const stmt = rawDb.prepare(sql);
      stmt.bind(params);
      const row = stmt.step() ? stmt.getAsObject() : undefined;
      stmt.free();
      return row;
    },
    all(...params) {
      const stmt = rawDb.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
    run(...params) {
      const stmt = rawDb.prepare(sql);
      stmt.bind(params);
      stmt.step();
      stmt.free();
      persistToDisk();
      return { changes: rawDb.getRowsModified() };
    },
  };
}

export const db = { prepare };

export const uid = () => crypto.randomBytes(8).toString("hex");

rawDb.exec(`
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','biller','inventory')),
    pin_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    user_id TEXT,
    user_name TEXT,
    role TEXT,
    action TEXT,
    entity_key TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
`);
persistToDisk();

// Seed a default Admin user on first run so the app is never locked out.
const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
if (userCount === 0) {
  const id = uid();
  const pinHash = bcrypt.hashSync("0000", 10);
  db.prepare(
    "INSERT INTO users (id, name, role, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, "Admin", "admin", pinHash, new Date().toISOString());
  console.log("\n==============================================");
  console.log(" First run: created default login");
  console.log("   Name: Admin   PIN: 0000");
  console.log(" Please log in and set a real PIN under Users.");
  console.log("==============================================\n");
}

export function logAudit({ userId, userName, role, action, entityKey, details }) {
  db.prepare(
    `INSERT INTO audit_log (id, timestamp, user_id, user_name, role, action, entity_key, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uid(), new Date().toISOString(), userId || null, userName || null, role || null, action, entityKey || null, details || null);
}
