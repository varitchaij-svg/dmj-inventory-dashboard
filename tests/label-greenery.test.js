// tests/label-greenery.test.js — Static A4 Template "Greenery Sticker Long Flag" (ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของขอ Format ใหม่ในหน้า "พิมพ์ Label สินค้า": printMode="greenery" — Static Template
// 100% (ไม่ผูกกับสินค้า/SKU/QR เลย) ต้องรักษาหน้าตาเดิมของไฟล์ต้นฉบับ (Excel export → PDF)
// ให้มากที่สุด → **embed ไฟล์ PDF จริงตรง ๆ ผ่าน <iframe> แทนการ recreate ด้วย HTML/CSS**
// (ห้าม redraw font/artwork/icon) ตามที่เจ้าของสั่งชัดเจน — print fidelity สูงสุด
//
// ส่วนใหญ่เป็น meta-test สแกนต้นทางจริง (LabelPrintView เป็น React component ใหญ่ eval ตรงไม่ได้
// เหมือน label-card.test.js/label-barcode.test.js/label-sticker3.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const PDF_PATH = join(ROOT, 'greenery-sticker-long-flag.pdf');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

describe('PDF asset — greenery-sticker-long-flag.pdf (static, self-hosted เหมือน logo.png)', () => {
  it('ไฟล์อยู่จริงที่ root ของ repo และไม่ใช่ไฟล์เปล่า', () => {
    expect(existsSync(PDF_PATH)).toBe(true);
    const st = statSync(PDF_PATH);
    expect(st.size).toBeGreaterThan(10000);
  });
  it('เป็น PDF ตัวจริง (ตรวจ header magic bytes)', () => {
    const buf = readFileSync(PDF_PATH);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('%PDF');
  });
  it('มีหน้าเดียว (1 page)', () => {
    const data = readFileSync(PDF_PATH);
    const matches = data.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || [];
    expect(matches.length).toBe(1);
  });
  it('ขนาดหน้าเป็น A4 (210×297mm) — ไม่ใช่ Letter/ขนาดอื่น', () => {
    const data = readFileSync(PDF_PATH).toString('latin1');
    const m = data.match(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/);
    expect(m).not.toBeNull();
    const [, x0, y0, x1, y1] = m.map(Number);
    const wMm = (x1 - x0) / 72 * 25.4;
    const hMm = (y1 - y0) / 72 * 25.4;
    expect(wMm).toBeGreaterThan(208); expect(wMm).toBeLessThan(212);   // 210mm ± 2mm
    expect(hMm).toBeGreaterThan(295); expect(hMm).toBeLessThan(299);   // 297mm ± 2mm
  });
});

describe('LabelPrintView — printMode "greenery" เพิ่มเข้าตัวสลับ format', () => {
  it('isStaticTemplate ผูกกับ printMode === "greenery"', () => {
    expect(ANA).toMatch(/const isStaticTemplate = printMode === "greenery";/);
  });
  it('มีปุ่มสลับ id "greenery" ป้าย "📄 A4 — Greenery Sticker Long Flag"', () => {
    const btn = grab(ANA, /\{id:"greenery",[^}]*\}/, 'greenery toggle');
    expect(btn).toMatch(/Greenery Sticker Long Flag/);
  });
  it('page-sub มีสาขา printMode === "greenery" (บอก 3×17 = 51 ดวง/หน้า)', () => {
    expect(ANA).toMatch(/printMode === "greenery"\s*\n\s*\? "Static Template · A4 · 3×17 = 51 ดวง\/หน้า/);
  });
});

describe('UI product controls ถูกซ่อนทั้งหมดเมื่อเป็น Static Template', () => {
  it('QR/Barcode toggle ไม่โผล่ (ห่อด้วย !isStaticTemplate)', () => {
    expect(ANA).toMatch(/\{printMode !== "card" && !isStaticTemplate && \(/);
  });
  it('Add product row + Items list ทั้งก้อนห่อด้วย !isStaticTemplate', () => {
    const block = grab(ANA, /\{!isStaticTemplate && \(<>[\s\S]*?\n {8}<\/>\)\}/, 'static-hidden block');
    // ต้องครอบคลุมทั้งช่องค้นหา, ช่องจำนวน, ปุ่มเพิ่ม, ScanButton, และ items list
    expect(block).toMatch(/ค้นหาสินค้า \/ พิมพ์ SKU โดยตรง/);
    expect(block).toMatch(/จำนวนใบ/);
    expect(block).toMatch(/<ScanButton/);
    expect(block).toMatch(/รายการที่จะพิมพ์/);
    expect(block).toMatch(/ยังไม่มีสินค้า/);
  });
});

describe('ปุ่มพิมพ์ — โผล่ได้แม้ labelList ว่าง (ไม่ผูกกับสินค้า)', () => {
  it('เงื่อนไขเปิดปุ่มพิมพ์รวม isStaticTemplate ไว้ก่อน (OR)', () => {
    expect(ANA).toMatch(/\{\(isStaticTemplate \|\| \(printMode === "card" \? cardList\.length : labelList\.length\) > 0\) && \(/);
  });
  it('แถบ hint "ตัวอย่างด้านล่างคือ preview" ก็เปิดด้วย isStaticTemplate เช่นกัน (สองจุดต้องตรงกัน)', () => {
    const hints = ANA.match(/\{\(isStaticTemplate \|\| \(printMode === "card" \? cardList\.length : labelList\.length\) > 0\) && \(/g) || [];
    expect(hints.length).toBe(2);
  });
  it('ปุ่มพิมพ์ของ greenery เรียก contentWindow.print() ของ iframe ref (ไม่ใช่ window.print() ทั้งหน้า)', () => {
    const block = grab(ANA, /\) : isStaticTemplate \? \(([\s\S]*?)\n {14}\) : \(/, 'greenery print button branch');
    expect(block).toMatch(/greeneryFrameRef\.current\?\.contentWindow\?\.print\(\)/);
    expect(block).not.toMatch(/window\.print\(\)/);
  });
});

describe('Preview — embed PDF จริงผ่าน iframe (ไม่ recreate ด้วย HTML/CSS)', () => {
  const block = grab(ANA, /\{isStaticTemplate \? \(([\s\S]*?)\n {6}\) : printMode === "a4" \? \(/, 'greenery preview block');

  it('ใช้ <iframe> ชี้ไปที่ asset PDF จริง (ไม่ใช่ redraw ด้วย div/canvas)', () => {
    expect(block).toMatch(/<iframe /);
    expect(block).toMatch(/src="greenery-sticker-long-flag\.pdf/);
  });
  it('ผูก ref={greeneryFrameRef} เพื่อเรียก print() ได้จากปุ่มด้านบน', () => {
    expect(block).toMatch(/ref=\{greeneryFrameRef\}/);
  });
  it('คุมสัดส่วน A4 ด้วย aspectRatio "210 / 297" ไม่ใช่ hard-code px มั่ว', () => {
    expect(block).toMatch(/aspectRatio:"210 \/ 297"/);
  });
  it('ห้ามใช้ transform:scale() คุมขนาด (ห้ามสุ่มปรับ physical print sizing)', () => {
    expect(block).not.toMatch(/transform\s*:\s*["']scale/);
  });
  it('⚠️ ห้ามห่อด้วย .no-print — iframe ต้อง render อยู่เพื่อให้ contentWindow.print() ทำงานได้จริง', () => {
    expect(block).not.toMatch(/className="no-print"/);
  });
});

describe('regression — โหมด A4 / การ์ด / sticker / sticker3 เดิมไม่ถูกแตะ', () => {
  it('A4 ยัง 70 ใบ/หน้า', () => {
    expect(ANA).toMatch(/const LABELS_PER_PAGE = 70;/);
  });
  it('การ์ดยังใช้ intakeCardGrid', () => {
    expect(ANA).toMatch(/const cardGrid = uM\(\(\) => \(typeof intakeCardGrid === "function"/);
  });
  it('sticker3 config (32×25/gap3/3cols) ยังอยู่ครบ', () => {
    expect(ANA).toMatch(/sticker3:\s*\{\s*w:\s*32,\s*h:\s*25,\s*gap:\s*3,\s*cols:\s*3\s*\}/);
  });
  it('printVaseLabels dependency array ไม่เปลี่ยน (ยังไม่มี isStaticTemplate ปน — ไม่เกี่ยวข้องกับ sticker)', () => {
    expect(ANA).toMatch(/\}, \[labelList, qrMap, barcodeMap, codeType, logoSrc, printMode\]\);/);
  });
});
