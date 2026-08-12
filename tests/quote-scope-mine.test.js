// tests/quote-scope-mine.test.js — "⭐ ของฉัน" ในแท็บใบเสนอราคาต้องหาใบของตัวเองเจอ
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (ส.ค. 2026): พนักงานขายเปิดแท็บใบเสนอราคาแล้ว "หาใบของตัวเองไม่เจอ" (ของฉันว่าง)
//  2 ต้นเหตุที่ต่างกัน:
//   1. เทียบชื่อเซลด้วย `it.sale === myName` ตรง ๆ — ชื่อ LINE มีอิโมจิ ("นิยม💫") และชีต
//      overlay อาจเก็บคนละรูปแบบ → ไม่ตรงทั้งที่คนเดียวกัน (บทเรียนเดียวกับ productOwnerStaffKey_)
//   2. ตอนไม่ได้ล็อกอิน salesRep fallback เป็น "saler" (role string) → ใบติดชื่อ "saler"
//      ปนกันทุกคน match ใครไม่ได้เลย
// คุมด้วยการ eval ฟังก์ชันจริงจาก .jsx (ไม่ copy — เหมือน auth.test.js/quote-item-image.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const QUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_KEY = grab(VANA, /function quoteSaleKey\(s\) \{[\s\S]*?\n\}/, 'quoteSaleKey');
// eslint-disable-next-line no-new-func
const { quoteSaleKey } = new Function(F_KEY + '\nreturn { quoteSaleKey };')();

describe('quoteSaleKey — เทียบชื่อเซลให้ทนอักขระประดับ', () => {
  it('ชื่อที่มีอิโมจิต่อท้าย = ชื่อล้วน (นิยม💫 ↔ นิยม)', () => {
    expect(quoteSaleKey('นิยม💫')).toBe(quoteSaleKey('นิยม'));
  });

  it('เว้นวรรคไม่คงที่ไม่ทำให้ไม่ตรง (Ya Ya ↔ YaYa)', () => {
    expect(quoteSaleKey('Ya Ya')).toBe(quoteSaleKey('YaYa'));
  });

  it('ตัวพิมพ์ใหญ่/เล็กไม่ต่าง', () => {
    expect(quoteSaleKey('SomChai')).toBe(quoteSaleKey('somchai'));
  });

  it('NFKC: ตัวอักษรตกแต่ง (fullwidth) กลับเป็น ASCII ตรงกับที่พิมพ์ปกติ (ＫＹＡＷ ↔ KYAW)', () => {
    const fullwidthKYAW = String.fromCharCode(0xFF2B, 0xFF39, 0xFF21, 0xFF37); // ＫＹＡＷ
    expect(quoteSaleKey(fullwidthKYAW)).toBe(quoteSaleKey('KYAW'));
  });

  it('ตัด "(ตำแหน่ง)" ท้าย เผื่อเผลอติดมา', () => {
    expect(quoteSaleKey('สมชาย (พนักงานขาย)')).toBe(quoteSaleKey('สมชาย'));
  });

  it('ตัด zero-width ที่มองไม่เห็น', () => {
    const withZW = 'นิยม' + String.fromCharCode(0x200B); // zero-width space ต่อท้าย
    expect(quoteSaleKey(withZW)).toBe(quoteSaleKey('นิยม'));
  });

  it('คนละคนยังต้องได้คีย์ต่างกัน (ไม่ตัดแรงจนยุบมาชนกัน)', () => {
    expect(quoteSaleKey('นิยม')).not.toBe(quoteSaleKey('ประสิทธิ์'));
  });

  it('วรรณยุกต์/สระไทยห้ามหาย (ประสิทธิ์ ≠ ประสทธ)', () => {
    expect(quoteSaleKey('ประสิทธิ์')).not.toBe(quoteSaleKey('ประสทธ'));
  });

  it('ค่าว่าง/undefined → คีย์ว่าง (myKey ว่าง → ของฉันไม่กรองมั่ว)', () => {
    expect(quoteSaleKey('')).toBe('');
    expect(quoteSaleKey(undefined)).toBe('');
    expect(quoteSaleKey(null)).toBe('');
  });
});

// ── meta-test: จุดเชื่อมต่อที่พังแล้วเงียบ ──────────────────────────────────
describe('จุดเชื่อมต่อ scopeMine / salesRep', () => {
  it('scopeMine เทียบด้วย quoteSaleKey ไม่ใช่ === ตรง ๆ', () => {
    // ต้องไม่กลับไปเทียบ (it.sale||"").trim() === myName ซึ่งพังกับอิโมจิ
    expect(VANA).toMatch(/quoteSaleKey\(it\.sale\)\s*===\s*myKey/);
    expect(VANA).not.toMatch(/\(it\.sale\s*\|\|\s*""\)\.trim\(\)\s*===\s*myName/);
  });

  it('มีแถบชวนกด "ทั้งหมด" เมื่อของฉันว่างแต่มีใบอยู่จริง (ไม่ให้ดูเหมือนแอปพัง)', () => {
    expect(VANA).toMatch(/mineEmptyHint/);
    expect(VANA).toMatch(/allPendingCount/);
    expect(VANA).toMatch(/allApprovedCount/);
  });

  it('ไม่มี ⭐ ของฉัน แต่มีปุ่ม 📋 ทั้งหมด เสมอ (ห้าม hard-restrict)', () => {
    expect(VANA).toMatch(/setMineOnly\(false\)/);
  });

  it('salesRep ห้าม fallback เป็น dmj_role (จะติด tag "saler" ปนกันทุกคน)', () => {
    const line = grab(QUOTE, /const salesRep = [^\n]*/, 'salesRep');
    expect(line).not.toMatch(/dmj_role/);
    // guard ที่บล็อกตอนไม่มีชื่อต้องยังอยู่ (ไม่งั้นสร้างใบไม่มีชื่อผู้ทำได้)
    expect(QUOTE).toMatch(/!salesRep\.trim\(\)[\s\S]{0,80}กรุณาล็อกอินใหม่/);
  });
});
