// tests/login-resilience.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.6 login rollout — เอาการ "กันล็อกอินค้าง/วน" กลับมาทีละก้อน
// (ดู docs/HANDOFF-LOGIN-PERF.md "ส่วนที่ 1" + CLAUDE.md หัวข้อ "Phase 7.6")
//
// รอบก่อน 7.6 ถูก revert เพราะยกกลับทั้งชุดแล้วร้านล่ม → รอบนี้เอากลับ "ปลอดภัยก่อน เสี่ยงท้าย"
// แต่ละก้อนมีเทสต์ล็อกไว้ · component ที่มี timer/React hooks เทสต์ pure ไม่ได้ →
// ใช้ source-scan meta-test ล็อก wiring (แพทเทิร์นเดียวกับ gasjson.test.js SCAN gate)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

// ── ก้อน A (ข้อ 2): จอ checking ต้องมีทางออกเสมอ ──────────────────────────────
describe('Phase 7.6 ก้อน A — จอ checking มีทางออก', () => {
  it('มี component CheckingScreen', () => {
    expect(APP).toMatch(/function CheckingScreen\s*\(\s*\{\s*onGiveUp\s*\}\s*\)/);
  });

  it('CheckingScreen นับวินาทีจริง (setInterval + state secs)', () => {
    const body = APP.slice(APP.indexOf('function CheckingScreen'), APP.indexOf('function CheckingScreen') + 900);
    expect(body).toMatch(/setInterval/);
    expect(body).toMatch(/setSecs/);
    // เก็บเวลาเริ่มด้วย Date.now() แล้วคำนวณ elapsed — ไม่ใช่ +1 ต่อ tick (กันเพี้ยนตอน tab ถูกพัก)
    expect(body).toMatch(/Date\.now\(\)/);
  });

  it('เตือน "ช้ากว่าปกติ" ที่ 12 วิ และปุ่มกลับล็อกอินที่ 30 วิ', () => {
    const body = APP.slice(APP.indexOf('function CheckingScreen'), APP.indexOf('function CheckingScreen') + 1200);
    expect(body).toMatch(/secs\s*>=\s*12/);
    expect(body).toMatch(/secs\s*>=\s*30/);
    // ปุ่มที่ 30 วิ ต้องเรียก onGiveUp (ไม่ใช่ปุ่มตกแต่งที่กดแล้วไม่เกิดอะไร)
    expect(body).toMatch(/onClick=\{onGiveUp\}/);
  });

  it('เส้นทาง render "checking" ใช้ CheckingScreen — ไม่ใช่สปินเนอร์เปล่าเดิม', () => {
    const idx = APP.indexOf('if (authPhase === "checking")');
    expect(idx).toBeGreaterThan(0);
    const block = APP.slice(idx, idx + 800);
    expect(block).toMatch(/<CheckingScreen\b/);
    expect(block).toMatch(/onGiveUp=/);
  });

  it('onGiveUp ลบ code/state ออกจาก URL แล้ว setAuthPhase("needLogin")', () => {
    const idx = APP.indexOf('if (authPhase === "checking")');
    const block = APP.slice(idx, idx + 800);
    // ต้องล้าง ?code= กัน effect แลก code ยิงซ้ำ + พาไปหน้าล็อกอิน
    expect(block).toMatch(/searchParams\.delete\(["']code["']\)/);
    expect(block).toMatch(/setAuthPhase\(["']needLogin["']\)/);
  });
});
