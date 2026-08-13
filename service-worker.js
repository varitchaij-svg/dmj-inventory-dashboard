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
const CACHE_NAME = "dmj-v28";

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/logo.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// ⚠️ "dmj-babel-*" (ตั้งใน BC ของ "Doomuenjing Dashboard.html") = cache แยกต่างหากที่เก็บ
// ผลลัพธ์ compile JSX ไว้ (คนละก้อนกับ CACHE_NAME ของไฟล์ตรงนี้) — ห้ามลบ ไม่งั้นทุกครั้งที่
// deploy (bump CACHE_NAME) เครื่องทุกเครื่องต้อง Babel.transform() ไฟล์ .jsx ทั้งหมด (~1.3MB)
// ใหม่หมดทุกรอบ ทั้งที่ตัวโค้ด .jsx เองอาจไม่ได้เปลี่ยนเลย (ETag เหมือนเดิม = compile ซ้ำเปล่าๆ)
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && !k.startsWith("dmj-babel")).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

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
     url.pathname.endsWith(".js"));

  if (isAppFile) {
    // stale-while-revalidate — iOS-safe: e.waitUntil + e.respondWith ต้องเรียก synchronously
    const cacheP = caches.open(CACHE_NAME);
    const networkFetch = fetch(e.request).then((res) => {
      if (res.ok) cacheP.then((c) => c.put(e.request, res.clone()));
      return res;
    });
    e.waitUntil(networkFetch.catch(() => {})); // keep SW alive, ไม่ให้ error propagate
    e.respondWith(
      cacheP
        .then((cache) => cache.match(e.request))
        .then((cached) => cached || networkFetch)
        .catch(() => caches.match(e.request))  // offline fallback
    );
    return;
  }

  // ③ CDN libs — cache first (ไฟล์ใหญ่ version เดิม ไม่ต้องโหลดซ้ำ)
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
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
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
