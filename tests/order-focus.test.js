// tests/order-focus.test.js
// ─────────────────────────────────────────────────────────────────────────────
// 2 เรื่องที่เจ้าของสั่ง (ส.ค. 2026) — ทั้งคู่พังแล้ว "ไม่มี error ให้เห็น" ทั้งคู่:
//
//   1. ของหิ้วต้องอยู่บนสุดของหน้ารายการสั่งของ — ลูกค้ายืนรออยู่หน้าร้าน
//      พังแล้วเป็นยังไง: ลิสต์ยังเรนเดอร์ครบทุกใบเหมือนเดิม แค่ของหิ้วจมอยู่ใบที่ 30
//      พนักงานเลื่อนไม่ถึง → ลูกค้ารอเก้อ ไม่มีอะไรบนจอบอกว่าผิดปกติ
//
//   2. กดแจ้งเตือนแล้วต้องพาไปหยุดที่ "ของชิ้นที่ต้องจัด" ไม่ใช่แค่เปิดแท็บทิ้งไว้
//      พังแล้วเป็นยังไง: กดแล้วสลับแท็บได้ปกติทุกประการ แค่ไม่เด้งไปไหนต่อ
//      — แยกไม่ออกเลยจาก "ระบบทำงานถูกแล้ว" ถ้าไม่มีเทสต์คุมสายส่งทั้งเส้น
//
// eval โค้ดจริงจาก .jsx (ไม่ copy) — หลักเดียวกับ auth.test.js/order-idempotent.test.js
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const UI   = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');

// ── ดึงตัวจัดลำดับจริงของ OrderListView มารัน (ไม่ copy สูตรมาไว้ในเทสต์) ──
function realSort(orders) {
  const m = VANA.match(/const isPendingOrder = [\s\S]*?\n {2}\}\), \[enriched\]\);/);
  if (!m) throw new Error('หาตัวจัดลำดับของ OrderListView ไม่เจอ (โครงสร้างเปลี่ยน?)');
  // uM = useMemo — ในเทสต์ให้เรียกฟังก์ชันทันที ไม่ต้องมี React
  const fn = new Function('enriched', 'uM', `${m[0]}\n  return sorted;`);
  return fn(orders, (f) => f());
}

const ord = (id, carry, status) => ({ id, carryMode: carry ? 'carry' : 'truck', status });
const ids = (arr) => arr.map((o) => o.id);

describe('รายการสั่งของ — ของหิ้วอยู่บนสุด', () => {
  it('ของหิ้วขึ้นก่อนของขึ้นรถเสมอ', () => {
    const out = realSort([
      ord('t1', false, 'รอ'),
      ord('c1', true, 'รอ'),
      ord('t2', false, 'รอ'),
      ord('c2', true, 'รอ'),
    ]);
    expect(ids(out)).toEqual(['c1', 'c2', 't1', 't2']);
  });

  it('ของหิ้วที่ "จัดเสร็จแล้ว" ยังอยู่เหนือของขึ้นรถที่ "ยังไม่จัด" — หิ้วเป็นเกณฑ์แรก', () => {
    // ถ้าเผลอสลับลำดับเกณฑ์ (เอา pending ขึ้นก่อน) เคสนี้จะกลับด้าน โดยหน้าจอยังดูปกติทุกอย่าง
    const out = realSort([ord('t-รอ', false, 'รอ'), ord('c-เสร็จ', true, 'สำเร็จ')]);
    expect(ids(out)).toEqual(['c-เสร็จ', 't-รอ']);
  });

  it('ในกลุ่มเดียวกัน ที่ยังไม่จัดขึ้นก่อนที่จัดเสร็จแล้ว', () => {
    expect(ids(realSort([ord('c-เสร็จ', true, 'สำเร็จ'), ord('c-รอ', true, 'รอ')])))
      .toEqual(['c-รอ', 'c-เสร็จ']);
    expect(ids(realSort([ord('t-เสร็จ', false, 'completed'), ord('t-รอ', false, 'pending')])))
      .toEqual(['t-รอ', 't-เสร็จ']);
  });

  it('ไม่มี status (แถวใหม่จากชีต) นับเป็น "ยังไม่จัด"', () => {
    expect(ids(realSort([ord('เสร็จ', false, 'สำเร็จ'), ord('ว่าง', false, undefined)])))
      .toEqual(['ว่าง', 'เสร็จ']);
  });

  it('carryMode ที่ไม่ใช่ "carry" ทุกค่า (undefined/ว่าง/truck) นับเป็นขึ้นรถ — ไม่มีกลุ่มที่ 3', () => {
    const out = realSort([
      { id: 'undef', status: 'รอ' },
      { id: 'ว่าง', carryMode: '', status: 'รอ' },
      { id: 'หิ้ว', carryMode: 'carry', status: 'รอ' },
    ]);
    expect(out[0].id).toBe('หิ้ว');
    expect(ids(out).slice(1).sort()).toEqual(['undef', 'ว่าง'].sort());
  });

  it('ลำดับเดิมคงไว้เมื่อเทียบเท่ากัน (stable) — ไม่สลับใบมั่วทุกครั้งที่ poll', () => {
    // เรียงใหม่ทุก 15 วิ ถ้าไม่ stable ใบจะเต้นสลับที่เอง คนกำลังกรอกเลขอยู่จะกรอกผิดใบ
    const same = ['a', 'b', 'c', 'd'].map((id) => ord(id, false, 'รอ'));
    expect(ids(realSort(same))).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('หัวข้อคั่นกลุ่ม หิ้ว/ขึ้นรถ', () => {
  it('อ่านจากลำดับที่จัดไว้แล้ว ไม่จัดกลุ่มซ้ำเอง (กันตัวจัดลำดับ 2 ตัวเพี้ยนคนละทาง)', () => {
    expect(VANA).toMatch(/const head = both && \(i === 0 \|\| \(filtered\[i-1\]\.carryMode === "carry"\) !== carry\)/);
  });

  it('มีทั้ง 2 แบบเท่านั้นถึงโชว์หัวข้อ (มีแบบเดียว = ไม่มีอะไรให้แยก)', () => {
    expect(VANA).toMatch(/const both = nCarry > 0 && nCarry < filtered\.length/);
  });

  it('OrderGroupHead มีจริงและแยกสีตามกลุ่ม', () => {
    const fn = VANA.match(/function OrderGroupHead\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('🚶');
    expect(fn).toContain('🚛');
    expect(fn).toMatch(/carry \?/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// กดแจ้งเตือน → เด้งไปที่ของชิ้นนั้น
// ─────────────────────────────────────────────────────────────────────────────

// eval ตัวจริงจาก ui.jsx (ไม่ copy) — ต้องมี window/document ปลอมให้ครบก่อน
function loadFocusFns() {
  const src = UI.match(/const DMJ_FOCUS_TTL_MS[\s\S]*?\nfunction NotiBell/)[0]
    .replace(/\nfunction NotiBell$/, '');
  const fn = new Function(
    'window', 'document', 'setTimeout', 'CustomEvent',
    `${src}\nreturn { dmjRequestFocus, dmjScrollToSku, DMJ_FOCUS_TTL_MS };`
  );
  return fn;
}

describe('dmjRequestFocus — ตั้งคำขอ "พาไปที่ของชิ้นนี้"', () => {
  let win, events, api;
  beforeEach(() => {
    events = [];
    win = { dispatchEvent: (e) => events.push(e) };
    api = loadFocusFns()(win, {}, (f) => f(), class { constructor(t) { this.type = t; } });
  });

  it('เก็บ tab + sku + เวลา แล้วยิง event ให้ view ที่ mount อยู่แล้วรู้ตัว', () => {
    api.dmjRequestFocus('orders', 'G00413C');
    expect(win._dmjFocusReq).toMatchObject({ tab: 'orders', sku: 'G00413C' });
    expect(win._dmjFocusReq.ts).toBeGreaterThan(0);
    expect(events.length).toBe(1);
  });

  it('ตัดช่องว่างหัวท้าย (ค่าจากชีตมีเว้นวรรคติดมาได้)', () => {
    api.dmjRequestFocus('orders', '  G00413C  ');
    expect(win._dmjFocusReq.sku).toBe('G00413C');
  });

  it('ไม่มี sku → ล้างคำขอเก่าทิ้ง ไม่ใช่ปล่อยค้าง', () => {
    // ปล่อยค้าง = กดแจ้งเตือนอันที่ไม่มีเป้าหมาย แล้วจู่ ๆ ไปเด้งของอันก่อนหน้าแทน
    api.dmjRequestFocus('orders', 'G00413C');
    api.dmjRequestFocus('stock', '');
    expect(win._dmjFocusReq).toBe(null);
    expect(events.length).toBe(1);        // ไม่ยิง event รอบที่สอง
  });

  it('undefined (แจ้งเตือนแถวเก่าที่ยังไม่มีคอลัมน์ focus) ไม่ทำให้พัง', () => {
    expect(() => api.dmjRequestFocus('orders', undefined)).not.toThrow();
    expect(win._dmjFocusReq).toBe(null);
  });
});

describe('dmjScrollToSku — หาแถวแล้วพาไปหยุดตรงนั้น', () => {
  let doc, rows, api;
  const mkRow = (sku) => {
    const cls = new Set();
    return {
      _sku: sku, _scrolled: false,
      getAttribute: (a) => (a === 'data-order-sku' ? sku : null),
      scrollIntoView() { this._scrolled = true; },
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) },
    };
  };
  beforeEach(() => {
    vi.useFakeTimers();
    rows = [];
    doc = { querySelectorAll: () => rows };
    api = loadFocusFns()({ dispatchEvent() {} }, doc, setTimeout, class {});
  });
  afterEach(() => vi.useRealTimers());

  it('เจอแถว → เลื่อนไปหา + ติดคลาสกะพริบ + บอกผู้เรียกว่าเจอ', () => {
    rows = [mkRow('AAA'), mkRow('G00413C')];
    const seen = [];
    api.dmjScrollToSku('data-order-sku', 'G00413C', (ok) => seen.push(ok));
    vi.advanceTimersByTime(200);
    expect(rows[1]._scrolled).toBe(true);
    expect(rows[1].classList.has('dmj-focus-flash')).toBe(true);
    expect(seen).toEqual([true]);
    expect(rows[0]._scrolled).toBe(false);
  });

  it('เทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง (SKU ในชีตพิมพ์มาไม่เหมือนกันเสมอ)', () => {
    rows = [mkRow(' g00413c ')];
    api.dmjScrollToSku('data-order-sku', 'G00413C');
    vi.advanceTimersByTime(200);
    expect(rows[0]._scrolled).toBe(true);
  });

  it('แถวยังไม่มา (ข้อมูลกำลังโหลด) → ลองซ้ำจนเจอ ไม่ใช่ยิงครั้งเดียวแล้วยอมแพ้', () => {
    rows = [];
    const seen = [];
    api.dmjScrollToSku('data-order-sku', 'ZZZ', (ok) => seen.push(ok));
    vi.advanceTimersByTime(600);
    expect(seen).toEqual([]);              // ยังไม่สรุปผล
    rows = [mkRow('ZZZ')];                 // payload มาถึงทีหลัง
    vi.advanceTimersByTime(1200);
    expect(rows[0]._scrolled).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('หาไม่เจอจนหมดเวลา → บอกผู้เรียกว่าไม่เจอ (ห้ามเงียบ)', () => {
    // เงียบ = ผู้ใช้กดแล้วไม่มีอะไรเกิดขึ้น แยกไม่ออกจาก "แอปค้าง"
    rows = [mkRow('AAA')];
    const seen = [];
    api.dmjScrollToSku('data-order-sku', 'ไม่มีจริง', (ok) => seen.push(ok));
    vi.advanceTimersByTime(10000);
    expect(seen).toEqual([false]);
  });

  it('เลิกลองเมื่อครบจำนวนครั้ง ไม่วนไม่รู้จบ', () => {
    rows = [];
    let calls = 0;
    doc.querySelectorAll = () => { calls++; return []; };
    api.dmjScrollToSku('data-order-sku', 'ZZZ');
    vi.advanceTimersByTime(60000);
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(10);
  });

  it('ไม่ประกอบ CSS selector จาก sku — sku มาจากชีต มีอักขระอะไรก็ได้', () => {
    // ประกอบ selector = querySelector โยน error ทั้งก้อนเมื่อ sku มี " หรือ ] ปนมา
    let asked = null;
    doc.querySelectorAll = (sel) => { asked = sel; return []; };
    api.dmjScrollToSku('data-order-sku', 'A"B]C');
    vi.advanceTimersByTime(200);
    expect(asked).toBe('[data-order-sku]');
    expect(asked).not.toContain('A"B]C');
  });

  it('sku ว่าง = ไม่ทำอะไรเลย ไม่ไปแตะ DOM', () => {
    let touched = false;
    doc.querySelectorAll = () => { touched = true; return []; };
    api.dmjScrollToSku('data-order-sku', '');
    vi.advanceTimersByTime(5000);
    expect(touched).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// สายส่งทั้งเส้น: GAS เขียน → GAS ส่งกลับ → กระดิ่งส่งต่อ → app ตั้งคำขอ → view รับ
// ขาดข้อใดข้อหนึ่ง = กดแจ้งเตือนแล้วสลับแท็บได้ปกติ แต่ไม่เด้งไปไหน (ไม่มี error ให้เห็น)
// ─────────────────────────────────────────────────────────────────────────────
describe('สายส่งของ focus (meta)', () => {
  it('GAS: FOCUS ต่อท้ายเป็นคอลัมน์สุดท้าย ไม่แทรกกลาง', () => {
    const m = GS.match(/var INAPP_COL = \{[\s\S]*?\};/)[0];
    expect(m).toMatch(/FOCUS:13/);
    // แทรกกลาง = ตำแหน่ง READBY/EXPIRES เพี้ยนย้อนหลังทั้งชีต (บทเรียนข้อ 5)
    expect(m).toMatch(/READBY:10/);
    expect(m).toMatch(/EXPIRES:11/);
    expect(m).toMatch(/IMAGE:12/);
    const h = GS.match(/var INAPP_HEADERS = \[[\s\S]*?\];/)[0];
    expect(h).toMatch(/"focusSku"\]/);   // ต้องเป็นตัวท้ายสุดของหัวตาราง
  });

  it('GAS: pushInappNoti_ เขียนคอลัมน์ focus จริง', () => {
    const fn = GS.match(/function pushInappNoti_\(opts\)[\s\S]*?\n}/)[0];
    expect(fn).toMatch(/String\(opts\.focus \|\| ''\)/);
  });

  it('GAS: listInappNotiHandler_ ส่ง focus กลับไปให้ frontend', () => {
    const fn = GS.match(/function listInappNotiHandler_[\s\S]*?\n}/)[0];
    expect(fn).toMatch(/focus:\s*String\(r\[INAPP_COL\.FOCUS - 1\]/);
  });

  it('GAS: ใส่ focus เฉพาะแจ้งเตือนที่ผูกกับ SKU เดียวจริง ๆ', () => {
    // แจ้งเตือนที่รวมหลาย SKU (โอนทั้งชุด/สต็อกใกล้หมด) ห้ามใส่ — เลือกตัวใดตัวหนึ่งมาเด้ง
    // = พาไปผิดตัวโดยผู้ใช้ไม่รู้ว่ายังมีตัวอื่นค้างอยู่อีก
    const blocks = [...GS.matchAll(/pushInappNoti_\(\{[\s\S]*?\n\s*\}\);/g)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    const withFocus = blocks.filter((b) => /focus:/.test(b));
    expect(withFocus.length, 'ไม่มี call site ไหนส่ง focus เลย').toBeGreaterThan(0);
    withFocus.forEach((b) => {
      expect(b, 'แจ้งเตือนรวมหลาย SKU ห้ามใส่ focus').not.toMatch(/รายการ' \+|transferred\.length/);
    });
  });

  it('กระดิ่ง: ส่ง focus ต่อไปให้ onNavigate ไม่ใช่ส่งแค่ tab', () => {
    expect(UI).toMatch(/onNavigate\(it\.tab, it\.focus\)/);
  });

  it('app.jsx: ตั้งคำขอ "ก่อน" สลับแท็บ (view ปลายทางเพิ่ง mount ทีหลัง)', () => {
    // สลับแท็บก่อนแล้วค่อยตั้งคำขอ = view mount ไปแล้วตอนที่ยังไม่มีคำขอให้อ่าน
    // → พลาดจังหวะ แล้วไม่มีใครยิง event ซ้ำให้อีก
    const iReq = APP.indexOf('dmjRequestFocus(t, focus)');
    const iTab = APP.indexOf('handleSetTab(t);\n            }}/>');
    expect(iReq, 'app.jsx ไม่ได้เรียก dmjRequestFocus').toBeGreaterThan(0);
    expect(iTab).toBeGreaterThan(0);
    expect(iReq).toBeLessThan(iTab);
  });

  it('app.jsx: ยังกันแท็บที่ role นั้นไม่มีสิทธิ์เปิดอยู่', () => {
    const blk = APP.match(/<NotiBell onNavigate=\{[\s\S]*?\}\}\/>/)[0];
    expect(blk).toMatch(/allowedTabIds\.includes\(t\)/);
    // ต้อง return ออกก่อน ไม่ใช่ตั้งคำขอค้างไว้ให้แท็บอื่นไปกินทีหลัง
    expect(blk).toMatch(/if \(!allowedTabIds\.includes\(t\)\) return;/);
  });

  it('view ปลายทางรับคำขอครบทุกแท็บที่ GAS ยิง focus ไป', () => {
    // ยิง focus ไปแท็บที่ไม่มีตัวรับ = ข้อมูลถูกเขียนลงชีตทุกวันแต่ไม่มีใครใช้ (ตายเงียบ)
    const targets = [...GS.matchAll(/pushInappNoti_\(\{[\s\S]*?\n\s*\}\);/g)]
      .map((m) => m[0])
      .filter((b) => /focus:/.test(b))
      .map((b) => (b.match(/tab:\s*'([a-z]+)'/) || [])[1])
      .filter(Boolean);
    expect(targets.length).toBeGreaterThan(0);
    const handled = new Set(
      [...VANA.matchAll(/useSkuFocus\("([a-z]+)"/g)].map((m) => m[1])
    );
    const missing = [...new Set(targets)].filter((t) => !handled.has(t));
    expect(missing, 'แท็บที่ยิง focus ไปแต่ไม่มี useSkuFocus รับ: ' + missing.join(', ')).toEqual([]);
  });

  it('OrderListView: ดึง filter กลับเป็น "ทั้งหมด" ก่อนพาไปหา', () => {
    // ค้างอยู่ที่ "สำเร็จ"/"ส่งแล้ว" แล้วไม่รีเซ็ต = ใบที่จะพาไปหาไม่อยู่ในจอ → เด้งเงียบ
    const blk = VANA.match(/useSkuFocus\("orders",[\s\S]*?\n {2}\}\);/)[0];
    expect(blk).toMatch(/setFilter\("all"\)/);
    expect(blk).toMatch(/dmjScrollToSku\("data-order-sku"/);
    expect(blk).toMatch(/setFocusMiss/);   // หาไม่เจอต้องบอก
  });

  it('CSS คลาสกะพริบมีจริงในหน้าเว็บ (ไม่มี = เลื่อนไปถึงแต่ไม่รู้ว่าอันไหน)', () => {
    expect(HTML).toContain('.dmj-focus-flash');
    expect(HTML).toContain('@keyframes dmjFocusFlash');
    // ห้ามใช้ background — แถวปลายทางตั้ง background เป็น inline style จาก React
    const blk = HTML.match(/\.dmj-focus-flash \{[\s\S]*?\}/)[0];
    expect(blk).not.toMatch(/background/);
  });

  it('ui.jsx เปิดฟังก์ชันให้ไฟล์อื่นเรียกได้ (ไม่มี build step = ต้องผ่าน window)', () => {
    const blk = UI.match(/Object\.assign\(window, \{[\s\S]*?\}\);/)[0];
    ['dmjRequestFocus', 'useSkuFocus', 'dmjScrollToSku'].forEach((n) => {
      expect(blk, `ลืม export ${n}`).toContain(n);
    });
  });
});
