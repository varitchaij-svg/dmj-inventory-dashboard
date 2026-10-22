// Evaluate the real loader/SW policy and fetch handler; no copied implementation.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('Doomuenjing Dashboard.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');
const loaderPolicy = vm.runInNewContext('(' + html.match(/window\._dmjValidBootAsset = (function validBootAsset[\s\S]*?\n  });/)[1] + ')');
const swPolicy = vm.runInNewContext('(' + sw.match(/(function validBootAsset[\s\S]*?\n  })\n/)[1] + ')');
const version = sw.match(/CACHE_NAME = "([^"]+)"/)[1];
const origin = 'https://fixture.invalid';
function harness(response, writeGate = Promise.resolve()) {
  const handlers = {}, stores = new Map();
  const key = request => typeof request === 'string' ? new URL(request, origin).href : request.url;
  const caches = {
    keys: async () => [...stores.keys()],
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async request => store.get(key(request))?.clone(),
        put: async (request, value) => { await writeGate; store.set(key(request), value.clone()); },
        delete: async request => store.delete(key(request)),
      };
    },
    match: async request => { for (const store of stores.values()) if (store.has(key(request))) return store.get(key(request)).clone(); },
  };
  vm.runInNewContext(sw, {
    self: { location: new URL(origin), addEventListener: (type, handler) => { handlers[type] = handler; } },
    caches, Response, Request, URL, fetch: async () => { if (response instanceof Error) throw response; return response.clone(); },
  });
  const dispatch = url => {
    const state = {};
    handlers.fetch({ request: new Request(new URL(url, origin)), respondWith: promise => { state.response = promise; }, waitUntil: promise => { state.lifetime = promise; } });
    return state;
  };
  return { caches, dispatch };
}
describe('startup asset policy parity', () => {
  it.each([
    ['/app.js', 'Application/JavaScript; charset=utf-8', 'window.ok=1;', true],
    ['/app.jsx', 'Text/JSX', 'const App = () => <div/>;', true],
    ['/app.js', 'application/javascript', '<!DOCTYPE html><html/>', false],
    ['/app.jsx', 'text/jsx', '\uFEFF <!-- fallback --> <HTML>wrong</HTML>', false],
    ['/app.js', 'Text/HTML', 'window.ok=1;', false],
    ['/app.js', 'application/json', '{}', false],
    ['/dist/manifest.json', 'Application/JSON', '{"enabled":false}', true],
    ['/dist/manifest.json', 'application/javascript', '{"enabled":true}', false],
    ['/dist/manifest.json', 'application/json', '{"enabled":', false],
    ['/dist/manifest.json', 'application/json', '[]', false],
    ['/dist/manifest.json', 'application/json', '<html>missing</html>', false],
  ])('%s rejects wrong MIME/body consistently (%s)', (path, type, body, expected) => {
    expect(loaderPolicy(path, type, body)).toBe(expected);
    expect(swPolicy(path, type, body)).toBe(expected);
  });
});
describe('real SW app strategy', () => {
  for (const url of ['/app.js', '/app.jsx', '/dist/manifest.json']) {
    for (const suffix of ['', '?dmj-boot=' + version]) {
      it('rejects HTML 200 delivered as JavaScript: ' + url + suffix, async () => {
        const { caches, dispatch } = harness(new Response('<html>SPA</html>', { headers: { 'Content-Type': 'application/javascript' } }));
        const state = dispatch(url + suffix), response = await state.response;
        await state.lifetime;
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('');
        expect(await caches.match(url + suffix)).toBeUndefined();
      });
    }
  }
  it('purges existing poison offline while preserving unrelated entries', async () => {
    const { caches, dispatch } = harness(new Error('offline'));
    const cache = await caches.open(version);
    await cache.put('/app.js', new Response('<html>poison</html>', { headers: { 'Content-Type': 'Text/HTML' } }));
    await cache.put('/draft', new Response('keep'));
    const state = dispatch('/app.js');
    expect((await state.response).status).toBe(503); await state.lifetime;
    expect(await cache.match('/app.js')).toBeUndefined();
    expect(await (await cache.match('/draft')).text()).toBe('keep');
  });
  it('waitUntil follows cache write completion, for legacy and tagged URLs', async () => {
    for (const url of ['/app.js', '/app.js?dmj-boot=' + version]) {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const { caches, dispatch } = harness(new Response('window.ok=1;', { headers: { 'Content-Type': 'Application/JavaScript' } }), gate);
      const state = dispatch(url); let completed = false;
      state.lifetime.then(() => { completed = true; });
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(completed).toBe(false);
      release(); await state.lifetime;
      expect((await state.response).status).toBe(200);
      expect(await (await caches.match(url)).text()).toBe('window.ok=1;');
    }
  });
  it('returns valid network bytes even when CacheStorage is unavailable', async () => {
    const h = harness(new Response('window.ok=1;', { headers: { 'Content-Type': 'application/javascript' } }));
    h.caches.open = async () => { throw new Error('cache unavailable'); };
    const state = h.dispatch('/app.js?dmj-boot=' + version);
    const response = await state.response; await state.lifetime;
    expect(response.status).toBe(200); expect(await response.text()).toBe('window.ok=1;');
  });
  it('leaves API and live data strategies untouched', () => {
    const { dispatch } = harness(new Error('must not fetch'));
    for (const url of ['https://script.google.com/macros/s/mock/exec', 'https://sheets.googleapis.com/mock', '/data.json', '/data-bundle.js']) expect(dispatch(url).response).toBeUndefined();
  });
});
