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

## เมื่อแก้ ROLE_TABS ใน app.jsx

อัปเดต `ROLE_TABS` + `TAB_LABEL` ใน `run.cjs` ให้ตรงด้วย (มี comment กำกับไว้)

## ไฟล์ที่ commit vs generated

commit: `fixture.js`, `harness.html`, `run.cjs`, `setup.sh`, `README.md`, `.gitignore`
generated (gitignored): `vendor/`, `.cache/`, `screenshots/`
