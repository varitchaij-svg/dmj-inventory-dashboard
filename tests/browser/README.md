# Headless full-app smoke test

ทดสอบว่า **แอปจริงเรนเดอร์ได้ทุก role × ทุก tab โดยไม่ white-screen / ไม่ crash (ErrorBoundary) /
ไม่มี JS error** — โดยใช้ Chromium headless + ข้อมูล fixture ที่ mock backend ทั้งหมด
(ไม่ต่อ Google Apps Script / ZORT / LINE จริง, ไม่ใช้ secret ใดๆ)

เสริม unit test (Vitest) ที่ทดสอบ pure logic — ตัวนี้ทดสอบ **การ render จริงในเบราว์เซอร์**
เช่น กราฟ Recharts (lazy-load), การสลับ tab, การแสดงผลของแต่ละ view

## วิธีรัน

```bash
npm run test:browser
```

ครั้งแรกจะรัน `setup.sh` เพื่อดึง lib (React/ReactDOM/Recharts/Babel/prop-types) + `playwright-core`
ผ่าน npm มา self-host (เพราะ CDN มักถูกบล็อกใน CI/agent) ลงใน `vendor/` แล้วรัน smoke test

ผลลัพธ์: ตาราง ✅/❌ ต่อ (role, tab) + screenshot ทุกจอใน `screenshots/`
exit code ≠ 0 ถ้ามีจอไหนพัง

## ครอบคลุมอะไร

1. **Smoke** — ทุก role × tab: ไม่ white-screen / ไม่ crash (ErrorBoundary) / ไม่มี JS error
2. **Content assert** (เฉพาะ tab ที่ข้อมูล deterministic จาก fixture) — เช่น overview ต้องมี
   Recharts svg+marks, categories/stock/orders/frontstore ต้องมี SKU สินค้า, mtojobs ต้องมีชื่องาน,
   storage ต้องมีล็อค/สินค้า, transfers ต้องมีกราฟ
   (ordersummary/labels เป็น smoke-only เพราะเนื้อหาขึ้นกับ workflow state ไม่ deterministic)
3. **Interaction** — กด "ควรสั่ง" ใน StockView แล้ว OrderModal เปิด (`[data-modal="order"]`) + กด × ปิดได้

## CI

`.github/workflows/test.yml` มี 2 job: `unit` (vitest) + `browser` (harness นี้) รันทุก push/PR
job `browser` ติดตั้ง Chromium ผ่าน playwright-core CLI แล้ว upload screenshots เป็น artifact

## ทำงานยังไง

- `fixture.js` — ข้อมูลตัวอย่างรูปแบบเดียวกับที่ GAS `doGet` ส่งกลับ (products/orders/shipments/
  mtoJobs/transfers/storage/monthly sales ฯลฯ). เดือนคำนวณจากวันที่ปัจจุบัน กราฟจึงมีข้อมูลเสมอ
- `harness.html` — โหลด jsx จริงจาก repo (ui/views-main/views-analytics/app) ผ่าน Babel เหมือน
  production แต่ (1) libs จาก `vendor/` (2) stub `window.fetch` ตอบ fixture (3) seed role/tab จาก
  query param `?role=owner&tab=overview` เพื่อ bypass login
- `run.cjs` — วนทุก role × tab ที่ ROLE_TABS อนุญาต, คลิก nav (เปิดเมนู "เพิ่มเติม" ให้ถ้าจำเป็น),
  ยืนยันว่าสลับ tab จริงด้วย `<main data-screen-label="…">`, แล้วเช็ค: root ไม่ว่าง, ไม่มี
  "เกิดข้อผิดพลาด" (ErrorBoundary), ไม่มี JS error (ยกเว้น network 404 ของ asset ที่ไม่เกี่ยว)

## ข้อจำกัด (ทดสอบไม่ได้ — ต้องของจริง)

- ตัวเลข/พฤติกรรมกับ **ข้อมูล production จริง** (นี่ใช้ fixture)
- **ZORT sync / LINE bot / GAS write** จริง (mock ตอบ success หมด)
- touch/กล้องสแกนบนมือถือจริง

## ตรวจเส้นทางเปิดเว็บจริง (startup)

`harness.html` ข้าม HTML loader จึงใช้ผล smoke ข้างบนยืนยัน precompile/fallback ไม่ได้
หลัง `npm ci`, `bash tests/browser/setup.sh` และ `npm run build` ให้รัน:

```bash
npm run test:startup
node tests/browser/startup.cjs --measure
```

ชุด startup ใช้ HTML loader จริง, mobile viewport 390×844 และ mock API ทั้งหมด
ตรวจ precompile ไม่โหลด Babel/JSX ซ้ำ, fallback พร้อมกันโหลด Babel ครั้งเดียว, HTTP 200 ที่เป็น
HTML แทน JS, headers มาแต่ body ค้าง, Babel ล้มเหลว/ค้าง, source คนละรุ่น, PIN/LINE callback
และออฟไลน์หลังอัปเดตจาก Service Worker เก่า ไม่มีการรีโหลดแทนพนักงานหรือล้าง localStorage
`DMJ_CHROMIUM` ระบุ browser ในเครื่องได้; CI ใช้ Chromium ที่ Playwright ติดตั้ง
`npm run build` อัปเดต `_dmjBuildId`/`_dmjSourceHashes` ใน HTML ให้ตรงกับ source ทั้ง 7 ไฟล์
หากแก้ JSX ต้องรัน build และเก็บ HTML ที่อัปเดตไว้ด้วย แม้ deploy แบบ source fallback
manifest คนละ release/build หรือชื่อ output ไม่ตรง hash จะหยุดที่ recovery โดยไม่โหลด JSX ข้ามรุ่น
legacy aliases `dist/<name>.js` ยังเก็บไว้ให้ HTML เก่า และ fixture ตรวจ bytes กับ build ของ HEAD ทุกไฟล์

PWA รัน 3 รอบคงที่ในชุด startup: อัปเกรด v61, เปิดสองแท็บ, เก็บ draft ข้าม controller change,
ตรวจรุ่นจริงจากทั้ง active/controller ของสองแท็บผ่าน MessageChannel แล้วเปิดออฟไลน์ (fixture ปิด network ฝั่ง server ด้วย)
ใช้ URL ลงทะเบียน SW คงที่ `/service-worker.js` กับ `updateViaCache: "none"` และรอ registration ของหน้าเว็บ
ไม่เรียก `registration.update()` แข่งกัน ไม่เพิ่ม timeout และไม่ reload แทนผู้ใช้
ผล lifecycle ทุกครั้งอยู่ใน `.cache/startup-lifecycle.json`; ใช้ `DMJ_LIFECYCLE_LOG` เปลี่ยนปลายทางได้
รอ baseline registration ของทั้งสองแท็บเสร็จก่อนเปลี่ยน release ใน fixture
รุ่น HTML/SW เป็น v66 ต้องเก็บเลขเดินหน้าเมื่อต่อยอด/รวม PR #122 ซึ่งใช้ v64

การอ่าน baseline จาก git ต้องมี commit `82ded3e` (CI checkout แบบ full history)

โหมด `--measure` รัน cold/warm อย่างละ 3 รอบ: production source baseline ที่ไม่มี build,
baseline เมื่อเปิด build, และ loader ใหม่พร้อม build ใช้ CPU 4×, 150ms latency, download
200 KiB/s และ gzip + conditional ETag บน local mirror ฟอนต์ถูกแทนด้วย CSS ว่าง
QR/scanner ไม่ถูกเรียกใช้งาน; mirror จะใช้ `vendor/qrcode.js`/`vendor/scanner.js` ถ้ามี
หรือ stub ว่างถ้าไม่มี จึงต้องระบุว่าใช้แบบใดเมื่อนำผลมาเปรียบเทียบ
ผลใน `.cache/startup-*.json` เป็น lab result ไม่ใช่ PageSpeed หรือผล production หลัง deploy
warm หมายถึง HTTP/compiled cache ใน context เดิม; benchmark block SW เพื่อแยกการวัด
ออกจากการทดสอบ PWA อีกเคสหนึ่ง

`production-baseline.cjs` เป็นเครื่องมือ manual อ่านเฉพาะหน้า login โดยใช้ proxy/CA ของ
environment ไม่รันใน CI ไม่ล็อกอิน และปฏิเสธ fetch ที่ไม่ใช่ GET หรือไม่ใช่ login metadata
บน GAS ไม่เก็บ HAR, headers หรือ URL ที่มี query/token ถ้า TLS/browser ใช้ไม่ได้ต้องรายงาน
ข้อจำกัดแทนการปิดการตรวจ TLS

ชุดเหล่านี้เป็นเครื่องมือพัฒนา ไม่ถูก include ในหน้าเว็บหรือ output ของ build JSX

## เมื่อแก้ ROLE_TABS ใน app.jsx

อัปเดต `ROLE_TABS` + `TAB_LABEL` ใน `run.cjs` ให้ตรงด้วย (มี comment กำกับไว้)

## ไฟล์ที่ commit vs generated

commit: `fixture.js`, `harness.html`, `run.cjs`, `setup.sh`, `README.md`, `.gitignore`
generated (gitignored): `vendor/`, `.cache/`, `screenshots/`
