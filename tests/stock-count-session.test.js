// tests/stock-count-session.test.js — Realtime Stock Count + Counting Session tracking
// ─────────────────────────────────────────────────────────────────────────────
// เป้าหมาย 2 อย่างที่ระบบนี้แก้ (ดู CLAUDE.md "งาน: ตรวจสอบและทำระบบ Stock Count ให้ Update
// แบบ Real-time"):
//   B) กด "ยืนยัน" นับสต็อกแล้ว data.products บนเว็บต้องเปลี่ยนทันที (ผ่าน patchProductQtys เดิม)
//   A) รู้ได้ว่าใครนับ context ไหน เริ่ม/จบเมื่อไหร่ ใช้เวลากี่วินาที นับกี่ SKU (Counting Session)
//
// **ไม่ copy โค้ดเข้า tests/helpers.js** — eval ฟังก์ชันจริงจาก .gs/.jsx ตรง ๆ (เหมือน
// auth.test.js/order-idempotent.test.js/stockcheck-instant-patch.test.js) เพราะทั้งคู่เป็น
// จุดที่ "พังแล้วไม่มี error ให้เห็น" (เลขสต็อกค้าง / เวลานับที่รายงานผิด) ถ้า copy สำเนาแล้ว
// ต้นทาง drift เทสต์จะยังเขียวทั้งที่ของจริงพัง
//
// สิ่งที่คุมไว้:
//   1. confirmStockCount คืน updated[] (SKU+qty ที่เขียนจริง) โดยไม่กระทบ field เดิม
//   2. session:ID ถูกแปะต่อท้าย detail ของแถว "นับสต็อก" เมื่อส่ง sessionId มา ไม่แปะเมื่อไม่ส่ง
//   3. Audit log ไม่ซ้ำเมื่อ submit entries เดิมซ้ำ (idempotent — ไม่ต้องมี cid/tid)
//   4. stockCountSessionsBuild_ group ด้วย session_id ตรง ๆ ไม่ใช่ time-window heuristic —
//      เปิด context ใหม่ (session_id ใหม่) ต้องไม่ถูกปนกับ session เก่าแม้ actor เดียวกัน
//   5. itemCount = SKU ไม่ซ้ำ ไม่ใช่จำนวนแถว audit (SKU เดียวถูกแก้ 2 ครั้งในรอบเดียวยังนับ 1)
//   6. session ที่เปิดแล้วไม่มีการนับสำเร็จเลย (ไม่มีแถว "นับสต็อก" ผูกด้วย) → durationSec เป็น null
//      (ไม่ถูกนับรวมเป็น "เวลานับ" — ป้องกันเปิดหน้าทิ้งไว้เฉย ๆ ถูกนับเป็นเวลาทำงาน)
//   7. meta: dispatch/ROLE_ACTIONS_/POST_FLAG_ACTIONS_/STAFF_PERF_CATEGORIES_ ครบ
//   8. meta: StockCountView เรียก patchProductQtys ทุก call site ที่ confirmStockCount สำเร็จ
//      + มี ref-guard กันดับเบิลแท็บ + session lifecycle ผูกกับ context ที่ถูกต้อง
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const APP  = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}
function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา function ในต้นทางไม่เจอ: ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

// ── sandbox: eval stockCountSessionsBuild_ + dependency (staffPerfDayKey_) ──
// Utilities stub เหมือน tests/staff-perf.test.js — staffPerfDayKey_ ใช้ตอน parse fallback
function loadSessions() {
  const ctx = {
    Utilities: {
      formatDate: (d) => {
        const u = new Date(d.getTime() + 7 * 3600 * 1000);
        const p = (n) => String(n).padStart(2, '0');
        return u.getUTCFullYear() + '-' + p(u.getUTCMonth() + 1) + '-' + p(u.getUTCDate());
      },
    },
  };
  const code = [
    grab(/function staffPerfDayKey_\(v\) \{[\s\S]*?\n\}/),
    grab(/function stockCountSessionsBuild_\(rows, monthKey\) \{[\s\S]*?\n\}/),
    'return { stockCountSessionsBuild_ };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(ctx), code)(...Object.values(ctx));
}
const { stockCountSessionsBuild_ } = loadSessions();

// สร้างแถว audit ดิบ [วันที่, actor, action, resource, detail] — ใช้ Date จริงให้ตรงกับของจริง
function auditRow(dateStr, actor, action, resource, detail) {
  return [new Date(dateStr), actor, action, resource, detail];
}
const MONTH = '2026-08';

describe('stockCountSessionsBuild_ — group ด้วย session_id ตรง ๆ (ไม่ใช่ time-window heuristic)', () => {
  it('เริ่มนับสต็อก + นับสต็อก (มี session tag) → ได้ 1 session ที่ actor นั้น', () => {
    const rows = [
      auditRow('2026-08-10T09:00:00+07:00', 'สมชาย (คลังสินค้า)', 'เริ่มนับสต็อก', 'A3/7',
        JSON.stringify({ sessionId: 'SC-1', contextType: 'lock', contextLabel: 'ล็อค A3/7', expectedItemCount: 5 })),
      auditRow('2026-08-10T09:02:00+07:00', 'สมชาย (คลังสินค้า)', 'นับสต็อก', 'OL00001', 'qty: 10→8 · session:SC-1'),
      auditRow('2026-08-10T09:03:30+07:00', 'สมชาย (คลังสินค้า)', 'นับสต็อก', 'OL00002', 'qty: 4→4 · session:SC-1'),
    ];
    const byActor = stockCountSessionsBuild_(rows, MONTH);
    const list = byActor['สมชาย (คลังสินค้า)'];
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe('SC-1');
    expect(list[0].contextLabel).toBe('ล็อค A3/7');
    expect(list[0].expectedItemCount).toBe(5);
    expect(list[0].itemCount).toBe(2); // 2 SKU ต่างกัน
    expect(list[0].durationSec).toBe(210); // 09:00:00 → 09:03:30 (แถว "นับสต็อก" สุดท้าย = submit ล่าสุด)
  });

  it('itemCount = SKU ไม่ซ้ำ ไม่ใช่จำนวนแถว audit — SKU เดียวถูกแก้ 2 ครั้งในรอบเดียวนับ 1', () => {
    const rows = [
      auditRow('2026-08-10T09:00:00+07:00', 'A', 'เริ่มนับสต็อก', 'A3/7',
        JSON.stringify({ sessionId: 'SC-1' })),
      auditRow('2026-08-10T09:01:00+07:00', 'A', 'นับสต็อก', 'OL00001', 'qty: 10→8 · session:SC-1'),
      auditRow('2026-08-10T09:02:00+07:00', 'A', 'นับสต็อก', 'OL00001', 'qty: 8→7 · session:SC-1'), // พิมพ์ผิดแล้วแก้ใหม่
    ];
    const list = stockCountSessionsBuild_(rows, MONTH)['A'];
    expect(list[0].itemCount).toBe(1);
  });

  it('เปิด context ใหม่ (session_id ใหม่) ของ actor เดียวกัน → ไม่ปนกับ session เก่า', () => {
    const rows = [
      auditRow('2026-08-10T09:00:00+07:00', 'A', 'เริ่มนับสต็อก', 'A3/7', JSON.stringify({ sessionId: 'SC-1' })),
      auditRow('2026-08-10T09:01:00+07:00', 'A', 'นับสต็อก', 'OL00001', 'qty: 10→8 · session:SC-1'),
      auditRow('2026-08-10T09:05:00+07:00', 'A', 'เริ่มนับสต็อก', 'B1/2', JSON.stringify({ sessionId: 'SC-2' })),
      auditRow('2026-08-10T09:06:00+07:00', 'A', 'นับสต็อก', 'R01025', 'qty: 3→3 · session:SC-2'),
    ];
    const list = stockCountSessionsBuild_(rows, MONTH)['A'];
    expect(list).toHaveLength(2);
    const s1 = list.find(s => s.sessionId === 'SC-1');
    const s2 = list.find(s => s.sessionId === 'SC-2');
    expect(s1.itemCount).toBe(1);
    expect(s2.itemCount).toBe(1);
    // ปิดหลังจากกันไม่ให้ session ก่อนหน้ากิน SKU ของ session หลัง
    expect(s1.contextKey).toBe('A3/7');
    expect(s2.contextKey).toBe('B1/2');
  });

  it('session ที่เปิดแล้วไม่มีแถว "นับสต็อก" ผูกด้วยเลย → durationSec เป็น null (ไม่นับเป็นเวลานับ)', () => {
    const rows = [
      auditRow('2026-08-10T09:00:00+07:00', 'A', 'เริ่มนับสต็อก', 'A3/7', JSON.stringify({ sessionId: 'SC-1' })),
    ];
    const list = stockCountSessionsBuild_(rows, MONTH)['A'];
    expect(list[0].durationSec).toBeNull();
    expect(list[0].itemCount).toBe(0);
  });

  it('แถว "นับสต็อก" เก่า (ไม่มี session tag) หรือ session ที่ start-row หลุดช่วง → ทิ้งอย่างปลอดภัย ไม่พัง', () => {
    const rows = [
      auditRow('2026-08-10T09:00:00+07:00', 'A', 'นับสต็อก', 'OL00001', 'qty: 10→8'), // ไม่มี session tag
      auditRow('2026-08-10T09:01:00+07:00', 'A', 'นับสต็อก', 'OL00002', 'qty: 1→2 · session:SC-999'), // start ไม่อยู่ในช่วง
    ];
    expect(() => stockCountSessionsBuild_(rows, MONTH)).not.toThrow();
    expect(stockCountSessionsBuild_(rows, MONTH)).toEqual({});
  });

  it('closeStockCountSession ("จบการนับสต็อก") ผูก closedAt แต่ไม่กระทบ durationSec (ยึด submit จริงเสมอ)', () => {
    const rows = [
      auditRow('2026-08-10T09:00:00+07:00', 'A', 'เริ่มนับสต็อก', 'A3/7', JSON.stringify({ sessionId: 'SC-1' })),
      auditRow('2026-08-10T09:01:00+07:00', 'A', 'นับสต็อก', 'OL00001', 'qty: 10→8 · session:SC-1'),
      auditRow('2026-08-10T09:10:00+07:00', 'A', 'จบการนับสต็อก', '', JSON.stringify({ sessionId: 'SC-1', itemCount: 1 })),
    ];
    const s = stockCountSessionsBuild_(rows, MONTH)['A'][0];
    expect(s.closedAt).not.toBeNull();
    expect(s.durationSec).toBe(60); // 09:00→09:01 (เวลานับจริง) ไม่ใช่ 09:00→09:10 (เวลาปิด)
  });

  it('เดือนอื่นถูกกรองทิ้ง (defense-in-depth เหมือน staffPerfAggregateAudit_/staffPerfAggregateSales_)', () => {
    const rows = [
      auditRow('2026-07-31T09:00:00+07:00', 'A', 'เริ่มนับสต็อก', 'A3/7', JSON.stringify({ sessionId: 'SC-1' })),
      auditRow('2026-07-31T09:01:00+07:00', 'A', 'นับสต็อก', 'OL00001', 'qty: 10→8 · session:SC-1'),
    ];
    expect(stockCountSessionsBuild_(rows, MONTH)).toEqual({});
  });
});

describe('confirmStockCount — meta: updated[] + session tag (requirement B/A)', () => {
  const fn = grab(/function confirmStockCount\(ss, entries, clientLoadedAt, actor, sessionId\) \{[\s\S]*?\n\}\n\nfunction deleteOrderRow/);

  it('ยอมรับ sessionId เป็น param ที่ 5 (backward-compatible — เดิมมีแค่ 4)', () => {
    expect(SRC).toContain('function confirmStockCount(ss, entries, clientLoadedAt, actor, sessionId)');
  });

  it('ตอบ updated[] จาก auditRows จริง (SKU+qty ที่เขียนแล้ว) ไม่ใช่ entries ที่ client ส่งมา', () => {
    expect(fn).toContain('updated: auditRows.map(function(r) { return { sku: r.sku, qty: r.newQty }; })');
  });

  it('field เดิม (confirmed/zortSynced/warning) ยังอยู่ครบ — ไม่ทุบ consumer เดิม', () => {
    expect(fn).toMatch(/confirmed:\s*updatedCount/);
    expect(fn).toMatch(/zortSynced:\s*zortSynced/);
    expect(fn).toContain('warning:');
  });

  it('session:ID ต่อท้าย detail เฉพาะแถวที่ค่าเปลี่ยนจริง (r.oldQty !== r.newQty) — คงรูปแบบเดิมไว้', () => {
    expect(fn).toContain('const sessTag = sessionId ? (" · session:" + String(sessionId)) : "";');
    expect(fn).toContain('"qty: " + r.oldQty + "→" + r.newQty + sessTag');
  });

  it('doPost ส่ง data.sessionId เข้า confirmStockCount', () => {
    expect(SRC).toContain('confirmStockCount(ss, data.entries, data.clientLoadedAt, actor, data.sessionId)');
  });

  it('ไม่มี audit log ซ้ำเมื่อ entries เดิมถูกส่งซ้ำ (idempotent โดยธรรมชาติ — ไม่ต้องมี cid/tid)', () => {
    // audit เขียนเฉพาะ r.oldQty !== r.newQty — รอบสองที่ oldQty(ในชีต)===newQty(ที่ส่งซ้ำ)
    // จึงไม่เข้าเงื่อนไข ไม่ต้องมี dedup key แยกต่างหากแบบ cid/tid/billCid
    expect(fn).toContain('if (r.oldQty !== r.newQty) {');
  });
});

describe('Stock Count Session — dispatch/สิทธิ์/หมวดผลงาน (meta — จุดเชื่อมต่อที่พังแล้วเงียบ)', () => {
  it('doPost dispatch ทั้ง startStockCount และ closeStockCount', () => {
    expect(SRC).toContain('if (data.startStockCount) {');
    expect(SRC).toContain('if (data.closeStockCount) {');
    expect(SRC).toContain('startStockCountSession_(actor, data.sessionId,');
    expect(SRC).toContain('closeStockCountSession_(actor, data.sessionId, data.itemCount)');
  });

  it('POST_FLAG_ACTIONS_ มี startStockCount/closeStockCount (ไม่งั้นหลุดการตรวจสิทธิ์)', () => {
    const list = grab(/var POST_FLAG_ACTIONS_ = \[[\s\S]*?\];/);
    expect(list).toContain('"startStockCount"');
    expect(list).toContain('"closeStockCount"');
  });

  it('ROLE_ACTIONS_ ของ warehouse/employee มี startStockCount/closeStockCount คู่กับ confirmStockCount', () => {
    const roles = grab(/var ROLE_ACTIONS_ = \{[\s\S]*?\n\};/);
    const wh = roles.match(/warehouse:\s*\[[\s\S]*?\]/)[0];
    const emp = roles.match(/employee:\s*\[[\s\S]*?\]/)[0];
    [wh, emp].forEach(block => {
      expect(block).toContain('confirmStockCount');
      expect(block).toContain('startStockCount');
      expect(block).toContain('closeStockCount');
    });
  });

  it('STAFF_PERF_CATEGORIES_ มีหมวดของ "เริ่มนับสต็อก"/"จบการนับสต็อก" แบบ skip:true (ไม่ใช่ "งาน")', () => {
    const cats = grab(/const STAFF_PERF_CATEGORIES_ = \[[\s\S]*?\n\];/);
    expect(cats).toContain('prefixes: ["เริ่มนับสต็อก"]');
    expect(cats).toContain('prefixes: ["จบการนับสต็อก"]');
    const startLine = cats.split('\n').find(l => l.includes('"เริ่มนับสต็อก"'));
    const endLine   = cats.split('\n').find(l => l.includes('"จบการนับสต็อก"'));
    expect(startLine).toContain('skip: true');
    expect(endLine).toContain('skip: true');
  });

  it('staffPerfBuild_ อ่าน Audit Log ครั้งเดียวแล้วส่งต่อให้ทั้ง staffPerfAggregateAudit_ และ stockCountSessionsBuild_', () => {
    const fn = grabFn(SRC, 'staffPerfBuild_');
    expect(fn).toContain('const auditSheetRows5col = shA.getRange(2 + startIdx, 1, endIdx - startIdx + 1, 5).getValues();');
    expect(fn).toContain('staffPerfAggregateAudit_(auditSheetRows5col, monthKey)');
    expect(fn).toContain('stockCountSessionsBuild_(auditSheetRows5col, monthKey)');
  });

  it('session ที่ยังไม่มีการนับจริง (durationSec null) ถูกกรองออกจากยอดรวม/ค่าเฉลี่ยต่อคน', () => {
    const fn = grabFn(SRC, 'staffPerfBuild_');
    expect(fn).toContain('.filter(function (s) { return s.durationSec != null; })');
  });
});

describe('StockCountView (frontend) — patch ทันที + session lifecycle + กันดับเบิลแท็บ (meta)', () => {
  it('รับ prop patchProductQtys', () => {
    expect(VANA).toContain('function StockCountView({ data, checkRequest, onCheckComplete, patchProductQtys }) {');
  });

  it('applyServerPatch ใช้ result.data.updated (server) เป็น source ก่อนเสมอ ไม่ใช่ entries ที่ส่งไป', () => {
    const fn = grabFn(VANA, 'StockCountView');
    expect(fn).toContain('const applyServerPatch = (result, fallbackEntries) => {');
    expect(fn).toContain('result.data.updated');
    expect(fn).toContain('patchProductQtys(patch)');
  });

  it('ทั้ง 3 เส้นทางบันทึก (handleSave/handleConfirm/handleSavePreShelf) เรียก applyServerPatch หลังสำเร็จ', () => {
    const calls = (VANA.match(/applyServerPatch\(result,/g) || []).length;
    expect(calls, 'ต้องมี 3 จุด (handleSave, handleConfirm, handleSavePreShelf)').toBe(3);
  });

  it('confirmStockCount ทุก call site ในหน้านี้ส่ง sessionIdRef.current ไปด้วย', () => {
    const calls = (VANA.match(/confirmStockCount\((?:confirmEntries|entries), sessionIdRef\.current\)/g) || []).length;
    expect(calls).toBe(3);
  });

  it('มี submitInFlightRef กันดับเบิลแท็บ ใช้ร่วมกันทั้ง 3 handler (UX เท่านั้น)', () => {
    const fn = grabFn(VANA, 'StockCountView');
    expect(fn).toContain('const submitInFlightRef = React.useRef(false);');
    const guards = (fn.match(/submitInFlightRef\.current/g) || []).length;
    expect(guards).toBeGreaterThanOrEqual(6); // เช็ค+set+reset อย่างน้อยคนละคู่ ×3 handler
  });

  it('session lifecycle: เปิด context ใหม่ (lock/supplier/preShelf) = sessionId ใหม่เสมอ', () => {
    const fn = grabFn(VANA, 'StockCountView');
    expect(fn).toContain("startStockCountSession(id, 'lock', selLockKey,");
    expect(fn).toContain("startStockCountSession(id, 'supplier', selSupplier,");
    expect(fn).toContain("startStockCountSession(id, 'preshelf', 'preshelf',");
    // ปิด session ตอน cleanup effect (เปลี่ยน context/unmount) เฉพาะเมื่อมีของถูกนับจริง
    expect((fn.match(/if \(sessionSkuSetRef\.current\.size > 0\) closeStockCountSession\(id,/g) || []).length).toBe(3);
  });

  it('preShelfMode มาก่อนเสมอ — กัน session ล็อค/ซัพพลายเออร์เปิดซ้อนตอน preShelfMode ค้างจากรอบก่อน', () => {
    const fn = grabFn(VANA, 'StockCountView');
    expect(fn).toContain('if (preShelfMode || !selLockKey) return;');
    expect(fn).toContain('if (preShelfMode || !selSupplier) return;');
  });

  it('newStockCountSessionId สร้างค่าไม่ซ้ำแบบเดียวกับ cid/tid pattern เดิมในระบบ (Date+random, ไม่ต้อง crypto)', () => {
    expect(VANA).toContain('function newStockCountSessionId() {');
    expect(VANA).toContain('Date.now().toString(36)');
  });
});

describe('app.jsx — เดินสาย patchProductQtys เข้า StockCountView + ขยาย realtime poll', () => {
  it('ส่ง patchProductQtys เป็น prop ให้ StockCountView', () => {
    expect(APP).toMatch(/<StockCountView data=\{data\}[\s\S]*?patchProductQtys=\{patchProductQtys\}/);
  });

  it('LIVE_TABS (stocklite poll ทุก 30 วิ) ครอบคลุม stock/categories เพิ่มจาก stockcount/frontstore เดิม', () => {
    expect(APP).toContain('const LIVE_TABS = ["stockcount", "frontstore", "stock", "categories"];');
  });
});
