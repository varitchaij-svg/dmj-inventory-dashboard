// tests/label-sticker3.test.js — รูปแบบใหม่ "สติ๊กเกอร์ 32×25 — 3 ช่อง" (Direct Thermal Roll)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026): เพิ่ม Format Direct Thermal 32×25mm · Roll · Gap 3mm · 3 ช่อง/แถว
//   1 แถว = [32mm] gap 3mm [32mm] gap 3mm [32mm] = 102mm (ต้องรวม gap ไม่ใช่ 96mm)
//   จำนวนที่กรอก = จำนวน "ดวง" → wrap 3 ต่อแถวอัตโนมัติ (7 = 3+3+1)
//
// eval config จริง (STICKER_FORMATS/สูตร pageW) จากต้นทาง + meta-test สแกน printVaseLabels/preview
// (LabelPrintView เป็น React component ใหญ่ eval ทั้งตัวไม่ได้ — หลักเดียวกับ label-card/label-barcode)
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

// ── eval config จริงจากต้นทาง (ไม่ copy) ────────────────────────────────────
const CFG_SRC  = grab(ANA, /const STICKER_FORMATS = \{[\s\S]*?\n\};/, 'STICKER_FORMATS');
const PAGEW_SRC = grab(ANA, /const stickerPageW_ = \(cfg\) => [^;]+;/, 'stickerPageW_');
// eslint-disable-next-line no-new-func
const { STICKER_FORMATS, stickerPageW_ } = new Function(
  `${CFG_SRC}\n${PAGEW_SRC}\nreturn { STICKER_FORMATS, stickerPageW_ };`
)();

// mirror ของ grouping จริง (for i += cols) เพื่อทดสอบ row-wrapping
function rows(n, cols) {
  const r = [];
  for (let i = 0; i < n; i += cols) r.push(Math.min(cols, n - i));
  return r;
}

describe('STICKER_FORMATS — config ต่อรูปแบบ (32×25 3 ช่อง)', () => {
  it('sticker3 = 32×25mm · gap 3mm · 3 ช่อง', () => {
    expect(STICKER_FORMATS.sticker3).toEqual({ w: 32, h: 25, gap: 3, cols: 3 });
  });
  it('sticker เดิม (50×25 แถวเดียว) ไม่ถูกแตะ — regression', () => {
    expect(STICKER_FORMATS.sticker).toEqual({ w: 50, h: 25, gap: 3, cols: 1 });
  });
});

describe('ความกว้างพื้นที่ label รวม — ต้องรวม gap (102mm ไม่ใช่ 96mm)', () => {
  it('sticker3 = 32×3 + 3×2 = 102mm', () => {
    expect(stickerPageW_(STICKER_FORMATS.sticker3)).toBe(102);
    expect(stickerPageW_(STICKER_FORMATS.sticker3)).not.toBe(96); // เตือนกรณีลืมบวก gap
  });
  it('sticker เดิม = 50mm (cols=1 → ไม่มี gap)', () => {
    expect(stickerPageW_(STICKER_FORMATS.sticker)).toBe(50);
  });
  it('สูตรในต้นทางรวม gap·(cols-1) จริง (ไม่ใช่ w·cols เฉย ๆ)', () => {
    expect(PAGEW_SRC).toMatch(/cfg\.w \* cfg\.cols \+ cfg\.gap \* \(cfg\.cols - 1\)/);
  });
});

describe('row wrapping — จำนวนดวง wrap 3 ต่อแถว (7 = 3+3+1)', () => {
  const cols = STICKER_FORMATS.sticker3.cols;
  it('1 ดวง → [1]', () => expect(rows(1, cols)).toEqual([1]));
  it('3 ดวง → [3] (แถวเดียวเต็ม)', () => expect(rows(3, cols)).toEqual([3]));
  it('4 ดวง → [3, 1]', () => expect(rows(4, cols)).toEqual([3, 1]));
  it('6 ดวง → [3, 3]', () => expect(rows(6, cols)).toEqual([3, 3]));
  it('7 ดวง → [3, 3, 1]', () => expect(rows(7, cols)).toEqual([3, 3, 1]));
  it('10 ดวง → [3, 3, 3, 1]', () => expect(rows(10, cols)).toEqual([3, 3, 3, 1]));
});

describe('UI — Format ใหม่ในปุ่มสลับ + คำอธิบาย', () => {
  it('ปุ่มสลับมี id "sticker3" พร้อมชื่อ/รายละเอียดตามสเปก', () => {
    const btn = grab(ANA, /\{id:"sticker3",[^}]*\}/, 'sticker3 toggle');
    expect(btn).toMatch(/32×25/);
    expect(btn).toMatch(/3 ช่อง/);
    expect(btn).toMatch(/Roll/);
    expect(btn).toMatch(/Gap 3mm/);
  });
  it('page-sub มีสาขา sticker3 (บอก 102mm + 3 ช่อง)', () => {
    expect(ANA).toMatch(/printMode === "sticker3"/);
    expect(ANA).toMatch(/102mm/);
  });
});

describe('printVaseLabels — พิมพ์ config-driven ตามขนาดจริง (mm)', () => {
  const fn = grab(ANA, /const printVaseLabels = uC\(\(\) => \{[\s\S]*?\n  \}, \[labelList, qrMap, barcodeMap, codeType, logoSrc, printMode\]\);/, 'printVaseLabels');

  it('อ่าน config จาก STICKER_FORMATS ตาม printMode (ไม่ hard-code 50mm)', () => {
    expect(fn).toMatch(/STICKER_FORMATS\[printMode\]/);
    expect(fn).toMatch(/const cols\s*=\s*cfg\.cols/);
    expect(fn).toMatch(/const pageW\s*=\s*stickerPageW_\(cfg\)/);
  });
  it('จัดดวงเป็นแถวละ cols ดวง (loop i += cols) — รองรับแถวไม่เต็ม', () => {
    expect(fn).toMatch(/i \+= cols/);
    expect(fn).toMatch(/labelList\.slice\(i, i \+ cols\)/);
    expect(fn).toMatch(/class="lrow"/);
  });
  it('@page size = ความกว้างจริง (pageW) × สูง (cfg.h) — ห้ามให้ browser ย่อ/ขยาย', () => {
    expect(fn).toMatch(/@page \{ size: \$\{pageW\}mm \$\{cfg\.h\}mm; margin: 0; \}/);
  });
  it('.lbl print ใช้ขนาดจริงต่อดวง (cfg.w × cfg.h mm) + gap ที่ .lrow', () => {
    expect(fn).toMatch(/width:\$\{cfg\.w\}mm; height:\$\{cfg\.h\}mm/);
    expect(fn).toMatch(/gap:\$\{cfg\.gap\}mm/);
  });
  it('page-break อยู่ที่ .lrow (1 แถว = 1 หน้าบนม้วน) ไม่ใช่ต่อดวง', () => {
    expect(fn).toMatch(/\.lrow \{[\s\S]*?page-break-after:always/);
  });
  it('ยังรองรับ QR + Barcode เดิม (โค้ด logic ไม่เปลี่ยน)', () => {
    expect(fn).toMatch(/const isBc\s*=\s*codeType === "barcode"/);
    expect(fn).toMatch(/qrMap\[p\.sku\]/);
    expect(fn).toMatch(/barcodeMap\[p\.sku\]/);
  });
});

describe('Preview — โหมดหลายช่องแสดง 3 ดวง/แถว, โหมดเดิมไม่ถูกแตะ', () => {
  it('มีสาขา preview สำหรับ stickerCfg.cols > 1', () => {
    expect(ANA).toMatch(/\) : stickerCfg\.cols > 1 \? \(/);
  });
  it('row กว้าง = stickerPageW·SCALE + flexWrap → wrap เป็น cols ดวง/แถว', () => {
    const block = grab(ANA, /\) : stickerCfg\.cols > 1 \? \(([\s\S]*?)\n      \) : \(/, 'multi-col preview');
    expect(block).toMatch(/flexWrap:"wrap"/);
    expect(block).toMatch(/width:stickerPageW\*SCALE/);
    expect(block).toMatch(/gap:gapPx/);
  });
  it('preview เดิม (50×25 คอลัมน์เดียว) ยังใช้ 300×150 ไม่เปลี่ยน — regression', () => {
    expect(ANA).toMatch(/width:300, height:150, boxSizing:"border-box"/);
  });
});

describe('regression — โหมด A4 / การ์ด ไม่ถูกแตะ', () => {
  it('A4 ยัง 70 ใบ/หน้า', () => {
    expect(ANA).toMatch(/const LABELS_PER_PAGE = 70;/);
  });
  it('การ์ดยังใช้ intakeCardGrid', () => {
    expect(ANA).toMatch(/const cardGrid = uM\(\(\) => \(typeof intakeCardGrid === "function"/);
  });
});
