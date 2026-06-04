// tests/schema.test.js — schema-lock test
// ตรวจว่า COL_PROD_* constants ตรงกับ index ที่ code อ่านจริง
// ป้องกัน "column drift" ที่ทำให้ GAS เขียน stock ผิดคอลัมน์เงียบ ๆ
import { describe, it, expect } from 'vitest';
import { COL_PROD_SKU, COL_PROD_QTYFS, COL_PROD_QTYWH, mapProductRow } from './helpers.js';

// ── ตรวจ constant values ──────────────────────────────────────────────────────
describe('COL_PROD_* constants', () => {
  it('COL_PROD_SKU = 2 (column B, 1-based)', () => {
    expect(COL_PROD_SKU).toBe(2);
  });

  it('COL_PROD_QTYFS = 7 (column G หน้าร้าน, 1-based)', () => {
    expect(COL_PROD_QTYFS).toBe(7);
  });

  it('COL_PROD_QTYWH = 8 (column H คลัง, 1-based)', () => {
    expect(COL_PROD_QTYWH).toBe(8);
  });
});

// ── ตรวจ mapProductRow อ่าน index ถูกต้อง ────────────────────────────────────
describe('mapProductRow', () => {
  it('COL constants ตรงกับ index ที่อ่านจริง', () => {
    // row ที่มี SKU ที่ col B (0-index=1), store ที่ col G (0-index=6), wh ที่ col H (0-index=7)
    const row = Array(10).fill('');
    row[1] = 'HL001234'; row[6] = 5; row[7] = 3;
    const result = mapProductRow(row);
    expect(result.sku).toBe('HL001234');
    expect(result.qtyStore).toBe(5);
    expect(result.qtyWH).toBe(3);
  });

  it('SKU ถูก trim และ uppercase', () => {
    const row = Array(10).fill('');
    row[1] = '  hl001  ';
    const result = mapProductRow(row);
    expect(result.sku).toBe('HL001');
  });

  it('qty ที่เป็น string number แปลงเป็น number ได้', () => {
    const row = Array(10).fill('');
    row[1] = 'HL002'; row[6] = '10'; row[7] = '20';
    const result = mapProductRow(row);
    expect(result.qtyStore).toBe(10);
    expect(result.qtyWH).toBe(20);
  });

  it('ช่องว่าง/undefined → qty เป็น 0', () => {
    const row = Array(10).fill('');
    row[1] = 'HL003';
    // row[6] และ row[7] เป็น '' (empty string)
    const result = mapProductRow(row);
    expect(result.qtyStore).toBe(0);
    expect(result.qtyWH).toBe(0);
  });

  it('ไม่อ่าน column อื่นมาทับ — qtyStore ไม่ใช่ค่าจาก col I (index 8)', () => {
    // ถ้า index เพี้ยน (ใช้ 1-indexed โดยตรง) จะดึง row[7] ไปเป็น qtyStore แทน row[6]
    const row = Array(10).fill(0);
    row[1] = 'HL004';
    row[6] = 99;   // G = qtyStore จริง (0-idx=6)
    row[7] = 88;   // H = qtyWH จริง (0-idx=7)
    row[8] = 77;   // I = อะไรอื่น (ไม่ควรอ่าน)
    const result = mapProductRow(row);
    expect(result.qtyStore).toBe(99);
    expect(result.qtyWH).toBe(88);
  });

  it('row สั้นกว่าที่คาดไม่ทำให้ crash', () => {
    const row = ['A', 'HL005'];  // แค่ 2 element
    const result = mapProductRow(row);
    expect(result.sku).toBe('HL005');
    expect(result.qtyStore).toBe(0);
    expect(result.qtyWH).toBe(0);
  });
});
