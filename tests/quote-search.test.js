// tests/quote-search.test.js — ค้นหาเลขที่เอกสาร/ชื่อลูกค้า/เบอร์โทร ก่อนพิมพ์ (แท็บใบเสนอราคา)
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา: พนักงานขายมีใบเป็นสิบ-ร้อยใบในหมวด "รออนุมัติ"/"อนุมัติแล้ว" ต้องไล่เลื่อนหาเอง
// เพื่อพิมพ์ซ้ำใบใดใบหนึ่ง — เพิ่มช่องค้นหา (เลขที่เอกสาร/ชื่อลูกค้า/เบอร์โทร) multi-token
// AND-match แบบเดียวกับที่ใช้ทั้งระบบ (บทเรียนข้อ 10 ใน CLAUDE.md)
//
// คุมด้วยการ eval ฟังก์ชันจริงจาก .jsx (ไม่ copy — เหมือน auth.test.js/quote-scope-mine.test.js)
// matchQSearch อ้าง qSearch จาก closure ของ component → ห่อเป็น factory ที่รับ qSearch เข้าไปแทน
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_MATCH = grab(VANA, /const matchQSearch = \(it\) => \{[\s\S]*?\n  \};/, 'matchQSearch');
// eslint-disable-next-line no-new-func
const makeMatcher = new Function('qSearch', F_MATCH + '\nreturn matchQSearch;');

const ITEMS = [
  { number: 'QT-202608001', customer: 'สมชาย ใจดี', phone: '0812345678' },
  { number: 'QT-202608002', customer: 'สมหญิง รักไทย', phone: '0899999999' },
  { number: 'IVB-202608003', customer: 'ร้านดอกไม้สวย', phone: '0855555555' },
];

describe('matchQSearch — ค้นหาเลขที่เอกสาร/ชื่อลูกค้า/เบอร์โทร', () => {
  it('ค้นหาว่าง → ผ่านทุกแถว (ไม่กรองอะไร)', () => {
    const m = makeMatcher('');
    expect(ITEMS.filter(m)).toHaveLength(3);
  });

  it('ค้นหาด้วยเลขที่เอกสาร (บางส่วน) → เจอเฉพาะใบที่ตรง', () => {
    const m = makeMatcher('202608002');
    expect(ITEMS.filter(m).map(x => x.number)).toEqual(['QT-202608002']);
  });

  it('ค้นหาด้วยชื่อลูกค้า (บางส่วน)', () => {
    const m = makeMatcher('สมชาย');
    expect(ITEMS.filter(m).map(x => x.number)).toEqual(['QT-202608001']);
  });

  it('ค้นหาด้วยเบอร์โทร', () => {
    const m = makeMatcher('0855555555');
    expect(ITEMS.filter(m).map(x => x.number)).toEqual(['IVB-202608003']);
  });

  it('ไม่สนตัวพิมพ์ใหญ่/เล็ก (เลขที่เอกสารมีตัวอักษร)', () => {
    const m = makeMatcher('qt-202608001');
    expect(ITEMS.filter(m).map(x => x.number)).toEqual(['QT-202608001']);
  });

  it('multi-token AND — "สมหญิง 0899" ต้องเจอทั้งชื่อและเบอร์คู่กัน', () => {
    const m = makeMatcher('สมหญิง 0899');
    expect(ITEMS.filter(m).map(x => x.number)).toEqual(['QT-202608002']);
  });

  it('multi-token AND — token ไม่ครบทุกตัว (ชื่อตรงแต่เบอร์ผิด) → ไม่เจอ', () => {
    const m = makeMatcher('สมหญิง 0812');
    expect(ITEMS.filter(m)).toHaveLength(0);
  });

  it('ไม่เจอเลย → array ว่าง (ไม่ throw)', () => {
    const m = makeMatcher('ไม่มีอยู่จริงxyz');
    expect(ITEMS.filter(m)).toHaveLength(0);
  });

  it('เว้นวรรคซ้อน/หน้า-หลัง ไม่ทำให้พัง', () => {
    const m = makeMatcher('   สมชาย   ');
    expect(ITEMS.filter(m).map(x => x.number)).toEqual(['QT-202608001']);
  });
});

// ── meta-test: จุดเชื่อมต่อที่พังแล้วเงียบ ──────────────────────────────────
describe('จุดเชื่อมต่อ — ช่องค้นหาในแท็บใบเสนอราคา', () => {
  it('มีช่องค้นหาจริงในหน้า (ไม่ใช่แค่ logic ลอย)', () => {
    expect(VANA).toMatch(/ค้นหาเลขที่เอกสาร/);
    expect(VANA).toMatch(/setQSearch\(e\.target\.value\)/);
  });

  it('รายการที่พิมพ์/แบ่งหน้า (slice) ต้องมาจาก pendingSearched/approvedSearched ไม่ใช่ pendingRender/approvedRender ดิบ', () => {
    // pendingRender/approvedRender ยังต้องเหลือไว้ใช้กับป้ายจำนวนบนแท็บ (นับก่อนค้นหา) และ
    // เช็คความว่างระดับ "ของฉัน" — แต่จุดที่ .slice()/พิมพ์จริงต้องผ่านตัวกรองค้นหาก่อนเสมอ
    const sliceLines = VANA.match(/\{(pending|approved)(Render|Searched)\.slice\(\(qPage[^\n]*/g) || [];
    expect(sliceLines.length).toBeGreaterThan(0);
    for (const line of sliceLines) {
      expect(line).toMatch(/(pendingSearched|approvedSearched)\.slice/);
    }
  });

  it('Pagination total ต้องนับจากรายการที่ค้นหาแล้ว (ไม่งั้นเลขหน้าไม่ตรงกับที่เห็นจริง)', () => {
    const totals = VANA.match(/total=\{(pending|approved)(Render|Searched)\.length\}/g) || [];
    expect(totals.length).toBeGreaterThan(0);
    for (const t of totals) {
      expect(t).toMatch(/(pendingSearched|approvedSearched)\.length/);
    }
  });

  it('ค้นหาแล้วว่าง (มีใบในสโคปแต่ไม่ตรงคำค้น) ต้องมีปุ่มล้างคำค้นหา ไม่ใช่จอว่างเงียบ ๆ', () => {
    expect(VANA).toMatch(/ไม่พบใบที่ตรงกับคำค้นหา/);
    expect(VANA).toMatch(/ล้างคำค้นหา/);
  });

  it('เปลี่ยนคำค้นหาต้องรีเซ็ตหน้า (qPage) กลับไปหน้า 1', () => {
    const effLine = grab(VANA, /uE\(\(\) => \{ setQPage\(1\); \}, \[[^\]]*\]\);/, 'qPage reset effect');
    expect(effLine).toMatch(/qSearch/);
  });
});
