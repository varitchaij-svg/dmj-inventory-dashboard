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
  owner:      ["attendance","overview","customers","pos","quotefollowup","categories","stock","orders","tracking","frontstore","ordersummary","transfers","storage","stockcount","newproduct","deadstock","trends","season","mtojobs","labels","upload","connect","auditlog","staff","staffperf","atttoday","attreport"],
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
  attendance:"ลงเวลา", atttoday:"ใครเข้างานวันนี้", attreport:"รายงานการเข้างาน",
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
  // ต้องเจอ "ครบทุกตัว": ช่อง A0/B0 (ของที่ไม่ได้อยู่บนชั้น) ต้องขึ้นทั้ง 2 ซอยเสมอแม้ซอยนั้นว่าง
  // + รายการ "ยังไม่ระบุล็อค" ยังทำงาน — hasText (OR) เคยผ่านได้ด้วย token เดียว
  storage:    async (page) => hasAllText(page,
                ['A0', 'B0', 'ไม่ได้อยู่บนชั้น', 'DEC003'], 'ช่องไม่อยู่บนชั้น/สินค้าในคลัง'),
  // ชื่อผู้สั่ง/ผู้จัดต้องขึ้นจริงบนแถวออเดอร์ (ไม่ใช่แค่มีข้อมูลอยู่ใน payload)
  orders:     async (page) => {
    const base = await hasText(page, ['VAS001', 'FLW002'], 'order SKU');
    if (!base.ok) return base;
    const who = await hasAllText(page,
      ['สั่ง: สมชาย ใจดี (หน้าร้าน)', 'จัด: สมหญิง ขยัน (คลังสินค้า)'], 'ชื่อผู้สั่ง/ผู้จัด');
    return { ok: who.ok, detail: base.detail + ' | ' + who.detail };
  },
  mtojobs:    async (page) => hasText(page, ['จัดช่อพิเศษ', 'จัดกระเช้า'], 'MTO job name'),
  // ติดตามสถานะ: ต้องขึ้น "ครบ" ทั้งเลขที่ใบโอน (จัดกลุ่มรายใบ), บล็อกสรุปเป็นชิ้น, และ
  // ยอดชิ้นที่คิดจาก fixture จริง (ส่ง 24+10=34 · รับ 10 · รอรับ 24)
  // — เดิม tab นี้เป็น smoke-only ไม่ assert อะไรเลย จึงไม่มีอะไรจับได้ถ้าหน้าพัง
  // + หน่วยกำกับทั้งสองแถว ("รายการ" บนไทล์ · "ชิ้น" บนบล็อกสรุป) — คำว่า "รอรับ" โผล่
  // สองที่ด้วยเลขคนละตัว ถ้าหน่วยหายไปข้างใดข้างหนึ่งผู้ใช้จะอ่านผิดโดยไม่มีอะไรเตือน
  tracking:   async (page) => hasAllText(page,
    ['TF-20250601-001', 'TF-20250601-002', 'รวมของที่ส่งไปหน้าร้าน',
     'นับเป็น รายการ', 'นับเป็น ชิ้น', '34', 'รอรับ', 'รายใบโอน',
     'รับแล้ว 0/1 รายการ', 'รับแล้ว 1/1 รายการ'], 'ใบโอน + หน่วยกำกับครบ'),
  frontstore: async (page) => hasText(page, ['VAS001', 'FLW002', 'DEC003'], 'product SKU'),
  // ขาย/ออกบิล: ต้องมี "ครบ" ทั้งปุ่มสลับโหมด (ออนไลน์/หน้าร้าน) และตะกร้า — hasText เป็น OR
  // ถ้าใช้ OR แล้วโหมดออนไลน์หายไปทั้งดุ้น เทสต์ยังเขียวเพราะ 'ขาย / ออกบิล' ยังอยู่
  pos:        async (page) => hasAllText(page,
    ['ขาย / ออกบิล', 'ขายออนไลน์', 'ขายหน้าร้าน', 'รายการในบิล'], 'PosView UI + สลับโหมดขาย'),
  attendance: async (page) => hasText(page, ['สมชาย ใจดี'], 'ชื่อ+ไทม์ไลน์จาก myToday'),
  atttoday:   async (page) => hasText(page, ['สมชาย ใจดี', 'สมหญิง ขยัน'], 'รายชื่อจาก attendanceToday'),
  // รายงานการเข้างาน: ต้องขึ้น "ครบ" ทั้งไทล์ตัวเลข ตารางรายคน กราฟ และบล็อกสรุปเดือน
  // — hasText เป็น OR ถ้าใช้ OR แล้วบล็อกไหนหายไปทั้งดุ้นเทสต์ยังเขียวเพราะหัวเรื่องยังอยู่
  attreport:  async (page) => hasAllText(page,
    ['รายงานการเข้างาน', 'วันมาทำงาน', 'เวลาเข้างานเฉลี่ย', 'พักเฉลี่ย/วัน',
     'สรุปรายคน', 'สมชาย ใจดี', 'สมหญิง ขยัน',
     'เวลาเข้างานเฉลี่ย (เทียบตามสัปดาห์)', 'สัปดาห์ 1', 'สรุปภาพรวมประจำเดือน', 'เวลาทำงานรวม'],
    'ไทล์ตัวเลข + ตารางรายคน + กราฟรายสัปดาห์ + สรุปเดือน'),
  // ผลงานพนักงาน: ต้องขึ้น "ครบ" ทั้งชื่อคน ยอดงาน หัวข้อกลุ่มตามตำแหน่ง (ไม่ใช่อันดับรวม)
  // และการ์ดเตือนชื่อที่จับคู่ไม่ได้ — hasText เป็น OR จึงต้องใช้ hasAllText ตรงนี้
  staffperf:  async (page) => hasAllText(page,
    ['สมหญิง ขยัน', 'สมชาย ใจดี', '🏭 คลังสินค้า', '🌸 หน้าร้าน', '148',
     'ชื่อที่จับคู่กับพนักงานไม่ได้',
     // เซลต้องเห็น "ยอดขายเป็นเงิน" (฿87,500) ไม่ใช่แค่ "40 ใบ" — คำถามบริหารคนอันดับ 1
     'มาลี ขายเก่ง', '฿87,500'], 'สรุปผลงาน + ยอดขายต่อเซล'),
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
          // ── ช่อง "กรอกเอง" ต้องเก็บเลขที่พิมพ์ไว้ตรง ๆ ห้ามเด้งเป็นเลขอื่น ──
          // บั๊กจริง ส.ค. 2026: onChange clamp ทุก keystroke → ลบจนว่างแล้วเด้งเป็น "1"
          // ทันที เลขที่พิมพ์ต่อไปเลยไปต่อท้าย: ตั้งใจ 6 ได้ 16 · พนักงานเห็นว่ากรอกถูก
          // แต่ระบบสั่งอีกจำนวน · ต้องทดสอบผ่าน UI จริง — unit test เห็นแค่ source ไม่เห็น
          // พฤติกรรมของ controlled input ตอนผู้ใช้ลบแล้วพิมพ์ใหม่
          const customBtn = page.locator(`${MODAL} button`, { hasText: 'กรอกเอง' }).first();
          if (await customBtn.count()) {
            await customBtn.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(200);
            const box = page.locator(`${MODAL} input[type="number"]`).last();
            if (await box.count()) {
              await box.fill('');                       // ลบจนว่าง — จุดที่เคยเด้งเป็น "1"
              await page.waitForTimeout(120);
              const afterClear = await box.inputValue();
              await box.type('6');                      // พิมพ์ทีละตัวเหมือนคนใช้จริง
              await page.waitForTimeout(180);
              const typed = await box.inputValue();
              const confirm = (await page.locator(`${MODAL} button`, { hasText: 'ยืนยันสั่ง' })
                                         .first().textContent().catch(() => '') || '').trim();
              if (afterClear !== '') {
                status = 'QTY_AUTOFILL'; note = `ลบจนว่างแล้วช่องเด้งเป็น "${afterClear}"`;
              } else if (typed !== '6') {
                status = 'QTY_MISMATCH'; note = `พิมพ์ "6" แต่ช่องเป็น "${typed}"`;
              } else if (!/\b6\b/.test(confirm)) {
                status = 'QTY_MISMATCH'; note = `ช่องเป็น 6 แต่ปุ่มยืนยันบอก "${confirm}"`;
              } else {
                note = 'กรอกเอง 6 ชิ้น → ช่องและปุ่มยืนยันตรงกัน';
              }
            }
          }
          // ปิด modal — คลิก × ในหัว modal
          const closeBtn = page.locator(`${MODAL} button`, { hasText: '×' }).first();
          if (await closeBtn.count()) await closeBtn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);
          const stuck = !!(await page.locator(MODAL).count());
          if (stuck) { status = 'MODAL_CLOSE_FAIL'; note = 'modal เปิดได้ แต่ปิดไม่หาย'; }
          else if (status === 'ok') note = (note ? note + ' · ' : '') + 'modal เปิด+ปิดสำเร็จ';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `interaction__${it.tab}.png`) }).catch(()=>{});
    results.push({ role: 'interact', tab: it.name, status, note });
    await page.close();
  }

  // ── (ค0) รายการสั่งของ: ของหิ้วต้องอยู่บนสุด + มีหัวข้อคั่นกลุ่ม ─────────────
  // fixture: R4=FLW002 (หิ้ว) · R3=VAS001 (ขึ้นรถ) — ในชีตหิ้วอยู่แถวล่างกว่า
  // ถ้าตัวจัดลำดับหลุด จอจะยังเรนเดอร์ครบทุกใบเหมือนเดิม แค่หิ้วจมอยู่ล่าง = ไม่มี error ให้เห็น
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=warehouse&tab=orders`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'warehouse', 'orders'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(500);
        const order = await page.locator('[data-order-sku]')
          .evaluateAll(els => els.map(e => e.getAttribute('data-order-sku'))).catch(() => []);
        const body = await page.locator('body').innerText().catch(() => '');
        if (order.length < 2) { status = 'NO_ROWS'; note = `เจอแถว ${order.length} แถว (คาด ≥2)`; }
        else if (order[0] !== 'FLW002') {
          status = 'CARRY_ORDER_FAIL'; note = `แถวบนสุดคือ ${order[0]} (คาด FLW002 ของหิ้ว)`;
        } else if (!/หิ้วเอง/.test(body) || !/ขึ้นรถ/.test(body)) {
          status = 'GROUP_HEAD_FAIL'; note = 'ไม่เห็นหัวข้อคั่นกลุ่ม หิ้ว/ขึ้นรถ';
        } else note = `ของหิ้วอยู่บนสุด (${order.join(' → ')}) + มีหัวข้อคั่น`;
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'orders__carry-first.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'รายการสั่งของ — ของหิ้วอยู่บนสุด', status, note });
    await page.close();
  }

  // ── (ค0.5) ใบเสนอราคา: หน้าเจ้าของ (แดชบอร์ด) ≠ หน้าพนักงานขาย (ทำงาน "ของฉัน") ──
  // แยกหน้าแล้วเงียบได้ — จอเรนเดอร์ครบทั้งคู่ ต่างแค่ "โชว์อะไร/ซ่อนอะไร" → ต้องตรวจทั้งสองฝั่ง
  // owner: แดชบอร์ด + เทียบเซล + อัตราอนุมัติ (เครื่องมือผู้บริหาร)
  // saler: ปุ่มสร้างใหญ่ + ชิปของฉัน + เห็นเฉพาะใบตัวเอง (กด "ทั้งหมด" ถึงเห็นของคนอื่น) + ไม่มีเครื่องมือผู้บริหาร
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&tab=quotefollowup`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'owner', 'quotefollowup'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(500);
        const t = (await page.locator('body').innerText().catch(() => '')) || '';
        const has = (s) => t.includes(s);
        if (!has('สรุปสถานะใบเสนอราคา')) { status = 'OWNER_VIEW_FAIL'; note = 'ไม่เห็นหัวแดชบอร์ดเจ้าของ'; }
        else if (!has('ตามเซล') || !has('อัตราอนุมัติ')) { status = 'OWNER_VIEW_FAIL'; note = 'ไม่เห็นเครื่องมือผู้บริหาร (ตามเซล/อัตราอนุมัติ)'; }
        else if (has('สร้างใบเสนอราคาใหม่') || has('ของฉัน')) { status = 'OWNER_VIEW_FAIL'; note = 'เจ้าของเห็นของฝั่งพนักงาน (ปุ่มใหญ่/ชิปของฉัน)'; }
        else note = 'เจ้าของเห็นแดชบอร์ด + เทียบเซล + อัตราอนุมัติ · ไม่มีของฝั่งพนักงาน';
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'quote__owner.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ใบเสนอราคา — หน้าเจ้าของ (แดชบอร์ด)', status, note });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 1200 } });  // จอมือถือ — จอหลักของเซล
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=saler&tab=quotefollowup`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'saler', 'quotefollowup'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(500);
        const read = async () => (await page.locator('body').innerText().catch(() => '')) || '';
        let t = await read();
        const has = (s) => t.includes(s);
        if (!has('สร้างใบเสนอราคาใหม่') || !has('ของฉัน')) { status = 'EMP_VIEW_FAIL'; note = 'ไม่เห็นปุ่มสร้างใหญ่/ชิปของฉัน'; }
        else if (has('ตามเซล') || has('อัตราอนุมัติ')) { status = 'EMP_VIEW_FAIL'; note = 'พนักงานเห็นเครื่องมือผู้บริหาร (ตามเซล/อัตราอนุมัติ)'; }
        else if (!has('ร้านดอกไม้สวย')) { status = 'EMP_VIEW_FAIL'; note = 'ไม่เห็นใบของตัวเอง (ร้านดอกไม้สวย)'; }
        else if (has('บริษัท ของเซลอื่น')) { status = 'MINE_FILTER_FAIL'; note = 'ตัวกรอง "ของฉัน" ไม่ทำงาน — เห็นใบของเซลอื่น'; }
        else {
          // กด "📋 ทั้งหมด" → ใบของเซลอื่นต้องโผล่ (พิสูจน์ว่ากรองจริง ไม่ใช่บังเอิญ fixture ไม่มี)
          // ⚠️ ต้องเจาะจงชิป (emoji 📋 นำ) — hasText:'ทั้งหมด' เฉย ๆ ไปโดนปุ่มโลโก้ "🏠 แตะเพื่อดูเมนูทั้งหมด"
          //    แล้วเด้งไปหน้าหลักแทน (เจอตอนทำ — จอไปอยู่ HomeMenuView)
          const allChip = page.locator('button', { hasText: '📋 ทั้งหมด' }).first();
          if (await allChip.count()) {
            await allChip.scrollIntoViewIfNeeded().catch(() => {});
            await allChip.click({ timeout: 3000, force: true }).catch(() => {});
            await page.waitForTimeout(600);
          }
          t = await read();
          if (!t.includes('บริษัท ของเซลอื่น')) { status = 'ALL_TOGGLE_FAIL'; note = 'กด "ทั้งหมด" แล้วยังไม่เห็นใบของเซลอื่น'; }
          else note = 'หน้าทำงาน + "ของฉัน" กรองจริง (กดทั้งหมดเห็นของเซลอื่น) + ไม่มีเครื่องมือผู้บริหาร';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'quote__saler.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ใบเสนอราคา — หน้าพนักงานขาย (ของฉัน)', status, note });
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
        if (rows !== 3 || unreadRows !== 1) {
          status = 'PANEL_FAIL'; note = `รายการ=${rows} (คาด 3), ยังไม่อ่าน=${unreadRows} (คาด 1)`;
        } else {
          // กดรายการที่ยังไม่อ่าน → ต้องปิด panel + พาไปแท็บ orders + **เด้งไปที่ของชิ้นนั้น**
          await page.locator('.noti-item.unread').first().click({ timeout: 2000 });
          await page.waitForTimeout(500);
          const stillOpen = await page.locator('.noti-panel').count();
          const onOrders = await page.locator('body').innerText()
            .then(t => /รายการสั่งของ|VAS001/.test(t)).catch(() => false);
          // fixture ตั้ง focus:'VAS001' ไว้ ซึ่งเป็นใบ "ขึ้นรถ" = แถวที่ 2 (แถวแรกคือของหิ้ว FLW002)
          // ต้องกะพริบที่ใบนั้นใบเดียว — ไปกะพริบใบแรกแทน = เด้งผิดใบแต่ดูเหมือนทำงาน
          const flashed = await page.locator('.dmj-focus-flash[data-order-sku]')
            .first().getAttribute('data-order-sku').catch(() => null);
          if (stillOpen) { status = 'PANEL_CLOSE_FAIL'; note = 'กดแล้ว panel ไม่ปิด'; }
          else if (!onOrders) { status = 'NAV_FAIL'; note = 'กดแล้วไม่พาไปแท็บปลายทาง'; }
          else if (flashed !== 'VAS001') {
            status = 'FOCUS_FAIL'; note = `กะพริบที่ "${flashed}" (คาด VAS001) — ไม่ได้เด้งไปที่ของที่ต้องจัด`;
          }
          else {
            // ── แจ้งเตือน "ของโอนมาหน้าร้าน" → ต้องพาไปหน้า **ที่กดรับของได้** ──
            // คือแท็บ "รายการสั่งของ" ตัวกรอง "🚚 ส่งแล้ว" ไม่ใช่แค่เปิดแท็บแล้วปล่อยค้าง
            // ที่ตัวกรองเดิม (ตอนนี้คือ "ทั้งหมด" จากการเด้ง focus รอบก่อนหน้า) —
            // เปิดผิดตัวกรอง = ของที่แจ้งเตือนพูดถึงไม่อยู่ในจอเลย เงียบสนิท
            await page.locator('.noti-btn').first().click({ timeout: 2000 });
            await page.waitForTimeout(300);
            await page.locator('.noti-item').nth(1).click({ timeout: 2000 });
            await page.waitForTimeout(600);
            const activeSeg = (await page.locator('.page-head .seg-btn.active').first().textContent()
              .catch(() => '') || '').trim();
            // ยืนยันด้วยเนื้อหาจริงบนจอด้วย ไม่ใช่แค่ปุ่มที่ active — หัวข้อของโหมด "ส่งแล้ว"
            // คือ "N รายการส่งออก" (โหมดอื่นขึ้น "รอดำเนินการ") + ต้องเห็นเลขที่ใบโอนจริง
            const body = await page.locator('body').innerText().catch(() => '');
            if (!/ส่งแล้ว/.test(activeSeg)) {
              status = 'VIEW_FAIL';
              note = `กดแจ้งเตือนของโอนแล้วตัวกรองเป็น "${activeSeg}" (คาด "🚚 ส่งแล้ว")`;
            } else if (!/รายการส่งออก/.test(body) || !/TF-20250601-001/.test(body)) {
              status = 'VIEW_FAIL'; note = 'ตัวกรองถูกแต่รายการของที่รอรับไม่ขึ้นบนจอ';
            } else {
              // ── แจ้งเตือน "ของหมดหน้าร้าน" → "สินค้า & สั่ง" + เปิดตัวกรอง 🛒 ควรสั่ง ──
              // ต้องเช็คว่า **ตัวกรองเปิดจริง** ไม่ใช่แค่มาถึงแท็บ — มาถึงแล้วตัวกรองไม่ติด
              // = เห็นสินค้าทั้งหมดเหมือนเดิม ซึ่งหน้าจอดูปกติทุกประการ ไม่มีอะไรบอกว่าพลาด
              await page.locator('.noti-btn').first().click({ timeout: 2000 });
              await page.waitForTimeout(300);
              await page.locator('.noti-item').nth(2).click({ timeout: 2000 });
              await page.waitForTimeout(700);
              const onCats = await page.locator('main[data-screen-label="categories"]').count();
              const reorderOn = await page.locator('button[data-reorder="on"]').count();
              const cardSkus = await page.evaluate(() => {
                const els = [...document.querySelectorAll('main [data-sku]')];
                return [...new Set(els.map((e) => e.getAttribute('data-sku')))];
              });
              if (!onCats) { status = 'VIEW_FAIL'; note = 'กดแจ้งเตือนของหมดหน้าร้านแล้วไม่ไปแท็บสินค้า & สั่ง'; }
              else if (!reorderOn) { status = 'VIEW_FAIL'; note = 'ถึงแท็บแล้วแต่ตัวกรอง "🛒 ควรสั่ง" ไม่ถูกเปิด'; }
              // FLW002 = ตัวเดียวใน fixture ที่หน้าร้านเหลือน้อย+คลังมีของ · VAS001 ต้องถูกกรองออก
              else if (!cardSkus.includes('FLW002') || cardSkus.includes('VAS001')) {
                status = 'VIEW_FAIL';
                note = `ตัวกรองเปิดแต่รายการไม่ถูกกรอง (เห็น: ${cardSkus.join(',') || 'ไม่มี'})`;
              } else note = 'badge/panel/nav/เด้งไปที่สินค้า/ของโอน→หน้ากดรับ/หมดหน้าร้าน→ตัวกรองควรสั่ง ครบ';
            }
          }
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `notibell__${bellRole}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `กระดิ่งแจ้งเตือน (${bellRole})`, status, note });
    await page.close();
  }

  // ── (ง0) คำขอเช็คสต็อก (frontstore) → กด "ดูรายการ" ต้องเหลือแค่ SKU ที่ขอ ──
  // เจ้าของแจ้ง: กด "ดูรายการ" แล้วยังเห็นสินค้าทั้งหมด ไม่ใช่แค่ตัวที่ขอให้เช็ค
  // เดิม FrontStoreView แค่ตั้ง supplierFilter เมื่อ SKU มาจาก supplier เดียว → คำขอหลาย
  // supplier กดแล้วเงียบ · ตอนนี้กรอง products เฉพาะ SKU ที่ขอ (เหมือน StockCountView)
  // ⚠️ เช็คแค่ "มาถึงแท็บ" ไม่พอ — ต้องนับ data-sku จริงบนจอว่าเหลือแค่ VAS001
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    let status = 'ok', note = '';
    const readSkus = () => page.evaluate(() => [...new Set(
      [...document.querySelectorAll('main [data-sku]')].map((e) => e.getAttribute('data-sku')))]);
    try {
      await page.goto(`${base}?role=frontstore&checkreq=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      // ไปแท็บ "เช็คหน้าร้าน" ก่อน (จอเดียวกับที่เจ้าของอยู่ตอนกด "ดูรายการ")
      const nav = await navigateTo(page, 'frontstore', 'frontstore');
      await page.waitForTimeout(700); // รอ mounted (skeleton 350ms)
      const beforeSkus = await readSkus();
      // กด "ดูรายการ" ในแถบเหลือง "มีคำขอเช็คสต็อก" (แถบระดับ app โผล่ทุกแท็บ)
      await page.locator('button:has-text("ดูรายการ")').first().click({ timeout: 3000 });
      await page.waitForTimeout(600);
      const afterSkus = await readSkus();
      const body = await page.locator('body').innerText().catch(() => '');
      const bannerShown = /กำลังเช็คตามคำขอ/.test(body);
      if (!nav || !beforeSkus.includes('FLW002')) {
        // ก่อนกดควรเห็นหลายตัว (รวม FLW002) — ไม่เห็น = ทดสอบไม่ได้จริง (nav/หน้าเพี้ยน)
        status = 'SETUP_FAIL'; note = `ก่อนกดไม่เห็นสินค้าอื่น (nav=${nav}, ${beforeSkus.join(',') || 'ว่าง'})`;
      } else if (!afterSkus.includes('VAS001')) {
        status = 'FILTER_FAIL'; note = `กด "ดูรายการ" แล้วไม่เห็น VAS001 (เห็น: ${afterSkus.join(',') || 'ว่าง'})`;
      } else if (afterSkus.includes('FLW002') || afterSkus.includes('DEC003')) {
        status = 'FILTER_FAIL';
        note = `กดแล้วยังเห็นสินค้าที่ไม่ได้ขอ (เห็น: ${afterSkus.join(',')}) — ควรเหลือแค่ VAS001`;
      } else if (!bannerShown) {
        status = 'FILTER_FAIL'; note = 'กรองถูกแต่ไม่มีแถบ "กำลังเช็คตามคำขอ" บอกผู้ใช้';
      } else {
        note = `เห็นทั้งหมด (${beforeSkus.join(',')}) → กด "ดูรายการ" → เหลือ ${afterSkus.join(',')} + แถบกำลังเช็คตามคำขอ`;
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'checkreq__frontstore.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'คำขอเช็คสต็อก (frontstore)', status, note });
    await page.close();
  }

  // ── (ง0.1) ล้างค่านับหน้าร้านเก่าที่ไม่ตรงระบบ → บาร์ "🧹 ล้างค่านับเก่า (N)" ──
  // เจ้าของแจ้ง: หน้าเช็คหน้าร้านขึ้น "ไม่ตรง 3852" เพราะขายไปแล้วยอดเลื่อน อยากล้างเริ่มนับใหม่
  // ⚠️ เช็คว่าบาร์โผล่จริง + กดยืนยันแล้วบาร์หาย (mismatch ถูกล้าง) ไม่ใช่แค่มี element
  // ⚠️ owner/dev เท่านั้น (เจ้าของสั่ง ส.ค. 2026) — "ไม่ตรง" อาจเป็นของจริงที่ต้องรายงานก่อน
  //   ไม่ใช่แค่กดทิ้งแล้วนับใหม่ · frontstore/saler ต้องไม่เห็นปุ่มนี้เลย (ทดสอบคู่กันโดยตั้งใจ —
  //   ปลดล็อกให้ owner แล้วเผลอไม่กันตำแหน่งอื่นเป็นความพังที่เงียบสนิท)
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&fsmismatch=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const nav = await navigateTo(page, 'owner', 'frontstore');
      await page.waitForTimeout(700);
      const barBefore = await page.locator('button:has-text("ล้างค่านับเก่า")').count();
      // กดปุ่มล้าง → เข้าโหมดยืนยัน → กดยืนยัน
      await page.locator('button:has-text("ล้างค่านับเก่า")').first().click({ timeout: 3000 });
      await page.waitForTimeout(200);
      await page.locator('button:has-text("ยืนยันล้าง")').first().click({ timeout: 3000 });
      await page.waitForTimeout(800);
      const barAfter = await page.locator('button:has-text("ล้างค่านับเก่า")').count();
      const stillMismatch = await page.locator('button:has-text("ยืนยันล้าง")').count();
      if (!nav || !barBefore) {
        status = 'SETUP_FAIL'; note = `ไม่เห็นปุ่มล้างค่านับเก่า (nav=${nav}, bar=${barBefore})`;
      } else if (barAfter > 0 || stillMismatch > 0) {
        status = 'CLEAR_FAIL'; note = 'กดยืนยันแล้วบาร์ยังอยู่ — ค่านับเก่าไม่ถูกล้าง';
      } else {
        note = 'เห็นบาร์ "ล้างค่านับเก่า (1)" → กดยืนยัน → บาร์หาย (ล้าง mismatch สำเร็จ)';
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'fsclear__owner.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ล้างค่านับเก่าหน้าร้าน (owner)', status, note });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=frontstore&fsmismatch=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const nav = await navigateTo(page, 'frontstore', 'frontstore');
      await page.waitForTimeout(700);
      const bar = await page.locator('button:has-text("ล้างค่านับเก่า")').count();
      if (!nav) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else if (bar > 0) { status = 'GATE_FAIL'; note = 'frontstore เห็นปุ่ม "ล้างค่านับเก่า" ทั้งที่ต้องเห็นเฉพาะ owner/dev'; }
      else { note = 'ไม่เห็นปุ่ม "ล้างค่านับเก่า" ตามที่คาดไว้ (มีค่าไม่ตรงอยู่จริงแต่ถูกกันไว้)'; }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'fsclear__frontstore.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ล้างค่านับเก่าหน้าร้าน (frontstore ไม่เห็น)', status, note });
    await page.close();
  }

  // ── (ง0.2) ความคืบหน้าคำขอเช็คสต็อก ใน "ติดตามสถานะ" — owner/dev/saler เท่านั้น ──
  // เจ้าของสั่ง (ส.ค. 2026): แจ้งเตือนต้องบอกรหัสร้านแทนรายชื่อสินค้า + owner/dev/saler ต้องเห็น
  // ว่าคำขอที่ส่งไปเช็คถึงไหนแล้ว · fixture: fsStatus=done (เสร็จแล้ว) · whStatus=pending
  // (VAS001 นับไปแล้ว 1/2 · FLW002 ยังไม่นับ → ต้องขึ้น "ถัดไป: FLW002")
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&checkprogress=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const nav = await navigateTo(page, 'owner', 'tracking');
      await page.waitForTimeout(500);
      const chk = await hasAllText(page,
        ['คำขอเช็คสต็อกที่กำลังดำเนินการ', 'GX2312', 'เสร็จแล้ว', 'เช็คแล้ว 1/2', 'ถัดไป', 'FLW002'],
        'ความคืบหน้าคำขอเช็คสต็อก');
      if (!nav) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else if (!chk.ok) { status = 'CONTENT_FAIL'; note = chk.detail; }
      else note = 'เห็นรหัสร้าน GX2312 + หน้าร้านเสร็จแล้ว + คลังเช็คแล้ว 1/2 · ถัดไป FLW002';
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'checkprogress__owner.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ความคืบหน้าคำขอเช็คสต็อก (owner)', status, note });
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=warehouse&checkprogress=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const nav = await navigateTo(page, 'warehouse', 'tracking');
      await page.waitForTimeout(500);
      const seen = await page.locator('text=คำขอเช็คสต็อกที่กำลังดำเนินการ').count();
      if (!nav) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else if (seen > 0) { status = 'GATE_FAIL'; note = 'warehouse เห็นส่วนติดตามคำขอเช็ค ทั้งที่ต้องเห็นเฉพาะ owner/dev/saler'; }
      else note = 'ไม่เห็นส่วนติดตามคำขอเช็คตามที่คาดไว้ (คำขอมีอยู่จริงแต่ถูกกันไว้เฉพาะ owner/dev/saler)';
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'checkprogress__warehouse.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ความคืบหน้าคำขอเช็คสต็อก (warehouse ไม่เห็น)', status, note });
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

  // ── (จ) หน้าหลัก: แตะโลโก้ → เมนูทั้งหมดของตำแหน่งนั้น → กดการ์ดแล้วเข้าเมนูจริง ──
  // "home" ไม่อยู่ใน ROLE_TABS โดยเจตนา (เข้าจากโลโก้ทางเดียว) → ลูปหลักข้างบนไม่แตะเส้นนี้เลย
  // นับจำนวนการ์ดเทียบกับ ROLE_TABS ตรง ๆ เพราะ "เมนูหายไป 1 อัน" คือความพังที่หน้าจอยัง
  // ดูปกติทุกประการ — พนักงานแค่หาเมนูนั้นไม่เจอแล้วเลิกใช้ ไม่มีใครรายงานว่าเป็นบั๊ก
  for (const hmRole of ['owner', 'warehouse', 'frontstore']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=${hmRole}&tab=stock`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      await page.locator('.brand').first().click({ timeout: 2000 });
      await page.waitForTimeout(400);
      if (!(await page.locator('main[data-screen-label="home"]').count())) {
        status = 'HOME_FAIL'; note = 'กดโลโก้แล้วไม่เข้าหน้าหลัก';
      } else {
        const cards = await page.locator('.home-card').count();
        const expected = ROLE_TABS[hmRole].length;
        if (cards !== expected) {
          status = 'MENU_COUNT'; note = `การ์ด ${cards} ใบ (คาด ${expected} ตาม ROLE_TABS)`;
        } else {
          await page.locator('.home-card', { hasText: TAB_LABEL.orders }).first().click({ timeout: 2000 });
          await page.waitForTimeout(500);
          if (!(await page.locator('main[data-screen-label="orders"]').count())) {
            status = 'CARD_NAV_FAIL'; note = 'กดการ์ดแล้วไม่เข้าเมนูปลายทาง';
          } else note = `เมนูครบ ${cards} ใบ + กดการ์ดเข้าเมนูได้`;
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `home__${hmRole}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `หน้าหลัก (${hmRole})`, status, note });
    await page.close();
  }

  // ── (จ2) ชิป "🚚 ของรอรับ" ต้องพาไปถึง "สิ่งที่เลขนั้นพูดถึง" ──
  // เลขบนชิปนับของที่ส่งแล้วยังไม่มีใครกดรับ ซึ่งเห็นได้ที่แท็บ "รายการสั่งของ" ตัวกรอง
  // "🚚 ส่งแล้ว" เท่านั้น · เดิมพาไปแท็บ "โอน/ปรับ/ยกมา" = กดตามเลขแล้วไม่เจออะไร
  // ⚠️ unit test เห็นได้แค่ว่า "โค้ดตั้งคำขอ" — ว่าคำขอนั้นถูกอ่านทันก่อน view mount จริงไหม
  //    ต้องรันบนเบราว์เซอร์เท่านั้น (นี่คือจุดที่ลำดับ dmjRequestView→handleSetTab สำคัญ)
  // frontstore อยู่ในลิสต์ด้วยเพราะเดิมไม่เห็นชิปนี้เลย (ไม่มีแท็บ transfers) ทั้งที่การรับของ
  // คืองานหลักของเขา — การเช็คสิทธิ์ย้ายมาดูที่ "ปลายทาง" แล้ว
  for (const chipRole of ['owner', 'frontstore']) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=${chipRole}&tab=stock`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      await page.locator('.brand').first().click({ timeout: 2000 });
      await page.waitForTimeout(400);
      const chip = page.locator('.home-quick-chip', { hasText: 'ของรอรับ' });
      if (!(await chip.count())) {
        status = 'NO_CHIP'; note = 'ไม่มีชิป "ของรอรับ" บนหน้าหลัก';
      } else {
        await chip.first().click({ timeout: 2000 });
        await page.waitForTimeout(600);
        if (!(await page.locator('main[data-screen-label="orders"]').count())) {
          status = 'CHIP_NAV_FAIL'; note = 'กดชิปแล้วไม่เข้าแท็บรายการสั่งของ';
        } else {
          const act = (await page.locator('.seg-btn.active').first().innerText().catch(() => '')) || '';
          if (!/ส่งแล้ว/.test(act)) {
            status = 'CHIP_FILTER_FAIL';
            note = `เข้าแท็บถูกแต่ตัวกรองเป็น "${act.trim()}" (ต้องเป็น "ส่งแล้ว")`;
          } else note = 'กดชิปแล้วเข้ารายการสั่งของ + ตัวกรอง "ส่งแล้ว" ถูกตั้งให้เอง';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `homechip__${chipRole}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `ชิปของรอรับ (${chipRole})`, status, note });
    await page.close();
  }

  // ── (จ2.5) saler นับหน้าร้านได้ แต่ต้องไม่ถูกกั้นปุ่มยืนยันสั่ง ──
  // เจ้าของสั่ง (ส.ค. 2026): "เพิ่มปุ่มกดเช็คสินค้าให้ตำแหน่ง saler"
  // saler ยืนหน้าร้านเห็นชั้นวางจริง → ให้นับ/บันทึกยอดได้ **แต่ห้ามบังคับ** เพราะงานหลักคือ
  // ปิดการขายให้ทันลูกค้าที่ยืนรออยู่ · เดิมธง `needFsCheck` ตัวเดียวคุมทั้ง "โชว์การ์ดนับ" และ
  // "กั้นปุ่มยืนยัน" → เปิดให้ saler เมื่อไหร่ก็โดนกั้นไปด้วยทันที
  // ⚠️ ต้องรันบนเบราว์เซอร์จริง — unit test เห็นแค่ค่าธง ไม่เห็นว่า **ปุ่มบนจอกดได้จริงไหม**
  // ทดสอบคู่กัน 2 role โดยตั้งใจ: ปลดกั้นให้ saler โดยเผลอปลดของหน้าร้านไปด้วย = เงียบสนิท
  for (const fsCase of [
    { role: 'saler',       mustCount: false, title: 'นับหน้าร้าน' },
    { role: 'storedevice', mustCount: false, title: 'นับหน้าร้าน' },
    { role: 'frontstore',  mustCount: true,  title: 'นับก่อนสั่ง' },
  ]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=${fsCase.role}&tab=stock`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const navOk = await navigateTo(page, fsCase.role, 'stock');
      await page.waitForTimeout(400);
      const trig = page.locator('button', { hasText: 'ควรสั่ง' }).first();
      if (!navOk) {
        status = 'NAV_FAIL'; note = 'สลับไปแท็บสต๊อกไม่สำเร็จ';
      } else if (!(await trig.count())) {
        status = 'NO_TRIGGER'; note = 'ไม่พบปุ่ม "ควรสั่ง" ในแท็บสต๊อก';
      } else {
        await trig.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(500);
        const modal = page.locator('[data-modal="order"]');
        if (!(await modal.count())) {
          status = 'MODAL_FAIL'; note = 'กดแล้ว modal ไม่เปิด';
        } else {
          const body = (await modal.first().innerText().catch(() => '')) || '';
          // ① การ์ดนับต้องโผล่ให้ทั้ง 2 role (นี่คือ "ปุ่มเช็คสินค้า" ที่เจ้าของขอ)
          const hasCard = body.includes(fsCase.title) && /เหลือกี่ชิ้น/.test(body);
          // ② ปุ่มยืนยัน — saler ต้องกดได้เลย · หน้าร้านต้องยังถูกกั้นเหมือนเดิม
          const confirm = modal.locator('button', { hasText: /ยืนยันสั่ง|กรอกจำนวนหน้าร้านก่อน/ }).first();
          const cText = (await confirm.textContent().catch(() => '') || '').trim();
          const blocked = /กรอกจำนวนหน้าร้านก่อน/.test(cText) || (await confirm.isDisabled().catch(() => false));
          if (!hasCard) {
            status = 'NO_COUNT_CARD';
            note = `${fsCase.role} ไม่เห็นการ์ดนับหน้าร้าน (หา "${fsCase.title}" ไม่เจอ)`;
          } else if (blocked !== fsCase.mustCount) {
            status = fsCase.mustCount ? 'GATE_LOST' : 'SALER_BLOCKED';
            note = fsCase.mustCount
              ? `หน้าร้านหลุดการบังคับนับก่อนสั่ง (ปุ่ม: "${cText}")`
              : `saler ถูกกั้นปุ่มยืนยันทั้งที่ไม่ควรบังคับ (ปุ่ม: "${cText}")`;
          } else {
            note = fsCase.mustCount
              ? 'เห็นการ์ดนับ + ยังบังคับนับก่อนสั่งเหมือนเดิม'
              : 'เห็นการ์ดนับ + กดยืนยันสั่งได้เลย (ไม่บังคับ)';
          }
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `fscount__${fsCase.role}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `นับหน้าร้าน (${fsCase.role})`, status, note });
    await page.close();
  }

  // ── (จ2.6) ปุ่มลอย 📤 "ส่งคำขอเช็คสต็อก" ต้องโผล่ให้ saler ด้วย (เหมือน owner) ──
  // เจ้าของชี้ว่า "ปุ่มที่ว่าคือปุ่มนี้ ที่เหมือน dev กับ owner" — FAB ในแท็บ "สินค้า & สั่ง"
  // เดิมมีเฉพาะ owner/dev · ต้องรันบนเบราว์เซอร์จริงเพราะ unit test เห็นแค่ค่าธง ไม่เห็นว่า
  // ปุ่มลอยเรนเดอร์บนจอจริงไหม (และกดแล้วเปิด modal ส่งคำขอได้ไหม)
  for (const fabCase of [
    { role: 'saler',       expect: true  },
    { role: 'storedevice', expect: true  },
    { role: 'owner',       expect: true  },
    { role: 'warehouse',   expect: false },  // ไม่เคยมี — ยืนยันว่าไม่เผลอเปิดให้เกิน
  ]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=${fabCase.role}&tab=categories`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const navOk = await navigateTo(page, fabCase.role, 'categories');
      await page.waitForTimeout(400);
      // FAB = div ลอยที่มีอิโมจิ 📤 (ไม่ใช่ปุ่มในโมดัลส่งคำขอ) — จับด้วยข้อความ 📤 ที่ fixed pos
      const fab = page.locator('div', { hasText: /^📤$/ }).first();
      const seen = (await fab.count()) > 0 && (await fab.isVisible().catch(() => false));
      if (!navOk) {
        status = 'NAV_FAIL'; note = 'สลับไปแท็บสินค้า & สั่งไม่สำเร็จ';
      } else if (seen !== fabCase.expect) {
        status = fabCase.expect ? 'FAB_MISSING' : 'FAB_LEAKED';
        note = fabCase.expect
          ? `${fabCase.role} ควรเห็นปุ่มลอย 📤 แต่ไม่เห็น`
          : `${fabCase.role} ไม่ควรเห็นปุ่มลอย 📤 แต่เห็น`;
      } else if (fabCase.expect) {
        await fab.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
        const opened = await page.locator('div', { hasText: 'ส่งคำขอเช็คสต็อก' }).count();
        if (!opened) { status = 'MODAL_FAIL'; note = 'กดปุ่มลอยแล้ว modal ส่งคำขอไม่เปิด'; }
        else note = 'เห็นปุ่มลอย 📤 + กดแล้วเปิด modal ส่งคำขอเช็คสต็อกได้';
      } else {
        note = 'ไม่เห็นปุ่มลอย ตามที่คาดไว้ (คงสิทธิ์เดิม)';
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `fab__${fabCase.role}.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: `ปุ่มลอยส่งคำขอเช็ค (${fabCase.role})`, status, note });
    await page.close();
  }

  // ── (จ2.6b) ของเข้าใหม่ → บันทึก PDF: กดปุ่ม → โมดัลติ๊กวัน → เอกสาร portal ถูกสร้าง ──
  // เจ้าของสั่ง: การ์ดของเข้าใหม่ต้องพิมพ์ PDF ได้ แยกตามซัพพลายเออร์ + วันที่
  // ยืนยันบนเบราว์เซอร์จริง: ปุ่มโผล่ (owner) → เปิดโมดัล → มีวันให้ติ๊ก → เอกสาร .intake-print-page
  // ถูกสร้างใน DOM (portal ไป body) · ไม่กด window.print() จริง (headless เปิด dialog ไม่ได้)
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&tab=overview`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const navOk = await navigateTo(page, 'owner', 'overview');
      await page.waitForTimeout(500);
      const pdfBtn = page.locator('button', { hasText: 'บันทึก PDF' }).first();
      if (!navOk) {
        status = 'NAV_FAIL'; note = 'สลับไปแท็บภาพรวมไม่สำเร็จ';
      } else if (!(await pdfBtn.count())) {
        status = 'BTN_MISSING'; note = 'ไม่พบปุ่ม "บันทึก PDF" ในหัวข้อของเข้าใหม่';
      } else {
        await pdfBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
        const modalOpen = await page.locator('div', { hasText: 'บันทึก PDF ของเข้าใหม่' }).count();
        const dateRow = await page.locator('input[type="checkbox"]:checked').count();     // วันล่าสุดถูกติ๊กให้
        const sheets = await page.locator('.intake-print-area .intake-print-page').count();
        if (!modalOpen) { status = 'MODAL_FAIL'; note = 'กดแล้วโมดัลไม่เปิด'; }
        else if (dateRow < 1) { status = 'NO_DATE'; note = 'โมดัลไม่มีวันให้ติ๊ก (ตั้งต้นควรติ๊กวันล่าสุด)'; }
        else if (sheets < 1) { status = 'NO_DOC'; note = 'เอกสาร PDF (.intake-print-page) ไม่ถูกสร้างใน DOM'; }
        else note = `เปิดโมดัล → มีวันติ๊ก (${dateRow}) → เอกสาร ${sheets} แผ่นถูกสร้าง (portal)`;
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'intake_pdf__owner.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ของเข้าใหม่ บันทึก PDF (owner)', status, note });
    await page.close();
  }

  // ── (จ2.6c) พิมพ์ label โหมด "การ์ดสินค้า" (warehouse) — แผ่นแปะ QR + จำนวนเข้า + PDF ──
  // เจ้าของสั่ง: เพิ่มหัวข้อพิมพ์แผ่นแปะสินค้า (การ์ด) · ของเพิ่งเข้าคลังขึ้นก่อน ·
  // และ warehouse/saler ต้องกดดาวน์โหลดเอกสารของเข้าใหม่ได้ · ยืนยันบนเบราว์เซอร์จริงกับ warehouse
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=warehouse&tab=labels`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const navOk = await navigateTo(page, 'warehouse', 'labels');
      await page.waitForTimeout(400);
      const cardModeBtn = page.locator('button', { hasText: 'การ์ดสินค้า' }).first();
      if (!navOk) {
        status = 'NAV_FAIL'; note = 'สลับไปแท็บพิมพ์ label ไม่สำเร็จ';
      } else if (!(await cardModeBtn.count())) {
        status = 'MODE_MISSING'; note = 'ไม่พบปุ่มโหมด "การ์ดสินค้า"';
      } else {
        await cardModeBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
        // เพิ่มการ์ดผ่านชิป "เพิ่งเข้าคลัง" (fixture มี VAS001 วันนี้) หรือพิมพ์ SKU
        const chip = page.locator('button', { hasText: /VAS001/ }).first();
        if (await chip.count()) { await chip.click({ timeout: 2000 }).catch(() => {}); }
        else {
          const inp = page.locator('input[list="lbl-sku-list"]').first();
          await inp.fill('VAS001'); await inp.press('Enter');
        }
        await page.waitForTimeout(700);   // รอ QR generate + render
        const cells = await page.locator('.card-label-grid-fill > div').count();
        const pdfBtn = await page.locator('button', { hasText: 'เส้นประตัด' }).count();
        if (cells < 1) { status = 'NO_CARD'; note = 'เพิ่มสินค้าแล้วไม่มีการ์ดใน .card-label-grid-fill'; }
        else if (!pdfBtn) { status = 'NO_PDF_BTN'; note = 'ไม่พบปุ่มบันทึก PDF ของเข้าใหม่'; }
        else note = `โหมดการ์ด: เพิ่ม 1 สินค้า → ${cells} การ์ด + มีปุ่มบันทึก PDF ให้เจ้าของ`;
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'label_card__warehouse.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'พิมพ์ label การ์ดสินค้า (warehouse)', status, note });
    await page.close();
  }

  // ── (จ2.7) นับ stock คลัง "ตามซัพพลายเออร์" → auto-save → การ์ดขึ้น "บันทึกแล้ว" ──
  // เจ้าของแจ้งซ้ำ: warehouse ไม่ auto-save / นับต่างจากระบบแล้วไม่รู้ว่าแก้จำนวนจริงไหม
  // ต้องรันบนเบราว์เซอร์จริง — พิสูจน์ว่า นับ (+5) แล้วรอ 3 วิ การ์ดเปลี่ยนเป็น "บันทึกแล้ว"
  // (harness mock POST = success → confirmStockCount สำเร็จ → savedQtys อัปเดต → การ์ด saved)
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=warehouse&tab=stockcount`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const navOk = await navigateTo(page, 'warehouse', 'stockcount');
      await page.waitForTimeout(400);
      const supBtn = page.locator('button', { hasText: 'ตามซัพพลายเออร์' }).first();
      if (!navOk) { status = 'NAV_FAIL'; note = 'ไปแท็บนับ stock คลังไม่สำเร็จ'; }
      else if (!(await supBtn.count())) { status = 'NO_MODE_BTN'; note = 'ไม่พบปุ่ม "ตามซัพพลายเออร์"'; }
      else {
        await supBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
        // เลือกซัพพลายเออร์ตัวแรก (ACME/BLOOM/CRAFT จาก fixture) — คลิกที่ชื่อ (event bubble ขึ้น row)
        const sup = page.getByText('ACME', { exact: false }).first();
        if (!(await sup.count())) { status = 'NO_SUPPLIER'; note = 'ไม่พบซัพพลายเออร์ ACME ในรายการ'; }
        else {
          await sup.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(400);
          // นับเพิ่ม: กดปุ่ม +5 บนการ์ดแรก
          const plus = page.locator('button', { hasText: /^\+5$/ }).first();
          if (!(await plus.count())) { status = 'NO_COUNT_BTN'; note = 'ไม่พบปุ่ม +5 ในการ์ดนับ'; }
          else {
            await plus.click({ timeout: 2000 }).catch(() => {});
            // รอ auto-save (debounce 3 วิ) + เผื่อ POST
            await page.waitForTimeout(4200);
            const savedShown = await page.getByText('บันทึกแล้ว', { exact: false }).count();
            if (savedShown === 0) {
              status = 'NO_AUTOSAVE';
              note = 'นับแล้วรอ >3 วิ แต่การ์ดไม่ขึ้น "บันทึกแล้ว" — auto-save ไม่ทำงาน';
            } else {
              note = 'นับ +5 → auto-save 3 วิ → การ์ดขึ้น "บันทึกแล้ว" (คอมมิตเข้าคลังจริง)';
            }
          }
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'stockcount-autosave.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'นับ stock คลัง auto-save (warehouse)', status, note });
    await page.close();
  }

  // ── (จ2.7b) Realtime Stock Count — นับสต็อกแล้วเลขต้องเปลี่ยนทันทีบนแท็บ "สินค้า & สั่ง"
  //     โดยไม่ reload ทั้งหน้า (patchProductQtys) ──
  // เจ้าของสั่ง (ส.ค. 2026): กด "ยืนยัน" นับสต็อกแล้วตัวเลข stock บนเว็บต้องเปลี่ยนทันที
  // ต่างจากเทสต์ (จ2.7) ด้านบนที่เช็คแค่ว่าการ์ดในหน้านับขึ้น "บันทึกแล้ว" — เทสต์นี้พิสูจน์ว่า
  // แท็บอื่นที่แยกออกไปคนละหน้าจอเห็นเลขใหม่ **ทันทีหลัง auto-save โดยไม่ต้องรอ poll 30 วิ**
  // เพราะ harness mock (fetch stub) เป็น static fixture ไม่ track การเขียนจริง — ถ้าเห็นเลขใหม่
  // ต้องมาจาก patchProductQtys (optimistic local patch) เท่านั้น ไม่ใช่บังเอิญ reload ได้ค่าใหม่
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=warehouse&tab=stockcount`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const navOk = await navigateTo(page, 'warehouse', 'stockcount');
      await page.waitForTimeout(400);
      const supBtn = page.locator('button', { hasText: 'ตามซัพพลายเออร์' }).first();
      if (!navOk) { status = 'NAV_FAIL'; note = 'ไปแท็บนับ stock คลังไม่สำเร็จ'; }
      else if (!(await supBtn.count())) { status = 'NO_MODE_BTN'; note = 'ไม่พบปุ่ม "ตามซัพพลายเออร์"'; }
      else {
        await supBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(300);
        // ACME มีสินค้าเดียวในระบบ (VAS001, fixture qtyStore=15/qtyWH=25 → รวม 40 ชิ้น) —
        // เลือกแล้วในลิสต์นี้จึงมีการ์ดเดียว ปุ่ม "+5" ตัวแรกคือของ VAS001 แน่นอน
        const sup = page.getByText('ACME', { exact: false }).first();
        if (!(await sup.count())) { status = 'NO_SUPPLIER'; note = 'ไม่พบซัพพลายเออร์ ACME ในรายการ'; }
        else {
          await sup.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(400);
          // การ์ดนับใช้ปุ่ม -5/-1/+1/+5 ล้วน (ไม่มี <input> ในโหมดนี้ — คนละ layout กับโหมดล็อค)
          // ⚠️ คลิก "+5" สองครั้งติดกันแบบไม่รอ ต้องเว้นจังหวะให้ React re-render ก่อน ไม่งั้น
          // adjustQty ทั้งสองคลิกอ่าน checkedQtys[sku] จาก closure เดิม (ยังเป็นค่าก่อนคลิกแรก)
          // แล้วคำนวณ 0+5 ซ้ำสองครั้งแทนที่จะสะสมเป็น 5+5=10 (จังหวะสคริปต์เร็วกว่าคนกดจริง)
          const plus5 = page.locator('button', { hasText: /^\+5$/ }).first();
          if (!(await plus5.count())) { status = 'NO_COUNT_BTN'; note = 'ไม่พบปุ่ม +5 ในการ์ดนับ'; }
          else {
            // นับใหม่ = 10 (คลิก +5 สองครั้ง เว้นจังหวะ) → รวมใหม่ = qtyStore(15) + 10 = 25 ชิ้น
            // (เลือกเลขที่ไม่ชนกับสินค้าอื่นในระบบ กัน false-positive จากตัวเลขบังเอิญตรงกัน)
            await plus5.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(300);
            await plus5.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(4200); // auto-save debounce 3 วิ + POST
            const savedShown = await page.getByText('บันทึกแล้ว', { exact: false }).count();
            if (savedShown === 0) {
              status = 'NO_AUTOSAVE'; note = 'auto-save ไม่ทำงาน (การ์ดไม่ขึ้น "บันทึกแล้ว")';
            } else {
              // สลับไปแท็บ "สินค้า & สั่ง" (CategoryView) — หน้าคนละหน้าจอ ไม่ได้แตะ StockCountView
              // อีกแล้ว · ⚠️ ตั้งใจไม่ใช้แท็บ "สต๊อก & แจ้งเตือน" (StockView) — แท็บนั้นกรองเฉพาะ
              // สินค้าที่ "ใกล้หมด/หมด/ขายตก/จมนาน/เกิน" ตามเกณฑ์ต่อหมวด (VAS001 อยู่หมวด "แจกันแก้ว"
              // ที่มีเกณฑ์ยกเว้นของตัวเอง) จึงไม่การันตีว่า VAS001 จะโผล่ในแท็บนั้นไม่ว่าจำนวนจะเท่าไหร่
              // — เจอจริงตอนพัฒนาเทสต์นี้ (debug แล้วพบว่า patch ทำงานถูกต้อง แค่แท็บที่เลือกเช็คผิด)
              // CategoryView โชว์สินค้าทุกตัวไม่กรองตามสถานะสต็อก จึงเป็นแท็บที่พิสูจน์ตรงเป้ากว่า
              const navCat = await navigateTo(page, 'warehouse', 'categories');
              await page.waitForTimeout(600);
              if (!navCat) { status = 'NAV_FAIL2'; note = 'สลับไปแท็บสินค้า & สั่งไม่สำเร็จ'; }
              else {
                const body = await page.evaluate(() => document.body.innerText);
                // รูปแบบจริงใน CategoryView: "คงเหลือ\n25ชิ้น\n🏪 15 · 🏭 10" (ไม่มีช่องว่างก่อน "ชิ้น")
                const hasNew = body.includes('25ชิ้น') && body.includes('🏪 15 · 🏭 10');
                const hasOld = body.includes('40ชิ้น') || body.includes('🏭 25');
                if (!hasNew) {
                  status = 'NOT_PATCHED';
                  note = 'แท็บสินค้า & สั่ง ยังไม่เห็นเลขใหม่ (25ชิ้น / 🏪15·🏭10) — patchProductQtys ไม่ทำงานข้ามหน้า';
                } else if (hasOld) {
                  status = 'STALE_STILL_SHOWN';
                  note = 'เห็นเลขใหม่แล้ว แต่เลขเก่า (40ชิ้น / 🏭25) ยังค้างอยู่ด้วย — น่าจะมีการ์ดอื่นเพี้ยน';
                } else {
                  note = 'นับ (+10) → auto-save → สลับแท็บสินค้า & สั่ง → เห็น "25ชิ้น · 🏪15·🏭10" ทันที ไม่มีเลขเก่าค้าง (ไม่ reload)';
                }
              }
            }
          }
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'stockcount-realtime-patch.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'Realtime Stock Count — นับแล้วแท็บสินค้า & สั่ง เห็นทันที (warehouse)', status, note });
    await page.close();
  }

  // ── (จ3) ขายออนไลน์: กรอกครบ → บันทึก → ได้ "สรุปคำสั่งซื้อ" ไม่ใช่ใบเสร็จปริ้น ──
  // ต้องรันบนเบราว์เซอร์จริงเพราะสิ่งที่ทดสอบคือ **ตัวเลขบนจอที่ลูกค้าจะเห็น** — ค่าส่งบวกเข้า
  // ยอดจริงไหม, เลขบัญชีขึ้นให้ลูกค้าโอนไหม, ที่อยู่ตามไปบนสรุปไหม · unit test เห็นแค่ source
  {
    const page = await browser.newPage({ viewport: { width: 480, height: 1000 } });   // จอมือถือ = จอหลักของร้าน
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=saler&tab=pos`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'saler', 'pos'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(400);
        // 1) เพิ่มสินค้า: ค้นแล้วกดผลลัพธ์แรก (VAS001 ราคา 1,000 ใน fixture)
        const search = page.locator('main input[placeholder*="พิมพ์ชื่อ/รหัส"]').first();
        await search.fill('VAS001');
        await page.waitForTimeout(350);
        await page.locator('main div', { hasText: 'VAS001' }).last().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        // 2) ลูกค้า + จัดส่ง + ค่าส่ง + วิธีชำระ
        await page.locator('main input[placeholder*="คุณเอ"]').first().fill('คุณทดสอบ').catch(() => {});
        await page.locator('main button', { hasText: 'Flash' }).first().click({ timeout: 3000 }).catch(() => {});
        await page.locator('main textarea').first().fill('99 ถ.พัฒนาการ กทม 10250').catch(() => {});
        await page.locator('main input[placeholder="0"]').first().fill('50').catch(() => {});
        await page.locator('main button', { hasText: 'โอนเงิน' }).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);

        // fixture: VAS001 ราคา 250 + ค่าส่ง 50 = 300 (fmtBfull ปัดเป็นจำนวนเต็ม "฿300")
        const submit = page.locator('main button', { hasText: 'บันทึกการขาย' }).first();
        const label = ((await submit.textContent().catch(() => '')) || '').trim();
        // ยอดบนปุ่มต้องรวมค่าส่งแล้ว — ถ้าเป็นยอดสินค้าเปล่า ๆ แปลว่าค่าส่งหลุดจากการคิดเงิน
        if (label.indexOf('฿300') < 0) {
          status = 'SHIPFEE_NOT_IN_TOTAL';
          note = `ปุ่มบันทึกบอก "${label}" (คาด ฿300 = สินค้า 250 + ค่าส่ง 50)`;
        } else {
          await submit.click({ timeout: 3000 });
          await page.waitForTimeout(900);
          const body = await page.locator('body').innerText().catch(() => '');
          // แยกบรรทัดค่าสินค้า/ค่าจัดส่ง/ยอดที่ต้องชำระ ให้ครบ — เช็คแต่ยอดรวมอย่างเดียว
          // ไม่รู้ว่าค่าส่งถูกเอาไปบวกจริงหรือแค่ราคาสินค้าบังเอิญตรง
          const missing = ['สรุปคำสั่งซื้อ', 'RC-3-2026080099',
                           '฿250', '฿50', 'ยอดที่ต้องชำระ', '฿300',
                           '802-4-64123-4', '99 ถ.พัฒนาการ', 'Flash', 'คุณทดสอบ',
                           'บันทึกรูป', 'แชร์ให้ลูกค้า', 'คัดลอกเป็นข้อความ']
            .filter(t => body.indexOf(t) < 0);
          if (missing.length) {
            status = 'SUMMARY_MISSING'; note = 'สรุปขาด: ' + missing.join(', ');
          } else if (/ใบเสร็จรับเงิน\/ใบกำกับภาษีอย่างย่อ|ใบเสร็จ 80mm/.test(body)) {
            // เจอของใบเสร็จปริ้นในเส้นทางออนไลน์ = สองโหมดปนกัน (สิ่งที่เจ้าของขอให้เลิก)
            status = 'PRINT_RECEIPT_LEAKED'; note = 'ยังมีใบเสร็จปริ้นโผล่ในเส้นทางขายออนไลน์';
          } else note = 'ค่าส่งเข้ายอด (250+50=300) + สรุปมีเลขบัญชี/ที่อยู่/ปุ่มส่งให้ลูกค้าครบ';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'pos__online-summary.png'), fullPage: true }).catch(() => {});
    results.push({ role: 'interact', tab: 'ขายออนไลน์ — สรุปส่งลูกค้า', status, note });
    await page.close();
  }

  // ── (จ4) ขายออนไลน์: ไม่กรอกจัดส่งเลยก็ต้องบันทึกได้ ──
  // เจ้าของสั่ง (ส.ค. 2026): "จัดส่งมีให้กรอกแต่ไม่จำเป็นต้องกรอก" — ต่างจาก (จ3) ที่กรอกครบ
  // เคสนี้จงใจ **ไม่แตะ** การ์ดจัดส่งเลย (ไม่เลือกขนส่ง ไม่กรอกที่อยู่) แล้วเช็คว่าปุ่มบันทึก
  // ยังกดได้และไม่มี toast เตือนให้กรอกจัดส่งโผล่มาขวาง — unit test เห็นแค่ source ว่า guard
  // ถูกลบ แต่ไม่เห็นว่า UI จริงยังปล่อยให้กดผ่านได้ (เช่น ปุ่มอาจถูก disabled ไว้อีกจุดที่ไม่เกี่ยวกัน)
  {
    const page = await browser.newPage({ viewport: { width: 480, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=saler&tab=pos`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'saler', 'pos'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(400);
        const search = page.locator('main input[placeholder*="พิมพ์ชื่อ/รหัส"]').first();
        await search.fill('VAS001');
        await page.waitForTimeout(350);
        await page.locator('main div', { hasText: 'VAS001' }).last().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        // เฉพาะชื่อลูกค้า + วิธีชำระ — ไม่แตะการ์ด "จัดส่ง" เลยสักช่อง
        await page.locator('main input[placeholder*="คุณเอ"]').first().fill('คุณไม่ระบุขนส่ง').catch(() => {});
        await page.locator('main button', { hasText: 'โอนเงิน' }).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);

        const submit = page.locator('main button', { hasText: 'บันทึกการขาย' }).first();
        const disabled = await submit.isDisabled().catch(() => true);
        if (disabled) {
          status = 'BLOCKED_BY_SHIPPING'; note = 'ปุ่มบันทึกถูกปิดทั้งที่ไม่ได้บังคับจัดส่งแล้ว';
        } else {
          await submit.click({ timeout: 3000 });
          await page.waitForTimeout(900);
          const body = await page.locator('body').innerText().catch(() => '');
          if (/เลือกวิธีจัดส่งก่อน|ใส่ที่อยู่จัดส่งก่อน/.test(body)) {
            status = 'SHIP_TOAST_BLOCKED'; note = 'ยังมี toast เตือนให้กรอกจัดส่งอยู่';
          } else if (body.indexOf('สรุปคำสั่งซื้อ') < 0) {
            status = 'NOT_SAVED'; note = 'กดบันทึกแล้วไม่เข้าหน้าสรุป (อาจยังถูกบล็อกอยู่)';
          } else note = 'บันทึกสำเร็จโดยไม่กรอกจัดส่งเลย (ผู้รับ+วิธีชำระยังบังคับตามเดิม)';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'pos__online-no-shipping.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ขายออนไลน์ — ไม่กรอกจัดส่งก็บันทึกได้', status, note });
    await page.close();
  }

  // ── (จ5) ออกบิลแล้ว GAS ตอบ HTML — ต้องถาม billCheck ไม่ใช่ขึ้นแดงแล้วให้กดซ้ำ ──
  // 🔴 บั๊กจริง ส.ค. 2026: createSaleBill สำเร็จแต่ตอบหน้า HTML → res.json() ดิบโยน
  //    "Unexpected token '<'" → ผู้ขายกดใหม่ = บิลซ้ำ (เส้นทางรับเงินลูกค้าจริง)
  // สิ่งที่ทดสอบบนเบราว์เซอร์จริง: (1) ไม่มีแถบแดง/ข้อความ garbage (2) เข้าหน้าสรุปด้วยเลขบิล
  // จาก billCheck (3) frontend ยิง createSaleBill POST **ครั้งเดียว** ไม่ยิงซ้ำอัตโนมัติ
  {
    const page = await browser.newPage({ viewport: { width: 480, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=saler&tab=pos`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'saler', 'pos'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(400);
        const search = page.locator('main input[placeholder*="พิมพ์ชื่อ/รหัส"]').first();
        await search.fill('VAS001');
        await page.waitForTimeout(350);
        await page.locator('main div', { hasText: 'VAS001' }).last().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);
        await page.locator('main input[placeholder*="คุณเอ"]').first().fill('คุณเอชทีเอ็มแอล').catch(() => {});
        await page.locator('main button', { hasText: 'โอนเงิน' }).first().click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(300);

        // จำลอง: createSaleBill ตอบ HTML แต่บิล "ลงจริง" แล้ว → billCheck found:true
        await page.evaluate(() => {
          window.__DMJ_SALEBILL_HTML = true;
          window.__DMJ_SALEBILL_POST_COUNT = 0;
          window.__DMJ_BILLCHECK = { ok: true, found: true,
            orderNumber: 'RC-3-2026080077', documentNumber: null,
            totals: { grandTotal: 250, vat: 250 * 7 / 107, preVat: 250 - 250 * 7 / 107 },
            shipFee: 0, payTotal: 250 };
        });

        const submit = page.locator('main button', { hasText: 'บันทึกการขาย' }).first();
        await submit.click({ timeout: 3000 });
        await page.waitForTimeout(1200);
        const body = await page.locator('body').innerText().catch(() => '');
        const postCount = await page.evaluate(() => window.__DMJ_SALEBILL_POST_COUNT || 0);

        if (/Unexpected token|<!DOCTYPE|is not valid JSON/.test(body)) {
          status = 'RAW_HTML_LEAKED'; note = 'มีข้อความ garbage จาก res.json() ดิบโผล่บนจอ';
        } else if (/ออกบิลไม่สำเร็จ|บันทึกการขายไม่สำเร็จ/.test(body)) {
          status = 'FALSE_RED'; note = 'ขึ้นแดงทั้งที่ billCheck ยืนยันว่าบิลลงแล้ว (จะทำให้ผู้ขายกดซ้ำ = บิลซ้ำ)';
        } else if (body.indexOf('สรุปคำสั่งซื้อ') < 0 || body.indexOf('RC-3-2026080077') < 0) {
          status = 'NO_SUCCESS'; note = 'ไม่เข้าหน้าสรุปด้วยเลขบิลจาก billCheck';
        } else if (postCount !== 1) {
          status = 'RETRIED_POST'; note = `frontend ยิง createSaleBill ${postCount} ครั้ง (ต้อง 1 — ห้ามยิงซ้ำอัตโนมัติ)`;
        } else {
          note = 'GAS ตอบ HTML แต่บิลลงจริง → ถาม billCheck แล้วขึ้นสำเร็จ (ไม่แดง ไม่ยิง POST ซ้ำ)';
        }
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'pos__salebill-html.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'ออกบิล GAS ตอบ HTML — ถาม billCheck ไม่ยิงซ้ำ', status, note });
    await page.close();
  }

  // หน้าหลักต้องเปิดได้ทั้งที่ข้อมูลก้อนใหญ่ยังไม่มา — ถ้าติดจอโหลด ทางด่วนลงเวลาก็เสียครึ่งหนึ่ง
  // (กดโลโก้ตอนเปิดแอปใหม่แล้วเจอสปินเนอร์ = ไปไหนต่อไม่ได้เลย)
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=warehouse&tab=attendance&nodata=1`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.locator('.brand').first().click({ timeout: 2000 });
      await page.waitForTimeout(500);
      const txt = await page.locator('body').innerText();
      const onHome = await page.locator('main[data-screen-label="home"]').count();
      const cards  = await page.locator('.home-card').count();
      if (!onHome)                                     { status = 'HOME_FAIL'; note = 'กดโลโก้แล้วไม่เข้าหน้าหลัก'; }
      else if (/กำลังโหลดข้อมูล Dashboard/.test(txt))  { status = 'BLOCKED';   note = 'หน้าหลักติดจอโหลด'; }
      else if (!cards)                                 { status = 'NO_CARDS';  note = 'เข้าหน้าหลักได้แต่ไม่มีการ์ดเมนู'; }
      else {
        await page.locator('.home-card', { hasText: TAB_LABEL.attendance }).first().click({ timeout: 2000 });
        await page.waitForTimeout(500);
        if (!(await page.locator('main[data-screen-label="attendance"]').count())) {
          status = 'CARD_NAV_FAIL'; note = 'กดการ์ด "ลงเวลา" แล้วไม่กลับไปหน้าลงเวลา';
        } else note = `เข้าหน้าหลักได้ทั้งที่ยังไม่มีข้อมูล (${cards} เมนู) + กดเข้าลงเวลาได้`;
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, 'home__nodata.png') }).catch(() => {});
    results.push({ role: 'interact', tab: 'หน้าหลัก (ยังไม่มีข้อมูล)', status, note });
    await page.close();
  }

  // ── รายงานการเข้างาน: เลือกคน → ต้องได้ "รายวัน" จริง และอ่านได้บนจอมือถือ ──
  // ⚠️ ต้องรันบนเบราว์เซอร์จริง 2 เหตุผลที่ unit test แทนไม่ได้:
  //   1. ตารางรายวัน 9 คอลัมน์ถูกสลับเป็นการ์ดที่ ≤700px (useIsMobile) — เห็นได้เฉพาะตอน
  //      เรนเดอร์จริงตามความกว้างจอ · พังแล้วหน้าจอ "ยังมีข้อมูลครบ" แค่ล้นออกนอกจอ
  //   2. ค่าเฉลี่ยเวลาเข้างาน/กราฟ คิดจาก days[] ของคนที่เลือก — เลือกคนแล้วยังเห็นของทุกคน
  //      คือความพังที่ตัวเลขยังดูสมเหตุสมผลทุกช่อง
  for (const vp of [{ w: 390, h: 900, name: 'มือถือ' }, { w: 1024, h: 1200, name: 'iPad' }]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&tab=attreport`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      if (!(await navigateTo(page, 'owner', 'attreport'))) { status = 'NAV_FAIL'; note = 'สลับ tab ไม่สำเร็จ'; }
      else {
        await page.waitForTimeout(600);
        // เลือกพนักงาน 1 คนจาก dropdown → ต้องสลับจาก "สรุปรายคน" เป็น "สรุปการเข้างานรายวัน"
        await page.locator('main select').first().selectOption({ label: 'สมชาย ใจดี' });
        await page.waitForTimeout(500);
        // ⚠️ ต้องตัด <select> ออกก่อนอ่านข้อความ — innerText ของ select รวมชื่อทุก option
        //    (= ชื่อพนักงานทุกคน) ถ้าไม่ตัด การเช็ค "ไม่เหลือข้อมูลคนอื่น" จะแดงตลอดกาล
        //    ทั้งที่ตัวกรองทำงานถูก (เจอจริงตอนเขียนเทสต์นี้)
        const body = await page.evaluate(() => {
          const m = document.querySelector('main');
          if (!m) return '';
          const c = m.cloneNode(true);
          c.querySelectorAll('select').forEach(el => el.remove());
          return c.innerText;
        });
        const missing = ['สรุปการเข้างานรายวัน', 'สมชาย ใจดี', 'เวลาเข้างานเฉลี่ย', 'สรุปภาพรวมประจำเดือน']
          .filter(t => body.indexOf(t) < 0);
        // เลือกคนแล้วต้องไม่เหลือของอีกคน (ตารางรายคนหายไปแล้ว)
        const leaked = body.indexOf('สมหญิง ขยัน') >= 0;
        // จอต้องไม่ล้นแนวนอน — ตารางกว้าง ๆ ต้องเลื่อนในกล่องตัวเอง ไม่ใช่ดันทั้งหน้า
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        if (missing.length)   { status = 'DAILY_MISSING'; note = 'ขาด: ' + missing.join(', '); }
        else if (leaked)      { status = 'FILTER_LEAK';   note = 'เลือกคนเดียวแต่ยังเห็นข้อมูลของคนอื่น'; }
        else if (overflow)    { status = 'H_OVERFLOW';    note = `หน้าล้นแนวนอนบนจอ ${vp.w}px`; }
        else note = `เลือกคน → รายวัน + ไม่ล้นจอ (${vp.name} ${vp.w}px)`;
      }
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `attreport__${vp.w}.png`), fullPage: true }).catch(() => {});
    results.push({ role: 'interact', tab: `รายงานการเข้างาน (${vp.name})`, status, note });
    await page.close();
  }

  // ── ปุ่มเปลี่ยนภาษา 🌐: กดแล้วต้องสลับ EN จริง + re-render ทั้งต้นไม้ ────────────
  // ⚠️ ต้องรันบนเบราว์เซอร์จริง — กลไกคือ App เรียก useLang() → เปลี่ยนภาษาแล้ว re-render
  //    ทั้งต้นไม้ให้ทุก t() อ่านค่าใหม่ · unit test เห็นแค่ t()/setLang() ไม่เห็นการ re-render จริง
  //    เช็ค 2 อย่าง: (1) ปุ่มภาษาเปลี่ยน ไทย→EN (switcher re-render)
  //    (2) title ปุ่ม Sync เปลี่ยนเป็น "Sync" (พิสูจน์ว่า re-render ลามไป component พี่น้องด้วย)
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=frontstore&tab=stock`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      await page.waitForTimeout(400);
      // ก่อนกด: ปุ่มภาษาโชว์ "ไทย" + ปุ่ม Sync title เป็นไทย
      const beforeLang = await page.locator('.nav-right button[aria-haspopup="menu"]').innerText();
      const openBtn = page.locator('.nav-right button[aria-haspopup="menu"]');
      await openBtn.click({ timeout: 2000 });
      await page.waitForTimeout(200);
      // เมนูภาษาต้องโผล่ (createPortal ไป body) พร้อม 3 ตัวเลือก
      const optCount = await page.locator('[role="menuitemradio"]').count();
      // กด English
      await page.locator('[role="menuitemradio"]', { hasText: 'English' }).click({ timeout: 2000 });
      await page.waitForTimeout(300);
      const afterLang = await page.locator('.nav-right button[aria-haspopup="menu"]').innerText();
      // title ของปุ่ม Sync (t("Sync ใหม่") → "Sync")
      const syncTitle = await page.locator('.nav-right button.ghost[title]').first().getAttribute('title');
      const anyEnTitle = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.nav-right button[title]')).map(b => b.getAttribute('title')).join('|'));
      // (3) หน้าลงเวลา (views-attendance.jsx) ต้องแปลด้วย — ไปแท็บลงเวลาแล้วเช็คคำ EN
      //     "My time" (t("เวลาของฉัน")) + ปุ่มเมนู "Time clock" (tabText ของแท็บ attendance)
      await navigateTo(page, 'frontstore', 'attendance').catch(() => {});
      await page.waitForTimeout(500);
      const attBody = await page.locator('body').innerText();
      const attEN = /My time|Today/.test(attBody);   // Seg แปลแล้ว
      if (optCount < 3)                         { status = 'NO_MENU';    note = `เมนูภาษามี ${optCount} ตัวเลือก (คาด 3)`; }
      else if (!/ไทย/.test(beforeLang))         { status = 'NO_INIT_TH'; note = `เริ่มต้นไม่ใช่ไทย: "${beforeLang}"`; }
      else if (!/EN/.test(afterLang))           { status = 'NO_SWITCH';  note = `กด English แล้วปุ่มยังเป็น "${afterLang}"`; }
      else if (!/Sync/.test(anyEnTitle))        { status = 'NO_RERENDER';note = `re-render ไม่ลามไป Sync (titles: ${anyEnTitle})`; }
      else if (!attEN)                          { status = 'ATT_NO_I18N';note = 'หน้าลงเวลาไม่แปลเป็น EN (Seg ยังเป็นไทย)'; }
      else note = `ไทย→EN + re-render ทั้งต้นไม้ + หน้าลงเวลาแปล (Sync="${syncTitle}")`;
    } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 140); }
    await page.screenshot({ path: path.join(SHOTS, `lang-switch.png`) }).catch(() => {});
    results.push({ role: 'interact', tab: 'เปลี่ยนภาษา 🌐 (EN)', status, note });
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
