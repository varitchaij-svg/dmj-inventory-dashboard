const CACHE_NAME = "dmj-v5";

// ไฟล์ที่ cache เพื่อ offline (รูปและ manifest เท่านั้น)
const PRECACHE_ASSETS = [
  "/manifest.json",
  "/logo.png",
];

// Install — pre-cache รูปและ manifest เท่านั้น
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate — ลบ cache เก่าทุก version
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
//  ② .jsx / .js / .html          → network first, fallback cache (ได้ code ใหม่ทันที reload เดียว)
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
    return; // browser handles natively
  }

  // ② ไฟล์ app เราเอง (.jsx .js .html) — network first
  //    โหลดจากเน็ตก่อนเสมอ → ได้ version ล่าสุดทุกครั้ง, reload เดียวพอ
  //    ถ้า offline → fallback cache
  const isAppFile =
    url.hostname === self.location.hostname &&
    (url.pathname.endsWith(".jsx") ||
     url.pathname.endsWith(".js")  ||
     url.pathname.endsWith(".html")||
     url.pathname === "/");

  if (isAppFile) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
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
