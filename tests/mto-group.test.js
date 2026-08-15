// tests/mto-group.test.js — ยุบสินค้า Made to Order เป็น "การ์ดกลุ่ม" ในหน้าใบเสนอราคา
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของขอ (ส.ค. 2026): หมวด MTO มีรหัสเป็นชุด (BK001-BK020, PACKAGE001-…) หลายร้อยตัว
// เลื่อนหาไม่ไหว → ยุบเป็นการ์ดกลุ่มเดียวต่อ prefix กดแล้วเพิ่มรหัสถัดไป (BK001→002→003)
// เป็นบรรทัดแยก · ทำเฉพาะหมวดนี้ หมวดอื่นยังโชว์รายตัวเหมือนเดิม
//
// eval ฟังก์ชันจริงจาก views-quote.jsx (ไม่ copy — กันสำเนา drift เหมือน auth.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_PREFIX = grab(QUOTE, /function mtoSkuPrefix_\(sku\) \{[\s\S]*?\n\}/, 'mtoSkuPrefix_');
const F_GROUP  = grab(QUOTE, /function mtoGroupProducts_\(list\) \{[\s\S]*?\n\}/, 'mtoGroupProducts_');
const F_LABEL  = grab(QUOTE, /function mtoGroupLabel_\(g\) \{[\s\S]*?\n\}/, 'mtoGroupLabel_');
// eslint-disable-next-line no-new-func
const { mtoSkuPrefix_, mtoGroupProducts_, mtoGroupLabel_ } = new Function(
  F_PREFIX + '\n' + F_GROUP + '\n' + F_LABEL +
  '\nreturn { mtoSkuPrefix_, mtoGroupProducts_, mtoGroupLabel_ };'
)();

describe('mtoSkuPrefix_ — ตัวอักษรอังกฤษที่นำหน้าตัวเลข', () => {
  it('BK001 → BK · PACKAGE001 → PACKAGE · OL19001 → OL', () => {
    expect(mtoSkuPrefix_('BK001')).toBe('BK');
    expect(mtoSkuPrefix_('PACKAGE001')).toBe('PACKAGE');
    expect(mtoSkuPrefix_('OL19001')).toBe('OL');
  });
  it('พิมพ์เล็ก / มีช่องว่าง → normalize เป็นตัวใหญ่ ตัดช่องว่าง', () => {
    expect(mtoSkuPrefix_(' bk002 ')).toBe('BK');
  });
  it('รหัสไม่มีเลขต่อท้าย / ชื่อล้วน / ว่าง → คืน "" (ไม่ยุบมั่ว)', () => {
    expect(mtoSkuPrefix_('CUSTOM')).toBe('');
    expect(mtoSkuPrefix_('กระเช้าพิเศษ')).toBe('');
    expect(mtoSkuPrefix_('')).toBe('');
    expect(mtoSkuPrefix_(null)).toBe('');
    expect(mtoSkuPrefix_(undefined)).toBe('');
  });
  it('เลขล้วนขึ้นต้น → ไม่มี prefix', () => {
    expect(mtoSkuPrefix_('123ABC')).toBe('');
  });
});

describe('mtoGroupProducts_ — จัดกลุ่มตาม prefix', () => {
  const list = [
    { sku: 'BK003', name: 'กระเช้า#3' },
    { sku: 'BK001', name: 'กระเช้า#1' },
    { sku: 'BK010', name: 'กระเช้า#10' },
    { sku: 'BK002', name: 'กระเช้า#2' },
    { sku: 'PACKAGE002', name: 'แพ็คเกจ#2' },
    { sku: 'PACKAGE001', name: 'แพ็คเกจ#1' },
    { sku: 'CUSTOMX', name: 'งานสั่งพิเศษ' },
  ];

  it('รวม BK ทั้งหมดเป็นกลุ่มเดียว · PACKAGE เป็นอีกกลุ่ม', () => {
    const groups = mtoGroupProducts_(list);
    const bk = groups.find(g => g.prefix === 'BK');
    const pk = groups.find(g => g.prefix === 'PACKAGE');
    expect(bk).toBeTruthy();
    expect(pk).toBeTruthy();
    expect(bk.items.length).toBe(4);
    expect(pk.items.length).toBe(2);
  });

  it('เรียงรหัสในกลุ่มแบบ numeric: BK001, BK002, BK003, BK010 (ไม่ใช่ BK001, BK010, BK002)', () => {
    const groups = mtoGroupProducts_(list);
    const bk = groups.find(g => g.prefix === 'BK');
    expect(bk.items.map(p => p.sku)).toEqual(['BK001', 'BK002', 'BK003', 'BK010']);
  });

  it('รหัสไม่มี prefix ตัวเลข → เป็นกลุ่มเดี่ยวของตัวเอง (ไม่หายจากจอ)', () => {
    const groups = mtoGroupProducts_(list);
    const solo = groups.find(g => g.prefix === 'CUSTOMX');
    expect(solo).toBeTruthy();
    expect(solo.items.length).toBe(1);
    expect(solo.key).toBe('#CUSTOMX');   // key นำ '#' กันชนกับ prefix ปกติ
  });

  it('list ว่าง / ไม่ใช่ array → คืน []', () => {
    expect(mtoGroupProducts_([])).toEqual([]);
    expect(mtoGroupProducts_(null)).toEqual([]);
    expect(mtoGroupProducts_(undefined)).toEqual([]);
  });

  it('ข้ามรายการ null ในลิสต์', () => {
    const groups = mtoGroupProducts_([null, { sku: 'BK001', name: 'ก' }, undefined]);
    expect(groups.length).toBe(1);
    expect(groups[0].items.length).toBe(1);
  });

  it('ลำดับกลุ่มตามที่เจอครั้งแรก (BK ก่อน PACKAGE ก่อน CUSTOMX)', () => {
    const groups = mtoGroupProducts_(list);
    expect(groups.map(g => g.prefix)).toEqual(['BK', 'PACKAGE', 'CUSTOMX']);
  });
});

describe('mtoGroupLabel_ — ชื่อกลุ่มบนการ์ด', () => {
  it('ตัดเลขลำดับท้ายชื่อออก: "กระเช้า#1" → "กระเช้า"', () => {
    expect(mtoGroupLabel_({ prefix: 'BK', items: [{ name: 'กระเช้า#1' }] })).toBe('กระเช้า');
  });
  it('ชื่อมีช่องว่างก่อนเลข: "แจกัน 3" → "แจกัน"', () => {
    expect(mtoGroupLabel_({ prefix: 'V', items: [{ name: 'แจกัน 3' }] })).toBe('แจกัน');
  });
  it('ชื่อไม่มีเลขต่อท้าย → ใช้ตามเดิม', () => {
    expect(mtoGroupLabel_({ prefix: 'BK', items: [{ name: 'กระเช้าพิเศษ' }] })).toBe('กระเช้าพิเศษ');
  });
  it('ชื่อว่าง → fallback ไป prefix', () => {
    expect(mtoGroupLabel_({ prefix: 'BK', items: [{ name: '' }] })).toBe('BK');
  });
  it('กลุ่มว่าง / null → ไม่พัง', () => {
    expect(mtoGroupLabel_({ prefix: 'BK', items: [] })).toBe('BK');
    expect(mtoGroupLabel_(null)).toBe('');
  });
});

// meta-test: การ์ดกลุ่ม MTO ต้องกดเพิ่ม "รหัสถัดไปที่ยังว่าง" (running) ไม่ใช่เพิ่มตัวเดิมซ้ำ
describe('meta: addNextInGroup ยังหยิบรหัสถัดไปที่ยังไม่อยู่ในใบ', () => {
  it('addNextInGroup ใช้ items.find(!inCart) — กด 3 ครั้งได้ 3 รหัสไล่กัน', () => {
    const src = grab(QUOTE, /function addNextInGroup\(g\) \{[\s\S]*?\n  \}/, 'addNextInGroup');
    expect(src).toMatch(/items[\s\S]*find\([\s\S]*!inCart\.has/);
  });
  it('grid ในหมวด MTO เรนเดอร์ pageUnits เป็นการ์ดกลุ่ม (mtoActive)', () => {
    expect(QUOTE).toMatch(/mtoActive\s*[\s\S]{0,40}pageUnits\.map/);
  });
});
