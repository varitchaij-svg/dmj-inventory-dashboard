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

function findHeadlessShell() {
  const base = '/opt/pw-browsers';
  const dir = fs.readdirSync(base).find(d => d.startsWith('chromium_headless_shell'));
  if (!dir) throw new Error('ไม่พบ chromium_headless_shell ใน ' + base);
  return path.join(base, dir, 'chrome-linux', 'headless_shell');
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
  const browser = await chromium.launch({ executablePath: findHeadlessShell(), headless: true });
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
        }
      } catch (e) { status = 'EXCEPTION'; note = String(e.message || e).slice(0, 160); }
      await page.screenshot({ path: path.join(SHOTS, `${role}__${tab}.png`) }).catch(()=>{});
      results.push({ role, tab, status, note });
      await page.close();
    }
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
