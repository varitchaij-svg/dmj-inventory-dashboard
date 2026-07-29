// tests/permissions.test.js
// ─────────────────────────────────────────────────────────────────────────────
// เฟส 4 ล็อกอิน: บังคับสิทธิ์ฝั่ง server สำหรับ action ที่กระทบเงิน/สต็อกจริง
// (approveQuotation/voidQuotation, deleteOrder(s), zeroStock, resetNegativeStock,
// issueFullTaxInvoice) — เดิม endpoint พวกนี้ไม่เช็คสิทธิ์อะไรเลย (หรือเช็คจาก data.role
// ที่ client ส่งมาเอง ปลอมได้จาก DevTools) ตอนนี้ role ที่เชื่อได้ต้องมาจาก session
// (server-verified) เท่านั้น
//
//   canDo       — ใช้กับ action ที่มี legitimate caller จาก UI จริง (ต้อง migration-safe:
//                 ไม่มี session แล้วยัง "ปล่อยผ่านเหมือนเดิม" จนกว่าจะเปิด REQUIRE_LOGIN)
//   canDoStrict — ใช้กับ action ที่ไม่มี caller จาก UI เลย (resetNegativeStock, zeroStock)
//                 เดิม deny-by-default อยู่แล้ว ต้องไม่มี fallback ที่ทำให้กลายเป็นอนุญาต
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { canDo, canDoStrict } from './helpers.js';

const sess = (role, status = 'active') => ({ role, status });

describe('canDo — action ที่มี caller จาก UI จริง (migration-safe)', () => {
  it('session role อยู่ใน allowedRoles → อนุญาต', () => {
    expect(canDo(sess('saler'), ['owner', 'dev', 'saler'], false)).toBe(true);
  });

  it('session role ไม่อยู่ใน allowedRoles → ปฏิเสธ แม้ REQUIRE_LOGIN ปิดอยู่', () => {
    expect(canDo(sess('frontstore'), ['owner', 'dev', 'employee', 'warehouse'], false)).toBe(false);
  });

  it('session role ไม่อยู่ใน allowedRoles → ปฏิเสธเสมอ ไม่ว่า REQUIRE_LOGIN จะเปิดหรือปิด', () => {
    expect(canDo(sess('frontstore'), ['owner', 'dev'], false)).toBe(false);
    expect(canDo(sess('frontstore'), ['owner', 'dev'], true)).toBe(false);
  });

  it('ไม่มี session (เครื่องเก่ายังไม่ได้ล็อกอิน LINE) + REQUIRE_LOGIN ปิด → ปล่อยผ่าน (migration fallback)', () => {
    expect(canDo(null, ['owner', 'dev'], false)).toBe(true);
  });

  it('ไม่มี session + REQUIRE_LOGIN เปิดแล้ว → ปฏิเสธ', () => {
    expect(canDo(null, ['owner', 'dev'], true)).toBe(false);
  });

  it('session ถูก revoke/ระงับ (status ไม่ใช่ active) → ถือเหมือนไม่มี session', () => {
    expect(canDo(sess('owner', 'pending'), ['owner'], false)).toBe(true);   // migration fallback ใช้ได้
    expect(canDo(sess('owner', 'pending'), ['owner'], true)).toBe(false);  // REQUIRE_LOGIN เปิด → ปฏิเสธ
  });

  it('dev มีสิทธิ์เท่า owner ทุก action ที่ owner ทำได้ (ต้องอยู่ใน allowedRoles ด้วยเสมอ)', () => {
    expect(canDo(sess('dev'), ['owner', 'dev'], false)).toBe(true);
  });
});

describe('canDoStrict — action ที่ไม่มี caller จาก UI เลย (deny-by-default)', () => {
  it('session role อยู่ใน allowedRoles → อนุญาต', () => {
    expect(canDoStrict(sess('owner'), ['owner', 'dev'])).toBe(true);
  });

  it('session role ไม่อยู่ใน allowedRoles → ปฏิเสธ', () => {
    expect(canDoStrict(sess('saler'), ['owner', 'dev'])).toBe(false);
  });

  it('ไม่มี session → ปฏิเสธเสมอ (ไม่มี migration fallback ต่างจาก canDo)', () => {
    expect(canDoStrict(null, ['owner', 'dev'])).toBe(false);
  });

  it('session หมดอายุ/ถูก revoke (status ไม่ใช่ active) → ปฏิเสธ', () => {
    expect(canDoStrict(sess('owner', 'disabled'), ['owner', 'dev'])).toBe(false);
  });

  it('resetNegativeStock/zeroStock ที่ไม่มี caller เลยวันนี้ → ปฏิเสธไม่ว่ากรณีใด (ไม่มี session ทั้งนั้น)', () => {
    // เดิม endpoint นี้เช็ค data.role ที่ไม่มีใครส่งมา = deny เสมออยู่แล้ว
    // canDoStrict ต้องรักษาพฤติกรรม deny-by-default นี้ไว้ ไม่ใช่เปิดช่องให้ผ่านตอนไม่มี session
    expect(canDoStrict(null, ['owner', 'dev'])).toBe(false);
    expect(canDoStrict(null, ['owner', 'dev', 'warehouse'])).toBe(false);
  });
});
