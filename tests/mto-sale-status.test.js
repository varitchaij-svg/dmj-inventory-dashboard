// tests/mto-sale-status.test.js — สถานะขายของงาน MTO (state machine ที่ 2)
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 "Make existing MTO sellable" (ส.ค. 2026): งาน MTO เดิมมีสถานะเดียว = fulfillment
// ("กำลังจัด"→"เสร็จแล้ว") · เพิ่มสถานะการขายแยกอิสระ (ยังไม่ขาย/ขายแล้ว/ยกเลิก) — Decision #1
// สอง state machine แยกกัน · หักสต็อกตอน "จบการจัด" ไม่ใช่ตอนลูกค้าจ่าย (Decision #2)
//
// eval `markMtoJobSold_` ตัวจริงจาก `.gs` มารันกับชีตจำลอง (ไม่ copy ตรรกะ — เหมือน auth.test.js
// เพราะเป็นตรรกะ idempotent ที่พลาดแล้ว = ทำเครื่องหมายขายซ้ำ/ทับ ref เดิม)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const CONSTS = grab(SRC, /const MTO_FULFILL_DONE = "เสร็จแล้ว";[\s\S]*?const MTO_SALE_CANCELLED = "ยกเลิก";/);
const F_CANSELL = grab(SRC, /function canSellMtoJob_\(job\) \{[\s\S]*?\n\}/);
const F_GET  = grab(SRC, /function getOrCreateMtoJobSheet_\(ss\) \{[\s\S]*?\n\}/);
const F_MARK = grab(SRC, /function markMtoJobSold_\(ss, jobId, billRef, soldAt, billCid\) \{[\s\S]*?\n\}/);

// eslint-disable-next-line no-new-func
const evaled = new Function(
  'const SHEET_MTO_JOBS = "งาน MTO";\n' +
  [CONSTS, F_CANSELL, F_GET, F_MARK].join('\n') +
  '\nreturn { canSellMtoJob_, markMtoJobSold_, MTO_SALE_SOLD, MTO_SALE_UNSOLD, MTO_SALE_CANCELLED, COL_MTO_SALE_STATUS, COL_MTO_SALE_REF, COL_MTO_SALE_AT, COL_MTO_SALE_CID };'
)();
const { canSellMtoJob_, markMtoJobSold_, MTO_SALE_SOLD, MTO_SALE_UNSOLD, MTO_SALE_CANCELLED } = evaled;

const HEADER = ['JobID','วันที่','ชื่องาน','ลูกค้า','ราคา','รูป','สถานะ','ปิดงานเมื่อ','ผู้รับผิดชอบ(staffId)','ชื่อผู้รับผิดชอบ','สถานะขาย','อ้างอิงบิลขาย','ขายเมื่อ','billCid ขาย'];
const W = 14;

// r[6]=fulfillment status, K=index10 (saleStatus), L=index11 (ref), M=index12 (soldAt), N=index13 (billCid)
function jobRow({ id = 'MTO-202608001', done = true, sale = '', ref = '', at = '', cid = '' } = {}) {
  const r = new Array(W).fill('');
  r[0] = id; r[6] = done ? 'เสร็จแล้ว' : 'กำลังจัด';
  r[10] = sale; r[11] = ref; r[12] = at; r[13] = cid;
  return r;
}

function makeSheet(dataRows) {
  const rows = [HEADER.slice(), ...dataRows];
  return {
    _rows: rows,
    getRange: (r, c, nR, nC) => ({
      getValue: () => (rows[r - 1] && rows[r - 1][c - 1] != null ? rows[r - 1][c - 1] : ''),
      setValues: (vals) => {
        for (let i = 0; i < (nR || 1); i++) {
          if (!rows[r - 1 + i]) rows[r - 1 + i] = new Array(W).fill('');
          for (let j = 0; j < (nC || 1); j++) rows[r - 1 + i][c - 1 + j] = vals[i][j];
        }
      },
    }),
    getDataRange: () => ({ getValues: () => rows }),
  };
}
function makeSs(sheet) {
  return { getSheetByName: () => sheet, insertSheet: () => { throw new Error('ห้ามสร้างชีตใหม่ในเทสต์'); } };
}

describe('canSellMtoJob_ — กฎธุรกิจเดียวว่าขายได้ไหม (Done + Unsold)', () => {
  it('จัดเสร็จ + ยังไม่ขาย → ขายได้', () => {
    expect(canSellMtoJob_({ status: 'เสร็จแล้ว', saleStatus: MTO_SALE_UNSOLD })).toBe(true);
  });
  it('จัดเสร็จ + สถานะขายว่าง (แถวเก่า) → ขายได้', () => {
    expect(canSellMtoJob_({ status: 'เสร็จแล้ว', saleStatus: '' })).toBe(true);
  });
  it('ยังจัดไม่เสร็จ (กำลังจัด) → ขายไม่ได้', () => {
    expect(canSellMtoJob_({ status: 'กำลังจัด', saleStatus: MTO_SALE_UNSOLD })).toBe(false);
  });
  it('ขายแล้ว → ขายซ้ำไม่ได้', () => {
    expect(canSellMtoJob_({ status: 'เสร็จแล้ว', saleStatus: MTO_SALE_SOLD })).toBe(false);
  });
  it('ยกเลิก → ขายไม่ได้', () => {
    expect(canSellMtoJob_({ status: 'เสร็จแล้ว', saleStatus: MTO_SALE_CANCELLED })).toBe(false);
  });
  it('null / ไม่มี object → ขายไม่ได้', () => {
    expect(canSellMtoJob_(null)).toBe(false);
    expect(canSellMtoJob_(undefined)).toBe(false);
  });
});

describe('markMtoJobSold_ — ทำเครื่องหมายขายแล้ว', () => {
  it('ยังไม่ขาย + จัดเสร็จ → ขายแล้ว (เขียน status/ref/soldAt/billCid ครบ)', () => {
    const sheet = makeSheet([jobRow({ sale: 'ยังไม่ขาย' })]);
    const r = markMtoJobSold_(makeSs(sheet), 'MTO-202608001', 'RC-202608010', '20/08/2026 10:00', 'CID-abc');
    expect(r).toEqual({ ok: true, reason: 'sold' });
    expect(sheet._rows[1][10]).toBe(MTO_SALE_SOLD);       // K
    expect(sheet._rows[1][11]).toBe('RC-202608010');      // L
    expect(sheet._rows[1][12]).toBe('20/08/2026 10:00');  // M
    expect(sheet._rows[1][13]).toBe('CID-abc');           // N (billCid)
  });

  it('แถวเก่าสถานะขายว่าง (ไม่เคยตั้ง) → นับเป็นยังไม่ขาย → ขายได้', () => {
    const sheet = makeSheet([jobRow({ sale: '' })]);
    const r = markMtoJobSold_(makeSs(sheet), 'MTO-202608001', 'RC-1', 'now', 'CID-1');
    expect(r.ok).toBe(true);
    expect(sheet._rows[1][10]).toBe(MTO_SALE_SOLD);
  });

  it('ยังจัดไม่เสร็จ → notFulfilled (ไม่เขียน)', () => {
    const sheet = makeSheet([jobRow({ done: false, sale: 'ยังไม่ขาย' })]);
    const r = markMtoJobSold_(makeSs(sheet), 'MTO-202608001', 'RC-1', 'now', 'CID-1');
    expect(r).toEqual({ ok: false, reason: 'notFulfilled' });
    expect(sheet._rows[1][10]).toBe('ยังไม่ขาย');   // ไม่ถูกทำเครื่องหมายขาย
  });

  it('ขายแล้ว → idempotent (ไม่เขียนซ้ำ คืน ref เดิม)', () => {
    const sheet = makeSheet([jobRow({ sale: MTO_SALE_SOLD, ref: 'RC-OLD', at: 'x', cid: 'CID-OLD' })]);
    const r = markMtoJobSold_(makeSs(sheet), 'MTO-202608001', 'RC-NEW', 'y', 'CID-NEW');
    expect(r).toEqual({ ok: false, reason: 'alreadySold', ref: 'RC-OLD' });
    expect(sheet._rows[1][11]).toBe('RC-OLD');   // ref เดิมไม่ถูกทับ
    expect(sheet._rows[1][12]).toBe('x');        // soldAt เดิมไม่ถูกทับ
    expect(sheet._rows[1][13]).toBe('CID-OLD');  // billCid เดิมไม่ถูกทับ
  });

  it('ยกเลิกแล้ว → ปฏิเสธการขาย (ไม่เขียน)', () => {
    const sheet = makeSheet([jobRow({ sale: MTO_SALE_CANCELLED })]);
    const r = markMtoJobSold_(makeSs(sheet), 'MTO-202608001', 'RC-1', 'now', 'CID-1');
    expect(r).toEqual({ ok: false, reason: 'cancelled' });
    expect(sheet._rows[1][10]).toBe(MTO_SALE_CANCELLED);
  });

  it('ไม่พบงานนี้ → notFound', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-202608002', sale: 'ยังไม่ขาย' })]);
    const r = markMtoJobSold_(makeSs(sheet), 'MTO-202608001', 'RC-1', 'now', 'CID-1');
    expect(r).toEqual({ ok: false, reason: 'notFound' });
  });

  it('jobId ว่าง → notFound (ไม่ไปแตะชีต)', () => {
    const sheet = makeSheet([jobRow({ sale: 'ยังไม่ขาย' })]);
    expect(markMtoJobSold_(makeSs(sheet), '', 'RC-1', 'now', 'CID-1')).toEqual({ ok: false, reason: 'notFound' });
  });

  it('jobId มีช่องว่างหน้า-หลัง → trim แล้วยังตรง', () => {
    const sheet = makeSheet([jobRow({ sale: 'ยังไม่ขาย' })]);
    expect(markMtoJobSold_(makeSs(sheet), '  MTO-202608001  ', 'RC-1', 'now', 'CID-1').ok).toBe(true);
  });

  it('เขียนเฉพาะแถวที่ตรง jobId ไม่แตะงานอื่น', () => {
    const sheet = makeSheet([
      jobRow({ id: 'MTO-202608001', sale: 'ยังไม่ขาย' }),
      jobRow({ id: 'MTO-202608002', sale: 'ยังไม่ขาย' }),
    ]);
    markMtoJobSold_(makeSs(sheet), 'MTO-202608002', 'RC-9', 'now', 'CID-9');
    expect(sheet._rows[1][10]).toBe('ยังไม่ขาย');   // แถวแรกไม่ถูกแตะ
    expect(sheet._rows[2][10]).toBe(MTO_SALE_SOLD);  // แถวที่สองถูกทำเครื่องหมาย
  });
});

// meta-test: readMtoJobs_ ต้อง expose สถานะขาย + sellable กลับไป frontend
describe('meta — readMtoJobs_ ส่งสถานะขาย + sellable ออกไป', () => {
  const F_READ = grab(SRC, /function readMtoJobs_\(\) \{[\s\S]*?\n\}/);
  it('มี key saleStatus/saleRef/soldAt/saleBillCid', () => {
    expect(F_READ).toMatch(/saleStatus:/);
    expect(F_READ).toMatch(/saleRef:/);
    expect(F_READ).toMatch(/soldAt:/);
    expect(F_READ).toMatch(/saleBillCid:/);
  });
  it('map จากคอลัมน์ COL_MTO_SALE_* (ไม่ hard-code index)', () => {
    expect(F_READ).toMatch(/COL_MTO_SALE_STATUS-1/);
    expect(F_READ).toMatch(/COL_MTO_SALE_REF-1/);
    expect(F_READ).toMatch(/COL_MTO_SALE_AT-1/);
    expect(F_READ).toMatch(/COL_MTO_SALE_CID-1/);
  });
  it('แถวเก่า (สถานะขายว่าง) fallback เป็น "ยังไม่ขาย" ไม่ใช่ค่าว่าง', () => {
    expect(F_READ).toMatch(/\|\|\s*MTO_SALE_UNSOLD/);
  });
  it('sellable มาจาก canSellMtoJob_ (กฎเดียว) ไม่เขียนเงื่อนไขซ้ำในนี้', () => {
    expect(F_READ).toMatch(/sellable\s*=\s*canSellMtoJob_\(/);
  });
});

// meta-test: markMtoJobSold_ ต้องตัดสิน "ขายได้ไหม" ผ่าน canSellMtoJob_ ไม่เทียบ status เอง
describe('meta — markMtoJobSold_ ใช้กฎเดียว (canSellMtoJob_)', () => {
  it('เรียก canSellMtoJob_ เป็นตัวกั้น', () => {
    expect(F_MARK).toMatch(/canSellMtoJob_\(/);
  });
});

// meta-test: getOrCreateMtoJobSheet_ ต้อง self-heal คอลัมน์ใหม่ให้ชีตเก่า (append-only)
describe('meta — getOrCreateMtoJobSheet_ self-heal คอลัมน์สถานะขาย', () => {
  it('เติม header สถานะขาย + billCid ให้ชีตเก่า', () => {
    expect(F_GET).toMatch(/COL_MTO_SALE_STATUS/);
    expect(F_GET).toMatch(/สถานะขาย/);
    expect(F_GET).toMatch(/COL_MTO_SALE_CID/);
  });
});
