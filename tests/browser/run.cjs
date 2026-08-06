#!/usr/bin/env node
/* Headless full-app smoke test: โหลด app จริง (ทุก role × ทุก tab) ด้วย fixture ที่ mock
   backend ทั้งหมด — ตรวจว่า "ไม่ white-screen / ไม่ crash (ErrorBoundary) / ไม่มี console error"
   รัน: bash tests/browser/setup.sh && node tests/browser/run.cjs
   ต้องมี vendor/ (จาก setup.sh) และ Chromium ที่ Playwright ติดตั้งไว้ (/opt/pw-browsers) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE = path.join(__dirname, '.cache');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = require(path.join(CACHE, 'node_modules', 'playwright-core'));

// mirror ROLE_TABS จาก app.jsx (ถ้าแก้ที่นั่นต้องอัปเดตที่นี่ด้วย)
// dev ไม่อยู่ในนี้โดยเจตนา — เป็น superset ของ owner (+margin +whhome ซึ่ง warehouse ครอบให้แล้ว)
// การรันซ้ำอีก 27 tab กินเวลาโดยไม่ได้ coverage เพิ่ม
const ROLE_TABS = {
  owner:      ["attendance","overview","customers","pos","quotefollowup","categories","stock","orders","tracking","frontstore","ordersummary","transfers","storage","stockcount","newproduct","deadstock","trends","season","mtojobs","labels","upload","connect","auditlog","staff","staffperf","atttoday"],
  employee:   ["attendance","categories","trends","stock","storage","frontstore","transfers","orders","tracking","ordersummary","mtojobs","labels"],
  warehouse:  ["attendance","whhome","orders","stock","stockcount","storage","categories","newproduct","ordersummary","tracking","mtojobs","labels"],
  frontstore: ["attendance","frontstore","categories","stock","orders","tracking","mtojobs","labels"],
  saler:      ["attendance","pos","quotefollowup","categories","stock","tracking","orders","mtojobs","labels"],
  storedevice: ["attendance","pos","quotefollowup","categories","stock","tracking","orders","mtojobs","labels","atttoday"],
};
// tab id → ป้ายข้อความ (จาก TABS ใน app.jsx) สำหรับคลิก nav — ตัดอิโมจินำหน้าออก (คลิกด้วย substring)
const TAB_LABEL = {
  overview:"ภาพรวม", whhome:"งานคลัง", categories:"สินค้า & สั่ง", trends:"เทรนด์",
  stock:"สต๊อก & แจ้งเตือน", storage:"ตำแหน่งคลัง", stockcount:"นับ stock คลัง",
  newproduct:"เพิ่มสินค้าใหม่", frontstore:"เช็คหน้าร้าน", transfers:"โอน/ปรับ/ยกมา",
  orders:"รายการสั่งของ", tracking:"ติดตามสถานะ", ordersummary:"สรุปสินค้าออกจากคลัง",
  mtojobs:"งานจัดพิเศษ", upload:"อัปโหลด Zort", connect:"Google Sheet", labels:"พิมพ์ Label",
  // ⚠️ staff ต้องใส่อิโมจินำหน้าด้วย — คลิกด้วย substring และ "พนักงาน" ไปตรงกับ
  //    "🏅 ผลงานพนักงาน" ด้วย (จะกดผิดปุ่มเมื่อลำดับใน OWNER_GROUPS สลับ)
  auditlog:"Audit Log", staff:"👥 พนักงาน", staffperf:"ผลงานพนักงาน",
  attendance:"ลงเวลา", atttoday:"ใครเข้างานวันนี้",
  deadstock:"สินค้าจม", quotefollowup:"ใบเสนอราคา", pos:"ขาย/ออกบิล",
  customers:"ลูกค้า & ยอดซื้อ", season:"ช่วงขายดี",
};
// role ที่ใช้ nav 2 ชั้นแบบกลุ่ม (owner-l1 หมวด → owner-l2 เมนูย่อย) — ตรงกับ isAdminRole ใน app.jsx
const ADMIN_ROLES = new Set(["owner", "dev"]);

// (ก) assert เฉพาะเจาะจงต่อ tab — อิงข้อมูลจาก fixture (deterministic)
// คืน {ok, detail}; tab ที่ไม่มีใน map = smoke อย่างเดียว (แค่ไม่ crash)
// ทุก fn รับ page คืน Promise<{ok,detail}>
const ASSERT = {
  overview: async (page) => {
    const svg = await page.locator('svg.recharts-surface').count();
    const marks = await page.locator('.recharts-rectangle, .recharts-line-curve, .recharts-sector').count();
    return { ok: svg >= 1 && marks >= 1, detail: `recharts svg=${svg} marks=${marks}` };
  },
  transfers: async (page) => {
    const svg = await page.locator('svg.recharts-surface').count();
    return { ok: svg >= 1, detail: `recharts svg=${svg}` };
  },
  // categories: สินค้า + การ์ด "งานของฉัน" (MyJobsCard) ที่มาจากงาน MTO ของ STF001 ใน fixture
  // นับเฉพาะงานที่ยังไม่เสร็จ → ต้องได้ 1 งาน (อีกงานปิดแล้ว + เป็นของ STF002)
  categories: async (page) => {
    const base = await hasText(page, ['VAS001', 'FLW002', 'DEC003'], 'product SKU');
    if (!base.ok) return base;
    const mine = await hasText(page, ['งานของฉัน', 'มี 1 งานที่ยังไม่เสร็จ'], 'การ์ดงานของฉัน');
    return { ok: mine.ok, detail: base.detail + ' | ' + mine.detail };
  },
  whhome:     async (page) => hasText(page, ['งานของฉัน', 'มี 1 งานที่ยังไม่เสร็จ'], 'การ์ดงานของฉัน'),
  stock:      async (page) => hasText(page, ['FLW002'], 'low-stock SKU (FLW002 qty8<threshold)'),
  storage:    async (page) => hasText(page, ['A1/05', 'A2/03', 'DEC003'], 'lock/สินค้าในคลัง'),
  // ชื่อผู้สั่ง/ผู้จัดต้องขึ้นจริงบนแถวออเดอร์ (ไม่ใช่แค่มีข้อมูลอยู่ใน payload)
  orders:     async (page) => {
    const base = await hasText(page, ['VAS001', 'FLW002'], 'order SKU');
    if (!base.ok) return base;
    const who = await hasAllText(page,
      ['สั่ง: สมชาย ใจดี (หน้าร้าน)', 'จัด: สมหญิง ขยัน (คลังสินค้า)'], 'ชื่อผู้สั่ง/ผู้จัด');
    return { ok: who.ok, detail: base.detail + ' | ' + who.detail };
  },
  mtojobs:    async (page) => hasText(page, ['จัดช่อพิเศษ', 'จัดกระเช้า'], 'MTO job name'),
  frontstore: async (page) => hasText(page, ['VAS001', 'FLW002', 'DEC003'], 'product SKU'),
  pos:        async (page) => hasText(page, ['ขาย / ออกบิล', 'รายการในบิล', 'รับชำระ'], 'PosView UI'),
  attendance: async (page) => hasText(page, ['สมชาย ใจดี'], 'ชื่อ+ไทม์ไลน์จาก myToday'),
  atttoday:   async (page) => hasText(page, ['สมชาย ใจดี', 'สมหญิง ขยัน'], 'รายชื่อจาก attendanceToday'),
  // ผลงานพนักงาน: ต้องขึ้น "ครบ" ทั้งชื่อคน ยอดงาน หัวข้อกลุ่มตามตำแหน่ง (ไม่ใช่อันดับรวม)
  // และการ์ดเตือนชื่อที่จับคู่ไม่ได้ — hasText เป็น OR จึงต้องใช้ hasAllText ตรงนี้
  staffperf:  async (page) => hasAllText(page,
    ['สมหญิง ขยัน', 'สมชาย ใจดี', '🏭 คลังสินค้า', '🌸 หน้าร้าน', '148',
     'ชื่อที่จับคู่กับพนักงานไม่ได้'], 'สรุปผลงานแยกตามตำแหน่ง'),
  // ลูกค้า: ต้องขึ้น "ครบ" ทั้ง Top ลูกค้าสะสมเดิม และบล็อกใหม่ "ลูกค้าใหม่ vs ลูกค้าเก่า"
  // (hasText เป็น OR — ใช้ตรงนี้แล้วบล็อกใหม่หายไปทั้งก้อนเทสต์ก็ยังเขียว)
  customers:  async (page) => hasAllText(page,
    ['Top ลูกค้าสะสม', 'ลูกค้าใหม่ vs ลูกค้าเก่า', 'บริษัท กรีน เฮ้าส์ จำกัด',
     'ซื้อเพิ่ม', 'ซื้อลดลง', 'หายไป'], 'ลูกค้าใหม่/เก่า + Top สะสม'),
  // หมายเหตุ: ordersummary/labels เป็น smoke-only — เนื้อหาขึ้นกับ workflow state
  // (ordersummary โชว์เฉพาะ order สถานะ "สำเร็จ" พร้อมส่ง, labels โชว์คิวพิมพ์ที่ seed จาก view อื่น)
  // fixture แบบ static จึงไม่มีเนื้อหา deterministic ให้ assert — ตรวจแค่ "ไม่ crash"
};
// nav ไป tab เป้าหมาย — รองรับทั้ง nav ชั้นเดียว (role ทั่วไป) และ 2 ชั้นแบบกลุ่ม (owner/dev)
// ยืนยันผลด้วย <main data-screen-label="<tabid>"> เสมอ ไม่ใช่แค่ "กดปุ่มแล้ว"
// (Playwright locator click = ตรวจ visible/enabled จริง เชื่อถือได้กว่า evaluate .click())
async function navigateTo(page, role, tab) {
  const label = TAB_LABEL[tab] || tab;
  const onTab = () => page.locator(`main[data-screen-label="${tab}"]`).count().then(n => n > 0);
  const click = async (loc) => {
    if (!(await loc.count())) return false;
    await loc.first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(150);
    return true;
  };
  if (await onTab()) return true;

  if (ADMIN_ROLES.has(role)) {
    // ชั้น 2 ของหมวดที่เปิดอยู่ก่อน → ไม่เจอค่อยไล่กดหมวดในชั้น 1 ทีละอัน
    // (ไล่กดแทนการ mirror OWNER_GROUPS ไว้ที่นี่ — กันเทสต์ drift เมื่อมีการสลับ tab ข้ามหมวด)
    if (await click(page.locator('.owner-l2 button', { hasText: label })) && await onTab()) return true;
    const groups = page.locator('.owner-l1 button');
    const n = await groups.count();
    for (let i = 0; i < n; i++) {
      await groups.nth(i).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(150);
      if (await onTab()) return true;  // หมวดที่มีเมนูเดียว → กดแล้วเข้าเลย (ชั้น 2 ถูกซ่อน)
      if (await click(page.locator('.owner-l2 button', { hasText: label })) && await onTab()) return true;
    }
    return false;
  }

  // role ทั่วไป: ทุกแท็บอยู่บนแถบเลื่อนแนวนอนเดียว ไม่มี "เพิ่มเติม"
  await click(page.locator('.navtabs button', { hasText: label }));
  if (await onTab()) return true;
  // เผื่อกรณีที่ role นั้นถูกปรับให้มี "เพิ่มเติม" ในอนาคต
  if (await click(page.locator('.navtabs button', { hasText: 'เพิ่มเติม' }))) {
    await click(page.locator('button', { hasText: label }));
  }
  return onTab();
}
async function hasText(page, tokens, label) {
  const body = await page.evaluate(() => document.body.innerText);
  const found = tokens.find(t => body.includes(t));
  return { ok: !!found, detail: found ? `พบ "${found}"` : `ไม่พบ ${label} (${tokens.join('/')})` };
}

// เหมือน hasText แต่ต้องเจอ "ครบทุกตัว" — ใช้ตอนที่ต้องพิสูจน์ว่าหลายอย่างขึ้นพร้อมกันจริง
// (hasText เป็น OR: ใส่ token เพิ่มแล้วเทสต์ยังเขียวทั้งที่ของใหม่ไม่ได้ถูกเรนเดอร์เลย)
async function hasAllText(page, tokens, label) {
  const body = await page.evaluate(() => document.body.innerText);
  const missing = tokens.filter(t => !body.includes(t));
  return {
    ok: missing.length === 0,
    detail: missing.length ? `ไม่พบ ${label}: ${missing.join(' / ')}` : `พบครบ (${tokens.join(', ')})`,
  };
}

// หา executablePath: agent env ใช้ headless_shell ที่ /opt/pw-browsers,
// CI ใช้ browser ที่ `npx playwright install chromium` ติดตั้ง → คืน null ให้ playwright resolve เอง
function findChromium() {
  try {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    if (fs.existsSync(base)) {
      const shell = fs.readdirSync(base).find(d => d.startsWith('chromium_headless_shell'));
      if (shell) {
        const p = path.join(base, shell, 'chrome-linux', 'headless_shell');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (_) {}
  return null; // ให้ playwright-core หา browser เอง (CI หลัง playwright install)
}
async function launchBrowser() {
  const exe = findChromium();
  return chromium.launch(exe ? { executablePath: exe, headless: true } : { headless: true });
}

// static server: serve repo root (jsx/config.js/tests/…)
const MIME = { '.html':'text/html', '.js':'application/javascript', '.jsx':'application/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const fp = path.join(ROOT, u);
      if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'text/plain' });
      fs.createReadStream(fp).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}/tests/browser/harness.html`;
  const browser = await launchBrowser();
  const results = [];

  for (const role of Object.keys(ROLE_TABS)) {
    for (const tab of ROLE_TABS[role]) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
      page.on('console', m => {
        if (m.type() !== 'error') return;
        const t = m.text();
        // ข้าม network 404 ของ asset (favicon/logo/รูป/ฟอนต์) — ไม่ใช่ bug ของ app logic
        if (/Failed to load resource|favicon|net::ERR|ERR_/.test(t)) return;
        // ข้ามคำเตือนของ Babel standalone (ไฟล์ view ใหญ่เกิน 500KB) — เป็น note ของ compiler
        // ไม่ใช่ error ของ app · ของจริงบนเว็บก็ขึ้นแบบเดียวกัน
        if (/\[BABEL\]|deoptimised the styling/.test(t)) return;
        errors.push('CONSOLE: ' + t.slice(0, 200));
      });
      let status = 'ok', note = '';
      try {
        await page.goto(`${base}?role=${role}&tab=${tab}`, { timeout: 15000 });
        await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
        const bootErr = await page.evaluate(() => window.__BOOT_ERR || null);
        if (bootErr) { status = 'BOOT_FAIL'; note = bootErr.slice(0, 160); }
        else {
          const navigated = await navigateTo(page, role, tab);
          if (!navigated) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ (data-screen-label ไม่ตรง)'; }
          await page.waitForTimeout(700); // ให้ view render + chart placeholder→chart
          const info = await page.evaluate(() => ({
            rootLen: (document.getElementById('root')||{}).innerHTML ? document.getElementById('root').innerHTML.length : 0,
            crash: document.body.innerText.includes('เกิดข้อผิดพลาด'),
          }));
          // ประเมินผลเฉพาะเมื่อ nav สำเร็จ (ไม่ทับ NAV_FAIL)
          if (status === 'ok') {
            if (info.rootLen < 50) { status = 'WHITE_SCREEN'; note = 'root ว่าง/สั้นผิดปกติ'; }
            else if (info.crash) { status = 'ERROR_BOUNDARY'; note = 'พบ fallback "เกิดข้อผิดพลาด"'; }
            else if (errors.some(e => e.includes('[ErrorBoundary]'))) { status = 'ERROR_BOUNDARY'; note = 'ErrorBoundary logged'; }
            else if (errors.length) { status = 'CONSOLE_ERR'; note = errors[0]; }
          }
          // (ก) assert เนื้อหาเฉพาะ tab (นอกเหนือจาก "ไม่ crash")
          if (status === 'ok' && ASSERT[tab]) {
            try {
              const a = await ASSERT[tab](page);
              if (!a.ok) { status = 'ASSERT_FAIL'; note = a.detail; }
              else note = a.detail;
            } catch (e) { status = 'ASSERT_FAIL'; note = 'assert error: ' + String(e.message || e).slice(0, 100); }
          }
        }
      } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 160); }
      await page.screenshot({ path: path.join(SHOTS, `${role}__${tab}.png`) }).catch(()=>{});
      results.push({ role, tab, status, note });
      await page.close();
    }
  }
  // ── (ข) Interaction tests: กดปุ่มแล้ว modal เปิด/ปิดจริงไหม ────────────────
  // แต่ละ interaction: nav ไป tab → (preStep ถ้ามี เช่นเลือกหมวด) → กด trigger →
  // ยืนยัน modal เปิด → กดปิด (×) → ยืนยัน modal หาย
  // หมายเหตุ: OrderModal open/close ครอบคลุมด้วย StockView interaction แล้ว (กลไกเดียวกัน)
  // CategoryView order button ต้องเลือกหมวดก่อน (view-state) จึงไม่เพิ่ม test ที่เปราะ —
  // ถ้าจะเพิ่ม flow อื่นในอนาคต (โอนสต็อก/นับ stock) เพิ่มใน array นี้ได้เลย
  const interactions = [
    { name: 'StockView "ควรสั่ง" → OrderModal เปิด+ปิด', tab: 'stock', trigger: 'ควรสั่ง' },
  ];
  const MODAL = '[data-modal="order"]';
  for (const it of interactions) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&tab=${it.tab}`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'owner', it.tab))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      await page.waitForTimeout(400);
      if (it.preStep) { // เช่น เลือกหมวดก่อน เพื่อให้การ์ดโชว์ปุ่มสั่ง
        const pre = page.locator('button', { hasText: it.preStep }).first();
        if (await pre.count()) { await pre.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
      }
      const trig = page.locator('button', { hasText: it.trigger }).first();
      if (status !== 'ok') { /* nav ไม่ผ่าน — ไม่ต้องทับด้วยผลขั้นถัดไป */ }
      else if (!(await trig.count())) { status = 'NO_TRIGGER'; note = `ไม่พบปุ่ม "${it.trigger}"`; }
      else {
        await trig.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
        if (!(await page.locator(MODAL).count())) { status = 'MODAL_FAIL'; note = 'กดแล้ว modal ไม่เปิด'; }
        else {
          // ปิด modal — คลิก × ในหัว modal
          const closeBtn = page.locator(`${MODAL} button`, { hasText: '×' }).first();
          if (await closeBtn.count()) await closeBtn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
          note = (await page.locator(MODAL).count()) ? 'modal เปิดได้ แต่ปิดไม่หาย' : 'modal เปิด+ปิดสำเร็จ';
          if (note.includes('ปิดไม่หาย')) status = 'MODAL_CLOSE_FAIL';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `interaction__${it.tab}.png`) }).catch(()=>{});
    results.push({ role: 'interact', tab: it.name, status, note });
    await page.close();
  }

  // ── (ค) กระดิ่งแจ้งเตือนในแอป: badge → เปิด panel → กดแล้วพาไป tab ปลายทาง ──
  // รันข้าม role เพราะกระดิ่งอยู่บน topnav ของทุก role (คนละ nav layout กัน owner vs อื่น ๆ)
  for (const bellRole of ['owner', 'warehouse']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=${bellRole}&tab=stock`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      await page.waitForSelector('.noti-btn', { timeout: 8000 });
      const badge = (await page.locator('.noti-badge').first().textContent().catch(() => '') || '').trim();
      if (badge !== '1') { status = 'BADGE_FAIL'; note = `badge = "${badge}" (คาด "1")`; }
      else {
        await page.locator('.noti-btn').first().click({ timeout: 2000 });
        await page.waitForTimeout(300);
        const rows = await page.locator('.noti-item').count();
        const unreadRows = await page.locator('.noti-item.unread').count();
        if (rows !== 2 || unreadRows !== 1) {
          status = 'PANEL_FAIL'; note = `รายการ=${rows} (คาด 2), ยังไม่อ่าน=${unreadRows} (คาด 1)`;
        } else {
          // กดรายการที่ยังไม่อ่าน → ต้องปิด panel + พาไปแท็บ orders
          await page.locator('.noti-item.unread').first().click({ timeout: 2000 });
          await page.waitForTimeout(500);
          const stillOpen = await page.locator('.noti-panel').count();
          const onOrders = await page.locator('body').innerText()
            .then(t => /รายการสั่งของ|VAS001/.test(t)).catch(() => false);
          if (stillOpen) { status = 'PANEL_CLOSE_FAIL'; note = 'กดแล้ว panel ไม่ปิด'; }
          else if (!onOrders) { status = 'NAV_FAIL'; note = 'กดแล้วไม่พาไปแท็บปลายทาง'; }
          else note = 'badge/panel/nav ครบ';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `notibell__${bellRole}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `กระดิ่งแจ้งเตือน (${bellRole})`, status, note });
    await page.close();
  }

  // ── (ง) ทางด่วนลงเวลา: ข้อมูลก้อนใหญ่ยังไม่มา แต่ต้องลงเวลาได้แล้ว ──────────
  // `?nodata=1` = ไม่ seed localStorage + คำขอ payload ค้างไม่ตอบ (เหมือนเน็ตร้านช้า)
  // นี่คือสภาพจริงของพนักงานที่เปิดแอปบนเครื่องใหม่/หลังล้าง cache แล้วมาสแกนเข้างาน
  // ⚠️ เทสต์ปกติทุกตัวเดินผ่านเส้นทาง "มีข้อมูลแล้ว" เท่านั้น เส้นนี้จึงไม่เคยถูกทดสอบเลย
  for (const fpRole of ['frontstore', 'warehouse']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=${fpRole}&tab=attendance&nodata=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      await page.waitForTimeout(1200);
      const txt = await page.locator('body').innerText();
      const punchable = /เข้างาน|ลงเวลา/.test(txt);
      const stuck     = /กำลังโหลดข้อมูล Dashboard/.test(txt);
      const navCount  = await page.locator('.topnav, nav').count();
      if (stuck)          { status = 'BLOCKED';  note = 'ยังติดจอโหลด — ทางด่วนไม่ทำงาน'; }
      else if (!punchable){ status = 'NO_PUNCH'; note = 'ไม่เห็นปุ่มลงเวลา'; }
      else if (!navCount) { status = 'NO_NAV';   note = 'ไม่มีแถบเมนู — ออกจากแท็บนี้แล้วกลับมาไม่ได้'; }
      else {
        // กดไปแท็บที่ต้องใช้ข้อมูล → ต้องเห็นจอโหลด **แต่แถบเมนูต้องยังอยู่**
        await navigateTo(page, fpRole, 'stock').catch(() => {});
        await page.waitForTimeout(600);
        const navAfter = await page.locator('.topnav, nav').count();
        if (!navAfter) { status = 'NAV_LOST'; note = 'กดแท็บอื่นแล้วแถบเมนูหาย = กลับมาลงเวลาไม่ได้'; }
        else note = 'ลงเวลาได้ทั้งที่ยังไม่มีข้อมูล + เมนูอยู่ครบ';
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `fastpath__${fpRole}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `ทางด่วนลงเวลา (${fpRole})`, status, note });
    await page.close();
  }

  await browser.close();
  srv.close();

  // สรุปผล
  const fails = results.filter(r => r.status !== 'ok');
  console.log('\n=== DMJ headless full-app smoke test ===');
  for (const r of results) {
    const mark = r.status === 'ok' ? '✅' : '❌';
    console.log(`${mark} ${r.role.padEnd(11)} ${r.tab.padEnd(13)} ${r.status}${r.note ? ' — ' + r.note : ''}`);
  }
  console.log(`\n${results.length - fails.length}/${results.length} ผ่าน · screenshots: tests/browser/screenshots/`);
  process.exit(fails.length ? 1 : 0);
})();
