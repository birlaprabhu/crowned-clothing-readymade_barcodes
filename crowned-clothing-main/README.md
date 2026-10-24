# Textile Shop Manager — Local Setup

This runs on your own PC with a real local database (SQLite) and proper
login-based roles — no cloud, no internet required after setup.

## 1. Install Node.js (one-time)

Download and install Node.js (version 18 or newer) from https://nodejs.org
if you don't already have it.

## 2. Start the app — no typing needed

Unzip this folder, then double-click the launcher for your operating system:

- **Windows:** `Start Shop App (Windows).bat`
- **Mac:** `Start Shop App (Mac).command`
- **Linux:** `Start Shop App (Linux).sh`

The first time you run it, it installs dependencies and builds the app (a
minute or two, some text will scroll by). After that it opens straight to
the sign-in screen in your browser, usually within a few seconds.

A window stays open in the background while you use the app — that's the
local server (and database). **Keep it open**; closing it stops the app.

### Mac note
The first time you double-click the `.command` file, macOS may block it as
"from an unidentified developer." Right-click the file → **Open** → **Open**
again. You only need to do this once.

### Linux note
If double-clicking doesn't run it, right-click → Properties → Permissions →
enable "Allow executing file as program," or run it from a terminal with
`./"Start Shop App (Linux).sh"`.

## 3. First login

On first run, one login is created automatically:

> **Name:** Admin **PIN:** 0000

Sign in with that, then go to the **Users** tab and:
1. Change the Admin PIN to something real.
2. Add a login for each person on your team, choosing a role for each:

| Role | Can access |
|---|---|
| **Admin** | Everything, including Users and the Audit Log |
| **Biller** | New Bill and Bills only |
| **Inventory** | Inventory and Purchases only |

> **Important — please read:** this login system runs entirely on your own
> computer for the purpose of organizing who does what day to day. It is
> **not the same as bank-grade security** — anyone with access to this PC
> and some technical know-how could still get at the underlying data
> directly. Treat it as a helpful boundary for your team, not a lock against
> a determined intruder. Use a real PIN, and keep the PC itself secure
> (screen lock, don't leave it logged in and unattended, etc.).

## 4. Where your data lives

Everything — bills, inventory, purchases, users, the audit log — is stored
in a single database file:

```
local-project/server/shop.db
```

This is a real SQLite database, not a size-limited browser storage. It can
comfortably hold years of a busy shop's records. Still, **back it up
regularly** — copy `shop.db` somewhere safe (a USB drive, cloud folder,
etc.) periodically. The in-app **"Backup all data"** button also still
works and exports a JSON copy for extra safety.

## 5. Audit log

Every login, logout, and change to shop data (who, what, when) is recorded
automatically and can only be viewed from the **Audit Log** tab, which only
Admin accounts can see. This log is written directly by the server — no
user, including an Admin, can edit or delete individual entries from within
the app.

## 6. Using it day to day

Just double-click the same launcher file each time.

## Advanced: manual commands (optional)

```
npm install
npm run build     # builds the frontend
npm run start     # runs the server (serves the app at http://localhost:4000)
```

For active development with hot-reload (frontend on Vite, proxied to the
backend):

```
npm run dev
```

This starts both the API server (port 4000) and the Vite dev server
together, and opens automatically at whatever port Vite prints (usually
`http://localhost:5173`).

## Notes

- Data lives on **this one PC**, in `server/shop.db`. Multiple computers on
  the same network could reach it if you set that up separately (out of
  scope for this basic setup) — as shipped, it's meant for one PC.
- If you ever need to start over completely, close the app and delete
  `server/shop.db` — a fresh database with a new default Admin/0000 login
  will be created next time you start the app. Do this only if you're
  sure — it erases everything.

## 7. Cloud deployment (optional)

If you'd like to access this app from anywhere — not just this one PC —
you can host it on a small cloud server. See the cost breakdown and
step-by-step guide that came with this in your conversation with Claude.
Ready-to-use config files are included in the `deploy/` folder:

- `deploy/textile-shop-manager.service` — keeps the app running permanently
  on a Linux server and restarts it automatically.
- `deploy/Caddyfile` — gives you free, automatic HTTPS with your domain.
- `deploy/backup.sh` — a script you can schedule (via cron) to back up the
  database automatically every day.
