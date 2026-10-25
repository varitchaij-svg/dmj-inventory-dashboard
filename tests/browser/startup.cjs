// Exercises the actual HTML bootstrap; harness.html bypasses this loader.
// All auth/data endpoints and third-party resources are served locally. No live writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
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
  assert.equal(entry.srcHash, createHash('sha1').update(fs.readFileSync(path.join(ROOT, src))).digest('hex').slice(0, 12));
  assert.equal(entry.out, src.replace(/\.jsx$/, '.' + entry.srcHash + '.js'));
  assert.equal(entry.bytes, fs.statSync(path.join(ROOT, 'dist', entry.out)).size);
  assert.deepEqual(fs.readFileSync(path.join(ROOT, 'dist', entry.out)), fs.readFileSync(path.join(ROOT, 'dist', src.replace(/\.jsx$/, '.js'))));
}
let mode = 'dist', htmlRevision = 'after', assetRevision = 'after';
const bootVersion = current.match(/_dmjBootVersion = '([^']+)'/)[1];
let requests = [], actions = [], networkOffline = false;
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
  const etag = '"' + raw.length + '-' + mode + '-' + htmlRevision + '-' + assetRevision + '"';
  if (status === 200 && res.req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }); res.end(); return;
  }
  const gzip = zlib.gzipSync(raw);
  res.writeHead(status, { 'Content-Type': type, 'Content-Encoding': 'gzip', ETag: etag, 'Cache-Control': 'no-cache' });
  res.end(gzip);
}
const server = http.createServer(async (req, res) => {
  if (networkOffline) { req.socket.destroy(); return; }
  const u = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(u.pathname);
  requests.push(p); // Paths only: never record query strings, tokens, or POST bodies.
  if (p === '/' || p === '/index.html' || p === '/Doomuenjing Dashboard.html') {
    let html = htmlRevision === 'before' ? before : current;
    for (const [url, file] of Object.entries(aliases)) html = html.split(url).join('/vendor/' + file);
    html = html.replace(/https:\/\/fonts.googleapis.com\/css2\?[^"<]+/g, '/font.css');
    reply(res, html, 'text/html'); return;
  }
  if (p === '/sw-test.html') { reply(res, '<!doctype html><title>SW fixture</title>', 'text/html'); return; }
  if (u.searchParams.has('probe')) {
    const kind = u.searchParams.get('probe');
    if (kind === 'html-as-js') reply(res, '<!doctype html><html>SPA</html>', 'application/javascript');
    else if (kind === 'fragment-as-js') reply(res, '<main>SPA fragment</main>', 'application/javascript');
    else if (kind === 'mixed-html') reply(res, 'window.probe = true;', 'Text/HTML');
    else if (kind === 'bad-json') reply(res, '{"enabled":', 'application/json');
    else if (p.endsWith('.json')) reply(res, '{"enabled":false}', 'Application/JSON');
    else reply(res, 'window.probe = true;', p.endsWith('.jsx') ? 'Text/JSX' : 'Application/JavaScript');
    return;
  }
  if (p === '/dist/manifest.json' && ['stale-manifest', 'wrong-output', 'wrong-output-hash', 'wrong-output-source', 'wrong-hash', 'wrong-build'].includes(mode)) {
    const manifest = JSON.parse(JSON.stringify(builtManifest));
    if (mode === 'stale-manifest') manifest.release = 'dmj-v65';
    if (mode === 'wrong-output') manifest.files['app.jsx'].out = 'app.js';
    if (mode === 'wrong-output-hash') manifest.files['app.jsx'].out = 'app.000000000000.js';
    if (mode === 'wrong-output-source') manifest.files['app.jsx'].out = 'ui.' + manifest.files['app.jsx'].srcHash + '.js';
    if (mode === 'wrong-hash') manifest.files['app.jsx'].srcHash = '000000000000';
    if (mode === 'wrong-build') manifest.buildId = '0000000000000000';
    reply(res, JSON.stringify(manifest), 'application/json'); return;
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
  if (p === '/service-worker.js' && assetRevision === 'before') { reply(res, beforeSw); return; }
  if (p.startsWith('/vendor/')) {
    if (p.endsWith('/babel.js') && mode === 'babel-error') { reply(res, '', 'application/javascript', 503); return; }
    if (p.endsWith('/babel.js') && mode === 'babel-hang') { return; }
    const file = path.join(__dirname, p.slice(1));
    if (fs.existsSync(file)) reply(res, fs.readFileSync(file));
    else reply(res, ''); // Scanner/QR unused by login; equal stub for both benchmark arms.
    return;
  }
  if (p === '/dist/manifest.json' && mode === 'no-dist') { reply(res, '', 'text/plain', 404); return; }
  if (p === '/dist/manifest.json' && mode === 'disabled-build') { reply(res, '{"enabled":false}', 'application/json'); return; }
  if (p === '/dist/manifest.json' && !['dist', 'missing-dist', 'bad-dist', 'source-mismatch', 'stale-manifest', 'wrong-output', 'wrong-output-hash', 'wrong-output-source', 'wrong-hash', 'wrong-build'].includes(mode)) {
    if (mode === 'manifest-hang') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); return;
    }
    reply(res, mode === 'bad-manifest' ? '{"enabled":true,"files":{}}' : '<!doctype html><html>missing</html>', mode === 'bad-manifest' ? 'application/json' : 'text/html'); return;
  }
  if (p.startsWith('/dist/views-') && ['missing-dist', 'source-mismatch'].includes(mode)) {
    reply(res, '<!doctype html><html>SPA fallback</html>', 'text/html'); return;
  }
  if (/^\/dist\/app[.]/.test(p) && mode === 'bad-dist') { reply(res, 'this is not valid javascript!'); return; }
  if (p === '/views-analytics.jsx' && ['source-mismatch', 'fallback-source-mismatch'].includes(mode)) { reply(res, '// Different release\n' + fs.readFileSync(path.join(ROOT, p), 'utf8'), 'text/jsx'); return; }
  if (p === '/app.jsx' && assetRevision === 'before') { reply(res, beforeApp); return; }
  if (p === '/dist/app.js' && assetRevision === 'before') { reply(res, beforeAppJs); return; }
  if (p.startsWith('/dist/') && assetRevision === 'before' && p.endsWith('.js')) {
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
    mode = testMode; htmlRevision = assetRevision = 'after';
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
      mode = 'dist'; htmlRevision = 'before'; assetRevision = 'after';
      const context = await browser.newContext({ ...opts, serviceWorkers: 'block' });
      const page = await context.newPage();
      const bundles = [];
      page.on('response', response => {
        if (/\/dist\/[^/]+\.js$/.test(new URL(response.url()).pathname)) bundles.push(response.body().then(body => ({ path: new URL(response.url()).pathname, body })));
      });
      try {
        await page.goto(base); await login(page);
        const served = await Promise.all(bundles);
        assert.equal(served.length, 7);
        for (const src of Object.keys(builtManifest.files)) {
          const alias = '/dist/' + src.replace(/\.jsx$/, '.js');
          const actual = served.find(r => r.path === alias);
          assert.ok(actual, 'Legacy HTML must request ' + alias);
          assert.deepEqual(actual.body, fs.readFileSync(path.join(ROOT, 'dist', builtManifest.files[src].out)), 'Must receive actual HEAD bundle, not baseline compilation');
        }
      }
      finally { await context.close(); }
    });
    for (const m of ['fallback', 'no-dist', 'disabled-build', 'manifest-hang', 'missing-dist']) {
      await check(m + ': fallback mounts once, one Babel load', async () => {
        const { context, page } = await open(m, () => localStorage.setItem('dmj_use_dist', '1'));
        try { await login(page); assert.equal(requests.filter(p => p === '/vendor/babel.js').length, 1); }
        finally { await context.close(); }
      });
    }
    for (const m of ['babel-error', 'babel-hang', 'source-error', 'bad-dist', 'source-mismatch', 'fallback-source-mismatch', 'bad-manifest', 'stale-manifest', 'wrong-output', 'wrong-output-hash', 'wrong-output-source', 'wrong-hash', 'wrong-build']) {
      await check(m + ': visible recovery, bounded boot failure', async () => {
        const { context, page } = await open(m);
        try {
          await page.locator('#dmj-boot-recover').waitFor({ state: 'visible', timeout: 30000 });
          assert.equal(await page.evaluate(() => window.__dmjBootRecoverReason), 'boot-error');
          assert.ok(requests.filter(p => p === '/vendor/babel.js').length <= 1);
          if (['bad-manifest', 'stale-manifest', 'wrong-output', 'wrong-output-hash', 'wrong-output-source', 'wrong-hash', 'wrong-build'].includes(m)) {
            assert.equal(requests.filter(p => p.endsWith('.jsx') || /\/dist\/.*\.js$/.test(p) || p === '/vendor/babel.js').length, 0, 'Mismatch must stop before any app code/fallback');
          }
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
    await check('SW: invalid network bodies/MIME and poisoned entries never reach app/cache', async () => {
      mode = 'dist'; htmlRevision = assetRevision = 'after';
      const context = await browser.newContext(opts), page = await context.newPage();
      try {
        await page.goto(base + '/sw-test.html');
        await page.evaluate(async version => { await navigator.serviceWorker.register('/service-worker.js?dmj-boot=' + version); await navigator.serviceWorker.ready; }, bootVersion);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        const evidence = await page.evaluate(async version => {
          const cache = await caches.open(version);
          await cache.put('/unrelated-draft', new Response('preserve'));
          const results = [];
          for (const file of ['/probe.js', '/probe.jsx', '/dist/manifest.json']) {
            for (const tagged of [false, true]) {
              for (const kind of ['html-as-js', 'fragment-as-js', 'mixed-html', ...(file.endsWith('.json') ? ['bad-json'] : [])]) {
                const url = file + '?probe=' + kind + (tagged ? '&dmj-boot=' + version : '');
                const response = await fetch(url);
                const body = await response.text();
                const stored = [];
                for (const name of await caches.keys()) if (await (await caches.open(name)).match(url)) stored.push(name);
                results.push({ file, tagged, kind, status: response.status, body, stored });
              }
            }
          }
          // Existing poison in current and retained app caches must be deleted selectively.
          for (const name of [version, 'dmj-v61']) {
            const old = await caches.open(name);
            for (const tagged of [false, true]) for (const file of ['/probe.js', '/probe.jsx', '/dist/manifest.json']) {
              const url = file + '?probe=valid&case=' + name + (tagged ? '&dmj-boot=' + version : '');
              await old.put(url, new Response('<html>old poison</html>', { headers: { 'Content-Type': 'application/javascript' } }));
              const response = await fetch(url); const body = await response.text();
              results.push({ old: name, tagged, status: response.status, body });
            }
          }
          return { results, preserved: await (await cache.match('/unrelated-draft')).text() };
        }, bootVersion);
        for (const result of evidence.results) {
          if (!result.old) { assert.equal(result.status, 503); assert.equal(result.body, ''); assert.deepEqual(result.stored, []); }
          else { assert.equal(result.status, 200); assert.ok(['window.probe = true;', '{"enabled":false}'].includes(result.body)); }
        }
        assert.equal(evidence.preserved, 'preserve');
        // waitUntil must complete real writes; inspect stored bytes rather than request counts.
        assert.equal(await page.evaluate(async version => {
          const c = await caches.open(version), keys = await c.keys();
          const probes = keys.filter(k => new URL(k.url).searchParams.get('probe') === 'valid');
          return probes.length === 12 && (await Promise.all(probes.map(async k => ['window.probe = true;', '{"enabled":false}'].includes(await (await c.match(k)).text())))).every(Boolean);
        }, bootVersion), true);
        networkOffline = true;
        await context.setOffline(true);
        for (const file of ['/probe.js', '/probe.jsx', '/dist/manifest.json']) for (const tagged of [false, true]) {
          const url = file + '?probe=offline-poison' + (tagged ? '&dmj-boot=' + bootVersion : '');
          await page.evaluate(async ({ version, url }) => { const c = await caches.open(version); await c.put(url, new Response('<html>poison</html>', { headers: { 'Content-Type': 'Application/JavaScript' } })); }, { version: bootVersion, url });
          assert.deepEqual(await page.evaluate(async url => { const r = await fetch(url); return { status: r.status, body: await r.text(), cached: !!await caches.match(url) }; }, url), { status: 503, body: '', cached: false });
        }
      } finally { networkOffline = false; await context.close(); }
    });
    const lifecycle = [];
    // Fixed count, all outcomes retained. No retry-until-pass or timeout changes.
    for (const round of [1, 2, 3]) await check('PWA lifecycle round ' + round + ': v61 upgrade, two drafts, actual version, offline', async () => {
      mode = 'dist'; htmlRevision = assetRevision = 'before';
      const context = await browser.newContext(opts), page = await context.newPage();
      const trace = { round, events: [] }; lifecycle.push(trace);
      const workers = [];
      context.on('serviceworker', worker => workers.push(worker));
      context.on('serviceworker', worker => worker.evaluate(() => ({ version: CACHE_NAME, script: location.pathname + location.search }))
        .then(info => trace.events.push({ event: 'worker-body', ...info })).catch(() => {}));
      await context.exposeBinding('__swTrace', (_, event) => trace.events.push(event));
      await context.addInitScript(() => {
        const sw = navigator.serviceWorker;
        const describe = w => w && ({ script: new URL(w.scriptURL).pathname + new URL(w.scriptURL).search, state: w.state });
        const record = (event, r) => window.__swTrace({ event, time: Date.now(), controller: describe(sw.controller), active: describe(r?.active), waiting: describe(r?.waiting), installing: describe(r?.installing) });
        const register = sw.register.bind(sw);
        sw.register = (...args) => {
          record('register:' + args[0]);
          const promise = register(...args).then(r => {
            record('registered', r);
            r.addEventListener('updatefound', () => { record('updatefound', r); r.installing?.addEventListener('statechange', () => record('statechange', r)); });
            return r;
          });
          window.__pageRegistration = promise; // Observe the page's job; do not enqueue update().
          return promise;
        };
        sw.addEventListener('controllerchange', () => { window.__controllerChanges = (window.__controllerChanges || 0) + 1; record('controllerchange'); });
      });
      let second;
      try {
        await page.goto(base); await login(page);
        await page.waitForFunction(() => !!navigator.serviceWorker.controller);
        // Keep a second old page open, with an actual unsaved input and persistent draft.
        second = await context.newPage(); await second.goto(base); await login(second);
        await second.evaluate(() => { const input = document.createElement('input'); input.id = 'unsaved-draft'; document.body.append(input); localStorage.setItem('test-draft', 'draft-preserved'); });
        await second.locator('#unsaved-draft').fill('ยังไม่บันทึก');
        for (const tab of [page, second]) {
          await tab.evaluate(async () => { window.__baselineRegistration = await window.__pageRegistration; });
          await tab.waitForFunction(() => { const r = window.__baselineRegistration; return r?.active?.state === 'activated' && !r.installing && !r.waiting; });
        }
        trace.events.push({ event: 'baseline-ready-before-release-change' });
        const oldDocument = await second.evaluate(() => { window.__documentMarker = 'same-document'; return window.__controllerChanges || 0; });
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          const old = await caches.open('dmj-v61');
          for (const src of ['i18n', 'ui', 'views-main', 'views-analytics', 'views-quote', 'views-attendance', 'app']) await old.put('/dist/' + src + '.js', new Response('throw new Error("old cache poison")'));
        });
        htmlRevision = assetRevision = 'after';
        await page.reload(); await login(page);
        await page.waitForFunction(() => !!window.__pageRegistration);
        await page.evaluate(() => window.__pageRegistration);
        // register() may resolve to the existing registration during an update check.
        // Observe the actual takeover first; v61 cannot answer identity messages.
        await second.waitForFunction(n => (window.__controllerChanges || 0) > n, oldDocument);
        // Ask BOTH actual controlling and active worker bodies, not just scriptURL.
        for (const tab of [page, second]) await tab.evaluate(expected => new Promise((resolve, reject) => {
          const sw = navigator.serviceWorker;
          const timer = setTimeout(() => reject(new Error('Active/controller release did not converge')), 30000);
          const version = worker => new Promise(done => {
            const channel = new MessageChannel(), timeout = setTimeout(() => { channel.port1.close(); done(null); }, 1000);
            channel.port1.onmessage = e => { clearTimeout(timeout); channel.port1.close(); done(e.data?.version); };
            worker.postMessage({ type: 'DMJ_BOOT_VERSION' }, [channel.port2]);
          });
          const inspect = async () => {
            const r = await sw.getRegistration(), controller = sw.controller, active = r?.active;
            // v61 has no identity-message handler. Do not start unsupported message
            // events on it while the replacement is still installing/waiting.
            if (r.installing || r.waiting || !active || active.state !== 'activated' || !controller) return;
            const actual = await Promise.all([version(active), version(controller)]);
            if (sw.controller === controller && r.active === active && actual.every(v => v === expected)) {
              window.__verifiedWorkerVersions = actual;
              clearTimeout(timer); resolve(actual);
            }
          };
          sw.addEventListener('controllerchange', inspect);
          sw.getRegistration().then(r => {
            const watch = () => { for (const w of [r.installing, r.waiting, r.active]) w?.addEventListener('statechange', inspect); inspect(); };
            r.addEventListener('updatefound', watch); watch();
          });
        }), bootVersion);
        trace.confirmedTabs = await Promise.all([page, second].map(tab => tab.evaluate(() => window.__verifiedWorkerVersions)));
        assert.deepEqual(trace.confirmedTabs, [[bootVersion, bootVersion], [bootVersion, bootVersion]]);
        assert.equal(await second.locator('#unsaved-draft').inputValue(), 'ยังไม่บันทึก');
        assert.deepEqual(await second.evaluate(() => [window.__documentMarker, localStorage.getItem('test-draft'), (window.__controllerChanges || 0) > 0]), ['same-document', 'draft-preserved', true]);
        assert.ok(await second.evaluate(n => (window.__controllerChanges || 0) > n, oldDocument));
        assert.ok(await page.evaluate(async () => (await caches.keys()).includes('dmj-v61')));
        networkOffline = true;
        await context.setOffline(true);
        await page.reload(); await login(page);
        assert.equal(await page.evaluate(() => window._USE_DIST), true);
        trace.offlineVersions = await page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return Promise.all([registration.active, navigator.serviceWorker.controller].map(worker => new Promise((resolve, reject) => {
            const c = new MessageChannel(), timer = setTimeout(() => reject(new Error('Offline worker identity unavailable')), 1000);
            c.port1.onmessage = e => { clearTimeout(timer); c.port1.close(); resolve(e.data.version); };
            worker.postMessage({ type: 'DMJ_BOOT_VERSION' }, [c.port2]);
          })));
        });
        assert.deepEqual(trace.offlineVersions, [bootVersion, bootVersion]);
        assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).updateViaCache), 'none');
        assert.equal(await second.locator('#unsaved-draft').inputValue(), 'ยังไม่บันทึก');
        trace.pass = true;
      } catch (e) { trace.pass = false; throw e; }
      finally {
        trace.workers = await Promise.all(workers.map(worker => worker.evaluate(() => ({ version: CACHE_NAME, script: location.pathname + location.search })).catch(e => ({ error: e.message }))));
        trace.final = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); const script = w => w && new URL(w.scriptURL).pathname + new URL(w.scriptURL).search; return { controller: script(navigator.serviceWorker.controller), active: script(r?.active), activeState: r?.active?.state, actualVersions: window.__verifiedWorkerVersions, updateViaCache: r?.updateViaCache, waiting: script(r?.waiting), caches: await caches.keys() }; }).catch(() => null);
        networkOffline = false;
        fs.writeFileSync(process.env.DMJ_LIFECYCLE_LOG || path.join(__dirname, '.cache/startup-lifecycle.json'), JSON.stringify(lifecycle, null, 2));
        await context.close();
      }
    });
    const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
    assert.ok(Number(bootVersion.slice(5)) >= 66, 'Never roll release back to PR #122 v64 or reviewed v65');
    assert.equal(current.match(/_dmjBootVersion = '([^']+)'/)[1], sw.match(/CACHE_NAME = "([^"]+)"/)[1]);
    fs.writeFileSync(path.join(__dirname, '.cache/startup-results.json'), JSON.stringify(results, null, 2));
    console.log('SUMMARY', results.filter(r => r.pass).length + '/' + results.length, 'in', Date.now() - started, 'ms');
    if (results.some(r => !r.pass)) process.exitCode = 1;
    if (process.argv.includes('--measure') && !process.exitCode) {
      const measurements = [];
      for (const variant of ['before-fallback', 'before-dist', 'after-dist']) {
        for (let round = 1; round <= 3; round++) {
          htmlRevision = assetRevision = variant.startsWith('before') ? 'before' : 'after';
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
