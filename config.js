// 🔑 Shared token กันคนสุ่มเจอ URL (กันขั้นต่ำ — frontend เป็น public จึงไม่ใช่ security จริง)
// ต้องตรงกับ Script Property ชื่อ APP_TOKEN ใน Apps Script; ปล่อยว่าง "" = ปิดการตรวจ
const APP_TOKEN = "dmj_f05e89750b555c849b3633c449548673";

const _SHEET_BASE = "https://script.google.com/macros/s/AKfycbz4ARb5OaYZiY40X0VMDm6jca1BSC6UpQ-1QQ1nb4VGQ0jPch1MEmEOUvWEDaEPbVcONg/exec";
// แนบ token เป็น query string → ใช้ได้ทั้ง GET (doGet) และ POST (e.parameter.token)
const _SHEET_URL = _SHEET_BASE + (APP_TOKEN ? ("?token=" + encodeURIComponent(APP_TOKEN)) : "");

const GOOGLE_SHEET_URL = _SHEET_URL;
const SHEET_DEPLOY_URL = _SHEET_URL;

// ── 🔔 PWA Push (FCM) — ค่าฝั่ง client ────────────────────────────────────────
// ⚠️ **explicit disabled โดยเจตนา ห้ามเดาค่า** — ยังไม่มี Firebase project ของจริง
//    `enabled:false` ทำให้ทั้งเส้นทาง push เป็น no-op และ **ไม่ยิง network ใด ๆ เลย**
//    (ดู dmjPushConfig ใน ui.jsx — ค่าว่างแม้ช่องเดียวก็ถือว่าปิด)
// ค่าเหล่านี้เป็น **public identifier ของ Firebase** ไม่ใช่สิทธิ์ส่ง Push — สิทธิ์ส่งอยู่ที่
// service account private key ซึ่งอยู่ใน GAS Script Property เท่านั้น ไม่เข้า repo
// (คนละเรื่องกับ APP_TOKEN ด้านบน — อย่าอ้างอิงกันข้ามเหตุผล)
const DMJ_FCM_CONFIG = {
  enabled: false,          // ← เปิดเป็น true เมื่อเติมค่าครบและพร้อมทดสอบ
  apiKey: "",
  projectId: "",
  messagingSenderId: "",
  appId: "",
  vapidPublicKey: "",      // Web Push certificate (key pair) จาก Firebase Console
  // ไฟล์ SDK ที่ self-host — ยังไม่มีในรีโป (เป็นงาน Gate B)
  // ⚠️ self-host ไม่ได้แปลว่าไฟล์จะไปอยู่ VENDOR_CACHE เอง — ไฟล์ same-origin ที่ลงท้าย .js
  //    เดินเส้น ②b stale-while-revalidate ของ service-worker.js (โหลดออฟไลน์ได้ แต่ถูกล้าง
  //    เมื่อ bump CACHE_NAME) แยกเรื่อง "หาไฟล์เจอ" ออกจาก "cache ถูก evict" เสมอ
  sdkAppUrl: "/vendor/firebase-app-compat.js",
  sdkMessagingUrl: "/vendor/firebase-messaging-compat.js",
};
