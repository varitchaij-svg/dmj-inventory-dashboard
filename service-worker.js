// bump เลขทุกครั้งที่แก้ไฟล์ .jsx แล้วต้องให้มีผล "ทันทีในโหลดแรก"
// (.jsx ใช้ stale-while-revalidate — ไม่ bump = โหลดแรกหลัง deploy ยังได้โค้ดเก่า
//  ต้องเปิดซ้ำอีกรอบถึงจะได้ของใหม่ ซึ่งทำให้เข้าใจผิดว่า "แก้แล้วยังไม่หาย")
// ⚠️ ตอน revert ต้อง bump **เดินหน้า** เสมอ ห้ามย้อนเลขกลับ — .jsx เป็น stale-while-revalidate
// ถ้าย้อนกลับไปเลขเก่า เครื่องที่ cache โค้ดรุ่นที่มีปัญหาไว้แล้วจะยังเสิร์ฟของเดิมในโหลดแรก
// = revert แล้วผู้ใช้ยังเข้าไม่ได้อยู่ดี โดยไม่มีอะไรบอกว่าทำไม
//
// ⚠️ **แก้ CSS ใน "Doomuenjing Dashboard.html" ก็ต้อง bump ด้วย ไม่ใช่แค่ .jsx**
// HTML เป็น network-first ก็จริง แต่ยังมี "สำเนาสำรองตอนออฟไลน์" อยู่ใน cache ก้อนนี้ —
// พอเน็ตกระตุก/PWA บน iOS เปิดจากไอคอนหน้าโฮม จะตกไปใช้สำเนานั้น = ได้ **HTML เก่า
// คู่กับ .jsx ใหม่** → markup ใหม่ไม่มี CSS รองรับ **จอเรนเดอร์ครบแต่ไม่มีสไตล์เลย
// และไม่มี error ให้เห็น** (เจอจริง ส.ค. 2026: หน้าหลักบนมือถือการ์ดไม่มีกรอบ
// ทั้งที่บนคอมปกติ — ตอนเพิ่ม .home-* แล้วลืม bump)
// การ bump ทำให้ activate ลบ cache ก้อนเก่าทิ้งทั้งก้อน สำเนาสำรองที่ค้างจึงหายไปด้วย
const CACHE_NAME = "dmj-v66";

// ⚠️ CDN libs (React/ReactDOM/Babel 3MB/Recharts/…) เก็บ cache แยกก้อนนี้ **โดยเจตนา** —
// ไฟล์พวกนี้ผูกกับ "เวอร์ชันใน URL" (unpkg@18.3.1 …) ไม่มีวันเปลี่ยนเนื้อในโดยไม่เปลี่ยน URL
// เดิมเก็บรวมใน CACHE_NAME → ทุกครั้งที่ bump CACHE_NAME (lesson 15 บังคับ bump แม้แก้แค่ CSS)
// activate ลบทั้งก้อน → เปิดแอปครั้งถัดไปต้องโหลด Babel 3MB + React ใหม่ (เสียฟรีทุก deploy)
// ก้อนนี้ activate **ไม่แตะ** (เหมือน dmj-babel*) → โหลดครั้งเดียวจริง ๆ ต่อเวอร์ชัน lib
const VENDOR_CACHE = "dmj-vendor-v1";

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/logo-small.webp",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS)).then(() => self.skipWaiting())
  );
});

// ⚠️ "dmj-babel-*" (ตั้งใน BC ของ "Doomuenjing Dashboard.html") = cache แยกต่างหากที่เก็บ
// ผลลัพธ์ compile JSX ไว้ (คนละก้อนกับ CACHE_NAME ของไฟล์ตรงนี้) — ห้ามลบ ไม่งั้นทุกครั้งที่
// deploy (bump CACHE_NAME) เครื่องทุกเครื่องต้อง Babel.transform() ไฟล์ .jsx ทั้งหมด (~1.3MB)
// ใหม่หมดทุกรอบ ทั้งที่ตัวโค้ด .jsx เองอาจไม่ได้เปลี่ยนเลย (ETag เหมือนเดิม = compile ซ้ำเปล่าๆ)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      // An old controller can still be caching the current boot while this worker
      // activates. Retain one prior app cache so an immediate offline reload can
      // recover those exact versioned URLs; remove it on the following release.
      const previous = keys.filter((k) => k !== CACHE_NAME && /^dmj-v\d+$/.test(k))
        .sort((a, b) => Number(b.slice(5)) - Number(a.slice(5)))[0];
      // เก็บรุ่นปัจจุบัน + app cache ก่อนหน้า 1 รุ่น รวมกับ compiled/vendor cache ที่แยกเวอร์ชันไว้
      return Promise.all(keys.filter((k) =>
        k !== CACHE_NAME && k !== previous && k !== VENDOR_CACHE && !k.startsWith("dmj-babel")
      ).map((k) => caches.delete(k)))
    }).then(() => self.clients.claim())
  );
});

// Read-only lifecycle identity. No credentials, user data, or reload command.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "DMJ_BOOT_VERSION" && e.ports[0]) e.ports[0].postMessage({ version: CACHE_NAME });
});

function validBootAsset(path, type, text) {
    type = (type || '').split(';')[0].trim().toLowerCase();
    if (!text || /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<!doctype\s+html\b|<(?:html|head|body)\b)/i.test(text)) return false;
    if (/\/dist\/manifest\.json$/.test('/' + path.replace(/^\//, ''))) {
      if (type !== 'application/json') return false;
      try { var m = JSON.parse(text); return !!m && !Array.isArray(m) && typeof m === 'object' && typeof m.enabled === 'boolean'; } catch (_) { return false; }
    }
    return /^(?:application|text)\/(?:javascript|ecmascript|jsx)$/.test(type);
  }

async function validResponse(request, response) {
  if (!response || !response.ok) return false;
  try { return validBootAsset(new URL(request.url).pathname, response.headers.get('content-type'), await response.clone().text()); }
  catch (_) { return false; }
}

// Reject only poisoned app entries, including retained caches; never clear user storage.
async function cachedApp(request) {
  const names = await caches.keys();
  names.sort((a, b) => (b === CACHE_NAME) - (a === CACHE_NAME));
  for (const name of names) {
    if (!/^dmj-v\d+$/.test(name)) continue;
    const cache = await caches.open(name), hit = await cache.match(request);
    if (!hit) continue;
    if (await validResponse(request, hit)) return hit;
    await cache.delete(request);
  }
}

// Fetch strategy:
//
//  ① Google Sheet / API          → network only (live data เสมอ)
//  ② .jsx / .js / .html          → stale-while-revalidate
//                                   ครั้งแรก: รอ network / ครั้งถัดไป: cache ทันที + fetch ใน background
//                                   code อัปเดตมีผลในการโหลดครั้งถัดไป (ไม่ต้องรีโหลด 2 ครั้ง)
//  ③ CDN libs (React, Recharts)  → cache first, fallback network (ไฟล์ใหญ่ไม่เปลี่ยน)
//  ④ รูป / font / manifest       → cache first, fallback network

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // ① API / Sheet — ไม่ cache เลย, ไม่ intercept (ให้ browser จัดการเอง กัน iOS Safari bug)
  if (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("sheets.googleapis.com") ||
    url.pathname.includes("data.json") ||
    url.pathname.includes("data-bundle.js")
  ) {
    return;
  }

  // ②a HTML / หน้าเว็บหลัก (.html หรือ "/") — network-first
  //     HTML คือไฟล์ที่พก CSS ทั้งหมด — ถ้า stale จะ skew กับ JSX ใหม่ (ไอคอนพอง/แถบซ้ำ)
  //     จึงดึงสดเสมอเมื่อออนไลน์ · offline ค่อย fallback cache
  const isHtml =
    url.hostname === self.location.hostname &&
    (url.pathname.endsWith(".html") || url.pathname === "/");

  if (isHtml) {
    const cacheP = caches.open(CACHE_NAME);
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // เก็บ cache ด้วย URL ที่ "ไม่มี query" เสมอ — ไม่งั้นการกลับมาจาก LINE Login
          // ("/?code=…&state=…") จะสร้าง entry ใหม่ทุกครั้ง และ entry เดิมไม่มีวันถูก match
          if (res.ok) cacheP.then((c) => c.put(new Request(url.origin + url.pathname), res.clone()));
          return res;
        })
        .catch(() =>
          // offline/เน็ตกระตุก — ต้องคืน Response เสมอ ห้ามคืน undefined
          // (respondWith(undefined) = หน้าโหลดไม่ขึ้นเลย — เจอบ่อยบน iOS เน็ตมือถือ
          //  โดยเฉพาะจังหวะเด้งกลับจาก LINE ที่ URL มี ?code= ติดมา จึง match cache ไม่เจอ)
          cacheP
            .then((c) => c.match(e.request, { ignoreSearch: true }))
            .then((hit) => hit || caches.match("/", { ignoreSearch: true }))
            .then((hit) => hit || new Response(
              "<meta charset='utf-8'><p style='font:16px sans-serif;padding:24px'>ต่อเน็ตไม่ได้ กรุณาลองใหม่</p>",
              { status: 503, headers: { "Content-Type": "text/html;charset=utf-8" } }
            ))
        )
    );
    return;
  }

  // ②b ไฟล์ app อื่น (.jsx .js) — stale-while-revalidate
  const isAppFile =
    url.hostname === self.location.hostname &&
    (url.pathname.endsWith(".jsx") ||
     url.pathname.endsWith(".js") ||
     // dist/manifest.json — ให้ stale-while-revalidate เหมือน dist/*.js (สดใน background +
     // ใช้ได้ออฟไลน์) · ถ้าปล่อยตกไป cache-first ④ จะค้างเวอร์ชันเก่าตลอดหลัง rebuild/disable
     url.pathname.indexOf("/dist/manifest.json") >= 0);

  if (isAppFile) {
    // Validation and cache writes share the event lifetime. Invalid online responses
    // become 503 and are never executed; offline can use only validated exact URLs.
    const cached = cachedApp(e.request).catch(() => undefined);
    const networkFetch = (async () => {
      const res = await fetch(e.request);
      if (!await validResponse(e.request, res)) return new Response("", { status: 503 });
      await cached; // Finish selective deletion before replacing the same cache entry.
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(e.request, res.clone());
      } catch (_) {} // Cache availability/quota must not hide a valid network response.
      return res;
    })();
    e.waitUntil(Promise.all([networkFetch, cached]).catch(() => {}));
    e.respondWith(url.searchParams.has("dmj-boot")
      ? networkFetch.catch(() => cached.then(hit => hit || new Response("", { status: 503 })))
      : cached.then(hit => hit || networkFetch).catch(() => new Response("", { status: 503 })));
    return;
  }

  // ③ CDN libs — cache first, เก็บใน VENDOR_CACHE (ไม่ถูกลบตอน bump CACHE_NAME)
  //    ไฟล์ผูกเวอร์ชันใน URL อยู่แล้ว → cache-first ปลอดภัย และไม่ต้องโหลดซ้ำข้าม deploy
  if (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("cdnjs.cloudflare.com")
  ) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(VENDOR_CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ④ อื่นๆ (รูป, font, manifest) — cache first
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
