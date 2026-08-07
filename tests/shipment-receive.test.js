// tests/shipment-receive.test.js — ช่อง "รับจริง" ในแท็บติดตามของ (ShipmentRow)
// ─────────────────────────────────────────────────────────────────────────────
// บั๊กที่เจอจริง (ส.ค. 2026): พนักงานหน้าร้านพิมพ์จำนวนรับจริงแล้วยอดที่บันทึกไม่ตรง
// สาเหตุ: ช่องกรอกพรีฟิลด้วยจำนวนที่ "ส่งมา" (เช่น 48) พอแตะแล้วพิมพ์ทับโดยไม่ได้เลือกเคลียร์
// ก่อน ตัวเลขจะไปต่อท้าย ("48" + "5" = "485") แทนที่จะแทนที่ — ตรงกับที่ OrderModal เคยแก้
// ด้วย `onFocus={ev => ev.target.select()}` ไปแล้ว (fsQty/qty ในไฟล์ views-main.jsx) แต่ยัง
// ไม่ได้ใส่ให้ช่อง recvQty ใน ShipmentRow (views-analytics.jsx)
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

describe('ShipmentRow — ช่องกรอกจำนวนรับจริง', () => {
  const fn = grab(VANA, /function ShipmentRow\(\{[\s\S]*?\n\}/, 'ShipmentRow');

  it('พรีฟิลด้วยจำนวนที่ส่งมา (s.qty) เมื่อยังไม่เคยยืนยันรับ', () => {
    expect(fn).toMatch(/uS\(\(\) => s\.receivedQty != null \? s\.receivedQty : \(s\.qty \|\| 0\)\)/);
  });

  it('เลือกข้อความทั้งหมดตอนแตะช่อง — กันพิมพ์ต่อท้ายเลขที่พรีฟิลไว้', () => {
    expect(fn).toMatch(/type="number" value=\{recvQty\}[^]*?onFocus=\{e => e\.target\.select\(\)\}/);
  });

  it('handleConfirm ส่งค่าจาก state ที่พิมพ์จริง (parseInt ของ recvQty) ไม่ใช่ s.qty เดิม', () => {
    expect(fn).toMatch(/const n = Math\.max\(0, ?parseInt\(recvQty\) \|\| 0\);/);
    expect(fn).toMatch(/onConfirm\(s, n\)/);
  });
});

describe('OrderItemRow — ช่องกรอกจำนวนที่จัด (พรีฟิลเหมือนกัน — บั๊กเดียวกันได้)', () => {
  const fn = grab(VANA, /function OrderItemRow\(\{[\s\S]*?\n\}/, 'OrderItemRow');

  it('พรีฟิลด้วยจำนวนที่สั่ง (order.orderQty) เมื่อยังไม่เคยจัด', () => {
    expect(fn).toMatch(/order\.preparedQty > 0 \? order\.preparedQty : \(order\.orderQty \|\| 0\)/);
  });

  it('เลือกข้อความทั้งหมดตอนแตะช่องจัด — กันพิมพ์ต่อท้ายเลขที่พรีฟิลไว้', () => {
    expect(fn).toMatch(/type="number" value=\{prepQtyDraft\}[^]*?onFocus=\{e => e\.target\.select\(\)\}/);
  });
});
