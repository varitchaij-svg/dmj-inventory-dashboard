// tests/home-menu.test.js — "หน้าหลัก / เมนูทั้งหมด" (HomeMenuView + ปุ่มโลโก้)
// ─────────────────────────────────────────────────────────────────────────────
// **eval ตารางจริงจาก app.jsx ไม่ copy** (หลักเดียวกับ owner-nav.test.js) — สิ่งที่ต้องกันคือ
// "เมนูหายไปจากหน้าหลักโดยไม่มี error ให้เห็น" ซึ่งหน้าจอยังเรนเดอร์ได้ปกติทุกกรณี:
//   1. เพิ่มแท็บใหม่เข้า ROLE_TABS แต่ไม่มีใน TABS → หน้าหลักไม่มีการ์ดนั้น (แต่แถบเมนูก็ไม่มีเหมือนกัน)
//   2. เพิ่มแท็บใหม่แต่ลืม `desc` → การ์ดว่างครึ่งใบ (คนที่ไม่เคยเปิดเมนูนั้นเดาไม่ออกว่าทำอะไรได้)
//   3. เผลอใส่ "home" เข้า ROLE_TABS → โผล่เป็นปุ่มเกินบนแถบทุก role + ของ owner ตกกอง "อื่นๆ"
//   4. โลโก้ถูกเปลี่ยนกลับเป็น <div> / ปุ่มไม่ได้พาไปหน้าหลัก → ไม่มีทางเข้าหน้านี้เลยทั้งแอป
//   5. หน้าหลักหลุดจาก NO_DATA_TABS → กดโลโก้ตอนเปิดแอปแล้วเจอจอโหลด กดต่อไปไหนไม่ได้
//   6. เลขเตือนบนการ์ดแยกสูตรกับเลขบนเมนูย่อยของ owner → เลขสองที่ไม่ตรงกัน
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(ROOT, 'app.jsx'), 'utf8');
const HTML = readFileSync(join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');

// ── ดึงตาราง + ตัวจัดกลุ่มจริงจาก app.jsx มา eval ──
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

// groupTabsFor ตัวจริง (ไม่เขียนใหม่ในเทสต์ — ไม่งั้นทดสอบสำเนาที่ drift ได้)
const groupTabsFor = (() => {
  const src = APP.match(/function groupTabsFor\(allowedTabIds\) \{[\s\S]*?\n\}/);
  if (!src) throw new Error('หา groupTabsFor ใน app.jsx ไม่เจอ');
  // eslint-disable-next-line no-new-func
  return new Function('TABS', 'OWNER_GROUPS', `${src[0]}\nreturn groupTabsFor;`)(TABS, OWNER_GROUPS);
})();

const splitTabLabel = (() => {
  const src = APP.match(/function splitTabLabel\(label\) \{[\s\S]*?\n\}/);
  if (!src) throw new Error('หา splitTabLabel ใน app.jsx ไม่เจอ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src[0]}\nreturn splitTabLabel;`)();
})();

const ROLES = Object.keys(ROLE_TABS);

describe('หน้าหลัก — ต้องมีเมนูครบทุกอันที่ role นั้นมีสิทธิ์', () => {
  it.each(ROLES)('role %s: เมนูบนหน้าหลัก = แท็บใน ROLE_TABS เป๊ะ ๆ (ไม่ขาด ไม่เกิน)', (role) => {
    const ids = groupTabsFor(ROLE_TABS[role]).flatMap((g) => g.items.map((t) => t.id));
    expect(ids.slice().sort()).toEqual(ROLE_TABS[role].slice().sort());
  });

  it.each(ROLES)('role %s: ไม่มีเมนูไหนโผล่ซ้ำ 2 หมวด', (role) => {
    const ids = groupTabsFor(ROLE_TABS[role]).flatMap((g) => g.items.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ROLES)('role %s: ไม่มีหมวดว่างโผล่บนจอ (หัวข้อที่กดเข้าไปไม่เจออะไร)', (role) => {
    for (const g of groupTabsFor(ROLE_TABS[role])) {
      expect(g.items.length, `หมวด ${g.id} ของ ${role} ว่าง`).toBeGreaterThan(0);
    }
  });
});

describe('การ์ดบนหน้าหลัก — ต้องอ่านรู้เรื่องทุกใบ', () => {
  it('ทุกแท็บมีคำอธิบาย (desc) — ลืมใส่ = การ์ดว่างครึ่งใบ', () => {
    const missing = TABS.filter((t) => !t.desc || !String(t.desc).trim()).map((t) => t.id);
    expect(missing).toEqual([]);
  });

  it('คำอธิบายสั้นพอที่จะไม่ดันการ์ดสูงจนเลื่อนหาเมนูไม่เจอ (≤ 60 ตัวอักษร)', () => {
    const tooLong = TABS.filter((t) => String(t.desc).length > 60).map((t) => `${t.id}:${t.desc.length}`);
    expect(tooLong).toEqual([]);
  });

  it('แยกอีโมจิออกจากชื่อได้ครบทุกแท็บ (ชื่อต้องไม่ว่าง/ไม่เหลืออีโมจิติดมา)', () => {
    for (const t of TABS) {
      const { emoji, name } = splitTabLabel(t.label);
      expect(emoji, t.id).toBeTruthy();
      expect(name.trim(), t.id).toBeTruthy();
      expect(`${emoji} ${name}`, t.id).toBe(t.label);
    }
  });
});

describe('ทางเข้าหน้าหลัก — โลโก้ต้องกดได้เสมอ', () => {
  it('"home" ต้องไม่อยู่ใน ROLE_TABS ของ role ไหนเลย', () => {
    const leaked = ROLES.filter((r) => ROLE_TABS[r].includes('home'));
    expect(leaked).toEqual([]);
  });

  it('"home" ต้องไม่อยู่ใน TABS/OWNER_GROUPS (ไม่ใช่แท็บบนแถบเมนู)', () => {
    expect(TABS.map((t) => t.id)).not.toContain('home');
    expect(OWNER_GROUPS.flatMap((g) => g.tabs)).not.toContain('home');
  });

  it('โลโก้เป็น <button> จริง (กดด้วยคีย์บอร์ด/โปรแกรมอ่านหน้าจอได้) และพาไปหน้าหลัก', () => {
    const brand = APP.match(/<button className=\{`brand[\s\S]*?<\/button>/);
    expect(brand, 'โลโก้ไม่ใช่ <button> แล้ว — ไม่มีทางเข้าหน้าหลัก').toBeTruthy();
    expect(brand[0]).toMatch(/handleSetTab\(HOME_TAB\)/);
    expect(brand[0]).toMatch(/aria-label=/);
  });

  it('activeTab ปล่อยผ่าน HOME_TAB (ไม่งั้นกดโลโก้แล้วเด้งกลับแท็บแรกทันที)', () => {
    expect(APP).toMatch(/const activeTab = \(tab === HOME_TAB \|\| allowedTabIds\.includes\(tab\)\)/);
  });

  it('มี route ของหน้าหลักใน <main> จริง', () => {
    expect(APP).toMatch(/activeTab === HOME_TAB\s+&& <ErrorBoundary key="home"><HomeMenuView/);
  });

  it('คำใบ้ "แตะเพื่อดูเมนูทั้งหมด" ต้องไม่ถูกซ่อนบนมือถือ (จอหลักของร้าน)', () => {
    expect(APP).toMatch(/แตะเพื่อดูเมนูทั้งหมด/);
    // เดิม @media 720px ซ่อน .brand-sub ทิ้ง — ซ่อนแล้วไม่มีอะไรบอกเลยว่าโลโก้กดได้
    expect(HTML).not.toMatch(/\.brand-sub \{ display: none; \}/);
  });
});

describe('หน้าหลักต้องเปิดได้ทั้งที่ข้อมูลก้อนใหญ่ยังไม่มา', () => {
  it('HOME_TAB อยู่ใน NO_DATA_TABS', () => {
    const m = APP.match(/const NO_DATA_TABS = \[([^\]]*)\]/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/HOME_TAB/);
  });

  it('HomeMenuView ไม่อ่าน data.* เลยแม้แต่ที่เดียว', () => {
    // ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์อธิบายที่มาของตัวเลขย่อมอ้างชื่อ data.xxx ได้ตามปกติ
    // สิ่งที่ต้องกันคือ "โค้ดจริงไปอ่าน data" (= จอขาวตอน payload ยังไม่มา) ไม่ใช่คำในคำอธิบาย
    const view = APP.match(/function HomeMenuView\([\s\S]*?\n\}/)[0].replace(/\/\/[^\n]*/g, '');
    expect(view).not.toMatch(/\bdata\./);
  });
});

describe('เลขเตือนบนการ์ด — ต้องเป็นสูตรเดียวกับเมนูย่อยของ owner', () => {
  it('subBadgeFor ของ owner ใช้ tabBadge ตัวเดียวกัน (ไม่เขียนสูตรซ้ำ)', () => {
    expect(APP).toMatch(/const tabBadge = id => id === "orders" \? pendingOrders : id === "transfers" \? pendingRecv : 0;/);
    expect(APP).toMatch(/const subBadgeFor = tabBadge;/);
  });

  it('หน้าหลักรับ tabBadge ตัวเดียวกันนี้เข้าไป', () => {
    const call = APP.match(/<HomeMenuView[^>]*>/)[0];
    expect(call).toMatch(/tabBadge=\{tabBadge\}/);
  });

  it('ชิปงานค้างด้านบนโชว์เฉพาะเมนูที่ role นั้นเปิดได้จริง', () => {
    // กดแล้วต้องไปถึงเสมอ → ต้องเช็คที่ "ปลายทาง" (q.to) ไม่ใช่ที่มาของเลข (q.badge)
    // เช็คผิดฝั่ง = ชิปโผล่ให้ role ที่กดแล้วไปไม่ถึง / หายจาก role ที่ไปถึงได้จริง
    const view = APP.match(/function HomeMenuView\([\s\S]*?\n\}/)[0];
    expect(view).toMatch(/allIds\.has\(q\.to\)/);
    expect(view).not.toMatch(/allIds\.has\(q\.badge\)/);
  });
});

describe('ชิปงานค้าง — กดตามเลขแล้วต้องเจอสิ่งที่เลขนั้นพูดถึง', () => {
  // eval รายการชิปจริงจาก HomeMenuView (ไม่ copy — ไม่งั้น drift แล้วเทสต์ยังเขียว)
  const quick = (() => {
    const view = APP.match(/function HomeMenuView\([\s\S]*?\n\}/)[0];
    const m = view.match(/const quick = \[([\s\S]*?)\]\s*\.filter/);
    if (!m) throw new Error('หารายการชิปใน HomeMenuView ไม่เจอ');
    // eslint-disable-next-line no-new-func
    return new Function(`return [${m[1]}];`)();
  })();

  it('ทุกชิปมีทั้ง "เลขมาจากไหน" (badge) และ "กดแล้วไปไหน" (to)', () => {
    for (const q of quick) {
      expect(q.badge, JSON.stringify(q)).toBeTruthy();
      expect(q.to, JSON.stringify(q)).toBeTruthy();
    }
  });

  it('ปลายทางของทุกชิปเป็นแท็บที่มีอยู่จริงใน TABS', () => {
    const ids = new Set(TABS.map((t) => t.id));
    const ghosts = quick.filter((q) => !ids.has(q.to)).map((q) => q.to);
    expect(ghosts).toEqual([]);
  });

  it('"ของรอรับ" พาไปแท็บรายการสั่งของ ตัวกรอง "ส่งแล้ว" — ไม่ใช่แท็บโอน/ปรับ/ยกมา', () => {
    // เลขนับจาก data.shipments ที่ยังไม่มีใครกดรับ · หน้าที่ทำงานกับของกองนั้นคือ
    // orders + filter "shipped" เท่านั้น · พาไป transfers = กดตามเลขแล้วไม่เจออะไร
    const q = quick.find((x) => x.badge === 'transfers');
    expect(q, 'ไม่มีชิป "ของรอรับ" แล้ว').toBeTruthy();
    expect(q.to).toBe('orders');
    expect(q.view).toBe('shipped');
  });

  it('ชิปส่ง view ปลายทางไปด้วยตอนกด (ไม่ใช่ nav เปล่า ๆ)', () => {
    const view = APP.match(/function HomeMenuView\([\s\S]*?\n\}/)[0];
    expect(view).toMatch(/onNav\(q\.to,\s*q\.view\)/);
  });
});

describe('คำขอ "เปิดแท็บนี้ในมุมมองไหน" — ต้องต่อกันครบสาย', () => {
  const UI = readFileSync(join(ROOT, 'ui.jsx'), 'utf8');
  const ANALYTICS = readFileSync(join(ROOT, 'views-analytics.jsx'), 'utf8');

  it('ตั้งคำขอก่อนสลับแท็บเสมอ (สลับก่อน = view ปลายทาง mount ไปแล้วตอนที่ยังไม่มีคำขอ)', () => {
    const call = APP.match(/<HomeMenuView[\s\S]*?\/>/)[0];
    expect(call).toMatch(/dmjRequestView\(t, view\);\s*handleSetTab\(t\)/);
  });

  it('ใช้คีย์คนละก้อนกับคำขอ focus (ก้อนเดียวกัน = ตัวที่หยิบก่อนล้างทิ้ง อีกตัวไม่เคยเห็น)', () => {
    expect(UI).toMatch(/window\._dmjViewReq/);
    expect(UI).toMatch(/window\._dmjFocusReq/);
    // useViewIntent ต้องไม่ไปอ่าน/ล้างก้อนของ focus — ตัดคอมเมนต์ก่อนตรวจ
    // (ไม่งั้นไปจับคำในคอมเมนต์ที่อ้างถึงกันตามปกติ แล้วแดงทั้งที่โค้ดถูก)
    const hook = UI.match(/function useViewIntent\([\s\S]*?\n\}/)[0].replace(/\/\/[^\n]*/g, '');
    expect(hook).not.toMatch(/_dmjFocusReq/);
  });

  it('คำขอถูกใช้ครั้งเดียวแล้วเคลียร์ (ไม่เคลียร์ = ตัวกรองถูกตั้งใหม่ทุกครั้งที่ re-render)', () => {
    const hook = UI.match(/function useViewIntent\([\s\S]*?\n\}/)[0];
    expect(hook).toMatch(/window\._dmjViewReq = null;/);
  });

  it('แท็บ orders รับคำขอนี้จริง (ไม่มีตัวรับ = ตั้งคำขอไปแล้วไม่มีใครอ่าน)', () => {
    expect(ANALYTICS).toMatch(/useViewIntent\("orders",/);
    expect(ANALYTICS).toMatch(/if \(v === "shipped"\) setFilter\("shipped"\)/);
  });

  it('useViewIntent ถูก export ออกจาก ui.jsx (ไม่งั้น view อื่นเรียกไม่ได้)', () => {
    expect(UI).toMatch(/dmjRequestView, useViewIntent,/);
  });
});
