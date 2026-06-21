// tests/transfer.test.js — ทดสอบ transferBatchCore
// pure logic จาก transferStockBatch (appsscript_complete.gs:736)
// แยก Sheet I/O / LockService / CacheService / ZORT / Audit log ออก
// ทดสอบ: ตรรกะโอน, shortfall, idempotency, batch หลายรายการ
import { describe, it, expect } from 'vitest';
import { transferBatchCore, COL_PROD_SKU, COL_PROD_QTYFS, COL_PROD_QTYWH } from './helpers.js';

// COL_PROD_SKU=2 → idx 1 (col B), COL_PROD_QTYFS=7 → idx 6 (col G), COL_PROD_QTYWH=8 → idx 7 (col H)
function makeRow(sku, name, fsQty, whQty) {
  const row = new Array(10).fill(0);
  row[COL_PROD_SKU   - 1] = sku;
  row[2]                   = name;
  row[COL_PROD_QTYFS - 1] = fsQty;
  row[COL_PROD_QTYWH - 1] = whQty;
  return row;
}
const HEADER = new Array(10).fill('hdr');

describe('transferBatchCore — guards', () => {
  it('list ว่าง → คืน error', () => {
    const r = transferBatchCore([HEADER], [], []);
    expect(r.error).toBeTruthy();
    expect(r.results).toBeUndefined();
  });

  it('item ที่ sku ว่าง → skipped', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results } = transferBatchCore(d, [{ sku: '', qty: 3 }], []);
    expect(results[0].skipped).toBe(true);
  });

  it('item ที่ qty=0 → skipped', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results } = transferBatchCore(d, [{ sku: 'CH19015', qty: 0 }], []);
    expect(results[0].skipped).toBe(true);
  });

  it('item ที่ qty ติดลบ → skipped', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results } = transferBatchCore(d, [{ sku: 'CH19015', qty: -5 }], []);
    expect(results[0].skipped).toBe(true);
  });
});

describe('transferBatchCore — โอนปกติ', () => {
  it('whQty พอ → actual=qty, newWH ลด, newFS เพิ่ม', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results, transferred } = transferBatchCore(d, [{ sku: 'CH19015', qty: 3 }], []);
    expect(results[0]).toMatchObject({ sku: 'CH19015', requested: 3, transferred: 3, newWH: 7, newFS: 8 });
    expect(transferred).toHaveLength(1);
    expect(transferred[0]).toMatchObject({ sku: 'CH19015', qty: 3 });
  });

  it('SKU lowercase ใน list → หาแถว uppercase ในชีตได้ (case-insensitive)', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 0, 10)];
    const { results } = transferBatchCore(d, [{ sku: 'ch19015', qty: 2 }], []);
    expect(results[0].transferred).toBe(2);
    expect(results[0].sku).toBe('CH19015');
  });

  it('SKU ไม่อยู่ในชีต → notFound', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results } = transferBatchCore(d, [{ sku: 'OL99999', qty: 3 }], []);
    expect(results[0].notFound).toBe(true);
    expect(results[0].transferred).toBeUndefined();
  });

  it('item.name ว่าง → fallback ชื่อจากชีต (col C)', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกันทอง', 0, 10)];
    const { transferred } = transferBatchCore(d, [{ sku: 'CH19015', qty: 1 }], []);
    expect(transferred[0].name).toBe('แจกันทอง');
  });

  it('item.name ระบุมา → ใช้ชื่อจาก item ไม่ใช้จากชีต', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกันทอง', 0, 10)];
    const { transferred } = transferBatchCore(d, [{ sku: 'CH19015', qty: 1, name: 'ชื่อ override' }], []);
    expect(transferred[0].name).toBe('ชื่อ override');
  });
});

describe('transferBatchCore — shortfall (คลังไม่พอ)', () => {
  it('qty > whQty → actual=whQty, shortfall ถูก report', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 3)];
    const { results, shortfalls } = transferBatchCore(d, [{ sku: 'CH19015', qty: 10 }], []);
    expect(results[0].transferred).toBe(3);
    expect(results[0].newWH).toBe(0);
    expect(results[0].newFS).toBe(8);     // 5 + 3
    expect(shortfalls).toHaveLength(1);
    expect(shortfalls[0]).toMatchObject({ requested: 10, transferred: 3 });
  });

  it('whQty=0 → actual=0, shortfall=qty ทั้งหมด, transferred ไม่มี entry', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 0)];
    const { results, transferred, shortfalls } = transferBatchCore(
      d, [{ sku: 'CH19015', qty: 5 }], []
    );
    expect(results[0].transferred).toBe(0);
    expect(results[0].newWH).toBe(0);
    expect(results[0].newFS).toBe(5);     // fs ไม่เปลี่ยน
    expect(transferred).toHaveLength(0);
    expect(shortfalls[0]).toMatchObject({ requested: 5, transferred: 0 });
  });

  it('qty พอดี whQty → actual=qty, ไม่มี shortfall', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 0, 5)];
    const { results, shortfalls } = transferBatchCore(d, [{ sku: 'CH19015', qty: 5 }], []);
    expect(results[0].transferred).toBe(5);
    expect(shortfalls).toHaveLength(0);
  });
});

describe('transferBatchCore — idempotency', () => {
  it('orderId อยู่ใน alreadyProcessedIds → duplicate, ไม่โอน', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results, transferred } = transferBatchCore(
      d, [{ sku: 'CH19015', qty: 3, orderId: 'R5' }], ['R5']
    );
    expect(results[0].duplicate).toBe(true);
    expect(transferred).toHaveLength(0);
  });

  it('orderId ไม่ได้อยู่ใน alreadyProcessedIds → โอนปกติ และเพิ่มเข้า newIdempotency', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 10)];
    const { results, newIdempotency } = transferBatchCore(
      d, [{ sku: 'CH19015', qty: 3, orderId: 'R5' }], []
    );
    expect(results[0].transferred).toBe(3);
    expect(newIdempotency).toContain('R5');
  });

  it('whQty=0 (actual=0) → ไม่เพิ่ม orderId เข้า newIdempotency (ส่งไม่ได้ = ไม่นับว่าประมวลแล้ว)', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 5, 0)];
    const { newIdempotency } = transferBatchCore(
      d, [{ sku: 'CH19015', qty: 3, orderId: 'R5' }], []
    );
    expect(newIdempotency).not.toContain('R5');
  });

  it('item ไม่มี orderId → ไม่เพิ่มอะไรเข้า newIdempotency', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 0, 10)];
    const { newIdempotency } = transferBatchCore(d, [{ sku: 'CH19015', qty: 3 }], []);
    expect(newIdempotency).toHaveLength(0);
  });
});

describe('transferBatchCore — batch หลายรายการ', () => {
  it('สอง SKU ต่างกัน → ผลลัพธ์แยกกัน ถูกต้องทั้งคู่', () => {
    const d = [HEADER, makeRow('AA001', 'ก', 0, 10), makeRow('BB002', 'ข', 0, 5)];
    const { results, transferred } = transferBatchCore(
      d,
      [{ sku: 'AA001', qty: 2 }, { sku: 'BB002', qty: 3 }],
      []
    );
    expect(results).toHaveLength(2);
    expect(transferred).toHaveLength(2);
    expect(results[0]).toMatchObject({ sku: 'AA001', transferred: 2 });
    expect(results[1]).toMatchObject({ sku: 'BB002', transferred: 3 });
  });

  it('SKU เดียวกัน สอง item → item ที่ 2 เห็น whQty ที่อัปเดตจาก item แรก', () => {
    const d = [HEADER, makeRow('CH19015', 'แจกัน', 0, 5)];
    const { results } = transferBatchCore(
      d,
      [{ sku: 'CH19015', qty: 4 }, { sku: 'CH19015', qty: 4 }],
      []
    );
    expect(results[0].transferred).toBe(4); // ได้ครบ (whQty=5)
    expect(results[1].transferred).toBe(1); // เหลือแค่ 1
    expect(results[1].newWH).toBe(0);
  });

  it('item แรก notFound ไม่กระทบ item ที่ 2', () => {
    const d = [HEADER, makeRow('BB002', 'ข', 0, 10)];
    const { results } = transferBatchCore(
      d,
      [{ sku: 'NOTEXIST', qty: 3 }, { sku: 'BB002', qty: 2 }],
      []
    );
    expect(results[0].notFound).toBe(true);
    expect(results[1].transferred).toBe(2);
  });

  it('item แรก duplicate ไม่กระทบ item ที่ 2', () => {
    const d = [HEADER, makeRow('AA001', 'ก', 0, 10), makeRow('BB002', 'ข', 0, 5)];
    const { results } = transferBatchCore(
      d,
      [{ sku: 'AA001', qty: 2, orderId: 'R5' }, { sku: 'BB002', qty: 3, orderId: 'R6' }],
      ['R5']
    );
    expect(results[0].duplicate).toBe(true);
    expect(results[1].transferred).toBe(3);
  });

  it('ผสม: skipped + notFound + shortfall + success ใน batch เดียว', () => {
    const d = [HEADER, makeRow('GOOD', 'ของดี', 0, 10), makeRow('LOW', 'ของน้อย', 0, 1)];
    const { results, transferred, shortfalls } = transferBatchCore(
      d,
      [
        { sku: '', qty: 5 },           // skipped
        { sku: 'NOTHERE', qty: 3 },    // notFound
        { sku: 'LOW', qty: 5 },        // shortfall
        { sku: 'GOOD', qty: 3 },       // success
      ],
      []
    );
    expect(results[0].skipped).toBe(true);
    expect(results[1].notFound).toBe(true);
    expect(results[2].transferred).toBe(1);
    expect(shortfalls).toHaveLength(1);
    expect(results[3].transferred).toBe(3);
    expect(transferred).toHaveLength(2);
  });
});
