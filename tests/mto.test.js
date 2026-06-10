// tests/mto.test.js — ทดสอบ netOf (pure logic จาก closeMtoJob, appsscript_complete.gs:3763)
import { describe, it, expect } from 'vitest';
import { netOf } from './helpers.js';

describe('netOf', () => {
  it('qty=10, returnedQty=3 → net=7', () => {
    expect(netOf({ qty: 10, returnedQty: 3 })).toBe(7);
  });

  it('qty=10, returnedQty=0 → net=10', () => {
    expect(netOf({ qty: 10, returnedQty: 0 })).toBe(10);
  });

  it('qty=10, returnedQty=10 → net=0 (คืนครบ)', () => {
    expect(netOf({ qty: 10, returnedQty: 10 })).toBe(0);
  });

  it('returnedQty > qty (over-return) → clamp เป็น qty, net=0', () => {
    expect(netOf({ qty: 10, returnedQty: 15 })).toBe(0);
  });

  it('returnedQty < 0 (ค่าติดลบ) → clamp เป็น 0, net=qty', () => {
    expect(netOf({ qty: 10, returnedQty: -5 })).toBe(10);
  });

  it('returnedQty=null → net=qty', () => {
    expect(netOf({ qty: 10, returnedQty: null })).toBe(10);
  });

  it('returnedQty=undefined → net=qty', () => {
    expect(netOf({ qty: 10, returnedQty: undefined })).toBe(10);
  });

  it('returnedQty=NaN → net=qty', () => {
    expect(netOf({ qty: 10, returnedQty: NaN })).toBe(10);
  });

  it('qty=0 → net=0 เสมอ', () => {
    expect(netOf({ qty: 0, returnedQty: 5 })).toBe(0);
  });

  it('qty=null → net=0', () => {
    expect(netOf({ qty: null, returnedQty: 0 })).toBe(0);
  });

  it('qty=undefined → net=0', () => {
    expect(netOf({ qty: undefined, returnedQty: 0 })).toBe(0);
  });
});
