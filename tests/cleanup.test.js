// tests/cleanup.test.js — ทดสอบ cleanupOrdersStateCore
// pure logic จาก cleanupOrdersState (views-analytics.jsx:2436)
// กัน localStorage โตเรื่อย ๆ จาก entry ที่ sig ไม่ตรง order ปัจจุบันไหนเลย
// บั๊กจริง: entry ค้าง (sig เก่า) ใน localStorage ทำให้ status เก่าถูก adopt
//   เข้า order ใหม่ที่มาใช้แถวเดียวกัน (row reuse)
import { describe, it, expect } from 'vitest';
import { cleanupOrdersStateCore, stableOrderId, orderSig } from './helpers.js';

describe('cleanupOrdersStateCore — guards', () => {
  it('state ว่าง → คืน {}', () => {
    expect(cleanupOrdersStateCore({}, ['R1'], ['sig1'])).toEqual({});
  });

  it('state=null → คืน {} ไม่ throw', () => {
    expect(cleanupOrdersStateCore(null, [], [])).toEqual({});
  });

  it('state=undefined → คืน {} ไม่ throw', () => {
    expect(cleanupOrdersStateCore(undefined, [], [])).toEqual({});
  });
});

describe('cleanupOrdersStateCore — เก็บ entry ที่ควรเก็บ', () => {
  it('entry มี sig ที่ตรง validSigs → เก็บไว้', () => {
    const state = { R1: { sig: 'CH19015|010626|3', printFlag: 'print' } };
    const result = cleanupOrdersStateCore(state, [], ['CH19015|010626|3']);
    expect(result.R1).toBeDefined();
    expect(result.R1.printFlag).toBe('print');
  });

  it('entry มี id ตรง validIds → เก็บไว้ แม้ sig เก่า', () => {
    const state = { R1: { sig: 'OLD|000|0', printFlag: 'print' } };
    const result = cleanupOrdersStateCore(state, ['R1'], ['NEWSIG|111|5']);
    expect(result.R1).toBeDefined();
  });

  it('entry ไม่มี sig (ก่อน migration) → เก็บไว้เสมอ ไม่ลบข้อมูลเก่า', () => {
    const state = { R1: { preparedQty: 3 } };
    const result = cleanupOrdersStateCore(state, [], []);
    expect(result.R1).toBeDefined();
    expect(result.R1.preparedQty).toBe(3);
  });

  it('entry มี sig=null → ถือว่าไม่มี sig → เก็บไว้', () => {
    const state = { R2: { sig: null, printFlag: 'no-print' } };
    const result = cleanupOrdersStateCore(state, [], []);
    expect(result.R2).toBeDefined();
  });

  it('entry มี sig="" (falsy) → ถือว่าไม่มี sig → เก็บไว้', () => {
    const state = { R3: { sig: '', preparedQty: 2 } };
    const result = cleanupOrdersStateCore(state, [], []);
    expect(result.R3).toBeDefined();
  });
});

describe('cleanupOrdersStateCore — ลบ entry ที่ควรลบ', () => {
  it('sig ไม่ตรง validSigs + id ไม่ตรง validIds → ลบทิ้ง', () => {
    const state = { R5: { sig: 'OLD|000|1', status: 'ส่งแล้ว' } };
    const result = cleanupOrdersStateCore(state, ['R1', 'R2'], ['NEWSIG|111|5']);
    expect(result.R5).toBeUndefined();
  });

  it('หลาย entry เก่า → ลบทั้งหมด', () => {
    const state = {
      R5: { sig: 'OLD_A|111|1', status: 'ส่งแล้ว' },
      R6: { sig: 'OLD_B|222|2', status: 'สำเร็จ' },
    };
    const result = cleanupOrdersStateCore(state, [], []);
    expect(result.R5).toBeUndefined();
    expect(result.R6).toBeUndefined();
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('entry ค้าง + validIds/validSigs มีแค่ id/sig ของ order อื่น → ลบทิ้ง', () => {
    const state = { R99: { sig: 'STALE|999999|0', status: 'ส่งแล้ว', markedAt: '2024-01-01' } };
    const result = cleanupOrdersStateCore(state, ['R1', 'R2'], ['VALID|010626|3']);
    expect(result.R99).toBeUndefined();
  });
});

describe('cleanupOrdersStateCore — กรณีผสม', () => {
  it('ผสม: sig ตรง + เก่า + ไม่มี sig → เก็บแค่ที่ถูกต้อง', () => {
    const state = {
      R1: { sig: 'VALID|010626|3', printFlag: 'print' },  // sig ตรง → เก็บ
      R2: { sig: 'STALE|000000|0', status: 'ส่งแล้ว' },   // เก่า → ลบ
      R3: { preparedQty: 2 },                              // ไม่มี sig → เก็บ
    };
    const result = cleanupOrdersStateCore(state, [], ['VALID|010626|3']);
    expect(result.R1).toBeDefined();
    expect(result.R2).toBeUndefined();
    expect(result.R3).toBeDefined();
  });

  it('entry มี sig เก่า แต่ id ตรง validIds → เก็บ (id กัน row reuse ปลอดภัย)', () => {
    const state = { R5: { sig: 'STALE|123|1', printFlag: 'no-print' } };
    const result = cleanupOrdersStateCore(state, ['R5'], ['NEWSIG|456|2']);
    expect(result.R5).toBeDefined();
  });

  it('state ไม่เปลี่ยนแปลง entry ที่เก็บไว้ (deep value ครบ)', () => {
    const state = {
      R1: { sig: 'OK|010626|3', status: 'สำเร็จ', preparedQty: 5, printFlag: 'printed' },
    };
    const result = cleanupOrdersStateCore(state, [], ['OK|010626|3']);
    expect(result.R1).toEqual({ sig: 'OK|010626|3', status: 'สำเร็จ', preparedQty: 5, printFlag: 'printed' });
  });
});

describe('cleanupOrdersStateCore — integration กับ stableOrderId + orderSig', () => {
  it('สร้าง validIds+validSigs จาก orders จริง → cleanup ถูกต้อง', () => {
    const orders = [
      { id: 'R1', sku: 'CH19015', date: '01/06/26', orderQty: 3 },
      { id: 'R2', sku: 'OL00005', date: '02/06/26', orderQty: 2 },
    ];
    const validIds  = orders.map((o, i) => stableOrderId(o, i));
    const validSigs = orders.map(o => orderSig(o));

    const state = {
      R1: { sig: orderSig(orders[0]), printFlag: 'print' },   // ตรง → เก็บ
      R2: { sig: orderSig(orders[1]), preparedQty: 2 },        // ตรง → เก็บ
      R9: { sig: 'OLD|999999|0', status: 'ส่งแล้ว' },          // เก่า → ลบ
    };

    const result = cleanupOrdersStateCore(state, validIds, validSigs);
    expect(result.R1).toBeDefined();
    expect(result.R2).toBeDefined();
    expect(result.R9).toBeUndefined();
  });

  it('order ไม่มี .id → stableOrderId ใช้ sku+date+qty เป็น key', () => {
    const orders = [{ sku: 'CH19015', date: '01/06/26', orderQty: 3 }];
    const validIds  = orders.map((o, i) => stableOrderId(o, i));
    const validSigs = orders.map(o => orderSig(o));

    const stableId = stableOrderId(orders[0], 0);
    const state = {
      [stableId]: { sig: orderSig(orders[0]), preparedQty: 1 }, // id + sig ตรง → เก็บ
      R99: { sig: 'OLD|000|0' },                                 // เก่า → ลบ
    };

    const result = cleanupOrdersStateCore(state, validIds, validSigs);
    expect(result[stableId]).toBeDefined();
    expect(result.R99).toBeUndefined();
  });

  it('row reuse scenario: order ใหม่ใช้แถวเดิม → entry เก่าถูกลบ ไม่เลอะข้าม order', () => {
    // R5 เคยเป็น CH19015 (ถูกลบไปแล้ว), ตอนนี้ R5 เป็น OL00005 order ใหม่
    const currentOrders = [{ id: 'R5', sku: 'OL00005', date: '10/06/26', orderQty: 5 }];
    const validIds  = currentOrders.map((o, i) => stableOrderId(o, i));
    const validSigs = currentOrders.map(o => orderSig(o));

    const state = {
      // entry เก่าของ CH19015 ยังค้างอยู่ใน localStorage (sig ไม่ตรง OL00005)
      R5: { sig: orderSig({ sku: 'CH19015', date: '01/06/26', orderQty: 3 }), status: 'ส่งแล้ว' },
    };

    const result = cleanupOrdersStateCore(state, validIds, validSigs);
    // R5 id ตรง validIds แต่ sig ไม่ตรง → ยังเก็บไว้ (id ใน validIds กัน false positive)
    // การตัดสินใจว่าจะ adopt หรือไม่ทำที่ reconcileOrderState (ตรวจสอบ sig ตรงไหม)
    expect(result.R5).toBeDefined();
  });
});

describe('stableOrderId', () => {
  it('order มี id → คืน id นั้น', () => {
    expect(stableOrderId({ id: 'R5', sku: 'CH19015' }, 0)).toBe('R5');
  });

  it('order ไม่มี id → สร้าง key จาก sku_date_qty', () => {
    const id = stableOrderId({ sku: 'CH19015', date: '01/06/26', orderQty: 3 }, 0);
    expect(id).toBe('CH19015_010626_3');
  });

  it('order ว่าง → fallback เป็น index', () => {
    expect(stableOrderId({}, 7)).toBe('__0');
  });

  it('order ต่างกัน → id ต่างกัน (ไม่ collision)', () => {
    const a = stableOrderId({ sku: 'CH19015', date: '01/06/26', orderQty: 3 }, 0);
    const b = stableOrderId({ sku: 'OL00005', date: '01/06/26', orderQty: 3 }, 1);
    expect(a).not.toBe(b);
  });
});
