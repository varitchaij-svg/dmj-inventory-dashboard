// tests/owner-nav.test.js — nav 2 ชั้นของ owner/dev (OWNER_GROUPS)
// ─────────────────────────────────────────────────────────────────────────────
// **eval ตารางจริงจาก app.jsx ไม่ copy** — ตัวที่ต้องกันคือ "ตารางหมวด drift จาก
// TABS/ROLE_TABS" ซึ่งถ้าเก็บสำเนาไว้ในเทสต์ก็จะ drift พร้อมกันแล้วเทสต์ยังเขียว
//
// สิ่งที่คุมไว้ — ทุกข้อคือแบบ "พังแล้วไม่มี error ให้เห็น" (nav ยังเรนเดอร์ได้ปกติ):
//   1. tab id พิมพ์ผิดในหมวด → `.filter(id => allowed.has(id))` ตัดทิ้งเงียบ ๆ
//      แล้วตัวจริงไปโผล่ในกลุ่ม "อื่นๆ" — ดูเผิน ๆ เหมือนแค่ "จัดกลุ่มพลาด"
//   2. tab เดียวอยู่ 2 หมวด → โผล่ซ้ำ 2 ที่ กดอันไหนก็ไปหน้าเดียวกัน (งงว่าต่างกันยังไง)
//   3. tab ของ owner ที่ไม่มีหมวด → ตกไป "อื่นๆ" ซึ่งเป็นถังขยะ ไม่ใช่การจัดกลุ่ม
//   4. badge ผูกกับหมวดที่ไม่มี tab ต้นทางแล้ว → เลขเตือนขึ้นบนหมวดที่กดเข้าไปไม่เจออะไร
//      (เกิดทันทีที่ย้าย orders/transfers ข้ามหมวดแล้วลืมแก้ badgeFor)
//   5. หมวดที่ว่างสำหรับ owner ต้องหายไปเอง ไม่ใช่ปุ่มกดแล้วไม่มีอะไร
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');

// ── ดึงตารางจริงจาก app.jsx มา eval (ไม่ copy ค่าไว้ในเทสต์) ──
// TABS มี `icon: I.xxx` ซึ่งอ้าง object ไอคอนที่ไม่มีในเทสต์ → ป้อน Proxy ที่คืน null ทุกคีย์
function evalDecl(name) {
  const m = APP.match(new RegExp(`const ${name} = (\\[|\\{)[\\s\\S]*?\\n(\\]|\\});`));
  if (!m) throw new Error(`หา ${name} ใน app.jsx ไม่เจอ (โครงสร้างเปลี่ยน?)`);
  const I = new Proxy({}, { get: () => null });
  // eslint-disable-next-line no-new-func
  return new Function('I', `${m[0]}\nreturn ${name};`)(I);
}

const TABS = evalDecl('TABS');
const ROLE_TABS = evalDecl('ROLE_TABS');
const OWNER_GROUPS = evalDecl('OWNER_GROUPS');

const TAB_IDS = new Set(TABS.map((t) => t.id));
const groupedIds = OWNER_GROUPS.flatMap((g) => g.tabs);

describe('OWNER_GROUPS — ความถูกต้องของตาราง', () => {
  it('ทุก tab id ในหมวด มีอยู่จริงใน TABS (พิมพ์ผิด = หายเงียบ ๆ)', () => {
    const ghosts = groupedIds.filter((id) => !TAB_IDS.has(id));
    expect(ghosts).toEqual([]);
  });

  it('ไม่มี tab ไหนอยู่ 2 หมวด (จะโผล่ซ้ำในเมนู)', () => {
    const seen = new Map();
    const dupes = [];
    for (const g of OWNER_GROUPS) {
      for (const id of g.tabs) {
        if (seen.has(id)) dupes.push(`${id}: ${seen.get(id)} + ${g.id}`);
        else seen.set(id, g.id);
      }
    }
    expect(dupes).toEqual([]);
  });

  it('ทุกหมวดมี id/ชื่อ/อิโมจิ ครบ และ id ไม่ซ้ำ', () => {
    for (const g of OWNER_GROUPS) {
      expect(g.id, JSON.stringify(g)).toBeTruthy();
      expect(g.name, g.id).toBeTruthy();
      expect(g.gi, g.id).toBeTruthy();
      expect(Array.isArray(g.tabs), g.id).toBe(true);
    }
    const ids = OWNER_GROUPS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    // "อื่นๆ" ถูกสร้างอัตโนมัติตอน render (g_other) — ห้ามประกาศซ้ำในตาราง
    expect(ids).not.toContain('g_other');
  });
});

describe('OWNER_GROUPS — ครอบคลุม tab ของ owner/dev', () => {
  it('ทุก tab ของ owner มีหมวดรองรับ — ไม่ตกไปกอง "อื่นๆ"', () => {
    const covered = new Set(groupedIds);
    const orphans = ROLE_TABS.owner.filter((id) => !covered.has(id));
    expect(orphans).toEqual([]);
  });

  it('ทุก tab ของ dev มีหมวดรองรับด้วย (dev = owner + แท็บที่ยังซ่อน)', () => {
    const covered = new Set(groupedIds);
    const orphans = ROLE_TABS.dev.filter((id) => !covered.has(id));
    expect(orphans).toEqual([]);
  });

  it('ทุกหมวดต้องมี tab ที่ owner หรือ dev เข้าถึงได้อย่างน้อย 1 (ไม่มีหมวดตายในตาราง)', () => {
    const reachable = new Set([...ROLE_TABS.owner, ...ROLE_TABS.dev]);
    for (const g of OWNER_GROUPS) {
      expect(g.tabs.some((id) => reachable.has(id)), `หมวด ${g.id} ไม่มี tab ที่ใครเข้าถึงได้`).toBe(true);
    }
  });
});

describe('OWNER_GROUPS — หมวด "ภาพรวม" ตามที่เจ้าของสั่ง (ส.ค. 2026)', () => {
  // เจ้าของขอให้รวมทุกอย่างที่ "เปิดดูเพื่อตัดสินใจ" ไว้หมวดเดียว จะได้ไม่ต้องไล่ข้ามหมวด
  // ⚠️ ถ้าจะย้ายตัวใดออก ต้องคุยกับเจ้าของก่อน — ไม่ใช่การจัดกลุ่มตามประเภทงานเหมือนหมวดอื่น
  const REQUIRED = ['overview', 'whhome', 'customers', 'tracking', 'quotefollowup', 'trends', 'season'];

  it('มีครบทุกเมนูที่เจ้าของระบุ', () => {
    const g = OWNER_GROUPS.find((x) => x.id === 'g_overview');
    expect(g).toBeTruthy();
    for (const id of REQUIRED) expect(g.tabs, `ขาด ${id}`).toContain(id);
  });

  it('เรียงตามลำดับที่เจ้าของพิมพ์ (ลำดับในตาราง = ลำดับที่เห็นบนจอ)', () => {
    const g = OWNER_GROUPS.find((x) => x.id === 'g_overview');
    const pos = REQUIRED.map((id) => g.tabs.indexOf(id));
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });
});

describe('badge บนหมวด ต้องผูกกับหมวดที่มี tab ต้นทางจริง', () => {
  // badgeFor: g_sales ← ออเดอร์ค้าง (tab "orders") · g_stock ← ของรอรับ (tab "transfers")
  // ย้าย tab ข้ามหมวดแล้วลืมแก้ตรงนี้ = เลขเตือนขึ้นบนหมวดที่กดเข้าไปแล้วไม่เจออะไร
  const navFn = APP.match(/const ownerNav = \(\(\) => \{[\s\S]*?\n  \}\)\(\);/)[0];

  it('badgeFor/subBadgeFor ยังอยู่ในโค้ด (ถ้าถอดออก เทสต์ข้างล่างจะเขียวปลอม)', () => {
    expect(navFn).toMatch(/const badgeFor\s*=/);
    expect(navFn).toMatch(/const subBadgeFor\s*=/);
  });

  it('หมวดที่ badge ชี้ ต้องมี tab ต้นทางอยู่ในหมวดนั้นจริง', () => {
    // อ่านคู่ (groupId, tabId) จากโค้ดจริง แทนการ hardcode ไว้ในเทสต์
    const pairs = [
      { badge: /badgeFor\s*=[\s\S]*?id === "(g_\w+)" \? pendingOrders/, src: 'orders' },
      { badge: /badgeFor\s*=[\s\S]*?id === "(g_\w+)" \? pendingRecv/, src: 'transfers' },
    ];
    for (const p of pairs) {
      const gid = navFn.match(p.badge)[1];
      const g = OWNER_GROUPS.find((x) => x.id === gid);
      expect(g, `badge ชี้หมวด ${gid} ที่ไม่มีในตาราง`).toBeTruthy();
      expect(g.tabs, `หมวด ${gid} ไม่มี tab "${p.src}" แล้ว แต่ badge ยังชี้อยู่`).toContain(p.src);
    }
  });

  it('ตัวนับ 2 ตัวนี้ยังอ่านจาก payload ที่เชื่อถือได้ (ไม่ใช่ state ฝั่ง client)', () => {
    // จับแค่ "อ่านจาก data.orders/data.shipments + เงื่อนไขที่นับ" — ไม่ผูกกับรูปแบบ null-guard
    // (เคยพินไว้ทั้งบรรทัดแล้วแดงตอนมีคนเติม `data &&` ทั้งที่ความหมายไม่เปลี่ยน)
    const pOrders = APP.match(/const pendingOrders\s*=(.*)/)[1];
    expect(pOrders).toMatch(/data\.orders/);
    expect(pOrders).toMatch(/o\.status === "รอ"/);

    const pRecv = APP.match(/const pendingRecv\s*=(.*)/)[1];
    expect(pRecv).toMatch(/data\.shipments/);
    expect(pRecv).toMatch(/!s\.receivedAt/);
  });
});

describe('การเรนเดอร์หมวด — กันหมวดว่าง/ปุ่มกดแล้วไม่มีอะไร', () => {
  const navFn = APP.match(/const ownerNav = \(\(\) => \{[\s\S]*?\n  \}\)\(\);/)[0];

  it('หมวดที่ไม่มี tab ที่ role นั้นเข้าถึงได้ ต้องถูกตัดทิ้ง', () => {
    // g_insight เหลือแค่ margin ซึ่ง owner ไม่มีสิทธิ์ → ต้องหายไปเองสำหรับ owner (แต่ dev ยังเห็น)
    expect(navFn).toMatch(/\.filter\(g => g\.items\.length > 0\)/);
  });

  it('tab ที่ไม่มีหมวด ยังถูกดันเข้า "อื่นๆ" (กัน tab หายจากเมนูทั้งอัน)', () => {
    expect(navFn).toMatch(/leftover/);
    expect(navFn).toMatch(/g_other/);
  });

  it('หมวดที่มีเมนูเดียว กดแล้วเข้าเลย ไม่ต้องกด 2 ชั้น', () => {
    expect(APP).toMatch(/g\.items\.length === 1\) handleSetTab\(g\.items\[0\]\.id\)/);
  });
});
