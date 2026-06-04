// tests/conflict.test.js — ทดสอบ conflict detection logic
// shouldRejectConflict เป็น pure function copy จาก GAS shouldRejectConflict_
// ทดสอบแยกได้โดยไม่ต้องการ Google Apps Script environment
import { describe, it, expect } from 'vitest';
import { shouldRejectConflict } from './helpers.js';

describe('shouldRejectConflict', () => {
  it('pass เมื่อ sheet ไม่มีการเปลี่ยนแปลงหลัง client โหลด', () => {
    // sheetLastModified (900) < clientLoadedAt (1000) → ไม่มี conflict
    expect(shouldRejectConflict(1000, 900, 5000)).toBe(false);
  });

  it('reject เมื่อ sheet เปลี่ยนหลัง client โหลดเกิน slop', () => {
    // sheetLastModified (7000) - clientLoadedAt (1000) = 6000 > slopMs (5000) → reject
    expect(shouldRejectConflict(1000, 7000, 5000)).toBe(true);
  });

  it('pass เมื่ออยู่ใน slop window', () => {
    // sheetLastModified (3000) - clientLoadedAt (1000) = 2000 < slopMs (5000) → pass
    expect(shouldRejectConflict(1000, 3000, 5000)).toBe(false);
  });

  it('false เมื่อไม่มี clientLoadedAt (null)', () => {
    expect(shouldRejectConflict(null, 9000, 5000)).toBe(false);
  });

  it('false เมื่อไม่มี clientLoadedAt (undefined)', () => {
    expect(shouldRejectConflict(undefined, 9000, 5000)).toBe(false);
  });

  it('false เมื่อไม่มี clientLoadedAt (0)', () => {
    // 0 เป็น falsy → ถือว่าไม่มี clientLoadedAt
    expect(shouldRejectConflict(0, 9000, 5000)).toBe(false);
  });

  it('false เมื่อไม่มี sheetLastModified (null)', () => {
    expect(shouldRejectConflict(1000, null, 5000)).toBe(false);
  });

  it('false เมื่อไม่มี sheetLastModified (0)', () => {
    // getSheetLastModified_ คืน 0 เมื่อเกิด error → ไม่ reject
    expect(shouldRejectConflict(1000, 0, 5000)).toBe(false);
  });

  it('ใช้ default slop 5000ms เมื่อไม่ส่ง slopMs', () => {
    // 6001ms เกิน default 5000ms → reject
    expect(shouldRejectConflict(1000, 7001)).toBe(true);
  });

  it('pass ที่ขอบ slop window พอดี (sheetMod = clientAt + slopMs)', () => {
    // 1000 + 5000 = 6000, sheetMod = 6000 → ไม่เกิน (>) → pass
    expect(shouldRejectConflict(1000, 6000, 5000)).toBe(false);
  });

  it('reject ที่ขอบ slop window +1ms', () => {
    // sheetMod = 6001 > 1000 + 5000 = 6000 → reject
    expect(shouldRejectConflict(1000, 6001, 5000)).toBe(true);
  });

  it('clientLoadedAt เป็น string (มาจาก JSON.parse) แปลงเป็น number ได้', () => {
    // GAS รับ clientLoadedAt จาก POST body ซึ่งอาจเป็น string
    expect(shouldRejectConflict('1000', 7000, 5000)).toBe(true);
    expect(shouldRejectConflict('1000', 3000, 5000)).toBe(false);
  });
});
