// tests/mto.test.js — ทดสอบ netOf (pure logic จาก closeMtoJob, appsscript_complete.gs:3763)
import { describe, it, expect } from 'vitest';
import { netOf, writeMtoItemsCore } from './helpers.js';

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

// ทดสอบ flow ใหม่: ปุ่ม "บันทึก" (draft) → ปุ่ม "ปิดงาน" ต้องไม่ทำให้วัตถุดิบซ้ำ
describe('writeMtoItemsCore — บันทึก draft แล้วปิดงาน', () => {
  const HEADER = ['jobId', 'sku', 'name', 'qty', 'warehouse', 'returnedQty', 'net', 'closedAt'];
  const items1 = [{ sku: 'A1', name: 'แจกัน', qty: 5, warehouse: 'warehouse', returnedQty: 0 }];

  it('บันทึก draft ครั้งแรก → ได้ 1 แถว closedAt ว่าง', () => {
    const rows = writeMtoItemsCore([HEADER], 'MTO_1', items1, '');
    const dataRows = rows.slice(1);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0][7]).toBe('');            // closedAt ว่าง = draft
    expect(dataRows[0][6]).toBe(5);             // net = 5
  });

  it('บันทึก draft ซ้ำ → ไม่สะสมแถว (แทนที่ของเดิม)', () => {
    let rows = writeMtoItemsCore([HEADER], 'MTO_1', items1, '');
    rows = writeMtoItemsCore(rows, 'MTO_1', [{ sku: 'A1', qty: 8, returnedQty: 1 }], '');
    const dataRows = rows.slice(1);
    expect(dataRows).toHaveLength(1);           // ยังมีแถวเดียว
    expect(dataRows[0][3]).toBe(8);             // qty อัปเดตเป็น 8
    expect(dataRows[0][6]).toBe(7);             // net = 8-1
  });

  it('บันทึก draft → ปิดงาน → มีแค่แถว closed ไม่ซ้ำ (บั๊กที่แก้)', () => {
    let rows = writeMtoItemsCore([HEADER], 'MTO_1', items1, '');       // กดบันทึก
    rows = writeMtoItemsCore(rows, 'MTO_1', items1, '08/06/2026 10:00'); // กดปิดงาน
    const dataRows = rows.slice(1);
    expect(dataRows).toHaveLength(1);           // ไม่ซ้ำเป็น 2
    expect(dataRows[0][7]).toBe('08/06/2026 10:00'); // closedAt ถูกเขียน
  });

  it('ปิดงานเลยโดยไม่กดบันทึก → 1 แถว closed', () => {
    const rows = writeMtoItemsCore([HEADER], 'MTO_1', items1, '08/06/2026 10:00');
    expect(rows.slice(1)).toHaveLength(1);
  });

  it('job อื่นที่ปิดแล้วต้องไม่ถูกแตะ', () => {
    let rows = [HEADER, ['MTO_0', 'X', 'เก่า', 3, 'warehouse', 0, 3, '01/06/2026 09:00']];
    rows = writeMtoItemsCore(rows, 'MTO_1', items1, '');   // บันทึก draft ของ MTO_1
    rows = writeMtoItemsCore(rows, 'MTO_1', items1, '08/06/2026 10:00'); // ปิด MTO_1
    const dataRows = rows.slice(1);
    expect(dataRows).toHaveLength(2);           // MTO_0 (closed) + MTO_1 (closed)
    expect(dataRows.find(r => r[0] === 'MTO_0')[7]).toBe('01/06/2026 09:00'); // ของเดิมไม่หาย
  });
});
