# vendor/ — ไลบรารีภายนอกที่ self-host

## ทำไมต้อง self-host ไม่ใช้ CDN

1. **`www.gstatic.com` ไม่อยู่ใน allowlist ของ service worker** (บล็อก ③ มีแค่ fonts.googleapis /
   fonts.gstatic / unpkg / cdnjs) → ถ้าโหลดจาก CDN จะตกไปเส้น ④ cache-first แล้วถูกล้างทุกครั้ง
   ที่ bump `CACHE_NAME`
2. **เน็ตร้านไม่นิ่ง** — รีโปนี้ self-host `html2canvas.min.js` / `jsbarcode.min.js` มาก่อนแล้ว
   ด้วยเหตุผลเดียวกัน
3. pin เวอร์ชันได้จริง — ไฟล์เปลี่ยนเมื่อเราตั้งใจเปลี่ยนเท่านั้น

## Firebase JS SDK (compat build) — pinned **12.18.0**

| | |
|---|---|
| แพ็กเกจ | `firebase@12.18.0` (npm — ช่องทางเผยแพร่ทางการของ Firebase) |
| tarball | `https://registry.npmjs.org/firebase/-/firebase-12.18.0.tgz` |
| `dist.integrity` | `sha512-XaL6tlE5Xd20ZDhckqOMIw+JJTET+wTdeZPxQ7ihc42oxRb7kWUyn/j1LO5V9dH1xq8Rv5R71Pv1fBCdIkt9Rw==` |
| ที่มาของไฟล์ | `package/firebase-app-compat.js` และ `package/firebase-messaging-compat.js` (คัดลอกตรง ไม่แก้ไข) |
| license | Apache-2.0 (+ BSD-3-Clause สำหรับ protobuf) — ดู `LICENSE-firebase.txt` |
| repo ต้นทาง | https://github.com/firebase/firebase-js-sdk |

sha256 ของไฟล์ในโฟลเดอร์นี้ (ใช้ตรวจว่าไม่ถูกแก้):

```
0dbf0df8409c85768aa712c92cdc573bc768fff7975e8e19d17d54710006047a  firebase-app-compat.js
d92e304c7450b9d8a753f5ae9afe30de1154ad9e99abf66b0d3dc8aa4de69ac7  firebase-messaging-compat.js
```

> ⚠️ minifier ตัด license header ออกจากตัว bundle → **ต้องเก็บ `LICENSE-firebase.txt` ไว้คู่กันเสมอ**
> (Apache-2.0 §4 บังคับให้แนบสำเนา license เมื่อแจกจ่ายงาน)

### เลือก 12.18.0 เพราะอะไร

ไม่เอา latest เอี่ยม (ตอนเลือก 12.19.0 เพิ่งออก 2 วัน) — เอาตัวที่ออกมาแล้วราว 3 สัปดาห์
เป็นสมดุลระหว่าง "ได้แพตช์ความปลอดภัยล่าสุด" กับ "ผ่านสายตาคนใช้จริงมาบ้างแล้ว"

### วิธีอัปเดตเวอร์ชัน

```bash
npm pack firebase@<version>
tar xzf firebase-<version>.tgz
cp package/firebase-app-compat.js package/firebase-messaging-compat.js vendor/
sha256sum vendor/firebase-*.js          # อัปเดตตารางข้างบน
```
แล้ว **bump `CACHE_NAME` ใน `service-worker.js`** (ไฟล์ `.js` เดินเส้น stale-while-revalidate
— ไม่ bump = โหลดแรกหลัง deploy ยังได้ SDK ตัวเก่า) และรัน `npx vitest run tests/push-transport.test.js`

### ⚠️ ข้อควรรู้เรื่อง cache

ไฟล์พวกนี้เป็น same-origin `.js` → เดินเส้น **②b stale-while-revalidate** ของ `service-worker.js`
**ไม่ใช่ `VENDOR_CACHE`** (ซึ่งสงวนไว้ให้โฮสต์ CDN ภายนอกที่ผูกเวอร์ชันใน URL)
แปลว่า: ใช้งานออฟไลน์ได้ **แต่ถูกล้างเมื่อ bump `CACHE_NAME`** แล้วโหลดใหม่รอบหนึ่ง
— "หาไฟล์เจอ" กับ "cache ไม่ถูก evict" เป็นคนละเรื่อง อย่าสับสน
