// tests/quote-edit-amount.test.js — แก้ไขใบเสนอราคาแล้ว "ยอดต้องเท่าใบเดิม"
// ─────────────────────────────────────────────────────────────────────────────
// ที่มา (เจ้าของแจ้ง ส.ค. 2026 + ภาพหน้าจอ): กด "แก้ไข" ใบเสนอราคา QT-... แล้วยอดรวมในฟอร์ม
// ไม่เท่ากับยอดใบเดิม · ต้นเหตุ: โหมดแก้ไขเดิม "คืนราคาตั้งจาก catalog ปัจจุบัน" แล้วให้ฟอร์ม/
// backend หักส่วนลดขายส่งใหม่ → ยอดเพี้ยนได้ 2 ทาง (catalog ราคาเปลี่ยนไปแล้ว + หักส่วนลดซ้ำ)
//
// วิธีแก้: โหมดแก้ไขโหลด "ราคาสุทธิ" ที่ ZORT เก็บไว้ (it.price = pricepernumber ซึ่งหักส่วนลด
// ในใบเดิมแล้ว) มาตรงๆ + ส่ง pricesFinal → computeBillTotals(Gs_) ไม่หักส่วนลดขายส่งซ้ำ
// → ยอดรวม = ผลรวมราคาสุทธิ = ยอดใบเดิมเป๊ะ
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeBillTotals } from './helpers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUOTE = readFileSync(join(ROOT, 'views-quote.jsx'), 'utf8');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const GS = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

const P = (category, qty, price) => ({ category, qty, price });

describe('computeBillTotals — pricesFinal (โหมดแก้ไข: ราคาสุทธิ ห้ามหักส่วนลดซ้ำ)', () => {
  it('ปกติ ≥6 ชิ้น → หักส่วนลดขายส่ง 20%', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 100)]);
    expect(r.isWholesale).toBe(true);
    expect(r.grandTotal).toBeCloseTo(480, 6);   // 600 × 0.8
  });

  it('pricesFinal:true → ไม่หักส่วนลดแม้ ≥6 ชิ้น (ราคาสุทธิมาแล้ว)', () => {
    const r = computeBillTotals([P('ดอกไม้', 6, 100)], { pricesFinal: true });
    expect(r.isWholesale).toBe(false);
    expect(r.grandTotal).toBeCloseTo(600, 6);   // = ผลรวมราคาสุทธิตรงๆ
  });

  it('ยอดรวม = ผลรวม (ราคาสุทธิ × จำนวน) ของทุกบรรทัด = ยอดใบเดิม', () => {
    // จำลองใบเดิมที่ ZORT เก็บราคาสุทธิ (หักส่วนลดแล้ว) ไว้ต่อบรรทัด
    const items = [P('ดอกไม้', 2, 2980), P('ดอกไม้', 3, 267.84)];
    const expected = 2 * 2980 + 3 * 267.84;
    const r = computeBillTotals(items, { pricesFinal: true });
    expect(r.grandTotal).toBeCloseTo(expected, 6);
  });

  it('pricesFinal + ขั้นบาทใหญ่ → ก็ยังไม่หัก tier', () => {
    const r = computeBillTotals([P('ดอกไม้', 10, 7500)], { pricesFinal: true });
    expect(r.tierRate).toBe(0);
    expect(r.grandTotal).toBeCloseTo(75000, 6);
  });

  it('ยังหักส่วนลดมือ (manual) ได้ตามปกติแม้ pricesFinal', () => {
    const r = computeBillTotals([P('ดอกไม้', 2, 1000)], { pricesFinal: true, manualDiscount: 100 });
    expect(r.grandTotal).toBeCloseTo(1900, 6);
  });
});

// ── จุดเชื่อมต่อ: พังแล้วเทสต์พฤติกรรมข้างบนยังเขียว ──
describe('meta — เส้นทาง editQuote ต้องใช้ราคาสุทธิ + pricesFinal ครบทั้งเส้น', () => {
  it('cart init โหมดแก้ไขใช้ it.price (ราคาสุทธิจาก ZORT) ไม่ใช่ราคา catalog', () => {
    const fn = QUOTE.match(/const \[cart, setCart\] = uS\(\(\) => \{[\s\S]*?\n  \}\);/);
    expect(fn).toBeTruthy();
    const src = fn[0];
    expect(src).toMatch(/price: Number\(it\.price\) \|\| 0/);
    // ต้องไม่กลับไปคืนราคาจาก catalog (บั๊กเดิมที่ทำยอดเพี้ยน)
    expect(src).not.toMatch(/p && Number\(p\.price\) > 0 \? Number\(p\.price\)/);
    // ยังหารูป/หมวดจาก catalog อยู่ (กติกา UI)
    expect(src).toMatch(/imageUrl: \(p && p\.imageUrl\) \|\| ""/);
  });

  it('totals ของฟอร์มส่ง pricesFinal: !!editQuote', () => {
    expect(QUOTE).toMatch(/computeBillTotals\(cart, \{ manualDiscount: md, pricesFinal: !!editQuote \}\)/);
  });

  it('buildQuotePayload ส่ง pricesFinal เมื่ออยู่โหมดแก้ไข', () => {
    const fn = QUOTE.match(/function buildQuotePayload\(\) \{[\s\S]*?\n  \}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/pricesFinal: editQuote \? true : undefined/);
  });

  it('computeBillTotals (views-analytics) รองรับ opts.pricesFinal', () => {
    expect(VANA).toMatch(/var isWholesale = !opts\.pricesFinal && eligiblePieces >= 6;/);
  });

  it('computeBillTotalsGs_ (backend) รองรับ opts.pricesFinal', () => {
    expect(GS).toMatch(/var isWs = !opts\.pricesFinal && pcs >= 6;/);
  });

  it('editQuotation (backend) ส่ง pricesFinal ต่อให้ computeBillTotalsGs_', () => {
    const fn = GS.match(/function editQuotation\(ss, data, actor\) \{[\s\S]*?var gross = totals\.retailEligible/);
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/pricesFinal: !!data\.pricesFinal/);
  });

  it('createQuotation ต้อง "ไม่" ส่ง pricesFinal (ใบใหม่ = ราคาปลีก ต้องหักส่วนลดจริง)', () => {
    const fn = GS.match(/function createQuotation\(ss, data, actor\) \{[\s\S]*?var gross = totals\.retailEligible/);
    expect(fn).toBeTruthy();
    expect(fn[0]).not.toMatch(/pricesFinal/);
  });
});
