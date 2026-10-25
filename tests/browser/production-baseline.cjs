// Explicit, read-only login baseline. Never persists raw URLs/headers/tokens or a HAR.
// Run manually; not part of CI. Does not log in or write business data.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./.cache/node_modules/playwright-core');
const base = 'https://dmj-inventory-dashboard.pages.dev/';
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.DMJ_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    headless: true, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  });
  const rows = [];
  try {
    for (let round = 1; round <= 3; round++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
      let network = new Map();
      cdp.on('Network.requestWillBeSent', e => {
        const u = new URL(e.request.url);
        const group = u.pathname.includes('babel.min.js') ? 'babel' : /\.jsx$/.test(u.pathname) ? 'jsx'
          : u.hostname.includes('google.com') && u.pathname.includes('/macros/') ? 'api-meta'
          : u.hostname.includes('fonts.') ? 'font' : u.hostname === 'dmj-inventory-dashboard.pages.dev' ? 'site' : 'vendor';
        network.set(e.requestId, { group, start: e.timestamp });
      });
      cdp.on('Network.responseReceived', e => {
        const r = network.get(e.requestId);
        if (r) { r.status = e.response.status; r.ttfb = e.response.timing?.receiveHeadersEnd; r.sw = e.response.fromServiceWorker; }
      });
      cdp.on('Network.loadingFinished', e => {
        const r = network.get(e.requestId);
        if (r) { r.duration = (e.timestamp - r.start) * 1000; r.bytes = e.encodedDataLength; }
      });
      await page.addInitScript(() => {
        const originalFetch = window.fetch;
        window.fetch = function (input, options = {}) {
          const u = new URL(typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url), location.href);
          const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
          // Only the public login metadata read is permitted on GAS.
          if (method !== 'GET' || (u.hostname.includes('google') && u.searchParams.get('action') !== 'lineLoginMeta')) {
            return Promise.reject(new Error('Read-only baseline blocked a non-metadata API request'));
          }
          return originalFetch.call(this, input, options);
        };
        window.__loginPerf = { long: [], lcp: null };
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.__loginPerf.long.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
        new PerformanceObserver(list => {
          const e = list.getEntries().at(-1);
          window.__loginPerf.lcp = { time: e.startTime, tag: e.element?.tagName, text: e.element?.textContent?.slice(0, 80) };
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      for (const cache of ['cold', 'warm']) {
        network = new Map();
        try {
          if (cache === 'cold') await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
          else await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.getByText('เข้าสู่ระบบเพื่อใช้งาน', { exact: true }).waitFor({ timeout: 45000 });
          const ready = await page.evaluate(() => performance.now());
          await page.waitForFunction(() => Array.from(document.images).every(image => image.complete));
          await page.waitForLoadState('networkidle', { timeout: 20000 });
          await page.waitForTimeout(350);
          const metrics = await page.evaluate(ready => ({ ready, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
            lcp: window.__loginPerf.lcp, blocking: window.__loginPerf.long.filter(t => t.start < ready).reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
            marks: window.dmjTrace ? window.dmjTrace() : [],
          }), ready);
          const resources = [...network.values()].map(({ start, ...r }) => r);
          rows.push({ round, cache, ...metrics, resources });
          console.log('PRODUCTION', round, cache, JSON.stringify({ ...metrics, resourceCount: resources.length }));
        } catch (e) {
          // Failure can contain a request URL: redact completely before logging.
          const error = e.message.replace(/https?:\/\/[^\s"<>]+/g, '[url-redacted]');
          rows.push({ round, cache, error }); console.log('PRODUCTION_LIMITATION', error);
          fs.writeFileSync(path.join(__dirname, '.cache/production-baseline.json'), JSON.stringify(rows, null, 2));
          return;
        }
      }
      await context.close();
    }
    fs.writeFileSync(path.join(__dirname, '.cache/production-baseline.json'), JSON.stringify(rows, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message.replace(/https?:\/\/[^\s"<>]+/g, '[url-redacted]')); process.exitCode = 1; });
