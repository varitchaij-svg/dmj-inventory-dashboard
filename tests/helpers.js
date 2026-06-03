// tests/helpers.js
// Pure functions copied from source files for isolated unit testing.
// Browser globals (React, window) ไม่มีใน Node — copy ตรงจากต้นทาง
// ไม่ import/export ES module เพราะ tests ใช้ CommonJS (Vitest default)

// ── จาก app.jsx บรรทัด 252–267 ──────────────────────────────────────────────
function monthsSince(d) {
  if (!d) return null;
  const now = new Date();
  let ref = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {              // yyyy-MM-dd
    const [y, m, day] = d.substring(0,10).split("-").map(Number);
    ref = new Date(y, m - 1, day);
  } else {                                          // DD/MM/YYYY (legacy)
    const parts = String(d).split("/");
    if (parts.length === 3) ref = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  }
  if (!ref || isNaN(ref)) return null;
  let mo = (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());
  if (now.getDate() < ref.getDate()) mo -= 1;       // ยังไม่ครบเดือนเต็ม
  return mo < 0 ? 0 : mo;
}

// ── จาก ui.jsx ───────────────────────────────────────────────────────────────
function fmtN(n) {
  return (n == null || isNaN(n)) ? "0" : Math.round(n).toLocaleString();
}

function fmtB(n) {
  if (n == null || isNaN(n)) return "฿0";
  const a = Math.abs(n);
  if (a >= 1e6) return `฿${(n/1e6).toFixed(2)}M`;
  if (a >= 1e3) return `฿${(n/1e3).toFixed(1)}K`;
  return `฿${Math.round(n).toLocaleString()}`;
}

function fmtPct(n, decimals=1) {
  return n == null ? "—" : `${(n*100).toFixed(decimals)}%`;
}

function monthLabel(ym) {
  // ym = "01/2026"
  const [m, y] = (ym || "").split("/");
  const names = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${names[parseInt(m,10)-1] || m} ${y ? y.slice(-2) : ""}`;
}

// ── จาก views.jsx บรรทัด 1466–1489 ──────────────────────────────────────────
function stockQty(p) {
  if (!p) return 0;
  return (p.qtyStore > 0 || p.qtyWH > 0)
    ? (p.qtyStore || 0) + (p.qtyWH || 0)
    : (p.qty || 0);
}

function whQty(p) {
  if (!p) return 0;
  if (p.warehouseQty != null) return p.warehouseQty;
  if (p.qtyWH        != null) return p.qtyWH;
  return p.qty != null ? p.qty : 0;
}

function mtoBase(name) {
  if (!name) return 'งานพิเศษ';
  return String(name)
    .replace(/\s*#\s*\d+.*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .trim() || 'งานพิเศษ';
}

// ── จาก views.jsx บรรทัด 1355–1367 ──────────────────────────────────────────
// รับ object ที่มี property .sku (เหมือน Array.sort comparator)
function compareSku(a, b) {
  const parse = (sku) => {
    if (!sku) return ["", 9999, 9999];
    const m = String(sku).match(/^([A-Za-z]+)(\d{2})(\d+)$/);
    if (m) return [m[1].toUpperCase(), parseInt(m[2], 10), parseInt(m[3], 10)];
    return [String(sku).toUpperCase(), 9999, 9999];
  };
  const [pa, ca, sa] = parse(a.sku);
  const [pb, cb, sb] = parse(b.sku);
  return pa.localeCompare(pb) || ca - cb || sa - sb;
}

module.exports = { monthsSince, fmtN, fmtB, fmtPct, monthLabel, stockQty, whQty, mtoBase, compareSku };
