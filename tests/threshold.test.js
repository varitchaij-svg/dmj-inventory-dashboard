// tests/threshold.test.js
// getLowStockThreshold (views.jsx:1599) + ROLE_TABS schema lock (app.jsx:24)
import { describe, it, expect } from 'vitest';
import { getLowStockThreshold, ROLE_TABS } from './helpers.js';

// ─────────────────────────────────────────────────────────────────────────────
describe('getLowStockThreshold', () => {
  it('thresholds = null → default 36', () => {
    expect(getLowStockThreshold(null, 'CH001')).toBe(36);
  });

  it('thresholds = undefined → default 36', () => {
    expect(getLowStockThreshold(undefined, 'CH001')).toBe(36);
  });

  it('thresholds.default ไม่มี, overrides ไม่มี → 36', () => {
    expect(getLowStockThreshold({}, 'CH001')).toBe(36);
  });

  it('thresholds.default = 20, ไม่มี override → 20', () => {
    expect(getLowStockThreshold({ default: 20 }, 'CH001')).toBe(20);
  });

  it('override ตรง SKU → ใช้ค่า override แทน default', () => {
    expect(getLowStockThreshold({ default: 20, overrides: { 'CH001': 5 } }, 'CH001')).toBe(5);
  });

  it('override SKU อื่น → fallback เป็น default', () => {
    expect(getLowStockThreshold({ default: 20, overrides: { 'OL999': 5 } }, 'CH001')).toBe(20);
  });

  it('override = 0 → ถือว่า falsy → fallback เป็น default (เป็น behavior จริงของโค้ด)', () => {
    // getLowStockThreshold ใช้ || ดังนั้น override=0 จะ fallback เป็น default
    expect(getLowStockThreshold({ default: 10, overrides: { 'CH001': 0 } }, 'CH001')).toBe(10);
  });

  it('ไม่มี sku → fallback เป็น default', () => {
    expect(getLowStockThreshold({ default: 15 }, undefined)).toBe(15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLE_TABS schema lock — กัน tab หลุด/เพิ่มโดยไม่ตั้งใจ
// ถ้า test นี้ fail แสดงว่า CLAUDE.md และ app.jsx ต้องอัปเดตพร้อมกัน
describe('ROLE_TABS schema lock', () => {
  const ROLES = ['owner', 'employee', 'warehouse', 'frontstore', 'saler'];

  it('มีครบทุก role', () => {
    for (const r of ROLES) {
      expect(ROLE_TABS).toHaveProperty(r);
    }
  });

  it('ทุก role คืน Array', () => {
    for (const r of ROLES) {
      expect(Array.isArray(ROLE_TABS[r])).toBe(true);
    }
  });

  it('owner — tabs ครบถ้วน 16 tabs', () => {
    expect(ROLE_TABS.owner).toEqual([
      "overview","categories","trends","stock","storage","stockcount",
      "frontstore","transfers","orders","ordersummary","mtojobs",
      "upload","connect","labels","auditlog","deadstock",
    ]);
  });

  it('employee — 10 tabs (ไม่มี owner-only: overview, stockcount, upload, connect, auditlog, deadstock)', () => {
    expect(ROLE_TABS.employee).toEqual([
      "categories","trends","stock","storage","frontstore",
      "transfers","orders","ordersummary","mtojobs","labels",
    ]);
    expect(ROLE_TABS.employee).not.toContain('overview');
    expect(ROLE_TABS.employee).not.toContain('upload');
    expect(ROLE_TABS.employee).not.toContain('auditlog');
  });

  it('warehouse — 7 tabs (ไม่มี frontstore-specific: trends, stock(alert), transfers)', () => {
    expect(ROLE_TABS.warehouse).toEqual([
      "categories","storage","stockcount","orders","ordersummary","mtojobs","labels",
    ]);
    expect(ROLE_TABS.warehouse).not.toContain('frontstore');
    expect(ROLE_TABS.warehouse).not.toContain('transfers');
    expect(ROLE_TABS.warehouse).not.toContain('stock');
  });

  it('frontstore — 6 tabs', () => {
    expect(ROLE_TABS.frontstore).toEqual([
      "categories","stock","frontstore","orders","mtojobs","labels",
    ]);
    expect(ROLE_TABS.frontstore).not.toContain('storage');
    expect(ROLE_TABS.frontstore).not.toContain('stockcount');
  });

  it('saler — 5 tabs (minimal: ไม่มีคลัง, โอน, หน้าร้าน)', () => {
    expect(ROLE_TABS.saler).toEqual([
      "categories","stock","orders","mtojobs","labels",
    ]);
    expect(ROLE_TABS.saler).not.toContain('frontstore');
    expect(ROLE_TABS.saler).not.toContain('storage');
    expect(ROLE_TABS.saler).not.toContain('transfers');
  });

  it('tab ทั้งหมดใน ROLE_TABS ต้องเป็น tab ที่นิยามใน TABS list', () => {
    const VALID_TABS = new Set([
      "overview","categories","trends","stock","storage","stockcount",
      "frontstore","transfers","orders","ordersummary","mtojobs",
      "upload","connect","labels","auditlog","deadstock",
    ]);
    for (const [role, tabs] of Object.entries(ROLE_TABS)) {
      for (const tab of tabs) {
        expect(VALID_TABS.has(tab), `role "${role}" มี tab ไม่รู้จัก: "${tab}"`).toBe(true);
      }
    }
  });

  it('owner มี tab ทุกตัวที่ role อื่นมี (superset)', () => {
    for (const role of ROLES.filter(r => r !== 'owner')) {
      for (const tab of ROLE_TABS[role]) {
        expect(ROLE_TABS.owner, `owner ขาด tab "${tab}" ที่ ${role} มี`).toContain(tab);
      }
    }
  });
});
