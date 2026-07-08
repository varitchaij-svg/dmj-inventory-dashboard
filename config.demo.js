// config สำหรับ demo-interview.html เท่านั้น — ไม่ใช่ config จริงของระบบ production
// ค่าด้านล่างเป็นค่าจำลอง (placeholder) ไม่ใช่ token/URL จริง และจะไม่ถูกใช้เชื่อมต่อจริง
// เพราะ demo-interview-data.js ดักทุก fetch ที่มุ่งไปยัง URL นี้ไว้แล้ว (ดู attachFetchStub)
const APP_TOKEN = "demo-mode-no-real-token";
const _SHEET_BASE = "https://mock.local/dmj-demo-api";
const _SHEET_URL = _SHEET_BASE + "?token=" + encodeURIComponent(APP_TOKEN);

const GOOGLE_SHEET_URL = _SHEET_URL;
const SHEET_DEPLOY_URL = _SHEET_URL;
