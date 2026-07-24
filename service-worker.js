const CACHE_NAME = "dmj-v7";

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

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
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
          if (res.ok) cacheP.then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => cacheP.then((c) => c.match(e.request)))  // offline fallback
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
