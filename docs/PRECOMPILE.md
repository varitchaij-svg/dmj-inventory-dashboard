# Precompile JSX — เปิดใช้ให้เว็บโหลดเร็วขึ้น (ส.ค. 2026)

## ปัญหาที่แก้
สถาปัตยกรรมเดิม compile ไฟล์ `.jsx` รวม **~1.8MB ในเบราว์เซอร์** ด้วย Babel standalone
ทุกครั้งที่ ETag เปลี่ยน (= ทุก deploy ที่แตะ `.jsx`) บน CPU มือถือ = คอขวดที่มองไม่เห็น
ยิ่ง deploy ถี่ (ช่วง Phase 7.x) ยิ่งเจอบ่อย → "รู้สึกช้าลงกว่าเมื่อก่อน"

## ทำอะไรไป (โค้ดพร้อมแล้ว — ปลอดภัย มี fallback)
- `scripts/build-jsx.mjs` + `npm run build` → precompile `.jsx` → `dist/*.js` + `dist/manifest.json`
  (ใช้ `@babel/core` + `@babel/preset-react` — ยืนยันแล้วว่า output **byte-identical** กับ
  `@babel/standalone@7.29.0` ที่เบราว์เซอร์เคยใช้ → ไม่มีความเสี่ยงพฤติกรรมเปลี่ยน)
- `Doomuenjing Dashboard.html` boot loader: ถ้ามี `dist/manifest.json` (`enabled:true`) →
  โหลด `dist/*.js` ตรง ๆ **ไม่ compile ในเบราว์เซอร์เลย** · ไม่มี/ไฟล์หาย → **fallback**
  ไป compile `.jsx` เองเหมือนเดิมทุกประการ (ต่อไฟล์) → deploy แล้วยังไม่ตั้ง build = ไม่มีอะไรเปลี่ยน
- `service-worker.js`: CDN libs (React/Babel 3MB/Recharts) ย้ายไป `VENDOR_CACHE` ที่ **ไม่ถูกลบ
  ตอน bump `CACHE_NAME`** → เลิกโหลด lib ซ้ำทุก deploy · `dist/manifest.json` = stale-while-revalidate

## ⚠️ ต้องทำเอง 1 ครั้ง — เปิด build ที่ Cloudflare Pages (ไม่ทำก็ได้ แต่จะไม่ได้ผลเร่งความเร็ว)
Cloudflare Pages → โปรเจกต์ → **Settings → Builds & deployments**:
- **Build command**: `npm run build`
- **Build output directory**: `/` (root — เพราะเว็บทั้งหมด รวม `dist/` ที่เพิ่ง build เสิร์ฟจาก root)
- **Node version**: 18+ (ตั้งผ่าน env `NODE_VERSION=18` ถ้าจำเป็น)

เหตุผลที่ให้ Cloudflare build เอง (ไม่ commit `dist/` เข้า repo): ผลลัพธ์ถูก generate จาก
source ของ **commit เดียวกัน** ตอน deploy → `dist/*.js` ตรงกับ `.jsx` เสมอ ไม่มี race
(commit generated files มีจังหวะที่ `.jsx` ใหม่ถูก deploy ก่อน `dist` ใหม่ = รันโค้ดเก่าชั่วขณะ)

`dist/` อยู่ใน `.gitignore` แล้ว — **ห้าม commit** เข้า repo

## ตรวจว่าเปิดสำเร็จ
เปิดเว็บ → DevTools Console/Network: เห็นโหลด `dist/*.js` (ไม่เห็น `compile:*.jsx`) ·
BootTrace (แท็บ "เชื่อมต่อ") ควรเห็น mark `dist:*` แทน `compile:*`/`compiled:*`

## ปิดกลับ (rollback)
ลบ build command ที่ Cloudflare → `dist/` หายจาก deploy → เบราว์เซอร์ fallback ไป compile
`.jsx` เองอัตโนมัติ (ไม่ต้องแก้โค้ด)
