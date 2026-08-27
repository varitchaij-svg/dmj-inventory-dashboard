// tests/label-barcode.test.js — โหมด Barcode (Code128) ในหน้าพิมพ์ Label สินค้า (ส.ค. 2026)
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง: หน้าพิมพ์ Label เดิมมีแค่ QR — เพิ่มตัวเลือก Barcode ได้ โดย **ค่าเริ่มต้นยังเป็น
// QR เสมอ** สลับไปมาได้ด้วยปุ่ม ไม่แตะขนาดป้ายเดิม (A4 42×21.2mm / สติ๊กเกอร์ 50×25mm) —
// ทำเฉพาะ 2 โหมดนี้ (โหมด "การ์ดสินค้า" ไม่อยู่ในสโคป ยังเป็น QR อย่างเดียว)
//
// รอบสองเจ้าของขอเพิ่ม: วงกลมประ 4mm (ขนาดรูเจาะกระดาษมาตรฐาน) สำหรับร้อยเชือกแขวนป้าย —
// เฉพาะโหมด A4 (สติ๊กเกอร์เป็นแบบแปะติดตัวสินค้า ไม่ได้ร้อยแขวน) ติดอยู่เสมอไม่ว่าจะเลือก
// โค้ดชนิดไหน (คนละเรื่องกับการสลับ QR/Barcode)
//
// ส่วนใหญ่เป็น meta-test สแกนต้นทางจริง (LabelPrintView เป็น React component ใหญ่ eval ตรงไม่ได้
// เหมือน tests/label-card.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');
const SW   = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

describe('self-hosted jsbarcode.min.js — เหมือน html2canvas (CDN ไม่เสถียรบนเน็ตร้าน/iPad)', () => {
  it('ไฟล์อยู่จริงในรากโปรเจกต์และไม่ใช่ไฟล์เปล่า', () => {
    const st = statSync(join(ROOT, 'jsbarcode.min.js'));
    expect(st.size).toBeGreaterThan(10000);
  });
  it('เป็น JsBarcode ตัวจริง (ตรวจ banner comment กันใส่ไฟล์ผิด)', () => {
    const head = readFileSync(join(ROOT, 'jsbarcode.min.js'), 'utf8').slice(0, 200);
    expect(head).toMatch(/JsBarcode/);
  });
  it('โหลด local ก่อน + fallback CDN เมื่อไฟล์ local หาย (หลักเดียวกับ html2canvas)', () => {
    expect(HTML).toMatch(/<script defer src="\/jsbarcode\.min\.js" onerror="[^"]*JsBarcode[^"]*"><\/script>/);
  });
});

describe('CACHE_NAME ต้อง bump — แก้ CSS ใน Doomuenjing Dashboard.html (บทเรียนข้อ 15)', () => {
  it('service-worker.js เดินหน้า CACHE_NAME', () => {
    const m = SW.match(/const CACHE_NAME = "dmj-v(\d+)"/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(49);
  });
});

describe('CSS — รูเจาะ + แถวบาร์โค้ด ต้องประกาศไว้ใน Doomuenjing Dashboard.html', () => {
  it('.label-hole เป็นวงกลม 4mm (เท่ารูเจาะกระดาษมาตรฐาน)', () => {
    const rule = grab(HTML, /\.label-hole \{[\s\S]*?\}/, '.label-hole');
    expect(rule).toMatch(/width: 4mm/);
    expect(rule).toMatch(/height: 4mm/);
    expect(rule).toMatch(/border-radius: 50%/);
  });
  it('.label-barcode-box ใช้ flex:1 (ไม่ hardcode mm ตายตัว — เผื่อที่ตามจริงหลังหักรูเจาะ+โลโก้)', () => {
    const rule = grab(HTML, /\.label-barcode-box \{[^}]*\}/, '.label-barcode-box');
    expect(rule).toMatch(/flex: 1/);
  });
  it('.label-barcode-row เผื่อ padding-left ให้ .label-hole (คนละ element กัน ไม่ใช่ลูกในแถวเดียวกัน)', () => {
    const rule = grab(HTML, /\.label-barcode-row \{[\s\S]*?\}/, '.label-barcode-row');
    expect(rule).toMatch(/padding-left/);
  });
});

describe('LabelPrintView — state ชนิดโค้ด (default QR + จำต่อเครื่อง)', () => {
  it('ค่าเริ่มต้นเป็น "qr" เสมอเมื่อยังไม่เคยตั้งค่า', () => {
    const init = grab(ANA, /const \[codeType, setCodeTypeRaw\] = uS\(\(\) => \{[\s\S]*?\n  \}\);/, 'codeType init');
    expect(init).toMatch(/=== "barcode" \? "barcode" : "qr"/);
    expect(init).toMatch(/catch \(e\) \{ return "qr"; \}/);
  });
  it('setCodeType เขียนลง localStorage คีย์ dmj_label_code_type ให้จำข้ามการเปิดแอป', () => {
    const fn = grab(ANA, /const setCodeType = \(v\) => \{[\s\S]*?\n  \};/, 'setCodeType');
    expect(fn).toMatch(/localStorage\.setItem\("dmj_label_code_type", v\)/);
  });
});

describe('LabelPrintView — สร้างบาร์โค้ดด้วย JsBarcode (คนละ map กับ qrMap)', () => {
  const fn = grab(ANA, /const doGenerateBarcode = uC\(\(skus\) => \{[\s\S]*?\n  \}, \[\]\);/, 'doGenerateBarcode');
  it('ใช้ window.JsBarcode รูปแบบ CODE128 พร้อม displayValue (โชว์เลข SKU ในตัวบาร์โค้ดเอง)', () => {
    expect(fn).toMatch(/window\.JsBarcode/);
    expect(fn).toMatch(/format: "CODE128"/);
    expect(fn).toMatch(/displayValue: true/);
  });
  it('ไม่พังทั้งแอปถ้าไลบรารียังไม่โหลด (guard เหมือน qrcodejs)', () => {
    expect(fn).toMatch(/if \(!JB\) \{ console\.warn\("jsbarcode not loaded"\); return; \}/);
  });
  it('เก็บผลลง barcodeMap แยกจาก qrMap — สลับปุ่มไปมาไม่ต้อง generate ซ้ำ', () => {
    expect(fn).toMatch(/setBarcodeMap\(prev => \(\{ \.\.\.prev, \.\.\.results \}\)\)/);
  });
  it('เพิ่ง generate ตอนเลือกโหมด Barcode อยู่จริง (กันคำนวณทิ้งเปล่าให้คนที่ไม่เคยสลับไปใช้)', () => {
    const eff = grab(ANA, /uE\(\(\) => \{\s*\n\s*\/\/ สร้างเฉพาะตอนเลือกโหมด Barcode[\s\S]*?\n  \}, \[items, codeType, doGenerateBarcode\]\);/, 'barcode gen effect');
    expect(eff).toMatch(/if \(codeType !== "barcode"\) return;/);
  });
});

describe('A4 preview — รูเจาะติดทุกโหมด, SKU text ซ้ำถูกตัดทิ้งเฉพาะ barcode', () => {
  const block = grab(ANA, /pages\.map\(\(page, pi\) => \([\s\S]*?<\/div>\s*\)\)\s*\n\s*\) : printMode === "card"/, 'a4 preview block');

  it('.label-hole อยู่นอกเงื่อนไข codeType (ไม่ผูกกับ QR/Barcode)', () => {
    // ต้องอยู่ก่อน branch เช็ค codeType เสมอ — งั้น hole จะหายไปเวลาสลับโหมดใดโหมดหนึ่ง
    const holeIdx = block.indexOf('className="label-hole"');
    const branchIdx = block.indexOf('codeType === "barcode" ?');
    expect(holeIdx).toBeGreaterThan(-1);
    expect(holeIdx).toBeLessThan(branchIdx);
  });
  it('โหมด Barcode ไม่มีแถว .label-sku-text ซ้ำ (บาร์โค้ดมีเลขในตัวแล้ว)', () => {
    expect(block).toMatch(/\{codeType !== "barcode" && <div className="label-sku-text">\{p\.sku\}<\/div>\}/);
  });
  it('โหมด QR ยังใช้ label-qr-center/label-logo-corner เดิมทุกประการ (ไม่แตะ layout เดิม)', () => {
    expect(block).toMatch(/className="label-qr-center"/);
    expect(block).toMatch(/className="label-logo-corner"/);
  });
});

describe('ปุ่มสลับ QR/Barcode — เฉพาะโหมด A4/สติ๊กเกอร์ ไม่ใช่โหมดการ์ด/Static Template', () => {
  it('ห่อด้วย printMode !== "card" && !isStaticTemplate', () => {
    expect(ANA).toMatch(/\{printMode !== "card" && !isStaticTemplate && \(\s*\n\s*<div style=\{\{display:"flex",alignItems:"center",gap:8,marginBottom:14/);
  });
  it('มีตัวเลือกครบ qr + barcode', () => {
    const seg = grab(ANA, /\[\{id:"qr",label:"🔲 QR"\},\{id:"barcode",label:"▤ Barcode"\}\]/, 'code type segmented control');
    expect(seg).toBeTruthy();
  });
});

describe('สติ๊กเกอร์ (printVaseLabels) — รองรับ barcode ด้วย ไม่มีรูเจาะ', () => {
  const fn = grab(ANA, /const printVaseLabels = uC\(\(\) => \{[\s\S]*?\n  \}, \[labelList, qrMap, barcodeMap, codeType, logoSrc, printMode\]\);/, 'printVaseLabels');

  it('แตกสาขาตาม isBc แล้วใช้ barcodeMap แทน qrMap', () => {
    expect(fn).toMatch(/const isBc = codeType === "barcode";/);
    expect(fn).toMatch(/barcodeMap\[p\.sku\]/);
  });
  it('โหมด barcode ไม่มีแถว .lsku ซ้ำ', () => {
    expect(fn).toMatch(/\$\{isBc \? "" : `<div class="lsku">\$\{p\.sku\}<\/div>`\}/);
  });
  it('ไม่มี .label-hole/รูเจาะใด ๆ ในเทมเพลตนี้ (สติ๊กเกอร์แปะติดตัว ไม่ได้ร้อยแขวน)', () => {
    expect(fn).not.toMatch(/lbl-hole|label-hole/);
  });
  it('dependency array ของ useCallback มี barcodeMap + codeType + printMode (กัน closure ค้างของเก่าตอนกดพิมพ์หลังสลับโหมด/รูปแบบสติ๊กเกอร์)', () => {
    expect(ANA).toMatch(/\}, \[labelList, qrMap, barcodeMap, codeType, logoSrc, printMode\]\);/);
  });
});
