// tests/mto-pos-picker.test.js — Step 5: MTO Picker ใน PosView (views-analytics.jsx)
// ─────────────────────────────────────────────────────────────────────────────
// meta-test แบบ source-pattern (เหมือน tests/saler-fs-count.test.js) — ล็อก 2 กติกาที่เจ้าของ
// สั่งไว้ชัดเจนตอนอนุมัติ Step 5:
//   1) POS ต้องใช้ field `sellable` จาก backend ตรง ๆ ห้าม re-derive กฎ Fulfillment/Sale เอง
//   2) MTO Picker ต้องโชว์ Job Name / Customer / Price / Assignee / Created Date อย่างน้อย
// ไม่ eval ตรรกะ (เป็น JSX/UI ไม่ใช่ pure function) — สแกนซอร์สจริงแทน ผูกกับก้อนโค้ดที่แก้จริง
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANALYTICS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (' + (label || 'pattern') + ' — โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ตัดด้วยตำแหน่งเริ่ม/จบฟังก์ชันตรง ๆ (ไม่ใช้ regex ไล่หา closing brace — คอมเมนต์ไทยยาว
// ระหว่าง PosView กับ OnlineSaleResult ทำให้ regex แบบ non-greedy พลาดง่าย)
const POS_VIEW_START = ANALYTICS.indexOf('function PosView({ data, role }) {');
const POS_VIEW_END = ANALYTICS.indexOf('function OnlineSaleResult(', POS_VIEW_START);
if (POS_VIEW_START < 0 || POS_VIEW_END < 0) throw new Error('หา PosView ในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?)');
const POS_VIEW = ANALYTICS.slice(POS_VIEW_START, POS_VIEW_END);

// ตัดคอมเมนต์ทิ้งก่อนตรวจ "โค้ดต้องไม่มีแพทเทิร์นนี้" — ไม่งั้นคอมเมนต์ที่อธิบายว่า "ห้ามทำแบบนี้"
// จะไปทำให้เทสต์แดงเอง ทั้งที่โค้ดจริงไม่ได้ทำ (แพทเทิร์นเดียวกับ shipment-receive-heal.test.js)
function codeOnly(s) {
  return String(s).split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n');
}
const POS_VIEW_CODE = codeOnly(POS_VIEW);

describe('MTO Picker ใน PosView — ห้าม re-derive กฎการขายเอง', () => {
  it('กรอง sellable ด้วย j.sellable ตรง ๆ (ไม่เทียบ status/saleStatus เอง)', () => {
    expect(POS_VIEW).toMatch(/j\s*&&\s*j\.sellable/);
  });
  it('ไม่มีการเทียบ job.status === "เสร็จแล้ว" หรือ saleStatus เองใน PosView (กฎอยู่ backend เท่านั้น)', () => {
    // ใช้ POS_VIEW_CODE (ตัดคอมเมนต์แล้ว) — คอมเมนต์อธิบาย "ห้ามทำแบบนี้" มีคำต้องห้ามอยู่ในตัว
    expect(POS_VIEW_CODE).not.toMatch(/job\.status\s*===\s*["']เสร็จแล้ว["']/);
    expect(POS_VIEW_CODE).not.toMatch(/\.saleStatus\s*===\s*["'](ยังไม่ขาย|ขายแล้ว)["']/);
  });
  it('mtoJobs มาจาก data.mtoJobs (payload backend) ไม่ใช่ state คำนวณเอง', () => {
    expect(POS_VIEW).toMatch(/const mtoJobs = \(data && data\.mtoJobs\) \|\| \[\];/);
  });
});

describe('MTO Picker — แสดงครบ Job Name / Customer / Price / Assignee / Created Date', () => {
  it('แสดง jobName (ชื่องาน)', () => {
    expect(POS_VIEW).toMatch(/job\.jobName/);
  });
  it('แสดง customer (ลูกค้า)', () => {
    expect(POS_VIEW).toMatch(/job\.customer/);
  });
  it('แสดง price (ราคา) ผ่าน fmtBfull', () => {
    expect(POS_VIEW).toMatch(/fmtBfull\(job\.price\)/);
  });
  it('แสดง assigneeName (ผู้รับผิดชอบ)', () => {
    expect(POS_VIEW).toMatch(/job\.assigneeName/);
  });
  it('แสดง date (วันที่สร้างงาน)', () => {
    expect(POS_VIEW).toMatch(/\{job\.date\}/);
  });
});

describe('MTO cart line — 1 งาน = 1 บรรทัด ราคาเดียว (ตามนโยบาย ONE SKU ONE PRICE)', () => {
  it('addMtoJobToCart ล็อก qty ไว้ที่ 1 เสมอ', () => {
    const fn = grab(POS_VIEW, /function addMtoJobToCart\(job\) \{[\s\S]*?\n  \}/, 'addMtoJobToCart');
    expect(fn).toMatch(/qty:\s*1,/);
  });
  it('ตะกร้าไม่ให้แก้จำนวนของบรรทัด MTO (ห้ามมี input จำนวนสำหรับ isMto)', () => {
    expect(POS_VIEW_CODE).toMatch(/\{isMto\s*\?[\s\S]*?:\s*<input type="number"/);
  });
  it('category ของบรรทัด MTO ตั้งเป็นคีย์เวิร์ดที่ถูกยกเว้นส่วนลดขายส่ง (ไม่ใช่การเขียนกฎซ้ำ)', () => {
    const fn = grab(POS_VIEW, /function addMtoJobToCart\(job\) \{[\s\S]*?\n  \}/, 'addMtoJobToCart');
    expect(fn).toMatch(/category:\s*"Made to Order จัดแบบพิเศษ"/);
  });
  it('mtoJobId ถูกส่งไปกับ payload ตอน submitBill (จุดเชื่อมกับ backend splitMtoSaleItems_)', () => {
    const fn = grab(POS_VIEW, /async function submitBill\(\) \{[\s\S]*?\n  \}/, 'submitBill');
    expect(fn).toMatch(/mtoJobId:\s*it\.mtoJobId \|\| undefined/);
  });
});

describe('MTO cart line — component ไม่เคยอยู่ใน cart (รับประกัน "ใบเสร็จบรรทัดเดียว")', () => {
  it('addMtoJobToCart ไม่มี field components/items ของวัตถุดิบเลย', () => {
    const fn = grab(POS_VIEW, /function addMtoJobToCart\(job\) \{[\s\S]*?\n  \}/, 'addMtoJobToCart');
    expect(fn).not.toMatch(/components/);
    expect(fn).not.toMatch(/job\.items/);
  });
});
