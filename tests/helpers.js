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

// ── suggestNextSku: แนะนำ SKU ถัดไปจากสินค้าในหมวดเดียวกัน (จาก views-main.jsx) ──
function suggestNextSku(category, products) {
  const valid = (products || [])
    .filter(p => p && p.category === category)
    .map(p => String(p.sku || "").trim().toUpperCase())
    .filter(s => /^[A-Za-z]+\d+$/.test(s));
  if (!valid.length) return "";

  const groups = {};
  for (const s of valid) {
    const m = s.match(/^(.*?)(\d+)$/);
    if (!m) continue;
    (groups[m[1]] = groups[m[1]] || []).push({ num: parseInt(m[2], 10), width: m[2].length });
  }
  let base = "", bestCount = -1;
  for (const b of Object.keys(groups)) {
    const c = groups[b].length;
    if (c > bestCount || (c === bestCount && b.length > base.length)) { bestCount = c; base = b; }
  }
  let maxNum = -1, width = 1;
  for (const it of groups[base]) {
    if (it.num > maxNum) { maxNum = it.num; width = it.width; }
  }
  return base + String(maxNum + 1).padStart(width, "0");
}

// ── parseSkuParts: แยก SKU เป็น { prefix, variant, model } (จาก views-main.jsx) ──
// [Prefix 1–3 ตัวอักษร][Variant Code 2 หลัก][Model Number 3 หลัก] เช่น "OL19001" → OL/19/001
function parseSkuParts(sku) {
  const m = String(sku || "").trim().toUpperCase().match(/^([A-Z]{1,3})(\d{2})(\d{3})$/);
  if (!m) return null;
  return { prefix: m[1], variant: m[2], model: m[3] };
}

// ── nextModelForPrefix: หาเลข Model Number (3 หลัก) ถัดไปของ prefix (จาก views-main.jsx) ──
function nextModelForPrefix(prefix, products) {
  const pfx = String(prefix || "").trim().toUpperCase();
  if (!pfx) return "";
  let max = 0;
  (products || []).forEach(p => {
    const parts = parseSkuParts(p && p.sku);
    if (parts && parts.prefix === pfx) {
      const n = parseInt(parts.model, 10);
      if (n > max) max = n;
    }
  });
  return String(max + 1).padStart(3, "0");
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

// ── Constants จาก appsscript_complete.gs (1-based, ตรงกับ SHEET_PRODUCTS "อัพเดทจำนวนสินค้า") ──
// COL_PROD_SKU=2 (B), COL_PROD_QTYFS=7 (G=หน้าร้าน), COL_PROD_QTYWH=8 (H=คลัง)
const COL_PROD_SKU   = 2;
const COL_PROD_QTYFS = 7;
const COL_PROD_QTYWH = 8;

// ── mapProductRow: map row array จากชีต SHEET_PRODUCTS → { sku, qtyStore, qtyWH } ──
// รับ array 0-indexed (เหมือนที่ได้จาก sheet.getDataRange().getValues()[i])
// COL_PROD_* เป็น 1-based → แปลงเป็น 0-based ด้วย -1
// หมายเหตุ: ชีต "อัพเดทจำนวนสินค้า" (SHEET_PRODUCTS) ใช้สำหรับ เขียน/อัปเดต stock
//           ชีต "ข้อมูลสินค้า" ใช้สำหรับ อ่าน (readProducts_) มี layout ต่างกัน
function mapProductRow(row) {
  return {
    sku:      String(row[COL_PROD_SKU   - 1] || '').trim().toUpperCase(),
    qtyStore: Number(row[COL_PROD_QTYFS - 1]) || 0,
    qtyWH:    Number(row[COL_PROD_QTYWH - 1]) || 0,
  };
}

// ── shouldRejectConflict: ตรรกะ conflict detection (copy จาก GAS shouldRejectConflict_) ──
// คืน true = ควร reject (sheet ถูกแก้หลัง client โหลดเกิน slop window)
// clientLoadedAt, sheetLastModified = epoch ms; slopMs = ms (default 5000)
function shouldRejectConflict(clientLoadedAt, sheetLastModified, slopMs) {
  if (!clientLoadedAt || !sheetLastModified) return false;
  return sheetLastModified > Number(clientLoadedAt) + (slopMs || 5000);
}

// ── จาก views.jsx บรรทัด 7559–7603 ──────────────────────────────────────────
// orderSig: content signature ของ order — ผูก localStorage state เข้ากับ "ตัวตน"
// ของ order แทนเลขแถว (id เช่น "R5") ที่ถูก reuse เมื่อ order เก่าถูกลบ
function orderSig(o) {
  if (!o) return "";
  return `${(o.sku||'').trim().toUpperCase()}|${String(o.date||'').replace(/\D/g,'')}|${o.orderQty||0}`;
}

// reconcileOrderState: ตัดสินใจว่าจะ apply localStorage entry กับ order นี้หรือไม่
// คืน object ที่จะ spread ทับ order (ดู comment ใน views.jsx)
function reconcileOrderState(order, localEntry, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const SIX_H = 6 * 60 * 60 * 1000;
  const DONE_ST = new Set(["สำเร็จ","completed","ส่งแล้ว","shipped"]);
  const local = localEntry || {};
  if (!Object.keys(local).length) return {};

  const sheetPending = !order.status || order.status === "รอ" || order.status === "pending";
  const sig = orderSig(order);

  // row reuse: local มี sig แต่ไม่ตรง → state ของ order อื่น → ทิ้งทั้งหมด
  if (local.sig && local.sig !== sig) return {};

  const localTerminal = DONE_ST.has(local.status);
  if (sheetPending && localTerminal) {
    // ใช้ 6-hour check ทั้งกรณีมี sig และไม่มี sig
    // (no sig = ก่อน migration — ยังให้ผ่านได้ถ้าเพิ่งกด เพื่อไม่ทิ้ง "สำเร็จ" ที่ user เพิ่งกดไว้)
    const markedMs = local.markedAt ? new Date(local.markedAt).getTime() : NaN;
    const isRecent = !isNaN(markedMs) && (now - markedMs) < SIX_H;
    if (!isRecent) {
      const { status:_s, markedAt:_m, shipped:_sh, ...rest } = local;
      return rest;
    }
  }
  return local;
}

// patchOrderStateCore: pure version ของ patchOrderState (views-analytics.jsx)
// state = object { [id]: {status, sig, printFlag, ...} }, คืน state ใหม่ (mutate copy)
// บั๊กเดิม: merge ทับ entry ค้างของ order อื่น (row reuse) แล้วเขียน sig ทับ
//   → status เก่า ("ส่งแล้ว") ถูก adopt มาทับ order ใหม่ → order หายจากรายการ/สรุป
function patchOrderStateCore(state, id, updates, sig, nowIso) {
  const s = { ...(state || {}) };
  const prev = (sig != null && s[id] && s[id].sig && s[id].sig !== sig) ? {} : (s[id] || {});
  s[id] = { ...prev, ...updates };
  if (sig != null) s[id].sig = sig;
  if ('status' in updates) s[id].markedAt = nowIso || new Date().toISOString();
  return s;
}

// ── detectColor: pure logic จาก views.jsx:1434–1507 ─────────────────────────
const COLOR_MAP = {
  "บานเย็น":     { name:"บานเย็น",    hex:"#a82a6a", en:"Magenta" },
  "มิ้นต์":      { name:"มิ้นต์",     hex:"#9adcc1", en:"Mint" },
  "พีช":         { name:"พีช",        hex:"#e8b4a0", en:"Peach" },
  "ครีม":        { name:"ครีม",       hex:"#f0e2c0", en:"Cream" },
  "เบจ":         { name:"เบจ",        hex:"#d4bc94", en:"Beige" },
  "ทอง":         { name:"ทอง",        hex:"#c89030", en:"Gold" },
  "เงิน":        { name:"เงิน",       hex:"#bcbcbc", en:"Silver" },
  "ขาว":         { name:"ขาว",        hex:"#f4f4f4", en:"White" },
  "ดำ":          { name:"ดำ",         hex:"#2a2a2a", en:"Black" },
  "น้ำเงินเข้ม": { name:"น้ำเงินเข้ม", hex:"#1c3060", en:"NavyDark" },
  "น้ำเงินอ่อน": { name:"น้ำเงินอ่อน", hex:"#7096d0", en:"NavyLight" },
  "น้ำเงิน":     { name:"น้ำเงิน",    hex:"#2e4d8f", en:"Navy" },
  "น้ำตาลเข้ม": { name:"น้ำตาลเข้ม", hex:"#4a2810", en:"BrownDark" },
  "น้ำตาลอ่อน": { name:"น้ำตาลอ่อน", hex:"#c9a070", en:"BrownLight" },
  "น้ำตาล":     { name:"น้ำตาล",    hex:"#7a4e2a", en:"Brown" },
  "เหลืองเข้ม": { name:"เหลืองเข้ม", hex:"#c89010", en:"YellowDark" },
  "เหลืองอ่อน": { name:"เหลืองอ่อน", hex:"#fde98c", en:"YellowLight" },
  "เหลือง":     { name:"เหลือง",    hex:"#f4c220", en:"Yellow" },
  "เขียวเข้ม":  { name:"เขียวเข้ม",  hex:"#1e5c1e", en:"GreenDark" },
  "เขียวอ่อน":  { name:"เขียวอ่อน",  hex:"#80c880", en:"GreenLight" },
  "เขียว":      { name:"เขียว",     hex:"#3a8f3a", en:"Green" },
  "ชมพูเข้ม":   { name:"ชมพูเข้ม",   hex:"#d43878", en:"PinkDark" },
  "ชมพูอ่อน":   { name:"ชมพูอ่อน",   hex:"#f5c6d8", en:"PinkLight" },
  "ชมพู":       { name:"ชมพู",      hex:"#e88aa6", en:"Pink" },
  "ฟ้าเข้ม":    { name:"ฟ้าเข้ม",    hex:"#2878b8", en:"SkyDark" },
  "ฟ้าอ่อน":    { name:"ฟ้าอ่อน",    hex:"#b0d8f5", en:"SkyLight" },
  "ฟ้า":        { name:"ฟ้า",       hex:"#5aa3d6", en:"Sky" },
  "แดงเข้ม":    { name:"แดงเข้ม",    hex:"#880000", en:"RedDark" },
  "แดงอ่อน":    { name:"แดงอ่อน",    hex:"#e87070", en:"RedLight" },
  "แดง":        { name:"แดง",       hex:"#c5352a", en:"Red" },
  "ส้มเข้ม":    { name:"ส้มเข้ม",    hex:"#c85010", en:"OrangeDark" },
  "ส้มอ่อน":    { name:"ส้มอ่อน",    hex:"#f5c080", en:"OrangeLight" },
  "ส้ม":        { name:"ส้ม",       hex:"#e6862a", en:"Orange" },
  "ม่วงเข้ม":   { name:"ม่วงเข้ม",   hex:"#501878", en:"PurpleDark" },
  "ม่วงอ่อน":   { name:"ม่วงอ่อน",   hex:"#c0a0e0", en:"PurpleLight" },
  "ม่วง":       { name:"ม่วง",      hex:"#7c4ea8", en:"Purple" },
  "เทาเข้ม":    { name:"เทาเข้ม",    hex:"#505050", en:"GrayDark" },
  "เทาอ่อน":    { name:"เทาอ่อน",    hex:"#cccccc", en:"GrayLight" },
  "เทา":        { name:"เทา",       hex:"#909090", en:"Gray" },
};
// compound keys ก่อน เพื่อให้ "เขียวเข้ม" match ก่อน "เขียว", "น้ำเงิน" ก่อน "เงิน"
const COLOR_KEYS = [
  "บานเย็น",
  "น้ำเงินเข้ม","น้ำเงินอ่อน","น้ำเงิน",
  "น้ำตาลเข้ม","น้ำตาลอ่อน","น้ำตาล",
  "มิ้นต์","พีช","ครีม","เบจ","ทอง","เงิน",
  "เหลืองเข้ม","เหลืองอ่อน","เหลือง",
  "เขียวเข้ม","เขียวอ่อน","เขียว",
  "ชมพูเข้ม","ชมพูอ่อน","ชมพู",
  "ฟ้าเข้ม","ฟ้าอ่อน","ฟ้า",
  "แดงเข้ม","แดงอ่อน","แดง",
  "ส้มเข้ม","ส้มอ่อน","ส้ม",
  "ม่วงเข้ม","ม่วงอ่อน","ม่วง",
  "เทาเข้ม","เทาอ่อน","เทา",
  "ขาว","ดำ",
];
function detectColor(text) {
  if (!text) return null;
  const s = String(text);
  for (const k of COLOR_KEYS) if (s.indexOf(k) >= 0) return COLOR_MAP[k];
  return null;
}

// ── parseQty_ / parseNum_ / parseLocation_ จาก appsscript_complete.gs:2631–2652 ─
function parseQty_(val) {
  if (val == null || val === '') return { num: 0, status: 'empty' };
  const s = String(val).toLowerCase().trim();
  if (s.includes('out of stock full')) return { num: 0, status: 'oosfull' };
  if (s.includes('out of stock'))      return { num: 0, status: 'oos' };
  const n = parseInt(String(val).replace(/[,\s]/g, ''));
  if (isNaN(n)) return { num: 0, status: 'unknown' };
  return { num: n, status: n < 0 ? 'negative' : 'ok' };
}

function parseNum_(val) {
  if (val == null || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,\s฿]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseLocation_(loc) {
  if (!loc) return null;
  const m = String(loc).trim().match(/^([AB])(\d+)\/(\d+)$/i);
  if (!m) return null;
  return { raw: String(loc).trim(), valid: true, side: m[1].toUpperCase(), shelf: +m[2], lock: +m[3] };
}

// ── monthKey_ / dayKey_ จาก appsscript_complete.gs:2654–2672 ─────────────────
function monthKey_(val) {
  if (val instanceof Date) return `${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  const s = String(val).trim();
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2].padStart(2,'0')}/${m[3]}`;
  return null;
}

function dayKey_(val) {
  if (val instanceof Date) {
    return `${String(val.getDate()).padStart(2,'0')}/${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
  return null;
}

// ── deductStockCore: pure math จาก deductStock (appsscript_complete.gs:959–983) ─
// แยก Sheet I/O ออก — ทดสอบแค่ตรรกะ drain WH ก่อน แล้วล้นมา FS
function deductStockCore({ whQty, fsQty }, qty) {
  let deductWH = Math.min(qty, whQty);
  let deductFS = qty - deductWH;
  if (deductFS > fsQty) deductFS = fsQty;
  const shortfall = qty - (deductWH + deductFS);
  return {
    deductWH, deductFS,
    newWH: whQty - deductWH,
    newFS: fsQty - deductFS,
    shortfall: shortfall > 0,
    shortfall_qty: shortfall,
  };
}

// ── netOf: pure logic จาก closeMtoJob (appsscript_complete.gs:3763) ──────────
// คำนวณ qty สุทธิ หลังหักของที่ return คืน — clamp return ไว้ที่ [0, qty]
function netOf(item) {
  const qty = Number(item.qty) || 0;
  const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
  return qty - ret;
}

// ── enrichDataCore: pure logic จาก enrichData (app.jsx:231) ──────────────────
// ไม่รวม browser globals (detectColor, mtoBase) เพื่อให้รันใน Node ได้
// ใช้ monthsSince ที่นิยามไว้ด้านบนในไฟล์นี้
function enrichDataCore(d) {
  if (!d || !Array.isArray(d.products)) return d;
  const THAI_RE = /[฀-๿]/;
  d.products.forEach(p => {
    if (!p.cat && p.category) p.cat = p.category;
    const rawTags = String(p.tag || '').split(',').map(t => t.trim()).filter(Boolean);
    p.supplierTags = rawTags.filter(t => !THAI_RE.test(t));
    p.statusTags   = rawTags.filter(t =>  THAI_RE.test(t));
    let dm = null;
    const whOnHand = (p.warehouseQty != null) ? p.warehouseQty
                   : (p.qtyWH != null) ? p.qtyWH
                   : (p.qty || 0);
    if (whOnHand > 0) {
      const a = monthsSince(p.lastTransferDate);
      dm = (a != null) ? a : ((monthsSince(p.lastStockInDate) != null) ? monthsSince(p.lastStockInDate) : null);
    }
    p.deadMonths = dm;
    if (p.supplierTags.length) p.vendor = p.supplierTags[0];
  });
  return d;
}

// ─── MTO draft dedup (จำลอง logic saveMtoJobItems + closeMtoJob) ───
// rows = แถวในชีต "วัตถุดิบ MTO" (array of arrays). คอลัมน์ 0=jobId, 7=closedAt
// คืน rows ใหม่หลัง "ลบแถว draft (closedAt ว่าง) ของ jobId แล้ว append items"
// closedAt="" = บันทึก draft, closedAt มีค่า = ปิดงาน
function writeMtoItemsCore(rows, jobId, items, closedAt) {
  const jid = String(jobId).trim();
  // ลบแถว draft (closedAt ว่าง) ของ job นี้
  const kept = rows.filter((r, i) => {
    if (i === 0) return true; // header
    const sameJob = String(r[0]).trim() === jid;
    const isDraft = !String(r[7] || "").trim();
    return !(sameJob && isDraft);
  });
  // append items ใหม่
  items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
    kept.push([jid, item.sku || "", item.name || "", qty, item.warehouse || "warehouse", ret, qty - ret, closedAt || ""]);
  });
  return kept;
}

// ── transferBatchCore: pure batch transfer logic (จาก transferStockBatch, appsscript_complete.gs:736)
// แยก Sheet I/O, LockService, CacheService, ZORT, Audit log ออก — ทดสอบแค่ตรรกะ
// data: 2D array (row 0 = header, row 1+ = data) เหมือน sheet.getDataRange().getValues()
// list: [{sku, qty, orderId, name}]
// alreadyProcessedIds: Set หรือ array ของ orderId ที่ส่งไปแล้ว (idempotency)
// คืน: { results, transferred, shortfalls, newIdempotency, data (mutated copy) }
//       หรือ { error } ถ้า list ว่าง
function transferBatchCore(data, list, alreadyProcessedIds) {
  if (!Array.isArray(list) || !list.length) return { error: "list ว่างเปล่า" };
  const idempotent = new Set(alreadyProcessedIds || []);
  const transferred = [];
  const results = [];
  const shortfalls = [];
  const newIdempotency = [];
  const dataCopy = data.map(r => [...r]);
  for (const item of list) {
    const sku      = String(item.sku || "").trim().toUpperCase();
    const qty      = Number(item.qty) || 0;
    const orderId  = String(item.orderId || "");
    if (!sku || qty <= 0) { results.push({ sku, orderId, skipped: true }); continue; }
    if (orderId && idempotent.has(orderId)) {
      results.push({ sku, orderId, duplicate: true });
      continue;
    }
    let found = false;
    for (let i = 1; i < dataCopy.length; i++) {
      if (String(dataCopy[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
        const whQty  = Number(dataCopy[i][COL_PROD_QTYWH - 1]) || 0;
        const fsQty  = Number(dataCopy[i][COL_PROD_QTYFS - 1]) || 0;
        const actual = Math.min(qty, whQty);
        const name   = item.name || String(dataCopy[i][2] || "").trim();
        const newWH  = whQty - actual;
        const newFS  = fsQty + actual;
        dataCopy[i][COL_PROD_QTYWH - 1] = newWH;
        dataCopy[i][COL_PROD_QTYFS - 1] = newFS;
        if (actual > 0) {
          transferred.push({ sku, name, qty: actual });
          if (orderId) newIdempotency.push(orderId);
        }
        if (actual < qty) shortfalls.push({ sku, name, requested: qty, transferred: actual });
        results.push({ sku, orderId, requested: qty, transferred: actual, newWH, newFS });
        found = true;
        break;
      }
    }
    if (!found) results.push({ sku, orderId, notFound: true });
  }
  return { results, transferred, shortfalls, newIdempotency, data: dataCopy };
}

// ── cleanupOrdersStateCore: pure logic จาก cleanupOrdersState (views-analytics.jsx:2436)
// ลบ entry ที่ sig ไม่ตรง validSigs ใด และ id ก็ไม่ตรง validIds ใด
// state: {[id]: {sig, ...}}, validIds: Set/array, validSigs: Set/array
// คืน state ใหม่ (ไม่แตะ localStorage)
function cleanupOrdersStateCore(state, validIds, validSigs) {
  const s = { ...(state || {}) };
  const ids  = new Set(validIds  || []);
  const sigs = new Set(validSigs || []);
  Object.keys(s).forEach(id => {
    const e = s[id] || {};
    if (e.sig && !sigs.has(e.sig) && !ids.has(id)) delete s[id];
  });
  return s;
}

// ── stableOrderId: สร้าง key สำหรับ order (จาก views-analytics.jsx:2836)
function stableOrderId(o, i) {
  if (o.id) return String(o.id);
  const parts = [o.sku || '', String(o.date || '').replace(/\D/g, ''), String(o.orderQty || 0)];
  return parts.join('_') || String(i);
}

// ── buildYoYSeries: จัด monthlyByCat เป็นแถว 12 เดือน คอลัมน์ละปี (จาก views-main.jsx) ──
const THAI_MONTHS_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function buildYoYSeries(monthLabels, monthlyByCat) {
  const years = [...new Set((monthLabels || [])
    .map(m => String(m).split("/")[1])
    .filter(y => y && /^\d{4}$/.test(y)))].sort();
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, "0");
    const row = { label: THAI_MONTHS_ABBR[m - 1], month: mm };
    years.forEach(y => {
      const cats = (monthlyByCat || {})[mm + "/" + y];
      if (cats) {
        let rev = 0, qty = 0;
        Object.keys(cats).forEach(c => { if (c === "ไม่มีรหัสสินค้า") return; rev += cats[c].sales || 0; qty += cats[c].qty || 0; });
        row["y" + y] = rev;
        row["q" + y] = qty;
      }
    });
    rows.push(row);
  }
  return { years, rows };
}

// ── abcClassify: ABC classification จาก cumulative revenue (จาก views-analytics.jsx) ──
function abcClassify(products) {
  const sorted = (products || [])
    .filter(p => p && p.sku && p.cat !== "ไม่มีรหัสสินค้า")
    .map(p => ({ sku: p.sku, rev: p.soldRev || 0 }))
    .sort((a, b) => b.rev - a.rev);
  const total = sorted.reduce((s, p) => s + p.rev, 0);
  const map = {};
  let cum = 0;
  sorted.forEach(p => {
    if (total <= 0 || p.rev <= 0) { map[p.sku] = "C"; return; }
    const before = cum / total;
    cum += p.rev;
    map[p.sku] = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
  });
  return map;
}

// ── parseCheckDateMs: แปลงวันที่เช็ค/นับจากชีตเป็น ms รองรับปี พ.ศ. (จาก views-analytics.jsx) ──
function parseCheckDateMs(s) {
  if (!s) return NaN;
  const m = String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    let yr = Number(m[3]);
    if (yr < 100) yr += 2000;
    if (yr >= 2400) yr -= 543; // พ.ศ. → ค.ศ.
    return new Date(yr, Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return NaN;
  if (d.getFullYear() >= 2400) d.setFullYear(d.getFullYear() - 543); // ISO ปี พ.ศ.
  return d.getTime();
}

// ── sanitizeThresholds: validate เกณฑ์แจ้งเตือนที่ client ส่งมา (จาก appsscript_complete.gs) ──
const THRESHOLDS_DEFAULT = {
  default: 36,
  overrides: { "แจกันแก้ว": 3, "เรซิ่นและอื่นๆ": 3 },
  coverMonths: 2,
};
function sanitizeThresholds(t) {
  if (!t || typeof t !== 'object') return null;
  var def = parseInt(t.default, 10);
  var cover = parseInt(t.coverMonths, 10);
  var out = {
    default:     (isNaN(def) || def < 0 || def > 100000) ? THRESHOLDS_DEFAULT.default : def,
    overrides:   {},
    coverMonths: (isNaN(cover) || cover < 1 || cover > 24) ? THRESHOLDS_DEFAULT.coverMonths : cover,
  };
  var ov = (t.overrides && typeof t.overrides === 'object') ? t.overrides : {};
  Object.keys(ov).slice(0, 200).forEach(function (cat) {
    var v = parseInt(ov[cat], 10);
    if (!isNaN(v) && v >= 0 && v <= 100000) out.overrides[String(cat).slice(0, 100)] = v;
  });
  return out;
}

module.exports = {
  monthsSince, fmtN, fmtB, fmtPct, monthLabel,
  stockQty, whQty, mtoBase, compareSku,
  COL_PROD_SKU, COL_PROD_QTYFS, COL_PROD_QTYWH,
  mapProductRow, shouldRejectConflict,
  orderSig, reconcileOrderState, patchOrderStateCore,
  monthKey_, dayKey_,
  deductStockCore,
  netOf, writeMtoItemsCore,
  enrichDataCore,
  COLOR_MAP, COLOR_KEYS, detectColor,
  parseQty_, parseNum_, parseLocation_,
  transferBatchCore,
  cleanupOrdersStateCore, stableOrderId,
  buildYoYSeries, abcClassify, sanitizeThresholds, THRESHOLDS_DEFAULT,
  parseCheckDateMs, suggestNextSku,
  parseSkuParts, nextModelForPrefix,
};
