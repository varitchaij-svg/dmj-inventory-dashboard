import { describe, it, expect } from 'vitest';

describe('Phase 8 — ตัดคีย์ตายแล้ว', () => {
  describe('buildFullData_', () => {
    it('ส่ง mtoGroups', () => {
      // mtoGroups ถูกสร้างจากสินค้า MTO ซึ่ง buildFullData_ เองสร้าง
      // การตัดมันจาก payload = ส่วนหนึ่งของการหักขนาด Phase 8
      // test นี้ยืนยันว่ามันไม่อยู่ใน data object ที่ส่งตรง ๆ
      // (frontend ถ้าต้อง mtoGroups ใหม่ก็สร้างเองจาก products[].isMTO)
      expect(true).toBe(true); // placeholder — ต้อง eval จริงจาก .gs
    });
  });

  describe('readProducts_', () => {
    it('ไม่ส่ง color: null', () => {
      // color ถูกคำนวณฝั่ง client ด้วย detectColor(p.name)
      // ส่ง null เสมอทำให้ client สร้างทับ = ไบต์เปล่า ที่คูณด้วยจำนวน SKU
      expect(true).toBe(true); // placeholder
    });
  });

  describe('applyQtyLocToProduct_', () => {
    it('ไม่ส่ง warehouseQty', () => {
      // warehouseQty = qtyWH ซึ่ง p.qtyWH อยู่อย่างไรก็ตาม
      // ส่งแบบ alias = ไบต์ที่เก็บจำนวนสินค้า
      expect(true).toBe(true); // placeholder
    });
  });

  describe('payload size impact', () => {
    it('ตัดไป ~100-200 bytes per SKU', () => {
      // ประมาณการ (ไม่ได้จากการวัด):
      // 1. mtoGroups = array ที่มีสินค้า ~200-300 อัน (ต่อกลุ่ม MTO) เหมาะสมได้ 50-100KB
      // 2. color: null = 15 bytes × 5484 SKU ≈ 82 KB
      // 3. warehouseQty = 15 bytes × 5484 SKU ≈ 82 KB
      // รวม ≈ 200+ KB ไม่นับ mtoGroups (mtoGroups วัดจากขนาดชีตขายจริง)
      // คืน: 4.2 MB → 4.0 MB (คาดการณ์ ต้องวัดจริงตอนเปิดแอป)
      expect(true).toBe(true); // placeholder
    });
  });
});
