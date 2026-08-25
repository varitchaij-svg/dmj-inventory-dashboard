// tests/security-f07-authz.test.js — F-07: flag-gated authorization for analytics/quotation reads
// ─────────────────────────────────────────────────────────────────────────────
// endpoint กลุ่ม analytics/ใบเสนอราคา (getCustomerAnalytics/getQuotationSummary/
// getPendingQuotations/getQuotationForPrint/getQuotationDrafts/getDeadStock) เดิมตรวจแค่
// APP_TOKEN สาธารณะ → ปล่อย PII ลูกค้า (เบอร์/อีเมล) + ไปป์ไลน์ขายให้ใครก็ได้ที่มี URL (F-07)
//
// fix = ธง F07_PROTECTION_ENABLED (default ปิด = พฤติกรรมเดิม) + f07Guard_ ตรวจ session จริง
// ตัวเรียก frontend เป็น GET ที่ "ไม่เคยแนบ token" → ต้องเปิดหลังบ้านพร้อมที่ frontend เริ่มส่ง token
//
// เทสต์นี้ eval f07Guard_ จริงจาก .gs (ไม่ copy — หลักเดียวกับ auth.test.js) + สแกน source
// ยืนยันว่า handler ทั้ง 6 เรียก guard และตัวเรียก frontend ทั้ง 5 ส่ง sessionToken
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const VQ  = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');

function grab(re) {
  const m = GS.match(re);
  if (!m) throw new Error('หาโค้ดต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// eval f07Guard_ + isAdminRole_ จริง โดย stub GAS globals + resolveSession_
function loadGuard({ flag, session }) {
  const isAdmin = grab(/function isAdminRole_\([^)]*\)\s*\{[^}]*\}/);
  const guard   = grab(/function f07Guard_\([\s\S]*?\n\}/);
  const ctx = {
    SHEET_ID: 'X',
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'F07_PROTECTION_ENABLED' ? flag : null) }) },
    SpreadsheetApp: { openById: () => ({}) },
    resolveSession_: () => session,
    ContentService: {
      createTextOutput: (s) => ({ setMimeType: () => ({ _body: s, unauthorized: /Unauthorized/.test(s) }) }),
      MimeType: { JSON: 1 },
    },
  };
  // eslint-disable-next-line no-new-func
  new Function('ctx', `with(ctx){ ${isAdmin}\n ${guard}\n ctx.f07Guard_ = f07Guard_; }`)(ctx);
  return ctx.f07Guard_;
}
const E = (tok) => ({ parameter: { sessionToken: tok || '' } });

describe('F-07 — f07Guard_ (flag-gated)', () => {
  it('flag OFF → คืน null (ผ่าน, พฤติกรรมเดิม) แม้ไม่มี session', () => {
    const g = loadGuard({ flag: 'false', session: null });
    expect(g(E(''), null)).toBe(null);
  });
  it('flag unset → คืน null (default = เดิม)', () => {
    const g = loadGuard({ flag: null, session: null });
    expect(g(E(''), null)).toBe(null);
  });
  it('flag ON + ไม่มี session → Unauthorized', () => {
    const g = loadGuard({ flag: 'true', session: null });
    const r = g(E(''), null);
    expect(r && r.unauthorized).toBe(true);
  });
  it('flag ON + owner → ผ่าน (null)', () => {
    const g = loadGuard({ flag: 'true', session: { role: 'owner', status: 'active' } });
    expect(g(E('t'), null)).toBe(null);
  });
  it('flag ON + dev → ผ่าน (isAdminRole_ ครอบ)', () => {
    const g = loadGuard({ flag: 'true', session: { role: 'dev', status: 'active' } });
    expect(g(E('t'), null)).toBe(null);
  });
  it('flag ON + saler บน endpoint admin-only (allowedRoles=null) → Unauthorized', () => {
    const g = loadGuard({ flag: 'true', session: { role: 'saler', status: 'active' } });
    const r = g(E('t'), null);
    expect(r && r.unauthorized).toBe(true);
  });
  it('flag ON + saler บน endpoint ใบเสนอราคา (allowedRoles=[saler,storedevice]) → ผ่าน', () => {
    const g = loadGuard({ flag: 'true', session: { role: 'saler', status: 'active' } });
    expect(g(E('t'), ['saler', 'storedevice'])).toBe(null);
  });
  it('flag ON + session ไม่ active → Unauthorized', () => {
    const g = loadGuard({ flag: 'true', session: { role: 'owner', status: 'revoked' } });
    const r = g(E('t'), null);
    expect(r && r.unauthorized).toBe(true);
  });
});

describe('F-07 — wiring (source scan)', () => {
  it('handler ทั้ง 6 เรียก f07Guard_ ก่อนคืนข้อมูล', () => {
    for (const act of ['getDeadStock', 'getPendingQuotations', 'getQuotationDrafts',
                       'getQuotationForPrint', 'getQuotationSummary', 'getCustomerAnalytics']) {
      const i = GS.indexOf(`action === '${act}'`);
      expect(i, `หา handler ${act} ไม่เจอ`).toBeGreaterThan(-1);
      const block = GS.slice(i, i + 320);
      expect(block, `${act} ไม่ได้เรียก f07Guard_`).toMatch(/f07Guard_\(/);
    }
  });
  it('ตัวเรียก frontend ทั้ง 5 ส่ง sessionToken (GET ไม่ผ่าน dmjFetch body → ต้องแนบเอง)', () => {
    // ต้องมี "อย่างน้อย 1 occurrence" ของ action=X ที่มี sessionToken ตามมาใน ~220 ตัวอักษร
    // (indexOf เฉย ๆ จะไปโดน comment ที่พูดถึง action=X โดยไม่ใช่ URL จริง)
    const hasTokenCall = (src, act) => {
      let from = 0, i;
      while ((i = src.indexOf(`action=${act}`, from)) !== -1) {
        if (/sessionToken=/.test(src.slice(i, i + 220))) return true;
        from = i + 1;
      }
      return false;
    };
    for (const act of ['getDeadStock', 'getQuotationSummary', 'getCustomerAnalytics']) {
      expect(hasTokenCall(VA, act), `views-analytics: ${act} ไม่ส่ง sessionToken`).toBe(true);
    }
    for (const act of ['getQuotationDrafts', 'getQuotationForPrint']) {
      expect(hasTokenCall(VQ, act), `views-quote: ${act} ไม่ส่ง sessionToken`).toBe(true);
    }
  });
});
