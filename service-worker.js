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
const CACHE_NAME = "dmj-v60";

// ⚠️ CDN libs (React/ReactDOM/Babel 3MB/Recharts/…) เก็บ cache แยกก้อนนี้ **โดยเจตนา** —
// ไฟล์พวกนี้ผูกกับ "เวอร์ชันใน URL" (unpkg@18.3.1 …) ไม่มีวันเปลี่ยนเนื้อในโดยไม่เปลี่ยน URL
// เดิมเก็บรวมใน CACHE_NAME → ทุกครั้งที่ bump CACHE_NAME (lesson 15 บังคับ bump แม้แก้แค่ CSS)
// activate ลบทั้งก้อน → เปิดแอปครั้งถัดไปต้องโหลด Babel 3MB + React ใหม่ (เสียฟรีทุก deploy)
// ก้อนนี้ activate **ไม่แตะ** (เหมือน dmj-babel*) → โหลดครั้งเดียวจริง ๆ ต่อเวอร์ชัน lib
const VENDOR_CACHE = "dmj-vendor-v1";

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
      // เก็บไว้: CACHE_NAME ปัจจุบัน · dmj-babel* (ผล compile) · VENDOR_CACHE (lib ภายนอก)
      // ที่เหลือลบทิ้ง — สามก้อนนี้ผูกกับ "เวอร์ชัน/ETag" ในตัวเองแล้ว bust เองเมื่อจำเป็น
      Promise.all(keys.filter((k) =>
        k !== CACHE_NAME && k !== VENDOR_CACHE && !k.startsWith("dmj-babel")
      ).map((k) => caches.delete(k)))
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

  // ①b คำขอที่ **ไม่ใช่ GET** — ไม่ intercept เด็ดขาด
  //     Cache API เก็บ POST/PUT ไม่ได้ (`cache.put` reject) · ของเดิมรอดมาได้เพราะทุก POST
  //     วิ่งไป script.google.com ซึ่งถูกกันไว้ที่ ① อยู่แล้ว · พอมี POST ไปโฮสต์อื่น
  //     (FCM token registration) จะตกมาถึง ④ cache-first แล้ว `cache.put` โยนทิ้งเงียบ ๆ
  if (e.request.method !== "GET") return;

  // ①c ปลายทางของ Push/OAuth — ห้าม cache คำตอบเด็ดขาด (เป็น token/credential)
  //     แยกจาก ③ vendor allowlist โดยตั้งใจ: ③ คือไฟล์ไลบรารีที่ผูกเวอร์ชันใน URL
  //     ส่วนกลุ่มนี้เป็น API ที่คำตอบเปลี่ยนทุกครั้งและอ่อนไหว
  if (
    url.hostname === "fcmregistrations.googleapis.com" ||
    url.hostname === "fcm.googleapis.com" ||
    url.hostname === "firebaseinstallations.googleapis.com" ||
    url.hostname === "oauth2.googleapis.com"
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

// ══════════════════════════════════════════════════════════════════════════
// 🔔 PWA Push (Phase 1) — รับข้อความจาก FCM แล้วแสดงผล
// ──────────────────────────────────────────────────────────────────────────
// ⚠️ **ทางแสดงผลมีทางเดียวคือตรงนี้** — backend ส่ง FCM แบบ *data-only*
//    (ไม่มีคีย์ `notification` ใน payload) จึงไม่มีใครแสดงให้เองนอกจากบรรทัดนี้
//    ถ้าวันไหนมีคนใส่ block `notification` กลับเข้าไปใน payload จะได้ **2 อัน**
//    (ตัวที่ browser แสดงเอง + ตัวนี้) โดยไม่มี error ให้เห็น
//
// ⚠️ **แนวทางนี้ยังไม่ผ่านการพิสูจน์บนอุปกรณ์จริง (UNPROVEN)** — เราจงใจไม่ import
//    Firebase Messaging SDK เข้ามาใน service worker ตัวนี้ แล้วอ่าน `push` event ดิบแทน
//    เหตุผล: SDK ใน SW จะติดตั้ง push handler ของตัวเองอีกตัว = มีสองทางแสดงผล
//    (foreground onMessage / background onBackgroundMessage) ซึ่งขัดกับข้อกำหนดข้างบน
//    ส่วนวิธีนี้ SW เป็นทางเดียวทุกสถานะของแอป · **ต้องพิสูจน์ทั้ง foreground/background
//    บน iPhone/iPad/Android จริงก่อนรับรอง** ถ้าไม่ผ่าน ให้ถอยไปใช้ official SDK
//    integration (importScripts + onBackgroundMessage) โดย **ยังคง data-only** และ
//    ยุบให้เหลือจุดเรียก showNotification จุดเดียวเหมือนเดิม
//
// ⚠️ ห้ามใช้ silent push เป็นตัว sync — ทุก push ที่มาถึงต้องแสดงผลที่มองเห็นได้
//    (เบราว์เซอร์ลงโทษ origin ที่รับ push แล้วไม่แสดงอะไร ด้วยการตัดสิทธิ์ push)

const PUSH_FALLBACK_TITLE = "DMJ";

function dmjPushPayload(event) {
  // FCM data-only ส่งมาเป็น {data:{...}} · เผื่อ provider/รูปแบบอื่นด้วย
  try {
    const raw = event.data ? event.data.json() : null;
    if (raw && typeof raw === "object") return raw.data && typeof raw.data === "object" ? raw.data : raw;
  } catch (err) { /* ไม่ใช่ JSON */ }
  try {
    const t = event.data ? event.data.text() : "";
    if (t) return { title: PUSH_FALLBACK_TITLE, body: String(t).slice(0, 200) };
  } catch (err) {}
  return {};
}

self.addEventListener("push", (e) => {
  const d = dmjPushPayload(e);
  const title = String(d.title || PUSH_FALLBACK_TITLE).slice(0, 120);
  const opts = {
    body: String(d.body || "").slice(0, 300),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // tag = ลดการซ้อนบนจอเมื่อ provider ส่งซ้ำ (at-least-once)
    // ⚠️ ไม่ใช่ตัวกัน duplicate ฝั่ง backend — เป็นแค่การรวมภาพให้ผู้ใช้
    tag: String(d.tag || d.kind || "dmj"),
    renotify: true,
    data: { url: String(d.url || "/"), kind: String(d.kind || ""), ts: String(d.ts || "") },
  };
  // ⚠️ ต้อง showNotification เสมอ แม้ payload ว่าง — ห้ามเงียบ (ดูหมายเหตุ silent push)
  e.waitUntil(self.registration.showNotification(title, opts));
});

// เปิด/โฟกัสแอป — **ไม่รัน business mutation ใด ๆ** (แตะแจ้งเตือน ≠ รับของ/ปิดงาน)
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // ⚠️ same-origin allowlist — ปลายทางมาจาก payload ฝั่ง server ก็จริง แต่ห้ามเปิด
  //    URL ข้าม origin จากข้อมูลที่เดินทางผ่าน provider ภายนอก
  let target = "/";
  try {
    const raw = (e.notification.data && e.notification.data.url) || "/";
    const u = new URL(raw, self.location.origin);
    if (u.origin === self.location.origin) target = u.pathname + u.search + u.hash;
  } catch (err) { target = "/"; }

  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try {
        const cu = new URL(c.url);
        if (cu.origin === self.location.origin && "focus" in c) {
          // มีหน้าต่างแอปเปิดอยู่แล้ว → โฟกัสตัวเดิม ไม่เปิดใหม่ซ้อน
          await c.focus();
          if ("navigate" in c && target !== "/") { try { await c.navigate(target); } catch (err) {} }
          return;
        }
      } catch (err) {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
