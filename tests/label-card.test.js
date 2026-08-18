// tests/label-card.test.js — โหมด "การ์ดสินค้า" ในพิมพ์ label + endpoint recentIntake
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของสั่ง (ส.ค. 2026): เพิ่มหัวข้อพิมพ์ "แผ่นแปะสินค้า" (การ์ด QR + จำนวนเข้า + รหัสร้าน)
// ในแท็บพิมพ์ label · ใส่ SKU เอง · ของเพิ่งเข้าคลังขึ้นก่อน · และให้ warehouse/saler
// ดาวน์โหลดเอกสารของเข้าใหม่ (แยกซัพพลายเออร์) ได้ด้วย
//
// ส่วนใหญ่เป็น meta-test สแกนต้นทางจริง (LabelPrintView เป็น React component ใหญ่ eval ตรงไม่ได้)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANA  = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');
const MAIN = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');
const GS   = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');
const SW   = readFileSync(join(ROOT, 'service-worker.js'), 'utf8');

function grab(src, re, label) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + label);
  return m[0];
}

describe('backend — recentIntakeHandler_ (ของเข้าใหม่สำหรับ warehouse/saler)', () => {
  const fn = grab(GS, /function recentIntakeHandler_\(daysRaw\) \{[\s\S]*?\n\}/, 'recentIntakeHandler_');
  it('doGet dispatch action=recentIntake → recentIntakeHandler_', () => {
    expect(GS).toMatch(/action === 'recentIntake'\)\s*\{\s*\n\s*return recentIntakeHandler_\(e\.parameter\.days\)/);
  });
  it('⚠️ ตัด unitPrice (ต้นทุน) ออก — ห้าม leak ให้ role ที่ไม่ใช่ owner', () => {
    expect(fn).not.toMatch(/unitPrice:/);   // ต้องไม่มีการ push ฟิลด์ต้นทุน (comment มีคำได้)
    // ส่งเฉพาะฟิลด์ปลอดภัย
    for (const k of ['sku', 'name', 'qty', 'supplier', 'poNum', 'date', 'warehouse'])
      expect(fn, 'ต้องส่งฟิลด์ ' + k).toMatch(new RegExp(k + ':'));
  });
  it('กรองด้วยวันที่ (ISO) + clamp ช่วงวัน', () => {
    expect(fn).toMatch(/pu\.date < cutStr/);
    expect(fn).toMatch(/Math\.min\(180, Math\.max\(1/);
  });
});

describe('frontend — syncRecentIntake', () => {
  const fn = grab(ANA, /async function syncRecentIntake\(days\) \{[\s\S]*?\n\}/, 'syncRecentIntake');
  it('ยิง action=recentIntake ผ่าน dmjJson (บทเรียนข้อ 13) คืน purchases[]', () => {
    expect(fn).toMatch(/action=recentIntake&days=/);
    expect(fn).toMatch(/dmjJson\(/);
    expect(fn).toMatch(/Array\.isArray\(d\.purchases\)/);
  });
});

describe('LabelPrintView — โหมดการ์ด', () => {
  it('ปุ่มสลับโหมดมี id "card" (📇 การ์ดสินค้า)', () => {
    expect(ANA).toMatch(/\{id:"card",\s*label:"📇 การ์ดสินค้า"/);
  });
  it('cardList = 1 การ์ด/SKU · กริดคำนวณเอง (intakeCardGrid) ไม่ hard-code 9', () => {
    expect(ANA).toMatch(/const cardList = uM\(\(\) => items\.map\(it => productMap\[it\.sku\]\)\.filter\(Boolean\)/);
    expect(ANA).toMatch(/const cardGrid = uM\(\(\) => \(typeof intakeCardGrid === "function"/);
    expect(ANA).toMatch(/i \+= cardGrid\.perPage/);
    expect(ANA).not.toMatch(/const CARDS_PER_PAGE/);        // เลิก hard-code
  });
  it('พิมพ์ทั้ง 2 ปุ่มใช้ IntakePdfCard(labelMode) ตัวเดียวกัน → หน้าตาเหมือนกัน', () => {
    expect(ANA).toMatch(/printMode === "card" \? \(/);
    expect(ANA).toMatch(/className="card-label-page"/);
    // ใช้ IntakePdfCard (global จาก views-main) ไม่ใช่ .card-label-cell JSX ของตัวเอง
    expect(ANA).toMatch(/<IntakePdfCard key=\{p\.sku\}[\s\S]*?labelMode supplier=\{intakeInfo\.supMap\[p\.sku\]\}/);
    expect(ANA).not.toMatch(/className="card-label-cell"/);
    expect(MAIN).toMatch(/function IntakePdfCard\(/);
  });
  it('รหัสร้าน + จำนวนเข้า ดึงอัตโนมัติจาก intake (ไม่ต้องกรอก — เลิก storeCodes)', () => {
    expect(ANA).not.toMatch(/const \[storeCodes/);           // เลิก state กรอกเอง
    expect(ANA).not.toMatch(/placeholder="รหัสร้าน"/);         // เลิกช่องกรอก
    expect(ANA).toMatch(/intakeInfo\.supMap\[item\.sku\]/);    // รหัสร้านอัตโนมัติ (แถวรายการ)
    expect(ANA).toMatch(/intakeInfo\.qtyMap\[item\.sku\]/);    // จำนวนเข้าอัตโนมัติ
    // การ์ดรับ supplier(รหัสร้าน)+qty(จำนวนเข้า) จาก intake
    expect(ANA).toMatch(/qty: intakeInfo\.qtyMap\[p\.sku\] \|\| 0/);
  });
});

describe('LabelPrintView — ของเพิ่งเข้าคลังขึ้นก่อน + PDF ให้เจ้าของ', () => {
  it('intakeInfo เรียงใหม่สุดก่อน (date desc)', () => {
    const fn = grab(ANA, /const intakeInfo = uM\(\(\) => \{[\s\S]*?\}, \[intakePurchases\]\)/, 'intakeInfo');
    expect(fn).toMatch(/a\.date < b\.date \? 1 : a\.date > b\.date \? -1 : 0/);
  });
  it('owner ใช้ data.purchases · role อื่นดึงผ่าน syncRecentIntake', () => {
    expect(ANA).toMatch(/data\.purchases\).*\? data\.purchases : null/);
    expect(ANA).toMatch(/const list = await syncRecentIntake\(90\)/);
  });
  it('ชิป "เพิ่งเข้าคลัง" เรียก addSkuDirect (เพิ่ม 1 การ์ด/SKU ไม่ซ้ำ)', () => {
    expect(ANA).toMatch(/const addSkuDirect = sku =>/);
    expect(ANA).toMatch(/onClick=\{\(\) => addSkuDirect\(g\.sku\)\}/);
  });
  it('ปุ่มพิมพ์การ์ดเต็มหน้า เปิด IntakePdfModal แบบ labelMode (global จาก views-main)', () => {
    expect(ANA).toMatch(/setIntakePdfOpen\(true\)/);
    expect(ANA).toMatch(/intakePdfOpen && typeof IntakePdfModal === "function"/);
    // ฝั่งพิมพ์ label ส่ง labelMode → เอกสารเป็นแผ่นแปะ (เส้นประตัด/ไม่มีหัวเอกสาร)
    expect(ANA).toMatch(/<IntakePdfModal purchases=\{intakePurchases \|\| \[\]\} prodBySku=\{prodBySkuMap\} labelMode/);
    // IntakePdfModal ต้องมีจริงใน views-main (โหลดก่อน views-analytics)
    expect(MAIN).toMatch(/function IntakePdfModal\(/);
  });
});

describe('meta — CSS + cache', () => {
  it('HTML มี .card-label-page (210mm) + .card-label-grid 3 คอลัมน์', () => {
    expect(HTML).toMatch(/\.card-label-page\s*\{[\s\S]*?width:\s*210mm/);
    expect(HTML).toMatch(/\.card-label-grid\s*\{[\s\S]*?repeat\(3,/);
  });
  it('CACHE_NAME ถูก bump (เพิ่ม CSS ใน HTML — บทเรียนข้อ 15)', () => {
    const m = SW.match(/CACHE_NAME\s*=\s*"dmj-v(\d+)"/);
    expect(Number(m[1])).toBeGreaterThanOrEqual(36);
  });
});
