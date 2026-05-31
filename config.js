// 🔑 Shared token กันคนสุ่มเจอ URL (กันขั้นต่ำ — frontend เป็น public จึงไม่ใช่ security จริง)
// ต้องตรงกับ Script Property ชื่อ APP_TOKEN ใน Apps Script; ปล่อยว่าง "" = ปิดการตรวจ
const APP_TOKEN = "";

const _SHEET_BASE = "https://script.google.com/macros/s/AKfycbyzBmF2cYl078rJH7Y9exA4-L7ZBR8UbebYo1VPUTbhuETI42lnAzrzJjOM1QJXUBYAMA/exec";
// แนบ token เป็น query string → ใช้ได้ทั้ง GET (doGet) และ POST (e.parameter.token)
const _SHEET_URL = _SHEET_BASE + (APP_TOKEN ? ("?token=" + encodeURIComponent(APP_TOKEN)) : "");

const GOOGLE_SHEET_URL = _SHEET_URL;
const SHEET_DEPLOY_URL = _SHEET_URL;
