// tests/perf-phase0.test.js — เครื่องมือวัดผล Phase 0 (docs/PLAN-PERF-LOGIN-MULTIUSER.md)
// ─────────────────────────────────────────────────────────────────────────────
// เทสต์ชุดนี้ไม่ได้คุม "ธุรกิจ" แต่คุม **ความน่าเชื่อถือของตัวเลขที่ใช้ตัดสินใจ**
// ทั้งแผนถูกออกแบบให้ตัดสินจากตัวเลขที่เครื่องมือพวกนี้พิมพ์ออกมา (โดยเฉพาะข้อ 1c
// "จะทำ Phase 4 ไหม" ซึ่งเป็นงานเสี่ยงสูงสุดในเอกสาร) — เครื่องมือวัดที่รายงานผิด
// แย่กว่าไม่มีเครื่องมือเลย เพราะทำให้ไปลงแรงผิดจุดโดยมั่นใจ
//
// สิ่งที่คุมไว้:
//   1. ตาราง PERF_TRIGGER_SCHEDULE_ ต้องครบทุก trigger ที่โค้ดตั้งจริง (ขาด = รายงานโควตาต่ำกว่าจริง)
//   2. ชื่อ handler/setup ในตารางต้องเป็นฟังก์ชันที่มีอยู่จริง (พิมพ์ผิด = บอกให้เจ้าของรันของที่ไม่มี)
//   3. allowlist ของ Script Property ต้องไม่มีคีย์ความลับหลุดเข้ามา
//   4. doGet ต้องเรียก perfLogDoGet_ **ทั้งเส้นทาง hit และ miss** (ขาดข้างใดข้างหนึ่ง
//      = วัดได้ครึ่งเดียวแล้วสรุปเหมือนวัดครบ)
//   5. ฟังก์ชันที่เจ้าของต้องรันเองห้ามลงท้าย `_` (จะไม่โผล่ใน dropdown ของ GAS editor)
//   6. perfMeasureBuild ต้องไม่เขียนอะไรเลย (เป็นเครื่องมือวัด ไม่ใช่เครื่องมือแก้ข้อมูล)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const TABLE_SRC = grab(/const PERF_TRIGGER_SCHEDULE_ = \{[\s\S]*?\n\};/);
const SAFE_PROPS_SRC = grab(/const PERF_SAFE_PROPS_ = \[[\s\S]*?\n\];/);
// eslint-disable-next-line no-new-func
const { PERF_TRIGGER_SCHEDULE_, PERF_SAFE_PROPS_ } = new Function(
  TABLE_SRC + '\n' + SAFE_PROPS_SRC + '\nreturn { PERF_TRIGGER_SCHEDULE_, PERF_SAFE_PROPS_ };'
)();

const declaredFns = new Set([...SRC.matchAll(/^function ([A-Za-z0-9_]+)\(/gm)].map((m) => m[1]));
const createdTriggers = new Set(
  [...SRC.matchAll(/newTrigger\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1])
);

describe('ตาราง trigger ของ perfCheckTriggers ต้องตรงกับโค้ดจริง', () => {
  it('ทุก trigger ที่โค้ดตั้งจริง มีอยู่ในตาราง', () => {
    // GAS ไม่มี API ให้อ่านความถี่ของ clock trigger กลับมา ตารางนี้จึงเป็นแหล่งเดียว
    // ที่บอกได้ว่าแต่ละตัวกินโควตาเท่าไหร่ — ตกหล่นตัวหนึ่ง = ประเมินโควตาต่ำกว่าจริงเงียบ ๆ
    const missing = [...createdTriggers].filter((fn) => !(fn in PERF_TRIGGER_SCHEDULE_));
    expect(missing, 'เพิ่ม trigger ใหม่แล้วต้องเติมใน PERF_TRIGGER_SCHEDULE_ ด้วย').toEqual([]);
  });

  it('ทุก handler ในตารางเป็นฟังก์ชันที่มีอยู่จริง', () => {
    const ghosts = Object.keys(PERF_TRIGGER_SCHEDULE_).filter((fn) => !declaredFns.has(fn));
    expect(ghosts, 'handler ในตารางที่ไม่มีฟังก์ชันรองรับ').toEqual([]);
  });

  it('ทุกชื่อ setup ที่แนะนำให้เจ้าของรัน เป็นฟังก์ชันที่มีอยู่จริง', () => {
    const bad = Object.entries(PERF_TRIGGER_SCHEDULE_)
      .map(([fn, meta]) => [fn, String(meta.setup || '')])
      .filter(([, setup]) => /^[A-Za-z0-9_]+\(\)$/.test(setup))
      .filter(([, setup]) => !declaredFns.has(setup.slice(0, -2)));
    expect(bad, 'บอกให้เจ้าของรันฟังก์ชันที่ไม่มีอยู่จริง').toEqual([]);
  });

  it('ทุกแถวมี every/perDay/setup ครบ และ perDay ไม่ติดลบ', () => {
    Object.entries(PERF_TRIGGER_SCHEDULE_).forEach(([fn, meta]) => {
      expect(typeof meta.every, fn).toBe('string');
      expect(typeof meta.perDay, fn).toBe('number');
      expect(meta.perDay, fn).toBeGreaterThanOrEqual(0);
      expect(String(meta.setup || '').length, fn).toBeGreaterThan(0);
    });
  });

  it('ตัวที่แผนระบุว่าเป็นตัวกินโควตาหลัก ยังอยู่ในตารางพร้อมเลขที่ถูกต้อง', () => {
    // ถ้าใครแก้ความถี่ในโค้ดแล้วลืมแก้ตาราง รายงานจะบอกเลขเก่าอย่างมั่นใจ
    expect(PERF_TRIGGER_SCHEDULE_.drainNotiQueue.perDay).toBe(1440);
    expect(PERF_TRIGGER_SCHEDULE_.backfillZortOrders.perDay).toBe(288);
    expect(SRC).toMatch(/newTrigger\("drainNotiQueue"\)\.timeBased\(\)\.everyMinutes\(1\)/);
    expect(SRC).toMatch(/newTrigger\('backfillZortOrders'\)\.timeBased\(\)\.everyMinutes\(5\)/);
  });
});

describe('allowlist ของ Script Property ต้องไม่ทำความลับหลุดลง log', () => {
  it('ไม่มีคีย์ความลับอยู่ใน PERF_SAFE_PROPS_', () => {
    const secretish = /SHEET_ID|OWNER_PIN|APP_TOKEN|ZORT_|LINE_ACCESS|LINE_USER|LINE_GROUP|SECRET|APIKEY|SUPABASE_KEY|SERVICE_ROLE/i;
    const leaked = PERF_SAFE_PROPS_.filter((k) => secretish.test(k));
    expect(leaked, 'คีย์ความลับหลุดเข้า allowlist').toEqual([]);
  });

  it('perfCheckTriggers อ่าน property ผ่าน allowlist เท่านั้น ไม่ใช่ getProperties() ทั้งก้อน', () => {
    // ถ้าเปลี่ยนเป็น "ดึงทุกคีย์แล้วค่อยกรอง" คีย์ความลับที่เพิ่มทีหลังจะหลุดทันทีโดยไม่มีใครรู้
    const fn = grab(/function perfCheckTriggers\(\)[\s\S]*?\n\}/);
    expect(fn).toContain('PERF_SAFE_PROPS_');
    expect(fn).not.toMatch(/getProperties\(\)/);
  });
});

describe('การจับเวลาในเส้นทาง payload ต้องครอบคลุมทั้ง hit และ miss', () => {
  const doGetSrc = grab(/function doGet\(e\)[\s\S]*?\n\}\n/);

  it('เส้นทาง cache hit เรียก perfLogDoGet_', () => {
    // เส้นทางนี้คือเส้นทางที่เกิดบ่อยที่สุด — เดิมไม่มีการวัดเลย ทำให้แยกไม่ออกว่า
    // request ที่ช้าเป็นเพราะ build ใหม่ หรือเพราะ cache เองก็ช้า
    expect(doGetSrc).toMatch(/perfLogDoGet_\('HIT'/);
  });

  it('เส้นทาง build ใหม่เรียก perfLogDoGet_ และแยกเวลา build ออกจาก shape+cache', () => {
    expect(doGetSrc).toMatch(/perfLogDoGet_\(wantFresh \? 'FRESH' : 'MISS'/);
    expect(doGetSrc).toContain('build=');
    expect(doGetSrc).toContain('shape+cache=');
  });

  it('perfLogDoGet_ ถูกเรียกก่อน logPayloadSizes_ (ไม่งั้นตัววัดนับเวลาตัวเอง)', () => {
    // logPayloadSizes_ ทำ JSON.stringify ทุกคีย์ + `mo` ของสินค้าทุกตัวเพื่อวัดขนาด
    // ถ้าอยู่ก่อน perfLogDoGet_ เวลานั้นจะถูกนับเข้า `shape+cache=` → สรุปผิดว่า payload หนัก
    // แล้วไปลงแรงที่ 7.4(ข) ทั้งที่ของจริงไม่ได้หนัก — ผิดแบบ "มั่นใจ" ซึ่งแย่กว่าไม่มีตัวเลข
    const iPerf = doGetSrc.indexOf("perfLogDoGet_(wantFresh");
    const iSize = doGetSrc.indexOf('logPayloadSizes_(data');
    expect(iPerf).toBeGreaterThan(-1);
    expect(iSize).toBeGreaterThan(-1);
    expect(iPerf, 'perfLogDoGet_ ต้องมาก่อน logPayloadSizes_').toBeLessThan(iSize);
  });

  it('perfLogDoGet_ ไม่ throw และไม่อ่าน Property/ชีตเพิ่มในเส้นทางร้อน', () => {
    const fn = grab(/function perfLogDoGet_\([\s\S]*?\n\}/);
    expect(fn).toContain('try {');
    expect(fn).toContain('catch');
    expect(fn).not.toMatch(/PropertiesService|SpreadsheetApp|CacheService|UrlFetchApp/);
  });
});

describe('ฟังก์ชันที่เจ้าของต้องรันเอง', () => {
  it('perfCheckTriggers / perfMeasureBuild ไม่ลงท้ายด้วย _ (ต้องโผล่ใน dropdown ของ GAS)', () => {
    expect(declaredFns.has('perfCheckTriggers')).toBe(true);
    expect(declaredFns.has('perfMeasureBuild')).toBe(true);
    expect(declaredFns.has('perfCheckTriggers_')).toBe(false);
    expect(declaredFns.has('perfMeasureBuild_')).toBe(false);
  });

  it('perfMeasureBuild เป็นเครื่องมือวัดล้วน — ห้ามเขียนอะไรทั้งสิ้น', () => {
    // ถ้าเผลอให้มันเขียน cache จะไปอุ่น cache ให้เอง แล้วตัวเลขรอบถัดไปจะดูดีเกินจริง
    const fn = grab(/function perfMeasureBuild\(\)[\s\S]*?\n\}/);
    expect(fn).not.toMatch(/putCachedPayload_|setProperty|appendRow|setValue|invalidateCache_|UrlFetchApp/);
    expect(fn).toContain('buildFullData_()');
  });

  it('perfCheckTriggers ไม่แก้ trigger ใด ๆ (อ่านอย่างเดียวตามที่โฆษณาไว้)', () => {
    const fn = grab(/function perfCheckTriggers\(\)[\s\S]*?\n\}/);
    expect(fn).not.toMatch(/newTrigger|deleteTrigger|setProperty/);
  });
});
