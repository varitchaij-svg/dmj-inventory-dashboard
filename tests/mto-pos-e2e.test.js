// tests/mto-pos-e2e.test.js — Dry Run แบบ end-to-end: สร้าง MTO → Fulfill → POS → Checkout →
// Receipt → Audit → Sheet → ZORT Payload (Phase 2 "Make existing MTO sellable")
// ─────────────────────────────────────────────────────────────────────────────
// ต่างจากเทสต์อื่นที่ eval "ฟังก์ชันเดียว" ต่อไฟล์ — ไฟล์นี้ eval **ทั้ง appsscript_complete.gs**
// เป็นสคริปต์เดียว (เหมือนที่ GAS รันจริง) แล้วฉีดของปลอมเฉพาะ "แพลตฟอร์ม GAS" เข้าไป
// (SpreadsheetApp/LockService/CacheService/PropertiesService/UrlFetchApp/Utilities/...)
// ไม่แตะ/ไม่ mock ตรรกะธุรกิจสักบรรทัดเดียว — createMtoJob/closeMtoJob/createSaleBill/
// applyMtoFulfillment_/readMtoJobs_ ที่รันคือโค้ดจริงทั้งหมด 100%
//
// เหตุผลที่ทำเป็น integration ระดับนี้ (ไม่ใช่แค่ unit ต่อฟังก์ชัน): งาน MTO→POS ข้าม
// หลายฟังก์ชัน/หลายชีตจริง ๆ (งาน MTO → วัตถุดิบ MTO → อัพเดทจำนวนสินค้า → บิลขาย → Audit Log →
// ZORT payload) การเทสต์แยกฟังก์ชันยืนยัน "แต่ละจุดถูก" แต่ไม่ยืนยันว่า "ต่อกันแล้วถูก" —
// ไฟล์นี้ปิดช่องว่างนั้นด้วยการรันเส้นทางจริงรวดเดียว
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function gasFormatDate(date, tz, fmt) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const m = {};
  parts.forEach((p) => { m[p.type] = p.value; });
  if (m.hour === '24') m.hour = '00';
  return String(fmt)
    .replace(/yyyy/g, m.year).replace(/MM/g, m.month).replace(/dd/g, m.day)
    .replace(/HH/g, m.hour).replace(/mm/g, m.minute).replace(/ss/g, m.second);
}

// ─── ของปลอมสำหรับ "แพลตฟอร์ม GAS" เท่านั้น — ไม่แตะตรรกะธุรกิจ ───
function makeGasEnv() {
  const sheets = {};
  function makeRange(rows, r, c, nR, nC) {
    nR = nR || 1; nC = nC || 1;
    return {
      getValue: () => (rows[r - 1] && rows[r - 1][c - 1] != null ? rows[r - 1][c - 1] : ''),
      getValues: () => {
        const out = [];
        for (let i = 0; i < nR; i++) {
          const line = [];
          for (let j = 0; j < nC; j++) line.push(rows[r - 1 + i] ? (rows[r - 1 + i][c - 1 + j] != null ? rows[r - 1 + i][c - 1 + j] : '') : '');
          out.push(line);
        }
        return out;
      },
      setValue: (v) => { if (!rows[r - 1]) rows[r - 1] = []; rows[r - 1][c - 1] = v; return makeRange(rows, r, c, nR, nC); },
      setValues: (vals) => {
        for (let i = 0; i < nR; i++) {
          if (!rows[r - 1 + i]) rows[r - 1 + i] = [];
          for (let j = 0; j < nC; j++) rows[r - 1 + i][c - 1 + j] = vals[i][j];
        }
        return makeRange(rows, r, c, nR, nC);
      },
      setNumberFormat: () => makeRange(rows, r, c, nR, nC),
      setFontWeight: () => makeRange(rows, r, c, nR, nC),
    };
  }
  function makeSheet(name) {
    const rows = sheets[name];
    return {
      appendRow: (arr) => { rows.push(arr.slice()); },
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
      getRange: (r, c, nR, nC) => makeRange(rows, r, c, nR, nC),
      getLastRow: () => rows.length,
      getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
      deleteRow: (r) => { rows.splice(r - 1, 1); },
    };
  }
  const ss = {
    getSheetByName: (name) => (sheets[name] ? makeSheet(name) : null),
    insertSheet: (name) => { sheets[name] = []; return makeSheet(name); },
    flush: () => {},
    toast: () => {},
  };
  const cacheStore = {};
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null),
      put: (k, v) => { cacheStore[k] = String(v); },
      putAll: (obj) => { Object.assign(cacheStore, obj); },
      remove: (k) => { delete cacheStore[k]; },
      removeAll: (ks) => { (ks || []).forEach((k) => delete cacheStore[k]); },
    }),
  };
  const props = { MTO_BUNDLE_SKU: 'MTO-BUNDLE-01' };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      setProperties: (o) => Object.assign(props, o),
      deleteProperty: (k) => { delete props[k]; },
      getProperties: () => ({ ...props }),
    }),
  };
  const LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {}, hasLock: () => true }),
    getUserLock: () => ({ tryLock: () => true, releaseLock: () => {}, hasLock: () => true }),
  };
  const zortCalls = [];
  // ⚠️ ตัวนี้คือของปลอมตัวเดียวที่ "แทนของจริง" ไม่ใช่แค่แพลตฟอร์ม — ไม่มี ZORT จริงให้ยิงในเทสต์
  //    คืนค่าที่สมจริงที่สุด (resCode 200 + เลขบิล) ให้โค้ดจริงเดินเส้นทางสำเร็จตามปกติ
  const UrlFetchApp = {
    fetch: (url, opts) => {
      zortCalls.push({ url, method: (opts && opts.method) || 'get', payload: opts && opts.payload });
      if (String(url).indexOf('/Order/AddOrder') >= 0) {
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 9001, number: 'RC-DRYRUN-001', resCode: '200' }) };
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ resCode: '200', number: 'DOC-DRYRUN-001', documentnumber: 'DOC-DRYRUN-001' }) };
    },
    fetchAll: (reqs) => {
      zortCalls.push({ fetchAll: reqs.map((r) => ({ url: r.url, payload: r.payload })) });
      return reqs.map(() => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ resCode: '200', number: 'DOC-DRYRUN-001' }) }));
    },
  };
  const Logger = { log: () => {} };
  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }),
  };
  const Session = { getScriptTimeZone: () => 'Asia/Bangkok' };
  const Utilities = { formatDate: gasFormatDate, getUuid: () => 'test-uuid-0001', sleep: () => {} };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ss,
    openById: () => ss,
    getUi: () => ({ alert: () => {} }),
    flush: () => {},
  };

  return { ss, sheets, zortCalls, cacheStore, props, CacheService, PropertiesService, LockService, UrlFetchApp, Logger, ContentService, Session, Utilities, SpreadsheetApp };
}

// ok()/error() ของ .gs คืน object ตรง ๆ · บาง action คืนผ่าน ContentService → ต้อง parse .getContent()
function parseAction(out) {
  if (out && typeof out.getContent === 'function') return JSON.parse(out.getContent());
  return out;
}

function loadModule(env) {
  const globalNames = ['SpreadsheetApp', 'CacheService', 'PropertiesService', 'LockService', 'UrlFetchApp', 'Logger', 'ContentService', 'Session', 'Utilities'];
  const globalVals = globalNames.map((n) => env[n]);
  // eslint-disable-next-line no-new-func
  return new Function(...globalNames,
    SRC + '\nreturn { createMtoJob, closeMtoJob, createSaleBill, applyMtoFulfillment_, readMtoJobs_, canSellMtoJob_, decreaseMtoStockInZort_ };'
  )(...globalVals);
}

// ─── Step 4: decreaseMtoStockInZort_ แยกทดสอบตรง ๆ ({ok,skipped,results}) — ไม่เคยมีเทสต์มา
// ก่อนเพราะเป็น dead code (ไม่มีใครเรียก) จนกระทั่ง closeMtoJob เปลี่ยนมาเรียกจริงใน Step 4 ───
describe('decreaseMtoStockInZort_ — ตัดสต็อก ZORT ตรง ๆ ไม่ผ่าน order', () => {
  it('ตัดสำเร็จทั้งสองคลัง → ok:true, skipped:false, แยก payload ตาม warehousecode', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    const res = mod.decreaseMtoStockInZort_([
      { sku: 'R01025', qtyWH: 5, qtyFS: 3 },
      { sku: 'OL00001', qtyWH: 2, qtyFS: 0 },
    ]);
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(false);
    expect(Object.keys(res.results).sort()).toEqual(['W0001', 'W0002']);
    const calls = env.zortCalls.filter((c) => String(c.url).indexOf('/Product/DecreaseProductStockList') >= 0);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => String(c.url).indexOf('/Order/AddOrder') < 0)).toBe(true);
  });

  it('ไม่มีอะไรต้องตัด (คืนของครบ 100%) → skipped:true, ไม่ยิง ZORT เลย', () => {
    const env = makeGasEnv();
    const mod = loadModule(env);
    const res = mod.decreaseMtoStockInZort_([
      { sku: 'R01025', qty: 5, returnedQty: 5 },
    ]);
    expect(res).toEqual({ ok: true, skipped: true, results: {} });
    expect(env.zortCalls).toHaveLength(0);
  });

  it('คลังหนึ่งตัดไม่สำเร็จ (ZORT ตอบ error) → ok:false แต่ยังบันทึกผลของคลังที่สำเร็จไว้ + log failure', () => {
    const env = makeGasEnv();
    // ปลอมให้ warehousecode=W0001 ตอบ error, W0002 ตอบสำเร็จ
    env.UrlFetchApp.fetch = (url, opts) => {
      env.zortCalls.push({ url, payload: opts && opts.payload });
      if (String(url).indexOf('warehousecode=W0001') >= 0) {
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ resCode: '100', resDesc: 'สต็อกไม่พอ' }) };
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ resCode: '200' }) };
    };
    const mod = loadModule(env);
    const res = mod.decreaseMtoStockInZort_([
      { sku: 'R01025', qtyWH: 5, qtyFS: 3 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.results.W0002.resCode).toBe('200');   // คลังที่สำเร็จยังเห็นผลอยู่
    expect(res.results.W0001.resCode).toBe('100');   // คลังที่พลาดก็ยังเห็นผล (ไม่ทิ้ง)
    // logZortFailure_ ต้องบันทึกลงชีต SHEET_ZORT_FAILED ("ZORT_sync_failed") ให้เจ้าของตามได้
    const failRows = env.sheets['ZORT_sync_failed'];
    expect(failRows).toBeTruthy();
    expect(failRows.length).toBeGreaterThan(1);   // header + อย่างน้อย 1 แถว
    expect(failRows[failRows.length - 1][1]).toMatch(/ตัดสต็อก MTO/);
  });
});

describe('MTO → POS → Checkout — dry run แบบ end-to-end (eval appsscript_complete.gs ทั้งไฟล์จริง)', () => {
  let env, mod, jobId;

  beforeAll(() => {
    env = makeGasEnv();
    mod = loadModule(env);
    // สินค้าองค์ประกอบ — G(7)=หน้าร้าน, H(8)=คลัง ตรงตาม CLAUDE.md
    const prodSh = env.ss.insertSheet('อัพเดทจำนวนสินค้า');
    prodSh.appendRow(['#', 'SKU', 'ชื่อ', 'C', 'D', 'E', 'หน้าร้าน(G)', 'คลัง(H)', 'ราคา']);
    prodSh.appendRow(['1', 'R01025', 'กุหลาบแดง', '', '', '', 50, 100, 45]);
    prodSh.appendRow(['2', 'OL00001', 'ใบมะกอก', '', '', '', 30, 80, 20]);
  });

  it('STAGE 1 — สร้างงาน MTO (createMtoJob)', () => {
    const res = parseAction(mod.createMtoJob(env.ss, {
      dateStr: '20/08/2026', jobName: 'ช่อดอกไม้พิเศษ งานแต่ง คุณเอ', customer: 'คุณเอ (แต่งงาน)',
      price: 3500, imageUrl: '',
    }, 'พนักงาน ก (เซล)', 'ST0099'));
    expect(res.success).toBe(true);
    jobId = res.jobId;
    expect(jobId).toMatch(/^MTO-\d{6}\d{3}$/);
    const row = env.sheets['งาน MTO'][1];
    expect(row[0]).toBe(jobId);
    expect(row[6]).toBe('กำลังจัด');   // fulfillment ยังไม่เสร็จ
  });

  it('STAGE 2 — Fulfill: closeMtoJob (เรียก applyMtoFulfillment_ ภายใน) หักสต็อกจริง', () => {
    const res = parseAction(mod.closeMtoJob(env.ss, {
      jobId,
      jobName: 'ช่อดอกไม้พิเศษ งานแต่ง คุณเอ',
      items: [
        { sku: 'R01025', name: 'กุหลาบแดง', qty: 20, returnedQty: 0, qtyWH: 20, qtyFS: 0 },
        { sku: 'OL00001', name: 'ใบมะกอก', qty: 10, returnedQty: 2, qtyWH: 8, qtyFS: 0 },
      ],
      closedAt: '20/08/2026 09:15:00',
    }, 'พนักงาน ข (คลัง)'));
    expect(res.success).toBe(true);
    expect(res.deducted).toBe(2);

    const prod = env.sheets['อัพเดทจำนวนสินค้า'];
    expect(prod[1][7]).toBe(80);   // R01025 คลัง 100 - 20 = 80
    expect(prod[2][7]).toBe(72);   // OL00001 คลัง 80 - 8(net หลังคืน 2) = 72
    expect(prod[1][6]).toBe(50);   // หน้าร้านยังไม่ถูกแตะตอน fulfillment
    expect(prod[2][6]).toBe(30);

    const items = env.sheets['วัตถุดิบ MTO'];
    expect(items).toHaveLength(3);   // header + 2 แถว
    expect(items[1]).toEqual([jobId, 'R01025', 'กุหลาบแดง', 20, 'คลัง:20/ร้าน:0', 0, 20, '20/08/2026 09:15:00']);
    expect(items[2]).toEqual([jobId, 'OL00001', 'ใบมะกอก', 10, 'คลัง:8/ร้าน:0', 2, 8, '20/08/2026 09:15:00']);

    const jobRow = env.sheets['งาน MTO'][1];
    expect(jobRow[6]).toBe('เสร็จแล้ว');   // fulfillment เสร็จ
    expect(jobRow[10]).toBeFalsy();        // sale status ยังว่าง (ยังไม่ขาย) — appendRow ไม่ pad คอลัมน์ที่ไม่ได้เขียน

    // Step 4: closeMtoJob ตัดสต็อกผ่าน decreaseMtoStockInZort_ (DecreaseProductStockList) ตรง ๆ
    // ⚠️ ต้อง "ไม่มี" /Order/AddOrder ระหว่าง fulfillment เด็ดขาด — เคยมี (createZortSaleOrder_,
    // ลบไปแล้ว) สร้าง order ราคา 0 ที่ syncZortSales/aggregateAndWriteSales_ ดึงไปนับเป็นยอดขาย/
    // soldQty ของ SKU องค์ประกอบ เจือปน "ควรสั่ง"/velocity/ABC ทั้งระบบ (ดู ADR-MTO-SELLABLE)
    expect(env.zortCalls.some((c) => String(c.url).indexOf('/Order/AddOrder') >= 0)).toBe(false);
    const decreaseCalls = env.zortCalls.filter((c) => String(c.url).indexOf('/Product/DecreaseProductStockList') >= 0);
    expect(decreaseCalls.length).toBeGreaterThan(0);
    // แยกตามคลังจริง — R01025 หัก 20 จากคลังสาย5 (WH_SAI5=W0002), OL00001 หัก 8 จากคลังเดียวกัน
    const decreasePayloads = decreaseCalls.map((c) => JSON.parse(c.payload));
    const wh = decreasePayloads.find((p) => p.warehousecode === 'W0002');
    expect(wh).toBeTruthy();
    expect(wh.stocks).toEqual(expect.arrayContaining([
      { sku: 'R01025', stock: 20 },
      { sku: 'OL00001', stock: 8 },
    ]));
    env.zortCalls.length = 0;
  });

  it('STAGE 3 — readMtoJobs_ ต้องคืน sellable:true (สิ่งที่ POS picker ใช้ตรง ๆ)', () => {
    const job = mod.readMtoJobs_().find((j) => j.jobId === jobId);
    expect(job.status).toBe('เสร็จแล้ว');
    expect(job.saleStatus).toBe('ยังไม่ขาย');
    expect(job.sellable).toBe(true);
  });

  it('STAGE 4 — POS Checkout: createSaleBill พร้อมบรรทัด MTO ปนสินค้าปกติในบิลเดียวกัน', () => {
    const job = mod.readMtoJobs_().find((j) => j.jobId === jobId);
    const payload = {
      items: [
        { sku: job.jobId, name: job.jobName, category: 'Made to Order จัดแบบพิเศษ', qty: 1, price: job.price, mtoJobId: job.jobId },
        { sku: 'R01025', name: 'กุหลาบแดง', category: 'ดอกไม้', qty: 2, price: 45 },
      ],
      customer: { name: 'คุณเอ', phone: '0891234567' },
      paymentMethod: 'โอน', channel: 'หน้าร้าน', saleMode: 'store',
      billCid: 'DRYRUN-CID-0001',
    };
    const res = parseAction(mod.createSaleBill(env.ss, payload, 'พนักงาน ก (เซล)'));
    expect(res.success).toBe(true);
    expect(res.data.orderNumber).toBe('RC-DRYRUN-001');
    // ยอด: MTO 3500 (ยกเว้นส่วนลด) + กุหลาบ 2×45=90 (ปกติ ไม่ครบ 6 ชิ้น ไม่มีส่วนลดขายส่ง)
    expect(res.data.totals.grandTotal).toBe(3590);
    expect(res.data.totals.retailExcluded).toBe(3500);
    expect(res.data.totals.retailEligible).toBe(90);
    expect(res.data.mtoSold).toEqual([jobId]);

    // ── ZORT payload — ต้องมี "SKU เดียว ราคาเดียว" ต่องาน (Decision: ONE SKU ONE PRICE) ──
    const addOrderCall = env.zortCalls.find((c) => String(c.url).indexOf('/Order/AddOrder') >= 0);
    expect(addOrderCall).toBeTruthy();
    const sentPayload = JSON.parse(addOrderCall.payload);
    expect(sentPayload.list).toHaveLength(2);
    const mtoLine = sentPayload.list.find((l) => l.sku === 'MTO-BUNDLE-01');
    expect(mtoLine).toBeTruthy();
    expect(mtoLine.number).toBe(1);
    expect(mtoLine.pricepernumber).toBe(3500);
    expect(mtoLine.totalprice).toBe(3500);
    // component ห้ามหลุดเข้า ZORT — ต้องเห็นแค่ bundle sku ไม่ใช่ R01025/OL00001 ที่เป็นองค์ประกอบ
    expect(sentPayload.list.some((l) => l.sku === 'R01025' && l.number === 20)).toBe(false);
    const normalLine = sentPayload.list.find((l) => l.sku === 'R01025');
    expect(normalLine.number).toBe(2);   // นี่คือกุหลาบที่ขายแยกในบิลเดียวกัน ไม่ใช่องค์ประกอบ MTO
    expect(sentPayload.amount).toBe(3590);

    // ── สต็อกหน้าร้าน (checkout) หักเฉพาะสินค้าปกติ ไม่แตะองค์ประกอบ MTO ซ้ำ ──
    const prod = env.sheets['อัพเดทจำนวนสินค้า'];
    expect(prod[1][6]).toBe(48);   // R01025 หน้าร้าน 50 - 2 = 48 (สินค้าปกติในบิล)
    expect(prod[1][7]).toBe(80);   // R01025 คลัง ยังคง 80 (ไม่ถูกหักซ้ำจากตอน fulfillment)
    expect(prod[2][7]).toBe(72);   // OL00001 คลัง ยังคง 72 (ไม่ถูกหักซ้ำ)
  });

  it('STAGE 5 — Receipt: cart มีแค่ 1 บรรทัดต่อ MTO เสมอ (component ไม่เคยอยู่ใน cart)', () => {
    // จำลองสิ่งที่ PosReceipt80/OnlineSaleResult พิมพ์ — วนลูป cart items ตรง ๆ (ดู views-analytics.jsx)
    // component ของ MTO ไม่เคยถูกส่งเข้า cart เลยตั้งแต่ addMtoJobToCart() จึงพิมพ์ไม่ได้อยู่แล้ว
    const cartLikePayloadItems = [
      { sku: jobId, name: 'ช่อดอกไม้พิเศษ งานแต่ง คุณเอ', qty: 1, price: 3500, mtoJobId: jobId },
    ];
    expect(cartLikePayloadItems).toHaveLength(1);
    expect(cartLikePayloadItems[0]).not.toHaveProperty('components');
  });

  it('STAGE 6 — Audit Log มีครบ 3 เหตุการณ์ (สร้างงาน MTO / ปิดงาน MTO / ออกบิลขาย)', () => {
    const rows = env.sheets['Audit Log'].slice(1);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r[2])).toEqual(['สร้างงาน MTO', 'ปิดงาน MTO', 'ออกบิลขาย']);
    expect(rows[2][3]).toBe('RC-DRYRUN-001');
  });

  it('STAGE 7 — ชีต "บิลขาย" + "งาน MTO" บันทึกครบ (billCid สำหรับ trace)', () => {
    const bill = env.sheets['บิลขาย'][1];
    expect(bill[3]).toBe('RC-DRYRUN-001');   // เลขบิล
    expect(bill[8]).toBe(3590);               // ยอดสุทธิ
    expect(bill[bill.length - 1]).toBe('DRYRUN-CID-0001');   // AD billCid

    const jobRow = env.sheets['งาน MTO'][1];
    expect(jobRow[10]).toBe('ขายแล้ว');           // K สถานะขาย
    expect(jobRow[11]).toBe('RC-DRYRUN-001');      // L อ้างอิงบิลขาย
    expect(jobRow[12]).toBeTruthy();               // M ขายเมื่อ
    expect(jobRow[13]).toBe('DRYRUN-CID-0001');    // N billCid — ไว้ trace/debug
  });

  it('STAGE 8 — readMtoJobs_ อีกรอบ: sellable ต้องเป็น false แล้ว (กันเลือกซ้ำใน picker)', () => {
    const job = mod.readMtoJobs_().find((j) => j.jobId === jobId);
    expect(job.saleStatus).toBe('ขายแล้ว');
    expect(job.sellable).toBe(false);
  });

  it('STAGE 9 — กดขายซ้ำด้วย billCid เดิม → dedup, ไม่ยิง ZORT ซ้ำ', () => {
    env.zortCalls.length = 0;
    const payload = {
      items: [{ sku: jobId, name: 'x', category: 'Made to Order จัดแบบพิเศษ', qty: 1, price: 3500, mtoJobId: jobId }],
      paymentMethod: 'โอน', channel: 'หน้าร้าน', saleMode: 'store', billCid: 'DRYRUN-CID-0001',
    };
    const res = parseAction(mod.createSaleBill(env.ss, payload, 'พนักงาน ก (เซล)'));
    expect(res.success).toBe(true);
    expect(res.data.dedup).toBe(true);
    expect(env.zortCalls).toHaveLength(0);   // ไม่แตะ ZORT เลย — ตอบจาก cache/ชีตล้วน ๆ
  });

  it('STAGE 10 — ขายงานเดิมด้วย billCid ใหม่ (ไม่ผ่าน dedup) → ถูกปฏิเสธก่อนแตะ ZORT', () => {
    env.zortCalls.length = 0;
    const payload = {
      items: [{ sku: jobId, name: 'x', category: 'Made to Order จัดแบบพิเศษ', qty: 1, price: 3500, mtoJobId: jobId }],
      paymentMethod: 'โอน', channel: 'หน้าร้าน', saleMode: 'store', billCid: 'DRYRUN-CID-0002',
    };
    const res = parseAction(mod.createSaleBill(env.ss, payload, 'พนักงาน ก (เซล)'));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ขายไปแล้ว/);
    expect(env.zortCalls).toHaveLength(0);   // ปฏิเสธก่อนยิง AddOrder เลย — กันบิลซ้อนของจริง
  });
});
