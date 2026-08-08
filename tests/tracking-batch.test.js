// tests/tracking-batch.test.js — หน้า "📡 ติดตามสถานะ" แบบรายใบโอน
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน transfer-idempotent.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval ฟังก์ชันจริง
// จาก views-analytics.jsx เพราะนี่คือตัวเลขที่หัวหน้าใช้ตรวจการรับของและเจ้าของใช้อ่านรายงาน
// — สำเนา drift แล้วเทสต์จะเขียวทั้งที่ตัวเลขบนจอผิด (ซึ่งไม่มี error ให้ใครเห็นเลย)
//
// ที่มา (ส.ค. 2026): หน้านี้เดิมเรียงการ์ดทีละ SKU ใหม่สุดอยู่บน — ส่งรอบละ 75 ตัวก็ได้ 75
//   การ์ดเรียงกัน หัวหน้าต้องนับเองว่าใบไหนรับครบหรือยัง และไม่มีอะไรบอกว่าใบนี้ค้างมากี่วัน
//   ซึ่งเป็นจุดบอดเดียวกับที่ทำให้ TF-202608035 หายไปโดยไม่มีใครทันสังเกต
//
// สิ่งที่คุมไว้:
//   1. trackShipTotals — นับเป็น "ชิ้น" ไม่ใช่จำนวน SKU · "ขาด" นับเฉพาะแถวที่กดรับแล้ว
//   2. trackAgeDays — รองรับปี พ.ศ. + ไม่เดาเมื่อวันที่เพี้ยน
//   3. meta: item ของ shipment ต้องมี `date` แยกจาก `when` (ไม่งั้นอายุใบโอนเพี้ยนเงียบ ๆ)
//   4. meta: ใบที่ยังรับไม่ครบต้องถูกจัดขึ้นบนสุด
//   5. meta: โหมดตั้งต้นต้องเป็น "รายใบโอน" และยังต้องมีโหมดรายชิ้นให้ย้อนดูได้
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VA = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

function grab(src, re) {
  const m = src.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

// ตัดคอมเมนต์ออกก่อนเทียบ pattern — คอมเมนต์ที่อธิบาย "ทำไมของเดิมผิด" มักมีคำเดียวกับ
// ของเดิม ถ้าไม่ตัดจะจับคอมเมนต์แทนโค้ดจริง (เคยพลาดมาแล้วใน stampede.test.js)
function codeOnly(s) {
  return s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ── ฟังก์ชันจริงจาก .jsx ─────────────────────────────────────────────────────
const { trackShipTotals, trackAgeDays } = (() => {
  const parseCheck = grab(VA, /function parseCheckDateMs\(s\) \{[\s\S]*?\n\}/);
  const parseDate  = grab(VA, /function parseDateMs\(s\) \{[\s\S]*?\n\}/);
  const age        = grab(VA, /function trackAgeDays\(dateStr\) \{[\s\S]*?\n\}/);
  const totals     = grab(VA, /function trackShipTotals\(items\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(
    `${parseCheck}\n${parseDate}\n${age}\n${totals}\n` +
    `return { trackShipTotals, trackAgeDays };`
  )();
})();

const ship = (qty, receivedQty, receivedAt) => ({ kind: 'ship', qty, receivedQty, receivedAt });

describe('trackShipTotals — ยอดรวมเป็น "ชิ้น"', () => {
  it('รวมจำนวนชิ้นที่ส่ง ไม่ใช่จำนวน SKU', () => {
    const t = trackShipTotals([ship(72, 72, '6/8/2569 12:56'), ship(120, 120, '6/8/2569 12:58')]);
    expect(t.sentPcs).toBe(192);   // ไม่ใช่ 2
    expect(t.rows).toBe(2);
  });

  it('"ขาด" นับเฉพาะแถวที่กดรับแล้วและได้ไม่ครบ', () => {
    const t = trackShipTotals([ship(50, 40, '6/8/2569 13:00')]);
    expect(t.recvPcs).toBe(40);
    expect(t.shortPcs).toBe(10);
    expect(t.waitPcs).toBe(0);
  });

  it('⚠️ แถวที่ยังไม่มีใครกดรับ = "รอรับ" ห้ามนับเป็น "ขาด"', () => {
    // นับเป็นขาด = หัวหน้าเห็นตัวเลขแดงทั้งที่ของอาจอยู่ครบ แค่ยังไม่ได้กด
    const t = trackShipTotals([ship(60, null, '')]);
    expect(t.waitPcs).toBe(60);
    expect(t.shortPcs).toBe(0);
    expect(t.recvPcs).toBe(0);
  });

  it('รับเกินที่ส่งไม่ทำให้ "ขาด" ติดลบ', () => {
    const t = trackShipTotals([ship(10, 12, '6/8/2569 13:00')]);
    expect(t.shortPcs).toBe(0);
  });

  it('นับจำนวนใบที่รับแล้ว/ค้าง แยกจากจำนวนชิ้น', () => {
    const t = trackShipTotals([
      ship(10, 10, '6/8/2569 13:00'),
      ship(20, null, ''),
      ship(30, null, ''),
    ]);
    expect(t.rows).toBe(3);
    expect(t.recvRows).toBe(1);
    expect(t.pending).toBe(2);
    expect(t.sentPcs).toBe(60);
  });

  it('ข้าม order (kind ไม่ใช่ ship) — ของที่ยังไม่ได้ส่งไม่เข้ายอดรวม', () => {
    const t = trackShipTotals([{ kind: 'order', orderQty: 999 }, ship(5, 5, '6/8/2569 13:00')]);
    expect(t.sentPcs).toBe(5);
    expect(t.rows).toBe(1);
  });

  it('รายการว่าง → ทุกช่องเป็น 0 (ไม่ NaN)', () => {
    const t = trackShipTotals([]);
    Object.values(t).forEach(v => expect(Number.isFinite(v)).toBe(true));
    expect(t.sentPcs).toBe(0);
  });

  it('จำนวนที่เป็นข้อความจากชีต ("24") ยังบวกได้', () => {
    const t = trackShipTotals([ship('24', '24', '6/8/2569 13:00')]);
    expect(t.sentPcs).toBe(24);
    expect(t.recvPcs).toBe(24);
    expect(t.shortPcs).toBe(0);
  });
});

describe('trackAgeDays — ค้างรับมากี่วัน', () => {
  const dmy = ms => {
    const d = new Date(ms);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  it('วันนี้ = 0', () => {
    expect(trackAgeDays(dmy(Date.now()))).toBe(0);
  });

  it('3 วันก่อน = 3', () => {
    expect(trackAgeDays(dmy(Date.now() - 3 * 86400000))).toBe(3);
  });

  it('⚠️ อ่านปี พ.ศ. ได้ (ชีตเขียนด้วย toLocaleString("th-TH"))', () => {
    const d = new Date(Date.now() - 2 * 86400000);
    const be = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543}`;
    expect(trackAgeDays(be)).toBe(2);   // ไม่ใช่ null และไม่ใช่เลขมหาศาล
  });

  it('วันที่ในอนาคต → null (ไม่เดา ดีกว่าโชว์เลขติดลบ)', () => {
    expect(trackAgeDays(dmy(Date.now() + 5 * 86400000))).toBeNull();
  });

  it('เก่าเกิน 400 วัน → null', () => {
    expect(trackAgeDays('1/1/2000')).toBeNull();
  });

  it('ค่าว่าง/อ่านไม่ออก → null', () => {
    expect(trackAgeDays('')).toBeNull();
    expect(trackAgeDays(null)).toBeNull();
    expect(trackAgeDays('ไม่ใช่วันที่')).toBeNull();
  });
});

describe('meta — จุดเชื่อมต่อที่พังแล้วไม่มี error ให้เห็น', () => {
  const view = grab(VA, /function TrackingView\(\{ data, role \}\) \{[\s\S]*?\n\}\n/);
  const card = grab(VA, /function TrackBatchCard\(\{ batch[\s\S]*?\n\}\n/);

  it('shipment item ต้องเก็บ `date` แยกจาก `when`', () => {
    // when ของแถวที่รับแล้ว = เวลาที่กดรับ ถ้าเอาไปคิดอายุจะได้ "ค้าง 0 วัน" เสมอ
    // = ใบที่ค้างจริงถูกกลบหายไป ซึ่งคือจุดบอดเดิมทั้งดุ้น
    expect(codeOnly(view)).toMatch(/date:\s*s\.date/);
  });

  it('อายุใบโอนคิดจาก batch.date ไม่ใช่เวลาที่กดรับ', () => {
    expect(codeOnly(card)).toMatch(/trackAgeDays\(batch\.date\)/);
  });

  it('ใบที่ยังรับไม่ครบถูกจัดขึ้นบนสุด', () => {
    const c = codeOnly(view);
    expect(c).toMatch(/pending\s*>\s*0/);
    expect(c).toMatch(/batches/);
  });

  it('จัดกลุ่มด้วย refNum (ไม่ใช่ sku)', () => {
    expect(codeOnly(view)).toMatch(/it\.refNum\s*\|\|\s*"—"/);
  });

  it('โหมดตั้งต้นเป็น "รายใบโอน"', () => {
    expect(codeOnly(view)).toMatch(/uS\("batch"\)/);
  });

  it('ยังมีโหมดรายชิ้นตามเวลาให้ย้อนดูได้ (ไม่ได้ตัดของเดิมทิ้ง)', () => {
    const c = codeOnly(view);
    expect(c).toMatch(/timeline/);
    expect(c).toMatch(/<TrackCard/);
  });

  it('บล็อกสรุปใช้ trackShipTotals ตัวเดียวกับการ์ดใบโอน', () => {
    // คิดเองซ้ำอีกที่ = สองที่ให้เลขไม่ตรงกันแล้วไม่มีใครรู้ว่าอันไหนถูก
    expect(codeOnly(view)).toMatch(/trackShipTotals\(shown\)/);
    expect(codeOnly(view)).toMatch(/trackShipTotals\(b\.all\)/);
  });

  it('⚠️ ยอดหัวการ์ดคิดจากทั้งใบ ไม่ใช่เฉพาะที่ผ่านตัวกรองสถานะ', () => {
    // กรอง "รับไม่ครบ" แล้วหัวการ์ดบอก "ส่ง 10 ชิ้น" ทั้งที่ใบนั้นส่ง 100 = โกหกเงียบ ๆ
    const c = codeOnly(view);
    expect(c).toMatch(/trackShipTotals\(b\.all\)/);
    expect(c).not.toMatch(/trackShipTotals\(b\.items\)/);
    expect(c).toMatch(/searched\.forEach/);   // กลุ่มสร้างจากชุดที่ยังไม่กรองสถานะ
  });

  it('ใบที่ไม่มีรายการตรงตัวกรองเลย ต้องไม่โผล่', () => {
    expect(codeOnly(view)).toMatch(/b\.items\.length\s*>\s*0/);
  });

  it('บอกผู้ใช้เมื่อยอดหัวการ์ดกับตัวกรองไม่ตรงกัน', () => {
    // CLAUDE.md ข้อ 8: ตัวเลขที่ "เท่ากันไม่ได้" ต้องอธิบาย ไม่ใช่ปล่อยให้เดา
    expect(codeOnly(view)).toMatch(/ทั้งใบ/);
  });

  // ── หน่วยของตัวเลข: ไทล์นับ "รายการ" · บล็อกสรุปนับ "ชิ้น" ──────────────────
  // คำว่า "รอรับ" โผล่ทั้งสองที่ด้วยเลขคนละตัว (1 กับ 24) ถ้าไม่ติดหน่วยกำกับ
  // ผู้ใช้ไม่มีทางรู้ว่าอันไหนคืออะไร — ไม่ใช่บั๊กที่มี error ให้เห็น แต่คืออ่านผิดทุกครั้ง
  it('ไทล์บอกว่านับเป็น "รายการ"', () => {
    expect(codeOnly(view)).toMatch(/นับเป็น <b>รายการ<\/b>/);
  });

  it('บล็อกสรุปบอกว่านับเป็น "ชิ้น"', () => {
    expect(codeOnly(view)).toMatch(/นับเป็น <b>ชิ้น<\/b>/);
  });

  it('⚠️ หน่วย "ชิ้น" ติดกับตัวเลขทุกช่องในบล็อกสรุป ไม่ใช่แค่ช่องแรก', () => {
    const c = codeOnly(view);
    // เดิม label ช่องแรกเป็น "ส่งไป (ชิ้น)" อีก 3 ช่องไม่มีหน่วยเลย
    expect(c).toMatch(/\{fmtN\(x\.n\)\}<span[^>]*> ชิ้น<\/span>/);
    expect(c).not.toMatch(/label:\s*"ส่งไป \(ชิ้น\)"/);
  });

  it('⚠️ หัวการ์ดใบโอนต้องใช้คำว่า "รายการ" ไม่ใช่ "ใบ"', () => {
    // "0/1 ใบ" ชนกับ "2 ใบโอน" ข้างบน — คำเดียวกันแปลคนละอย่างในหน้าเดียว
    const c = codeOnly(card);
    expect(c).toMatch(/\{t\.recvRows\}\/\{t\.rows\}[\s\S]{0,80}รายการ/);
    expect(c).not.toMatch(/\{t\.recvRows\}\/\{t\.rows\}\s*<span[^>]*>ใบ<\/span>/);
  });

  it('ทุกตัวเลขในบรรทัดยอดของหัวการ์ดมีหน่วย "ชิ้น"', () => {
    const c = codeOnly(card);
    ['sentPcs', 'recvPcs', 'waitPcs', 'shortPcs'].forEach(k => {
      expect(c).toMatch(new RegExp(`fmtN\\(t\\.${k}\\)\\}?\\s*(</b>)?\\s*ชิ้น`));
    });
  });

  it('คำอธิบาย "ขาด/รอรับ" สั้นพอที่คนอ่านไทยไม่คล่องจะอ่านจบ', () => {
    const m = codeOnly(view).match(/"ขาด" = [^\n<]*/);
    expect(m).not.toBeNull();
    expect(m[0].length).toBeLessThan(70);
  });

  it('ค้นหาครอบเลขที่ใบโอนด้วย', () => {
    expect(codeOnly(view)).toMatch(/it\.refNum\s*\|\|\s*""/);
  });

  it('การ์ดรายตัวยังมีรูปสินค้า (UI convention บังคับ)', () => {
    expect(codeOnly(card)).toMatch(/<TrackCard/);
    expect(codeOnly(grab(VA, /function TrackCard\(\{ item, productMap \}\) \{[\s\S]*?\n\}\n/)))
      .toMatch(/<ProductThumb/);
  });
});
