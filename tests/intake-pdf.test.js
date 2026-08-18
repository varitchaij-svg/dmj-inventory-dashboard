// tests/intake-pdf.test.js — ของเข้าใหม่ → บันทึก PDF แยกตามรหัสซัพพลายเออร์ + วันที่
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026): การ์ด "ของเข้าใหม่" ต้องมีปุ่มบันทึก PDF — เลือกวันเองแบบติ๊กถูก
// แล้วแยกหน้าตาม (รหัสซัพพลายเออร์ × วันที่) · 1 หน้า = 1 ซัพพลายเออร์ ต่อ 1 วัน
//
// eval ฟังก์ชันจริงจาก views-main.jsx (ไม่ copy — กันสำเนา drift เหมือน mto-group.test.js)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');
const SW   = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

const F_LONG = grab(MAIN, /function intakeDateLong\(iso\) \{[\s\S]*?\n\}/, 'intakeDateLong');
const F_OPTS = grab(MAIN, /function intakeDateOptions\(purchases, sinceStr\) \{[\s\S]*?\n\}/, 'intakeDateOptions');
const F_PAGE = grab(MAIN, /function buildIntakePages\(purchases, selectedDates\) \{[\s\S]*?\n\}/, 'buildIntakePages');
const F_GRID = grab(MAIN, /function intakeCardGrid\(opt\) \{[\s\S]*?\n\}/, 'intakeCardGrid');
// eslint-disable-next-line no-new-func
const { intakeDateLong, intakeDateOptions, buildIntakePages, intakeCardGrid } = new Function(
  F_LONG + '\n' + F_OPTS + '\n' + F_PAGE + '\n' + F_GRID +
  '\nreturn { intakeDateLong, intakeDateOptions, buildIntakePages, intakeCardGrid };'
)();

describe('intakeCardGrid — คำนวณกริดเต็มหน้า A4 ประหยัดกระดาษ', () => {
  it('default: 3 คอลัมน์ (การ์ดกว้าง ~60mm) + หลายแถว เต็มหน้า', () => {
    const g = intakeCardGrid();
    expect(g.cols).toBe(3);                 // 198mm / 60mm → 3
    expect(g.rows).toBeGreaterThanOrEqual(4);
    expect(g.perPage).toBe(g.cols * g.rows);
  });
  it('การ์ดกว้างขึ้น/แคบลง → คอลัมน์เปลี่ยนตาม targetWmm จริง', () => {
    expect(intakeCardGrid({ targetWmm: 99 }).cols).toBe(2);   // การ์ดใหญ่
    expect(intakeCardGrid({ targetWmm: 48 }).cols).toBe(4);   // การ์ดเล็ก
  });
  it('อย่างน้อย 1×1 เสมอ (กันหารเป็น 0)', () => {
    const g = intakeCardGrid({ targetWmm: 9999 });
    expect(g.cols).toBe(1); expect(g.rows).toBeGreaterThanOrEqual(1);
  });
});

// ── ตัวอย่างรายการซื้อ (รูปแบบเดียวกับ readPurchases_) ──
const PURCHASES = [
  { date: '2026-08-16', supplier: 'G082505', poNum: 'PO-1', sku: 'CM09017', name: 'คอสมอส ส้ม 58', qty: 360 },
  { date: '2026-08-16', supplier: 'G082505', poNum: 'PO-1', sku: 'CM13017', name: 'คอสมอส ม่วง 58', qty: 362 },
  { date: '2026-08-16', supplier: 'GX2312',  poNum: 'PO-2', sku: 'BY00006', name: 'ใบไทรยา 108',   qty: 240 },
  { date: '2026-08-13', supplier: 'G082505', poNum: 'PO-3', sku: 'CM09017', name: 'คอสมอส ส้ม 58', qty: 100 },
  { date: '2026-08-16', supplier: 'G082505', poNum: 'PO-1', sku: 'CM09017', name: 'คอสมอส ส้ม 58', qty: 40 },  // สั่งซ้ำวันเดียวกัน
];

describe('intakeDateLong — ISO → วันที่ไทย (พ.ศ.)', () => {
  it('2026-08-16 → 16 สิงหาคม 2569', () => {
    expect(intakeDateLong('2026-08-16')).toBe('16 สิงหาคม 2569');
  });
  it('รูปแบบไม่ตรง / ว่าง → คืนค่าเดิม ไม่ throw', () => {
    expect(intakeDateLong('')).toBe('');
    expect(intakeDateLong(null)).toBe('');
    expect(intakeDateLong('16/08/2026')).toBe('16/08/2026');
  });
});

describe('intakeDateOptions — รายวันที่มีของเข้า (ใหม่สุดก่อน)', () => {
  it('รวมต่อวัน + นับซัพพลายเออร์/SKU/จำนวน ถูกต้อง', () => {
    const opts = intakeDateOptions(PURCHASES, '');
    expect(opts.map(o => o.date)).toEqual(['2026-08-16', '2026-08-13']);   // ใหม่สุดก่อน
    const d16 = opts.find(o => o.date === '2026-08-16');
    expect(d16.nSup).toBe(2);                 // G082505, GX2312
    expect(d16.nSku).toBe(3);                 // CM09017, CM13017, BY00006
    expect(d16.totQty).toBe(360 + 362 + 240 + 40);
  });
  it('sinceStr ตัดวันเก่ากว่าทิ้ง', () => {
    const opts = intakeDateOptions(PURCHASES, '2026-08-15');
    expect(opts.map(o => o.date)).toEqual(['2026-08-16']);
  });
  it('ข้ามแถวไม่มี sku / วันที่ไม่ใช่ ISO', () => {
    const opts = intakeDateOptions([
      { date: '2026-08-16', supplier: 'A', sku: '' },
      { date: 'bad-date',   supplier: 'A', sku: 'X', qty: 5 },
      { date: '2026-08-16', supplier: 'A', sku: 'Y', qty: 5 },
    ], '');
    expect(opts).toHaveLength(1);
    expect(opts[0].nSku).toBe(1);
  });
});

describe('buildIntakePages — 1 กลุ่ม = 1 ซัพพลายเออร์ ต่อ 1 วัน', () => {
  it('เลือก 2 วัน → แยกหน้าตาม (วัน × ซัพพลายเออร์)', () => {
    const pages = buildIntakePages(PURCHASES, ['2026-08-16', '2026-08-13']);
    // 16: G082505 + GX2312 = 2 · 13: G082505 = 1 → รวม 3 กลุ่ม
    expect(pages).toHaveLength(3);
    // เรียงวันใหม่สุดก่อน แล้ว supplier a→z
    expect(pages.map(p => [p.date, p.supplier])).toEqual([
      ['2026-08-16', 'G082505'],
      ['2026-08-16', 'GX2312'],
      ['2026-08-13', 'G082505'],
    ]);
  });
  it('รวมจำนวนต่อ SKU ที่สั่งซ้ำวันเดียวกัน', () => {
    const pages = buildIntakePages(PURCHASES, ['2026-08-16']);
    const g = pages.find(p => p.supplier === 'G082505');
    const cm = g.items.find(it => it.sku === 'CM09017');
    expect(cm.qty).toBe(400);                 // 360 + 40
    expect(g.nSku).toBe(2);                    // CM09017, CM13017
    expect(g.totQty).toBe(400 + 362);
    expect(g.pos).toEqual(['PO-1']);
  });
  it('items เรียงตาม SKU แบบ numeric', () => {
    const pages = buildIntakePages([
      { date: '2026-08-16', supplier: 'A', sku: 'CM10017', name: 'x', qty: 1 },
      { date: '2026-08-16', supplier: 'A', sku: 'CM09017', name: 'y', qty: 1 },
    ], ['2026-08-16']);
    expect(pages[0].items.map(it => it.sku)).toEqual(['CM09017', 'CM10017']);
  });
  it('ไม่เลือกวัน / วันที่ไม่มีของ → คืน []', () => {
    expect(buildIntakePages(PURCHASES, [])).toEqual([]);
    expect(buildIntakePages(PURCHASES, ['2099-01-01'])).toEqual([]);
  });
  it('ซัพพลายเออร์ว่าง → "ไม่ระบุซัพพลายเออร์" (ไม่หายเงียบ)', () => {
    const pages = buildIntakePages([
      { date: '2026-08-16', supplier: '', sku: 'X1', name: 'x', qty: 3 },
    ], ['2026-08-16']);
    expect(pages).toHaveLength(1);
    expect(pages[0].supplier).toBe('ไม่ระบุซัพพลายเออร์');
  });
  it('รับ Set ได้เหมือน array', () => {
    const pages = buildIntakePages(PURCHASES, new Set(['2026-08-13']));
    expect(pages).toHaveLength(1);
    expect(pages[0].supplier).toBe('G082505');
  });
});

// ── meta-test: จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น ──
describe('meta — สายส่งการพิมพ์ต้องครบ', () => {
  it('ปุ่ม "บันทึก PDF" เปิดโมดัล + โมดัลถูก render จริง', () => {
    expect(MAIN).toMatch(/setIntakePdfOpen\(true\)/);
    expect(MAIN).toMatch(/intakePdfOpen && <IntakePdfModal/);
  });
  it('โมดัล render เอกสารผ่าน portal ไป document.body (ไม่งั้นเนื้อหาถูก #root ซ่อนตอนพิมพ์)', () => {
    expect(MAIN).toMatch(/ReactDOM\.createPortal\(<IntakePdfDoc[\s\S]*?document\.body\)/);
  });
  it('runIntakePrint เพิ่ม body.intake-printing แล้วถอดตอน afterprint', () => {
    const fn = grab(MAIN, /function runIntakePrint\(fileName\) \{[\s\S]*?\n\}/, 'runIntakePrint');
    expect(fn).toMatch(/classList\.add\("intake-printing"\)/);
    expect(fn).toMatch(/classList\.remove\("intake-printing"\)/);
    expect(fn).toMatch(/addEventListener\("afterprint"[\s\S]*?window\.print\(\)/); // ผูก listener ก่อน print
  });
  it('doPrint สั่งพิมพ์ผ่าน runIntakePrint (ไม่เรียก window.print ตรง)', () => {
    expect(MAIN).toMatch(/runIntakePrint\(`\$\{labelMode \? "แผ่นแปะสินค้า" : "สินค้าเข้าใหม่"\}/);
  });
});

describe('meta — CSS การพิมพ์ + cache', () => {
  it('HTML มี .intake-print-area (display:none บนจอ) + กฎ @media print', () => {
    expect(HTML).toMatch(/\.intake-print-area\s*\{\s*display:\s*none;/);
    expect(HTML).toMatch(/body\.intake-printing\s+#root\s*\{\s*display:\s*none/);
    expect(HTML).toMatch(/body\.intake-printing\s+\.intake-print-area\s*\{\s*display:\s*block/);
    expect(HTML).toMatch(/\.intake-print-page\s*\{[\s\S]*?width:\s*210mm/);
  });
  it('CACHE_NAME ถูก bump (เพิ่ม CSS ใน HTML — บทเรียนข้อ 15)', () => {
    const m = SW.match(/CACHE_NAME\s*=\s*"dmj-v(\d+)"/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(37);
  });
});

describe('meta — iOS ตัดขอบ + QR (แก้ ส.ค. 2026)', () => {
  it('runIntakePrint ตั้ง class intake-printing ทั้ง html และ body (ปลด overflow/max-width)', () => {
    const fn = grab(MAIN, /function runIntakePrint\(fileName\) \{[\s\S]*?\n\}/, 'runIntakePrint');
    expect(fn).toMatch(/documentElement\.classList\.add\("intake-printing"\)/);
    expect(fn).toMatch(/documentElement\.classList\.remove\("intake-printing"\)/);
  });
  it('CSS ปลด overflow/max-width ของ html+body ตอนพิมพ์ (ไม่งั้น iOS ตัดขอบ 210mm)', () => {
    expect(HTML).toMatch(/html\.intake-printing,\s*body\.intake-printing\s*\{[\s\S]*?overflow:\s*visible[\s\S]*?max-width:\s*none/);
  });
  it('การ์ดมีช่อง QR + IntakePdfModal สร้าง QR ด้วย window.QRCode ส่ง qrMap', () => {
    expect(MAIN).toMatch(/function IntakePdfCard\(\{ item, index, prod, qr, labelMode, supplier \}\)/);
    expect(MAIN).toMatch(/const QR = window\.QRCode/);
    expect(MAIN).toMatch(/<IntakePdfDoc pages=\{pages\} prodBySku=\{prodBySku\} qrMap=\{qrMap\} labelMode=\{labelMode\}/);
  });
});

describe('meta — labelMode "แผ่นแปะสินค้า" (พิมพ์ label) ไม่แตะหน้าภาพรวม (ส.ค. 2026)', () => {
  it('IntakePdfDoc/Card/Modal รับ labelMode', () => {
    expect(MAIN).toMatch(/function IntakePdfDoc\(\{ pages, prodBySku, qrMap, labelMode \}\)/);
    expect(MAIN).toMatch(/function IntakePdfModal\(\{ purchases, prodBySku, onClose, labelMode \}\)/);
  });
  it('labelMode: ซ่อนหัวเอกสาร+สรุป(เลข PO)+ท้ายเอกสาร (การ์ดเต็มหน้า)', () => {
    const doc = grab(MAIN, /function IntakePdfDoc[\s\S]*?\n\}\n/, 'IntakePdfDoc');
    // หัวเอกสาร/สรุป/ท้าย ห่อด้วย !labelMode
    expect(doc).toMatch(/\{!labelMode && \(/);
    // เลขที่ PO อยู่ในบล็อกที่ถูกซ่อนตอน labelMode
    expect(doc).toMatch(/เลขที่ PO/);
  });
  it('labelMode: การ์ดแนวนอน(รูปซ้ายเด่น) + เส้นประ + SKU ตัวใหญ่ + รูป fit + ไม่มี NEW', () => {
    const card = grab(MAIN, /function IntakePdfCard[\s\S]*?\n\}\n/, 'IntakePdfCard');
    expect(card).toMatch(/if \(labelMode\) \{/);           // แยกโหมดชัดเจน
    expect(card).toMatch(/flexDirection:"row"/);           // แนวนอน (รูปซ้าย/รายละเอียดขวา)
    expect(card).toMatch(/width:"54%"/);                   // รูปเด่นสุด (>50%)
    expect(card).toMatch(/1px dashed/);                    // เส้นประสำหรับตัด
    expect(card).toMatch(/fontSize:"11pt",fontWeight:900,fontFamily:"monospace"/); // SKU ตัวใหญ่ (ใต้ QR)
    expect(card).toMatch(/QR ตรงกลาง \+ SKU ใต้ QR/);      // QR อยู่กลาง + SKU ใต้ QR
    expect(card).toMatch(/flexDirection:"column",alignItems:"center"/); // QR/SKU จัดกลาง
    expect(card).toMatch(/supplier \?/);                   // รหัสซัพในการ์ด
    expect(card).toMatch(/objectFit:"contain"/);           // รูป fit (ไม่ครอป)
    // ป้าย NEW อยู่เฉพาะโหมดปกติ (return ท้าย) — โหมดแผ่นแปะไม่มี
    const labelBranch = card.slice(card.indexOf('if (labelMode)'), card.indexOf('// ── โหมดปกติ'));
    expect(labelBranch).not.toMatch(/>NEW</);
  });
  it('labelMode: กริดคำนวณเอง (intakeCardGrid), gap 0 (เส้นประชิด), เต็มหน้า', () => {
    const doc = grab(MAIN, /function IntakePdfDoc[\s\S]*?\n\}\n/, 'IntakePdfDoc');
    expect(doc).toMatch(/const grid = intakeCardGrid\(\)/);
    expect(doc).toMatch(/const perPage = labelMode \? grid\.perPage : INTAKE_PDF_PER_PAGE/);
    expect(doc).toMatch(/gridTemplateColumns:`repeat\(\$\{grid\.cols\}/);
    expect(doc).toMatch(/gridTemplateRows:`repeat\(\$\{grid\.rows\}/);
    expect(doc).toMatch(/gap:0,flex:1/);
    // เอกสารแผ่นแปะใช้ class "label" (ขอบแคบ เต็มหน้า)
    expect(doc).toMatch(/labelMode \? "intake-print-page label" : "intake-print-page"/);
    expect(HTML).toMatch(/\.intake-print-page\.label\s*\{\s*padding:\s*6mm/);
  });
  it('.card-label-cell (เลือกเอง) เป็นเส้นประเหมือนโหมดพิมพ์การ์ดเต็มหน้า', () => {
    expect(HTML).toMatch(/\.card-label-cell\s*\{[\s\S]*?border:\s*[^;]*dashed/);
  });
  it('หน้าภาพรวม (OverviewView) เปิด IntakePdfModal โดย "ไม่" ส่ง labelMode (ยังเป็นเอกสารเดิม)', () => {
    // views-main OverviewView เรียกแบบไม่มี labelMode
    expect(MAIN).toMatch(/<IntakePdfModal purchases=\{\(data && data\.purchases\) \|\| \[\]\} prodBySku=\{prodBySku\} onClose=/);
  });
});
