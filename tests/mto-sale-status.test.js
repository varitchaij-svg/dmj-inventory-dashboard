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
const F_SPLIT = grab(SRC, /function splitMtoSaleItems_\(items, skuByJob\) \{[\s\S]*?\n\}/);
const F_VALIDATE = grab(SRC, /function validateMtoJobsSellable_\(ss, jobIds\) \{[\s\S]*?\n\}/);
const F_GROUPSKU = grab(SRC, /function mtoGroupSkusForSale_\(ss, jobIds\) \{[\s\S]*?\n\}/);

// eslint-disable-next-line no-new-func
const evaled = new Function(
  'const SHEET_MTO_JOBS = "งาน MTO";\n' +
  [CONSTS, F_CANSELL, F_GET, F_MARK, F_SPLIT, F_VALIDATE, F_GROUPSKU].join('\n') +
  '\nreturn { canSellMtoJob_, markMtoJobSold_, splitMtoSaleItems_, validateMtoJobsSellable_, mtoGroupSkusForSale_, MTO_SALE_SOLD, MTO_SALE_UNSOLD, MTO_SALE_CANCELLED, COL_MTO_SALE_STATUS, COL_MTO_SALE_REF, COL_MTO_SALE_AT, COL_MTO_SALE_CID, COL_MTO_JOB_SKU };'
)();
const { canSellMtoJob_, markMtoJobSold_, splitMtoSaleItems_, validateMtoJobsSellable_, mtoGroupSkusForSale_, MTO_SALE_SOLD, MTO_SALE_UNSOLD, MTO_SALE_CANCELLED } = evaled;

const HEADER = ['JobID','วันที่','ชื่องาน','ลูกค้า','ราคา','รูป','สถานะ','ปิดงานเมื่อ','ผู้รับผิดชอบ(staffId)','ชื่อผู้รับผิดชอบ','สถานะขาย','อ้างอิงบิลขาย','ขายเมื่อ','billCid ขาย','รหัสสินค้า(SKU กลุ่ม)'];
const W = 15;

// r[6]=fulfillment status, K=index10 (saleStatus), L=index11 (ref), M=index12 (soldAt), N=index13 (billCid), O=index14 (groupSku)
function jobRow({ id = 'MTO-202608001', done = true, sale = '', ref = '', at = '', cid = '', groupSku = 'BK001' } = {}) {
  const r = new Array(W).fill('');
  r[0] = id; r[6] = done ? 'เสร็จแล้ว' : 'กำลังจัด';
  r[10] = sale; r[11] = ref; r[12] = at; r[13] = cid; r[14] = groupSku;
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

describe('splitMtoSaleItems_ — แยกบรรทัด MTO + re-stamp Job SKU จากชีต (server-truth)', () => {
  it('ไม่มีบรรทัด MTO → zortItems/deductItems เท่ากับ items เดิม (backward-compatible)', () => {
    const items = [{ sku: 'R01', qty: 2, price: 100 }, { sku: 'R02', qty: 1, price: 50 }];
    const s = splitMtoSaleItems_(items, {});
    expect(s.hasMto).toBe(false);
    expect(s.mtoJobIds).toEqual([]);
    expect(s.zortItems).toEqual(items);
    expect(s.deductItems).toEqual(items);
  });

  it('บรรทัด MTO → sku ถูก re-stamp ด้วย Job SKU จาก skuByJob (ไม่เชื่อ sku ที่ client ส่ง), ราคาไม่เปลี่ยน', () => {
    // client ส่ง sku=jobId (เครื่องเก่า) มา — ต้องถูกแทนด้วย Job SKU จริงจากชีต
    const items = [{ sku: 'MTO-202608001', name: 'ช่อพิเศษ', qty: 1, price: 1000, mtoJobId: 'MTO-202608001' }];
    const s = splitMtoSaleItems_(items, { 'MTO-202608001': 'BK001' });
    expect(s.hasMto).toBe(true);
    expect(s.mtoJobIds).toEqual(['MTO-202608001']);
    expect(s.zortItems[0].sku).toBe('BK001');       // sku = Job SKU จากชีต ไม่ใช่ค่า client
    expect(s.zortItems[0].price).toBe(1000);        // ราคาคงเดิม
    expect(s.zortItems[0].name).toBe('ช่อพิเศษ');
  });

  it('บรรทัด MTO ไม่เข้า deductItems (องค์ประกอบหักตอน fulfillment แล้ว)', () => {
    const items = [
      { sku: 'R01', qty: 2, price: 100 },
      { sku: 'BK001', qty: 1, price: 1000, mtoJobId: 'MTO-1' },
    ];
    const s = splitMtoSaleItems_(items, { 'MTO-1': 'BK001' });
    expect(s.deductItems).toHaveLength(1);
    expect(s.deductItems[0].sku).toBe('R01');       // เหลือแต่สินค้าปกติ
    expect(s.zortItems).toHaveLength(2);            // ZORT ยังได้ทั้ง 2 บรรทัด (Job SKU + สินค้าปกติ)
  });

  it('ไม่ mutate items เดิม (Object.assign สำเนาใหม่)', () => {
    const items = [{ sku: 'X', qty: 1, price: 1000, mtoJobId: 'MTO-1' }];
    splitMtoSaleItems_(items, { 'MTO-1': 'BK001' });
    expect(items[0].sku).toBe('X');                 // ต้นฉบับไม่ถูกแก้
  });

  it('หลาย MTO ในบิลเดียว → mtoJobIds ครบ, แต่ละบรรทัดได้ Job SKU ของตัวเอง (คนละ SKU)', () => {
    const items = [
      { sku: '', qty: 1, price: 1000, mtoJobId: 'MTO-1' },
      { sku: '', qty: 1, price: 2000, mtoJobId: 'MTO-2' },
    ];
    const s = splitMtoSaleItems_(items, { 'MTO-1': 'BK001', 'MTO-2': 'VASE001' });
    expect(s.mtoJobIds).toEqual(['MTO-1', 'MTO-2']);
    expect(s.zortItems.map(it => it.sku)).toEqual(['BK001', 'VASE001']);  // Job SKU ต่องาน ไม่ใช่ SKU เดียว
    expect(s.deductItems).toEqual([]);
  });
});

describe('mtoGroupSkusForSale_ — หา Job SKU จากชีต + ปฏิเสธงานที่ยังไม่ตั้ง', () => {
  it('ทุกงานมี Job SKU → ok + skuByJob ครบ', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', groupSku: 'BK001' }), jobRow({ id: 'MTO-2', groupSku: 'VASE001' })]);
    const r = mtoGroupSkusForSale_(makeSs(sheet), ['MTO-1', 'MTO-2']);
    expect(r.ok).toBe(true);
    expect(r.skuByJob).toEqual({ 'MTO-1': 'BK001', 'MTO-2': 'VASE001' });
  });
  it('Job SKU ถูก uppercase (ตรงกับตอนบันทึก)', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', groupSku: 'bk001' })]);
    expect(mtoGroupSkusForSale_(makeSs(sheet), ['MTO-1']).skuByJob['MTO-1']).toBe('BK001');
  });
  it('งานยังไม่ตั้ง Job SKU (ว่าง) → ปฏิเสธ พร้อม jobId + ข้อความ', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', groupSku: '' })]);
    const r = mtoGroupSkusForSale_(makeSs(sheet), ['MTO-1']);
    expect(r.ok).toBe(false);
    expect(r.jobId).toBe('MTO-1');
    expect(r.message).toMatch(/ยังไม่ได้ตั้งรหัสสินค้า/);
  });
  it('งานไม่พบในชีต → ปฏิเสธ (ถือว่าไม่มี Job SKU)', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', groupSku: 'BK001' })]);
    expect(mtoGroupSkusForSale_(makeSs(sheet), ['MTO-9']).ok).toBe(false);
  });
});

describe('validateMtoJobsSellable_ — ตรวจก่อนออกบิล', () => {
  it('ทุกใบขายได้ → ok', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', sale: 'ยังไม่ขาย' }), jobRow({ id: 'MTO-2', sale: '' })]);
    expect(validateMtoJobsSellable_(makeSs(sheet), ['MTO-1', 'MTO-2'])).toEqual({ ok: true });
  });
  it('มีใบยังจัดไม่เสร็จ → ปฏิเสธ พร้อมข้อความ', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', done: false, sale: 'ยังไม่ขาย' })]);
    const r = validateMtoJobsSellable_(makeSs(sheet), ['MTO-1']);
    expect(r.ok).toBe(false);
    expect(r.jobId).toBe('MTO-1');
    expect(r.message).toMatch(/ยังจัดไม่เสร็จ/);
  });
  it('มีใบขายไปแล้ว → ปฏิเสธ', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', sale: MTO_SALE_SOLD })]);
    expect(validateMtoJobsSellable_(makeSs(sheet), ['MTO-1']).message).toMatch(/ขายไปแล้ว/);
  });
  it('มีใบถูกยกเลิก → ปฏิเสธ', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', sale: MTO_SALE_CANCELLED })]);
    expect(validateMtoJobsSellable_(makeSs(sheet), ['MTO-1']).message).toMatch(/ยกเลิก/);
  });
  it('ไม่พบงาน → ปฏิเสธ', () => {
    const sheet = makeSheet([jobRow({ id: 'MTO-1', sale: 'ยังไม่ขาย' })]);
    expect(validateMtoJobsSellable_(makeSs(sheet), ['MTO-9']).message).toMatch(/ไม่พบงาน/);
  });
});

// meta-test: createSaleBill wiring — บรรทัด MTO เข้า ZORT เป็น bundle, ไม่หักสต็อกซ้ำ, มาร์คขาย
describe('meta — createSaleBill ผูกงาน MTO ถูกจุด', () => {
  const F_BILL = grab(SRC, /function createSaleBill\(ss, data, actor\) \{[\s\S]*?\n\}\n\n\/\/ doGet action=billCheck/);
  it('หา Job SKU จากชีต (server-truth) แล้วปฏิเสธถ้างานยังไม่ตั้ง SKU กลุ่ม', () => {
    expect(F_BILL).toMatch(/mtoGroupSkusForSale_\(ss, mtoJobIdsInCart\)/);
    expect(F_BILL).toMatch(/if \(!mtoSkuRes\.ok\) return error/);
  });
  it('split ใช้ skuByJob จากชีต (ไม่เชื่อ sku จาก client)', () => {
    expect(F_BILL).toMatch(/splitMtoSaleItems_\(items, mtoSkuByJob\)/);
    expect(F_BILL).not.toMatch(/readMtoBundleSku_/);
  });
  it('productList (ZORT) ใช้ zortItems — บรรทัด MTO เป็น Job SKU', () => {
    expect(F_BILL).toMatch(/buildZortLineItems_\(mtoSplit\.zortItems/);
  });
  it('การหักสต็อกใช้ deductItems — ไม่หักองค์ประกอบ MTO ซ้ำ', () => {
    expect(F_BILL).toMatch(/buildZortLineItems_\(mtoSplit\.deductItems/);
    expect(F_BILL).toMatch(/deductFrontStoreForSale_\(ss, deductList\)/);
  });
  it('ตรวจ sellable ก่อนยิง AddOrder (ไม่ใช่หลัง)', () => {
    const iValidate = F_BILL.indexOf('validateMtoJobsSellable_');
    const iAddOrder = F_BILL.indexOf('/Order/AddOrder');
    expect(iValidate).toBeGreaterThan(-1);
    expect(iAddOrder).toBeGreaterThan(-1);
    expect(iValidate).toBeLessThan(iAddOrder);
  });
  it('มาร์คขาย (markMtoJobSold_) หลังบันทึกบิล (appendSaleBillRow_)', () => {
    // ใช้รูปแบบ "การเรียกจริง" ไม่ใช่ชื่อเปล่า — ชื่อโผล่ในคอมเมนต์แนะนำหัวฟังก์ชันด้วย
    const iBill = F_BILL.indexOf('appendSaleBillRow_(ss');
    const iMark = F_BILL.indexOf('markMtoJobSold_(ss, jid');
    expect(iBill).toBeGreaterThan(-1);
    expect(iMark).toBeGreaterThan(iBill);
  });
  it('มาร์คขายส่ง orderNumber + billCid ให้ trace ได้', () => {
    expect(F_BILL).toMatch(/markMtoJobSold_\(ss, jid, orderNumber[^,]*, mtoSoldAt, billCid\)/);
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
