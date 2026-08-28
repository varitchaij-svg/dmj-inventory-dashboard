// tests/label-sticker3-layout.test.js — เลย์เอาต์ภายในของ sticker3 (ค่าคงที่ ไม่มี UI ปรับ, ก.ย. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของทดสอบพิมพ์จริง 32×25 3 ช่อง พบ (1) ชื่อสินค้าทับ QR (2) พื้นที่ล่างใช้ไม่เต็ม
// รอบแรกทำเป็น "settings ให้พนักงานปรับ" แต่เจ้าของสั่งให้ **ถอด UI/ปรับค่าออกทั้งหมด** แล้ว
// **fix ค่าในโค้ด**: Product Name = 7pt (QR ใหญ่พอสแกน) · QR responsive เต็มกลาง (ไม่ทับชื่อ) ·
// SKU ชิดล่าง · Logo ซ้ายบน / Price ขวาบน — ไม่ให้ผู้ใช้ปรับเอง ไม่มี localStorage
//
// ⚠️ ห้ามเปลี่ยนขนาด/คอลัมน์/gap/@page ของ sticker3 · ห้ามแตะ sticker 50×25 / A4 / Greenery
// meta-test สแกนต้นทางจริง (component ใหญ่ eval ทั้งตัวไม่ได้ เหมือน label-sticker3.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

// eval ค่าคงที่ S3_LAYOUT จริงจากต้นทาง
const S3_SRC = grab(ANA, /const S3_LAYOUT = \{[^}]*\};/, 'S3_LAYOUT');
// eslint-disable-next-line no-new-func
const { S3_LAYOUT } = new Function(`${S3_SRC}\nreturn { S3_LAYOUT };`)();

describe('S3_LAYOUT — ค่าคงที่ในโค้ด (ไม่ให้ผู้ใช้ปรับ)', () => {
  it('Product Name = 7pt ถาวร (QR ใหญ่พอสแกน — 9pt เดิมทำ QR เหลือ ~5mm เล็กเกิน)', () => {
    expect(S3_LAYOUT.nameFontPt).toBe(7);
  });
  it('ระยะห่างชื่อจาก QR = 2mm · SKU จากขอบล่าง = 2mm', () => {
    expect(S3_LAYOUT.qrGapMm).toBe(2);
    expect(S3_LAYOUT.skuBottomMm).toBe(2);
  });
  it('ค่าที่โค้ดใช้ (s3NamePt/s3QrGap/s3SkuBot) อ้างตรงจาก S3_LAYOUT ไม่ผ่าน state', () => {
    expect(ANA).toMatch(/const s3NamePt = S3_LAYOUT\.nameFontPt;/);
    expect(ANA).toMatch(/const s3QrGap  = S3_LAYOUT\.qrGapMm;/);
    expect(ANA).toMatch(/const s3SkuBot = S3_LAYOUT\.skuBottomMm;/);
  });
});

describe('ถอด Settings UI + localStorage ออกหมด (เจ้าของสั่ง — ไม่ให้พนักงานปรับ)', () => {
  it('ไม่มี Settings UI panel (⚙️ ตั้งค่าเลย์เอาต์สติ๊กเกอร์) แล้ว', () => {
    expect(ANA).not.toMatch(/ตั้งค่าเลย์เอาต์สติ๊กเกอร์/);
    expect(ANA).not.toMatch(/\{printMode === "sticker3" && \(/);   // ไม่มี block UI แยกของ s3
  });
  it('ไม่มี state/handler ของ settings เดิม (s3Layout / setS3Field / resetS3Layout / clamp)', () => {
    for (const id of ['s3Layout', 'setS3Field', 'setS3LayoutRaw', 'resetS3Layout', 's3Clamp_', 'S3_LAYOUT_RANGE', 'S3_LAYOUT_DEFAULTS'])
      expect(ANA, 'ยังพบ ' + id).not.toMatch(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  it('ไม่มี localStorage key dmj_sticker3_layout (ไม่จำค่าใด ๆ)', () => {
    expect(ANA).not.toMatch(/dmj_sticker3_layout/);
  });
  it('dep array ของ printVaseLabels กลับเป็นชุดเดิม (ค่าคงที่ไม่ต้องอยู่ใน deps)', () => {
    expect(ANA).toMatch(/\}, \[labelList, qrMap, barcodeMap, codeType, logoSrc, printMode\]\);/);
  });
});

describe('พิมพ์ (print CSS) — เลย์เอาต์คงที่ wire เข้า .s3-* (7pt / 2mm / 2mm)', () => {
  const fn = grab(ANA, /const printVaseLabels = uC\(\(\) => \{[\s\S]*?\n  \}, \[labelList, qrMap, barcodeMap, codeType, logoSrc, printMode\]\);/, 'printVaseLabels');
  it('ชื่อสินค้า font-size = ${s3NamePt}pt (= 7pt)', () => {
    expect(fn).toMatch(/\.s3-name \{ font-size:\$\{s3NamePt\}pt; \}/);
  });
  it('ระยะ QR→ชื่อ = .s3-bottom margin-top ${s3QrGap}mm', () => {
    expect(fn).toMatch(/\.s3-bottom \{ margin-top:\$\{s3QrGap\}mm; \}/);
  });
  it('ระยะ SKU→ขอบล่าง = override .lbl padding-bottom ${s3SkuBot}mm (เฉพาะ s3)', () => {
    expect(fn).toMatch(/\.lbl \{ padding-bottom:\$\{s3SkuBot\}mm; \}/);
  });
  it('QR เต็มพื้นที่กลาง (aspect-ratio 1/1) แทน fix 13mm → ไม่ทับชื่อ', () => {
    expect(fn).not.toMatch(/\.s3-qr \{ width:13mm; height:13mm; \}/);
    expect(fn).toMatch(/\.s3-qr \{ height:100%; aspect-ratio:1\/1; width:auto; max-width:100%; \}/);
  });
  it('โครงเลย์เอาต์ครบ: โลโก้ซ้ายบน + ราคาขวาบน (.s3-top) · QR กลาง (.s3-mid) · ชื่อ+SKU ล่าง (.s3-bottom)', () => {
    expect(fn).toMatch(/<div class="s3-top">[\s\S]*?class="s3-logo"[\s\S]*?class="s3-price"/);
    expect(fn).toMatch(/<div class="s3-mid">/);
    expect(fn).toMatch(/<div class="s3-bottom">[\s\S]*?class="s3-name"[\s\S]*?class="s3-sku"/);
  });
});

describe('Preview สด — สะท้อนเลย์เอาต์คงที่ (px = pt/mm × SCALE) + QR responsive', () => {
  const block = grab(ANA, /\) : stickerCfg\.cols > 1 \? \(([\s\S]*?)\n      \) : \(/, 'multi-col preview');
  it('แปลง pt→px (namePx) + mm→px (qrGapPx/skuBotPx) จากค่าคงที่', () => {
    expect(block).toMatch(/const namePx = \+\(s3NamePt \* 0\.3528 \* SCALE\)/);
    expect(block).toMatch(/const qrGapPx = s3QrGap \* SCALE/);
    expect(block).toMatch(/const skuBotPx = s3SkuBot \* SCALE/);
  });
  it('ใช้ค่าเหล่านี้จริง: paddingBottom, marginTop, fontSize', () => {
    expect(block).toMatch(/padding:`6px 8px \$\{skuBotPx\}px`/);
    expect(block).toMatch(/marginTop:qrGapPx/);
    expect(block).toMatch(/fontSize:namePx/);
  });
  it('QR พรีวิวเต็มพื้นที่กลาง (aspectRatio "1 / 1") — ไม่ fix px', () => {
    expect(block).toMatch(/height:"100%",aspectRatio:"1 \/ 1",maxWidth:"100%"/);
    expect(block).not.toMatch(/width:qrSz,height:qrSz/);
  });
});

describe('regression — sticker 50×25 / A4 / Greenery / config ไม่ถูกแตะ', () => {
  it('sticker3 config (32×25/gap3/3cols) เท่าเดิม', () => {
    expect(ANA).toMatch(/sticker3:\s*\{\s*w:\s*32,\s*h:\s*25,\s*gap:\s*3,\s*cols:\s*3\s*\}/);
  });
  it('sticker 50×25 config เท่าเดิม', () => {
    expect(ANA).toMatch(/sticker:\s*\{\s*w:\s*50,\s*h:\s*25,\s*gap:\s*3,\s*cols:\s*1\s*\}/);
  });
  it('@page ของ sticker ยังเป็น pageW×h (ไม่แตะ)', () => {
    expect(ANA).toMatch(/@page \{ size: \$\{pageW\}mm \$\{cfg\.h\}mm; margin: 0; \}/);
  });
  it('preview เดิม 50×25 (คอลัมน์เดียว) ยัง 300×150', () => {
    expect(ANA).toMatch(/width:300, height:150, boxSizing:"border-box"/);
  });
  it('sticker 50×25 popup ยังใช้ .lqr fix 78px/13mm (ไม่โดนของ s3)', () => {
    expect(ANA).toMatch(/\.lqr \{ width:78px; height:78px; \}/);
    expect(ANA).toMatch(/\.lqr \{ width:13mm; height:13mm; \}/);
  });
});
