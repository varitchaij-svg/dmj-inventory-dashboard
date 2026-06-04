// tests/orderstate.test.js — ทดสอบ reconcile localStorage state กับ order
// ต้นตอบั๊ก: localStorage key = เลขแถว (R5/R6) ถูก reuse เมื่อ order เก่าถูกลบ
// → state เก่า "ส่งแล้ว" เลอะมาทับ order ใหม่ที่ status="รอ" → order หายจากหน้าจอ
// แก้ด้วยการผูก state เข้ากับ orderSig (content signature) แทนเลขแถว
import { describe, it, expect } from 'vitest';
import { orderSig, reconcileOrderState } from './helpers.js';

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // เวลาอ้างอิงคงที่สำหรับเทสต์

describe('orderSig', () => {
  it('สร้าง signature จาก sku|date(digits)|orderQty', () => {
    expect(orderSig({ sku: 'CH19015', date: '01/06/26', orderQty: 3 }))
      .toBe('CH19015|010626|3');
  });

  it('normalize sku (trim + uppercase) และตัดอักขระไม่ใช่ตัวเลขออกจาก date', () => {
    expect(orderSig({ sku: ' ch19015 ', date: '1-6-2026', orderQty: 2 }))
      .toBe('CH19015|162026|2');
  });

  it('order ต่างกัน → sig ต่างกัน (กัน collision)', () => {
    const a = orderSig({ sku: 'CH19015', date: '01/06/26', orderQty: 3 });
    const b = orderSig({ sku: 'OL00005', date: '01/06/26', orderQty: 3 });
    expect(a).not.toBe(b);
  });

  it('order ว่าง/undefined → คืน empty string ไม่ throw', () => {
    expect(orderSig(null)).toBe('');
    expect(orderSig({})).toBe('||0');
  });
});

describe('reconcileOrderState', () => {
  it('ไม่มี local state → คืน {} (ไม่ apply อะไร)', () => {
    const o = { sku: 'CH19015', date: '01/06/26', orderQty: 3, status: 'รอ' };
    expect(reconcileOrderState(o, undefined, NOW)).toEqual({});
    expect(reconcileOrderState(o, {}, NOW)).toEqual({});
  });

  // ── กรณีต้นตอบั๊ก: row reuse (sig ของ local ไม่ตรง order ปัจจุบัน) ──────────
  it('row reuse: local มี sig ของ order อื่น → ทิ้งทั้งหมด (order ใหม่ status="รอ" ไม่ถูกซ่อน)', () => {
    const newOrder = { sku: 'CH19015', date: '02/06/26', orderQty: 3, status: 'รอ' };
    const staleLocal = {
      status: 'ส่งแล้ว',
      sig: orderSig({ sku: 'OLD999', date: '01/01/26', orderQty: 1 }),
      markedAt: new Date(NOW - HOUR).toISOString(), // เพิ่งกด แต่เป็นคนละ order
    };
    expect(reconcileOrderState(newOrder, staleLocal, NOW)).toEqual({});
  });

  // ── auto-heal: ข้อมูลเก่าก่อน migration (ไม่มี sig) ──────────────────────
  it('ไม่มี sig + sheet บอก "รอ" + local terminal → ทิ้ง status/markedAt/shipped (auto-heal)', () => {
    const o = { sku: 'OL00005', date: '01/06/26', orderQty: 2, status: 'รอ' };
    const legacyLocal = { status: 'ส่งแล้ว', markedAt: new Date(NOW - HOUR).toISOString(), preparedQty: 2 };
    const r = reconcileOrderState(o, legacyLocal, NOW);
    expect(r.status).toBeUndefined();
    expect(r.markedAt).toBeUndefined();
    expect(r.preparedQty).toBe(2); // field อื่นเก็บไว้
  });

  it('ไม่มี sig + sheet "" (pending) + local "สำเร็จ" → ทิ้ง terminal status', () => {
    const o = { sku: 'OL00005', date: '01/06/26', orderQty: 2, status: '' };
    const legacyLocal = { status: 'สำเร็จ', markedAt: new Date(NOW - HOUR).toISOString() };
    expect(reconcileOrderState(o, legacyLocal, NOW).status).toBeUndefined();
  });

  // ── sig ตรง (order เดียวกันจริง) → optimistic UI ภายใน 6 ชม. ─────────────
  it('sig ตรง + เพิ่งกด < 6 ชม. → เก็บ local "ส่งแล้ว" (optimistic ตอน GAS cache ยังไม่ sync)', () => {
    const o = { sku: 'CH19015', date: '01/06/26', orderQty: 3, status: 'รอ' };
    const local = { status: 'ส่งแล้ว', sig: orderSig(o), markedAt: new Date(NOW - 2 * HOUR).toISOString() };
    expect(reconcileOrderState(o, local, NOW).status).toBe('ส่งแล้ว');
  });

  it('sig ตรง + กดไปแล้ว > 6 ชม. → ทิ้ง terminal status (sheet authoritative)', () => {
    const o = { sku: 'CH19015', date: '01/06/26', orderQty: 3, status: 'รอ' };
    const local = { status: 'ส่งแล้ว', sig: orderSig(o), markedAt: new Date(NOW - 7 * HOUR).toISOString() };
    expect(reconcileOrderState(o, local, NOW).status).toBeUndefined();
  });

  it('sig ตรง + ไม่มี markedAt → ถือว่าไม่ recent → ทิ้ง terminal status', () => {
    const o = { sku: 'CH19015', date: '01/06/26', orderQty: 3, status: 'รอ' };
    const local = { status: 'ส่งแล้ว', sig: orderSig(o) };
    expect(reconcileOrderState(o, local, NOW).status).toBeUndefined();
  });

  // ── sheet ไม่ใช่ pending → apply local ตามปกติ ──────────────────────────
  it('sheet "สำเร็จ" (ไม่ pending) + sig ตรง → apply local ตามปกติ', () => {
    const o = { sku: 'CH19015', date: '01/06/26', orderQty: 3, status: 'สำเร็จ' };
    const local = { status: 'ส่งแล้ว', sig: orderSig(o), markedAt: new Date(NOW - 10 * HOUR).toISOString() };
    expect(reconcileOrderState(o, local, NOW).status).toBe('ส่งแล้ว');
  });

  it('local status non-terminal (เช่น preparedQty) + sheet pending → apply ได้ปกติ', () => {
    const o = { sku: 'CH19015', date: '01/06/26', orderQty: 3, status: 'รอ' };
    const local = { preparedQty: 3, sig: orderSig(o) };
    expect(reconcileOrderState(o, local, NOW)).toEqual({ preparedQty: 3, sig: orderSig(o) });
  });
});
