// Exercises the actual HTML bootstrap; harness.html bypasses this loader.
// All auth/data endpoints and third-party resources are served locally. No live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..');
const { chromium } = require('./.cache/node_modules/playwright-core');
const current = fs.readFileSync(path.join(ROOT, 'Doomuenjing Dashboard.html'), 'utf8');
// Fixed inspected production/master baseline: reproducible after this PR is merged.
const baseRef = process.env.DMJ_BASE_REF || '82ded3efb388f4a4ea12596bc35e0d325da5ff14';
const baseFile = file => execFileSync('git', ['show', baseRef + ':' + file], { cwd: ROOT, encoding: 'utf8' });
const before = baseFile('Doomuenjing Dashboard.html');
const beforeSw = baseFile('service-worker.js');
const beforeApp = baseFile('app.jsx');
const beforeAppJs = require('@babel/core').transformSync(beforeApp, {
  presets: [require('@babel/preset-react')], sourceType: 'script', filename: 'app.jsx', babelrc: false, configFile: false, compact: false,
}).code;
const fixture = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'fixture.js'), 'utf8'), fixture);
const payload = fixture.window.__DMJ_FIXTURE;
const builtManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/manifest.json')));
for (const [src, entry] of Object.entries(builtManifest.files)) {
  assert.ok(entry.out.includes(entry.srcHash), 'Build filename must identify its source version');
  assert.deepEqual(fs.readFileSync(path.join(ROOT, 'dist', entry.out)), fs.readFileSync(path.join(ROOT, 'dist', src.replace(/\.jsx$/, '.js'))));
}
let mode = 'dist', revision = 'after';
let requests = [], actions = [];
const aliases = {
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js': 'react.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js': 'react-dom.js',
  'https://unpkg.com/prop-types@15.8.1/prop-types.min.js': 'prop-types.js',
  'https://unpkg.com/recharts@2.12.7/umd/Recharts.js': 'recharts.js',
  'https://unpkg.com/@babel/standalone@7.29.0/babel.min.js': 'babel.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js': 'scanner.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js': 'qrcode.js',
};
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.jsx': 'text/jsx', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.css': 'text/css' };
function reply(res, body, type = 'application/javascript', status = 200) {
  const raw = Buffer.from(body);
  const etag = '"' + raw.length + '-' + mode + '-' + revision + '"';
  if (status === 200 && res.req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); res.end(); return;
  }
  const gzip = zlib.gzipSync(raw);
  res.writeHead(status, { 'Content-Type': type, 'Content-Encoding': 'gzip', ETag: etag, 'Cache-Control': 'no-cache' });
  res.end(gzip);
}
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(u.pathname);
  requests.push(p); // Paths only: never record query strings, tokens, or POST bodies.
  if (p === '/' || p === '/index.html' || p === '/Doomuenjing Dashboard.html') {
    let html = revision === 'before' ? before : current;
    for (const [url, file] of Object.entries(aliases)) html = html.split(url).join('/vendor/' + file);
    html = html.replace(/https:\/\/fonts.googleapis.com\/css2\?[^"<]+/g, '/font.css');
    reply(res, html, 'text/html'); return;
  }
  if (p === '/config.js') {
    reply(res, "const APP_TOKEN='mock'; const _SHEET_BASE=location.origin+'/api'; const _SHEET_URL=_SHEET_BASE; const GOOGLE_SHEET_URL=_SHEET_URL; const SHEET_DEPLOY_URL=_SHEET_URL;"); return;
  }
  if (p === '/api') {
    let body = ''; for await (const chunk of req) body += chunk;
    const post = body ? JSON.parse(body) : {};
    const action = post.action || u.searchParams.get('action') || 'data';
    actions.push(action);
    const staff = { staffId: 'TEST', name: 'ทดสอบ', role: 'owner', status: 'active' };
    const data = action === 'lineLoginMeta' ? { channelId: 'test-channel' }
      : action === 'verifyPin' ? { ok: u.searchParams.get('pin') === 'test-pin' }
      : action === 'authLine' ? { ok: true, sessionToken: 'mock-session-only', staff }
      : action === 'me' ? { ok: true, staff }
      : action === 'ver' ? { ok: true, ts: payload.lastModified || 1 } : payload;
    reply(res, JSON.stringify(data), 'application/json'); return;
  }
  if (p === '/font.css') { reply(res, '', 'text/css'); return; }
  if (p === '/service-worker.js' && revision === 'before') { reply(res, beforeSw); return; }
  if (p.startsWith('/vendor/')) {
    if (p.endsWith('/babel.js') && mode === 'babel-error') { reply(res, '', 'application/javascript', 503); return; }
    if (p.endsWith('/babel.js') && mode === 'babel-hang') { return; }
    const file = path.join(__dirname, p.slice(1));
    if (fs.existsSync(file)) reply(res, fs.readFileSync(file));
    else reply(res, ''); // Scanner/QR unused by login; equal stub for both benchmark arms.
    return;
  }
  if (p === '/dist/manifest.json' && !['dist', 'missing-dist', 'bad-dist', 'source-mismatch'].includes(mode)) {
    if (mode === 'manifest-hang') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return;
    }
    reply(res, mode === 'bad-manifest' ? '{"enabled":true,"files":{}}' : '<!doctype html><html>missing</html>', mode === 'bad-manifest' ? 'application/json' : 'text/html'); return;
  }
  if (p.startsWith('/dist/views-') && ['missing-dist', 'source-mismatch'].includes(mode)) {
    reply(res, '<!doctype html><html>SPA fallback</html>', 'text/html'); return;
  }
  if (/^\/dist\/app[.]/.test(p) && mode === 'bad-dist') { reply(res, 'this is not valid javascript!'); return; }
  if (p === '/views-analytics.jsx' && mode === 'source-mismatch') { reply(res, '// Different release\n' + fs.readFileSync(path.join(ROOT, p), 'utf8'), 'text/jsx'); return; }
  if (p === '/app.jsx' && revision === 'before') { reply(res, beforeApp); return; }
  if (p === '/dist/app.js' && revision === 'before') { reply(res, beforeAppJs); return; }
  if (p.startsWith('/dist/') && revision === 'before' && p.endsWith('.js')) {
    const src = path.basename(p, '.js') + '.jsx';
    if (builtManifest.files[src]) { reply(res, fs.readFileSync(path.join(ROOT, 'dist', builtManifest.files[src].out))); return; }
  }
  if (p === '/views-main.jsx' && mode === 'source-error') { reply(res, '', 'text/jsx', 503); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { reply(res, '', 'text/plain', 404); return; }
  reply(res, fs.readFileSync(file), mime[path.extname(file)] || 'application/octet-stream');
});

async function main() {
  const started = Date.now();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const exe = process.env.DMJ_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const results = [];
  const opts = {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  };
  async function check(name, run) {
    if (process.env.DMJ_STARTUP_FILTER && !name.includes(process.env.DMJ_STARTUP_FILTER)) return;
    requests = []; actions = [];
    try { await run(); results.push({ name, pass: true }); console.log('PASS', name); }
    catch (e) {
      const error = e.message.replace(/https?:\/\/[^\s"<>]+/g, url => url.split('?')[0] + '[query-redacted]');
      results.push({ name, pass: false, error }); console.log('FAIL', name, error);
    }
  }
  async function open(testMode = 'dist', init) {
    mode = testMode; revision = 'after';
    const context = await browser.newContext({ ...opts, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.addInitScript(() => { window._dmjBootAssetTimeout = 1000; });
    if (init) await page.addInitScript(init);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    return { context, page };
  }
  async function login(page) { await page.getByText('เข้าสู่ระบบเพื่อใช้งาน', { exact: true }).waitFor({ timeout: 30000 }); }
  try {
    await check('precompile: login, dependency order, no Babel/JSX/double fetch', async () => {
      const { context, page } = await open('dist', () => localStorage.setItem('dmj_use_dist', '0'));
      try {
        await login(page);
        assert.equal(await page.evaluate(() => window._USE_DIST), true);
        assert.equal(requests.filter(p => p.endsWith('.jsx')).length, 0);
        assert.equal(requests.filter(p => p === '/vendor/babel.js').length, 0);
        for (const entry of Object.values(builtManifest.files)) assert.equal(requests.filter(p => p === '/dist/' + entry.out).length, 1);
        await page.locator('a[href*="access.line.me"]').first().waitFor();
        await page.screenshot({ path: path.join(__dirname, 'screenshots/startup-login-mobile.png') });
      } finally { await context.close(); }
    });
    await check('cached legacy HTML can still load the new build', async () => {
      mode = 'dist'; revision = 'before';
      const context = await browser.newContext({ ...opts, serviceWorkers: 'block' });
      const page = await context.newPage();
      try { await page.goto(base); await login(page); }
      finally { await context.close(); }
    });
    for (const m of ['fallback', 'bad-manifest', 'manifest-hang', 'missing-dist']) {
      await check(m + ': fallback mounts once, one Babel load', async () => {
        const { context, page } = await open(m, () => localStorage.setItem('dmj_use_dist', '1'));
        try { await login(page); assert.equal(requests.filter(p => p === '/vendor/babel.js').length, 1); }
        finally { await context.close(); }
      });
    }
    for (const m of ['babel-error', 'babel-hang', 'source-error', 'bad-dist', 'source-mismatch']) {
      await check(m + ': visible recovery, bounded boot failure', async () => {
        const { context, page } = await open(m);
        try {
          await page.locator('#dmj-boot-recover').waitFor({ state: 'visible', timeout: 30000 });
          assert.equal(await page.evaluate(() => window.__dmjBootRecoverReason), 'boot-error');
          assert.ok(requests.filter(p => p === '/vendor/babel.js').length <= 1);
        } finally { await context.close(); }
      });
    }
    await check('warm fallback: compiled cache mounts without loading Babel', async () => {
      const { context, page } = await open('fallback');
      try {
        await login(page); requests = [];
        await page.reload(); await login(page);
        assert.equal(requests.filter(p => p === '/vendor/babel.js').length, 0);
        assert.equal((await page.evaluate(() => window.dmjTrace())).filter(m => m[0].startsWith('cachehit:')).length, 7);
      } finally { await context.close(); }
    });
    await check('legacy PIN login: invalid denied, valid enters app', async () => {
      const { context, page } = await open('dist');
      try {
        await login(page);
        await page.getByRole('button', { name: 'เข้าด้วยรหัสสำรอง', exact: true }).click();
        await page.getByRole('button', { name: /เจ้าของ/ }).click();
        await page.locator('input[type="password"]').fill('wrong-pin');
        await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
        await page.getByText('รหัสไม่ถูกต้อง', { exact: true }).waitFor();
        await page.locator('input[type="password"]').fill('test-pin');
        await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
        await page.locator('button.brand').waitFor();
      } finally { await context.close(); }
    });
    await check('LINE callback: success reaches app; mismatched state rejected', async () => {
      mode = 'dist';
      for (const match of [true, false]) {
        const context = await browser.newContext({ ...opts, serviceWorkers: 'block' });
        const page = await context.newPage();
        await page.addInitScript(() => {
          sessionStorage.setItem('dmj_line_state', 'test-state');
          sessionStorage.setItem('dmj_line_redirect', location.origin + '/');
        });
        const start = actions.length;
        await page.goto(base + '/?code=test-code&state=' + (match ? 'test-state' : 'wrong-state'));
        if (match) { await page.locator('button.brand').waitFor({ timeout: 30000 }); assert.ok(actions.slice(start).includes('authLine')); }
        else { await login(page); assert.equal(actions.slice(start).includes('authLine'), false); }
        await context.close();
      }
    });
    await check('PWA: versioned boot ignores old poisoned cache; warm offline login', async () => {
      mode = 'dist'; revision = 'before';
      const context = await browser.newContext(opts);
      const page = await context.newPage();
      try {
        await page.goto(base); await login(page);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          const old = await caches.open('dmj-v61');
          for (const src of ['i18n', 'ui', 'views-main', 'views-analytics', 'views-quote', 'views-attendance', 'app']) {
            await old.put('/dist/' + src + '.js', new Response('throw new Error("old cache poison")'));
          }
        });
        revision = 'after';
        await page.reload(); await login(page);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; await registration.update(); });
        await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.includes('dmj-boot=dmj-v65'));
        assert.ok(await page.evaluate(async () => (await caches.keys()).includes('dmj-v61')));
        await context.setOffline(true);
        await page.reload(); await login(page);
        assert.equal(await page.evaluate(() => window._USE_DIST), true);
      } finally { await context.close(); }
    });
    const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    assert.equal(current.match(/_dmjBootVersion = '([^']+)'/)[1], sw.match(/CACHE_NAME = "([^"]+)"/)[1]);
    fs.writeFileSync(path.join(__dirname, '.cache/startup-results.json'), JSON.stringify(results, null, 2));
    console.log('SUMMARY', results.filter(r => r.pass).length + '/' + results.length, 'in', Date.now() - started, 'ms');
    if (results.some(r => !r.pass)) process.exitCode = 1;
    if (process.argv.includes('--measure') && !process.exitCode) {
      const measurements = [];
      for (const variant of ['before-fallback', 'before-dist', 'after-dist']) {
        for (let round = 1; round <= 3; round++) {
          revision = variant.startsWith('before') ? 'before' : 'after';
          mode = variant.endsWith('fallback') ? 'fallback' : 'dist';
          const context = await browser.newContext({ ...opts, serviceWorkers: 'block' });
          const page = await context.newPage();
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
          await cdp.send('Network.enable');
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
          await page.addInitScript(() => {
            window.__bootMetrics = { long: [], lcp: null };
            new PerformanceObserver(list => { for (const e of list.getEntries()) window.__bootMetrics.long.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask', buffered: true });
            new PerformanceObserver(list => {
              const e = list.getEntries().at(-1);
              window.__bootMetrics.lcp = { time: e.startTime, tag: e.element?.tagName, text: e.element?.textContent?.slice(0, 80) };
            }).observe({ type: 'largest-contentful-paint', buffered: true });
          });
          for (const cache of ['cold', 'warm']) {
            requests = [];
            if (cache === 'cold') await page.goto(base); else await page.reload();
            await login(page);
            const ready = await page.evaluate(() => performance.now());
            // Let logo/body downloads finish before snapshotting bytes or starting a warm run.
            await page.waitForFunction(() => Array.from(document.images).every(image => image.complete));
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(350);
            const data = await page.evaluate(ready => ({
              ready,
              fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
              lcp: window.__bootMetrics.lcp,
              blocking: window.__bootMetrics.long.filter(t => t.start < ready).reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0),
              bytes: performance.getEntriesByType('resource').reduce((sum, r) => sum + r.transferSize, 0),
              compileCount: window.dmjTrace().filter(m => m[0].startsWith('compile:')).length,
            }), ready);
            data.babelRequests = requests.filter(p => p === '/vendor/babel.js').length;
            measurements.push({ variant, round, cache, ...data });
            console.log('MEASURE', variant, round, cache, JSON.stringify(data));
            if (round === 1 && cache === 'cold') await page.screenshot({ path: path.join(__dirname, 'screenshots/measure-' + variant + '.png') });
          }
          await context.close();
        }
      }
      fs.writeFileSync(path.join(__dirname, '.cache/startup-measurements.json'), JSON.stringify(measurements, null, 2));
    }
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e.message); server.closeAllConnections(); server.close(); process.exitCode = 1; });
