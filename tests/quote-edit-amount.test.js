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

// ── กด "แก้ไข" แล้วขึ้น "ดึงรายละเอียดไม่สำเร็จ [รหัส 404]" (ส.ค. 2026) ──
// getQuotationForPrint ยิง ZORT ในตัว doGet → doGet ยาวจน googleusercontent 404 ชั่วคราวได้
// เป็นการอ่านล้วน (idempotent) → ต้องลองซ้ำเองก่อนขึ้น error ไม่งั้นเจอ blip ทีเดียวก็พังทั้งที่กดใหม่ผ่าน
describe('meta — syncGetQuotationForPrint ต้องลองซ้ำเมื่ออ่านคำตอบไม่ได้ (idempotent read)', () => {
  const fn = QUOTE.match(/async function syncGetQuotationForPrint\(idOrNumber\) \{[\s\S]*?\n\}/);

  it('มีลูป retry (ลองซ้ำหลายครั้ง)', () => {
    expect(fn).toBeTruthy();
    expect(fn[0]).toMatch(/for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
  });

  it('ยังอ่านคำตอบผ่าน dmjJson (บทเรียนข้อ 13) ไม่ใช่ res.json()', () => {
    expect(fn[0]).toMatch(/dmjJson\(res\)/);
    expect(fn[0]).not.toMatch(/res\.json\(\)/);
  });

  it('ลองซ้ำเฉพาะ badjson (HTML/404) หรือเน็ต/timeout — ไม่ retry มั่ว', () => {
    expect(fn[0]).toMatch(/badjson/);
    expect(fn[0]).toMatch(/AbortError/);
    expect(fn[0]).toMatch(/if \(!retryable\) break/);
  });

  it('มีหน่วงเวลาระหว่างครั้ง (backoff) ไม่ยิงรัว', () => {
    expect(fn[0]).toMatch(/setTimeout\(r, 700 \* attempt\)/);
  });
});

// ── QuoteFollowupView.load() — โหลดสรุปทั้งแท็บ ก็ต้องทนต่อ 404/HTML ชั่วคราวเหมือนกัน ──
// ที่มา (ส.ค. 2026): เซลเปิดแท็บ "ใบเสนอราคา" แล้ว "ใช้ไม่ได้" — ทั้งแท็บขึ้นแดง "[รหัส 404]"
// getQuotationSummary เป็น doGet ยาว (ยิง ZORT ได้ถึง 30 หน้า) → เจอ googleusercontent 404
// ชั่วคราวได้บ่อยกว่า getQuotationForPrint ด้วยซ้ำ · แต่ load() เดิมใช้ `fetch` ดิบ ไม่มี timeout/
// retry เลย (cd27de5 แก้ getQuotationForPrint แต่หลุด load ตัวนี้ไป) → blip เดียว = ทั้งแท็บพัง
// อ่านล้วน idempotent → ลองซ้ำได้ปลอดภัย เหมือน syncGetQuotationForPrint เป๊ะ
describe('meta — QuoteFollowupView.load() ต้องทนต่อ GAS ตอบ HTML/404 ชั่วคราว', () => {
  // มี const load หลายตัวในไฟล์ (หลาย view) — ผูกเฉพาะตัวที่ยิง getQuotationSummary
  // ด้วย tempered-greedy กันข้ามไป load ของ view อื่น
  const fn = VANA.match(/const load = async \(\) => \{(?:(?!const load = async)[\s\S])*?getQuotationSummary(?:(?!const load = async)[\s\S])*?\n  \};/);

  it('เจอฟังก์ชัน load', () => { expect(fn).toBeTruthy(); });

  it('ใช้ dmjFetch (แนบ sessionToken + เพดานเวลา) ไม่ใช่ fetch ดิบ', () => {
    expect(fn[0]).toMatch(/dmjFetch\(/);
    // ห้ามกลับไปใช้ `fetch(` ดิบ (ค้างไม่มี timeout = ปุ่มหมุนไม่จบ)
    expect(fn[0]).not.toMatch(/[^j]fetch\(`/);
    expect(fn[0]).toMatch(/dmjTimeoutMs/);
  });

  it('มีลูป retry 3 ครั้ง + backoff', () => {
    expect(fn[0]).toMatch(/for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
    expect(fn[0]).toMatch(/setTimeout\(r, 700 \* attempt\)/);
  });

  it('ยังอ่านคำตอบผ่าน dmjJson (บทเรียนข้อ 13) ไม่ใช่ res.json()', () => {
    expect(fn[0]).toMatch(/dmjJson\(res\)/);
    expect(fn[0]).not.toMatch(/res\.json\(\)/);
  });

  it('ลองซ้ำเฉพาะ badjson/เน็ต/timeout — error จริงจาก backend (d.error) ไม่ retry', () => {
    expect(fn[0]).toMatch(/badjson/);
    expect(fn[0]).toMatch(/AbortError/);
    expect(fn[0]).toMatch(/if \(!retryable\) break/);
  });
});
