import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { apiListUsers, apiCreateUser, apiUpdateUser, apiDeleteUser, apiFetchAuditLog } from "./api-storage.js";
import logoIcon from "./assets/logo-icon.jpg";
import logoWatermark from "./assets/logo-watermark.jpg";
import {
  LayoutDashboard,
  Boxes,
  Receipt,
  ScrollText,
  Users,
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  Printer,
  AlertTriangle,
  Shirt,
  Scissors,
  ShoppingCart,
  Wallet,
  Building2,
  TrendingUp,
  Landmark,
  Download,
  CalendarRange,
  Upload,
  Barcode,
  UserCog,
  History,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Tag,
} from "lucide-react";

const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap";

const COLORS = {
  indigo: "#D9A64E",
  madder: "#E2694B",
  turmeric: "#C9A227",
  khadi: "#18181B",
  thread: "#232227",
  ink: "#F2F0EA",
  green: "#4FAE72",
};

const PRODUCT_TYPES = {
  fabric: { label: "Fabric", unit: "m", unitLabel: "meter", icon: Scissors },
  readymade: { label: "Readymade", unit: "pc", unitLabel: "piece", icon: Shirt },
};
const ptMeta = (productType) => PRODUCT_TYPES[productType] || PRODUCT_TYPES.fabric;

const FABRIC_CATEGORIES = {
  cotton: { label: "Cotton", stripe: [COLORS.madder, COLORS.khadi] },
  silk: { label: "Silk", stripe: [COLORS.indigo, COLORS.turmeric] },
  linen: { label: "Linen", stripe: [COLORS.indigo, COLORS.khadi] },
  synthetic: { label: "Synthetic", stripe: [COLORS.turmeric, COLORS.ink] },
  blend: { label: "Blend", stripe: [COLORS.madder, COLORS.indigo] },
  chudithar: { label: "Chudithar material", stripe: [COLORS.turmeric, COLORS.madder] },
};

const DEFAULT_SET_SIZE_METERS = 2.5;

// Fabric can be sold either by open length (cut-to-order meters) or as a
// fixed-size bundle (e.g. a 2.5m chudithar set). Readymade is always by piece.
function unitFor(item) {
  if (item.productType === "readymade") return "pc";
  if (item.unitMode === "set") return "set";
  return "m";
}
function unitLabelFor(item) {
  if (item.productType === "readymade") return "piece";
  if (item.unitMode === "set") return `set (${item.setSizeMeters || DEFAULT_SET_SIZE_METERS}m)`;
  return "meter";
}
function unitStepFor(item) {
  return unitFor(item) === "m" ? 0.5 : 1;
}

const GARMENT_CATEGORIES = {
  shirt: { label: "Shirt", stripe: [COLORS.indigo, COLORS.thread] },
  pants: { label: "Pants", stripe: [COLORS.madder, COLORS.thread] },
  tshirts: { label: "T-Shirts", stripe: [COLORS.turmeric, COLORS.indigo] },
  trackpants: { label: "Track-Pants", stripe: [COLORS.madder, COLORS.turmeric] },
  other: { label: "Other", stripe: [COLORS.ink, COLORS.khadi] },
};

const SIZES = ["Free size", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Salary / Wages",
  "Transport",
  "Maintenance",
  "Stitching charges",
  "Packing material",
  "Other",
];

const categoryMetaFor = (productType) =>
  productType === "readymade" ? GARMENT_CATEGORIES : FABRIC_CATEGORIES;

const uid = () => Math.random().toString(36).slice(2, 10);

const money = (n) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const todayISO = () => new Date().toISOString().slice(0, 10);
const firstOfMonthISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const inRange = (dateISO, from, to) => {
  const d = dateISO.slice(0, 10);
  return d >= from && d <= to;
};

// ---- Financial year (April–March, Indian FY) helpers ----
const fyStartYear = (dateISO) => {
  const d = new Date(dateISO);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0 = Jan
  return m >= 3 ? y : y - 1; // April (index 3) onward belongs to FY starting this year
};
const fyLabel = (startYear) => `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
const fyRangeISO = (startYear) => ({
  from: `${startYear}-04-01`,
  to: `${startYear + 1}-03-31`,
});
const currentFYStartYear = () => fyStartYear(new Date().toISOString());
const fyOptionsFrom = (dateList) => {
  const years = new Set([currentFYStartYear()]);
  dateList.forEach((d) => years.add(fyStartYear(d)));
  return Array.from(years).sort((a, b) => b - a);
};

function downloadCSV(filename, header, rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Recomputes each purchase's true paid/due amount from ALL payments made to
// that supplier to date (not just the amount paid at the moment the purchase
// was created), allocating payments oldest-purchase-first per supplier.
function allocatePaymentsToPurchases(purchases, payments) {
  const bySupplier = {};
  purchases.forEach((p) => {
    (bySupplier[p.supplierId] ||= []).push(p);
  });
  const remaining = {};
  purchases.forEach((p) => { remaining[p.id] = p.totalAmount; });

  // Step 1: payments explicitly tied to a specific purchase (which materials) apply directly.
  const untaggedBySupplier = {};
  (payments || []).forEach((pay) => {
    if (pay.purchaseId && remaining[pay.purchaseId] != null) {
      const applied = Math.min(remaining[pay.purchaseId], pay.amount);
      remaining[pay.purchaseId] -= applied;
      const overflow = pay.amount - applied;
      if (overflow > 0) untaggedBySupplier[pay.supplierId] = (untaggedBySupplier[pay.supplierId] || 0) + overflow;
    } else {
      untaggedBySupplier[pay.supplierId] = (untaggedBySupplier[pay.supplierId] || 0) + pay.amount;
    }
  });

  // Step 2: leftover untagged payments pool FIFO across that supplier's remaining dues, oldest first.
  const result = {};
  Object.entries(bySupplier).forEach(([supplierId, list]) => {
    const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    let pool = untaggedBySupplier[supplierId] || 0;
    sorted.forEach((p) => {
      const dueAfterDirect = remaining[p.id];
      const paidFromPool = Math.min(dueAfterDirect, pool);
      pool -= paidFromPool;
      const dueNow = dueAfterDirect - paidFromPool;
      result[p.id] = { paidNow: p.totalAmount - dueNow, dueNow };
    });
  });
  return result;
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Migrates inventory items saved by earlier versions of this app (fabric-only
// schema with pricePerMeter/stockMeters, no productType) to the current shape.
function normalizeInventoryItem(i) {
  const productType = i.productType === "readymade" ? "readymade" : "fabric";
  return {
    id: i.id || uid(),
    productType,
    name: i.name || "Unnamed item",
    barcode: i.barcode || "",
    category: i.category || (productType === "readymade" ? "other" : "cotton"),
    color: i.color || "",
    size: productType === "readymade" ? i.size || "Free size" : undefined,
    unitMode: productType === "fabric" && i.unitMode === "set" ? "set" : "meter",
    setSizeMeters: productType === "fabric" && i.unitMode === "set" ? Number(i.setSizeMeters || DEFAULT_SET_SIZE_METERS) : undefined,
    pricePerUnit: Number(i.pricePerUnit ?? i.pricePerMeter ?? 0),
    costPerUnit: Number(i.costPerUnit ?? 0),
    stockQty: Number(i.stockQty ?? i.stockMeters ?? 0),
    lowStockThreshold: Number(i.lowStockThreshold ?? (productType === "readymade" ? 3 : 10)),
    createdAt: Number(i.createdAt) || 0,
  };
}

function Swatch({ category, productType }) {
  const meta = categoryMetaFor(productType)[category] || FABRIC_CATEGORIES.cotton;
  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-2 rounded-l-lg"
      style={{
        background: `repeating-linear-gradient(180deg, ${meta.stripe[0]} 0px, ${meta.stripe[0]} 6px, ${meta.stripe[1]} 6px, ${meta.stripe[1]} 12px)`,
      }}
    />
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3.5 py-2.5 rounded-t-lg text-sm font-medium transition-colors border-b-2 whitespace-nowrap"
      style={{
        borderColor: active ? COLORS.madder : "transparent",
        color: active ? COLORS.ink : "#A6A39B",
        background: active ? COLORS.thread : "transparent",
      }}
    >
      <Icon size={16} strokeWidth={2} />
      <span style={{ fontFamily: "Inter, sans-serif" }}>{label}</span>
    </button>
  );
}

function EmptyState({ title, body }) {
  return (
    <div
      className="rounded-xl border border-dashed py-12 px-6 text-center"
      style={{ borderColor: "#47454B" }}
    >
      <p
        className="text-lg mb-1"
        style={{ fontFamily: "Fraunces, serif", color: COLORS.ink }}
      >
        {title}
      </p>
      <p className="text-sm" style={{ color: "#A6A39B" }}>
        {body}
      </p>
    </div>
  );
}

function ProductTypeBadge({ productType }) {
  const meta = ptMeta(productType);
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
      style={{
        background: productType === "readymade" ? "#3A3226" : "#2E2C3A",
        color: COLORS.ink,
      }}
    >
      <Icon size={10} /> {meta.label}
    </span>
  );
}

function Modal({ onClose, children, maxWidth = "max-w-md" }) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-30"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-xl p-5 space-y-3 max-h-[85vh] overflow-auto`}
        style={{ background: COLORS.thread }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const inputStyle = { borderColor: "#38373C" };

function FYSelect({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border text-sm outline-none"
      style={inputStyle}
    >
      <option value="all">All years</option>
      {options.map((y) => (
        <option key={y} value={y}>
          {fyLabel(y)}
        </option>
      ))}
    </select>
  );
}

// ---------------- Pagination ----------------
// Shared pagination helper used by Inventory, Purchases, Bills and the Audit Log
// tables. Keeps the newest records on page 1 — callers are expected to hand in
// an already newest-first-sorted array.
const PAGE_SIZE = 10;

function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]); // eslint-disable-line react-hooks/exhaustive-deps
  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );
  return { page, setPage, totalPages, paged };
}

function PaginationBar({ page, setPage, totalPages, totalItems, pageSize = PAGE_SIZE }) {
  if (totalItems === 0 || totalPages <= 1) return null;
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t text-xs flex-wrap gap-2" style={{ borderColor: "#38373C", color: "#A6A39B" }}>
      <span>{startItem}–{endItem} of {totalItems}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
          className="p-1.5 rounded border disabled:opacity-30" style={{ borderColor: "#38373C" }} aria-label="Previous page">
          <ChevronLeft size={14} />
        </button>
        <span className="px-1" style={{ fontFamily: "JetBrains Mono, monospace" }}>{page} / {totalPages}</span>
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="p-1.5 rounded border disabled:opacity-30" style={{ borderColor: "#38373C" }} aria-label="Next page">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

const ROLE_TABS = {
  admin: ["dashboard", "inventory", "newbill", "bills", "purchases", "expenses", "suppliers", "customers", "pnl", "users", "auditlog"],
  biller: ["newbill", "bills"],
  inventory: ["inventory", "purchases"],
};
const ROLE_LABELS = { admin: "Admin", biller: "Biller", inventory: "Inventory" };

export default function TextileShopManager({ currentUser, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [shopName, setShopName] = useState("Crowned Clothing");
  const [gstin, setGstin] = useState("33CBAPB0449K1Z3");
  const [printWidth, setPrintWidth] = useState("80");
  const [editingShopName, setEditingShopName] = useState(false);
  const [editingGstin, setEditingGstin] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [bills, setBills] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [payments, setPayments] = useState([]);
  const allowedTabs = ROLE_TABS[currentUser?.role] || ROLE_TABS.admin;
  const [tab, setTab] = useState(allowedTabs[0]);

  useEffect(() => {
    if (!allowedTabs.includes(tab)) setTab(allowedTabs[0]);
  }, [currentUser?.role]);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      const keys = [
        ["inventory", setInventory],
        ["bills", setBills],
        ["purchases", setPurchases],
        ["expenses", setExpenses],
        ["suppliers", setSuppliers],
        ["payments", setPayments],
      ];
      try {
        const results = await Promise.allSettled(
          keys.map(([k]) => window.storage.get(k))
        );
        results.forEach((r, idx) => {
          if (r.status === "fulfilled" && r.value) {
            const key = keys[idx][0];
            const parsed = JSON.parse(r.value.value);
            if (key === "inventory" && Array.isArray(parsed)) {
              // Backfill createdAt for legacy rows that predate it, preserving their
              // existing (mostly newest-first) order so "latest first" sorting doesn't
              // shuffle historical stock around the first time this loads.
              const migrated = parsed.map((it, i) => {
                const norm = normalizeInventoryItem(it);
                return norm.createdAt ? norm : { ...norm, createdAt: Date.now() - i };
              });
              keys[idx][1](migrated);
              const needsMigration = parsed.some(
                (i) => i.productType == null || i.pricePerUnit == null || i.stockQty == null || i.createdAt == null
              );
              if (needsMigration) persist("inventory", migrated);
            } else {
              keys[idx][1](parsed);
            }
          }
        });
        const name = await window.storage.get("shop-name").catch(() => null);
        if (name) setShopName(JSON.parse(name.value));
        const gst = await window.storage.get("gstin").catch(() => null);
        if (gst) setGstin(JSON.parse(gst.value));
        const pw = await window.storage.get("print-width").catch(() => null);
        if (pw) setPrintWidth(JSON.parse(pw.value));
      } catch (e) {
        // fresh install
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (key, value) => {
    try {
      const res = await window.storage.set(key, JSON.stringify(value));
      if (!res) setSaveError("Couldn't save — please try again.");
      else setSaveError("");
    } catch (e) {
      setSaveError("Couldn't save — please try again.");
    }
  };

  const updateInventory = (next) => { setInventory(next); persist("inventory", next); };
  const updateBills = (next) => { setBills(next); persist("bills", next); };
  const updatePurchases = (next) => { setPurchases(next); persist("purchases", next); };
  const updateExpenses = (next) => { setExpenses(next); persist("expenses", next); };
  const updateSuppliers = (next) => { setSuppliers(next); persist("suppliers", next); };
  const updatePayments = (next) => { setPayments(next); persist("payments", next); };
  const updateShopName = (next) => { setShopName(next); persist("shop-name", next); };
  const updateGstin = (next) => { setGstin(next); persist("gstin", next); };
  const updatePrintWidth = (next) => { setPrintWidth(next); persist("print-width", next); };

  // ---------- derived ----------
  const stockValue = useMemo(
    () => inventory.reduce((s, i) => s + i.pricePerUnit * i.stockQty, 0),
    [inventory]
  );
  const totalMeters = useMemo(
    () => inventory.filter((i) => i.productType === "fabric").reduce((s, i) => s + Number(i.stockQty), 0),
    [inventory]
  );
  const totalPieces = useMemo(
    () => inventory.filter((i) => i.productType === "readymade").reduce((s, i) => s + Number(i.stockQty), 0),
    [inventory]
  );
  const lowStock = useMemo(() => inventory.filter((i) => i.stockQty <= i.lowStockThreshold), [inventory]);
  const todayStr = new Date().toDateString();
  const billsToday = useMemo(() => bills.filter((b) => new Date(b.date).toDateString() === todayStr), [bills, todayStr]);
  const revenueToday = useMemo(() => billsToday.reduce((s, b) => s + b.total, 0), [billsToday]);

  const customers = useMemo(() => {
    const map = {};
    bills.forEach((b) => {
      const key = b.customerPhone || b.customerName;
      if (!key) return;
      if (!map[key]) map[key] = { name: b.customerName, phone: b.customerPhone, orders: [], total: 0 };
      map[key].orders.push(b);
      map[key].total += b.total;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bills]);

  const supplierBalances = useMemo(() => {
    const map = {};
    suppliers.forEach((s) => { map[s.id] = { ...s, totalPurchased: 0, totalPaid: 0 }; });
    purchases.forEach((p) => {
      if (map[p.supplierId]) map[p.supplierId].totalPurchased += p.totalAmount;
    });
    payments.forEach((pay) => {
      if (map[pay.supplierId]) map[pay.supplierId].totalPaid += pay.amount;
    });
    return Object.values(map).map((s) => ({ ...s, balanceDue: s.totalPurchased - s.totalPaid }));
  }, [suppliers, purchases, payments]);

  const totalPayables = useMemo(
    () => supplierBalances.reduce((s, sup) => s + sup.balanceDue, 0),
    [supplierBalances]
  );

  const paidDueMap = useMemo(() => allocatePaymentsToPurchases(purchases, payments), [purchases, payments]);

  const backupAll = () => {
    downloadJSON(`${shopName.replace(/\s+/g, "_")}_backup_${todayISO()}.json`, {
      shopName, inventory, bills, purchases, expenses, suppliers, payments,
      exportedAt: new Date().toISOString(),
    });
  };

  const [importError, setImportError] = useState("");
  const importAll = (file) => {
    setImportError("");
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (e) {
        setImportError("That file isn't valid JSON — please pick a backup exported from this app.");
        return;
      }
      const hasAnyKnownField = ["inventory", "bills", "purchases", "expenses", "suppliers", "payments", "shopName"].some((k) => k in data);
      if (!hasAnyKnownField) {
        setImportError("That file doesn't look like a shop backup.");
        return;
      }
      const ok = window.confirm(
        "This will replace all current data in the app with the contents of this file. This can't be undone. Continue?"
      );
      if (!ok) return;

      const nextInventory = Array.isArray(data.inventory) ? data.inventory.map(normalizeInventoryItem) : inventory;
      const nextBills = Array.isArray(data.bills) ? data.bills : bills;
      const nextPurchases = Array.isArray(data.purchases) ? data.purchases : purchases;
      const nextExpenses = Array.isArray(data.expenses) ? data.expenses : expenses;
      const nextSuppliers = Array.isArray(data.suppliers) ? data.suppliers : suppliers;
      const nextPayments = Array.isArray(data.payments) ? data.payments : payments;
      const nextShopName = typeof data.shopName === "string" && data.shopName.trim() ? data.shopName : shopName;

      updateInventory(nextInventory);
      updateBills(nextBills);
      updatePurchases(nextPurchases);
      updateExpenses(nextExpenses);
      updateSuppliers(nextSuppliers);
      updatePayments(nextPayments);
      updateShopName(nextShopName);
    };
    reader.onerror = () => setImportError("Couldn't read that file — please try again.");
    reader.readAsText(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.khadi }}>
        <p style={{ fontFamily: "Fraunces, serif", color: COLORS.ink }}>Opening the ledger…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: `linear-gradient(rgba(24,24,27,0.94), rgba(24,24,27,0.94)), url(${logoWatermark})`,
        backgroundSize: "auto, 460px",
        backgroundPosition: "center, center 160px",
        backgroundRepeat: "no-repeat, no-repeat",
        backgroundAttachment: "scroll, fixed",
        color: COLORS.ink,
        fontFamily: "Inter, sans-serif",
      }}
    >
      <style>{`
        @import url('${FONT_IMPORT_URL}');
        input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), select, textarea {
          background-color: #1B1B1E;
          color: #F2F0EA;
        }
        input::placeholder, textarea::placeholder { color: #6B6A66; }
        select option { background-color: #1B1B1E; color: #F2F0EA; }
        input[type="checkbox"] { accent-color: ${COLORS.indigo}; }
      `}</style>

      <header className="px-6 pt-6 pb-0 sticky top-0 z-20" style={{ background: COLORS.khadi }}>
        <div className="flex items-end justify-between mb-4">
          <div className="flex items-center gap-3">
            <img
              src={logoIcon}
              alt="Shop logo"
              className="rounded-lg flex-shrink-0"
              style={{ width: 44, height: 49, objectFit: "cover" }}
            />
            <div>
            {editingShopName ? (
              <input
                autoFocus
                value={shopName}
                onChange={(e) => updateShopName(e.target.value)}
                onBlur={() => setEditingShopName(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingShopName(false)}
                className="text-2xl bg-transparent border-b outline-none"
                style={{ fontFamily: "Fraunces, serif", color: COLORS.ink, borderColor: COLORS.madder }}
              />
            ) : (
              <h1
                className="text-2xl cursor-pointer"
                style={{ fontFamily: "Fraunces, serif", color: COLORS.ink }}
                onClick={() => setEditingShopName(true)}
                title="Click to rename"
              >
                {shopName}
              </h1>
            )}
            {editingGstin ? (
              <input
                autoFocus
                value={gstin}
                onChange={(e) => updateGstin(e.target.value.toUpperCase())}
                onBlur={() => setEditingGstin(false)}
                onKeyDown={(e) => e.key === "Enter" && setEditingGstin(false)}
                className="text-xs bg-transparent border-b outline-none mt-0.5"
                style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.ink, borderColor: COLORS.madder }}
              />
            ) : (
              <p
                className="text-xs cursor-pointer mt-0.5"
                style={{ fontFamily: "JetBrains Mono, monospace", color: "#A6A39B" }}
                onClick={() => setEditingGstin(true)}
                title="Click to edit GSTIN"
              >
                GSTIN: {gstin || "—"}
              </p>
            )}
            <p className="text-xs mt-1" style={{ color: "#A6A39B" }}>
              Stock, billing, purchases and accounts — kept on this device
            </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-lg" style={{ background: COLORS.khadi, color: COLORS.ink }}>
                {currentUser?.name} · {ROLE_LABELS[currentUser?.role] || currentUser?.role}
              </span>
              <button
                onClick={onLogout}
                title="Log out"
                className="flex items-center gap-1 px-2 py-1 rounded-lg border"
                style={{ borderColor: "#47454B", color: COLORS.madder }}
              >
                <LogOut size={12} /> Log out
              </button>
            </div>
            <div className="flex items-center gap-2">
              {saveError && <p className="text-xs" style={{ color: COLORS.madder }}>{saveError}</p>}
              <button
                onClick={backupAll}
                title="Download a full backup of all data (JSON)"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "#47454B", color: COLORS.ink }}
              >
                <Download size={13} /> Backup all data
              </button>
              <label
                title="Restore data from a backup JSON file"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer"
                style={{ borderColor: "#47454B", color: COLORS.ink }}
              >
                <Upload size={13} /> Import data
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) importAll(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {importError && <p className="text-xs" style={{ color: COLORS.madder }}>{importError}</p>}
          </div>
        </div>
        <nav className="flex gap-1 flex-wrap overflow-x-auto">
          {allowedTabs.includes("dashboard") && <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")} icon={LayoutDashboard} label="Dashboard" />}
          {allowedTabs.includes("inventory") && <TabButton active={tab === "inventory"} onClick={() => setTab("inventory")} icon={Boxes} label="Inventory" />}
          {allowedTabs.includes("newbill") && <TabButton active={tab === "newbill"} onClick={() => setTab("newbill")} icon={Receipt} label="New Bill" />}
          {allowedTabs.includes("bills") && <TabButton active={tab === "bills"} onClick={() => setTab("bills")} icon={ScrollText} label="Bills" />}
          {allowedTabs.includes("purchases") && <TabButton active={tab === "purchases"} onClick={() => setTab("purchases")} icon={ShoppingCart} label="Purchases" />}
          {allowedTabs.includes("expenses") && <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")} icon={Wallet} label="Expenses" />}
          {allowedTabs.includes("suppliers") && <TabButton active={tab === "suppliers"} onClick={() => setTab("suppliers")} icon={Building2} label="Suppliers" />}
          {allowedTabs.includes("customers") && <TabButton active={tab === "customers"} onClick={() => setTab("customers")} icon={Users} label="Customers" />}
          {allowedTabs.includes("pnl") && <TabButton active={tab === "pnl"} onClick={() => setTab("pnl")} icon={TrendingUp} label="P&L Report" />}
          {allowedTabs.includes("users") && <TabButton active={tab === "users"} onClick={() => setTab("users")} icon={UserCog} label="Users" />}
          {allowedTabs.includes("auditlog") && <TabButton active={tab === "auditlog"} onClick={() => setTab("auditlog")} icon={History} label="Audit Log" />}
        </nav>
      </header>

      <main
        className="p-6 rounded-tl-none"
        style={{
          background: `linear-gradient(rgba(35,34,39,0.95), rgba(35,34,39,0.95)), url(${logoWatermark})`,
          backgroundSize: "auto, 520px",
          backgroundPosition: "center, center",
          backgroundRepeat: "no-repeat, no-repeat",
          backgroundAttachment: "scroll, fixed",
          minHeight: "calc(100vh - 110px)",
        }}
      >
        {tab === "dashboard" && (
          <Dashboard
            stockValue={stockValue}
            totalMeters={totalMeters}
            totalPieces={totalPieces}
            lowStock={lowStock}
            billsToday={billsToday}
            revenueToday={revenueToday}
            totalPayables={totalPayables}
            inventory={inventory}
            onGoInventory={() => setTab("inventory")}
          />
        )}
        {tab === "inventory" && <Inventory inventory={inventory} setInventory={updateInventory} shopName={shopName} />}
        {tab === "newbill" && (
          <NewBill
            inventory={inventory}
            setInventory={updateInventory}
            bills={bills}
            setBills={updateBills}
            onSaved={() => setTab("bills")}
            shopName={shopName}
            gstin={gstin}
            printWidth={printWidth}
            setPrintWidth={updatePrintWidth}
          />
        )}
        {tab === "bills" && (
          <Bills
            bills={bills}
            setBills={updateBills}
            inventory={inventory}
            setInventory={updateInventory}
            shopName={shopName}
            gstin={gstin}
            printWidth={printWidth}
            setPrintWidth={updatePrintWidth}
          />
        )}
        {tab === "purchases" && (
          <Purchases
            purchases={purchases}
            setPurchases={updatePurchases}
            suppliers={suppliers}
            setSuppliers={updateSuppliers}
            payments={payments}
            setPayments={updatePayments}
            inventory={inventory}
            setInventory={updateInventory}
            paidDueMap={paidDueMap}
          />
        )}
        {tab === "expenses" && <Expenses expenses={expenses} setExpenses={updateExpenses} />}
        {tab === "suppliers" && (
          <Suppliers
            supplierBalances={supplierBalances}
            suppliers={suppliers}
            setSuppliers={updateSuppliers}
            purchases={purchases}
            payments={payments}
            setPayments={updatePayments}
            paidDueMap={paidDueMap}
          />
        )}
        {tab === "customers" && <Customers customers={customers} />}
        {tab === "pnl" && (
          <ProfitLoss
            bills={bills}
            expenses={expenses}
            purchases={purchases}
            payments={payments}
            totalPayables={totalPayables}
          />
        )}
        {tab === "users" && <UsersAdmin currentUser={currentUser} />}
        {tab === "auditlog" && <AuditLogView />}
      </main>
    </div>
  );
}

// ---------------- Dashboard ----------------
function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4 border" style={{ borderColor: "#38373C", background: COLORS.khadi }}>
      <p className="text-xs mb-1" style={{ color: "#A6A39B" }}>{label}</p>
      <p className="text-2xl" style={{ fontFamily: "Fraunces, serif", color: accent || COLORS.ink }}>{value}</p>
    </div>
  );
}

function Dashboard({ stockValue, totalMeters, totalPieces, lowStock, billsToday, revenueToday, totalPayables, inventory, onGoInventory }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Stock value" value={money(stockValue)} accent={COLORS.indigo} />
        <StatCard label="Fabric in stock" value={totalMeters.toLocaleString("en-IN") + " m"} />
        <StatCard label="Readymade in stock" value={totalPieces.toLocaleString("en-IN") + " pc"} />
        <StatCard label="Bills today" value={billsToday.length} />
        <StatCard label="Revenue today" value={money(revenueToday)} accent={COLORS.madder} />
        <StatCard label="Owed to suppliers" value={money(totalPayables)} accent={totalPayables > 0 ? COLORS.madder : COLORS.green} />
      </div>

      <div>
        <h3 className="text-sm mb-2 flex items-center gap-2" style={{ color: COLORS.ink }}>
          <AlertTriangle size={16} style={{ color: COLORS.turmeric }} /> Running low
        </h3>
        {inventory.length === 0 ? (
          <EmptyState title="No stock added yet" body="Add fabric or readymade items in the Inventory tab to see stock alerts here." />
        ) : lowStock.length === 0 ? (
          <p className="text-sm" style={{ color: "#A6A39B" }}>Everything is comfortably stocked.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {lowStock.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-lg px-3 py-2 border" style={{ borderColor: "#38373C" }}>
                <span className="text-sm flex items-center gap-2">{i.name} <ProductTypeBadge productType={i.productType} /></span>
                <span className="text-xs font-medium" style={{ color: COLORS.madder }}>{i.stockQty} {unitFor(i)} left</span>
              </div>
            ))}
          </div>
        )}
        {inventory.length === 0 && (
          <button onClick={onGoInventory} className="mt-3 text-sm px-4 py-2 rounded-lg text-white" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
            Go to Inventory
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- Inventory ----------------
// ---------------- Barcode + price-tag labels ----------------
// Code128 (subset B) encoder - the standard symbology every barcode scanner
// reads. Table taken verbatim from the jsbarcode reference implementation
// (each entry's digits are the black(1)/white(0) modules of one symbol).
const CODE128_BARS = [
  11011001100, 11001101100, 11001100110, 10010011000, 10010001100,
  10001001100, 10011001000, 10011000100, 10001100100, 11001001000,
  11001000100, 11000100100, 10110011100, 10011011100, 10011001110,
  10111001100, 10011101100, 10011100110, 11001110010, 11001011100,
  11001001110, 11011100100, 11001110100, 11101101110, 11101001100,
  11100101100, 11100100110, 11101100100, 11100110100, 11100110010,
  11011011000, 11011000110, 11000110110, 10100011000, 10001011000,
  10001000110, 10110001000, 10001101000, 10001100010, 11010001000,
  11000101000, 11000100010, 10110111000, 10110001110, 10001101110,
  10111011000, 10111000110, 10001110110, 11101110110, 11010001110,
  11000101110, 11011101000, 11011100010, 11011101110, 11101011000,
  11101000110, 11100010110, 11101101000, 11101100010, 11100011010,
  11101111010, 11001000010, 11110001010, 10100110000, 10100001100,
  10010110000, 10010000110, 10000101100, 10000100110, 10110010000,
  10110000100, 10011010000, 10011000010, 10000110100, 10000110010,
  11000010010, 11001010000, 11110111010, 11000010100, 10001111010,
  10100111100, 10010111100, 10010011110, 10111100100, 10011110100,
  10011110010, 11110100100, 11110010100, 11110010010, 11011011110,
  11011110110, 11110110110, 10101111000, 10100011110, 10001011110,
  10111101000, 10111100010, 11110101000, 11110100010, 10111011110,
  10111101110, 11101011110, 11110101110, 11010000100, 11010010000,
  11010011100, 1100011101011,
];

function encodeCode128B(text) {
  const START_B = 104, STOP = 106, MODULO = 103;
  const codes = String(text).split("").map((c) => c.charCodeAt(0));
  if (codes.length === 0 || !codes.every((c) => c >= 32 && c <= 126)) {
    throw new Error("Barcode supports printable ASCII characters only");
  }
  const values = codes.map((c) => c - 32);
  let checksum = START_B;
  values.forEach((v, i) => { checksum += v * (i + 1); });
  checksum %= MODULO;
  return [START_B, ...values, checksum, STOP].map((s) => CODE128_BARS[s].toString()).join("");
}

// Scannable barcode as inline SVG, with the quiet zone scanners need.
function BarcodeSVG({ value, height = 40 }) {
  let bits;
  try {
    bits = encodeCode128B(value);
  } catch {
    return <div style={{ fontSize: 10, color: "#b00" }}>Invalid barcode value</div>;
  }
  const quiet = 10;
  const total = bits.length + quiet * 2;
  const rects = [];
  for (let i = 0; i < bits.length; ) {
    if (bits[i] === "1") {
      let j = i;
      while (j < bits.length && bits[j] === "1") j++;
      rects.push(<rect key={i} x={quiet + i} y={0} width={j - i} height={height} fill="#000" />);
      i = j;
    } else i++;
  }
  return (
    <svg viewBox={`0 0 ${total} ${height}`} preserveAspectRatio="none" shapeRendering="crispEdges"
      style={{ width: "100%", height: "100%", display: "block" }}>
      <rect x="0" y="0" width={total} height={height} fill="#fff" />
      {rects}
    </svg>
  );
}

// 12-digit numeric code not already used by any item.
function generateUniqueBarcode(existing = []) {
  const used = new Set(existing.filter(Boolean));
  for (let n = 0; n < 50; n++) {
    const code = String(Math.floor(1e11 + Math.random() * 9e11));
    if (!used.has(code)) return code;
  }
  return String(Date.now()) + String(Math.floor(Math.random() * 100)).padStart(2, "0");
}

const LABEL_SIZES = [
  { id: "50x30", w: 50, h: 30, label: "50 × 30 mm — standard tag" },
  { id: "38x25", w: 38, h: 25, label: "38 × 25 mm — small tag" },
  { id: "65x40", w: 65, h: 40, label: "65 × 40 mm — large tag" },
];

function LabelCard({ item, shopName, size }) {
  const k = size.h / 30; // scale type and barcode with the label height
  const unit = unitFor(item);
  const details = [
    categoryMetaFor(item.productType)[item.category]?.label,
    item.productType === "readymade" && item.size ? `Size ${item.size}` : "",
    item.unitMode === "set" ? `${item.setSizeMeters || DEFAULT_SET_SIZE_METERS}m set` : "",
    item.color,
  ].filter(Boolean).join(" · ");
  const price = money(item.pricePerUnit) + (unit === "pc" ? "" : `/${unit}`);
  const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  return (
    <div className="label-card" style={{
      width: `${size.w}mm`, height: `${size.h}mm`, boxSizing: "border-box", padding: `${1.2 * k}mm`,
      border: "0.15mm dashed #999", background: "#fff", color: "#000", display: "flex",
      flexDirection: "column", overflow: "hidden", fontFamily: "Inter, Arial, sans-serif",
      lineHeight: 1.15, breakInside: "avoid",
    }}>
      <div style={{ fontSize: `${5.5 * k}pt`, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center", ...ellipsis }}>{shopName}</div>
      <div style={{ fontSize: `${8 * k}pt`, fontWeight: 700, ...ellipsis }}>{item.name}</div>
      {details && <div style={{ fontSize: `${5.5 * k}pt`, color: "#333", ...ellipsis }}>{details}</div>}
      <div style={{ fontSize: `${13 * k}pt`, fontWeight: 800 }}>{price}</div>
      <div style={{ height: `${8 * k}mm`, marginTop: "auto" }}><BarcodeSVG value={item.barcode} /></div>
      <div style={{ fontSize: `${6 * k}pt`, fontFamily: "'JetBrains Mono', monospace", textAlign: "center", letterSpacing: "0.08em" }}>{item.barcode}</div>
    </div>
  );
}

function LabelPrintModal({ item, shopName, onClose, onGenerateBarcode }) {
  const [sizeId, setSizeId] = useState("50x30");
  const [copies, setCopies] = useState(1);
  const size = LABEL_SIZES.find((s) => s.id === sizeId);
  const n = Math.max(1, Math.min(500, Math.floor(Number(copies)) || 1));
  const hasBarcode = !!(item.barcode && String(item.barcode).trim());
  const stockCopies = item.productType === "readymade" ? Math.floor(item.stockQty) : 0;

  // The printable sheet is rendered straight into <body> so that, when
  // printing, everything else can be hidden without leaving blank pages.
  const sheet = hasBarcode
    ? createPortal(
        <div id="printable-labels-portal">
          <div style={{ display: "flex", flexWrap: "wrap", alignContent: "flex-start" }}>
            {Array.from({ length: n }).map((_, i) => (
              <div key={i} style={{ margin: "0.5mm" }}><LabelCard item={item} shopName={shopName} size={size} /></div>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 8mm; }
        #printable-labels-portal { display: none; background: #fff; }
        @media print {
          body > *:not(#printable-labels-portal) { display: none !important; }
          #printable-labels-portal { display: block !important; }
        }
      `}</style>
      <Modal onClose={onClose} maxWidth="max-w-md">
        <div className="flex justify-between items-center">
          <h3 style={{ fontFamily: "Fraunces, serif" }} className="flex items-center gap-2"><Tag size={16} /> Print price tags</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-sm" style={{ color: "#A6A39B" }}>{item.name}</p>

        {hasBarcode ? (
          <div className="flex justify-center rounded-lg py-3" style={{ background: "#2a2a2e" }}>
            <LabelCard item={item} shopName={shopName} size={size} />
          </div>
        ) : (
          <div className="rounded-lg border p-3 space-y-2 text-sm" style={{ borderColor: "#38373C" }}>
            <p>This item has no barcode yet. Generate one so the tag can be scanned at billing.</p>
            <button onClick={() => onGenerateBarcode(item)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
              Generate barcode
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs" style={{ color: "#A6A39B" }}>Tag size</label>
            <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm outline-none mt-1" style={inputStyle}>
              {LABEL_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs" style={{ color: "#A6A39B" }}>Number of tags</label>
            <input type="number" min="1" max="500" value={copies} onChange={(e) => setCopies(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mt-1" style={inputStyle} />
          </div>
        </div>
        {stockCopies > 0 && (
          <button onClick={() => setCopies(stockCopies)} className="text-xs underline" style={{ color: COLORS.indigo }}>
            One tag per piece in stock ({stockCopies})
          </button>
        )}
        <p className="text-xs" style={{ color: "#A6A39B" }}>Prints {n} tag{n > 1 ? "s" : ""} on A4 — cut along the dotted lines.</p>
        <button onClick={() => window.print()} disabled={!hasBarcode}
          className="w-full py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
          <Printer size={14} /> Print tags
        </button>
      </Modal>
      {sheet}
    </>
  );
}

function Inventory({ inventory, setInventory, shopName }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCat, setFilterCat] = useState("all");

  const emptyForm = {
    productType: "fabric",
    name: "",
    barcode: "",
    category: "cotton",
    color: "",
    size: "Free size",
    unitMode: "meter",
    setSizeMeters: DEFAULT_SET_SIZE_METERS,
    pricePerUnit: "",
    costPerUnit: "",
    stockQty: "",
    lowStockThreshold: 10,
  };
  const [form, setForm] = useState(emptyForm);

  const filtered = inventory
    .filter((i) => {
      const matchesQuery = (i.name + (i.color || "") + (i.barcode || "")).toLowerCase().includes(query.toLowerCase());
      const matchesType = filterType === "all" || i.productType === filterType;
      const matchesCat = filterCat === "all" || i.category === filterCat;
      return matchesQuery && matchesType && matchesCat;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // latest-added/updated stock first

  const { page, setPage, totalPages, paged } = usePagination(filtered);

  const openAdd = (productType) => {
    setForm({ ...emptyForm, productType, category: productType === "readymade" ? "shirt" : "cotton", lowStockThreshold: productType === "readymade" ? 3 : 10 });
    setEditId(null);
    setShowForm(true);
  };
  const openEdit = (item) => { setForm({ costPerUnit: "", unitMode: "meter", setSizeMeters: DEFAULT_SET_SIZE_METERS, barcode: "", ...item }); setEditId(item.id); setShowForm(true); };
  const [labelItemId, setLabelItemId] = useState(null);
  const labelItem = labelItemId ? inventory.find((i) => i.id === labelItemId) : null;
  const generateBarcodeFor = (item) => {
    const code = generateUniqueBarcode(inventory.map((i) => i.barcode));
    setInventory(inventory.map((i) => (i.id === item.id ? { ...i, barcode: code } : i)));
  };

  const save = () => {
    if (!form.name.trim() || !form.pricePerUnit || form.stockQty === "") return;
    const isSetFabric = form.productType === "fabric" && form.unitMode === "set";
    const record = {
      ...form,
      id: editId || uid(),
      barcode: (form.barcode || "").trim() || generateUniqueBarcode(inventory.map((i) => i.barcode)),
      unitMode: form.productType === "fabric" && form.unitMode === "set" ? "set" : "meter",
      setSizeMeters: isSetFabric ? Number(form.setSizeMeters) || DEFAULT_SET_SIZE_METERS : undefined,
      pricePerUnit: Number(form.pricePerUnit),
      costPerUnit: Number(form.costPerUnit || 0),
      stockQty: Number(form.stockQty),
      lowStockThreshold: Number(form.lowStockThreshold) || 0,
      createdAt: editId ? (form.createdAt || Date.now()) : Date.now(),
    };
    if (editId) setInventory(inventory.map((i) => (i.id === editId ? record : i)));
    else setInventory([record, ...inventory]);
    setShowForm(false);
  };
  const remove = (id) => setInventory(inventory.filter((i) => i.id !== id));

  const catOptions = filterType === "readymade" ? GARMENT_CATEGORIES : filterType === "fabric" ? FABRIC_CATEGORIES : { ...FABRIC_CATEGORIES, ...GARMENT_CATEGORIES };
  const formCatMeta = categoryMetaFor(form.productType);

  return (
    <div className="space-y-4">
      {labelItem && <LabelPrintModal item={labelItem} shopName={shopName} onClose={() => setLabelItemId(null)} onGenerateBarcode={generateBarcodeFor} />}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center flex-1 min-w-[200px] flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#A6A39B" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or color"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          </div>
          <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterCat("all"); }}
            className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
            <option value="all">Fabric + Readymade</option>
            <option value="fabric">Fabric only</option>
            <option value="readymade">Readymade only</option>
          </select>
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
            <option value="all">All categories</option>
            {Object.entries(catOptions).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openAdd("fabric")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
            <Plus size={16} /> Fabric
          </button>
          <button onClick={() => openAdd("readymade")} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white" style={{ background: COLORS.madder }}>
            <Plus size={16} /> Readymade
          </button>
        </div>
      </div>

      {inventory.length === 0 ? (
        <EmptyState title="No stock yet" body="Add fabric sold by the meter, or readymade garments sold by the piece — or bring stock in from the Purchases tab." />
      ) : filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "#A6A39B" }}>No matches for that search.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: COLORS.khadi }}>
              <th className="text-left px-3 py-2 font-medium"></th>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Category / Details</th>
              <th className="text-left px-3 py-2 font-medium">Barcode</th>
              <th className="text-right px-3 py-2 font-medium">Stock</th>
              <th className="text-right px-3 py-2 font-medium">Cost (incl. GST)</th>
              <th className="text-right px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-t hover:bg-white/5" style={{ borderColor: "#38373C" }}>
                  <td className="pl-3 py-2">
                    <span className="relative inline-block w-3 h-3 rounded-sm overflow-hidden align-middle">
                      <Swatch category={item.category} productType={item.productType} />
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ fontFamily: "Fraunces, serif", color: COLORS.ink }}>{item.name}</td>
                  <td className="px-3 py-2"><ProductTypeBadge productType={item.productType} /></td>
                  <td className="px-3 py-2" style={{ color: "#A6A39B" }}>
                    {categoryMetaFor(item.productType)[item.category]?.label}
                    {item.productType === "readymade" && item.size ? ` · ${item.size}` : ""}
                    {item.unitMode === "set" ? ` · ${item.setSizeMeters || DEFAULT_SET_SIZE_METERS}m set` : ""}
                    {item.color ? ` · ${item.color}` : ""}
                  </td>
                  <td className="px-3 py-2" style={{ color: "#A6A39B", fontFamily: "JetBrains Mono, monospace" }}>
                    {item.barcode ? (
                      <span className="flex items-center gap-1"><Barcode size={11} /> {item.barcode}</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace", color: item.stockQty <= item.lowStockThreshold ? COLORS.madder : COLORS.ink }}>
                    {item.stockQty} {unitFor(item)}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace", color: "#A6A39B" }}>
                    {item.costPerUnit ? `${money(item.costPerUnit)}/${unitFor(item)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.indigo }}>
                    {money(item.pricePerUnit)}/{unitFor(item)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setLabelItemId(item.id)} className="p-1" title="Print price tag"><Tag size={14} style={{ color: COLORS.indigo }} /></button>
                      <button onClick={() => openEdit(item)} className="p-1"><Pencil size={14} style={{ color: "#A6A39B" }} /></button>
                      <button onClick={() => remove(item.id)} className="p-1"><Trash2 size={14} style={{ color: COLORS.madder }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationBar page={page} setPage={setPage} totalPages={totalPages} totalItems={filtered.length} />
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }} className="flex items-center gap-2">
              {editId ? "Edit" : "Add"} <ProductTypeBadge productType={form.productType} />
            </h3>
            <button onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          {!editId && (
            <div className="flex gap-2 text-xs">
              <button onClick={() => setForm({ ...form, productType: "fabric", category: "cotton" })}
                className="flex-1 py-1.5 rounded-lg border"
                style={{ borderColor: form.productType === "fabric" ? COLORS.indigo : "#38373C", background: form.productType === "fabric" ? "#2E2C3A" : "transparent" }}>
                Fabric (by meter)
              </button>
              <button onClick={() => setForm({ ...form, productType: "readymade", category: "shirt" })}
                className="flex-1 py-1.5 rounded-lg border"
                style={{ borderColor: form.productType === "readymade" ? COLORS.madder : "#38373C", background: form.productType === "readymade" ? "#3A3226" : "transparent" }}>
                Readymade (by piece)
              </button>
            </div>
          )}
          <input placeholder={form.productType === "readymade" ? "Name (e.g. Cotton Formal Shirt)" : "Name (e.g. Kanchi Cotton)"}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <div className="relative">
            <Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#A6A39B" }} />
            <input placeholder="Barcode (auto-generated if left blank)"
              value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              className="w-full pl-9 pr-20 py-2 rounded-lg border text-sm outline-none" style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }} />
            <button type="button" onClick={() => setForm({ ...form, barcode: generateUniqueBarcode(inventory.map((i) => i.barcode)) })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded" style={{ color: COLORS.indigo }}>Generate</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
              {Object.entries(formCatMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {form.productType === "readymade" ? (
              <select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })}
                className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input placeholder="Color (e.g. Maroon)" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
            )}
          </div>
          {form.productType === "readymade" && (
            <input placeholder="Color (optional)" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          )}
          {form.productType === "fabric" && (
            <div className="rounded-lg border p-2 space-y-2" style={{ borderColor: "#38373C" }}>
              <p className="text-xs" style={{ color: "#A6A39B" }}>Sold as</p>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => setForm({ ...form, unitMode: "meter" })}
                  className="flex-1 py-1.5 rounded-lg border"
                  style={{ borderColor: form.unitMode !== "set" ? COLORS.indigo : "#38373C", background: form.unitMode !== "set" ? "#2E2C3A" : "transparent" }}>
                  Loose meters
                </button>
                <button type="button" onClick={() => setForm({ ...form, unitMode: "set", setSizeMeters: form.setSizeMeters || DEFAULT_SET_SIZE_METERS })}
                  className="flex-1 py-1.5 rounded-lg border"
                  style={{ borderColor: form.unitMode === "set" ? COLORS.madder : "#38373C", background: form.unitMode === "set" ? "#3A3226" : "transparent" }}>
                  Fixed-size set (e.g. Chudithar)
                </button>
              </div>
              {form.unitMode === "set" && (
                <div>
                  <label className="text-xs" style={{ color: "#A6A39B" }}>Meters per set</label>
                  <input type="number" min="0" step="0.1" value={form.setSizeMeters}
                    onChange={(e) => setForm({ ...form, setSizeMeters: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none mt-1" style={inputStyle} />
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" placeholder={`Selling price/${unitLabelFor(form)} (₹)`}
              value={form.pricePerUnit} onChange={(e) => setForm({ ...form, pricePerUnit: e.target.value })}
              className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
            <input type="number" min="0" placeholder="Cost price incl. GST (optional)"
              value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })}
              className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          </div>
          <input type="number" min="0" placeholder={`Stock (${unitFor(form)})`}
            value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <div>
            <label className="text-xs" style={{ color: "#A6A39B" }}>Low stock alert below ({unitFor(form)})</label>
            <input type="number" min="0" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mt-1" style={inputStyle} />
          </div>
          <button onClick={save} className="w-full py-2 rounded-lg text-white text-sm mt-1" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
            {editId ? "Save changes" : "Add to inventory"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ---------------- New Bill ----------------
function NewBill({ inventory, setInventory, bills, setBills, onSaved, shopName, gstin, printWidth, setPrintWidth }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [nameAutoFilled, setNameAutoFilled] = useState(false);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [query, setQuery] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeMsg, setBarcodeMsg] = useState("");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState(5);
  const [savedBill, setSavedBill] = useState(null);

  // Known customers derived from past bills, most recent name per phone wins.
  const knownCustomers = useMemo(() => {
    const map = {};
    bills.forEach((b) => {
      const phone = (b.customerPhone || "").trim();
      if (!phone) return;
      if (!map[phone]) map[phone] = { phone, name: b.customerName };
    });
    return Object.values(map);
  }, [bills]);

  const phoneSuggestions = useMemo(() => {
    const digits = customerPhone.trim();
    if (digits.length < 3) return [];
    return knownCustomers.filter((c) => c.phone.includes(digits)).slice(0, 5);
  }, [customerPhone, knownCustomers]);

  const handlePhoneChange = (value) => {
    setCustomerPhone(value);
    setShowPhoneSuggestions(true);
    const exact = knownCustomers.find((c) => c.phone === value.trim());
    if (exact && (customerName.trim() === "" || nameAutoFilled)) {
      setCustomerName(exact.name);
      setNameAutoFilled(true);
    }
  };

  const selectPhoneSuggestion = (c) => {
    setCustomerPhone(c.phone);
    setCustomerName(c.name);
    setNameAutoFilled(true);
    setShowPhoneSuggestions(false);
  };

  const handleNameChange = (value) => {
    setCustomerName(value);
    setNameAutoFilled(false);
  };

  const matches = query
    ? inventory.filter((i) => (i.name + (i.color || "") + (i.barcode || "")).toLowerCase().includes(query.toLowerCase()))
    : [];

  const addToCart = (item) => {
    const existing = cart.find((c) => c.itemId === item.id);
    if (existing) {
      setCart(cart.map((c) => (c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      setCart([...cart, {
        itemId: item.id, name: item.name, productType: item.productType,
        unit: unitFor(item), qty: 1, price: item.pricePerUnit, originalPrice: item.pricePerUnit,
        costAtSale: Number(item.costPerUnit || 0), maxStock: item.stockQty,
      }]);
    }
    setQuery("");
  };

  const handleBarcodeScan = (e) => {
    if (e.key !== "Enter") return;
    const code = barcodeInput.trim();
    if (!code) return;
    const match = inventory.find((i) => i.barcode && i.barcode === code);
    if (match) {
      addToCart(match);
      setBarcodeMsg(`Added: ${match.name}`);
    } else {
      setBarcodeMsg(`No item found for barcode "${code}"`);
    }
    setBarcodeInput("");
    setTimeout(() => setBarcodeMsg(""), 2500);
  };
  const updateQty = (itemId, qty) => setCart(cart.map((c) => (c.itemId === itemId ? { ...c, qty } : c)));
  const updatePrice = (itemId, price) => setCart(cart.map((c) => (c.itemId === itemId ? { ...c, price } : c)));
  const removeFromCart = (itemId) => setCart(cart.filter((c) => c.itemId !== itemId));

  const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const discAmt = (subtotal * Number(discount || 0)) / 100;
  const afterDiscount = subtotal - discAmt;
  const gstAmt = gstEnabled ? (afterDiscount * Number(gstRate || 0)) / 100 : 0;
  const total = afterDiscount + gstAmt;
  const overStock = cart.find((c) => c.qty > c.maxStock);

  const saveBill = () => {
    if (cart.length === 0 || overStock) return;
    const bill = {
      id: uid(),
      billNumber: "TXT-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + (bills.length + 1).toString().padStart(3, "0"),
      date: new Date().toISOString(),
      customerName: customerName || "Walk-in customer",
      customerPhone,
      items: cart.map((c) => ({ itemId: c.itemId, name: c.name, unit: c.unit, qty: c.qty, price: c.price, originalPrice: c.originalPrice, costAtSale: c.costAtSale, lineTotal: c.qty * c.price })),
      subtotal, discountPercent: Number(discount || 0), gstEnabled, gstRate: Number(gstRate || 0), gstAmount: gstAmt, total,
    };
    setBills([bill, ...bills]);
    setInventory(inventory.map((i) => {
      const line = cart.find((c) => c.itemId === i.id);
      return line ? { ...i, stockQty: i.stockQty - line.qty } : i;
    }));
    setSavedBill(bill);
  };

  if (savedBill) {
    return (
      <BillReceipt
        bill={savedBill}
        shopName={shopName}
        gstin={gstin}
        printWidth={printWidth}
        setPrintWidth={setPrintWidth}
        onDone={() => { setSavedBill(null); setCustomerName(""); setCustomerPhone(""); setNameAutoFilled(false); setCart([]); setDiscount(0); onSaved(); }}
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Customer name" value={customerName} onChange={(e) => handleNameChange(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <div className="relative">
            <input
              placeholder="Phone (optional)"
              value={customerPhone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              onFocus={() => setShowPhoneSuggestions(true)}
              onBlur={() => setTimeout(() => setShowPhoneSuggestions(false), 150)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}
            />
            {showPhoneSuggestions && phoneSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 rounded-lg border shadow-sm max-h-40 overflow-auto" style={{ background: COLORS.thread, borderColor: "#38373C" }}>
                {phoneSuggestions.map((c) => (
                  <button key={c.phone} onClick={() => selectPhoneSuggestion(c)}
                    className="w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-white/5">
                    <span>{c.name}</span>
                    <span style={{ color: "#A6A39B", fontFamily: "JetBrains Mono, monospace" }}>{c.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="relative">
            <Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.madder }} />
            <input
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleBarcodeScan}
              placeholder="Scan barcode (or type it, then press Enter)"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
              style={{ ...inputStyle, fontFamily: "JetBrains Mono, monospace" }}
            />
          </div>
          {barcodeMsg && (
            <p className="text-xs mt-1" style={{ color: barcodeMsg.startsWith("Added") ? COLORS.green : COLORS.madder }}>{barcodeMsg}</p>
          )}
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#A6A39B" }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fabric or readymade item to add"
            className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          {matches.length > 0 && (
            <div className="absolute z-10 w-full mt-1 rounded-lg border shadow-sm max-h-56 overflow-auto" style={{ background: COLORS.thread, borderColor: "#38373C" }}>
              {matches.map((i) => (
                <button key={i.id} onClick={() => addToCart(i)} className="w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-white/5">
                  <span className="flex items-center gap-2">{i.name}<ProductTypeBadge productType={i.productType} />{i.productType === "readymade" && i.size ? <span style={{ color: "#A6A39B" }}>{i.size}</span> : null}{i.unitMode === "set" ? <span style={{ color: "#A6A39B" }}>{i.setSizeMeters || DEFAULT_SET_SIZE_METERS}m set</span> : null}{i.barcode ? <span style={{ color: "#A6A39B", fontFamily: "JetBrains Mono, monospace" }}>#{i.barcode}</span> : null}</span>
                  <span style={{ color: "#A6A39B" }}>{i.stockQty} {unitFor(i)} avail.</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {cart.length === 0 ? (
          <EmptyState title="Cart is empty" body="Search and add fabric or readymade stock above to build this bill." />
        ) : (
          <div className="space-y-2">
            {cart.map((c) => (
              <div key={c.itemId} className="rounded-lg border px-3 py-2" style={{ borderColor: "#38373C" }}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm flex items-center gap-2">{c.name} <ProductTypeBadge productType={c.productType} /></span>
                  <input type="number" min={c.unit === "m" ? "0.5" : "1"} step={c.unit === "m" ? "0.5" : "1"} value={c.qty}
                    onChange={(e) => updateQty(c.itemId, Number(e.target.value))}
                    className="w-16 px-2 py-1 rounded border text-sm text-right"
                    style={{ borderColor: c.qty > c.maxStock ? COLORS.madder : "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
                  <span className="text-xs" style={{ color: "#A6A39B" }}>{c.unit}</span>
                  <button onClick={() => removeFromCart(c.itemId)}><Trash2 size={14} style={{ color: COLORS.madder }} /></button>
                </div>
                <div className="flex items-center gap-2 mt-1.5 pl-0">
                  <span className="text-xs" style={{ color: "#A6A39B" }}>Price/{c.unit}:</span>
                  <input type="number" min="0" value={c.price}
                    onChange={(e) => updatePrice(c.itemId, Number(e.target.value))}
                    className="w-24 px-2 py-1 rounded border text-sm text-right"
                    style={{ borderColor: c.price !== c.originalPrice ? COLORS.turmeric : "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
                  {c.price !== c.originalPrice && (
                    <span className="text-xs" style={{ color: "#A6A39B" }}>
                      (catalog: <span style={{ textDecoration: "line-through" }}>{money(c.originalPrice)}</span>)
                    </span>
                  )}
                  <span className="ml-auto text-sm" style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(c.qty * c.price)}</span>
                </div>
              </div>
            ))}
            {overStock && <p className="text-xs flex items-center gap-1" style={{ color: COLORS.madder }}><AlertTriangle size={13} /> {overStock.name} only has {overStock.maxStock} {overStock.unit} in stock.</p>}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-xl border p-4 space-y-3 sticky top-24" style={{ borderColor: "#38373C", background: COLORS.khadi }}>
          <h3 style={{ fontFamily: "Fraunces, serif" }}>Bill summary</h3>
          <div className="flex justify-between text-sm"><span style={{ color: "#A6A39B" }}>Subtotal</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(subtotal)}</span></div>
          <div className="flex justify-between items-center text-sm">
            <span style={{ color: "#A6A39B" }}>Discount %</span>
            <input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)}
              className="w-16 px-2 py-1 rounded border text-right text-sm" style={{ borderColor: "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
          </div>
          <label className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2" style={{ color: "#A6A39B" }}>
              <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} /> Add GST
            </span>
            {gstEnabled && (
              <input type="number" min="0" value={gstRate} onChange={(e) => setGstRate(e.target.value)}
                className="w-14 px-2 py-1 rounded border text-right text-sm" style={{ borderColor: "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
            )}
          </label>
          <div className="flex justify-between pt-2 border-t text-base" style={{ borderColor: "#38373C" }}>
            <span style={{ fontFamily: "Fraunces, serif" }}>Total</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.madder }}>{money(total)}</span>
          </div>
          <button onClick={saveBill} disabled={cart.length === 0 || !!overStock}
            className="w-full py-2 rounded-lg text-white text-sm disabled:opacity-40" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
            Save bill & deduct stock
          </button>
        </div>
      </div>
    </div>
  );
}

function BillReceipt({ bill, onDone, shopName, gstin, printWidth = "80", setPrintWidth }) {
  const width = printWidth || "80";
  const isA4 = width === "a4";
  const isNarrow = width === "58";
  const baseFontSize = isA4 ? "13px" : isNarrow ? "10px" : "12px";
  const headerFontSize = isA4 ? "20px" : isNarrow ? "13px" : "15px";
  const logoSize = isA4 ? "70px" : isNarrow ? "32px" : "40px";
  const dashLen = isA4 ? 66 : isNarrow ? 32 : 42;

  return (
    <div className="max-w-md mx-auto">
      <style>{`
        @page { ${isA4 ? "size: A4; margin: 18mm;" : `size: ${width}mm auto; margin: 2mm;`} }
        @media print {
          body * { visibility: hidden !important; }
          #printable-receipt, #printable-receipt * { visibility: visible !important; }
          #printable-receipt {
            display: block !important;
            position: absolute; top: 0; left: 0;
            width: ${isA4 ? "100%" : `${width}mm`};
            max-width: ${isA4 ? "180mm" : "none"};
            margin: ${isA4 ? "0 auto" : "0"};
            background: #fff !important;
          }
          ${isA4
            ? `#printable-receipt, #printable-receipt * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`
            : `#printable-receipt * { color: #000 !important; background: transparent !important; }`
          }
          .no-print { display: none !important; }
        }
        #printable-receipt { display: none; }
      `}</style>

      {/* On-screen confirmation card */}
      <div className="no-print rounded-lg border relative" style={{ borderColor: "#38373C", background: COLORS.khadi }}>
        <div className="flex justify-center gap-1 py-2 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, i) => <span key={i} className="w-2 h-2 rounded-full" style={{ background: COLORS.thread }} />)}
        </div>
        <div className="px-6 pb-6 space-y-3">
          <div className="text-center">
            <img src={logoIcon} alt="" className="mx-auto rounded" style={{ width: 32, height: 36, objectFit: "cover" }} />
            <p style={{ fontFamily: "Fraunces, serif", fontSize: "1.1rem" }}>Bill saved</p>
            <p className="text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "#A6A39B" }}>{bill.billNumber}</p>
          </div>
          <div className="text-sm flex justify-between"><span style={{ color: "#A6A39B" }}>Customer</span><span>{bill.customerName}</span></div>
          <div className="border-t pt-2 space-y-1" style={{ borderColor: "#47454B" }}>
            {bill.items.map((it) => (
              <div key={it.itemId} className="flex justify-between text-sm">
                <span>{it.name} × {it.qty}{it.unit || "m"}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(it.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-2 space-y-1" style={{ borderColor: "#47454B" }}>
            {bill.discountPercent > 0 && (
              <div className="flex justify-between text-xs" style={{ color: "#A6A39B" }}>
                <span>Discount ({bill.discountPercent}%)</span><span>-{money((bill.subtotal * bill.discountPercent) / 100)}</span>
              </div>
            )}
            {bill.gstEnabled && (
              <div className="flex justify-between text-xs" style={{ color: "#A6A39B" }}>
                <span>GST ({bill.gstRate}%)</span><span>{money(bill.gstAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base pt-1">
              <span style={{ fontFamily: "Fraunces, serif" }}>Total</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.madder }}>{money(bill.total)}</span>
            </div>
          </div>

          {setPrintWidth && (
            <div className="flex items-center gap-2 text-xs pt-1 flex-wrap">
              <span style={{ color: "#A6A39B" }}>Printer paper:</span>
              <button onClick={() => setPrintWidth("58")}
                className="px-2 py-1 rounded border"
                style={{ borderColor: width === "58" ? COLORS.indigo : "#38373C", background: width === "58" ? "#2E2C3A" : "transparent" }}>
                58mm
              </button>
              <button onClick={() => setPrintWidth("80")}
                className="px-2 py-1 rounded border"
                style={{ borderColor: width === "80" ? COLORS.indigo : "#38373C", background: width === "80" ? "#2E2C3A" : "transparent" }}>
                80mm
              </button>
              <button onClick={() => setPrintWidth("a4")}
                className="px-2 py-1 rounded border"
                style={{ borderColor: width === "a4" ? COLORS.indigo : "#38373C", background: width === "a4" ? "#2E2C3A" : "transparent" }}>
                A4
              </button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm" style={{ borderColor: "#47454B" }}>
              <Printer size={14} /> Print
            </button>
            <button onClick={onDone} className="flex-1 py-2 rounded-lg text-white text-sm" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>New bill</button>
          </div>
        </div>
      </div>

      {/* Print-only layout, formatted for a thermal receipt printer */}
      {isA4 ? (
        <div id="printable-receipt" style={{ fontFamily: "Inter, sans-serif", fontSize: "13px", color: "#111", padding: "6mm" }}>
          {/* Header: logo + shop name on the left, INVOICE + bill meta on the right */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `3px solid ${COLORS.indigo}`, paddingBottom: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <img src={logoIcon} alt="" style={{ width: 52, height: "auto", borderRadius: 4 }} />
              <div>
                <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 22, color: "#111" }}>{shopName || "My Textile Shop"}</div>
                {gstin && <div style={{ fontSize: 11, color: "#555" }}>GSTIN: {gstin}</div>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: 26, color: COLORS.indigo, letterSpacing: 1 }}>INVOICE</div>
              <div style={{ fontSize: 11.5, color: "#333", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                <div>Invoice No: {bill.billNumber}</div>
                <div>Date: {new Date(bill.date).toLocaleDateString("en-IN")}</div>
              </div>
            </div>
          </div>

          {/* Billing to */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, color: "#777", textTransform: "uppercase", letterSpacing: 0.5 }}>Billed To</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{bill.customerName}</div>
            {bill.customerPhone && <div style={{ fontSize: 12, color: "#555" }}>{bill.customerPhone}</div>}
          </div>

          {/* Items table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  background: COLORS.indigo, color: "#1B1B1E",
                  WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
                }}
              >
                <th style={{ textAlign: "left", padding: "7px 8px", fontSize: 11 }}>SL</th>
                <th style={{ textAlign: "left", padding: "7px 8px", fontSize: 11 }}>ITEM DESCRIPTION</th>
                <th style={{ textAlign: "right", padding: "7px 8px", fontSize: 11 }}>QTY</th>
                <th style={{ textAlign: "right", padding: "7px 8px", fontSize: 11 }}>PRICE</th>
                <th style={{ textAlign: "right", padding: "7px 8px", fontSize: 11 }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {bill.items.map((it, idx) => (
                <tr key={it.itemId} style={{ borderBottom: "1px solid #ddd" }}>
                  <td style={{ padding: "7px 8px", color: "#555" }}>{idx + 1}</td>
                  <td style={{ padding: "7px 8px" }}>{it.name}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{it.qty}{it.unit || "m"}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{money(it.price)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "'JetBrains Mono', monospace" }}>{money(it.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <div style={{ width: 220, fontSize: 12.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: "#555" }}>Subtotal</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(bill.subtotal)}</span>
              </div>
              {bill.discountPercent > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "#555" }}>Discount ({bill.discountPercent}%)</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>-{money((bill.subtotal * bill.discountPercent) / 100)}</span>
                </div>
              )}
              {bill.gstEnabled && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "#555" }}>GST ({bill.gstRate}%)</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(bill.gstAmount)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `2px solid ${COLORS.indigo}`, marginTop: 4, paddingTop: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>Total</span>
                <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", color: COLORS.indigo }}>{money(bill.total)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 40 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 20 }}>Thank you for your business!</div>
            <div style={{ height: 4, background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.madder})`, WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }} />
          </div>
        </div>
      ) : (
      <div id="printable-receipt" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: baseFontSize, lineHeight: 1.4, padding: "2mm" }}>
        <img src={logoIcon} alt="" style={{ display: "block", margin: "0 auto 4px", width: logoSize, height: "auto" }} />
        <div style={{ textAlign: "center", fontWeight: "bold", fontSize: headerFontSize }}>{shopName || "My Textile Shop"}</div>
        {gstin && <div style={{ textAlign: "center" }}>GSTIN: {gstin}</div>}
        <div style={{ textAlign: "center" }}>Bill: {bill.billNumber}</div>
        <div style={{ textAlign: "center" }}>{new Date(bill.date).toLocaleString("en-IN")}</div>
        <div>{"-".repeat(dashLen)}</div>
        <div>Customer: {bill.customerName}</div>
        {bill.customerPhone && <div>Phone: {bill.customerPhone}</div>}
        <div>{"-".repeat(dashLen)}</div>
        {bill.items.map((it) => (
          <div key={it.itemId} style={{ marginBottom: 2 }}>
            <div>{it.name}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{it.qty}{it.unit || "m"} x {money(it.price)}</span>
              <span>{money(it.lineTotal)}</span>
            </div>
          </div>
        ))}
        <div>{"-".repeat(dashLen)}</div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotal</span><span>{money(bill.subtotal)}</span></div>
        {bill.discountPercent > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Discount ({bill.discountPercent}%)</span><span>-{money((bill.subtotal * bill.discountPercent) / 100)}</span>
          </div>
        )}
        {bill.gstEnabled && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>GST ({bill.gstRate}%)</span><span>{money(bill.gstAmount)}</span>
          </div>
        )}
        <div>{"=".repeat(dashLen)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: headerFontSize }}>
          <span>TOTAL</span><span>{money(bill.total)}</span>
        </div>
        <div>{"=".repeat(dashLen)}</div>
        <div style={{ textAlign: "center", marginTop: 4 }}>Thank you! Visit again</div>
      </div>
      )}
    </div>
  );
}

// ---------------- Bills ----------------
function Bills({ bills, setBills, inventory, setInventory, shopName, gstin, printWidth, setPrintWidth }) {
  const [query, setQuery] = useState("");
  const [openBill, setOpenBill] = useState(null);
  const [editingBill, setEditingBill] = useState(null);
  const [fy, setFy] = useState(String(currentFYStartYear()));
  const fyOptions = useMemo(() => fyOptionsFrom(bills.map((b) => b.date)), [bills]);

  const deleteBill = (bill) => {
    if (!window.confirm(`Delete bill ${bill.billNumber}? This will restore ${bill.items.length} item(s) back to stock.`)) return;
    setInventory(inventory.map((i) => {
      const line = bill.items.find((it) => it.itemId === i.id);
      return line ? { ...i, stockQty: i.stockQty + line.qty } : i;
    }));
    setBills(bills.filter((b) => b.id !== bill.id));
    if (openBill?.id === bill.id) setOpenBill(null);
  };

  const fyFiltered = fy === "all" ? bills : bills.filter((b) => fyStartYear(b.date) === Number(fy));
  const filtered = fyFiltered
    .filter((b) => (b.customerName + b.billNumber).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // latest invoice first

  const { page, setPage, totalPages, paged } = usePagination(filtered);

  const exportCSV = () => {
    downloadCSV(
      `bills_${fy === "all" ? "all" : fyLabel(Number(fy)).replace(/\s+/g, "_")}.csv`,
      ["Bill No.", "Date", "Customer", "Phone", "Subtotal", "Discount %", "GST", "Total"],
      filtered.map((b) => [
        b.billNumber, new Date(b.date).toLocaleDateString("en-IN"), b.customerName, b.customerPhone || "",
        b.subtotal.toFixed(2), b.discountPercent, b.gstAmount?.toFixed(2) || "0.00", b.total.toFixed(2),
      ])
    );
  };

  if (bills.length === 0) return <EmptyState title="No bills yet" body="Bills you save from the New Bill tab will show up here." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#A6A39B" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by bill no. or customer"
              className="pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          </div>
          <FYSelect value={fy} onChange={setFy} options={fyOptions} />
        </div>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border" style={{ borderColor: "#47454B", color: COLORS.ink }}>
          <Download size={13} /> Export CSV
        </button>
      </div>
      <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: COLORS.khadi }}>
            <th className="text-left px-3 py-2 font-medium">Bill No.</th>
            <th className="text-left px-3 py-2 font-medium">Customer</th>
            <th className="text-left px-3 py-2 font-medium">Date</th>
            <th className="text-right px-3 py-2 font-medium">Total</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {paged.map((b) => (
              <tr key={b.id} className="border-t cursor-pointer hover:bg-white/5" style={{ borderColor: "#38373C" }} onClick={() => setOpenBill(b)}>
                <td className="px-3 py-2" style={{ fontFamily: "JetBrains Mono, monospace" }}>{b.billNumber}</td>
                <td className="px-3 py-2">{b.customerName}</td>
                <td className="px-3 py-2" style={{ color: "#A6A39B" }}>{new Date(b.date).toLocaleDateString("en-IN")}</td>
                <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(b.total)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditingBill(b)} className="p-1"><Pencil size={13} style={{ color: "#A6A39B" }} /></button>
                    <button onClick={() => deleteBill(b)} className="p-1"><Trash2 size={13} style={{ color: COLORS.madder }} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar page={page} setPage={setPage} totalPages={totalPages} totalItems={filtered.length} />
      </div>
      {openBill && (
        <Modal onClose={() => setOpenBill(null)}>
          <div className="flex gap-2 justify-end -mb-1">
            <button onClick={() => { setEditingBill(openBill); setOpenBill(null); }}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded border" style={{ borderColor: "#47454B", color: COLORS.ink }}>
              <Pencil size={12} /> Edit
            </button>
            <button onClick={() => deleteBill(openBill)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded border" style={{ borderColor: "#47454B", color: COLORS.madder }}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
          <BillReceipt bill={openBill} shopName={shopName} gstin={gstin} printWidth={printWidth} setPrintWidth={setPrintWidth} onDone={() => setOpenBill(null)} />
        </Modal>
      )}
      {editingBill && (
        <EditBillModal
          bill={editingBill}
          inventory={inventory}
          setInventory={setInventory}
          bills={bills}
          setBills={setBills}
          onClose={() => setEditingBill(null)}
        />
      )}
    </div>
  );
}

function EditBillModal({ bill, inventory, setInventory, bills, setBills, onClose }) {
  const [customerName, setCustomerName] = useState(bill.customerName);
  const [customerPhone, setCustomerPhone] = useState(bill.customerPhone || "");
  const [discount, setDiscount] = useState(bill.discountPercent || 0);
  const [gstEnabled, setGstEnabled] = useState(!!bill.gstEnabled);
  const [gstRate, setGstRate] = useState(bill.gstRate || 5);
  const [query, setQuery] = useState("");

  const [cart, setCart] = useState(() =>
    bill.items.map((it) => {
      const invItem = inventory.find((i) => i.id === it.itemId);
      return {
        itemId: it.itemId,
        name: it.name,
        productType: it.productType || invItem?.productType || "fabric",
        unit: it.unit || (invItem ? unitFor(invItem) : "m"),
        qty: it.qty,
        price: it.price,
        originalPrice: it.originalPrice ?? invItem?.pricePerUnit ?? it.price,
        costAtSale: it.costAtSale || 0,
        // headroom = current live stock + the qty this bill already holds (since saving reverses+reapplies)
        maxStock: (invItem?.stockQty || 0) + it.qty,
      };
    })
  );

  const matches = query
    ? inventory.filter((i) => (i.name + (i.color || "") + (i.barcode || "")).toLowerCase().includes(query.toLowerCase()))
    : [];

  const addToCart = (item) => {
    const existing = cart.find((c) => c.itemId === item.id);
    if (existing) {
      setCart(cart.map((c) => (c.itemId === item.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      const originalQty = bill.items.find((it) => it.itemId === item.id)?.qty || 0;
      setCart([...cart, {
        itemId: item.id, name: item.name, productType: item.productType,
        unit: unitFor(item), qty: 1, price: item.pricePerUnit, originalPrice: item.pricePerUnit,
        costAtSale: Number(item.costPerUnit || 0), maxStock: item.stockQty + originalQty,
      }]);
    }
    setQuery("");
  };
  const updateQty = (itemId, qty) => setCart(cart.map((c) => (c.itemId === itemId ? { ...c, qty } : c)));
  const updatePrice = (itemId, price) => setCart(cart.map((c) => (c.itemId === itemId ? { ...c, price } : c)));
  const removeFromCart = (itemId) => setCart(cart.filter((c) => c.itemId !== itemId));

  const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
  const discAmt = (subtotal * Number(discount || 0)) / 100;
  const afterDiscount = subtotal - discAmt;
  const gstAmt = gstEnabled ? (afterDiscount * Number(gstRate || 0)) / 100 : 0;
  const total = afterDiscount + gstAmt;
  const overStock = cart.find((c) => c.qty > c.maxStock);

  const save = () => {
    if (cart.length === 0 || overStock) return;
    // Reconcile stock: give back everything this bill originally took, then take what the edited cart needs.
    let nextInventory = inventory.map((i) => {
      const orig = bill.items.find((it) => it.itemId === i.id);
      return orig ? { ...i, stockQty: i.stockQty + orig.qty } : i;
    });
    nextInventory = nextInventory.map((i) => {
      const line = cart.find((c) => c.itemId === i.id);
      return line ? { ...i, stockQty: i.stockQty - line.qty } : i;
    });
    setInventory(nextInventory);

    const updatedBill = {
      ...bill,
      customerName: customerName || "Walk-in customer",
      customerPhone,
      items: cart.map((c) => ({ itemId: c.itemId, name: c.name, unit: c.unit, qty: c.qty, price: c.price, originalPrice: c.originalPrice, costAtSale: c.costAtSale, lineTotal: c.qty * c.price })),
      subtotal, discountPercent: Number(discount || 0), gstEnabled, gstRate: Number(gstRate || 0), gstAmount: gstAmt, total,
    };
    setBills(bills.map((b) => (b.id === bill.id ? updatedBill : b)));
    onClose();
  };

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="flex justify-between items-center">
        <h3 style={{ fontFamily: "Fraunces, serif" }}>Edit bill {bill.billNumber}</h3>
        <button onClick={onClose}><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
        <input placeholder="Phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#A6A39B" }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add another item"
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
        {matches.length > 0 && (
          <div className="absolute z-10 w-full mt-1 rounded-lg border shadow-sm max-h-40 overflow-auto" style={{ background: COLORS.thread, borderColor: "#38373C" }}>
            {matches.map((i) => (
              <button key={i.id} onClick={() => addToCart(i)} className="w-full text-left px-3 py-2 text-sm flex justify-between hover:bg-white/5">
                <span>{i.name}</span><span style={{ color: "#A6A39B" }}>{i.stockQty} {unitFor(i)} avail.</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-2 max-h-52 overflow-auto">
        {cart.map((c) => (
          <div key={c.itemId} className="rounded-lg border px-3 py-2" style={{ borderColor: "#38373C" }}>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-sm">{c.name}</span>
              <input type="number" min={c.unit === "m" ? "0.5" : "1"} step={c.unit === "m" ? "0.5" : "1"} value={c.qty}
                onChange={(e) => updateQty(c.itemId, Number(e.target.value))}
                className="w-16 px-2 py-1 rounded border text-sm text-right"
                style={{ borderColor: c.qty > c.maxStock ? COLORS.madder : "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
              <span className="text-xs" style={{ color: "#A6A39B" }}>{c.unit}</span>
              <button onClick={() => removeFromCart(c.itemId)}><Trash2 size={14} style={{ color: COLORS.madder }} /></button>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs" style={{ color: "#A6A39B" }}>Price/{c.unit}:</span>
              <input type="number" min="0" value={c.price}
                onChange={(e) => updatePrice(c.itemId, Number(e.target.value))}
                className="w-24 px-2 py-1 rounded border text-sm text-right"
                style={{ borderColor: c.price !== c.originalPrice ? COLORS.turmeric : "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
              {c.price !== c.originalPrice && (
                <span className="text-xs" style={{ color: "#A6A39B" }}>
                  (catalog: <span style={{ textDecoration: "line-through" }}>{money(c.originalPrice)}</span>)
                </span>
              )}
              <span className="ml-auto text-sm" style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(c.qty * c.price)}</span>
            </div>
          </div>
        ))}
        {overStock && <p className="text-xs" style={{ color: COLORS.madder }}>{overStock.name} exceeds available stock ({overStock.maxStock} {overStock.unit}).</p>}
      </div>
      <div className="grid grid-cols-2 gap-2 items-center text-sm">
        <div className="flex items-center gap-2">
          <span style={{ color: "#A6A39B" }}>Discount %</span>
          <input type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)}
            className="w-16 px-2 py-1 rounded border text-right text-sm" style={{ borderColor: "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
        </div>
        <label className="flex items-center gap-2 justify-end">
          <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} /> GST
          {gstEnabled && (
            <input type="number" min="0" value={gstRate} onChange={(e) => setGstRate(e.target.value)}
              className="w-14 px-2 py-1 rounded border text-right text-sm" style={{ borderColor: "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
          )}
        </label>
      </div>
      <div className="flex justify-between pt-2 border-t text-base" style={{ borderColor: "#38373C" }}>
        <span style={{ fontFamily: "Fraunces, serif" }}>Total</span>
        <span style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.madder }}>{money(total)}</span>
      </div>
      <button onClick={save} disabled={cart.length === 0 || !!overStock}
        className="w-full py-2 rounded-lg text-white text-sm disabled:opacity-40" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
        Save changes
      </button>
    </Modal>
  );
}

// ---------------- Customers ----------------
function Customers({ customers }) {
  const [openCustomer, setOpenCustomer] = useState(null);
  if (customers.length === 0) return <EmptyState title="No customers yet" body="Customers appear automatically once you save a bill for them." />;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
        <table className="w-full text-sm">
          <thead><tr style={{ background: COLORS.khadi }}>
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-left px-3 py-2 font-medium">Phone</th>
            <th className="text-right px-3 py-2 font-medium">Orders</th>
            <th className="text-right px-3 py-2 font-medium">Total spend</th>
          </tr></thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.phone || c.name} className="border-t cursor-pointer hover:bg-white/5" style={{ borderColor: "#38373C" }} onClick={() => setOpenCustomer(c)}>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2" style={{ color: "#A6A39B" }}>{c.phone || "—"}</td>
                <td className="px-3 py-2 text-right">{c.orders.length}</td>
                <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.indigo }}>{money(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openCustomer && (
        <Modal onClose={() => setOpenCustomer(null)}>
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>{openCustomer.name}</h3>
            <button onClick={() => setOpenCustomer(null)}><X size={18} /></button>
          </div>
          <p className="text-xs" style={{ color: "#A6A39B" }}>{openCustomer.phone || "No phone on file"}</p>
          <div className="space-y-2">
            {openCustomer.orders.map((o) => (
              <div key={o.id} className="flex justify-between text-sm border-t pt-2" style={{ borderColor: "#38373C" }}>
                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{o.billNumber}</span>
                <span style={{ color: "#A6A39B" }}>{new Date(o.date).toLocaleDateString("en-IN")}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(o.total)}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Purchases ----------------
function Purchases({ purchases, setPurchases, suppliers, setSuppliers, payments, setPayments, inventory, setInventory, paidDueMap }) {
  const [showForm, setShowForm] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState(null);
  const [openPurchase, setOpenPurchase] = useState(null);
  const [supplierChoice, setSupplierChoice] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([emptyRow()]);
  const [amountPaid, setAmountPaid] = useState(0);
  const [gstEnabled, setGstEnabled] = useState(true);
  const [gstRate, setGstRate] = useState(5);

  function emptyRow() {
    return { name: "", productType: "fabric", category: "cotton", size: "Free size", color: "", unitMode: "meter", setSizeMeters: DEFAULT_SET_SIZE_METERS, qty: "", costPerUnit: "" };
  }

  const addRow = () => setRows([...rows, emptyRow()]);
  const updateRow = (idx, patch) => setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeRow = (idx) => setRows(rows.filter((_, i) => i !== idx));

  // Subtotal is the raw purchased-rate value (before GST); this is what's actually
  // paid out per unit to the supplier before tax is added on top.
  const subtotal = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.costPerUnit) || 0), 0);
  const gstAmt = gstEnabled ? (subtotal * (Number(gstRate) || 0)) / 100 : 0;
  const total = subtotal + gstAmt;

  const resetForm = () => {
    setSupplierChoice(""); setNewSupplierName(""); setDate(todayISO()); setRows([emptyRow()]); setAmountPaid(0);
    setGstEnabled(true); setGstRate(5); setEditingPurchaseId(null);
  };

  // Removes a previously-recorded purchase's quantities from inventory (stock only —
  // cost-per-unit is left as-is since weighted-average cost can't be cleanly reversed
  // once later purchases/sales have happened; stock accuracy matters more day-to-day).
  function reversePurchaseFromInventory(inv, purchase) {
    let next = [...inv];
    purchase.items.forEach((it) => {
      const idx = next.findIndex(
        (i) => i.productType === it.productType && i.name.trim().toLowerCase() === it.name.trim().toLowerCase() &&
          (it.productType !== "fabric" || (i.unitMode || "meter") === (it.unitMode || "meter"))
      );
      if (idx >= 0) {
        next[idx] = { ...next[idx], stockQty: Math.max(0, next[idx].stockQty - it.qty) };
      }
    });
    return next;
  }

  const openEditPurchase = (purchase) => {
    setEditingPurchaseId(purchase.id);
    setSupplierChoice(purchase.supplierId);
    setDate(purchase.date.slice(0, 10));
    setRows(purchase.items.map((it) => ({
      name: it.name, productType: it.productType, category: it.category || (it.productType === "readymade" ? "other" : "cotton"),
      size: it.size || "Free size", color: it.color || "", unitMode: it.unitMode || "meter",
      setSizeMeters: it.setSizeMeters || DEFAULT_SET_SIZE_METERS, qty: it.qty, costPerUnit: it.costPerUnit,
    })));
    setAmountPaid(purchase.amountPaid);
    setGstEnabled(purchase.gstEnabled ?? true);
    setGstRate(purchase.gstRate ?? 0);
    setShowForm(true);
  };

  const deletePurchase = (purchase) => {
    const tiedAmount = payments.filter((p) => p.purchaseId === purchase.id).reduce((s, p) => s + p.amount, 0);
    const msg = tiedAmount > 0
      ? `Delete this purchase and remove ${purchase.items.length} item(s) worth of stock? ₹${tiedAmount.toFixed(2)} in payment history tied to this purchase will also be deleted.`
      : `Delete this purchase and remove ${purchase.items.length} item(s) worth of stock added by it?`;
    if (!window.confirm(msg)) return;
    setInventory(reversePurchaseFromInventory(inventory, purchase));
    setPurchases(purchases.filter((p) => p.id !== purchase.id));
    // Payments tied to this purchase are removed along with it, so payment
    // history never shows money against a purchase that no longer exists.
    setPayments(payments.filter((p) => p.purchaseId !== purchase.id));
  };

  const save = () => {
    const validRows = rows.filter((r) => r.name.trim() && Number(r.qty) > 0 && Number(r.costPerUnit) >= 0);
    if (validRows.length === 0) return;

    let supplierId = supplierChoice;
    let supplierName = "";
    let nextSuppliers = suppliers;
    if (supplierChoice === "__new__") {
      if (!newSupplierName.trim()) return;
      supplierId = uid();
      supplierName = newSupplierName.trim();
      nextSuppliers = [{ id: supplierId, name: supplierName, phone: "", notes: "" }, ...suppliers];
    } else {
      const s = suppliers.find((s) => s.id === supplierChoice);
      if (!s) return;
      supplierName = s.name;
    }

    const editingPurchase = editingPurchaseId ? purchases.find((p) => p.id === editingPurchaseId) : null;
    let nextInventory = editingPurchase ? reversePurchaseFromInventory(inventory, editingPurchase) : [...inventory];

    const effectiveGstRate = Number(gstRate) || 0;
    const gstMultiplier = gstEnabled ? 1 + effectiveGstRate / 100 : 1;

    const lineItems = validRows.map((r) => {
      const qty = Number(r.qty);
      const cost = Number(r.costPerUnit); // purchased rate, excl. GST
      // Landed cost per unit — what the item actually costs the shop once GST is
      // added on top of the purchased rate — is what flows into inventory.
      const costWithGst = cost * gstMultiplier;
      const existingIdx = nextInventory.findIndex(
        (i) =>
          i.productType === r.productType &&
          i.name.trim().toLowerCase() === r.name.trim().toLowerCase() &&
          (r.productType !== "readymade" || i.size === r.size) &&
          (r.productType !== "fabric" || ((i.unitMode === "set" ? "set" : "meter") === r.unitMode && (r.unitMode !== "set" || Number(i.setSizeMeters) === Number(r.setSizeMeters))))
      );
      if (existingIdx >= 0) {
        const existing = nextInventory[existingIdx];
        const newQty = existing.stockQty + qty;
        const newCost = newQty > 0 ? (existing.costPerUnit * existing.stockQty + costWithGst * qty) / newQty : costWithGst;
        nextInventory[existingIdx] = { ...existing, stockQty: newQty, costPerUnit: newCost, createdAt: Date.now() };
      } else {
        nextInventory.push({
          id: uid(), productType: r.productType, name: r.name.trim(), category: r.category,
          color: r.color, size: r.productType === "readymade" ? r.size : undefined,
          unitMode: r.productType === "fabric" && r.unitMode === "set" ? "set" : "meter",
          setSizeMeters: r.productType === "fabric" && r.unitMode === "set" ? Number(r.setSizeMeters) || DEFAULT_SET_SIZE_METERS : undefined,
          pricePerUnit: costWithGst, costPerUnit: costWithGst, stockQty: qty, lowStockThreshold: r.productType === "readymade" ? 3 : 10,
          createdAt: Date.now(),
          barcode: generateUniqueBarcode(nextInventory.map((i) => i.barcode)),
        });
      }
      return {
        name: r.name.trim(), productType: r.productType, category: r.category, size: r.size, color: r.color,
        unitMode: r.unitMode, setSizeMeters: r.setSizeMeters, qty, costPerUnit: cost, lineTotal: qty * cost,
      };
    });

    const purchaseSubtotal = lineItems.reduce((s, li) => s + li.lineTotal, 0);
    const purchaseGstAmount = gstEnabled ? (purchaseSubtotal * effectiveGstRate) / 100 : 0;
    const totalAmount = purchaseSubtotal + purchaseGstAmount;

    setSuppliers(nextSuppliers);
    setInventory(nextInventory);

    if (editingPurchase) {
      const tiedPayments = payments.filter((p) => p.purchaseId === editingPurchase.id);
      const tiedPaid = tiedPayments.reduce((s, p) => s + p.amount, 0);
      const updated = {
        ...editingPurchase, date: new Date(date).toISOString(), supplierId, supplierName,
        items: lineItems, subtotal: purchaseSubtotal, gstEnabled, gstRate: effectiveGstRate, gstAmount: purchaseGstAmount,
        totalAmount, amountPaid: Math.min(tiedPaid, totalAmount), balanceDue: Math.max(0, totalAmount - tiedPaid),
      };
      setPurchases(purchases.map((p) => (p.id === editingPurchase.id ? updated : p)));

      // Keep the underlying payment records consistent with the edited purchase:
      // if the new total is less than what's already tied to it, scale those
      // payments down proportionally so they never exceed the purchase total.
      // Also re-point them to the new supplier if the supplier was changed.
      if (tiedPayments.length > 0) {
        const scale = totalAmount > 0 && tiedPaid > totalAmount ? totalAmount / tiedPaid : 1;
        let running = 0;
        const scaledById = {};
        tiedPayments.forEach((p, idx) => {
          let amt = scale === 1 ? p.amount : Math.round(p.amount * scale * 100) / 100;
          if (idx === tiedPayments.length - 1 && scale !== 1) {
            amt = Math.round((totalAmount - running) * 100) / 100; // absorb rounding on the last one
          }
          running += amt;
          scaledById[p.id] = amt;
        });
        setPayments(payments.map((p) =>
          p.purchaseId === editingPurchase.id
            ? { ...p, supplierId, amount: scaledById[p.id] }
            : p
        ));
      }
    } else {
      const paid = Math.min(Number(amountPaid) || 0, totalAmount);
      const purchase = {
        id: uid(), date: new Date(date).toISOString(), supplierId, supplierName,
        items: lineItems, subtotal: purchaseSubtotal, gstEnabled, gstRate: effectiveGstRate, gstAmount: purchaseGstAmount,
        totalAmount, amountPaid: paid, balanceDue: totalAmount - paid,
      };
      setPurchases([purchase, ...purchases]);
      if (paid > 0) {
        setPayments([{ id: uid(), supplierId, purchaseId: purchase.id, date: new Date(date).toISOString(), amount: paid, note: "Paid at purchase" }, ...payments]);
      }
    }
    setShowForm(false);
    resetForm();
  };

  const [fy, setFy] = useState(String(currentFYStartYear()));
  const fyOptions = useMemo(() => fyOptionsFrom(purchases.map((p) => p.date)), [purchases]);
  const fyFiltered = (fy === "all" ? purchases : purchases.filter((p) => fyStartYear(p.date) === Number(fy)))
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date)); // latest purchase first

  const { page, setPage, totalPages, paged } = usePagination(fyFiltered);

  const exportCSV = () => {
    downloadCSV(
      `purchases_${fy === "all" ? "all" : fyLabel(Number(fy)).replace(/\s+/g, "_")}.csv`,
      ["Date", "Supplier", "Items", "Subtotal", "GST %", "GST Amount", "Total", "Paid", "Due"],
      fyFiltered.map((p) => [
        new Date(p.date).toLocaleDateString("en-IN"), p.supplierName,
        p.items.map((it) => `${it.name} x${it.qty}`).join("; "),
        (p.subtotal ?? p.totalAmount).toFixed(2), p.gstEnabled ? p.gstRate ?? 0 : 0, (p.gstAmount || 0).toFixed(2),
        p.totalAmount.toFixed(2), (paidDueMap[p.id]?.paidNow ?? p.amountPaid).toFixed(2), (paidDueMap[p.id]?.dueNow ?? p.balanceDue).toFixed(2),
      ])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <h3 style={{ fontFamily: "Fraunces, serif" }}>Stock purchases</h3>
          <FYSelect value={fy} onChange={setFy} options={fyOptions} />
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border" style={{ borderColor: "#47454B", color: COLORS.ink }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white" style={{ background: COLORS.madder }}>
            <Plus size={16} /> New purchase
          </button>
        </div>
      </div>

      {purchases.length === 0 ? (
        <EmptyState title="No purchases recorded" body="Record stock you buy from suppliers here — it updates inventory and tracks what you owe." />
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: COLORS.khadi }}>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Supplier</th>
              <th className="text-right px-3 py-2 font-medium">GST %</th>
              <th className="text-right px-3 py-2 font-medium">Total</th>
              <th className="text-right px-3 py-2 font-medium">Paid to date</th>
              <th className="text-right px-3 py-2 font-medium">Due now</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {paged.map((p) => (
                <tr key={p.id} className="border-t hover:bg-white/5" style={{ borderColor: "#38373C" }}>
                  <td className="px-3 py-2 cursor-pointer" style={{ color: "#A6A39B" }} onClick={() => setOpenPurchase(p)}>{new Date(p.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2 cursor-pointer" onClick={() => setOpenPurchase(p)}>{p.supplierName}</td>
                  <td className="px-3 py-2 text-right cursor-pointer" style={{ fontFamily: "JetBrains Mono, monospace", color: "#A6A39B" }} onClick={() => setOpenPurchase(p)}>{p.gstEnabled ? `${p.gstRate ?? 0}%` : "—"}</td>
                  <td className="px-3 py-2 text-right cursor-pointer" style={{ fontFamily: "JetBrains Mono, monospace" }} onClick={() => setOpenPurchase(p)}>{money(p.totalAmount)}</td>
                  <td className="px-3 py-2 text-right cursor-pointer" style={{ fontFamily: "JetBrains Mono, monospace" }} onClick={() => setOpenPurchase(p)}>{money(paidDueMap[p.id]?.paidNow ?? p.amountPaid)}</td>
                  <td className="px-3 py-2 text-right cursor-pointer" style={{ fontFamily: "JetBrains Mono, monospace", color: (paidDueMap[p.id]?.dueNow ?? p.balanceDue) > 0 ? COLORS.madder : COLORS.green }} onClick={() => setOpenPurchase(p)}>{money(paidDueMap[p.id]?.dueNow ?? p.balanceDue)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEditPurchase(p)} className="p-1"><Pencil size={13} style={{ color: "#A6A39B" }} /></button>
                    <button onClick={() => deletePurchase(p)} className="p-1"><Trash2 size={13} style={{ color: COLORS.madder }} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationBar page={page} setPage={setPage} totalPages={totalPages} totalItems={fyFiltered.length} />
        </div>
      )}

      {showForm && (
        <Modal onClose={() => { setShowForm(false); resetForm(); }} maxWidth="max-w-2xl">
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>{editingPurchaseId ? "Edit purchase" : "New purchase"}</h3>
            <button onClick={() => { setShowForm(false); resetForm(); }}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={supplierChoice} onChange={(e) => setSupplierChoice(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
              <option value="">Select supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="__new__">+ Add new supplier</option>
            </select>
            {supplierChoice === "__new__" ? (
              <input placeholder="Supplier name" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
            ) : (
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
            )}
          </div>
          {supplierChoice === "__new__" && (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          )}

          <div className="space-y-2">
            <p className="text-xs" style={{ color: "#A6A39B" }}>Items purchased</p>
            {rows.map((r, idx) => (
              <div key={idx} className="rounded-lg border p-2 space-y-2" style={{ borderColor: "#38373C" }}>
                <div className="flex gap-2">
                  <input placeholder="Item name" value={r.name} onChange={(e) => updateRow(idx, { name: e.target.value })}
                    className="flex-1 px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle} />
                  <select value={r.productType} onChange={(e) => updateRow(idx, { productType: e.target.value, category: e.target.value === "readymade" ? "shirt" : "cotton" })}
                    className="px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle}>
                    <option value="fabric">Fabric</option>
                    <option value="readymade">Readymade</option>
                  </select>
                  {rows.length > 1 && <button onClick={() => removeRow(idx)}><Trash2 size={14} style={{ color: COLORS.madder }} /></button>}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <select value={r.category} onChange={(e) => updateRow(idx, { category: e.target.value })}
                    className="px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle}>
                    {Object.entries(categoryMetaFor(r.productType)).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  {r.productType === "readymade" ? (
                    <select value={r.size} onChange={(e) => updateRow(idx, { size: e.target.value })}
                      className="px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle}>
                      {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input placeholder="Color" value={r.color} onChange={(e) => updateRow(idx, { color: e.target.value })}
                      className="px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle} />
                  )}
                  <input type="number" min="0" placeholder={`Qty (${unitFor(r)})`} value={r.qty}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    className="px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle} />
                  <input type="number" min="0" placeholder={`Cost/${unitFor(r)}`} value={r.costPerUnit}
                    onChange={(e) => updateRow(idx, { costPerUnit: e.target.value })}
                    className="px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle} />
                </div>
                {r.productType === "fabric" && (
                  <div className="flex gap-2 items-center text-xs">
                    <button type="button" onClick={() => updateRow(idx, { unitMode: "meter" })}
                      className="px-2 py-1 rounded border"
                      style={{ borderColor: r.unitMode !== "set" ? COLORS.indigo : "#38373C", background: r.unitMode !== "set" ? "#2E2C3A" : "transparent" }}>
                      Loose meters
                    </button>
                    <button type="button" onClick={() => updateRow(idx, { unitMode: "set", setSizeMeters: r.setSizeMeters || DEFAULT_SET_SIZE_METERS })}
                      className="px-2 py-1 rounded border"
                      style={{ borderColor: r.unitMode === "set" ? COLORS.madder : "#38373C", background: r.unitMode === "set" ? "#3A3226" : "transparent" }}>
                      Fixed-size set
                    </button>
                    {r.unitMode === "set" && (
                      <input type="number" min="0" step="0.1" placeholder="m/set" value={r.setSizeMeters}
                        onChange={(e) => updateRow(idx, { setSizeMeters: e.target.value })}
                        className="w-20 px-2 py-1 rounded border outline-none" style={inputStyle} />
                    )}
                  </div>
                )}
              </div>
            ))}
            <button onClick={addRow} className="text-xs flex items-center gap-1" style={{ color: COLORS.indigo }}>
              <Plus size={13} /> Add another item
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t text-sm" style={{ borderColor: "#38373C" }}>
            <label className="flex items-center gap-1.5" style={{ color: "#A6A39B" }}>
              <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} /> Add GST
            </label>
            {gstEnabled && (
              <input type="number" min="0" step="0.1" value={gstRate} onChange={(e) => setGstRate(e.target.value)}
                className="w-20 px-2 py-1 rounded border text-right text-sm" style={{ borderColor: "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "#A6A39B" }}>Subtotal</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(subtotal)}</span>
          </div>
          {gstEnabled && (
            <div className="flex justify-between text-sm">
              <span style={{ color: "#A6A39B" }}>GST ({gstRate || 0}%)</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(gstAmt)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span style={{ fontFamily: "Fraunces, serif" }}>Purchase total</span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.madder }}>{money(total)}</span>
          </div>
          <p className="text-xs" style={{ color: "#A6A39B" }}>Inventory cost price is updated with GST included, so it reflects the landed cost per unit.</p>
          {editingPurchaseId ? (
            <p className="text-xs" style={{ color: "#A6A39B" }}>
              Payments already made toward this purchase stay as they are — use the Suppliers tab to record or adjust payments.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: "#A6A39B" }}>Amount paid now (₹)</span>
                <input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-28 px-2 py-1 rounded border text-right text-sm" style={{ borderColor: "#38373C", fontFamily: "JetBrains Mono, monospace" }} />
              </div>
              <p className="text-xs" style={{ color: "#A6A39B" }}>Balance due will be added to the supplier's account.</p>
            </>
          )}

          <button onClick={save} disabled={!supplierChoice || (supplierChoice === "__new__" && !newSupplierName.trim())}
            className="w-full py-2 rounded-lg text-white text-sm disabled:opacity-40" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
            {editingPurchaseId ? "Save changes & update stock" : "Save purchase & update stock"}
          </button>
        </Modal>
      )}

      {openPurchase && (
        <Modal onClose={() => setOpenPurchase(null)}>
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>{openPurchase.supplierName}</h3>
            <button onClick={() => setOpenPurchase(null)}><X size={18} /></button>
          </div>
          <p className="text-xs" style={{ color: "#A6A39B" }}>{new Date(openPurchase.date).toLocaleDateString("en-IN")}</p>
          <div className="space-y-1 border-t pt-2" style={{ borderColor: "#38373C" }}>
            {openPurchase.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{it.name} × {it.qty}{unitFor(it)}</span>
                <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(it.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm border-t pt-2" style={{ borderColor: "#38373C" }}>
            <span>Subtotal</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(openPurchase.subtotal ?? openPurchase.totalAmount)}</span>
          </div>
          {openPurchase.gstEnabled && (
            <div className="flex justify-between text-sm">
              <span>GST ({openPurchase.gstRate ?? 0}%)</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(openPurchase.gstAmount || 0)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span style={{ fontFamily: "Fraunces, serif" }}>Total</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(openPurchase.totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm"><span>Paid to date</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(paidDueMap[openPurchase.id]?.paidNow ?? openPurchase.amountPaid)}</span></div>
          <div className="flex justify-between text-sm"><span>Due now</span><span style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.madder }}>{money(paidDueMap[openPurchase.id]?.dueNow ?? openPurchase.balanceDue)}</span></div>
          <p className="text-xs" style={{ color: "#A6A39B" }}>Includes any payments recorded later from the Suppliers tab, applied to your oldest purchases first.</p>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { openEditPurchase(openPurchase); setOpenPurchase(null); }}
              className="flex-1 py-2 rounded-lg border text-sm flex items-center justify-center gap-1.5" style={{ borderColor: "#47454B" }}>
              <Pencil size={14} /> Edit
            </button>
            <button onClick={() => { deletePurchase(openPurchase); setOpenPurchase(null); }}
              className="flex-1 py-2 rounded-lg border text-sm flex items-center justify-center gap-1.5" style={{ borderColor: COLORS.madder, color: COLORS.madder }}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Expenses ----------------
function Expenses({ expenses, setExpenses }) {
  const [showForm, setShowForm] = useState(false);
  const empty = { date: todayISO(), category: EXPENSE_CATEGORIES[0], description: "", amount: "", mode: "Cash" };
  const [form, setForm] = useState(empty);

  const save = () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setExpenses([{ ...form, id: uid(), amount: Number(form.amount), date: new Date(form.date).toISOString() }, ...expenses]);
    setForm(empty);
    setShowForm(false);
  };
  const remove = (id) => setExpenses(expenses.filter((e) => e.id !== id));

  const monthTotal = useMemo(() => {
    const from = firstOfMonthISO(), to = todayISO();
    return expenses.filter((e) => inRange(e.date, from, to)).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const [fy, setFy] = useState(String(currentFYStartYear()));
  const fyOptions = useMemo(() => fyOptionsFrom(expenses.map((e) => e.date)), [expenses]);
  const fyFiltered = fy === "all" ? expenses : expenses.filter((e) => fyStartYear(e.date) === Number(fy));
  const fyTotal = fyFiltered.reduce((s, e) => s + e.amount, 0);

  const exportCSV = () => {
    downloadCSV(
      `expenses_${fy === "all" ? "all" : fyLabel(Number(fy)).replace(/\s+/g, "_")}.csv`,
      ["Date", "Category", "Description", "Amount", "Mode"],
      fyFiltered.map((e) => [new Date(e.date).toLocaleDateString("en-IN"), e.category, e.description || "", e.amount.toFixed(2), e.mode])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-2 items-center flex-wrap">
          <StatCard label="This month's expenses" value={money(monthTotal)} accent={COLORS.madder} />
          <StatCard label={`${fy === "all" ? "All time" : fyLabel(Number(fy))} expenses`} value={money(fyTotal)} />
          <FYSelect value={fy} onChange={setFy} options={fyOptions} />
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border" style={{ borderColor: "#47454B", color: COLORS.ink }}>
            <Download size={13} /> Export CSV
          </button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white" style={{ background: COLORS.madder }}>
            <Plus size={16} /> Add expense
          </button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <EmptyState title="No expenses logged" body="Rent, electricity, wages, transport — log them here to see true profit in the P&L report." />
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: COLORS.khadi }}>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Category</th>
              <th className="text-left px-3 py-2 font-medium">Note</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {fyFiltered.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: "#38373C" }}>
                  <td className="px-3 py-2" style={{ color: "#A6A39B" }}>{new Date(e.date).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2">{e.category}</td>
                  <td className="px-3 py-2" style={{ color: "#A6A39B" }}>{e.description || "—"}</td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(e.amount)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => remove(e.id)}><Trash2 size={13} style={{ color: COLORS.madder }} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>Add expense</h3>
            <button onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="0" placeholder="Amount (₹)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
            <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className="px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
              <option>Cash</option><option>Bank</option>
            </select>
          </div>
          <button onClick={save} className="w-full py-2 rounded-lg text-white text-sm" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>Save expense</button>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Suppliers ----------------
function Suppliers({ supplierBalances, suppliers, setSuppliers, purchases, payments, setPayments, paidDueMap }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "", notes: "" });
  const [openSupplier, setOpenSupplier] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payPurchaseId, setPayPurchaseId] = useState("");

  const addSupplier = () => {
    if (!newSupplier.name.trim()) return;
    setSuppliers([{ id: uid(), ...newSupplier }, ...suppliers]);
    setNewSupplier({ name: "", phone: "", notes: "" });
    setShowAdd(false);
  };

  const recordPayment = () => {
    if (!openSupplier || !payAmount || Number(payAmount) <= 0) return;
    setPayments([{
      id: uid(), supplierId: openSupplier.id, purchaseId: payPurchaseId || null,
      date: new Date().toISOString(), amount: Number(payAmount), note: payNote,
    }, ...payments]);
    setPayAmount(""); setPayNote(""); setPayPurchaseId(""); setOpenSupplier(null);
  };

  const supplierPurchases = openSupplier ? purchases.filter((p) => p.supplierId === openSupplier.id) : [];
  const supplierPurchasesWithDue = supplierPurchases
    .map((p) => ({ ...p, dueNow: paidDueMap?.[p.id]?.dueNow ?? p.balanceDue }))
    .filter((p) => p.dueNow > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const supplierPayments = openSupplier ? payments.filter((p) => p.supplierId === openSupplier.id) : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 style={{ fontFamily: "Fraunces, serif" }}>Suppliers</h3>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
          <Plus size={16} /> Add supplier
        </button>
      </div>

      {supplierBalances.length === 0 ? (
        <EmptyState title="No suppliers yet" body="Add suppliers here, or add one on the fly from the Purchases tab." />
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: COLORS.khadi }}>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-right px-3 py-2 font-medium">Purchased</th>
              <th className="text-right px-3 py-2 font-medium">Paid</th>
              <th className="text-right px-3 py-2 font-medium">Balance due</th>
            </tr></thead>
            <tbody>
              {supplierBalances.map((s) => (
                <tr key={s.id} className="border-t cursor-pointer hover:bg-white/5" style={{ borderColor: "#38373C" }} onClick={() => setOpenSupplier(s)}>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2" style={{ color: "#A6A39B" }}>{s.phone || "—"}</td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(s.totalPurchased)}</td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(s.totalPaid)}</td>
                  <td className="px-3 py-2 text-right" style={{ fontFamily: "JetBrains Mono, monospace", color: s.balanceDue > 0 ? COLORS.madder : COLORS.green }}>{money(s.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal onClose={() => setShowAdd(false)}>
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>Add supplier</h3>
            <button onClick={() => setShowAdd(false)}><X size={18} /></button>
          </div>
          <input placeholder="Supplier / mill name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <input placeholder="Phone (optional)" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <input placeholder="Notes (optional)" value={newSupplier.notes} onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <button onClick={addSupplier} className="w-full py-2 rounded-lg text-white text-sm" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>Save supplier</button>
        </Modal>
      )}

      {openSupplier && (
        <Modal onClose={() => setOpenSupplier(null)} maxWidth="max-w-lg">
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>{openSupplier.name}</h3>
            <button onClick={() => setOpenSupplier(null)}><X size={18} /></button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg p-2" style={{ background: COLORS.khadi }}>
              <p className="text-[10px]" style={{ color: "#A6A39B" }}>Purchased</p>
              <p style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(openSupplier.totalPurchased)}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: COLORS.khadi }}>
              <p className="text-[10px]" style={{ color: "#A6A39B" }}>Paid</p>
              <p style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(openSupplier.totalPaid)}</p>
            </div>
            <div className="rounded-lg p-2" style={{ background: COLORS.khadi }}>
              <p className="text-[10px]" style={{ color: "#A6A39B" }}>Due</p>
              <p style={{ fontFamily: "JetBrains Mono, monospace", color: openSupplier.balanceDue > 0 ? COLORS.madder : COLORS.green }}>{money(openSupplier.balanceDue)}</p>
            </div>
          </div>

          {openSupplier.balanceDue > 0 && (
            <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: "#38373C" }}>
              <p className="text-xs font-medium" style={{ color: COLORS.ink }}>Record a payment</p>
              <div>
                <label className="text-xs" style={{ color: "#A6A39B" }}>Which materials / purchase is this for?</label>
                <select
                  value={payPurchaseId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPayPurchaseId(val);
                    const p = supplierPurchasesWithDue.find((sp) => sp.id === val);
                    if (p) setPayAmount(p.dueNow.toFixed(2));
                  }}
                  className="w-full px-2 py-1.5 rounded border text-sm outline-none mt-1" style={inputStyle}
                >
                  <option value="">General payment (auto-apply to oldest dues)</option>
                  {supplierPurchasesWithDue.map((p) => (
                    <option key={p.id} value={p.id}>
                      {new Date(p.date).toLocaleDateString("en-IN")} · {p.items.map((it) => it.name).join(", ").slice(0, 40)} · due {money(p.dueNow)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input type="number" min="0" placeholder="Amount (₹)" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle} />
                <input placeholder="Note (optional)" value={payNote} onChange={(e) => setPayNote(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded border text-sm outline-none" style={inputStyle} />
              </div>
              <button onClick={recordPayment} className="w-full py-1.5 rounded-lg text-white text-sm" style={{ background: COLORS.green }}>
                <span className="flex items-center justify-center gap-1.5"><Landmark size={14} /> Record payment</span>
              </button>
            </div>
          )}

          <div>
            <p className="text-xs font-medium mb-1" style={{ color: COLORS.ink }}>Purchase history</p>
            <div className="space-y-1">
              {supplierPurchases.length === 0 && <p className="text-xs" style={{ color: "#A6A39B" }}>No purchases yet.</p>}
              {supplierPurchases.map((p) => (
                <div key={p.id} className="flex justify-between text-sm border-t pt-1" style={{ borderColor: "#38373C" }}>
                  <span style={{ color: "#A6A39B" }}>{new Date(p.date).toLocaleDateString("en-IN")}</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(p.totalAmount)}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: COLORS.ink }}>Payment history</p>
            <div className="space-y-1">
              {supplierPayments.length === 0 && <p className="text-xs" style={{ color: "#A6A39B" }}>No payments yet.</p>}
              {supplierPayments.map((p) => {
                const tiedPurchase = p.purchaseId ? supplierPurchases.find((sp) => sp.id === p.purchaseId) : null;
                return (
                  <div key={p.id} className="flex justify-between text-sm border-t pt-1" style={{ borderColor: "#38373C" }}>
                    <span style={{ color: "#A6A39B" }}>
                      {new Date(p.date).toLocaleDateString("en-IN")}
                      {tiedPurchase ? ` · for ${tiedPurchase.items.map((it) => it.name).join(", ").slice(0, 30)}` : p.purchaseId === null && p.note !== "Paid at purchase" ? " · general" : ""}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", color: COLORS.green }}>{money(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Profit & Loss ----------------
function ProfitLoss({ bills, expenses, purchases, payments, totalPayables }) {
  const [fy, setFy] = useState(String(currentFYStartYear()));
  const fyOptions = useMemo(
    () => fyOptionsFrom([...bills.map((b) => b.date), ...expenses.map((e) => e.date), ...purchases.map((p) => p.date), ...(payments || []).map((p) => p.date)]),
    [bills, expenses, purchases, payments]
  );
  const [from, setFrom] = useState(fyRangeISO(currentFYStartYear()).from);
  const [to, setTo] = useState(todayISO());

  const applyFY = (startYear) => {
    setFy(String(startYear));
    const r = fyRangeISO(startYear);
    setFrom(r.from);
    setTo(r.to > todayISO() ? todayISO() : r.to);
  };

  const exportCSV = () => {
    downloadCSV(`profit_loss_${from}_to_${to}.csv`, ["Metric", "Amount (₹)"], [
      ["Sales revenue (excl. GST)", revenue.toFixed(2)],
      ["Cost of goods sold", cogs.toFixed(2)],
      ["Gross profit", grossProfit.toFixed(2)],
      ["Expenses", expenseTotal.toFixed(2)],
      ["Net profit", netProfit.toFixed(2)],
      ["GST collected", gstCollected.toFixed(2)],
      ["Paid to suppliers this period", purchasesCashPaid.toFixed(2)],
      ["Total owed to suppliers (current)", totalPayables.toFixed(2)],
    ]);
  };

  const billsInRange = useMemo(() => bills.filter((b) => inRange(b.date, from, to)), [bills, from, to]);
  const expensesInRange = useMemo(() => expenses.filter((e) => inRange(e.date, from, to)), [expenses, from, to]);
  const paymentsInRange = useMemo(() => (payments || []).filter((p) => inRange(p.date, from, to)), [payments, from, to]);

  const revenue = billsInRange.reduce((s, b) => s + (b.subtotal - (b.subtotal * b.discountPercent) / 100), 0);
  const gstCollected = billsInRange.reduce((s, b) => s + (b.gstAmount || 0), 0);
  const cogs = billsInRange.reduce((s, b) => s + b.items.reduce((ss, it) => ss + (it.costAtSale || 0) * it.qty, 0), 0);
  const grossProfit = revenue - cogs;
  const expenseTotal = expensesInRange.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - expenseTotal;
  const purchasesCashPaid = paymentsInRange.reduce((s, p) => s + p.amount, 0);

  const expenseByCategory = useMemo(() => {
    const map = {};
    expensesInRange.forEach((e) => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expensesInRange]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange size={15} style={{ color: "#A6A39B" }} />
        {fyOptions.map((y) => (
          <button
            key={y}
            onClick={() => applyFY(y)}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{
              borderColor: String(y) === fy ? COLORS.indigo : "#38373C",
              background: String(y) === fy ? "#2E2C3A" : "transparent",
              color: COLORS.ink,
            }}
          >
            {fyLabel(y)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs" style={{ color: "#A6A39B" }}>From</label>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setFy(""); }} className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={inputStyle} />
        <label className="text-xs" style={{ color: "#A6A39B" }}>To</label>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setFy(""); }} className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={inputStyle} />
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border ml-auto" style={{ borderColor: "#47454B", color: COLORS.ink }}>
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sales revenue" value={money(revenue)} accent={COLORS.indigo} />
        <StatCard label="Cost of goods sold" value={money(cogs)} />
        <StatCard label="Gross profit" value={money(grossProfit)} accent={COLORS.green} />
        <StatCard label="Expenses" value={money(expenseTotal)} accent={COLORS.madder} />
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: "#38373C", background: COLORS.khadi }}>
        <div className="flex justify-between items-center">
          <span style={{ fontFamily: "Fraunces, serif", fontSize: "1.2rem" }}>Net profit</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1.2rem", color: netProfit >= 0 ? COLORS.green : COLORS.madder }}>
            {money(netProfit)}
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: "#A6A39B" }}>Revenue (excl. GST) − cost of goods sold − expenses, for the selected period.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm mb-2" style={{ fontFamily: "Fraunces, serif" }}>Expenses by category</h4>
          {expenseByCategory.length === 0 ? (
            <p className="text-sm" style={{ color: "#A6A39B" }}>No expenses in this period.</p>
          ) : (
            <div className="space-y-1">
              {expenseByCategory.map(([cat, amt]) => (
                <div key={cat} className="flex justify-between text-sm border-b pb-1" style={{ borderColor: "#38373C" }}>
                  <span>{cat}</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(amt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <h4 className="text-sm mb-2" style={{ fontFamily: "Fraunces, serif" }}>Other figures</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between border-b pb-1" style={{ borderColor: "#38373C" }}>
              <span style={{ color: "#A6A39B" }}>GST collected (payable to govt.)</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(gstCollected)}</span>
            </div>
            <div className="flex justify-between border-b pb-1" style={{ borderColor: "#38373C" }}>
              <span style={{ color: "#A6A39B" }}>Paid to suppliers this period</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace" }}>{money(purchasesCashPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "#A6A39B" }}>Total currently owed to suppliers</span>
              <span style={{ fontFamily: "JetBrains Mono, monospace", color: totalPayables > 0 ? COLORS.madder : COLORS.green }}>{money(totalPayables)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Users (admin only) ----------------
function UsersAdmin({ currentUser }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const emptyForm = { name: "", role: "biller", pin: "" };
  const [form, setForm] = useState(emptyForm);

  const load = () => {
    apiListUsers().then(setUsers).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const openAdd = () => { setForm(emptyForm); setEditingUser(null); setShowForm(true); setError(""); };
  const openEdit = (u) => { setForm({ name: u.name, role: u.role, pin: "" }); setEditingUser(u); setShowForm(true); setError(""); };

  const save = async () => {
    setError("");
    try {
      if (editingUser) {
        await apiUpdateUser(editingUser.id, { name: form.name, role: form.role, pin: form.pin || undefined });
      } else {
        await apiCreateUser({ name: form.name, role: form.role, pin: form.pin });
      }
      setShowForm(false);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Remove ${u.name}? They won't be able to log in anymore.`)) return;
    try {
      await apiDeleteUser(u.id);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 style={{ fontFamily: "Fraunces, serif" }}>Users & roles</h3>
        <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-white" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
          <Plus size={16} /> Add user
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 text-xs" style={{ color: "#A6A39B" }}>
        <p><strong>Admin</strong> — full access to every tab.</p>
        <p><strong>Biller</strong> — New Bill and Bills tabs only.</p>
        <p><strong>Inventory</strong> — Inventory and Purchases tabs only.</p>
      </div>
      {error && <p className="text-sm" style={{ color: COLORS.madder }}>{error}</p>}

      {users === null ? (
        <p className="text-sm" style={{ color: "#A6A39B" }}>Loading…</p>
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: COLORS.khadi }}>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "#38373C" }}>
                  <td className="px-3 py-2">{u.name}{u.id === currentUser.id && <span className="text-xs ml-1" style={{ color: "#A6A39B" }}>(you)</span>}</td>
                  <td className="px-3 py-2">{ROLE_LABELS[u.role] || u.role}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(u)} className="p-1"><Pencil size={14} style={{ color: "#A6A39B" }} /></button>
                      <button onClick={() => remove(u)} className="p-1"><Trash2 size={14} style={{ color: COLORS.madder }} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal onClose={() => setShowForm(false)}>
          <div className="flex justify-between items-center">
            <h3 style={{ fontFamily: "Fraunces, serif" }}>{editingUser ? "Edit user" : "Add user"}</h3>
            <button onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={inputStyle}>
            <option value="admin">Admin — full access</option>
            <option value="biller">Biller — New Bill + Bills only</option>
            <option value="inventory">Inventory — Inventory + Purchases only</option>
          </select>
          <input
            type="password" inputMode="numeric" maxLength={6}
            placeholder={editingUser ? "New PIN (leave blank to keep current)" : "4-6 digit PIN"}
            value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ ...inputStyle, fontFamily: "monospace" }}
          />
          <button onClick={save} className="w-full py-2 rounded-lg text-white text-sm" style={{ background: COLORS.indigo, color: "#1B1B1E" }}>
            {editingUser ? "Save changes" : "Add user"}
          </button>
        </Modal>
      )}
    </div>
  );
}

// ---------------- Audit Log (admin only) ----------------
const AUDIT_ACTIONS = ["login", "logout", "write", "delete", "user_create", "user_update", "user_delete"];

function AuditLogView() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const load = () => {
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    if (userFilter) params.user = userFilter;
    if (actionFilter) params.action = actionFilter;
    apiFetchAuditLog(params).then(setEntries).catch((e) => setError(e.message));
  };
  useEffect(load, [from, to, userFilter, actionFilter]);

  // The server already returns entries ordered newest-first (ORDER BY timestamp DESC).
  const { page, setPage, totalPages, paged } = usePagination(entries || []);

  const exportCSV = () => {
    if (!entries) return;
    downloadCSV(
      `audit-log_${todayISO()}.csv`,
      ["Timestamp", "User", "Role", "Action", "Data", "Details"],
      entries.map((e) => [e.timestamp, e.user_name, e.role, e.action, e.entity_key || "", e.details || ""])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 style={{ fontFamily: "Fraunces, serif" }}>Audit log</h3>
        <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border" style={{ borderColor: "#47454B", color: COLORS.ink }}>
          <Download size={13} /> Export CSV
        </button>
      </div>
      <p className="text-xs" style={{ color: "#A6A39B" }}>
        Every login and every change to shop data, recorded automatically by the server — this cannot be edited by any user, including Admins.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={inputStyle} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={inputStyle} />
        <input placeholder="Filter by user name" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={inputStyle} />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm outline-none" style={inputStyle}>
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {error && <p className="text-sm" style={{ color: COLORS.madder }}>{error}</p>}
      {entries === null ? (
        <p className="text-sm" style={{ color: "#A6A39B" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <EmptyState title="No activity yet" body="Actions will show up here as your team uses the app." />
      ) : (
        <div className="rounded-lg border overflow-hidden overflow-x-auto" style={{ borderColor: "#38373C" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ background: COLORS.khadi }}>
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
              <th className="text-left px-3 py-2 font-medium">Details</th>
            </tr></thead>
            <tbody>
              {paged.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: "#38373C" }}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#A6A39B", fontFamily: "JetBrains Mono, monospace" }}>
                    {new Date(e.timestamp).toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2">{e.user_name} <span className="text-xs" style={{ color: "#A6A39B" }}>({e.role})</span></td>
                  <td className="px-3 py-2">{e.action}</td>
                  <td className="px-3 py-2" style={{ color: "#A6A39B" }}>{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationBar page={page} setPage={setPage} totalPages={totalPages} totalItems={entries.length} />
        </div>
      )}
    </div>
  );
}
