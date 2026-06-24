const CACHE_NAME = "dmj-v6";

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

  // ② ไฟล์ app เราเอง (.jsx .js .html) — stale-while-revalidate
  const isAppFile =
    url.hostname === self.location.hostname &&
    (url.pathname.endsWith(".jsx") ||
     url.pathname.endsWith(".js")  ||
     url.pathname.endsWith(".html")||
     url.pathname === "/");

  if (isAppFile) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(e.request);

      // fetch ใน background เสมอ — อัปเดต cache สำหรับการโหลดครั้งถัดไป
      const networkFetch = fetch(e.request).then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => null);

      if (cached) {
        e.waitUntil(networkFetch); // keep SW alive ให้ background fetch เสร็จ
        return cached;             // ตอบทันที — ไม่รอ network
      }
      // ครั้งแรก (ยังไม่มี cache) — รอ network ตามปกติ
      return networkFetch;
    })());
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
