// tests/product-photo.test.js — รูปสินค้า "ชั่วคราว" ที่ถ่าย/อัปจากเว็บ (สินค้าใหม่)
// ─────────────────────────────────────────────────────────────────────────────
// flow: ถ่ายรูป → เก็บ Drive (col D ชีต imageUrl) → โชว์ก่อน · พอ ZORT มีรูป (col E)
//        cleanupTempProductPhoto_ ลบไฟล์ Drive + เคลียร์ D/F ทิ้ง → ใช้รูป ZORT เป็นหลัก
//
// eval ฟังก์ชันจริงจาก .gs (ไม่ copy — เหมือน auth.test.js) + meta-test คุมจุดเชื่อมต่อ
// ที่ "พังแล้วเงียบ": ไม่ลบรูปตอน ZORT มา / ลบ URL ที่คนพิมพ์เอง / action หลุดการตรวจสิทธิ์
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS  = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const JSX = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(re, label) {
  const m = GS.match(re);
  if (!m) throw new Error('หาโค้ดใน .gs ไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_SAVE   = grab(/function saveProductPhoto_\(base64, sku\) \{[\s\S]*?\n\}/, 'saveProductPhoto_');
const F_WRITE  = grab(/function writeManualProductImage_\(ss, sku, url, fileId\) \{[\s\S]*?\n\}/, 'writeManualProductImage_');
const F_CLEAN  = grab(/function cleanupTempProductPhoto_\(sh, rowNum\) \{[\s\S]*?\n\}/, 'cleanupTempProductPhoto_');
const F_UPLOAD = grab(/function uploadProductPhoto\(ss, data, actor\) \{[\s\S]*?\n\}/, 'uploadProductPhoto');

// ── fake สภาพแวดล้อม GAS ──────────────────────────────────────────────────────
function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  return {
    _data: data,
    getRange(r, c) {
      return {
        getValue: () => (data[r - 1] && data[r - 1][c - 1] !== undefined) ? data[r - 1][c - 1] : '',
        setValue: (v) => {
          while (data.length < r) data.push([]);
          const row = data[r - 1];
          while (row.length < c) row.push('');
          row[c - 1] = v;
        },
      };
    },
    getDataRange() { return { getValues: () => data.map(r => r.slice()) }; },
    appendRow(r) { data.push(r.slice()); },
  };
}

function makeEnv() {
  const trashed = [];
  const props = { _p: {}, getProperty(k) { return this._p[k] || null; }, setProperty(k, v) { this._p[k] = v; } };
  let fileSeq = 0;
  const DriveApp = {
    Access: { ANYONE_WITH_LINK: 'anyone' },
    Permission: { VIEW: 'view' },
    getFileById: (id) => ({ setTrashed: () => { trashed.push(id); } }),
    getFolderById: () => ({ createFile: () => mkFile() }),
    createFolder: () => ({ getId: () => 'FOLDER1', createFile: () => mkFile() }),
  };
  function mkFile() {
    const id = 'FILE_' + (++fileSeq);
    return { setSharing: () => {}, getId: () => id };
  }
  const PropertiesService = { getScriptProperties: () => props };
  const Utilities = { base64Decode: (s) => s, newBlob: (b, t, n) => ({ b, t, n }) };
  const SpreadsheetApp = { flush: () => {} };
  const Logger = { log: () => {} };
  const audits = [];
  const deps = [
    'imageUrl', DriveApp, PropertiesService, Utilities, SpreadsheetApp, Logger,
    (m) => ({ success: false, error: m }),                 // error
    (d) => ({ success: true, data: d }),                   // ok
    (...a) => { audits.push(a); },                         // writeAuditLog_
    (o) => JSON.stringify(o),                              // auditDetail_
    () => {},                                              // invalidateCache_
  ];
  const bundle = F_SAVE + '\n' + F_WRITE + '\n' + F_CLEAN + '\n' + F_UPLOAD +
    '\nreturn { saveProductPhoto_, writeManualProductImage_, cleanupTempProductPhoto_, uploadProductPhoto };';
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'SHEET_IMAGE_URL', 'DriveApp', 'PropertiesService', 'Utilities', 'SpreadsheetApp', 'Logger',
    'error', 'ok', 'writeAuditLog_', 'auditDetail_', 'invalidateCache_', bundle);
  const fns = factory(...deps);
  return { fns, trashed, audits };
}

describe('saveProductPhoto_ — เก็บรูปลง Drive + คืน URL สาธารณะ', () => {
  it('base64 ว่าง → null (ไม่พัง)', () => {
    const { fns } = makeEnv();
    expect(fns.saveProductPhoto_('', 'BK001')).toBeNull();
    expect(fns.saveProductPhoto_(null, 'BK001')).toBeNull();
  });

  it('มีรูป → คืน { fileId, url } เป็น URL รูปที่โหลดตรงได้', () => {
    const { fns } = makeEnv();
    const r = fns.saveProductPhoto_('data:image/jpeg;base64,AAAA', 'BK001');
    expect(r).toBeTruthy();
    expect(r.fileId).toMatch(/^FILE_/);
    expect(r.url).toContain('drive.google.com/thumbnail');
    expect(r.url).toContain(r.fileId);   // URL ผูกกับ fileId ตัวเดียวกัน
  });
});

describe('writeManualProductImage_ — เขียน col D (รูป) + col F (fileId)', () => {
  it('SKU ใหม่ (ยังไม่มีในชีต) → append แถวใหม่ D=url F=fileId', () => {
    const { fns } = makeEnv();
    const sh = makeSheet([['ID', 'SKU', 'ชื่อ', 'รูป', 'ZORT']]);
    const ss = { getSheetByName: (n) => (n === 'imageUrl' ? sh : null) };
    fns.writeManualProductImage_(ss, 'bk002', 'https://x/y.jpg', 'FILE_9');
    const last = sh._data[sh._data.length - 1];
    expect(last[1]).toBe('BK002');       // B = SKU (uppercase)
    expect(last[3]).toBe('https://x/y.jpg'); // D
    expect(last[5]).toBe('FILE_9');      // F
  });

  it('SKU เดิม → เขียนทับ D/F + ลบไฟล์ Drive เก่าทิ้ง (กันไฟล์กำพร้า)', () => {
    const { fns, trashed } = makeEnv();
    const sh = makeSheet([
      ['ID', 'SKU', 'ชื่อ', 'รูป', 'ZORT', 'ไฟล์'],
      ['', 'BK001', 'ก', 'https://old.jpg', '', 'FILE_OLD'],
    ]);
    const ss = { getSheetByName: () => sh };
    fns.writeManualProductImage_(ss, 'BK001', 'https://new.jpg', 'FILE_NEW');
    expect(sh._data[1][3]).toBe('https://new.jpg');
    expect(sh._data[1][5]).toBe('FILE_NEW');
    expect(trashed).toContain('FILE_OLD');   // ไฟล์เก่าถูกลบ
  });

  it('url ว่าง → ไม่เขียนอะไร', () => {
    const { fns } = makeEnv();
    const sh = makeSheet([['ID', 'SKU', 'ชื่อ', 'รูป', 'ZORT']]);
    const before = sh._data.length;
    fns.writeManualProductImage_({ getSheetByName: () => sh }, 'BK001', '', 'F1');
    expect(sh._data.length).toBe(before);
  });
});

describe('cleanupTempProductPhoto_ — ZORT มีรูปแล้ว ลบรูปชั่วคราวทิ้ง', () => {
  it('มี fileId ใน F → ลบไฟล์ Drive + เคลียร์ D และ F', () => {
    const { fns, trashed } = makeEnv();
    const sh = makeSheet([
      ['ID', 'SKU', 'ชื่อ', 'รูป', 'ZORT', 'ไฟล์'],
      ['', 'BK001', 'ก', 'https://temp.jpg', 'https://zort.jpg', 'FILE_TMP'],
    ]);
    fns.cleanupTempProductPhoto_(sh, 2);
    expect(trashed).toContain('FILE_TMP');
    expect(sh._data[1][3]).toBe('');   // D เคลียร์
    expect(sh._data[1][5]).toBe('');   // F เคลียร์
  });

  it('ไม่มี fileId ใน F → ไม่ลบ ไม่แตะ col D (กันลบ URL ที่คนพิมพ์เอง)', () => {
    const { fns, trashed } = makeEnv();
    const sh = makeSheet([
      ['ID', 'SKU', 'ชื่อ', 'รูป', 'ZORT', 'ไฟล์'],
      ['', 'BK001', 'ก', 'https://manual-typed.jpg', 'https://zort.jpg', ''],
    ]);
    fns.cleanupTempProductPhoto_(sh, 2);
    expect(trashed).toEqual([]);
    expect(sh._data[1][3]).toBe('https://manual-typed.jpg');  // ไม่แตะ
  });
});

describe('uploadProductPhoto — action อัปรูปชั่วคราวจากเว็บ', () => {
  const shFactory = () => makeSheet([['ID', 'SKU', 'ชื่อ', 'รูป', 'ZORT']]);

  it('ไม่มี SKU → error', () => {
    const { fns } = makeEnv();
    const r = fns.uploadProductPhoto({ getSheetByName: shFactory }, { photoBase64: 'x' }, 'ผู้ทดสอบ');
    expect(r.success).toBe(false);
  });

  it('ไม่มีรูป → error', () => {
    const { fns } = makeEnv();
    const r = fns.uploadProductPhoto({ getSheetByName: shFactory }, { sku: 'BK001' }, 'ผู้ทดสอบ');
    expect(r.success).toBe(false);
  });

  it('สำเร็จ → เขียน col D + audit "เพิ่มรูปสินค้า" + คืน imageUrl', () => {
    const { fns, audits } = makeEnv();
    const sh = shFactory();
    const r = fns.uploadProductPhoto({ getSheetByName: () => sh }, { sku: 'bk001', photoBase64: 'data:image/jpeg;base64,AA' }, 'สมชาย (คลังสินค้า)');
    expect(r.success).toBe(true);
    expect(r.data.imageUrl).toContain('drive.google.com/thumbnail');
    expect(sh._data[sh._data.length - 1][3]).toContain('drive.google.com/thumbnail'); // D
    expect(audits.some(a => a[1] === 'เพิ่มรูปสินค้า' && a[2] === 'BK001')).toBe(true);
  });
});

// ── meta: จุดเชื่อมต่อ .gs ที่พังแล้วเงียบ ─────────────────────────────────────
describe('meta: จุดเชื่อมต่อฝั่ง GAS', () => {
  it('addNewProduct เก็บรูปที่ถ่าย (เรียก saveProductPhoto_ + writeManualProductImage_)', () => {
    const fn = grab(/function addNewProduct\(ss, product, actor\) \{[\s\S]*?\n\}/, 'addNewProduct');
    expect(fn).toMatch(/product\.photoBase64/);
    expect(fn).toMatch(/saveProductPhoto_/);
    expect(fn).toMatch(/writeManualProductImage_/);
  });

  it('fetchProductImage ลบรูปชั่วคราวหลังเขียน col E', () => {
    const fn = grab(/function fetchProductImage\(ss, sku\) \{[\s\S]*?\n\}/, 'fetchProductImage');
    expect(fn).toMatch(/cleanupTempProductPhoto_/);
  });

  it('syncZortImages (bulk) ลบรูปชั่วคราวหลังเขียน col E', () => {
    const fn = grab(/function syncZortImages\(\) \{[\s\S]*?\n\}/, 'syncZortImages');
    expect(fn).toMatch(/cleanupTempProductPhoto_/);
  });

  it('uploadProductPhoto ต่อ dispatch + อยู่ใน POST_FLAG_ACTIONS_ (ไม่หลุดตรวจสิทธิ์)', () => {
    expect(GS).toMatch(/if \(data\.uploadProductPhoto\)\s*\{\s*return uploadProductPhoto\(ss, data, actor\);/);
    expect(GS).toMatch(/POST_FLAG_ACTIONS_ = \[[\s\S]*?"uploadProductPhoto"[\s\S]*?\];/);
  });

  it('warehouse มีสิทธิ์ uploadProductPhoto (คู่กับ addNewProduct)', () => {
    const block = grab(/warehouse:\s*\[[\s\S]*?\]\.concat/, 'ROLE_ACTIONS_.warehouse');
    expect(block).toMatch(/"uploadProductPhoto"/);
  });

  it('staff-perf มีหมวดรองรับ action "เพิ่มรูปสินค้า" (ไม่ตกไป "อื่นๆ")', () => {
    const cat = grab(/\{ key: "newproduct",[\s\S]*?\},/, 'STAFF_PERF newproduct');
    expect(cat).toMatch(/เพิ่มรูปสินค้า/);
  });
});

// ── meta: ฝั่ง frontend (views-main.jsx) ──────────────────────────────────────
describe('meta: จุดเชื่อมต่อฝั่ง frontend', () => {
  it('มีตัวย่อรูป productShrinkImage (self-contained ในไฟล์นี้)', () => {
    expect(JSX).toMatch(/function productShrinkImage\(file, maxW\)/);
  });

  it('syncUploadProductPhoto ใช้ dmjJson + ส่ง flag uploadProductPhoto (ไม่ใช้ res.json ดิบ)', () => {
    const fn = JSX.match(/async function syncUploadProductPhoto\(sku, photoBase64\) \{[\s\S]*?\n\}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/uploadProductPhoto:\s*true/);
    expect(fn[0]).toMatch(/dmjJson\(res\)/);
    expect(fn[0]).not.toMatch(/res\.json\(\)/);
  });

  it('buildCurrentProduct แนบ photoBase64 · resetItemFields เคลียร์รูป', () => {
    const build = JSX.match(/const buildCurrentProduct = \(\) => \(\{[\s\S]*?\}\);/);
    expect(build[0]).toMatch(/photoBase64:\s*photo/);
    const reset = JSX.match(/const resetItemFields = \(\) => \{[\s\S]*?\};/);
    expect(reset[0]).toMatch(/setPhoto\(""\)/);
  });

  it('AddProductView มีช่องถ่าย/เลือกรูป (input accept image + capture)', () => {
    expect(JSX).toMatch(/type="file" accept="image\/\*" capture="environment"/);
    expect(JSX).toMatch(/const pickPhoto = async \(e\)/);
  });

  it('ProductCard (การ์ดไม่มีรูป) อัปรูปเองได้ผ่าน syncUploadProductPhoto', () => {
    expect(JSX).toMatch(/const pickCardPhoto = async \(e\)/);
    const fn = JSX.match(/const pickCardPhoto = async \(e\) => \{[\s\S]*?\n  \};/);
    expect(fn[0]).toMatch(/syncUploadProductPhoto\(p\.sku/);
  });
});
