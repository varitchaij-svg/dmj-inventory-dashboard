# Doomuenjing Inventory & Sales Dashboard

ระบบจัดการสต็อก / ยอดขาย / จัดส่ง สำหรับร้าน Doomuenjing เชื่อมต่อกับ **ZORT** (ระบบคลังสินค้า) และ **Google Sheets** (ฐานข้อมูล) พร้อม **LINE Bot** สำหรับเช็คสต็อก

หน้าเว็บ: https://dmj-inventory-dashboard.pages.dev

---

## 🧱 สถาปัตยกรรมโดยย่อ

```
┌────────────────────┐      GET (อ่าน)        ┌──────────────────┐
│  Cloudflare Pages  │ ───────────────────▶  │  Google Apps     │
│  (เว็บ React/Babel) │      POST (เขียน)      │  Script (doGet/  │
│                    │ ◀───────────────────  │  doPost)         │
└────────────────────┘                        └────────┬─────────┘
                                                        │
                                       ┌────────────────┼────────────────┐
                                       ▼                ▼                ▼
                                ┌────────────┐   ┌────────────┐   ┌────────────┐
                                │ Google     │   │   ZORT API │   │  LINE Bot  │
                                │ Sheets     │   │   (v4)     │   │  Messaging │
                                └────────────┘   └────────────┘   └────────────┘
```

- **Frontend** — static HTML + React 18 + Babel standalone (ไม่มี build step) โฮสต์บน Cloudflare Pages
- **Backend** — Google Apps Script (Web App) ทำหน้าที่เป็น API กลาง
- **Database** — Google Sheets
- **Inventory** — ZORT (open-api.zortout.com/v4)

> 📖 รายละเอียดเชิงลึกอยู่ในโฟลเดอร์ [`docs/`](docs/)

---

## 📁 โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | redirect ไป `Doomuenjing Dashboard.html` |
| `Doomuenjing Dashboard.html` | หน้าหลัก โหลด CDN + ไฟล์ jsx |
| `config.js` | **URL ของ Apps Script Web App** (ต้องอัปเดตทุกครั้งที่ redeploy) |
| `app.jsx` | routing, การโหลดข้อมูล, ระบบ login/role |
| `views.jsx` | หน้าจอทั้งหมด (สต็อก, สั่งของ, จัดส่ง, MTO, สแกน ฯลฯ) |
| `ui.jsx` | UI components + icons ที่ใช้ร่วมกัน |
| `appsscript_complete.gs` | **โค้ด Apps Script ทั้งหมด** (paste เข้า Editor) |
| `service-worker.js` / `manifest.json` | PWA |
| `_headers` / `_redirects` / `netlify.toml` | config การ deploy |

> ⚠️ `appsscript_doPost.gs` และ `views_fixed.jsx` เป็นไฟล์เก่า/สำรอง — ตัวจริงที่ใช้คือ `appsscript_complete.gs` และ `views.jsx`

---

## 🔐 บทบาทผู้ใช้ (Roles)

| Role | รหัส | แท็บที่เห็น |
|---|---|---|
| 👑 เจ้าของ (owner) | PIN `DMJ` | ทุกแท็บ |
| 🏭 คลังสินค้า (warehouse) | ไม่ต้อง PIN | สินค้า, สต็อก, ตำแหน่ง, นับ stock, สั่งของ, สรุปออกคลัง, MTO, label |
| 🏪 หน้าร้าน (frontstore) | ไม่ต้อง PIN | สินค้า, สต็อก, เช็คหน้าร้าน, สั่งของ, label |
| 💼 Sale (saler) | ไม่ต้อง PIN | สินค้า, สต็อก, สั่งของ, label |

(กำหนดใน `app.jsx` → `ROLE_PASSWORDS`, `ROLE_TABS`)

---

## 🚀 การ Deploy

### เว็บ (Cloudflare Pages)
push เข้า branch `master` → Cloudflare deploy อัตโนมัติ

### Backend (Google Apps Script) — ⚠️ สำคัญ
ทุกครั้งที่แก้ `appsscript_complete.gs` ต้อง:
1. Paste โค้ดเข้า Apps Script Editor
2. **กรอก ZORT credentials จริง** (ดู [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md))
3. Deploy ใหม่ → คัดลอก URL → อัปเดต `config.js`

> 🔒 **ห้าม commit ZORT credentials ลง git เด็ดขาด** — ในไฟล์ `.gs` ต้องเป็น `PLACEHOLDER_*` เสมอ

---

## 📚 เอกสารเพิ่มเติม

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — ขั้นตอน deploy Apps Script + จัดการ credentials
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data flow: สั่งของ → จัดส่ง → ZORT, งาน MTO, สแกนบาร์โค้ด
- [`docs/GOOGLE_SHEETS.md`](docs/GOOGLE_SHEETS.md) — โครงสร้างชีตและคอลัมน์ทั้งหมด
- [`docs/APPS_SCRIPT_API.md`](docs/APPS_SCRIPT_API.md) — รายการ action ของ doPost/doGet
- [`ZORTOUT_API.md`](ZORTOUT_API.md) — เอกสาร ZORT API
