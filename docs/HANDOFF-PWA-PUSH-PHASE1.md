# PWA Push — Phase 1 (transport proof) · สถานะงาน

> อัปเดต: 10 ก.ย. 2026 · branch `claude/pwa-push-phase1-transport`
> สถานะ: **LOCAL VERIFIED** — ยังไม่ผ่าน STAGING / PRODUCTION
>
> ⚠️ **"LOCAL VERIFIED" ไม่ได้แปลว่า Push ใช้ได้** — แปลว่าโค้ด/สิทธิ์/สายเชื่อมต่อถูกต้องตามที่
> ตั้งใจ และพิสูจน์ด้วยการรันจริงในเครื่อง · **ยังไม่มีข้อความ Push วิ่งถึงมือถือสักเครื่องเดียว**
> ⚠️ ไม่มี secret ในไฟล์นี้ และห้ามใส่

## Baseline ที่วัดจาก HEAD จริงตอนเริ่มงาน

| | ค่า |
|---|---|
| HEAD | `dca6bc4` (= `origin/master`) |
| `CACHE_NAME` เดิม | `dmj-v59` → bump เป็น **`dmj-v60`** |
| unit tests เดิม | **103 files / 2888 tests ผ่านหมด** |
| browser tests เดิม | **130/130 ผ่าน** |

⚠️ CLAUDE.md เขียนไว้ว่า 2285 tests / browser 113 — **ทั้งคู่ drift แล้ว** ใช้เลขที่วัดจริงเสมอ

## ขอบเขตที่ทำจริงในรอบนี้

**ทำ**: register อุปกรณ์ → ตรวจ binding (idempotent) → ส่งข้อความทดสอบเข้าเครื่องของผู้เรียกเอง → unregister
**ไม่ทำ (ตั้งใจ)**: ไม่แตะ `pushInappNoti_` · ไม่ผูก business event · ไม่แตะ LINE queue/`drainNotiQueue` ·
ไม่สร้าง dispatcher · ไม่แตะ audience ธุรกิจ · ไม่ต้องเปิด `INAPP_NOTI_ENABLED`

## ไฟล์ที่เปลี่ยน

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| `appsscript_complete.gs` | section ใหม่ท้ายไฟล์: ชีต `อุปกรณ์แจ้งเตือน` (14 คอลัมน์) · `pushGate_` · 3 handler · FCM HTTP v1 sender (JWT RS256) · `checkPushStatus`/`setupPush`/`disablePush` · dispatch เหนือ `invalidateCache_(true)` · hook ใน `logoutHandler_` · `unregisterPushDevice` เข้า `COMMON_ACTIONS_` |
| `service-worker.js` | `CACHE_NAME` → `dmj-v60` · bypass non-GET + FCM/OAuth hosts · `push` + `notificationclick` |
| `config.js` | `DMJ_FCM_CONFIG` แบบ **explicit disabled** (ไม่เดาค่า) |
| `ui.jsx` | client push module (lazy SDK, permission, getToken, 3 sync helper, logout cleanup, pending cleanup) |
| `views-main.jsx` | `PushTestCard` + `ConnectView` รับ prop `role` |
| `app.jsx` | ส่ง `role` ให้ ConnectView · logout ถอน binding ก่อนลบ token · effect ตรวจ binding หลังเข้าแอป |
| `tests/push-transport.test.js` | **ใหม่** 57 เคส |
| `tests/browser/harness.html` | branch 3 action + `__DMJ_PUSH_FIXTURE` |
| `tests/browser/run.cjs` | เทสต์การ์ดทดสอบ (owner) |
| `tests/cache-domains.test.js` | แก้ `bodyOf()` ให้ตัดที่ปีกกาปิด (ดูด้านล่าง) |
| `vendor/` | **ใหม่** — Firebase JS SDK compat **pin 12.18.0** + `LICENSE-firebase.txt` (Apache-2.0) + `README.md` (ที่มา/แฮช/วิธีอัปเดต) |
| `docs/SETUP-PUSH-STAGING.md` | **ใหม่** — คู่มือตั้ง staging สำหรับเจ้าของ (ไม่ต้องเขียนโค้ด) |

### ทำไมต้องแตะ `tests/cache-domains.test.js`

`bodyOf(name)` เดิมตัดถึง `\nfunction ` **ตัวถัดไป** → กวาดคอมเมนต์/โค้ดที่อยู่ *หลัง* ฟังก์ชันมาด้วยเสมอ
และฟังก์ชัน "ตัวสุดท้ายของไฟล์" จะกินไปจนจบไฟล์ · พอต่อ section ใหม่ท้ายไฟล์ `reserveFormHandler_`
เลยกวาดคอมเมนต์ที่เอ่ยถึง `invalidateCache_()` เข้าไป → แดงทั้งที่โค้ดถูก
⚠️ ทิศทางที่อันตรายกว่าคือ **เขียวผิด**: `MUST_INVALIDATE` อาจเขียวเพราะเก็บ `invalidateCache_(` ของ
ฟังก์ชันตัวถัดไปมา · แก้เป็นตัดที่ `\n}\n` แล้ว **ยืนยันครบทั้ง 22 ฟังก์ชันว่าผลตรงเจตนา**

## ✅ ผ่านแล้ว — LOCAL (รันจริงในเครื่องนี้)

- `npx vitest run` → **104 files / 2960 tests ผ่านหมด** (+72 เคสจาก `push-transport.test.js`)
- `node tests/browser/run.cjs` → **133/133 ผ่าน** (บน Chromium headless จริง)
- **mutation test 16/16 จับได้** — ถอด guard ออกทีละตัวแล้วเทสต์แดงทุกครั้ง:
  · `tokenOwnedByOther` · `requireAdmin` · ปล่อย status ว่าง · `unchanged` early-return
  · logout ถอนทุกเครื่อง · ใส่ `notification` block · นับ `INVALID_ARGUMENT` เป็น token เสีย
  · bypass non-GET · `showNotification` จุดที่สอง · boot ข้ามการตรวจ binding
  · boot เชื่อ hint ในเครื่อง · boot ขอ permission เอง · boot ทำงานทั้งที่ config ปิด
  · ไม่ล้าง hint เมื่อถูกปฏิเสธ · ถอด `clearTimeout` · แฮช vendor ไม่ตรงไฟล์
- **SDK จาก `/vendor` โหลดได้จริงบนเบราว์เซอร์** — `firebase.messaging` พร้อม · `SDK_VERSION=12.18.0`
- **SDK โหลดไม่สำเร็จ → แอปยังทำงานปกติ** — คืน `null` ไม่ throw · ไม่มี JS error · สลับแท็บต่อได้
- **boot revalidation ตรวจครบทั้ง 2 ทาง**: ปิดอยู่ → ไม่แตะอะไรเลย · **เปิดอยู่ + อนุญาตแล้ว →
  เรียก `syncRegisterPushDevice` จริง** (ยืนยันด้วยการรัน effect จริงจาก `app.jsx` กับ mocks)
  ⚠️ ผล "ตอนปิดไม่ยิง API" **ไม่ถูกใช้เป็นหลักฐานว่าตรวจ binding เป็น** — มีเคสฝั่ง enabled แยกต่างหาก

## 🔴 ยังไม่ผ่าน — PUSH บนอุปกรณ์จริง (mock ไม่ใช่หลักฐาน)

**ยังไม่เคยมีข้อความ Push เด้งบนมือถือสักเครื่อง** — ทุกอย่างข้างบนคือการพิสูจน์ *โค้ด* ไม่ใช่ *การส่ง*
ขั้นตอนที่จะพิสูจน์ได้อยู่ใน `docs/SETUP-PUSH-STAGING.md` ขั้นที่ 5

1. **raw `push` event โดยไม่ init SDK ใน SW** — เลือกทางนี้เพื่อให้มีทางแสดงผลทางเดียวจริง
   (SDK ใน SW จะมี foreground/background แยกกัน) แต่ **ยังไม่พิสูจน์บนอุปกรณ์จริง**
   ถ้าไม่ผ่าน → ถอยไป official SDK integration โดย**ยังคง data-only + จุด `showNotification` เดียว**
2. **iOS/iPadOS**: prompt ต้องมาจาก user gesture ใน standalone · ข้อความถึงจริงไหมตอนปิดแอปสนิท
3. **`deleteToken()` + `getToken()` ได้ token ใหม่จริง** — เป็นหัวใจของการสลับบัญชีบนเครื่องกลาง
4. **GAS JWT RS256 → OAuth → FCM ครบวง** — เวลา round-trip, quota, error จริง
5. **notificationclick โฟกัสหน้าต่างเดิม** ไม่เปิดใหม่ (พฤติกรรมต่างกันแต่ละแพลตฟอร์ม)
6. ~~ยังไม่มีไฟล์ SDK ใน repo~~ → **ทำแล้ว**: `vendor/` pin 12.18.0 + license ครบ
   (แต่ยังไม่เคยรันคู่กับ Firebase project จริง)
7. **ยังไม่มี Firebase project / GAS test project** — เป็นงาน setup ของเจ้าของ ไม่ใช่ข้อติดขัดของโค้ด

## กฎที่ต้องรักษาถ้าจะแก้ต่อ

- section push **ห้ามเรียก `invalidateCache_`** และชีตอุปกรณ์ **ห้ามเข้า `PAYLOAD_SOURCE_SHEETS_`**
- dispatch ทั้ง 3 action ต้องอยู่ **เหนือ** `invalidateCache_(true)`
- FCM payload ต้อง **data-only ห้ามมี `notification`** (ไม่งั้นแสดง 2 อัน)
- `INVALID_ARGUMENT` **ไม่ใช่** token เสีย (payload ผิดก็ได้) — ห้ามเอาไปปิดอุปกรณ์
- register/test = owner/dev + `status === 'active'` **ตรงตัว** · `unregister` = ทุก role + ทำได้แม้ปิด flag
- test-send **ห้ามรับ recipient/staffId/token จาก client** และ **ห้ามมี admin override**
- logout ถอน **เฉพาะ binding ของ session นั้น** ไม่ใช่ทุกเครื่องของ staffId เดียวกัน
- **ห้าม reassign token ข้ามบัญชีอัตโนมัติ** — การรู้ token ไม่ใช่หลักฐานสิทธิ์
- ห้าม `requestPermission` อัตโนมัติตอน boot
