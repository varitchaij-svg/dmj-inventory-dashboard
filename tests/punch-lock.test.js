// tests/punch-lock.test.js — F07: การลงเวลาต้องไม่เขียนเมื่อขอล็อกไม่สำเร็จ
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (รายงานตรวจระบบ 5 ก.ย. 2026 · ประเด็น F07)
//
// สิ่งที่พบ: `punchHandler_` จับ error ของ `lock.waitLock(10000)` ทิ้ง (`catch (e) {}`)
// แล้ว **appendRow ต่อ** — `_lkOk` ถูกใช้แค่ส่งเข้า `perfLock_` เพื่อวัดผลเท่านั้น
// ล็อกตัวนี้เป็น "สิ่งเดียว" ที่กันสองเครื่องกดพร้อมกันแล้วได้ 2 แถว → ตอนเปิดงานพร้อมกัน
// (จังหวะที่คนกดพร้อมกันมากที่สุดของวัน) การกันซ้ำหายไปเงียบ ๆ ชั่วโมงทำงานเพี้ยนโดยไม่มี
// error ให้ใครเห็น · การทดลองในรายงานได้ "lock unavailable → row written → success"
//
// เกณฑ์ปิดงานของรายงาน 3 ข้อ — คุมครบในไฟล์นี้:
//   1. lock timeout ต้องไม่เขียน
//   2. request ซ้อนกันสร้างสถานะครั้งเดียว
//   3. response หายแล้วผู้ใช้ตรวจเวลาเดิมได้ก่อนกดใหม่
//
// ไฟล์นี้ **รันฟังก์ชันจริงจาก `.gs`** (eval — ไม่ copy เข้า helpers.js เหมือน auth.test.js)
// เพราะเป็นเส้นทางที่ "พังแล้วไม่มี error ให้เห็น" — สำเนาที่ drift จะเขียวทั้งที่ของจริงรั่ว
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VATT = readFileSync(join(ROOT, 'views-attendance.jsx'), 'utf8');

function grab(src, re, what) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + what);
  return m[0];
}

const PUNCH_SRC = grab(GS, /function punchHandler_\(ss, data\) \{[\s\S]*?\n\}/, 'punchHandler_');

// ── sandbox: รัน punchHandler_ จริง โดยแทน dependency ทั้งหมดด้วยของปลอมที่ "นับ" ได้ ──
function runPunch({ lockAvailable, type = 'in', events = [] }) {
  const calls = { appendRow: 0, savePhoto: 0, audit: 0, releaseLock: 0, waitLock: 0 };
  const sheetRows = [];

  const ctx = {
    calls, sheetRows,
    ATT_TYPES: ['in', 'out', 'breakStart', 'breakEnd', 'bathroomStart', 'bathroomEnd'],
    ATT_TYPE_TH: { in: 'เข้างาน', out: 'ออกงาน', breakStart: 'เริ่มพัก', breakEnd: 'กลับจากพัก' },
    STAFF_ROLE_TH_: { warehouse: 'คลังสินค้า' },
    resolveSession_: () => ({ staffId: 'ST0001', displayName: 'ทดสอบ', role: 'warehouse', status: 'active' }),
    unauthorized_: () => ({ __unauthorized: true }),
    readAttEvents_: () => events,
    attAllowedNext_: () => ['in', 'out', 'breakStart', 'bathroomStart'],
    attDateKey_: () => '2026-09-05',
    attTimeStr_: () => '08:30:00',
    attDowBkk_: () => 6,
    nearestAttSite_: () => null,
    readAttSites_: () => [],
    readAttShifts_: () => [],
    attShiftFor_: () => null,
    attNextId_: () => 'A0001',
    attSummarize_: () => ({}),
    attFmtHm_: (x) => String(x),
    auditDetail_: (o) => JSON.stringify(o),
    perfLock_: () => {},
    saveAttPhoto_: () => { calls.savePhoto++; return 'FILEID'; },
    writeAuditLog_: () => { calls.audit++; },
    attendanceSheet_: () => ({
      appendRow: (row) => { calls.appendRow++; sheetRows.push(row); },
      getLastRow: () => sheetRows.length,
      getRange: () => ({ setNumberFormat: () => {} }),
    }),
    attTodayPayload_: (evs) => ({ events: evs }),
    ok: (payload) => ({ success: true, data: payload }),
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {
          calls.waitLock++;
          if (!lockAvailable) throw new Error('Could not obtain lock');
        },
        releaseLock: () => { calls.releaseLock++; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (txt) => ({ setMimeType: () => JSON.parse(txt) }),
    },
  };

  const names = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, PUNCH_SRC + '\nreturn punchHandler_;')(...names.map((n) => ctx[n]));
  const out = fn({}, { sessionToken: 'tok', type, photoBase64: 'data:image/jpeg;base64,AAAA' });
  return { out, calls, sheetRows };
}

describe('F07 — เกณฑ์ปิดงานข้อ 1: lock timeout ต้องไม่เขียน', () => {
  it('คว้าล็อกได้ → เขียน 1 แถว + คืน success', () => {
    const { out, calls } = runPunch({ lockAvailable: true });
    expect(out.success).toBe(true);
    expect(calls.appendRow).toBe(1);
  });

  it('คว้าล็อกไม่ได้ → **ไม่เขียนแถวเลย** และคืน success:false (ของเดิมเขียนต่อ)', () => {
    const { out, calls } = runPunch({ lockAvailable: false });
    expect(calls.appendRow, 'lock timeout แล้วยัง appendRow = บั๊ก F07 กลับมา').toBe(0);
    expect(out.success).toBe(false);
  });

  it('คว้าล็อกไม่ได้ → ต้องตัด **ก่อน** saveAttPhoto_ (ไม่ทิ้งไฟล์รูปค้างใน Drive)', () => {
    const { calls } = runPunch({ lockAvailable: false });
    expect(calls.savePhoto, 'อัปโหลดรูปไปแล้วค่อยตัด = รูปค้างที่ไม่มีแถวไหนอ้างถึง').toBe(0);
  });

  it('คว้าล็อกไม่ได้ → ไม่เขียน audit log ด้วย (ไม่งั้น "ผลงานพนักงาน" นับงานที่ไม่ได้เกิดขึ้น)', () => {
    const { calls } = runPunch({ lockAvailable: false });
    expect(calls.audit).toBe(0);
  });

  it('คว้าล็อกไม่ได้ → ยังปล่อยล็อกใน finally เสมอ (ไม่ค้างทั้งสคริปต์)', () => {
    const { calls } = runPunch({ lockAvailable: false });
    expect(calls.releaseLock).toBe(1);
  });

  it('ข้อความบอกชัดว่า "ยังไม่ได้บันทึก" + ให้ดูสถานะล่าสุดก่อนกดใหม่ (ไม่ใช่ "ลองใหม่" เฉย ๆ)', () => {
    const { out } = runPunch({ lockAvailable: false });
    expect(out.error).toContain('ยังไม่ได้บันทึก');
    expect(out.error, 'ต้องชวนให้ดูสถานะล่าสุดก่อน — คำขอที่ถือล็อกอยู่อาจเพิ่งเขียนสำเร็จ')
      .toMatch(/สถานะล่าสุด/);
  });

  it('ติดธง locked:true ให้ frontend แยกออกจาก error อื่น (ใช้สั่งโหลดสถานะล่าสุด)', () => {
    const { out } = runPunch({ lockAvailable: false });
    expect(out.locked).toBe(true);
    expect(out.retryable).toBe(true);
  });
});

describe('F07 — เกณฑ์ปิดงานข้อ 2: request ซ้อนกันสร้างสถานะครั้งเดียว', () => {
  it('2 คำขอพร้อมกัน (คนแรกได้ล็อก คนที่สองไม่ได้) → มีแถวเดียว', () => {
    const first  = runPunch({ lockAvailable: true });
    const second = runPunch({ lockAvailable: false });
    expect(first.calls.appendRow + second.calls.appendRow).toBe(1);
  });
});

describe('F07 — meta: โครงสร้างที่พังแล้วเงียบ', () => {
  it('`_lkOk` ถูกใช้ตัดสินใจจริง ไม่ใช่แค่ส่งเข้า perfLock_', () => {
    // ของเดิม _lkOk โผล่แค่ 2 ที่: ตอน set กับตอนส่งเข้า perfLock_ — ไม่มี if ที่ไหนเลย
    expect(PUNCH_SRC).toMatch(/if \(!_lkOk\)/);
  });

  it('guard อยู่ก่อน saveAttPhoto_ / appendRow / writeAuditLog_ ในลำดับโค้ดจริง', () => {
    const iGuard = PUNCH_SRC.indexOf('if (!_lkOk)');
    expect(iGuard).toBeGreaterThan(-1);
    ['saveAttPhoto_(', 'appendRow(', 'writeAuditLog_('].forEach((needle) => {
      const i = PUNCH_SRC.indexOf(needle);
      expect(i, 'หา ' + needle + ' ไม่เจอ').toBeGreaterThan(-1);
      expect(iGuard, 'guard ต้องอยู่ก่อน ' + needle).toBeLessThan(i);
    });
  });

  it('ยังคง try/catch รอบ waitLock (throw ต้องไม่หลุดออกไปเป็น 500)', () => {
    expect(PUNCH_SRC).toMatch(/try \{ lock\.waitLock\(10000\); _lkOk = true; \} catch \(e\) \{\}/);
  });
});

describe('F07 — เกณฑ์ปิดงานข้อ 3: อ่านคำตอบไม่ได้ ต้องให้ผู้ใช้ตรวจของจริงก่อนกดซ้ำ', () => {
  const DOPUNCH = grab(VATT, /const doPunch = async \(type\) => \{[\s\S]*?\n  \};/, 'doPunch');

  it('catch ไม่ขึ้น "บันทึกไม่สำเร็จ" ตรง ๆ อีกแล้ว (บทเรียนข้อ 13)', () => {
    const catchBlock = DOPUNCH.slice(DOPUNCH.indexOf('} catch (e) {'));
    expect(catchBlock).not.toMatch(/kind: "err", text: "บันทึกไม่สำเร็จ: "/);
    expect(catchBlock).toContain('ยังตรวจผลไม่ได้');
  });

  it('catch โหลดสถานะล่าสุดมาโชว์ (myToday เป็น read-only ยิงซ้ำได้ปลอดภัย)', () => {
    const catchBlock = DOPUNCH.slice(DOPUNCH.indexOf('} catch (e) {'));
    expect(catchBlock, 'ไม่โหลดสถานะใหม่ = พนักงานเดาเอาเองว่าลงเวลาไปหรือยัง').toMatch(/\bload\(\)/);
  });

  it('server ตอบ locked:true → โหลดสถานะล่าสุดด้วย', () => {
    expect(DOPUNCH).toMatch(/d\.locked\) load\(\)/);
  });

  it('⚠️ ห้าม auto-retry การ punch เอง (เขียนข้อมูลจริง ยังไม่ idempotent)', () => {
    // ต่างจาก load() ที่ retry เองได้ — ยิง punch ซ้ำอัตโนมัติ = แถวซ้ำ ซึ่งเป็นสิ่งที่ F07 กันอยู่
    expect(DOPUNCH).not.toMatch(/setTimeout\([^)]*doPunch/);
    expect(DOPUNCH).not.toMatch(/retryLeft/);
  });
});
