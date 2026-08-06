// tests/attendance-fastpath.test.js — ทางด่วนลงเวลา + เครื่องมือวัดเวลาเปิดแอป
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา: พนักงานมาสแกนเข้า-ออกงานต้องรอ payload สินค้าหลายเมกะที่ตัวเองไม่ได้ใช้เลย
// ก่อนจะเห็นปุ่มลงเวลา (เดิม `if (!data) return <จอโหลด>` กั้นทุกแท็บรวมแท็บลงเวลา)
//
// สิ่งที่คุมไว้ — ทุกข้อคือเรื่องที่ "พังแล้วไม่มี error ให้เห็น":
//   1. รายชื่อแท็บทางด่วนต้องมีแค่แท็บที่ view ไม่รับ `data` จริง ๆ
//      (ใส่แท็บอื่นเข้าไป = จอขาวเงียบ ๆ เพราะ view อ่าน property ของ null)
//   2. view ที่ต้องใช้ data ต้องยังถูกกั้นอยู่ (ด่านย้ายที่ ไม่ใช่ถูกถอด)
//   3. แถบเมนูต้องไม่หายตอนยังไม่มีข้อมูล ไม่งั้นกดออกจากแท็บลงเวลาแล้วกลับมาไม่ได้
//   4. shell ต้องไม่อ่าน `data.x` ตรง ๆ อีก (ตอนนี้ data เป็น null ได้แล้ว)
//   5. เครื่องมือวัดต้องไม่มีทางทำให้แอปล่ม (รอบก่อนใส่แล้วแอปเข้าไม่ได้ ไล่สาเหตุนาน)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const UI   = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const ATT  = readFileSync(join(ROOT, 'views-attendance.jsx'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');
const HARNESS = readFileSync(join(ROOT, 'tests/browser/harness.html'), 'utf8');

// ── 1. รายชื่อแท็บทางด่วน ────────────────────────────────────────────────────
describe('ทางด่วนลงเวลา — รายชื่อแท็บต้องตรงกับ view ที่ไม่ใช้ data จริง', () => {
  const fastTabs = (() => {
    const m = APP.match(/const ATT_FAST_TABS = \[([^\]]*)\]/);
    if (!m) throw new Error('หา ATT_FAST_TABS ไม่เจอ — ทางด่วนถูกถอดออกแล้ว?');
    return m[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(Boolean);
  })();

  it('มีแค่ attendance กับ atttoday', () => {
    expect(fastTabs.slice().sort()).toEqual(['attendance', 'atttoday']);
  });

  // นี่คือข้อที่กันจอขาว: ถ้ามีคนเพิ่มแท็บเข้า ATT_FAST_TABS โดยไม่ดู view จริง
  // view นั้นจะได้ data=null แล้วพังทันทีตอนอ่าน data.products
  it.each([
    ['attendance', /function AttendanceView\(\{([^}]*)\}/],
    ['atttoday',   /function AttendanceTodayView\(\{([^}]*)\}/],
  ])('view ของแท็บ %s ต้องไม่รับ prop ชื่อ data', (_tab, re) => {
    const m = ATT.match(re);
    expect(m).toBeTruthy();
    expect(m[1]).not.toMatch(/\bdata\b/);
  });

  it('จุดเรียก view ทั้งสองใน app.jsx ต้องไม่ส่ง data= เข้าไป', () => {
    for (const name of ['AttendanceView', 'AttendanceTodayView']) {
      const call = APP.match(new RegExp(`<${name}[^>]*>`));
      expect(call, `หาจุดเรียก ${name} ไม่เจอ`).toBeTruthy();
      expect(call[0]).not.toMatch(/\bdata=/);
    }
  });
});

// ── 2-3. ด่านย้ายที่ ไม่ใช่ถูกถอด + แถบเมนูต้องอยู่ ──────────────────────────
describe('ด่านกั้น data ต้องยังอยู่ แต่ย้ายเข้าไปใน <main>', () => {
  it('ไม่มี early-return `if (!data)` ที่คืนทั้งหน้าแล้ว (แถบเมนูจะหายไปด้วย)', () => {
    // รูปแบบเดิมที่เป็นกับดัก: return ทั้งหน้าออกไปก่อนจะถึง <main>
    expect(APP).not.toMatch(/\n\s{2}if \(!data\) \{\s*\n\s*return \(/);
    expect(APP).not.toMatch(/\n\s{2}if \(error && !data\) \{\s*\n\s*return \(/);
  });

  it('<main> มีด่านที่กัน view ที่ต้องใช้ data', () => {
    expect(APP).toMatch(/\{!data && !ATT_FAST_TABS\.includes\(activeTab\) \? dataPane : \(<>/);
  });

  it('ด่านใน <main> ปิดวงเล็บครบ (fragment ที่หุ้ม dispatch ทั้งชุด)', () => {
    const open  = (APP.match(/\? dataPane : \(<>/g) || []).length;
    const close = (APP.match(/<\/>\)\}\s*\n\s*<\/main>/g) || []).length;
    expect(open).toBe(1);
    expect(close).toBe(1);
  });

  it('dataPane ยังมีปุ่ม "ลองใหม่" (ไม่งั้นเน็ตสะดุดแล้วออกไปไหนไม่ได้)', () => {
    const pane = APP.match(/const dataPane = \([\s\S]*?\n  \);/);
    expect(pane).toBeTruthy();
    expect(pane[0]).toMatch(/ลองใหม่/);
    expect(pane[0]).toMatch(/fetchFromSheet\(3,\s*true\)/);
  });
});

// ── 4. shell ห้ามอ่าน data.x ตรง ๆ ──────────────────────────────────────────
describe('shell ต้องทนกับ data === null ได้', () => {
  it('pendingOrders/pendingRecv ต้องกัน null ก่อนอ่าน', () => {
    const orders = APP.match(/const pendingOrders\s*=\s*(.+)/);
    const recv   = APP.match(/const pendingRecv\s*=\s*(.+)/);
    expect(orders[1]).toMatch(/data && data\.orders/);
    expect(recv[1]).toMatch(/data && data\.shipments/);
  });

  it('ไม่มี `data.` แบบไม่กัน null หลงเหลือในส่วน shell (นอก <main>)', () => {
    const start = APP.indexOf('const syncLabel');
    const main  = APP.indexOf('<main className="main"');
    expect(start).toBeGreaterThan(0);
    expect(main).toBeGreaterThan(start);
    const shell = APP.slice(start, main);
    // อนุญาตเฉพาะรูปแบบที่กัน null แล้ว: `data && data.x` หรือ `(data || {}).x`
    const risky = shell.split('\n').filter(l =>
      /(?<!&& )(?<!\|\| )\bdata\.\w/.test(l) && !/data && data\./.test(l)
    );
    expect(risky).toEqual([]);
  });
});

// ── 5. เครื่องมือวัดต้องไม่ทำให้แอปล่ม ──────────────────────────────────────
describe('เครื่องมือวัดเวลาเปิดแอป', () => {
  it('ประกาศเป็นสคริปต์ตัวแรกของหน้า (ก่อน <title>) — ไม่งั้นวัดไม่ครบตั้งแต่ต้น', () => {
    const mark  = HTML.indexOf('window.dmjMark =');
    const title = HTML.indexOf('<title>');
    expect(mark).toBeGreaterThan(0);
    expect(mark).toBeLessThan(title);
  });

  it('มี fallback ตัวเปล่าเมื่อสร้างตัววัดไม่สำเร็จ (ห้ามลากแอปล่มไปด้วย)', () => {
    // fallback = ช่วงตั้งแต่ `window.dmjMark = function () {};` (ตัวเปล่า) ไปจนจบ IIFE
    const at = HTML.indexOf('window.dmjMark = function () {};');
    expect(at, 'ไม่มี fallback — ถ้าตัววัดพัง ทุกจุดที่เรียก dmjMark จะโยน TypeError').toBeGreaterThan(0);
    const block = HTML.slice(at, at + 300);
    expect(block).toMatch(/window\.dmjTrace = function \(\)/);
    expect(block).toMatch(/window\.dmjSaveTrace = function \(\)/);
  });

  it('dmjMark ข้างในห่อ try/catch (เรียกจากเส้นทางจริงทุกจุด)', () => {
    const fn = HTML.match(/window\.dmjMark = function \(name\) \{[\s\S]*?\n      \};/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/try \{/);
    expect(fn[0]).toMatch(/catch \(e\) \{\}/);
  });

  it('ไม่เก็บ token / ชื่อผู้ใช้ ลงร่องรอย (เก็บแค่ชื่อขั้น+เวลา+UA)', () => {
    const save = HTML.match(/window\.dmjSaveTrace = function \(\) \{[\s\S]*?\n      \};/);
    expect(save).toBeTruthy();
    expect(save[0]).not.toMatch(/sessionToken|dmj_role|staffId|displayName/);
  });

  it('บันทึกร่องรอยทั้งตอนสำเร็จและตอนล้มเหลว', () => {
    // เคสที่เจ็บที่สุดคือ "รอนานแล้วค่อยพัง" — ถ้าบันทึกแต่ทางสำเร็จจะไม่เหลือหลักฐานเลย
    expect(APP).toMatch(/payload:ล้มเหลว/);
    expect(APP).toMatch(/dmjMark\('พร้อมใช้งาน'\)/);
    const saves = (APP.match(/dmjSaveTrace\(\)/g) || []).length;
    expect(saves).toBeGreaterThanOrEqual(2);
  });

  it('แยก "รอ GAS คิด" ออกจาก "ดาวน์โหลดก้อน" (เคยสรุปผิดเพราะดูแต่เวลารวม)', () => {
    expect(APP).toMatch(/payload:เริ่ม/);
    expect(APP).toMatch(/payload:ไบต์แรก/);
    expect(APP).toMatch(/payload:ครบ/);
  });

  it('วัด auth แยกตาม action และวัดทั้งทางสำเร็จ/ล้มเหลว (finally)', () => {
    const fn = APP.match(/async function postAuthAction\([\s\S]*?\n\}/);
    expect(fn[0]).toMatch(/dmjMark\('auth:' \+ _act\)/);
    expect(fn[0]).toMatch(/finally \{[\s\S]*?auth-done/);
  });

  it('แยก compile ออกจาก cache hit (deploy ทีไรทุกเครื่องจ่ายค่า compile ใหม่)', () => {
    expect(HTML).toMatch(/dmjMark\('cachehit:' \+ src\)/);
    expect(HTML).toMatch(/dmjMark\('compile:' \+ src\)/);
    expect(HTML).toMatch(/dmjMark\('compiled:' \+ src\)/);
  });
});

// ── ตัวแสดงผล: ต้องเห็นจากในแอปได้จริง ─────────────────────────────────────
describe('BootTrace — ต้องดูได้จากในแอป ไม่ใช่แค่ค้างใน localStorage', () => {
  it('เลือก "รอบนี้" ก่อน "รอบที่บันทึกไว้" (ตอนจอค้าง รอบนี้ยังไม่ถูกบันทึก)', () => {
    const fn = UI.match(/function BootTrace\(\)[\s\S]*?\n\}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/const useLive = live\.length >= 2/);
    expect(fn[0]).toMatch(/useLive \? live : \(saved && saved\.marks\)/);
  });

  it('โชว์ "ช่วงละกี่ ms" ไม่ใช่เวลาสะสมอย่างเดียว', () => {
    const fn = UI.match(/function BootTrace\(\)[\s\S]*?\n\}/);
    expect(fn[0]).toMatch(/dur: m\[1\] - prev/);
  });

  it('export ออก window ให้ไฟล์อื่นใช้ได้', () => {
    expect(UI).toMatch(/Object\.assign\(window, \{[\s\S]*?BootTrace/);
  });

  // ui.jsx โหลด **ก่อน** views-main.jsx ซึ่งเป็นที่ประกาศ alias `uS`/`uE`
  // ใช้ alias ในไฟล์นี้จะ "เผอิญใช้ได้" เพราะ render เกิดหลังโหลดครบ — แต่เป็นการพึ่ง
  // ลำดับโหลดโดยไม่จำเป็น ถ้าวันหนึ่งมีอะไรใน ui.jsx ต้องรันตอนโหลด จะพังแบบหาสาเหตุยาก
  it('ui.jsx ต้องไม่ใช้ alias uS/uE (ประกาศใน views-main.jsx ที่โหลดทีหลัง)', () => {
    expect(UI).not.toMatch(/\buS\(/);
    expect(UI).not.toMatch(/\buE\(/);
    // ยืนยันว่า alias มาจาก views-main.jsx จริง (ถ้าย้ายไปประกาศใน ui.jsx เทสต์นี้ต้องรู้)
    const views = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
    expect(views).toMatch(/useState: uS/);
  });

  it('มีที่เข้าถึงได้ทั้งตอนเข้าแอปสำเร็จ (ConnectView) และตอนพัง (จอ error)', () => {
    const views = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
    expect(views).toMatch(/<BootTrace\/>/);
    const pane = APP.match(/const dataPane = \([\s\S]*?\n  \);/);
    expect(pane[0]).toMatch(/<BootTrace\/>/);
  });
});

// ── harness ต้องมี shim ไม่งั้น browser test แดงทั้งที่โค้ดจริงถูก ──────────
describe('harness ของ browser test', () => {
  it('มี dmjMark/dmjTrace/dmjSaveTrace ครบ', () => {
    for (const fn of ['dmjMark', 'dmjTrace', 'dmjSaveTrace']) {
      expect(HARNESS, `harness ขาด ${fn}`).toMatch(new RegExp(`window\\.${fn}\\s*=`));
    }
  });

  it('shim อยู่ก่อน fixture/config/app (ต้องพร้อมก่อนโค้ดที่เรียกมัน)', () => {
    expect(HARNESS.indexOf('window.dmjMark')).toBeLessThan(HARNESS.indexOf('/tests/browser/fixture.js'));
  });
});
