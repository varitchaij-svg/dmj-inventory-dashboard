// tests/security-debugorders.test.js — F-08: debugOrders ต้องตรวจ session จริง ไม่เชื่อ role จาก query param
// ─────────────────────────────────────────────────────────────────────────────
// เดิม doGet action=debugOrders เช็ค `isAdminRole_(e.parameter.role)` ซึ่ง client ส่ง
// `?action=debugOrders&role=owner&token=<public APP_TOKEN>` มาเองได้ → ได้ raw 15 แถวแรกของ
// ชีตคำสั่งซื้อโดยไม่ต้องมี session จริง (F-08, ยืนยันบน origin/master b7e5f1e)
// getAuditLog/attendancePhoto/staffPerf ย้ายมาใช้ resolveSession_ แล้ว — debugOrders หลุด
//
// เทสต์นี้สแกน block จริงจาก .gs (ไม่ copy โค้ด — หลักเดียวกับ auth.test.js) แล้วบังคับว่า:
//   1. block debugOrders ต้องเรียก resolveSession_
//   2. ต้องเช็ค isAdminRole_ กับ role ของ "session" ไม่ใช่ e.parameter.role
//   3. ต้องไม่มี isAdminRole_(e.parameter.role) หลงเหลือ (รูปแบบที่ปลอมได้)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'appsscript_complete.gs'), 'utf8');

// ตัด block ตั้งแต่ if (...action === 'debugOrders') จนถึงปิด block (เจอ imgProxy = block ถัดไป)
function grabDebugOrdersBlock() {
  const start = SRC.indexOf("action === 'debugOrders'");
  expect(start, "หา block debugOrders ในต้นทางไม่เจอ (โครงสร้างเปลี่ยน?)").toBeGreaterThan(-1);
  const next = SRC.indexOf("action === 'imgProxy'", start);
  return SRC.slice(start, next > start ? next : start + 1200);
}

describe('F-08 — debugOrders authorization', () => {
  const block = grabDebugOrdersBlock();

  it('ตรวจ session จริงด้วย resolveSession_ (ไม่เชื่อ token/role อย่างเดียว)', () => {
    expect(block).toMatch(/resolveSession_\s*\(/);
  });

  it('เช็คสิทธิ์จาก role ของ session + status active — ไม่ใช่ e.parameter.role', () => {
    // ต้องมีการเช็ค isAdminRole_(<ตัวแปร session>.role)
    expect(block).toMatch(/isAdminRole_\(\s*\w+\.role\s*\)/);
    expect(block).toMatch(/status\s*!==\s*['"]active['"]/);
  });

  it('ต้องไม่มี isAdminRole_(e.parameter.role) หลงเหลือ (รูปแบบที่ client ปลอมได้)', () => {
    expect(block).not.toMatch(/isAdminRole_\(\s*e\.parameter\.role\s*\)/);
  });
});
