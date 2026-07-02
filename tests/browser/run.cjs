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
const ROLE_TABS = {
  owner:      ["overview","categories","trends","stock","storage","stockcount","frontstore","transfers","orders","ordersummary","mtojobs","upload","connect","labels","auditlog","deadstock"],
  employee:   ["categories","trends","stock","storage","frontstore","transfers","orders","ordersummary","mtojobs","labels"],
  warehouse:  ["categories","storage","stockcount","orders","ordersummary","mtojobs","labels"],
  frontstore: ["categories","stock","frontstore","orders","mtojobs","labels"],
  saler:      ["categories","stock","orders","mtojobs","labels"],
};
// tab id → ป้ายข้อความ (จาก TABS ใน app.jsx) สำหรับคลิก nav
const TAB_LABEL = {
  overview:"ภาพรวม", categories:"สินค้า & สั่ง", trends:"เทรนด์", stock:"สต๊อก & แจ้งเตือน",
  storage:"ตำแหน่งคลัง", stockcount:"นับ stock คลัง", frontstore:"เช็คหน้าร้าน",
  transfers:"โอน/ปรับ/ยกมา", orders:"รายการสั่งของ", ordersummary:"สรุปสินค้าออกจากคลัง",
  mtojobs:"งานจัดพิเศษ", upload:"อัปโหลด Zort", connect:"Google Sheet", labels:"พิมพ์ Label",
  auditlog:"Audit Log", deadstock:"สินค้าจม",
};

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
  categories: async (page) => hasText(page, ['VAS001', 'FLW002', 'DEC003'], 'product SKU'),
  stock:      async (page) => hasText(page, ['FLW002'], 'low-stock SKU (FLW002 qty8<threshold)'),
  storage:    async (page) => hasText(page, ['A1/05', 'A2/03', 'DEC003'], 'lock/สินค้าในคลัง'),
  orders:     async (page) => hasText(page, ['VAS001', 'FLW002'], 'order SKU'),
  mtojobs:    async (page) => hasText(page, ['จัดช่อพิเศษ', 'จัดกระเช้า'], 'MTO job name'),
  frontstore: async (page) => hasText(page, ['VAS001', 'FLW002', 'DEC003'], 'product SKU'),
  // หมายเหตุ: ordersummary/labels เป็น smoke-only — เนื้อหาขึ้นกับ workflow state
  // (ordersummary โชว์เฉพาะ order สถานะ "สำเร็จ" พร้อมส่ง, labels โชว์คิวพิมพ์ที่ seed จาก view อื่น)
  // fixture แบบ static จึงไม่มีเนื้อหา deterministic ให้ assert — ตรวจแค่ "ไม่ crash"
};
async function hasText(page, tokens, label) {
  const body = await page.evaluate(() => document.body.innerText);
  const found = tokens.find(t => body.includes(t));
  return { ok: !!found, detail: found ? `พบ "${found}"` : `ไม่พบ ${label} (${tokens.join('/')})` };
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
        errors.push('CONSOLE: ' + t.slice(0, 200));
      });
      let status = 'ok', note = '';
      try {
        await page.goto(`${base}?role=${role}&tab=${tab}`, { timeout: 15000 });
        await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
        const bootErr = await page.evaluate(() => window.__BOOT_ERR || null);
        if (bootErr) { status = 'BOOT_FAIL'; note = bootErr.slice(0, 160); }
        else {
          // คลิก nav ไป tab เป้าหมาย แล้วยืนยันด้วย <main data-screen-label="<tabid>">
          // (Playwright locator click = ตรวจ visible/enabled จริง, เชื่อถือได้กว่า evaluate .click())
          const label = TAB_LABEL[tab];
          const onTab = () => page.locator(`main[data-screen-label="${tab}"]`).count().then(n => n > 0);
          const tryClick = async (lbl) => {
            const btn = page.locator('button', { hasText: lbl }).first();
            if (await btn.count()) { await btn.click({ timeout: 2000 }).catch(() => {}); }
          };
          if (!(await onTab())) {
            await tryClick(label);
            if (!(await onTab())) {                          // อาจอยู่ใน "เพิ่มเติม" sheet
              await tryClick('เพิ่มเติม');
              await page.waitForTimeout(200);
              await tryClick(label);
            }
          }
          const navigated = await onTab();
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
    { name: 'StockView "ควรสั่ง" → OrderModal เปิด+ปิด', tab: 'stock', label: 'สต๊อก & แจ้งเตือน',
      trigger: 'ควรสั่ง' },
  ];
  const MODAL = '[data-modal="order"]';
  for (const it of interactions) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    let status = 'ok', note = '';
    try {
      await page.goto(`${base}?role=owner&tab=${it.tab}`, { timeout: 15000 });
      await page.waitForFunction(() => window.__BOOTED === true || window.__BOOT_ERR, { timeout: 15000 });
      const onTab = () => page.locator(`main[data-screen-label="${it.tab}"]`).count().then(n => n > 0);
      if (!(await onTab())) {
        const nav = page.locator('button', { hasText: it.label }).first();
        if (await nav.count()) await nav.click({ timeout: 2000 }).catch(() => {});
      }
      await page.waitForTimeout(400);
      if (it.preStep) { // เช่น เลือกหมวดก่อน เพื่อให้การ์ดโชว์ปุ่มสั่ง
        const pre = page.locator('button', { hasText: it.preStep }).first();
        if (await pre.count()) { await pre.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(400); }
      }
      const trig = page.locator('button', { hasText: it.trigger }).first();
      if (!(await trig.count())) { status = 'NO_TRIGGER'; note = `ไม่พบปุ่ม "${it.trigger}"`; }
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
