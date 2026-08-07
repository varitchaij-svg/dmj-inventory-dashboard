// tests/order-idempotent.test.js — กันสั่งของซ้ำสองเด้ง (cid / idempotency key)
// ─────────────────────────────────────────────────────────────────────────────
// เหมือน auth.test.js / qtyloc.test.js: **ไม่ copy โค้ดเข้า helpers.js** แต่ eval
// ฟังก์ชันจริงจาก .gs เพราะนี่คือตรรกะที่กัน "สั่งของสองเด้ง" — สำเนา drift แล้ว
// เทสต์จะเขียวทั้งที่ของจริงสั่งซ้ำ (คลังจัดของเกิน = เสียเงินจริง)
//
// ที่มา (ส.ค. 2026): ผู้ใช้เห็นแถบแดง "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" ตอนกดสั่งของบ่อยมาก
//   เดิม frontend ห้าม retry เด็ดขาด เพราะ handleOrder_ ไม่มี idempotency key —
//   ยิงซ้ำ = แถวใหม่ทุกครั้ง · เน็ตร้าน/มือถือกระตุกทีเดียวจึงกลายเป็นแดงทันที
//   ตอนนี้เครื่องผู้ใช้แนบ cid มาด้วย → ยิงซ้ำด้วย cid เดิมไม่เกิดแถวใหม่ = retry ได้ปลอดภัย
//
// สิ่งที่คุมไว้:
//   1. findOrderRowByCid_ หาแถวเดิมเจอ/ไม่เจอถูกต้อง (รวมค่าที่มีช่องว่างติดมาจากชีต)
//   2. cid ว่าง (แถวเก่าก่อนมีระบบนี้) ต้องไม่ถูกจับคู่กันเองยกแผง
//   3. อ่านเฉพาะคอลัมน์ M และไม่เลย ORD_CID_SCAN_ROWS แถว (กัน getRange โตไม่มีเพดาน)
//   4. meta: handleOrder_ ต้องยังเรียก findOrderRowByCid_ + จับล็อก + เขียน cid ลงชีตจริง
//   5. meta: frontend ต้องส่ง cid ไปกับ action=order (ไม่ส่ง = ฝั่ง GAS กันซ้ำไม่ได้เลย)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');
const VIEWS = readFileSync(join(ROOT, 'views-main.jsx'), 'utf8');

function grab(re) {
  const m = SRC.match(re);
  if (!m) throw new Error('หาโค้ดในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?): ' + re);
  return m[0];
}

const { findOrderRowByCid_, COL_ORD_CID, ORD_CID_SCAN_ROWS } = (() => {
  const consts = grab(/var COL_ORD_CID[\s\S]*?var ORD_CID_SCAN_ROWS\s*=\s*\d+;/);
  const fn = grab(/function findOrderRowByCid_\(sh, cid\) \{[\s\S]*?\n\}/);
  // eslint-disable-next-line no-new-func
  return new Function(
    `${consts}\n${fn}\nreturn { findOrderRowByCid_, COL_ORD_CID, ORD_CID_SCAN_ROWS };`
  )();
})();

// ชีตปลอม: cids[i] = ค่าคอลัมน์ O ของแถวที่ 3+i (ข้อมูลเริ่มแถว 3 เหมือนชีตจริง)
function fakeSheet(cids) {
  const calls = [];
  return {
    calls,
    getLastRow: () => 2 + cids.length,
    getRange(row, col, numRows, numCols) {
      calls.push({ row, col, numRows, numCols });
      const out = [];
      for (let i = 0; i < numRows; i++) out.push([cids[row - 3 + i] ?? '']);
      return { getDisplayValues: () => out };
    },
  };
}

describe('findOrderRowByCid_ — หาคำสั่งเดิมจาก cid', () => {
  it('เจอแถวที่มี cid เดียวกัน (คืนเลขแถวจริงของชีต เริ่มที่ 3)', () => {
    const sh = fakeSheet(['A-1', 'A-2', 'A-3']);
    expect(findOrderRowByCid_(sh, 'A-1')).toBe(3);
    expect(findOrderRowByCid_(sh, 'A-2')).toBe(4);
    expect(findOrderRowByCid_(sh, 'A-3')).toBe(5);
  });

  it('ไม่เจอ → -1 (คำสั่งใหม่จริง ต้องเขียนแถวใหม่)', () => {
    expect(findOrderRowByCid_(fakeSheet(['A-1', 'A-2']), 'A-9')).toBe(-1);
  });

  it('cid ว่าง → -1 เสมอ แม้ชีตจะมีช่อง M ว่างเต็มไปหมด (แถวเก่าก่อนมีระบบนี้)', () => {
    const sh = fakeSheet(['', '', '']);
    expect(findOrderRowByCid_(sh, '')).toBe(-1);
    expect(findOrderRowByCid_(sh, null)).toBe(-1);
    expect(findOrderRowByCid_(sh, undefined)).toBe(-1);
  });

  it('ค่าที่มีช่องว่างติดมาจากชีตต้องยังจับคู่ได้ (Sheets เติม space ได้ง่าย)', () => {
    expect(findOrderRowByCid_(fakeSheet(['  A-1  ']), 'A-1')).toBe(3);
  });

  it('ชีตยังไม่มีข้อมูล (lastRow < 3) → -1 ไม่พังและไม่ยิง getRange', () => {
    const sh = fakeSheet([]);
    expect(findOrderRowByCid_(sh, 'A-1')).toBe(-1);
    expect(sh.calls.length).toBe(0);
  });

  it('cid ซ้ำกันสองแถว → คืนแถวล่างสุด (แถวใหม่กว่า)', () => {
    expect(findOrderRowByCid_(fakeSheet(['A-1', 'A-1']), 'A-1')).toBe(4);
  });

  it('อ่านเฉพาะคอลัมน์ O คอลัมน์เดียว และไม่เกิน ORD_CID_SCAN_ROWS แถว', () => {
    const many = Array.from({ length: ORD_CID_SCAN_ROWS + 250 }, (_, i) => 'X-' + i);
    const sh = fakeSheet(many);
    findOrderRowByCid_(sh, 'ไม่มีอยู่จริง');
    expect(sh.calls.length).toBe(1);
    expect(sh.calls[0].col).toBe(COL_ORD_CID);
    expect(sh.calls[0].numCols).toBe(1);
    expect(sh.calls[0].numRows).toBe(ORD_CID_SCAN_ROWS);
  });

  it('คอลัมน์ cid ต้องเป็น O (15) — ไม่ทับ L/M (ผู้สั่ง/ผู้จัด) และ N (printFlag)', () => {
    expect(COL_ORD_CID).toBe(15);
    expect(SRC).toMatch(/const COL_ORD_ORDERBY\s*=\s*12;/);
    expect(SRC).toMatch(/const COL_ORD_PREPBY\s*=\s*13;/);
    expect(SRC).toMatch(/const COL_ORD_PRINTFLAG\s*=\s*14;/);
    // handleOrder_ เขียนแถวเป็นชุด A..M — cid ต้องอยู่นอกช่วงนั้น ไม่งั้นถูกทับทันทีที่เขียน
    expect(SRC).toMatch(/getRange\(nextRow, 1, 1, 13\)/);
  });
});

describe('meta — จุดเชื่อมต่อที่ถ้าหลุดแล้วเทสต์ข้างบนเขียวแต่ของจริงสั่งซ้ำ', () => {
  const handleOrder = grab(/function handleOrder_\(params\) \{[\s\S]*?\n\}\n/);

  it('handleOrder_ อ่าน cid จาก params และเช็คแถวเดิมก่อนเขียน', () => {
    expect(handleOrder).toMatch(/params\.cid/);
    expect(handleOrder).toMatch(/findOrderRowByCid_\(orderSh, cid\)/);
  });

  it('handleOrder_ ตอบ ok:true ตอนเจอแถวเดิม (ไม่ใช่ error) — ไม่งั้น frontend ยังขึ้นแดง', () => {
    expect(handleOrder).toMatch(/ok:true,\s*dedup:true/);
  });

  it('handleOrder_ เขียน cid ลงคอลัมน์จริง ไม่งั้นครั้งต่อไปหาไม่เจอ', () => {
    expect(handleOrder).toMatch(/getRange\(nextRow, COL_ORD_CID\)[\s\S]*?setValue\(cid\)/);
  });

  it('handleOrder_ จับล็อกคร่อม "หาแถวว่าง → เขียน" (สองเครื่องกดพร้อมกันได้แถวเดียวกัน)', () => {
    expect(handleOrder).toMatch(/LockService\.getScriptLock\(\)/);
    expect(handleOrder).toMatch(/releaseLock/);
    // ล็อกไม่ได้ → ต้องบอก retryable ให้ frontend ลองใหม่ ไม่ใช่ทิ้งคำสั่งของผู้ใช้
    expect(handleOrder).toMatch(/retryable:\s*true/);
  });

  it('doGet มี action=orderCheck ไว้ตรวจว่าคำสั่งเข้าระบบหรือยัง', () => {
    expect(SRC).toMatch(/action === 'orderCheck'/);
  });

  it('frontend ส่ง cid ไปกับ action=order (ไม่ส่ง = กันซ้ำไม่ทำงานเลย)', () => {
    expect(VIEWS).toMatch(/action=order[\s\S]{0,400}cid=\$\{encodeURIComponent\(cid\)\}/);
  });

  it('cid ต้องคงเดิมเมื่อ สินค้า+จำนวน+ประเภท เดิม (ไม่งั้น retry สร้างแถวใหม่ทุกครั้ง)', () => {
    expect(VIEWS).toMatch(/const key = `\$\{product\.sku\}\|\$\{qty\}\|\$\{orderType\}`/);
  });
});
