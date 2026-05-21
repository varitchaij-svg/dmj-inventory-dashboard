const CACHE_NAME = "dmj-v1";

// ไฟล์ static ที่ cache ได้เลย
const STATIC_ASSETS = [
  "/",
  "/Doomuenjing Dashboard.html",
  "/ui.jsx",
  "/views.jsx",
  "/app.jsx",
  "/config.js",
  "/manifest.json",
  "/logo.png",
];

// Install — cache static assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — ลบ cache เก่า
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Google Fonts / CDN libs → network first, fallback cache
// - Google Sheet data       → network only (ต้องการ live data เสมอ)
// - static assets           → cache first, fallback network
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Google Sheet / API calls — ไม่ cache
  if (
    url.hostname.includes("script.google.com") ||
    url.hostname.includes("sheets.googleapis.com") ||
    url.pathname.includes("data.json") ||
    url.pathname.includes("data-bundle.js")
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // CDN (fonts, react, recharts) — network first
  if (
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("unpkg.com") ||
    url.hostname.includes("cdnjs.cloudflare.com")
  ) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Static assets — cache first
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
