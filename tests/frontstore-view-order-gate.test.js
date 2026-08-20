// tests/frontstore-view-order-gate.test.js — เช็คหน้าร้าน (FrontStoreView, views-analytics.jsx)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026) 2 อย่างพร้อมกัน:
//   1. หมวด "อุปกรณ์สำนักงาน" อยู่หัวสุดของแถบชิปเสมอ (ของใช้ร่วมกันทั้งร้าน หยิบบ่อย)
//   2. บาร์ "🧹 ล้างค่านับเก่า" (ล้าง mismatch ที่นับได้ไม่ตรงระบบ) เหลือแค่ owner/dev
//      เห็น — ตำแหน่งอื่น (frontstore/saler/warehouse/employee) ห้ามเห็นปุ่มนี้เลย
//      ("ไม่ตรง" อาจเป็นของจริงที่ต้องรายงานเจ้าของก่อน ไม่ใช่แค่กดทิ้งแล้วนับใหม่)
//
// meta-test สแกนต้นทางจริง (เหมือน quote-saler-view / gasjson) — คุมจุดที่ "พังแล้วเงียบ":
// ปลดล็อกให้ role หนึ่งแล้วเผลอไม่กันตำแหน่งอื่น หรือแก้ CAT_ORDER ผิดตัวแปร (มี 2 ชุดคนละไฟล์
// — views-main.jsx ของ CategoryView กับ views-analytics.jsx ของ FrontStoreView คนละก้อนกัน)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grabFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา function ในต้นทางไม่เจอ: ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}
const FRONTSTORE = grabFn(VANA, 'FrontStoreView');

describe('FrontStoreView: หมวด "อุปกรณ์สำนักงาน" อยู่หัวสุดของ CAT_ORDER', () => {
  it('CAT_ORDER ขึ้นต้นด้วย "อุปกรณ์สำนักงาน"', () => {
    const m = FRONTSTORE.match(/const CAT_ORDER = \[([^\]]*)\];/);
    expect(m, 'ต้องเจอ CAT_ORDER ใน FrontStoreView').toBeTruthy();
    const list = m[1].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    expect(list[0]).toBe('อุปกรณ์สำนักงาน');
  });

  it('CAT_ORDER ยังมีหมวดเดิมครบ (ไม่ได้ลบอะไรทิ้งตอนแทรกหมวดใหม่)', () => {
    ['Realtouch', 'ดอกไม้', 'บูช', 'ไม้แซม', 'ดอกหญ้า', 'ใบ', 'ใบบูช', 'ใบไม้แขวน',
     'กิ่งไม้', 'กุหลาบหิน', 'ต้นไม้', 'แจกันแก้ว', 'เรซิ่น'].forEach(c => {
      expect(FRONTSTORE, `หมวด "${c}" หายไปจาก CAT_ORDER`).toContain(`"${c}"`);
    });
  });

  it('ตัวเรียง allCats ใช้ CAT_ORDER.indexOf จริง (ไม่ใช่ hard-code ลำดับแยกอีกที่)', () => {
    expect(FRONTSTORE).toMatch(/const ia = CAT_ORDER\.indexOf\(a\), ib = CAT_ORDER\.indexOf\(b\);/);
  });
});

describe('FrontStoreView: บาร์ "ล้างค่านับเก่า" เหลือแค่ owner/dev', () => {
  it('render gate มี role === "owner" คู่กับ mismatchSkus.length > 0', () => {
    expect(FRONTSTORE).toMatch(/\{role === "owner" && mismatchSkus\.length > 0 && \(/);
  });

  it('⚠️ ไม่มีจุดอื่นใน FrontStoreView ที่โชว์บาร์นี้แบบไม่กัน role (กันหลุดช่องทางสำรอง)', () => {
    // บล็อกเดียวที่ประกอบด้วย mismatchSkus.length > 0 ต้องมี role === "owner" กำกับเสมอ
    const renders = FRONTSTORE.match(/mismatchSkus\.length > 0 && \(/g) || [];
    const gated = FRONTSTORE.match(/role === "owner" && mismatchSkus\.length > 0 && \(/g) || [];
    expect(renders.length, 'ต้องมีจุดเรนเดอร์บาร์นี้อย่างน้อย 1 จุด').toBeGreaterThan(0);
    expect(gated.length, 'ทุกจุดที่โชว์บาร์ต้องกันด้วย role === "owner"').toBe(renders.length);
  });

  it('ปุ่มเปิด modal ตั้งค่า (owner/dev) ใน header ใช้ role === "owner" ตัวเดียวกัน (ยึด convention เดิม)', () => {
    // precedent ที่มีอยู่แล้วในไฟล์นี้ (ปุ่มสลับ ตรวจสต็อก/จัดซื้อ) — ยืนยันว่า role ที่ view นี้ได้รับ
    // คือ viewRole ที่ยุบ dev→owner มาแล้วจาก app.jsx (ไม่ต้องเช็ค "dev" แยก)
    expect(FRONTSTORE).toMatch(/\{role === "owner" && \(/);
  });
});
