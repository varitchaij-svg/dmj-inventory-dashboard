// tests/product-owner-assign.test.js
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ มอบหมายผู้ดูแลสินค้าเป็นชุดตามหมวด (เจ้าของรันเองใน GAS editor)
// ต่างจากไฟล์เทสต์ส่วนใหญ่ตรงที่ **ไม่ copy โค้ดเข้า tests/helpers.js** แต่ eval ฟังก์ชัน
// จริงจาก appsscript_complete.gs (หลักเดียวกับ auth.test.js) — เครื่องมือนี้เขียนดาวทีเดียว
// เป็นพันแถว ถ้าเทสต์เป็นสำเนาแล้ว drift เทสต์จะเขียวทั้งที่ของจริงแจกผิดคน
//
// สิ่งที่คุมไว้คือ "เคสที่พลาดแล้วไม่มี error ให้เห็น":
//   1. หมวดที่มีหลายคนอ้างสิทธิ์ → ต้องข้าม ไม่ยกให้คนที่อยู่บรรทัดบนสุดเงียบ ๆ
//   2. SKU ที่มีคนดูแลอยู่แล้ว → ต้องไม่ถูกทับด้วยตารางตั้งต้น
//   3. ชื่อหมวดที่เว้นวรรค/ตัวพิมพ์ไม่ตรง → ต้องยังจับคู่ได้ (ไม่งั้น "หมวดหาย" ทั้งหมวด)
//   4. ชื่อพนักงานหาไม่เจอ/ซ้ำ → ต้องไม่เขียนอะไรเลย ไม่ใช่เขียนเฉพาะคนที่หาเจอ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

function grab(re) {
  const m = GS.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const M = new Function([
  grab(/function productOwnerNormKey_\(s\) \{[\s\S]*?\n\}/),
  grab(/function productOwnerStaffKey_\(s\) \{[\s\S]*?\n\}/),
  grab(/function productOwnerPlanIndex_\(plan\) \{[\s\S]*?\n\}/),
  grab(/function productOwnerResolveStaffCore_\(staffAll, labels\) \{[\s\S]*?\n\}/),
  grab(/function productOwnerAssignPlanCore_\(planIndex, products, owners, overwrite\) \{[\s\S]*?\n\}/),
  grab(/function productOwnerDescribeName_\(s\) \{[\s\S]*?\n\}/),
  'return { productOwnerNormKey_, productOwnerStaffKey_, productOwnerPlanIndex_, productOwnerResolveStaffCore_, productOwnerAssignPlanCore_, productOwnerDescribeName_ };',
].join('\n'))();

const { productOwnerNormKey_: normKey, productOwnerStaffKey_: staffKey, productOwnerPlanIndex_: planIndex,
  productOwnerResolveStaffCore_: resolveStaff, productOwnerAssignPlanCore_: assignCore,
  productOwnerDescribeName_: describeName } = M;

const prod = (sku, category, name) => ({ sku, category, name: name || sku });
const staff = (staffId, displayName, extra) =>
  Object.assign({ staffId, displayName, lineDisplayName: displayName, role: 'frontstore', status: 'active' }, extra || {});

// ตารางตัวอย่างที่ "ไม่ซ้อนกัน" — ใช้เป็นฐานของเคสส่วนใหญ่
const PLAN = [
  { staff: 'TunTun', categories: ['ใบ', 'กิ่งไม้'] },
  { staff: 'Ya Ya', categories: ['แจกันแก้ว', 'กระถางPS'] },
];

describe('productOwnerNormKey_ — เทียบชื่อหมวด/ชื่อคนแบบทนการเว้นวรรค', () => {
  it('ช่องว่างไม่มีผล — "กระถาง PS" = "กระถางPS" (ชีตจริงเว้นวรรคไม่คงที่)', () => {
    expect(normKey('กระถาง PS')).toBe(normKey('กระถางPS'));
  });

  it('ตัวพิมพ์ไม่มีผล — "Realtouch" = "realtouch" = "REALTOUCH"', () => {
    expect(normKey('Realtouch')).toBe(normKey('realtouch'));
    expect(normKey('REALTOUCH')).toBe(normKey('Realtouch'));
  });

  it('zero-width ที่ติดมาจากการ copy ถูกตัดทิ้ง (มองไม่เห็นด้วยตา = หาสาเหตุไม่เจอ)', () => {
    expect(normKey('ใบ​บูช')).toBe(normKey('ใบบูช'));
    expect(normKey('﻿ดอกไม้')).toBe(normKey('ดอกไม้'));
  });

  it('null/undefined/ตัวเลข ไม่ระเบิด', () => {
    expect(normKey(null)).toBe('');
    expect(normKey(undefined)).toBe('');
    expect(normKey(123)).toBe('123');
  });

  it('หมวดคนละอันยังต่างกันจริง (normalize ไม่ได้ทำให้ทุกอย่างเท่ากันหมด)', () => {
    expect(normKey('ใบ')).not.toBe(normKey('ใบบูช'));
  });
});

describe('productOwnerPlanIndex_ — ตาราง → ใครอ้างหมวดไหน', () => {
  it('หมวดของคนเดียว → staff 1 คน', () => {
    const idx = planIndex(PLAN);
    expect(idx.byCat[normKey('ใบ')].staff).toEqual(['TunTun']);
  });

  it('หมวดเดียวกันอยู่ในลิสต์หลายคน → เก็บครบทุกคน (ไว้ให้ตัวเรียกข้าม ไม่ใช่เลือกให้)', () => {
    const idx = planIndex([
      { staff: 'A', categories: ['อุปกรณ์สำนักงาน'] },
      { staff: 'B', categories: ['อุปกรณ์สำนักงาน'] },
      { staff: 'C', categories: ['อุปกรณ์ สำนักงาน'] },   // เว้นวรรคต่าง = หมวดเดียวกัน
    ]);
    expect(idx.byCat[normKey('อุปกรณ์สำนักงาน')].staff).toEqual(['A', 'B', 'C']);
  });

  it('คนเดียวใส่หมวดซ้ำ 2 ครั้ง → ไม่นับเป็นซ้อนกัน', () => {
    const idx = planIndex([{ staff: 'A', categories: ['ใบ', 'ใบ'] }]);
    expect(idx.byCat[normKey('ใบ')].staff).toEqual(['A']);
  });

  it('แถวที่ไม่มีชื่อคน/ไม่มีหมวด → ข้าม ไม่ระเบิด', () => {
    const idx = planIndex([{ staff: '', categories: ['ใบ'] }, { staff: 'A', categories: [] }, null]);
    expect(idx.order).toEqual([]);
  });
});

describe('productOwnerStaffKey_ — ชื่อคนที่มีอักขระพิเศษ (ชื่อ LINE ของพนักงานจริง)', () => {
  it('อีโมจิต่อท้าย/นำหน้าไม่มีผล — "แอ 🌸" = "แอ"', () => {
    expect(staffKey('แอ 🌸')).toBe(staffKey('แอ'));
    expect(staffKey('🌟KYAW')).toBe(staffKey('KYAW'));
  });

  it('ตัวอักษรตกแต่ง (mathematical script) เทียบเท่าตัวปกติ — "𝓨𝓪 𝓨𝓪" = "Ya Ya"', () => {
    expect(staffKey('𝓨𝓪 𝓨𝓪')).toBe(staffKey('Ya Ya'));
  });

  it('ตัวเต็มความกว้าง (full-width) เทียบเท่า ASCII — "ＫＹＡＷ" = "KYAW"', () => {
    expect(staffKey('ＫＹＡＷ')).toBe(staffKey('KYAW'));
  });

  it('สัญลักษณ์คั่น/หัวใจ/ดาว ไม่มีผล — "・KYAW・", "TunTun♡", "Ya_Ya"', () => {
    expect(staffKey('・KYAW・')).toBe(staffKey('KYAW'));
    expect(staffKey('TunTun♡')).toBe(staffKey('TunTun'));
    expect(staffKey('Ya_Ya')).toBe(staffKey('YaYa'));
  });

  it('⚠️ ตัดได้แค่ "เครื่องหมาย" ไม่ใช่ "คำ" — "ประสิทธิ์ (คลัง)" ยังเหลือคำว่าคลังอยู่', () => {
    // เคสนี้ตั้งใจให้ไปจับด้วยชั้นที่ 2 (จับคู่หลวม) ซึ่งรายงานให้เจ้าของตรวจ
    // ไม่ใช่ยุบให้เท่ากันเงียบ ๆ ตรงนี้ — "ประสิทธิ์ (คลัง)" กับ "ประสิทธิ์" อาจเป็นคนละคนก็ได้
    expect(staffKey('ประสิทธิ์ (คลัง)')).toBe('ประสิทธิ์คลัง');
    expect(staffKey('ประสิทธิ์ (คลัง)')).not.toBe(staffKey('ประสิทธิ์'));
  });

  it('zero-width ที่ติดมากับการ copy ไม่มีผล', () => {
    expect(staffKey('Tun​Tun')).toBe(staffKey('TunTun'));
  });

  it('⚠️ วรรณยุกต์/สระไทยห้ามถูกตัด — "ประสิทธิ์" ต้องไม่กลายเป็น "ประสทธ"', () => {
    expect(staffKey('ประสิทธิ์')).toBe('ประสิทธิ์');
    expect(staffKey('ประสิทธิ์')).not.toBe(staffKey('ประสิทธิ'));
  });

  it('⚠️ ชื่ออักษรพม่า/ลาว ต้องไม่ถูกลบจนเหลือค่าว่าง (พนักงานต่างด้าวตั้งชื่อภาษาตัวเอง)', () => {
    expect(staffKey('ကျော်')).not.toBe('');
    expect(staffKey('ຄຳ')).not.toBe('');
  });

  it('คนละชื่อยังต่างกันจริง (ไม่ได้ยุบทุกอย่างมาชนกัน)', () => {
    expect(staffKey('KYAW')).not.toBe(staffKey('KHALANE'));
    expect(staffKey('แอ')).not.toBe(staffKey('เอ'));
  });
});

describe('productOwnerResolveStaffCore_ — ชื่อในตาราง → พนักงานจริงในชีต', () => {
  const all = [
    staff('ST0001', 'TunTun'),
    staff('ST0002', 'Ya Ya'),
    staff('ST0003', 'ประสิทธิ์'),
    staff('ST0009', 'คนเก่า', { status: 'disabled' }),
  ];

  it('จับคู่ด้วยชื่อได้ แม้เว้นวรรค/ตัวพิมพ์ไม่ตรง', () => {
    const r = resolveStaff(all, ['tuntun', 'YaYa']);
    expect(r.resolved['tuntun'].staffId).toBe('ST0001');
    expect(r.resolved['YaYa'].staffId).toBe('ST0002');
    expect(r.missing).toEqual([]);
  });

  it('ใส่ staffId ตรง ๆ ก็ได้ (ทางออกเวลาชื่อซ้ำ)', () => {
    expect(resolveStaff(all, ['ST0003']).resolved['ST0003'].name).toBe('ประสิทธิ์');
  });

  it('พนักงานที่ status ไม่ใช่ active → นับเป็นหาไม่เจอ (ไม่ควรได้ดาวใหม่)', () => {
    const r = resolveStaff(all, ['คนเก่า']);
    expect(r.missing).toEqual(['คนเก่า']);
    expect(r.resolved['คนเก่า']).toBeUndefined();
  });

  it('ชื่อซ้ำกัน 2 คน → ambiguous ไม่ใช่เลือกคนแรกให้', () => {
    const dup = [staff('ST0001', 'แอ'), staff('ST0002', 'แอ')];
    const r = resolveStaff(dup, ['แอ']);
    expect(r.resolved['แอ']).toBeUndefined();
    expect(r.ambiguous[0].staffIds).toEqual(['ST0001', 'ST0002']);
  });

  it('คนเดียวที่ displayName กับ lineDisplayName ต่างกัน → ยังนับเป็นคนเดียว ไม่ ambiguous', () => {
    const one = [staff('ST0005', 'แอ', { lineDisplayName: 'Ae' })];
    const r = resolveStaff(one, ['Ae']);
    expect(r.resolved['Ae'].staffId).toBe('ST0005');
    expect(r.ambiguous).toEqual([]);
  });

  it('ชื่อที่ไม่มีในชีตเลย → missing (ตัวเรียกต้องหยุด ไม่ใช่ข้ามเงียบ ๆ)', () => {
    expect(resolveStaff(all, ['KHALANE']).missing).toEqual(['KHALANE']);
  });

  it('ชื่อในชีตมีอีโมจิ/อักษรตกแต่ง → ยังจับคู่ได้ ถือเป็น "ตรงเป๊ะ" ไม่ต้องเตือน', () => {
    const fancy = [staff('ST0002', '𝓨𝓪 𝓨𝓪 ♡'), staff('ST0004', 'KYAW แอ KHALANE 🌸')];
    const r = resolveStaff(fancy, ['Ya Ya', 'KYAW แอ KHALANE']);
    expect(r.resolved['Ya Ya'].staffId).toBe('ST0002');
    expect(r.resolved['KYAW แอ KHALANE'].staffId).toBe('ST0004');
    expect(r.loose).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('ชื่อในชีตมีส่วนเกิน → จับคู่ได้แต่ต้องรายงานว่า "ไม่ตรงเป๊ะ" ให้เจ้าของตรวจ', () => {
    const extra = [staff('ST0004', 'KYAW แอ KHALANE (คลังสินค้า)'), staff('ST0001', 'TunTun')];
    const r = resolveStaff(extra, ['KYAW แอ KHALANE']);
    expect(r.resolved['KYAW แอ KHALANE'].staffId).toBe('ST0004');
    expect(r.loose).toHaveLength(1);
    expect(r.loose[0].matchedName).toBe('KYAW แอ KHALANE (คลังสินค้า)');
  });

  it('ชื่อสั้นที่เข้าข่ายหลายคน → ambiguous ไม่เดาให้ (เช่น "แอ" ที่ไปตรงกับ 2 ชื่อยาว)', () => {
    const many = [staff('ST0004', 'KYAW แอ KHALANE'), staff('ST0006', 'แอ๊ะแอ')];
    const r = resolveStaff(many, ['แอ']);
    expect(r.resolved['แอ']).toBeUndefined();
    expect(r.ambiguous[0].staffIds.sort()).toEqual(['ST0004', 'ST0006']);
  });

  it('ชื่อที่ตรงเป๊ะอยู่แล้ว ต้องไม่ถูกดึงไปเข้าเส้นทางจับคู่หลวม', () => {
    const both = [staff('ST0001', 'TunTun'), staff('ST0007', 'TunTun สาขา 2')];
    const r = resolveStaff(both, ['TunTun']);
    expect(r.resolved['TunTun'].staffId).toBe('ST0001');
    expect(r.loose).toEqual([]);
  });
});

describe('productOwnerDescribeName_ — กางอักขระที่มองไม่เห็นให้เจ้าของดู', () => {
  it('ชื่อธรรมดา (ไทย/อังกฤษ) → คืนตามเดิม ไม่รกจอ', () => {
    expect(describeName('ประสิทธิ์')).toBe('ประสิทธิ์');
    expect(describeName('Ya Ya')).toBe('Ya Ya');
  });

  it('มีอักขระพิเศษ → บอกรหัสออกมา (ไล่หาด้วยตาเปล่าไม่ได้)', () => {
    const out = describeName('แอ​');
    expect(out).toContain('อักขระพิเศษ');
    expect(out).toContain('\\u200B');
  });

  it('null/undefined ไม่ระเบิด', () => {
    expect(describeName(null)).toBe('');
    expect(describeName(undefined)).toBe('');
  });
});

describe('productOwnerAssignPlanCore_ — ใครได้ SKU ไหนบ้าง', () => {
  const idx = planIndex(PLAN);

  it('สินค้าตามหมวดในตาราง → เข้าคนนั้น พร้อมนับยอดต่อคน', () => {
    const r = assignCore(idx, [prod('L01001', 'ใบ'), prod('V01001', 'แจกันแก้ว')], {}, false);
    expect(r.assign.map(a => a.staff)).toEqual(['TunTun', 'Ya Ya']);
    expect(r.perStaff).toEqual({ TunTun: 1, 'Ya Ya': 1 });
  });

  it('หมวดที่ไม่มีในตาราง → ไม่มอบหมาย แต่ต้องรายงานว่ามีกี่ตัว (ไม่ทิ้งเงียบ)', () => {
    const r = assignCore(idx, [prod('X1', 'ของตกแต่ง'), prod('X2', 'ของตกแต่ง')], {}, false);
    expect(r.assign).toEqual([]);
    expect(r.unplanned['ของตกแต่ง']).toBe(2);
  });

  it('หมวดที่มีหลายคนอ้างสิทธิ์ → ข้ามทั้งหมวด ไม่ยกให้คนบรรทัดบนสุด', () => {
    const shared = planIndex([
      { staff: 'A', categories: ['อุปกรณ์สำนักงาน'] },
      { staff: 'B', categories: ['อุปกรณ์สำนักงาน'] },
    ]);
    const r = assignCore(shared, [prod('OF1', 'อุปกรณ์สำนักงาน')], {}, false);
    expect(r.assign).toEqual([]);
    expect(r.sharedSkip).toHaveLength(1);
    expect(r.sharedSkip[0].staff).toEqual(['A', 'B']);
  });

  it('SKU ที่มีคนดูแลอยู่แล้ว → ข้าม ไม่ทับดาวที่พนักงานกดเอง', () => {
    const owners = { L01001: { staffId: 'ST0007', name: 'ส้ม' } };
    const r = assignCore(idx, [prod('L01001', 'ใบ')], owners, false);
    expect(r.assign).toEqual([]);
    expect(r.takenSkip[0].current).toBe('ส้ม');
  });

  it('overwrite=true → ทับได้ (ทางเลือกที่ต้องตั้งใจเปิดเอง)', () => {
    const owners = { L01001: { staffId: 'ST0007', name: 'ส้ม' } };
    const r = assignCore(idx, [prod('L01001', 'ใบ')], owners, true);
    expect(r.assign).toHaveLength(1);
    expect(r.takenSkip).toEqual([]);
  });

  it('เทียบ "มีคนดูแลแล้ว" แบบไม่สนตัวพิมพ์ — ไม่งั้นจะเขียนทับดาวเดิมโดยไม่รู้ตัว', () => {
    const r = assignCore(idx, [prod('l01001', 'ใบ')], { L01001: { staffId: 'ST0007', name: 'ส้ม' } }, false);
    expect(r.assign).toEqual([]);
    expect(r.takenSkip).toHaveLength(1);
  });

  it('แถวดาวที่ถูกถอดแล้ว (staffId ว่าง) ไม่นับว่ามีคนดูแล → มอบหมายได้', () => {
    const r = assignCore(idx, [prod('L01001', 'ใบ')], { L01001: { staffId: '', name: '' } }, false);
    expect(r.assign).toHaveLength(1);
  });

  it('SKU ถูกเขียนเป็นตัวพิมพ์ใหญ่ให้ตรงกับ setProductOwnerHandler_ + เตือนเมื่อของเดิมไม่ใช่', () => {
    const r = assignCore(idx, [prod('l01001', 'ใบ')], {}, false);
    expect(r.assign[0].sku).toBe('L01001');
    expect(r.caseWarn).toEqual(['l01001']);
  });

  it('หมวดในตารางที่ไม่เจอสินค้าเลย → missingCats (สัญญาณว่าพิมพ์ชื่อไม่ตรงชีต)', () => {
    const r = assignCore(idx, [prod('L01001', 'ใบ')], {}, false);
    expect(r.missingCats).toContain('กิ่งไม้');
    expect(r.missingCats).toContain('แจกันแก้ว');
    expect(r.missingCats).not.toContain('ใบ');
  });

  it('ชื่อหมวดในชีตเว้นวรรคต่างจากในตาราง → ยังจับคู่ได้ (ไม่งั้นหายทั้งหมวดเงียบ ๆ)', () => {
    const r = assignCore(idx, [prod('P1', 'กระถาง PS')], {}, false);
    expect(r.assign).toHaveLength(1);
    expect(r.assign[0].staff).toBe('Ya Ya');
  });

  it('สินค้าไม่มี SKU / ไม่มีหมวด → ข้าม ไม่ระเบิด', () => {
    const r = assignCore(idx, [prod('', 'ใบ'), { sku: 'Z1' }, null], {}, false);
    expect(r.assign).toEqual([]);
    expect(r.unplanned['(ไม่ระบุหมวด)']).toBe(1);
  });

  it('รายการว่าง → คืนโครงสร้างครบ ไม่ throw', () => {
    const r = assignCore(idx, [], {}, false);
    expect(r.assign).toEqual([]);
    expect(r.perStaff).toEqual({});
  });
});

describe('การเชื่อมต่อ (meta) — จุดที่ลืมแล้วเครื่องมือทำงานผิดแบบเงียบ ๆ', () => {
  const RUN = grab(/function productOwnerAssignRun_\(doWrite\) \{[\s\S]*?\n^\}/m);

  it('ชื่อฟังก์ชันที่เจ้าของต้องรันเองห้ามลงท้าย _ (ไม่งั้นไม่โผล่ใน dropdown ของ GAS)', () => {
    ['listProductCategories', 'checkProductOwnerStaffNames',
      'previewProductOwnerAssign', 'applyProductOwnerAssign'].forEach((fn) => {
      expect(GS, fn + ' หายไป').toContain('function ' + fn + '(');
      expect(GS).not.toContain('function ' + fn + '_(');
    });
  });

  it('preview กับ apply เดินผ่านตัวคิดตัวเดียวกัน — เลขที่เห็นตอน preview ต้องคือสิ่งที่เกิดจริง', () => {
    expect(GS).toContain('function previewProductOwnerAssign() { return productOwnerAssignRun_(false); }');
    expect(GS).toContain('function applyProductOwnerAssign() { return productOwnerAssignRun_(true); }');
  });

  it('preview ไม่เขียน/ไม่สร้างชีตอะไรเลย — ทางเขียนอยู่หลัง `if (!doWrite) return` เท่านั้น', () => {
    const iReturn = RUN.indexOf('if (!doWrite)');
    expect(iReturn).toBeGreaterThan(0);
    const before = RUN.slice(0, iReturn);
    expect(before).not.toContain('setValues');
    expect(before).not.toContain('productOwnerSheet_(');   // ตัวนี้ getOrCreateSheet_ = สร้างชีตทิ้งไว้
    expect(before).not.toContain('writeAuditLog_');
  });

  it('ชื่อพนักงานหาไม่เจอ/ซ้ำ → หยุดทั้งรอบ ไม่เขียนเฉพาะคนที่หาเจอ', () => {
    const iBlock = RUN.indexOf('who.missing.length || who.ambiguous.length');
    const iWrite = RUN.indexOf('setValues');
    expect(iBlock).toBeGreaterThan(0);
    expect(iBlock).toBeLessThan(iWrite);
    expect(RUN).toMatch(/blocked: 'staff'/);
  });

  it('จับ LockService คร่อมช่วง "อ่านแถวเดิม → เขียน" (กันชนกับคนที่กดดาวอยู่พอดี)', () => {
    const iLock = RUN.indexOf('LockService.getScriptLock()');
    const iRead = RUN.indexOf('var rowBySku = {}');
    const iWrite = RUN.indexOf('setValues');
    expect(iLock).toBeGreaterThan(0);
    expect(iLock).toBeLessThan(iRead);
    expect(iRead).toBeLessThan(iWrite);
    expect(RUN).toContain('releaseLock');
  });

  it('เขียน audit 1 แถวสรุปต่อการรัน ไม่ใช่ 1 แถวต่อ SKU (Audit Log เป็นฐานของแท็บผลงาน)', () => {
    const calls = RUN.match(/writeAuditLog(Batch)?_\(/g) || [];
    expect(calls).toHaveLength(1);
    expect(RUN).not.toContain('writeAuditLogBatch_');
    // action ต้องมีหมวดใน STAFF_PERF_CATEGORIES_ อยู่แล้ว (หมวด "star" ops:false)
    expect(RUN).toContain("'setProductOwner'");
  });

  it('เพดานแถว POWN_MAX_ROWS ต้องสูงกว่าจำนวน SKU ที่ realistic — ตันแล้วดาวหายเงียบ ๆ', () => {
    const m = GS.match(/var POWN_MAX_ROWS = (\d+);/);
    expect(m, 'หา POWN_MAX_ROWS ไม่เจอ').toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(20000);
    // และต้องมีคนเตือนเมื่อใกล้ตันทั้งใน preview และหลังเขียนจริง
    expect(RUN.match(/POWN_MAX_ROWS/g).length).toBeGreaterThanOrEqual(2);
  });

  it('ค่าปกติของ overwrite = false (ตารางตั้งต้นต้องไม่ทับงานที่พนักงานกดเอง)', () => {
    expect(GS).toContain('var PRODUCT_OWNER_ASSIGN_OVERWRITE_ = false;');
  });

  it('ตารางมอบหมายมีจริงและอ่านค่าจากตัวแปรเดียว (ไม่ hard-code ชื่อคนกระจายในโค้ด)', () => {
    expect(GS).toMatch(/var PRODUCT_OWNER_ASSIGN_PLAN_ = \[/);
    expect(RUN).toContain('PRODUCT_OWNER_ASSIGN_PLAN_');
    expect(GS.match(/PRODUCT_OWNER_ASSIGN_PLAN_/g).length).toBeGreaterThanOrEqual(3);
  });

  it('เตือนเมื่อระบบดาวยังไม่เปิด — เขียนแล้วแต่ไม่โผล่บนเว็บคือเคสที่งงที่สุด', () => {
    expect(RUN).toContain('productOwnerEnabled_()');
    expect(RUN).toContain('setupProductOwner()');
  });

  it('เครื่องมือนี้ไม่ไปแตะ payload cache — ดาวไม่ได้อยู่ใน payload หลัก', () => {
    expect(RUN).not.toContain('invalidateCache_');
  });

  it('รายงานการจับคู่ชื่อแบบ "ไม่ตรงเป๊ะ" ให้เห็นก่อนเขียน — จับคู่เงียบ = ดาวไปทั้งพันตัวผิดคน', () => {
    expect(RUN).toContain('who.loose');
    const iLoose = RUN.indexOf('who.loose.length');
    const iWrite = RUN.indexOf('setValues');
    expect(iLoose).toBeGreaterThan(0);
    expect(iLoose).toBeLessThan(iWrite);
  });

  it('ตัวตรวจชื่อ checkProductOwnerStaffNames() อ่านอย่างเดียว — รันเมื่อไหร่ก็ได้', () => {
    const fn = grab(/function checkProductOwnerStaffNames\(\) \{[\s\S]*?\n^\}/m);
    ['setValue', 'appendRow', 'deleteRow', 'productOwnerSheet_(', 'writeAuditLog_'].forEach((bad) => {
      expect(fn, 'ตัวตรวจต้องไม่เขียนอะไรเลย แต่เจอ ' + bad).not.toContain(bad);
    });
    expect(fn).toContain('productOwnerResolveStaffCore_');   // ใช้ตัวจับคู่ตัวเดียวกับตอน apply
    expect(fn).toContain('productOwnerDescribeName_');
  });

  it('ชื่อคนกับชื่อหมวดใช้คนละตัวเทียบโดยตั้งใจ (ตัดอักขระแรงกับชื่อหมวดจะยุบหมวดมาชนกัน)', () => {
    const resolver = grab(/function productOwnerResolveStaffCore_\(staffAll, labels\) \{[\s\S]*?\n^\}/m);
    expect(resolver).toContain('productOwnerStaffKey_');
    expect(resolver).not.toContain('productOwnerNormKey_');
    const core = grab(/function productOwnerAssignPlanCore_\(planIndex, products, owners, overwrite\) \{[\s\S]*?\n^\}/m);
    expect(core).toContain('productOwnerNormKey_');
    expect(core).not.toContain('productOwnerStaffKey_');
  });

  it('ห้ามใช้ \\p{...} ใน productOwnerStaffKey_ — runtime ที่ไม่รองรับ = syntax error ทั้งไฟล์', () => {
    const fn = grab(/function productOwnerStaffKey_\(s\) \{[\s\S]*?\n^\}/m);
    expect(fn).not.toContain('\\p{');
  });
});
