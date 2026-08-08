// tests/quote-print-mobile.test.js — ปุ่มพิมพ์ในแท็บ "ใบเสนอราคา (ตามปิด)" ต้องครบทั้ง 2 ชนิด
// ทั้งบนมือถือและบนจอกว้าง
// ─────────────────────────────────────────────────────────────────────────────
// เจ้าของแจ้ง (2026-08-08): "ในโทรศัพท์ที่ปริ้นใบแจ้งหนี้หาย แต่แนวนอนยังอยู่"
//
// ต้นเหตุ: `QuoteFollowupView` เรนเดอร์คนละอย่างตามความกว้างจอ (`useIsMobile()` = ≤600px)
//   · จอกว้าง/มือถือแนวนอน → ตาราง ซึ่งมีปุ่ม 🖨️ (ใบเสนอราคา) + 🧾 (ใบแจ้งหนี้)
//   · มือถือแนวตั้ง        → การ์ด ซึ่งเดิมมีปุ่มพิมพ์ **ปุ่มเดียว** เรียก `handlePrint(q)`
//     โดยไม่ส่ง docType → ตกไปเส้นทาง "quotation" เสมอ = พิมพ์ใบแจ้งหนี้จากมือถือไม่ได้เลย
//
// **เป็นความพังที่หน้าจอยังดูปกติทุกประการ** — ปุ่มที่เหลือทำงานถูกต้อง ไม่มี error ให้เห็น
// ผู้ใช้เห็นแค่ "ปุ่มหาย" แล้วต้องหมุนจอเอาเองถึงจะรู้ว่ายังพิมพ์ได้ · เทสต์ชุดนี้กันการถอยกลับ
// (ทั้งการลบปุ่มออก และการเผลอกลับไปเรียก handlePrint(q) แบบไม่ระบุชนิดเอกสาร)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VANA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

// ตัดเอาเฉพาะตัว view (ถึง top-level function ตัวถัดไป) — ฟังก์ชันข้างในถูก indent จึงไม่ตัดพลาด
function grabView(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('หา view ในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + name);
  const j = src.indexOf('\nfunction ', i + 1);
  return src.slice(i, j < 0 ? src.length : j);
}

const VIEW = grabView(VANA, 'QuoteFollowupView');

// การ์ดบนมือถือ = เนื้อในของ `{mobile ? ( … ) : (` — มี 2 ที่: โหมด "รออนุมัติ" กับ "อนุมัติแล้ว"
const MOBILE_BLOCKS = [...VIEW.matchAll(/\{mobile \? \(([\s\S]*?)\n\s*\) : \(/g)].map((m) => m[1]);
// ตารางบนจอกว้าง = ส่วนที่เหลือหลังตัดการ์ดมือถือออก
const DESKTOP_ONLY = MOBILE_BLOCKS.reduce((s, b) => s.replace(b, ''), VIEW);

const MODE_LABEL = ['โหมดรออนุมัติ', 'โหมดอนุมัติแล้ว'];

describe('QuoteFollowupView — โครงสร้างที่เทสต์นี้ยืนอยู่', () => {
  it('view แยกเรนเดอร์ตามความกว้างจอ 2 ที่ (รออนุมัติ + อนุมัติแล้ว)', () => {
    // ถ้าวันหนึ่งเลิกแยก mobile/desktop แล้วเทสต์นี้จะหมดความหมาย → ต้องรู้ตัว ไม่ใช่ผ่านเปล่า ๆ
    expect(MOBILE_BLOCKS.length).toBe(2);
    expect(VIEW).toMatch(/const mobile = useIsMobile\(\)/);
  });
});

describe('ปุ่มพิมพ์บนมือถือ (แนวตั้ง) ต้องมีครบเท่าจอกว้าง', () => {
  MOBILE_BLOCKS.forEach((block, i) => {
    it(MODE_LABEL[i] + ': มีปุ่มพิมพ์ "ใบแจ้งหนี้" (handlePrint(q, "invoice"))', () => {
      expect(block).toMatch(/handlePrint\(q,\s*["']invoice["']\)/);
    });

    it(MODE_LABEL[i] + ': มีปุ่มพิมพ์ "ใบเสนอราคา" (handlePrint(q, "quotation"))', () => {
      expect(block).toMatch(/handlePrint\(q,\s*["']quotation["']\)/);
    });

    it(MODE_LABEL[i] + ': ปุ่มพิมพ์มีป้ายชื่อเอกสาร ไม่ใช่ไอคอนเปล่า', () => {
      // บนจอเล็ก 🖨️ กับ 🧾 แยกไม่ออกว่าอันไหนคืออะไร (ผู้ใช้หลักคือพนักงานที่ไม่ถนัดเทคโนโลยี)
      expect(block).toContain('🧾 ใบแจ้งหนี้');
      expect(block).toContain('🖨️ ใบเสนอราคา');
    });

    it(MODE_LABEL[i] + ': ปุ่มถูกล็อกระหว่างออกเลขที่ใบแจ้งหนี้ (invoiceNumberBusy)', () => {
      // ออกเลขที่ (syncGetInvoiceNumber) ใช้เวลา — ปล่อยให้กดซ้ำได้ = ยิงซ้อนกัน
      expect(block).toMatch(/invoiceNumberBusy/);
    });
  });

  it('ไม่มี handlePrint(q) แบบไม่ระบุชนิดเอกสารหลงเหลือใน view', () => {
    // นี่คือรูปแบบที่ทำให้บั๊กเกิด: ไม่ส่ง docType → ตกเป็น "quotation" เงียบ ๆ
    expect(VIEW).not.toMatch(/handlePrint\(q\)/);
  });
});

describe('จอกว้าง (ตาราง) ต้องไม่ถูกทำหายไปด้วยระหว่างแก้ฝั่งมือถือ', () => {
  it('ตารางยังมีปุ่มพิมพ์ทั้ง 2 ชนิดครบทั้ง 2 โหมด', () => {
    const inv = DESKTOP_ONLY.match(/handlePrint\(q,\s*["']invoice["']\)/g) || [];
    const quo = DESKTOP_ONLY.match(/handlePrint\(q,\s*["']quotation["']\)/g) || [];
    expect(inv.length).toBe(2);
    expect(quo.length).toBe(2);
  });
});
