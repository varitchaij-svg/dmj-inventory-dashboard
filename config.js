// 🔑 Shared token กันคนสุ่มเจอ URL (กันขั้นต่ำ — frontend เป็น public จึงไม่ใช่ security จริง)
// ต้องตรงกับ Script Property ชื่อ APP_TOKEN ใน Apps Script; ปล่อยว่าง "" = ปิดการตรวจ
//
// 🧪 ══════════════════════ STAGING MODE — ชั่วคราว (ห้าม commit เข้า master) ══════════
// ค่าด้านล่าง 2 บรรทัดชี้ไปหา GAS staging project "dmj-push-test" (ไม่ใช่ของจริง) —
// ใช้ทดสอบ PWA Push Phase 1 เท่านั้น ตาม docs/SETUP-PUSH-STAGING.md
// 🔴 ต้องเอาค่า PRODUCTION (คอมเมนต์ไว้ด้านล่างนี้) กลับมาใช้งาน **ก่อน merge เข้า master
//    เด็ดขาด** — หลุดไปแล้วไม่ใช่แค่ปุ่ม Push พัง แต่ **ทั้งแอปจะคุยกับชีต/สคริปต์ทดสอบแทน
//    ของจริงทันที** (คนละ endpoint ของทั้งระบบ ไม่ใช่แค่ push)
// ผลข้างเคียงที่รู้อยู่แล้วตอนอยู่ในโหมดนี้ (ถูกต้อง ไม่ใช่บั๊ก — สลับกลับก็เขียวเอง):
//   - tests/push-transport.test.js → "config เริ่มต้นปิดอยู่ และไม่มีค่าที่เดา มาใส่" จะแดง
//     (เทสต์ตัวนี้ป้องกันไม่ให้ production มี enabled:true เป็นค่าเริ่มต้น — ทำงานถูกต้องแล้ว)
//   - tests/browser/run.cjs → "แจ้งเตือน Push — การ์ดทดสอบ (owner, ยังไม่ตั้งค่า)" จะแดง
//     (เทสต์นั้นเช็คสถานะ "ยังไม่ตั้งค่า" ซึ่งตอนนี้ตั้งค่าแล้วจริง ๆ)
// ═══════════════════════════════════════════════════════════════════════════════════
const APP_TOKEN = "test_x7k9m2";
const _SHEET_BASE = "https://script.google.com/macros/s/AKfycbzeJOOhkIHjd_SzqfFCdYVGEYcBXmyipI4kFRl6beU8k8XRm4OGSpRienlu86UKnDAVEw/exec";

// 🔒 PRODUCTION (ค่าจริง) — คอมเมนต์ไว้ชั่วคราว ห้ามลบทิ้ง เอากลับมาก่อน merge:
// const APP_TOKEN = "dmj_f05e89750b555c849b3633c449548673";
// const _SHEET_BASE = "https://script.google.com/macros/s/AKfycbz4ARb5OaYZiY40X0VMDm6jca1BSC6UpQ-1QQ1nb4VGQ0jPch1MEmEOUvWEDaEPbVcONg/exec";

// แนบ token เป็น query string → ใช้ได้ทั้ง GET (doGet) และ POST (e.parameter.token)
const _SHEET_URL = _SHEET_BASE + (APP_TOKEN ? ("?token=" + encodeURIComponent(APP_TOKEN)) : "");

const GOOGLE_SHEET_URL = _SHEET_URL;
const SHEET_DEPLOY_URL = _SHEET_URL;

// ── 🔔 PWA Push (FCM) — ค่าฝั่ง client ────────────────────────────────────────
// 🧪 STAGING MODE — ชั่วคราว (ห้าม commit เข้า master) — ดูคำเตือนหัวไฟล์
//    ค่าจริงจาก Firebase project ทดสอบ "dmj-push-test" (สร้างไว้เฉพาะทดสอบ Push Phase 1)
// 🔴 ต้องกลับเป็น enabled:false + ค่าว่างทั้งหมด ก่อน merge เข้า master เด็ดขาด
// ค่าเหล่านี้เป็น **public identifier ของ Firebase** ไม่ใช่สิทธิ์ส่ง Push — สิทธิ์ส่งอยู่ที่
// service account private key ซึ่งอยู่ใน GAS Script Property (FCM_SERVICE_ACCOUNT_JSON)
// ของโปรเจกต์ staging เท่านั้น ไม่เข้า repo ไม่เคยอยู่ในไฟล์นี้
// (คนละเรื่องกับ APP_TOKEN ด้านบน — อย่าอ้างอิงกันข้ามเหตุผล)
const DMJ_FCM_CONFIG = {
  enabled: true,
  apiKey: "AIzaSyAqdBlEp5CXSiz9_QkBnU3y6YoG_sKEmxM",
  projectId: "dmj-push-test",
  messagingSenderId: "153671700843",
  appId: "1:153671700843:web:cf4cf56774ed4215b9fc2e",
  vapidPublicKey: "BEi_QadpWW7ghojEisE6K-Sh-zltZNTYC4CfrCRL6UHzISgY7k5dDfkpZYWCTxBjIwfHo2JcXtZSSNxrBMFkdFk",
  // ไฟล์ SDK ที่ self-host — vendor/ (pin 12.18.0, ดู vendor/README.md)
  // ⚠️ self-host ไม่ได้แปลว่าไฟล์จะไปอยู่ VENDOR_CACHE เอง — ไฟล์ same-origin ที่ลงท้าย .js
  //    เดินเส้น ②b stale-while-revalidate ของ service-worker.js (โหลดออฟไลน์ได้ แต่ถูกล้าง
  //    เมื่อ bump CACHE_NAME) แยกเรื่อง "หาไฟล์เจอ" ออกจาก "cache ถูก evict" เสมอ
  sdkAppUrl: "/vendor/firebase-app-compat.js",
  sdkMessagingUrl: "/vendor/firebase-messaging-compat.js",
};

// 🔒 PRODUCTION (ค่าจริง) — คอมเมนต์ไว้ชั่วคราว ห้ามลบทิ้ง เอากลับมาก่อน merge:
// const DMJ_FCM_CONFIG = {
//   enabled: false,
//   apiKey: "",
//   projectId: "",
//   messagingSenderId: "",
//   appId: "",
//   vapidPublicKey: "",
//   sdkAppUrl: "/vendor/firebase-app-compat.js",
//   sdkMessagingUrl: "/vendor/firebase-messaging-compat.js",
// };
