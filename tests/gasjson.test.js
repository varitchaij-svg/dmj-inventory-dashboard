// tests/gasjson.test.js — อ่านคำตอบจาก GAS ให้ปลอดภัย (dmjJson / dmjErrText)
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): พนักงานหน้าร้านกดสั่งของแล้วเจอข้อความ
//     Unexpected token '<', "<!DOCTYPE "... is not valid JSON
// เพราะ GAS ตอบกลับเป็น "หน้า HTML" (deployment ล่ม/หมดอายุ/ต้องขอสิทธิ์ใหม่)
// แต่โค้ดเอาเข้า res.json() ตรง ๆ · ที่แย่กว่าคือ syncFrontStoreData คืน success:true
// ทุกครั้งโดยไม่เคยอ่านคำตอบเลย → หน้าจอขึ้น "✅ บันทึกแล้ว" ทั้งที่ไม่มีอะไรถูกบันทึก
//
// ไม่ copy โค้ดเข้า helpers.js — eval ฟังก์ชันจริงจาก ui.jsx (แนวเดียวกับ auth.test.js)
// เพราะเป็นด่านสุดท้ายที่กันไม่ให้ "บันทึกไม่สำเร็จ" ถูกรายงานว่าสำเร็จ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
const VIEWS_MAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const VIEWS_ANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// eval ฟังก์ชันจริงจาก ui.jsx (ทั้งคู่เป็น plain JS ไม่มี JSX)
const { dmjJson, dmjErrText } = (function () {
  const code = [
    grab(UI, /async function dmjJson\(res\) \{[\s\S]*?\n\}/, 'dmjJson'),
    grab(UI, /function dmjErrText\(e\) \{[\s\S]*?\n\}/, 'dmjErrText'),
    'return { dmjJson: dmjJson, dmjErrText: dmjErrText };',
  ].join('\n');
  // console.warn ถูกเรียกใน dmjJson — stub ให้เงียบระหว่างเทสต์
  return new Function('console', code)({ warn() {} });
})();

// Response ปลอมแบบง่าย ๆ (dmjJson ใช้แค่ .text() / .status / .url)
const fakeRes = (body, status = 200, url = 'https://script.google.com/macros/s/x/exec') => ({
  status, url, text: async () => body,
});

describe('dmjJson — คำตอบที่เป็น JSON จริง', () => {
  it('parse JSON ปกติได้', async () => {
    expect(await dmjJson(fakeRes('{"success":true,"data":{"updated":1}}')))
      .toEqual({ success: true, data: { updated: 1 } });
  });

  it('คำตอบว่า success:false ก็ยัง parse ผ่าน (ให้ตัวเรียกตัดสินใจเอง ไม่ throw)', async () => {
    const d = await dmjJson(fakeRes('{"success":false,"error":"ไม่พบชีต จำนวนหน้าร้าน"}'));
    expect(d.success).toBe(false);
    expect(d.error).toBe('ไม่พบชีต จำนวนหน้าร้าน');
  });

  it('ตัวเลข/array ที่เป็น JSON ถูกต้องก็ผ่าน', async () => {
    expect(await dmjJson(fakeRes('[1,2,3]'))).toEqual([1, 2, 3]);
  });
});

describe('dmjJson — คำตอบที่ไม่ใช่ JSON (ต้นเหตุของบั๊ก)', () => {
  it('หน้า HTML → throw เป็น error ภาษาไทย ไม่ใช่ "Unexpected token"', async () => {
    const html = '<!DOCTYPE html><html><head><title>Error</title></head><body>Sorry…</body></html>';
    await expect(dmjJson(fakeRes(html, 404))).rejects.toThrow(/ระบบหลังบ้าน/);
  });

  it('หน้า HTML → ติดธง dmjKind + เก็บ status/ต้นข้อความไว้ไล่สาเหตุ', async () => {
    const html = '<!DOCTYPE html><html><body>login</body></html>';
    const err = await dmjJson(fakeRes(html, 302)).catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
    expect(err.dmjStatus).toBe(302);
    expect(err.dmjBody).toContain('<!DOCTYPE');
    // ข้อความที่พนักงานเห็นต้องไม่มีศัพท์เทคนิคดิบ ๆ ของ JSON.parse
    expect(err.message).not.toMatch(/Unexpected token|JSON\.parse|is not valid JSON/);
  });

  it('HTML ที่มีช่องว่าง/บรรทัดว่างนำหน้า ก็ยังจับได้ว่าเป็น HTML', async () => {
    const err = await dmjJson(fakeRes('\n\n  <html><body>x</body></html>')).catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
    expect(err.message).toMatch(/ระบบหลังบ้าน/);
  });

  it('คำตอบว่าง (GAS ตัดกลางคัน) → throw ไม่ใช่คืน undefined เงียบ ๆ', async () => {
    const err = await dmjJson(fakeRes('')).catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
  });

  it('เก็บต้นข้อความไม่เกิน 300 ตัวอักษร (กัน console/ log บวม)', async () => {
    const err = await dmjJson(fakeRes('<' + 'x'.repeat(5000))).catch((e) => e);
    expect(err.dmjBody.length).toBeLessThanOrEqual(300);
  });
});

describe('dmjErrText — แปลง error เป็นข้อความที่พนักงานอ่านรู้เรื่อง', () => {
  it('error จาก dmjJson ใช้ข้อความไทยเดิม ไม่ถูกเขียนทับ', async () => {
    const err = await dmjJson(fakeRes('<!DOCTYPE html>')).catch((e) => e);
    expect(dmjErrText(err)).toBe(err.message);
  });

  it('เน็ตหลุด (TypeError: Failed to fetch) → บอกให้เช็คสัญญาณ', () => {
    expect(dmjErrText(new TypeError('Failed to fetch'))).toMatch(/ต่อเน็ตไม่ได้/);
  });

  it('iOS Safari ใช้ข้อความ "Load failed" → ต้องจับได้เหมือนกัน', () => {
    const e = new Error('Load failed');
    expect(dmjErrText(e)).toMatch(/ต่อเน็ตไม่ได้/);
  });

  it('timeout (AbortError) → บอกว่าเซิร์ฟเวอร์ตอบช้า', () => {
    const e = new Error('aborted');
    e.name = 'AbortError';
    expect(dmjErrText(e)).toMatch(/ตอบช้า/);
  });

  it('ไม่มี error เลย → ยังคืนข้อความ ไม่ใช่ undefined/ค่าว่าง', () => {
    expect(dmjErrText(null)).toBeTruthy();
    expect(dmjErrText(undefined)).toBeTruthy();
  });
});

// ── dmjJsonProgress — วัดไบต์แรก/ดาวน์โหลด (Phase 7.6 เอากลับทีละก้อน เริ่มจากตัววัดนี้) ──
// eval ฟังก์ชันจริงจาก ui.jsx (พึ่ง dmjJson + TextDecoder) — ไม่ copy โค้ด
const dmjJsonProgress = (function () {
  const code = [
    grab(UI, /async function dmjJson\(res\) \{[\s\S]*?\n\}/, 'dmjJson'),
    grab(UI, /async function dmjJsonProgress\(res, onBytes\) \{[\s\S]*?\n\}/, 'dmjJsonProgress'),
    'return dmjJsonProgress;',
  ].join('\n');
  return new Function('console', 'TextDecoder', code)({ warn() {} }, TextDecoder);
})();

// Response ปลอมแบบ "สตรีม" — คืน body เป็น chunk ทีละ chunkSize ไบต์ (ของจริงคือก้อนหลาย MB)
function streamRes(body, { status = 200, url = 'https://x/exec', chunkSize = 8 } = {}) {
  const bytes = new TextEncoder().encode(body);
  let pos = 0;
  return {
    status, url,
    body: {
      getReader() {
        return {
          read: async () => {
            if (pos >= bytes.length) return { done: true };
            const value = bytes.slice(pos, pos + chunkSize);
            pos += chunkSize;
            return { done: false, value };
          },
        };
      },
    },
  };
}

describe('dmjJsonProgress — สตรีม + นับไบต์ (แยก "รอ GAS คิด" ออกจาก "ดาวน์โหลด")', () => {
  it('เบราว์เซอร์ไม่รองรับสตรีม (ไม่มี body.getReader) → fallback ไป dmjJson เต็มดุ้น', async () => {
    // ใช้ fakeRes ที่มีแต่ .text() ไม่มี .body → ต้องได้ผลเท่า dmjJson เป๊ะ
    const d = await dmjJsonProgress(fakeRes('{"success":true,"n":3}'));
    expect(d).toEqual({ success: true, n: 3 });
  });

  it('สตรีม JSON ปกติ → คืน object ที่ parse แล้ว เท่ากับ dmjJson', async () => {
    const d = await dmjJsonProgress(streamRes('{"success":true,"data":{"updated":2}}'));
    expect(d).toEqual({ success: true, data: { updated: 2 } });
  });

  it('onBytes ถูกเรียกด้วยยอดสะสม (เพิ่มขึ้นเรื่อย ๆ) และยอดสุดท้าย = จำนวนไบต์ทั้งก้อน', async () => {
    const body = '{"a":1,"b":2,"c":3,"d":4}';
    const total = new TextEncoder().encode(body).length;
    const seen = [];
    const d = await dmjJsonProgress(streamRes(body, { chunkSize: 5 }), (n) => seen.push(n));
    expect(d).toEqual({ a: 1, b: 2, c: 3, d: 4 });
    expect(seen.length).toBeGreaterThan(1);                 // ต้องรายงานหลายครั้ง ไม่ใช่ครั้งเดียวตอนจบ
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]); // สะสมขึ้นจริง
    expect(seen[seen.length - 1]).toBe(total);              // ยอดสุดท้าย = ขนาดจริง
  });

  it('ข้อความไทยหลายไบต์ที่ถูกหั่นคร่อมขอบ chunk → decode กลับมาครบ ไม่เพี้ยน', async () => {
    // property ที่สำคัญสุด: ถ้า decode สตรีมผิด payload จะ corrupt เงียบ ๆ (ตัวอักษรกลายเป็น �)
    // chunkSize=3 การันตีว่าตัวอักษรไทย (3 ไบต์/ตัว) ถูกหั่นกลางตัวแน่นอน
    const body = JSON.stringify({ msg: 'สวัสดีร้านดอกไม้ ฿1,234', ok: true });
    const d = await dmjJsonProgress(streamRes(body, { chunkSize: 3 }));
    expect(d).toEqual({ msg: 'สวัสดีร้านดอกไม้ ฿1,234', ok: true });
  });

  it('สตรีมได้หน้า HTML (GAS ตัดกลางคัน) → throw badjson เหมือน dmjJson ทุกประการ', async () => {
    const err = await dmjJsonProgress(streamRes('<!DOCTYPE html><html><body>x</body></html>', 404))
      .catch((e) => e);
    expect(err.dmjKind).toBe('badjson');
    expect(err.message).toMatch(/ระบบหลังบ้าน/);
    expect(err.message).not.toMatch(/Unexpected token/);
  });

  it('onBytes ที่โยน error เอง ต้องไม่ทำให้การอ่านทั้งก้อนล้ม', async () => {
    const d = await dmjJsonProgress(streamRes('{"ok":true}'), () => { throw new Error('ui บึ้ม'); });
    expect(d).toEqual({ ok: true });
  });
});

// ── meta-test: กันโค้ดถอยกลับไปเป็นแบบที่ทำให้เกิดบั๊กนี้ ──────────────────────
describe('meta — จุดเชื่อมต่อในโค้ดจริง', () => {
  const syncFs = grab(
    VIEWS_MAIN,
    /async function syncFrontStoreData\(entries\) \{[\s\S]*?\n\}/,
    'syncFrontStoreData'
  );

  it('syncFrontStoreData ต้องอ่านคำตอบจริงด้วย dmjJson', () => {
    expect(syncFs).toContain('dmjJson');
  });

  it('syncFrontStoreData ต้องไม่คืน success:true แบบตายตัวโดยไม่เช็คคำตอบ', () => {
    // เดิมคือ `await dmjFetch(...); return { success: true };` → "บันทึกแล้ว" ทั้งที่ไม่ได้บันทึก
    expect(syncFs).toMatch(/d\.success\s*===\s*false/);
  });

  it('placeOrder (ปุ่มยืนยันสั่ง) ต้องไม่ parse ด้วย r.json() ดิบ ๆ', () => {
    const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');
    expect(placeOrder).toContain('dmjJson');
    expect(placeOrder).not.toMatch(/\.then\(r => r\.json\(\)\)/);
  });

  it('placeOrder ต้องส่งชื่อสินค้าไปด้วย (handleOrder_ เขียนลงคอลัมน์ G ของชีตสั่งสินค้า)', () => {
    const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');
    expect(placeOrder).toMatch(/name=\$\{encodeURIComponent\(product\.name/);
  });

  it('dmjJson/dmjErrText ต้องอยู่ใน ui.jsx (โหลดก่อนไฟล์ view ทุกตัว)', () => {
    expect(UI).toMatch(/async function dmjJson\(/);
    expect(UI).toMatch(/function dmjErrText\(/);
  });

  // ── บันทึก "จำนวนที่จัด" ก็ต้องอ่านคำตอบจริงเหมือนกัน (ส.ค. 2026) ──
  // เดิม syncOrderUpdate ยิงแล้วจบ ไม่เคยดูว่า GAS ตอบอะไร → GAS ตอบหน้า HTML
  // (execution ซ้อนกัน) = ไม่มีอะไรถูกบันทึก แต่หน้าจอขึ้น "บันทึกแล้ว" ทันที
  // พนักงานเดินจากไป รอบ sync ถัดมาเลขเด้งกลับค่าเก่า — อาการที่เจ้าของแจ้งว่า
  // "เปลี่ยนจำนวนที่จัดแล้วระบบเด้งเป็นจำนวนอื่น"
  const syncOrd = grab(
    VIEWS_ANA,
    /async function syncOrderUpdate\(order, updates\) \{[\s\S]*?\n\}/,
    'syncOrderUpdate'
  );

  it('syncOrderUpdate ต้องอ่านคำตอบจริงด้วย dmjJson', () => {
    expect(syncOrd).toContain('dmjJson');
  });

  it('syncOrderUpdate ต้องคืนผลจริงให้ผู้เรียก (ไม่ใช่ยิงแล้วจบเงียบ ๆ)', () => {
    expect(syncOrd).toMatch(/return \{ success: false/);
    expect(syncOrd).toMatch(/success !== false|typeof d\.success === "boolean"/);
  });

  it('markComplete ต้องรอผลก่อนขึ้น "บันทึกแล้ว"', () => {
    const mc = grab(VIEWS_ANA, /const markComplete = async \(\) => \{[\s\S]*?\n  \};/, 'markComplete');
    expect(mc).toMatch(/await syncOrderUpdate\(/);
    // ต้องเช็คผลก่อนโชว์ success — ไม่งั้นก็เท่าเดิม
    expect(mc).toMatch(/success === false/);
    const okIdx = mc.indexOf('"success", "บันทึกแล้ว"');
    const badIdx = mc.indexOf('success === false');
    expect(okIdx).toBeGreaterThan(badIdx);   // ทางล้มเหลวต้องถูกตรวจก่อน
  });

  it('savePrepQty (กรอกจำนวนที่จัด) ต้องรอผลและบอกเมื่อบันทึกไม่ผ่าน', () => {
    const sp = grab(VIEWS_ANA, /const savePrepQty = async v => \{[\s\S]*?\n  \};/, 'savePrepQty');
    expect(sp).toMatch(/await syncOrderUpdate\(/);
    expect(sp).toMatch(/setSaveFailed/);
  });

  // 🔴 บั๊กจริง ส.ค. 2026: syncCreateSaleBill ใช้ res.json() ดิบ → GAS ตอบ HTML =
  //    ผู้ขายเห็น "Unexpected token '<'" แล้วกดใหม่ = บิลซ้ำ (เส้นทางที่รับเงินลูกค้าจริง)
  const syncBill = grab(VIEWS_ANA,
    /async function syncCreateSaleBill\(bill, billCid\) \{[\s\S]*?\n\}/, 'syncCreateSaleBill');

  it('syncCreateSaleBill ต้องอ่านคำตอบด้วย dmjJson ไม่ใช่ res.json() ดิบ', () => {
    expect(syncBill).toContain('dmjJson');
    expect(syncBill).not.toMatch(/await res\.json\(\)/);
  });
  it('syncCreateSaleBill ต้องส่ง billCid และติดธง unreadable เมื่ออ่านคำตอบไม่ได้', () => {
    expect(syncBill).toMatch(/billCid: billCid/);
    expect(syncBill).toMatch(/unreadable: true/);
  });
  it('submitBill ต้องถาม billCheck ก่อนขึ้นแดง เมื่อ unreadable ("อ่านไม่ได้" ≠ "ไม่สำเร็จ")', () => {
    const sb = grab(VIEWS_ANA, /async function submitBill\(\) \{[\s\S]*?\n  \}/, 'submitBill');
    expect(sb).toMatch(/r\.unreadable/);
    expect(sb).toMatch(/await syncBillCheck\(cid\)/);
    // ต้องเช็คก่อน setSaving(false)/showToast error — ไม่งั้นจอขึ้นแดงไปแล้ว
    const chkIdx = sb.indexOf('syncBillCheck');
    const errIdx = sb.indexOf('ไม่สำเร็จ:');
    expect(chkIdx).toBeGreaterThan(-1);
    expect(chkIdx).toBeLessThan(errIdx);
  });
});

// ═══ meta-test: SCAN ทั้งไฟล์ — ห้ามมี res.json() ดิบใหม่โผล่ ═══════════════════
// เดิม meta-test ข้างบนเป็น "allowlist" ที่ระบุชื่อฟังก์ชันตายตัว → ฟังก์ชันที่เขียนใหม่
// ทีหลัง (เช่นทั้งชุดขายออนไลน์) หลุดการตรวจ 100% โดยเทสต์ยังเขียว — นั่นคือเหตุผลตรง ๆ
// ที่ syncCreateSaleBill shipped แบบใช้ res.json() ดิบได้ (บิลซ้ำ เส้นทางรับเงินลูกค้าจริง)
//
// ตัวนี้ **สแกนทุกไฟล์ .jsx** หา `.json()` ที่ไม่ได้ผ่าน dmjJson แล้วบังคับว่าต้องอยู่ใน
// ALLOWLIST ที่ระบุเหตุผลเท่านั้น · เพิ่มจุดใหม่ที่ไหนก็ตาม = เทสต์แดงทันที (ต่างจาก allowlist
// รายฟังก์ชันที่มองไม่เห็นของใหม่) · แนวเดียวกับ meta-test ที่สแกน call site ของ
// writeAuditLog_ ใน staff-perf.test.js ที่เคยจับ action ตกหล่นได้จริง
describe('meta — SCAN: ไม่มี res.json() ดิบนอก dmjJson (กันบั๊ก "Unexpected token \'<\'" กลับมา)', () => {
  const FILES = ['app.jsx', 'ui.jsx', 'views-main.jsx', 'views-analytics.jsx',
                 'views-quote.jsx', 'views-attendance.jsx'];

  // เก็บ "บรรทัดดิบ" ที่ยังยอมให้มี .json() — คีย์ด้วยข้อความบรรทัด (ทนการเลื่อนบรรทัด)
  // ⚠️ ทั้งหมดอยู่ใน app.jsx เท่านั้น และเป็นเส้นทาง boot/auth ที่ CLAUDE.md กันไว้ว่าเป็นงาน
  //    Phase 7.6 (การเปลี่ยนมาใช้ dmjFetch/dmjJson ในเส้น auth ถูกถอยออกไป ยังไม่เอากลับ —
  //    ดูคอมเมนต์ที่ postAuthAction ใน app.jsx) · แตะตอนนี้ = ปนกับ 7.6 แล้วแยกไม่ออกว่าอะไรพัง
  const ALLOW = {
    'app.jsx': [
      'const d = await res.json();',                              // handlePin (verifyPin) + startLineLogin (lineLoginMeta)
      '.then(r => r.json())',                                     // checkDataUnchanged (action=ver) — HTML → .catch → reload อยู่แล้ว
      'return await res.json();',                                 // postAuthAction — 7.6-quarantined โดยตรง
      'const d = await (await fetch(url.toString())).json();',    // lineLoginMeta prefetch (auth)
    ],
  };
  const ALLOW_COUNT = { 'app.jsx': 5 };   // 'const d = await res.json();' มี 2 จุด (handlePin + startLineLogin)

  function rawJsonLines(src) {
    return src.split('\n').map(s => s.trim()).filter(t => {
      if (t.startsWith('//') || t.startsWith('*')) return false;  // คอมเมนต์
      if (/\bdmjJson\b/.test(t)) return false;                    // ผ่าน dmjJson แล้ว (รวม guarded fallback)
      return /\.json\(\)/.test(t);
    });
  }

  for (const f of FILES) {
    it(`${f} — ทุก .json() ดิบต้องอยู่ใน ALLOWLIST ที่ระบุเหตุผล`, () => {
      const src = readFileSync(join(ROOT, f), 'utf8');
      const raw = rawJsonLines(src);
      const allow = ALLOW[f] || [];
      const stray = raw.filter(line => !allow.includes(line));
      expect(stray, `พบ res.json() ดิบใหม่ใน ${f} — เปลี่ยนเป็น dmjJson(res) (บทเรียนข้อ 13) ` +
        `หรือถ้าเป็นเส้น auth/boot ที่ตั้งใจเว้นไว้ ให้เพิ่มเข้า ALLOW พร้อมเหตุผล:\n` +
        stray.join('\n')).toEqual([]);
      // กันการ "เพิ่มบรรทัดซ้ำที่หน้าตาเหมือน allowlist" — เช่นแอบเพิ่ม const d = await res.json()
      // อันใหม่ ซึ่ง includes() ปล่อยผ่าน · ล็อกจำนวนรวมไว้ด้วย
      if (ALLOW_COUNT[f] != null) {
        expect(raw.length, `จำนวน .json() ดิบใน ${f} เปลี่ยนไป (คาด ${ALLOW_COUNT[f]}) — ` +
          `ถ้าเพิ่งแปลงจุดใดเป็น dmjJson ให้ลดเลขนี้ · ถ้าเพิ่มจุดใหม่ห้ามผ่าน`).toBe(ALLOW_COUNT[f]);
      }
    });
  }
});

// ── meta-test: ห้ามยิง updateFrontStore ซ้อนกัน ────────────────────────────────
// GAS ปฏิเสธ execution ที่ซ้อนกันด้วย "หน้า HTML" ไม่ใช่ JSON — ถ้า auto-save (debounce 2 วิ)
// กับปุ่มยืนยันสั่งยิงพร้อมกันเมื่อไหร่ บั๊ก "Unexpected token '<'" จะกลับมาทันที
describe('meta — OrderModal ต้องต่อคิวคำขอ ไม่ยิงขนาน', () => {
  const saveFs = grab(VIEWS_MAIN, /const saveFsQty = \(n\) => \{[\s\S]*?\n  \};/, 'saveFsQty');
  const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');

  it('saveFsQty ต่อคิวกับงานที่ค้างอยู่ผ่าน fsInflightRef', () => {
    expect(saveFs).toMatch(/fsInflightRef\.current\s*\|\|\s*Promise\.resolve\(\)/);
    expect(saveFs).toMatch(/fsInflightRef\.current\s*=\s*p/);
  });

  it('saveFsQty ข้ามงานซ้ำเมื่อค่าถูกบันทึกไปแล้วระหว่างรอคิว', () => {
    expect(saveFs).toMatch(/fsSavedRef\.current === n/);
  });

  it('placeOrder ต้องรองานบันทึกหน้าร้านที่ค้างอยู่ก่อนยิง action=order', () => {
    expect(placeOrder).toMatch(/await fsInflightRef\.current/);
  });

  it('dmjJson เก็บ error ล่าสุดไว้ให้เจ้าของเปิดดูย้อนหลังได้', () => {
    expect(UI).toContain('dmj_last_backend_error');
  });
});

// ── meta-test: สั่งของต้องไม่ซ้ำ และต้องรู้ว่าสั่งไปแล้ว ──────────────────────
// อาการที่เจ้าของแจ้ง: "ไม่ขึ้นว่าสั่งแล้ว แต่ของถูกสั่ง" = GAS เขียนชีตเสร็จแล้วแต่ตอบ HTML
// → เว็บไม่รู้ว่าสำเร็จ · ห้ามตัดสินว่าพังโดยไม่เช็คของจริงก่อน
//
// ⚠️ เดิมกฎคือ "ห้ามยิงซ้ำเด็ดขาด" เพราะ action=order ไม่ idempotent · ตอนนี้มี cid
// (handleOrder_ เช็ค findOrderRowByCid_ ก่อนเขียน) แล้ว จึงยิงซ้ำได้ **เฉพาะเมื่อเช็คแล้ว
// ยืนยันว่ายังไม่ลงจริง ๆ** — เงื่อนไขนั้นคือสิ่งที่เทสต์ชุดนี้คุมไว้ ห้ามหลุด
describe('meta — placeOrder ต้องเช็คก่อนเสมอ ยิงซ้ำได้เฉพาะที่ปลอดภัย', () => {
  const placeOrder = grab(VIEWS_MAIN, /const placeOrder = async \(\) => \{[\s\S]*?\n  \};/, 'placeOrder');

  it('อ่านคำตอบไม่ได้ → ไปเช็คชีตว่าออเดอร์ลงไปแล้วหรือยัง', () => {
    expect(placeOrder).toMatch(/await checkOrderByCid\(cid\)/);
    expect(placeOrder).toMatch(/await verifyOrderLanded\(before\)/);  // ทางถอยเมื่อ cid ถามไม่ได้
  });

  it('ยิงซ้ำได้เฉพาะหลังเช็คแล้ว — ทุก retry ต้องผ่าน checkOrderByCid ก่อน', () => {
    // ลำดับต้องเป็น: ยิง → (พลาด) → เช็ค → ค่อยวน · ถ้า setTimeout หน่วงรอบถัดไปมาก่อนการเช็ค
    // แปลว่ามีเส้นทางยิงซ้ำโดยไม่เช็ค = กลับไปสั่งซ้ำ 2 ใบ
    expect(placeOrder.indexOf('checkOrderByCid')).toBeLessThan(placeOrder.indexOf('attempt < ORDER_ATTEMPTS'));
  });

  it('เช็คด้วย cid ไม่ได้ (เช่น GAS ยังเป็นโค้ดเก่า) → ต้องหยุด ห้ามวนยิงซ้ำ', () => {
    expect(placeOrder).toMatch(/landed === null[\s\S]*?return false;/);
  });

  it('cid ต้องคงเดิมทั้งรอบ (สร้างครั้งเดียวก่อนเข้า loop) ไม่งั้นยิงซ้ำ = แถวใหม่', () => {
    expect(placeOrder.indexOf('const cid = orderCid()'))
      .toBeLessThan(placeOrder.indexOf('for (let attempt'));
  });

  it('verifyOrderLanded เทียบยอด "รอ" ที่เพิ่มขึ้น ไม่ parse วันที่ในชีต (ปี พ.ศ.)', () => {
    const verify = grab(VIEWS_MAIN, /const verifyOrderLanded = async \(before\) => \{[\s\S]*?\n  \};/, 'verifyOrderLanded');
    expect(verify).toMatch(/total >= before \+ qty/);
    expect(verify).not.toMatch(/new Date\(|parseCheckDateMs/);
  });
});

describe('meta — ป้าย "สั่งแล้ว" ต้องมาจากข้อมูลจริง และห้ามนับซ้ำ', () => {
  const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

  it('app.jsx เปิดทาง _dmjRefetchOrders ให้ view เรียกหลังสั่งสำเร็จ', () => {
    expect(APP).toContain('window._dmjRefetchOrders = fetchOrdersOnly');
  });

  it('fetchOrdersOnly ประทับ ordersFetchedAt ทุกครั้งที่อัปเดต orders', () => {
    expect(APP).toMatch(/orders: d\.orders, ordersFetchedAt: Date\.now\(\)/);
  });

  it('fetchFromSheet ก็ประทับ ordersFetchedAt ด้วย (ไม่งั้น optimistic entry ค้างค้ำ)', () => {
    expect(APP).toMatch(/ordersFetchedAt: Date\.now\(\)[\s\S]{0,80}setData\(enriched\)/);
  });

  it('pendingOrderQtyMap ตัด optimistic entry ที่ชีตตามมาทันแล้ว (กันนับซ้ำ 2 เด้ง)', () => {
    const map = grab(VIEWS_MAIN, /const pendingOrderQtyMap = uM\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/, 'pendingOrderQtyMap');
    expect(map).toMatch(/o\.ts > fetchedAt/);
    expect(map).toMatch(/data\.ordersFetchedAt/);
  });

  it('onOrderSuccess ต้องประทับ ts ให้ optimistic entry (ไม่มี ts = ตัดไม่ได้)', () => {
    expect(VIEWS_MAIN).toMatch(/orderQty: qty, status:"รอ", ts: Date\.now\(\)/);
  });
});

// ── meta-test: เส้นทางโหลด payload ต้องวัด "ไบต์แรก" ได้จริง (Phase 7.6 เอากลับทีละก้อน) ──
// กันถอยกลับเงียบ ๆ: ถ้ามีแต่ helper ใน ui.jsx แต่ fetchFromSheet ไม่เรียก = วัดไม่ได้เหมือนเดิม
describe('meta — dmjJsonProgress ต่อเข้าเส้นทางโหลด payload จริง', () => {
  const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

  it('ui.jsx มี dmjJsonProgress ที่ fallback ไป dmjJson (ไม่ทำครึ่ง ๆ กลาง ๆ)', () => {
    const fn = grab(UI, /async function dmjJsonProgress\(res, onBytes\) \{[\s\S]*?\n\}/, 'dmjJsonProgress');
    expect(fn).toContain('getReader');
    expect(fn).toMatch(/if \(!canStream\) return dmjJson\(res\)/);   // เบราว์เซอร์เก่า → เส้นเดิมทั้งดุ้น
    expect(fn).toContain('dmjJson({ text:');                          // error path = ตัวเดียวกับ dmjJson
    expect(fn).not.toMatch(/\.json\(\)/);                             // ห้ามมี res.json() ดิบ (บทเรียนข้อ 13)
  });

  it('fetchFromSheet เรียก dmjJsonProgress ในเส้นทางโหลด payload', () => {
    expect(APP).toMatch(/dmjJsonProgress\(r, onBytes\)/);
  });

  it('ปล่อย mark "payload:ไบต์แรก" ตอนได้ไบต์แรก (แยกจาก "payload:ครบ")', () => {
    expect(APP).toContain("dmjMark('payload:ไบต์แรก')");
    expect(APP).toContain("dmjMark('payload:ครบ'");
    // ไบต์แรก mark ต้องอยู่ใน onBytes (ยิงครั้งเดียวตอนไบต์แรก ไม่ใช่ทุก chunk)
    expect(APP).toMatch(/if \(!_firstByte\)[\s\S]{0,80}payload:ไบต์แรก/);
  });
});
