// ============================================================
// 🔧 COMPLETE Google Apps Script — Dashboard + LINE Bot + ZORT
// ============================================================

// ───────────────────────────────────────────────────────────
// SECTION 1: Configuration
// ───────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────
// 🔐 Secrets — อ่านจาก Script Properties เท่านั้น
// ⚠️ ห้าม hardcode ค่าจริงในไฟล์นี้ (ดู setupSecrets() ด้านล่าง)
//    ตั้งค่าครั้งเดียวผ่าน Apps Script Editor → Project Settings → Script Properties
//    หรือเรียกฟังก์ชัน setupSecrets() แล้วกรอกค่าจริงชั่วคราว (อย่า commit)
// ───────────────────────────────────────────────────────────
function getSecret_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return (v && v.trim()) ? v : (fallback || '');
}

/**
 * ตรวจ shared token (กันคนสุ่มเจอ URL ขั้นต่ำ)
 * ถ้า Script Property APP_TOKEN ว่าง = ปิดการตรวจ (backward compatible)
 * คืน true = ผ่าน, false = ไม่ผ่าน
 */
// ─── ตรวจ conflict: คืน epoch ms ที่ข้อมูลถูกแก้ล่าสุด ───
// อ่านจาก Script Properties (dmj_last_write_ts) ก่อนเสมอ — ถูกเขียนทุกครั้งที่ doPost แก้ข้อมูล
// Script Properties ไม่ผ่าน CacheService จึงสด ๆ เสมอ
// Fallback: DriveApp.getLastUpdated() (อาจล่าช้าหลายนาทีเพราะ Google Drive cache ภายใน)
function getSheetLastModified_() {
  try {
    const tsProp = PropertiesService.getScriptProperties().getProperty('dmj_last_write_ts');
    if (tsProp) {
      const tsNum = parseInt(tsProp, 10);
      if (tsNum > 0) return tsNum;
    }
  } catch (e) {
    Logger.log("getSheetLastModified_ (prop) error: " + e);
  }
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) return 0;
  try {
    return DriveApp.getFileById(sheetId).getLastUpdated().getTime();
  } catch (e) {
    Logger.log("getSheetLastModified_ (drive) error: " + e);
    return 0;
  }
}

/**
 * Pure helper: ตัดสินว่าควร reject conflict หรือไม่
 * @param {number|string|null} clientLoadedAt  - epoch ms ที่ client โหลดข้อมูล
 * @param {number} sheetLastModified           - epoch ms ที่ sheet ถูกแก้ล่าสุด
 * @param {number} [slopMs=5000]               - หน้าต่างผ่อนผัน (ms) กันนาฬิกาต่าง/delay เล็กน้อย
 * @return {boolean} true = reject (มี conflict), false = ผ่าน
 */
function shouldRejectConflict_(clientLoadedAt, sheetLastModified, slopMs) {
  if (!clientLoadedAt || !sheetLastModified) return false;
  return sheetLastModified > Number(clientLoadedAt) + (slopMs || 5000);
}

function checkToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected || !expected.trim()) return true; // ยังไม่ตั้ง = ไม่บังคับ
  return String(token || '') === expected;
}

function unauthorized_() {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: "unauthorized" }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ตั้งค่า secrets ลง Script Properties — รันครั้งเดียวใน Apps Script Editor
 * แล้ว "ลบค่าจริงออก" ก่อน save/commit เพื่อไม่ให้รั่วลง git
 */
function setupSecrets() {
  PropertiesService.getScriptProperties().setProperties({
    LINE_ACCESS_TOKEN: 'PLACEHOLDER_LINE_ACCESS_TOKEN',
    LINE_USER_ID:      'PLACEHOLDER_LINE_USER_ID',
    SHEET_ID:          'PLACEHOLDER_SHEET_ID',
    ZORT_STORE:        'PLACEHOLDER_ZORT_STORE',
    ZORT_APIKEY:       'PLACEHOLDER_ZORT_APIKEY',
    ZORT_SECRET:       'PLACEHOLDER_ZORT_SECRET',
  }, false);
  Logger.log('✅ setupSecrets: เขียนค่าลง Script Properties แล้ว (แก้ค่าจริงในหน้า Project Settings)');
}

// ── LINE Bot ──
const LINE_ACCESS_TOKEN = getSecret_('LINE_ACCESS_TOKEN', 'PLACEHOLDER_LINE_ACCESS_TOKEN');
const LINE_USER_ID = getSecret_('LINE_USER_ID', 'PLACEHOLDER_LINE_USER_ID');
// ── LINE Bot ตัวที่ 2 (ช่องทางสำรอง — ไม่บังคับ) ──
// เก็บ token/กลุ่มของ OA ตัวที่ 2 ใน Script Properties: LINE_ACCESS_TOKEN_2, LINE_GROUP_ID_2
// ถ้าไม่ตั้ง = ระบบ fallback ไปใช้ช่องทางหลักอัตโนมัติ (ทำงานได้ปกติแบบช่องทางเดียว)
const LINE_ACCESS_TOKEN_2 = getSecret_('LINE_ACCESS_TOKEN_2', '');

// ── LINE Login (ล็อกอินพนักงาน — คนละตัวกับ LINE_ACCESS_TOKEN ที่ใช้ส่งแจ้งเตือน) ──
// สร้าง channel แยกที่ developers.line.biz (ประเภท "LINE Login", provider เดียวกับ OA)
// ตั้ง Script Properties: LINE_LOGIN_CHANNEL_ID, LINE_LOGIN_CHANNEL_SECRET
// .trim() สำคัญ: getSecret_ เช็ค v.trim() แต่คืนค่า v ดิบ — ถ้าตอนวางค่าใน Script Properties
// ติดช่องว่าง/ขึ้นบรรทัดมาด้วย (เกิดง่ายมากเวลา copy จากหน้า LINE Developers) client_id จะเพี้ยน
// แล้ว LINE ตอบ 400 ทันทีตั้งแต่หน้า authorize
const LINE_LOGIN_CHANNEL_ID     = getSecret_('LINE_LOGIN_CHANNEL_ID', '').trim();
const LINE_LOGIN_CHANNEL_SECRET = getSecret_('LINE_LOGIN_CHANNEL_SECRET', '').trim();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // session ค้าง 30 วัน (มือถือส่วนตัวทุกคน — ยอมรับความเสี่ยงนี้ได้)
// ต้องตรงกับ ROLE_TH_PLAIN ใน app.jsx — ใช้ประกอบชื่อ actor ให้ audit log หน้าตาเหมือนกัน
// ทั้งตอน client ส่งมาเอง (ก่อนเฟส 4) และตอน server ประกอบจาก session (เฟส 4)
const STAFF_ROLE_TH_ = { owner: "เจ้าของ", saler: "Sale", warehouse: "คลังสินค้า", frontstore: "หน้าร้าน", employee: "พนักงาน", dev: "DEV", storedevice: "เครื่องร้าน" };

// ── Sheet Config ──
const SHEET_ID = getSecret_('SHEET_ID', 'PLACEHOLDER_SHEET_ID');
const SHEET_PRODUCTS  = "อัพเดทจำนวนสินค้า";
const SHEET_ORDERS    = "ลำดับที่สั่งสินค้า";
const SHEET_LOCKS     = "ตำแหน่งจัดเก็บ";
const SHEET_TRANSFERS = "รายการโอนสินค้า";
const SHEET_SHIP_ARCHIVE = "ประวัติรับสินค้า";  // เก็บรายการรับครบที่ archive ออกจากชีตหลัก
const SHEET_AUDIT     = "Audit Log";
const SHEET_FRONTSTORE_QTY = "จำนวนหน้าร้าน";  // บันทึกจำนวนหน้าร้านที่เช็คแล้ว
const SHEET_IMAGE_URL      = "imageUrl";          // mapping รูปภาพสินค้า
const SHEET_PRODUCT_META   = "ข้อมูลสินค้า";    // metadata สินค้า (ชื่อ/หมวด/ราคา)
const SHEET_SHELF_SWEEP_LOG = "ชั้นนำออกอัตโนมัติ"; // log สำรองชั้นที่ระบบนำออกเอง (กู้คืนได้)
const SHEET_PURCHASES      = "รายการซื้อสินค้า"; // ประวัติการซื้อ/PO
const SHEET_MONTHLY_SALES  = "ยอดขายรายเดือน";  // ยอดขายแยกตามเดือน
const SHEET_DAILY_SALES    = "ยอดขายรายวัน";    // ยอดขายแยกตามวัน
const SHEET_TRANSFERS_HIST = "รายการโอน";        // ประวัติโอนสินค้า (ต่างจาก SHEET_TRANSFERS)
const SHEET_MTO_JOBS       = "งาน MTO";          // งานจัดพิเศษ (make-to-order)
const SHEET_NOTI_QUEUE     = "คิวแจ้งเตือน LINE"; // คิวข้อความ LINE (throttle/กันชนลิมิต/กันส่งซ้ำ)
const SHEET_INAPP_NOTI     = "แจ้งเตือนในแอป";   // กระดิ่งบนหัวจอ (ไม่ยิง LINE = ไม่กิน quota)
const SHEET_PRODUCT_OWNER  = "ผู้ดูแลสินค้า";     // ⭐ ใครดูแลสินค้าตัวไหน (1 สินค้า = 1 คน) — ป้ายบอก ไม่ใช่สิทธิ์
const SHEET_MTO_ITEMS      = "วัตถุดิบ MTO";    // วัตถุดิบสำหรับงาน MTO
const SHEET_CUST_MONTHLY   = "สรุปลูกค้า-เดือน";  // ยอดซื้อลูกค้า แยกตามเดือน (customer×month)
const SHEET_CUST_PRODUCTS  = "สรุปลูกค้า-สินค้า"; // สินค้าที่ลูกค้าแต่ละรายซื้อบ่อย (top-N/ลูกค้า)
const SHEET_QUOTE_SALE     = "เซลใบเสนอราคา";    // mapping เลขที่ QT → ชื่อเซลที่ทำใบ (assign ใน dashboard)
const SHEET_UNSCANNED_SALE = "ขายไม่สแกน";        // นับสต็อกแล้วของหาย=ขายออก (บวก soldQty ไม่แตะยอดเงิน) col: date,SKU,qty,actor,time
const SHEET_ORDERS_RAW     = "ZORT ออเดอร์ดิบ";   // ออเดอร์ดิบทั้งระบบ (per-line) สำหรับ backfill+วิเคราะห์ย้อนหลัง
const SHEET_QUOTE_DRAFTS   = "ร่างใบเสนอราคา";    // ร่างใบเสนอราคาที่ยังไม่ส่งเข้า ZORT
const SHEET_INVOICE_NUM    = "เลขที่ใบแจ้งหนี้";   // เลขที่ใบแจ้งหนี้ของเราเอง (IVB-yyyyMM###) ผูกกับเลขที่ใบเสนอราคาต้นทาง
const SHEET_STAFF          = "พนักงาน";           // บัญชีพนักงาน (LINE Login) — ชื่อ/ตำแหน่ง/สถานะ
const SHEET_SESSIONS       = "เซสชัน";            // session token ที่ออกให้ตอนล็อกอิน LINE
const SHEET_SALE_BILLS     = "บิลขาย";             // log บิลขายที่ออกผ่าน POS (1 แถว = 1 บิล) — ฝั่งเราเอง ไม่ต้องรอ sync ZORT
const SHEET_ATTENDANCE     = "ลงเวลา";            // event log ลงเวลา (1 แถว = 1 การกดปุ่ม)
const SHEET_ATT_SITES      = "จุดลงเวลา";         // พิกัดร้าน/คลัง + รัศมีที่ยอมรับ
const SHEET_ATT_SHIFTS     = "ตั้งค่ากะ";          // เวลาเข้า-เลิกงานต่อตำแหน่ง/วัน
const BACKFILL_START_YM    = "2024-01";           // เดือนแรกที่เริ่มใช้ ZORT — backfill ดึงตั้งแต่เดือนนี้
const WH_NAME_SAI5    = "คลังสินค้าสาย5";
const WH_NAME_FS      = "ดูเหมือนจริง";

// ── Column Mapping (1-based) ──
const COL_PROD_SKU    = 2;   // B
const COL_PROD_QTYFS  = 7;   // G = หน้าร้าน
const COL_PROD_QTYWH  = 8;   // H = คลัง

const COL_ORD_TYPE     = 1;   // A  ("หิ้ว" / "รอขึ้นรถ")
const COL_ORD_SKU      = 6;   // F
const COL_ORD_DATE     = 2;   // B
const COL_ORD_STATUS   = 3;   // C
const COL_ORD_PREPQTY  = 9;   // I
// ผู้สั่ง/ผู้จัด — เพิ่มใหม่ (ส.ค. 2026) ใช้คอลัมน์ว่างระหว่าง K (เหลือ) กับ N (printFlag)
// ⚠️ ต่อท้ายในช่องว่างเดิม ไม่แทรกคอลัมน์ใหม่ กัน column-index ของ N เพี้ยน
// แถวเก่าก่อนวันที่เพิ่มจะว่างทั้งสองช่อง — frontend ต้องรองรับค่าว่างเสมอ
const COL_ORD_ORDERBY  = 12;  // L ผู้สั่ง (มาจาก session ไม่ใช่ค่าที่ client ส่งมา)
const COL_ORD_PREPBY   = 13;  // M ผู้จัด (คนที่กดจัดของ/ปิดงานในแท็บรายการสั่ง)
const COL_ORD_PRINTFLAG= 14;  // N

// ชีต "รายการโอนสินค้า" (SHEET_TRANSFERS) — warehouse ส่งของ → log ผ่าน logTransferBatch_/logTransfer_
// 2 แถวหัวตาราง (row1=กลุ่ม, row2=ชื่อคอลัมน์) ข้อมูลเริ่ม row3
const COL_SHIP_REF        = 1;  // A หมายเลขรายการ (batch ref)
const COL_SHIP_DATE       = 2;  // B วันที่ทำรายการ
const COL_SHIP_STATUS     = 3;  // C สถานะ
const COL_SHIP_FROM       = 4;  // D จากคลัง/สาขา
const COL_SHIP_TO         = 5;  // E ไปคลัง/สาขา
const COL_SHIP_SKU        = 6;  // F รหัสสินค้า
const COL_SHIP_NAME       = 7;  // G ชื่อสินค้า
const COL_SHIP_QTY        = 8;  // H จำนวน(ส่ง)
const COL_SHIP_PREPARED   = 9;  // I จำนวนที่จัด
const COL_SHIP_IMAGE      = 10; // J รูปภาพ
const COL_SHIP_RECVQTY    = 11; // K จำนวนที่รับ
const COL_SHIP_RECVSTATUS = 12; // L สถานะรับ
const COL_SHIP_RECVAT     = 13; // M รับเมื่อ
const COL_SHIP_RECVBY     = 14; // N ผู้รับ
const COL_SHIP_PREPAREDBY = 15; // O ผู้จัด (เพิ่มใหม่ Sprint 2 — แถวเก่าจะว่างเปล่าในคอลัมน์นี้)

const COL_LOCK_SKU     = 2;   // B = รหัสสินค้า (SKU)
const COL_LOCK_KEY     = 3;   // C = รหัสล็อค (Location)
const COL_LOCK_QTY     = 4;   // D = จำนวน (Qty)
const COL_LOCK_DATE    = 8;   // H = อัปเดตล่าสุด (Last Updated)

// ── ZORT API ──
// ⚠️ ใส่ค่าจริงใน Apps Script Editor เท่านั้น ห้าม commit ค่าจริงลง git
const ZORT_STORE  = getSecret_('ZORT_STORE', 'PLACEHOLDER_ZORT_STORE');
const ZORT_APIKEY = getSecret_('ZORT_APIKEY', 'PLACEHOLDER_ZORT_APIKEY');
const ZORT_SECRET = getSecret_('ZORT_SECRET', 'PLACEHOLDER_ZORT_SECRET');
const ZORT_BASE   = "https://open-api.zortout.com/v4";
const WH_SAI5       = "W0002";   // คลังสินค้าสาย5 → col H
const WH_FRONTSTORE = "W0001";   // ดูเหมือนจริง → col G

// ── LINE Bot Cache ──
const CACHE_KEY = 'stock_inverted_index';
const CACHE_TIME = 300;
const RESULT_CACHE_TIME = 600;
const MAX_CARDS = 6;
const MAX_TOTAL = 60;

// ── Dashboard ──
const DASH_TABS = {
  PRODUCTS:      'ข้อมูลสินค้า',
  SYS_QTY:       'อัพเดทจำนวนสินค้า',
  MONTHLY_SALES: 'ยอดขายรายเดือน',
  DAILY_SALES:   'ยอดขายรายวัน',
  TRANSFERS:     'รายการโอน',
  PURCHASES:     'รายการซื้อสินค้า',
  STORAGE:       'ตำแหน่งจัดเก็บ',
};
const COST_RATIO = 0.8;

// ราคาที่ ZORT คืนมา (p.price) = **ราคาขายปลีก** · มูลค่าสต๊อกที่เจ้าของใช้ตัดสินใจจริง
// คิดที่ **ราคาขายส่ง** = ปลีก − 20% → เก็บอัตราไว้ที่ Script Property ปรับได้โดยไม่ต้องแก้โค้ด
// (ค่าที่ยอมรับ 0 < r ≤ 1 · นอกช่วง/ไม่ใช่ตัวเลข → กลับไปใช้ 0.8)
const WHOLESALE_RATIO_DEFAULT = 0.8;
function wholesaleRatio_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('WHOLESALE_RATIO');
    const r = Number(raw);
    if (raw !== null && raw !== '' && isFinite(r) && r > 0 && r <= 1) return r;
  } catch (e) {}
  return WHOLESALE_RATIO_DEFAULT;
}

// ───────────────────────────────────────────────────────────
// Audit Log helper — fire-and-forget, ห้าม throw กระทบ main flow
// resource: generic resource id — ไม่จำกัดแค่ SKU (order/MTO job/transfer/ฯลฯ)
//           ชื่อ param เปลี่ยนจาก sku→resource แต่ตำแหน่ง/จำนวนคอลัมน์เดิมไม่เปลี่ยน
//           จึง caller เดิมทั้งหมดยังทำงานเหมือนเดิม
// หมายเหตุ: audit log นี้เป็นระดับ Role ไม่ใช่ระดับรายบุคคล เพราะ actor ที่ frontend
//           ส่งมาปัจจุบัน = role string เสมอ (window._currentUser ไม่เคยถูกกำหนดค่าจริง
//           ในระบบ) — ถ้าต้องการ traceability ระดับพนักงานรายคน ต้องเพิ่ม step ให้กรอกชื่อ
//           ตอน login ก่อน ซึ่งเป็นฟีเจอร์แยกนอกขอบเขตนี้
// ───────────────────────────────────────────────────────────
function writeAuditLog_(actor, action, resource, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_AUDIT);
    if (!sh) {
      sh = ss.insertSheet(SHEET_AUDIT);
      sh.appendRow(["วันที่เวลา", "ผู้ใช้", "Action", "Resource", "รายละเอียด"]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold");
    }
    sh.appendRow([new Date(), actor || "ไม่ระบุ", action || "", resource || "", detail || ""]);
  } catch (e) {
    Logger.log("writeAuditLog_ error: " + e);
  }
}

// เขียน Audit Log หลายแถวรวดเดียว — ผลลัพธ์ในชีตเหมือน writeAuditLog_ ทีละแถวเป๊ะ
// (1 งาน = 1 แถว เท่าเดิม ตัวเลขในแท็บ "ผลงานพนักงาน" จึงไม่เปลี่ยน) แต่เขียนครั้งเดียว
// มีไว้เพราะงานที่ทำทีละหลายสิบ SKU (โอนของขึ้นรถ) เสียเวลาไปกับ appendRow ทีละแถวมากจน
// คำตอบกลับไม่ทันเพดานเวลาฝั่ง browser → ผู้ใช้เห็น "ส่งไม่สำเร็จ" ทั้งที่ของโอนไปแล้ว
// ⚠️ ชื่อ action ที่ส่งเข้ามาต้องมีหมวดใน STAFF_PERF_CATEGORIES_ เหมือน writeAuditLog_ ทุกประการ
//    (tests/staff-perf.test.js สแกน call site ของทั้งสองฟังก์ชัน)
function writeAuditLogBatch_(actor, action, items) {
  try {
    if (!items || !items.length) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_AUDIT);
    if (!sh) {
      sh = ss.insertSheet(SHEET_AUDIT);
      sh.appendRow(["วันที่เวลา", "ผู้ใช้", "Action", "Resource", "รายละเอียด"]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold");
    }
    const now = new Date();
    const rows = items.map(function (it) {
      return [now, actor || "ไม่ระบุ", action || "", (it && it.resource) || "", (it && it.detail) || ""];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  } catch (e) {
    Logger.log("writeAuditLogBatch_ error: " + e);
  }
}

// สร้าง detail string แบบ JSON มาตรฐาน สำหรับ audit log ที่ต้องเก็บ before/after
// รับ object อิสระ (ไม่ fix shape) เพื่อรองรับข้อมูลเพิ่มเติมในอนาคตโดยไม่ต้องแก้ signature
// ตัวอย่าง: auditDetail_({ before: {status:"รอ"}, after: null, note: "ลบ order หลังส่งสำเร็จ" })
function auditDetail_(fields) {
  try {
    return JSON.stringify(fields || {});
  } catch (e) {
    return String((fields && fields.note) || "");
  }
}

// ───────────────────────────────────────────────────────────
// ระบบล็อกอินพนักงาน (LINE Login) — ชีต "พนักงาน" + ชีต "เซสชัน"
// ───────────────────────────────────────────────────────────
function getOrCreateSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}

function staffSheet_(ss) {
  return getOrCreateSheet_(ss, SHEET_STAFF,
    ["staffId", "provider", "providerUserId", "displayName", "lineDisplayName", "role", "status", "pictureUrl", "createdAt", "lastLoginAt", "note"]);
}
function sessionsSheet_(ss) {
  return getOrCreateSheet_(ss, SHEET_SESSIONS,
    ["token", "staffId", "createdAt", "expiresAt", "lastSeenAt", "revoked"]);
}

function staffRowToObj_(row) {
  return {
    staffId: row[0], provider: row[1], providerUserId: row[2],
    displayName: row[3], lineDisplayName: row[4], role: row[5],
    status: row[6], pictureUrl: row[7], createdAt: row[8],
    lastLoginAt: row[9], note: row[10],
  };
}

function readStaffAll_(ss) {
  const sh = staffSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, 11).getValues();
  return vals.map(staffRowToObj_).filter(function (s) { return s.staffId; });
}

// คืน 1-indexed row number (>=2) หรือ -1 ถ้าไม่เจอ
function findStaffRowIndex_(sh, providerUserId) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 3, last - 1, 1).getValues(); // col C = providerUserId
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(providerUserId)) return i + 2;
  }
  return -1;
}

function findStaffRowById_(sh, staffId) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(staffId)) return i + 2;
  }
  return -1;
}

function nextStaffId_(sh) {
  const last = sh.getLastRow();
  const n = last < 2 ? 0 : last - 1;
  return "ST" + String(n + 1).padStart(4, "0");
}

// แลก authorization code → access_token/id_token (server-to-server, ใช้ channel secret)
function exchangeLineToken_(code, redirectUri) {
  const res = UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "post",
    payload: {
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
      client_id: LINE_LOGIN_CHANNEL_ID,
      client_secret: LINE_LOGIN_CHANNEL_SECRET,
    },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error("LINE token exchange failed: " + (body.error_description || body.error || res.getResponseCode()));
  }
  return body; // { access_token, id_token, ... }
}

// ตรวจ id_token กับ LINE โดยตรง (ไม่ต้องมี JWT library ฝั่ง GAS) — คืน claims {sub,name,picture,...}
function verifyLineIdToken_(idToken) {
  const res = UrlFetchApp.fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "post",
    payload: { id_token: idToken, client_id: LINE_LOGIN_CHANNEL_ID },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    throw new Error("LINE id_token verify failed: " + (body.error_description || body.error || res.getResponseCode()));
  }
  return body;
}

function createSession_(ss, staffId) {
  const sh = sessionsSheet_(ss);
  const token = Utilities.getUuid();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  sh.appendRow([token, staffId, now, expires, now, false]);
  return token;
}

// คืน staff object (ถ้า session valid: ไม่ถูก revoke และยังไม่หมดอายุ) หรือ null
function resolveSession_(ss, token) {
  if (!token) return null;
  const sh = sessionsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return null;
  const vals = sh.getRange(2, 1, last - 1, 6).getValues();
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[0]) !== String(token)) continue;
    const revoked = r[5] === true || r[5] === 'TRUE';
    const expiresAt = r[3] ? new Date(r[3]).getTime() : 0;
    if (revoked || !expiresAt || expiresAt < Date.now()) return null;
    try { sh.getRange(i + 2, 5).setValue(new Date()); } catch (e) {}
    const staffSh = staffSheet_(ss);
    const staffRow = findStaffRowById_(staffSh, r[1]);
    if (staffRow < 0) return null;
    return staffRowToObj_(staffSh.getRange(staffRow, 1, 1, 11).getValues()[0]);
  }
  return null;
}

function revokeSession_(ss, token) {
  if (!token) return;
  const sh = sessionsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === String(token)) {
      sh.getRange(i + 2, 6).setValue(true);
      return;
    }
  }
}

// รายชื่อ LINE display name ที่ตั้งเป็น owner ให้อัตโนมัติทันทีที่ล็อกอิน (ไม่ต้องรออนุมัติ)
// ⚠️ จับคู่ด้วย "ชื่อที่โชว์ใน LINE" ซึ่งใครก็เปลี่ยนเองได้ — ยอมรับความเสี่ยงนี้ได้เฉพาะทีมเล็ก
// ที่ไว้ใจกัน ถ้าอยากปลอดภัยกว่านี้ให้เปลี่ยนไปจับคู่ด้วย providerUserId (คอลัมน์ C ชีต "พนักงาน") แทน
const AUTO_OWNER_LINE_NAMES = ["tah", "jeed"]; // lower-case ไว้เทียบแบบไม่สนตัวพิมพ์
function isAutoOwnerLineName_(name) {
  return AUTO_OWNER_LINE_NAMES.indexOf(String(name || "").trim().toLowerCase()) >= 0;
}

// ล็อกอินด้วย LINE — upsert แถวพนักงาน (คนแรกที่เคยล็อกอินในระบบ = owner อัตโนมัติ) + ออก session
// cache key ของผลลัพธ์แลก code — code จาก LINE ยาวเกิน key limit ของ CacheService
// ย่อด้วย MD5 ก่อน (ไม่ได้ใช้เชิงความปลอดภัย แค่ให้ key สั้นและไม่ชนกัน)
function authCodeCacheKey_(code) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(code));
  return "authline_" + raw.map(function (b) { return ((b & 0xFF) + 256).toString(16).slice(1); }).join("");
}

function authLine_(ss, data) {
  try {
    if (!LINE_LOGIN_CHANNEL_ID || !LINE_LOGIN_CHANNEL_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "ยังไม่ได้ตั้งค่า LINE Login ฝั่งเซิร์ฟเวอร์ (Script Properties)" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── idempotent ต่อ 1 code ──────────────────────────────────────────────
    // code จาก LINE ใช้ได้ครั้งเดียว ยิงซ้ำได้ invalid_grant
    // เคสจริงที่ทำให้พนักงานต้องกดล็อกอินซ้ำ 3-4 รอบ: ฝั่งนี้ทำสำเร็จไปแล้ว
    // (ออก session + เขียนชีตครบ) แต่ response หายกลางทางเพราะเน็ตมือถือหลุด
    // → พนักงานกดใหม่ เจอ invalid_grant → ต้องเริ่มจากแอป LINE ใหม่ทั้งรอบ
    // → เก็บผลที่สำเร็จไว้ 10 นาที ยิง code เดิมซ้ำได้ session เดิมกลับไปเลย
    const ck = authCodeCacheKey_(data.code);
    const cache = CacheService.getScriptCache();
    const cachedRes = cache.get(ck);
    if (cachedRes) {
      return ContentService.createTextOutput(cachedRes).setMimeType(ContentService.MimeType.JSON);
    }

    const tokenRes = exchangeLineToken_(data.code, data.redirectUri);
    const claims = verifyLineIdToken_(tokenRes.id_token);
    const providerUserId = claims.sub;
    const lineDisplayName = claims.name || "";
    const pictureUrl = claims.picture || "";

    const sh = staffSheet_(ss);
    const rowIdx = findStaffRowIndex_(sh, providerUserId);
    const now = new Date();
    let staffObj;

    const autoOwner = isAutoOwnerLineName_(lineDisplayName);

    if (rowIdx < 0) {
      const isFirstEver = sh.getLastRow() < 2;
      const staffId = nextStaffId_(sh);
      const role = (isFirstEver || autoOwner) ? "owner" : "";
      const status = (isFirstEver || autoOwner) ? "active" : "pending";
      sh.appendRow([staffId, "line", providerUserId, lineDisplayName, lineDisplayName, role, status, pictureUrl, now, now, ""]);
      staffObj = { staffId: staffId, provider: "line", providerUserId: providerUserId, displayName: lineDisplayName, lineDisplayName: lineDisplayName, role: role, status: status, pictureUrl: pictureUrl, createdAt: now, lastLoginAt: now, note: "" };
      if (!isFirstEver && !autoOwner) {
        try {
          enqueueNoti_({ channel: 'secondary', priority: 5, type: 'text', target: 'user',
            payload: { text: "👤 มีคนขอเข้าใช้งานระบบใหม่: " + lineDisplayName + "\nเข้าแท็บ \"พนักงาน\" เพื่ออนุมัติ" } });
        } catch (e) { Logger.log("authLine_ noti error: " + e); }
      }
    } else {
      const vals = sh.getRange(rowIdx, 1, 1, 11).getValues()[0];
      staffObj = staffRowToObj_(vals);
      sh.getRange(rowIdx, 10).setValue(now);              // lastLoginAt
      sh.getRange(rowIdx, 5).setValue(lineDisplayName);   // lineDisplayName สดจาก LINE ทุกครั้ง
      if (!staffObj.pictureUrl && pictureUrl) sh.getRange(rowIdx, 8).setValue(pictureUrl);
      staffObj.lastLoginAt = now;
      staffObj.lineDisplayName = lineDisplayName;
      // ชื่ออยู่ใน whitelist แต่ยังไม่ใช่ owner/active (เช่นเคยตั้ง role อื่นไว้ หรือค้าง pending) → ยกระดับให้ทันที
      if (autoOwner && (staffObj.role !== "owner" || staffObj.status !== "active")) {
        sh.getRange(rowIdx, 6).setValue("owner");   // role
        sh.getRange(rowIdx, 7).setValue("active");  // status
        staffObj.role = "owner";
        staffObj.status = "active";
      }
    }

    const sessionToken = createSession_(ss, staffObj.staffId);
    const staffPayload = {
      staffId: staffObj.staffId,
      name: staffObj.displayName || staffObj.lineDisplayName,
      role: staffObj.role, status: staffObj.status, pictureUrl: staffObj.pictureUrl,
    };
    // ฝากผลไว้ให้ context ที่ "เริ่ม" ล็อกอินมารับเอง (iOS PWA ที่ถูกเด้งไปจบใน Safari)
    // handoffId = ค่า state ที่ LINE ส่งกลับมา ซึ่งคือ SHA-256 ของ secret ที่อยู่กับ PWA เท่านั้น
    saveLoginHandoff_(data.handoffId, sessionToken, staffPayload);
    const payload = JSON.stringify({ ok: true, sessionToken: sessionToken, staff: staffPayload });
    try { cache.put(ck, payload, 600); } catch (e) { Logger.log("authLine_ cache put: " + e); }
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function meHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  // invalid:true = "session นี้ใช้ไม่ได้จริง ๆ" (หมดอายุ/ถูก revoke/ไม่มีในชีต) → client ลบ token ได้
  // ต้องแยกออกจาก error ชั่วคราว เพราะ doPost catch ตอบ {success:false} ซึ่ง "ไม่มี ok" เหมือนกัน
  // ถ้า client ลบ token ตามทุกกรณีที่ไม่ ok พนักงานจะโดนเตะออกทั้งที่ session ยังดี
  // (ชีตชนกัน/quota/timeout ชั่วคราว) แล้วต้องล็อกอินใหม่โดยไม่มีเหตุผล
  if (!s) return ContentService.createTextOutput(JSON.stringify({ ok: false, invalid: true })).setMimeType(ContentService.MimeType.JSON);
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, staff: { staffId: s.staffId, name: s.displayName || s.lineDisplayName, role: s.role, status: s.status, pictureUrl: s.pictureUrl },
  })).setMimeType(ContentService.MimeType.JSON);
}

function logoutHandler_(ss, data) {
  revokeSession_(ss, data.sessionToken);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Login handoff — กู้เคส "เริ่มล็อกอินที่หนึ่ง แต่ไปจบอีกที่หนึ่ง"
//
//  อาการจริงบน iPhone: เปิดแอปจากไอคอนหน้าโฮม (standalone/PWA) แล้วกดล็อกอิน
//  iOS มักเด้งออกไปเปิด Safari → ล็อกอินสำเร็จใน Safari แต่ sessionToken ไปอยู่ใน
//  localStorage ของ Safari ซึ่ง "คนละใบ" กับของ PWA → กลับมาเปิดไอคอนหน้าโฮมก็ยัง
//  ไม่ได้ล็อกอิน วนแบบนี้ตลอด · การบังคับ navigate ใน webview ของ PWA ช่วยได้บางเวอร์ชัน
//  แต่ไม่ทุกเวอร์ชัน (พฤติกรรม iOS ต่างกันไปแต่ละรุ่น) จึงต้องมีทางกู้ที่ไม่พึ่ง storage ร่วมกัน
//
//  วิธี: ฝั่ง PWA สุ่ม "รหัสลับ" (secret) เก็บไว้กับตัว แล้วส่ง SHA-256 ของมันไปเป็น
//  `state` ของ LINE · context ไหนก็ตามที่รับ callback (Safari ก็ได้) จะฝาก sessionToken
//  ไว้ที่เซิร์ฟเวอร์ใต้คีย์ = state · PWA กลับมาเปิดเมื่อไหร่ก็ยื่น secret มาแลกคืน
//
//  ปลอดภัยเพราะ: คีย์ที่โผล่ใน URL/ประวัติเบราว์เซอร์คือ "แฮช" ไม่ใช่ secret — คนที่เห็น URL
//  ย้อนกลับไปหา secret ไม่ได้ · แลกได้ครั้งเดียว (รับแล้วลบทิ้ง) · หมดอายุใน 15 นาที
// ═══════════════════════════════════════════════════════════════════════════
const LOGIN_HANDOFF_TTL_SEC = 900; // 15 นาที — เผื่อคนสลับแอปไปมา/เน็ตช้า แต่ไม่ค้างข้ามวัน

function loginHandoffKey_(id) { return 'dmj_login_handoff_' + String(id).slice(0, 120); }

function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

// ฝากผลล็อกอินไว้ให้ context ที่เริ่มล็อกอินมารับ (เรียกจาก authLine_ เมื่อ client ส่ง handoffId มา)
function saveLoginHandoff_(handoffId, sessionToken, staff) {
  if (!handoffId) return;
  try {
    CacheService.getScriptCache().put(
      loginHandoffKey_(handoffId),
      JSON.stringify({ sessionToken: sessionToken, staff: staff }),
      LOGIN_HANDOFF_TTL_SEC
    );
  } catch (e) { Logger.log('saveLoginHandoff_ error: ' + e); }
}

// PWA ยื่น secret มาแลก sessionToken คืน — คีย์ที่ใช้หาคือ SHA-256 ของ secret
function claimLoginHandoffHandler_(data) {
  const secret = String(data.handoffSecret || '');
  if (!secret) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'no-secret' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  let raw = null;
  try {
    const cache = CacheService.getScriptCache();
    const key = loginHandoffKey_(sha256Hex_(secret));
    raw = cache.get(key);
    if (raw) cache.remove(key); // ใช้ได้ครั้งเดียว
  } catch (e) { Logger.log('claimLoginHandoff error: ' + e); }

  if (!raw) {
    // ยังไม่มีผล = ยังล็อกอินไม่เสร็จ (ไม่ใช่ error) → ฝั่ง client ให้รอต่อ
    return ContentService.createTextOutput(JSON.stringify({ ok: false, pending: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  let payload;
  try { payload = JSON.parse(raw); } catch (e) { payload = null; }
  if (!payload || !payload.sessionToken) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, pending: true }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({
    ok: true, sessionToken: payload.sessionToken, staff: payload.staff,
  })).setMimeType(ContentService.MimeType.JSON);
}

// 'dev' = ตำแหน่งผู้ดูแลระบบ/คนพัฒนา — สิทธิ์ระดับเดียวกับ owner ทุกอย่าง
// ใช้ตัวนี้แทนการเทียบ role === 'owner' ตรง ๆ ทุกจุดที่เป็นการตรวจสิทธิ์
function isAdminRole_(role) { return role === 'owner' || role === 'dev'; }

// ══════════════════════════════════════════════════════════════════════════
//  เฟส 4 ของระบบล็อกอิน — ตัวตนที่ server ยืนยันเอง (ไม่เชื่อ actor จาก client)
// ══════════════════════════════════════════════════════════════════════════

// ชื่อ actor มาตรฐาน "ชื่อ (ตำแหน่ง)" — ต้องตรงกับ window._currentUser ฝั่ง frontend
// (applyStaffSession ใน app.jsx) เพื่อให้ audit log ก่อน/หลังเฟส 4 หน้าตาเหมือนกัน
function staffActorName_(s) {
  if (!s) return null;
  var name = s.displayName || s.lineDisplayName || "ไม่ระบุ";
  return name + " (" + (STAFF_ROLE_TH_[s.role] || s.role || "รอตำแหน่ง") + ")";
}

// เปิดโหมด "บังคับล็อกอิน" ด้วย Script Property REQUIRE_LOGIN='true'
// ⚠️ เปิดได้ต่อเมื่อพนักงานทุกคนล็อกอิน LINE ครบแล้ว (ดู lastLoginAt ในชีต "พนักงาน")
//    ไม่งั้นคนที่ยังไม่ได้ล็อกอินจะทำงานไม่ได้ทั้งร้าน
function requireLoginEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('REQUIRE_LOGIN') === 'true';
}

// ─── เปิด/ปิด REQUIRE_LOGIN ทีเดียว — เจ้าของรันเองใน GAS editor (เลือกชื่อนี้ในดรอปดาวน์ แล้วกด Run) ───
// enableRequireLogin เช็ค lastLoginAt ให้ก่อน — ถ้ามีพนักงาน active คนไหนยังไม่เคยล็อกอิน LINE
// จะไม่เปิดให้ (กันคนนั้นทำงานไม่ได้ทั้งร้านโดยไม่ทันรู้ตัว) ดูชื่อคนที่ยังไม่ล็อกอินได้ที่ Execution log
function enableRequireLogin() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const notLoggedIn = readStaffAll_(ss).filter(function (x) { return x.status === 'active' && !x.lastLoginAt; });
  if (notLoggedIn.length) {
    Logger.log("⚠️ ยังไม่เปิด — พนักงานต่อไปนี้ยังไม่เคยล็อกอิน LINE เลย: " +
      notLoggedIn.map(function (x) { return x.displayName || x.lineDisplayName || x.staffId; }).join(", "));
    Logger.log("   ให้รอคนกลุ่มนี้ล็อกอินก่อน หรือเปลี่ยนสถานะเป็น disabled ถ้าเลิกใช้แล้ว แล้วรันฟังก์ชันนี้ใหม่");
    return;
  }
  PropertiesService.getScriptProperties().setProperty('REQUIRE_LOGIN', 'true');
  Logger.log("✅ เปิด REQUIRE_LOGIN แล้ว — ทุก action ที่มีสิทธิ์กำหนดใน ROLE_ACTIONS_ บังคับล็อกอินทันที");
}
function disableRequireLogin() {
  PropertiesService.getScriptProperties().deleteProperty('REQUIRE_LOGIN');
  Logger.log("🔙 ปิด REQUIRE_LOGIN แล้ว — กลับไปโหมด rollout เดิม (บังคับเฉพาะ 7 action สำคัญที่กระทบเงิน/สต็อก)");
}

// action ที่ยกเว้น ไม่ต้องมี session (ล็อกอิน/สาธารณะ) — ตรวจก่อน gate ทุกครั้ง
var SESSION_EXEMPT_ACTIONS_ = {
  verifyPin: true, authLine: true, claimLoginHandoff: true, me: true, logout: true,
};

// สิทธิ์ฝั่ง server — ล้อ ROLE_TABS ใน app.jsx (frontend ซ่อนแท็บ ≠ กันคนยิง API ตรง)
// key = ชื่อ field/action ที่ doPost ใช้ตัดสินใจ · owner/dev ผ่านทุกอย่าง (isAdminRole_)
// ⚠️ ยังไม่บังคับใช้จนกว่า REQUIRE_LOGIN='true' — ดู canDoOrNull_ ด้านล่าง
// ⚠️ myAttendanceSummary ("เวลาของฉัน") ต้องอยู่ในทุก role — ปุ่มนี้อยู่ในแท็บ "ลงเวลา" ที่ทุก role
// มีเหมือนกัน (ดู AttendanceView ใน views-attendance.jsx) ลืมใส่ role ไหน = role นั้นเปิด "เวลาของฉัน"
// ไม่ได้ทันทีที่ REQUIRE_LOGIN='true' (เคยเกือบพลาดตอนเปิดจริง 2026-07-30 — myAttendanceSummary/
// attendanceToday ไม่เคยผ่าน canDoOrNull_ มาก่อนเพราะ REQUIRE_LOGIN ปิดอยู่ตลอด ไม่มีอะไรเตือน)
// action MTO ("mtojobs" tab) — ทุก role ที่มีแท็บนี้ทำได้เต็มสิทธิ์เหมือนกันหมด (เจ้าของยืนยันแล้ว
// 2026-07-30 — MtoJobView ไม่เคยเช็ค role เลย ปุ่มสร้าง/ปิดงานโชว์ให้ทุกคนเห็นอยู่แล้วแต่ก่อนหน้านี้
// ROLE_ACTIONS_ อนุญาตแค่ warehouse/employee เป็นช่องโหว่ที่เพิ่งเจอตอนเปิด REQUIRE_LOGIN จริง)
var MTO_JOB_ACTIONS_ = ["createMtoJob", "closeMtoJob", "saveMtoJobItems", "deleteMtoJob",
                         "assignMtoJob", "listActiveStaffNames", "deductMaterials"];

// ── action พื้นฐานที่ "ทุก role ที่ไม่ใช่ owner" ต้องทำได้ ──
// ทุก role มีแท็บ categories/stock/orders/tracking เหมือนกันหมด (ดู ROLE_TABS ใน app.jsx) และ
// view เหล่านั้นใช้ component ร่วมกัน (ProductCard/OrderModal/StockView) ซึ่งยิง action ชุดนี้ —
// ถ้า role ไหนขาดตัวใดตัวหนึ่ง = ปุ่มที่ UI โชว์อยู่กดแล้วขึ้น "ไม่มีสิทธิ์" ทันทีที่เปิด REQUIRE_LOGIN
//
// ⚠️ บทเรียน 2026-07-30: เปิด REQUIRE_LOGIN='true' ครั้งแรกแล้วทั้งร้านใช้งานไม่ได้ เพราะ
// ROLE_ACTIONS_ เดิมเขียนจาก "เดาว่า role นี้น่าจะทำอะไร" ไม่ได้ไล่จาก ROLE_TABS + view จริง
// เวลาเพิ่ม role หรือแท็บใหม่ ให้ไล่จาก ROLE_TABS → view → action ที่ view นั้นเรียกจริงเสมอ
var COMMON_ACTIONS_ = ["order", "updateOrderState", "transferStock", "transferStockBatch",
                        "confirmShipmentReceive", "updateFrontStore", "fetchProductImage",
                        "checkSkuExists", "updateLockData",
                        "punch", "myToday", "myAttendanceSummary",
                        // กระดิ่งแจ้งเตือนอยู่บนหัวจอทุกแท็บทุก role → ต้องอยู่ใน COMMON เสมอ
                        // (ลืมใส่ = role นั้นกดอ่านแจ้งเตือนไม่ได้ทันทีที่เปิด REQUIRE_LOGIN)
                        "markNotiRead",
                        // ⭐ ปุ่มดาว "สินค้าที่ฉันดูแล" — เป็นป้ายบอกว่าใครดูแล ไม่ใช่สิทธิ์ทำอะไร
                        // ทุกคนตั้ง/ถอดของตัวเองได้ (handler บังคับให้เขียนได้เฉพาะ staffId ของ session)
                        "setProductOwner"];

var ROLE_ACTIONS_ = {
  saler:      ["createSaleBill", "issueFullTaxInvoice", "lookupSaleBill", "searchContact",
               "getContactDetail", "createQuotation", "editQuotation", "saveQuotationDraft", "deleteQuotationDraft",
               "voidQuotation", "approveQuotation", "setQuoteSale", "getInvoiceNumber",
               ].concat(COMMON_ACTIONS_, MTO_JOB_ACTIONS_),
  // storedevice = บัญชี LINE กลางประจำเครื่อง/แท็บเล็ตร้าน — สิทธิ์ API เท่า saler ทุกอย่าง
  // + attendanceToday (ดู "ใครเข้างานวันนี้" — เหตุผลที่มี role นี้อยู่เลย ต้องเปิดให้)
  storedevice: ["createSaleBill", "issueFullTaxInvoice", "lookupSaleBill", "searchContact",
               "getContactDetail", "createQuotation", "editQuotation", "saveQuotationDraft", "deleteQuotationDraft",
               "voidQuotation", "approveQuotation", "setQuoteSale", "getInvoiceNumber", "attendanceToday",
               ].concat(COMMON_ACTIONS_, MTO_JOB_ACTIONS_),
  frontstore: ["recordUnscannedSale"].concat(COMMON_ACTIONS_, MTO_JOB_ACTIONS_),
  warehouse:  ["deductStock", "confirmStockCount", "deleteLockEntry", "addNewProduct",
               "addPurchaseIn", "zeroStock", "createStockCheck", "completeStockCheck",
               "deleteOrder", "deleteOrders",
               ].concat(COMMON_ACTIONS_, MTO_JOB_ACTIONS_),
  // employee มีแท็บ frontstore (FrontStoreView) ด้วย → ต้องมี recordUnscannedSale เหมือน frontstore
  employee:   ["deleteLockEntry", "deleteOrder", "deleteOrders", "confirmStockCount",
               "createStockCheck", "completeStockCheck", "recordUnscannedSale",
               ].concat(COMMON_ACTIONS_, MTO_JOB_ACTIONS_),
};

// ── action ที่กระทบเงิน/สต็อกจริง (ตัด/อนุมัติออเดอร์ขาย ZORT, ปรับสต็อกเป็น 0, ลบ order,
// ออกใบกำกับภาษี) — เดิม endpoint พวกนี้ไม่เคยเช็คสิทธิ์อะไรเลย จึงเช็ค "ทันที" ไม่รอเปิด
// REQUIRE_LOGIN เหมือน ROLE_ACTIONS_ ด้านบน (ของเดิมยังไม่บังคับ เผื่อพนักงานยังไม่ย้ายมาล็อกอิน
// LINE ครบ แต่ 7 action นี้เสี่ยงเกินกว่าจะรอ) — role ตรวจกับ UI จริงแล้ว ไม่ใช่ "owner อย่างเดียว"
// ตามที่ร่างแผนไว้ตอนแรก (saler อนุมัติ/ปิดใบเสนอราคาของตัวเองได้, warehouse/employee ยกเลิก-ปิด
// ออเดอร์ได้ — ตรงกับ ROLE_ACTIONS_ ด้านบนที่เพิ่งเติม deleteOrder/deleteOrders ให้ 2 role นี้)
//
// migration-safe (ไม่มี session → ปล่อยผ่านเหมือนเดิม) — มี caller จาก UI จริงวันนี้ deny ตอนไม่มี
// session จะพังงานประจำวันของคนที่ยังไม่ได้ล็อกอิน LINE
var IMMEDIATE_GATE_ACTIONS_ = {
  voidQuotation:       ["saler", "storedevice"],
  approveQuotation:    ["saler", "storedevice"],
  editQuotation:       ["saler", "storedevice"],
  issueFullTaxInvoice: ["saler", "storedevice"],
  deleteOrder:         ["employee", "warehouse"],
  deleteOrders:        ["employee", "warehouse"],
};
// deny-by-default เสมอ ไม่มี migration fallback — ไม่มี legitimate caller จาก UI เลยทั้งคู่
// (resetNegativeStock = admin tool ไม่มีปุ่มเรียก, zeroStock = ประกาศไว้แต่ยังไม่ได้ต่อปุ่ม)
var IMMEDIATE_GATE_STRICT_ACTIONS_ = {
  resetNegativeStock: [],
  zeroStock:           ["warehouse"],
};

// คืน null = ผ่าน · คืน response = ถูกปฏิเสธ
// ยังไม่มี session (REQUIRE_LOGIN ปิด) → ผ่านหมด เพื่อไม่ให้ของเดิมพังตอน rollout
// ยกเว้น IMMEDIATE_GATE_*_ACTIONS_ (ดู comment ด้านบน) ที่เช็คก่อนเสมอไม่รอ REQUIRE_LOGIN
function canDoOrNull_(sess, action) {
  if (!action || SESSION_EXEMPT_ACTIONS_[action]) return null;

  // หมายเหตุ: ไม่เช็ค sess.status ซ้ำ — resolveSession_ คืนค่าเฉพาะ session ที่ active อยู่แล้ว
  // (หมดอายุ/ถูก revoke = คืน null ไปตั้งแต่ต้นทาง) เช็คซ้ำที่นี่จะขัดกับ convention เดิม
  var strictRoles = IMMEDIATE_GATE_STRICT_ACTIONS_[action];
  if (strictRoles) {
    if (sess && (isAdminRole_(sess.role) || strictRoles.indexOf(sess.role) >= 0)) return null;
    return forbidden_("ไม่มีสิทธิ์ทำรายการนี้");
  }
  var immediateRoles = IMMEDIATE_GATE_ACTIONS_[action];
  if (immediateRoles) {
    if (!sess) return requireLoginEnabled_() ? forbidden_("ต้องล็อกอินก่อนใช้งาน") : null;
    if (isAdminRole_(sess.role) || immediateRoles.indexOf(sess.role) >= 0) return null;
    return forbidden_("ไม่มีสิทธิ์ทำรายการนี้");
  }

  if (!requireLoginEnabled_()) return null;          // โหมด rollout — action อื่นยังไม่บังคับ
  if (!sess) return forbidden_("ต้องล็อกอินก่อนใช้งาน");
  if (isAdminRole_(sess.role)) return null;          // owner/dev ผ่านทุกอย่าง
  var allowed = ROLE_ACTIONS_[sess.role];
  if (!allowed) return forbidden_("ตำแหน่ง '" + (sess.role || "-") + "' ยังไม่ได้กำหนดสิทธิ์");
  if (allowed.indexOf(action) < 0) return forbidden_("ตำแหน่ง '" + sess.role + "' ไม่มีสิทธิ์ทำ '" + action + "'");
  return null;
}

function forbidden_(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, forbidden: true, error: msg || "ไม่มีสิทธิ์" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// doPost แยกงานด้วย 2 แบบ: data.action === 'x' (ล็อกอิน/ลงเวลา) และ data.someFlag (สต็อก)
// รวมให้เหลือ "ชื่อ action" เดียวเพื่อเอาไปเช็คสิทธิ์ · ต้องอัปเดตลิสต์นี้เมื่อเพิ่ม dispatch ใหม่
// (ชื่อที่ไม่รู้จัก → คืน null = ไม่ถูกเช็คสิทธิ์ ไม่ใช่ block — กันของเดิมพังโดยไม่ตั้งใจ)
var POST_FLAG_ACTIONS_ = [
  "addNewProduct", "addPurchaseIn", "approveQuotation", "assignMtoJob", "checkSkuExists", "closeMtoJob",
  "completeStockCheck", "confirmShipmentReceive", "confirmStockCount", "createMtoJob",
  "createQuotation", "createSaleBill", "createStockCheck", "deductMaterials", "deductStock",
  "deleteLockEntry", "deleteMtoJob", "deleteOrder", "deleteOrders", "deleteQuotationDraft", "editQuotation",
  "fetchProductImage", "getContactDetail", "getInvoiceNumber", "issueFullTaxInvoice", "lookupSaleBill",
  "recordUnscannedSale", "resetNegativeStock", "saveMtoJobItems", "saveQuotationDraft",
  "saveThresholds", "searchContact", "setQuoteSale", "syncZortNow", "syncZortPurchasesNow",
  "syncZortSalesNow", "transferStock", "transferStockBatch", "updateFrontStore",
  "updateLockData", "updateOrderState", "voidQuotation", "zeroStock",
];

function resolvePostAction_(data) {
  if (!data) return null;
  if (data.action) return String(data.action);
  for (var i = 0; i < POST_FLAG_ACTIONS_.length; i++) {
    if (data[POST_FLAG_ACTIONS_[i]]) return POST_FLAG_ACTIONS_[i];
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════
//  เครื่องมือตั้งตำแหน่งจาก GAS editor (ไม่ต้องผ่านหน้าเว็บ)
//  ใช้ตอนที่ยัง "ไม่มีใครเป็น owner ที่ active" หรือคนที่จะตั้งยังเข้าเว็บไม่ได้
//  (ติดหน้า "รออนุมัติ") ซึ่งเป็นไก่กับไข่ — ต้องมี owner ถึงจะอนุมัติใครได้
//  ⚠️ ชื่อฟังก์ชันห้ามลงท้ายด้วย _ ไม่งั้นจะไม่โผล่ใน dropdown ของ GAS editor
// ══════════════════════════════════════════════════════════════════════════

// ① รันตัวนี้ก่อน เพื่อดูรายชื่อ + staffId ทั้งหมด (ดูผลที่เมนู "บันทึกการดำเนินการ")
function listStaffQuick() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const all = readStaffAll_(ss);
  if (!all.length) { Logger.log("ยังไม่มีพนักงานในระบบ — ให้ล็อกอินผ่านเว็บ 1 ครั้งก่อน"); return; }
  all.forEach(function (s) {
    Logger.log("%s | ชื่อในระบบ: %s | ชื่อ LINE: %s | ตำแหน่ง: %s | สถานะ: %s",
      s.staffId, s.displayName || "-", s.lineDisplayName || "-", s.role || "(ยังไม่ตั้ง)", s.status);
  });
}

// ② แก้ค่าใน 2 บรรทัดล่างให้ตรงกับคนที่ต้องการ แล้วกดรันตัวนี้
//    TARGET ใส่ staffId (เช่น "ST0001") หรือชื่อ LINE ก็ได้ · ROLE = dev/owner/saler/warehouse/frontstore/employee
function grantRoleQuick() {
  const TARGET = "ST0001";   // ← เปลี่ยนเป็น staffId หรือชื่อ LINE ของคนที่จะตั้ง
  const ROLE   = "dev";      // ← ตำแหน่งที่ต้องการ
  Logger.log(setStaffRoleDirect_(TARGET, ROLE));
}

// ตั้งตำแหน่ง + เปิดใช้งานให้เลย (ข้ามขั้นรออนุมัติ) — ใช้ได้จาก GAS editor เท่านั้น
// ไม่มี endpoint ไหนเรียกถึง จึงไม่เปิดช่องให้ยกระดับสิทธิ์จากภายนอก
function setStaffRoleDirect_(staffIdOrLineName, role) {
  const VALID = ["owner", "dev", "saler", "warehouse", "frontstore", "employee"];
  if (VALID.indexOf(role) < 0) return "❌ ตำแหน่งไม่ถูกต้อง: " + role + " (ต้องเป็น " + VALID.join("/") + ")";
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = staffSheet_(ss);
  const all = readStaffAll_(ss);
  const key = String(staffIdOrLineName || "").trim().toLowerCase();
  let hit = -1;
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (String(s.staffId).toLowerCase() === key ||
        String(s.lineDisplayName || "").trim().toLowerCase() === key ||
        String(s.displayName || "").trim().toLowerCase() === key) { hit = i; break; }
  }
  if (hit < 0) return "❌ ไม่พบพนักงานชื่อ/รหัส \"" + staffIdOrLineName + "\" — รัน listStaffQuick() ดูรายชื่อก่อน";
  const rowIdx = hit + 2;                     // +1 ข้าม header, +1 เพราะ getRange เป็น 1-indexed
  sh.getRange(rowIdx, 6).setValue(role);      // col F = role
  sh.getRange(rowIdx, 7).setValue("active");  // col G = status
  try { writeAuditLog_("GAS editor", "ตั้งตำแหน่งพนักงาน (จาก script)", all[hit].staffId, role); } catch (e) {}
  return "✅ ตั้ง " + (all[hit].displayName || all[hit].lineDisplayName || all[hit].staffId) +
         " เป็น \"" + role + "\" + เปิดใช้งานแล้ว — กลับไปที่เว็บแล้วกดรีเฟรช/เข้าใหม่";
}

// ─── action=listActiveStaffNames : รายชื่อพนักงาน active แบบย่อ (staffId+name เท่านั้น) ───
// ต่างจาก listStaff (owner/dev เท่านั้น เห็นข้อมูลเต็ม) — อันนี้ทุก role ที่ล็อกอินแล้วเรียกได้
// เพราะไม่มี field อ่อนไหว (ไม่มี lastLoginAt/note/pictureUrl) ใช้เติมดรอปดาวน์เลือกผู้รับผิดชอบ
// งาน MTO (assignMtoJob) ที่ไม่ใช่ owner/dev ก็ต้องมองเห็นเพื่อนร่วมงานให้เลือกได้
function listActiveStaffNamesHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || s.status !== 'active') return unauthorized_();
  const all = readStaffAll_(ss).filter(function (x) { return x.status === 'active'; });
  return ok(all.map(function (x) { return { staffId: x.staffId, name: x.displayName || x.lineDisplayName || x.staffId }; }));
}

function listStaffHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || !isAdminRole_(s.role) || s.status !== 'active') return unauthorized_();
  const all = readStaffAll_(ss);
  return ok(all.map(function (x) {
    return {
      staffId: x.staffId, provider: x.provider, displayName: x.displayName, lineDisplayName: x.lineDisplayName,
      role: x.role, status: x.status, pictureUrl: x.pictureUrl, createdAt: x.createdAt, lastLoginAt: x.lastLoginAt, note: x.note,
    };
  }));
}

function saveStaffHandler_(ss, data, actor) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || !isAdminRole_(s.role) || s.status !== 'active') return unauthorized_();
  const sh = staffSheet_(ss);
  const rowIdx = findStaffRowById_(sh, data.staffId);
  if (rowIdx < 0) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "ไม่พบพนักงาน" })).setMimeType(ContentService.MimeType.JSON);
  }
  const beforeObj = staffRowToObj_(sh.getRange(rowIdx, 1, 1, 11).getValues()[0]);
  const VALID_ROLES = ["owner", "dev", "saler", "warehouse", "frontstore", "employee", "storedevice"];
  const VALID_STATUS = ["pending", "active", "disabled"];

  // กันล็อกตัวเองออก: ถ้าเจ้าของถอดสิทธิ์/ระงับตัวเองแล้วไม่เหลือ owner ที่ active เลย
  // จะไม่มีใครอนุมัติใครได้อีกตลอดไป (ต้องไปแก้ในชีตเองเท่านั้น) → บล็อกไว้ก่อน
  const losingOwner = (VALID_ROLES.indexOf(data.role) >= 0 && data.role !== 'owner' && beforeObj.role === 'owner')
                   || (VALID_STATUS.indexOf(data.status) >= 0 && data.status !== 'active' && beforeObj.role === 'owner');
  if (losingOwner) {
    const activeOwners = readStaffAll_(ss).filter(function (x) {
      return x.role === 'owner' && x.status === 'active' && x.staffId !== data.staffId;
    });
    if (activeOwners.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, error: "ทำไม่ได้ — นี่คือเจ้าของคนเดียวที่ใช้งานอยู่ ถ้าถอดสิทธิ์จะไม่มีใครอนุมัติพนักงานได้อีก (ตั้งเจ้าของอีกคนก่อน)",
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (typeof data.displayName === 'string' && data.displayName.trim()) sh.getRange(rowIdx, 4).setValue(data.displayName.trim().slice(0, 100));
  if (VALID_ROLES.indexOf(data.role) >= 0) sh.getRange(rowIdx, 6).setValue(data.role);
  if (VALID_STATUS.indexOf(data.status) >= 0) sh.getRange(rowIdx, 7).setValue(data.status);
  if (typeof data.note === 'string') sh.getRange(rowIdx, 11).setValue(data.note.slice(0, 300));
  // actor มาจาก data.actor ที่ StaffView ไม่ได้ส่ง → ใช้ชื่อจาก session ที่ตรวจแล้วแทน (เชื่อถือได้กว่า)
  const who = (s.displayName || s.lineDisplayName || actor || "ไม่ระบุ") + " (เจ้าของ)";
  writeAuditLog_(who, "แก้ไขพนักงาน", data.staffId, auditDetail_({ before: beforeObj, after: data }));
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// ระบบลงเวลาเข้า-ออกงาน (เฟส A) — ชีต "ลงเวลา" / "จุดลงเวลา" / "ตั้งค่ากะ"
// ดูแผนเต็มที่ docs/PLAN-ATTENDANCE.md
// ═══════════════════════════════════════════════════════════
const ATT_TYPES = ["in", "breakStart", "breakEnd", "bathroomStart", "bathroomEnd", "out"];
const ATT_TYPE_TH = {
  in: "เข้างาน", breakStart: "เริ่มพัก", breakEnd: "กลับจากพัก",
  bathroomStart: "ไปห้องน้ำ", bathroomEnd: "กลับจากห้องน้ำ", out: "ออกงาน",
};

// ค่าเริ่มต้นที่เจ้าของยืนยันแล้ว (2026-07-29) — seed ลงชีตครั้งแรก แก้ในชีตได้เองภายหลัง
const ATT_SITES_SEED = [
  ["FS", "หน้าร้าน (ดูเหมือนจริง)", 13.801321, 100.551213, 150],
  ["WH", "คลังสินค้าสาย 5",         13.783555, 100.295249, 200],
];
// วันในสัปดาห์: 0=อาทิตย์ 1=จันทร์ … 6=เสาร์ (ตรงกับ Date.getDay())
// หน้าร้านวันจันทร์ไม่ได้ระบุมา → ไม่ใส่แถว = "ไม่มีกะ" (ลงเวลาได้ปกติ แต่ไม่คิดสาย)
const ATT_SHIFTS_SEED = [
  ["warehouse",  "0,1,2,3,4,5,6", "08:30", "17:30", "คลังสินค้า"],
  ["frontstore", "2,3,4",         "09:30", "17:30", "หน้าร้าน อังคาร-พฤหัส"],
  ["frontstore", "5,6,0",         "09:00", "18:00", "หน้าร้าน ศุกร์-อาทิตย์"],
];

function attendanceSheet_(ss) {
  return getOrCreateSheet_(ss, SHEET_ATTENDANCE, [
    "id", "staffId", "ชื่อ", "วันที่", "เวลา", "serverTs", "clientTs", "ประเภท",
    "lat", "lng", "accuracy(ม.)", "ระยะห่าง(ม.)", "จุดใกล้สุด", "ในพื้นที่", "รูป", "ที่มา", "หมายเหตุ",
  ]);
}

function attSitesSheet_(ss) {
  const existed = !!ss.getSheetByName(SHEET_ATT_SITES);
  const sh = getOrCreateSheet_(ss, SHEET_ATT_SITES, ["code", "ชื่อจุด", "lat", "lng", "รัศมี(ม.)"]);
  if (!existed) ATT_SITES_SEED.forEach(function (r) { sh.appendRow(r); });
  return sh;
}

function attShiftsSheet_(ss) {
  const existed = !!ss.getSheetByName(SHEET_ATT_SHIFTS);
  const sh = getOrCreateSheet_(ss, SHEET_ATT_SHIFTS, ["ตำแหน่ง", "วัน(0=อา..6=ส)", "เริ่ม", "เลิก", "ชื่อกะ"]);
  if (!existed) ATT_SHIFTS_SEED.forEach(function (r) { sh.appendRow(r); });
  return sh;
}

function readAttSites_(ss) {
  const sh = attSitesSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter(function (r) { return r[0] && isFinite(Number(r[2])) && isFinite(Number(r[3])); })
    .map(function (r) {
      return { code: String(r[0]), name: String(r[1] || r[0]), lat: Number(r[2]), lng: Number(r[3]), radiusM: Number(r[4]) || 150 };
    });
}

function readAttShifts_(ss) {
  const sh = attShiftsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues()
    .filter(function (r) { return r[0] && r[2] && r[3]; })
    .map(function (r) {
      return {
        role: String(r[0]).trim(),
        days: String(r[1] || "").split(",").map(function (d) { return parseInt(String(d).trim(), 10); }).filter(function (d) { return !isNaN(d); }),
        start: attParseHm_(r[2]),
        end: attParseHm_(r[3]),
        name: String(r[4] || ""),
      };
    });
}

// รับได้ทั้ง "08:30" (string) และค่าเวลาที่ Sheets แปลงเป็น Date อัตโนมัติ → คืนนาทีนับจากเที่ยงคืน
function attParseHm_(v) {
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function attFmtHm_(min) {
  if (min == null) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// ระยะทางระหว่าง 2 พิกัด (เมตร) — Haversine
function haversineM_(lat1, lng1, lat2, lng2) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// หาจุดลงเวลาที่ใกล้ที่สุด — คืน null ถ้าไม่มีพิกัด (ผู้ใช้ไม่อนุญาต GPS)
function nearestAttSite_(sites, lat, lng) {
  if (!sites.length || !isFinite(lat) || !isFinite(lng)) return null;
  let best = null;
  sites.forEach(function (s) {
    const d = haversineM_(lat, lng, s.lat, s.lng);
    if (!best || d < best.distM) best = { site: s, distM: d, inArea: d <= s.radiusM };
  });
  return best;
}

function attDateKey_(d) { return Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd"); }
// วันในสัปดาห์ตามเวลาไทย (0=อาทิตย์ … 6=เสาร์)
// คำนวณจาก yyyy-MM-dd ที่ format เป็นเวลาไทยแล้ว (ไม่พึ่ง pattern "u"/"E" ของ SimpleDateFormat
// ที่ผลลัพธ์ต่างกันตาม locale ของสคริปต์) — ค่านี้ใช้เลือกกะ ผิดวันเดียวก็คิดสายผิดทั้งวัน
function attDowBkk_(d) {
  const p = attDateKey_(d).split("-");
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
}
// เหมือน attDowBkk_ แต่รับ "yyyy-MM-dd" ตรง ๆ — ใช้ตอนดูวันในอดีต/เดือนอื่น ไม่ใช่วันนี้
function attDowOfDateStr_(dateStr) {
  const p = String(dateStr).split("-");
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]))).getUTCDay();
}
function attTimeStr_(d) { return Utilities.formatDate(d, "Asia/Bangkok", "HH:mm:ss"); }
function attMinOfDay_(d) {
  return parseInt(Utilities.formatDate(d, "Asia/Bangkok", "H"), 10) * 60 +
         parseInt(Utilities.formatDate(d, "Asia/Bangkok", "m"), 10);
}

// อ่านเหตุการณ์ลงเวลาของ "คนเดียว วันเดียว" — เรียงตามเวลา
// ⚠️ อ่านชีตลงเวลา **ทั้งใบ** แล้วค่อยกรองใน JS เหลือคนเดียววันเดียว
// ชีตโตขึ้น 1 แถวต่อการกดปุ่ม 1 ครั้ง (~2 หมื่นแถว/ปี) → ต้นทุนตรงนี้โตตามไปเรื่อย ๆ
// โดยไม่มีอะไรเตือน และมันอยู่บนเส้นทาง "พนักงานกดลงเวลา" ซึ่งต้องเร็วที่สุด
//
// **ยังไม่แก้ในรอบนี้โดยตั้งใจ** — วิธีที่นึกออกทันทีคือ "ไล่จากล่างขึ้นบนแล้วหยุดเมื่อเจอวันเก่ากว่า"
// ซึ่ง **ไม่ปลอดภัย** ด้วยเหตุผลที่ยืนยันจากโค้ดจริง 2 ข้อ:
//   1. `fixAttendanceHandler_` op="add" ใช้ `appendRow` → แถว**ย้อนหลัง**ไปอยู่**ล่างสุด**
//      (เจ้าของแก้เวลาให้พนักงานเมื่อวาน = แถววันเก่าโผล่ท้ายสุด) → ไล่จากล่างจะหยุดทันที
//      แล้ว**ตกแถวของวันนี้ที่อยู่เหนือขึ้นไป** = ชั่วโมงทำงานหาย โดยไม่มี error ให้เห็น
//   2. op="delete" ใช้ `deleteRow` → ลำดับมีช่องโหว่ ไม่ใช่ append-only ล้วน
// ข้อมูลนี้ใช้คิดชั่วโมงทำงานจริง เดาผิดแล้วเงียบ = แย่กว่าช้า
//
// จึง**วัดก่อน**: log ขนาด+เวลาไว้ดูที่ Executions ว่าตอนนี้แพงจริงแค่ไหน
// แล้วค่อยเลือกวิธี (index แยก / TextFinder / ชีตรายเดือน) ตามตัวเลขจริง
function readAttEvents_(ss, staffId, dateStr) {
  const _t0 = Date.now();
  const sh = attendanceSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const vals = sh.getRange(2, 1, last - 1, 17).getValues();
  try {
    // log เฉพาะตอนที่เริ่มแพงจริง — ไม่งั้นทุกการกดปุ่มเขียน log เปล่า ๆ กลบของสำคัญ
    if (vals.length >= 3000 || (Date.now() - _t0) >= 1000) {
      Logger.log('[perf] readAttEvents_ ' + vals.length + ' แถว · ' + (Date.now() - _t0) + 'ms'
               + ' (กรองเหลือ staff=' + staffId + ' date=' + dateStr + ')');
    }
  } catch (e) {}
  const out = [];
  for (let i = 0; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[1]) !== String(staffId)) continue;
    if (String(r[3]) !== String(dateStr)) continue;
    out.push({
      id: r[0], staffId: r[1], name: r[2], date: r[3], time: r[4],
      serverTs: Number(r[5]) || 0, type: r[7],
      lat: r[8], lng: r[9], accuracy: r[10], distM: r[11], siteName: r[12],
      inArea: r[13] === true || r[13] === "TRUE", photo: r[14], note: r[16],
    });
  }
  out.sort(function (a, b) { return a.serverTs - b.serverTs; });
  return out;
}

// ปุ่มไหนกดได้ต่อจากสถานะปัจจุบัน (กันกดผิดลำดับ เช่นกดออกงานทั้งที่ยังไม่เข้างาน)
// พัก/ห้องน้ำ เป็นคนละสถานะกัน ทำพร้อมกันไม่ได้ (ต้องกลับจากอันหนึ่งก่อนเริ่มอีกอันได้) —
// "ออกงาน" ยังกดได้เสมอแม้อยู่กลางพัก/ห้องน้ำ (เผื่อลืมกดกลับแล้วต้องรีบกลับบ้าน — attSummarize_ ดักไว้)
function attAllowedNext_(events) {
  const types = events.map(function (e) { return e.type; });
  const lastType = types.length ? types[types.length - 1] : null;
  if (!lastType) return ["in"];
  if (lastType === "in" || lastType === "breakEnd" || lastType === "bathroomEnd") return ["breakStart", "bathroomStart", "out"];
  if (lastType === "breakStart") return ["breakEnd", "out"];
  if (lastType === "bathroomStart") return ["bathroomEnd", "out"];
  return []; // out แล้ว = จบวัน
}

// สรุปของวัน: เข้า/ออก/พักกี่นาที/ห้องน้ำกี่นาที/ทำงานกี่นาที/สายกี่นาที + ธงเตือน
// หมายเหตุ: เวลาห้องน้ำ "ไม่หัก" ออกจากชั่วโมงทำงาน (ต่างจากพักที่หัก) — ตามธรรมเนียมทั่วไปที่ห้องน้ำ
// เป็นเรื่องจำเป็นระหว่างงาน ไม่ใช่พักยาว ถ้าเจ้าของอยากให้หักด้วยเปลี่ยนสูตร workedMin บรรทัดเดียวได้เลย
function attSummarize_(events, shift) {
  const firstIn = events.find(function (e) { return e.type === "in"; }) || null;
  let lastOut = null;
  for (let i = events.length - 1; i >= 0; i--) { if (events[i].type === "out") { lastOut = events[i]; break; } }

  // พัก: จับคู่ breakStart→breakEnd · ถ้าลืมกดกลับจากพักแล้วกดออกงานเลย นับถึงเวลาออกงาน + ตั้งธง
  let breakMin = 0, openBreak = null, forgotBreakEnd = false;
  let bathroomMin = 0, openBathroom = null, forgotBathroomEnd = false;
  events.forEach(function (e) {
    if (e.type === "breakStart") openBreak = e;
    else if (e.type === "breakEnd" && openBreak) { breakMin += Math.round((e.serverTs - openBreak.serverTs) / 60000); openBreak = null; }
    else if (e.type === "bathroomStart") openBathroom = e;
    else if (e.type === "bathroomEnd" && openBathroom) { bathroomMin += Math.round((e.serverTs - openBathroom.serverTs) / 60000); openBathroom = null; }
  });
  if (openBreak) {
    forgotBreakEnd = true;
    if (lastOut) breakMin += Math.round((lastOut.serverTs - openBreak.serverTs) / 60000);
  }
  if (openBathroom) {
    forgotBathroomEnd = true;
    if (lastOut) bathroomMin += Math.round((lastOut.serverTs - openBathroom.serverTs) / 60000);
  }

  const workedMin = (firstIn && lastOut) ? Math.max(0, Math.round((lastOut.serverTs - firstIn.serverTs) / 60000) - breakMin) : null;

  // สาย: ไม่มีผ่อนผัน — เลยเวลาเริ่มกะถือว่าสาย และบันทึกว่าสายกี่นาที (ตามที่เจ้าของกำหนด)
  let lateMin = null;
  if (firstIn && shift && shift.start != null) {
    const inMin = attMinOfDay_(new Date(firstIn.serverTs));
    lateMin = Math.max(0, inMin - shift.start);
  }

  return {
    inTime: firstIn ? firstIn.time : null,
    outTime: lastOut ? lastOut.time : null,
    breakMin: breakMin,
    bathroomMin: bathroomMin,
    workedMin: workedMin,
    lateMin: lateMin,
    onBreak: !!(openBreak && !lastOut),
    onBathroom: !!(openBathroom && !lastOut),
    forgotBreakEnd: forgotBreakEnd,
    forgotBathroomEnd: forgotBathroomEnd,
    outsideArea: events.some(function (e) { return e.lat !== "" && e.lat != null && !e.inArea; }),
  };
}

function attShiftFor_(shifts, role, dayOfWeek) {
  return shifts.find(function (s) { return s.role === role && s.days.indexOf(dayOfWeek) >= 0; }) || null;
}

// เก็บรูปลง Drive (โฟลเดอร์ "ลงเวลา DMJ") — ไม่แชร์สาธารณะ ดูผ่าน attendancePhoto proxy เท่านั้น
function saveAttPhoto_(base64, staffName, dateStr, typeTh) {
  if (!base64) return "";
  try {
    const props = PropertiesService.getScriptProperties();
    let folderId = props.getProperty("ATT_PHOTO_FOLDER_ID");
    let folder = null;
    if (folderId) { try { folder = DriveApp.getFolderById(folderId); } catch (e) { folder = null; } }
    if (!folder) { folder = DriveApp.createFolder("ลงเวลา DMJ"); props.setProperty("ATT_PHOTO_FOLDER_ID", folder.getId()); }
    const clean = String(base64).replace(/^data:image\/\w+;base64,/, "");
    const blob = Utilities.newBlob(Utilities.base64Decode(clean), "image/jpeg",
      dateStr + "_" + (staffName || "staff") + "_" + typeTh + ".jpg");
    return folder.createFile(blob).getId();
  } catch (e) {
    Logger.log("saveAttPhoto_ error: " + e);
    return ""; // รูปพังไม่ควรทำให้ลงเวลาไม่ได้
  }
}

// ─── action=punch : กดปุ่มลงเวลา ───
function punchHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || s.status !== "active") return unauthorized_();

  const type = String(data.type || "");
  if (ATT_TYPES.indexOf(type) < 0) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "ประเภทการลงเวลาไม่ถูกต้อง" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lock = LockService.getScriptLock();
  try {
    // กันกดรัว/กดพร้อมกัน 2 เครื่องแล้วได้ 2 แถว
    try { lock.waitLock(10000); } catch (e) {}

    const now = new Date();
    const dateStr = attDateKey_(now);
    const events = readAttEvents_(ss, s.staffId, dateStr);

    const allowed = attAllowedNext_(events);
    if (allowed.indexOf(type) < 0) {
      const lastTh = events.length ? ATT_TYPE_TH[events[events.length - 1].type] : "ยังไม่ได้ลงเวลา";
      return ContentService.createTextOutput(JSON.stringify({
        success: false, error: "กดไม่ได้ตอนนี้ — สถานะล่าสุดคือ \"" + lastTh + "\"", allowed: allowed,
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const lat = (data.lat === "" || data.lat == null) ? null : Number(data.lat);
    const lng = (data.lng === "" || data.lng == null) ? null : Number(data.lng);
    const near = nearestAttSite_(readAttSites_(ss), lat, lng);

    const photoId = saveAttPhoto_(data.photoBase64, s.displayName || s.lineDisplayName, dateStr, ATT_TYPE_TH[type]);

    const sh = attendanceSheet_(ss);
    const id = attNextId_(sh, dateStr);
    // วันที่/เวลาเขียนเป็น text — กัน Sheets แปลงรูปแบบเอง (บทเรียนข้อ 2 ใน CLAUDE.md)
    sh.appendRow([
      id, s.staffId, s.displayName || s.lineDisplayName, dateStr, attTimeStr_(now),
      now.getTime(), Number(data.clientTs) || "", type,
      lat == null ? "" : lat, lng == null ? "" : lng, data.accuracy == null ? "" : Math.round(Number(data.accuracy)),
      near ? near.distM : "", near ? near.site.name : "", near ? near.inArea : "",
      photoId, data.source || "web", data.note || "",
    ]);
    try { sh.getRange(sh.getLastRow(), 4, 1, 2).setNumberFormat("@"); } catch (e) {}

    const events2 = events.concat([{
      type: type, time: attTimeStr_(now), serverTs: now.getTime(),
      lat: lat, inArea: near ? near.inArea : true, photo: photoId,
    }]);
    const shifts = readAttShifts_(ss);
    const shift = attShiftFor_(shifts, s.role, attDowBkk_(now));

    writeAuditLog_((s.displayName || s.lineDisplayName) + " (" + (STAFF_ROLE_TH_[s.role] || s.role) + ")",
      "ลงเวลา", ATT_TYPE_TH[type],
      auditDetail_({ time: attTimeStr_(now), distM: near ? near.distM : null, inArea: near ? near.inArea : null }));

    return ok({
      punched: ATT_TYPE_TH[type],
      distM: near ? near.distM : null,
      siteName: near ? near.site.name : null,
      inArea: near ? near.inArea : null,
      today: attTodayPayload_(events2, shift),
    });
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function attTodayPayload_(events, shift) {
  return {
    events: events.map(function (e) { return { type: e.type, typeTh: ATT_TYPE_TH[e.type], time: e.time, inArea: e.inArea, hasPhoto: !!e.photo }; }),
    allowed: attAllowedNext_(events),
    summary: attSummarize_(events, shift),
    shift: shift ? { name: shift.name, start: attFmtHm_(shift.start), end: attFmtHm_(shift.end) } : null,
  };
}

// ─── action=myToday : สถานะลงเวลาวันนี้ของตัวเอง (ใช้เปิดหน้าจอ) ───
function myTodayHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || s.status !== "active") return unauthorized_();
  const now = new Date();
  const events = readAttEvents_(ss, s.staffId, attDateKey_(now));
  const shift = attShiftFor_(readAttShifts_(ss), s.role, attDowBkk_(now));
  const payload = attTodayPayload_(events, shift);
  payload.sites = readAttSites_(ss).map(function (x) { return { name: x.name, lat: x.lat, lng: x.lng, radiusM: x.radiusM }; });
  payload.staffName = s.displayName || s.lineDisplayName;
  payload.serverDate = attDateKey_(now);
  return ok(payload);
}

// ─── action=myAttendanceSummary : "เวลาของฉัน" — สรุปเดือนนี้ของตัวเอง (ทุก role) ───
// เฟส B: ให้พนักงานเช็คชั่วโมง/สาย/ขาดของตัวเองได้เอง ก่อนที่เจ้าของจะเอาไปใช้ที่ไหน
// (เรื่องความไว้ใจ — เห็นตัวเลขเดียวกับที่เจ้าของเห็น ไม่ใช่รู้ทีหลังว่าโดนนับว่าสาย)
//
// range = วันที่ 1 ถึง "วันสุดท้ายของเดือน" หรือ "เมื่อวาน" ถ้าเป็นเดือนปัจจุบัน (ไม่โชว์วันอนาคต)
function attMonthRange_(monthStr) {
  const now = new Date();
  const curMonth = attDateKey_(now).slice(0, 7);
  const m = /^\d{4}-\d{2}$/.test(monthStr) ? monthStr : curMonth;
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lastDay = (m === curMonth) ? Number(attDateKey_(now).slice(8, 10)) : daysInMonth;
  const dates = [];
  for (let d = 1; d <= lastDay; d++) dates.push(m + "-" + String(d).padStart(2, "0"));
  return { month: m, dates: dates, isCurrentMonth: m === curMonth };
}

function myAttendanceSummaryHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || s.status !== "active") return unauthorized_();

  const range = attMonthRange_(String(data.month || ""));
  const todayStr = attDateKey_(new Date());
  const shifts = readAttShifts_(ss);

  // อ่านชีตครั้งเดียว กรองเฉพาะของคนนี้+เดือนนี้ แล้วจัดกลุ่มตามวันที่
  const sh = attendanceSheet_(ss);
  const last = sh.getLastRow();
  const byDate = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 17).getValues().forEach(function (r) {
      if (String(r[1]) !== String(s.staffId)) return;
      const d = attRowDateStr_(r[3]);
      if (d.slice(0, 7) !== range.month) return;
      (byDate[d] = byDate[d] || []).push({ type: r[7], time: r[4], serverTs: Number(r[5]) || 0 });
    });
  }

  let workedMin = 0, daysWorked = 0, lateDays = 0, lateMin = 0, daysAbsent = 0;
  const days = range.dates.map(function (dateStr) {
    const shift = attShiftFor_(shifts, s.role, attDowOfDateStr_(dateStr));
    const evs = (byDate[dateStr] || []).sort(function (a, b) { return a.serverTs - b.serverTs; });
    const sum = attSummarize_(evs, shift);
    const isPast = dateStr < todayStr;

    if (sum.workedMin != null) { workedMin += sum.workedMin; daysWorked++; }
    if (sum.lateMin) { lateDays++; lateMin += sum.lateMin; }
    // ขาดนับเฉพาะวันที่ผ่านไปแล้วจริง — วันนี้ยังไม่กดเข้างานไม่ใช่ "ขาด" (อาจจะยังไม่ถึงกะ)
    if (isPast && shift && !sum.inTime) daysAbsent++;

    return {
      date: dateStr, dow: attDowOfDateStr_(dateStr), isToday: dateStr === todayStr, isPast: isPast,
      shift: shift ? { name: shift.name, start: attFmtHm_(shift.start), end: attFmtHm_(shift.end) } : null,
      inTime: sum.inTime, outTime: sum.outTime, workedMin: sum.workedMin, breakMin: sum.breakMin,
      bathroomMin: sum.bathroomMin,
      lateMin: sum.lateMin, forgotBreakEnd: sum.forgotBreakEnd, forgotBathroomEnd: sum.forgotBathroomEnd,
    };
  });

  return ok({
    month: range.month, isCurrentMonth: range.isCurrentMonth,
    staffName: s.displayName || s.lineDisplayName,
    days: days,
    totals: { workedMin: workedMin, daysWorked: daysWorked, lateDays: lateDays, lateMin: lateMin, daysAbsent: daysAbsent },
  });
}

// ─── action=attendanceToday : ใครเข้างานบ้างวันนี้ (owner/dev + storedevice ดูอย่างเดียว) ───
function attendanceTodayHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || !(isAdminRole_(s.role) || s.role === "storedevice") || s.status !== "active") return unauthorized_();
  const now = new Date();
  const dateStr = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : attDateKey_(now);
  // dow ต้องมาจาก "วันที่ที่กำลังดู" ไม่ใช่วันนี้ — ไม่งั้นย้อนดูวันอื่นแล้วเทียบกับกะผิดวัน
  const dow = attDowOfDateStr_(dateStr);
  const shifts = readAttShifts_(ss);

  const sh = attendanceSheet_(ss);
  const last = sh.getLastRow();
  const byStaff = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 17).getValues().forEach(function (r) {
      if (String(r[3]) !== dateStr) return;
      const sid = String(r[1]);
      if (!byStaff[sid]) byStaff[sid] = { staffId: sid, name: r[2], events: [] };
      byStaff[sid].events.push({
        id: r[0], type: r[7], time: r[4], serverTs: Number(r[5]) || 0,
        lat: r[8], distM: r[11], siteName: r[12],
        inArea: r[13] === true || r[13] === "TRUE", photo: r[14],
        source: r[15], note: r[16],
      });
    });
  }

  const staffAll = readStaffAll_(ss).filter(function (x) { return x.status === "active"; });
  const rows = staffAll.map(function (st) {
    const rec = byStaff[st.staffId];
    const evs = rec ? rec.events.sort(function (a, b) { return a.serverTs - b.serverTs; }) : [];
    const shift = attShiftFor_(shifts, st.role, dow);
    const sum = attSummarize_(evs, shift);
    const lastType = evs.length ? evs[evs.length - 1].type : null;
    return {
      staffId: st.staffId, name: st.displayName || st.lineDisplayName, role: st.role,
      pictureUrl: st.pictureUrl,
      state: !lastType ? "ยังไม่มา" : (lastType === "out" ? "ออกงานแล้ว" : (sum.onBreak ? "พักอยู่" : (sum.onBathroom ? "ไปห้องน้ำ" : "ทำงานอยู่"))),
      shift: shift ? { name: shift.name, start: attFmtHm_(shift.start), end: attFmtHm_(shift.end) } : null,
      summary: sum,
      events: evs.map(function (e) {
        return {
          id: e.id, type: e.type, typeTh: ATT_TYPE_TH[e.type], time: e.time,
          distM: e.distM, siteName: e.siteName, inArea: e.inArea, photo: e.photo,
          fixed: String(e.source || "") === ATT_SOURCE_FIX, note: e.note,   // โชว์ว่าแถวนี้เจ้าของแก้เอง ไม่ใช่พนักงานกดจริง
        };
      }),
    };
  });
  return ok({ date: dateStr, rows: rows });
}

// ─── action=attendanceMonthlySummary : สรุปลงเวลาทั้งเดือน ทุกคนพร้อมกัน (owner/dev เท่านั้น) ───
// เฟส C1: ให้เจ้าของเห็นภาพรวมทั้งเดือนทีเดียว ("เดือน × คน") ไม่ต้องไล่ดูทีละคนทีละวัน
// เหมือน myAttendanceSummaryHandler_ แต่รวมทุกคนแทนที่จะกรองแค่ staffId เดียว
// ไม่เปิดให้ storedevice เห็น (ต่างจาก attendanceToday) — ตัวเลขรวมทั้งเดือนใกล้เคียงข้อมูลเงินเดือน
function attendanceMonthlySummaryHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || !isAdminRole_(s.role) || s.status !== 'active') return unauthorized_();

  const range = attMonthRange_(String(data.month || ''));
  const shifts = readAttShifts_(ss);
  const todayStr = attDateKey_(new Date());

  const sh = attendanceSheet_(ss);
  const last = sh.getLastRow();
  const byStaffDate = {}; // staffId -> { dateStr -> events[] }
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 17).getValues().forEach(function (r) {
      const d = attRowDateStr_(r[3]);
      if (d.slice(0, 7) !== range.month) return;
      const sid = String(r[1]);
      const byDate = byStaffDate[sid] || (byStaffDate[sid] = {});
      (byDate[d] = byDate[d] || []).push({ type: r[7], time: r[4], serverTs: Number(r[5]) || 0 });
    });
  }

  const staffAll = readStaffAll_(ss).filter(function (x) { return x.status === 'active'; });
  const rows = staffAll.map(function (st) {
    const byDate = byStaffDate[st.staffId] || {};
    let workedMin = 0, daysWorked = 0, lateDays = 0, lateMin = 0, daysAbsent = 0, breakMin = 0, bathroomMin = 0;
    range.dates.forEach(function (dateStr) {
      const shift = attShiftFor_(shifts, st.role, attDowOfDateStr_(dateStr));
      const evs = (byDate[dateStr] || []).sort(function (a, b) { return a.serverTs - b.serverTs; });
      const sum = attSummarize_(evs, shift);
      const isPast = dateStr < todayStr;
      if (sum.workedMin != null) { workedMin += sum.workedMin; daysWorked++; }
      if (sum.lateMin) { lateDays++; lateMin += sum.lateMin; }
      if (isPast && shift && !sum.inTime) daysAbsent++;
      breakMin += sum.breakMin;
      bathroomMin += sum.bathroomMin;
    });
    return {
      staffId: st.staffId, name: st.displayName || st.lineDisplayName, role: st.role,
      daysWorked: daysWorked, daysAbsent: daysAbsent, lateDays: lateDays, lateMin: lateMin,
      workedMin: workedMin, breakMin: breakMin, bathroomMin: bathroomMin,
    };
  });

  return ok({ month: range.month, isCurrentMonth: range.isCurrentMonth, rows: rows });
}

// ═══════════════════════════════════════════════════════════
// แก้ไขการลงเวลาย้อนหลัง (owner) — action=fixAttendance
// ───────────────────────────────────────────────────────────
// พนักงานลืมกด "ออกงาน" / กดผิดลำดับ / มือถือแบตหมด เป็นเรื่องที่เกิดทุกสัปดาห์
// ถ้าแก้ไม่ได้ ชั่วโมงทำงานของทั้งเดือนจะใช้ไม่ได้ → ต้องมีเครื่องมือแก้ตั้งแต่วันแรกที่เปิดใช้
//
// กฎที่บังคับไว้ (กันเจ้าของแก้ตัวเลขแบบไม่มีร่องรอย):
//   1. ต้องกรอกเหตุผลทุกครั้ง — ว่างไม่ได้
//   2. แถวที่ถูกแก้/เพิ่มจะถูกมาร์ค col "ที่มา" = "แก้โดยเจ้าของ" แยกจากที่พนักงานกดเอง
//   3. เขียน Audit Log ทุกครั้งพร้อม before/after — ย้อนดูได้ว่าใครแก้อะไรเมื่อไหร่
// ═══════════════════════════════════════════════════════════
const ATT_SOURCE_FIX = "แก้โดยเจ้าของ";

// วันที่ในชีตเขียนเป็น text ("@") แต่ถ้าแถวเก่าหลุดเป็น Date ให้ normalize กลับเป็น yyyy-MM-dd
function attRowDateStr_(v) {
  if (v instanceof Date) return attDateKey_(v);
  return String(v || "").trim();
}

// id ต้องไม่ซ้ำ — เดิมใช้ getLastRow() อย่างเดียว ซึ่งจะซ้ำทันทีที่มีการ "ลบแถว" (ซึ่งเพิ่งทำได้จากที่นี่)
// และ id ซ้ำ = แก้/ลบผิดแถว จึงต้องเช็คของจริงในชีตก่อนเสมอ
function attNextId_(sh, dateStr) {
  const prefix = "AT-" + String(dateStr).replace(/-/g, "") + "-";
  const used = {};
  const last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { used[String(r[0])] = true; });
  }
  let n = last;
  for (let i = 0; i < 10000; i++) {
    const id = prefix + String(n).padStart(4, "0");
    if (!used[id]) return id;
    n++;
  }
  return prefix + Utilities.getUuid().slice(0, 4);
}

function findAttRowById_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

// สร้าง epoch ms จาก "yyyy-MM-dd" + "HH:mm(:ss)" — สคริปต์ตั้ง timeZone = Asia/Bangkok
// (appsscript.json) ดังนั้น new Date(y,m,d,h,mi) คือเวลาไทยตรง ๆ ไม่ต้องชดเชย offset เอง
function attBuildTs_(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(timeStr).trim());
  if (!dm || !tm) return null;
  const hh = parseInt(tm[1], 10), mi = parseInt(tm[2], 10), sec = tm[3] ? parseInt(tm[3], 10) : 0;
  if (hh > 23 || mi > 59 || sec > 59) return null;
  const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mi, sec);
  return {
    ms: d.getTime(),
    time: String(hh).padStart(2, "0") + ":" + String(mi).padStart(2, "0") + ":" + String(sec).padStart(2, "0"),
  };
}

// ตรวจว่าลำดับของวันสมเหตุสมผลไหม — **เตือนอย่างเดียว ไม่บล็อก**
// เจ้าของอาจต้องแก้ทีละขั้นแล้วระหว่างทางลำดับยังไม่ครบ ถ้าบล็อกจะแก้ไม่จบ
function attSequenceWarning_(events) {
  if (!events.length) return "";
  const w = [];
  if (events[0].type !== "in") w.push("เหตุการณ์แรกของวันไม่ใช่ \"เข้างาน\"");
  if (events.filter(function (e) { return e.type === "in"; }).length > 1) w.push("มี \"เข้างาน\" มากกว่า 1 ครั้ง");
  const outIdx = events.map(function (e) { return e.type; }).indexOf("out");
  if (outIdx >= 0 && outIdx !== events.length - 1) w.push("มีเหตุการณ์ต่อหลัง \"ออกงาน\"");
  return w.join(" · ");
}

function fixAttendanceHandler_(ss, data) {
  const s = resolveSession_(ss, data.sessionToken);
  if (!s || !isAdminRole_(s.role) || s.status !== "active") return unauthorized_();

  const op = String(data.op || "");
  const reason = String(data.reason || "").trim();
  if (["add", "edit", "delete"].indexOf(op) < 0) return attErr_("คำสั่งไม่ถูกต้อง");
  if (!reason) return attErr_("ต้องกรอกเหตุผลที่แก้ทุกครั้ง");

  const who = (s.displayName || s.lineDisplayName) + " (" + (STAFF_ROLE_TH_[s.role] || s.role) + ")";
  const lock = LockService.getScriptLock();
  try {
    try { lock.waitLock(10000); } catch (e) {}
    const sh = attendanceSheet_(ss);
    let staffId = "", dateStr = "", before = null, after = null;

    if (op === "add") {
      staffId = String(data.staffId || "");
      dateStr = String(data.date || "");
      const type = String(data.type || "");
      if (ATT_TYPES.indexOf(type) < 0) return attErr_("ประเภทการลงเวลาไม่ถูกต้อง");
      const ts = attBuildTs_(dateStr, data.time);
      if (!ts) return attErr_("วันที่หรือเวลาไม่ถูกต้อง (ต้องเป็น yyyy-MM-dd และ HH:mm)");
      const staff = readStaffAll_(ss).filter(function (x) { return x.staffId === staffId; })[0];
      if (!staff) return attErr_("ไม่พบพนักงานคนนี้");

      const id = attNextId_(sh, dateStr);
      sh.appendRow([
        id, staffId, staff.displayName || staff.lineDisplayName, dateStr, ts.time,
        ts.ms, "", type,
        "", "", "", "", "", "",           // ไม่มีพิกัด/รูป — เป็นแถวที่เจ้าของเพิ่มเอง ไม่ใช่การกดจริง
        "", ATT_SOURCE_FIX, reason + " [" + who + "]",
      ]);
      try { sh.getRange(sh.getLastRow(), 4, 1, 2).setNumberFormat("@"); } catch (e) {}
      after = { id: id, date: dateStr, time: ts.time, type: type };

    } else {
      const row = findAttRowById_(sh, data.id);
      if (row < 0) return attErr_("ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) — กดรีโหลดแล้วลองใหม่");
      const cur = sh.getRange(row, 1, 1, 17).getValues()[0];
      staffId = String(cur[1]);
      dateStr = attRowDateStr_(cur[3]);
      before = { id: cur[0], date: dateStr, time: String(cur[4]), type: String(cur[7]), source: String(cur[15]) };

      if (op === "delete") {
        sh.deleteRow(row);
        after = null;
      } else {
        const newType = data.type ? String(data.type) : before.type;
        if (ATT_TYPES.indexOf(newType) < 0) return attErr_("ประเภทการลงเวลาไม่ถูกต้อง");
        const ts = attBuildTs_(dateStr, data.time || before.time);
        if (!ts) return attErr_("เวลาไม่ถูกต้อง (ต้องเป็น HH:mm)");
        sh.getRange(row, 5).setValue(ts.time);
        sh.getRange(row, 6).setValue(ts.ms);
        sh.getRange(row, 8).setValue(newType);
        sh.getRange(row, 16).setValue(ATT_SOURCE_FIX);
        sh.getRange(row, 17).setValue(reason + " [" + who + "]");
        try { sh.getRange(row, 4, 1, 2).setNumberFormat("@"); } catch (e) {}
        after = { id: before.id, date: dateStr, time: ts.time, type: newType };
      }
    }

    writeAuditLog_(who, "แก้ไขการลงเวลา (" + op + ")", staffId + " " + dateStr,
      auditDetail_({ before: before, after: after, note: reason }));

    // คำนวณสถานะของวันนั้นใหม่ ส่งกลับให้ UI โชว์ผลทันที + เตือนถ้าลำดับยังเพี้ยน
    const events = readAttEvents_(ss, staffId, dateStr);
    const staff2 = readStaffAll_(ss).filter(function (x) { return x.staffId === staffId; })[0];
    const shift = attShiftFor_(readAttShifts_(ss), staff2 ? staff2.role : "", attDowOfDateStr_(dateStr));

    return ok({
      staffId: staffId, date: dateStr,
      summary: attSummarize_(events, shift),
      warning: attSequenceWarning_(events),
    });
  } catch (e) {
    return attErr_(e.toString());
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function attErr_(msg) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// 🏅 สรุปผลงานพนักงาน (action=staffPerf) — owner/dev เท่านั้น
// ───────────────────────────────────────────────────────────
// รวมยอด "ใครทำอะไรไปกี่รายการเดือนนี้" จากข้อมูลที่ระบบเก็บอยู่แล้ว 2 แหล่ง:
//   1. ชีต "Audit Log"  → จำนวนงานแต่ละประเภท (นับสต็อก/เช็คหน้าร้าน/จัดออเดอร์/โอน/ขาย ...)
//   2. ชีต "ลงเวลา"     → ชั่วโมงทำงานจริง → คิดเป็น "งาน/ชั่วโมง" ได้
//
// ⚠️ รวมยอด **ฝั่ง server** ไม่ส่งแถวดิบให้ client — ชีต Audit Log โตทุกครั้งที่มีคนแก้ข้อมูล
//    (`getAuditLog` ส่งได้แค่ 200 แถวล่าสุด ซึ่งไม่พอสำหรับสรุปทั้งเดือนอยู่แล้ว) และการส่ง
//    แถวดิบเป็นหมื่นแถวคือปัญหา "ขนาด payload" เดียวกับที่ Phase 7.4 เพิ่งแก้ไป
//
// ⚠️ **ตัวเลขนี้คือ "งานที่ระบบบันทึกได้" ไม่ใช่ "งานทั้งหมดที่ทำ"** — เดินหาของ/ยกของ/ตอบลูกค้า
//    ไม่มีใน log · เอาไปเทียบข้ามตำแหน่งกันตรง ๆ ไม่ได้ (คนนับสต็อกได้ 1 แถว/SKU แต่คนขาย
//    ได้ 1 แถว/บิล) UI จึงต้องเทียบ "คนตำแหน่งเดียวกัน" และติดหมายเหตุนี้ไว้เสมอ
//
// ⚠️ actor ในชีตเป็น **ชื่อ** ("สมชาย (คลังสินค้า)") ไม่ใช่ staffId — จับคู่กลับด้วยชื่อ
//    ที่ตัดวงเล็บตำแหน่งออก · ชื่อที่จับคู่ไม่ได้ **ต้องรายงานออกไป (`unmatched`) ห้ามทิ้งเงียบ**
//    ไม่งั้นเจ้าของเห็นยอดพนักงานคนหนึ่งเป็น 0 แล้วนึกว่าไม่ได้ทำงาน ทั้งที่แค่ชื่อไม่ตรงกัน
//    (เช่น เปลี่ยนชื่อในชีตพนักงานทีหลัง — log เก่ายังเป็นชื่อเดิม)
// ═══════════════════════════════════════════════════════════

// หมวดงาน — จับจาก "ต้นข้อความ" ของ action ที่ writeAuditLog_ เขียน (prefix match)
// เพราะบาง action ต่อท้ายด้วยข้อมูลเพิ่ม เช่น "แก้ไขการลงเวลา (" + op + ")"
//   ops:true  = งานหน้างานจริง (หยิบ/นับ/โอน/ขาย) — เอาไปคิด "งาน/ชั่วโมง"
//   ops:false = งานตั้งค่า/แก้ข้อมูล — นับรวมไว้ให้เห็น แต่ไม่ใช่ปริมาณงานหน้างาน
//   skip:true = **ไม่นับเป็น "งาน" เลย** — โชว์ให้เห็นได้ แต่ไม่เข้ายอดรวม/ไม่เข้า งาน/ชม.
//               (การกดลงเวลามี ~4-6 ครั้ง/วัน/คน ถ้านับรวมจะกลบงานจริงจนตัวเลขไม่มีความหมาย
//                — ชั่วโมงทำงานที่ได้จากการกดพวกนี้ถูกนับแยกอยู่แล้วในคอลัมน์ "ชั่วโมง")
// ⚠️ เพิ่ม action ใหม่ใน writeAuditLog_ แล้วต้องมาเติม prefix ที่นี่ด้วย ไม่งั้นตกไปอยู่ "อื่นๆ"
//    (tests/staff-perf.test.js มี meta-test ไล่ทุก call site ให้แล้ว — ลืมแล้วเทสต์แดงทันที)
const STAFF_PERF_CATEGORIES_ = [
  { key: "count",      emoji: "📊", label: "นับสต็อกคลัง",      ops: true,  unit: "รายการ", prefixes: ["นับสต็อก"] },
  { key: "fscheck",    emoji: "🏪", label: "เช็คหน้าร้าน",       ops: true,  unit: "รายการ", prefixes: ["ตรวจหน้าร้าน"] },
  { key: "order",      emoji: "📋", label: "จัดออเดอร์",         ops: true,  unit: "ครั้ง",  prefixes: ["อัปเดต order"] },
  { key: "transfer",   emoji: "🔄", label: "โอนของ",             ops: true,  unit: "รายการ", prefixes: ["โอนสต็อก"] },
  { key: "receive",    emoji: "📥", label: "หน้าร้านรับของ",     ops: true,  unit: "รายการ", prefixes: ["รับสินค้า"] },
  { key: "location",   emoji: "🗺️", label: "จัดตำแหน่งล็อค",     ops: true,  unit: "ครั้ง",  prefixes: ["updateLockData", "ลบตำแหน่งจัดเก็บ", "sweepEmptyShelf"] },
  { key: "purchase",   emoji: "🛒", label: "รับของเข้าคลัง",     ops: true,  unit: "ครั้ง",  prefixes: ["ซื้อสินค้าเข้า"] },
  { key: "newproduct", emoji: "➕", label: "เพิ่มสินค้าใหม่",     ops: true,  unit: "รายการ", prefixes: ["เพิ่มสินค้าใหม่"] },
  { key: "mto",        emoji: "🎁", label: "งานจัดพิเศษ",        ops: true,  unit: "ครั้ง",  prefixes: ["สร้างงาน MTO", "มอบหมายงาน MTO", "ปิดงาน MTO", "ลบงาน MTO", "deductMaterials"] },
  { key: "sale",       emoji: "🧾", label: "ออกบิลขาย",          ops: true,  unit: "ใบ",    prefixes: ["ออกบิลขาย", "ออกใบกำกับภาษีย้อนหลัง"] },
  { key: "quote",      emoji: "📄", label: "ใบเสนอราคา",         ops: true,  unit: "ใบ",    prefixes: ["สร้างใบเสนอราคา", "แก้ไขใบเสนอราคา", "อนุมัติใบเสนอราคา", "ปิดใบเสนอราคา"] },
  { key: "adjust",     emoji: "⚙️", label: "ปรับ/ลบข้อมูล",      ops: false, unit: "ครั้ง",  prefixes: ["ปรับสต็อก0", "resetNegativeStock", "ลบ order"] },
  { key: "star",       emoji: "⭐", label: "ตั้งผู้ดูแลสินค้า",   ops: false, unit: "ครั้ง",  prefixes: ["setProductOwner", "clearProductOwner"] },
  { key: "admin",      emoji: "🔧", label: "ตั้งค่าระบบ",        ops: false, unit: "ครั้ง",  prefixes: ["แก้ไขพนักงาน", "แก้ไขการลงเวลา", "saveThresholds", "ตั้งตำแหน่งพนักงาน"] },
  { key: "punch",      emoji: "🕐", label: "กดลงเวลา",           ops: false, unit: "ครั้ง",  skip: true, prefixes: ["ลงเวลา"] },
];
const STAFF_PERF_OTHER_ = { key: "other", emoji: "➖", label: "อื่นๆ", ops: false, unit: "ครั้ง" };

// actor ที่ไม่ใช่คน — ไม่ต้องเอาไปรายงานว่า "จับคู่ชื่อไม่ได้" (ไม่ใช่พนักงานตั้งแต่แรก)
const STAFF_PERF_SYSTEM_ACTORS_ = ["ระบบ", "ระบบ (อัตโนมัติ)", "GAS editor", "ไม่ระบุ", "owner", ""];

const STAFF_PERF_CACHE_TTL_SEC_ = 300;   // 5 นาที — เป็นรายงานย้อนหลัง ไม่ใช่ตัวเลขที่ต้องสด

function staffPerfCategoryOf_(action) {
  const a = String(action == null ? "" : action).trim();
  if (!a) return STAFF_PERF_OTHER_.key;
  for (let i = 0; i < STAFF_PERF_CATEGORIES_.length; i++) {
    const c = STAFF_PERF_CATEGORIES_[i];
    for (let j = 0; j < c.prefixes.length; j++) {
      if (a.indexOf(c.prefixes[j]) === 0) return c.key;
    }
  }
  return STAFF_PERF_OTHER_.key;
}

// "สมชาย (คลังสินค้า)" → "สมชาย" · ตัดเฉพาะวงเล็บ "ท้ายสุด" ชุดเดียว
function staffPerfNormalizeActor_(actor) {
  return String(actor == null ? "" : actor).trim().replace(/\s*\([^()]*\)\s*$/, "").trim();
}

// วันที่ในชีต Audit Log — appendRow เขียนเป็น Date object จริง แต่รับ string เผื่อแถวที่แก้มือ
// ⚠️ ปี พ.ศ. (บทเรียนข้อ 11): "5/8/2569" ถ้าปล่อยให้ new Date() ตีความจะได้อนาคต 543 ปี
function staffPerfDayKey_(v) {
  if (v === null || v === undefined || v === "") return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, "Asia/Bangkok", "yyyy-MM-dd");
  }
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  const th = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);   // d/M/yyyy — toLocaleString("th-TH")
  if (th) {
    let y = Number(th[3]);
    if (y >= 2400) y -= 543;
    return y + "-" + String(Number(th[2])).padStart(2, "0") + "-" + String(Number(th[1])).padStart(2, "0");
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : Utilities.formatDate(d, "Asia/Bangkok", "yyyy-MM-dd");
}

// รวมยอดจาก Audit Log — คืน { byActor: {ชื่อดิบ: {display, total, byCat, byDay}}, rows }
// แยกออกมาเป็นฟังก์ชัน pure (รับ array ไม่ใช่ชีต) เพื่อเทสต์ได้โดยไม่ต้องมี Spreadsheet
function staffPerfAggregateAudit_(rows, monthKey) {
  const byActor = {};
  let counted = 0;
  (rows || []).forEach(function (r) {
    const day = staffPerfDayKey_(r[0]);
    if (!day || day.slice(0, 7) !== monthKey) return;
    const raw = String(r[1] == null ? "" : r[1]).trim();
    const cat = staffPerfCategoryOf_(r[2]);
    counted++;
    let b = byActor[raw];
    if (!b) b = byActor[raw] = { display: raw, total: 0, opsTotal: 0, byCat: {}, byDay: {} };
    b.byCat[cat] = (b.byCat[cat] || 0) + 1;
    // skip:true (กดลงเวลา) — เก็บให้เห็นใน byCat ได้ แต่ห้ามเข้ายอดรวม/กราฟรายวัน
    if (staffPerfCatDef_(cat).skip) return;
    b.total++;
    if (staffPerfCatDef_(cat).ops) b.opsTotal++;
    b.byDay[day] = (b.byDay[day] || 0) + 1;
  });
  return { byActor: byActor, rows: counted };
}

function staffPerfCatDef_(key) {
  for (let i = 0; i < STAFF_PERF_CATEGORIES_.length; i++) {
    if (STAFF_PERF_CATEGORIES_[i].key === key) return STAFF_PERF_CATEGORIES_[i];
  }
  return STAFF_PERF_OTHER_;
}

function staffPerfBuild_(ss, monthStr) {
  const range = attMonthRange_(monthStr);   // ตัดวันอนาคตให้แล้ว (เดือนปัจจุบัน = ถึงวันนี้)
  const monthKey = range.month;

  // ── 1) Audit Log — อ่านคอลัมน์วันที่ก่อน (คอลัมน์เดียว) เพื่อหาช่วงแถวของเดือนนี้
  //      แล้วค่อยอ่าน 5 คอลัมน์เฉพาะช่วงนั้น · ชีตนี้ append อย่างเดียวจึงเรียงตามเวลาอยู่แล้ว
  //      (แถวนอกช่วงที่หลุดเข้ามาถูกกรองซ้ำใน staffPerfAggregateAudit_ อีกชั้น)
  let audit = { byActor: {}, rows: 0 };
  const shA = ss.getSheetByName(SHEET_AUDIT);
  if (shA) {
    const lastA = shA.getLastRow();
    if (lastA >= 2) {
      const dcol = shA.getRange(2, 1, lastA - 1, 1).getValues();
      let startIdx = -1, endIdx = -1;
      for (let i = 0; i < dcol.length; i++) {
        const dk = staffPerfDayKey_(dcol[i][0]);
        if (!dk || dk.slice(0, 7) !== monthKey) continue;
        if (startIdx < 0) startIdx = i;
        endIdx = i;
      }
      if (startIdx >= 0) {
        audit = staffPerfAggregateAudit_(
          shA.getRange(2 + startIdx, 1, endIdx - startIdx + 1, 5).getValues(), monthKey);
      }
    }
  }

  // ── 2) ลงเวลา → ชั่วโมงทำงานจริง (อ่านแค่ col B..H ที่ใช้จริง ไม่ใช่ทั้ง 17 คอลัมน์) ──
  const shifts = readAttShifts_(ss);
  const shAtt = attendanceSheet_(ss);
  const lastAtt = shAtt.getLastRow();
  const attByStaff = {};
  if (lastAtt >= 2) {
    // idx: 0=staffId 1=ชื่อ 2=วันที่ 3=เวลา 4=serverTs 5=clientTs 6=ประเภท
    shAtt.getRange(2, 2, lastAtt - 1, 7).getValues().forEach(function (r) {
      const d = attRowDateStr_(r[2]);
      if (!d || d.slice(0, 7) !== monthKey) return;
      const sid = String(r[0]);
      if (!sid) return;
      const per = attByStaff[sid] || (attByStaff[sid] = {});
      (per[d] = per[d] || []).push({ type: r[6], time: r[3], serverTs: Number(r[4]) || 0 });
    });
  }

  // ── 3) จับคู่ actor (ชื่อ) กลับเป็นพนักงาน ──
  const staffAll = readStaffAll_(ss);
  const nameToId = {};
  staffAll.forEach(function (st) {
    [st.displayName, st.lineDisplayName].forEach(function (n) {
      const k = String(n || "").trim().toLowerCase();
      if (k && !nameToId[k]) nameToId[k] = st.staffId;
    });
  });

  const perStaff = {};          // staffId -> รวมยอดจาก audit
  const unmatched = [];         // ชื่อใน log ที่หาพนักงานไม่เจอ — ต้องโชว์ ห้ามทิ้งเงียบ
  Object.keys(audit.byActor).forEach(function (raw) {
    const b = audit.byActor[raw];
    const sid = nameToId[raw.toLowerCase()] ||
                nameToId[staffPerfNormalizeActor_(raw).toLowerCase()] || null;
    if (!sid) {
      if (STAFF_PERF_SYSTEM_ACTORS_.indexOf(raw) < 0) unmatched.push({ actor: raw, total: b.total });
      return;
    }
    const cur = perStaff[sid];
    if (!cur) { perStaff[sid] = b; return; }
    // พนักงานคนเดียวมีได้หลายชื่อใน log (เปลี่ยนตำแหน่งแล้ววงเล็บเปลี่ยน) → รวมเข้าด้วยกัน
    cur.total += b.total;
    cur.opsTotal += b.opsTotal;
    Object.keys(b.byCat).forEach(function (k) { cur.byCat[k] = (cur.byCat[k] || 0) + b.byCat[k]; });
    Object.keys(b.byDay).forEach(function (k) { cur.byDay[k] = (cur.byDay[k] || 0) + b.byDay[k]; });
  });
  unmatched.sort(function (a, b) { return b.total - a.total; });

  // ── 4) ประกอบเป็นแถวต่อคน ──
  const todayStr = attDateKey_(new Date());
  const staff = staffAll.map(function (st) {
    const a = perStaff[st.staffId] || { total: 0, opsTotal: 0, byCat: {}, byDay: {} };
    const perDate = attByStaff[st.staffId] || {};

    let workedMin = 0, daysWorked = 0, lateDays = 0, lateMin = 0, daysAbsent = 0;
    range.dates.forEach(function (dateStr) {
      const shift = attShiftFor_(shifts, st.role, attDowOfDateStr_(dateStr));
      const evs = (perDate[dateStr] || []).sort(function (x, y) { return x.serverTs - y.serverTs; });
      const sum = attSummarize_(evs, shift);
      if (sum.workedMin != null) { workedMin += sum.workedMin; daysWorked++; }
      if (sum.lateMin) { lateDays++; lateMin += sum.lateMin; }
      if (dateStr < todayStr && shift && !sum.inTime) daysAbsent++;
    });

    // งาน/ชั่วโมง — ไม่โชว์เมื่อชั่วโมงน้อยเกินไป (ฐานเล็ก = ตัวเลขเว่อร์ หลักเดียวกับ MoM
    //   ที่ไม่โชว์ delta ในวันที่ 1–2 ของเดือน) · ต้องมีทั้งชั่วโมงและงานถึงจะมีความหมาย
    const perHour = (workedMin >= 60 && a.total > 0)
      ? Math.round((a.total / (workedMin / 60)) * 10) / 10 : null;

    return {
      staffId: st.staffId, name: st.displayName || st.lineDisplayName || st.staffId,
      role: st.role, status: st.status, pictureUrl: st.pictureUrl || "",
      total: a.total, opsTotal: a.opsTotal, byCat: a.byCat, byDay: a.byDay,
      workedMin: workedMin, daysWorked: daysWorked,
      lateDays: lateDays, lateMin: lateMin, daysAbsent: daysAbsent,
      perHour: perHour,
    };
  }).filter(function (row) {
    // คนที่ลาออกแล้วและไม่มีความเคลื่อนไหวในเดือนนั้น — ไม่ต้องรกหน้าจอ
    return row.status === "active" || row.total > 0 || row.workedMin > 0;
  }).sort(function (a, b) { return b.total - a.total || b.workedMin - a.workedMin; });

  return {
    month: monthKey,
    isCurrentMonth: range.isCurrentMonth,
    lastDate: range.dates.length ? range.dates[range.dates.length - 1] : monthKey + "-01",
    cats: STAFF_PERF_CATEGORIES_.map(function (c) {
      return { key: c.key, emoji: c.emoji, label: c.label, ops: c.ops, unit: c.unit, skip: !!c.skip };
    }).concat([{ key: STAFF_PERF_OTHER_.key, emoji: STAFF_PERF_OTHER_.emoji,
                 label: STAFF_PERF_OTHER_.label, ops: false, unit: STAFF_PERF_OTHER_.unit, skip: false }]),
    staff: staff,
    unmatched: unmatched,
    auditRows: audit.rows,
    generatedAt: new Date().toISOString(),
  };
}

function staffPerfHandler_(e) {
  const p = (e && e.parameter) || {};
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sess = resolveSession_(ss, p.sessionToken);
  // ข้อมูลผลงานรายคนเป็นเรื่องอ่อนไหว — owner/dev เท่านั้น (เหมือน getAuditLog)
  if (!sess || !isAdminRole_(sess.role) || sess.status !== 'active') return unauthorized_();

  const month = /^\d{4}-\d{2}$/.test(String(p.month || "")) ? String(p.month) : "";
  const cacheKey = "dmj_staffperf_" + (month || attDateKey_(new Date()).slice(0, 7));
  const cache = CacheService.getScriptCache();
  if (p.fresh !== "1") {
    try {
      const hit = cache.get(cacheKey);
      if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
    } catch (err) { /* cache อ่านไม่ได้ก็แค่คำนวณใหม่ */ }
  }

  const body = JSON.stringify({ success: true, data: staffPerfBuild_(ss, month) });
  try { cache.put(cacheKey, body, STAFF_PERF_CACHE_TTL_SEC_); } catch (err) { /* ใหญ่เกิน/เต็ม = ข้าม */ }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════
// งานดูแลข้อมูลลงเวลา — trigger รายวัน (ตั้งด้วย setupAttendanceMaintenance)
// ───────────────────────────────────────────────────────────
// รวม 3 งานที่ต้องทำสม่ำเสมอไว้ใน trigger เดียว (ประหยัดโควตา trigger ของ GAS):
//   1. ลบรูปลงเวลาที่เกินอายุ — รูปพนักงานเป็นข้อมูลส่วนบุคคล (PDPA) + Drive โตไม่หยุด
//   2. ลบแถวเซสชันที่หมดอายุ — resolveSession_ สแกนทั้งชีตทุก request ยิ่งโตยิ่งช้าทุกการกดปุ่ม
//   3. เตือน "ลืมกดออกงาน" — ให้รู้ตั้งแต่คืนนั้น ดีกว่ามารู้ตอนสิ้นเดือนแล้วนึกเวลาไม่ออก
//
// ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown ของ GAS editor ให้เจ้าของกดรันเองได้ (บทเรียนข้อ 1)
// ═══════════════════════════════════════════════════════════
const ATT_PHOTO_KEEP_DAYS_DEFAULT = 90;   // ปรับได้ที่ Script Property ATT_PHOTO_KEEP_DAYS
const ATT_PHOTO_PURGE_MAX = 200;          // ต่อรอบ — กันรันเกิน 6 นาทีตอนล้างของเก่าครั้งแรก
const ATT_SESSION_KEEP_DAYS = 7;          // เก็บเซสชันหมดอายุไว้อีก 7 วันเผื่อไล่ดูย้อนหลัง

function dailyAttendanceMaintenance() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const out = [];
  // แต่ละงานพังแยกกันได้ — ห้ามให้งานเดียวล้มแล้วอีก 2 งานไม่ได้รัน
  try { out.push("ลบรูปเก่า " + purgeOldAttPhotos_(ss) + " รูป"); }
  catch (e) { out.push("ลบรูปเก่า ล้มเหลว: " + e); }
  try { out.push("ลบเซสชันหมดอายุ " + purgeExpiredSessions_(ss) + " แถว"); }
  catch (e) { out.push("ลบเซสชัน ล้มเหลว: " + e); }
  try { out.push("เตือนลืมออกงาน " + notifyForgotPunchOut_(ss) + " คน"); }
  catch (e) { out.push("เตือนลืมออกงาน ล้มเหลว: " + e); }
  try { out.push("ลบแจ้งเตือนในแอปหมดอายุ " + purgeInappNoti_(ss) + " แถว"); }
  catch (e) { out.push("ลบแจ้งเตือนในแอป ล้มเหลว: " + e); }
  Logger.log("dailyAttendanceMaintenance: " + out.join(" · "));
}

function purgeOldAttPhotos_(ss) {
  const keepDays = parseInt(PropertiesService.getScriptProperties().getProperty("ATT_PHOTO_KEEP_DAYS") || "", 10) || ATT_PHOTO_KEEP_DAYS_DEFAULT;
  const cutoff = attDateKey_(new Date(Date.now() - keepDays * 86400000));
  const sh = attendanceSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, 1, last - 1, 17).getValues();
  let n = 0;
  for (let i = 0; i < vals.length && n < ATT_PHOTO_PURGE_MAX; i++) {
    const photoId = String(vals[i][14] || "").trim();
    if (!photoId) continue;
    // yyyy-MM-dd เทียบแบบ string ได้ผลเดียวกับเทียบวันที่ (zero-padded, เรียงตามตัวอักษร = ตามเวลา)
    if (attRowDateStr_(vals[i][3]) >= cutoff) continue;
    try { DriveApp.getFileById(photoId).setTrashed(true); } catch (e) {}
    // ล้างอ้างอิงเสมอ แม้ไฟล์จะหายไปก่อนแล้ว — ไม่งั้นปุ่ม "ดูรูป" จะค้างอยู่ตลอดไป
    sh.getRange(i + 2, 15).setValue("");
    n++;
  }
  return n;
}

function purgeExpiredSessions_(ss) {
  const sh = sessionsSheet_(ss);
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const vals = sh.getRange(2, 1, last - 1, 6).getValues();
  const graceMs = ATT_SESSION_KEEP_DAYS * 86400000;
  const now = Date.now();
  const drop = [];
  for (let i = 0; i < vals.length; i++) {
    const expiresAt = vals[i][3] ? new Date(vals[i][3]).getTime() : 0;
    const createdAt = vals[i][2] ? new Date(vals[i][2]).getTime() : 0;
    const revoked = vals[i][5] === true || vals[i][5] === "TRUE";
    const dead = (expiresAt && expiresAt < now - graceMs) || (revoked && createdAt && createdAt < now - graceMs);
    if (dead) drop.push(i + 2);
  }
  // ลบจากล่างขึ้นบน — ลบจากบนจะทำให้เลขแถวที่เหลือเลื่อนทั้งหมด
  for (let i = drop.length - 1; i >= 0; i--) sh.deleteRow(drop[i]);
  return drop.length;
}

// เตือนคนที่กด "เข้างาน" แล้วแต่ยังไม่กด "ออกงาน" — ส่งช่อง secondary รวมเป็นข้อความเดียว
// dedupKey ผูกกับวันที่ → รัน trigger ซ้ำหรือกดรันเองอีกรอบก็ไม่ส่งซ้ำ (กันเปลืองโควตา)
function notifyForgotPunchOut_(ss) {
  const dateStr = attDateKey_(new Date());
  const shifts = readAttShifts_(ss);
  const dow = attDowOfDateStr_(dateStr);
  // อ่านชีตครั้งเดียวแล้วจัดกลุ่ม — เรียก readAttEvents_ ต่อคนจะสแกนทั้งชีตซ้ำ N รอบ
  const sh = attendanceSheet_(ss);
  const last = sh.getLastRow();
  const byStaff = {};
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 17).getValues().forEach(function (r) {
      if (attRowDateStr_(r[3]) !== dateStr) return;
      const sid = String(r[1]);
      (byStaff[sid] = byStaff[sid] || []).push({ type: r[7], time: r[4], serverTs: Number(r[5]) || 0, lat: r[8], inArea: r[13] === true || r[13] === "TRUE" });
    });
  }
  const names = [];
  readStaffAll_(ss).filter(function (x) { return x.status === "active"; }).forEach(function (st) {
    const evs = (byStaff[st.staffId] || []).sort(function (a, b) { return a.serverTs - b.serverTs; });
    if (!evs.length) return;
    const sum = attSummarize_(evs, attShiftFor_(shifts, st.role, dow));
    if (sum.inTime && !sum.outTime) {
      names.push("• " + (st.displayName || st.lineDisplayName) + " (เข้า " + String(sum.inTime).slice(0, 5) + ")");
    }
  });
  if (!names.length) return 0;
  enqueueNoti_({
    channel: "secondary", priority: 5, type: "text",
    dedupKey: "att-forgot-out-" + dateStr,
    payload: { text: "⏰ ยังไม่ได้กด \"ออกงาน\" วันนี้ (" + dateStr + ")\n" + names.join("\n") + "\n\nแก้เวลาย้อนหลังได้ที่แท็บ \"ใครเข้างานวันนี้\"" },
  });
  return names.length;
}

function setupAttendanceMaintenance() {
  removeTriggersByName_("dailyAttendanceMaintenance");
  ScriptApp.newTrigger("dailyAttendanceMaintenance").timeBased().everyDays(1).atHour(22).create();
  Logger.log("✅ ตั้ง trigger: dailyAttendanceMaintenance ทุกวัน 22:00 (ลบรูปเก่า/ล้างเซสชัน/เตือนลืมออกงาน)");
  Logger.log("   เก็บรูปลงเวลา " + (parseInt(PropertiesService.getScriptProperties().getProperty("ATT_PHOTO_KEEP_DAYS") || "", 10) || ATT_PHOTO_KEEP_DAYS_DEFAULT) + " วัน (ปรับที่ Script Property ATT_PHOTO_KEEP_DAYS)");
}

// ───────────────────────────────────────────────────────────
// เกณฑ์แจ้งเตือนสต็อก (thresholds) — เก็บถาวรใน Script Property 'STOCK_THRESHOLDS'
// เดิม hardcode ใน payload ทำให้ค่าที่ผู้ใช้ปรับหายเมื่อ reload
// ───────────────────────────────────────────────────────────
var THRESHOLDS_DEFAULT_ = {
  default: 36,
  overrides: { "แจกันแก้ว": 3, "เรซิ่นและอื่นๆ": 3 },
  coverMonths: 2,
};

function readThresholds_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('STOCK_THRESHOLDS');
    if (!raw) return THRESHOLDS_DEFAULT_;
    var t = JSON.parse(raw);
    return {
      default:     (typeof t.default === 'number' && t.default >= 0) ? t.default : THRESHOLDS_DEFAULT_.default,
      overrides:   (t.overrides && typeof t.overrides === 'object') ? t.overrides : THRESHOLDS_DEFAULT_.overrides,
      coverMonths: (typeof t.coverMonths === 'number' && t.coverMonths >= 1) ? t.coverMonths : THRESHOLDS_DEFAULT_.coverMonths,
    };
  } catch (e) {
    return THRESHOLDS_DEFAULT_;
  }
}

// sanitize ค่าที่ client ส่งมา (คืน null ถ้า shape ใช้ไม่ได้เลย)
// แยกเป็น pure function เพื่อให้เขียน unit test ฝั่ง Node ได้
function sanitizeThresholds_(t) {
  if (!t || typeof t !== 'object') return null;
  var def = parseInt(t.default, 10);
  var cover = parseInt(t.coverMonths, 10);
  var out = {
    default:     (isNaN(def) || def < 0 || def > 100000) ? THRESHOLDS_DEFAULT_.default : def,
    overrides:   {},
    coverMonths: (isNaN(cover) || cover < 1 || cover > 24) ? THRESHOLDS_DEFAULT_.coverMonths : cover,
  };
  var ov = (t.overrides && typeof t.overrides === 'object') ? t.overrides : {};
  Object.keys(ov).slice(0, 200).forEach(function (cat) {
    var v = parseInt(ov[cat], 10);
    if (!isNaN(v) && v >= 0 && v <= 100000) out.overrides[String(cat).slice(0, 100)] = v;
  });
  return out;
}

function saveThresholds_(data, actor) {
  try {
    var out = sanitizeThresholds_(data.thresholds);
    if (!out) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "invalid thresholds" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    PropertiesService.getScriptProperties().setProperty('STOCK_THRESHOLDS', JSON.stringify(out));
    writeAuditLog_(actor, 'saveThresholds', 'thresholds',
      auditDetail_({ after: out, note: 'ปรับเกณฑ์แจ้งเตือนสต็อก' }));
    return ContentService.createTextOutput(JSON.stringify({ success: true, thresholds: out }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: e.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    invalidateCache_();
  }
}

// ───────────────────────────────────────────────────────────
// SECTION 2: Main Handlers (doPost / doGet)
// ───────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ─── LINE Webhook ───
    if (data.events) {
      const event = data.events[0];
      if (!event) return ContentService.createTextOutput("OK");
      // บันทึก Group ID เมื่อ Bot ถูกเพิ่มเข้า Group
      if (event.type === 'join' && event.source && event.source.groupId) {
        PropertiesService.getScriptProperties().setProperty('LINE_GROUP_ID', event.source.groupId);
        sendLineGroup_('✅ บอทพร้อมแจ้งเตือนในกลุ่มนี้แล้วครับ 🎉');
        return ContentService.createTextOutput("OK");
      }
      // ตอบกลับเมื่อมีคนพิมพ์ — ปิดโดย default (บอทเป็น "ส่งอย่างเดียว")
      // เปิดกลับได้โดยตั้ง Script Property LINE_REPLY_ENABLED = 'true'
      var replyEnabled = PropertiesService.getScriptProperties().getProperty('LINE_REPLY_ENABLED') === 'true';
      if (replyEnabled && event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.trim();
        const replyToken = event.replyToken;
        let chatId = null;
        if (event.source.type === 'group')     chatId = event.source.groupId;
        else if (event.source.type === 'room') chatId = event.source.roomId;
        else                                   chatId = event.source.userId;
        if (chatId) startLoadingAnimation(chatId);
        const db = getOrBuildDatabase();
        const replyPayload = handleQuery(userMessage, db);
        replyToLine(replyToken, replyPayload);
      }
      return ContentService.createTextOutput("OK");
    }

    // ─── App actions: ต้องมี token (LINE webhook ด้านบนยกเว้น) ───
    // token มาจาก query string (?token=) เป็นหลัก, รองรับใน body ด้วย
    const _tok = (e && e.parameter && e.parameter.token) || data.token;
    if (!checkToken_(_tok)) return unauthorized_();

    // ── ตัวตนผู้ใช้ (เฟส 4) ────────────────────────────────────────────────
    // ลำดับความเชื่อถือ: session ที่ server ตรวจเอง > actor ที่ client ส่งมา
    // มี session ที่ใช้ได้ → **ทับ** actor ด้วยชื่อจาก session เสมอ (ห้ามเชื่อ data.actor อีก)
    // ไม่มี session → ยังรับ data.actor ต่อไป เพื่อให้ช่วงเปลี่ยนผ่านไม่พัง
    //   (คนที่ยังไม่ได้ล็อกอิน LINE ยังทำงานได้ จนกว่าจะเปิด REQUIRE_LOGIN)
    var actor = data.actor || "ไม่ระบุ";
    var _sess = null;
    try { _sess = resolveSession_(ss, data.sessionToken); } catch (e) { Logger.log("resolveSession_ error: " + e); }
    if (_sess) {
      actor = staffActorName_(_sess) || actor;
      // ⚠️ ต้องทับ data.actor ด้วย ไม่ใช่แค่ตัวแปร actor — handler ที่รับ `data` ทั้งก้อน
      // (เช่น updateOrderState ที่อ่าน body.actor เอง) จะได้ชื่อจาก session เหมือนกันหมด
      // ไม่งั้นชื่อ "ผู้จัด"/audit log ของ handler กลุ่มนั้นยังเป็นค่าที่ client ส่งมา = ปลอมได้
      data.actor = actor;
    }

    // ตรวจสิทธิ์ฝั่ง server (frontend ซ่อนแท็บ ≠ กันคนยิง API ตรง)
    // ยังเป็น no-op จนกว่า Script Property REQUIRE_LOGIN='true'
    var _denied = canDoOrNull_(_sess, resolvePostAction_(data));
    if (_denied) return _denied;

    // ─── Verify PIN (POST path) ───
    if (data.action === 'verifyPin') {
      const expected = (PropertiesService.getScriptProperties().getProperty('OWNER_PIN') || 'DMJ').trim();
      const okPin = String(data.pin || '').trim() === expected;
      return ContentService
        .createTextOutput(JSON.stringify({ ok: okPin }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ─── ล็อกอินพนักงาน (LINE Login) — ไม่แตะข้อมูลสต็อก จึงข้าม invalidateCache_ ด้านล่าง ───
    if (data.action === 'authLine')  return authLine_(ss, data);
    if (data.action === 'claimLoginHandoff') return claimLoginHandoffHandler_(data);
    if (data.action === 'me')        return meHandler_(ss, data);
    if (data.action === 'logout')    return logoutHandler_(ss, data);
    if (data.action === 'listStaff') return listStaffHandler_(ss, data);
    if (data.action === 'saveStaff') return saveStaffHandler_(ss, data, actor);
    if (data.action === 'listActiveStaffNames') return listActiveStaffNamesHandler_(ss, data);

    // ─── ลงเวลาเข้า-ออกงาน ───
    if (data.action === 'punch')           return punchHandler_(ss, data);
    if (data.action === 'myToday')         return myTodayHandler_(ss, data);
    if (data.action === 'myAttendanceSummary') return myAttendanceSummaryHandler_(ss, data);
    if (data.action === 'attendanceToday') return attendanceTodayHandler_(ss, data);
    if (data.action === 'attendanceMonthlySummary') return attendanceMonthlySummaryHandler_(ss, data);
    if (data.action === 'fixAttendance')   return fixAttendanceHandler_(ss, data);

    // ─── แจ้งเตือนในแอป: ทำเครื่องหมายว่าอ่านแล้ว ───
    // อยู่เหนือ invalidateCache_ โดยตั้งใจ — ไม่ได้แตะข้อมูลสต็อก/ออเดอร์เลย
    // ถ้าปล่อยให้ตกไปด้านล่าง การกดอ่านแจ้งเตือนจะล้าง payload cache ทั้งก้อนทุกครั้ง
    if (data.action === 'markNotiRead') return markInappNotiReadHandler_(ss, data);

    // ─── ⭐ ตั้ง/ถอด "คนดูแลสินค้า" — เขียนชีตของตัวเอง ไม่แตะข้อมูลสต็อก ───
    // อยู่เหนือ invalidateCache_ ด้วยเหตุผลเดียวกับ markNotiRead: กดดาวไม่ควรล้าง
    // payload cache ทั้งก้อนจนทั้งร้านต้องโหลดใหม่
    if (data.action === 'setProductOwner') return setProductOwnerHandler_(ss, data);

    // มีการแก้ข้อมูล → ล้าง cache ให้ doGet ครั้งถัดไปคำนวณใหม่ (ข้อมูลไม่ค้าง)
    invalidateCache_(true); // clear payload cache เท่านั้น — ห้าม bump dmj_last_write_ts ก่อน conflict check

    // ─── Stock Transfer (Batch): คลัง → หน้าร้าน หลาย SKU ในครั้งเดียว ───
    if (data.transferStockBatch) {
      return transferStockBatch(ss, data.list || [], actor, data.clientLoadedAt, data.tid);
    }

    // ─── Zero Stock: ตั้ง WH qty=0 ใน Sheets + ZORT (สินค้าหมด ไม่ได้จัด) ───
    if (data.zeroStock) {
      return zeroStockItem_(ss, data.sku, actor);
    }

    // ─── Void Quotation: ปิดใบเสนอราคาค้าง (ไม่อนุมัติ) ใน ZORT ───
    if (data.voidQuotation) {
      return voidZortQuotation_(data.quotationId, data.quotationNumber, actor);
    }

    // ─── Approve Quotation: แปลงใบเสนอราคาเป็นออเดอร์ขายจริงใน ZORT (ตัดสต็อก) แล้วปิดใบเสนอราคาเดิม ───
    if (data.approveQuotation) {
      return approveQuotation(ss, data.quotationId, data.quotationNumber, actor);
    }

    // ─── Set Quotation Sale: บันทึกชื่อเซลที่ทำใบเสนอราคา (ในชีตเรา) ───
    if (data.setQuoteSale) {
      return setQuoteSale_(data.quoteNumber, data.sale, actor);
    }

    // ─── ออกเลขที่ใบแจ้งหนี้ของเราเอง (ผูกกับเลขที่ใบเสนอราคาต้นทาง — ในชีตเรา ไม่แตะ ZORT) ───
    if (data.getInvoiceNumber) {
      return nextInvoiceNumber_(data.quotationNumber, actor);
    }

    // ─── Record Unscanned Sale: นับสต็อกแล้วของหาย = ขายออก (บวก soldQty ไม่แตะเงิน) ───
    if (data.recordUnscannedSale) {
      return recordUnscannedSale_(data.sku, data.qty, actor);
    }

    // ─── Stock Transfer: คลัง → หน้าร้าน ───
    if (data.transferStock) {
      return transferStock(ss, data.sku, Number(data.qty) || 0, data.name, actor);
    }

    // ─── Stock Deduct: หักตรงๆ (legacy) ───
    if (data.deductStock) {
      return deductStock(ss, data.sku, Number(data.qty) || 0);
    }

    // ─── Material Deduction: MTO ───
    if (data.deductMaterials) {
      return deductMaterials(ss, data.items || [], actor);
    }

    // ─── Update Order State ───
    if (data.updateOrderState) {
      return updateOrderState(ss, data);
    }

    // ─── Confirm Shipment Receive (sale/FS ยืนยันรับของจากชีตรายการโอนสินค้า) ───
    if (data.confirmShipmentReceive) {
      // refNum = ใบโอน (TF-...) ใช้หาแถวที่ถูกต้องเมื่อเลขแถวที่เครื่องผู้ใช้ถืออยู่เลื่อนไปแล้ว
      return confirmShipmentReceive(ss, data.rowId, data.sku, Number(data.receivedQty) || 0, actor, data.refNum);
    }

    // ─── Lock Data ───
    if (data.updateLockData) {
      return updateLockData(ss, data.lockKey, data.entries, data.datetime, actor);
    }

    if (data.deleteLockEntry) {
      return deleteLockEntry(ss, data.lockKey, data.sku, actor);
    }

    // ─── Front Store Count ───
    if (data.updateFrontStore) {
      return updateFrontStore(ss, data.entries, data.datetime, actor);
    }
    if (data.confirmStockCount) {
      return confirmStockCount(ss, data.entries, data.clientLoadedAt, actor);
    }

    // ─── เพิ่มสินค้าใหม่เข้า ZORT (owner/warehouse) ───
    if (data.addNewProduct) {
      return addNewProduct(ss, data.product || {}, actor);
    }
    if (data.addPurchaseIn) {
      return addPurchaseIn(ss, data.purchase || {}, actor);
    }
    if (data.checkSkuExists) {
      return checkSkuExists(ss, data.sku);
    }
    if (data.fetchProductImage) {
      return fetchProductImage(ss, data.sku);
    }

    // ─── POS: ออกบิล/ใบกำกับภาษี + ค้นลูกค้า (saler) ───
    if (data.searchContact) {
      return searchContact(data.query);
    }
    if (data.getContactDetail) {
      return getContactDetail(data.contactId);
    }
    if (data.createSaleBill) {
      return createSaleBill(ss, data, actor);
    }
    if (data.lookupSaleBill) {
      return lookupSaleBill(data.orderNumber);
    }
    if (data.issueFullTaxInvoice) {
      return issueFullTaxInvoice(data.orderNumber, data.customer || {}, actor, data.orderId);
    }

    // ─── ใบเสนอราคาจากเว็บ (sales staff สร้างเองแทนเข้า ZORT UI) ───
    // ผู้ทำใบเสนอราคา (salesRep) ทับด้วยชื่อจาก session เสมอถ้ามี — ห้ามให้พิมพ์เอง
    // (เจ้าของขอ 2026-07-30: กันพิมพ์ชื่อคนอื่นผิดคนบนเอกสารที่ส่งลูกค้า)
    if (data.createQuotation) {
      var q1 = data.quote || {};
      if (_sess) q1 = Object.assign({}, q1, { salesRep: _sess.displayName || _sess.lineDisplayName || q1.salesRep });
      return createQuotation(ss, q1, actor);
    }
    if (data.saveQuotationDraft) {
      var q2 = data.quote || {};
      if (_sess) q2 = Object.assign({}, q2, { salesRep: _sess.displayName || _sess.lineDisplayName || q2.salesRep });
      return saveQuotationDraft(ss, q2, actor);
    }
    // แก้ไขใบเสนอราคาเดิม (เฉพาะใบที่ลูกค้ายังไม่อนุมัติ — frontend โชว์ปุ่มเฉพาะตาราง "รออนุมัติ")
    if (data.editQuotation) {
      var q3 = data.quote || {};
      if (_sess) q3 = Object.assign({}, q3, { salesRep: _sess.displayName || _sess.lineDisplayName || q3.salesRep });
      return editQuotation(ss, q3, actor);
    }
    if (data.deleteQuotationDraft) {
      return deleteQuotationDraft(ss, data.draftId, actor);
    }

    // ─── Order Management ───
    if (data.deleteOrder) {
      return deleteOrderRow(ss, data.orderId, actor, data.sku);
    }
    if (data.deleteOrders) {
      return deleteOrderRows(ss, data.orderIds || [], actor, data.orderSkus || []);
    }

    // ─── Manual ZORT Sync ───
    if (data.syncZortNow) {
      syncZortBoth();
      return ok({ synced: true });
    }
    if (data.syncZortSalesNow) {
      syncZortSales();
      return ok({ synced: true });
    }
    if (data.syncZortPurchasesNow) {
      syncZortPurchases();
      return ok({ synced: true });
    }

    // ─── Reset Negative Stock ───
    // Owner only ตาม ADR-001 — ไม่มี legitimate caller อื่นจาก UI (ตรวจยืนยันแล้ว)
    // ปกติเรียกผ่าน resetNegativeStockOnce() ใน GAS editor โดยตรง ไม่ผ่าน path นี้เลย
    // สิทธิ์เช็คแล้วที่ต้น doPost (canDoOrNull_ + IMMEDIATE_GATE_STRICT_ACTIONS_) ไม่ต้องเช็คซ้ำ
    if (data.resetNegativeStock) {
      return resetNegativeStock_(ss, actor);
    }

    // ─── MTO Jobs ───
    if (data.createMtoJob)    return createMtoJob(ss, data, actor, _sess && _sess.staffId);
    if (data.closeMtoJob)     return closeMtoJob(ss, data, actor);
    if (data.deleteMtoJob)    return deleteMtoJob(ss, data);
    if (data.saveMtoJobItems) return saveMtoJobItems(ss, data);
    if (data.assignMtoJob)    return assignMtoJob(ss, data, actor);

    // ─── Stock Check Requests ───
    if (data.createStockCheck) return createStockCheckRequest_(data.skus, data.names, actor);
    if (data.completeStockCheck) return completeStockCheckRequest_(data.reqId, actor);

    // ─── เกณฑ์แจ้งเตือนสต็อก (บันทึกถาวร ใช้ร่วมกันทุกเครื่อง) ───
    if (data.saveThresholds) return saveThresholds_(data, actor);

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("doPost Error:", error);
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    if (!checkToken_(e && e.parameter && e.parameter.token)) return unauthorized_();
    // ตัวแยกสาเหตุ: เส้นทางเดียวกันเป๊ะกับ payload แต่คำตอบจิ๋วและไม่แตะชีตเลย
    // ยิงพร้อมกัน 15 แล้วได้ JSON ครบ = คอขวดอยู่ที่ "ขนาดคำตอบตอนส่งกลับ" ไม่ใช่ "จำนวนคนพร้อมกัน"
    // (5 ส.ค. 2026: Executions บอกว่า doGet เสร็จใน 2-5 วิ ทุกอัน แต่ browser ได้ HTML ที่ 23-49 วิ
    //  → เวลาที่หายไปอยู่นอก execution ต้องพิสูจน์ว่าอยู่ช่วงส่งคำตอบจริงไหม)
    if (e && e.parameter && e.parameter.action === 'ping') {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, t: Date.now() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Phase 7.4: "ข้อมูลเปลี่ยนหรือยัง" — คำตอบจิ๋ว ไม่แตะชีตเลย (อ่าน Script Property ตัวเดียว) ──
    // วัดจริง 5 ส.ค. 2026: ก้อน payload = 4.2MB · 15 เครื่องเปิดพร้อมกัน = 63MB ไหลผ่านท่อเดียว
    // ที่ ~2.3MB/วิ → 27 วินาที ซึ่งนานกว่าอายุลิงก์ดาวน์โหลดของ Google → **HTTP 404 กลางคัน**
    // (ยืนยันด้วย action=ping ที่ตอบ 0KB แล้วผ่านครบ 15/15 ทั้งที่ยิงพร้อมกันเท่ากัน)
    // → ตัวนี้ให้ client เทียบก่อนว่าก้อนที่ถืออยู่ยังตรงกับของบน server ไหม ตรง = ไม่ต้องโหลดซ้ำเลย
    // ⚠️ `dmj_last_write_ts` ขยับเฉพาะเมื่อแก้ข้อมูล **ผ่านแอป** — แก้ชีตด้วยมือใน Google Sheets
    // ไม่ขยับ (ข้อจำกัดเดิมของระบบ ไม่ใช่ของใหม่) client จึงต้องมีเพดานอายุกำกับเสมอ ห้ามเชื่อยาว
    if (e && e.parameter && e.parameter.action === 'ver') {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, ts: getSheetLastModified_() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ── Phase 7.4: ก้อนเบาสำหรับ poll ทุก 30 วิ (แท็บนับสต็อก / เช็คหน้าร้าน) ──
    if (e && e.parameter && e.parameter.action === 'stocklite') {
      return stockLiteHandler_();
    }
    if (e && e.parameter && e.parameter.action === 'order') {
      return handleOrder_(e.parameter);
    }
    // "คำสั่งนี้เข้าระบบไปแล้วหรือยัง" — ใช้ตอน response ของ action=order หายกลางทาง
    // (เน็ตร้าน/มือถือหลุดบ่อย) frontend จะได้บอกความจริงแทนการขึ้นแดงทั้งที่ของถูกสั่งแล้ว
    if (e && e.parameter && e.parameter.action === 'orderCheck') {
      var _cidQ = String(e.parameter.cid || '').trim();
      var _shQ  = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ORDERS);
      var _rowQ = (_shQ && _cidQ) ? findOrderRowByCid_(_shQ, _cidQ) : -1;
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, found: _rowQ > 0, orderId: _rowQ > 0 ? _rowQ - 2 : null }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // "ชุดที่กดส่งขึ้นรถนี้ ลงระบบไปแล้วหรือยัง" — ใช้ตอนคำตอบของ transferStockBatch หายกลางทาง
    // โอนทีละหลายสิบ SKU ใช้เวลานานกว่าเพดานเวลาฝั่ง browser → browser ตัดสายทั้งที่ GAS
    // ยังเขียนชีต + สร้างเอกสารโอนใน ZORT ต่อจนจบ · ถ้าไม่ถามก่อน frontend จะขึ้น "ส่งไม่สำเร็จ"
    // ทั้งที่ของโอนไปแล้ว แล้วผู้ใช้กดซ้ำ = โอนสองเด้ง (หลักเดียวกับ action=orderCheck)
    if (e && e.parameter && e.parameter.action === 'transferCheck') {
      return transferCheckHandler_(String(e.parameter.tid || '').trim());
    }
    // "มีอะไรถูกโอนคลัง→หน้าร้านไปแล้วบ้างช่วงนี้" — ประวัติจริงจากชีต "รายการโอนสินค้า"
    // ใช้ตอบคำถาม "ตกลงของอันไหนส่งไปแล้วกันแน่" หลังกดส่งแล้วคำตอบหายกลางทาง
    // ⚠️ ต้องอ่านสด **ไม่ผ่าน cache** — คนถามตอนนี้คือคนที่ไม่แน่ใจว่าของไปหรือยัง
    //    ตอบด้วยของเก่าค้าง cache = เขาจะเคลียร์ผิดตัว · ก้อนเล็ก (ไม่กี่ร้อยแถว) จึงไม่ต้อง cache
    if (e && e.parameter && e.parameter.action === 'recentTransfers') {
      return recentTransfersHandler_(Number(e.parameter.days) || 3);
    }
    // ค้นเอกสารโอนจาก "เลขที่ ZORT" — ใช้ตอน ZORT มีของฝ่ายเดียว ชีตเราไม่มีบันทึก
    if (e && e.parameter && e.parameter.action === 'zortTransfer') {
      return zortTransferHandler_(String(e.parameter.number || '').trim());
    }
    // เติมแถวชีตโอนที่ขาดหาย (ไม่แตะสต็อก ไม่ยิง ZORT) ผ่าน URL — สำรองไว้เมื่อ GAS editor
    // ของเจ้าของมีปัญหาแคช/เปิดผิดโปรเจกต์แล้วรัน repairZortTransferLog() ตรง ๆ ไม่ได้
    // (เจอจริง ส.ค. 2026 — TF-202608035) ปลอดภัยเพราะ repairZortTransferLog เทียบราย SKU
    // ก่อนเขียนเสมอ (ดูฟังก์ชันนั้น) เรียกซ้ำกี่ครั้งก็ไม่ซ้ำ
    if (e && e.parameter && e.parameter.action === 'repairTransferLog') {
      return repairTransferLogHandler_(String(e.parameter.number || '').trim());
    }
    // กู้สถานะ "รับของแล้ว" จาก Audit Log ผ่าน URL (ดู previewTransferReceiptsFromAudit /
    // applyTransferReceiptsFromAudit — ตัวนี้แค่ห่อให้เรียกได้เมื่อ GAS editor ใช้ไม่ได้)
    if (e && e.parameter && e.parameter.action === 'previewTransferReceipts') {
      return previewTransferReceiptsHandler_(String(e.parameter.number || '').trim());
    }
    if (e && e.parameter && e.parameter.action === 'applyTransferReceipts') {
      return applyTransferReceiptsHandler_(String(e.parameter.number || '').trim());
    }
    // ตรวจ PIN เจ้าของฝั่ง server (PIN ไม่อยู่ใน source โค้ด frontend)
    // ตั้งค่าใน Script Property ชื่อ OWNER_PIN; ถ้าไม่ตั้ง ใช้ค่า default 'DMJ' (backward compatible)
    if (e && e.parameter && e.parameter.action === 'verifyPin') {
      const expected = (PropertiesService.getScriptProperties().getProperty('OWNER_PIN') || 'DMJ').trim();
      const okPin = String(e.parameter.pin || '').trim() === expected;
      return ContentService
        .createTextOutput(JSON.stringify({ ok: okPin }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // Channel ID ของ LINE Login (ไม่ใช่ความลับ — ใช้ประกอบ authorize URL ฝั่ง frontend)
    // debug=1 → บอกความยาว/รูปแบบค่าที่ตั้งไว้ (ไม่เปิดเผย secret) ไว้ไล่ปัญหา LINE 400
    if (e && e.parameter && e.parameter.action === 'lineLoginMeta') {
      const meta = { channelId: LINE_LOGIN_CHANNEL_ID || "" };
      if (e.parameter.debug === '1') {
        const rawId  = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID') || '';
        const rawSec = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_SECRET') || '';
        meta.diag = {
          channelIdLen: LINE_LOGIN_CHANNEL_ID.length,
          channelIdIsDigits: /^\d+$/.test(LINE_LOGIN_CHANNEL_ID),
          channelIdHadWhitespace: rawId !== rawId.trim(),
          secretSet: !!rawSec.trim(),
          secretLen: rawSec.trim().length,
          secretHadWhitespace: rawSec !== rawSec.trim(),
        };
      }
      return ContentService.createTextOutput(JSON.stringify(meta))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // รูปลงเวลา — ไฟล์ใน Drive ไม่ได้แชร์สาธารณะ (ข้อมูลส่วนบุคคลของพนักงาน)
    // จึงต้องดึงผ่าน proxy นี้ และเปิดได้เฉพาะเจ้าของที่ล็อกอินอยู่เท่านั้น
    if (e && e.parameter && e.parameter.action === 'attendancePhoto') {
      const ssP = SpreadsheetApp.openById(SHEET_ID);
      const sP = resolveSession_(ssP, e.parameter.sessionToken);
      if (!sP || !isAdminRole_(sP.role) || sP.status !== 'active') return unauthorized_();
      try {
        const f = DriveApp.getFileById(String(e.parameter.id || ''));
        const b = f.getBlob();
        return ContentService.createTextOutput(JSON.stringify({
          d: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()),
        })).setMimeType(ContentService.MimeType.JSON);
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ error: 'ไม่พบรูป' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
    // Audit Log endpoint: ดึง 200 แถวล่าสุดจาก Audit Log sheet
    // เฉพาะ owner เท่านั้น — เดิมเช็คจาก e.parameter.role ที่ frontend ไม่เคยส่งมาเลย
    // (ไม่มีการันตี → getAuditLog ปฏิเสธทุกครั้ง หน้า Audit Log เลยว่างเปล่าไม่มี error ให้เห็น)
    // เปลี่ยนเป็นตรวจ session จริงเหมือน attendancePhoto แทน
    if (e && e.parameter && e.parameter.action === 'getAuditLog') {
      const ssA = SpreadsheetApp.openById(SHEET_ID);
      const sA = resolveSession_(ssA, e.parameter.sessionToken);
      if (!sA || !isAdminRole_(sA.role) || sA.status !== 'active') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = ssA;
      const sh = ss.getSheetByName(SHEET_AUDIT);
      if (!sh) {
        return ContentService.createTextOutput(JSON.stringify({ rows: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const vals = sh.getDataRange().getValues();
      // skip header row (row 0), เอา 200 แถวล่าสุด แล้ว reverse ให้ใหม่สุดขึ้นก่อน
      const rows = vals.slice(1).slice(-200).reverse().map(function(r) {
        return {
          ts:       r[0] ? new Date(r[0]).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "",
          actor:    r[1] || "",
          action:   r[2] || "",
          resource: r[3] || "",
          sku:      r[3] || "", // เดิม — คงไว้ชั่วคราวเพื่อ backward compat, ลบใน release ถัดไปหลังยืนยันไม่มี consumer ใช้แล้ว
          detail:   r[4] || "",
        };
      });
      return ContentService.createTextOutput(JSON.stringify({ rows: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 🏅 สรุปผลงานพนักงานรายเดือน — รวมยอดฝั่ง server จาก Audit Log + ชีตลงเวลา
    // (ตรวจ session จริงข้างในเหมือน getAuditLog — owner/dev เท่านั้น)
    if (e && e.parameter && e.parameter.action === 'staffPerf') {
      return staffPerfHandler_(e);
    }

    // สินค้าจม: ดึงสินค้าที่มีในหน้าร้านแต่ไม่ได้รับโอนมานานกว่า 3 เดือน
    if (e && e.parameter && e.parameter.action === 'getDeadStock') {
      return handleGetDeadStock_();
    }

    // ใบเสนอราคาค้าง (Pending): ดีลที่รอลูกค้าตัดสินใจ พร้อมข้อมูลติดต่อ — ไว้ตามปิดการขาย
    if (e && e.parameter && e.parameter.action === 'getPendingQuotations') {
      return handleGetPendingQuotations_();
    }

    // ร่างใบเสนอราคาที่ยังไม่ส่งเข้า ZORT (บันทึกไว้ทำต่อทีหลัง)
    if (e && e.parameter && e.parameter.action === 'getQuotationDrafts') {
      return getQuotationDrafts(SpreadsheetApp.openById(SHEET_ID));
    }

    // รายละเอียดใบเสนอราคาเดิม (สำหรับพิมพ์ A4 ย้อนหลัง จากหน้าติดตามสถานะ)
    if (e && e.parameter && e.parameter.action === 'getQuotationForPrint') {
      return getQuotationForPrint(e.parameter.id || e.parameter.number);
    }

    // สรุปสถานะใบเสนอราคา (ทุกสถานะ อนุมัติ/รอ/ยกเลิก) — คืน raw ทั้งหมดให้ frontend รวมเอง
    if (e && e.parameter && e.parameter.action === 'getQuotationSummary') {
      return handleGetQuotationSummary_();
    }

    // สรุปลูกค้า: ยอดซื้อต่อเดือน + Top ลูกค้า + สินค้าที่ซื้อบ่อย (อ่านจากชีตที่ syncZortSales เขียนไว้)
    if (e && e.parameter && e.parameter.action === 'getCustomerAnalytics') {
      return handleGetCustomerAnalytics_();
    }

    // Health check: สัญญาณสุขภาพระบบ (จำนวนสินค้า, หน้าร้าน/คลังเป็น 0, ติดลบ, orphan, ค้างรับ)
    // ใช้ตรวจระบบจากภายนอกได้โดยไม่ต้องดึง payload เต็ม (token-gated แล้วด้านบน)
    if (e && e.parameter && e.parameter.action === 'selfcheck') {
      return ContentService.createTextOutput(JSON.stringify(computeHealth_()))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // แจ้งเตือนในแอป (กระดิ่ง) — frontend poll ทุก ~25 วิ ทุกแท็บ
    // ตรวจ session จริงเหมือน attendancePhoto/getAuditLog (ไม่เชื่อ role จาก query param)
    if (e && e.parameter && e.parameter.action === 'inappNoti') {
      return listInappNotiHandler_(e);
    }

    // ⭐ ใครดูแลสินค้าตัวไหน — endpoint แยกจาก payload หลักโดยตั้งใจ
    // (payload cache แยกตาม role ไม่ใช่ตามคน → ยัดลงไปจะเห็นดาวของคนอื่น)
    if (e && e.parameter && e.parameter.action === 'productOwners') {
      return listProductOwnersHandler_(e);
    }

    // Lightweight endpoint: ดึงเฉพาะรายการสั่งของ (เบา/เร็ว) สำหรับ polling หน้า orders
    if (e && e.parameter && e.parameter.action === 'orders') {
      const ordersResult = readOrders_();
      // ถ้า Sheet หาไม่เจอ readOrders_ คืน [] — คืน error แทนเพื่อให้ client skip update (ไม่ wipe)
      const ss2 = SpreadsheetApp.openById(SHEET_ID);
      if (!ss2.getSheetByName(SHEET_ORDERS)) {
        return ContentService
          .createTextOutput(JSON.stringify({ error: "sheet_not_found", orders: null }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ orders: ordersResult, generatedAt: new Date().toISOString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Debug endpoint: คืน raw row data ของชีตคำสั่งซื้อ (ใช้วินิจฉัย missing rows)
    // เฉพาะ owner เท่านั้น — ป้องกัน raw sheet data รั่วให้ role อื่น
    if (e && e.parameter && e.parameter.action === 'debugOrders') {
      if (!isAdminRole_(e.parameter.role)) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss2 = SpreadsheetApp.openById(SHEET_ID);
      const sh2 = ss2.getSheetByName(SHEET_ORDERS);
      if (!sh2) return ContentService.createTextOutput(JSON.stringify({ error: "ไม่พบชีต" })).setMimeType(ContentService.MimeType.JSON);
      const rawRows = sh2.getDataRange().getValues().slice(0, 15).map(function(r, i) {
        return { rowIndex: i, rowNum: i + 1, cols: r.map(function(v) { return v instanceof Date ? v.toISOString() : v; }) };
      });
      return ContentService.createTextOutput(JSON.stringify({ sheet: SHEET_ORDERS, rows: rawRows }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Image Proxy: fetch รูปจาก ZORT CDN แล้วคืนเป็น base64 dataURI ──
    // ไม่ require token เพราะเป็น pass-through ของ URL สาธารณะจาก ZORT CDN
    if (e && e.parameter && e.parameter.action === 'imgProxy' && e.parameter.u) {
      try {
        var imgResp = UrlFetchApp.fetch(String(e.parameter.u), {
          muteHttpExceptions: true,
          followRedirects: true,
          validateHttpsCertificates: true
        });
        if (imgResp.getResponseCode() !== 200) {
          return ContentService.createTextOutput(JSON.stringify({ err: 'not_found' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
        var imgBlob = imgResp.getBlob();
        var b64 = Utilities.base64Encode(imgBlob.getBytes());
        var mime = imgBlob.getContentType() || 'image/jpeg';
        return ContentService.createTextOutput(
          JSON.stringify({ d: 'data:' + mime + ';base64,' + b64 })
        ).setMimeType(ContentService.MimeType.JSON);
      } catch(ex) {
        return ContentService.createTextOutput(JSON.stringify({ err: String(ex) }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Server-side cache: payload หนัก (อ่าน 11 ชีต) → cache ไว้ ~3 นาที ลดโหลด/timeout
    // ?fresh=1 หรือหลังมีการแก้ข้อมูล (doPost ล้าง cache) จะคำนวณใหม่
    // หมายเหตุ: lastModified อ่านสด ๆ เสมอแม้ serve จาก cache
    //           เพื่อให้ conflict detection ฝั่ง client ทำงานได้จริง
    // PERF (Phase 0): จับเวลาเส้นทาง payload ทั้งเส้น — เดิมวัดแต่ `buildFullData_`
    // ซึ่งเป็นเส้นทางที่เกิดน้อยที่สุด ส่วนเส้นทาง cache hit (เกิดบ่อยที่สุด) ไม่เคยถูกวัดเลย
    // และ Executions list ก็บอกได้แค่ "รวมกี่วินาที" ไม่บอกว่า hit หรือ miss → แยกไม่ออกว่า
    // ที่ช้าเพราะ build หรือเพราะ cache เองก็ช้า · ต้นทุนบรรทัดนี้ = Date.now() + Logger.log
    const _tReq = Date.now();
    const wantFresh = e && e.parameter && e.parameter.fresh === '1';
    const variant = payloadVariantForRole_(e && e.parameter && e.parameter.role);
    const enc     = payloadEncodingForRequest_(e);
    const cacheVariant = payloadCacheVariant_(variant, enc);
    // แทรก lastModified สด ๆ ลงใน cached payload ก่อน return
    // แทนที่ค่าใน JSON string ตรง ๆ เพื่อความเร็ว (ไม่ parse ทั้งก้อน)
    const serveCached = function (str, kind) {
      const patched = str.replace(/"lastModified"\s*:\s*\d+/, '"lastModified":' + getSheetLastModified_());
      perfLogDoGet_(kind, cacheVariant, _tReq, patched.length);
      return ContentService.createTextOutput(patched).setMimeType(ContentService.MimeType.JSON);
    };
    if (!wantFresh) {
      const cached = getCachedPayload_(cacheVariant);
      if (cached) return serveCached(cached, 'HIT');
    }

    // ─────────────────────────────────────────────────────────────────────
    // Phase 7.3 — single-flight + stale-while-rebuild
    // ─────────────────────────────────────────────────────────────────────
    // เดิม: cache miss → `buildFullData_()` เลย โดยไม่มีอะไรกันไม่ให้หลายคนทำพร้อมกัน
    // พอมีใครบันทึกอะไร (`invalidateCache_`) หรือ TTL หมด → ทุกเครื่องที่ poll ในวินาทีถัดไป
    // miss พร้อมกันแล้วสั่ง build พร้อมกันทั้งหมด · วัดจริง 5 ส.ค. 2026 (docs/PHASE0-RESULTS.md):
    // 15 request พร้อมกัน → **87-93% ได้หน้า HTML แทน JSON, มัธยฐาน 41-52 วิ, ช้าสุด 115 วิ**
    // นี่คือสิ่งที่พนักงานเจอทุกเช้าที่เปิดแอปพร้อมกัน ไม่ใช่กรณีขอบ
    //
    // ตอนนี้: คนแรกที่คว้าล็อกได้ build คนเดียว · คนที่เหลือได้ "ของสำรอง" (ชุดก่อนหน้า
    // ที่ยังไม่ถูกล้าง) กลับไปทันทีในหลักร้อย ms แทนที่จะไปต่อคิว build ทีละ 10 วินาที
    let buildLock = acquireBuildLock_(0);

    // ผู้ที่คว้าล็อกไม่ได้ = มีคนกำลัง build อยู่ → เสิร์ฟของสำรองไปก่อน
    // ⚠️ **ห้ามปั๊ม `lastModified` สดลงในก้อนนี้** (ต่างจากเส้นทาง HIT) — ของสำรองคือข้อมูล
    // ก่อนการบันทึกล่าสุด ถ้าปั๊มเป็นเวลาปัจจุบัน client จะเข้าใจว่าถืออยู่คือข้อมูลล่าสุด
    // → conflict detection ปล่อยผ่าน → **เขียนทับงานคนอื่นเงียบ ๆ** ซึ่งแย่กว่าเห็นข้อมูลช้า
    // ปล่อยให้ `lastModified` เป็นค่าเดิมที่ติดมากับก้อน = server ปฏิเสธการเขียนที่อิงของเก่าถูกต้อง
    if (!buildLock && !wantFresh) {
      const stale = readStalePayload_(cacheVariant);
      if (stale.str) {
        const outStale = markStalePayload_(stale.str, stale.ts);
        perfLogDoGet_('STALE', cacheVariant, _tReq, outStale.length,
          ' อายุ=' + Math.round((Date.now() - (stale.ts || Date.now())) / 1000) + 'วิ');
        return ContentService.createTextOutput(outStale).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // มาถึงตรงนี้ได้ 2 กรณี: (1) ไม่มีของสำรองเลย (เพิ่ง deploy / cache เย็นสนิท)
    // (2) ผู้ใช้กดปุ่ม Sync เอง (`fresh=1`) ซึ่งขอข้อมูลใหม่จริง ๆ จะเอาของสำรองให้ไม่ได้
    // → รอคิว build ของคนแรกแทนการ build ซ้อน (15 คนกด "ลองใหม่" พร้อมกันตอนเจอ error
    //   คือจังหวะที่ระบบกำลังแย่อยู่แล้ว ยิ่ง build ซ้อนยิ่งพังหนัก)
    if (!buildLock) {
      buildLock = acquireBuildLock_(_BUILD_LOCK_WAIT_MS);
      const after = readFreshPayload_(cacheVariant);
      // สำหรับคนกด Sync: รับของที่คนอื่น build ไว้ **เฉพาะที่ build หลังคำขอเราเริ่ม**
      // ไม่งั้นจะได้ก้อนที่ build ก่อนหน้าไปแล้ว ซึ่งอาจยังไม่มีสิ่งที่เขากด Sync มาหา
      if (after.str && (!wantFresh || after.ts >= _tReq)) {
        releaseBuildLock_(buildLock);
        return serveCached(after.str, 'WAIT-HIT');
      }
      // รอจนหมดเวลาแล้วยังไม่มีของ → build เองแม้ไม่ได้ล็อก
      // ยอมให้ build ซ้อนในกรณีนี้ ดีกว่าปล่อยให้ผู้ใช้ได้หน้าเปล่าโดยไม่มีอะไรเลย
    }

    try {
      // จำไว้ก่อนว่ารอบนี้ถือล็อกมาหรือเปล่า — ด้านล่างมีการ set `buildLock = null`
      // ถ้าไปอ่าน `buildLock` ทีหลังจะได้ null เสมอ แล้ว log จะรายงานว่า "build ซ้อน" ทุกครั้ง
      // ทั้งที่ single-flight ทำงานปกติ = ตัวเลขที่ทำให้สรุปผิดว่าตัวแก้ไม่ได้ผล
      const hadLock = !!buildLock;
      // build ครั้งเดียว (แพงสุดในเส้นทาง) แล้วแตกเป็นทุก variant เก็บ cache ให้ครบในรอบเดียว
      // ถ้าเก็บเฉพาะ variant ที่ขอ role อื่นที่มาทีหลังจะ miss แล้ว build ใหม่ทั้งก้อนอีกรอบ
      const data = buildFullData_();
      const _tBuilt = Date.now();
      let out = null;
      PAYLOAD_VARIANTS_.forEach(function (v) {
        const s = JSON.stringify(shapePayloadForVariant_(data, v));
        const cv = payloadCacheVariant_(v, 2);
        putCachedPayload_(s, cv);
        putStalePayload_(s, cv);   // Phase 7.3: เขียนชั้นสำรองคู่กันเสมอ
        if (v === variant && enc === 2) out = s;
      });
      // client เวอร์ชันเก่า (ไม่ส่ง pv) — กางกลับเป็นรูปแบบเดิมแล้ว cache แยกคีย์
      // ทำเฉพาะ variant ที่ถูกขอจริง ไม่ทำเผื่อทุกตัว เพราะเป็นทางผ่านชั่วคราวช่วง deploy เท่านั้น
      if (out == null) {
        out = JSON.stringify(shapePayloadForVariant_(expandMonthlyForLegacy_(data), variant));
        putCachedPayload_(out, cacheVariant);
        putStalePayload_(out, cacheVariant);
      }
      // ปล่อยล็อกทันทีที่ cache พร้อมให้คนอื่นอ่านแล้ว — ที่เหลือด้านล่างเป็น "การวัดผล" ล้วน
      // `logPayloadSizes_` stringify ทุกคีย์ + `mo` ของสินค้าทุกตัวเพื่อวัดขนาด (หลายร้อย ms)
      // ถือล็อกคร่อมมันไว้ = คนที่รอคิวอยู่ต้องรอ "ต้นทุนของเครื่องมือวัด" ไม่ใช่ต้นทุนของงานจริง
      // (finally ด้านล่างยังทำงานปกติ — `releaseBuildLock_` กัน error ให้แล้วถ้าปล่อยซ้ำ)
      releaseBuildLock_(buildLock);
      buildLock = null;
      // แยก "เวลา build" ออกจาก "เวลา stringify+เขียน cache ทุก variant" — ก้อนหลังเดิมมองไม่เห็นเลย
      // ถ้าก้อนหลังหนัก การไปเร่ง buildFullData_ อย่างเดียวจะไม่ช่วยอะไร (ดู perfMeasureBuild)
      //
      // ⚠️ **ต้องเรียกก่อน `logPayloadSizes_` เสมอ** — ตัวนั้น JSON.stringify ทุกคีย์ + `mo`
      // ของสินค้าทุกตัวเพื่อวัดขนาด ซึ่งเป็นต้นทุนของ "เครื่องมือวัด" ไม่ใช่ของเส้นทางจริง
      // สลับลำดับเมื่อไหร่ `shape+cache=` จะโป่งด้วยเวลาของตัววัดเอง แล้วสรุปผิดว่า payload หนัก
      // (เครื่องมือวัดที่วัดตัวเองรวมไปด้วย = ตัวเลขที่ทำให้จูนผิดจุดอย่างมั่นใจ)
      perfLogDoGet_(wantFresh ? 'FRESH' : 'MISS', cacheVariant, _tReq, out.length,
        ' build=' + (_tBuilt - _tReq) + 'ms shape+cache=' + (Date.now() - _tBuilt) + 'ms'
        + (hadLock ? '' : ' (build ซ้อน — รอคิวไม่ทัน)'));
      logPayloadSizes_(data, cacheVariant, out.length);
      return ContentService.createTextOutput(out)
        .setMimeType(ContentService.MimeType.JSON);
    } finally {
      // ปล่อยล็อก **หลังเขียน cache เสร็จแล้วเท่านั้น** — ปล่อยก่อนหน้านั้นคนที่รออยู่จะตื่นมา
      // เจอ cache ว่างแล้ว build ซ้ำ ซึ่งคือปัญหาเดิมที่กำลังแก้อยู่พอดี
      releaseBuildLock_(buildLock);
    }
  } catch (error) {
    console.error("doGet Error:", error);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.message, stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// สร้าง data payload เต็ม (ชุดเดียวกับที่เว็บได้รับผ่าน doGet) — แยกออกมาเป็นฟังก์ชัน
// เพื่อให้ backupToSupabase_() reuse ได้ ข้อมูลสำรองจะตรงกับที่เว็บเห็นเป๊ะ ไม่ต้องเขียน enrich ซ้ำ
function buildFullData_() {
    // ── PERF: จับเวลาแต่ละขั้นเพื่อรู้ว่าเวลาไปอยู่ตรงไหนจริง ๆ ──
    // Date.now() แทบไม่มีต้นทุน · log บรรทัดเดียวตอนจบ (build เกิดเฉพาะตอน cache หมดอายุ)
    // ดูผลได้ที่ Executions log — ใช้ตัดสินใจว่าจะไปเร่งตรงไหนต่อ
    const _tStart = Date.now();
    const _ms = {};
    let _tPrev = _tStart;
    const _mark = function (name) { const n = Date.now(); _ms[name] = n - _tPrev; _tPrev = n; };

    // ── PERF: ดึงทุกชีตที่อ่านแบบ displayValues มาในคำสั่งเดียว (batchGet) ──
    // เดิมอ่านทีละชีต = วิ่งไป-กลับ Google server หลายรอบ ซึ่งกินเวลา ~96% ของ build
    // ถ้า batchGet ใช้ไม่ได้ จะได้ null ทุกตัว → ทุก read fallback อ่านเองแบบเดิม
    // (readPurchases_/readQtyByLocation_ ไม่รวมในนี้ เพราะใช้ getValues() = ค่าดิบ
    //  ซึ่ง batchGet คืนวันที่เป็นเลข serial ไม่ใช่ Date object → parse เพี้ยน)
    const B = batchReadFormatted_([
      SHEET_PRODUCTS, SHEET_PRODUCT_META, SHEET_MONTHLY_SALES, SHEET_DAILY_SALES,
      SHEET_TRANSFERS_HIST, SHEET_TRANSFERS, SHEET_LOCKS, SHEET_ORDERS,
      SHEET_FRONTSTORE_QTY,
    ]);
    _mark('batchGet');

    // ชีตสต็อกใช้ร่วมกันระหว่าง readProducts_ (self-heal) กับ readSysQty_
    const stockRows = B[SHEET_PRODUCTS] || readStockSheetRows_();  _mark('stockSheet');
    const products  = readProducts_(stockRows, B[SHEET_PRODUCT_META]); _mark('products');
    const sysQtyMap = readSysQty_(stockRows);                      _mark('sysQty');
    const monthly   = readMonthlySales_(B[SHEET_MONTHLY_SALES]);   _mark('monthlySales');
    const daily     = readDailySales_(B[SHEET_DAILY_SALES]);       _mark('dailySales');
    const transfers = readTransfers_(B[SHEET_TRANSFERS_HIST]);     _mark('transfers');
    const shipments = readShipments_(B[SHEET_TRANSFERS]);          _mark('shipments');
    const purchases = readPurchases_();           _mark('purchases');
    const storage   = readStorage_(B[SHEET_LOCKS]);                _mark('storage');
    const orders    = readOrders_(B[SHEET_ORDERS]);                _mark('orders');
    const mtoJobs   = readMtoJobs_();             _mark('mtoJobs');
    const frontStoreQtys = readFrontStoreCheckedQty_(B[SHEET_FRONTSTORE_QTY]); _mark('frontStoreQty');
    const qtyLoc    = readQtyByLocation_();       _mark('qtyByLocation');
    const transferHist = readTransferHistory_();  _mark('transferHist'); // วันโอนสาย5→หน้าร้านล่าสุด ต่อ SKU
    const unscannedMap = readUnscannedSalesMap_(); _mark('unscanned');   // ขายไม่สแกน (นับสต็อกแล้วของหาย=ขายออก) → บวกเข้า soldQty ไม่แตะยอดเงิน

    const whRatio = wholesaleRatio_();  // ปลีก→ขายส่ง (อ่านครั้งเดียวต่อ build)

    // ── PERF: index purchases/transfers ต่อ SKU ครั้งเดียวก่อนเข้า loop ──
    // เดิม loop สินค้าเรียก purchases.filter()/transfers.filter() สแกน array ทั้งก้อนใหม่ทุกตัว
    // = O(สินค้า × รายการ) ซึ่งกับสินค้า 5,600+ ตัวคือหลายสิบล้านรอบต่อการ build payload 1 ครั้ง
    // เปลี่ยนเป็น O(สินค้า + รายการ) — ผลลัพธ์เหมือนเดิมทุกประการ
    // (ใช้ Object.create(null) กัน SKU ที่บังเอิญชนชื่อ property ของ Object.prototype)
    const purchasesBySku = Object.create(null);
    purchases.forEach(pu => {
      (purchasesBySku[pu.sku] || (purchasesBySku[pu.sku] = [])).push(pu);
    });
    // เรียงใหม่→เก่า ครั้งเดียวต่อ SKU (comparator เดิม) แทนที่จะ sort ซ้ำทุกสินค้า
    Object.keys(purchasesBySku).forEach(k => {
      purchasesBySku[k].sort((a, b) => (a.date < b.date ? 1 : -1));
    });

    // รวมยอด "ปรับ" ต่อ SKU ครั้งเดียว (เดิม filter transfers ใหม่ทุกสินค้า)
    const adjustBySku = Object.create(null);
    transfers.forEach(t => {
      if (t.type !== 'ปรับ') return;
      const a = adjustBySku[t.sku] || (adjustBySku[t.sku] = { count: 0, qty: 0 });
      a.count++;
      a.qty += t.qty;
    });
    _mark('index');

    products.forEach(p => {
      // normalize SKU ก่อน lookup — กัน qty จากชีต "ข้อมูลสินค้า" (เก่า) รั่วมาโชว์
      // เมื่อรหัสในชีต "อัพเดทจำนวนสินค้า" พิมพ์ต่าง case/ช่องว่าง (ที่อื่นในระบบใช้ trim().toUpperCase() หมด)
      const skuU = (p.sku || '').toString().trim().toUpperCase();
      applyQtyLocToProduct_(p, qtyLoc[skuU]);

      const m = monthly.perSku[p.sku] || monthly.perSku[skuU];
      if (m) {
        // ── PERF: ส่งยอดรายเดือนแบบย่อ `mo` แทน array เต็ม `monthly` ──
        // เดิมส่ง {month:"07/2026",qty:0,sales:0} ครบทุกเดือนต่อสินค้าทุกตัว (~39 ตัวอักษร/เดือน)
        // สินค้า 5,600 ตัว × เดือนสะสมตั้งแต่เปิดร้าน = payload หลาย MB และ**โตขึ้นทุกเดือน**
        // ทั้งที่ส่วนใหญ่เป็นเลข 0 (สินค้าหนึ่งตัวขายจริงไม่กี่เดือน)
        // ใหม่: [ดัชนีเดือนใน monthLabels, qty, sales] เฉพาะเดือนที่มียอดจริง (~10 ตัวอักษร)
        // → frontend กางกลับเป็น `p.monthly` เต็มรูปแบบเดิมใน enrichData (ข้อมูลเท่าเดิมเป๊ะ)
        // ⚠️ ต้องส่ง `mo` เสมอแม้เป็น array ว่าง — การ "มีคีย์ mo" = สินค้าตัวนี้มีแถวในชีตยอดขาย
        //    ซึ่ง OverviewView ใช้แยก "ไม่มีข้อมูลขาย" ออกจาก "มีข้อมูลแต่ขายไม่ได้" (p.monthly.length)
        const mo = [];
        for (let mi = 0; mi < monthly.monthLabels.length; mi++) {
          const cell = m.months[monthly.monthLabels[mi]];
          if (!cell) continue;
          const q = cell.qty || 0, s = cell.sales || 0;
          if (q === 0 && s === 0) continue;
          mo.push([mi, q, s]);
        }
        p.mo = mo;
        p.soldQty = m.totalQty;
        p.soldRev = m.totalRev;
        if (m.totalQty > 0 && p.price <= 0) p.price = m.totalRev / m.totalQty;
      }
      // ขายไม่สแกน: บวกจำนวนเข้า soldQty (ให้ velocity/ABC/ขายดี ถูกต้อง) แต่ไม่แตะ soldRev (เงินอยู่ใน MTO แล้ว)
      const unsc = unscannedMap[skuU] || 0;
      if (unsc > 0) {
        p.soldQtyUnscanned = unsc;
        p.soldQty = (p.soldQty || 0) + unsc;
      }
      p.cost       = p.price * COST_RATIO;
      p.profit     = p.soldRev * (1 - COST_RATIO);
      // มูลค่าสต๊อกคิดที่ **ราคาขายส่ง** (ปลีกจาก ZORT × wholesaleRatio) ตามที่เจ้าของใช้จริง
      // p.price ยังเป็นราคาปลีกเหมือนเดิม — ที่นี่แปลงเฉพาะตอนคูณเป็นมูลค่า
      p.stockValue      = p.qty     * p.price * whRatio;
      p.stockValueWH    = (p.qtyWH    || 0) * p.price * whRatio; // มูลค่าฝั่งคลัง
      p.stockValueStore = (p.qtyStore || 0) * p.price * whRatio; // มูลค่าฝั่งหน้าร้าน

      const sys = sysQtyMap[skuU];
      if (sys) {
        p.sysStore  = sys.sysStore;
        p.sysWH     = sys.sysWH;
        p.diffStore = p.qtyStore - sys.sysStore;
        p.diffWH    = p.qtyWH    - sys.sysWH;
      }
      // ใช้ ?? แทน || เพื่อให้ค่า 0 ที่บันทึกไว้จริงผ่านได้
      // ถ้าไม่มีในชีตเลย (undefined) → ส่ง null ให้ frontend รู้ว่า "ยังไม่เคยเช็ค"
      const fsChecked = frontStoreQtys[p.sku];
      p.frontStoreCheckedQty = fsChecked != null ? fsChecked.qty : null;
      p.frontStoreCheckedAt  = fsChecked != null && fsChecked.at ? fsChecked.at : null;

      const my = purchasesBySku[p.sku] || [];
      if (my.length > 0) {
        p.lastSupplier    = my[0].supplier;
        p.lastStockInDate = my[0].date ? my[0].date.split('-').reverse().join('/') : '';
        p.lastStockInQty  = my[0].qty;
        p.purchaseCount   = my.length;
      }

      // วันโอนสาย5→หน้าร้านล่าสุด (yyyy-MM-dd) → ใช้คำนวณสินค้าจมฝั่ง frontend
      const th = transferHist[(p.sku || "").toUpperCase()];
      if (th) p.lastTransferDate = th;

      const adj = adjustBySku[p.sku];
      if (adj) {
        p.adjustments    = adj.count;
        p.adjustmentQty  = adj.qty;
      }
    });

    _mark('enrich');

    const mtoMap = {};
    products.filter(p => p.isMTO).forEach(p => {
      const k = p.cat || 'MTO';
      mtoMap[k] = mtoMap[k] || { base: k, variants: [], totalQty: 0, totalRev: 0 };
      mtoMap[k].variants.push(p);
      mtoMap[k].totalQty += p.qty;
      mtoMap[k].totalRev += p.soldRev || 0;
    });

    const productLockMap = {}, unassigned = [];
    products.forEach(p => {
      if (!p.locations || p.locations.length === 0) { unassigned.push(p.sku); return; }
      p.locations.forEach(loc => {
        const key = lockKeyOf_(loc);
        productLockMap[key] = productLockMap[key] || [];
        productLockMap[key].push(p.sku);
      });
    });

    const transferStats = { 'โอน':{count:0,qty:0}, 'ปรับ':{count:0,qty:0}, 'ยกมา':{count:0,qty:0} };
    transfers.forEach(t => {
      if (transferStats[t.type]) { transferStats[t.type].count++; transferStats[t.type].qty += t.qty; }
    });

    const data = {
      generatedAt: new Date().toISOString(),
      lastModified: getSheetLastModified_(), // epoch ms — ใช้ตรวจ conflict ฝั่ง client
      updatedAt: {
        product:          PropertiesService.getScriptProperties().getProperty('upd_product') || null,
        monthlysales:      PropertiesService.getScriptProperties().getProperty('upd_monthlysales') || null,
        dailysales:        PropertiesService.getScriptProperties().getProperty('upd_dailysales') || null,
        transferDetail:    PropertiesService.getScriptProperties().getProperty('upd_transferDetail') || null,
        transactionDetail: PropertiesService.getScriptProperties().getProperty('upd_transactionDetail') || null,
      },
      products,
      orders,
      mtoJobs,
      monthLabels:  monthly.monthLabels,
      monthlyByCat: monthly.monthlyByCat,
      dayLabels:    daily.dayLabels,
      dailyByCat:   daily.dailyByCat,
      transfers, transferStats,
      shipments,
      purchases,
      storage: {
        verifiedLockMap: storage.lockMap,
        productLockMap,
        unassigned,
        shelves: { A: 10, B: 10, locksPerShelf: 15 }
      },
      totals: {
        nProducts:       products.length,
        nWithStock:      products.filter(p => p.qty > 0).length,
        nOOS:            products.filter(p => p.isOOS).length,
        nOversold:       products.filter(p => p.isOversold).length,
        nMismatch:       products.filter(p => p.diffStore || p.diffWH).length,
        totalStockValue:      products.reduce((s, p) => s + (p.stockValue || 0), 0),
        totalStockValueWH:    products.reduce((s, p) => s + (p.stockValueWH || 0), 0),
        totalStockValueStore: products.reduce((s, p) => s + (p.stockValueStore || 0), 0),
        totalSoldRev:    products.reduce((s, p) => s + (p.soldRev || 0), 0),
        totalSoldQty:    products.reduce((s, p) => s + (p.soldQty || 0), 0),
        totalProfit:     products.reduce((s, p) => s + (p.profit || 0), 0),
        // จำนวน SKU ที่เคยมียอดขาย (ตลวดกาล) — frontend คำนวณเองรายช่วงเวลาอีกที
        // แต่ต้องมีคีย์นี้ไว้ ไม่งั้น fmtN(undefined) โชว์ 0 เงียบ ๆ
        nSold:           products.filter(p => (p.soldQty || 0) > 0).length,
        // ราคาขายส่ง = ปลีก × อัตรานี้ (มูลค่าสต๊อกด้านบนคูณไว้แล้ว) — ส่งมาให้ frontend ติดป้ายได้ถูก
        wholesaleRatio:  whRatio,
      },
      mtoGroups: Object.values(mtoMap),
      stockCheckRequests: readStockCheckRequests_().filter(function(r){ return r.status === "pending"; }),
      // SKU ที่เพิ่งถูกนับ (30 นาที) sku→qty — ให้ทุกเครื่องเห็นว่าใครนับอะไรไปแล้ว (นับพร้อมกันหลายเครื่อง)
      recentCountedSkus: (function(){
        try { var j = CacheService.getScriptCache().get('recentCountedSkus'); return j ? JSON.parse(j) : {}; }
        catch (e) { return {}; }
      })(),
      thresholds: readThresholds_(),
      _debug: {
        productsCount:   products.length,
        monthsLoaded:    monthly.monthLabels.length,
        daysLoaded:      daily.dayLabels.length,
        transfersCount:  transfers.length,
        purchasesCount:  purchases.length,
        verifiedLocks:   Object.keys(storage.lockMap).length,
        productLocks:    Object.keys(productLockMap).length,
        unassignedCount: unassigned.length,
        costRatio:       COST_RATIO,
      }
    };

    _mark('assemble');
    // สรุปเวลาแต่ละขั้น เรียงจากช้าไปเร็ว — ดูได้ที่ Executions log
    try {
      const _parts = Object.keys(_ms)
        .sort(function (a, b) { return _ms[b] - _ms[a]; })
        .map(function (k) { return k + '=' + _ms[k]; })
        .join(' ');
      // ขนาดชีตสต็อก (แถว×คอลัมน์) — ได้มาฟรีจากข้อมูลที่อ่านไว้แล้ว
      // ถ้าคอลัมน์กว้างกว่าที่ใช้จริงมาก แปลว่าคุ้มที่จะอ่านเฉพาะคอลัมน์ที่ต้องใช้ในรอบถัดไป
      const _dim = (stockRows && stockRows.length)
        ? ' · ชีตสต็อก ' + stockRows.length + 'แถว×' + (stockRows[0] || []).length + 'คอล'
        : '';
      Logger.log('[perf] buildFullData_ รวม ' + (Date.now() - _tStart) + 'ms · ' + _parts + _dim);
    } catch (e) {}

    return data;
}

// ───────────────────────────────────────────────────────────
// SECTION 3: Stock Operations
// ───────────────────────────────────────────────────────────

function transferStock(ss, sku, qty, productName, actor) {
  if (!sku || qty <= 0) return error("sku หรือ qty ไม่ถูกต้อง");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku.trim().toUpperCase()) {
        const row   = i + 1;
        const whQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
        const fsQty = Number(data[i][COL_PROD_QTYFS - 1]) || 0;
        const actual = Math.min(qty, whQty);

        const name = productName || String(data[i][2] || "").trim();
        sheet.getRange(row, COL_PROD_QTYWH).setValue(whQty - actual);
        sheet.getRange(row, COL_PROD_QTYFS).setValue(fsQty + actual);
        SpreadsheetApp.flush();
        try { logTransfer_(ss, sku, name, actual, actor); } catch (e) { Logger.log("logTransfer_ error: " + e); }
        // AddTransfer ย้ายสต็อกใน ZORT ให้อยู่แล้ว ไม่ push absolute ทับ (กันเขียนทับยอดขายที่เกิดระหว่างนั้น)
        try { createZortTransfer_(sku, name, actual); } catch (e) { Logger.log("createZortTransfer_ error: " + e); }
        return ok({ sku, transferred: actual, newWH: whQty - actual, newFS: fsQty + actual });
      }
    }
    return error("ไม่พบ SKU: " + sku);
  } finally {
    lock.releaseLock();
    invalidateCache_();
  }
}

// ─── ตั้ง WH qty=0 ใน Sheets + ZORT (สินค้าหมด ไม่ได้จัด) ───
// เรียกจาก doPost เมื่อ data.zeroStock = true
function zeroStockItem_(ss, sku, actor) {
  if (!sku) return error("sku ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    const data = sheet.getDataRange().getValues();
    const skuUpper = String(sku).trim().toUpperCase();
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === skuUpper) {
        sheet.getRange(i + 1, COL_PROD_QTYWH).setValue(0);
        found = true;
        break;
      }
    }
    if (!found) return error("ไม่พบ SKU: " + sku);
    SpreadsheetApp.flush();
    try { pushStockToZort_([{ sku: skuUpper, qty: 0, warehousecode: WH_SAI5 }]); } catch(e) { Logger.log("zeroStockItem_ ZORT error: " + e); }
    invalidateCache_();
    writeAuditLog_(actor, "ปรับสต็อก0", skuUpper, "ไม่ได้จัด: ตั้ง WH qty=0 ใน Sheets+ZORT");
    return ok({ sku: skuUpper, zeroed: true });
  } finally {
    lock.releaseLock();
  }
}

// wrapper สำหรับรันจาก GAS editor ครั้งเดียว (ไม่มี _ เพื่อให้โผล่ใน dropdown)
function resetNegativeStockOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const result = resetNegativeStock_(ss, "owner");
  Logger.log(result.getContent());
}

// push stock=0 ไป ZORT W0001 (ดูเหมือนจริง) สำหรับสินค้าที่ qtyStore <= 0 ใน Sheet
// ใช้เมื่อ Sheet ถูกแล้ว แต่ ZORT W0001 ยังติดลบอยู่
function resetFrontStoreZortOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต " + SHEET_PRODUCTS); return; }
  const data = sheet.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][COL_PROD_SKU - 1] || "").trim();
    if (!sku) continue;
    const qtyStore = Number(data[i][6]) || 0;  // col G (0-indexed=6)
    if (qtyStore <= 0) {
      items.push({ sku: sku.toUpperCase(), qty: 0, warehousecode: WH_FRONTSTORE });
    }
  }
  Logger.log("พบสินค้า qtyStore<=0 จำนวน: " + items.length + " รายการ — กำลัง push ไป ZORT W0001...");
  // push เป็น batch 50 ชิ้นเพื่อกัน timeout
  const BATCH = 50;
  let pushed = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    try {
      pushStockToZort_(items.slice(i, i + BATCH));
      pushed += Math.min(BATCH, items.length - i);
      Logger.log("pushed " + pushed + "/" + items.length);
    } catch(e) {
      Logger.log("error at batch " + i + ": " + e);
    }
  }
  Logger.log("เสร็จแล้ว: push " + pushed + " รายการไป ZORT W0001");
}

// ─── Reset สินค้าติดลบทั้งหมดเป็น 0 ใน Sheet + ZORT ───
function resetNegativeStock_(ss, actor) {
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    const data = sheet.getDataRange().getValues();
    const whItems = [];   // negative qtyWH → reset ใน WH_SAI5
    const fsItems = [];   // negative qtyStore → reset ใน WH_FRONTSTORE
    const fixed = [];

    for (let i = 1; i < data.length; i++) {
      const sku = String(data[i][COL_PROD_SKU - 1] || "").trim();
      if (!sku) continue;
      const qtyStore = Number(data[i][6]) || 0;  // col G (1-indexed=7, 0-indexed=6)
      const qtyWH    = Number(data[i][COL_PROD_QTYWH - 1]) || 0;  // col H (0-indexed=7)
      const sheetRow = i + 1;
      let changed = false;

      if (qtyStore < 0) {
        sheet.getRange(sheetRow, 7).setValue(0);  // col G
        fsItems.push({ sku: sku.toUpperCase(), stock: 0 });
        changed = true;
      }
      if (qtyWH < 0) {
        sheet.getRange(sheetRow, COL_PROD_QTYWH).setValue(0);  // col H
        whItems.push({ sku: sku.toUpperCase(), stock: 0 });
        changed = true;
      }
      if (changed) fixed.push({ sku, qtyStore, qtyWH });
    }

    if (fixed.length === 0) {
      return ok({ fixed: 0, skus: [], message: "ไม่พบสินค้าที่ติดลบ" });
    }

    SpreadsheetApp.flush();

    // Push to ZORT (batch per warehouse)
    const zortItems = [];
    if (whItems.length) zortItems.push(...whItems.map(s => ({ sku: s.sku, qty: 0, warehousecode: WH_SAI5 })));
    if (fsItems.length) zortItems.push(...fsItems.map(s => ({ sku: s.sku, qty: 0, warehousecode: WH_FRONTSTORE })));
    if (zortItems.length) {
      try { pushStockToZort_(zortItems); } catch(e) { Logger.log("resetNegativeStock_ ZORT error: " + e); }
    }

    invalidateCache_();
    writeAuditLog_(actor, "resetNegativeStock", fixed.map(f => f.sku).join(","),
      `รีเซ็ตสต็อกติดลบ ${fixed.length} รายการ → 0 (Sheet+ZORT)`);

    return ok({ fixed: fixed.length, skus: fixed.map(f => f.sku), whCount: whItems.length, fsCount: fsItems.length });
  } finally {
    lock.releaseLock();
  }
}

const SHIP_HEADERS = ["หมายเลขรายการ","วันที่ทำรายการ","สถานะ(รอ,สำเร็จ)","จากคลัง/สาขา","ไปคลัง/สาขา","รหัสสินค้า","ชื่อสินค้า","จำนวน","จำนวนที่จัด","รูปภาพ","จำนวนที่รับ","สถานะรับ","รับเมื่อ","ผู้รับ","ผู้จัด","รหัสชุดที่ส่ง"];

function logTransfer_(ss, sku, productName, qty, actor) {
  let logSheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_TRANSFERS);
    logSheet.appendRow(SHIP_HEADERS);
  }
  const now    = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
  const rows   = logSheet.getLastRow();
  const refNum = "TF-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd") + "-" + String(rows).padStart(3,"0");
  const img    = (readImageMap_()[(sku||"").toUpperCase()] || "");
  // คอลัมน์ O (preparedBy) เพิ่มใหม่ Sprint 2 — appendRow ไม่ต้องระบุความกว้างคงที่
  logSheet.appendRow([refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, sku, productName, qty, qty, img, "", "รอรับ", "", "", actor || ""]);
}

function createZortTransfer_(sku, productname, qty) {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
  const payload = {
    status: "Success",            // ทำรายการโอนให้สำเร็จเลย (ไม่ค้าง "รอโอน" ให้ต้องกดอนุมัติซ้ำใน ZORT)
    date: dateStr,
    fromwarehousecode: WH_SAI5,
    towarehousecode: WH_FRONTSTORE,
    list: [{ sku: sku, name: productname, number: qty }]
  };
  const res = UrlFetchApp.fetch(ZORT_BASE + "/Transfer/AddTransfer", {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const json = JSON.parse(res.getContentText());
  Logger.log("createZortTransfer_ result: " + JSON.stringify(json));
  return json;
}

// ── ตัวกันโอนซ้ำระดับ "ทั้งชุด" (tid) ────────────────────────────────────────
// tid = รหัสที่ client สร้าง 1 ค่าต่อการกด "ส่งทั้งหมด" 1 ครั้ง และ **คงค่าเดิมตอนลองใหม่**
// ทำไมต้องมี: โอนทีละหลายสิบ SKU ใช้เวลานานกว่าเพดานเวลาฝั่ง browser → browser ตัดสาย
//   ทั้งที่ GAS ยังเขียนชีต + สร้างเอกสารโอนใน ZORT ต่อจนจบ · ผู้ใช้เห็น "ส่งไม่สำเร็จ" แล้วกดซ้ำ
//   = **โอนสองเด้ง** (ตัวกันซ้ำรายชิ้น `shp2_` อายุแค่ 90 วิ ไม่ครอบคลุมกรณีนี้)
// หลักเดียวกับ `cid` ของ action=order — เห็น tid เดิม = คืนผลเดิม ไม่เขียนอะไรใหม่
const TFB_REPLAY_TTL_SEC = 21600;  // 6 ชม. (เพดานของ CacheService)
const COL_SHIP_TID       = 16;     // P รหัสชุดที่กดส่ง — ต่อท้าย ห้ามแทรกกลาง (บทเรียนข้อ 5)
const TFB_TID_SCAN_ROWS  = 600;    // แถวท้ายสุดที่ไล่หา tid ในชีตโอน (เผื่อ cache หลุด)

// หา tid ในชีตโอน (ของจริงที่ถาวร — ใช้เมื่อ cache หมดอายุ/ถูกเขี่ยทิ้ง)
// คืน { refNum, items:[{sku,qty}] } หรือ null · อ่านเฉพาะช่วงท้ายชีต ไม่ getDataRange ทั้งก้อน
function findTidInShipments_(ss, tid) {
  if (!tid) return null;
  const sh = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sh) return null;
  const last = sh.getLastRow();
  if (last < 2) return null;
  const from = Math.max(2, last - TFB_TID_SCAN_ROWS + 1);
  const n = last - from + 1;
  const rows = sh.getRange(from, 1, n, COL_SHIP_TID).getValues();
  const items = [];
  let refNum = '';
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][COL_SHIP_TID - 1] || '').trim() !== tid) continue;
    refNum = String(rows[i][COL_SHIP_REF - 1] || '').trim();
    items.push({ sku: String(rows[i][COL_SHIP_SKU - 1] || '').trim(), qty: Number(rows[i][COL_SHIP_QTY - 1]) || 0 });
  }
  return items.length ? { refNum, items } : null;
}

// ════════════════════════════════════════════════════════════════════════════
// "ZORT โอนไปแล้ว แต่ระบบเราไม่มี/ไม่หัก" — เครื่องมือตรวจสองฝั่งแล้วซ่อม
// ────────────────────────────────────────────────────────────────────────────
// ลำดับการทำงานจริงของ transferStockBatch คือ  หักสต็อกในชีต → flush → ยิง ZORT →
// เขียนชีตโอน → audit → noti  · แปลว่าถ้า **ZORT มีเอกสารแต่ชีตเราไม่มี** ต้องเป็นอย่างใด
// อย่างหนึ่งใน 3 ข้อนี้ ซึ่งแยกจากกันไม่ได้ถ้าไม่เปิดดูข้อมูลจริงทั้งสองฝั่ง:
//   (1) สคริปต์ถูกตัดกลางคัน (เพดาน 6 นาทีของ GAS) หลังยิง ZORT สำเร็จ
//   (2) เอกสารใน ZORT ยังไม่ได้ย้ายสต็อกจริง → syncZortBoth (ทุก 2 ชม.) เขียนยอดเดิมทับกลับมา
//   (3) มีคนสร้างรายการโอนใน ZORT เองโดยไม่ผ่านแอป
// → `checkZortTransfer` อ่านอย่างเดียว บอกว่าเป็นข้อไหน · แล้วค่อยเลือกตัวซ่อมให้ตรงเหตุ
// ⚠️ ชื่อฟังก์ชันห้ามลงท้าย `_` ไม่งั้นไม่โผล่ใน dropdown ของ GAS editor (บทเรียนข้อ 1)
// ════════════════════════════════════════════════════════════════════════════
const ZORT_TF_LOOKUP_DAYS = 14;

// หาเอกสารโอนใน ZORT จาก "เลขที่" · คืน null ถ้าไม่เจอ
function zortFindTransfer_(number, days) {
  const want = String(number || '').trim().toUpperCase();
  if (!want) return null;
  const tz = 'Asia/Bangkok';
  const now = new Date();
  const fromStr = Utilities.formatDate(new Date(now.getTime() - (days || ZORT_TF_LOOKUP_DAYS) * 86400000), tz, 'yyyy-MM-dd');
  const toStr   = Utilities.formatDate(new Date(now.getTime() + 86400000), tz, 'yyyy-MM-dd'); // เผื่อ timezone คลาด
  const limit = 200;
  for (let page = 1; page <= 30; page++) {
    const url = ZORT_BASE + '/Transfer/GetTransfers?page=' + page + '&limit=' + limit +
                '&fromdate=' + fromStr + '&todate=' + toStr;
    const res = UrlFetchApp.fetch(url, { method: 'get', headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      Logger.log('zortFindTransfer_ HTTP ' + res.getResponseCode() + ': ' + res.getContentText().substring(0, 200));
      return null;
    }
    const list = JSON.parse(res.getContentText()).list || [];
    for (const t of list) {
      const num = String(t.number || t.id || '').trim().toUpperCase();
      // ผู้ใช้มักพิมพ์เลขโดยไม่ใส่ขีด → เทียบแบบตัดอักขระที่ไม่ใช่ตัวเลข/ตัวอักษรออกด้วย
      if (num === want || num.replace(/[^A-Z0-9]/g, '') === want.replace(/[^A-Z0-9]/g, '')) {
        return {
          number: String(t.number || t.id || ''),
          status: String(t.status || ''),
          date: t.transferdateString || (t.transferdate ? String(t.transferdate).substring(0, 10) : ''),
          fromWarehouse: String(t.fromwarehousecode || ''),
          toWarehouse: String(t.towarehousecode || ''),
          // ⚠️ ใน ZORT `list[].number` = **จำนวน** ไม่ใช่เลขที่เอกสาร (เลขที่เอกสารคือ t.number)
          items: (Array.isArray(t.list) ? t.list : []).map(function (it) {
            return { sku: String(it.sku || '').trim().toUpperCase(), name: String(it.name || ''), qty: Number(it.number) || 0 };
          }).filter(function (it) { return it.sku; }),
        };
      }
    }
    if (list.length < limit) break;
    Utilities.sleep(200);
  }
  return null;
}

// นับแถวในชีตโอนที่อ้างเลขที่นี้ (ยืนยันว่า "ระบบเราบันทึกไว้แล้วหรือยัง")
function countTransferLogRows_(ss, refNum) {
  const sh = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sh) return { rows: 0, skus: [] };
  const last = sh.getLastRow();
  if (last < 2) return { rows: 0, skus: [] };
  const from = Math.max(2, last - RECENT_TF_SCAN_ROWS + 1);
  const vals = sh.getRange(from, 1, last - from + 1, COL_SHIP_QTY).getDisplayValues();
  const want = String(refNum || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const skus = [];
  vals.forEach(function (r) {
    const ref = String(r[COL_SHIP_REF - 1] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ref && ref === want) skus.push({ sku: String(r[COL_SHIP_SKU - 1] || '').trim().toUpperCase(), qty: Number(r[COL_SHIP_QTY - 1]) || 0 });
  });
  return { rows: skus.length, skus };
}

// หา audit log "โอนสต็อก" ของ SKU ชุดนี้ ในวันที่กำหนด — หลักฐานว่า **แอปเราหักสต็อกไปแล้วจริง**
// (คนละเรื่องกับชีตโอน: audit ถูกเขียนหลังหักสต็อกเสมอ ทั้งเส้นทาง batch)
function auditTransferSkusOnDate_(ss, skuList, dateStr) {
  const sh = ss.getSheetByName(SHEET_AUDIT);
  const out = {};
  if (!sh) return out;
  const last = sh.getLastRow();
  if (last < 2) return out;
  const from = Math.max(2, last - 4000 + 1);
  const vals = sh.getRange(from, 1, last - from + 1, 4).getValues();
  const want = {};
  skuList.forEach(function (s) { want[String(s).toUpperCase()] = true; });
  vals.forEach(function (r) {
    if (String(r[2] || '') !== 'โอนสต็อก') return;
    const sku = String(r[3] || '').trim().toUpperCase();
    if (!want[sku]) return;
    let d = '';
    try { d = Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) {}
    if (dateStr && d !== dateStr) return;
    out[sku] = (out[sku] || 0) + 1;
  });
  return out;
}

// ── รันเองใน GAS editor: checkZortTransfer("TF-20260803-005") ────────────────
// อ่านอย่างเดียว ไม่แก้ข้อมูลใด ๆ · พิมพ์รายงานเทียบ ZORT ↔ ชีตของเรา ลง Logger
function checkZortTransfer(number) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const t = zortFindTransfer_(number);
  if (!t) {
    Logger.log('❌ ไม่พบเอกสารโอนเลขที่ "' + number + '" ใน ZORT (ค้นย้อนหลัง ' + ZORT_TF_LOOKUP_DAYS + ' วัน)');
    return { found: false };
  }
  Logger.log('📄 ZORT: ' + t.number + ' · สถานะ ' + t.status + ' · ' + t.date +
             ' · ' + t.fromWarehouse + ' → ' + t.toWarehouse + ' · ' + t.items.length + ' รายการ');

  const log = countTransferLogRows_(ss, t.number);
  Logger.log(log.rows
    ? '✅ ชีต "' + SHEET_TRANSFERS + '" มีแถวของเลขที่นี้ ' + log.rows + ' แถว'
    : '⚠️ ชีต "' + SHEET_TRANSFERS + '" **ไม่มีแถว** ของเลขที่นี้เลย → ระบบเราไม่ได้บันทึกการโอนนี้');

  const audit = auditTransferSkusOnDate_(ss, t.items.map(function (i) { return i.sku; }), t.date);
  const nAudit = Object.keys(audit).length;
  Logger.log(nAudit
    ? '✅ Audit Log พบ "โอนสต็อก" ของ ' + nAudit + '/' + t.items.length + ' SKU ในวันเดียวกัน → แอปเราหักสต็อกไปแล้ว'
    : '⚠️ Audit Log **ไม่มี** "โอนสต็อก" ของ SKU ชุดนี้ในวันนั้น → แอปเราน่าจะไม่ได้หักสต็อกให้');

  // ยอดคงเหลือปัจจุบันในชีต เทียบให้ดูด้วยตา
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  const data = sheet ? sheet.getDataRange().getValues() : [];
  const idx = {};
  for (let i = 1; i < data.length; i++) {
    const s = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
    if (s && !(s in idx)) idx[s] = i;
  }
  t.items.forEach(function (it) {
    const i = idx[it.sku];
    const inLog = log.skus.filter(function (x) { return x.sku === it.sku; }).length;
    Logger.log('  · ' + it.sku + ' โอน ' + it.qty + ' ชิ้น | ชีตโอน ' + (inLog ? 'มี' : 'ไม่มี') +
               ' | audit ' + (audit[it.sku] ? 'มี' : 'ไม่มี') +
               (i === undefined ? ' | ❗ไม่พบ SKU ในชีตสินค้า'
                 : ' | ตอนนี้ คลัง=' + (Number(data[i][COL_PROD_QTYWH - 1]) || 0) +
                   ' หน้าร้าน=' + (Number(data[i][COL_PROD_QTYFS - 1]) || 0)));
  });

  Logger.log('── สรุปว่าควรทำอะไรต่อ ──');
  if (!log.rows && nAudit) Logger.log('→ สต็อกหักไปแล้ว ขาดแค่บันทึกในชีตโอน: รัน repairZortTransferLog("' + t.number + '")');
  else if (!log.rows && !nAudit) Logger.log('→ ระบบเราไม่ได้ทำอะไรเลยกับการโอนนี้: รัน applyZortTransferStock("' + t.number + '") เพื่อหักสต็อก + บันทึกให้ตรง ZORT');
  else if (log.rows < t.items.length) Logger.log('→ บันทึกไว้ไม่ครบ (มี ' + log.rows + '/' + t.items.length +
    ' รายการ — สคริปต์อาจถูกตัดกลางคันตอนเขียนชุดใหญ่): รัน repairZortTransferLog("' + t.number + '") จะเติมเฉพาะ SKU ที่ขาด ไม่แตะสต็อก');
  else Logger.log('→ ระบบเราบันทึกครบแล้ว ปัญหาน่าจะอยู่ที่รายการค้างบนหน้าจอเท่านั้น (ใช้ปุ่ม "🧾 เช็คของที่ส่งไปแล้ว")');
  return { found: true, transfer: t, logRows: log.rows, auditSkus: nAudit };
}

// ── ซ่อมเฉพาะ "บันทึกในชีตโอน" ที่ขาดหาย (ไม่แตะสต็อก ไม่ยิง ZORT) ──────────
// ⚠️ เทียบเป็นราย SKU ไม่ใช่ "มีแถวไหนอยู่แล้วก็ข้ามทั้งชุด" — ชุดใหญ่ (77 SKU) ที่โดน
// สคริปต์ตัดกลางคัน (เพดาน 6 นาที) มักเขียนไปได้บางส่วนแล้วหยุด (เช่น 23/75) เดิมฟังก์ชันนี้
// เจอแถวไหนของเลขที่นี้ก็ข้ามทั้งหมด = ส่วนที่ขาดไม่มีวันถูกเติม ต้องกรองเหลือเฉพาะ SKU ที่
// ยังไม่มีในชีตโอนแล้วเขียนเพิ่มเฉพาะนั้น
function repairZortTransferLog(number) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const t = zortFindTransfer_(number);
  if (!t) { Logger.log('❌ ไม่พบเลขที่นี้ใน ZORT'); return { ok: false }; }
  const log = countTransferLogRows_(ss, t.number);
  const loggedSkus = {};
  log.skus.forEach(function (s) { loggedSkus[s.sku] = true; });
  const missing = t.items.filter(function (i) { return !loggedSkus[i.sku]; });
  if (!missing.length) {
    Logger.log('⏭️ ชีตโอนมีครบทุก SKU ของเลขที่นี้แล้ว (' + log.rows + ' แถว) — ไม่เขียนซ้ำ');
    return { ok: true, skipped: true };
  }
  logTransferBatch_(ss, missing.map(function (i) { return { sku: i.sku, name: i.name, qty: i.qty }; }),
                    t.number, 'ซ่อมจาก ZORT ' + t.number, '');
  invalidateCache_();
  Logger.log('✅ เขียนชีตโอนเพิ่ม ' + missing.length + ' แถวที่ขาดหาย (มีอยู่แล้ว ' + log.rows +
             ' แถว, รวมเป็น ' + t.items.length + ' — ไม่ได้แตะสต็อก)');
  return { ok: true, rows: missing.length, alreadyHad: log.rows };
}

// ════════════════════════════════════════════════════════════════════════════
// ── กู้สถานะ "รับของแล้ว" จาก Audit Log ──────────────────────────────────────
// ที่มา (ส.ค. 2026): TF-202608035 มี 52/75 แถวหายจากชีตโอน แล้วถูกเติมกลับด้วย
// repairZortTransferLog() จาก ZORT — แต่ตัวนั้นเติมเป็น "รอรับ" เสมอ (ไม่รู้ว่าใครเคยกดรับ
// ไปแล้วบ้างก่อนที่แถวจะหาย) confirmShipmentReceive เขียน Audit Log ทุกครั้งที่กดรับจริง
// (action="รับสินค้า" resource=sku detail="รับครบ N/M"/"รับไม่ครบ N/M") → ใช้ร่องรอยนี้กู้
// สถานะกลับได้โดยไม่ต้องเดา ตราบใดที่จับคู่ SKU+จำนวนที่ส่งชัดเจนไม่ชนกัน
// ⚠️ แก้เฉพาะแถวที่ยังเป็น "รอรับ" (คอลัมน์ M ว่าง) เท่านั้น — แถวที่มีสถานะอยู่แล้วไม่แตะ
//    กันทับของจริงที่พนักงานเพิ่งกดรับหลัง repair
// ════════════════════════════════════════════════════════════════════════════
const AUDIT_RECEIPT_SCAN_ROWS = 6000;

// หา entry "รับสินค้า" ใน Audit Log ของ SKU ชุดนี้ ตั้งแต่เวลา sinceMs เป็นต้นไป
function auditReceiptEntriesForSkus_(ss, skuSet, sinceMs) {
  const sh = ss.getSheetByName(SHEET_AUDIT);
  const out = {};
  if (!sh) return out;
  const last = sh.getLastRow();
  if (last < 2) return out;
  const from = Math.max(2, last - AUDIT_RECEIPT_SCAN_ROWS + 1);
  const vals = sh.getRange(from, 1, last - from + 1, 5).getValues();
  vals.forEach(function (r) {
    if (String(r[2] || '') !== 'รับสินค้า') return;
    const sku = String(r[3] || '').trim().toUpperCase();
    if (!skuSet[sku]) return;
    const when = r[0] instanceof Date ? r[0].getTime() : null;
    if (when == null || when < sinceMs) return;
    const m = String(r[4] || '').match(/^(รับครบ|รับไม่ครบ)\s+(\d+)\/(\d+)$/);
    if (!m) return;
    (out[sku] = out[sku] || []).push({
      when: when, status: m[1], recv: Number(m[2]), sentQty: Number(m[3]), actor: String(r[1] || ''),
    });
  });
  return out;
}

// จับคู่ต่อ SKU: { matched:true, rowNum, entry } หรือ { matched:false, reason, rowNum? }
// reason: 'no_row' (ยังไม่มีแถวในชีตโอน — รัน repairZortTransferLog ก่อน) ·
//         'already_set' (มีสถานะอยู่แล้ว ไม่แตะ) · 'no_audit' (ไม่มีร่องรอยกดรับ) ·
//         'ambiguous' (audit จับคู่จำนวนได้มากกว่า 1 รายการ ไม่เดา)
function matchTransferReceiptsFromAudit_(ss, t) {
  const skuSet = {};
  t.items.forEach(function (it) { skuSet[it.sku] = it.qty; });
  const sinceMs = parseShipDayMs_(t.date) || 0;
  const found = auditReceiptEntriesForSkus_(ss, skuSet, sinceMs);

  const sheet = ss.getSheetByName(SHEET_TRANSFERS);
  const data = sheet ? sheet.getDataRange().getValues() : [];
  const want = String(t.number).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const rowBySku = {};
  for (let i = 2; i < data.length; i++) {
    const ref = String(data[i][COL_SHIP_REF - 1] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ref !== want) continue;
    const sku = String(data[i][COL_SHIP_SKU - 1] || '').trim().toUpperCase();
    if (sku) rowBySku[sku] = { rowNum: i + 1, recvAt: String(data[i][COL_SHIP_RECVAT - 1] || '').trim() };
  }

  const out = {};
  Object.keys(skuSet).forEach(function (sku) {
    const rowInfo = rowBySku[sku];
    if (!rowInfo) { out[sku] = { matched: false, reason: 'no_row' }; return; }
    if (rowInfo.recvAt) { out[sku] = { matched: false, reason: 'already_set', rowNum: rowInfo.rowNum }; return; }
    const entries = (found[sku] || []).filter(function (e) { return e.sentQty === skuSet[sku]; });
    if (!entries.length) { out[sku] = { matched: false, reason: 'no_audit', rowNum: rowInfo.rowNum }; return; }
    if (entries.length > 1) { out[sku] = { matched: false, reason: 'ambiguous', rowNum: rowInfo.rowNum, count: entries.length }; return; }
    out[sku] = { matched: true, rowNum: rowInfo.rowNum, entry: entries[0] };
  });
  return out;
}

// อ่านอย่างเดียว — ดูก่อนว่าจะเติมอะไรบ้างโดยไม่เขียนอะไรเลย
function previewTransferReceiptsFromAudit(number) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const t = zortFindTransfer_(number);
  if (!t) { Logger.log('❌ ไม่พบเลขที่นี้ใน ZORT'); return { ok: false }; }
  const m = matchTransferReceiptsFromAudit_(ss, t);
  const toApply = [], ambiguousSkus = [], noRowSkus = [];
  let already = 0, none = 0;
  Object.keys(m).forEach(function (sku) {
    const r = m[sku];
    if (r.matched) {
      toApply.push({ sku: sku, status: r.entry.status, recv: r.entry.recv, sentQty: r.entry.sentQty,
                      actor: r.entry.actor, when: new Date(r.entry.when).toLocaleString('th-TH') });
    } else if (r.reason === 'already_set') { already++; }
    else if (r.reason === 'no_audit') { none++; }
    else if (r.reason === 'ambiguous') { ambiguousSkus.push(sku); }
    else if (r.reason === 'no_row') { noRowSkus.push(sku); }
  });
  toApply.forEach(function (x) {
    Logger.log('  ✅ ' + x.sku + ' → ' + x.status + ' ' + x.recv + '/' + x.sentQty + ' โดย ' + x.actor + ' (' + x.when + ')');
  });
  ambiguousSkus.forEach(function (s) { Logger.log('  ❓ ' + s + ' — audit จับคู่จำนวนได้มากกว่า 1 รายการ ต้องเช็คเอง'); });
  noRowSkus.forEach(function (s) { Logger.log('  ⚠️ ' + s + ' — ไม่มีแถวในชีตโอน (รัน repairZortTransferLog ก่อน)'); });
  Logger.log('── สรุป: จะเติมสถานะรับของ ' + toApply.length + ' SKU · มีสถานะอยู่แล้ว ' + already +
             ' · ยังไม่มีร่องรอยรับของ ' + none + ' · ไม่ชัดเจน ' + ambiguousSkus.length +
             ' · ไม่มีแถว ' + noRowSkus.length + ' ──');
  if (toApply.length) Logger.log('รัน applyTransferReceiptsFromAudit("' + number + '") เพื่อเขียนจริง');
  return { ok: true, apply: toApply.length, already: already, none: none,
           ambiguous: ambiguousSkus.length, noRow: noRowSkus.length,
           toApply: toApply, ambiguousSkus: ambiguousSkus, noRowSkus: noRowSkus };
}

// เขียนจริง — เฉพาะ SKU ที่จับคู่ได้ชัดเจนเท่านั้น (ดู matchTransferReceiptsFromAudit_)
function applyTransferReceiptsFromAudit(number) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const t = zortFindTransfer_(number);
  if (!t) { Logger.log('❌ ไม่พบเลขที่นี้ใน ZORT'); return { ok: false }; }
  const m = matchTransferReceiptsFromAudit_(ss, t);
  const toApply = Object.keys(m).filter(function (sku) { return m[sku].matched; });
  if (!toApply.length) {
    Logger.log('⏭️ ไม่มีอะไรต้องเติม (รัน previewTransferReceiptsFromAudit ก่อนเพื่อดูสาเหตุ)');
    return { ok: true, applied: 0 };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { Logger.log('🛑 ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่'); return { ok: false }; }
  try {
    const sheet = ss.getSheetByName(SHEET_TRANSFERS);
    toApply.forEach(function (sku) {
      const r = m[sku];
      const nowStr = Utilities.formatDate(new Date(r.entry.when), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      sheet.getRange(r.rowNum, COL_SHIP_RECVQTY).setValue(r.entry.recv);
      sheet.getRange(r.rowNum, COL_SHIP_RECVSTATUS).setValue(r.entry.status);
      sheet.getRange(r.rowNum, COL_SHIP_RECVAT).setValue(nowStr);
      sheet.getRange(r.rowNum, COL_SHIP_RECVBY).setValue(r.entry.actor || '');
    });
    Logger.log('✅ เติมสถานะรับของกลับ ' + toApply.length + ' SKU จาก Audit Log: ' + toApply.join(', '));
    return { ok: true, applied: toApply.length, skus: toApply };
  } finally {
    try { invalidateCache_(); } catch (e) {}
    lock.releaseLock();
  }
}

// ── ซ่อม "สต็อกไม่ถูกหัก" ตามเอกสารโอนใน ZORT (ไม่ยิง ZORT ซ้ำเด็ดขาด) ────────
// ⚠️ ใช้เมื่อ checkZortTransfer บอกว่าไม่มีทั้งชีตโอนและ audit เท่านั้น
//    ถ้ามี audit อยู่แล้ว = หักไปแล้ว รันซ้ำจะหักสองเด้ง → ฟังก์ชันนี้จะปฏิเสธเอง
function applyZortTransferStock(number) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const t = zortFindTransfer_(number);
  if (!t) { Logger.log('❌ ไม่พบเลขที่นี้ใน ZORT'); return { ok: false }; }
  const audit = auditTransferSkusOnDate_(ss, t.items.map(function (i) { return i.sku; }), t.date);
  if (Object.keys(audit).length) {
    Logger.log('🛑 หยุด — Audit Log บอกว่าแอปหักสต็อกของการโอนนี้ไปแล้ว (' +
               Object.keys(audit).length + ' SKU) รันต่อจะหักสองเด้ง');
    return { ok: false, reason: 'already_deducted' };
  }
  if (countTransferLogRows_(ss, t.number).rows) {
    Logger.log('🛑 หยุด — ชีตโอนมีแถวของเลขที่นี้แล้ว (น่าจะหักไปแล้ว) ตรวจด้วย checkZortTransfer ก่อน');
    return { ok: false, reason: 'already_logged' };
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) { Logger.log('🛑 ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่'); return { ok: false }; }
  try {
    const sheet = ss.getSheetByName(SHEET_PRODUCTS);
    const data = sheet.getDataRange().getValues();
    const idx = {};
    for (let i = 1; i < data.length; i++) {
      const s = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
      if (s && !(s in idx)) idx[s] = i;
    }
    const done = [];
    t.items.forEach(function (it) {
      const i = idx[it.sku];
      if (i === undefined) { Logger.log('  ❗ ข้าม ' + it.sku + ' — ไม่พบในชีตสินค้า'); return; }
      const wh = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
      const fs = Number(data[i][COL_PROD_QTYFS - 1]) || 0;
      const actual = Math.min(it.qty, wh);          // ไม่ปล่อยติดลบ เหมือน transferStockBatch
      if (actual <= 0) { Logger.log('  ❗ ข้าม ' + it.sku + ' — คลังเหลือ 0'); return; }
      sheet.getRange(i + 1, COL_PROD_QTYFS, 1, 2).setValues([[fs + actual, wh - actual]]);
      data[i][COL_PROD_QTYWH - 1] = wh - actual;
      data[i][COL_PROD_QTYFS - 1] = fs + actual;
      done.push({ sku: it.sku, name: it.name, qty: actual });
      if (actual < it.qty) Logger.log('  ⚠️ ' + it.sku + ' คลังพอแค่ ' + actual + '/' + it.qty);
    });
    SpreadsheetApp.flush();
    if (done.length) {
      logTransferBatch_(ss, done, t.number, 'ซ่อมจาก ZORT ' + t.number, '');
      writeAuditLogBatch_('ซ่อมจาก ZORT ' + t.number, 'โอนสต็อก', done.map(function (d) {
        return { resource: d.sku, detail: 'qty ' + d.qty + ': W0002→W0001 (ซ่อมตามเอกสาร ZORT ' + t.number + ')' };
      }));
    }
    Logger.log('✅ หักสต็อกตามเอกสาร ZORT แล้ว ' + done.length + '/' + t.items.length + ' รายการ (ไม่ได้ยิง ZORT ซ้ำ)');
    return { ok: true, applied: done.length };
  } finally {
    try { invalidateCache_(); } catch (e) {}
    lock.releaseLock();
  }
}

// doGet action=zortTransfer — ให้หน้าเว็บค้นเอกสารโอนจากเลขที่ ZORT ได้เอง
// ใช้ตอนชีตของเราไม่มีบันทึก (ZORT มีอยู่ฝ่ายเดียว) → ยังเคลียร์รายการที่ค้างได้
function zortTransferHandler_(number) {
  try {
    const t = zortFindTransfer_(number);
    if (!t) return ContentService.createTextOutput(JSON.stringify({ ok: true, found: false }))
      .setMimeType(ContentService.MimeType.JSON);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const log = countTransferLogRows_(ss, t.number);
    const logged = {};
    log.skus.forEach(function (s) { logged[s.sku] = true; });
    return ContentService.createTextOutput(JSON.stringify({
      ok: true, found: true, transfer: {
        number: t.number, status: t.status, date: t.date,
        fromWarehouse: t.fromWarehouse, toWarehouse: t.toWarehouse,
      },
      sheetLogged: log.rows > 0,
      list: t.items.map(function (it) {
        return { refNum: t.number, date: t.date, sku: it.sku, name: it.name, qty: it.qty,
                 receivedAt: '', preparedBy: '', fromZort: true, sheetLogged: !!logged[it.sku] };
      }),
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('zortTransferHandler_ error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// doGet action=repairTransferLog — เวอร์ชัน URL ของ repairZortTransferLog() (ดูฟังก์ชันนั้น
// สำหรับตรรกะจริง — ตัวนี้แค่ห่อให้เรียกผ่าน URL ได้เมื่อ GAS editor ใช้ไม่ได้)
function repairTransferLogHandler_(number) {
  try {
    const r = repairZortTransferLog(number);
    return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('repairTransferLogHandler_ error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function previewTransferReceiptsHandler_(number) {
  try {
    const r = previewTransferReceiptsFromAudit(number);
    return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('previewTransferReceiptsHandler_ error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function applyTransferReceiptsHandler_(number) {
  try {
    const r = applyTransferReceiptsFromAudit(number);
    return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('applyTransferReceiptsHandler_ error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// doGet action=recentTransfers — ประวัติการโอนคลัง→หน้าร้าน N วันล่าสุด (ของจริงจากชีต)
// ครอบคลุมทั้งการกด "ส่งทั้งหมด" (logTransferBatch_) และกดส่งทีละใบ (logTransfer_)
// เพราะทั้งสองทางเขียนลงชีตเดียวกัน — ตัวนี้จึงเป็น "ประวัติ" ที่เชื่อได้ว่าอะไรโอนไปแล้วจริง
const RECENT_TF_SCAN_ROWS = 1500;   // แถวท้ายสุดที่ไล่อ่าน (ชีตโอนโตทุกวัน ห้าม getDataRange)
function recentTransfersHandler_(days) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheetByName(SHEET_TRANSFERS);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({ ok: true, list: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    const last = sh.getLastRow();
    if (last < 2) return ContentService.createTextOutput(JSON.stringify({ ok: true, list: [] }))
      .setMimeType(ContentService.MimeType.JSON);
    const from = Math.max(2, last - RECENT_TF_SCAN_ROWS + 1);
    // getDisplayValues เพื่อให้วันที่ออกมาเป็นข้อความอย่างที่เห็นในชีต (เหมือน readShipments_)
    const rows = sh.getRange(from, 1, last - from + 1, COL_SHIP_TID).getDisplayValues();
    const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const sku = String(r[COL_SHIP_SKU - 1] || '').trim();
      if (!sku) continue;
      const dateStr = String(r[COL_SHIP_DATE - 1] || '').trim();
      const d = parseShipDayStr_(dateStr);
      if (d && d < cutoff) continue;      // เก่าเกินช่วงที่ถาม · อ่านวันที่ไม่ออก = เก็บไว้ให้ client ตัดสิน
      list.push({
        row: from + i,
        refNum: String(r[COL_SHIP_REF - 1] || '').trim(),
        date: dateStr,
        sku,
        name: String(r[COL_SHIP_NAME - 1] || '').trim(),
        qty: Number(r[COL_SHIP_QTY - 1]) || 0,
        receivedAt: String(r[COL_SHIP_RECVAT - 1] || '').trim(),
        preparedBy: String(r[COL_SHIP_PREPAREDBY - 1] || '').trim(),
        tid: String(r[COL_SHIP_TID - 1] || '').trim(),
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, days, list }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('recentTransfersHandler_ error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// "dd/MM/yyyy" (ค่าที่ logTransfer_/logTransferBatch_ เขียน) → Date · อ่านไม่ออกคืน null
// เผื่อแถวเก่าที่เป็นปี พ.ศ. → ลบ 543 เมื่อปี ≥ 2400 (บทเรียนข้อ 11)
function parseShipDayStr_(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  let y = parseInt(m[3], 10);
  if (y >= 2400) y -= 543;
  return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
}

// doGet action=transferCheck — "ชุด tid นี้โอนไปแล้วหรือยัง"
// คืน found=false เมื่อ **ยืนยันได้ว่ายังไม่ลง** เท่านั้น (frontend ใช้ตัดสินใจว่ายิงซ้ำได้ไหม)
// ตอบไม่ได้/ผิดรูปแบบ → frontend ต้องถือว่า "ไม่รู้" และห้ามยิงซ้ำ
function transferCheckHandler_(tid) {
  const out = { ok: true, found: false };
  try {
    if (tid) {
      const cached = CacheService.getScriptCache().get('tfb_' + tid);
      if (cached) {
        const o = JSON.parse(cached);
        out.found   = true;
        out.results = o.results || [];
        out.refNum  = o.refNum || null;
        out.count   = o.count || 0;
        out.zortNumber = o.zortNumber || null;
      } else {
        const hit = findTidInShipments_(SpreadsheetApp.openById(SHEET_ID), tid);
        if (hit) {
          // cache หมดอายุ/หลุด — ยืนยันจากชีตได้ว่าลงแล้ว แต่ไม่มีผลรายตัว (ไม่มี orderId ในชีต)
          out.found = true; out.fromSheet = true;
          out.refNum = hit.refNum; out.items = hit.items; out.count = hit.items.length;
        }
      }
    }
  } catch (err) {
    Logger.log('transferCheckHandler_ error: ' + err);
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Batch: หักสต็อกหลาย SKU ในครั้งเดียว → สร้าง ZORT Transfer เอกสารเดียว (เลขที่ auto)
// list = [{ sku, qty, name, orderId }, ...]
// clientLoadedAt = epoch ms ที่ client โหลดข้อมูล (ใช้ตรวจ conflict ก่อนทำ batch)
// tid = รหัสชุด (ดูหัวข้อด้านบน) — ไม่ส่งมาก็ทำงานได้เหมือนเดิม แค่ไม่มีตัวกันโอนซ้ำ
// หมายเหตุ: AddTransfer ย้ายสต็อกใน ZORT ให้อยู่แล้ว จึงไม่ต้อง push absolute ทับ
function transferStockBatch(ss, list, actor, clientLoadedAt, tid) {
  if (!Array.isArray(list) || !list.length) return error("list ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);
  tid = String(tid || '').trim();

  // หมายเหตุ: เลิกใช้ global conflict detection (dmj_last_write_ts) ที่นี่แล้ว
  // เหตุผล: การโอนอ่าน whQty สดจาก sheet "ใน lock" แล้ว clamp ด้วย Math.min(qty, whQty)
  //   → สต็อกติดลบไม่ได้อยู่แล้วต่อให้ 2 user โอน SKU เดียวพร้อมกัน (คนหลังได้เท่าที่เหลือ
  //   + รายงาน shortfall) global timestamp ทำให้ทุก write ของคนอื่น (นับสต็อก/MTO/ส่งของ)
  //   ไป block การส่งของที่ไม่เกี่ยวกันเลย → false conflict ตอนใช้หลายคนพร้อมกัน

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  const cache = CacheService.getScriptCache();
  try {
    // ── กดส่งชุดนี้ไปแล้ว? → คืนผลเดิม ไม่เขียนอะไรซ้ำ ──────────────────────
    // เช็ค **ในล็อก** เพื่อให้สองคำขอที่ tid เดียวกันมาพร้อมกันได้ผลเดียวกันแน่นอน
    if (tid) {
      const prevRaw = cache.get('tfb_' + tid);
      if (prevRaw) {
        try {
          const prev = JSON.parse(prevRaw);
          prev.replay = true;
          return ok(prev);
        } catch (e) { /* cache เพี้ยน → ตกไปเช็คจากชีตแทน */ }
      }
      const onSheet = findTidInShipments_(ss, tid);
      if (onSheet) {
        // cache หมดอายุแล้วแต่ของจริงอยู่ในชีต — ไม่มีผลรายตัวให้ (results ว่าง)
        // frontend ต้องไปเคลียร์ผ่าน "เช็คของที่ส่งไปแล้ว" แทนการเดาว่าอันไหนสำเร็จ
        return ok({ count: onSheet.items.length, replay: true, fromSheet: true,
                    refNum: onSheet.refNum, items: onSheet.items, results: [] });
      }
    }

    const data = sheet.getDataRange().getValues();
    const transferred = [];   // { sku, name, qty } ที่หักได้จริง
    const results = [];
    const shortfalls = [];     // รายการที่ส่งไม่ครบ (คลังไม่พอ)

    // สร้าง index SKU→แถว ครั้งเดียว (O(rows)) แทนการ scan ซ้ำทุก item (เดิม O(items×rows))
    // first occurrence wins — ตรงกับพฤติกรรมเดิมที่ inner loop break ที่ match แรก
    const skuToIndex = {};
    for (let i = 1; i < data.length; i++) {
      const s = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
      if (s && !(s in skuToIndex)) skuToIndex[s] = i;
    }

    for (const item of list) {
      const sku = String(item.sku || "").trim().toUpperCase();
      const qty = Number(item.qty) || 0;
      const orderId = String(item.orderId || "");
      if (!sku || qty <= 0) { results.push({ sku, orderId, skipped: true }); continue; }

      // Idempotency: กันกดส่งซ้ำเร็ว ๆ (สองเครื่อง/ดับเบิลคลิก) ภายใน 90 วินาทีเท่านั้น
      // หมายเหตุ: orderId = เลขแถว (R5) ถูก reuse เมื่อ order เก่าถูกลบ → TTL ยาวทำให้
      //   order ใหม่ที่มาแทนแถวเดิมถูกมองว่า "duplicate" ผิด ๆ → ไม่โอน แต่ frontend ลบทิ้ง
      //   จึงต้องสั้น (90s) ให้ cache เคลียร์ทันรอบส่งถัดไป
      if (orderId && cache.get("shp2_" + orderId)) {
        results.push({ sku, orderId, duplicate: true });
        continue;
      }

      const i = skuToIndex[sku];
      if (i === undefined) { results.push({ sku, orderId, notFound: true }); continue; }
      // อ่านจาก data ที่ถูก mutate in-place → item ที่ SKU ซ้ำใน batch เดียวหักต่อจากยอดล่าสุดถูกต้อง
      const row    = i + 1;
      const whQty  = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
      const fsQty  = Number(data[i][COL_PROD_QTYFS - 1]) || 0;
      const actual = Math.min(qty, whQty);
      const name   = item.name || String(data[i][2] || "").trim();
      const newWH  = whQty - actual;
      const newFS  = fsQty + actual;

      // G กับ H ติดกัน → เขียนครั้งเดียวต่อแถว (เดิม 2 ครั้ง) — โอน 77 SKU ลดจาก 154 เหลือ 77 call
      // ⚠️ ยังเขียน "เฉพาะแถวที่เปลี่ยน" เหมือนเดิม ห้ามเปลี่ยนเป็นเขียนทั้งบล็อกรวด
      //    เพราะ syncZortToColumn_ เขียนทับทั้งคอลัมน์โดยไม่จับล็อก → บล็อกใหญ่จะย้อนงานมันทิ้ง
      sheet.getRange(row, COL_PROD_QTYFS, 1, 2).setValues([[newFS, newWH]]);
      data[i][COL_PROD_QTYWH - 1] = newWH;
      data[i][COL_PROD_QTYFS - 1] = newFS;

      if (actual > 0) {
        transferred.push({ sku, name, qty: actual });
        if (orderId) cache.put("shp2_" + orderId, "1", 90); // 90 วิ (กันดับเบิลคลิกเท่านั้น)
      }
      if (actual < qty) shortfalls.push({ sku, name, requested: qty, transferred: actual });
      results.push({ sku, orderId, requested: qty, transferred: actual, newWH, newFS });
    }

    SpreadsheetApp.flush();

    let zortNumber = null, zortError = null, refNum = null;
    if (transferred.length) {
      try {
        const zr = createZortTransferBatch_(transferred);
        if (zr && zr.detail && zr.detail.id) zortNumber = zr.detail.number || zr.detail.id;
        else zortError = (zr && (zr.description || zr.error)) || "ZORT transfer ไม่สำเร็จ";
      } catch (e) { zortError = String(e); }

      if (zortError) {
        logZortFailure_("โอนสต็อกสาย5→หน้าร้าน",
          zortError + " | SKU: " + transferred.map(t => t.sku + "x" + t.qty).join(","));
      }

      try { refNum = logTransferBatch_(ss, transferred, zortNumber, actor, tid); } catch (e) { Logger.log("logTransferBatch_ error: " + e); }
      // Audit log: บันทึกทุก SKU ที่โอนจริง (1 แถว/SKU เท่าเดิม — แต่เขียนรวดเดียว)
      // เดิม appendRow ทีละแถว: โอน 77 SKU = 77 รอบเขียนชีต ซึ่งเป็นตัวกินเวลาหลักจน
      // คำตอบกลับไม่ทันเพดานเวลาฝั่ง browser แล้วขึ้น "ส่งไม่สำเร็จ" ทั้งที่โอนไปแล้ว
      writeAuditLogBatch_(actor, "โอนสต็อก", transferred.map(function (t) {
        return { resource: t.sku, detail: "qty " + t.qty + ": W0002→W0001" };
      }));
      // แจ้งหน้าร้านว่ามีของกำลังมา — เรื่องนี้ไม่เคยแจ้ง LINE เลย (ไม่คุ้ม quota)
      // รวมทั้งชุดเป็นแจ้งเตือนเดียว ไม่ยิงราย SKU (โอนทีนึงมีหลายสิบตัว)
      pushInappNoti_({
        audience: 'role:frontstore,employee,owner',
        type: 'shipment', tab: 'stock',
        title: '🚚 ของโอนมาหน้าร้าน ' + transferred.length + ' รายการ',
        body: transferred.slice(0, 3).map(function (t) { return t.name || t.sku; }).join(', ')
              + (transferred.length > 3 ? ' และอีก ' + (transferred.length - 3) + ' รายการ' : '')
              + ' · รอกดรับ',
        by: actor,
      });
    }

    const payload = { count: transferred.length, zortNumber, zortError, shortfalls, results, refNum, tid: tid || null };
    // เก็บผลไว้ตอบซ้ำ — คนกดส่งที่ browser ตัดสายไปแล้วจะได้ "ผลจริง" ตอนถาม action=transferCheck
    // แทนที่จะต้องเดา หรือกดส่งซ้ำจนโอนสองเด้ง
    if (tid) {
      try { cache.put('tfb_' + tid, JSON.stringify(payload), TFB_REPLAY_TTL_SEC); } catch (e) {
        Logger.log('tfb cache put error: ' + e);   // ผลใหญ่เกิน 100KB → ยังมีชีตเป็นตัวยืนยันสำรอง
      }
    }
    return ok(payload);
  } finally {
    try { invalidateCache_(); } catch(e) {} // C5: ล้าง cache หลัง write เสมอ
    lock.releaseLock();
  }
}

// สร้าง ZORT Transfer เอกสารเดียวที่มีหลายรายการ (เลขที่ auto)
function createZortTransferBatch_(items) {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
  const payload = {
    status: "Success",            // ทำรายการโอนให้สำเร็จเลย (ไม่ค้าง "รอโอน" ให้ต้องกดอนุมัติซ้ำใน ZORT)
    date: dateStr,
    fromwarehousecode: WH_SAI5,
    towarehousecode: WH_FRONTSTORE,
    list: items.map(it => ({ sku: it.sku, name: it.name, number: it.qty }))
  };
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = UrlFetchApp.fetch(ZORT_BASE + "/Transfer/AddTransfer", {
        method: "post", headers,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      const json = JSON.parse(res.getContentText());
      Logger.log("createZortTransferBatch_ attempt " + attempt + ": " + JSON.stringify(json));
      if (json && json.detail && json.detail.id) return json;
      lastErr = json;
    } catch (e) {
      lastErr = e;
      Logger.log("createZortTransferBatch_ attempt " + attempt + " error: " + e);
    }
    Utilities.sleep(800 * attempt);
  }
  return lastErr;
}

// log หลายรายการที่อ้าง ZORT number เดียวกัน · คืนเลขที่รายการ (refNum) ให้ผู้เรียกเก็บไว้ตอบซ้ำ
function logTransferBatch_(ss, items, zortNumber, actor, tid) {
  let logSheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_TRANSFERS);
    logSheet.appendRow(SHIP_HEADERS);
  }
  const imgMap  = readImageMap_();
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
  const baseRow = logSheet.getLastRow();
  const refNum  = zortNumber
    ? String(zortNumber)
    : "TF-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd") + "-" + String(baseRow).padStart(3, "0");
  const rows = items.map(it => {
    const img = imgMap[(it.sku || "").toUpperCase()] || "";
    // คอลัมน์ O (preparedBy) เพิ่มใหม่ Sprint 2, P (tid) เพิ่ม ส.ค. 2026 — ต่อท้ายทั้งคู่
    // ไม่แทรกกลาง กัน column-index เพี้ยน (บทเรียนข้อ 5)
    return [refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, it.sku, it.name, it.qty, it.qty, img, "", "รอรับ", "", "", actor || "", tid || ""];
  });
  logSheet.getRange(baseRow + 1, 1, rows.length, COL_SHIP_TID).setValues(rows);
  return refNum;
}

// ════════════════════════════════════════════════════════════════════
// สินค้าจม: ดึงประวัติการโอนสาย5 → ดูเหมือนจริง (หน้าร้าน) จาก ZORT
// เก็บวันโอนล่าสุดต่อ SKU ลงชีต "ประวัติโอนหน้าร้าน" เพื่อให้ frontend
// คำนวณว่าสินค้าตัวไหนไม่ถูกโอนออกหน้าร้านมานานแล้ว = จม
// รันเองครั้งแรก + ตั้ง trigger รายวัน (เหมือน syncZortSales)
// ════════════════════════════════════════════════════════════════════
const SHEET_TRANSFER_HIST = "ประวัติโอนหน้าร้าน";

function syncTransferHistory() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = "Asia/Bangkok";
  const today = new Date();
  const DAYS = 730; // ย้อนหลัง 2 ปี (ครอบคลุมสินค้าจมนาน)
  const fromStr = Utilities.formatDate(new Date(today.getTime() - DAYS*24*60*60*1000), tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  const all = [], limit = 200, MAX_PAGES = 120;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${ZORT_BASE}/Transfer/GetTransfers?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      Logger.log("⚠️ syncTransferHistory page " + page + " HTTP " + res.getResponseCode() + ": " + res.getContentText().substring(0, 200));
      break;
    }
    const list = (JSON.parse(res.getContentText())).list || [];
    all.push(...list);
    if (list.length < limit) break;
    Utilities.sleep(250);
    if (page === MAX_PAGES) Logger.log("⚠️ ชนเพดาน " + MAX_PAGES + " หน้า");
  }
  Logger.log("ZORT transfers fetched: " + all.length);

  // เก็บวันโอนล่าสุดต่อ SKU (เฉพาะ สาย5 → หน้าร้าน, status Success)
  const lastDate = {}; // sku → "yyyy-MM-dd"
  let matched = 0;
  for (const t of all) {
    if (t.status !== "Success") continue;
    if (t.fromwarehousecode !== WH_SAI5 || t.towarehousecode !== WH_FRONTSTORE) continue;
    const d = t.transferdateString || (t.transferdate ? String(t.transferdate).substring(0,10) : null);
    if (!d) continue;
    for (const it of (Array.isArray(t.list) ? t.list : [])) {
      const sku = String(it.sku || "").trim().toUpperCase();
      if (!sku) continue;
      matched++;
      if (!lastDate[sku] || d > lastDate[sku]) lastDate[sku] = d;
    }
  }
  Logger.log("รายการโอนสาย5→หน้าร้านที่นับ: " + matched + " · SKU: " + Object.keys(lastDate).length);

  // เขียนชีต: A=SKU, B=วันโอนล่าสุด (text format กัน Sheets แปลงวันที่)
  let sh = ss.getSheetByName(SHEET_TRANSFER_HIST);
  if (!sh) sh = ss.insertSheet(SHEET_TRANSFER_HIST);
  sh.clear();
  sh.getRange(1, 1, 1, 2).setValues([["SKU", "วันโอนหน้าร้านล่าสุด"]]);
  const skus = Object.keys(lastDate);
  if (skus.length) {
    const rows = skus.map(s => [s, lastDate[s]]);
    sh.getRange(2, 1, rows.length, 2).setNumberFormat("@").setValues(rows);
  }
  invalidateCache_();
  Logger.log("✅ syncTransferHistory เสร็จ");
}

function readTransferHistory_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TRANSFER_HIST);
  if (!sh) return {};
  const rows = sh.getDataRange().getDisplayValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const sku = (rows[i][0] || "").toString().trim().toUpperCase();
    const d   = (rows[i][1] || "").toString().trim();
    if (sku && d) map[sku] = d;
  }
  return map;
}

// ── EXPLORE: ดูโครงสร้าง response ของ ZORT Transfer endpoints ──
// รันเองใน GAS editor แล้วดู Logs (View → Logs / Ctrl+Enter) เพื่อส่ง field name กลับมา
// เป้าหมาย: หา field วันที่โอน + SKU + from/to warehouse เพื่อคำนวณ "สินค้าจม" จากการโอนสาย5→หน้าร้าน
function exploreZortTransfers() {
  const headers = zortHeaders_();
  // ย้อนหลัง 1 ปี เพื่อให้เจอตัวอย่างข้อมูลแน่ ๆ
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const lastYear = Utilities.formatDate(new Date(Date.now() - 365*24*60*60*1000), Session.getScriptTimeZone(), "yyyy-MM-dd");

  function dump(label, url) {
    try {
      const res = UrlFetchApp.fetch(url, { method: "get", headers: headers, muteHttpExceptions: true });
      const code = res.getResponseCode();
      const json = JSON.parse(res.getContentText());
      Logger.log("=== " + label + " === HTTP " + code);
      Logger.log("top-level keys: " + JSON.stringify(Object.keys(json)));
      // หา array หลักใน response
      const arrKey = Object.keys(json).find(k => Array.isArray(json[k]));
      const arr = arrKey ? json[arrKey] : (Array.isArray(json) ? json : null);
      if (arr && arr.length) {
        Logger.log("array key: '" + (arrKey||"(root)") + "' length: " + arr.length);
        Logger.log("FIRST ITEM: " + JSON.stringify(arr[0]));
        if (arr[0] && Array.isArray(arr[0].list) && arr[0].list.length) {
          Logger.log("FIRST ITEM.list[0]: " + JSON.stringify(arr[0].list[0]));
        }
      } else {
        Logger.log("RAW (no array found): " + res.getContentText().slice(0, 1500));
      }
    } catch (e) {
      Logger.log("=== " + label + " === ERROR: " + e);
    }
  }

  const q = "?fromdate=" + lastYear + "&todate=" + today + "&limit=5";
  dump("GetTransfers",         ZORT_BASE + "/Transfer/GetTransfers" + q);
  dump("GetMovementTransfers", ZORT_BASE + "/Transfer/GetMovementTransfers" + q);
}

function deductStock(ss, sku, qty) {
  if (!sku || qty <= 0) return error("sku หรือ qty ไม่ถูกต้อง");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku.trim().toUpperCase()) {
        const row = i + 1;
        const whQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
        const fsQty = Number(data[i][COL_PROD_QTYFS - 1]) || 0;

        let deductWH = Math.min(qty, whQty);
        let deductFS = qty - deductWH;
        if (deductFS > fsQty) deductFS = fsQty;

        // shortfall = จำนวนที่หักไม่ได้ (สต็อกไม่พอทั้งสองคลัง)
        const shortfall = qty - (deductWH + deductFS);

        sheet.getRange(row, COL_PROD_QTYWH).setValue(whQty - deductWH);
        if (deductFS > 0) sheet.getRange(row, COL_PROD_QTYFS).setValue(fsQty - deductFS);
        SpreadsheetApp.flush();
        try {
          const zortItems = [];
          if (deductWH > 0) zortItems.push({ sku, qty: whQty - deductWH, warehousecode: WH_SAI5 });
          if (deductFS > 0) zortItems.push({ sku, qty: fsQty - deductFS, warehousecode: WH_FRONTSTORE });
          if (zortItems.length) pushStockToZort_(zortItems);
        } catch (e) { Logger.log("deductStock ZORT push error: " + e); }
        // shortfall > 0 = สต็อกไม่พอ (หักได้แค่บางส่วน หรือหักไม่ได้เลย)
        // ยังคืน success:true เพราะหักลงไปเท่าที่ทำได้แล้ว แต่ client ต้องรู้ว่ามีส่วนขาด
        // shortfall_qty = จำนวนที่ขาด, shortfall = true เป็น flag ที่ client ตรวจได้ง่าย
        const result = {
          sku, deductWH, deductFS,
          newWH: whQty - deductWH, newFS: fsQty - deductFS,
          shortfall: shortfall > 0,
          shortfall_qty: shortfall
        };
        return ok(result);
      }
    }
    return error("ไม่พบ SKU: " + sku);
  } finally {
    lock.releaseLock();
    invalidateCache_();
  }
}

function deductMaterials(ss, items, actor) {
  if (!Array.isArray(items) || items.length === 0) return error("items ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(8000);
  if (!gotLock) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const data = sheet.getDataRange().getValues();
    const results = [];

    for (const item of items) {
      const sku = String(item.sku || "").trim().toUpperCase();
      const qty = Number(item.qty) || 0;
      if (!sku || qty <= 0) continue;

      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
          const row   = i + 1;
          const whQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
          const actual = Math.min(qty, whQty);
          const newWH  = whQty - actual;
          sheet.getRange(row, COL_PROD_QTYWH).setValue(newWH);
          data[i][COL_PROD_QTYWH - 1] = newWH;
          results.push({ sku, deducted: actual, newWH });
          break;
        }
      }
    }

    SpreadsheetApp.flush();

    // Push ค่าใหม่กลับ ZORT (คลังสาย5) เหมือน deductStock — ไม่งั้น syncZortBoth
    // รอบถัดไป (ทุก 2 ชม.) จะดึงค่าเก่าจาก ZORT มาทับ → สต็อกเด้งกลับ
    try {
      const zortItems = results
        .filter(r => r.deducted > 0)
        .map(r => ({ sku: r.sku, qty: r.newWH, warehousecode: WH_SAI5 }));
      if (zortItems.length) pushStockToZort_(zortItems);
    } catch (e) { Logger.log("deductMaterials ZORT push error: " + e); }

    // บันทึก Audit Log รวมทุก SKU ที่ deduct
    try {
      for (const r of results) {
        writeAuditLog_(actor || "ระบบ", "deductMaterials", r.sku, "หักวัสดุ " + r.deducted + " ชิ้น → คงเหลือ " + r.newWH);
      }
    } catch (e) {}
    return ok({ deducted: results.length, results });
  } finally {
    lock.releaseLock();
    invalidateCache_();
  }
}

// แถวที่ orderId ชี้ไป ยังเป็นสินค้าตัวเดิมอยู่ไหม
//
// ⚠️ `order.id` = `R<เลขแถวในชีต>` (readOrders_) ซึ่งเป็น **ตำแหน่ง ไม่ใช่รหัสถาวร** —
// พอมีคนกด ❌ ยกเลิก order (deleteRow) แถวทั้งหมดที่อยู่ล่างกว่านั้น **เลื่อนขึ้น 1**
// เครื่องที่ยังถือรายการชุดก่อนหน้าจะส่ง orderId เก่ามา = ชี้ไปคนละใบ
// เขียนทับโดยไม่ตรวจ = จำนวนที่จัดไปลงสินค้าตัวอื่นเงียบ ๆ (ทั้งของเราหายและของเขาเพี้ยน)
//
// sku ว่าง → คืน false ตั้งใจ: ยอมให้ตกไปเส้นทาง match by sku+date ดีกว่าเขียนมั่ว
function orderRowMatchesSku_(sheet, rowNum, sku) {
  const want = String(sku || "").trim().toUpperCase();
  if (!want) return false;
  if (!(rowNum >= 1) || rowNum > sheet.getLastRow()) return false;
  const rowSku = String(sheet.getRange(rowNum, COL_ORD_SKU).getDisplayValue()).trim().toUpperCase();
  return rowSku === want;
}

function updateOrderState(ss, body) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_ORDERS);
  const actor = body.actor || "ไม่ระบุ";

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    // Try direct row match via orderId ("R3" = sheet row 3, readOrders_ uses id:`R${i+1}` where i is 0-indexed)
    if (body.orderId) {
      const rowNum = parseInt(String(body.orderId).replace(/[^0-9]/g, ""));
      if (rowNum >= 1 && orderRowMatchesSku_(sheet, rowNum, body.sku)) {
        const sheetRow = rowNum; // id already encodes 1-indexed sheet row
        // 1) อ่าน before-state ก่อนเขียน (เฉพาะ field ที่จะถูกแก้)
        const before = {
          status: sheet.getRange(sheetRow, COL_ORD_STATUS).getValue() || "",
          preparedQty: sheet.getRange(sheetRow, COL_ORD_PREPQTY).getValue() || "",
          printFlag: sheet.getRange(sheetRow, COL_ORD_PRINTFLAG).getValue() || "",
          carryMode: sheet.getRange(sheetRow, COL_ORD_TYPE).getValue() || "",
        };
        // 2) เขียนจริง
        if (body.status)              sheet.getRange(sheetRow, COL_ORD_STATUS).setValue(body.status);
        if (body.preparedQty != null) sheet.getRange(sheetRow, COL_ORD_PREPQTY).setValue(body.preparedQty);
        // ผู้จัด = คนที่ลงมือจัดของจริง (กรอกจำนวนที่จัด หรือกดเปลี่ยนสถานะเป็นสำเร็จ)
        // actor ตัวนี้ doPost ทับด้วยชื่อจาก session มาแล้ว (เฟส 4) — เชื่อถือได้
        // ไม่นับการกด "พิมพ์ label" (printFlag อย่างเดียว) ว่าเป็นการจัดของ
        if (body.preparedQty != null || body.status)
          sheet.getRange(sheetRow, COL_ORD_PREPBY).setValue(actor);
        if (body.printFlag != null)    sheet.getRange(sheetRow, COL_ORD_PRINTFLAG).setValue(body.printFlag); // M2: != null กัน false ถูกข้าม
        if (body.carryMode != null) {
          sheet.getRange(sheetRow, COL_ORD_TYPE).setValue(body.carryMode === "carry" ? "หิ้ว" : "รอขึ้นรถ");
          if (body.carryMode === "carry") {
            try {
              const productName = body.name || body.sku || "(ไม่ทราบชื่อ)";
              // orderQty อยู่ col H (index 7 / column 8) — อ่านจากชีตเป็นค่าจริง
              const orderQty = Number(sheet.getRange(sheetRow, 8).getValue()) || Number(body.qty) || 0;
              sendLineGroupOrderCard_(productName, body.sku||"", body.date||"", body.image||"", orderQty);
            } catch(e) {}
          }
        }
        SpreadsheetApp.flush();
        // 3) ถึงจุดนี้ = เขียนสำเร็จ → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น
        writeAuditLog_(actor, "อัปเดต order", body.orderId, auditDetail_({
          before: before,
          after: { status: body.status, preparedQty: body.preparedQty, printFlag: body.printFlag, carryMode: body.carryMode },
          note: "อัปเดต order (" + (body.sku || "") + ")",
        }));
        return ok({ updated: body.orderId, row: sheetRow });
      }
    }

    // Fallback: match by sku + date — ใช้เมื่อ orderId ชี้ไปแถวที่ SKU ไม่ตรงแล้ว
    // (แถวเลื่อนขึ้นเพราะมีคนลบ order อื่นทิ้ง ระหว่างที่เครื่องนี้ถือข้อมูลชุดเก่าอยู่)
    // ⚠️ เลือกแถวที่ "ใกล้เลขแถวเดิมที่สุด" ไม่ใช่แถวแรกที่เจอ — สินค้าตัวเดียวกันสั่งซ้ำ
    //    วันเดียวกันได้ (2 แถว sku+date เหมือนกันเป๊ะ) การหยิบแถวแรกเสมอจะแก้ผิดใบเงียบ ๆ
    //    ส่วนการเลื่อนแถวจากการลบมักห่างจากเดิมไม่กี่แถว ระยะห่างจึงเป็นตัวชี้ที่แม่นที่สุดที่มี
    const data = sheet.getDataRange().getValues();
    const wantSku = String(body.sku || "").trim().toUpperCase();
    const expectRow = parseInt(String(body.orderId || "").replace(/[^0-9]/g, "")) || 0;
    let bestI = -1, bestDist = Infinity;
    if (wantSku) {
      for (let i = 1; i < data.length; i++) {
        const rowSku  = String(data[i][COL_ORD_SKU - 1]).trim().toUpperCase();
        const rowDate = String(data[i][COL_ORD_DATE - 1]).trim();
        if (rowSku !== wantSku) continue;
        if (body.date && !rowDate.includes(String(body.date).trim())) continue;
        const dist = expectRow ? Math.abs((i + 1) - expectRow) : i;
        if (dist < bestDist) { bestDist = dist; bestI = i; }
      }
    }
    {
      const i = bestI;
      if (i >= 1) {
        const row = i + 1;
        // 1) อ่าน before-state จาก data ที่โหลดไว้แล้ว (ไม่ต้องอ่านซ้ำ)
        const before = {
          status: data[i][COL_ORD_STATUS - 1] || "",
          preparedQty: data[i][COL_ORD_PREPQTY - 1] || "",
          printFlag: data[i][COL_ORD_PRINTFLAG - 1] || "",
          carryMode: data[i][COL_ORD_TYPE - 1] || "",
        };
        // 2) เขียนจริง
        if (body.status)              sheet.getRange(row, COL_ORD_STATUS).setValue(body.status);
        if (body.preparedQty != null) sheet.getRange(row, COL_ORD_PREPQTY).setValue(body.preparedQty);
        // ผู้จัด — ต้องบันทึกทั้ง 2 เส้นทาง (orderId และ match by sku+date) ไม่งั้นชื่อหายเป็นบางแถว
        if (body.preparedQty != null || body.status)
          sheet.getRange(row, COL_ORD_PREPBY).setValue(actor);
        if (body.printFlag != null)    sheet.getRange(row, COL_ORD_PRINTFLAG).setValue(body.printFlag); // M2: != null กัน false ถูกข้าม
        if (body.carryMode != null) {
          sheet.getRange(row, COL_ORD_TYPE).setValue(body.carryMode === "carry" ? "หิ้ว" : "รอขึ้นรถ");
          if (body.carryMode === "carry") {
            try {
              const productName = body.name || body.sku || "(ไม่ทราบชื่อ)";
              // orderQty อยู่ col H (index 7) — อ่านจาก data ที่โหลดไว้แล้ว
              const orderQty = Number(data[i][7]) || Number(body.qty) || 0;
              sendLineGroupOrderCard_(productName, body.sku||"", body.date||"", body.image||"", orderQty);
            } catch(e) {}
          }
        }
        SpreadsheetApp.flush();
        // 3) ถึงจุดนี้ = เขียนสำเร็จ → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น
        writeAuditLog_(actor, "อัปเดต order", body.sku, auditDetail_({
          before: before,
          after: { status: body.status, preparedQty: body.preparedQty, printFlag: body.printFlag, carryMode: body.carryMode },
          note: "อัปเดต order (กู้แถวเลื่อน: orderId=" + (body.orderId || "-") +
                " → row " + row + ", match by sku+date)",
        }));
        // shifted → บอก client ว่าแถวเลื่อน (ไม่ใช่ error — เขียนถูกใบแล้ว) เผื่อเอาไปเตือน/รีเฟรช
        return ok({ updated: body.sku, row, shifted: expectRow > 0 && expectRow !== row });
      }
    }
    return ok({ notFound: body.orderId || body.sku });
  } finally {
    lock.releaseLock();
    invalidateCache_();
  }
}

// sale/FS ยืนยันรับสินค้าจากชีต "รายการโอนสินค้า"
// rowId = 'S<sheetRow>' (อ้าง 1-indexed). เช็ค sku กัน row เลื่อนก่อนเขียน
// หาแถวของรายการโอนให้เจอ แม้ "เลขแถว" ที่เครื่องผู้ใช้ถืออยู่จะเก่าไปแล้ว
// ─────────────────────────────────────────────────────────────────────
// ทำไมต้องมี: id ของ shipment คือ **เลขแถวในชีต** (`readShipments_` → 'S'+(i+1)) ซึ่ง
// เลื่อนทุกครั้งที่มีการลบแถวออก — archiveReceivedShipments (ตี 3), cleanupOldPendingShipments,
// หรือเจ้าของแก้ชีตด้วยมือ · เครื่องที่ยังถือข้อมูลเก่า (localStorage / payload cache / ของสำรอง
// จาก stale-while-rebuild) จะส่งเลขแถวที่ชี้ผิดแถวมา แล้วเดิมระบบตอบ
// "ข้อมูลไม่ตรง (แถวอาจเลื่อน) — โปรดรีเฟรชแล้วลองใหม่" ทั้งที่พนักงานทำถูกทุกอย่าง
// → ต้องกดซ้ำ 2-3 รอบกว่าจะติด (พนักงานแจ้งจริง ส.ค. 2026) และยิ่งหลายเครื่องยิ่งเจอบ่อย
//
// ตอนนี้: เลขแถวใช้ไม่ได้ → ไล่หาแถวที่ refNum+SKU ตรงกันแทน แล้วบันทึกได้ในรอบเดียว
// ยังคงความปลอดภัยไว้: ถ้าเจอหลายแถวที่ตรงกันจนเลือกไม่ได้ **ไม่เดา** — ตอบ error ตามเดิม
// (เขียนผิดแถวแย่กว่าให้กดใหม่ เพราะของหายไปจากบัญชีเงียบ ๆ)
function findShipmentRow_(sheet, rowNum, refNum, sku) {
  const want    = String(sku || '').trim().toUpperCase();
  const wantRef = String(refNum || '').trim();
  if (!want) return { row: 0, reason: 'ไม่มีรหัสสินค้าในคำขอ' };

  // 1) เชื่อเลขแถวก่อน (เส้นทางปกติ — เร็วสุด อ่านแถวเดียว)
  if (rowNum >= 3 && rowNum <= sheet.getLastRow()) {
    const r = sheet.getRange(rowNum, 1, 1, Math.max(sheet.getLastColumn(), SHIP_HEADERS.length)).getDisplayValues()[0];
    const rowSku = String(r[COL_SHIP_SKU - 1] || '').trim().toUpperCase();
    const rowRef = String(r[COL_SHIP_REF - 1] || '').trim();
    if (rowSku === want && (!wantRef || rowRef === wantRef)) return { row: rowNum, healed: false };
  }

  // 2) เลขแถวชี้ผิด → ไล่หาจากใบโอน (refNum) + SKU
  const vals = sheet.getDataRange().getDisplayValues();
  const hits = [];
  for (let i = 2; i < vals.length; i++) {
    if (String(vals[i][COL_SHIP_SKU - 1] || '').trim().toUpperCase() !== want) continue;
    if (wantRef && String(vals[i][COL_SHIP_REF - 1] || '').trim() !== wantRef) continue;
    hits.push({ row: i + 1, received: !!String(vals[i][COL_SHIP_RECVAT - 1] || '').trim() });
  }
  if (!hits.length) {
    return { row: 0, reason: 'ไม่พบรายการนี้แล้ว (อาจถูกย้ายเข้าประวัติ) — กด Sync แล้วลองใหม่' };
  }
  // ยังไม่ถูกรับ เหลือแถวเดียว = ชัดเจนที่สุด
  const pending = hits.filter(function (h) { return !h.received; });
  if (pending.length === 1) return { row: pending[0].row, healed: true };
  if (pending.length === 0 && hits.length === 1) return { row: hits[0].row, healed: true }; // แก้จำนวนที่รับซ้ำ
  return { row: 0, reason: 'เจอหลายรายการที่ตรงกัน เลือกให้อัตโนมัติไม่ได้ — กด Sync แล้วลองใหม่' };
}

function confirmShipmentReceive(ss, rowId, sku, receivedQty, actor, refNum) {
  const sheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_TRANSFERS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const askedRow = parseInt(String(rowId).replace(/[^0-9]/g, ""));
    const found = findShipmentRow_(sheet, askedRow, refNum, sku);
    if (!found.row) return error(found.reason || "ไม่พบรายการนี้");
    const rowNum = found.row;
    const rowSku = String(sheet.getRange(rowNum, COL_SHIP_SKU).getDisplayValue()).trim().toUpperCase();

    const sentQty = parseInt(sheet.getRange(rowNum, COL_SHIP_QTY).getDisplayValue()) || 0;
    const recv    = Math.max(0, receivedQty || 0);
    const status  = recv >= sentQty ? "รับครบ" : "รับไม่ครบ";
    const nowStr  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    sheet.getRange(rowNum, COL_SHIP_RECVQTY).setValue(recv);
    sheet.getRange(rowNum, COL_SHIP_RECVSTATUS).setValue(status);
    sheet.getRange(rowNum, COL_SHIP_RECVAT).setValue(nowStr);
    sheet.getRange(rowNum, COL_SHIP_RECVBY).setValue(actor || "");

    try { writeAuditLog_(actor, "รับสินค้า", rowSku, status + " " + recv + "/" + sentQty); } catch (e) {}
    // "รับไม่ครบ" คือเรื่องที่คลังต้องรู้เดี๋ยวนั้น (ของหาย/นับพลาด) — รับครบไม่ต้องกวน
    if (status === "รับไม่ครบ") {
      pushInappNoti_({
        audience: 'role:warehouse,owner',
        type: 'shipment', tab: 'tracking',
        title: '⚠️ หน้าร้านรับของไม่ครบ',
        body: rowSku + ' · รับ ' + recv + '/' + sentQty + ' ชิ้น' + (actor ? ' · ' + actor : ''),
        by: actor,
        image: String(sheet.getRange(rowNum, COL_SHIP_IMAGE).getDisplayValue() || ''),   // แถวนี้ SKU เดียว — ดึงรูปจากคอลัมน์ J ได้ตรง ๆ
        focus: rowSku || '',   // กดแล้วพาไปหยุดที่สินค้าตัวที่รับไม่ครบเลย
      });
    }
    // healed = เลขแถวที่เครื่องผู้ใช้ส่งมาชี้ผิด แต่เราหาแถวที่ถูกเจอเองแล้ว (ไม่ต้องให้กดซ้ำ)
    return ok({ row: rowNum, receivedQty: recv, status, healed: !!found.healed, askedRow: askedRow });
  } finally {
    lock.releaseLock();
    try { invalidateCache_(); } catch(e) {}
  }
}

function updateLockData(ss, lockKey, entries, datetime, actor) {
  if (!lockKey || !Array.isArray(entries)) return error("lockKey หรือ entries ไม่ถูกต้อง");
  const sheet = ss.getSheetByName(SHEET_LOCKS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_LOCKS);

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(8000);
  if (!gotLock) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const data = sheet.getDataRange().getValues();
    const dt   = datetime || new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

    for (const entry of entries) {
      const sku = String(entry.sku || "").trim().toUpperCase();
      if (!sku) continue;

      let found = false;
      for (let i = 1; i < data.length; i++) {
        const rKey = String(data[i][COL_LOCK_KEY - 1]).trim();
        const rSku = String(data[i][COL_LOCK_SKU - 1]).trim().toUpperCase();
        if (rKey === lockKey && rSku === sku) {
          sheet.getRange(i + 1, COL_LOCK_QTY).setValue(entry.qty);
          sheet.getRange(i + 1, COL_LOCK_DATE).setValue(dt);
          found = true;
          break;
        }
      }
      if (!found && entry.isNew) {
        // A=ว่าง, B=SKU, C=lockKey, D=qty, E-G=ว่าง, H=date
        sheet.appendRow(["", sku, lockKey, entry.qty, "", "", "", dt]);
      }
      // Audit log: บันทึกทุก entry ที่เปลี่ยน — ใช้ actor จริงถ้ามี, fallback "ระบบ" เหมือนเดิม
      try { writeAuditLog_(actor || "ระบบ", "updateLockData", sku, "lockKey: " + lockKey + ", qty: " + entry.qty); } catch(e) {}
    }
    return ok({ lockKey, updated: entries.length });
  } finally {
    lock.releaseLock();
    try { invalidateCache_(); } catch(e) {}
  }
}

function deleteLockEntry(ss, lockKey, sku, actor) {
  if (!lockKey || !sku) return error("lockKey หรือ sku ไม่ครบ");
  const sheet = ss.getSheetByName(SHEET_LOCKS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_LOCKS);

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const rKey = String(data[i][COL_LOCK_KEY - 1]).trim();
    const rSku = String(data[i][COL_LOCK_SKU - 1]).trim().toUpperCase();
    if (rKey === lockKey && rSku === sku.toUpperCase()) {
      // 1) อ่าน before-state ก่อนลบ
      const before = { qty: data[i][COL_LOCK_QTY - 1] || "" };
      // 2) ลบจริง
      sheet.deleteRow(i + 1);
      // 3) ถึงจุดนี้ = ลบสำเร็จ → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น
      writeAuditLog_(actor || "ไม่ระบุ", "ลบตำแหน่งจัดเก็บ", sku,
        auditDetail_({ before: before, after: null, note: "ลบ " + sku + " ออกจากล็อค " + lockKey }));
      invalidateCache_(); // P0-4: bump dmj_last_write_ts ให้ conflict detection มองเห็น write นี้
      return ok({ deleted: sku, lockKey });
    }
  }
  return ok({ notFound: sku });
}

function updateFrontStore(ss, entries, datetime, actor) {
  const sheet = ss.getSheetByName(SHEET_FRONTSTORE_QTY);
  if (!sheet) return error("ไม่พบชีต จำนวนหน้าร้าน");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const dt = datetime || new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const rows = sheet.getDataRange().getValues();
    const auditRows = []; // เก็บ { sku, oldQty, newQty } เฉพาะรายการที่ค่าเปลี่ยน

    for (const entry of entries) {
      const sku = String(entry.sku || "").trim().toUpperCase();
      if (!sku) continue; // กัน entry ไม่มี sku สร้างแถวขยะ (pattern เดียวกับ updateLockData)
      const qty = Number(entry.qty) || 0;
      let found = false;

      for (let i = 1; i < rows.length; i++) {
        const rowSku = String(rows[i][1] || "").trim().toUpperCase();
        if (rowSku === sku) {
          const oldQty = Number(rows[i][3]) || 0;
          sheet.getRange(i + 1, 4).setValue(qty);
          sheet.getRange(i + 1, 9).setValue(dt);
          if (oldQty !== qty) auditRows.push({ sku, oldQty, newQty: qty });
          found = true;
          break;
        }
      }
      if (!found) {
        const newRow = Array(Math.max(rows[0] ? rows[0].length : 11, 11)).fill("");
        newRow[1] = sku;
        newRow[3] = qty;
        newRow[8] = dt;
        sheet.appendRow(newRow);
        auditRows.push({ sku, oldQty: null, newQty: qty });
      }
    }
    SpreadsheetApp.flush();
    try {
      const zortItems = entries
        .filter(e => e.sku && Number(e.qty) >= 0)
        .map(e => ({ sku: String(e.sku).trim().toUpperCase(), qty: Number(e.qty), warehousecode: WH_FRONTSTORE }));
      if (zortItems.length) pushStockToZort_(zortItems);
    } catch (e) { Logger.log("updateFrontStore ZORT push error: " + e); }
    // Audit log: บันทึกเฉพาะ SKU ที่ค่าเปลี่ยน (pattern เดียวกับ confirmStockCount)
    auditRows.forEach(function(r) {
      writeAuditLog_(actor || "ไม่ระบุ", "ตรวจหน้าร้าน", r.sku,
        auditDetail_({ before: { qty: r.oldQty }, after: { qty: r.newQty }, note: "ตรวจจำนวนหน้าร้าน" }));
    });
    invalidateCache_(); // P0-4: bump dmj_last_write_ts ให้ conflict detection มองเห็น write นี้
    return ok({ updated: entries.length });
  } finally {
    lock.releaseLock();
  }
}

// อ่านชีต "ขายไม่สแกน" → { skuUpper: จำนวนรวมทุกวัน }
function readUnscannedSalesMap_() {
  const map = {};
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_UNSCANNED_SALE);
    if (!sh) return map;
    const rows = sh.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const sku = String(rows[i][1] || "").trim().toUpperCase();
      const qty = Number(rows[i][2]) || 0;
      if (sku && qty > 0) map[sku] = (map[sku] || 0) + qty;
    }
  } catch (e) { Logger.log("readUnscannedSalesMap_ error: " + e); }
  return map;
}

// บันทึก "ขายไม่สแกน" ของ SKU สำหรับวันนี้ (upsert ต่อ sku+วัน — กันบันทึกซ้ำจาก auto-save)
// qty<=0 = ลบรายการของวันนี้ (ผู้ใช้ยกเลิก/เปลี่ยนใจ) · ไม่แตะ ZORT ไม่แตะยอดเงิน
function recordUnscannedSale_(sku, qty, actor) {
  const jsonOut = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const skuU = String(sku || "").trim().toUpperCase();
    if (!skuU) return jsonOut({ ok: false, error: "ไม่มี SKU" });
    const q = Math.max(0, Math.floor(Number(qty) || 0));
    const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(SHEET_UNSCANNED_SALE);
    if (!sh) { sh = ss.insertSheet(SHEET_UNSCANNED_SALE); sh.appendRow(["วันที่", "SKU", "จำนวน", "โดย", "เวลา"]); }
    const rows = sh.getDataRange().getValues();
    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][1] || "").trim().toUpperCase() === skuU &&
          String(rows[i][0] || "").trim() === today) { rowIdx = i + 1; break; }
    }
    const stamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm");
    if (q <= 0) {
      if (rowIdx > 0) sh.deleteRow(rowIdx);
    } else if (rowIdx > 0) {
      sh.getRange(rowIdx, 3, 1, 3).setValues([[q, actor || "owner", stamp]]);
    } else {
      sh.appendRow([today, skuU, q, actor || "owner", stamp]);
    }
    invalidateCache_(); // ให้ payload คำนวณ soldQty ใหม่
    return jsonOut({ ok: true, sku: skuU, qty: q });
  } catch (e) {
    return jsonOut({ ok: false, error: String(e) });
  }
}

function confirmStockCount(ss, entries, clientLoadedAt, actor) {
  if (!Array.isArray(entries) || !entries.length) return error("entries ว่างเปล่า");

  // หมายเหตุ: ไม่ใช้ global conflict detection ที่นี่ — ต่างจาก transferStockBatch
  // เพราะการนับสต็อกเป็นการ "กำหนดค่าจำนวนตรง ๆ" (absolute set) ไม่ใช่หักลบ
  // หลายเครื่องนับคนละล็อค/คนละ SKU พร้อมกันได้อย่างปลอดภัย (LockService serialize การเขียน)
  // ถ้าบล็อกด้วย timestamp จะทำให้เครื่องที่บันทึกทีหลังกดไม่ได้ → ใช้งานพร้อมกันไม่ได้
  // (clientLoadedAt ยังรับไว้เพื่อ backward-compat แต่ไม่ reject)

  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const data = sheet.getDataRange().getValues();
    let updated = 0;
    const auditRows = []; // เก็บ { sku, oldQty, newQty } สำหรับ audit log

    // สร้าง index SKU→แถว ครั้งเดียว (O(rows)) แทนการ scan ซ้ำทุก entry (เดิม O(entries×rows))
    // first occurrence wins — ตรงกับพฤติกรรมเดิมที่ inner loop break ที่ match แรก
    const skuToIndex = {};
    for (let i = 1; i < data.length; i++) {
      const s = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
      if (s && !(s in skuToIndex)) skuToIndex[s] = i;
    }

    for (const entry of entries) {
      const sku = String(entry.sku || "").trim().toUpperCase();
      const qty = Number(entry.qty) || 0;
      const i = skuToIndex[sku];
      if (i === undefined) continue;
      const oldQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
      sheet.getRange(i + 1, COL_PROD_QTYWH).setValue(qty);
      data[i][COL_PROD_QTYWH - 1] = qty;
      auditRows.push({ sku, oldQty, newQty: qty });
      updated++;
    }
    SpreadsheetApp.flush();

    // เก็บ counted SKUs ไว้ใน cache 30 นาที — กัน syncZortBoth ทับค่าที่เพิ่งนับ
    const countedSkuMap = {};
    entries.filter(e => e.sku && Number(e.qty) >= 0).forEach(function(e) {
      countedSkuMap[String(e.sku).trim().toUpperCase()] = Number(e.qty);
    });
    CacheService.getScriptCache().put('recentCountedSkus', JSON.stringify(countedSkuMap), 1800);

    let zortSynced = true;
    try {
      const zortItems = Object.entries(countedSkuMap).map(function([sku, qty]) {
        return { sku: sku, qty: qty, warehousecode: WH_SAI5 };
      });
      if (zortItems.length) pushStockToZort_(zortItems);
    } catch (e) {
      zortSynced = false;
      Logger.log("confirmStockCount ZORT push error: " + e);
    }

    // Audit log: บันทึกเฉพาะ SKU ที่ค่าเปลี่ยน
    auditRows.forEach(function(r) {
      if (r.oldQty !== r.newQty) {
        writeAuditLog_(actor, "นับสต็อก", r.sku, "qty: " + r.oldQty + "→" + r.newQty);
      }
    });

    return ok({ confirmed: updated, zortSynced: zortSynced,
      warning: zortSynced ? null : "บันทึกใน Sheets แล้ว แต่ sync ไป ZORT ไม่สำเร็จ ระบบจะซิงค์ใหม่อัตโนมัติ" });
  } finally {
    lock.releaseLock();
    invalidateCache_();
  }
}

function deleteOrderRow(ss, orderId, actor, expectSku) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต ลำดับที่สั่งสินค้า");
  const rowNum = parseInt(String(orderId).replace(/[^0-9]/g, ""));
  if (!rowNum || rowNum < 3) return error("orderId ไม่ถูกต้อง");

  // orderId encode row number ณ เวลาที่โหลดข้อมูล — LockService ป้องกัน concurrent delete
  // แต่ถ้าเวลาผ่านไปนานและมี delete อื่นเกิดขึ้น row อาจเลื่อน
  const lock = LockService.getScriptLock();
  if (!lock.waitLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    // 1) อ่าน before-state ก่อนลบ (A..I: mode,date,status,from,to,sku,name,orderQty,preparedQty)
    const rowData = sheet.getRange(rowNum, 1, 1, 9).getValues()[0];
    const sku = String(rowData[5] || '').trim();
    if (!sku) return error("แถวที่ " + rowNum + " ไม่มีข้อมูล SKU — อาจเลื่อนแถวแล้ว");
    // ⚠️ "มี SKU" ยังไม่พอ ต้องเป็น SKU **ตัวที่ผู้ใช้กดลบ** ด้วย — แถวเลื่อนขึ้นเพราะมีคน
    //    ลบใบอื่นไปก่อน แล้วเราลบตามเลขแถวเดิม = ลบออเดอร์ของคนอื่นทิ้งโดยไม่มีใครรู้
    //    (ลบแล้วกู้ไม่ได้ จึงปฏิเสธให้รีเฟรช ไม่ไล่หาแถวใกล้เคียงเองเหมือนตอนแก้จำนวน)
    if (expectSku && String(expectSku).trim().toUpperCase() !== sku.toUpperCase())
      return error("รายการเลื่อนแถว (แถวนี้เป็น " + sku + ") — กดซิงค์แล้วลองใหม่");
    const before = {
      status: rowData[2] || "", sku: sku, name: rowData[6] || "",
      orderQty: rowData[7] || "", preparedQty: rowData[8] || "",
    };
    // 2) ลบจริง — GAS deleteRow() เป็น synchronous, throw ถ้าล้มเหลว
    sheet.deleteRow(rowNum);
    // 3) ถึงจุดนี้ = ลบสำเร็จ (ไม่ throw) → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น
    writeAuditLog_(actor, "ลบ order", orderId, auditDetail_({ before: before, after: null, note: "ลบ order (" + sku + ")" }));
    invalidateCache_(); // P0-4: bump dmj_last_write_ts ให้ conflict detection มองเห็น write นี้
    return ok({ deleted: orderId });
  } finally {
    lock.releaseLock();
  }
}

// ลบหลาย order rows ในครั้งเดียว — เรียงจากแถวล่างขึ้นบนกัน index เลื่อน
// orderSkus = SKU ที่ client คาดว่าอยู่ในแต่ละแถว (index ตรงกับ orderIds) — ใช้กันลบผิดใบ
function deleteOrderRows(ss, orderIds, actor, orderSkus) {
  if (!Array.isArray(orderIds) || !orderIds.length) return error("orderIds ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต ลำดับที่สั่งสินค้า");
  const skus = Array.isArray(orderSkus) ? orderSkus : [];

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    const items = orderIds
      .map((id, i) => ({ id: id, sku: skus[i] || "", rowNum: parseInt(String(id).replace(/[^0-9]/g, "")) }))
      .filter(x => x.rowNum >= 3)
      .sort((a, b) => b.rowNum - a.rowNum);   // มาก→น้อย กัน index เลื่อนตอนลบ
    let deleted = 0;
    const mismatched = [];
    for (const item of items) {
      // 1) อ่าน before-state ก่อนลบ (A..I: mode,date,status,from,to,sku,name,orderQty,preparedQty)
      const rowData = sheet.getRange(item.rowNum, 1, 1, 9).getValues()[0];
      const rowSku = String(rowData[5] || "").trim();
      // ⚠️ แถวเลื่อน (มีคนลบใบอื่นไปก่อน) → ข้ามใบนี้ ห้ามลบ · ลบแล้วกู้ไม่ได้
      //    เก็บใส่ mismatched แล้วรายงานกลับ ไม่เงียบ — ผู้ใช้ต้องรู้ว่าใบไหนยังไม่ถูกลบ
      if (item.sku && rowSku.toUpperCase() !== String(item.sku).trim().toUpperCase()) {
        mismatched.push(item.sku);
        continue;
      }
      const before = {
        status: rowData[2] || "", sku: rowSku, name: rowData[6] || "",
        orderQty: rowData[7] || "", preparedQty: rowData[8] || "",
      };
      // 2) ลบจริง — GAS deleteRow() เป็น synchronous, throw ถ้าล้มเหลว
      sheet.deleteRow(item.rowNum);
      deleted++;
      // 3) ถึงจุดนี้ = ลบสำเร็จ → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น
      writeAuditLog_(actor, "ลบ order (batch)", item.id, auditDetail_({ before: before, after: null, note: "ลบ order แบบ batch" }));
    }
    if (deleted > 0) invalidateCache_(); // P0-4: bump dmj_last_write_ts ครั้งเดียวหลัง batch เสร็จ
    if (mismatched.length && !deleted)
      return error("รายการเลื่อนแถว (" + mismatched.join(", ") + ") — กดซิงค์แล้วลองใหม่");
    return ok({ deleted, mismatched });
  } finally {
    lock.releaseLock();
  }
}

// ───────────────────────────────────────────────────────────
// SECTION 4: ZORT API Integration
// ───────────────────────────────────────────────────────────

function zortHeaders_() {
  return { storename: ZORT_STORE, apikey: ZORT_APIKEY, apisecret: ZORT_SECRET };
}

// Push exact stock qty to ZORT for one or more SKUs per warehouse
// items = [{ sku, qty, warehousecode }]
function pushStockToZort_(items) {
  if (!items || !items.length) return;
  const groups = {};
  for (const item of items) {
    const wh = item.warehousecode || WH_SAI5;
    if (!groups[wh]) groups[wh] = [];
    // ZORT V4: stocks[].sku, stocks[].stock (ไม่ใช่ list/number)
    if (item.sku && item.qty >= 0) groups[wh].push({ sku: String(item.sku).trim(), stock: Number(item.qty) });
  }
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
  for (const [wh, stocks] of Object.entries(groups)) {
    try {
      // ENDPOINT: /Product/UpdateProductStockList = "ปรับสต็อก (ตั้งค่าใหม่)" ตาม ZORTOUT_API.md
      //   เราส่ง stock เป็น "ค่าคงเหลือใหม่แบบ absolute" (set ทับ) จึงต้องใช้ endpoint นี้
      //   ไม่ใช่ /Product/UpdateProductAvailableStockList ("ปรับ Available Stock" — คนละความหมาย)
      //   ยืนยันแล้วจากตาราง PRODUCT ใน ZORTOUT_API.md — อย่าเปลี่ยนถ้าไม่มีหลักฐานว่า push ล้มเหลว
      // warehousecode เป็น query param ตาม ZORT docs ("Stock API ต้องระบุ warehousecode เป็น query parameter")
      const url = `${ZORT_BASE}/Product/UpdateProductStockList?warehousecode=${encodeURIComponent(wh)}`;
      const res = UrlFetchApp.fetch(url, {
        method: "post", headers,
        payload: JSON.stringify({ stocks }),
        muteHttpExceptions: true
      });
      Logger.log(`pushStockToZort [${wh}]: HTTP ${res.getResponseCode()} — ` + res.getContentText().substring(0, 300));
      const err = zortRespError_(res);
      if (err) logZortFailure_("อัปเดตสต็อก (" + wh + ")", err + " | SKU: " + stocks.map(s => s.sku).join(","));
    } catch (e) {
      Logger.log(`pushStockToZort [${wh}] error: ` + e);
      logZortFailure_("อัปเดตสต็อก (" + wh + ")", String(e) + " | SKU: " + stocks.map(s => s.sku).join(","));
    }
  }
}

// หา URL รูปจาก product object ของ ZORT
// ZORT ใช้ imagepath (string URL หลัก) และ imageList (array)
function pickZortImage_(p) {
  const ip = String(p.imagepath || '').trim();
  if (/^https?:\/\//i.test(ip)) return ip;
  if (Array.isArray(p.imageList) && p.imageList.length) {
    for (const it of p.imageList) {
      const v = (typeof it === 'string') ? it
              : (it && (it.url || it.imagepath || it.path || it.image)) || '';
      const s = String(v).trim();
      if (/^https?:\/\//i.test(s)) return s;
    }
  }
  // fallback: scan field อื่นที่อาจเป็น URL รูป
  for (const k of Object.keys(p)) {
    if (/image|photo|picture|img|thumb/i.test(k)) {
      const v = String(p[k] || '').trim();
      if (/^https?:\/\//i.test(v)) return v;
    }
  }
  return '';
}

// ดึงรูปจาก ZORT → เขียนคอลัมน์ E ของชีต imageUrl (ไม่แตะคอลัมน์ D ที่ใส่เอง)
function syncZortImages() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_IMAGE_URL);
  if (!sh) { Logger.log('ไม่พบชีต imageUrl'); return; }

  const products = fetchAllZortProducts_(); // ทุกคลัง
  const zortImg = {};
  let withImg = 0;
  products.forEach(p => {
    const sku = String(p.sku || p.barcode || '').trim().toUpperCase();
    if (!sku) return;
    const img = pickZortImage_(p);
    if (img) { zortImg[sku] = img; withImg++; }
  });
  Logger.log(`ZORT: ${products.length} สินค้า, มีรูป ${withImg}`);

  const rows = sh.getDataRange().getValues();
  if (!String(rows[0][4] || '').trim()) sh.getRange(1, 5).setValue('รูปจาก ZORT (auto)');

  let updated = 0, added = 0;
  const existing = {};
  for (let i = 1; i < rows.length; i++) {
    const sku = String(rows[i][1] || '').trim().toUpperCase();
    if (!sku) continue;
    existing[sku] = i + 1; // row number
    if (zortImg[sku] && zortImg[sku] !== String(rows[i][4] || '').trim()) {
      sh.getRange(i + 1, 5).setValue(zortImg[sku]);
      updated++;
    }
  }
  // เพิ่ม SKU ใหม่ที่ยังไม่มีในชีต imageUrl
  Object.keys(zortImg).forEach(sku => {
    if (!existing[sku]) {
      sh.appendRow(['', sku, '', '', zortImg[sku]]);
      added++;
    }
  });

  SpreadsheetApp.flush();
  invalidateCache_();
  Logger.log(`✅ syncZortImages: อัปเดต ${updated} แถว, เพิ่มใหม่ ${added} แถว`);
}

// ตั้ง trigger sync รูปจาก ZORT ทุกสัปดาห์ (วันจันทร์ 05:00)
function setupZortImageTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncZortImages') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncZortImages').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  Logger.log('✅ ตั้ง trigger: syncZortImages ทุกวันจันทร์ 05:00');
}

function getZortWarehouses() {
  const res  = UrlFetchApp.fetch(`${ZORT_BASE}/Warehouse/GetWarehouses`,
    { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
  const json = JSON.parse(res.getContentText());
  const list = json.list || json.warehouses || json.data || [];
  if (Array.isArray(list) && list.length) {
    Logger.log("warehouse[0] keys: " + JSON.stringify(Object.keys(list[0])));
    list.forEach((w, i) => Logger.log(`#${i+1} ` + JSON.stringify(w)));
  } else {
    Logger.log("RAW: " + res.getContentText().substring(0, 1500));
  }
}

// ─────────────────────────────────────────────────────────────
// DIAGNOSTIC: สำรวจโครงสร้าง response ของ ZORT Order API
// รันฟังก์ชันนี้ครั้งเดียวใน Apps Script Editor → ดู Execution log → ส่ง output กลับมา
// เพื่อใช้เขียน auto-sync ยอดขายให้ตรงกับชื่อ field จริง (ไม่ต้องเดา)
// อ่านอย่างเดียว ไม่แก้ไขข้อมูลใดๆ
// ─────────────────────────────────────────────────────────────
function exploreZortSales() {
  const tz = "Asia/Bangkok";
  const today = new Date();
  const from  = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 วันล่าสุด
  const fromStr = Utilities.formatDate(from,  tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  // ลองหลายชื่อ param วันที่ที่ ZORT อาจใช้ — เก็บอันที่คืนข้อมูล
  const tryEndpoints = [
    `${ZORT_BASE}/Order/GetOrders?page=1&limit=5&fromdate=${fromStr}&todate=${toStr}`,
    `${ZORT_BASE}/Order/GetMovementOrders?page=1&limit=5&fromdate=${fromStr}&todate=${toStr}`,
  ];

  tryEndpoints.forEach(url => {
    Logger.log("──────────────────────────────────────");
    Logger.log("GET " + url);
    try {
      const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
      Logger.log("HTTP " + res.getResponseCode());
      const text = res.getContentText();
      const json = JSON.parse(text);
      Logger.log("top-level keys: " + JSON.stringify(Object.keys(json)));
      const list = json.list || json.orders || json.data || [];
      Logger.log("list length: " + (Array.isArray(list) ? list.length : "(ไม่ใช่ array)"));
      if (Array.isArray(list) && list.length) {
        const first = list[0];
        Logger.log("order[0] keys: " + JSON.stringify(Object.keys(first)));
        Logger.log("order[0] sample: " + JSON.stringify(first).substring(0, 1500));
        // หา array รายการสินค้าใน order (line items)
        Object.keys(first).forEach(k => {
          if (Array.isArray(first[k]) && first[k].length && typeof first[k][0] === 'object') {
            Logger.log(`order[0].${k}[0] keys: ` + JSON.stringify(Object.keys(first[k][0])));
            Logger.log(`order[0].${k}[0] sample: ` + JSON.stringify(first[k][0]).substring(0, 800));
          }
        });
      }
    } catch (e) {
      Logger.log("ERROR: " + e);
    }
  });
  Logger.log("──────── เสร็จ — copy log ทั้งหมดส่งกลับมา ────────");
}

// ─── Marketing diagnostic (READ-ONLY) ───────────────────────────────────────
// นับสถิติออเดอร์เพื่อตอบว่า: ช่องทางไหนขายเท่าไร, ลูกค้าระบุตัวตนกี่ %,
// ใช้ส่วนลด/voucher แค่ไหน, มีลูกค้าซ้ำไหม — ใช้ตัดสินใจว่าควรทำ marketing แบบไหน
// ไม่แตะชีต ไม่แตะ ZORT (GET อย่างเดียว) · รันเองใน editor แล้วส่ง log กลับมา
// ดึง+ประมวลผลทีละหน้า + มี time budget หยุดเองก่อนชนลิมิต 6 นาที (สรุปเท่าที่ดึงได้)
// ปรับช่วงเวลาได้ที่ DAYS (90=เร็ว, 30=เร็วมาก, 365=ทั้งปีอาจ timeout ถ้าออเดอร์เยอะ)
function analyzeZortMarketing() {
  const startMs = Date.now();
  const BUDGET_MS = 4.5 * 60 * 1000; // หยุดดึงเมื่อใช้เวลาเกิน 4.5 นาที (กันชนลิมิต 6 นาที)
  const tz = "Asia/Bangkok";
  const today = new Date();
  const DAYS = 90;
  const fromDate = new Date(today.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const fromStr = Utilities.formatDate(fromDate, tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  Logger.log("──────────────────────────────────────");
  Logger.log("ช่วง " + fromStr + " → " + toStr + " (" + DAYS + " วัน)");

  // helper: เพิ่มยอดลง bucket { count, rev }
  const bump = (obj, key, rev) => {
    const k = (key === null || key === undefined || key === "") ? "(ว่าง)" : String(key);
    if (!obj[k]) obj[k] = { count: 0, rev: 0 };
    obj[k].count++;
    obj[k].rev += rev;
  };
  // helper: log bucket เรียงตามยอดขาย (มาก→น้อย) เอาแค่ top N
  const dump = (label, obj, total, topN) => {
    Logger.log("── " + label + " ──");
    const rows = Object.entries(obj).sort((a, b) => b[1].rev - a[1].rev);
    const show = topN ? rows.slice(0, topN) : rows;
    show.forEach(([k, v]) => {
      const pctOrd = total ? Math.round(v.count / total * 100) : 0;
      Logger.log(`   ${k} : ${v.count} ออเดอร์ (${pctOrd}%) · ${Math.round(v.rev).toLocaleString()} บาท`);
    });
    if (topN && rows.length > topN) Logger.log(`   …และอีก ${rows.length - topN} ค่า`);
  };

  const statusCount = {};
  const byChannel = {}, byWarehouse = {}, byMarketplace = {}, byTag = {}, byAgent = {};
  const custCount = {};                 // customerid → { count, rev, name }
  let success = 0, totalRev = 0;
  let hasPhone = 0, hasLine = 0, hasEmail = 0, hasFacebook = 0, hasCustId = 0, hasAnyId = 0;
  let hasDiscount = 0, hasVoucher = 0, discountSum = 0, voucherSum = 0;

  // ประมวลผล 1 ออเดอร์
  const processOrder = (o) => {
    statusCount[o.status || "null"] = (statusCount[o.status || "null"] || 0) + 1;
    if (o.status !== "Success") return;

    // กันวันที่เพี้ยน (นอกช่วง) แบบเดียวกับ syncZortSales
    const dateStr = o.orderdateString || (o.orderdate ? String(o.orderdate).substring(0, 10) : null);
    if (dateStr) {
      const [yr, mo, dy] = dateStr.split("-").map(Number);
      const oDate = new Date(yr, mo - 1, dy);
      if (oDate < fromDate || oDate > today) return;
    }

    success++;
    const rev = Number(o.amount) || Number(o.totalproductamount) || 0;
    totalRev += rev;

    bump(byChannel,     o.saleschannel,   rev);
    bump(byWarehouse,   o.warehousecode,  rev);
    if (o.marketplacename) bump(byMarketplace, o.marketplacename, rev);
    if (o.tag)   bump(byTag,   o.tag,   rev);
    bump(byAgent, o.createusername || o.agent, rev);

    // ตัวตนลูกค้า
    const phone = String(o.customerphone || "").trim();
    const line  = String(o.lineid || o.line || "").trim();
    const email = String(o.customeremail || "").trim();
    const fb    = String(o.facebookid || o.facebookname || "").trim();
    const cid   = o.customerid;
    if (phone) hasPhone++;
    if (line)  hasLine++;
    if (email) hasEmail++;
    if (fb)    hasFacebook++;
    if (cid)   hasCustId++;
    if (phone || line || email || fb || cid) hasAnyId++;

    // ลูกค้าซ้ำ — group ด้วย customerid (fallback phone)
    const custKey = cid ? ("id:" + cid) : (phone ? ("ph:" + phone) : null);
    if (custKey) {
      if (!custCount[custKey]) custCount[custKey] = { count: 0, rev: 0, name: o.customername || custKey };
      custCount[custKey].count++;
      custCount[custKey].rev += rev;
    }

    // ส่วนลด / voucher
    const disc = Number(o.discountamount) || Number(o.discount) || 0;
    const vouch = Number(o.voucheramount) || 0;
    if (disc > 0)  { hasDiscount++; discountSum += disc; }
    if (vouch > 0) { hasVoucher++;  voucherSum += vouch; }
  };

  // ดึงทีละหน้าแล้วประมวลผลทันที (ไม่เก็บออเดอร์ทั้งหมดใน memory) + หยุดเมื่อชน time budget
  const limit = 200, MAX_PAGES = 200;
  let fetched = 0, stopped = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (Date.now() - startMs > BUDGET_MS) {
      stopped = true;
      Logger.log("⏱️ หยุดดึงก่อนชนลิมิต — ประมวลผลเท่าที่ได้ (" + fetched + " ออเดอร์, ถึงหน้า " + (page - 1) + ")");
      break;
    }
    const url = `${ZORT_BASE}/Order/GetOrders?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { Logger.log("หยุด: HTTP " + res.getResponseCode() + " หน้า " + page); break; }
    const list = (JSON.parse(res.getContentText())).list || [];
    for (const o of list) processOrder(o);
    fetched += list.length;
    if (list.length < limit) break;
    Utilities.sleep(120);
  }
  Logger.log("ดึงออเดอร์รวม (ทุก status): " + fetched + (stopped ? " (บางส่วน — เพิ่ม DAYS ให้น้อยลงถ้าอยากได้ครบ)" : ""));

  Logger.log("status breakdown: " + JSON.stringify(statusCount));
  Logger.log("ออเดอร์ Success (นับจริง): " + success + " · ยอดรวม " + Math.round(totalRev).toLocaleString() + " บาท");
  const pct = n => success ? Math.round(n / success * 100) : 0;

  Logger.log("");
  Logger.log("════ 1) ช่องทางขาย ════");
  dump("saleschannel", byChannel, success, 15);
  dump("warehousecode", byWarehouse, success, 15);
  if (Object.keys(byMarketplace).length) dump("marketplacename (เฉพาะที่มีค่า)", byMarketplace, success, 15);

  Logger.log("");
  Logger.log("════ 2) ตัวตนลูกค้า (% ของออเดอร์ Success) ════");
  Logger.log(`   มีเบอร์โทร  : ${hasPhone} (${pct(hasPhone)}%)`);
  Logger.log(`   มี LINE     : ${hasLine} (${pct(hasLine)}%)`);
  Logger.log(`   มีอีเมล     : ${hasEmail} (${pct(hasEmail)}%)`);
  Logger.log(`   มี Facebook : ${hasFacebook} (${pct(hasFacebook)}%)`);
  Logger.log(`   มี customerid: ${hasCustId} (${pct(hasCustId)}%)`);
  Logger.log(`   มีอย่างน้อย 1 อย่าง: ${hasAnyId} (${pct(hasAnyId)}%)  ← ยิงโปรหาได้กี่ %`);

  Logger.log("");
  Logger.log("════ 3) ลูกค้าซ้ำ (จาก customerid/phone ที่ระบุตัวตน) ════");
  const custs = Object.values(custCount);
  const repeat = custs.filter(c => c.count >= 2);
  Logger.log(`   ลูกค้าระบุตัวตนทั้งหมด: ${custs.length} ราย`);
  Logger.log(`   ซื้อซ้ำ ≥2 ครั้ง: ${repeat.length} ราย (${custs.length ? Math.round(repeat.length / custs.length * 100) : 0}%)`);
  const topCust = custs.sort((a, b) => b.rev - a.rev).slice(0, 10);
  Logger.log("   Top 10 ลูกค้า (ตามยอดซื้อ):");
  topCust.forEach(c => Logger.log(`     ${c.name} : ${c.count} ครั้ง · ${Math.round(c.rev).toLocaleString()} บาท`));

  Logger.log("");
  Logger.log("════ 4) ส่วนลด / Voucher ════");
  Logger.log(`   ออเดอร์มีส่วนลด : ${hasDiscount} (${pct(hasDiscount)}%) · รวม ${Math.round(discountSum).toLocaleString()} บาท`);
  Logger.log(`   ออเดอร์มี voucher: ${hasVoucher} (${pct(hasVoucher)}%) · รวม ${Math.round(voucherSum).toLocaleString()} บาท`);

  if (Object.keys(byTag).length) {
    Logger.log("");
    Logger.log("════ 5) Tag ออเดอร์ (top 10) ════");
    dump("tag", byTag, success, 10);
  }
  Logger.log("");
  Logger.log("════ 6) ผู้สร้างออเดอร์ / agent (top 10 — ดูยอดต่อคน) ════");
  dump("createusername/agent", byAgent, success, 10);

  Logger.log("──────── เสร็จ — copy log ทั้งหมดส่งกลับมา ────────");
}

// ─── Quotation schema explorer (READ-ONLY) ──────────────────────────────────
// ดู field ของใบเสนอราคาจาก ZORT: ใครเป็นคนเสนอ (เซล), สถานะอนุมัติ, ยอด, ลูกค้า, วันที่,
// และมี field ที่บอกว่าใบเสนอราคานี้กลายเป็น order/อนุมัติแล้วหรือยัง — ใช้ก่อนสร้างรายงาน conversion
// รันเองใน editor แล้วส่ง log กลับมา
function exploreZortQuotations() {
  const tz = "Asia/Bangkok";
  const today = new Date();
  const from  = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fromStr = Utilities.formatDate(from,  tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  const url = `${ZORT_BASE}/Quotation/GetQuotations?page=1&limit=5&fromdate=${fromStr}&todate=${toStr}`;
  Logger.log("──────────────────────────────────────");
  Logger.log("GET " + url);
  try {
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    Logger.log("HTTP " + res.getResponseCode());
    const json = JSON.parse(res.getContentText());
    Logger.log("top-level keys: " + JSON.stringify(Object.keys(json)));
    const list = json.list || json.quotations || json.data || [];
    Logger.log("list length: " + (Array.isArray(list) ? list.length : "(ไม่ใช่ array)"));
    if (Array.isArray(list) && list.length) {
      const q = list[0];
      Logger.log("quotation[0] keys: " + JSON.stringify(Object.keys(q)));
      Logger.log("quotation[0] sample: " + JSON.stringify(q).substring(0, 1800));
      // เดา field ที่เกี่ยวกับ "เซลคนเสนอ" + "สถานะอนุมัติ/แปลงเป็น order" เพื่อชี้จุดให้ดูง่าย
      const hint = {};
      Object.keys(q).forEach(k => {
        if (/creat|user|saler|sale|agent|staff|owner|by/i.test(k)) hint["👤 " + k] = q[k];
        if (/status|approv|convert|order|reference|success|state/i.test(k)) hint["📋 " + k] = q[k];
        if (/amount|total|price|customer|date/i.test(k)) hint["💰 " + k] = q[k];
      });
      Logger.log("fields ที่น่าสนใจ: " + JSON.stringify(hint).substring(0, 1500));
      // line items
      Object.keys(q).forEach(k => {
        if (Array.isArray(q[k]) && q[k].length && typeof q[k][0] === 'object') {
          Logger.log(`quotation[0].${k}[0] keys: ` + JSON.stringify(Object.keys(q[k][0])));
        }
      });
      // แจกแจงสถานะของทั้ง 5 ใบ เพื่อเห็นค่า status จริง
      Logger.log("status ของ 5 ใบแรก: " + JSON.stringify(list.map(x => x.status)));
    }
  } catch (e) {
    Logger.log("ERROR: " + e);
  }
  Logger.log("──────── เสร็จ — copy log ทั้งหมดส่งกลับมา ────────");
}

// ─── AddQuotation payload explorer — สร้างใบทดสอบจริงแล้วลบทิ้งทันที (test-then-void) ────
// ทำไมต้อง "สร้างจริงแล้วลบ" แทนอ่านอย่างเดียว: /Quotation/AddQuotation ไม่มีเอกสารบอกชื่อ field
// ที่แน่ชัด (ต่างจาก Order ที่มี POS_ZORT_FIELDS ยืนยันแล้ว) การเดา field เพื่อสร้างระบบออกใบเสนอราคา
// ที่กระทบเงิน/ลูกค้าจริงเสี่ยงเกินไป — mirror pattern เดียวกับ exploreProductTag()
// (สร้างทดสอบ → อ่านกลับ → ลบทิ้ง ไม่เหลือขยะ) ใช้ SKU สินค้าจริงที่มีอยู่แล้ว (ไม่กระทบสต็อก
// เพราะ Quotation ไม่ตัดสต็อกใน ZORT) รันเองใน GAS editor 1 ครั้ง แล้วส่ง Execution log ทั้งหมดกลับมา
function exploreZortAddQuotation() {
  const H = zortHeaders_();
  const jsonHeaders = Object.assign({}, H, { "Content-Type": "application/json" });

  // 1) หา SKU จริงสักตัวจากชีตสต็อกมาใช้ทดสอบ (กันพลาดเรื่อง SKU ไม่มีอยู่จริง)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const stockRows = stockSh ? stockSh.getDataRange().getValues() : [];
  let testSku = "", testName = "สินค้าทดสอบ";
  for (let i = 1; i < stockRows.length; i++) {
    const sku = String(stockRows[i][1] || "").trim();
    if (sku) { testSku = sku; testName = String(stockRows[i][2] || testName).trim(); break; }
  }
  if (!testSku) { Logger.log("❌ ไม่เจอ SKU ในชีตสต็อกเลย หาสินค้าทดสอบไม่ได้"); return; }
  Logger.log("ใช้สินค้าทดสอบ: " + testSku + " (" + testName + ")");

  // 2) ลองยิง AddQuotation ด้วย payload รูปแบบเดียวกับ AddOrder (มี field ลูกค้า+list+discount)
  //    เผื่อ ZORT ใช้ schema ต่างกัน — ลอง field ชื่อที่เป็นไปได้ให้ครบในก้อนเดียว แล้วดูว่า field ไหน
  //    ถูก echo กลับมาจริง (นั่นคือ field ที่ ZORT รู้จัก)
  const payload = {
    date: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy"),
    customername: "ทดสอบ Explore (ลบอัตโนมัติ)",
    customertaxid: "0105500000000",
    customerbranch: "สำนักงานใหญ่",
    customerbranchcode: "00000",
    customeraddress: "ที่อยู่ทดสอบ",
    customerphone: "0800000000",
    customeremail: "test@example.com",
    remark: "ทดสอบสำรวจ field (ลบอัตโนมัติหลังรัน)",
    discount: "6%",
    tag: ["ทดสอบเซล"],
    channel: "ทดสอบ",
    list: [{
      sku: testSku,
      name: testName + " (ทดสอบ)",
      number: 1,
      pricepernumber: 10,
      price: 10,
      totalprice: 10,
    }],
  };
  Logger.log("payload ที่ส่ง: " + JSON.stringify(payload));

  const res = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
    method: "post", headers: jsonHeaders, payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  Logger.log("AddQuotation HTTP " + res.getResponseCode());
  const raw = res.getContentText();
  Logger.log("AddQuotation raw response: " + raw.substring(0, 2000));

  let json = {};
  try { json = JSON.parse(raw); } catch (e) { Logger.log("⚠️ response ไม่ใช่ JSON: " + e); }
  Logger.log("top-level keys: " + JSON.stringify(Object.keys(json)));

  // AddQuotation ตอบกลับแบบเดียวกับ AddOrder: {resCode,resDesc=id,resDesc2=number,detail:{id,number,...}}
  // ไม่ใช่ top-level id/number ตรงๆ — เช็ค detail ก่อน แล้วค่อย fallback resDesc/resDesc2
  const det = json.detail || {};
  const qId = det.id || json.id || json.quotationid || json.quotationId ||
    (json.resDesc && !isNaN(Number(json.resDesc)) ? Number(json.resDesc) : null) || null;
  const qNumber = det.number || json.number || json.quotationnumber || json.quotationNumber ||
    json.resDesc2 || null;
  Logger.log("👉 id ที่ได้กลับ: " + qId + " | number ที่ได้กลับ: " + qNumber);

  // 3) ถ้าสร้างสำเร็จ → ดึง GetQuotationDetail มาดู full schema (โดยเฉพาะ list/discount ที่ echo กลับ)
  if (qId != null || qNumber) {
    Utilities.sleep(1000);
    const idParam = qId != null ? qId : qNumber;
    const detRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(idParam),
      { method: "get", headers: H, muteHttpExceptions: true });
    Logger.log("GetQuotationDetail HTTP " + detRes.getResponseCode());
    const detRaw = detRes.getContentText();
    Logger.log("GetQuotationDetail raw: " + detRaw.substring(0, 2500));
    try {
      const detJson = JSON.parse(detRaw);
      const d = detJson.quotation || detJson.data || detJson;
      Logger.log("detail keys: " + JSON.stringify(Object.keys(d)));
      Object.keys(d).forEach(k => {
        if (Array.isArray(d[k]) && d[k].length && typeof d[k][0] === 'object') {
          Logger.log(`detail.${k}[0] keys: ` + JSON.stringify(Object.keys(d[k][0])));
          Logger.log(`detail.${k}[0] sample: ` + JSON.stringify(d[k][0]));
        }
      });
    } catch (e) { Logger.log("⚠️ อ่าน detail JSON ไม่ได้: " + e); }
  } else {
    Logger.log("⚠️ ไม่ได้ id/number กลับมา — AddQuotation อาจ fail หรือ field ที่ส่งไปผิด ดู raw response ด้านบน");
  }

  // 4) ลบใบทดสอบทิ้ง (ใช้ helper เดิมที่รองรับหลาย transport อยู่แล้ว)
  if (qId != null || qNumber) {
    try {
      const delResult = voidZortQuotation_(qId, qNumber, "explore-test");
      Logger.log("ลบใบทดสอบ: " + delResult.getContent());
    } catch (e) { Logger.log("⚠️ ลบใบทดสอบไม่สำเร็จ (ลบเองใน ZORT ถ้าเจอ number: " + qNumber + "): " + e); }
  }
  Logger.log("──────── เสร็จ — copy log ทั้งหมดตั้งแต่ต้นส่งกลับมา ────────");
}

// รอบ 2: ยืนยัน field name ที่แก้แล้ว (customeridnumber/customerbranchname/customerbranchno/
// description/saleschannel) จริง ๆ ถูก ZORT รับ+echo กลับหรือไม่ — รอบแรกใช้ชื่อผิด (มิเรอร์จาก Order API)
// ทำให้ field ลูกค้า/หมายเหตุ/ช่องทาง หาย รอบนี้แก้แล้วต้องเห็นค่า echo กลับตรงกับที่ส่งไปทุกตัว
function exploreZortAddQuotationV2() {
  const H = zortHeaders_();
  const jsonHeaders = Object.assign({}, H, { "Content-Type": "application/json" });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const stockRows = stockSh ? stockSh.getDataRange().getValues() : [];
  let testSku = "", testName = "สินค้าทดสอบ";
  for (let i = 1; i < stockRows.length; i++) {
    const sku = String(stockRows[i][1] || "").trim();
    if (sku) { testSku = sku; testName = String(stockRows[i][2] || testName).trim(); break; }
  }
  if (!testSku) { Logger.log("❌ ไม่เจอ SKU ในชีตสต็อกเลย"); return; }
  Logger.log("ใช้สินค้าทดสอบ: " + testSku + " (" + testName + ")");

  const payload = {
    date: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy"),
    customername: "ทดสอบ ExploreV2 (ลบอัตโนมัติ)",
    customeridnumber: "0105500000000",       // แก้จาก customertaxid
    customerbranchname: "สำนักงานใหญ่",       // แก้จาก customerbranch
    customerbranchno: "00000",                // แก้จาก customerbranchcode
    customeraddress: "ที่อยู่ทดสอบ V2",
    customerphone: "0811111111",
    customeremail: "testv2@example.com",
    description: "ทดสอบสำรวจ field รอบ 2 (ลบอัตโนมัติหลังรัน)",  // แก้จาก remark
    discount: "6%",
    tag: ["ทดสอบเซล V2"],
    saleschannel: "ทดสอบ V2",                 // แก้จาก channel
    list: [{
      sku: testSku,
      name: testName + " (ทดสอบ V2)",
      number: 2,
      pricepernumber: 20,
      totalprice: 40,
    }],
  };
  Logger.log("payload ที่ส่ง (V2): " + JSON.stringify(payload));

  const res = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
    method: "post", headers: jsonHeaders, payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  Logger.log("AddQuotation HTTP " + res.getResponseCode());
  const raw = res.getContentText();
  Logger.log("AddQuotation raw response: " + raw.substring(0, 2000));

  let json = {};
  try { json = JSON.parse(raw); } catch (e) { Logger.log("⚠️ response ไม่ใช่ JSON: " + e); }
  const det = json.detail || {};
  const qId = det.id || (json.resDesc && !isNaN(Number(json.resDesc)) ? Number(json.resDesc) : null) || null;
  const qNumber = det.number || json.resDesc2 || null;
  Logger.log("👉 id: " + qId + " | number: " + qNumber);

  if (qId != null || qNumber) {
    Utilities.sleep(1000);
    const idParam = qId != null ? qId : qNumber;
    const detRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(idParam),
      { method: "get", headers: H, muteHttpExceptions: true });
    const detRaw = detRes.getContentText();
    Logger.log("GetQuotationDetail raw: " + detRaw.substring(0, 2500));
    try {
      const d = JSON.parse(detRaw);
      Logger.log("── เช็ค echo ──");
      Logger.log("customername: " + JSON.stringify(d.customername) + " (ต้องการ: ทดสอบ ExploreV2 (ลบอัตโนมัติ))");
      Logger.log("customeridnumber: " + JSON.stringify(d.customeridnumber) + " (ต้องการ: 0105500000000)");
      Logger.log("customerbranchname: " + JSON.stringify(d.customerbranchname) + " (ต้องการ: สำนักงานใหญ่)");
      Logger.log("customerbranchno: " + JSON.stringify(d.customerbranchno) + " (ต้องการ: 00000)");
      Logger.log("description: " + JSON.stringify(d.description) + " (ต้องการ: ทดสอบสำรวจ field รอบ 2...)");
      Logger.log("saleschannel: " + JSON.stringify(d.saleschannel) + " (ต้องการ: ทดสอบ V2)");
      Logger.log("discount: " + JSON.stringify(d.discount) + " discountamount: " + d.discountamount);
      Logger.log("tag: " + JSON.stringify(d.tag));
    } catch (e) { Logger.log("⚠️ อ่าน detail JSON ไม่ได้: " + e); }
  } else {
    Logger.log("⚠️ ไม่ได้ id/number กลับมา");
  }

  if (qId != null || qNumber) {
    try {
      const delResult = voidZortQuotation_(qId, qNumber, "explore-test-v2");
      Logger.log("ลบใบทดสอบ V2: " + delResult.getContent());
    } catch (e) { Logger.log("⚠️ ลบใบทดสอบไม่สำเร็จ (ลบเองใน ZORT ถ้าเจอ number: " + qNumber + "): " + e); }
  }
  Logger.log("──────── เสร็จ V2 — copy log ทั้งหมดตั้งแต่ต้นส่งกลับมา ────────");
}

// 🔍 ตรวจว่าโค้ดใหม่เข้ามาถึง project นี้แล้วหรือยัง (รันในเอดิเตอร์ ไม่แตะข้อมูลใดๆ ปลอดภัย 100%)
// ใช้แยกสาเหตุ "Unknown action": โค้ดยังไม่เข้า project vs เข้าแล้วแต่ deployment เสิร์ฟตัวเก่า
function checkDeployedCode() {
  var names = ["approveQuotation", "createQuotation", "saveQuotationDraft", "getQuotationDrafts",
               "deleteQuotationDraft", "exploreZortAddQuotationV2"];
  Logger.log("═══ ฟังก์ชันใหม่ที่ควรมีในโค้ดล่าสุด ═══");
  var missing = 0;
  names.forEach(function (n) {
    var exists = false;
    try { exists = eval("typeof " + n) === "function"; } catch (e) { exists = false; }
    if (!exists) missing++;
    Logger.log((exists ? "✅ มี   " : "❌ ไม่มี") + " : " + n);
  });
  Logger.log("───────────────────────────────");
  if (missing === 0) Logger.log("👉 โค้ดใหม่เข้า project นี้ครบแล้ว — ถ้าเว็บยังขึ้น Unknown action = deployment เสิร์ฟโค้ดเก่า");
  else Logger.log("👉 โค้ดใหม่ยังมาไม่ถึง project นี้ (ขาด " + missing + " ฟังก์ชัน) — clasp push อาจไปคนละ project");
  Logger.log("scriptId ของ project นี้: " + ScriptApp.getScriptId());
}

// ─── สำรวจ endpoint "อนุมัติใบเสนอราคา" ตัวจริงของ ZORT (test-then-verify) ────────
// เจ้าของเจอในหน้าเว็บ ZORT เอง: กด "รออนุมัติ" → popup "อนุมัติรายการ" มีแค่ช่อง
// "วันที่อนุมัติ" → กดบันทึก → ZORT สร้างรายการขายให้เองอัตโนมัติ (ไม่ใช่สิ่งที่ approveQuotation()
// ปัจจุบันทำ — ตอนนี้เรา mirror รายการเองไป AddOrder แล้ว void ใบเดิม ซึ่งอาจไม่ตรงกับ logic จริงของ
// ZORT เช่น เลขอ้างอิงเชื่อมกลับใบเสนอราคา, ภาษี, หรือ field อื่นที่ AddOrder เพียว ๆ ไม่ได้ทำ)
//
// field "approvedate"/"approvedateString" ที่เห็นใน GetQuotationDetail (ว่างเป็น null ทุกใบที่เคยทดสอบ)
// ตรงกับช่อง "วันที่อนุมัติ" ใน popup เป๊ะ — คาดว่ามี endpoint เฉพาะสำหรับตั้งค่านี้ (เดา field/endpoint
// ชื่อไม่ได้ ไม่มีเอกสาร ต้องทดสอบจริงเหมือน AddQuotation)
//
// วิธีทำ: สร้างใบเสนอราคาทดสอบ 1 ใบ (ไม่ void) → ลองยิง endpoint ที่เดาไว้หลายแบบตามลำดับ →
// เช็ค GetQuotationDetail ว่า approvedate/status เปลี่ยนไหม + เช็ค GetOrders 5 รายการล่าสุดว่ามี
// order ใหม่ที่ตรงกับลูกค้า/ยอดของใบทดสอบนี้หรือไม่ (ดูว่า ZORT auto-create order ให้จริงตามที่เจ้าของเห็น)
// ตัวไหนสำเร็จ → หยุดลอง (ไม่ลองต่อกันสร้างซ้ำ) · ถ้าไม่มีตัวไหนสำเร็จเลย → void ใบทดสอบทิ้งให้ (กันขยะ)
// ถ้าตัวใดตัวหนึ่งสำเร็จ → ใบทดสอบจะกลายเป็น "อนุมัติแล้ว" จริง (แก้กลับไม่ได้ เหมือนกดในหน้า ZORT เอง)
// แต่เป็นแค่สินค้าทดสอบ 1 ชิ้นราคา 10 บาท ผลกระทบต่ำมาก
function exploreZortApproveQuotation() {
  const H = zortHeaders_();
  const jsonHeaders = Object.assign({}, H, { "Content-Type": "application/json" });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const stockRows = stockSh ? stockSh.getDataRange().getValues() : [];
  let testSku = "", testName = "สินค้าทดสอบ";
  for (let i = 1; i < stockRows.length; i++) {
    const sku = String(stockRows[i][1] || "").trim();
    if (sku) { testSku = sku; testName = String(stockRows[i][2] || testName).trim(); break; }
  }
  if (!testSku) { Logger.log("❌ ไม่เจอ SKU ในชีตสต็อกเลย"); return; }

  const dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
  const addPayload = {
    date: dateStr,
    customername: "ทดสอบ Approve (ห้ามลบเอง รอสคริปต์เคลียร์)",
    customeridnumber: "0105500000000",
    description: "ทดสอบ endpoint อนุมัติใบเสนอราคา",
    tag: ["ทดสอบเซล-approve"],
    list: [{ sku: testSku, name: testName + " (ทดสอบ approve)", number: 1, pricepernumber: 10, totalprice: 10 }],
  };
  const addRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
    method: "post", headers: jsonHeaders, payload: JSON.stringify(addPayload), muteHttpExceptions: true,
  });
  let addJson = {};
  try { addJson = JSON.parse(addRes.getContentText() || "{}"); } catch (e) {}
  const det = addJson.detail || {};
  const qId = det.id != null ? det.id : (addJson.resDesc && !isNaN(Number(addJson.resDesc)) ? Number(addJson.resDesc) : null);
  const qNumber = det.number || addJson.resDesc2 || null;
  if (qId == null && !qNumber) { Logger.log("❌ สร้างใบทดสอบไม่สำเร็จ: " + addRes.getContentText()); return; }
  Logger.log("สร้างใบทดสอบแล้ว: id=" + qId + " number=" + qNumber);

  function getDetail() {
    const r = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(qId != null ? qId : qNumber),
      { method: "get", headers: H, muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText() || "{}"); } catch (e) { return {}; }
  }

  // รอบ 2 พบว่า "query id+approvedate, body {}" คือ transport ที่ถูก — id ผ่านแล้ว!
  // ติดแค่ format วันที่: resCode 500 "String '28/07/2026' was not recognized as a valid
  // DateTime." (ข้อความ error แบบ .NET) — รอบ 3 นี้คงตัว id ไว้ ลองหลาย format วันที่แทน
  const candidates = [
    { label: "yyyy-MM-dd", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId) + "&approvedate=" + encodeURIComponent(Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd")), headers: jsonHeaders, payload: "{}" },
    { label: "yyyy-MM-ddTHH:mm:ss", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId) + "&approvedate=" + encodeURIComponent(Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss")), headers: jsonHeaders, payload: "{}" },
    { label: "MM/dd/yyyy (US)", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId) + "&approvedate=" + encodeURIComponent(Utilities.formatDate(new Date(), "Asia/Bangkok", "MM/dd/yyyy")), headers: jsonHeaders, payload: "{}" },
    { label: "yyyy/MM/dd", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId) + "&approvedate=" + encodeURIComponent(Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy/MM/dd")), headers: jsonHeaders, payload: "{}" },
    { label: "dd-MM-yyyy", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId) + "&approvedate=" + encodeURIComponent(Utilities.formatDate(new Date(), "Asia/Bangkok", "dd-MM-yyyy")), headers: jsonHeaders, payload: "{}" },
    { label: "M/d/yyyy (US no zero-pad)", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId) + "&approvedate=" + encodeURIComponent(Utilities.formatDate(new Date(), "Asia/Bangkok", "M/d/yyyy")), headers: jsonHeaders, payload: "{}" },
    { label: "no approvedate at all (ให้ ZORT ใส่วันปัจจุบันเอง)", url: "/Quotation/ApproveQuotation?id=" + encodeURIComponent(qId), headers: jsonHeaders, payload: "{}" },
  ];

  let succeeded = false;
  for (const c of candidates) {
    if (succeeded) break;
    const res = UrlFetchApp.fetch(ZORT_BASE + c.url, {
      method: "post", headers: c.headers, payload: c.payload, muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    Logger.log("▶ [" + c.label + "] POST " + c.url + " payload=" + c.payload + "\n   HTTP " + code + " resp=" + text.substring(0, 300));
    const err = zortRespError_(res);
    if (code === 200 && !err) {
      Utilities.sleep(800);
      const after = getDetail();
      Logger.log("   → อ่านกลับ status=" + JSON.stringify(after.status) + " approvedate=" + JSON.stringify(after.approvedateString || after.approvedate));
      if (after.status !== "Pending" || after.approvedate) {
        succeeded = true;
        Logger.log("   ✅ endpoint นี้ใช้ได้จริง! status/approvedate เปลี่ยนแล้ว");
      }
    }
    Utilities.sleep(200);
  }

  // เช็ค order 10 รายการล่าสุดว่ามีตัวที่ตรงกับใบทดสอบนี้ไหม (ลูกค้า "ทดสอบ Approve" + ยอด 10)
  try {
    const ordRes = UrlFetchApp.fetch(ZORT_BASE + "/Order/GetOrders?page=1&limit=10", { method: "get", headers: H, muteHttpExceptions: true });
    const ordJson = JSON.parse(ordRes.getContentText() || "{}");
    const list = ordJson.list || [];
    const matched = list.filter(o => String(o.customername || "").indexOf("ทดสอบ Approve") >= 0);
    Logger.log("── ออเดอร์ล่าสุดที่ชื่อลูกค้ามี \"ทดสอบ Approve\": " + JSON.stringify(matched.map(o => ({ number: o.number, amount: o.amount, status: o.status }))));
  } catch (e) { Logger.log("เช็ค GetOrders ไม่สำเร็จ: " + e); }

  if (!succeeded) {
    Logger.log("⚠️ ไม่มี endpoint ไหนใช้ได้เลย — ลบใบทดสอบทิ้งให้อัตโนมัติ");
    try {
      const delResult = voidZortQuotation_(qId, qNumber, "explore-approve-cleanup");
      Logger.log("ลบใบทดสอบ: " + delResult.getContent());
    } catch (e) { Logger.log("⚠️ ลบใบทดสอบไม่สำเร็จ (ลบเองใน ZORT ถ้าเจอ number: " + qNumber + "): " + e); }
  } else {
    Logger.log("ℹ️ ใบทดสอบ " + qNumber + " ถูกอนุมัติจริงแล้ว (แก้กลับไม่ได้ เหมือนกดในหน้า ZORT) — เป็นแค่สินค้าทดสอบ 10 บาท ไม่ต้องลบ");
  }
  Logger.log("──────── เสร็จ — copy log ทั้งหมดตั้งแต่ต้นส่งกลับมา ────────");
}

// ─── สำรวจแก้บั๊ก "มูลค่ารวมสุทธิ" (amount) ขึ้น 0 ในหน้า ZORT ─────────────────────
// เจ้าของทดสอบสร้างใบเสนอราคาจริงผ่านเว็บเรา — line item ราคาถูกต้อง (3,000) แต่ยอดรวม
// ("มูลค่ารวมสุทธิ"/amount) ในหน้า ZORT ขึ้น 0 · ย้อนดู log การทดสอบก่อนหน้า
// (exploreZortAddQuotationV2) พบว่า amount/amount_pretax/vatamount เป็น 0 มาตั้งแต่รอบแรกแล้ว
// (ตอนนั้นพลาดไม่ได้สังเกต เพราะโฟกัสแค่ field ลูกค้า/หมายเหตุ) — สงสัยว่า AddQuotation ไม่คำนวณ
// ยอดรวมหัวเอกสารจาก list[].totalprice ให้อัตโนมัติ ต้องส่ง field ยอดรวมเข้าไปเองที่ระดับบนสุด
// ทดสอบส่ง amount/amount_pretax/vatamount/vattype/vatpercent explicit ที่ header แล้วดูว่า
// GetQuotationDetail อ่านกลับมาไม่เป็น 0 ไหม — ถ้าตัวไหนได้ผล จะเอาไปแก้ createQuotation ต่อ
function exploreZortQuotationAmountFix() {
  const H = zortHeaders_();
  const jsonHeaders = Object.assign({}, H, { "Content-Type": "application/json" });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const stockRows = stockSh ? stockSh.getDataRange().getValues() : [];
  let testSku = "", testName = "สินค้าทดสอบ";
  for (let i = 1; i < stockRows.length; i++) {
    const sku = String(stockRows[i][1] || "").trim();
    if (sku) { testSku = sku; testName = String(stockRows[i][2] || testName).trim(); break; }
  }
  if (!testSku) { Logger.log("❌ ไม่เจอ SKU ในชีตสต็อกเลย"); return; }

  const dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
  const price = 1000, qty = 1;
  const grand = price * qty;                     // ไม่เข้าเงื่อนไขขายส่ง (ชิ้น<6, ยอด<10000) → grand = ราคาเต็ม
  const preVat = Math.round(grand / 1.07 * 100) / 100;
  const vat = Math.round((grand - preVat) * 100) / 100;

  function baseList() {
    return [{ sku: testSku, name: testName + " (ทดสอบยอดรวม)", number: qty, pricepernumber: price, totalprice: grand }];
  }
  function getDetail(qId, qNumber) {
    const idParam = qId != null ? qId : qNumber;
    const r = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(idParam),
      { method: "get", headers: H, muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText() || "{}"); } catch (e) { return {}; }
  }

  const variants = [
    { label: "baseline (เหมือน createQuotation ปัจจุบัน — ไม่ส่ง amount)", extra: {} },
    { label: "+ amount เฉย ๆ", extra: { amount: grand } },
    { label: "+ amount + amount_pretax + vatamount", extra: { amount: grand, amount_pretax: preVat, vatamount: vat } },
    { label: "+ vattype:1 + vatpercent:7 (ไม่ส่ง amount)", extra: { vattype: 1, vatpercent: 7 } },
    { label: "+ ทุกอย่างรวมกัน", extra: { amount: grand, amount_pretax: preVat, vatamount: vat, vattype: 1, vatpercent: 7, discount: "0%" } },
  ];

  for (const v of variants) {
    const payload = Object.assign({
      date: dateStr,
      customername: "ทดสอบ AmountFix (ลบอัตโนมัติ)",
      description: "ทดสอบแก้บั๊กยอดรวม 0 — " + v.label,
      list: baseList(),
    }, v.extra);
    Logger.log("▶ [" + v.label + "] payload=" + JSON.stringify(payload));
    const res = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
      method: "post", headers: jsonHeaders, payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    let json = {};
    try { json = JSON.parse(res.getContentText() || "{}"); } catch (e) {}
    const det = json.detail || {};
    const qId = det.id != null ? det.id : (json.resDesc && !isNaN(Number(json.resDesc)) ? Number(json.resDesc) : null);
    const qNumber = det.number || json.resDesc2 || null;
    if (qId == null && !qNumber) { Logger.log("   ❌ สร้างไม่สำเร็จ: " + res.getContentText()); continue; }
    Utilities.sleep(600);
    const after = getDetail(qId, qNumber);
    Logger.log("   → " + qNumber + " อ่านกลับ: amount=" + after.amount + " amount_pretax=" + after.amount_pretax + " vatamount=" + after.vatamount +
      (after.amount > 0 ? "   ✅✅✅ ไม่เป็น 0 แล้ว!" : "   ⚠️ ยังเป็น 0"));
    try {
      const delResult = voidZortQuotation_(qId, qNumber, "explore-amountfix-cleanup");
      Logger.log("   ลบใบทดสอบ: " + delResult.getContent());
    } catch (e) { Logger.log("   ⚠️ ลบใบทดสอบไม่สำเร็จ (ลบเองใน ZORT ถ้าเจอ number: " + qNumber + "): " + e); }
    Utilities.sleep(300);
  }
  Logger.log("──────── เสร็จ — copy log ทั้งหมดตั้งแต่ต้นส่งกลับมา ────────");
}

// ═══════════════════════════════════════════════════════════════════════════
// สำรวจ EditQuotationInfo / EditQuotation — ยังไม่เคยเรียกจริงในระบบนี้เลย (แค่มีชื่ออยู่ใน
// ZORTOUT_API.md ที่ดึงมาจากเอกสาร ZORT เฉยๆ ไม่ได้แปลว่าทดสอบแล้วใช้ได้จริง) ต้องรู้ก่อนว่า:
//   1. รับ id ทาง JSON body / query string / form-encoded — VoidQuotation เคยเจอมาแล้วว่า
//      ปฏิเสธ JSON body {id} ทั้งที่ id ถูกต้อง ต้องส่งทาง query/form แทน (ดู voidZortQuotation_)
//      EditQuotation อาจเจอเรื่องเดียวกัน
//   2. EditQuotation (รวมรายการสินค้า) ต้องส่ง list ทั้งก้อนใหม่ทับของเดิม หรือส่งเฉพาะที่เปลี่ยน
//   3. แก้ราคา/จำนวนแล้ว amount/amount_pretax/vatamount คำนวณให้เองไหม (AddQuotation ไม่คำนวณให้
//      ต้องส่งเองตรงๆ — ดู exploreZortQuotationAmountFix ด้านบน) EditQuotation อาจเหมือนกัน
//   4. แก้ใบที่ "อนุมัติแล้ว" ได้ไหม หรือทำได้เฉพาะใบที่ยังไม่อนุมัติ (ตอบคำถามเรื่องขอบเขตฟีเจอร์
//      "แก้ใบเสนอราคาได้เฉพาะใบที่ลูกค้ายังไม่อนุมัติ" ที่เจ้าของขอ 2026-07-30 ด้วยในตัว)
//
// วิธีรัน: เลือกฟังก์ชันนี้ใน GAS editor → กด Run → เปิด Execution log (Ctrl+Enter) →
// copy log ทั้งหมดตั้งแต่ต้นจนจบส่งกลับมาให้ Claude อ่าน — ปลอดภัย 100% สร้างใบทดสอบเอง
// (ชื่อลูกค้าขึ้นต้น "ทดสอบ EditQuotation") แล้วลบทิ้งให้เองท้ายฟังก์ชัน ไม่กระทบใบจริงของร้าน
// ═══════════════════════════════════════════════════════════════════════════
function exploreZortEditQuotation() {
  const H = zortHeaders_();
  const jsonHdr = Object.assign({}, H, { "Content-Type": "application/json" });
  const formHdr = Object.assign({}, H, { "Content-Type": "application/x-www-form-urlencoded" });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const stockRows = stockSh ? stockSh.getDataRange().getValues() : [];
  let testSku = "", testName = "สินค้าทดสอบ";
  for (let i = 1; i < stockRows.length; i++) {
    const sku = String(stockRows[i][1] || "").trim();
    if (sku) { testSku = sku; testName = String(stockRows[i][2] || testName).trim(); break; }
  }
  if (!testSku) { Logger.log("❌ ไม่เจอ SKU ในชีตสต็อกเลย"); return; }

  function getDetail(qId, qNumber) {
    const idParam = qId != null ? qId : qNumber;
    const r = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(idParam),
      { method: "get", headers: H, muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText() || "{}"); } catch (e) { return {}; }
  }

  // ── ①  สร้างใบทดสอบก่อน (เหมือน exploreZortQuotationAmountFix — วิธีที่ยืนยันแล้วว่าสร้างได้จริง) ──
  const dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
  const price = 500, qty = 1, grand = price * qty;
  const preVat = Math.round(grand / 1.07 * 100) / 100;
  const vat = Math.round((grand - preVat) * 100) / 100;
  const addPayload = {
    date: dateStr,
    customername: "ทดสอบ EditQuotation (ลบอัตโนมัติ)",
    description: "ก่อนแก้ไข",
    list: [{ sku: testSku, name: testName, number: qty, pricepernumber: price, totalprice: grand }],
    amount: grand, amount_pretax: preVat, vatamount: vat,
  };
  Logger.log("① สร้างใบทดสอบ payload=" + JSON.stringify(addPayload));
  const addRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
    method: "post", headers: jsonHdr, payload: JSON.stringify(addPayload), muteHttpExceptions: true,
  });
  let addJson = {};
  try { addJson = JSON.parse(addRes.getContentText() || "{}"); } catch (e) {}
  const det = addJson.detail || {};
  const qId = det.id != null ? det.id : (addJson.resDesc && !isNaN(Number(addJson.resDesc)) ? Number(addJson.resDesc) : null);
  const qNumber = det.number || addJson.resDesc2 || null;
  if (qId == null && !qNumber) { Logger.log("❌ สร้างใบทดสอบไม่สำเร็จ เลยทดสอบแก้ไขต่อไม่ได้: " + addRes.getContentText()); return; }
  Logger.log("   → สร้างสำเร็จ id=" + qId + " number=" + qNumber);
  Utilities.sleep(600);

  // ── ②  ลองแก้ไขด้วยหลาย transport/payload variant — หยุดดูผลทุกตัวไม่หยุดที่ตัวแรกที่สำเร็จ
  //       (ต่างจาก voidZortQuotation_ ที่หยุดทันทีที่เจอ — ตรงนี้อยากเห็นครบทุกแบบเพื่อเลือกวิธีที่ถูกต้องจริง) ──
  const newDesc = "แก้ไขแล้ว " + new Date().getTime();
  const editInfoVariants = [
    { label: "EditQuotationInfo: JSON body {id, description}", url: ZORT_BASE + "/Quotation/EditQuotationInfo",
      opt: { method: "post", headers: jsonHdr, payload: JSON.stringify({ id: qId, description: newDesc }), muteHttpExceptions: true } },
    { label: "EditQuotationInfo: query id + JSON body {description}", url: ZORT_BASE + "/Quotation/EditQuotationInfo?id=" + encodeURIComponent(qId),
      opt: { method: "post", headers: jsonHdr, payload: JSON.stringify({ description: newDesc }), muteHttpExceptions: true } },
    { label: "EditQuotationInfo: form-encoded id+description", url: ZORT_BASE + "/Quotation/EditQuotationInfo",
      opt: { method: "post", headers: formHdr, payload: "id=" + encodeURIComponent(qId) + "&description=" + encodeURIComponent(newDesc), muteHttpExceptions: true } },
  ];
  editInfoVariants.forEach(function (v) {
    Logger.log("② [" + v.label + "]");
    const res = UrlFetchApp.fetch(v.url, v.opt);
    Logger.log("   HTTP " + res.getResponseCode() + " — " + res.getContentText().substring(0, 400));
  });
  Utilities.sleep(600);
  const afterInfo = getDetail(qId, qNumber);
  Logger.log("   → description หลังลอง EditQuotationInfo ทั้งหมด = " + JSON.stringify(afterInfo.description));

  // ── ③  ลองแก้รายการสินค้า (ราคา/จำนวน) ด้วย EditQuotation ──
  const newPrice = 750, newGrand = newPrice * qty;
  const newPreVat = Math.round(newGrand / 1.07 * 100) / 100;
  const newVat = Math.round((newGrand - newPreVat) * 100) / 100;
  const editListPayload = {
    id: qId,
    list: [{ sku: testSku, name: testName, number: qty, pricepernumber: newPrice, totalprice: newGrand }],
    amount: newGrand, amount_pretax: newPreVat, vatamount: newVat,
  };
  Logger.log("③ [EditQuotation: JSON body {id, list, amount...}] payload=" + JSON.stringify(editListPayload));
  const editRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/EditQuotation", {
    method: "post", headers: jsonHdr, payload: JSON.stringify(editListPayload), muteHttpExceptions: true,
  });
  Logger.log("   HTTP " + editRes.getResponseCode() + " — " + editRes.getContentText().substring(0, 500));
  Utilities.sleep(600);
  const afterList = getDetail(qId, qNumber);
  Logger.log("   → หลังแก้: amount=" + afterList.amount + " (ควรเป็น " + newGrand + " ถ้าสำเร็จ) list=" + JSON.stringify(afterList.list));

  // ── ④  ลบใบทดสอบทิ้งเสมอ ไม่ว่าผลข้างบนจะเป็นยังไง ──
  try {
    const delResult = voidZortQuotation_(qId, qNumber, "explore-editquotation-cleanup");
    Logger.log("④ ลบใบทดสอบ: " + delResult.getContent());
  } catch (e) { Logger.log("④ ⚠️ ลบใบทดสอบไม่สำเร็จ (ลบเองใน ZORT ถ้าเจอ number: " + qNumber + "): " + e); }

  Logger.log("──────── เสร็จ — copy log ทั้งหมดตั้งแต่ต้น (①②③④) ส่งกลับมาให้ Claude อ่าน ────────");
}

// ═══════════════════════════════════════════════════════════════════════════
// รอบ 2: หา transport ที่ถูกต้องของ EditQuotation (แก้รายการสินค้า) + ทดสอบแก้ข้อมูลลูกค้า
// ───────────────────────────────────────────────────────────────────────────
// สรุปผลรอบแรก (exploreZortEditQuotation, 2026-07-30):
//   ✅ EditQuotationInfo — ใช้ได้เมื่อส่ง id ทาง QUERY STRING + JSON body สำหรับ field ที่เหลือ
//      (JSON body {id,...} = "Invalid ID." · form-encoded = "Invalid ID." เหมือน VoidQuotation เป๊ะ)
//   ❌ EditQuotation — ลองแค่ JSON body {id,...} ซึ่งรู้อยู่แล้วว่า ZORT ไม่รับ → ต้องลอง query-id
//
// รอบนี้ตอบ 4 คำถามที่เหลือก่อนเขียนฟีเจอร์จริง:
//   ① EditQuotation รับ query-id ไหม (แบบเดียวกับ EditQuotationInfo)
//   ② ถ้าไม่ส่ง amount มาด้วย ZORT คำนวณยอดใหม่ให้เองไหม (AddQuotation ไม่คำนวณให้ ต้องส่งเอง)
//   ③ list ที่ส่งไปแทนที่ของเดิมทั้งก้อน หรือเพิ่มต่อท้าย (ทดสอบด้วยการส่ง 2 รายการทับ 1 รายการ)
//   ④ EditQuotationInfo แก้ข้อมูลลูกค้า (customername/address/taxid) ได้ด้วยไหม ไม่ใช่แค่ description
//
// ปลอดภัย 100% เหมือนเดิม: สร้างใบทดสอบเอง ลบทิ้งท้ายฟังก์ชันเสมอ ไม่แตะใบจริงของร้าน
// ═══════════════════════════════════════════════════════════════════════════
function exploreZortEditQuotationV2() {
  const H = zortHeaders_();
  const jsonHdr = Object.assign({}, H, { "Content-Type": "application/json" });

  // หา SKU จริง — รอบแรกหยิบได้คำว่า "รหัสสินค้า" (ชีตมีหัวตาราง 2 แถว) จึงต้องกรอง
  // เอาเฉพาะที่หน้าตาเป็นรหัสจริง (ตัวอักษรอังกฤษ 1-3 ตัว + ตัวเลข ตาม business rule SKU ของร้าน)
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const stockRows = stockSh ? stockSh.getDataRange().getValues() : [];
  const picked = [];
  for (let i = 1; i < stockRows.length && picked.length < 2; i++) {
    const sku = String(stockRows[i][1] || "").trim();
    const name = String(stockRows[i][2] || "").trim();
    if (/^[A-Za-z]{1,3}\d{3,}$/.test(sku)) picked.push({ sku: sku, name: name || sku });
  }
  if (picked.length < 2) { Logger.log("❌ หา SKU จริงไม่ครบ 2 ตัว (เจอ " + picked.length + ") — ข้อ ③ ทดสอบไม่ได้"); }
  if (!picked.length) { Logger.log("❌ ไม่เจอ SKU จริงเลย หยุด"); return; }
  Logger.log("ใช้ SKU ทดสอบ: " + JSON.stringify(picked));

  function getDetail(id) {
    const r = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(id),
      { method: "get", headers: H, muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText() || "{}"); } catch (e) { return {}; }
  }
  function shortList(d) {
    return (d.list || []).map(function (x) { return x.sku + " x" + x.number + " @" + x.pricepernumber; }).join(" | ");
  }

  // ── สร้างใบทดสอบ (1 รายการ ราคา 500) ──
  const dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");
  const p0 = picked[0];
  const addPayload = {
    date: dateStr,
    customername: "ทดสอบ EditQuotation V2 (ลบอัตโนมัติ)",
    description: "ก่อนแก้ไข",
    list: [{ sku: p0.sku, name: p0.name, number: 1, pricepernumber: 500, totalprice: 500 }],
    amount: 500, amount_pretax: 467.29, vatamount: 32.71,
  };
  const addRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
    method: "post", headers: jsonHdr, payload: JSON.stringify(addPayload), muteHttpExceptions: true,
  });
  let addJson = {};
  try { addJson = JSON.parse(addRes.getContentText() || "{}"); } catch (e) {}
  const det = addJson.detail || {};
  const qId = det.id != null ? det.id : null;
  const qNumber = det.number || null;
  if (qId == null) { Logger.log("❌ สร้างใบทดสอบไม่สำเร็จ: " + addRes.getContentText()); return; }
  Logger.log("สร้างใบทดสอบสำเร็จ id=" + qId + " number=" + qNumber);
  Utilities.sleep(600);

  const editUrl = ZORT_BASE + "/Quotation/EditQuotation?id=" + encodeURIComponent(qId);

  // ── ① query-id + list + amount ครบ ──
  const body1 = {
    list: [{ sku: p0.sku, name: p0.name, number: 2, pricepernumber: 750, totalprice: 1500 }],
    amount: 1500, amount_pretax: 1401.87, vatamount: 98.13,
  };
  Logger.log("① [EditQuotation query-id + list + amount] body=" + JSON.stringify(body1));
  const r1 = UrlFetchApp.fetch(editUrl, { method: "post", headers: jsonHdr, payload: JSON.stringify(body1), muteHttpExceptions: true });
  Logger.log("   HTTP " + r1.getResponseCode() + " — " + r1.getContentText().substring(0, 300));
  Utilities.sleep(600);
  let d1 = getDetail(qId);
  Logger.log("   → amount=" + d1.amount + " (คาดหวัง 1500) list=" + shortList(d1));

  // ── ② query-id + list เฉยๆ ไม่ส่ง amount — ดูว่า ZORT คำนวณให้เองไหม ──
  const body2 = { list: [{ sku: p0.sku, name: p0.name, number: 3, pricepernumber: 100, totalprice: 300 }] };
  Logger.log("② [EditQuotation query-id + list ไม่ส่ง amount] body=" + JSON.stringify(body2));
  const r2 = UrlFetchApp.fetch(editUrl, { method: "post", headers: jsonHdr, payload: JSON.stringify(body2), muteHttpExceptions: true });
  Logger.log("   HTTP " + r2.getResponseCode() + " — " + r2.getContentText().substring(0, 300));
  Utilities.sleep(600);
  let d2 = getDetail(qId);
  Logger.log("   → amount=" + d2.amount + " (ถ้า=300 แปลว่า ZORT คำนวณให้เอง / ถ้าเป็น 0 หรือค่าเดิม แปลว่าต้องส่ง amount เองเสมอ) list=" + shortList(d2));

  // ── ③ ส่ง 2 รายการทับ — ดูว่าแทนที่ทั้งก้อนหรือเพิ่มต่อท้าย ──
  if (picked.length >= 2) {
    const p1 = picked[1];
    const body3 = {
      list: [
        { sku: p0.sku, name: p0.name, number: 1, pricepernumber: 100, totalprice: 100 },
        { sku: p1.sku, name: p1.name, number: 1, pricepernumber: 200, totalprice: 200 },
      ],
      amount: 300, amount_pretax: 280.37, vatamount: 19.63,
    };
    Logger.log("③ [EditQuotation ส่ง 2 รายการทับ 1 รายการเดิม] body=" + JSON.stringify(body3));
    const r3 = UrlFetchApp.fetch(editUrl, { method: "post", headers: jsonHdr, payload: JSON.stringify(body3), muteHttpExceptions: true });
    Logger.log("   HTTP " + r3.getResponseCode() + " — " + r3.getContentText().substring(0, 300));
    Utilities.sleep(600);
    let d3 = getDetail(qId);
    Logger.log("   → จำนวนรายการ=" + (d3.list || []).length + " (ถ้า=2 แปลว่าแทนที่ทั้งก้อน ✅ / ถ้า=3+ แปลว่าเพิ่มต่อท้าย ⚠️) list=" + shortList(d3));
  }

  // ── ④ EditQuotationInfo แก้ข้อมูลลูกค้า (ไม่ใช่แค่ description) ──
  const infoUrl = ZORT_BASE + "/Quotation/EditQuotationInfo?id=" + encodeURIComponent(qId);
  const body4 = {
    customername: "ลูกค้าแก้แล้ว V2",
    customeraddress: "123 ถนนทดสอบ กรุงเทพฯ 10000",
    customerphone: "0812345678",
    customeridnumber: "0105566198464",
    description: "หมายเหตุแก้รอบสอง",
  };
  Logger.log("④ [EditQuotationInfo query-id + ข้อมูลลูกค้า] body=" + JSON.stringify(body4));
  const r4 = UrlFetchApp.fetch(infoUrl, { method: "post", headers: jsonHdr, payload: JSON.stringify(body4), muteHttpExceptions: true });
  Logger.log("   HTTP " + r4.getResponseCode() + " — " + r4.getContentText().substring(0, 300));
  Utilities.sleep(600);
  let d4 = getDetail(qId);
  Logger.log("   → customername=" + JSON.stringify(d4.customername) + " address=" + JSON.stringify(d4.customeraddress) +
             " phone=" + JSON.stringify(d4.customerphone) + " taxid=" + JSON.stringify(d4.customeridnumber) +
             " description=" + JSON.stringify(d4.description));

  // ── ⑤ ลบใบทดสอบทิ้งเสมอ ──
  try {
    const delResult = voidZortQuotation_(qId, qNumber, "explore-editquotation-v2-cleanup");
    Logger.log("⑤ ลบใบทดสอบ: " + delResult.getContent());
  } catch (e) { Logger.log("⑤ ⚠️ ลบไม่สำเร็จ (ลบเองใน ZORT: " + qNumber + "): " + e); }

  Logger.log("──────── เสร็จ — copy log ทั้งหมด (①②③④⑤) ส่งกลับมา ────────");
}

// ─── สำรวจ endpoint ค้นหาเลขผู้เสียภาษี (แม้ไม่ใช่ลูกค้าเก่าของร้าน) ────────────────
// เจ้าของเจอฟีเจอร์นี้ในหน้าเว็บ ZORT เอง (secure.zortout.com/Sell/Add popup "เลือกข้อมูล
// เลขประจำตัวผู้เสียภาษี") — พิมพ์เลข 13 หลักแล้วเจอชื่อบริษัท+ที่อยู่สาขาจริงจากทะเบียนธุรกิจ
// แม้ไม่เคยเป็นลูกค้าร้านมาก่อน (ดึงจากฐานข้อมูลกรมพัฒนาธุรกิจการค้า ไม่ใช่ contact ของร้านเอง)
// ⚠️ ข้อควรระวัง: secure.zortout.com (หน้าเว็บที่เจ้าของใช้) เป็นคนละระบบกับ
// open-api.zortout.com (Partner API ที่เรามี APP key/secret) — endpoint นี้อาจเป็น
// internal-only ของหน้าเว็บ ไม่เปิดให้ Partner API เรียกก็ได้ ต้องทดสอบดูก่อน (READ-ONLY
// ปลอดภัย 100% ไม่มีการสร้าง/แก้ข้อมูลใดๆ — แค่ลองยิง GET หลาย endpoint ที่เป็นไปได้)
// รอบ 2: เจ้าของลองเลขใหม่ "0105569044336" (ไม่เคยเจอ) เทียบกับเลขที่เคยเจอ
// "0105566198464" (บริษัท สไปซี่ ซอมเบรโร จำกัด) — ตั้งสมมติฐานว่า GetContacts
// ค้นได้เฉพาะ contact ที่ "มีอยู่ใน ZORT ของร้านนี้แล้ว" เท่านั้น (อาจเคยถูกสร้างไว้ผ่าน
// การค้นในหน้าเว็บ secure.zortout.com ก่อนหน้านี้) ไม่ใช่ค้นทะเบียนธุรกิจสดจริงๆ ตามที่
// เข้าใจผิดไปตอนแรก — ถ้าเลขใหม่ไม่เจอเลยสักตัว ยืนยันสมมติฐานนี้
function exploreZortTaxIdLookup() {
  const H = zortHeaders_();
  const known = "0105566198464";  // เคยเจอ: บริษัท สไปซี่ ซอมเบรโร จำกัด
  const unknown = "0105569044336"; // เลขใหม่ที่เจ้าของลอง — ยังไม่เคยเจอ

  [known, unknown].forEach(function (taxId) {
    Logger.log("═══ ทดสอบเลข " + taxId + " ═══");
    try {
      const res = UrlFetchApp.fetch(ZORT_BASE + "/Contact/GetContacts?page=1&limit=10&keyword=" + taxId,
        { method: "get", headers: H, muteHttpExceptions: true });
      const code = res.getResponseCode();
      const text = res.getContentText();
      let json = {};
      try { json = JSON.parse(text); } catch (e) {}
      const list = json.list || [];
      Logger.log("HTTP " + code + " — จำนวนผลลัพธ์: " + list.length);
      Logger.log("resp=" + text.substring(0, 500));
    } catch (e) {
      Logger.log("❌ error: " + e);
    }
  });
  Logger.log("──────── เสร็จ — copy log ทั้งหมดตั้งแต่ต้นส่งกลับมา ────────");
}

// ⚠️ ONE-OFF CLEANUP: ลบใบเสนอราคาทดสอบ QT-202607015 (id 346234) ที่หลุดค้างจริงใน ZORT
// เพราะ exploreZortAddQuotation() รุ่นก่อนหน้าอ่าน id/number ผิดตำแหน่ง (อยู่ใน detail ไม่ใช่ top-level)
// เลยไม่เรียก void ให้ — รันฟังก์ชันนี้ 1 ครั้งเพื่อลบทิ้ง แล้วลบฟังก์ชันนี้ออกได้เลย
function cleanupTestQuotation_QT202607015() {
  const result = voidZortQuotation_(346234, "QT-202607015", "cleanup-explore-leftover");
  Logger.log("ผลการลบ QT-202607015: " + result.getContent());
}

// ─── Quotation conversion report per salesperson (READ-ONLY) ────────────────
// นับใบเสนอราคา 90 วัน แยกตามเซล: เสนอกี่ใบ, ปิดได้ (Success) กี่ใบ, กี่ %, มูลค่าเสนอ vs ปิดได้
// + แจกแจง status ทุกค่า (ไม่เดาว่า Success/Pending/Voided หมายถึงอะไร) · รันเองแล้วส่ง log กลับมา
// แยกเซลจาก field ที่ผู้ใช้พิมพ์เอง (default = tag) เพราะทุกใบคีย์ด้วยบัญชีเดียว createusername แยกไม่ได้
// สลับ field ได้โดยตั้ง Script Property QUOTE_SALE_FIELD = "tag" | "reference" (ไม่ต้องแก้โค้ด)
function analyzeZortQuotations() {
  const startMs = Date.now();
  const BUDGET_MS = 4.5 * 60 * 1000;
  const tz = "Asia/Bangkok";
  const today = new Date();
  const DAYS = 90;
  const fromDate = new Date(today.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const fromStr = Utilities.formatDate(fromDate, tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  const SALE_FIELD = PropertiesService.getScriptProperties().getProperty('QUOTE_SALE_FIELD') || 'tag';
  const saleMap = readQuoteSaleMap_(); // ชื่อเซลที่ assign ใน dashboard (ชนะค่า tag)
  Logger.log("──────────────────────────────────────");
  Logger.log("ใบเสนอราคา ช่วง " + fromStr + " → " + toStr + " (" + DAYS + " วัน) · แยกเซลจาก: ชีต mapping > ช่อง " + SALE_FIELD);

  const statusAll = {};                 // status → { count, amount }
  const bySale = {};                    // ชื่อเซล (จากช่อง SALE_FIELD) → { name, total, success, pending, other, quoted, won }
  let inWindow = 0, quotedSum = 0, wonSum = 0, wonCount = 0;

  const process = (q) => {
    const st = String(q.status || "(ว่าง)");
    const amt = Number(q.amount) || 0;

    // กันวันที่นอกช่วง (อิง quotationdate)
    const ds = q.quotationdateString || (q.quotationdate ? String(q.quotationdate).substring(0, 10) : null);
    if (ds) {
      const [yr, mo, dy] = ds.split("-").map(Number);
      const qDate = new Date(yr, mo - 1, dy);
      if (qDate < fromDate || qDate > today) return;
    }
    inWindow++;

    if (!statusAll[st]) statusAll[st] = { count: 0, amount: 0 };
    statusAll[st].count++;
    statusAll[st].amount += amt;

    const saleKey = String(saleMap[String(q.number || "").trim()] || q[SALE_FIELD] || "").trim() || "(ยังไม่ระบุเซล)";
    if (!bySale[saleKey]) bySale[saleKey] = { name: saleKey, total: 0, success: 0, pending: 0, other: 0, quoted: 0, won: 0 };
    const s = bySale[saleKey];
    s.total++;
    s.quoted += amt;
    if (st === "Success") { s.success++; s.won += amt; wonCount++; wonSum += amt; }
    else if (st === "Pending") s.pending++;
    else s.other++;
    quotedSum += amt;
  };

  const limit = 200, MAX_PAGES = 200;
  let fetched = 0, stopped = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (Date.now() - startMs > BUDGET_MS) { stopped = true; Logger.log("⏱️ หยุดก่อนชนลิมิต (ถึงหน้า " + (page - 1) + ")"); break; }
    const url = `${ZORT_BASE}/Quotation/GetQuotations?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { Logger.log("หยุด: HTTP " + res.getResponseCode() + " หน้า " + page); break; }
    const list = (JSON.parse(res.getContentText())).list || [];
    for (const q of list) process(q);
    fetched += list.length;
    if (list.length < limit) break;
    Utilities.sleep(120);
  }

  Logger.log("ดึงทั้งหมด " + fetched + " ใบ · อยู่ในกรอบ 90 วัน (นับจริง) " + inWindow + " ใบ" + (stopped ? " (บางส่วน)" : ""));
  Logger.log("");
  Logger.log("════ แจกแจงสถานะ (status) — ทุกค่าที่เจอ ════");
  Object.entries(statusAll).sort((a, b) => b[1].count - a[1].count).forEach(([st, v]) => {
    const p = inWindow ? Math.round(v.count / inWindow * 100) : 0;
    Logger.log(`   ${st} : ${v.count} ใบ (${p}%) · ${Math.round(v.amount).toLocaleString()} บาท`);
  });
  Logger.log("   → สมมติ Success = ปิดการขายได้ · โปรดยืนยันว่าตรงกับความจริงในระบบ");

  Logger.log("");
  Logger.log("════ Conversion รวมทั้งร้าน ════");
  const winPct = inWindow ? Math.round(wonCount / inWindow * 100) : 0;
  Logger.log(`   เสนอ ${inWindow} ใบ (${Math.round(quotedSum).toLocaleString()} บาท) · ปิดได้ ${wonCount} ใบ (${Math.round(wonSum).toLocaleString()} บาท) · win rate ${winPct}%`);

  Logger.log("");
  Logger.log("════ Conversion แยกตามเซล (จากช่อง " + SALE_FIELD + ", เรียงตามมูลค่าปิดได้) ════");
  Object.entries(bySale).sort((a, b) => b[1].won - a[1].won).forEach(([key, s]) => {
    const wp = s.total ? Math.round(s.success / s.total * 100) : 0;
    Logger.log(`   ▸ ${key}`);
    Logger.log(`      เสนอ ${s.total} ใบ · ปิดได้ ${s.success} ใบ · ค้าง ${s.pending} · อื่นๆ ${s.other} · win rate ${wp}%`);
    Logger.log(`      มูลค่าเสนอ ${Math.round(s.quoted).toLocaleString()} · ปิดได้ ${Math.round(s.won).toLocaleString()} บาท`);
  });
  Logger.log("(ของเก่าที่ยังไม่ได้พิมพ์ชื่อเซลจะกองที่ \"(ยังไม่ระบุเซล)\" — เริ่มพิมพ์ tag ใบใหม่แล้วจะแยกเซลได้)");

  Logger.log("──────── เสร็จ — copy log ทั้งหมดส่งกลับมา ────────");
}

// ── PROBE: ประวัติ ZORT มีกี่ปี/กี่บิล (ก่อนตัดสินใจดึงทั้งระบบ) ──
// รันเองใน GAS editor แล้ว copy log ส่งกลับมา — โหลดเบา (limit=1 ต่อปี อ่าน field count รวม ถ้ามี)
// ถ้า response ไม่มี count → fallback ดึงจริงทีละปีแบบ cap time budget แล้วรายงานเท่าที่ได้
function probeZortHistory() {
  const tz = "Asia/Bangkok";
  const nowY = new Date().getFullYear();
  const START_Y = 2018;
  Logger.log("──────── probe ประวัติ ZORT ────────");

  // 1) ตรวจว่า response มี field count/total รวมไหม (ดูจากคำสั่งปีล่าสุด)
  const testUrl = `${ZORT_BASE}/Order/GetOrders?page=1&limit=1&fromdate=${nowY}-01-01&todate=${nowY}-12-31`;
  let hasCount = false, countKey = null;
  try {
    const r = UrlFetchApp.fetch(testUrl, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    Logger.log("test HTTP " + r.getResponseCode());
    const j = JSON.parse(r.getContentText());
    Logger.log("top-level keys: " + JSON.stringify(Object.keys(j)));
    ["count", "total", "totalcount", "totalCount", "recordcount", "totalrecord"].forEach(k => {
      if (j[k] != null && !isNaN(Number(j[k]))) { hasCount = true; countKey = countKey || k; }
    });
    Logger.log("count field: " + (countKey || "(ไม่มี — จะนับจากจำนวนที่ดึงจริง)"));
  } catch (e) { Logger.log("test error: " + e); }

  let grand = 0;
  const startMs = Date.now(), BUDGET = 4.5 * 60 * 1000; // เผื่อไม่ให้ชน 6 นาที
  for (let y = START_Y; y <= nowY; y++) {
    if (Date.now() - startMs > BUDGET) { Logger.log("⏱️ หมดเวลา budget หยุดที่ปี " + y); break; }
    const from = `${y}-01-01`, to = `${y}-12-31`;
    if (hasCount) {
      const url = `${ZORT_BASE}/Order/GetOrders?page=1&limit=1&fromdate=${from}&todate=${to}`;
      try {
        const r = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
        const j = JSON.parse(r.getContentText());
        const n = Number(j[countKey]) || 0;
        grand += n;
        Logger.log(`ปี ${y}: ${n} บิล`);
      } catch (e) { Logger.log(`ปี ${y}: error ${e}`); }
      Utilities.sleep(150);
    } else {
      // ไม่มี count → ดึงจริงแบบนับ (cap 30 หน้า/ปี = 6000 บิล/ปี พอสำหรับ probe)
      let n = 0;
      for (let page = 1; page <= 30; page++) {
        const url = `${ZORT_BASE}/Order/GetOrders?page=${page}&limit=200&fromdate=${from}&todate=${to}`;
        const r = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
        if (r.getResponseCode() !== 200) break;
        const list = (JSON.parse(r.getContentText())).list || [];
        n += list.length;
        if (list.length < 200) break;
        Utilities.sleep(120);
        if (Date.now() - startMs > BUDGET) { Logger.log("⏱️ budget หมดกลางปี " + y); break; }
      }
      grand += n;
      Logger.log(`ปี ${y}: ${n} บิล${n >= 6000 ? "+ (ชน cap 30 หน้า อาจมากกว่านี้)" : ""}`);
    }
  }
  Logger.log("═══ รวมทั้งหมด ~" + grand + " บิล ═══");
  Logger.log("แนะนำ: ถ้ารวม ≤ ~20,000 บิล → ขยาย sync ปีเดียวจบได้ · ถ้ามากกว่า → ต้อง backfill แบ่งรอบ");
  Logger.log("──────── เสร็จ — copy log ส่งกลับมา ────────");
}

// ── PROBE 2: นับจากวันที่จริงของออเดอร์ (field count ของ ZORT มั่ว = รวมทั้งระบบไม่สน date) ──
// ดึงจริงช่วงกว้าง (2023→วันนี้) ครั้งเดียว แล้ว bucket ตาม orderdateString จริง + หา earliest/latest
// รันเองแล้ว copy log ส่งมา
function probeZortHistory2() {
  const tz = "Asia/Bangkok";
  const today = new Date();
  const fromStr = "2023-01-01";
  const toStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  Logger.log("──────── probe 2: นับจากวันที่จริง ────────");
  Logger.log("ดึงช่วง " + fromStr + " → " + toStr + " (อาจใช้เวลา ~2-3 นาที)");

  const all = fetchZortOrdersPaged_(fromStr, toStr);
  Logger.log("ดึงมาทั้งหมด: " + all.length + " บิล");

  const byYear = {}, byYM = {}, byStatus = {};
  let minDate = null, maxDate = null;
  all.forEach(o => {
    const ds = o.orderdateString || (o.orderdate ? String(o.orderdate).substring(0, 10) : null);
    byStatus[o.status || "null"] = (byStatus[o.status || "null"] || 0) + 1;
    if (!ds || ds.length < 7) return;
    const y = ds.substring(0, 4), ym = ds.substring(0, 7);
    byYear[y] = (byYear[y] || 0) + 1;
    byYM[ym] = (byYM[ym] || 0) + 1;
    if (!minDate || ds < minDate) minDate = ds;
    if (!maxDate || ds > maxDate) maxDate = ds;
  });

  Logger.log("ช่วงวันที่จริง: " + minDate + " → " + maxDate);
  Logger.log("status: " + JSON.stringify(byStatus));
  Logger.log("── บิลต่อปี ──");
  Object.keys(byYear).sort().forEach(y => Logger.log(`  ${y}: ${byYear[y]} บิล`));
  Logger.log("── บิลต่อเดือน ──");
  Object.keys(byYM).sort().forEach(ym => Logger.log(`  ${ym}: ${byYM[ym]}`));
  Logger.log("═══ สรุป: " + all.length + " บิล · " + minDate + " → " + maxDate + " ═══");
  Logger.log("──────── เสร็จ — copy log ส่งมา ────────");
}

// ─── ZORT Sales Auto-Sync ───────────────────────────────────────────────────

// Auto-sync ทุก 2 ชม. — มีชีตดิบแล้ว (backfill) → incremental: เพิ่มเฉพาะออเดอร์ใหม่ลงดิบ แล้ว rebuild
// (ไม่ดึง 365 วันทับทั้งก้อนอีก เพราะจะลบประวัติ 2024 ทิ้ง) · ยังไม่มีดิบ → fallback ดึง 365 วันแบบเดิม
function syncZortSales() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = "Asia/Bangkok";
  const today = new Date();
  const DAILY_DAYS = 60;
  const sh = ss.getSheetByName(SHEET_ORDERS_RAW);

  if (sh && sh.getLastRow() > 1) {
    // ── incremental ──
    const existing = {};
    sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(r => { const n = String(r[0] || ""); if (n) existing[n] = true; });

    const toStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");
    const fromStr = "2023-01-01";
    const RECENT_PAGES = 4; // GetOrders คืนใหม่สุดก่อน — 4 หน้า (~800 บิลล่าสุด) พอครอบคลุมช่วงหลายวัน
    const newRows = [];
    let newOrders = 0;
    for (let page = 1; page <= RECENT_PAGES; page++) {
      const url = `${ZORT_BASE}/Order/GetOrders?page=${page}&limit=200&fromdate=${fromStr}&todate=${toStr}`;
      const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) break;
      const list = (JSON.parse(res.getContentText())).list || [];
      if (!list.length) break;
      let pageNew = 0;
      list.forEach(o => {
        const num = String(o.number || "");
        if (!num || existing[num]) return;
        existing[num] = true; newOrders++; pageNew++;
        const ds = o.orderdateString || (o.orderdate ? String(o.orderdate).substring(0, 10) : "");
        const items = Array.isArray(o.list) ? o.list : [];
        const amount = Number(o.amount) || 0;
        if (items.length === 0) {
          newRows.push([ds, num, String(o.status || ""), "", "", 0, 0, o.customerid || "", String(o.customername || ""), amount]);
        } else {
          items.forEach(it => newRows.push([ds, num, String(o.status || ""),
            String(it.sku || "").toUpperCase(), String(it.name || ""), Number(it.number) || 0, Number(it.totalprice) || 0,
            o.customerid || "", String(o.customername || ""), amount]));
        }
      });
      if (list.length < 200) break;
      if (pageNew === 0) break; // ไล่ถึงออเดอร์เก่าที่มีในดิบแล้ว → หยุด
      Utilities.sleep(120);
    }
    if (newRows.length) sh.getRange(sh.getLastRow() + 1, 1, newRows.length, BACKFILL_HEADER.length).setValues(newRows);
    Logger.log("syncZortSales (incremental): +" + newOrders + " ออเดอร์ใหม่ (" + newRows.length + " แถว) → rebuild");
    rebuildSalesFromRaw();
    return;
  }

  // ── fallback: ยังไม่มีชีตดิบ → ดึง 365 วันแล้วสรุป (แบบเดิม) ──
  const MONTHLY_DAYS = 365;
  const fromDate = new Date(today.getTime() - MONTHLY_DAYS * 24 * 60 * 60 * 1000);
  const fromStr = Utilities.formatDate(fromDate, tz, "yyyy-MM-dd");
  const toStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  const allOrders = fetchZortOrdersPaged_(fromStr, toStr);
  Logger.log("ZORT orders fetched: " + allOrders.length + " (fallback — ยังไม่มีชีตดิบ)");
  const r = aggregateAndWriteSales_(ss, allOrders, fromDate, today, DAILY_DAYS);
  Logger.log("✅ syncZortSales เสร็จ · orders=" + allOrders.length + " SKUs=" + r.skus + " · ลูกค้า=" + r.customers);
  invalidateCache_(); // ยอดขายเปลี่ยน → payload เปลี่ยน (ดูหมายเหตุใน rebuildSalesFromRaw)
}

// รวมยอด (รายเดือน/รายวัน/ลูกค้า) จาก orders แล้วเขียนลงชีต — ใช้ร่วมกันโดย syncZortSales + rebuildSalesFromRaw
// orders[] = [{ orderdateString, status, amount, customerid, customername, list:[{sku,name,number,totalprice}] }]
function aggregateAndWriteSales_(ss, allOrders, fromDate, today, DAILY_DAYS) {
  // ดึง SKU → category/name จาก product sheet
  const catMap = {}, nameMap = {};
  readProducts_().forEach(p => {
    if (!p.sku) return;
    const k = p.sku.toUpperCase();
    catMap[k]  = p.category || "ไม่ระบุ";
    nameMap[k] = p.name || p.sku;
  });

  const monthly = {}, daily = {};
  const monthSet = new Set(), daySet = new Set();
  const custData = {}; // customerKey → { name, months:{mk:{total,count}}, products:{sku:{name,qty,rev}} }

  for (const order of allOrders) {
    if (order.status !== "Success") continue;
    const dateStr = order.orderdateString || (order.orderdate ? String(order.orderdate).substring(0, 10) : null);
    if (!dateStr) continue;
    const [yr, mo, dy] = dateStr.split("-").map(Number);
    const oDate = new Date(yr, mo - 1, dy);
    // กัน order ที่วันที่เพี้ยน/นอกช่วง (เช่น 2013) ออก
    if (oDate < fromDate || oDate > today) continue;
    const mk = monthKey_(oDate);
    const dk = dayKey_(oDate);
    const diffDays = (today - oDate) / (24 * 60 * 60 * 1000);
    monthSet.add(mk);
    if (diffDays <= DAILY_DAYS) daySet.add(dk);

    // ── รวมยอดลูกค้า (เฉพาะที่ระบุตัวตน — customerid หรือชื่อไม่ว่าง) ──
    const custName = String(order.customername || "").trim();
    const custId   = order.customerid;
    const custKey  = custId ? ("id:" + custId) : (custName ? ("nm:" + custName) : null);
    if (custKey) {
      if (!custData[custKey]) custData[custKey] = { name: custName || custKey, months: {}, products: {} };
      const cd = custData[custKey];
      if (custName && cd.name.indexOf("id:") === 0) cd.name = custName; // เติมชื่อถ้าเพิ่งเจอ
      if (!cd.months[mk]) cd.months[mk] = { total: 0, count: 0 };
      cd.months[mk].total += Number(order.amount) || 0;
      cd.months[mk].count += 1;
    }

    for (const item of (Array.isArray(order.list) ? order.list : [])) {
      const sku = String(item.sku || "").trim().toUpperCase();
      if (!sku) continue;
      const qty = Number(item.number)    || 0;
      const rev = Number(item.totalprice)|| 0;
      const name = nameMap[sku] || String(item.name || sku).trim();
      const cat  = catMap[sku]  || "ไม่ระบุ";

      if (!monthly[sku]) monthly[sku] = { name, cat, months: {} };
      if (!monthly[sku].months[mk]) monthly[sku].months[mk] = { qty: 0, rev: 0 };
      monthly[sku].months[mk].qty += qty;
      monthly[sku].months[mk].rev += rev;

      if (diffDays <= DAILY_DAYS) {
        if (!daily[sku]) daily[sku] = { name, cat, days: {} };
        if (!daily[sku].days[dk]) daily[sku].days[dk] = { qty: 0, rev: 0 };
        daily[sku].days[dk].qty += qty;
        daily[sku].days[dk].rev += rev;
      }

      // สินค้าที่ลูกค้ารายนี้ซื้อ (สะสมทั้งช่วง)
      if (custKey) {
        const cp = custData[custKey].products;
        if (!cp[sku]) cp[sku] = { name, qty: 0, rev: 0 };
        cp[sku].qty += qty;
        cp[sku].rev += rev;
      }
    }
  }

  const sortedMonths = sortMonthKeys_(Array.from(monthSet));
  const sortedDays   = sortDayKeys_(Array.from(daySet));
  Logger.log("months: " + sortedMonths.join(", "));
  Logger.log("days: " + sortedDays.length + " วัน, SKUs monthly: " + Object.keys(monthly).length);

  writeZortSalesSheet_(ss, "ยอดขายรายเดือน", monthly, sortedMonths, "months");
  writeZortSalesSheet_(ss, "ยอดขายรายวัน",   daily,   sortedDays,   "days");
  // เขียนสรุปลูกค้า (ไม่ให้พัง sales sync ถ้ามีปัญหา)
  try { writeCustomerSummarySheets_(ss, custData); }
  catch (e) { Logger.log("⚠️ writeCustomerSummarySheets_ error: " + e); }
  const nowIso = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty('upd_monthlysales', nowIso);
  PropertiesService.getScriptProperties().setProperty('upd_dailysales',   nowIso);
  PropertiesService.getScriptProperties().setProperty('upd_customersummary', nowIso);
  invalidateCache_();
  return { skus: Object.keys(monthly).length, customers: Object.keys(custData).length, months: sortedMonths };
}

// ═══════════ BACKFILL: ดึงประวัติ ZORT ทั้งระบบ (2024→ปัจจุบัน) แบบแบ่งรอบ resumable ═══════════
// single-pass หลายปีชน 6 นาที (deep pagination ช้า) → ดึงทีละเดือน (ช่วงแคบ page ตื้น เร็ว) เก็บชีตดิบ
// startBackfill() รันครั้งเดียว → ตั้ง trigger ทุก 5 นาที รันจนครบทุกเดือน แล้วลบ trigger + rebuild อัตโนมัติ
const BACKFILL_HEADER = ["date", "orderNumber", "status", "sku", "name", "qty", "revenue", "customerid", "customername", "amount"];

// รันครั้งเดียวใน GAS editor เพื่อเริ่ม (จะขออนุญาต + ตั้ง trigger)
function startBackfill() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_ORDERS_RAW);
  if (!sh) sh = ss.insertSheet(SHEET_ORDERS_RAW);
  sh.clear();
  sh.getRange(1, 1, 1, BACKFILL_HEADER.length).setValues([BACKFILL_HEADER]);
  sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat("@"); // คอลัมน์ A (วันที่) = text กัน Sheets แปลงเป็น Date (บทเรียน #2)
  const props = PropertiesService.getScriptProperties();
  props.setProperty('backfill_page', '1');
  props.deleteProperty('backfill_done');
  removeTriggersByName_('backfillZortOrders');
  removeTriggersByName_('rebuildSalesFromRaw');
  ScriptApp.newTrigger('backfillZortOrders').timeBased().everyMinutes(5).create();
  Logger.log("▶️ เริ่ม backfill (แบ่งตามหน้า) · ตั้ง trigger ทุก 5 นาทีแล้ว · รันรอบแรกเลย…");
  backfillZortOrders();
}

// ตัวรันจริง (trigger เรียกทุก 5 นาที) — ดึงทีละหน้า (200 บิล/หน้า) ภายใน budget 4.5 นาที แล้วเซฟหน้า
// ZORT ไม่กรอง date จริง (query คืนทั้งระบบ) → ดึงทุกหน้าตามลำดับ เก็บดิบพร้อมวันที่จริง (rebuild ค่อยกรอง)
// bounded ต่อหน้า → หน้าเดียวใช้ไม่กี่วิ ไม่มีทางชน 6 นาที (เช็ค budget ระหว่างหน้า)
function backfillZortOrders() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('backfill_done') === '1') { removeTriggersByName_('backfillZortOrders'); Logger.log("backfill เสร็จแล้ว — ลบ trigger"); return; }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_ORDERS_RAW);
  if (!sh) { Logger.log("❌ ไม่มีชีตดิบ — รัน startBackfill ก่อน"); return; }

  const tz = "Asia/Bangkok";
  const toStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const fromStr = "2023-01-01"; // เผื่อ date filter ทำงาน ให้ครอบคลุมก่อนเริ่มใช้จริง (2024)
  const limit = 200;
  let page = parseInt(props.getProperty('backfill_page') || '1', 10);
  const startMs = Date.now(), BUDGET = 4.5 * 60 * 1000;

  let appended = 0, pagesDone = 0, finished = false;
  while (true) {
    if (Date.now() - startMs > BUDGET) { Logger.log("⏱️ budget หมด · ค้างที่หน้า " + page + " (รอบหน้าทำต่อ)"); break; }
    const url = `${ZORT_BASE}/Order/GetOrders?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { Logger.log("⚠️ HTTP " + res.getResponseCode() + " ที่หน้า " + page + " — หยุดรอบนี้ (trigger จะลองใหม่)"); break; }
    const list = (JSON.parse(res.getContentText())).list || [];
    if (list.length === 0) { finished = true; break; }

    const rows = [];
    list.forEach(o => {
      const ds = o.orderdateString || (o.orderdate ? String(o.orderdate).substring(0, 10) : "");
      const items = Array.isArray(o.list) ? o.list : [];
      const amount = Number(o.amount) || 0;
      if (items.length === 0) {
        rows.push([ds, String(o.number || ""), String(o.status || ""), "", "", 0, 0, o.customerid || "", String(o.customername || ""), amount]);
      } else {
        items.forEach(it => rows.push([ds, String(o.number || ""), String(o.status || ""),
          String(it.sku || "").toUpperCase(), String(it.name || ""), Number(it.number) || 0, Number(it.totalprice) || 0,
          o.customerid || "", String(o.customername || ""), amount]));
      }
    });
    if (rows.length) { sh.getRange(sh.getLastRow() + 1, 1, rows.length, BACKFILL_HEADER.length).setValues(rows); appended += rows.length; }
    pagesDone++;
    page++;
    props.setProperty('backfill_page', String(page));
    if (list.length < limit) { finished = true; break; } // หน้าสุดท้าย
    Utilities.sleep(150);
  }

  if (finished) {
    props.setProperty('backfill_done', '1');
    removeTriggersByName_('backfillZortOrders');
    Logger.log("✅ ดึงครบทุกหน้า · รอบนี้ +" + appended + " แถว (" + pagesDone + " หน้า) · ตั้ง trigger rebuild อีก 1 นาที…");
    removeTriggersByName_('rebuildSalesFromRaw');
    ScriptApp.newTrigger('rebuildSalesFromRaw').timeBased().after(60 * 1000).create();
  } else {
    Logger.log("รอบนี้ " + pagesDone + " หน้า (+" + appended + " แถว) · ค้างที่หน้า " + page + " · trigger จะรันต่อ");
  }
}

// สร้างชีตสรุป (รายเดือน/รายวัน/ลูกค้า) จากชีตดิบ — ไม่แตะ API (เร็ว) · trigger one-off เรียกหลัง backfill ครบ
function rebuildSalesFromRaw() {
  removeTriggersByName_('rebuildSalesFromRaw');
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_ORDERS_RAW);
  if (!sh || sh.getLastRow() < 2) { Logger.log("❌ ชีตดิบว่าง — ยังไม่ backfill"); return; }
  const vals = sh.getDataRange().getValues();
  Logger.log("rebuild: อ่าน " + (vals.length - 1) + " แถวดิบ");

  // Sheets แปลง "2024-01-15" เป็น Date object อัตโนมัติ → อ่านกลับต้องรองรับทั้ง Date และ string (บทเรียน #2)
  const tzBK = "Asia/Bangkok";
  const rawDateStr = (v) => {
    if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tzBK, "yyyy-MM-dd");
    const s = String(v || "");
    return s.length >= 10 ? s.substring(0, 10) : s;
  };

  // reconstruct orders โดย group ตาม orderNumber (amount ระดับออเดอร์ = ค่าเดียวกันทุกบรรทัด เอาค่าแรก)
  const byOrder = {};
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    const num = String(r[1] || "");
    if (!num) continue;
    if (!byOrder[num]) byOrder[num] = { orderdateString: rawDateStr(r[0]), status: String(r[2] || ""), amount: Number(r[9]) || 0, customerid: r[7] || "", customername: String(r[8] || ""), list: [] };
    const sku = String(r[3] || "");
    if (sku) byOrder[num].list.push({ sku: sku, name: String(r[4] || ""), number: Number(r[5]) || 0, totalprice: Number(r[6]) || 0 });
  }
  const orders = Object.keys(byOrder).map(k => byOrder[k]);
  Logger.log("reconstruct: " + orders.length + " ออเดอร์");

  const fromDate = new Date(2024, 0, 1);
  const today = new Date();
  const r = aggregateAndWriteSales_(ss, orders, fromDate, today, 60);
  Logger.log("✅ rebuild เสร็จ · SKUs=" + r.skus + " · ลูกค้า=" + r.customers + " · เดือน=" + (r.months ? r.months.length : 0));
  // เขียนชีตยอดขายรายเดือน/รายวันใหม่ = payload เปลี่ยน → ต้องล้าง cache
  // (เดิมไม่ล้างก็ไม่มีผล เพราะเว็บส่ง fresh=1 ทุกครั้งจน cache ไม่เคยถูกใช้ — ตอนนี้ใช้แล้ว)
  invalidateCache_();
}

// ยกเลิก backfill (ลบ trigger ค้าง) — เผื่อต้องหยุดกลางคัน · cursor ยังคงไว้ → resumeBackfill ทำต่อได้
function stopBackfill() {
  removeTriggersByName_('backfillZortOrders');
  removeTriggersByName_('rebuildSalesFromRaw');
  Logger.log("🛑 ลบ trigger backfill/rebuild แล้ว (cursor ยังคงไว้ · รัน resumeBackfill เพื่อทำต่อ)");
}

// ทำ backfill ต่อจาก cursor เดิม (ไม่ล้างชีตดิบ) — ตั้ง trigger ใหม่ + รันรอบแรกเลย
function resumeBackfill() {
  PropertiesService.getScriptProperties().deleteProperty('backfill_done');
  removeTriggersByName_('backfillZortOrders');
  ScriptApp.newTrigger('backfillZortOrders').timeBased().everyMinutes(5).create();
  Logger.log("▶️ ทำต่อจาก cursor เดิม · ตั้ง trigger แล้ว · รันรอบแรก…");
  backfillZortOrders();
}

// เช็คสถานะ backfill + โควตา cell ของ spreadsheet (ลิมิต Google Sheets = 10 ล้าน cell ทั้งไฟล์)
function backfillStatus() {
  const props = PropertiesService.getScriptProperties();
  Logger.log("หน้าถัดไปที่จะดึง: " + (props.getProperty('backfill_page') || "(ยังไม่เริ่ม)"));
  Logger.log("done: " + (props.getProperty('backfill_done') === '1' ? "✅ ครบแล้ว" : "⏳ ยังไม่ครบ"));
  const trig = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backfillZortOrders' || t.getHandlerFunction() === 'rebuildSalesFromRaw');
  Logger.log("trigger ทำงานอยู่: " + (trig.length ? trig.map(t => t.getHandlerFunction()).join(", ") : "(ไม่มี)"));
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_ORDERS_RAW);
  Logger.log("แถวในชีตดิบ: " + (sh ? sh.getLastRow() - 1 : 0));

  // โควตา cell ทั้ง spreadsheet (grid ทุกชีต × 10 คอลัมน์) เทียบลิมิต 10 ล้าน
  const LIMIT = 10000000;
  let totalCells = 0;
  ss.getSheets().forEach(s => { totalCells += s.getMaxRows() * s.getMaxColumns(); });
  const pct = (totalCells / LIMIT * 100).toFixed(1);
  Logger.log("── โควตา Google Sheets ──");
  Logger.log("ใช้ไป ~" + totalCells.toLocaleString() + " / 10,000,000 cell (" + pct + "%) · เหลือ ~" + (LIMIT - totalCells).toLocaleString());
  Logger.log(totalCells < LIMIT * 0.7 ? "✅ เหลือเยอะ ปลอดภัย" : totalCells < LIMIT * 0.9 ? "⚠️ เริ่มเยอะ ควรจับตา" : "🔴 ใกล้เต็ม — ต้องลดข้อมูล");
}

// helpers
function nextYM_(ym) { let p = ym.split("-").map(Number), y = p[0], m = p[1] + 1; if (m > 12) { m = 1; y++; } return y + "-" + (m < 10 ? "0" + m : m); }
function monthRange_(ym) { const p = ym.split("-").map(Number), last = new Date(p[0], p[1], 0).getDate(); return [ym + "-01", ym + "-" + (last < 10 ? "0" + last : last)]; }
function removeTriggersByName_(name) { ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === name) ScriptApp.deleteTrigger(t); }); }

// เขียนสรุปลูกค้า 2 ชีต: (1) customer×month  (2) customer×product(top 15)
// เขียนเฉพาะลูกค้าที่ยอดรวมทั้งช่วง >= 1000 บาท (กันลูกค้าจรยอดจิ๊บจ๊อยล้นชีต)
function writeCustomerSummarySheets_(ss, custData) {
  const MIN_TOTAL = 1000, TOP_PRODUCTS = 15;
  const monthRows = [["customerKey", "ชื่อลูกค้า", "เดือน (MM/YYYY)", "ยอดซื้อ", "จำนวนบิล"]];
  const prodRows  = [["customerKey", "ชื่อลูกค้า", "SKU", "ชื่อสินค้า", "จำนวน", "ยอดซื้อ"]];

  Object.keys(custData).forEach(key => {
    const cd = custData[key];
    let grand = 0;
    Object.keys(cd.months).forEach(mk => { grand += cd.months[mk].total; });
    if (grand < MIN_TOTAL) return;

    Object.keys(cd.months).forEach(mk => {
      const m = cd.months[mk];
      monthRows.push([key, cd.name, mk, Math.round(m.total), m.count]);
    });

    Object.keys(cd.products)
      .map(sku => ({ sku, ...cd.products[sku] }))
      .sort((a, b) => b.rev - a.rev)
      .slice(0, TOP_PRODUCTS)
      .forEach(p => prodRows.push([key, cd.name, p.sku, p.name, p.qty, Math.round(p.rev)]));
  });

  // เคลียร์ operation ค้างจากการเขียนชีตใหญ่ก่อนหน้า (รายเดือน/รายวัน) กัน Spreadsheets service timeout สะสม
  try { SpreadsheetApp.flush(); } catch (e) {}

  // เขียนชีตแบบ retry — Spreadsheets timeout เป็น transient (โหลดสูงช่วงท้าย sync) ลองซ้ำได้
  // textCols = index (1-based) ของคอลัมน์ที่ต้องเก็บเป็น text (เดือน MM/YYYY, SKU) กัน Sheets แปลงเป็นวันที่/เลข
  const writeSheet = (shName, rows, textCols) => {
    const attempt = () => {
      let sh = ss.getSheetByName(shName);
      if (!sh) sh = ss.insertSheet(shName);
      sh.clearContents();
      if (rows.length) {
        // format เฉพาะคอลัมน์ที่จำเป็นเป็น text (ไม่ set ทั้ง range — ลดภาระ service)
        (textCols || []).forEach(c => {
          if (c <= rows[0].length) sh.getRange(1, c, rows.length, 1).setNumberFormat("@");
        });
        sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      }
      SpreadsheetApp.flush();
    };
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try { attempt(); return; }
      catch (e) { lastErr = e; Logger.log("  retry เขียน " + shName + " (ครั้ง " + (i + 1) + "): " + e); Utilities.sleep(3000 * (i + 1)); }
    }
    throw lastErr;
  };
  writeSheet(SHEET_CUST_MONTHLY,  monthRows, [3]);    // คอลัมน์ 3 = เดือน MM/YYYY
  writeSheet(SHEET_CUST_PRODUCTS, prodRows,  [3]);    // คอลัมน์ 3 = SKU
  Logger.log("สรุปลูกค้า: " + (monthRows.length - 1) + " แถวเดือน, " + (prodRows.length - 1) + " แถวสินค้า");
}

// ดึงคำสั่งซื้อจาก ZORT แบบ paginated (รองรับทั้งปี)
function fetchZortOrdersPaged_(fromStr, toStr) {
  const all = [], limit = 200, MAX_PAGES = 120; // สูงสุด 24,000 orders
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${ZORT_BASE}/Order/GetOrders?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) break;
    const list = (JSON.parse(res.getContentText())).list || [];
    all.push(...list);
    if (list.length < limit) break;
    Utilities.sleep(250);
    if (page === MAX_PAGES) Logger.log("⚠️ ชนเพดาน " + MAX_PAGES + " หน้า — อาจมี orders เกิน " + all.length);
  }
  return all;
}

function sortMonthKeys_(keys) {
  return keys.sort((a, b) => {
    const [ma, ya] = a.split("/").map(Number);
    const [mb, yb] = b.split("/").map(Number);
    return ya !== yb ? ya - yb : ma - mb;
  });
}

function sortDayKeys_(keys) {
  return keys.sort((a, b) => {
    const [da, ma, ya] = a.split("/").map(Number);
    const [db, mb, yb] = b.split("/").map(Number);
    if (ya !== yb) return ya - yb;
    if (ma !== mb) return ma - mb;
    return da - db;
  });
}

// เขียนข้อมูลลง sheet ยอดขาย (รูปแบบที่ readMonthlySales_/readDailySales_ อ่านได้)
function writeZortSalesSheet_(ss, shName, data, sortedKeys, periodField) {
  const sh = ss.getSheetByName(shName);
  if (!sh) { Logger.log("ไม่พบชีต " + shName); return; }

  const skus = Object.keys(data);
  if (skus.length === 0 || sortedKeys.length === 0) {
    Logger.log(shName + ": ไม่มีข้อมูล");
    return;
  }

  const headerRow    = ["ลำดับ", "SKU", "ชื่อสินค้า", "หมวด"];
  const subHeaderRow = ["", "", "", ""];
  sortedKeys.forEach(k => { headerRow.push(k, ""); subHeaderRow.push("จำนวน", "ยอดขาย"); });

  const dataRows = skus.map((sku, i) => {
    const { name, cat } = data[sku];
    const periods = data[sku][periodField];
    const row = [i + 1, sku, name, cat];
    sortedKeys.forEach(k => {
      const { qty = 0, rev = 0 } = periods[k] || {};
      row.push(qty, rev);
    });
    return row;
  });

  sh.clearContents();
  const allRows = [headerRow, subHeaderRow, ...dataRows];
  // กันไม่ให้ Sheets แปลง "05/2026" / "01/06/2026" เป็น date → ตั้ง row 1-2 เป็น text ก่อนเขียน
  sh.getRange(1, 1, 2, headerRow.length).setNumberFormat("@");
  sh.getRange(1, 1, allRows.length, headerRow.length).setValues(allRows);
  Logger.log(shName + ": เขียน " + dataRows.length + " rows, " + sortedKeys.length + " คอลัมน์");
}

// ตั้ง trigger ให้ sync ยอดขายจาก ZORT ทุก 2 ชั่วโมง
function setupZortSalesTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncZortSales") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncZortSales").timeBased().everyHours(2).create();
  Logger.log("✅ ตั้ง trigger: syncZortSales ทุก 2 ชั่วโมง");
}

function fetchAllZortProducts_(warehousecode) {
  let page = 1;
  const all = [];
  const MAX_RETRIES = 3;

  while (true) {
    let url = `${ZORT_BASE}/Product/GetProducts?page=${page}&limit=500`;
    if (warehousecode) url += `&warehousecode=${encodeURIComponent(warehousecode)}`;

    let json = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
        const text = res.getContentText();
        json = JSON.parse(text);
        break;
      } catch (err) {
        Logger.log(`Page ${page} attempt ${attempt} failed: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          Utilities.sleep(1000 * attempt);
        } else {
          Logger.log(`Page ${page} ข้ามไปเพราะ parse ไม่ได้หลัง ${MAX_RETRIES} ครั้ง`);
          json = null;
        }
      }
    }

    if (!json || !json.list || json.list.length === 0) break;
    all.push(...json.list);
    Logger.log(`Page ${page}: ${json.list.length} items (total: ${all.length})`);
    if (json.list.length < 500) break;
    page++;
    Utilities.sleep(400);
  }
  return all;
}

// cachedProducts: optional — ถ้ามีให้ใช้เลย ถ้าไม่มีจะ fetch เอง (backward compatible)
function syncZortToColumn_(warehousecode, colIndex, cachedProducts) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต: " + SHEET_PRODUCTS); return; }

  // โหลด SKUs ที่เพิ่งนับสต็อก (ป้องกันทับค่า)
  const recentJson = (warehousecode === WH_SAI5)
    ? CacheService.getScriptCache().get('recentCountedSkus') : null;
  const recentCounted = recentJson ? JSON.parse(recentJson) : {};
  const healItems = [];

  const products = cachedProducts || fetchAllZortProducts_(warehousecode);
  Logger.log(`ZORT: ${products.length} items`);

  // หน้าร้าน (W0001) ใช้ stock (on-hand จริง) แทน availablestock (=stock-reserved)
  // เพราะออเดอร์ที่เปิดค้างจะ "จอง" availablestock ทำให้เลขหน้าร้านต่ำ/เป็น 0 ทั้งที่ของยังอยู่
  // stock >= availablestock เสมอ → เปลี่ยนแล้วเลขไม่มีทางต่ำลง (ปลอดภัย) ถ้าไม่มี field stock → fallback
  const useStockField = (warehousecode === WH_FRONTSTORE);

  const zortMap      = {};
  const zortNameMap  = {};
  const zortCatMap   = {};
  const zortTagMap   = {};
  const zortPriceMap = {};
  for (const p of products) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (sku) {
      zortMap[sku]      = (useStockField && p.stock != null)
                            ? Number(p.stock)
                            : Number(p.availablestock || 0);
      zortNameMap[sku]  = String(p.name         || "").trim();
      zortCatMap[sku]   = String(p.category      || "").trim();
      zortTagMap[sku]   = Array.isArray(p.tag) ? p.tag.join(",") : String(p.tag || "").trim();
      zortPriceMap[sku] = Number(p.sellprice      || 0);
    }
  }

  const data = sheet.getDataRange().getValues();

  // ── GUARD: กัน sync เขียน 0 ยกแผง ──────────────────────────────────────────
  // dry-run ก่อนเขียนจริง: นับว่าถ้า sync จะทำให้ SKU ที่ตอนนี้ >0 กลายเป็น <=0 กี่ตัว
  // ถ้าเยอะผิดปกติ (ทั้งจำนวนและสัดส่วน) = ZORT คืนข้อมูลผิด/ล่ม → หยุดคอลัมน์นี้ ไม่เขียน + เตือน LINE
  // ปรับ threshold ได้ผ่าน Script Property, ปิด guard ได้ด้วย SYNC_GUARD_DISABLED='true'
  var _guardProps = PropertiesService.getScriptProperties();
  if (_guardProps.getProperty('SYNC_GUARD_DISABLED') !== 'true') {
    var minZero = parseInt(_guardProps.getProperty('SYNC_GUARD_MIN_ZERO') || '20', 10);
    var ratio   = parseFloat(_guardProps.getProperty('SYNC_GUARD_RATIO') || '0.5');
    var currentPositive = 0, wouldZero = 0;
    for (var gi = 1; gi < data.length; gi++) {
      var gsku = String(data[gi][COL_PROD_SKU - 1]).trim().toUpperCase();
      if (!gsku || zortMap[gsku] === undefined) continue;
      var gcur = Number(data[gi][colIndex - 1]) || 0;
      if (gcur <= 0) continue;
      currentPositive++;
      var gnext = (recentCounted[gsku] !== undefined) ? recentCounted[gsku] : zortMap[gsku];
      if (Number(gnext) <= 0) wouldZero++;
    }
    if (currentPositive >= minZero && wouldZero >= currentPositive * ratio) {
      var gpct = Math.round(wouldZero / currentPositive * 100);
      var whLabel = (warehousecode === WH_FRONTSTORE) ? 'หน้าร้าน (ดูเหมือนจริง)'
                  : (warehousecode === WH_SAI5) ? 'คลังสาย5' : warehousecode;
      var gmsg = '⚠️ หยุด sync อัตโนมัติ: ' + whLabel + ' จะถูกเซ็ตเป็น 0 ถึง ' + wouldZero +
                 '/' + currentPositive + ' รายการ (' + gpct + '%) — น่าจะ ZORT คืนข้อมูลผิด/ล่ม ' +
                 'ระบบไม่เขียนทับเพื่อกันข้อมูลหาย ตรวจ ZORT แล้วรัน sync ใหม่';
      Logger.log(gmsg);
      try { sendLineGroup_(gmsg); } catch (e) {}
      return;  // ยกเลิกการเขียนคอลัมน์นี้ (ปล่อยให้ sync คอลัมน์/ขั้นอื่นทำต่อได้)
    }
  }

  let updated = 0, notFound = 0;
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
    if (!sku) continue;

    if (zortMap[sku] !== undefined) {
      const row = i + 1;
      const useQty = (recentCounted[sku] !== undefined) ? recentCounted[sku] : zortMap[sku];
      sheet.getRange(row, colIndex).setValue(useQty);                // qty (G หรือ H)
      if (recentCounted[sku] !== undefined && recentCounted[sku] !== zortMap[sku]) {
        healItems.push({ sku: sku, qty: recentCounted[sku], warehousecode: warehousecode });
      }
      if (zortNameMap[sku])  sheet.getRange(row, 3).setValue(zortNameMap[sku]);   // col C = ชื่อ
      if (zortCatMap[sku])   sheet.getRange(row, 4).setValue(zortCatMap[sku]);    // col D = หมวด
      if (zortTagMap[sku])   sheet.getRange(row, 6).setValue(zortTagMap[sku]);    // col F = TAG
      if (zortPriceMap[sku]) sheet.getRange(row, 9).setValue(zortPriceMap[sku]);  // col I = ราคา
      updated++;
    } else {
      notFound++;
    }
  }

  SpreadsheetApp.flush();
  invalidateCache_();
  if (healItems.length) {
    try { pushStockToZort_(healItems); Logger.log("heal ZORT: " + healItems.length + " SKUs"); }
    catch(e) { Logger.log("heal ZORT error: " + e); }
  }
  Logger.log(`อัพเดทแล้ว: ${updated} rows | ไม่พบใน ZORT: ${notFound} rows | heal: ${healItems.length}`);
}

// cachedWH / cachedFS: optional — ถ้ามีให้ใช้เลย ถ้าไม่มีจะ fetch เอง (backward compatible)
function syncNewProductsFromZort(cachedWH, cachedFS) {
  Logger.log("=== ค้นหาสินค้าใหม่จาก ZORT ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต: " + SHEET_PRODUCTS); return; }

  const productsWH = cachedWH || fetchAllZortProducts_(WH_SAI5);
  const productsFS = cachedFS || fetchAllZortProducts_(WH_FRONTSTORE);
  const allProducts = [...productsWH, ...productsFS];

  const seen = {};
  const unique = [];
  for (const p of allProducts) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (sku && !seen[sku]) {
      seen[sku] = true;
      unique.push(p);
    }
  }

  const data = sheet.getDataRange().getValues();
  const existingSKUs = {};
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
    if (sku) existingSKUs[sku] = true;
  }

  let added = 0;
  for (const p of unique) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (sku && !existingSKUs[sku]) {
      const newRow = [
        "",
        sku,
        p.name || "",
        p.category || "",
        p.subCategory || "",
        Array.isArray(p.tag) ? p.tag.join(",") : String(p.tag || "").trim(),
        0,
        Number(p.availablestock || 0),
        Number(p.sellprice || 0)
      ];
      sheet.appendRow(newRow);
      added++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log(`เพิ่มสินค้าใหม่: ${added} รายการ`);
}

// ── หา SKU ที่ใช้แล้วทั้งหมด (จากทั้ง 2 ชีต) → ใช้เช็คซ้ำ ──
// รวม "อัพเดทจำนวนสินค้า" (B=SKU) + "ข้อมูลสินค้า" (B=SKU) เป็น Set uppercase
function collectExistingSkus_(ss) {
  const set = {};
  const collect = (sheetName, skuCol0) => {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const rows = sh.getDataRange().getDisplayValues();
    for (let i = 1; i < rows.length; i++) {
      const s = String(rows[i][skuCol0] || "").trim().toUpperCase();
      if (s) set[s] = true;
    }
  };
  collect(SHEET_PRODUCTS,     COL_PROD_SKU - 1); // B (0-indexed 1)
  collect(SHEET_PRODUCT_META, 1);                // B
  return set;
}

// ── เช็คว่า SKU ถูกใช้แล้วหรือยัง (server authoritative — client เรียกก่อนกดบันทึก) ──
// เช็คทั้ง 2 ชีต (sync จาก ZORT สม่ำเสมอ) — เร็วและครอบคลุมพอสำหรับ pre-check
function checkSkuExists(ss, sku) {
  const clean = String(sku || "").trim().toUpperCase();
  if (!clean) return error("ไม่มี SKU");
  const set = collectExistingSkus_(ss);
  return ok({ sku: clean, exists: !!set[clean] });
}

// ── เพิ่มสินค้าใหม่: ZORT AddProduct → ตั้งสต็อกเริ่มต้น → เขียนชีต → audit ──
// product = { sku, name, sellprice, category, qty, warehousecode }
// หน่วย fix เป็น "ชิ้น", barcode = sku (รหัสเดียวกันตามที่ตกลง)
// error handling: ถ้า AddProduct ล้มเหลว → ไม่เขียนชีต/ไม่ตั้งสต็อก (กัน state ค้างครึ่งทาง)
function addNewProduct(ss, product, actor) {
  const sku   = String(product.sku || "").trim().toUpperCase();
  const name  = String(product.name || "").trim();
  const price = Number(product.sellprice) || 0;
  const cat   = String(product.category || "").trim();
  const tag   = String(product.supplier || product.tag || "").trim(); // TAG ระบุซัพพลายเออร์
  const qty   = Math.max(0, Math.floor(Number(product.qty) || 0));
  const wh    = (product.warehousecode === WH_FRONTSTORE) ? WH_FRONTSTORE : WH_SAI5;

  if (!sku)  return error("กรุณาระบุ SKU");
  if (!name) return error("กรุณาระบุชื่อสินค้า");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");

  try {
    // 1) เช็คซ้ำในชีต (authoritative-enough — sync จาก ZORT สม่ำเสมอ)
    const existing = collectExistingSkus_(ss);
    if (existing[sku]) return error("SKU \"" + sku + "\" มีอยู่แล้วในระบบ — ใช้รหัสอื่น");

    // 2) ยิง ZORT AddProduct (sku=barcode, unittext=ชิ้น)
    //    payload อ้างตาม ZORT API v4: sku,name,sellprice,barcode,category,unittext
    const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
    const payload = {
      sku:      sku,
      barcode:  sku,
      name:     name,
      sellprice: String(price),
      unittext: "ชิ้น",
      category: cat,
    };
    // ZORT: field "tag" เป็น String(Array) = ลิสต์ tag — ต้องส่งเป็น array ไม่ใช่ string เดี่ยว
    // (ส่ง string เดี่ยว ZORT จะไม่รับ/ไม่สร้าง tag ให้) · รองรับหลาย tag คั่นด้วย comma
    if (tag) {
      const tagArr = tag.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
      if (tagArr.length) payload.tag = tagArr;
    }
    const res = UrlFetchApp.fetch(ZORT_BASE + "/Product/AddProduct", {
      method: "post", headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    Logger.log("AddProduct [" + sku + "]: HTTP " + res.getResponseCode() + " — " + res.getContentText().substring(0, 300));
    const zErr = zortRespError_(res);
    if (zErr) {
      // ZORT ปฏิเสธ (เช่น SKU ซ้ำใน ZORT ที่ยังไม่ sync เข้าชีต) → ไม่เขียนชีต
      logZortFailure_("เพิ่มสินค้าใหม่", "SKU: " + sku + " | " + zErr);
      return error("เพิ่มสินค้าเข้า ZORT ไม่สำเร็จ: " + zErr);
    }

    // 3) ตั้งสต็อกเริ่มต้นตามคลังที่เลือก (ถ้า qty > 0)
    if (qty > 0) {
      try { pushStockToZort_([{ sku: sku, qty: qty, warehousecode: wh }]); }
      catch (e) { Logger.log("addNewProduct setStock error: " + e); }
    }

    // 4) เขียนชีต "อัพเดทจำนวนสินค้า" (pattern เดียวกับ syncNewProductsFromZort)
    //    A="",B=sku,C=name,D=cat,E=subcat"",F=tag(ซัพพลายเออร์),G=qtyStore,H=qtyWH,I=price
    const qtyStore = (wh === WH_FRONTSTORE) ? qty : 0;
    const qtyWH    = (wh === WH_FRONTSTORE) ? 0   : qty;
    const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
    if (stockSh) {
      stockSh.appendRow(["", sku, name, cat, "", tag, qtyStore, qtyWH, price]);
      SpreadsheetApp.flush();
    }

    writeAuditLog_(actor || "ไม่ระบุ", "เพิ่มสินค้าใหม่", sku,
      auditDetail_({ after: { name: name, price: price, cat: cat, tag: tag, qty: qty, wh: wh }, note: "เพิ่มสินค้าใหม่เข้า ZORT + ชีต" }));

    invalidateCache_(); // bump dmj_last_write_ts ให้เครื่องอื่นเห็นสินค้าใหม่
    return ok({ sku: sku, name: name, qty: qty, warehousecode: wh });
  } finally {
    lock.releaseLock();
  }
}

// ── verify: ตรวจว่า ZORT รับ tag แบบ array จริง (เจ้าของกด Run ครั้งเดียว) ──
// สร้างสินค้าทดสอบ (SKU ขึ้นต้น ZZTAGTEST) + tag → อ่านกลับ → ลบทิ้งอัตโนมัติ (ไม่เหลือขยะ)
function exploreProductTag() {
  const testSku = "ZZTAGTEST" + Date.now();
  const testTag = "ทดสอบซัพพลายเออร์";
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });

  // 1) เพิ่มสินค้าทดสอบ พร้อม tag เป็น array
  const addRes = UrlFetchApp.fetch(ZORT_BASE + "/Product/AddProduct", {
    method: "post", headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({
      sku: testSku, barcode: testSku, name: "ทดสอบ tag (ลบอัตโนมัติ)",
      sellprice: "1", unittext: "ชิ้น", category: "ทดสอบ", tag: [testTag],
    }),
  });
  Logger.log("AddProduct(test) HTTP " + addRes.getResponseCode() + " — " + addRes.getContentText().substring(0, 300));

  // 2) อ่านกลับ ดู field tag
  Utilities.sleep(1500);
  let tagBack = "(อ่านไม่ได้)";
  try {
    const getRes = UrlFetchApp.fetch(ZORT_BASE + "/Product/GetProducts?page=1&limit=10&keyword=" + encodeURIComponent(testSku),
      { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    const json = JSON.parse(getRes.getContentText());
    const list = (json && json.list) ? json.list : [];
    for (const p of list) {
      if (String(p.sku || p.barcode || "").trim().toUpperCase() === testSku.toUpperCase()) {
        tagBack = JSON.stringify(p.tag || p.tags || p.taglist || "(ไม่มี field tag)");
        break;
      }
    }
  } catch (e) { tagBack = "error: " + e; }
  Logger.log("tag ที่อ่านกลับมา: " + tagBack);
  Logger.log(String(tagBack).indexOf(testTag) >= 0
    ? "✅ ZORT รับ tag แบบ array จริง — โค้ด addNewProduct ถูกต้อง"
    : "⚠️ ยังไม่เจอ tag — อาจต้องปรับ field/format (แจ้ง dev พร้อม log ด้านบน)");

  // 3) ลบสินค้าทดสอบทิ้ง
  try {
    const delRes = UrlFetchApp.fetch(ZORT_BASE + "/Product/DeleteProduct", {
      method: "post", headers: headers, muteHttpExceptions: true,
      payload: JSON.stringify({ sku: testSku }),
    });
    Logger.log("DeleteProduct(test) HTTP " + delRes.getResponseCode() + " — " + delRes.getContentText().substring(0, 200));
  } catch (e) { Logger.log("ลบสินค้าทดสอบไม่สำเร็จ (ลบเองใน ZORT: " + testSku + ")"); }
}

// ── ดู/ตรวจ OWNER_PIN ปัจจุบัน (เจ้าของรันเองเพื่อเช็คตอนเข้ารหัสไม่ได้) ──
// เห็นเฉพาะใน Execution log ของคุณเอง — เผยช่องว่างที่มองไม่เห็นที่ทำให้รหัสไม่ตรง
function checkOwnerPin() {
  const raw = PropertiesService.getScriptProperties().getProperty('OWNER_PIN');
  if (raw === null) {
    Logger.log("ยังไม่ได้ตั้ง OWNER_PIN → รหัสเจ้าของคือค่า default: DMJ (ตัวพิมพ์ใหญ่)");
    return;
  }
  Logger.log("OWNER_PIN ปัจจุบัน: [" + raw + "]  (ความยาว " + raw.length + " ตัว)");
  const trimmed = raw.trim();
  if (trimmed !== raw) {
    Logger.log("⚠️ มีช่องว่าง/ขึ้นบรรทัดติดหน้า-หลัง! หลังแก้โค้ด trim แล้วจะพิมพ์ [" + trimmed + "] ได้เลย");
  } else {
    Logger.log("ไม่มีช่องว่างแปลกปลอม — พิมพ์รหัสนี้ให้ตรง (ตัวพิมพ์เล็ก/ใหญ่มีผล)");
  }
}

// ── ตั้ง OWNER_PIN ใหม่ (แก้ NEW_PIN แล้วรันครั้งเดียว) ──
function setOwnerPin() {
  const NEW_PIN = "";  // ← ใส่รหัสใหม่ที่ต้องการ แล้วกด Run
  if (!NEW_PIN) { Logger.log("ยังไม่ได้ใส่ NEW_PIN — แก้บรรทัด NEW_PIN ก่อนรัน"); return; }
  PropertiesService.getScriptProperties().setProperty('OWNER_PIN', NEW_PIN.trim());
  Logger.log("✅ ตั้ง OWNER_PIN ใหม่เป็น [" + NEW_PIN.trim() + "] แล้ว — ลองเข้ารหัสเจ้าของด้วยรหัสนี้");
}

// ── ซื้อสินค้าเข้า/เติมสต็อก: สร้าง Purchase Order จริงใน ZORT → รับของเข้าคลัง ──
// purchase = { supplier, warehousecode, date:"yyyy-MM-dd", items:[{ sku, name, qty, unitPrice }] }
// ZORT AddPurchaseOrder (status="Success") = ใบสั่งซื้อที่รับของแล้ว → ZORT เพิ่มสต็อกให้เอง
//   จึง "ไม่" เรียก IncreaseStock ซ้ำ (กัน double-count) · bump ชีตสต็อก local ให้เห็นทันที
//   (ZORT stock sync รอบหน้าจะ set ทับด้วยค่าจริง = ตรงกัน ถ้า Success เพิ่มสต็อกตามคาด)
// field name ยืนยันจาก GetPurchaseOrders ที่อ่านอยู่แล้ว (symmetric): number/customername/
//   warehousecode/purchaseorderdate(String)/status/list[].sku,name,number,pricepernumber
// error: ถ้า ZORT ปฏิเสธ → ไม่เขียนชีต/ไม่ bump สต็อก (กัน state ค้างครึ่งทาง) เหมือน addNewProduct
function addPurchaseIn(ss, purchase, actor) {
  const supplier = String((purchase && purchase.supplier) || "").trim();
  const wh = (purchase && purchase.warehousecode === WH_FRONTSTORE) ? WH_FRONTSTORE : WH_SAI5;
  const rawItems = (purchase && Array.isArray(purchase.items)) ? purchase.items : [];

  // 1) sanitize + validate: SKU ต้องมีอยู่จริง (ซื้อเข้า = เติมของเดิม ไม่ใช่สร้างใหม่)
  const existing = collectExistingSkus_(ss);
  const items = [];
  for (const it of rawItems) {
    const sku = String((it && it.sku) || "").trim().toUpperCase();
    const qty = Math.floor(Number(it && it.qty) || 0);
    const unitPrice = Math.max(0, Number(it && it.unitPrice) || 0);
    if (!sku || qty <= 0) continue;
    if (!existing[sku]) return error("ไม่พบสินค้า \"" + sku + "\" ในระบบ — ต้องเพิ่มสินค้าใหม่ก่อนจึงซื้อเข้าได้");
    items.push({ sku: sku, name: String((it && it.name) || "").trim(), qty: qty, unitPrice: unitPrice });
  }
  if (items.length === 0) return error("ไม่มีรายการซื้อ — เลือกสินค้าและใส่จำนวนก่อน");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    const tz = "Asia/Bangkok";
    let dateStr = String((purchase && purchase.date) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) dateStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

    // 2) ยิง ZORT AddPurchaseOrder
    const list = items.map(function (it) {
      return {
        sku: it.sku, name: it.name, number: it.qty,
        pricepernumber: it.unitPrice, discount: "0",
        totalprice: it.qty * it.unitPrice,
      };
    });
    const amount = list.reduce(function (s, x) { return s + x.totalprice; }, 0);
    const payload = {
      status: "Success",            // รับของแล้ว → ZORT รับสต็อกเข้าคลังให้
      warehousecode: wh,
      purchaseorderdate: dateStr,
      amount: amount,
      list: list,
    };
    if (supplier) payload.customername = supplier; // ช่องซัพพลายเออร์ (= po.customername ตอนอ่าน)

    const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
    const res = UrlFetchApp.fetch(ZORT_BASE + "/PurchaseOrder/AddPurchaseOrder", {
      method: "post", headers: headers,
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    Logger.log("AddPurchaseOrder: HTTP " + res.getResponseCode() + " — " + res.getContentText().substring(0, 400));
    const zErr = zortRespError_(res);
    if (zErr) {
      logZortFailure_("ซื้อสินค้าเข้า", "SKU: " + items.map(function (i) { return i.sku; }).join(",") + " | " + zErr);
      return error("สร้างใบซื้อใน ZORT ไม่สำเร็จ: " + zErr);
    }
    // เลข PO ที่ ZORT คืน (ถ้ามี) — เผื่อ field name หลายแบบ
    let poNum = "";
    try {
      const j = JSON.parse(res.getContentText());
      poNum = String(j.number || j.purchaseordernumber || j.id || "").trim();
    } catch (e) { /* ignore */ }

    // 3) เขียนชีต "รายการซื้อสินค้า" (คอลัมน์ตาม readPurchases_) → เห็นทันทีไม่ต้องรอ syncZortPurchases
    const purSh = ss.getSheetByName(SHEET_PURCHASES);
    if (purSh) {
      const rows = items.map(function (it) {
        const row = new Array(28).fill("");
        row[1] = "ซื้อเข้า"; row[2] = poNum; row[4] = supplier;
        row[11] = dateStr; row[19] = "สำเร็จ"; row[20] = wh;
        row[24] = it.sku; row[25] = it.name; row[26] = it.qty; row[27] = it.unitPrice;
        return row;
      });
      const startRow = Math.max(purSh.getLastRow() + 1, 3);
      purSh.getRange(startRow, 1, rows.length, 28).setValues(rows);
    }

    // 4) bump สต็อก local ให้เห็นทันที (ZORT sync รอบหน้า set ทับด้วยค่าจริง)
    bumpStockSheet_(ss, items, wh);

    writeAuditLog_(actor || "ไม่ระบุ", "ซื้อสินค้าเข้า",
      items.map(function (i) { return i.sku; }).join(","),
      auditDetail_({ after: { supplier: supplier, wh: wh, poNum: poNum, amount: amount,
        items: items.map(function (i) { return i.sku + "×" + i.qty; }) }, note: "สร้าง PO ZORT + รับเข้าคลัง" }));

    invalidateCache_(); // bump dmj_last_write_ts ให้เครื่องอื่นเห็น
    return ok({ poNum: poNum, count: items.length, amount: amount, warehousecode: wh });
  } finally {
    lock.releaseLock();
  }
}

// ── bump จำนวนในชีตสต็อก (SHEET_PRODUCTS) แบบบวกเพิ่ม ตามคลัง ──
// ให้เห็นทันทีก่อน ZORT stock sync (ซึ่งจะ set ทับด้วยค่า absolute รอบถัดไป)
function bumpStockSheet_(ss, items, wh) {
  const sh = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sh || !items || !items.length) return;
  const col = (wh === WH_FRONTSTORE) ? COL_PROD_QTYFS : COL_PROD_QTYWH; // G=หน้าร้าน · H=คลัง
  const bySku = {};
  items.forEach(function (it) { bySku[it.sku] = (bySku[it.sku] || 0) + it.qty; });
  const values = sh.getDataRange().getValues();
  let changed = false;
  for (let i = 1; i < values.length; i++) {
    const s = String(values[i][COL_PROD_SKU - 1] || "").trim().toUpperCase();
    if (bySku[s] != null) {
      const cur = Number(values[i][col - 1]) || 0;
      sh.getRange(i + 1, col).setValue(cur + bySku[s]);
      changed = true;
    }
  }
  if (changed) SpreadsheetApp.flush();
}

// ── explore: ยิง AddPurchaseOrder ทดสอบ 1 ใบ (เจ้าของรันเองใน editor ครั้งเดียว) ──
// ตรวจ 2 อย่าง: (1) payload ผ่านไหม (2) สต็อกใน ZORT เพิ่มจริงไหมหลัง status="Success"
// กด Run ได้เลย — เลือก SKU ที่มีของอยู่จาก ZORT อัตโนมัติ (ไม่ต้องแก้อะไร)
//   ถ้าอยากทดสอบ SKU เฉพาะ ใส่ตัวแปร TEST_SKU เป็นรหัสจริงแทน "" ได้
function exploreAddPurchaseOrder() {
  let TEST_SKU = ""; // เว้นว่าง = เลือกอัตโนมัติ · ใส่ SKU จริงถ้าอยากเจาะจง
  const TEST_QTY = 1;
  const wh = WH_SAI5;
  const tz = "Asia/Bangkok";

  if (!TEST_SKU) {
    TEST_SKU = pickAnyStockedSku_(wh);
    if (!TEST_SKU) { Logger.log("❌ หา SKU ที่มีของใน ZORT ไม่เจอ — ลองใส่ TEST_SKU เอง"); return; }
    Logger.log("เลือก SKU อัตโนมัติ: " + TEST_SKU);
  }

  const before = fetchZortStockForSku_(TEST_SKU, wh);
  Logger.log("stock ก่อน (" + TEST_SKU + " @ " + wh + "): " + before);

  const payload = {
    status: "Success",
    warehousecode: wh,
    purchaseorderdate: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"),
    amount: TEST_QTY,
    customername: "ทดสอบระบบ (ลบทิ้งได้)",
    list: [{ sku: TEST_SKU, name: "ทดสอบ", number: TEST_QTY, pricepernumber: 1, discount: "0", totalprice: TEST_QTY }],
  };
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
  const res = UrlFetchApp.fetch(ZORT_BASE + "/PurchaseOrder/AddPurchaseOrder", {
    method: "post", headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  Logger.log("AddPurchaseOrder HTTP " + res.getResponseCode());
  Logger.log("response: " + res.getContentText().substring(0, 1000));

  Utilities.sleep(2000);
  const after = fetchZortStockForSku_(TEST_SKU, wh);
  Logger.log("stock หลัง (" + TEST_SKU + " @ " + wh + "): " + after);
  Logger.log(after > before
    ? "✅ status=Success เพิ่มสต็อกจริง (+"+(after-before)+") — โค้ด addPurchaseIn ถูกต้อง ไม่ต้องแก้"
    : "⚠️ สต็อกไม่เพิ่ม — ต้องเพิ่มการเรียก IncreaseProductStockList ใน addPurchaseIn (แจ้ง dev)");
}

// เลือก SKU ที่มีของอยู่ในคลังนี้จาก ZORT อัตโนมัติ (ตัวแรกที่ stock > 0) — ใช้ตอน explore
function pickAnyStockedSku_(wh) {
  try {
    const url = ZORT_BASE + "/Product/GetProducts?page=1&limit=200" +
                (wh ? "&warehousecode=" + encodeURIComponent(wh) : "");
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    const list = (json && json.list) ? json.list : [];
    for (const p of list) {
      const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
      const stock = Number(p.stock || p.availablestock || 0) || 0;
      if (sku && stock > 0) return sku;
    }
    // ไม่มีตัวไหน stock > 0 → เอาตัวแรกที่มี sku ก็ยังทดสอบ payload ได้
    for (const p of list) {
      const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
      if (sku) return sku;
    }
  } catch (e) { Logger.log("pickAnyStockedSku_ error: " + e); }
  return "";
}

// อ่าน stock ปัจจุบันของ SKU เดียวจาก ZORT (targeted keyword) — ใช้ตอน explore
function fetchZortStockForSku_(sku, wh) {
  const clean = String(sku || "").trim().toUpperCase();
  if (!clean) return 0;
  try {
    const url = ZORT_BASE + "/Product/GetProducts?page=1&limit=50&keyword=" + encodeURIComponent(clean) +
                (wh ? "&warehousecode=" + encodeURIComponent(wh) : "");
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    const list = (json && json.list) ? json.list : [];
    for (const p of list) {
      const s = String(p.sku || p.barcode || "").trim().toUpperCase();
      if (s === clean) return Number(p.stock || p.availablestock || 0) || 0;
    }
  } catch (e) { Logger.log("fetchZortStockForSku_ error: " + e); }
  return 0;
}

// ── ดึงรูปเฉพาะ SKU เดียวจาก ZORT (on-demand หลังอัปรูปในแอป ZORT) ──
// targeted fetch ด้วย keyword — ไม่ต้อง fetch ทั้งคลังเหมือน syncZortImages
// เขียนลง col E (ZORT auto) ของชีต imageUrl → readImageMap_ ให้ col E ชนะ manual(D)
function fetchProductImage(ss, sku) {
  const clean = String(sku || "").trim().toUpperCase();
  if (!clean) return error("ไม่มี SKU");
  try {
    // ZORT GetProducts รองรับ keyword filter (ค้นด้วย sku/barcode/ชื่อ) → ดึงหน้าเดียวพอ
    const url = ZORT_BASE + "/Product/GetProducts?page=1&limit=200&keyword=" + encodeURIComponent(clean);
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    let json = null;
    try { json = JSON.parse(res.getContentText()); } catch (e) { json = null; }
    const list = (json && json.list) ? json.list : [];
    let found = null;
    for (const p of list) {
      const s = String(p.sku || p.barcode || "").trim().toUpperCase();
      if (s === clean) { found = p; break; }
    }
    if (!found) return error("ยังไม่พบสินค้านี้ใน ZORT (เพิ่งสร้างอาจต้องรอสักครู่)");
    const img = pickZortImage_(found);
    if (!img) return error("สินค้านี้ยังไม่มีรูปใน ZORT — อัปรูปในแอป ZORT ก่อนแล้วกดใหม่");

    // เขียนลงชีต imageUrl col E (อัปเดตถ้ามี SKU / append ถ้ายังไม่มี)
    const sh = ss.getSheetByName(SHEET_IMAGE_URL);
    if (sh) {
      const rows = sh.getDataRange().getValues();
      let rowNum = 0;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][1] || "").trim().toUpperCase() === clean) { rowNum = i + 1; break; }
      }
      if (rowNum) sh.getRange(rowNum, 5).setValue(img);
      else sh.appendRow(["", clean, String(found.name || ""), "", img]);
      SpreadsheetApp.flush();
    }
    invalidateCache_();
    return ok({ sku: clean, imageUrl: img });
  } catch (e) {
    return error("ดึงรูปไม่สำเร็จ: " + e.toString());
  }
}

function syncZortWarehouse() {
  syncZortToColumn_(WH_SAI5, COL_PROD_QTYWH);
}

function syncZortFrontStore() {
  syncZortToColumn_(WH_FRONTSTORE, COL_PROD_QTYFS);
}

// ── DIAGNOSTIC (read-only) ────────────────────────────────────────────────
// ตรวจว่าเลขหน้าร้าน (col G) ไม่ตรงกับ ZORT เพราะ sync ดึง `availablestock`
// (= stock - reserved) แต่หน้าจอ ZORT โชว์ `stock` (on-hand จริง) หรือไม่
// รันเองใน GAS editor แล้วดู Log — ไม่เขียนทับข้อมูลใดๆ
// ดู 20 SKU ที่ stock != availablestock มากสุด เพื่อเทียบกับหน้าจอ ZORT
function debugZortFrontStoreStock() {
  const products = fetchAllZortProducts_(WH_FRONTSTORE);
  Logger.log(`ZORT WH_FRONTSTORE (${WH_FRONTSTORE}): ${products.length} items`);

  // อ่าน col G ปัจจุบันจากชีต เพื่อเทียบ 3 ทาง: sheet(G) vs available vs stock
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  const sheetG = {};
  if (sheet) {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const sku = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
      if (sku) sheetG[sku] = Number(data[i][COL_PROD_QTYFS - 1]) || 0;
    }
  }

  const rows = [];
  let bothMissing = 0;
  for (const p of products) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (!sku) continue;
    const stock = (p.stock != null) ? Number(p.stock) : null;
    const avail = (p.availablestock != null) ? Number(p.availablestock) : null;
    if (stock == null && avail == null) { bothMissing++; continue; }
    rows.push({
      sku,
      name: String(p.name || "").slice(0, 24),
      stock,
      avail,
      diff: (stock != null && avail != null) ? (stock - avail) : null,
      sheetG: (sheetG[sku] != null) ? sheetG[sku] : "-",
    });
  }

  // มี field `stock` หรือไม่ (บาง response อาจไม่มี)
  const hasStock = rows.some(r => r.stock != null);
  const hasAvail = rows.some(r => r.avail != null);
  Logger.log(`มี field stock=${hasStock} | availablestock=${hasAvail} | ทั้งคู่หาย=${bothMissing} rows`);

  const mismatched = rows.filter(r => r.diff != null && r.diff !== 0);
  Logger.log(`SKU ที่ stock != availablestock: ${mismatched.length} / ${rows.length}`);

  mismatched.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  Logger.log("── Top 20 (diff = stock - available = จำนวนที่ถูกจอง/reserved) ──");
  Logger.log("SKU | ชื่อ | stock(onhand) | available | diff | col_G(ตอนนี้)");
  mismatched.slice(0, 20).forEach(r => {
    Logger.log(`${r.sku} | ${r.name} | ${r.stock} | ${r.avail} | ${r.diff} | ${r.sheetG}`);
  });
  Logger.log("สรุป: ถ้า col_G ≈ available แต่หน้าจอ ZORT ≈ stock → ต้องสลับ sync ไปใช้ p.stock");
}

// ── HEALTH (read-only) ────────────────────────────────────────────────────
// สัญญาณสุขภาพระบบ — ใช้ทั้ง endpoint ?action=selfcheck และ checkSystemHealth() (alert)
function computeHealth_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  var metaSh  = ss.getSheetByName(SHEET_PRODUCT_META);
  var h = {
    ts: new Date().toISOString(),
    productsTotal: 0,
    frontStoreZero: 0, frontStorePositive: 0,
    warehouseZero: 0, warehousePositive: 0,
    negativeStore: 0, negativeWH: 0,
    orphanCount: 0,           // มีในชีตสต็อกแต่ไม่มีใน "ข้อมูลสินค้า"
    ordersPending: 0, shipmentsPending: 0,
  };

  var metaSet = {};
  if (metaSh) {
    var mrows = metaSh.getDataRange().getDisplayValues();
    for (var mi = 1; mi < mrows.length; mi++) {
      var ms = String(mrows[mi][COL_PROD_SKU - 1] || '').trim().toUpperCase();
      if (ms) metaSet[ms] = true;
    }
  }
  if (stockSh) {
    var rows = stockSh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      var sku = String(rows[i][COL_PROD_SKU - 1] || '').trim().toUpperCase();
      if (!sku) continue;
      h.productsTotal++;
      var g  = Number(rows[i][COL_PROD_QTYFS - 1]) || 0;  // col G หน้าร้าน
      var wh = Number(rows[i][COL_PROD_QTYWH - 1]) || 0;  // col H คลัง
      if (g  > 0) h.frontStorePositive++; else h.frontStoreZero++;
      if (wh > 0) h.warehousePositive++;  else h.warehouseZero++;
      if (g  < 0) h.negativeStore++;
      if (wh < 0) h.negativeWH++;
      if (!metaSet[sku]) h.orphanCount++;
    }
  }
  try { h.ordersPending = readOrders_().filter(function(o){ return o.status === 'รอ'; }).length; } catch (e) {}
  try { h.shipmentsPending = readShipments_().filter(function(s){ return !s.receivedAt; }).length; } catch (e) {}
  return h;
}

// ── ANOMALY ALERT — ตั้ง time-driven trigger เองใน GAS editor (เช่น ทุก 1 ชม.) ─────
// เตือน LINE เมื่อ: หน้าร้าน/คลังเป็น 0 พุ่งขึ้นผิดปกติ (เทียบครั้งก่อน) หรือมีสต็อกติดลบ
// ปรับ/ปิดได้ผ่าน Script Property: HEALTH_ALERT_DISABLED, HEALTH_ZERO_JUMP
function checkSystemHealth() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('HEALTH_ALERT_DISABLED') === 'true') return;
  var h = computeHealth_();
  var jump = parseInt(props.getProperty('HEALTH_ZERO_JUMP') || '30', 10);
  var prev = {};
  try { prev = JSON.parse(props.getProperty('HEALTH_LAST') || '{}'); } catch (e) {}

  var alerts = [];
  if (prev.frontStoreZero != null && (h.frontStoreZero - prev.frontStoreZero) >= jump) {
    alerts.push('หน้าร้านเป็น 0 เพิ่มขึ้น ' + (h.frontStoreZero - prev.frontStoreZero) +
                ' รายการ (รวม ' + h.frontStoreZero + '/' + h.productsTotal + ')');
  }
  if (prev.warehouseZero != null && (h.warehouseZero - prev.warehouseZero) >= jump) {
    alerts.push('คลังเป็น 0 เพิ่มขึ้น ' + (h.warehouseZero - prev.warehouseZero) +
                ' รายการ (รวม ' + h.warehouseZero + '/' + h.productsTotal + ')');
  }
  if ((h.negativeStore + h.negativeWH) > 0) {
    alerts.push('สต็อกติดลบ: หน้าร้าน ' + h.negativeStore + ' / คลัง ' + h.negativeWH + ' รายการ');
  }

  if (alerts.length) {
    try { enqueueNoti_({ channel: 'secondary', priority: 2, type: 'text',
      payload: { text: '🩺 ตรวจสุขภาพระบบ พบผิดปกติ:\n- ' + alerts.join('\n- ') } }); } catch (e) {}
  }
  props.setProperty('HEALTH_LAST', JSON.stringify({
    frontStoreZero: h.frontStoreZero, warehouseZero: h.warehouseZero, ts: h.ts
  }));
  Logger.log('checkSystemHealth: ' + JSON.stringify(h) + ' | alerts=' + alerts.length);
}

// ── DIAGNOSTIC (read-only) ────────────────────────────────────────────────
// สินค้าที่อยู่ใน "อัพเดทจำนวนสินค้า" (มีจำนวน/สต็อก) แต่ไม่มีใน "ข้อมูลสินค้า"
// (แหล่งของ data.products) → จะ"ไม่ขึ้นบนเว็บ" เพราะไม่มีแถวสินค้าให้แปะจำนวน
// สาเหตุพบบ่อย: syncNewProductsFromZort() เพิ่มสินค้าใหม่เข้าแค่ "อัพเดทจำนวนสินค้า"
// รันเองใน GAS editor แล้วดู Log — ไม่เขียนทับข้อมูลใดๆ
function debugMissingProducts() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const metaSh = ss.getSheetByName(SHEET_PRODUCT_META);  // "ข้อมูลสินค้า" = แหล่ง data.products
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);      // "อัพเดทจำนวนสินค้า" = จำนวน
  if (!metaSh || !stockSh) { Logger.log("ไม่พบชีต meta หรือ stock"); return; }

  const metaRows = metaSh.getDataRange().getDisplayValues();
  const metaSet = {};
  for (let i = 1; i < metaRows.length; i++) {
    const sku = String(metaRows[i][COL_PROD_SKU - 1] || "").trim().toUpperCase();
    if (sku) metaSet[sku] = true;
  }

  const stockRows = stockSh.getDataRange().getDisplayValues();
  const orphans = [];
  for (let i = 1; i < stockRows.length; i++) {
    const r = stockRows[i];
    const sku = String(r[COL_PROD_SKU - 1] || "").trim().toUpperCase();
    if (!sku) continue;
    if (!metaSet[sku]) {
      orphans.push({
        sku,
        name:  String(r[2] || "").trim(),                       // col C
        gStore: Number(r[COL_PROD_QTYFS - 1]) || 0,             // col G
        hWH:    Number(r[COL_PROD_QTYWH - 1]) || 0,             // col H
      });
    }
  }

  Logger.log(`สินค้าใน "อัพเดทจำนวนสินค้า" ทั้งหมด (มี SKU): เทียบกับ "ข้อมูลสินค้า"`);
  Logger.log(`── พบ orphan (มีจำนวนแต่ไม่ขึ้นเว็บ): ${orphans.length} SKU ──`);
  Logger.log("SKU | ชื่อ | หน้าร้าน(G) | คลัง(H)");
  orphans.forEach(o => Logger.log(`${o.sku} | ${o.name} | ${o.gStore} | ${o.hWH}`));
  Logger.log(`สรุป: ต้องเพิ่ม ${orphans.length} SKU นี้เข้าชีต "ข้อมูลสินค้า" ถึงจะขึ้นเว็บ`);
}

// ── DIAGNOSTIC (read-only) ────────────────────────────────────────────────
// หา SKU ใน ZORT ที่ขึ้นต้นด้วย prefix ที่กำหนด (default "WL") แต่ยังไม่เข้าชีตเราเลย
// (ทั้ง "อัพเดทจำนวนสินค้า" และ "ข้อมูลสินค้า") ต่างจาก debugMissingProducts ที่เทียบแค่
// 2 ชีตของเรากันเอง — ตัวนี้ดึงจาก ZORT ตรงๆ เพื่อจับเคสสินค้าที่ syncNewProductsFromZort
// ไม่เคยเห็น (เช่น ถ้าอยู่คลังอื่นที่ไม่ใช่ WH_SAI5/WH_FRONTSTORE — fetchAllZortProducts_
// ที่ filter ด้วย warehousecode จะไม่มีวันดึงมาเจอ)
// ⚠️ ทดสอบแล้วพบว่า GetProducts `keyword=` **ไม่ได้ prefix/substring-match กับ sku** —
// keyword="WL" คืน 0 รายการทั้งที่มีสินค้า WL จริงในระบบ (คงค้นแค่ name/exact) จึงเปลี่ยนมา
// ดึง**สินค้าทั้งหมด** (ไม่ใส่ keyword, ไม่กรอง warehousecode) แล้วกรอง sku.startsWith เอง
// ฝั่ง client แทน — ช้ากว่าแต่ชัวร์กว่า
// รันเองใน GAS editor แล้วดู Log — ไม่เขียนทับข้อมูลใดๆ
function debugFindMissingSkusByPrefix(prefix) {
  const pfx = String(prefix || "WL").trim().toUpperCase();
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // เช็คแยกทีละชีต (ไม่ใช้ collectExistingSkus_ รวม) เพื่อรู้ว่าอยู่ชีตไหนบ้าง
  const metaSh  = ss.getSheetByName(SHEET_PRODUCT_META);
  const stockSh = ss.getSheetByName(SHEET_PRODUCTS);
  const metaRows  = metaSh  ? metaSh.getDataRange().getDisplayValues()  : [];
  const stockRows = stockSh ? stockSh.getDataRange().getDisplayValues() : [];

  const metaMap = {};   // sku -> row data
  for (let i = 1; i < metaRows.length; i++) {
    const sku = String(metaRows[i][1] || "").trim().toUpperCase();  // B
    if (sku) metaMap[sku] = { name: metaRows[i][2] || "" };
  }
  const stockMap = {};
  for (let i = 1; i < stockRows.length; i++) {
    const sku = String(stockRows[i][COL_PROD_SKU - 1] || "").trim().toUpperCase();
    if (sku) stockMap[sku] = {
      name: stockRows[i][2] || "",
      qtyStore: Number(stockRows[i][COL_PROD_QTYFS - 1]) || 0,
      qtyWH: Number(stockRows[i][COL_PROD_QTYWH - 1]) || 0,
    };
  }

  const allProducts = fetchAllZortProducts_();  // ไม่กรอง warehousecode = ทั้งบัญชี ZORT
  Logger.log(`ZORT: ดึงสินค้าทั้งหมด ${allProducts.length} รายการ (ทุกคลัง)`);

  const found = {};
  for (const p of allProducts) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (sku && sku.startsWith(pfx) && !found[sku]) {
      found[sku] = { sku, name: p.name || "", stock: Number(p.stock || p.availablestock || 0) || 0 };
    }
  }
  const foundList = Object.values(found);
  Logger.log(`ZORT: พบ SKU ขึ้นต้นด้วย "${pfx}" ทั้งหมด ${foundList.length} ตัว`);
  Logger.log("SKU | ชื่อ(ZORT) | stockZORT | อยู่ในชีต\"ข้อมูลสินค้า\"? | อยู่ในชีต\"อัพเดทจำนวนสินค้า\"?(qtyStore/qtyWH)");
  foundList.forEach(p => {
    const inMeta  = !!metaMap[p.sku];
    const inStock = !!stockMap[p.sku];
    const stockInfo = inStock ? `qtyStore=${stockMap[p.sku].qtyStore},qtyWH=${stockMap[p.sku].qtyWH}` : "-";
    Logger.log(`${p.sku} | ${p.name} | ${p.stock} | ${inMeta ? "✅" : "❌ ไม่มี"} | ${inStock ? "✅ "+stockInfo : "❌ ไม่มี"}`);
  });

  // จำลอง path จริงที่ frontend ใช้ (readProducts_ = ตัวสร้าง data.products) เช็คว่าจริงๆ
  // แล้ว SKU พวกนี้โผล่ในผลลัพธ์ที่ส่งให้เว็บหรือไม่ (ครอบคลุม self-heal ด้วย)
  try {
    const dataProducts = readProducts_();
    const dpMap = {};
    dataProducts.forEach(p => { if (p.sku) dpMap[p.sku.toUpperCase()] = p; });
    Logger.log(`── เช็คใน readProducts_() (path จริงที่เว็บใช้) ──`);
    foundList.forEach(p => {
      const dp = dpMap[p.sku];
      Logger.log(dp
        ? `${p.sku}: ✅ อยู่ใน data.products (name="${dp.name}", qty=${dp.qty}, category="${dp.category}", fromStockSheet=${!!dp._fromStockSheet})`
        : `${p.sku}: ❌ ไม่อยู่ใน data.products เลย — จุดนี้แหละที่หายจากเว็บ`);
    });
  } catch (e) {
    Logger.log("readProducts_() error: " + e);
  }
}

function syncZortBoth() {
  // PERF: fetch แต่ละ warehouse ครั้งเดียว แล้วส่ง cached products ให้ sub-functions
  // เพื่อลดจำนวน ZORT API calls จาก 4+ ครั้ง → 2 ครั้ง (WH_SAI5 + WH_FRONTSTORE)
  Logger.log("syncZortBoth: fetching products from ZORT (WH_SAI5)...");
  const productsWH = fetchAllZortProducts_(WH_SAI5);
  Logger.log("syncZortBoth: fetching products from ZORT (WH_FRONTSTORE)...");
  const productsFS = fetchAllZortProducts_(WH_FRONTSTORE);

  syncNewProductsFromZort(productsWH, productsFS);
  syncZortToColumn_(WH_SAI5, COL_PROD_QTYWH, productsWH);
  syncZortToColumn_(WH_FRONTSTORE, COL_PROD_QTYFS, productsFS);
  try { syncZortPurchases(); } catch(e) { Logger.log("syncZortPurchases error: " + e); }
  try { syncZortImages(); } catch(e) { Logger.log("syncZortImages error: " + e); }

  // ── 2A: Low-stock alert ──────────────────────────────────────────────────
  // สแกนสต็อกคลัง (col H) เทียบ threshold → ส่ง LINE ถ้าพบสินค้าใกล้หมด
  var lowStockItems = [];
  try {
    var props = PropertiesService.getScriptProperties();
    var threshold = parseInt(props.getProperty('LOW_STOCK_THRESHOLD') || '5');
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var prodSh = ss.getSheetByName(SHEET_PRODUCTS);
    if (prodSh) {
      var prodRows = prodSh.getDataRange().getDisplayValues();
      // header row อยู่ที่ index 0 (แถว 1) — เริ่มอ่านข้อมูลจาก index 1
      // layout: B(1)=SKU, C(2)=ชื่อ, G(6)=หน้าร้าน, H(7)=คลัง  (0-indexed)
      var scanned = 0;
      for (var i = 1; i < prodRows.length; i++) {
        var r = prodRows[i];
        var sku  = (r[1] || '').toString().trim();
        var name = (r[2] || '').toString().trim();
        if (!sku) continue;
        scanned++;
        var qtyWH = parseInt(r[7]) || 0;
        if (qtyWH < threshold) {
          lowStockItems.push({ sku: sku, name: name, qty: qtyWH });
        }
      }

      if (lowStockItems.length > 0) {
        // ส่งได้แค่ 1 ครั้ง/วัน — กัน spam ทุก 2 ชม. (12 ครั้ง/วัน เกิน LINE limit 200/เดือน)
        var todayKey = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd');
        var lastSentKey = props.getProperty('LOW_STOCK_LAST_SENT_DATE') || '';
        if (lastSentKey !== todayKey) {
          var dateStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
          var lines = ['🚨 สต็อกใกล้หมด — ' + dateStr];
          for (var j = 0; j < lowStockItems.length; j++) {
            var it = lowStockItems[j];
            lines.push('• ' + (it.name || it.sku) + ' (' + it.sku + '): เหลือ ' + it.qty + ' ใน WH');
          }
          lines.push('📊 สแกน ' + scanned + ' รายการ พบ ' + lowStockItems.length + ' รายการต่ำกว่าเกณฑ์ (threshold=' + threshold + ')');
          sendLineMessage_(lines.join('\n'));
          props.setProperty('LOW_STOCK_LAST_SENT_DATE', todayKey);
          Logger.log('Low-stock LINE sent: ' + lowStockItems.length + ' รายการ');
        } else {
          Logger.log('Low-stock: already sent today (' + todayKey + ') — skip LINE');
        }
        // กระดิ่งในแอปยิงได้ทุกวันโดยไม่ต้องกลัว quota — dedupKey ผูกวันที่
        // จึงยังคงเป็น 1 ครั้ง/วัน แม้ตัวเช็คจะรันทุก 2 ชม.
        pushInappNoti_({
          audience: 'role:owner,warehouse',
          type: 'stock', tab: 'stock',
          dedupKey: 'lowstock-' + todayKey,
          title: '🚨 สต็อกใกล้หมด ' + lowStockItems.length + ' รายการ',
          body: lowStockItems.slice(0, 3).map(function (it) {
                  return (it.name || it.sku) + ' เหลือ ' + it.qty;
                }).join(', ')
                + (lowStockItems.length > 3 ? ' และอีก ' + (lowStockItems.length - 3) + ' รายการ' : ''),
        });
      } else {
        Logger.log('Low-stock check: ไม่พบสินค้าต่ำกว่าเกณฑ์ (threshold=' + threshold + ', สแกน ' + scanned + ')');
      }
    }
  } catch (e) {
    Logger.log('Low-stock alert error: ' + e);
  }

  // หมายเหตุ: "สรุปเช้าวันนี้" (daily summary) ถูกย้ายออกไปเป็นฟังก์ชัน
  //   sendDailyMorningSummary แล้ว — เดิมฝังตรงนี้ทำให้ส่ง LINE ทุกรอบ sync (ทุก 2 ชม. = ~12 ครั้ง/วัน)
  //   ตอนนี้ syncZortBoth เหลือเฉพาะ low-stock alert (2A) เท่านั้น
  invalidateCache_();
}

// ── Daily morning summary (สรุปเช้าวันนี้) ───────────────────────────────────
// แยกออกจาก syncZortBoth เพื่อให้ส่งวันละครั้ง (ไม่ spam ทุก 2 ชม.)
// ตั้ง trigger ด้วย setupDailySummaryTrigger (รันเช้าครั้งเดียว)
// ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown ของ GAS editor ให้รัน/ทดสอบเองได้
function sendDailyMorningSummary() {
  try {
    var ss2 = SpreadsheetApp.openById(SHEET_ID);
    var dateStr2 = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');

    // นับ orders ค้าง — status (col C, index 2) ยังไม่ใช่ "ส่งแล้ว" หรือ "จัดแล้ว"
    var pendingOrders = 0;
    var ordSh = ss2.getSheetByName(SHEET_ORDERS);
    if (ordSh) {
      var ordRows = ordSh.getDataRange().getValues();
      for (var oi = 1; oi < ordRows.length; oi++) {
        var st = (ordRows[oi][COL_ORD_STATUS - 1] || '').toString().trim();
        if (st !== 'ส่งแล้ว' && st !== 'จัดแล้ว' && st !== '') {
          pendingOrders++;
        }
      }
    }

    // นับงาน MTO ที่ status = "กำลังจัด" (col 6 = index 6, 0-indexed จาก header: JobID,วันที่,ชื่องาน,ลูกค้า,ราคา,รูป,สถานะ)
    var mtoActive = 0;
    var mtoSh = ss2.getSheetByName(SHEET_MTO_JOBS);
    if (mtoSh) {
      var mtoRows = mtoSh.getDataRange().getValues();
      for (var mi = 1; mi < mtoRows.length; mi++) {
        if ((mtoRows[mi][6] || '').toString().trim() === 'กำลังจัด') {
          mtoActive++;
        }
      }
    }

    // Top 3 สินค้าใกล้หมด — สแกนสต็อกคลัง (col H) เทียบ threshold เอง (self-contained)
    var threshold = parseInt(PropertiesService.getScriptProperties().getProperty('LOW_STOCK_THRESHOLD') || '5');
    var lowStockItems = [];
    var prodSh = ss2.getSheetByName(SHEET_PRODUCTS);
    if (prodSh) {
      var prodRows = prodSh.getDataRange().getDisplayValues();
      for (var pi = 1; pi < prodRows.length; pi++) {
        var pr = prodRows[pi];
        var psku = (pr[1] || '').toString().trim();
        if (!psku) continue;
        var pqty = parseInt(pr[7]) || 0; // col H = index 7 (0-indexed) = คลัง
        if (pqty < threshold) lowStockItems.push({ sku: psku, name: (pr[2] || '').toString().trim(), qty: pqty });
      }
    }
    var top3 = lowStockItems.slice().sort(function(a, b) { return a.qty - b.qty; }).slice(0, 3);

    // ส่งเฉพาะวันที่มีเรื่องแจ้ง (ประหยัด LINE quota — ปกติดีไม่ต้องรบกวน)
    if (pendingOrders === 0 && mtoActive === 0 && top3.length === 0) {
      Logger.log('Daily summary: ทุกอย่างปกติ ไม่มีเรื่องแจ้ง — skip LINE');
      return;
    }

    var sumLines = [
      '📋 สรุปเช้าวันนี้ — ' + dateStr2,
      '📦 Orders ค้าง: ' + pendingOrders + ' รายการ',
      '🎁 งานจัดพิเศษ: ' + mtoActive + ' งาน (กำลังจัด)'
    ];
    if (top3.length > 0) {
      sumLines.push('⚠️ สต็อกใกล้หมด top 3:');
      for (var ti = 0; ti < top3.length; ti++) {
        var tp = top3[ti];
        sumLines.push('  • ' + (tp.name || tp.sku) + ' (' + tp.sku + '): ' + tp.qty + ' ใน WH');
      }
    }
    sendLineMessage_(sumLines.join('\n'));
    Logger.log('Daily summary LINE sent');
  } catch (e) {
    Logger.log('Daily summary error: ' + e);
  }
}

function setupZortStockTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncZortBoth") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncZortBoth").timeBased().everyHours(2).create();
  Logger.log("✅ ตั้ง trigger: syncZortBoth ทุก 2 ชั่วโมง");
}

// ตั้ง trigger ส่ง "สรุปเช้าวันนี้" วันละครั้ง (ทุกวัน 08:00 เขตเวลา GAS)
// รันฟังก์ชันนี้เองครั้งเดียวใน GAS editor เพื่อสร้าง trigger
// เลิกใช้สรุป "รายวัน" แล้ว — เปลี่ยนเป็นรายสัปดาห์ + รายเดือน (ลด quota LINE)
// รันฟังก์ชันนี้เพื่อ "ลบ" trigger รายวันเดิมออก (ไม่สร้างใหม่)
function setupDailySummaryTrigger() {
  removeTriggersByName_("sendDailyMorningSummary");
  Logger.log("🗑️ ลบ trigger สรุปรายวันแล้ว — ใช้ sendWeeklySummary / sendMonthlySummary แทน");
}

// ── สรุปรายสัปดาห์ (จันทร์ 08:00) → ช่องทาง secondary ──
// สภาพงานสัปดาห์: orders ค้าง, MTO กำลังจัด, สต็อกใกล้หมด + ยอดขาย 7 วันล่าสุด (ถ้ามี)
function sendWeeklySummary() {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var dateStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');

    var pendingOrders = 0;
    var ordSh = ss.getSheetByName(SHEET_ORDERS);
    if (ordSh) {
      var ordRows = ordSh.getDataRange().getValues();
      for (var oi = 1; oi < ordRows.length; oi++) {
        var st = (ordRows[oi][COL_ORD_STATUS - 1] || '').toString().trim();
        if (st !== 'ส่งแล้ว' && st !== 'จัดแล้ว' && st !== '') pendingOrders++;
      }
    }

    var mtoActive = 0;
    var mtoSh = ss.getSheetByName(SHEET_MTO_JOBS);
    if (mtoSh) {
      var mtoRows = mtoSh.getDataRange().getValues();
      for (var mi = 1; mi < mtoRows.length; mi++) {
        if ((mtoRows[mi][6] || '').toString().trim() === 'กำลังจัด') mtoActive++;
      }
    }

    // นับสต็อกใกล้หมด (คลัง < threshold)
    var threshold = parseInt(PropertiesService.getScriptProperties().getProperty('LOW_STOCK_THRESHOLD') || '5', 10);
    var lowCount = 0;
    var prodSh = ss.getSheetByName(SHEET_PRODUCTS);
    if (prodSh) {
      var prodRows = prodSh.getDataRange().getDisplayValues();
      for (var pi = 2; pi < prodRows.length; pi++) {
        if (!(prodRows[pi][1] || '').toString().trim()) continue;
        if ((parseInt(prodRows[pi][7]) || 0) < threshold) lowCount++;
      }
    }

    // ยอดขาย 7 วันล่าสุดจากชีตยอดขายรายวัน (best-effort)
    var weekQty = 0, weekRev = 0;
    try {
      var ds = readDailySales_();
      var last7 = ds.dayLabels.slice(-7);
      last7.forEach(function(dk) {
        var byCat = ds.dailyByCat[dk] || {};
        Object.keys(byCat).forEach(function(c){ weekQty += byCat[c].qty || 0; weekRev += byCat[c].sales || 0; });
      });
    } catch (e) {}

    var lines = ['📅 สรุปสัปดาห์ — ' + dateStr,
                 '📦 Orders ค้าง: ' + pendingOrders + ' รายการ',
                 '🎁 งานจัดพิเศษกำลังจัด: ' + mtoActive + ' งาน',
                 '⚠️ สต็อกใกล้หมด: ' + lowCount + ' รายการ'];
    if (weekQty > 0 || weekRev > 0) {
      lines.push('💰 ยอดขาย 7 วัน: ' + weekQty.toLocaleString() + ' ชิ้น / ' + Math.round(weekRev).toLocaleString() + ' บาท');
    }
    lines.push('👉 https://dmj-inventory-dashboard.pages.dev');

    enqueueNoti_({ channel: 'secondary', priority: 5, type: 'text', target: 'user',
      dedupKey: 'weekly:' + dateStr, payload: { text: lines.join('\n') } });
    Logger.log('sendWeeklySummary: enqueued');
  } catch (e) { Logger.log('sendWeeklySummary error: ' + e); }
}

// ── สรุปรายเดือน (วันที่ 1 เวลา 08:00) → ช่องทาง secondary ──
// ยอดขายเดือนล่าสุด + top 3 หมวด จากชีตยอดขายรายเดือน
function sendMonthlySummary() {
  try {
    var dateStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
    var ms = readMonthlySales_();
    var lastKey = ms.monthLabels.length ? ms.monthLabels[ms.monthLabels.length - 1] : '';
    var lines = ['🗓️ สรุปรายเดือน — ' + dateStr];

    if (lastKey && ms.monthlyByCat[lastKey]) {
      var byCat = ms.monthlyByCat[lastKey];
      var cats = Object.keys(byCat).map(function(c){ return { cat: c, qty: byCat[c].qty || 0, sales: byCat[c].sales || 0 }; });
      var totQty = cats.reduce(function(s, x){ return s + x.qty; }, 0);
      var totRev = cats.reduce(function(s, x){ return s + x.sales; }, 0);
      lines.push('📊 เดือน ' + lastKey);
      lines.push('💰 ยอดขายรวม: ' + totQty.toLocaleString() + ' ชิ้น / ' + Math.round(totRev).toLocaleString() + ' บาท');
      cats.sort(function(a, b){ return b.sales - a.sales; });
      var top = cats.slice(0, 3);
      if (top.length) {
        lines.push('🏆 หมวดขายดี:');
        top.forEach(function(x, idx){ lines.push('  ' + (idx + 1) + '. ' + x.cat + ' — ' + Math.round(x.sales).toLocaleString() + ' บาท'); });
      }
    } else {
      lines.push('(ยังไม่มีข้อมูลยอดขายรายเดือน)');
    }
    lines.push('👉 https://dmj-inventory-dashboard.pages.dev');

    enqueueNoti_({ channel: 'secondary', priority: 5, type: 'text', target: 'user',
      dedupKey: 'monthly:' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMM'), payload: { text: lines.join('\n') } });
    Logger.log('sendMonthlySummary: enqueued');
  } catch (e) { Logger.log('sendMonthlySummary error: ' + e); }
}

// ══════════════════════════════════════════════════════════════════════════
// setupNotiSystem() — เปิดใช้ระบบคิวแจ้งเตือน v2 ครบชุด (รันเอง 1 ครั้งใน GAS editor)
// ──────────────────────────────────────────────────────────────────────────
// ทำ 4 อย่าง:
//   1) เปิด flag NOTI_QUEUE_ENABLED = 'true' (enqueueNoti_ เริ่มเข้าคิวแทนส่งตรง)
//   2) ตั้ง trigger drainNotiQueue ทุก 1 นาที (ตัวปล่อยคิว)
//   3) ตั้ง trigger สรุปรายสัปดาห์ (จันทร์ 08:00) + รายเดือน (ทุกวันที่ 1, 08:00)
//   4) ลบ trigger สรุปรายวันเดิม
// ปลอดภัย: รันซ้ำได้ (ลบ trigger ชื่อเดิมก่อนสร้างใหม่ทุกครั้ง)
// หมายเหตุ: ช่องทางที่ 2 จะทำงานเมื่อเจ้าของตั้ง Script Property LINE_ACCESS_TOKEN_2
//   (+ LINE_GROUP_ID_2 ถ้าอยากแยกกลุ่ม) — ถ้าไม่ตั้ง secondary จะ fallback ใช้ token หลัก
function setupNotiSystem() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('NOTI_QUEUE_ENABLED', 'true');

  removeTriggersByName_("drainNotiQueue");
  ScriptApp.newTrigger("drainNotiQueue").timeBased().everyMinutes(1).create();

  removeTriggersByName_("sendWeeklySummary");
  ScriptApp.newTrigger("sendWeeklySummary").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();

  removeTriggersByName_("sendMonthlySummary");
  ScriptApp.newTrigger("sendMonthlySummary").timeBased().onMonthDay(1).atHour(8).create();

  removeTriggersByName_("sendDailyMorningSummary");   // เลิกสรุปรายวัน

  Logger.log("✅ setupNotiSystem: เปิดคิว + drain ทุก 1 นาที + สรุปสัปดาห์(จ.) + เดือน(วันที่1) + ลบสรุปรายวัน");
  Logger.log("   secondary channel: " + (LINE_ACCESS_TOKEN_2 ? "พร้อม (มี LINE_ACCESS_TOKEN_2)" : "ยังไม่ตั้ง → fallback ใช้ช่องทางหลัก"));
}

// ══════════════════════════════════════════════════════════════════════════
// checkSystemStatus() — เช็คว่าอะไรตั้งไว้แล้ว/ยังต้องรันอะไร (รันเมื่อไหร่ก็ได้ ไม่แก้อะไรเลย)
// ──────────────────────────────────────────────────────────────────────────
// รันแล้วดูผลที่ Execution log — บอก 3 อย่าง: ระบบคิวเปิดหรือยัง, trigger ครบไหม,
// และเวลาตัดรอบแจ้งเตือน order ปัจจุบัน · ปลอดภัย 100% เป็น read-only
function checkSystemStatus() {
  var props = PropertiesService.getScriptProperties();
  var on = props.getProperty('NOTI_QUEUE_ENABLED') === 'true';
  var trg = {};
  ScriptApp.getProjectTriggers().forEach(function(t) { trg[t.getHandlerFunction()] = true; });
  var need = [];

  Logger.log("═══ สถานะระบบ DMJ ═══");
  Logger.log("ระบบคิวแจ้งเตือน: " + (on ? "✅ เปิดอยู่" : "❌ ปิดอยู่ (ส่งตรงทุกใบแบบเดิม)"));
  if (!on) need.push("setupNotiSystem()  → เปิดคิว + รอบสรุป 16:00");

  var cut = notiOrderCutoffHour_();
  Logger.log("เวลาตัดรอบ order: " + (cut >= 0 && cut <= 23
    ? (cut + ":00 น. (สั่งก่อนเวลานี้รวมส่งทีเดียว · หลังเวลานี้ส่งทันที)")
    : "ปิด → ใช้หน้าต่างรวม " + notiOrderBatchWindowMin_('primary') + " นาที"));
  Logger.log("quota เดือนนี้ (primary): " + notiQuotaUsed_('primary') +
             " / " + (parseInt(props.getProperty('NOTI_MONTHLY_CAP') || '200', 10) || 200));

  Logger.log("── trigger ──");
  [["drainNotiQueue", "ปล่อยคิวแจ้งเตือน (ทุก 1 นาที)", "setupNotiSystem()"],
   ["archiveReceivedShipments", "เก็บกวาดของที่รับแล้ว (ทุกวัน 03:00)", "setupShipmentArchiveTrigger()"],
   ["sweepEmptyShelfLocations", "นำสินค้าออกจากชั้นเมื่อคลัง=0 (จันทร์ 05:00)", "setupShelfSweepTrigger()"],
   ["dailyAttendanceMaintenance", "ดูแลข้อมูลลงเวลา (ทุกวัน 22:00)", "setupAttendanceMaintenance()"]
  ].forEach(function(x) {
    Logger.log((trg[x[0]] ? "  ✅ " : "  ❌ ") + x[0] + " — " + x[1]);
    if (!trg[x[0]]) need.push(x[2] + "  → " + x[1]);
  });

  Logger.log("═══ สรุป ═══");
  if (!need.length) Logger.log("🎉 ครบแล้ว ไม่ต้องรันอะไรเพิ่ม");
  else need.forEach(function(s, i) { Logger.log((i + 1) + ") รัน " + s); });
}

// ปิดระบบคิว (กลับไปส่งตรงแบบเดิม) + ลบ trigger drain — เผื่ออยาก rollback
function disableNotiSystem() {
  PropertiesService.getScriptProperties().setProperty('NOTI_QUEUE_ENABLED', 'false');
  removeTriggersByName_("drainNotiQueue");
  Logger.log("⏸️ disableNotiSystem: ปิดคิว (ส่งตรงแบบเดิม) + ลบ trigger drain");
}

// ══════════════════════════════════════════════════════════════════════════
// นำสินค้าออกจากชั้นวางอัตโนมัติ เมื่อคลัง (qtyWH) = 0
// ──────────────────────────────────────────────────────────────────────────
// สินค้าที่ส่งหมด/ขายหมด (คลังเหลือ 0 ในระบบ) ไม่ควรกินช่องชั้นวางในคลังต่อ
// ระบบสแกนชีต "ตำแหน่งจัดเก็บ" เทียบกับคลังจริง (SHEET_PRODUCTS col H) แล้วลบแถวที่คลัง=0
// เก็บ log สำรองไว้ในชีต SHEET_SHELF_SWEEP_LOG (กู้คืนได้: มี SKU/ล็อค/จำนวนครบ) + audit
// ตั้ง trigger รายสัปดาห์ด้วย setupShelfSweepTrigger()
//
// ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown ของ GAS editor ให้เจ้าของรัน/ทดสอบเองได้
// GUARD: ถ้าจะลบเยอะผิดปกติ (>= ratio ของแถวทั้งหมด) = ข้อมูลคลังน่าจะเพี้ยน → หยุด + เตือน LINE
//   ปรับได้ผ่าน Script Property: SHELF_SWEEP_RATIO (default 0.5), SHELF_SWEEP_MIN_GUARD (default 30)
//   ปิด guard: SHELF_SWEEP_GUARD_DISABLED='true'
function sweepEmptyShelfLocations() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const lockSh = ss.getSheetByName(SHEET_LOCKS);
  const prodSh = ss.getSheetByName(SHEET_PRODUCTS);
  if (!lockSh || !prodSh) { Logger.log("sweepEmptyShelfLocations: ไม่พบชีต locks หรือ products"); return; }

  // 1) map SKU(upper) → qtyWH (คลัง, col H) จากชีตสต็อกที่ ZORT sync
  const pRows = prodSh.getDataRange().getValues();
  const whMap = {};   // sku → qtyWH (number)
  for (let i = 1; i < pRows.length; i++) {
    const sku = String(pRows[i][COL_PROD_SKU - 1] || "").trim().toUpperCase();
    if (!sku) continue;
    const raw = pRows[i][COL_PROD_QTYWH - 1];
    // คลังว่าง (ยังไม่ sync) หรือไม่ใช่ตัวเลข → ถือว่า "ไม่รู้จำนวน" ไม่ใส่ใน map = ไม่ลบชั้น
    if (raw === "" || raw === null || raw === undefined) continue;
    const n = Number(raw);
    if (!isFinite(n)) continue;
    whMap[sku] = n;
  }

  // 1b) เซ็ต SKU ที่เป็นสินค้า MTO (งานจัดพิเศษ) — คลังเป็น 0 ตลอดโดยธรรมชาติ
  //     ไม่ใช่เพราะขายหมด → ยกเว้น ไม่ลบชั้น (อ่านหมวดจากชีต "ข้อมูลสินค้า" col F = แหล่งเดียวกับที่แอปใช้)
  const mtoSet = {};
  try {
    const metaSh = ss.getSheetByName(SHEET_PRODUCT_META);
    if (metaSh) {
      const mRows = metaSh.getDataRange().getDisplayValues();
      for (let i = 1; i < mRows.length; i++) {
        const s = String(mRows[i][COL_PROD_SKU - 1] || "").trim().toUpperCase();  // B
        if (s && String(mRows[i][5] || "").includes("Made to Order")) mtoSet[s] = true;  // F = หมวด
      }
    }
  } catch (e) { Logger.log("sweep mtoSet error: " + e); }

  // 2) หาแถวชั้นวางที่ควรนำออก: SKU มีในระบบและคลัง <= 0 (ยกเว้น MTO)
  //    (SKU ที่ไม่มีในชีตสต็อกเลย → ไม่รู้จำนวน → ข้าม ไม่ลบ เพื่อความปลอดภัย)
  const lockRows = lockSh.getDataRange().getValues();
  const toRemove = [];  // { rowNum, sku, loc, qty }
  let totalDataRows = 0;
  for (let i = 1; i < lockRows.length; i++) {
    const r = lockRows[i];
    const sku = String(r[COL_LOCK_SKU - 1] || "").trim().toUpperCase();
    const loc = String(r[COL_LOCK_KEY - 1] || "").trim();
    if (!sku || !loc) continue;
    totalDataRows++;
    if (mtoSet[sku]) continue;                // MTO → เว้นไว้ ไม่ลบ
    if (whMap[sku] === undefined) continue;   // ไม่รู้จำนวน → ข้าม
    if (whMap[sku] <= 0) {
      toRemove.push({
        rowNum: i + 1, sku: sku, loc: loc,
        qty:    Number(r[COL_LOCK_QTY - 1]) || 0,   // D = จำนวนในชั้น
      });
    }
  }

  if (toRemove.length === 0) {
    Logger.log("sweepEmptyShelfLocations: ไม่มีชั้นที่ต้องนำออก (สแกน " + totalDataRows + " แถว)");
    return;
  }

  // 3) GUARD: กันลบยกแผงเมื่อข้อมูลคลังเพี้ยน (เช่น ZORT ล่มแล้ว col H กลายเป็น 0 ยกแผง)
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHELF_SWEEP_GUARD_DISABLED') !== 'true') {
    const ratio    = parseFloat(props.getProperty('SHELF_SWEEP_RATIO') || '0.5');
    const minGuard = parseInt(props.getProperty('SHELF_SWEEP_MIN_GUARD') || '30', 10);
    if (toRemove.length >= minGuard && toRemove.length >= totalDataRows * ratio) {
      const pct = Math.round(toRemove.length / totalDataRows * 100);
      const gmsg = '⚠️ หยุดนำสินค้าออกจากชั้นอัตโนมัติ: จะลบ ' + toRemove.length + '/' + totalDataRows +
                   ' แถว (' + pct + '%) — คลังน่าจะเพี้ยน/ZORT ล่ม ระบบไม่ลบเพื่อกันข้อมูลหาย ตรวจแล้วรันใหม่';
      Logger.log(gmsg);
      try { sendLineGroup_(gmsg); } catch (e) {}
      return;
    }
  }

  // 4) เก็บ log สำรอง (append ก่อนลบ — ถ้า log fail จะไม่ลบ กัน state หาย)
  let logSh = ss.getSheetByName(SHEET_SHELF_SWEEP_LOG);
  if (!logSh) {
    logSh = ss.insertSheet(SHEET_SHELF_SWEEP_LOG);
    logSh.appendRow(["วันที่เวลา", "SKU", "ล็อค (ตำแหน่ง)", "จำนวนในชั้น", "คลัง(ระบบ)", "หมายเหตุ"]);
    logSh.getRange(1, 1, 1, 6).setFontWeight("bold");
  }
  const now = new Date();
  const logRows = toRemove.map(function(t) {
    return [now, t.sku, t.loc, t.qty, whMap[t.sku], "คลัง=0 → นำออกอัตโนมัติ"];
  });
  logSh.getRange(logSh.getLastRow() + 1, 1, logRows.length, 6).setValues(logRows);
  SpreadsheetApp.flush();

  // 5) ลบแถวจริง — ไล่จากล่างขึ้นบน เพื่อไม่ให้ index เพี้ยนหลังลบ
  toRemove.sort(function(a, b) { return b.rowNum - a.rowNum; });
  let removed = 0;
  toRemove.forEach(function(t) {
    try { lockSh.deleteRow(t.rowNum); removed++; }
    catch (e) { Logger.log("sweep deleteRow " + t.rowNum + " error: " + e); }
  });

  // 6) audit + ล้าง cache
  try {
    writeAuditLog_("ระบบ (อัตโนมัติ)", "sweepEmptyShelf", removed + " แถว",
      auditDetail_({ removed: removed, scanned: totalDataRows,
                     skus: toRemove.map(function(t){ return t.sku + "@" + t.loc; }).slice(0, 50) }));
  } catch (e) {}
  invalidateCache_();
  Logger.log("sweepEmptyShelfLocations: นำออก " + removed + " แถว (สแกน " + totalDataRows + ") — log ที่ชีต '" + SHEET_SHELF_SWEEP_LOG + "'");
}

// ตั้ง trigger นำสินค้าออกจากชั้นอัตโนมัติ สัปดาห์ละครั้ง (จันทร์ 05:00 เขตเวลา GAS)
// รันฟังก์ชันนี้เองครั้งเดียวใน GAS editor เพื่อสร้าง trigger
function setupShelfSweepTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "sweepEmptyShelfLocations") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sweepEmptyShelfLocations")
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  Logger.log("✅ ตั้ง trigger: sweepEmptyShelfLocations ทุกวันจันทร์ 05:00");
}

function debugZortProduct() {
  const res = UrlFetchApp.fetch(
    `${ZORT_BASE}/Product/GetProducts?page=1&limit=3`,
    { method: "get", headers: zortHeaders_(), muteHttpExceptions: true }
  );
  const json = JSON.parse(res.getContentText());
  if (json.list && json.list[0]) {
    const first = json.list[0];
    Logger.log("Fields: " + Object.keys(first).join(", "));
    // หา field รูปภาพ (image/photo/picture/url)
    Object.keys(first).forEach(k => {
      if (/image|photo|picture|img|url|thumb/i.test(k)) {
        Logger.log(`  รูป? ${k} = ` + JSON.stringify(first[k]));
      }
    });
    Logger.log("Sample: " + JSON.stringify(first, null, 2).substring(0, 2000));
  }
}

// รันครั้งเดียวเพื่อดู (1) รหัสคลังจริงใน ZORT  (2) field รูปภาพของสินค้า
// ส่ง log กลับมา → จะแก้รหัสคลัง + เปิด sync รูปให้
function exploreZortSetup() {
  Logger.log("════════ 1) คลังสินค้าใน ZORT ════════");
  getZortWarehouses();
  Logger.log("════════ 2) field สินค้า (หารูปภาพ) ════════");
  debugZortProduct();
  Logger.log("════════ เสร็จ — copy log ทั้งหมดส่งกลับมา ════════");
}

// ───────────────────────────────────────────────────────────
// SECTION 4b: ZORT Purchase Order Sync
// ───────────────────────────────────────────────────────────

// วิ่งครั้งแรกเพื่อดู fields จริงๆ ของ ZORT PurchaseReceive API
function exploreZortPurchases() {
  const tz = "Asia/Bangkok";
  const today = new Date();
  const from  = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromStr = Utilities.formatDate(from, tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  const endpoints = [
    `${ZORT_BASE}/PurchaseReceive/GetPurchaseReceives?page=1&limit=3&fromdate=${fromStr}&todate=${toStr}`,
    `${ZORT_BASE}/PurchaseOrder/GetPurchaseOrders?page=1&limit=3&fromdate=${fromStr}&todate=${toStr}`,
  ];
  for (const url of endpoints) {
    Logger.log("── GET " + url);
    try {
      const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
      Logger.log("HTTP " + res.getResponseCode());
      const txt = res.getContentText();
      Logger.log(txt.substring(0, 2000));
    } catch (e) {
      Logger.log("ERROR: " + e);
    }
  }
  Logger.log("════ เสร็จ ════");
}

// ═══════════════════════════════════════════════════════════
// PHASE 0 — วินิจฉัย "มูลค่าซื้อรวม ฿1" ในการ์ด "ของเข้าใหม่ 30 วัน"
// ═══════════════════════════════════════════════════════════
// อาการ: การ์ดโชว์ 38 SKU / 11,848 ชิ้น แต่มูลค่าซื้อรวม ฿1
//   → OverviewView คิดจาก sum(qty × unitPrice) ที่ readPurchases_() อ่านจากคอลัมน์ 27 (0-indexed)
//   → จำนวนชิ้น (คอล 26) / ชื่อ / SKU (คอล 24-25) ออกมาถูก แปลว่าดัชนีคอลัมน์ไม่น่าเพี้ยน
//     เหลือความเป็นไปได้หลักว่า pricepernumber ที่ ZORT คืนมาเป็น 0/ว่าง
// ห้ามเดาแล้วแก้ — ตัวนี้พิมพ์ข้อมูลจริงออกมาให้ตัดสินก่อนว่าจะ fallback ไปฟิลด์ไหน
//
// ⚠️ อ่านอย่างเดียว ไม่แก้ชีต ไม่แตะ ZORT ฝั่งเขียน · ไม่ log header (มี apikey/apisecret อยู่)
// ⚠️ ชื่อไม่มี "_" ต่อท้าย เพื่อให้โผล่ใน dropdown ของ GAS editor (บทเรียนข้อ 1)
function debugPurchasePrices() {
  const IDX_TYPE = 1, IDX_PO = 2, IDX_SUPPLIER = 4, IDX_DATE = 11,
        IDX_STATUS = 19, IDX_SKU = 24, IDX_NAME = 25, IDX_QTY = 26, IDX_PRICE = 27;
  const tz = "Asia/Bangkok";

  Logger.log("════════ PHASE 0: ตรวจราคาต้นทุนในรายการซื้อ ════════");

  // ── 1) ชีต "รายการซื้อสินค้า" — ของที่หน้าเว็บอ่านจริง ──────────────
  Logger.log("");
  Logger.log("──── 1) ชีต \"" + SHEET_PURCHASES + "\" ────");
  let sheetVerdict = "อ่านชีตไม่ได้";
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PURCHASES);
    if (!sh) {
      Logger.log("❌ ไม่พบชีต");
    } else {
      const rows = sh.getDataRange().getValues();
      Logger.log("แถวทั้งหมด (รวม header 2 แถว): " + rows.length + " · คอลัมน์: " + sh.getLastColumn());

      // header 2 แถวแรก พร้อม index — ถ้าราคาไปอยู่คอลัมน์อื่น จะเห็นตรงนี้ทันที
      for (let h = 0; h < Math.min(2, rows.length); h++) {
        const labeled = rows[h].map(function (v, i) {
          const s = String(v == null ? "" : v).trim();
          return s ? (i + "=" + s) : null;
        }).filter(Boolean);
        Logger.log("header แถว " + (h + 1) + ": " + (labeled.join(" | ") || "(ว่าง)"));
      }

      // ช่วง 30 วันล่าสุด = ช่วงเดียวกับที่การ์ด "ของเข้าใหม่" ใช้
      const cut = new Date(); cut.setDate(cut.getDate() - 30);
      const cutStr = Utilities.formatDate(cut, tz, "yyyy-MM-dd");
      Logger.log("ช่วงที่การ์ดใช้: วันที่ >= " + cutStr);

      const dateStr = function (v) {
        if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, "yyyy-MM-dd");
        return String(v == null ? "" : v).trim();
      };

      let nRecent = 0, nPriced = 0, sumQty = 0, sumCost = 0;
      const byType = {};
      const skuSet = {}, skuNoPrice = {};
      const samples = [];
      for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        const sku = String(r[IDX_SKU] == null ? "" : r[IDX_SKU]).trim();
        if (!sku) continue;
        const d = dateStr(r[IDX_DATE]);
        if (!d || d < cutStr) continue;
        const qty   = parseInt(r[IDX_QTY]) || 0;
        const price = parseNum_(r[IDX_PRICE]);
        nRecent++;
        sumQty  += qty;
        sumCost += qty * price;
        skuSet[sku] = true;
        if (price > 0) nPriced++; else skuNoPrice[sku] = true;
        const t = String(r[IDX_TYPE] == null ? "" : r[IDX_TYPE]).trim() || "(ว่าง)";
        byType[t] = (byType[t] || 0) + 1;
        if (samples.length < 15) {
          samples.push("  " + d + " · " + t + " · PO=" + String(r[IDX_PO] || "-") +
                       " · " + sku + " · qty=" + qty + " · ราคา/หน่วย=" + JSON.stringify(r[IDX_PRICE]) +
                       " (parse=" + price + ")");
        }
      }

      Logger.log("");
      Logger.log("แถวใน 30 วันล่าสุด: " + nRecent + " · SKU ไม่ซ้ำ: " + Object.keys(skuSet).length);
      Logger.log("จำนวนชิ้นรวม: " + sumQty + "   ← การ์ดโชว์ 11,848");
      Logger.log("มูลค่าซื้อรวม: " + sumCost + "   ← การ์ดโชว์ ฿1");
      Logger.log("แถวที่มีราคา > 0: " + nPriced + " / " + nRecent +
                 (nRecent ? (" (" + Math.round(nPriced / nRecent * 100) + "%)") : ""));
      Logger.log("SKU ที่ไม่มีราคาเลย: " + Object.keys(skuNoPrice).length);
      Logger.log("แยกตามประเภท (คอลัมน์ " + IDX_TYPE + "): " + JSON.stringify(byType));
      Logger.log("  → \"สั่งซื้อ\" = มาจาก syncZortPurchases · \"ซื้อเข้า\" = สร้างในแอป (PurchaseInPanel)");
      Logger.log("");
      Logger.log("ตัวอย่าง 15 แถวแรกในช่วง:");
      samples.forEach(function (s) { Logger.log(s); });

      if (nRecent === 0)      sheetVerdict = "ไม่มีแถวในช่วง 30 วัน (การ์ดไม่ควรโชว์ด้วยซ้ำ — ต้องดูต่อ)";
      else if (nPriced === 0) sheetVerdict = "ราคาเป็น 0 ทุกแถว → ต้นเหตุอยู่ที่ตอนเขียนชีต ไม่ใช่ตอนอ่าน";
      else if (nPriced < nRecent) sheetVerdict = "ราคามีบ้างไม่มีบ้าง (" + nPriced + "/" + nRecent + ") → ยอดรวมต่ำกว่าจริง ห้ามโชว์เงียบ ๆ";
      else                    sheetVerdict = "ราคาครบทุกแถว → ต้นเหตุอยู่ที่ฝั่งคำนวณ/แสดงผล ไม่ใช่ข้อมูล";

      // แถวล่าสุดแบบดิบทั้งแถว — จับกรณีคอลัมน์เลื่อน (ราคาไปโผล่คอลัมน์อื่น)
      Logger.log("");
      Logger.log("── ค่าดิบทั้งแถวของ 2 แถวสุดท้าย (ดูว่ามีตัวเลขที่หน้าตาเหมือนราคาไปอยู่คอลัมน์ไหน) ──");
      for (let i = Math.max(2, rows.length - 2); i < rows.length; i++) {
        const cells = rows[i].map(function (v, idx) {
          const s = String(v == null ? "" : v).trim();
          return s ? (idx + "=" + s) : null;
        }).filter(Boolean);
        Logger.log("แถว " + (i + 1) + ": " + (cells.join(" | ") || "(ว่าง)"));
      }
    }
  } catch (e) {
    Logger.log("❌ อ่านชีตพัง: " + e);
  }

  // ── 2) ZORT ของจริง — PO ดิบ ดูว่าฟิลด์ราคาชื่ออะไรและมีค่าไหม ──────
  Logger.log("");
  Logger.log("──── 2) ZORT /PurchaseOrder/GetPurchaseOrders (30 วันล่าสุด) ────");
  let zortVerdict = "ยิง ZORT ไม่สำเร็จ";
  try {
    const today = new Date();
    const from  = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromStr = Utilities.formatDate(from, tz, "yyyy-MM-dd");
    const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");
    const url = ZORT_BASE + "/PurchaseOrder/GetPurchaseOrders?page=1&limit=20" +
                "&fromdate=" + fromStr + "&todate=" + toStr;
    Logger.log("GET " + url);
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    const code = res.getResponseCode();
    Logger.log("HTTP " + code);
    if (code !== 200) {
      Logger.log("body: " + res.getContentText().substring(0, 500));
      zortVerdict = "ZORT ตอบ HTTP " + code;
    } else {
      const list = (JSON.parse(res.getContentText()) || {}).list || [];
      Logger.log("จำนวน PO ที่ได้: " + list.length);

      // หา PO ใบแรกที่มี line item จริง
      let po = null, items = null;
      for (let i = 0; i < list.length; i++) {
        const cand = list[i];
        const it = Array.isArray(cand.list) ? cand.list
                 : Array.isArray(cand.items) ? cand.items
                 : Array.isArray(cand.productlist) ? cand.productlist : [];
        if (it.length) { po = cand; items = it; break; }
      }

      if (!po) {
        Logger.log("⚠️ ไม่มี PO ใบไหนมี line item เลยในช่วงนี้");
        Logger.log("field ระดับ PO ของใบแรก: " + (list[0] ? Object.keys(list[0]).join(", ") : "(ไม่มี PO)"));
        zortVerdict = "ZORT ไม่คืน line item → syncZortPurchases เขียนแถวว่าง ราคาจึงเป็น 0";
      } else {
        Logger.log("PO ตัวอย่าง: number=" + po.number + " · วันที่=" + (po.purchaseorderdateString || "") +
                   " · status=" + po.status + " · line items=" + items.length);
        Logger.log("");
        Logger.log("── item ตัวแรก (JSON เต็ม — ดูชื่อฟิลด์ราคาทั้งหมด) ──");
        Logger.log(JSON.stringify(items[0], null, 2));

        // สรุปเฉพาะฟิลด์ที่น่าจะเป็นราคา ข้าม item หลายตัว
        Logger.log("");
        Logger.log("── ฟิลด์ที่น่าจะเป็นราคา ของ 5 item แรก ──");
        const priceKeys = ["pricepernumber", "price", "totalprice", "unitprice", "cost", "costpernumber", "amount"];
        items.slice(0, 5).forEach(function (it, i) {
          const parts = priceKeys.map(function (k) {
            return it[k] === undefined ? null : (k + "=" + JSON.stringify(it[k]));
          }).filter(Boolean);
          Logger.log("  #" + (i + 1) + " sku=" + (it.sku || it.productcode || "-") +
                     " number=" + JSON.stringify(it.number) + " | " + (parts.join(" · ") || "ไม่มีฟิลด์ราคาเลย"));
        });

        // นับทั้งชุดว่า pricepernumber (ตัวที่ syncZortPurchases ใช้อยู่) ใช้ได้จริงกี่ %
        let nItem = 0, nPPN = 0, nTotal = 0;
        list.forEach(function (p) {
          const it = Array.isArray(p.list) ? p.list : [];
          it.forEach(function (x) {
            nItem++;
            if ((Number(x.pricepernumber) || 0) > 0) nPPN++;
            if ((Number(x.totalprice)     || 0) > 0) nTotal++;
          });
        });
        Logger.log("");
        Logger.log("จาก " + nItem + " item ในช่วง 30 วัน:");
        Logger.log("  pricepernumber > 0 : " + nPPN + " (ฟิลด์ที่ syncZortPurchases ใช้อยู่ตอนนี้)");
        Logger.log("  totalprice     > 0 : " + nTotal + " (ตัวเลือก fallback → totalprice ÷ number)");
        zortVerdict = nPPN > 0 ? "pricepernumber ใช้ได้ (" + nPPN + "/" + nItem + ")"
                    : nTotal > 0 ? "pricepernumber ว่าง แต่ totalprice ใช้ได้ → fallback ได้"
                    : "ZORT ไม่ให้ราคาต้นทุนมาเลยทั้ง 2 ฟิลด์";
      }
    }
  } catch (e) {
    Logger.log("❌ ยิง ZORT พัง: " + e);
  }

  Logger.log("");
  Logger.log("════════ สรุป ════════");
  Logger.log("ฝั่งชีต: " + sheetVerdict);
  Logger.log("ฝั่ง ZORT: " + zortVerdict);
  Logger.log("→ copy log ทั้งหมดส่งกลับมา แล้วจะแก้ตามผลจริง (ไม่เดา)");
}

// ดึง PurchaseOrder จาก ZORT แบบ paginated
function fetchZortPurchasesPaged_(fromStr, toStr) {
  const all = [], limit = 200, MAX_PAGES = 60;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${ZORT_BASE}/PurchaseOrder/GetPurchaseOrders?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) break;
    const data = JSON.parse(res.getContentText());
    const list = data.list || [];
    if (!Array.isArray(list) || list.length === 0) break;
    all.push(...list);
    if (list.length < limit) break;
  }
  return all;
}

// เขียน PurchaseOrder ลง sheet รายการซื้อสินค้า
// คอลัมน์ที่ readPurchases_() อ่าน (0-indexed):
//   col 1=type, 2=poNum, 4=supplier, 11=date, 19=status, 20=warehouse, 24=sku, 25=name, 26=qty, 27=unitPrice
function syncZortPurchases() {
  const ss  = SpreadsheetApp.openById(SHEET_ID);
  const sh  = ss.getSheetByName(SHEET_PURCHASES);
  if (!sh) { Logger.log("❌ ไม่พบ sheet รายการซื้อสินค้า"); return; }

  const tz    = "Asia/Bangkok";
  const today = new Date();
  const DAYS  = 365;
  const from  = new Date(today.getTime() - DAYS * 24 * 60 * 60 * 1000);
  const fromStr = Utilities.formatDate(from, tz, "yyyy-MM-dd");
  const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  const raw = fetchZortPurchasesPaged_(fromStr, toStr);
  Logger.log("ZORT PurchaseOrder fetched: " + raw.length);
  if (raw.length === 0) { Logger.log("⚠️ ไม่มีข้อมูล — ไม่เขียนทับ"); return; }

  // ขยาย line items ออกมา
  const dataRows = [];
  for (const po of raw) {
    const poNum    = String(po.number || "").trim();
    const supplier = String(po.customername || "").trim();
    const dateStr  = String(po.purchaseorderdateString ||
                            (po.purchaseorderdate ? String(po.purchaseorderdate).substring(0,10) : "") || "").trim();
    const status   = String(po.status || "").trim();
    const wh       = String(po.warehousecode || "").trim();
    const type     = "สั่งซื้อ";

    const items = Array.isArray(po.list) ? po.list :
                  Array.isArray(po.items) ? po.items :
                  Array.isArray(po.productlist) ? po.productlist : [];

    if (items.length === 0) {
      // PO ไม่มี line item — เขียน 1 แถวว่าง
      const row = new Array(28).fill("");
      row[1]  = type;
      row[2]  = poNum;
      row[4]  = supplier;
      row[11] = dateStr;
      row[19] = status;
      row[20] = wh;
      dataRows.push(row);
    } else {
      for (const item of items) {
        const sku  = String(item.sku || item.productcode || "").trim().toUpperCase();
        const name = String(item.name || "").trim();
        const qty  = Number(item.number || 0);
        const price= Number(item.pricepernumber || 0);

        const row = new Array(28).fill("");
        row[1]  = type;
        row[2]  = poNum;
        row[4]  = supplier;
        row[11] = dateStr;
        row[19] = status;
        row[20] = wh;
        row[24] = sku;
        row[25] = name;
        row[26] = qty;
        row[27] = price;
        dataRows.push(row);
      }
    }
  }

  Logger.log("แถวทั้งหมด: " + dataRows.length);

  // รักษา header 2 แถวแรก แล้วเขียนทับข้อมูลแถวที่ 3 เป็นต้นไป
  const lastRow = sh.getLastRow();
  if (lastRow > 2) sh.getRange(3, 1, lastRow - 2, sh.getLastColumn()).clearContent();

  if (dataRows.length > 0) {
    sh.getRange(3, 1, dataRows.length, 28).setValues(dataRows);
  }

  invalidateCache_();
  Logger.log("✅ syncZortPurchases เสร็จ: " + dataRows.length + " แถว");
}

function setupZortPurchasesTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncZortPurchases") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncZortPurchases").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  Logger.log("✅ ตั้ง trigger: syncZortPurchases ทุกวันจันทร์ 06:00");
}

// ───────────────────────────────────────────────────────────
// SECTION 5: LINE Bot Implementation
// ───────────────────────────────────────────────────────────

function handleQuery(message, db) {
  const lower = message.toLowerCase().trim();

  if (lower === 'คำสั่ง' || lower === 'help' || lower === 'วิธีใช้' || lower === 'menu' || lower === 'เมนู') return buildHelpMessage();
  if (lower === 'ถัดไป' || lower === 'หน้าถัดไป' || lower === 'ต่อไป' || lower === 'next') return handleNextPage();
  if (lower.startsWith('สรุป')) return handleSummary(lower.replace('สรุป', '').trim(), db);
  if (lower === 'ร้านทั้งหมด' || lower === 'รายชื่อร้าน') return buildSupplierListMessage(db);
  if (lower === 'หมวดทั้งหมด' || lower === 'รายชื่อหมวด') return buildCategoryListMessage(db);

  const supplierFilter = extractSupplier(lower);
  const skuFilter      = extractSKU(lower, db);
  const colorFilter    = extractColor(lower);
  const catFilter      = extractCategory(lower);
  const nameFilter     = extractNameKeyword(lower, supplierFilter, skuFilter, colorFilter, catFilter);

  if (!supplierFilter && !skuFilter && !colorFilter && !catFilter && !nameFilter) return buildHelpMessage();

  let results = Object.values(db.items).filter(item => {
    const iName     = (item.name     || '').toLowerCase();
    const iSku      = (item.sku      || '').toLowerCase();
    const iCat      = (item.category || '').toLowerCase();
    const iSupplier = (item.supplier || '').toLowerCase();
    const iTag      = (item.tag      || '').toLowerCase();
    if (supplierFilter) {
      const sf = supplierFilter.toLowerCase();
      const supplierMatch = iSupplier.split(/[,\s]+/).map(s => s.trim()).includes(sf);
      const tagMatch = iTag.split(/[,\s]+/).map(s => s.trim()).includes(sf);
      if (!supplierMatch && !tagMatch) return false;
    }
    if (skuFilter   && iSku !== skuFilter.toLowerCase()) return false;
    if (colorFilter && !iName.includes(colorFilter))     return false;
    if (catFilter   && !iCat.includes(catFilter))        return false;
    if (nameFilter  && !iName.includes(nameFilter))      return false;
    return true;
  });

  if (results.length === 0) {
    return {
      "type": "text",
      "text": `❌ ไม่พบสินค้าที่ตรงกับเงื่อนไขครับ\n\nคำที่ค้น: "${message}"\n\nลองพิมพ์:\n• "คำสั่ง" - ดูคำสั่งทั้งหมด\n• "ร้านทั้งหมด" - ดูชื่อร้านที่มี\n• "หมวดทั้งหมด" - ดูหมวดสินค้าที่มี`
    };
  }

  const totalFound = results.length;
  if (results.length > MAX_TOTAL) results = results.slice(0, MAX_TOTAL);

  const slim = results.map(r => ({
    sku: r.sku, name: r.name, imageUrl: r.imageUrl,
    location: r.location, category: r.category,
    supplier: r.supplier, tag: r.tag,
    qtyStore: r.qtyStore, qtyWH: r.qtyWH, qtyTotal: r.qtyTotal
  }));

  let filterSummary = buildFilterSummary(supplierFilter, skuFilter, colorFilter, catFilter, nameFilter);
  if (totalFound > MAX_TOTAL) filterSummary += ` (จาก ${totalFound} รายการ)`;

  saveSearchSession(slim, filterSummary, 0);
  return buildPageFlex(slim, filterSummary, 0);
}

function extractSupplier(text) {
  const match = text.match(/เช็คร้าน([^\s]+)/);
  return match ? match[1].trim() : null;
}

function extractSKU(text, db) {
  const match = text.match(/\b([a-z0-9]{1,4}\d{4,6})\b/i);
  if (!match) return null;
  const candidate = match[1].toUpperCase();
  const exists = Object.values(db.items).some(item => (item.sku || '').toUpperCase() === candidate);
  return exists ? candidate : null;
}

function extractColor(text) {
  const colors = ['ชมพูอ่อน','ม่วงอ่อน','เขียวอ่อน','น้ำเงิน','น้ำตาล','ทูโทน','ขาว','แดง','ชมพู','ม่วง','เขียว','เหลือง','ส้ม','ดำ','เงิน','ทอง','ครีม','ฟ้า','เทา','เบจ'];
  const stripped = text.replace(/สี/g, '');
  for (const c of colors) if (stripped.includes(c)) return c;
  return null;
}

function extractCategory(text) {
  const cats = ['ผลไม้ ผัก กิ่งผลไม้','ของตกแต่ง','แจกันแก้ว','กิ่งผลไม้','ดอกไม้','ใบบูช','ผลไม้','ผัก','ใบ','realtouch'];
  for (const cat of cats) if (text.includes(cat)) return cat;
  return null;
}

function extractNameKeyword(text, supplier, sku, color, cat) {
  let cleaned = text;
  if (supplier) cleaned = cleaned.replace(`เช็คร้าน${supplier.toLowerCase()}`, ' ');
  if (sku)      cleaned = cleaned.replace(sku.toLowerCase(), ' ');
  if (color)    { cleaned = cleaned.replace(`สี${color}`, ' '); cleaned = cleaned.replace(color, ' '); }
  if (cat)      cleaned = cleaned.replace(cat, ' ');
  const stopwords = ['เช็ค','หา','ค้นหา','สินค้า','ร้าน','สี','และ','หรือ','ของ','ที่'];
  stopwords.forEach(sw => { cleaned = cleaned.replace(new RegExp(sw, 'g'), ' '); });
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : null;
}

function buildFilterSummary(supplier, sku, color, cat, name) {
  let parts = [];
  if (supplier) parts.push(`ร้าน: ${supplier}`);
  if (sku)      parts.push(`SKU: ${sku}`);
  if (cat)      parts.push(`หมวด: ${cat}`);
  if (color)    parts.push(`สี${color}`);
  if (name)     parts.push(name);
  return parts.join(' | ') || 'ทั้งหมด';
}

function getOrBuildDatabase() {
  const cache = CacheService.getScriptCache();
  const totalChunks = cache.get(`${CACHE_KEY}_total`);
  if (totalChunks) {
    let fullJson = '';
    let valid = true;
    for (let i = 0; i < parseInt(totalChunks); i++) {
      const chunk = cache.get(`${CACHE_KEY}_chunk_${i}`);
      if (!chunk) { valid = false; break; }
      fullJson += chunk;
    }
    if (valid) return JSON.parse(fullJson);
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCT_META);
  const data  = sheet.getDataRange().getDisplayValues();
  let db = { index: {}, items: {} };
  for (let i = 1; i < data.length; i++) {
    const sku      = (data[i][1]  || '').trim();
    const name     = (data[i][2]  || '').trim();
    const imageUrl = (data[i][3]  || '').trim();
    const location = (data[i][4]  || '').trim();
    const category = (data[i][5]  || '').trim();
    const tag      = (data[i][6]  || '').trim();
    const supplier = (data[i][7]  || '').trim();
    const qtyStore = (data[i][8]  || '').trim();
    const qtyWH    = (data[i][9]  || '').trim();
    const qtyTotal = (data[i][10] || '').trim();
    if (!name && !sku) continue;
    db.items[i] = { sku, name, imageUrl, location, category, tag, supplier, qtyStore, qtyWH, qtyTotal };
  }
  const json = JSON.stringify(db);
  const chunkSize = 90000;
  const count = Math.ceil(json.length / chunkSize);
  cache.put(`${CACHE_KEY}_total`, count.toString(), CACHE_TIME);
  for (let i = 0; i < count; i++) {
    cache.put(`${CACHE_KEY}_chunk_${i}`, json.substring(i * chunkSize, (i + 1) * chunkSize), CACHE_TIME);
  }
  return db;
}

function replyToLine(replyToken, messagePayload) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({
      replyToken,
      messages: Array.isArray(messagePayload) ? messagePayload : [messagePayload]
    }),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  if (code !== 200) {
    console.error(`LINE API Error ${code}: ${response.getContentText()}`);
  }
}

function startLoadingAnimation(chatId) {
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: "post",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
      payload: JSON.stringify({ chatId, loadingSeconds: 5 })
    });
  } catch (e) { console.error("Loading error:", e); }
}

function saveSearchSession(results, filterSummary, page) {
  const cache = CacheService.getScriptCache();
  const session = { results, filterSummary, page };
  const json = JSON.stringify(session);
  const chunkSize = 90000;
  const count = Math.ceil(json.length / chunkSize);
  cache.put('search_session_total', count.toString(), RESULT_CACHE_TIME);
  for (let i = 0; i < count; i++) {
    cache.put(`search_session_chunk_${i}`, json.substring(i * chunkSize, (i + 1) * chunkSize), RESULT_CACHE_TIME);
  }
}

function loadSearchSession() {
  const cache = CacheService.getScriptCache();
  const total = cache.get('search_session_total');
  if (!total) return null;
  let fullJson = '';
  for (let i = 0; i < parseInt(total); i++) {
    const chunk = cache.get(`search_session_chunk_${i}`);
    if (!chunk) return null;
    fullJson += chunk;
  }
  return JSON.parse(fullJson);
}

function handleNextPage() {
  const session = loadSearchSession();
  if (!session) return { "type": "text", "text": "⏰ หมดเวลา Session แล้วครับ\nกรุณาค้นหาใหม่อีกครั้ง" };
  const nextPage = session.page + 1;
  if (nextPage * MAX_CARDS >= session.results.length) {
    return { "type": "text", "text": "✅ แสดงครบทุกรายการแล้วครับ" };
  }
  saveSearchSession(session.results, session.filterSummary, nextPage);
  return buildPageFlex(session.results, session.filterSummary, nextPage);
}

function buildPageFlex(results, filterSummary, page) {
  const totalPages = Math.ceil(results.length / MAX_CARDS);
  const start = page * MAX_CARDS;
  const pageItems = results.slice(start, start + MAX_CARDS);
  const label = `${filterSummary}  (หน้า ${page + 1}/${totalPages})`;
  return buildStockFlexMessage(label, pageItems, results.length, page, totalPages);
}

function buildStockFlexMessage(filterLabel, itemArray, totalResults, currentPage, totalPages) {
  totalResults = totalResults || itemArray.length;
  currentPage  = currentPage  || 0;
  totalPages   = totalPages   || 1;
  let bubbles = [];

  itemArray.forEach(item => {
    const isOOS  = String(item.qtyTotal).toLowerCase().includes('out of stock');
    const qtyNum = parseInt(item.qtyTotal);
    let qtyText, qtyColor;
    if (isOOS && isNaN(qtyNum))             { qtyText = '❌ หมด';            qtyColor = '#ff334b'; }
    else if (isNaN(qtyNum) || qtyNum === 0) { qtyText = '❌ หมด';            qtyColor = '#ff334b'; }
    else if (qtyNum < 0)                    { qtyText = `⚠️ ${qtyNum}`;      qtyColor = '#ff334b'; }
    else if (qtyNum <= 10)                  { qtyText = `⚠️ ${qtyNum} ชิ้น`; qtyColor = '#ff9900'; }
    else                                    { qtyText = `✅ ${qtyNum} ชิ้น`; qtyColor = '#03c75a'; }

    let bubble = { "type": "bubble", "size": "mega" };
    if (item.imageUrl && item.imageUrl.startsWith('http')) {
      bubble.hero = {
        "type": "image", "url": item.imageUrl,
        "size": "full", "aspectRatio": "1:1", "aspectMode": "fit",
        "backgroundColor": "#ffffff"
      };
    }
    bubble.header = {
      "type": "box", "layout": "vertical",
      "backgroundColor": "#0D2C54", "paddingAll": "lg",
      "contents": [
        { "type": "text", "text": "📦 เช็คสต๊อก", "color": "#ffffff", "weight": "bold", "size": "md" },
        { "type": "text", "text": filterLabel, "color": "#ffffffcc", "size": "xs", "margin": "xs", "wrap": true }
      ]
    };
    const supplierDisplay = item.supplier || item.tag || '-';
    bubble.body = {
      "type": "box", "layout": "vertical", "paddingAll": "lg",
      "contents": [
        { "type": "text", "text": item.name || '-', "weight": "bold", "size": "md", "wrap": true, "color": "#111111" },
        { "type": "separator", "margin": "md" },
        { "type": "box", "layout": "horizontal", "margin": "md",
          "contents": [
            { "type": "text", "text": "SKU",  "size": "sm", "color": "#888888", "flex": 2 },
            { "type": "text", "text": item.sku || '-', "size": "sm", "color": "#333333", "flex": 4, "wrap": true }
          ]
        },
        { "type": "box", "layout": "horizontal", "margin": "sm",
          "contents": [
            { "type": "text", "text": "หมวด", "size": "sm", "color": "#888888", "flex": 2 },
            { "type": "text", "text": item.category || '-', "size": "sm", "color": "#333333", "flex": 4, "wrap": true }
          ]
        },
        { "type": "box", "layout": "horizontal", "margin": "sm",
          "contents": [
            { "type": "text", "text": "ร้าน", "size": "sm", "color": "#888888", "flex": 2 },
            { "type": "text", "text": supplierDisplay, "size": "sm", "color": "#333333", "flex": 4, "wrap": true }
          ]
        },
        { "type": "box", "layout": "horizontal", "margin": "sm",
          "contents": [
            { "type": "text", "text": "📍 ที่เก็บ", "size": "sm", "color": "#888888", "flex": 2 },
            { "type": "text", "text": item.location || '-', "size": "sm", "color": "#333333", "flex": 4 }
          ]
        },
        { "type": "separator", "margin": "md" },
        { "type": "box", "layout": "horizontal", "margin": "md", "alignItems": "center",
          "contents": [
            { "type": "text", "text": "สต๊อกรวม", "size": "sm", "color": "#888888", "flex": 2 },
            { "type": "text", "text": qtyText, "size": "lg", "color": qtyColor, "flex": 4, "weight": "bold" }
          ]
        },
        { "type": "box", "layout": "horizontal", "margin": "sm",
          "contents": [
            { "type": "text", "text": "หน้าร้าน", "size": "xs", "color": "#aaaaaa", "flex": 2 },
            { "type": "text", "text": String(item.qtyStore || '-'), "size": "xs", "color": "#555555", "flex": 2 },
            { "type": "text", "text": "คลัง", "size": "xs", "color": "#aaaaaa", "flex": 1 },
            { "type": "text", "text": String(item.qtyWH || '-'), "size": "xs", "color": "#555555", "flex": 2 }
          ]
        }
      ]
    };
    bubbles.push(bubble);
  });

  const hasMore = (currentPage + 1) < totalPages;
  bubbles.push({
    "type": "bubble", "size": "mega",
    "body": {
      "type": "box", "layout": "vertical",
      "justifyContent": "center", "alignItems": "center", "height": "250px",
      "contents": hasMore ? [
        { "type": "text", "text": "📋", "size": "4xl" },
        { "type": "text", "text": `หน้า ${currentPage + 1} / ${totalPages}`, "size": "lg", "weight": "bold", "color": "#0D2C54", "margin": "md" },
        { "type": "text", "text": `พบทั้งหมด ${totalResults} รายการ`, "size": "sm", "color": "#888888", "margin": "xs" },
        { "type": "separator", "margin": "lg" },
        { "type": "text", "text": "พิมพ์  ถัดไป  เพื่อดูหน้าต่อไป", "size": "md", "weight": "bold", "color": "#03c75a", "margin": "lg", "align": "center" }
      ] : [
        { "type": "text", "text": "✅", "size": "4xl" },
        { "type": "text", "text": "แสดงครบแล้ว", "size": "lg", "weight": "bold", "color": "#03c75a", "margin": "md" },
        { "type": "text", "text": `ทั้งหมด ${totalResults} รายการ`, "size": "sm", "color": "#888888", "margin": "xs" }
      ]
    }
  });

  return {
    "type": "flex",
    "altText": `สต๊อก: ${filterLabel} (${totalResults} รายการ)`,
    "contents": { "type": "carousel", "contents": bubbles }
  };
}

function handleSummary(catKeyword, db) {
  const allItems = Object.values(db.items);

  if (!catKeyword || catKeyword === 'ทั้งหมด') {
    const catMap = {};
    allItems.forEach(item => {
      const cat = (item.category || 'ไม่มีหมวด').trim();
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push(item);
    });
    const catList = Object.entries(catMap).slice(0, 11);
    let bubbles = [];

    const totalSKU  = allItems.length;
    const totalQty  = allItems.reduce((s, i) => {
      const n = parseInt(i.qtyTotal);
      return s + (isNaN(n) ? 0 : Math.max(n, 0));
    }, 0);
    const totalOOS  = allItems.filter(i => {
      const n = parseInt(i.qtyTotal);
      return String(i.qtyTotal).toLowerCase().includes('out of stock') || isNaN(n) || n <= 0;
    }).length;

    bubbles.push(buildSummaryBubble('🏪 ภาพรวมทั้งหมด', [
      { label: 'หมวดหมู่ทั้งหมด', value: `${Object.keys(catMap).length} หมวด`, color: '#0D2C54' },
      { label: 'SKU ทั้งหมด',     value: `${totalSKU} รายการ`,                color: '#0D2C54' },
      { label: 'จำนวนชิ้นรวม',    value: `${totalQty} ชิ้น`,                  color: '#03c75a' },
      { label: 'หมดสต๊อก',        value: `${totalOOS} SKU`,                   color: totalOOS > 0 ? '#ff334b' : '#03c75a' }
    ]));
    catList.forEach(([cat, items]) => bubbles.push(buildCatSummaryBubble(cat, items)));

    return {
      "type": "flex",
      "altText": `สรุปสต๊อกทั้งหมด`,
      "contents": { "type": "carousel", "contents": bubbles }
    };
  }

  const matched = allItems.filter(item => {
    const cat  = (item.category || '').toLowerCase();
    const name = (item.name     || '').toLowerCase();
    return cat.includes(catKeyword) || name.includes(catKeyword);
  });

  if (matched.length === 0) {
    return { "type": "text", "text": `❌ ไม่พบหมวด "${catKeyword}" ครับ\nลองพิมพ์ "หมวดทั้งหมด" เพื่อดูหมวดที่มี` };
  }

  return {
    "type": "flex",
    "altText": `สรุป ${catKeyword}`,
    "contents": buildCatSummaryBubble(catKeyword, matched)
  };
}

function buildCatSummaryBubble(catName, items) {
  const totalSKU = items.length;
  const totalQty = items.reduce((s, i) => {
    const n = parseInt(i.qtyTotal);
    return s + (isNaN(n) ? 0 : Math.max(n, 0));
  }, 0);
  const oosCount = items.filter(i => {
    const n = parseInt(i.qtyTotal);
    return String(i.qtyTotal).toLowerCase().includes('out of stock') || isNaN(n) || n <= 0;
  }).length;
  const lowCount = items.filter(i => {
    const n = parseInt(i.qtyTotal);
    return !isNaN(n) && n > 0 && n <= 10;
  }).length;
  const okCount = items.filter(i => {
    const n = parseInt(i.qtyTotal);
    return !isNaN(n) && n > 10;
  }).length;

  return buildSummaryBubble(`📦 ${catName}`, [
    { label: 'SKU ทั้งหมด',  value: `${totalSKU} รายการ`, color: '#0D2C54' },
    { label: 'จำนวนชิ้นรวม', value: `${totalQty} ชิ้น`,   color: '#03c75a' },
    { label: '✅ มีของพอ',   value: `${okCount} SKU`,     color: '#03c75a' },
    { label: '⚠️ ใกล้หมด',   value: `${lowCount} SKU`,    color: lowCount > 0 ? '#ff9900' : '#aaaaaa' },
    { label: '❌ หมดแล้ว',   value: `${oosCount} SKU`,    color: oosCount > 0 ? '#ff334b' : '#aaaaaa' }
  ]);
}

function buildSummaryBubble(title, rows) {
  return {
    "type": "bubble", "size": "mega",
    "header": {
      "type": "box", "layout": "vertical",
      "backgroundColor": "#0D2C54", "paddingAll": "lg",
      "contents": [{ "type": "text", "text": title, "color": "#ffffff", "weight": "bold", "size": "lg", "wrap": true }]
    },
    "body": {
      "type": "box", "layout": "vertical", "paddingAll": "lg",
      "contents": rows.flatMap((row, idx) => [
        {
          "type": "box", "layout": "horizontal",
          "paddingTop": idx === 0 ? "none" : "md",
          "contents": [
            { "type": "text", "text": row.label, "size": "sm", "color": "#888888", "flex": 3 },
            { "type": "text", "text": row.value, "size": "sm", "color": row.color || '#333333', "flex": 3, "align": "end", "weight": "bold" }
          ]
        },
        ...(idx < rows.length - 1 ? [{ "type": "separator", "margin": "md" }] : [])
      ])
    }
  };
}

function buildSupplierListMessage(db) {
  const allItems = Object.values(db.items);
  const supSet = new Set();
  allItems.forEach(i => {
    if (i.supplier) supSet.add(i.supplier);
    if (i.tag) i.tag.split(',').forEach(t => {
      const tt = t.trim();
      if (tt && !tt.includes('เดือน')) supSet.add(tt);
    });
  });
  const list = [...supSet].sort().join(', ');
  return { "type": "text", "text": `🏪 รายชื่อร้านทั้งหมด (${supSet.size} ร้าน)\n\n${list}\n\nวิธีใช้: พิมพ์  เช็คร้าน  ตามด้วยชื่อ\nตัวอย่าง: เช็คร้านFK` };
}

function buildCategoryListMessage(db) {
  const allItems = Object.values(db.items);
  const catSet = new Set();
  allItems.forEach(i => { if (i.category) catSet.add(i.category); });
  const list = [...catSet].sort().join(', ');
  return { "type": "text", "text": `🗂 รายชื่อหมวดทั้งหมด (${catSet.size} หมวด)\n\n${list}\n\nวิธีใช้: พิมพ์ชื่อหมวดเลย\nตัวอย่าง: ดอกไม้` };
}

function buildHelpMessage() {
  return {
    "type": "flex",
    "altText": "คำสั่งทั้งหมดของบอท",
    "contents": {
      "type": "carousel",
      "contents": [
        {
          "type": "bubble", "size": "mega",
          "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": "#0D2C54", "paddingAll": "lg",
            "contents": [
              { "type": "text", "text": "📦 คำสั่งทั้งหมด", "color": "#ffffff", "weight": "bold", "size": "lg" },
              { "type": "text", "text": "หมวด 1: ค้นหาสินค้า", "color": "#ffffffcc", "size": "xs", "margin": "xs" }
            ]
          },
          "body": {
            "type": "box", "layout": "vertical", "spacing": "md", "paddingAll": "lg",
            "contents": [
              ...[
                ["🔖 รหัสสินค้า (SKU)", "BE01049\n3D00003\nAR31004"],
                ["🏪 เช็คตามร้าน",      "เช็คร้านFK\nเช็คร้านNAMETAG"],
                ["🎨 ค้นหาตามสี",       "ขาว / สีแดง / ชมพูอ่อน"],
                ["🗂 ค้นหาตามหมวด",     "ดอกไม้ / ใบบูช / Realtouch\nแจกันแก้ว / ของตกแต่ง"],
                ["🔍 ค้นหาตามชื่อ",     "เบอรี่ / อกาแพนทัส / หน้าวัว"],
                ["✨ รวมหลายเงื่อนไข",  "ดอกไม้สีขาว\nเบอรี่แดงเช็คร้านDS"]
              ].flatMap(([label, ex]) => [
                { "type": "box", "layout": "vertical", "margin": "sm", "contents": [
                  { "type": "text", "text": label, "size": "sm", "weight": "bold", "color": "#0D2C54" },
                  { "type": "text", "text": ex,    "size": "xs", "color": "#555555", "wrap": true }
                ]}
              ])
            ]
          }
        },
        {
          "type": "bubble", "size": "mega",
          "header": {
            "type": "box", "layout": "vertical",
            "backgroundColor": "#0D2C54", "paddingAll": "lg",
            "contents": [
              { "type": "text", "text": "📊 รายงาน & เครื่องมือ", "color": "#ffffff", "weight": "bold", "size": "lg" },
              { "type": "text", "text": "หมวด 2: สรุปสต๊อก", "color": "#ffffffcc", "size": "xs", "margin": "xs" }
            ]
          },
          "body": {
            "type": "box", "layout": "vertical", "spacing": "md", "paddingAll": "lg",
            "contents": [
              ...[
                ["📊 สรุปทั้งหมด",       "สรุปทั้งหมด"],
                ["📦 สรุปรายหมวด",      "สรุปดอกไม้\nสรุปใบบูช"],
                ["🏪 ดูรายชื่อร้าน",     "ร้านทั้งหมด"],
                ["🗂 ดูรายชื่อหมวด",     "หมวดทั้งหมด"],
                ["▶️ ดูหน้าถัดไป",       "ถัดไป"],
                ["❓ ดูคำสั่งนี้อีกครั้ง", "คำสั่ง"]
              ].flatMap(([label, ex]) => [
                { "type": "box", "layout": "vertical", "margin": "sm", "contents": [
                  { "type": "text", "text": label, "size": "sm", "weight": "bold", "color": "#0D2C54" },
                  { "type": "text", "text": ex,    "size": "xs", "color": "#555555", "wrap": true }
                ]}
              ])
            ]
          }
        }
      ]
    }
  };
}

// ───────────────────────────────────────────────────────────
// SECTION 6: Dashboard Data Readers
// ───────────────────────────────────────────────────────────

function parseQty_(val) {
  if (val == null || val === '') return { num: 0, status: 'empty' };
  const s = String(val).toLowerCase().trim();
  if (s.includes('out of stock full')) return { num: 0, status: 'oosfull' };
  if (s.includes('out of stock'))      return { num: 0, status: 'oos' };
  const n = parseInt(String(val).replace(/[,\s]/g, ''));
  if (isNaN(n)) return { num: 0, status: 'unknown' };
  return { num: n, status: n < 0 ? 'negative' : 'ok' };
}

function parseNum_(val) {
  if (val == null || val === '') return 0;
  const n = parseFloat(String(val).replace(/[,\s฿]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ตำแหน่งจัดเก็บมี 2 แบบ:
//   "A3/7" = ชั้น A3 ล็อคที่ 7 (แบบเดิม)
//   "A0"   = ของที่ "ไม่ได้อยู่บนชั้น" ในซอย A (วางพื้น/นอกชั้นวาง) — 1 ซอยมีช่องเดียว ไม่มีเลขล็อค
// ⚠️ ห้ามประกอบคีย์ด้วย `${side}${shelf}/${lock}` เองอีก — ช่อง A0/B0 จะกลายเป็น "A0/0"
//    ที่ไม่ตรงกับสิ่งที่เขียนอยู่ในชีตแล้วของหายจากแผนผังเงียบ ๆ → ใช้ lockKeyOf_ เสมอ
function parseLocation_(loc) {
  if (!loc) return null;
  const f = String(loc).trim().match(/^([AB])0$/i);
  if (f) return { raw: String(loc).trim(), valid: true, side: f[1].toUpperCase(), shelf: 0, lock: 0, floor: true };
  const m = String(loc).trim().match(/^([AB])(\d+)\/(\d+)$/i);
  if (!m) return null;
  return { raw: String(loc).trim(), valid: true, side: m[1].toUpperCase(), shelf: +m[2], lock: +m[3] };
}

function lockKeyOf_(loc) {
  if (!loc) return null;
  return loc.floor ? loc.side + '0' : loc.side + loc.shelf + '/' + loc.lock;
}

function monthKey_(val) {
  if (val instanceof Date) return `${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  const s = String(val).trim();
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2].padStart(2,'0')}/${m[3]}`;
  return null;
}

function dayKey_(val) {
  if (val instanceof Date) {
    return `${String(val.getDate()).padStart(2,'0')}/${String(val.getMonth()+1).padStart(2,'0')}/${val.getFullYear()}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
  return null;
}

// อ่านชีต imageUrl: A=ID, B=SKU, C=ชื่อ, D=รูป(ใส่เอง/สำรอง), E=รูปจาก ZORT(auto)
// ZORT คือแหล่งหลัก → รูปจาก ZORT (E) ชนะ, ใช้รูปใส่เอง (D) เฉพาะตอน ZORT ไม่มีรูป
function readImageMap_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_IMAGE_URL);
  if (!sh) return {};
  const rows = sh.getDataRange().getDisplayValues();
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const sku = (rows[i][1] || '').toString().trim().toUpperCase();
    if (!sku) continue;
    const manual = (rows[i][3] || '').toString().trim(); // D = สำรอง
    const zort   = (rows[i][4] || '').toString().trim(); // E = ZORT (หลัก)
    const url = zort || manual;
    if (url) map[sku] = url;
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
// PERF: อ่านหลายชีตในคำสั่งเดียว (Advanced Sheets Service — batchGet)
// ═══════════════════════════════════════════════════════════════════════════
// SpreadsheetApp อ่านได้ทีละชีต = วิ่งไป-กลับ Google server ~14 รอบต่อการ build payload
// 1 ครั้ง ซึ่งจาก timing log กินเวลา ~96% ของทั้งหมด · batchGet ดึงทุกชีตในรอบเดียว
//
// ความปลอดภัย: ถ้า Sheets API ใช้ไม่ได้ (ยังไม่เปิด service / โควตา / error ใด ๆ)
// จะคืน null ทุกชีต → ผู้เรียกทุกตัว fallback ไปอ่านเองแบบเดิมทุกประการ ระบบไม่พัง
//
// หมายเหตุสำคัญ: batchGet ตัดเซลล์ว่างท้ายแถวออก ทำให้แต่ละแถวยาวไม่เท่ากัน
// ต่างจาก getDisplayValues() ที่คืนตารางสี่เหลี่ยมเสมอ → ต้องเติม '' ให้ยาวเท่ากัน
// ก่อนส่งต่อ มิฉะนั้น r[10] จะเป็น undefined แทน '' (เสี่ยง column index เพี้ยน)
function batchReadFormatted_(sheetNames) {
  const out = {};
  sheetNames.forEach(function (n) { out[n] = null; });
  try {
    if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets) return out;
    const res = Sheets.Spreadsheets.Values.batchGet(SHEET_ID, {
      // quote ชื่อชีต (มีภาษาไทย/ช่องว่าง) — escape ' ด้วย '' ตามไวยากรณ์ A1 notation
      ranges: sheetNames.map(function (n) { return "'" + String(n).replace(/'/g, "''") + "'"; }),
      valueRenderOption: 'FORMATTED_VALUE',   // ให้ตรงกับ getDisplayValues() เดิม
      majorDimension: 'ROWS',
    });
    const vrs = (res && res.valueRanges) || [];
    vrs.forEach(function (vr, i) {
      const values = (vr && vr.values) || [];
      let w = 0;
      values.forEach(function (r) { if (r.length > w) w = r.length; });
      out[sheetNames[i]] = values.map(function (r) {
        if (r.length === w) return r;
        const c = r.slice();
        while (c.length < w) c.push('');
        return c;
      });
    });
  } catch (e) {
    // ไม่ throw ต่อ — ปล่อยให้ทุกตัว fallback อ่านเองแบบเดิม
    Logger.log('batchReadFormatted_ ใช้ไม่ได้ (fallback อ่านทีละชีตแบบเดิม): ' + e);
    sheetNames.forEach(function (n) { out[n] = null; });
  }
  return out;
}

// อ่านชีตสต็อก (SHEET_PRODUCTS) เป็น displayValues ครั้งเดียว เพื่อส่งต่อให้หลายฟังก์ชันใช้ร่วมกัน
// เดิม readProducts_ (ช่วง self-heal) กับ readSysQty_ ต่างคนต่างอ่านชีตเดียวกันด้วยคำสั่งเดียวกัน
// = เสียเวลา I/O ซ้ำฟรี ๆ (~1.3 วิ จากที่วัดได้) · คืน null ถ้าอ่านไม่ได้ → ผู้เรียก fallback อ่านเอง
function readStockSheetRows_() {
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    return sh ? sh.getDataRange().getDisplayValues() : null;
  } catch (e) {
    Logger.log('readStockSheetRows_ error: ' + e);
    return null;
  }
}

// stockRowsOpt = แถวของชีตสต็อกที่อ่านมาแล้ว (จาก readStockSheetRows_) — ไม่ส่งมาก็อ่านเองเหมือนเดิม
function readProducts_(stockRowsOpt, metaRowsOpt) {
  let rows = metaRowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCT_META);
    rows = sh.getDataRange().getDisplayValues();
  }
  const imageMap = readImageMap_();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sku  = (r[1] || '').toString().trim();
    const name = (r[2] || '').toString().trim();
    if (!sku && !name) continue;
    const qStore = parseQty_(r[8]);
    const qWH    = parseQty_(r[9]);
    const qTotal = parseQty_(r[10]);
    const locParsed = parseLocation_(r[4]);
    out.push({
      sku, name,
      imageUrl:    imageMap[sku.toUpperCase()] || (r[3] || '').toString().trim(),
      // ไม่ส่ง `locationRaw` — ไม่มีฝั่งไหนอ่านเลย (ข้อมูลเดียวกันถูกแปลงเป็น `locations` แล้ว)
      // ค่านี้ติดไปกับสินค้า **ทุกตัว** จึงเป็นไบต์เปล่าที่คูณด้วยจำนวน SKU
      locations:   locParsed ? [locParsed] : [],
      category:    (r[5] || '').toString().trim(),
      tag:         (r[6] || '').toString().trim(),
      vendor:      (r[7] || '').toString().trim(),
      qtyStore: qStore.num, qtyWH: qWH.num, qty: qTotal.num,
      qtyStatus: qTotal.status,
      isOversold: qTotal.status === 'negative',
      isOOS:      qTotal.status === 'oosfull' || qTotal.num <= 0,
      isMTO:      (r[5] || '').toString().includes('Made to Order'),
      price: 0, cost: 0, soldQty: 0, soldRev: 0, monthly: [], color: null,
    });
  }

  // SELF-HEAL: สินค้าที่มีใน "อัพเดทจำนวนสินค้า" (มีสต็อก) แต่ยังไม่มีใน "ข้อมูลสินค้า"
  // จะไม่ขึ้นเว็บ (เช่น สินค้าใหม่ที่ syncNewProductsFromZort เพิ่งเพิ่มเข้าชีตสต็อก)
  // → ดึงมาแสดงด้วย โดยใช้ ชื่อ/หมวด/tag/ราคา ที่ ZORT sync เขียนไว้ในชีตสต็อก
  try {
    const seen = {};
    out.forEach(p => { if (p.sku) seen[p.sku.toUpperCase()] = true; });

    // ใช้แถวที่อ่านมาแล้วถ้ามี (กันอ่านชีตเดิมซ้ำ) ไม่มีก็อ่านเองเหมือนเดิม
    let srows = stockRowsOpt;
    if (!srows) {
      const stockSh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
      srows = stockSh ? stockSh.getDataRange().getDisplayValues() : null;
    }
    if (srows) {
      for (let i = 1; i < srows.length; i++) {
        const r = srows[i];
        const sku = (r[COL_PROD_SKU - 1] || '').toString().trim();      // B
        if (!sku || seen[sku.toUpperCase()]) continue;
        seen[sku.toUpperCase()] = true;
        const qStore = parseQty_(r[COL_PROD_QTYFS - 1]);                // G
        const qWH    = parseQty_(r[COL_PROD_QTYWH - 1]);               // H
        const total  = qStore.num + qWH.num;
        const cat    = (r[3] || '').toString().trim();                  // D = หมวด
        out.push({
          sku,
          name:        (r[2] || '').toString().trim(),                  // C = ชื่อ
          imageUrl:    imageMap[sku.toUpperCase()] || '',
          locations:   [],
          category:    cat,
          tag:         (r[5] || '').toString().trim(),                  // F = TAG
          vendor:      '',
          qtyStore: qStore.num, qtyWH: qWH.num, qty: total,
          qtyStatus:  (qStore.status === 'negative' || qWH.status === 'negative') ? 'negative' : 'ok',
          isOversold: (qStore.num < 0 || qWH.num < 0),
          isOOS:      total <= 0,
          isMTO:      cat.includes('Made to Order'),
          price: 0, cost: 0, soldQty: 0, soldRev: 0, monthly: [], color: null,
          _fromStockSheet: true,   // มาจากชีตสต็อก (ยังไม่มีใน "ข้อมูลสินค้า")
        });
      }
    }
  } catch (e) {
    Logger.log('readProducts_ self-heal error: ' + e);
  }

  return out;
}

// stockRowsOpt = แถวของชีตสต็อกที่อ่านมาแล้ว (จาก readStockSheetRows_) — ไม่ส่งมาก็อ่านเองเหมือนเดิม
function readSysQty_(stockRowsOpt) {
  let rows = stockRowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    if (!sh) return {};
    rows = sh.getDataRange().getDisplayValues();
  }
  const map = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[1] || '').toString().trim().toUpperCase();
    if (!sku) continue;
    map[sku] = { sysStore: parseInt(r[6]) || 0, sysWH: parseInt(r[7]) || 0 };
  }
  return map;
}

function readMonthlySales_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_MONTHLY_SALES);
    if (!sh) return { monthLabels: [], monthlyByCat: {}, perSku: {} };
    rows = sh.getDataRange().getDisplayValues();
  }
  if (rows.length < 3) return { monthLabels: [], monthlyByCat: {}, perSku: {} };
  const monthRow = rows[0];
  const cols = [];
  const seen = new Set();
  for (let c = 4; c < monthRow.length; c++) {
    const mk = monthKey_(monthRow[c]);
    if (mk && !seen.has(mk)) {
      seen.add(mk);
      cols.push({ key: mk, qtyCol: c, revCol: c + 1 });
    }
  }
  const monthLabels = cols.map(c => c.key);
  const byCat = {}, perSku = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku  = (r[1] || '').toString().trim();
    const name = (r[2] || '').toString().trim();
    const cat  = (r[3] || '').toString().trim() || 'ไม่ระบุ';
    if (!sku && !name) continue;
    let tQty = 0, tRev = 0;
    const months = {};
    cols.forEach(mc => {
      const qty = parseInt(String(r[mc.qtyCol] || '0').replace(/,/g, '')) || 0;
      const rev = parseNum_(r[mc.revCol]);
      months[mc.key] = { qty, sales: rev };
      tQty += qty; tRev += rev;
      byCat[mc.key] = byCat[mc.key] || {};
      byCat[mc.key][cat] = byCat[mc.key][cat] || { qty: 0, sales: 0 };
      byCat[mc.key][cat].qty   += qty;
      byCat[mc.key][cat].sales += rev;
    });
    if (sku) perSku[sku] = { months, totalQty: tQty, totalRev: tRev };
  }
  return { monthLabels, monthlyByCat: byCat, perSku };
}

function readDailySales_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_DAILY_SALES);
    if (!sh) return { dayLabels: [], dailyByCat: {} };
    rows = sh.getDataRange().getDisplayValues();
  }
  if (rows.length < 3) return { dayLabels: [], dailyByCat: {} };
  const dayRow = rows[0];
  const cols = [];
  const seen = new Set();
  for (let c = 4; c < dayRow.length; c++) {
    const dk = dayKey_(dayRow[c]);
    if (dk && !seen.has(dk)) {
      seen.add(dk);
      cols.push({ key: dk, qtyCol: c, revCol: c + 1 });
    }
  }
  const dayLabels = cols.map(c => c.key);
  const byCat = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[2] || '').toString().trim();
    const cat  = (r[3] || '').toString().trim() || 'ไม่ระบุ';
    if (!name) continue;
    cols.forEach(dc => {
      const qty = parseInt(String(r[dc.qtyCol] || '0').replace(/,/g, '')) || 0;
      const rev = parseNum_(r[dc.revCol]);
      if (qty === 0 && rev === 0) return;
      byCat[dc.key] = byCat[dc.key] || {};
      byCat[dc.key][cat] = byCat[dc.key][cat] || { qty: 0, sales: 0 };
      byCat[dc.key][cat].qty   += qty;
      byCat[dc.key][cat].sales += rev;
    });
  }
  return { dayLabels, dailyByCat: byCat };
}

function readTransfers_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TRANSFERS_HIST);
    if (!sh) return [];
    rows = sh.getDataRange().getDisplayValues();
  }
  if (rows.length < 3) return [];
  const list = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[7] || '').toString().trim();
    if (!sku) continue;
    list.push({
      type:   (r[1] || '').toString().trim(),
      txnId:  (r[2] || '').toString().trim(),
      date:   (r[3] || '').toString().trim(),
      status: (r[4] || '').toString().trim(),
      from:   (r[5] || '').toString().trim(),
      to:     (r[6] || '').toString().trim(),
      sku,
      name:   (r[8] || '').toString().trim(),
      qty:    parseInt(r[9]) || 0,
    });
  }
  return list;
}

// อ่านชีต "รายการโอนสินค้า" (SHEET_TRANSFERS) — ของที่ warehouse ส่งออกจากคลัง
// ใช้เป็น data source ของแท็บ "ส่งแล้ว" ให้ sale/FS ยืนยันรับของ
function readShipments_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TRANSFERS);
    if (!sh) return [];
    rows = sh.getDataRange().getDisplayValues();
  }
  if (rows.length < 3) return [];
  const list = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[COL_SHIP_SKU - 1] || '').toString().trim();
    if (!sku) continue;
    const recvAt = (r[COL_SHIP_RECVAT - 1] || '').toString().trim();
    list.push({
      id:             'S' + (i + 1),  // 1-indexed sheet row
      refNum:         (r[COL_SHIP_REF - 1]    || '').toString().trim(),
      date:           (r[COL_SHIP_DATE - 1]   || '').toString().trim(),
      status:         (r[COL_SHIP_STATUS - 1] || '').toString().trim(),
      from:           (r[COL_SHIP_FROM - 1]   || '').toString().trim(),
      to:             (r[COL_SHIP_TO - 1]     || '').toString().trim(),
      sku,
      name:           (r[COL_SHIP_NAME - 1]   || '').toString().trim(),
      qty:            parseInt(r[COL_SHIP_QTY - 1]) || 0,
      image:          (r[COL_SHIP_IMAGE - 1]  || '').toString().trim(),
      receivedQty:    recvAt ? (parseInt(r[COL_SHIP_RECVQTY - 1]) || 0) : null,
      receivedStatus: (r[COL_SHIP_RECVSTATUS - 1] || '').toString().trim(),
      receivedAt:     recvAt,
      receivedBy:     (r[COL_SHIP_RECVBY - 1] || '').toString().trim(),
      preparedBy:     (r[COL_SHIP_PREPAREDBY - 1] || '').toString().trim(),
    });
  }
  return list;
}

// ย้ายรายการที่ "ปิดเคสแล้ว" (รับครบ/รับไม่ครบ) ออกจากชีต "รายการโอนสินค้า" → เก็บในชีตประวัติ
// เพื่อไม่ให้ชีตหลัก/แท็บส่งแล้วบวม ส่วนที่ยังไม่เคยยืนยันรับเลย (receivedAt ว่าง) จะคาไว้เสมอ
// เพราะยังรอ action จริงจากหน้าร้าน
// ⚠️ ตั้ง trigger รายวัน (เช่น ตี 3) + รันเองครั้งแรกได้ (ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown)
//
// ⚠️⚠️ เดิม "รับครบ" ถูกย้ายออก **ทันทีในรอบ trigger ถัดไป ไม่รอเลย** — ของที่หน้าร้านกดรับ
// ตอนเย็น พอเช้ามาก็หายจากหน้าจอแล้ว ทำให้ "เช็คซ้ำว่าได้ของครบจริงไหม" ทำไม่ได้เลย ทั้งที่
// การเช็คซ้ำเป็นขั้นตอนปกติของหน้าร้าน (เจอจริง ส.ค. 2026 — หาใบ TF ที่เพิ่งรับเมื่อวานไม่เจอ
// แล้วเข้าใจกันว่า "ข้อมูลหาย" ทั้งที่ยังอยู่ครบในชีตประวัติที่ไม่มีหน้าไหนอ่าน)
// ตอนนี้ทุกสถานะเก็บไว้ในชีตหลัก SHIP_ARCHIVE_KEEP_DAYS วันก่อนเสมอ นับจากเวลายืนยันรับ
// → หน้าร้านย้อนดูของทั้งเดือนได้
const SHIP_ARCHIVE_KEEP_DAYS = 30;

// "ของเก่าที่ยังไม่มีใครกดรับเลย" เก็บไว้กี่วันก่อนย้ายเข้าประวัติ (ใช้กับ cleanupOldPendingShipments)
// 1 = เหลือของเมื่อวาน + วันนี้ ที่เก่ากว่านั้นถือว่าเลยรอบเช็คไปแล้ว
const PENDING_CLEANUP_KEEP_DAYS = 1;

// แปลง "dd/MM/yyyy" หรือ "dd/MM/yyyy HH:mm" ในชีตโอน → epoch ms (null ถ้าอ่านไม่ออก)
// รองรับปี พ.ศ. ด้วย เผื่อแถวเก่าที่เคยเขียนมาจากฝั่ง client (บทเรียนข้อ 11 ใน CLAUDE.md)
function parseShipDayMs_(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  let y = +m[3];
  if (y >= 2400) y -= 543;
  return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
}

// แปลง "dd/MM/yyyy HH:mm" (ค่าที่ confirmShipmentReceive เขียนลง COL_SHIP_RECVAT) เป็น Date
function parseShipRecvAt_(s) {
  const ms = parseShipDayMs_(s);
  return ms == null ? null : new Date(ms);
}

// เวลาที่ถือว่าแถวนี้ "ปิดเคส" — ใช้เวลายืนยันรับเป็นหลัก อ่านไม่ออกก็ถอยไปใช้วันที่ทำรายการ
function shipCloseMs_(row) {
  const a = parseShipDayMs_(row[COL_SHIP_RECVAT - 1]);
  if (a != null) return a;
  return parseShipDayMs_(row[COL_SHIP_DATE - 1]);
}

// คีย์กันซ้ำ เวลาย้ายแถวไป-กลับระหว่างชีตหลักกับชีตประวัติ
function shipDedupKey_(row) {
  const sku = String(row[COL_SHIP_SKU - 1] || '').trim().toUpperCase();
  if (!sku) return '';
  return String(row[COL_SHIP_REF - 1] || '').trim() + '|' + sku + '|'
       + String(row[COL_SHIP_QTY - 1] || '').trim();
}

// ปรับความกว้างแถวให้เท่าชีตปลายทาง (setValues บังคับให้ทุกแถวกว้างเท่ากันเป๊ะ)
function normalizeShipRow_(row, width) {
  const out = [];
  for (let i = 0; i < width; i++) out.push(i < row.length ? row[i] : '');
  return out;
}

function archiveReceivedShipments() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sheet) { Logger.log("archiveReceivedShipments: ไม่พบชีต " + SHEET_TRANSFERS); return; }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("archiveReceivedShipments: lock ไม่ได้"); return; }

  try {
    const data = sheet.getDataRange().getValues();
    if (data.length < 3) return;  // มีแค่หัวตาราง 2 แถว

    // หาแถวที่ "ปิดเคสแล้ว **และ** เลยรอบเช็คของหน้าร้านไปแล้ว" (ข้อมูลเริ่ม index 2 = sheet row 3)
    // ทั้ง "รับครบ" และ "รับไม่ครบ" ใช้เกณฑ์เดียวกัน = ครบ SHIP_ARCHIVE_KEEP_DAYS วันนับจาก
    // เวลายืนยันรับ · อ่านวันที่ไม่ออกเลย (แถวเก่า/รูปแบบเพี้ยน) → ย้ายได้ ถือว่าเก่าจริง
    const keepMs = SHIP_ARCHIVE_KEEP_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const toArchive = [];  // { rowNum, values }
    for (let i = 2; i < data.length; i++) {
      const sku    = String(data[i][COL_SHIP_SKU - 1] || "").trim();
      if (!sku) continue;
      const status = String(data[i][COL_SHIP_RECVSTATUS - 1] || "").trim();
      if (status !== "รับครบ" && status !== "รับไม่ครบ") continue;  // ยังไม่มีใครกดรับ → คาไว้
      const closeMs = shipCloseMs_(data[i]);
      if (closeMs != null && (now - closeMs) < keepMs) continue;    // ยังอยู่ในช่วงให้เช็คซ้ำ
      toArchive.push({ rowNum: i + 1, values: data[i] });
    }
    if (!toArchive.length) { Logger.log("archiveReceivedShipments: ไม่มีรายการที่ต้อง archive"); return; }

    // เขียนลงชีตประวัติ (สร้างถ้ายังไม่มี)
    let arch = ss.getSheetByName(SHEET_SHIP_ARCHIVE);
    if (!arch) { arch = ss.insertSheet(SHEET_SHIP_ARCHIVE); arch.appendRow(SHIP_HEADERS); }
    const rows = toArchive.map(t => t.values);
    arch.getRange(arch.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    // ลบออกจากชีตหลัก — ลบจากแถวล่างขึ้นบน กัน index เลื่อน
    toArchive.sort((a, b) => b.rowNum - a.rowNum);
    toArchive.forEach(t => sheet.deleteRow(t.rowNum));

    SpreadsheetApp.flush();
    invalidateCache_();
    Logger.log("archiveReceivedShipments: ย้าย " + toArchive.length + " รายการเข้า " + SHEET_SHIP_ARCHIVE);
  } finally {
    lock.releaseLock();
  }
}

// ตั้ง trigger เก็บกวาดรายการที่รับของแล้วออกจากแท็บ "ส่งแล้ว" อัตโนมัติ ทุกวันตี 3
// รันฟังก์ชันนี้เองครั้งเดียวใน GAS editor เพื่อสร้าง trigger (ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown)
// ผลลัพธ์: หน้า "รายการสั่งของ → 🚚 ส่งแล้ว" ของ frontstore จะเหลือเฉพาะที่ยังรอรับจริง ๆ
function setupShipmentArchiveTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "archiveReceivedShipments") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("archiveReceivedShipments").timeBased().everyDays(1).atHour(3).create();
  Logger.log("✅ ตั้ง trigger: archiveReceivedShipments ทุกวัน 03:00");
  // เก็บกวาดของที่ค้างสะสมอยู่ตอนนี้ให้เลย ไม่ต้องรอถึงตี 3
  archiveReceivedShipments();
}

// ─────────────────────────────────────────────────────────────────────
// กู้ / เคลียร์ รายการโอน — เครื่องมือให้เจ้าของรันเองใน GAS editor
// ─────────────────────────────────────────────────────────────────────
// ทั้งสองตัวเป็นการ **ย้ายแถวระหว่าง 2 ชีต** ไม่มีการลบข้อมูลทิ้งเลย → กลับทางได้เสมอ
// (restore ↔ cleanup เป็นคู่กัน) · ชีตหลัก "รายการโอนสินค้า" = สิ่งที่หน้าเว็บอ่าน,
// ชีต "ประวัติรับสินค้า" = คลังเก็บที่ยังไม่มีหน้าไหนอ่าน (ดู PLAN ต่อยอดท้ายไฟล์นี้)

// กู้รายการที่ถูกย้ายเข้าประวัติ "เร็วเกินไป" กลับเข้าชีตหลัก
// เกณฑ์ = อะไรที่ยังไม่ครบ SHIP_ARCHIVE_KEEP_DAYS วัน ควรอยู่ในชีตหลักตามนโยบายใหม่
// ข้ามแถวที่มีอยู่ในชีตหลักแล้ว (เทียบด้วย shipDedupKey_) → รันซ้ำกี่รอบก็ไม่เกิดของซ้ำ
function restoreArchivedShipments() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const main = ss.getSheetByName(SHEET_TRANSFERS);
  const arch = ss.getSheetByName(SHEET_SHIP_ARCHIVE);
  if (!main) { Logger.log("restoreArchivedShipments: ไม่พบชีต " + SHEET_TRANSFERS); return; }
  if (!arch) { Logger.log("restoreArchivedShipments: ยังไม่มีชีต " + SHEET_SHIP_ARCHIVE + " — ไม่มีอะไรให้กู้"); return; }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("restoreArchivedShipments: lock ไม่ได้"); return; }
  try {
    const aVals = arch.getDataRange().getValues();
    if (aVals.length < 2) { Logger.log("restoreArchivedShipments: ชีตประวัติว่าง"); return; }

    const mainWidth = Math.max(main.getLastColumn(), SHIP_HEADERS.length);
    const archWidth = Math.max(aVals[0].length, SHIP_HEADERS.length);

    // แถวที่มีในชีตหลักอยู่แล้ว — กันกู้ซ้ำ
    const mVals = main.getDataRange().getValues();
    const seen = {};
    for (let i = 2; i < mVals.length; i++) {
      const k = shipDedupKey_(mVals[i]);
      if (k) seen[k] = true;
    }

    const cutoff = Date.now() - SHIP_ARCHIVE_KEEP_DAYS * 24 * 60 * 60 * 1000;
    const bring = [], keep = [];
    for (let i = 1; i < aVals.length; i++) {     // ชีตประวัติมีหัวตารางแถวเดียว
      const r   = aVals[i];
      const sku = String(r[COL_SHIP_SKU - 1] || "").trim();
      if (!sku) continue;                        // แถวว่าง → ทิ้งไปเลย ไม่ต้องเก็บต่อ
      const closeMs = shipCloseMs_(r);
      const k = shipDedupKey_(r);
      // อ่านวันที่ไม่ออก → ไม่กู้ (ปล่อยไว้ในประวัติ ดีกว่าเดาแล้วดันของเก่ากลับขึ้นหน้าจอ)
      if (closeMs != null && closeMs >= cutoff && k && !seen[k]) {
        bring.push(normalizeShipRow_(r, mainWidth));
        seen[k] = true;
      } else {
        keep.push(normalizeShipRow_(r, archWidth));
      }
    }

    if (!bring.length) {
      Logger.log("restoreArchivedShipments: ไม่มีรายการที่ต้องกู้ (ในประวัติมี " + (aVals.length - 1) + " แถว)");
      return;
    }

    main.getRange(main.getLastRow() + 1, 1, bring.length, mainWidth).setValues(bring);
    // ลบออกจากประวัติ = "ย้าย" ไม่ใช่ "ก็อป" — ไม่งั้น archive รอบหน้าจะเจอทั้งสองที่แล้วซ้ำ
    if (arch.getLastRow() > 1) arch.getRange(2, 1, arch.getLastRow() - 1, archWidth).clearContent();
    if (keep.length)           arch.getRange(2, 1, keep.length, archWidth).setValues(keep);

    SpreadsheetApp.flush();
    invalidateCache_();
    Logger.log("✅ restoreArchivedShipments: กู้กลับ " + bring.length + " แถว (เหลือในประวัติ " + keep.length + " แถว)");
  } finally {
    lock.releaseLock();
  }
}

// ย้าย "ของที่ส่งออกจากคลังแล้วแต่ไม่เคยมีใครกดรับเลย" ที่เก่ากว่า PENDING_CLEANUP_KEEP_DAYS วัน
// เข้าชีตประวัติ — ล้างแท็บ "🚚 ส่งแล้ว" ให้เหลือเฉพาะรอบที่ยังต้องเช็คจริง
// ⚠️ ย้าย ไม่ใช่ลบ — ข้อมูลอยู่ครบใน "ประวัติรับสินค้า" · เอากลับได้ด้วย restoreArchivedShipments()
//    (ตัวนั้นกู้เฉพาะที่ปิดเคสแล้ว ถ้าอยากได้ค้างรับเก่ากลับต้องก็อปจากชีตประวัติเอง)
function cleanupOldPendingShipments() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const main = ss.getSheetByName(SHEET_TRANSFERS);
  if (!main) { Logger.log("cleanupOldPendingShipments: ไม่พบชีต " + SHEET_TRANSFERS); return; }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("cleanupOldPendingShipments: lock ไม่ได้"); return; }
  try {
    const data = main.getDataRange().getValues();
    if (data.length < 3) { Logger.log("cleanupOldPendingShipments: ไม่มีข้อมูล"); return; }

    const t = new Date();
    const startToday = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const cutoff = startToday - PENDING_CLEANUP_KEEP_DAYS * 24 * 60 * 60 * 1000;

    const toMove = [];   // { rowNum, values }
    for (let i = 2; i < data.length; i++) {
      const sku = String(data[i][COL_SHIP_SKU - 1] || "").trim();
      if (!sku) continue;
      const recvAt = String(data[i][COL_SHIP_RECVAT - 1] || "").trim();
      if (recvAt) continue;                       // เคยกดรับแล้ว → ให้ archiveReceivedShipments จัดการตามอายุ
      const dayMs = parseShipDayMs_(data[i][COL_SHIP_DATE - 1]);
      if (dayMs == null) continue;                // อ่านวันที่ไม่ออก → ไม่แตะ (ไม่เดา)
      if (dayMs >= cutoff) continue;              // ของเมื่อวาน/วันนี้ → เก็บไว้ให้เช็ค
      toMove.push({ rowNum: i + 1, values: data[i] });
    }
    if (!toMove.length) { Logger.log("cleanupOldPendingShipments: ไม่มีของค้างเก่าที่ต้องเคลียร์"); return; }

    let arch = ss.getSheetByName(SHEET_SHIP_ARCHIVE);
    if (!arch) { arch = ss.insertSheet(SHEET_SHIP_ARCHIVE); arch.appendRow(SHIP_HEADERS); }
    const archWidth = Math.max(arch.getLastColumn(), SHIP_HEADERS.length);
    const rows = toMove.map(function (x) { return normalizeShipRow_(x.values, archWidth); });
    arch.getRange(arch.getLastRow() + 1, 1, rows.length, archWidth).setValues(rows);

    // ลบจากแถวล่างขึ้นบน กัน index เลื่อน (แพทเทิร์นเดียวกับ archiveReceivedShipments)
    toMove.sort(function (a, b) { return b.rowNum - a.rowNum; });
    toMove.forEach(function (x) { main.deleteRow(x.rowNum); });

    SpreadsheetApp.flush();
    invalidateCache_();
    Logger.log("✅ cleanupOldPendingShipments: ย้ายของค้างเก่า " + toMove.length + " แถวเข้า " + SHEET_SHIP_ARCHIVE);
  } finally {
    lock.releaseLock();
  }
}

// ดูก่อนว่า 2 ตัวข้างบนจะทำอะไรบ้าง — **อ่านอย่างเดียว ไม่แก้ข้อมูล** รันดูก่อนได้เสมอ
function previewShipmentCleanup() {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const main = ss.getSheetByName(SHEET_TRANSFERS);
  const arch = ss.getSheetByName(SHEET_SHIP_ARCHIVE);
  const now = Date.now();
  const restoreCutoff = now - SHIP_ARCHIVE_KEEP_DAYS * 24 * 60 * 60 * 1000;
  const t = new Date();
  const startToday = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const pendCutoff = startToday - PENDING_CLEANUP_KEEP_DAYS * 24 * 60 * 60 * 1000;

  let willRestore = 0, staysArchived = 0;
  if (arch) {
    const aVals = arch.getDataRange().getValues();
    for (let i = 1; i < aVals.length; i++) {
      if (!String(aVals[i][COL_SHIP_SKU - 1] || "").trim()) continue;
      const closeMs = shipCloseMs_(aVals[i]);
      if (closeMs != null && closeMs >= restoreCutoff) {
        willRestore++;
        if (willRestore <= 20) {
          Logger.log("  กู้กลับ: " + String(aVals[i][COL_SHIP_REF - 1] || "") + " · "
            + String(aVals[i][COL_SHIP_SKU - 1] || "") + " · รับเมื่อ "
            + String(aVals[i][COL_SHIP_RECVAT - 1] || "-"));
        }
      } else staysArchived++;
    }
  }

  let willClear = 0, pendKept = 0, closedKept = 0;
  if (main) {
    const mVals = main.getDataRange().getValues();
    for (let i = 2; i < mVals.length; i++) {
      if (!String(mVals[i][COL_SHIP_SKU - 1] || "").trim()) continue;
      const recvAt = String(mVals[i][COL_SHIP_RECVAT - 1] || "").trim();
      if (recvAt) { closedKept++; continue; }
      const dayMs = parseShipDayMs_(mVals[i][COL_SHIP_DATE - 1]);
      if (dayMs != null && dayMs < pendCutoff) {
        willClear++;
        if (willClear <= 20) {
          Logger.log("  เคลียร์ค้างเก่า: " + String(mVals[i][COL_SHIP_REF - 1] || "") + " · "
            + String(mVals[i][COL_SHIP_SKU - 1] || "") + " · ส่งวันที่ "
            + String(mVals[i][COL_SHIP_DATE - 1] || "-"));
        }
      } else pendKept++;
    }
  }

  Logger.log("── สรุป (ยังไม่ได้แก้อะไร) ──");
  Logger.log("restoreArchivedShipments() จะกู้กลับ " + willRestore + " แถว (ค้างในประวัติต่อ " + staysArchived + ")");
  Logger.log("cleanupOldPendingShipments() จะย้ายของค้างเก่า " + willClear + " แถว (เหลือค้างรับ " + pendKept + ")");
  Logger.log("ในชีตหลักมีของที่กดรับแล้ว " + closedKept + " แถว (เก็บไว้ " + SHIP_ARCHIVE_KEEP_DAYS + " วันตามนโยบายใหม่)");
  return { willRestore: willRestore, staysArchived: staysArchived, willClear: willClear, pendKept: pendKept, closedKept: closedKept };
}

function readPurchases_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PURCHASES);
  if (!sh) return [];
  // getValues() ให้ Date object ถ้า cell เป็น Date type → format เป็น ISO ได้ถูกต้อง
  // getDisplayValues() ให้ text ที่ format ตาม locale ของ sheet → อาจ sort ผิด
  const rawRows = sh.getDataRange().getValues();
  const tz = Session.getScriptTimeZone();
  if (rawRows.length < 3) return [];
  const list = [];
  for (let i = 2; i < rawRows.length; i++) {
    const r = rawRows[i];
    const sku = (r[24] || '').toString().trim();
    if (!sku) continue;
    // แปลง date เป็น yyyy-MM-dd (ISO) เพื่อให้ string comparison sort ถูกลำดับ
    let dateStr = '';
    const rawDate = r[11];
    if (rawDate instanceof Date && !isNaN(rawDate)) {
      dateStr = Utilities.formatDate(rawDate, tz, 'yyyy-MM-dd');
    } else {
      // fallback: text DD/MM/YYYY → แปลงเป็น ISO
      const s = String(rawDate || '').trim();
      const p = s.split('/');
      if (p.length === 3) {
        const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
        if (!isNaN(d)) dateStr = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
        else dateStr = s;
      } else {
        dateStr = s;
      }
    }
    list.push({
      type:      String(r[1]  || '').trim(),
      poNum:     String(r[2]  || '').trim(),
      supplier:  String(r[4]  || '').trim(),
      date:      dateStr,
      status:    (r[19] || '').toString().trim(),
      warehouse: (r[20] || '').toString().trim(),
      sku,
      name:      (r[25] || '').toString().trim(),
      qty:       parseInt(r[26]) || 0,
      unitPrice: parseNum_(r[27]),
    });
  }
  return list;
}

function readStorage_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_LOCKS);
    if (!sh) return { entries: [], lockMap: {} };
    rows = sh.getDataRange().getDisplayValues();
  }
  if (rows.length < 2) return { entries: [], lockMap: {} };
  const entries = [], lockMap = {};
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[1] || '').toString().trim();
    const loc = (r[2] || '').toString().trim();
    if (!sku || !loc) continue;
    const parsed = parseLocation_(loc);
    const e = {
      sku, location: loc,
      qty:       parseInt(r[3]) || 0,
      sysQty:    parseInt(r[4]) || 0,
      status:    (r[5] || '').toString().trim(),
      imageUrl:  (r[6] || '').toString().trim(),
      lastCheck: (r[7] || '').toString().trim(),
      supplier:  (r[8] || '').toString().trim(),
      side:    parsed ? parsed.side  : null,
      shelf:   parsed ? parsed.shelf : null,
      lockNum: parsed ? parsed.lock  : null,
      floor:   parsed ? !!parsed.floor : false,   // A0/B0 = ไม่ได้อยู่บนชั้นวาง
    };
    entries.push(e);
    if (parsed) {
      const key = lockKeyOf_(parsed);
      lockMap[key] = lockMap[key] || [];
      lockMap[key].push({ sku: e.sku, qty: e.qty, sysQty: e.sysQty, status: e.status, lastCheck: e.lastCheck });
    }
  }
  return { entries, lockMap };
}

function readOrders_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_ORDERS);
    if (!sheet) {
      Logger.log("[readOrders_] ERROR: ไม่พบ sheet '" + SHEET_ORDERS + "'");
      return [];
    }
    rows = sheet.getDataRange().getDisplayValues();
  }
  const result = [];
  let skippedBlank = 0, skippedHeader = 0, skippedNoSku = 0;

  // i=1: skip only the first header row; also handles sheets with a single header row
  // where CH19015/OL00005 might be at index 1 (row 2)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // Skip rows that are entirely blank
    if (!r.some(Boolean)) { skippedBlank++; continue; }
    // Skip what looks like a second header row (r[5] is a Thai-language label, not a SKU)
    const skuCandidate = String(r[5] || "").trim();
    if (skuCandidate && /[฀-๿]/.test(skuCandidate)) {
      skippedHeader++;
      Logger.log("[readOrders_] skip header row " + (i+1) + " col F='" + skuCandidate + "'");
      continue;
    }
    // Skip rows with no SKU at all — log เพื่อ debug ถ้ามีข้อมูลในคอลัมน์อื่น
    if (!skuCandidate) {
      skippedNoSku++;
      const hasOtherData = r.some((v, idx) => idx !== 5 && String(v||"").trim());
      if (hasOtherData) Logger.log("[readOrders_] skip row " + (i+1) + " col F empty (name='" + (r[6]||"") + "' qty=" + r[7] + ")");
      continue;
    }
    result.push({
      id:          `R${i+1}`,
      carryMode:   String(r[0]||"").includes("หิ้ว") ? "carry" : "truck",
      date:        String(r[1] || "").trim(),
      status:      r[2] || "รอ",
      from:        r[3] || "",
      to:          r[4] || "",
      sku:         skuCandidate,
      name:        r[6] || "",
      orderQty:    Number(r[7]) || 0,
      preparedQty: Number(r[8]) || 0,
      image:       r[9] || "",
      remaining:   r[10] !== "" ? Number(r[10]) : null,
      // ผู้สั่ง (L) / ผู้จัด (M) — แถวเก่าก่อนเพิ่มฟีเจอร์นี้จะว่าง frontend ต้องรองรับ
      orderedBy:   String(r[11] || "").trim(),
      preparedBy:  String(r[12] || "").trim(),
      printFlag:   r[13] || null,
    });
  }
  Logger.log("[readOrders_] result=" + result.length + " skippedBlank=" + skippedBlank + " skippedHeader=" + skippedHeader + " skippedNoSku=" + skippedNoSku);
  return result;
}

function readFrontStoreCheckedQty_(rowsOpt) {
  let rows = rowsOpt;
  if (!rows) {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_FRONTSTORE_QTY);
    if (!sh) return {};
    rows = sh.getDataRange().getDisplayValues();
  }
  const map = {};
  for (let i = 1; i < rows.length; i++) {
    const sku = String(rows[i][1] || "").trim().toUpperCase();
    const qty = rows[i][3];
    if (sku && qty !== "" && qty != null)
      map[sku] = {
        qty: parseInt(String(qty).replace(/,/g, "")) || 0,
        at:  String(rows[i][8] || "").trim(), // I = วันเช็คล่าสุด (เขียนโดย updateFrontStore)
      };
  }
  return map;
}

function readQtyByLocation_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sh) return {};
  const rows = sh.getRange('B2:I' + sh.getLastRow()).getValues();
  const map = {};
  rows.forEach(function(r) {
    const sku = (r[0] || '').toString().trim().toUpperCase();
    if (!sku) return;
    map[sku] = {
      qtyStore: parseInt(r[5])   || 0,  // G = index 5 (range starts at B)
      qtyWH:    parseInt(r[6])   || 0,  // H = index 6
      price:    parseFloat(r[7]) || 0   // I = index 7
    };
  });
  return map;
}

// ── Phase 7.4: ก้อนเบาสำหรับ poll เลขสต็อก (แท็บนับสต็อก / เช็คหน้าร้าน) ─────────────
// เดิมสองแท็บนี้ดึง **payload ทั้งก้อน (~4.2MB) ทุก 30 วินาที** ทั้งที่ต้องการแค่ "เลขสต็อกอ้างอิง"
// ให้หลายเครื่องเห็นงานของกันและกัน → เครื่องที่จอดหน้าร้านทั้งวันกินราว **500MB/ชม./เครื่อง**
// และเป็นตัวเดียวกับที่ทำให้ 15 เครื่องพร้อมกันได้ HTTP 404 (ดูคำอธิบายที่ `action=ver`)
//
// ก้อนนี้อ่านแค่ 2 ชีต (สต็อก + จำนวนหน้าร้าน) แทน 9 ชีต และส่งเฉพาะตัวเลขที่แท็บพวกนั้นใช้จริง
// **ส่งเป็น array ไม่ใช่ object โดยตั้งใจ** — เมื่อมีสินค้าหลักพันตัว ชื่อคีย์ที่ซ้ำทุกแถว
// คือส่วนที่ใหญ่ที่สุดของก้อน (`{"sku":...,"qtyStore":...}` ยาวกว่า `[...]` เกิน 2 เท่า)
// ลำดับคอลัมน์: [sku, หน้าร้าน, คลัง, จำนวนที่เช็คไว้, วันที่เช็คล่าสุด]
// ⚠️ **ห้ามสลับ/แทรกคอลัมน์กลางแถว** — ฝั่ง client อ่านตามตำแหน่ง สลับแล้วเลขสต็อกจะเพี้ยน
// แบบไม่มี error ให้เห็น (บทเรียนเดียวกับ column index ในชีต) ถ้าต้องเพิ่มให้ต่อท้ายเท่านั้น
function stockLiteHandler_() {
  const cached = _readChunked_(_STOCKLITE_KEY_COUNT, _STOCKLITE_KEY_PART);
  if (cached.str) return ContentService.createTextOutput(cached.str)
    .setMimeType(ContentService.MimeType.JSON);

  const locMap = readQtyByLocation_();          // ชีตสต็อก = แหล่งที่ ZORT sync เขียน (สดที่สุด)
  const fsMap  = readFrontStoreCheckedQty_();
  const items = [];
  Object.keys(locMap).forEach(function (skuU) {
    const loc = locMap[skuU];
    const fs  = fsMap[skuU];
    items.push([
      skuU, loc.qtyStore, loc.qtyWH,
      fs ? fs.qty : null,                       // null = ยังไม่เคยเช็ค (ต่างจากเช็คแล้วได้ 0)
      (fs && fs.at) ? fs.at : ''
    ]);
  });
  const out = JSON.stringify({ ok: true, ts: getSheetLastModified_(), items: items });
  _writeChunked_(out, _STOCKLITE_KEY_COUNT, _STOCKLITE_KEY_PART, _STOCKLITE_TTL_SEC);
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

// ── รวมจำนวนจริงจากชีต "อัพเดทจำนวนสินค้า" (loc) เข้ากับสินค้า 1 ตัว ──
// loc = 1 entry จาก readQtyByLocation_ ({qtyStore, qtyWH, price}) · แก้ p ในที่ (mutate)
// ไม่มี loc (สินค้าไม่มีแถวในชีตสต็อก) → ไม่แตะอะไรเลย ปล่อยค่าจาก readProducts_ ตามเดิม
//
// ⚠️ ประวัติบั๊ก (2026-07-31, เคสสินค้า WL ทั้งหมดโชว์ "หมด" ทั้งที่มีของจริง):
// เดิมโค้ดตรงนี้เขียนทับแค่ qtyStore/qtyWH แล้ว **ไม่คำนวณ qty/qtyStatus/isOOS ใหม่**
// ค่าพวกนั้นจึงค้างจากคอลัมน์ I/J/K ของชีต "ข้อมูลสินค้า" ซึ่งเก่า/ไม่อัปเดต (มักเป็น 0)
// → สินค้าที่มีสต็อกจริง เช่น WL00002 (qtyStore=41, qtyWH=240) โชว์ qty=0 = "หมด" บนเว็บ
// โดยไม่มี error ให้เห็น · ชีตสต็อกคือแหล่งที่ ZORT sync เขียน = สดกว่าเสมอ ต้องชนะทุกครั้ง
// แยกออกมาเป็นฟังก์ชันเดี่ยวเพื่อให้ tests/qtyloc.test.js eval จาก .gs ได้ตรง ๆ (ไม่ copy = ไม่ drift)
function applyQtyLocToProduct_(p, loc) {
  if (!p || !loc) return p;
  p.qtyStore     = loc.qtyStore;
  p.qtyWH        = loc.qtyWH;
  if (loc.price > 0) p.price = loc.price;

  const locTotal = loc.qtyStore + loc.qtyWH;
  p.qty        = locTotal;
  p.qtyStatus  = locTotal < 0 ? 'negative' : 'ok';
  p.isOversold = locTotal < 0;
  p.isOOS      = locTotal <= 0;
  return p;
}

// เขียนหัวคอลัมน์ L/M ให้ครั้งแรกที่ใช้ — เจ้าของเปิดชีตดูเองจะได้รู้ว่าช่องนี้คืออะไร
// idempotent: มีค่าอยู่แล้วไม่แตะ · ไม่ throw (หัวตารางไม่ขึ้นห้ามทำให้สั่งของไม่ได้)
function ensureOrderPeopleHeaders_(sheet) {
  try {
    var rng = sheet.getRange(1, COL_ORD_ORDERBY, 1, 2);
    var v = rng.getValues()[0];
    if (String(v[0] || '').trim() === '' && String(v[1] || '').trim() === '') {
      rng.setValues([['ผู้สั่ง', 'ผู้จัด']]);
    }
  } catch (e) { /* ignore */ }
}

// ── กันสั่งซ้ำ (idempotency) ──────────────────────────────────────────────────
// เดิม: เน็ตหลุดกลางทาง/GAS ตอบไม่ครบ → frontend ไม่กล้า retry เลย (สั่งซ้ำสองเด้ง)
// ผู้ใช้เลยเห็นแถบแดง "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" ทั้งที่บางครั้งของถูกสั่งไปแล้ว
// ตอนนี้เครื่องผู้ใช้แนบ cid (client order id) มาด้วย → แถวเดิมที่มี cid นี้อยู่แล้ว
// จะไม่ถูกเขียนซ้ำ ตอบ ok กลับไปเลย ทำให้ retry/กดยืนยันซ้ำปลอดภัย 100%
// ⚠️ คอลัมน์ O — L/M เป็นผู้สั่ง/ผู้จัด และ N เป็น printFlag แล้ว ห้ามทับ
var COL_ORD_CID       = 15;   // O — cid (ว่างไว้สำหรับแถวเก่า/แถวที่สร้างจากที่อื่น)
var ORD_CID_SCAN_ROWS = 500;  // ค้นย้อนหลังไม่เกินกี่แถว (กัน getRange โตไม่มีเพดาน)

// หาแถวที่เคยบันทึกด้วย cid นี้แล้ว — คืนเลขแถว (1-indexed) หรือ -1 ถ้าไม่เจอ
function findOrderRowByCid_(sh, cid) {
  if (!cid) return -1;
  var last = sh.getLastRow();
  if (last < 3) return -1;
  var from = Math.max(3, last - ORD_CID_SCAN_ROWS + 1);
  var vals = sh.getRange(from, COL_ORD_CID, last - from + 1, 1).getDisplayValues();
  for (var i = vals.length - 1; i >= 0; i--) {          // ล่างขึ้นบน — แถวใหม่เจอก่อน
    if (String(vals[i][0] || '').trim() === cid) return from + i;
  }
  return -1;
}

function handleOrder_(params) {
  var lock = null;
  try {
    const sku = (params.sku || '').toString().trim();
    const qty = parseInt(params.qty) || 0;
    const orderType = (params.orderType || 'หิ้ว').toString().trim();
    const cid = (params.cid || '').toString().trim().slice(0, 64);
    if (!sku || qty < 1) return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:'ข้อมูลไม่ครบ'}))
      .setMimeType(ContentService.MimeType.JSON);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSh = ss.getSheetByName(SHEET_ORDERS);
    if (!orderSh) return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:'ไม่พบ Sheet'}))
      .setMimeType(ContentService.MimeType.JSON);

    // ล็อกคร่อม "หาแถวว่าง → เขียน" — เดิมไม่มีเลย สองเครื่องกดสั่งพร้อมกันได้แถวเดียวกัน
    // แล้วทับกัน (order หายไปเงียบ ๆ) · retryable=true → frontend ลองใหม่ได้ปลอดภัย
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) {
      lock = null;
      return ContentService
        .createTextOutput(JSON.stringify({ok:false, retryable:true, error:'ระบบกำลังบันทึกคำสั่งอื่นอยู่ กรุณาลองใหม่'}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // เคยบันทึก cid นี้ไปแล้ว = คำสั่งเดิมที่ response หายกลางทาง → ตอบ ok ไม่เขียนซ้ำ
    var dupRow = findOrderRowByCid_(orderSh, cid);
    if (dupRow > 0) {
      return ContentService
        .createTextOutput(JSON.stringify({ok:true, dedup:true, orderId: dupRow - 2, sku: sku, qty: qty}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const now = new Date(); // เก็บเป็น Date object ให้ Sheets จัดการ format เอง
    var startRow = 3;
    var colA = orderSh.getRange('A' + startRow + ':A').getValues();
    var nextRow = -1;
    for (var i = 0; i < colA.length; i++) {
      if (colA[i][0] === '') { nextRow = startRow + i; break; }
    }
    if (nextRow === -1) nextRow = orderSh.getLastRow() + 1; // C4: fallback ถ้าชีตเต็ม ไม่เขียนทับ row 3
    var productName = (params.name || '').toString().trim();
    var imageUrl = (params.image || '').toString().trim();
    // ── ผู้สั่ง: เอาจาก session ที่ server ยืนยันเอง ไม่ใช่ชื่อที่ client ส่งมา (ปลอมได้) ──
    // doGet ไม่ผ่าน doPost จึงไม่มีการ resolve session ให้อัตโนมัติ ต้องทำเองที่นี่
    // (รับ sessionToken เป็น query param แบบเดียวกับ attendancePhoto/getAuditLog)
    // ยังไม่ได้ล็อกอิน → เว้นว่างไว้ ดีกว่าใส่ชื่อมั่ว ๆ ที่เชื่อไม่ได้
    var orderedBy = '';
    try {
      var sess = resolveSession_(ss, params.sessionToken);
      if (sess) orderedBy = staffActorName_(sess);
    } catch (e) { /* session พัง → ปล่อยว่าง ไม่ให้กระทบการสั่งของ */ }
    ensureOrderPeopleHeaders_(orderSh);
    orderSh.getRange(nextRow, 1, 1, 13).setValues([[orderType, now, 'รอ', 'คลังสินค้าสาย5', 'ดูเหมือนจริง', sku, productName, qty, '', imageUrl, '', orderedBy, '']]);
    if (cid) {
      // text format — cid มีตัวอักษรเสมอ แต่กันไว้ตามบทเรียนข้อ 2 (Sheets แปลงค่าเอง)
      orderSh.getRange(nextRow, COL_ORD_CID).setNumberFormat('@').setValue(cid);
    }
    SpreadsheetApp.flush();  // เขียนให้ลงจริงก่อนปล่อยล็อก — คำขอถัดไปจะได้เห็น cid นี้
    // ปล่อยล็อกทันทีที่เขียนเสร็จ — ที่เหลือ (ยิง LINE/ล้าง cache) ไม่แตะแถวแล้ว
    // ⚠️ ห้ามถือล็อกคร่อม UrlFetchApp ไปหา LINE เด็ดขาด: ScriptLock เป็นล็อกตัวเดียวของทั้ง
    // สคริปต์ คนสั่งของพร้อมกันหลายคนจะต่อคิวรอ LINE ตอบ → tryLock หมดเวลากันเป็นแถว
    try { lock.releaseLock(); } catch (_) {}
    lock = null;
    // แจ้งเตือน LINE เมื่อมี order ใหม่
    if (orderType === 'หิ้ว') {
      sendLineGroupOrderCard_(productName || sku, sku, Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'), "", qty);
    }
    invalidateCache_(); // m1: ล้าง cache หลังเขียน order ใหม่

    return ContentService
      .createTextOutput(JSON.stringify({ok: true, orderId: nextRow - 2, sku: sku, qty: qty}))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (_) {} }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// แจ้งเตือนในแอป (in-app notification) — กระดิ่ง 🔔 บนหัวจอ
// ──────────────────────────────────────────────────────────────────────────
// ทำไมต้องมี: quota push ของ LINE OA จำกัด (~200 ข้อความ/เดือน) จนต้องกลั้นออเดอร์
//   ไว้ส่งรอบเดียวตอน 16:00 (notiOrderCutoffHour_) — เรื่องที่ "อยากรู้เดี๋ยวนี้" อีกหลายอย่าง
//   เลยไม่ได้แจ้งเลยเพราะไม่คุ้ม quota · ช่องทางนี้เขียนลงชีตเฉย ๆ ไม่ยิง LINE
//   = ไม่กิน quota เลย ส่งกี่เรื่องก็ได้ และผู้ใช้เห็นภายใน ~25 วิ (frontend poll)
//
// ⚠️ ขอบเขตที่ต้องรู้: เห็นเฉพาะ "ตอนเปิดแอปอยู่" — ไม่เด้งขึ้นหน้าจอล็อกเหมือน LINE
//   (จะเด้งได้ต้องทำ Web Push ซึ่ง GAS เซ็น VAPID เองไม่ได้ ต้องมีตัวส่งข้างนอก เช่น
//    Cloudflare Worker) จึง **ไม่ใช่ตัวแทน LINE** สำหรับเรื่องด่วน แต่เป็นที่รวมเรื่องที่
//   เมื่อก่อน "ไม่กล้าแจ้งเพราะเปลือง quota" — LINE ยังทำหน้าที่ปลุกตอนปิดแอปเหมือนเดิม
//
// SAFE ROLLOUT: gate ด้วย Script Property INAPP_NOTI_ENABLED='true'
//   ยังไม่เปิด → pushInappNoti_ เป็น no-op เงียบ ๆ (deploy แล้วไม่มีอะไรเปลี่ยนเลย)
//   เปิดจริงเมื่อเจ้าของรัน setupInappNoti() 1 ครั้งใน GAS editor · ปิดด้วย disableInappNoti()
// ══════════════════════════════════════════════════════════════════════════

// คอลัมน์ชีตแจ้งเตือนในแอป (1-indexed): A..M
// ⚠️ IMAGE/FOCUS ต่อท้าย (ไม่แทรกกลาง) — ชีตจริงมีแถวเก่าที่เขียนด้วย layout 11/12
// คอลัมน์อยู่แล้ว แทรกกลางจะทำให้ตำแหน่งคอลัมน์เดิม (READBY/EXPIRES) เพี้ยนย้อนหลังทั้งชีต
// FOCUS = SKU ที่ต้องพาไปดูต่อหลังกดแจ้งเตือน (ว่าง = พาไปแค่แท็บเหมือนเดิม — แถวเก่าทุกแถว
// เป็นแบบนี้ จึงต้องทนค่าว่างได้เสมอ ห้ามถือว่า "ต้องมี")
var INAPP_COL = { ID:1, CREATED:2, AUDIENCE:3, TYPE:4, TITLE:5, BODY:6,
                  TAB:7, BY:8, DEDUP:9, READBY:10, EXPIRES:11, IMAGE:12, FOCUS:13 };
var INAPP_HEADERS = ["id","createdAt","audience","type","title","body",
                     "tab","createdBy","dedupKey","readBy","expiresAt","image","focusSku"];

var INAPP_KEEP_DAYS_DEFAULT = 14;   // ปรับได้ที่ Script Property INAPP_NOTI_KEEP_DAYS
var INAPP_MAX_RETURN        = 30;   // จำนวนแถวที่ส่งกลับให้ frontend ต่อรอบ poll
var INAPP_SCAN_ROWS         = 300;  // อ่านย้อนหลังไม่เกินกี่แถว (กัน getRange โตไม่มีเพดาน)
var INAPP_PURGE_MAX         = 300;  // ลบต่อรอบ — กันรันเกิน 6 นาทีตอนล้างครั้งแรก

function inappNotiEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('INAPP_NOTI_ENABLED') === 'true';
}

function inappNotiSheet_(ss) {
  return getOrCreateSheet_(ss, SHEET_INAPP_NOTI, INAPP_HEADERS);
}

// ── ใครควรเห็นแถวนี้ ──────────────────────────────────────────────────────
// audience 3 รูปแบบ: "all" · "role:warehouse,owner" · "staff:ST0001,ST0002"
// dev นับเป็น owner เสมอ (convention เดียวกับ viewRole ฝั่ง frontend) — ไม่งั้นเจ้าของ
// ที่ตั้งตัวเองเป็น dev จะไม่เห็นแจ้งเตือนที่ยิงหา owner เลยสักอัน
// pure function — มีสำเนาใน tests/helpers.js (ดู drift-guard.test.js)
function inappAudienceMatch_(audience, staffId, role) {
  var a = String(audience || '').trim();
  if (!a || a === 'all') return true;
  var effRole = (role === 'dev') ? 'owner' : String(role || '');
  var sep = a.indexOf(':');
  if (sep < 0) return false;
  var kind = a.slice(0, sep);
  var list = a.slice(sep + 1).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (kind === 'role')  return list.indexOf(effRole) >= 0 || (role === 'dev' && list.indexOf('dev') >= 0);
  if (kind === 'staff') return list.indexOf(String(staffId || '')) >= 0;
  return false;
}

// อ่านแล้วหรือยัง — readBy เก็บเป็น staffId คั่นด้วย comma
// pure function — มีสำเนาใน tests/helpers.js
function inappIsRead_(readBy, staffId) {
  if (!staffId) return false;
  var parts = String(readBy || '').split(',');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].trim() === String(staffId)) return true;
  }
  return false;
}

// ── เขียนแจ้งเตือน 1 เรื่องเข้าชีต ────────────────────────────────────────
// opts: {audience, type, title, body, tab, by, dedupKey, ttlDays, image, focus}
// focus = SKU เดียวที่ผู้ใช้ต้องไปทำต่อ — ใส่ได้เฉพาะแจ้งเตือนที่ผูกกับสินค้าตัวเดียวจริง ๆ
//   (ออเดอร์ใหม่ / รับของไม่ครบ) · เรื่องที่รวมหลาย SKU (โอนทั้งชุด, สต็อกใกล้หมด) **ห้ามใส่**
//   เพราะเลือกตัวใดตัวหนึ่งมาเด้ง = พาไปผิดตัวโดยที่ผู้ใช้ไม่รู้ว่ายังมีตัวอื่นอีก
// ⚠️ ห้าม throw เด็ดขาด — ตัวเรียกคือเส้นทางสั่งของ/โอนของจริง แจ้งเตือนพลาด
//    ต้องไม่ทำให้งานหลักล้ม (หลักเดียวกับ appendSaleBillRow_)
function pushInappNoti_(opts) {
  try {
    if (!inappNotiEnabled_()) return;          // ยังไม่เปิดระบบ → เงียบ ไม่ทำอะไรเลย
    opts = opts || {};
    var title = String(opts.title || '').trim();
    if (!title) return;                        // ไม่มีหัวข้อ = ไม่มีอะไรให้แสดง

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = inappNotiSheet_(ss);
    var now = new Date();
    var dedupKey = String(opts.dedupKey || '');

    // dedup: มีแถว dedupKey เดียวกันที่ยังไม่หมดอายุอยู่แล้ว → ข้าม (กันรัวซ้ำเรื่องเดิม)
    // สแกนเฉพาะเมื่อมี dedupKey — ไม่งั้นทุกออเดอร์ต้องอ่านชีตฟรี ๆ
    if (dedupKey) {
      var last = sh.getLastRow();
      if (last >= 2) {
        var from = Math.max(2, last - INAPP_SCAN_ROWS + 1);
        var scan = sh.getRange(from, 1, last - from + 1, INAPP_HEADERS.length).getValues();
        for (var i = 0; i < scan.length; i++) {
          if (String(scan[i][INAPP_COL.DEDUP - 1]) !== dedupKey) continue;
          var exp = scan[i][INAPP_COL.EXPIRES - 1];
          if (!exp || new Date(exp).getTime() > now.getTime()) return;   // ยังสด → ข้าม
        }
      }
    }

    var keepDays = parseInt(PropertiesService.getScriptProperties().getProperty('INAPP_NOTI_KEEP_DAYS') || '', 10)
                   || INAPP_KEEP_DAYS_DEFAULT;
    var ttlDays = Number(opts.ttlDays) > 0 ? Number(opts.ttlDays) : keepDays;

    sh.appendRow([
      Utilities.getUuid().slice(0, 8),
      now,
      String(opts.audience || 'all'),
      String(opts.type || 'system'),
      title,
      String(opts.body || ''),
      String(opts.tab || ''),
      String(opts.by || ''),
      dedupKey,
      '',
      new Date(now.getTime() + ttlDays * 86400000),
      String(opts.image || ''),   // รูปสินค้า — ใส่เฉพาะแจ้งเตือนที่ผูกกับ SKU เดียว (ดูหมายเหตุ IMAGE ด้านบน)
      String(opts.focus || ''),   // SKU ที่ต้องพาไปดูต่อ (ว่าง = พาไปแค่แท็บ)
    ]);
  } catch (e) {
    Logger.log('pushInappNoti_ error (ข้ามไป ไม่กระทบงานหลัก): ' + e);
  }
}

// ── doGet action=inappNoti — frontend poll ทุก ~25 วิ ─────────────────────
// คืนรายการล่าสุดของ "คนที่ล็อกอินอยู่" + จำนวนที่ยังไม่อ่าน
// ไม่ใช้ since/merge เพราะรายการมีเพดาน 30 แถวอยู่แล้ว — ส่งทั้งชุดให้ client แทนที่ทิ้ง
// ง่ายกว่าและไม่มีบั๊ก merge (เคยเจอ pattern นี้พังเงียบมาแล้วกับ orders polling)
function listInappNotiHandler_(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sess = resolveSession_(ss, (e && e.parameter && e.parameter.sessionToken) || '');
    if (!sess || sess.status !== 'active') return unauthorized_();
    if (!inappNotiEnabled_()) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, off: true, items: [], unread: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sh = ss.getSheetByName(SHEET_INAPP_NOTI);
    if (!sh) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, items: [], unread: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var last = sh.getLastRow();
    if (last < 2) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, items: [], unread: 0 }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var from = Math.max(2, last - INAPP_SCAN_ROWS + 1);
    var vals = sh.getRange(from, 1, last - from + 1, INAPP_HEADERS.length).getValues();

    var nowMs = Date.now();
    var items = [], unread = 0;
    for (var i = vals.length - 1; i >= 0 && items.length < INAPP_MAX_RETURN; i--) {
      var r = vals[i];
      var exp = r[INAPP_COL.EXPIRES - 1];
      if (exp && new Date(exp).getTime() < nowMs) continue;                   // หมดอายุแล้ว
      if (!inappAudienceMatch_(r[INAPP_COL.AUDIENCE - 1], sess.staffId, sess.role)) continue;
      var isRead = inappIsRead_(r[INAPP_COL.READBY - 1], sess.staffId);
      if (!isRead) unread++;
      items.push({
        id:    String(r[INAPP_COL.ID - 1] || ''),
        ts:    r[INAPP_COL.CREATED - 1] ? new Date(r[INAPP_COL.CREATED - 1]).getTime() : 0,
        type:  String(r[INAPP_COL.TYPE - 1] || 'system'),
        title: String(r[INAPP_COL.TITLE - 1] || ''),
        body:  String(r[INAPP_COL.BODY - 1] || ''),
        tab:   String(r[INAPP_COL.TAB - 1] || ''),
        by:    String(r[INAPP_COL.BY - 1] || ''),
        image: String(r[INAPP_COL.IMAGE - 1] || ''),
        focus: String(r[INAPP_COL.FOCUS - 1] || ''),   // แถวเก่าไม่มีคอลัมน์นี้ → '' = ไม่เด้งไปไหนต่อ
        read:  isRead,
      });
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, items: items, unread: unread, serverTs: nowMs }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── doPost action=markNotiRead — {ids:[...]} หรือ {all:true} ──────────────
function markInappNotiReadHandler_(ss, data) {
  try {
    var sess = resolveSession_(ss, data.sessionToken);
    if (!sess || sess.status !== 'active') return unauthorized_();

    var sh = ss.getSheetByName(SHEET_INAPP_NOTI);
    if (!sh) return ContentService.createTextOutput(JSON.stringify({ ok: true, marked: 0 }))
      .setMimeType(ContentService.MimeType.JSON);
    var last = sh.getLastRow();
    if (last < 2) return ContentService.createTextOutput(JSON.stringify({ ok: true, marked: 0 }))
      .setMimeType(ContentService.MimeType.JSON);

    var wantAll = data.all === true;
    var ids = {};
    if (!wantAll && Array.isArray(data.ids)) {
      for (var k = 0; k < data.ids.length; k++) ids[String(data.ids[k])] = true;
    }

    var from = Math.max(2, last - INAPP_SCAN_ROWS + 1);
    var vals = sh.getRange(from, 1, last - from + 1, INAPP_HEADERS.length).getValues();
    var marked = 0;
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      if (!wantAll && !ids[String(r[INAPP_COL.ID - 1])]) continue;
      // ต้องเป็นแถวที่คนนี้มีสิทธิ์เห็นจริง — กันยิง id มั่วมาปั๊มสถานะแถวของคนอื่น
      if (!inappAudienceMatch_(r[INAPP_COL.AUDIENCE - 1], sess.staffId, sess.role)) continue;
      if (inappIsRead_(r[INAPP_COL.READBY - 1], sess.staffId)) continue;
      var cur = String(r[INAPP_COL.READBY - 1] || '').trim();
      sh.getRange(from + i, INAPP_COL.READBY).setValue(cur ? cur + ',' + sess.staffId : String(sess.staffId));
      marked++;
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, marked: marked }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── ล้างแถวหมดอายุ (เรียกจาก dailyAttendanceMaintenance) ──────────────────
// ลบจากล่างขึ้นบน — ลบจากบนลงล่าง index จะเลื่อนทุกครั้งที่ลบ (บทเรียนข้อ 5)
function purgeInappNoti_(ss) {
  var sh = ss.getSheetByName(SHEET_INAPP_NOTI);
  if (!sh) return 0;
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, INAPP_HEADERS.length).getValues();
  var nowMs = Date.now();
  var n = 0;
  for (var i = vals.length - 1; i >= 0 && n < INAPP_PURGE_MAX; i--) {
    var exp = vals[i][INAPP_COL.EXPIRES - 1];
    if (!exp || new Date(exp).getTime() >= nowMs) continue;
    sh.deleteRow(i + 2);
    n++;
  }
  return n;
}

// ⚠️ ชื่อฟังก์ชันห้ามลงท้าย _ ไม่งั้นไม่โผล่ใน dropdown ของ GAS editor (บทเรียนข้อ 1)
function setupInappNoti() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  inappNotiSheet_(ss);   // สร้างชีตให้เลย จะได้เห็นหัวตารางทันที
  PropertiesService.getScriptProperties().setProperty('INAPP_NOTI_ENABLED', 'true');
  Logger.log('✅ เปิดแจ้งเตือนในแอปแล้ว — ชีต "' + SHEET_INAPP_NOTI + '" พร้อมใช้งาน');
  Logger.log('   เก็บแจ้งเตือน ' + INAPP_KEEP_DAYS_DEFAULT + ' วัน (ปรับที่ Script Property INAPP_NOTI_KEEP_DAYS)');
  Logger.log('   ล้างของเก่าอัตโนมัติพ่วงกับ dailyAttendanceMaintenance (trigger 22:00) — ไม่ต้องตั้ง trigger เพิ่ม');
}

function disableInappNoti() {
  PropertiesService.getScriptProperties().setProperty('INAPP_NOTI_ENABLED', 'false');
  Logger.log('ปิดแจ้งเตือนในแอปแล้ว — กระดิ่งจะว่างเปล่า ระบบอื่นไม่กระทบ');
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐ ผู้ดูแลสินค้า (Product Owner) — "สินค้าตัวนี้ใครดูแล"
// ──────────────────────────────────────────────────────────────────────────
// เจตนา: หน้าร้านแต่ละคนมีสินค้า/ที่เก็บของตัวเอง แต่เดิมทุกคนเห็นลิสต์เดียวกันหมด
//   ไม่มีใครรู้ว่าของตัวไหนอยู่กับใคร → กดดาวไว้ให้ (1) กรองเหลือของตัวเองตอนเช็ค
//   (2) คนอื่นหยิบของ/สั่งแทนได้แล้วรู้ว่าถามใคร
// ⚠️ นี่คือ "ป้ายบอก" ไม่ใช่ระบบสิทธิ์ — ห้ามเอาไป gate การสั่ง/โอน/เช็คสินค้าเด็ดขาด
//   ทุกคนยังทำกับสินค้าทุกตัวได้เหมือนเดิมทุกอย่าง (เจ้าของยืนยัน 2026-07-31)
// 1 สินค้า = 1 คนดูแล → เก็บ 1 แถวต่อ SKU แล้ว "เขียนทับ" เวลาเปลี่ยนคน
//   (แถวไม่โตตาม action ที่กด — เพดานคือจำนวน SKU) · ประวัติการเปลี่ยนมือดูที่ audit log
// ⚠️ ห้ามยัดข้อมูลนี้ลง data.products ใน payload หลัก — payload cache แยกตาม role ไม่ใช่ตามคน
//   (PAYLOAD_ROLE_VARIANT_) ใส่ "ดาวของฉัน" เข้าไป = frontstore ทุกคนเห็นดาวของคนที่ทำ
//   cache warm คนแรก · จึงเป็น endpoint แยกแบบเดียวกับกระดิ่ง (inappNoti)
// SAFE ROLLOUT: gate ด้วย Script Property PRODUCT_OWNER_ENABLED='true'
//   ยังไม่เปิด → endpoint คืน {off:true} → frontend ซ่อนดาวทั้งหมด (deploy แล้วไม่มีอะไรเปลี่ยน)
//   เปิดจริงเมื่อเจ้าของรัน setupProductOwner() 1 ครั้งใน GAS editor
// ══════════════════════════════════════════════════════════════════════════

// คอลัมน์ชีตผู้ดูแลสินค้า (1-indexed): A..F
var POWN_COL = { SKU:1, STAFF:2, NAME:3, UPDATED:4, STATUS:5, NOTE:6 };
var POWN_HEADERS = ["sku","staffId","ชื่อผู้ดูแล","updatedAt","status","หมายเหตุ"];
// เพดานอ่าน/สแกน — กัน getRange โตไม่มีเพดาน · จำนวนแถวจริง = จำนวน SKU ที่มีคนดูแล
// (1 SKU = 1 แถว เขียนทับ) การอ่านจึงถูกจำกัดด้วย getLastRow() อยู่แล้ว ค่านี้เป็นแค่ฝาครอบ
// ⚠️ เผื่อไว้เยอะกว่าจำนวน SKU มาก ๆ โดยตั้งใจ — ตัน = แถวที่เกินถูก "อ่านข้าม" เงียบ ๆ
//   (ดาวหายจากเว็บโดยไม่มี error ให้เห็น) ซึ่งเจ็บกว่าการอ่านเผื่อไว้หลายเท่า
//   ยิ่งหลังใช้ applyProductOwnerAssign() ที่เขียนทีเดียวเป็นพันแถวตามจำนวน SKU
var POWN_MAX_ROWS = 20000;

// ชื่อที่โชว์บนป้ายดาว — ใช้ชื่อสั้น ไม่ใช่ "ชื่อ (ตำแหน่ง)" แบบ actor
// (ป้ายอยู่บนแถวสินค้าที่แคบมาก ชื่อเต็มล้นแน่นอน)
function productOwnerShortName_(s) {
  if (!s) return '';
  return String(s.displayName || s.lineDisplayName || '').trim();
}

function productOwnerEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('PRODUCT_OWNER_ENABLED') === 'true';
}

function productOwnerSheet_(ss) {
  return getOrCreateSheet_(ss, SHEET_PRODUCT_OWNER, POWN_HEADERS);
}

// แถวดิบ → map {sku: {staffId, name}} เฉพาะแถวที่ยัง active
// pure function — มีสำเนาใน tests/helpers.js (ดู drift-guard.test.js)
function productOwnerMapFromRows_(rows) {
  var out = {};
  for (var i = 0; i < (rows || []).length; i++) {
    var r = rows[i];
    var sku = String(r[POWN_COL.SKU - 1] || '').trim();
    if (!sku) continue;
    var status = String(r[POWN_COL.STATUS - 1] || '').trim();
    var staffId = String(r[POWN_COL.STAFF - 1] || '').trim();
    if (status === 'off' || !staffId) { delete out[sku]; continue; }   // ถอดดาวแล้ว = ไม่มีคนดูแล
    out[sku] = { staffId: staffId, name: String(r[POWN_COL.NAME - 1] || '').trim() };
  }
  return out;
}

// ใครมีสิทธิ์เปลี่ยน "คนดูแล" ของ SKU นี้ — เจ้าของปัจจุบันคือใครมีผลด้วย
// กติกา: ยังไม่มีคนดูแล → ใครกดก็ได้ · มีคนดูแลแล้ว → เจ้าของเดิมเท่านั้น (หรือ owner/dev)
// ตั้งใจให้ "แย่งดาว" ไม่ได้เงียบ ๆ — frontend ถามยืนยันแล้วส่ง takeover:true มาถึงจะยอมเปลี่ยนมือ
// pure function — มีสำเนาใน tests/helpers.js
function productOwnerCanSet_(current, staffId, role, takeover) {
  if (role === 'owner' || role === 'dev') return true;         // เจ้าของ/dev จัดสรรแทนได้เสมอ
  if (!current || !current.staffId) return true;               // ของว่าง — ใครก็รับดูแลได้
  if (String(current.staffId) === String(staffId)) return true; // ของตัวเอง — ถอด/แก้ได้
  return takeover === true;                                     // ของคนอื่น — ต้องยืนยันรับช่วงต่อ
}

// ── doGet action=productOwners — frontend ดึงตอนเปิดแท็บหน้าร้าน ──────────
// คืนทั้งแมพ (sku → ผู้ดูแล) ให้ client ไป filter เอาของตัวเองเอง — ไม่ทำ since/merge
// (เหตุผลเดียวกับกระดิ่ง: ข้อมูลมีเพดานอยู่แล้ว merge เป็นบ่อเกิดบั๊กเงียบ)
function listProductOwnersHandler_(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sess = resolveSession_(ss, (e && e.parameter && e.parameter.sessionToken) || '');
    if (!sess || sess.status !== 'active') return unauthorized_();
    if (!productOwnerEnabled_()) {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, off: true, owners: {}, me: '' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var sh = ss.getSheetByName(SHEET_PRODUCT_OWNER);
    var owners = {};
    if (sh) {
      var last = Math.min(sh.getLastRow(), POWN_MAX_ROWS + 1);
      if (last >= 2) owners = productOwnerMapFromRows_(sh.getRange(2, 1, last - 1, POWN_HEADERS.length).getValues());
    }
    return ContentService.createTextOutput(JSON.stringify({
      ok: true, owners: owners, me: String(sess.staffId || ''),
      meName: productOwnerShortName_(sess), serverTs: Date.now(),
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── doPost action=setProductOwner {sku, on, takeover, targetStaffId} ──────
// on=true  → ตั้งคนดูแล (ปกติ = ตัวเอง · owner/dev ส่ง targetStaffId มอบหมายแทนคนอื่นได้)
// on=false → ถอดออก (เหลือ "ยังไม่มีคนดูแล")
// ⚠️ staffId มาจาก session เสมอ ไม่รับจาก client (นอกจาก owner/dev ที่ส่ง targetStaffId)
function setProductOwnerHandler_(ss, data) {
  try {
    var sess = resolveSession_(ss, data.sessionToken);
    if (!sess || sess.status !== 'active') return unauthorized_();
    if (!productOwnerEnabled_()) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, off: true, error: 'ยังไม่ได้เปิดใช้งานระบบผู้ดูแลสินค้า' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var sku = String(data.sku || '').trim().toUpperCase();
    if (!sku) return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'ไม่ได้ระบุ SKU' }))
      .setMimeType(ContentService.MimeType.JSON);

    var isAdmin = isAdminRole_(sess.role);
    var on = data.on !== false;
    // บัญชีเครื่องกลางใช้ร่วมกันหลายคน — ดาวจะกลายเป็นของ "เครื่อง" ไม่ใช่ของคน
    if (sess.role === 'storedevice' && !isAdmin) {
      return forbidden_('เครื่องกลางใช้ร่วมกันหลายคน — กดดาวจากบัญชีของตัวเองแทน');
    }

    var staffId = String(sess.staffId || '');
    var staffName = productOwnerShortName_(sess);   // ชื่อสั้นสำหรับป้ายบนการ์ด (audit ใช้ชื่อเต็มแยกต่างหาก)
    if (isAdmin && data.targetStaffId) {
      var target = findStaffRowById_(staffSheet_(ss), String(data.targetStaffId));
      if (target < 0) return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'ไม่พบพนักงานที่ระบุ' }))
        .setMimeType(ContentService.MimeType.JSON);
      var tObj = staffRowToObj_(staffSheet_(ss).getRange(target, 1, 1, 11).getValues()[0]);
      staffId = String(tObj.staffId || '');
      staffName = productOwnerShortName_(tObj);
    }

    var lock = LockService.getScriptLock();
    try { lock.waitLock(10000); } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'ระบบกำลังยุ่ง ลองใหม่อีกครั้ง' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var sh = productOwnerSheet_(ss);
      var last = Math.min(sh.getLastRow(), POWN_MAX_ROWS + 1);
      var rowIdx = -1, curRow = null;
      if (last >= 2) {
        var vals = sh.getRange(2, 1, last - 1, POWN_HEADERS.length).getValues();
        for (var i = 0; i < vals.length; i++) {
          if (String(vals[i][POWN_COL.SKU - 1] || '').trim().toUpperCase() === sku) { rowIdx = i + 2; curRow = vals[i]; }
        }
      }
      var current = curRow ? productOwnerMapFromRows_([curRow])[sku] : null;
      if (!productOwnerCanSet_(current || null, sess.staffId, sess.role, data.takeover === true)) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false, conflict: true, owner: current,
          error: 'สินค้านี้ ' + (current.name || 'คนอื่น') + ' ดูแลอยู่',
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var now = new Date();
      var row = on ? [sku, staffId, staffName, now, 'active', String(data.note || '')]
                   : [sku, '', '', now, 'off', String(data.note || '')];
      if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, POWN_HEADERS.length).setValues([row]);
      else            sh.appendRow(row);

      writeAuditLog_(staffActorName_(sess), on ? 'setProductOwner' : 'clearProductOwner', sku,
        auditDetail_({ sku: sku, ผู้ดูแลเดิม: current ? current.name : '-', ผู้ดูแลใหม่: on ? staffName : '-' }));

      return ContentService.createTextOutput(JSON.stringify({
        success: true, sku: sku, owner: on ? { staffId: staffId, name: staffName } : null,
      })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ⚠️ ชื่อฟังก์ชันห้ามลงท้าย _ ไม่งั้นไม่โผล่ใน dropdown ของ GAS editor (บทเรียนข้อ 1)
function setupProductOwner() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  productOwnerSheet_(ss);
  PropertiesService.getScriptProperties().setProperty('PRODUCT_OWNER_ENABLED', 'true');
  Logger.log('✅ เปิดระบบผู้ดูแลสินค้าแล้ว — ชีต "' + SHEET_PRODUCT_OWNER + '" พร้อมใช้งาน');
  Logger.log('   พนักงานกดดาว ⭐ ที่แท็บ "เช็คหน้าร้าน" ได้เลย (ต้องล็อกอิน LINE ก่อน)');
  Logger.log('   1 สินค้า = 1 คนดูแล · เป็นป้ายบอกเฉย ๆ ไม่ได้จำกัดสิทธิ์ใครทำอะไรกับสินค้า');
}

function disableProductOwner() {
  PropertiesService.getScriptProperties().setProperty('PRODUCT_OWNER_ENABLED', 'false');
  Logger.log('ปิดระบบผู้ดูแลสินค้าแล้ว — ดาวจะซ่อนหมด ข้อมูลในชีตยังอยู่ครบ');
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐ มอบหมายผู้ดูแลสินค้า "เป็นชุดตามหมวด" (เจ้าของรันเองใน GAS editor)
// ──────────────────────────────────────────────────────────────────────────
// ทำไมต้องมี: สินค้าหลักพัน SKU — ให้พนักงานไล่กดดาวทีละตัวบนมือถือไม่ไหว
//   เจ้าของอยาก "ตั้งต้นไว้ให้ก่อนคร่าว ๆ" ตามหมวดที่แต่ละคนดูแลอยู่จริง
//   แล้วค่อยให้พนักงานกดปรับเองทีหลัง (ถอด/เปลี่ยนมือได้ตามปกติทุกอย่าง)
// ⚠️ ยังเป็น "ป้ายบอก" ไม่ใช่สิทธิ์เหมือนเดิม — ไม่มีอะไรถูก gate ด้วยดาวทั้งสิ้น
//
// ลำดับที่ตั้งใจให้ทำ (ห้ามข้ามขั้น 1-2 เพราะชื่อหมวดต้องตรงกับ "ชีตจริง" ตัวอักษรต่ออักษร):
//   1) listProductCategories()     — ดูชื่อหมวดจริง + จำนวน SKU ต่อหมวด
//   2) แก้ PRODUCT_OWNER_ASSIGN_PLAN_ ข้างล่างให้ชื่อตรงกับที่เห็นในขั้น 1
//   3) previewProductOwnerAssign() — อ่านอย่างเดียว ไม่เขียนอะไรเลย บอกว่าจะแจกใครกี่ตัว
//   4) applyProductOwnerAssign()   — เขียนจริง
//
// กติกาที่ตั้งใจให้ "ไม่เดาแทนเจ้าของ" (ทุกข้อคือเคสที่พลาดแล้วไม่มี error ให้เห็น):
//   · หมวดที่มีมากกว่า 1 คนในตาราง → **ข้ามทั้งหมวด** ไม่ยกให้คนที่อยู่บรรทัดบนสุด
//     (1 สินค้า = 1 คนดูแล · ยกให้คนแรกเงียบ ๆ = อีกหลายคนไม่รู้ว่าทำไมไม่ได้ของ)
//   · SKU ที่มีคนดูแลอยู่แล้ว → ข้ามเสมอ ไม่ทับดาวที่พนักงานกดเอง
//     (จะทับจริง ๆ ต้องแก้ PRODUCT_OWNER_ASSIGN_OVERWRITE_ เป็น true ด้วยมือ)
//   · ชื่อพนักงานในตารางที่หาในชีต "พนักงาน" ไม่เจอ/เจอซ้ำ → **ไม่เขียนอะไรเลยทั้งรอบ**
//     (เขียนเฉพาะคนที่หาเจอ = ได้ผลลัพธ์ครึ่ง ๆ กลาง ๆ ที่แยกไม่ออกจากผลลัพธ์ที่ถูกต้อง)
//   · หมวดในตารางที่หา SKU ไม่เจอเลยสักตัว → รายงานออกมาดัง ๆ (= พิมพ์ชื่อไม่ตรงชีต)
// ══════════════════════════════════════════════════════════════════════════

// ── ตารางมอบหมาย — แก้ตรงนี้ได้เลย ────────────────────────────────────────
// staffId = รหัสพนักงาน ("ST0001") — **ใส่อันนี้เป็นหลัก** เพราะไม่เปลี่ยนตามที่พนักงาน
//           เปลี่ยนชื่อ LINE และไม่มีปัญหาอักขระพิเศษ (ตัวเอียง/รูปสระซ้อน) ให้ต้องมาไล่จับคู่
//           · ดูรหัสของแต่ละคนได้จาก checkProductOwnerStaffNames() ซึ่งพิมพ์บรรทัดพร้อมลอกให้เลย
// staff   = ชื่อคน — ใช้ 2 กรณี: (ก) ยังไม่ได้ใส่ staffId → ใช้ชื่อจับคู่แทน (แบบเดิม)
//           (ข) ใส่ staffId แล้ว → เป็นแค่ "ป้ายกำกับให้คนอ่านโค้ดรู้ว่าใคร" ไม่ถูกใช้จับคู่
// ⚠️ ชื่อที่โชว์บนเว็บไม่ได้มาจากตารางนี้ — มาจากชีต "พนักงาน" เสมอ (คอลัมน์ ชื่อผู้ดูแล ของชีตดาว)
//    เปลี่ยนตารางมาใช้ staffId จึงไม่กระทบสิ่งที่ผู้ใช้เห็นแม้แต่นิดเดียว
// categories = ชื่อหมวดตามชีต "ข้อมูลสินค้า" คอลัมน์ F (ดูของจริงด้วย listProductCategories())
// รหัสมาจากเจ้าของโดยตรง (ส.ค. 2026) · ชื่อที่เขียนคู่ไว้เป็น "ป้ายให้คนอ่านโค้ด" เท่านั้น
// ไม่ถูกใช้จับคู่ — ยืนยันว่ารหัสตรงกับคนไหนได้ที่ checkProductOwnerStaffNames()
var PRODUCT_OWNER_ASSIGN_PLAN_ = [
  { staffId: 'ST0004', staff: 'TunTun',    categories: ['ใบ', 'ใบบูช', 'ใบไม้แขวน', 'กิ่งไม้', 'ต้นไม้', 'อุปกรณ์สำนักงาน'] },
  { staffId: 'ST0005', staff: 'ประสิทธิ์',  categories: ['Realtouch', 'ดอกไม้', 'บูช', 'อุปกรณ์สำนักงาน', 'ของตกแต่ง'] },
  { staffId: 'ST0014', staff: 'Ya Ya',     categories: ['แจกันแก้ว', 'กระถางPS', 'เรซิ่นและอื่นๆ', 'อุปกรณ์สำนักงาน', 'ของตกแต่ง'] },
  // "KYAW แอ KHALANE" = ชื่อคนคนเดียว (เจ้าของยืนยัน ส.ค. 2026) ไม่ใช่ 3 คน
  { staffId: 'ST0013', staff: 'KYAW แอ KHALANE', categories: ['ดอกไม้', 'ดอกหญ้า', 'กุหลาบหิน', 'ผลไม้ ผัก กิ่งผลไม้', 'ไม้แซมไม้ประดับ', 'สายเลื้อย', 'อุปกรณ์สำนักงาน'] },
];

// แถวในตาราง → ค่าที่ใช้จับคู่กับชีตพนักงาน · staffId มาก่อนชื่อเสมอ
// (ใส่ staffId แล้วต่อให้ชื่อในตารางสะกดผิด/ล้าสมัย ก็ยังจับคู่ถูกคน)
function productOwnerPlanKeyOf_(entry) {
  var e = entry || {};
  return String(e.staffId || '').trim() || String(e.staff || '').trim();
}

// ── หมายเหตุเรื่องหมวดที่ซ้อนกัน (เจ้าของตัดสินใจแล้ว ส.ค. 2026) ──────────
// "อุปกรณ์สำนักงาน" (ทั้ง 4 คน) · "ของตกแต่ง" (ประสิทธิ์+Ya Ya) · "ดอกไม้" (ประสิทธิ์+KYAW แอ KHALANE)
// → เจตนาของเจ้าของคือ "ทุกคนต้องดูได้" ซึ่งเป็นจริงอยู่แล้วโดยไม่ต้องทำอะไร:
//   ดาวเป็นป้ายบอก ไม่ใช่สิทธิ์ ทุกคนเช็ค/สั่ง/โอนสินค้าทุกตัวได้เหมือนเดิมไม่ว่าดาวเป็นของใคร
// → จึงคง 3 หมวดนี้ไว้ใน "ไม่มอบหมายให้ใคร" ตามกติกาหมวดซ้อน (ไม่โผล่ในชิป "⭐ ของฉัน" ของใคร
//   แต่ยังอยู่ในลิสต์ปกติของทุกคนครบถ้วน) · ถ้าวันหนึ่งอยากให้ขึ้นลิสต์ "ของฉัน" ของใครสักคน
//   ให้ลบชื่อหมวดนั้นออกจากลิสต์ของคนที่เหลือ เหลือชื่อเดียว แล้วรัน preview ใหม่

// true = ทับดาวที่มีคนดูแลอยู่แล้วด้วย (ค่าปกติ false — งานที่พนักงานกดเองสำคัญกว่าตารางตั้งต้น)
var PRODUCT_OWNER_ASSIGN_OVERWRITE_ = false;

// คีย์เทียบชื่อ (หมวด/คน) — ตัดช่องว่างทั้งหมด + ตัวพิมพ์ + zero-width ที่ติดมาจากการ copy
// "กระถาง PS" = "กระถางPS" · "Ya Ya" = "YaYa" — ชื่อไทยในชีตเว้นวรรคไม่คงที่ ถ้าเทียบตรง ๆ
// จะได้ "หาหมวดไม่เจอ" ทั้งที่ตาเห็นว่าเหมือนกัน
// pure function — เทสต์ eval จากไฟล์นี้ตรง ๆ (tests/product-owner-assign.test.js) ไม่มีสำเนา
function productOwnerNormKey_(s) {
  return String(s == null ? '' : s)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

// ตารางมอบหมาย → ดัชนี {หมวด → คนที่อ้างสิทธิ์} · หมวดที่มีชื่อเกิน 1 คน = "ซ้อนกัน"
function productOwnerPlanIndex_(plan) {
  var byCat = {}, order = [];
  for (var i = 0; i < (plan || []).length; i++) {
    var p = plan[i] || {};
    var staff = productOwnerPlanKeyOf_(p);
    var cats = p.categories || [];
    for (var j = 0; j < cats.length; j++) {
      var label = String(cats[j] || '').trim();
      var k = productOwnerNormKey_(label);
      if (!k || !staff) continue;
      if (!byCat[k]) { byCat[k] = { label: label, staff: [] }; order.push(k); }
      if (byCat[k].staff.indexOf(staff) < 0) byCat[k].staff.push(staff);
    }
  }
  return { byCat: byCat, order: order };
}

// คีย์เทียบ "ชื่อคน" — ถอดเครื่องประดับออกก่อนเทียบ
// ชื่อที่พนักงานตั้งใน LINE มักมีอีโมจิ/ตัวอักษรตกแต่ง/สัญลักษณ์ ("𝓨𝓪 𝓨𝓪 ♡", "แอ 🌸", "・KYAW・")
// ซึ่งไม่มีทางพิมพ์ให้ตรงด้วยมือได้ → เทียบตรง ๆ = "หาพนักงานไม่เจอ" ทั้งที่เป็นคนเดียวกัน
// ⚠️ ตั้งใจแยกจาก productOwnerNormKey_ (ที่ใช้กับชื่อหมวด) ไม่ใช้ตัวเดียวกัน:
//   ชื่อคนเทียบกับ "ชุดปิด" คือรายชื่อในชีตพนักงาน ตัดอักขระแรง ๆ ได้ เดาชนกันก็ยังถูกรายงาน
//   ว่ากำกวมแล้วหยุด · ส่วนชื่อหมวดเป็นข้อความอิสระที่คนพิมพ์เอง ตัดแรงไปหมวดคนละอันจะยุบมาชนกัน
// ⚠️ ห้ามใช้ \p{...} (Unicode property escape) — ถ้า runtime ไหนไม่รองรับ จะเป็น syntax error
//   ทั้งไฟล์ = ทั้งระบบล่ม ไม่ใช่แค่ฟีเจอร์นี้พัง · ใช้ช่วงรหัสอักขระตรง ๆ แทน
//   และเป็นการ "ตัดของที่ไม่ใช่ตัวอักษร" ไม่ใช่ "เก็บเฉพาะไทย/อังกฤษ" เพราะพนักงานบางคน
//   ตั้งชื่อด้วยอักษรพม่า/ลาว ซึ่งถ้าใช้ whitelist จะถูกลบจนเหลือค่าว่าง
function productOwnerStaffKey_(s) {
  var t = String(s == null ? '' : s);
  try { t = t.normalize('NFKC'); } catch (e) {}   // 𝓨𝓪𝓨𝓪 → YaYa · ตัวเต็มความกว้าง → ASCII
  return t
    .replace(/[\uD800-\uDFFF]/g, '')                                   // อีโมจิ/อักษรตกแต่ง (surrogate pair)
    .replace(/[\u00A0-\u00BF\u00D7\u00F7\u2000-\u27BF\u2B00-\u2BFF\u2E00-\u2E7F\u3000-\u303F\u30FB\uFE00-\uFE0F\uFEFF\u200B-\u200D]/g, '')  // สัญลักษณ์/ดาว/หัวใจ/zero-width
    .replace(/[!-\/:-@\[-`{-~]/g, '')                                  // วรรคตอน ASCII
    .replace(/\s+/g, '')
    .toLowerCase();
}

// คีย์ "ถอดรูปสระ/วรรณยุกต์ไทย" — ใช้เป็นชั้นสุดท้ายของการจับคู่ชื่อคนเท่านั้น
// ที่มา: ชื่อในชีตจริงมีสระ/วรรณยุกต์ซ้อนเกินมาจากการพิมพ์ (เห็นเป็นรูปเกาะซ้อนกันบนตัวอักษร)
// ซึ่งพิมพ์ตามให้ตรงด้วยมือไม่ได้ และไม่ใช่ "ส่วนต่อท้าย" ชั้นที่ 2 จึงจับไม่ได้
// ⚠️ ห้ามเอาไปใช้เป็นคีย์หลัก — "ประสิทธิ์"/"ประสิทธิ" จะกลายเป็นคีย์เดียวกัน
function productOwnerThaiBaseKey_(s) {
  return productOwnerStaffKey_(s).replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '');
}

// ชื่อในตาราง → พนักงานจริงในชีต · เทียบได้ทั้ง staffId / displayName / lineDisplayName
// เอาเฉพาะ status='active' (เหมือนทุกที่ในไฟล์นี้) — คนที่ถูกปิดบัญชีไม่ควรได้ดาวใหม่
// จับคู่ 2 ชั้น: (1) ตรงเป๊ะหลังถอดเครื่องประดับ (2) ชื่อหนึ่งเป็นส่วนหนึ่งของอีกชื่อ และ
// เหลือผู้เข้าข่าย "คนเดียว" เท่านั้น — ชั้นที่ 2 ถูกรายงานใน out.loose เสมอเพื่อให้เจ้าของ
// เห็นว่าจับคู่ให้แบบไหน (เจอมากกว่า 1 คน = กำกวม → หยุด ไม่เดา)
function productOwnerResolveStaffCore_(staffAll, labels) {
  var active = [], idx = {};
  for (var i = 0; i < (staffAll || []).length; i++) {
    var s = staffAll[i] || {};
    if (String(s.status || '').trim() !== 'active') continue;
    active.push(s);
    var names = [s.staffId, s.displayName, s.lineDisplayName];
    for (var j = 0; j < names.length; j++) {
      var k = productOwnerStaffKey_(names[j]);
      if (!k) continue;
      if (!idx[k]) idx[k] = [];
      var dup = false;
      for (var d = 0; d < idx[k].length; d++) if (String(idx[k][d].staffId) === String(s.staffId)) dup = true;
      if (!dup) idx[k].push(s);
    }
  }
  var out = { resolved: {}, missing: [], ambiguous: [], loose: [] };
  for (var n = 0; n < (labels || []).length; n++) {
    var label = String(labels[n] || '').trim();
    if (!label) continue;
    var lk = productOwnerStaffKey_(label);
    var hit = idx[lk] || [];
    if (!hit.length && lk) {
      // ชั้นที่ 2 — ชื่อในชีตมีส่วนเกินที่พิมพ์ตามไม่ได้ ("KYAW แอ KHALANE (คลัง)") หรือกลับกัน
      var cand = [];
      for (var a = 0; a < active.length; a++) {
        var ns = [active[a].staffId, active[a].displayName, active[a].lineDisplayName];
        var ok = false;
        for (var b = 0; b < ns.length; b++) {
          var nk = productOwnerStaffKey_(ns[b]);
          if (nk && (nk.indexOf(lk) >= 0 || lk.indexOf(nk) >= 0)) ok = true;
        }
        if (!ok) continue;
        var seen = false;
        for (var c = 0; c < cand.length; c++) if (String(cand[c].staffId) === String(active[a].staffId)) seen = true;
        if (!seen) cand.push(active[a]);
      }
      if (!cand.length) {
        // ชั้นที่ 3 — ชื่อไทยที่มีสระ/วรรณยุกต์ "เกินมา" กลางชื่อ (เจอจริง: "ประสิทธิ์" ในชีต
        // มีรูปสระซ้อนเกิน) · ชั้นที่ 2 จับไม่ได้เพราะไม่ใช่ส่วนต่อท้าย ต้องถอดรูปสระออกก่อนเทียบ
        // ⚠️ ทำเป็นชั้นสุดท้ายเท่านั้น — "ประสิทธิ์" กับ "ประสิทธิ" กลายเป็นคีย์เดียวกัน
        //   ถ้ามีทั้งคู่ในชีตจะเข้าเส้นทาง ambiguous แล้วหยุด ซึ่งเป็นผลลัพธ์ที่ถูกต้อง
        var lb = productOwnerThaiBaseKey_(label);
        for (var a3 = 0; a3 < active.length && lb; a3++) {
          var ns3 = [active[a3].staffId, active[a3].displayName, active[a3].lineDisplayName];
          var ok3 = false;
          for (var b3 = 0; b3 < ns3.length; b3++) {
            var nb = productOwnerThaiBaseKey_(ns3[b3]);
            if (nb && nb === lb) ok3 = true;
          }
          if (!ok3) continue;
          var seen3 = false;
          for (var c3 = 0; c3 < cand.length; c3++) if (String(cand[c3].staffId) === String(active[a3].staffId)) seen3 = true;
          if (!seen3) cand.push(active[a3]);
        }
      }
      if (cand.length === 1) {
        hit = cand;
        out.loose.push({
          label: label,
          matchedName: String(cand[0].displayName || cand[0].lineDisplayName || '').trim(),
          staffId: String(cand[0].staffId || ''),
        });
      } else if (cand.length > 1) {
        hit = cand;   // ตกไปเข้าเส้นทาง ambiguous ข้างล่าง
      }
    }
    if (hit.length === 1) {
      out.resolved[label] = {
        staffId: String(hit[0].staffId || ''),
        name: String(hit[0].displayName || hit[0].lineDisplayName || '').trim(),
        role: String(hit[0].role || ''),
      };
    } else if (hit.length > 1) {
      out.ambiguous.push({ label: label, staffIds: hit.map(function (x) { return String(x.staffId || ''); }) });
    } else {
      out.missing.push(label);
    }
  }
  return out;
}

// ตัวคิดจริงทั้งหมด — pure ไม่แตะชีตเลย เพื่อให้ preview กับ apply เดินเส้นทางเดียวกันเป๊ะ
// (ถ้า preview คิดคนละทางกับ apply ตัวเลขที่เจ้าของเห็นตอน preview จะไม่ใช่สิ่งที่เกิดขึ้นจริง)
function productOwnerAssignPlanCore_(planIndex, products, owners, overwrite) {
  var ownUp = {};
  var keys = Object.keys(owners || {});
  for (var a = 0; a < keys.length; a++) ownUp[String(keys[a]).trim().toUpperCase()] = owners[keys[a]];

  var res = {
    assign: [], sharedSkip: [], takenSkip: [],
    perStaff: {}, catHit: {}, unplanned: {}, missingCats: [], caseWarn: [],
  };
  for (var i = 0; i < (products || []).length; i++) {
    var p = products[i] || {};
    var sku = String(p.sku || '').trim();
    if (!sku) continue;
    var k = productOwnerNormKey_(p.category);
    var slot = k ? planIndex.byCat[k] : null;
    if (!slot) {
      var lbl = String(p.category || '').trim() || '(ไม่ระบุหมวด)';
      res.unplanned[lbl] = (res.unplanned[lbl] || 0) + 1;
      continue;
    }
    res.catHit[k] = (res.catHit[k] || 0) + 1;
    if (slot.staff.length > 1) {
      res.sharedSkip.push({ sku: sku, category: slot.label, staff: slot.staff.slice() });
      continue;
    }
    var cur = ownUp[sku.toUpperCase()];
    if (cur && cur.staffId && !overwrite) {
      res.takenSkip.push({ sku: sku, category: slot.label, staff: slot.staff[0], current: cur.name || cur.staffId });
      continue;
    }
    // เขียนลงชีตเป็นตัวพิมพ์ใหญ่ให้ตรงกับ setProductOwnerHandler_ · ฝั่งเว็บอ่านดาวด้วย
    // owners[p.sku] แบบตรงตัว → SKU ที่ในชีตเป็นตัวพิมพ์เล็กจะโชว์ดาวไม่ขึ้น ต้องบอกไว้
    if (sku !== sku.toUpperCase()) res.caseWarn.push(sku);
    res.assign.push({ sku: sku.toUpperCase(), name: String(p.name || ''), category: slot.label, staff: slot.staff[0] });
    res.perStaff[slot.staff[0]] = (res.perStaff[slot.staff[0]] || 0) + 1;
  }
  for (var n = 0; n < planIndex.order.length; n++) {
    var key = planIndex.order[n];
    if (!res.catHit[key]) res.missingCats.push(planIndex.byCat[key].label);
  }
  return res;
}

// อ่านดาวที่มีอยู่ตอนนี้ (ไม่สร้างชีตถ้ายังไม่มี — preview ต้องไม่ทิ้งร่องรอยอะไรเลย)
function productOwnerReadMap_(ss) {
  var sh = ss.getSheetByName(SHEET_PRODUCT_OWNER);
  if (!sh) return {};
  var last = Math.min(sh.getLastRow(), POWN_MAX_ROWS + 1);
  if (last < 2) return {};
  return productOwnerMapFromRows_(sh.getRange(2, 1, last - 1, POWN_HEADERS.length).getValues());
}

// กางอักขระที่ "มองไม่เห็นด้วยตา" ออกมาเป็นรหัส — อีโมจิ/zero-width/ช่องว่างแปลก ๆ
// เป็นต้นเหตุที่ชื่อดูเหมือนตรงแต่เทียบไม่ตรง และไล่หาสาเหตุด้วยตาเปล่าไม่ได้เลย
function productOwnerDescribeName_(s) {
  var t = String(s == null ? '' : s);
  var odd = [];
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    // ปล่อยผ่าน: ASCII ที่พิมพ์ได้ + ช่วงภาษาไทย · นอกนั้นกางรหัสให้ดู
    if ((c >= 32 && c <= 126) || (c >= 0x0E00 && c <= 0x0E7F)) continue;
    odd.push('\\u' + ('0000' + c.toString(16).toUpperCase()).slice(-4));
  }
  return odd.length ? t + '   [อักขระพิเศษ: ' + odd.join(' ') + ']' : t;
}

// ⚠️ ชื่อฟังก์ชันห้ามลงท้าย _ ไม่งั้นไม่โผล่ใน dropdown ของ GAS editor (บทเรียนข้อ 1)
// ตัวตรวจ "ชื่อในตารางตรงกับชีตพนักงานไหม" — อ่านอย่างเดียว รันได้ตลอดเวลา
// มีไว้เพราะชื่อ LINE ของพนักงานมักมีอีโมจิ/อักขระพิเศษที่พิมพ์ตามด้วยมือไม่ได้
function checkProductOwnerStaffNames() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var all = readStaffAll_(ss);
  var actives = all.filter(function (s) { return String(s.status || '').trim() === 'active'; });

  Logger.log('── รายชื่อพนักงานในชีต "พนักงาน" (ใช้งานอยู่ ' + actives.length + ' คน จากทั้งหมด ' + all.length + ') ──');
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    var act = String(s.status || '').trim() === 'active';
    Logger.log('  ' + (act ? '✅' : '⛔ [' + (s.status || 'ไม่ระบุสถานะ') + ']') + ' ' + s.staffId
      + ' · ชื่อ: ' + productOwnerDescribeName_(s.displayName)
      + (String(s.lineDisplayName || '') !== String(s.displayName || '')
        ? ' · ชื่อ LINE: ' + productOwnerDescribeName_(s.lineDisplayName) : '')
      + ' · ตำแหน่ง: ' + (s.role || '-'));
  }

  var labels = [];
  for (var p = 0; p < PRODUCT_OWNER_ASSIGN_PLAN_.length; p++) {
    var nm = productOwnerPlanKeyOf_(PRODUCT_OWNER_ASSIGN_PLAN_[p]);
    if (nm && labels.indexOf(nm) < 0) labels.push(nm);
  }
  var who = productOwnerResolveStaffCore_(all, labels);

  Logger.log('── ชื่อในตารางมอบหมาย (' + labels.length + ' ชื่อ) ──');
  for (var n = 0; n < labels.length; n++) {
    var label = labels[n];
    var got = who.resolved[label];
    if (!got) continue;
    var how = '';
    for (var l = 0; l < who.loose.length; l++) if (who.loose[l].label === label) how = ' (จับคู่แบบไม่ตรงเป๊ะ — ตรวจว่าถูกคนไหม)';
    Logger.log('  ✅ "' + label + '" → ' + got.staffId + ' · ' + productOwnerDescribeName_(got.name) + how);
  }
  for (var m = 0; m < who.ambiguous.length; m++) {
    Logger.log('  ⛔ "' + who.ambiguous[m].label + '" ตรงกับหลายคน: ' + who.ambiguous[m].staffIds.join(', ')
      + ' — ใส่ staffId แทนชื่อในตาราง');
  }
  for (var k = 0; k < who.missing.length; k++) {
    Logger.log('  ⛔ "' + who.missing[k] + '" หาไม่เจอ — ลอกชื่อจากรายการข้างบนมาใส่ในตาราง หรือใส่ staffId แทน');
  }
  if (!who.missing.length && !who.ambiguous.length) {
    Logger.log('✅ ชื่อในตารางตรงกับชีตครบทุกคน' + (who.loose.length ? ' (มี ' + who.loose.length + ' ชื่อที่จับคู่แบบไม่ตรงเป๊ะ — ดูข้างบน)' : ''));
  } else {
    Logger.log('⛔ ยังมีชื่อที่ใช้ไม่ได้ — applyProductOwnerAssign() จะไม่เขียนอะไรเลยจนกว่าจะแก้ครบ');
  }

  // บรรทัดพร้อมลอก — เติม staffId ให้เสร็จ ไม่ต้องพิมพ์ชื่อที่มีอักขระพิเศษเองอีก
  // (จุดประสงค์ทั้งหมดของการย้ายมาใช้ staffId คือ "เลิกพึ่งการพิมพ์ชื่อให้ตรง")
  Logger.log('── ลอกบรรทัดข้างล่างไปวางแทนใน PRODUCT_OWNER_ASSIGN_PLAN_ (เติม staffId ให้แล้ว) ──');
  for (var q = 0; q < PRODUCT_OWNER_ASSIGN_PLAN_.length; q++) {
    var ent = PRODUCT_OWNER_ASSIGN_PLAN_[q] || {};
    var hit = who.resolved[productOwnerPlanKeyOf_(ent)];
    var cats = (ent.categories || []).map(function (c) { return "'" + c + "'"; }).join(', ');
    Logger.log("  { staffId: '" + (hit ? hit.staffId : '??') + "', staff: '" + (ent.staff || '')
      + "', categories: [" + cats + '] },' + (hit ? '' : '   // ⛔ ยังหาคนนี้ไม่เจอ'));
  }
  return { staff: all, match: who };
}

// ขั้นที่ 1 — ดูชื่อหมวดจริงในชีตก่อนแก้ตาราง (อ่านอย่างเดียว)
function listProductCategories() {
  var products = readProducts_();
  var counts = {};
  for (var i = 0; i < products.length; i++) {
    var lbl = String(products[i].category || '').trim() || '(ไม่ระบุหมวด)';
    counts[lbl] = (counts[lbl] || 0) + 1;
  }
  var idx = productOwnerPlanIndex_(PRODUCT_OWNER_ASSIGN_PLAN_);
  var rows = Object.keys(counts).map(function (k) { return { label: k, n: counts[k] }; })
    .sort(function (x, y) { return y.n - x.n; });

  Logger.log('── หมวดสินค้าจริงในชีต: ' + rows.length + ' หมวด · ' + products.length + ' SKU ──');
  for (var r = 0; r < rows.length; r++) {
    var slot = idx.byCat[productOwnerNormKey_(rows[r].label)];
    var who = !slot ? '— ยังไม่มีในตาราง (จะไม่มีคนดูแล)'
      : slot.staff.length > 1 ? '⚠️ ซ้อนกัน ' + slot.staff.length + ' คน: ' + slot.staff.join(', ')
      : '→ ' + slot.staff[0];
    Logger.log('  ' + rows[r].n + ' SKU · "' + rows[r].label + '" ' + who);
  }
  var seenKeys = {};
  Object.keys(counts).forEach(function (c) { seenKeys[productOwnerNormKey_(c)] = true; });
  var missing = [];
  for (var m = 0; m < idx.order.length; m++) {
    if (!seenKeys[idx.order[m]]) missing.push(idx.byCat[idx.order[m]].label);
  }
  if (missing.length) {
    Logger.log('⚠️ หมวดในตารางที่ "ไม่มีในชีตเลย" (พิมพ์ไม่ตรง?): ' + missing.join(' · '));
  }
  return rows;
}

// ขั้นที่ 3 — อ่านอย่างเดียว บอกว่าถ้ากด apply แล้วจะเกิดอะไรขึ้นบ้าง
function previewProductOwnerAssign() { return productOwnerAssignRun_(false); }

// ขั้นที่ 4 — เขียนจริง
function applyProductOwnerAssign() { return productOwnerAssignRun_(true); }

function productOwnerAssignRun_(doWrite) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var plan = PRODUCT_OWNER_ASSIGN_PLAN_;
  var idx = productOwnerPlanIndex_(plan);

  var labels = [];
  for (var i = 0; i < plan.length; i++) {
    var nm = productOwnerPlanKeyOf_(plan[i]);
    if (nm && labels.indexOf(nm) < 0) labels.push(nm);
  }
  var who = productOwnerResolveStaffCore_(readStaffAll_(ss), labels);
  var products = readProducts_();
  var owners = productOwnerReadMap_(ss);
  var res = productOwnerAssignPlanCore_(idx, products, owners, PRODUCT_OWNER_ASSIGN_OVERWRITE_ === true);

  Logger.log(doWrite ? '── มอบหมายผู้ดูแลสินค้า (เขียนจริง) ──' : '── ทดลองมอบหมาย (ยังไม่เขียนอะไรเลย) ──');
  Logger.log('สินค้าทั้งหมด ' + products.length + ' SKU · มีคนดูแลอยู่แล้ว ' + Object.keys(owners).length + ' SKU');

  var staffNames = Object.keys(res.perStaff).sort(function (a, b) { return res.perStaff[b] - res.perStaff[a]; });
  Logger.log('จะมอบหมายรวม ' + res.assign.length + ' SKU:');
  for (var s = 0; s < staffNames.length; s++) {
    var st = who.resolved[staffNames[s]];
    // โชว์ทั้งรหัสและชื่อจริงจากชีต — ตารางอาจอ้างด้วย staffId ล้วน ('ST0001' เฉย ๆ อ่านไม่ออกว่าใคร)
    Logger.log('  ' + (st ? st.staffId + ' · ' + st.name : staffNames[s] + ' ⚠️ หาในชีตพนักงานไม่เจอ')
      + ' → ' + res.perStaff[staffNames[s]] + ' SKU');
  }

  if (res.sharedSkip.length) {
    var sharedCats = {};
    for (var v = 0; v < res.sharedSkip.length; v++) sharedCats[res.sharedSkip[v].category] = (sharedCats[res.sharedSkip[v].category] || 0) + 1;
    Logger.log('⚠️ ข้าม ' + res.sharedSkip.length + ' SKU เพราะหมวดถูกอ้างสิทธิ์มากกว่า 1 คน '
      + '(1 สินค้า = 1 คนดูแล ต้องเลือกให้ชัดก่อน):');
    Object.keys(sharedCats).forEach(function (c) {
      var slot = idx.byCat[productOwnerNormKey_(c)];
      Logger.log('   · "' + c + '" ' + sharedCats[c] + ' SKU — ' + slot.staff.join(', '));
    });
  }
  if (res.takenSkip.length) Logger.log('ข้าม ' + res.takenSkip.length + ' SKU ที่มีคนดูแลอยู่แล้ว (ไม่ทับงานที่พนักงานกดเอง)');
  if (res.missingCats.length) Logger.log('⚠️ หมวดในตารางที่ไม่เจอสินค้าเลยสักตัว (พิมพ์ไม่ตรงชีต?): ' + res.missingCats.join(' · '));
  if (res.caseWarn.length) Logger.log('⚠️ SKU ที่ในชีตไม่ใช่ตัวพิมพ์ใหญ่ ' + res.caseWarn.length + ' ตัว — ดาวอาจไม่ขึ้นบนเว็บ: ' + res.caseWarn.slice(0, 10).join(', '));

  var unplannedKeys = Object.keys(res.unplanned).sort(function (a, b) { return res.unplanned[b] - res.unplanned[a]; });
  var unplannedTotal = 0;
  for (var u = 0; u < unplannedKeys.length; u++) unplannedTotal += res.unplanned[unplannedKeys[u]];
  if (unplannedTotal) {
    Logger.log('หมวดที่ยังไม่มีใครดูแล ' + unplannedTotal + ' SKU (' + unplannedKeys.length + ' หมวด): '
      + unplannedKeys.slice(0, 15).map(function (k) { return k + ' ' + res.unplanned[k]; }).join(' · '));
  }

  if (who.loose.length) {
    Logger.log('ℹ️ จับคู่ชื่อแบบ "ไม่ตรงเป๊ะ" (ชื่อในชีตมีอักขระพิเศษ/ส่วนเกิน) — ตรวจว่าถูกคนไหม:');
    who.loose.forEach(function (x) {
      Logger.log('   · ตาราง "' + x.label + '" → ชีต "' + x.matchedName + '" (' + x.staffId + ')');
    });
  }
  if (who.missing.length || who.ambiguous.length) {
    if (who.missing.length) Logger.log('⛔ ชื่อพนักงานที่หาในชีต "พนักงาน" ไม่เจอ (หรือ status ไม่ใช่ active): ' + who.missing.join(' · '));
    who.ambiguous.forEach(function (x) { Logger.log('⛔ ชื่อ "' + x.label + '" ตรงกับพนักงานหลายคน: ' + x.staffIds.join(', ') + ' — ใส่ staffId แทนชื่อในตาราง'); });
    Logger.log('⛔ ยังไม่เขียนอะไรทั้งสิ้น — แก้ชื่อในตารางให้ครบก่อนแล้วรันใหม่');
    return { ok: false, blocked: 'staff', preview: res, staff: who };
  }
  if (!doWrite) {
    var projected = Object.keys(owners).length + res.assign.length;
    if (projected > POWN_MAX_ROWS) {
      Logger.log('⛔ หลังมอบหมายชีตจะมีราว ' + projected + ' แถว เกินเพดาน POWN_MAX_ROWS='
        + POWN_MAX_ROWS + ' → ต้องเพิ่มค่าคงที่นั้นก่อน ไม่งั้นดาวส่วนที่เกินจะไม่ขึ้นเว็บ');
    }
    Logger.log('── จบการทดลอง (ไม่ได้เขียนอะไร) · พอใจแล้วรัน applyProductOwnerAssign() ──');
    return { ok: true, preview: res, staff: who };
  }
  if (!res.assign.length) {
    Logger.log('ไม่มีอะไรต้องเขียน');
    return { ok: true, written: 0, preview: res, staff: who };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) {
    Logger.log('⛔ ระบบกำลังยุ่ง (มีคนกดดาวอยู่?) — ลองใหม่อีกครั้ง');
    return { ok: false, blocked: 'lock' };
  }
  try {
    var sh = productOwnerSheet_(ss);
    var last = sh.getLastRow();
    var rowBySku = {};
    if (last >= 2) {
      var vals = sh.getRange(2, 1, last - 1, POWN_HEADERS.length).getValues();
      for (var q = 0; q < vals.length; q++) {
        var key = String(vals[q][POWN_COL.SKU - 1] || '').trim().toUpperCase();
        if (key) rowBySku[key] = q + 2;   // แถวล่างสุดชนะ — ตรงกับ productOwnerMapFromRows_
      }
    }
    var now = new Date();
    var appends = [], updates = [];
    for (var w = 0; w < res.assign.length; w++) {
      var it = res.assign[w];
      var stf = who.resolved[it.staff];
      var row = [it.sku, stf.staffId, stf.name, now, 'active', 'มอบหมายตามหมวด "' + it.category + '"'];
      var at = rowBySku[it.sku];
      if (at) updates.push({ row: at, values: row });
      else appends.push(row);
    }
    for (var x = 0; x < updates.length; x++) {
      sh.getRange(updates[x].row, 1, 1, POWN_HEADERS.length).setValues([updates[x].values]);
    }
    if (appends.length) {
      sh.getRange(sh.getLastRow() + 1, 1, appends.length, POWN_HEADERS.length).setValues(appends);
    }

    // 1 แถวสรุปต่อการรัน 1 ครั้ง — ไม่ใช่ 1 แถวต่อ SKU (Audit Log เป็นแหล่งของแท็บ
    // "ผลงานพนักงาน" ซึ่งอ่านทั้งเดือน · เพิ่มทีเป็นพันแถวจากการตั้งค่าครั้งเดียวไม่คุ้ม)
    writeAuditLog_('เจ้าของ (GAS editor)', 'setProductOwner', 'bulk',
      auditDetail_({ วิธี: 'มอบหมายตามหมวด', เขียนใหม่: appends.length, ทับแถวเดิม: updates.length, ต่อคน: res.perStaff }));

    Logger.log('✅ เขียนแล้ว ' + res.assign.length + ' SKU (เพิ่มแถวใหม่ ' + appends.length + ' · อัปเดตแถวเดิม ' + updates.length + ')');
    var rowsAfter = sh.getLastRow() - 1;
    if (rowsAfter > POWN_MAX_ROWS) {
      Logger.log('⛔ ชีตมี ' + rowsAfter + ' แถว เกินเพดาน POWN_MAX_ROWS=' + POWN_MAX_ROWS
        + ' → ดาวของแถวที่เกินจะไม่ถูกอ่านขึ้นเว็บเลย ต้องเพิ่มค่าคงที่นี้ก่อน');
    }
    if (!productOwnerEnabled_()) {
      Logger.log('⚠️ ระบบผู้ดูแลสินค้ายังปิดอยู่ — ดาวจะยังไม่โผล่จนกว่าจะรัน setupProductOwner()');
    }
    return { ok: true, written: res.assign.length, appended: appends.length, updated: updates.length, preview: res, staff: who };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ══════════════════════════════════════════════════════════════════════════
// ระบบคิวแจ้งเตือน LINE v2 — กันชนลิมิต (quota รายเดือน + 429) / กันส่งซ้ำ / 2 ช่องทาง
// ──────────────────────────────────────────────────────────────────────────
// ปัญหาเดิม: quota push รายเดือนหมดกลางเดือน → บอทเงียบ → งานสะดุด
//   ตัวกินหนักสุด = การ์ด order (2 ข้อความ/ออเดอร์) ยิงเป็นชุดตอนสั่งของรัว
// วิธีแก้:
//   1) คิวบนชีต + drainNotiQueue() ทุก 1 นาที ปล่อยส่งทีละชุด (throttle) กัน 429
//   2) coalesce: order หลายตัวในชุดเดียว → @All 1 + carousel 1 (2 ข้อความ) แทน 2×N
//   3) 2 ช่องทาง: งานจัดของ/order → primary (สำคัญสุด ห้ามเงียบ) ·
//      สรุป/สต็อกต่ำ/health → secondary (OA ตัวที่ 2) = เพิ่ม quota + แยก path
//   4) dedup กันส่งซ้ำด้วย dedupKey
// SAFE ROLLOUT: ทุกอย่าง gate ด้วย Script Property NOTI_QUEUE_ENABLED='true'
//   ถ้ายังไม่เปิด → enqueueNoti_ ส่งตรงทันทีแบบเดิมทุกประการ (deploy แล้วไม่พังของเดิม)
//   เปิดใช้จริงเมื่อเจ้าของรัน setupNotiSystem() 1 ครั้งใน GAS editor
// ══════════════════════════════════════════════════════════════════════════

// คอลัมน์ชีตคิว (1-indexed): A..L
var NOTI_COL = { ID:1, CREATED:2, CHANNEL:3, PRIORITY:4, TYPE:5, DEDUP:6,
                 TARGET:7, PAYLOAD:8, STATUS:9, ATTEMPTS:10, NEXTRETRY:11, LASTERR:12, SENTAT:13 };
var NOTI_HEADERS = ["id","createdAt","channel","priority","type","dedupKey",
                    "target","payload","status","attempts","nextRetryAt","lastError","sentAt"];

function notiEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('NOTI_QUEUE_ENABLED') === 'true';
}

// token/กลุ่มปลายทางต่อ channel — secondary fallback เป็น primary ถ้าไม่ได้ตั้ง
function lineToken_(channel) {
  if (channel === 'secondary' && LINE_ACCESS_TOKEN_2) return LINE_ACCESS_TOKEN_2;
  return LINE_ACCESS_TOKEN;
}
function lineGroupTarget_(channel) {
  var props = PropertiesService.getScriptProperties();
  if (channel === 'secondary') {
    var g2 = props.getProperty('LINE_GROUP_ID_2');
    if (g2) return g2;
  }
  return props.getProperty('LINE_GROUP_ID') || '';
}
// แปลง target ในคิวเป็น id จริง: ''/'group'=กลุ่มของ channel · 'user'=LINE_USER_ID · อื่น=id ตรงตัว
// LINE userId ผูกกับแต่ละ OA/channel แยกกัน — userId ของเจ้าของภายใต้บอทหลัก
// ใช้กับบอทตัวที่ 2 ไม่ได้ (คนละ channel = คนละ id space)
// channel secondary + target='user': ใช้ LINE_USER_ID_2 ถ้าตั้งไว้ (แอดบอทตัวที่ 2 เป็นเพื่อนแล้วดัก id เอง)
// ไม่ตั้ง → fallback ส่งเข้ากลุ่มของ channel นั้นแทน กันข้อความหาย
function resolveNotiTarget_(channel, target) {
  if (!target || target === 'group') return lineGroupTarget_(channel);
  if (target === 'user') {
    if (channel === 'secondary') {
      var u2 = PropertiesService.getScriptProperties().getProperty('LINE_USER_ID_2');
      return u2 || lineGroupTarget_(channel);
    }
    return LINE_USER_ID;
  }
  return target;
}

// low-level push — คืน {ok, code, quota, count}
// quota=true เมื่อชน 429 หรือ body บอกว่าโควตาเดือนหมด → drainer จะ backoff/ข้าม channel
function linePush_(channel, messages, target) {
  var token = lineToken_(channel);
  var to = resolveNotiTarget_(channel, target);
  if (!token || !to) { Logger.log("linePush_: no token/target (" + channel + ")"); return { ok:false, code:0, quota:false, count:0 }; }
  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post", muteHttpExceptions: true,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    payload: JSON.stringify({ to: to, messages: messages })
  });
  var code = res.getResponseCode();
  var body = res.getContentText() || "";
  var quota = code === 429 || /monthly limit|exceed|quota/i.test(body);
  if (code !== 200) Logger.log("linePush_ " + channel + " " + code + ": " + body.slice(0, 200));
  else notiBumpQuota_(channel, (messages || []).length);
  return { ok: code === 200, code: code, quota: quota, count: (messages || []).length };
}

// นับจำนวนข้อความที่ส่งจริงต่อ channel ต่อเดือน (ไว้ดู/guard)
function notiMonthKey_() { return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMM'); }
function notiBumpQuota_(channel, n) {
  if (!n) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'NOTI_SENT_' + channel + '_' + notiMonthKey_();
    var cur = parseInt(props.getProperty(key) || '0', 10) || 0;
    props.setProperty(key, String(cur + n));
  } catch (e) {}
}
function notiQuotaUsed_(channel) {
  return parseInt(PropertiesService.getScriptProperties()
    .getProperty('NOTI_SENT_' + channel + '_' + notiMonthKey_()) || '0', 10) || 0;
}

// ปริมาณ order สูง (~5-10 ครั้ง/วัน) เทียบ quota ฟรี 200/เดือนแล้วตึงมาก — ถ้าส่ง 2 ข้อความ/ชุด
// (mention+carousel) ตามเดิมจะชนเพดานเร็ว → ตัดเหลือ**ข้อความเดียว** (@All + สรุปรายชื่อ/จำนวนเป็น bullet)
// ยังคง @All ไว้เพราะสำคัญสำหรับพนักงานที่ไม่ถนัดเทคโนโลยี ตัดเฉพาะ flex carousel (สวยแต่แพง) ออก
function pushOrderBatch_(channel, orders, isDaily) {
  if (!orders || !orders.length) return { ok:true, quota:false };
  var show = orders.slice(0, 20);
  var lines = show.map(function(o) {
    var qtyNum = Number(o.qty) || 0;
    if (qtyNum <= 0 && o.sku) qtyNum = lookupOrderQty_(o.sku);
    return "• " + (o.name || o.sku || "-") + (qtyNum > 0 ? (" × " + qtyNum) : "");
  });
  if (orders.length > show.length) lines.push("… และอีก " + (orders.length - show.length) + " รายการ");
  // สรุปรอบวัน vs ออเดอร์นอกเวลา — พาดหัวต่างกัน พนักงานจะได้รู้ว่าต้องรีบแค่ไหน
  var head = isDaily
    ? "@All 📋 สรุปของที่ต้องจัด " + orders.length + " รายการ"
    : "@All 🚶 order เข้าใหม่ " + orders.length + " รายการ";
  var mentionText = head + "\n" + lines.join("\n");
  return linePush_(channel, [{ type: "text", text: mentionText,
      mention: { mentionees: [{ index: 0, length: 4, type: "all" }] } }]);
}

// ── รอบสรุปประจำวัน: กลั้นออเดอร์ทั้งวันไว้ส่งทีเดียวตอนเย็น ──────────────
// เวลาตัดรอบ (ชั่วโมง 0–23) ตั้งผ่าน Script Property NOTI_ORDER_CUTOFF_HOUR — default 16 (4 โมงเย็น)
// ตั้งเป็น -1 = ปิดโหมดนี้ กลับไปใช้หน้าต่าง coalesce แบบนาที (notiOrderBatchWindowMin_) เหมือนเดิม
function notiOrderCutoffHour_() {
  var v = PropertiesService.getScriptProperties().getProperty('NOTI_ORDER_CUTOFF_HOUR');
  if (v == null || v === '') return 16;
  var n = parseInt(v, 10);
  return isNaN(n) ? 16 : n;
}

// เวลาที่ออเดอร์ใบนี้ "ถึงกำหนดแจ้งเตือน"
//  - สั่งก่อนเวลาตัด  → รอรวมเป็นสรุปรอบเดียวตอนเวลาตัดของวันนั้น (ไม่กวนทั้งวัน)
//  - สั่งหลังเวลาตัด  → ส่งทันที (เลยรอบจัดของแล้ว ถ้าไม่บอกเดี๋ยวนั้นจะตกค้างข้ามวัน)
// คำนวณด้วยการบวก "นาทีที่เหลือจนถึงเวลาตัด" เข้ากับ timestamp ตรง ๆ
// (ใช้แค่ ชม./นาที ตามเขตเวลาสคริปต์ — เลี่ยงการ parse string เป็น Date ที่เพี้ยนตาม timezone)
function orderNotiDueMs_(createdMs, cutoffHour) {
  var tz = Session.getScriptTimeZone();
  var d  = new Date(createdMs);
  var h  = parseInt(Utilities.formatDate(d, tz, 'H'), 10) || 0;
  var mi = parseInt(Utilities.formatDate(d, tz, 'm'), 10) || 0;
  var nowMins = h * 60 + mi;
  var cutMins = cutoffHour * 60;
  if (nowMins >= cutMins) return createdMs;              // เลยเวลาตัดแล้ว → ครบกำหนดทันที
  return createdMs + (cutMins - nowMins) * 60000;        // รอถึงเวลาตัดของวันเดียวกัน
}

// หน้าต่าง coalesce order (นาที) ก่อนยอมส่ง — รวมออเดอร์ที่มาห่างกันแต่ยังในหน้าต่างเดียวกันเป็นชุดเดียว
// ยิ่งใช้ quota เดือนนี้ไปเยอะ ยิ่งยืดหน้าต่างอัตโนมัติ (ประหยัด quota ที่เหลือ กันเงียบกลางเดือนซ้ำ)
// ปรับ default ได้ผ่าน Script Property NOTI_ORDER_BATCH_MINUTES / NOTI_MONTHLY_CAP
function notiOrderBatchWindowMin_(channel) {
  var props = PropertiesService.getScriptProperties();
  var base = parseInt(props.getProperty('NOTI_ORDER_BATCH_MINUTES') || '20', 10) || 20;
  var cap  = parseInt(props.getProperty('NOTI_MONTHLY_CAP') || '200', 10) || 200;
  var used = notiQuotaUsed_(channel);
  if (used >= cap * 0.85) return base * 4;   // ใกล้เพดานมาก → ยืดยาว
  if (used >= cap * 0.6)  return base * 2;   // เริ่มใกล้ → ยืด 2 เท่า
  return base;
}

// ── เขียนเข้าคิว (หรือส่งตรงถ้ายังไม่เปิดระบบคิว) ──
// opts: {channel:'primary'|'secondary', priority:number(น้อย=ด่วน), type:'text'|'flex'|'order',
//        dedupKey:string, target:''|'user'|id, payload:{...}}
function enqueueNoti_(opts) {
  opts = opts || {};
  var channel  = opts.channel || 'primary';
  var priority = opts.priority != null ? opts.priority : 5;
  var type     = opts.type || 'text';
  var payload  = opts.payload || {};
  var target   = opts.target || '';
  var dedupKey = opts.dedupKey || '';

  // ระบบคิวยังปิด → ส่งตรงทันทีแบบเดิม (backward compatible 100%)
  if (!notiEnabled_()) { notiSendDirect_(channel, type, payload, target); return; }

  try {
    var sh = getNotiQueueSheet_();
    // dedup: มีแถว pending dedupKey เดียวกันอยู่แล้ว → ข้าม (กันส่งซ้ำ/ทับซ้อน)
    if (dedupKey) {
      var vals = sh.getDataRange().getValues();
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][NOTI_COL.STATUS - 1]) === 'pending' &&
            String(vals[i][NOTI_COL.DEDUP - 1]) === dedupKey) return;
      }
    }
    sh.appendRow([
      Utilities.getUuid().slice(0, 8), new Date(), channel, priority, type, dedupKey,
      target, JSON.stringify(payload), 'pending', 0, '', '', ''
    ]);
  } catch (e) {
    // คิวมีปัญหา → กันข้อความหาย ส่งตรงแทน
    Logger.log("enqueueNoti_ error → ส่งตรง: " + e);
    notiSendDirect_(channel, type, payload, target);
  }
}

// ส่งตรง (ไม่ผ่านคิว) — ใช้ตอนระบบคิวปิด หรือ enqueue ล้มเหลว
function notiSendDirect_(channel, type, payload, target) {
  try {
    if (type === 'order') { pushOrderBatch_(channel, [payload]); return; }
    if (type === 'flex')  { linePush_(channel, [{ type: "flex", altText: payload.altText || "แจ้งเตือน", contents: payload.contents }], target); return; }
    var msg = { type: "text", text: payload.text || "" };
    if (payload.mention) msg.mention = { mentionees: [{ index: 0, length: 4, type: "all" }] };
    linePush_(channel, [msg], target);
  } catch (e) { Logger.log("notiSendDirect_ error: " + e); }
}

function getNotiQueueSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_NOTI_QUEUE);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NOTI_QUEUE);
    sh.appendRow(NOTI_HEADERS);
    sh.getRange(1, 1, 1, NOTI_HEADERS.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

// ══ ตัวปล่อยคิว — ตั้ง trigger รันทุก 1 นาที (setupNotiSystem) ══
// throttle: ส่งไม่เกิน NOTI_MAX_SENDS_PER_RUN "push" ต่อ channel ต่อรอบ (default 4)
// order ทั้งหมดของ channel รวมเป็น 1 ชุด (coalesce) นับเป็น push เดียวเชิงตรรกะ
function drainNotiQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var sh = getNotiQueueSheet_();
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return;
    var now = Date.now();
    var maxSends = parseInt(PropertiesService.getScriptProperties().getProperty('NOTI_MAX_SENDS_PER_RUN') || '4', 10) || 4;

    // รวบ pending ต่อ channel (ข้ามที่ยังไม่ถึง nextRetry)
    var byChannel = {};   // channel → [{row, priority, type, target, dedup, payload, attempts}]
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i];
      if (String(r[NOTI_COL.STATUS - 1]) !== 'pending') continue;
      var nr = r[NOTI_COL.NEXTRETRY - 1];
      if (nr instanceof Date && nr.getTime() > now) continue;
      var ch = String(r[NOTI_COL.CHANNEL - 1]) || 'primary';
      var payload = {};
      try { payload = JSON.parse(r[NOTI_COL.PAYLOAD - 1] || '{}'); } catch (e) {}
      (byChannel[ch] = byChannel[ch] || []).push({
        row: i + 1, priority: Number(r[NOTI_COL.PRIORITY - 1]) || 5,
        type: String(r[NOTI_COL.TYPE - 1]) || 'text', target: String(r[NOTI_COL.TARGET - 1] || ''),
        payload: payload, attempts: Number(r[NOTI_COL.ATTEMPTS - 1]) || 0,
        created: r[NOTI_COL.CREATED - 1]
      });
    }

    var sent = [], retry = [];   // {row, ...}
    Object.keys(byChannel).forEach(function(ch) {
      var items = byChannel[ch].sort(function(a, b) {
        return a.priority - b.priority || a.row - b.row;   // ด่วนก่อน แล้วเก่าก่อน
      });
      var sends = 0;

      // 1) coalesce order ของ channel นี้เป็นชุดเดียว (นับเป็น 1 send)
      //    ยังไม่ flush ทันที — รอจนออเดอร์ตัวที่เก่าสุดในคิวรอมาถึงหน้าต่าง batch (ดูดออเดอร์ที่มาห่างกัน
      //    แต่ยังในหน้าต่างเดียวกันมารวมชุดเดียว) เว้นแต่คิวยาวเกิน NOTI_ORDER_BATCH_MAX ให้ flush เลยกันค้างนาน
      var orders = items.filter(function(x){ return x.type === 'order'; });
      if (orders.length) {
        var oldestMs = orders.reduce(function(m, x) {
          var t = (x.created instanceof Date) ? x.created.getTime() : now;
          return Math.min(m, t);
        }, now);
        var maxBatch = parseInt(PropertiesService.getScriptProperties().getProperty('NOTI_ORDER_BATCH_MAX') || '15', 10) || 15;
        var cutoffHour = notiOrderCutoffHour_();
        var useCutoff  = cutoffHour >= 0 && cutoffHour <= 23;
        var flushNow, isDaily = false;
        if (useCutoff) {
          // ครบกำหนดเมื่อ "ใบที่ถึงกำหนดเร็วที่สุด" ถึงเวลา — ใบก่อนเวลาตัดจะถูกกลั้นไว้จนถึงเวลาตัด
          // ส่วนใบที่สั่งหลังเวลาตัดครบกำหนดทันที แล้วลากใบที่ค้างอยู่ออกไปพร้อมกันในชุดเดียว
          var dueMs = orders.reduce(function(m, x) {
            var t = (x.created instanceof Date) ? x.created.getTime() : now;
            return Math.min(m, orderNotiDueMs_(t, cutoffHour));
          }, Infinity);
          flushNow = now >= dueMs || orders.length >= maxBatch;
          // ใบเก่าสุดสั่งไว้ "ก่อน" เวลาตัด = นี่คือรอบสรุปประจำวัน ไม่ใช่ออเดอร์นอกเวลา
          isDaily = orderNotiDueMs_(oldestMs, cutoffHour) > oldestMs;
        } else {
          var ageMin = (now - oldestMs) / 60000;
          flushNow = ageMin >= notiOrderBatchWindowMin_(ch) || orders.length >= maxBatch;
        }
        if (flushNow) {
          var res = pushOrderBatch_(ch, orders.map(function(x){ return x.payload; }), isDaily);
          if (res.ok) { orders.forEach(function(x){ sent.push(x.row); }); }
          else { orders.forEach(function(x){ retry.push({ row: x.row, attempts: x.attempts, quota: res.quota }); }); }
          sends++;
          if (res.quota) return;   // channel ชนลิมิต → หยุด channel นี้ทั้งรอบ
        }
        // ยังไม่ถึงหน้าต่าง → เว้นไว้ก่อน (ไม่แตะ status, รอบถัดไปค่อยเช็คใหม่)
      }

      // 2) ที่เหลือ (text/flex) ส่งทีละอันจนถึง throttle
      var rest = items.filter(function(x){ return x.type !== 'order'; });
      for (var k = 0; k < rest.length; k++) {
        if (sends >= maxSends) break;
        var x = rest[k];
        var msgs = x.type === 'flex'
          ? [{ type: "flex", altText: x.payload.altText || "แจ้งเตือน", contents: x.payload.contents }]
          : [(function(){ var m = { type: "text", text: x.payload.text || "" }; if (x.payload.mention) m.mention = { mentionees:[{index:0,length:4,type:"all"}] }; return m; })()];
        var r2 = linePush_(ch, msgs, x.target);
        sends++;
        if (r2.ok) sent.push(x.row);
        else { retry.push({ row: x.row, attempts: x.attempts, quota: r2.quota }); if (r2.quota) break; }
      }
    });

    // เขียนสถานะกลับ
    var nowD = new Date();
    sent.forEach(function(row) {
      sh.getRange(row, NOTI_COL.STATUS).setValue('sent');
      sh.getRange(row, NOTI_COL.SENTAT).setValue(nowD);
    });
    var maxAttempts = parseInt(PropertiesService.getScriptProperties().getProperty('NOTI_MAX_ATTEMPTS') || '6', 10) || 6;
    retry.forEach(function(x) {
      var att = x.attempts + 1;
      sh.getRange(x.row, NOTI_COL.ATTEMPTS).setValue(att);
      if (att >= maxAttempts) {
        sh.getRange(x.row, NOTI_COL.STATUS).setValue('failed');
        sh.getRange(x.row, NOTI_COL.LASTERR).setValue(x.quota ? 'quota/limit' : 'push failed');
      } else {
        // backoff: quota → 30 นาที, error ทั่วไป → 2^att นาที (cap 15)
        var delayMin = x.quota ? 30 : Math.min(15, Math.pow(2, att));
        sh.getRange(x.row, NOTI_COL.NEXTRETRY).setValue(new Date(now + delayMin * 60000));
        if (x.quota) sh.getRange(x.row, NOTI_COL.LASTERR).setValue('quota — รอ ' + delayMin + ' นาที');
      }
    });
  } catch (e) {
    Logger.log("drainNotiQueue error: " + e);
  } finally {
    lock.releaseLock();
  }
}

// เก็บกวาดคิว: ลบแถว sent/failed ที่เก่ากว่า N วัน (default 7) — เรียกจาก drain วันละครั้งพอ
function cleanupNotiQueue_() {
  try {
    var sh = getNotiQueueSheet_();
    var vals = sh.getDataRange().getValues();
    if (vals.length < 2) return;
    var cutoff = Date.now() - 7 * 86400000;
    var del = [];
    for (var i = 1; i < vals.length; i++) {
      var st = String(vals[i][NOTI_COL.STATUS - 1]);
      if (st !== 'sent' && st !== 'failed') continue;
      var when = vals[i][NOTI_COL.SENTAT - 1] || vals[i][NOTI_COL.CREATED - 1];
      var t = (when instanceof Date) ? when.getTime() : 0;
      if (t && t < cutoff) del.push(i + 1);
    }
    del.sort(function(a, b){ return b - a; }).forEach(function(row){ try { sh.deleteRow(row); } catch(e){} });
  } catch (e) { Logger.log("cleanupNotiQueue_ error: " + e); }
}

function sendLineMessage_(msg) {
  var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ to: LINE_USER_ID, messages: [{ type: "text", text: msg }] }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log("LINE push error " + res.getResponseCode() + ": " + res.getContentText());
  }
}

// ทดสอบ LINE: รันตรงๆ ใน GAS editor → ดู log ว่า error อะไร
function debugLineMessage() {
  Logger.log("LINE_USER_ID: " + LINE_USER_ID);
  Logger.log("TOKEN length: " + (LINE_ACCESS_TOKEN || "").length);
  sendLineMessage_("🔔 ทดสอบ LINE จาก GAS — " + new Date().toLocaleString("th-TH"));
}

function sendLineGroup_(msg) {
  var groupId = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID');
  if (!groupId) return;
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ to: groupId, messages: [{ type: "text", text: msg }] }),
    muteHttpExceptions: true
  });
}

function sendLineGroupMentionAll_(msg) {
  var groupId = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID');
  if (!groupId) return;
  var fullText = "@All " + msg;
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({
      to: groupId,
      messages: [{
        type: "text",
        text: fullText,
        mention: { mentionees: [{ index: 0, length: 4, type: "all" }] }
      }]
    }),
    muteHttpExceptions: true
  });
}

// ค้นจำนวนที่สั่งของ SKU จากชีตออเดอร์ — เอาแถวล่าสุดที่ SKU ตรง (col H = จำนวน)
// ใช้เป็น fallback เผื่อ call site ไม่ได้ส่ง qty มา
function lookupOrderQty_(sku) {
  try {
    if (!sku) return 0;
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ORDERS);
    if (!sh) return 0;
    var rows = sh.getDataRange().getValues();
    var target = String(sku).trim().toUpperCase();
    var found = 0;
    for (var i = 2; i < rows.length; i++) {
      var rsku = String(rows[i][COL_ORD_SKU - 1] || '').trim().toUpperCase();  // col F
      if (rsku === target) {
        var q = Number(rows[i][7]) || 0;  // col H = จำนวนที่สั่ง
        if (q > 0) found = q;             // เอาแถวล่าสุดที่มีจำนวน
      }
    }
    return found;
  } catch (e) { Logger.log('lookupOrderQty_ error: ' + e); return 0; }
}

// การ์ด order (จัดของ order) = งานสำคัญสุด → ช่องทาง primary priority 1
// เข้าคิวเพื่อ coalesce หลายออเดอร์ในชุดเดียว → ประหยัด quota มหาศาล (2×N → 2 ข้อความ)
// ระบบคิวปิดอยู่ → enqueueNoti_ จะส่งตรงทันทีแบบเดิม (ผ่าน pushOrderBatch_ 1 ตัว)
function sendLineGroupOrderCard_(name, sku, date, imageUrl, qty) {
  enqueueNoti_({
    channel: 'primary', priority: 1, type: 'order',
    payload: { name: name || '', sku: sku || '', date: date || '', imageUrl: imageUrl || '', qty: Number(qty) || 0 }
  });
  // แจ้งเตือนในแอปด้วย — จุดนี้ครอบคลุมทุกที่ที่สั่งของ (ทั้ง 3 call site) ในที่เดียว
  // ต่างจาก LINE ตรงที่ **ไม่ถูกกลั้นรอรอบ 16:00** เพราะไม่กิน quota → คลังเห็นทันที
  pushInappNoti_({
    audience: 'role:warehouse,employee,owner',
    type: 'order', tab: 'orders',
    title: '📦 ออเดอร์ใหม่ ' + (Number(qty) || 0) + ' ชิ้น',
    body: (name || sku || '-') + (sku ? ' · ' + sku : ''),
    image: imageUrl || '',   // ออเดอร์เดียวมี SKU เดียว — มีรูปให้ใส่ตรง ๆ
    focus: sku || '',        // กดแล้วพาไปหยุดที่ใบนี้เลย ไม่ต้องไล่หาเองในลิสต์เป็นสิบใบ
  });
}

// สรุปออเดอร์รอขึ้นรถ — ส่ง LINE กลุ่ม อังคาร-อาทิตย์ 08:00 และ 13:00
function sendPendingTruckOrders() {
  var day = new Date().getDay();
  // ตั้งค่าวันที่แจ้งเตือนได้ผ่าน Script Property TRUCK_NOTIFY_DAYS
  // รูปแบบ: comma-separated day numbers (0=อา,1=จ,2=อ,3=พ,4=พฤ,5=ศ,6=ส)
  // ค่า default: "0,5,6" = ศุกร์+เสาร์+อาทิตย์ (backward compatible)
  var prop = PropertiesService.getScriptProperties().getProperty('TRUCK_NOTIFY_DAYS') || '0,5,6';
  var notifyDays = prop.split(',').map(Number);
  if (!notifyDays.includes(day)) return;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) return;
  var rows = sh.getDataRange().getValues();
  var pending = [];
  for (var i = 2; i < rows.length; i++) {
    var r = rows[i];
    var type   = String(r[0] || '').trim();
    var status = String(r[2] || '').trim();
    var sku    = String(r[5] || '').trim();
    var name   = String(r[6] || '').trim();
    var qty    = Number(r[7]) || 0;
    if (!sku || !qty) continue;
    if (type === 'หิ้ว') continue;
    var isPending = !status || status === 'รอ' || status === 'pending';
    if (!isPending) continue;
    pending.push({ sku: sku, name: name || sku, qty: qty });
  }
  var dateStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy');
  var hour = new Date().getHours();
  var label = hour < 12 ? '🌅 เช้า' : '🌞 บ่าย';
  // dedup กันรัน trigger ซ้ำในรอบเดียวกันส่งซ้ำ (key ผูกกับวันที่+ช่วงเวลา)
  var dedupKey = 'truck:' + dateStr + ':' + (hour < 12 ? 'am' : 'pm');

  if (!pending.length) {
    enqueueNoti_({ channel: 'primary', priority: 3, type: 'text',
      dedupKey: dedupKey, payload: { text: "✅ ไม่มีของรอขึ้นรถแล้ว\nจัดครบหมดแล้ว 👍" } });
    return;
  }

  // ตัดเหลือข้อความเดียว (@All + bullet list) แทน mention+carousel เดิม (2→1 ข้อความ ประหยัด quota)
  var show = pending.slice(0, 20);
  var lines = show.map(function(o) { return "• " + o.name + " × " + o.qty; });
  if (pending.length > show.length) lines.push("… และอีก " + (pending.length - show.length) + " รายการ");
  var text = "@All 🚚 " + label + " รอขึ้นรถ " + pending.length + " รายการ\n" + lines.join('\n');
  enqueueNoti_({ channel: 'primary', priority: 3, type: 'text', dedupKey: dedupKey,
    payload: { text: text, mention: true } });
}

// รันครั้งแรกเพื่อสร้าง trigger 08:00 และ 13:00 (รันเองใน GAS editor)
// ทดสอบส่งแจ้งเตือนรอขึ้นรถโดยไม่เช็ควัน — รันจาก GAS dropdown ได้เลย
function testTruckNotification() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) { Logger.log("ไม่พบชีต"); return; }
  var rows = sh.getDataRange().getValues();
  var pending = [];
  for (var i = 2; i < rows.length; i++) {
    var r = rows[i];
    var type   = String(r[0] || '').trim();
    var status = String(r[2] || '').trim();
    var sku    = String(r[5] || '').trim();
    var name   = String(r[6] || '').trim();
    var qty    = Number(r[7]) || 0;
    if (!sku || !qty) continue;
    if (type === 'หิ้ว') continue;
    var isPending = !status || status === 'รอ' || status === 'pending';
    if (!isPending) continue;
    pending.push({ sku: sku, name: name || sku, qty: qty });
  }
  Logger.log("pending truck orders: " + pending.length);
  if (!pending.length) {
    Logger.log("ไม่มีรายการรอขึ้นรถ");
    sendLineGroup_("✅ ไม่มีของรอขึ้นรถแล้ว\nจัดครบหมดแล้ว 👍");
    return;
  }

  var groupId = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID');
  if (!groupId) { Logger.log("ไม่มี LINE_GROUP_ID"); return; }

  var imgMap = {};
  try { imgMap = readImageMap_(); } catch(e) {}

  var mentionText = "@All 🚚 🌅 ทดสอบ — รอขึ้นรถ " + pending.length + " รายการ";
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post", muteHttpExceptions: true,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ to: groupId, messages: [{
      type: "text", text: mentionText,
      mention: { mentionees: [{ index: 0, length: 4, type: "all" }] }
    }]})
  });

  var bubbles = pending.slice(0, 12).map(function(o) {
    var imgUrl = imgMap[(o.sku||"").toUpperCase()] || "";
    var bubble = {
      type: "bubble", size: "micro",
      body: {
        type: "box", layout: "vertical", spacing: "xs", paddingAll: "12px",
        contents: [
          { type: "text", text: o.name, weight: "bold", size: "sm", wrap: true, maxLines: 2 },
          { type: "text", text: o.sku, size: "xxs", color: "#888888" },
          { type: "text", text: "× " + o.qty + " ชิ้น", size: "sm", color: "#1d4ed8", weight: "bold" }
        ]
      }
    };
    if (imgUrl) bubble.hero = { type: "image", url: imgUrl, size: "full", aspectRatio: "4:3", aspectMode: "fit" };
    return bubble;
  });

  var r = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post", muteHttpExceptions: true,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ to: groupId, messages: [{ type: "flex", altText: "รอขึ้นรถ " + pending.length + " รายการ", contents: { type: "carousel", contents: bubbles } }] })
  });
  Logger.log("carousel: " + r.getResponseCode() + " " + r.getContentText().slice(0,300));
}

function setupOrderReminders() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sendPendingTruckOrders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendPendingTruckOrders').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('sendPendingTruckOrders').timeBased().everyDays(1).atHour(13).create();
  Logger.log('✅ ตั้ง trigger 08:00 + 13:00 เรียบร้อย');
}

// ───────────────────────────────────────────────────────────
// SECTION: Dead Stock endpoint + LINE Low Stock Alert
// ───────────────────────────────────────────────────────────

// handler สำหรับ action=getDeadStock
// คืนสินค้าที่มียอดหน้าร้าน (col G) > 0 และไม่ได้รับโอนมานานกว่า 3 เดือน (หรือไม่เคยโอน)
// เรียงจาก deadMonths มากสุดขึ้นก่อน (null = ไม่เคยโอน อยู่ท้ายสุด), จำกัด 100 แถว
function handleGetDeadStock_() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // อ่านชีตสินค้า (อัพเดทจำนวนสินค้า) — B=SKU(1), C=ชื่อ(2), G=หน้าร้าน(6,0-idx), H=คลัง(7,0-idx)
    const prodSh = ss.getSheetByName(SHEET_PRODUCTS);
    if (!prodSh) return ContentService.createTextOutput(JSON.stringify({ items: [], error: "ไม่พบชีต " + SHEET_PRODUCTS })).setMimeType(ContentService.MimeType.JSON);
    const prodRows = prodSh.getDataRange().getDisplayValues();

    // อ่านวันโอนล่าสุดต่อ SKU จากชีต ประวัติโอนหน้าร้าน (col A=SKU, col B=lastTransferDate)
    const histMap = readTransferHistory_(); // sku.toUpperCase() → "yyyy-MM-dd"

    const now = new Date();
    const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000; // ~3 เดือน (90 วัน)

    const items = [];
    // header อยู่แถวที่ 0 และ 1 (2 แถว) — เริ่มจาก index 2
    for (let i = 2; i < prodRows.length; i++) {
      const r = prodRows[i];
      const sku     = (r[1] || "").toString().trim();
      const name    = (r[2] || "").toString().trim();
      if (!sku && !name) continue;

      // col G(index 6) = หน้าร้าน, col H(index 7) = คลัง
      const qtyFront = parseInt(r[6]) || 0;
      const qtyWH    = parseInt(r[7]) || 0;

      // เฉพาะสินค้าที่มีของอยู่หน้าร้าน
      if (qtyFront <= 0) continue;

      const lastTransferDate = histMap[sku.toUpperCase()] || null;

      // คำนวณ deadMonths
      let deadMonths = null;
      if (lastTransferDate) {
        // format yyyy-MM-dd
        const parts = lastTransferDate.split("-");
        if (parts.length === 3) {
          const ref = new Date(+parts[0], +parts[1] - 1, +parts[2]);
          const diffMs = now - ref;
          if (!isNaN(ref)) {
            let mo = (now.getFullYear() - ref.getFullYear()) * 12 + (now.getMonth() - ref.getMonth());
            if (now.getDate() < ref.getDate()) mo -= 1;
            deadMonths = mo < 0 ? 0 : mo;
          }
        }
      }
      // กรอง: โอนมาแล้ว < 3 เดือน = ไม่นับเป็นจม
      if (deadMonths !== null && deadMonths < 3) continue;

      items.push({ sku, name, qtyFront, qtyWH, lastTransferDate, deadMonths });
    }

    // เรียง: deadMonths มากสุดขึ้นก่อน, null อยู่ท้าย (นับเป็นจมที่สุด)
    items.sort(function(a, b) {
      if (a.deadMonths === null && b.deadMonths === null) return 0;
      if (a.deadMonths === null) return 1;  // null → ท้าย
      if (b.deadMonths === null) return -1;
      return b.deadMonths - a.deadMonths;
    });

    return ContentService
      .createTextOutput(JSON.stringify({ items: items.slice(0, 100), generatedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ items: [], error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// อ่าน mapping เลขที่ QT → ชื่อเซล จากชีต เซลใบเสนอราคา (col A=number, B=sale)
function readQuoteSaleMap_() {
  const map = {};
  try {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_QUOTE_SALE);
    if (!sh) return map;
    const rows = sh.getDataRange().getDisplayValues();
    for (let i = 1; i < rows.length; i++) {
      const num = String(rows[i][0] || "").trim();
      const sale = String(rows[i][1] || "").trim();
      if (num) map[num] = sale;
    }
  } catch (e) { Logger.log("readQuoteSaleMap_ error: " + e); }
  return map;
}

// บันทึกชื่อเซลของใบเสนอราคา (assign จาก dashboard) — เก็บในชีตเรา ไม่แตะ ZORT
function setQuoteSale_(quoteNumber, sale, actor) {
  const jsonOut = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const num = String(quoteNumber || "").trim();
    if (!num) return jsonOut({ ok: false, error: "ไม่มีเลขที่ใบเสนอราคา" });
    const saleName = String(sale || "").trim();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(SHEET_QUOTE_SALE);
    if (!sh) { sh = ss.insertSheet(SHEET_QUOTE_SALE); sh.appendRow(["เลขที่ใบเสนอราคา", "ชื่อเซล", "โดย", "เมื่อ"]); }
    const rows = sh.getDataRange().getDisplayValues();
    let rowIdx = -1;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim() === num) { rowIdx = i + 1; break; }
    }
    const stamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm");
    if (rowIdx > 0) {
      sh.getRange(rowIdx, 2, 1, 3).setValues([[saleName, actor || "owner", stamp]]);
    } else {
      sh.appendRow([num, saleName, actor || "owner", stamp]);
    }
    CacheService.getScriptCache().remove('pending_quotes_v1'); // ให้ View ดึงใหม่เห็นชื่อเซล
    CacheService.getScriptCache().remove('quote_summary_v1');
    return jsonOut({ ok: true });
  } catch (e) {
    return jsonOut({ ok: false, error: String(e) });
  }
}

// handler สำหรับ action=getPendingQuotations
// คืนใบเสนอราคาสถานะ Pending (ค้าง/รอลูกค้าตัดสินใจ) พร้อมข้อมูลติดต่อลูกค้า + อายุ + มูลค่า
// เรียงตามมูลค่ามากสุดก่อน (ตามดีลใหญ่ก่อน) · cache 5 นาทีกัน hammer ZORT
// ชื่อเซลอ่านจากช่องที่พิมพ์เอง (default tag) เพราะทุกใบคีย์ด้วยบัญชี ZORT เดียว
function handleGetPendingQuotations_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('pending_quotes_v1');
    if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

    const SALE_FIELD = PropertiesService.getScriptProperties().getProperty('QUOTE_SALE_FIELD') || 'tag';
    const tz = "Asia/Bangkok";
    const today = new Date();
    const DAYS = 180; // ใบเสนอราค่ามีอายุ 3 เดือน — ดึง 180 วันเผื่อครอบคลุมใบที่ยังไม่หมดอายุ
    const fromDate = new Date(today.getTime() - DAYS * 24 * 60 * 60 * 1000);
    const fromStr = Utilities.formatDate(fromDate, tz, "yyyy-MM-dd");
    const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

    const items = [];
    let totalValue = 0;
    const limit = 200, MAX_PAGES = 20;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${ZORT_BASE}/Quotation/GetQuotations?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
      const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) break;
      const list = (JSON.parse(res.getContentText())).list || [];
      for (const q of list) {
        if (String(q.status || "") !== "Pending") continue;
        const ds = q.quotationdateString || (q.quotationdate ? String(q.quotationdate).substring(0, 10) : null);
        let ageDays = null, qDate = null;
        if (ds) {
          const [yr, mo, dy] = ds.split("-").map(Number);
          const d = new Date(yr, mo - 1, dy);
          if (!isNaN(d)) {
            if (d < fromDate || d > today) continue; // กันวันที่นอกช่วง
            qDate = ds;
            ageDays = Math.floor((today - d) / (24 * 60 * 60 * 1000));
          }
        }
        // วันหมดอายุ (ถ้ามี) → เหลือกี่วัน
        let expireInDays = null;
        const es = q.expiredateString || (q.expiredate ? String(q.expiredate).substring(0, 10) : null);
        if (es) {
          const [ey, em, ed] = es.split("-").map(Number);
          const edt = new Date(ey, em - 1, ed);
          if (!isNaN(edt)) expireInDays = Math.ceil((edt - today) / (24 * 60 * 60 * 1000));
        }
        const amount = Number(q.amount) || 0;
        totalValue += amount;
        items.push({
          id: q.id,
          number: String(q.number || ""),
          customer: String(q.customername || "").trim() || "(ไม่ระบุชื่อ)",
          phone: String(q.customerphone || "").trim(),
          email: String(q.customeremail || "").trim(),
          amount,
          quotationDate: qDate,
          ageDays,
          expireInDays,
          sale: String(q[SALE_FIELD] || "").trim(),
        });
      }
      if (list.length < limit) break;
      Utilities.sleep(120);
    }

    // overlay ชื่อเซลจากชีต mapping (assign ใน dashboard ชนะค่า tag จาก ZORT)
    const saleMap = readQuoteSaleMap_();
    const salesSet = {};
    items.forEach(it => {
      if (saleMap[it.number]) it.sale = saleMap[it.number];
      if (it.sale) salesSet[it.sale] = true;
    });
    Object.values(saleMap).forEach(s => { if (s) salesSet[s] = true; }); // รวมชื่อเซลที่เคยใช้ (ใบอื่นด้วย)

    items.sort((a, b) => b.amount - a.amount);
    const payload = JSON.stringify({ items, totalValue, count: items.length, salesList: Object.keys(salesSet).sort(), generatedAt: new Date().toISOString() });
    cache.put('pending_quotes_v1', payload, 300);
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ items: [], error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ดึงรายละเอียดใบเสนอราคาเดิม (สำหรับพิมพ์ A4 ย้อนหลัง) — ปรับ field ให้ตรงกับที่
// QuotationPrintDoc (views-quote.jsx) ต้องการ: customer/items/remarks/salesRep/totals
// remarks แยกจาก description ด้วย \n (ตรงกับที่ createQuotation ต่อไว้ตอนสร้าง)
function getQuotationForPrint(idOrNumber) {
  var idParam = String(idOrNumber || "").trim();
  if (!idParam) return error("ไม่มี id/number ของใบเสนอราคา");
  try {
    var res = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/GetQuotationDetail?id=" + encodeURIComponent(idParam),
      { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    var zErr = zortRespError_(res);
    if (zErr) return error("ดึงรายละเอียดใบเสนอราคาไม่สำเร็จ: " + zErr);
    var od = {};
    try { var json = JSON.parse(res.getContentText() || "{}"); od = json.quotation || json.data || json; } catch (e) { return error("อ่านรายละเอียดใบเสนอราคาไม่ได้: " + e); }
    if (!od || !od.list) return error("ไม่พบข้อมูลใบเสนอราคา (id/number: " + idParam + ")");

    var items = (od.list || []).map(function (it) {
      var qty = Number(it.number) || 0;
      var unit = Number(it.pricepernumber) || 0;
      return { sku: it.sku || "", name: it.name || it.sku || "", qty: qty, price: unit, category: "" };
    }).filter(function (it) { return it.qty > 0; });

    var grand = Number(od.amount) || 0;
    var preVat = Number(od.amount_pretax);
    var vat = Number(od.vatamount);
    if (!(preVat > 0) || isNaN(preVat)) { preVat = Math.round(grand / 1.07 * 100) / 100; vat = Math.round((grand - preVat) * 100) / 100; }

    return ok({
      quotationNumber: od.number || idParam,
      customer: {
        name: od.customername || "", taxId: od.customeridnumber || "",
        branch: od.customerbranchname || "", branchNo: od.customerbranchno || "",
        address: od.customeraddress || "", phone: od.customerphone || "", email: od.customeremail || "",
      },
      items: items,
      remarks: String(od.description || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean),
      salesRep: (Array.isArray(od.tag) && od.tag[0]) || "",
      totals: { grandTotal: grand, preVat: preVat, vat: vat, retailEligible: grand, retailExcluded: 0, manualDiscount: 0 },
    });
  } catch (e) {
    return error("ดึงรายละเอียดใบเสนอราคาไม่สำเร็จ: " + e);
  }
}

// เลขที่ใบแจ้งหนี้ของเราเอง (คนละเลขกับใบเสนอราคาของ ZORT) — รูปแบบ IVB-yyyyMM### วิ่งต่อเนื่อง
// ต่อเดือนเหมือนเลข QT ของ ZORT · ผูกกับเลขที่ใบเสนอราคาต้นทาง 1 แถว/1 ใบเสนอราคา — พิมพ์ซ้ำใบเดิม
// ได้เลขเดิมเสมอ (idempotent กันเลขวิ่งเปลืองตอนกดพิมพ์ซ้ำ) เก็บใน SHEET_INVOICE_NUM
// เลขที่ใบเสนอราคาต้นทางยังโชว์อยู่บนใบแจ้งหนี้ในบรรทัด "เลขที่เอกสารอ้างอิง1" (QuotationPrintDoc)
function nextInvoiceNumber_(quotationNumber, actor) {
  const jsonOut = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  const qNum = String(quotationNumber || "").trim();
  if (!qNum) return jsonOut({ ok: false, error: "ไม่มีเลขที่ใบเสนอราคาอ้างอิง" });
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return jsonOut({ ok: false, error: "ระบบไม่ว่าง ลองใหม่อีกครั้ง" });
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = getOrCreateSheet_(ss, SHEET_INVOICE_NUM, ["เลขที่ใบเสนอราคา", "เลขที่ใบแจ้งหนี้", "โดย", "เมื่อ"]);
    const rows = sh.getDataRange().getDisplayValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0] || "").trim() === qNum) {
        return jsonOut({ ok: true, invoiceNumber: String(rows[i][1] || "").trim(), reused: true });
      }
    }
    const prefix = "IVB-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyyMM");
    let maxSeq = 0;
    for (let i = 1; i < rows.length; i++) {
      const v = String(rows[i][1] || "").trim();
      if (v.indexOf(prefix) === 0) {
        const seq = parseInt(v.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    const invoiceNumber = prefix + String(maxSeq + 1).padStart(3, "0");
    const stamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm");
    sh.appendRow([qNum, invoiceNumber, actor || "ไม่ระบุ", stamp]);
    return jsonOut({ ok: true, invoiceNumber: invoiceNumber, reused: false });
  } catch (e) {
    return jsonOut({ ok: false, error: String(e) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// handler สำหรับ action=getQuotationSummary — คืนใบเสนอราคา "ทุกสถานะ" (Approved/Pending/Voided)
// quotation ทั้งระบบมีไม่มาก (~ร้อยกว่าใบ) → ดึงทุกหน้าแล้วส่ง raw ให้ frontend รวมเอง (ยืดหยุ่นกับตัวเลือกปี/เดือน)
// cache 5 นาที · overlay ชื่อเซลจากชีต mapping
function handleGetQuotationSummary_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('quote_summary_v1');
    if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

    const SALE_FIELD = PropertiesService.getScriptProperties().getProperty('QUOTE_SALE_FIELD') || 'tag';
    const tz = "Asia/Bangkok";
    const today = new Date();
    const fromStr = "2023-01-01"; // เผื่อ date filter ทำงาน — ครอบคลุมตั้งแต่ก่อนเริ่มใช้จริง
    const toStr   = Utilities.formatDate(today, tz, "yyyy-MM-dd");

    const items = [];
    const limit = 200, MAX_PAGES = 30;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${ZORT_BASE}/Quotation/GetQuotations?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
      const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) break;
      const list = (JSON.parse(res.getContentText())).list || [];
      for (const q of list) {
        const status = String(q.status || "").trim();
        const ds = q.quotationdateString || (q.quotationdate ? String(q.quotationdate).substring(0, 10) : null);
        let qDate = null, ageDays = null;
        if (ds && ds.length >= 10) {
          const [yr, mo, dy] = ds.split("-").map(Number);
          const d = new Date(yr, mo - 1, dy);
          if (!isNaN(d)) { qDate = ds; ageDays = Math.floor((today - d) / (24 * 60 * 60 * 1000)); }
        }
        let expireInDays = null;
        const es = q.expiredateString || (q.expiredate ? String(q.expiredate).substring(0, 10) : null);
        if (es && es.length >= 10) {
          const [ey, em, ed] = es.split("-").map(Number);
          const edt = new Date(ey, em - 1, ed);
          if (!isNaN(edt)) expireInDays = Math.ceil((edt - today) / (24 * 60 * 60 * 1000));
        }
        items.push({
          id: q.id,
          number: String(q.number || ""),
          status: status,
          customer: String(q.customername || "").trim() || "(ไม่ระบุชื่อ)",
          phone: String(q.customerphone || "").trim(),
          email: String(q.customeremail || "").trim(),
          amount: Number(q.amount) || 0,
          quotationDate: qDate,
          ageDays: ageDays,
          expireInDays: expireInDays,
          sale: String(q[SALE_FIELD] || "").trim(),
        });
      }
      if (list.length < limit) break;
      Utilities.sleep(120);
    }

    // overlay ชื่อเซลจากชีต mapping (assign ใน dashboard ชนะค่า tag)
    const saleMap = readQuoteSaleMap_();
    const salesSet = {};
    items.forEach(it => { if (saleMap[it.number]) it.sale = saleMap[it.number]; if (it.sale) salesSet[it.sale] = true; });
    Object.values(saleMap).forEach(s => { if (s) salesSet[s] = true; });

    // นับสถานะดิบทั้งหมด (ไว้ debug ว่า ZORT ใช้คำว่าอะไรจริง — Approved/Approve/Success ฯลฯ)
    const statusBreakdown = {};
    items.forEach(it => { const s = it.status || "(ว่าง)"; statusBreakdown[s] = (statusBreakdown[s] || 0) + 1; });

    const payload = JSON.stringify({ items, count: items.length, salesList: Object.keys(salesSet).sort(), statusBreakdown: statusBreakdown, generatedAt: new Date().toISOString() });
    cache.put('quote_summary_v1', payload, 300);
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ items: [], error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// handler สำหรับ action=getCustomerAnalytics
// อ่านชีต สรุปลูกค้า-เดือน + สรุปลูกค้า-สินค้า (syncZortSales เขียนไว้) → JSON
// คืน: months[], customers[{key,name,total,byMonth{},lastMonth,orderCount,products[]}], grandTotal
// cache 10 นาที · เร็วเพราะอ่านชีต ไม่ดึง ZORT
function handleGetCustomerAnalytics_() {
  const jsonOut = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('cust_analytics_v1');
    if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const mSh = ss.getSheetByName(SHEET_CUST_MONTHLY);
    const pSh = ss.getSheetByName(SHEET_CUST_PRODUCTS);
    if (!mSh) return jsonOut({ customers: [], months: [], grandTotal: 0, error: "ยังไม่มีข้อมูล — รอ syncZortSales รอบถัดไป" });

    const custMap = {};        // key → { key, name, byMonth:{}, total, orderCount, lastMonth, products:[] }
    const monthSet = {};
    let grandTotal = 0;

    const mRows = mSh.getDataRange().getDisplayValues();
    for (let i = 1; i < mRows.length; i++) {
      const [key, name, mk, totalStr, countStr] = mRows[i];
      if (!key || !mk) continue;
      const total = Number(String(totalStr).replace(/,/g, "")) || 0;
      const count = Number(String(countStr).replace(/,/g, "")) || 0;
      if (!custMap[key]) custMap[key] = { key, name: name || key, byMonth: {}, total: 0, orderCount: 0, lastMonth: null, products: [] };
      const c = custMap[key];
      c.byMonth[mk] = { total, count };
      c.total += total;
      c.orderCount += count;
      grandTotal += total;
      monthSet[mk] = true;
    }

    if (pSh) {
      const pRows = pSh.getDataRange().getDisplayValues();
      for (let i = 1; i < pRows.length; i++) {
        const [key, name, sku, pname, qtyStr, revStr] = pRows[i];
        if (!key || !sku) continue;
        if (custMap[key]) custMap[key].products.push({
          sku, name: pname || sku,
          qty: Number(String(qtyStr).replace(/,/g, "")) || 0,
          rev: Number(String(revStr).replace(/,/g, "")) || 0,
        });
      }
    }

    // หาเดือนล่าสุดที่ลูกค้าซื้อ (byMonth ที่มี total>0)
    const months = sortMonthKeys_(Object.keys(monthSet));
    Object.values(custMap).forEach(c => {
      for (let i = months.length - 1; i >= 0; i--) {
        if (c.byMonth[months[i]] && c.byMonth[months[i]].total > 0) { c.lastMonth = months[i]; break; }
      }
      c.products.sort((a, b) => b.rev - a.rev);
    });

    const customers = Object.values(custMap).sort((a, b) => b.total - a.total);
    const payload = JSON.stringify({
      months, customers, grandTotal,
      generatedAt: PropertiesService.getScriptProperties().getProperty('upd_customersummary') || new Date().toISOString(),
    });
    try { cache.put('cust_analytics_v1', payload, 600); } catch (e) { /* payload อาจเกิน 100KB — ข้าม cache ได้ */ }
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonOut({ customers: [], months: [], grandTotal: 0, error: err.message });
  }
}

// ยกเลิก (Void) ใบเสนอราคาใน ZORT — ใช้เมื่อใบค้างเกิน 90 วัน = ถือว่าลูกค้าไม่อนุมัติ
// payload: ส่งทั้ง id และ number (ZORT รับ id หรือ number แทนกันได้ตาม doc) เพื่อให้สำเร็จแน่
// คืน { ok, error? } · ล้าง cache ใบค้างให้ดึงใหม่ · เขียน audit
function voidZortQuotation_(quotationId, quotationNumber, actor) {
  const jsonOut = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    if (!quotationId && !quotationNumber) return jsonOut({ ok: false, error: "ไม่มี id/number ของใบเสนอราคา" });
    const base = `${ZORT_BASE}/Quotation/VoidQuotation`;
    const idNum = quotationId != null && quotationId !== "" && !isNaN(Number(quotationId)) ? Number(quotationId) : null;
    const idVal = idNum != null ? idNum : quotationId;

    // VoidQuotation reject JSON body {id} ทุกแบบ ทั้งที่ id นั้น valid (GetQuotationDetail?id=xxx รับได้)
    // → ZORT อ่าน id ผ่าน URL query / form-encoded ไม่ใช่ JSON body · ลองหลาย transport ตามลำดับ หยุดที่สำเร็จ
    const jsonHdr = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
    const formHdr = Object.assign({}, zortHeaders_(), { "Content-Type": "application/x-www-form-urlencoded" });
    const tries = [];
    if (idVal != null && idVal !== "") {
      tries.push({ label: "query-id",  url: base + "?id=" + encodeURIComponent(idVal), opt: { method: "post", headers: jsonHdr, payload: "{}", muteHttpExceptions: true } });
      tries.push({ label: "form-id",   url: base, opt: { method: "post", headers: formHdr, payload: "id=" + encodeURIComponent(idVal), muteHttpExceptions: true } });
    }
    if (quotationNumber) {
      tries.push({ label: "query-num", url: base + "?number=" + encodeURIComponent(quotationNumber), opt: { method: "post", headers: jsonHdr, payload: "{}", muteHttpExceptions: true } });
      tries.push({ label: "form-num",  url: base, opt: { method: "post", headers: formHdr, payload: "number=" + encodeURIComponent(quotationNumber), muteHttpExceptions: true } });
    }

    const attempts = [];
    for (const t of tries) {
      const res = UrlFetchApp.fetch(t.url, t.opt);
      const code = res.getResponseCode();
      const text = res.getContentText();
      const err = zortRespError_(res);
      Logger.log("VoidQuotation [" + t.label + "] HTTP " + code + " — " + text.substring(0, 200));
      if (code === 200 && !err) {
        CacheService.getScriptCache().remove('pending_quotes_v1'); // ให้รายการค้างดึงใหม่
        CacheService.getScriptCache().remove('quote_summary_v1');
        try { writeAuditLog_(actor || "owner", "ปิดใบเสนอราคา (ไม่อนุมัติ)", quotationNumber || quotationId, t.label); } catch (e) {}
        return jsonOut({ ok: true, shape: t.label });
      }
      attempts.push(t.label + ": " + (err || ("HTTP " + code)));
      Utilities.sleep(150);
    }
    return jsonOut({ ok: false, error: attempts.join(" | ") });
  } catch (e) {
    return jsonOut({ ok: false, error: String(e) });
  }
}

// ─── อนุมัติใบเสนอราคา: เรียก endpoint "อนุมัติ" ตัวจริงของ ZORT (native) ───────────
// ยืนยันจาก exploreZortApproveQuotation() (test-then-verify บนใบทดสอบจริง):
//   POST /Quotation/ApproveQuotation?id={id}&approvedate={yyyy-MM-dd}   body: "{}"
// (เหมือน VoidQuotation ตรงที่ id ต้องมาทาง URL query ไม่ใช่ JSON body — ลองแล้วโดน
// "Invalid ID" เหมือนกัน · ส่วน approvedate ต้องเป็น yyyy-MM-dd เท่านั้น รูปแบบอื่น
// เช่น dd/MM/yyyy โดน error ".NET DateTime parse")
// ผลลัพธ์จริง: ZORT เปลี่ยน status ใบเสนอราคาเป็น "Success" (ไม่ใช่ "Voided") +
// สร้างออเดอร์ขายให้เองอัตโนมัติ (คืนมาใน detail.referenceId/detail.referenceNumber)
// ไม่ต้อง mirror รายการสินค้า/ลูกค้าเองแล้ว ก็ไม่ต้อง void ใบเดิมด้วย — ZORT จัดการให้ครบในคำเดียว
function approveQuotation(ss, quotationId, quotationNumber, actor) {
  var qId = (quotationId != null && quotationId !== "") ? quotationId : null;
  var qNum = quotationNumber ? String(quotationNumber).trim() : "";
  if (qId == null && !qNum) return error("ไม่มี id/number ของใบเสนอราคา");

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    var jsonHeaders = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
    var idParam = qId != null ? qId : qNum;
    var paramName = qId != null ? "id" : "number";
    var dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");

    var url = ZORT_BASE + "/Quotation/ApproveQuotation?" + paramName + "=" + encodeURIComponent(idParam) +
      "&approvedate=" + encodeURIComponent(dateStr);
    var res = UrlFetchApp.fetch(url, { method: "post", headers: jsonHeaders, payload: "{}", muteHttpExceptions: true });
    var zErr = zortRespError_(res);
    if (zErr) { logZortFailure_("อนุมัติใบเสนอราคา " + (qNum || qId), zErr); return error("อนุมัติใบเสนอราคาใน ZORT ไม่สำเร็จ: " + zErr); }

    var json = JSON.parse(res.getContentText() || "{}");
    var det = json.detail || {};
    var orderId = det.referenceId != null ? det.referenceId : null;
    var orderNumber = det.referenceNumber || null;

    writeAuditLog_(actor || "owner", "อนุมัติใบเสนอราคา (ZORT สร้างออเดอร์ขายให้อัตโนมัติ)", orderNumber || qNum || qId,
      auditDetail_({ after: { orderId: orderId, orderNumber: orderNumber, quotationNumber: qNum || qId },
        note: "ผ่าน /Quotation/ApproveQuotation (native)" }));

    CacheService.getScriptCache().remove('pending_quotes_v1');
    CacheService.getScriptCache().remove('quote_summary_v1');
    invalidateCache_();
    return ok({ orderId: orderId, orderNumber: orderNumber, approved: true });
  } finally {
    lock.releaseLock();
  }
}

// แจ้งเตือน LINE เมื่อสต็อกต่ำหรือหมด — ตั้ง Daily Trigger ได้ (ไม่มี _ ต่อท้าย)
// ไม่ส่งถ้าไม่มีสินค้าที่ต้องแจ้ง
function sendLowStockAlert() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sh = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sh) { Logger.log("ไม่พบชีต " + SHEET_PRODUCTS); return; }

  // สร้าง map SKU → { category, vendor } จากชีต ข้อมูลสินค้า
  // (SHEET_PRODUCTS เก็บแค่ตัวเลข stock — category/vendor อยู่ใน ข้อมูลสินค้า)
  const metaMap = {};
  try {
    const metaSh = ss.getSheetByName(SHEET_PRODUCT_META);
    if (metaSh) {
      const metaRows = metaSh.getDataRange().getDisplayValues();
      // header 1 แถว → เริ่ม index 1; col B(1)=SKU, col F(5)=category, col H(7)=vendor
      for (let i = 1; i < metaRows.length; i++) {
        const mr = metaRows[i];
        const sk = (mr[1] || "").toString().trim().toUpperCase();
        if (!sk) continue;
        metaMap[sk] = {
          category: (mr[5] || "").toString().trim() || "ไม่ระบุ",
          vendor:   (mr[7] || "").toString().trim() || "",
        };
      }
    }
  } catch (e) {
    Logger.log("sendLowStockAlert: อ่าน metaMap ไม่ได้ — " + e.message);
  }

  const rows = sh.getDataRange().getDisplayValues();
  const outOfStock = [];   // total = 0
  const lowStock   = [];   // total 1–3

  // header 2 แถว → เริ่มจาก index 2
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku  = (r[1] || "").toString().trim();
    const name = (r[2] || "").toString().trim();
    if (!sku && !name) continue;

    // col G(index 6) = หน้าร้าน, col H(index 7) = คลัง
    const qFront = parseInt(r[6]) || 0;
    const qWH    = parseInt(r[7]) || 0;
    const total  = qFront + qWH;

    const meta     = metaMap[sku.toUpperCase()] || { category: "ไม่ระบุ", vendor: "" };
    const label    = name || sku;
    if (total <= 0) {
      outOfStock.push({ sku, name: label, category: meta.category, vendor: meta.vendor });
    } else if (total <= 3) {
      lowStock.push({ sku, name: label, category: meta.category });
    }
  }

  // ไม่มีสินค้าที่ต้องแจ้ง → ข้าม
  if (outOfStock.length === 0 && lowStock.length === 0) {
    Logger.log("sendLowStockAlert: ไม่มีสินค้าสต็อกต่ำ — ไม่ส่ง LINE");
    return;
  }

  // ฟอร์แมตวันที่แบบ dd/mm/yy (พ.ศ. ย่อ)
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, "0");
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const yy  = String(now.getFullYear() + 543).slice(-2);
  const dateStr = dd + "/" + mm + "/" + yy;

  const parts = [];
  if (outOfStock.length > 0) parts.push("❌ หมด " + outOfStock.length + " รายการ");
  if (lowStock.length > 0)   parts.push("⚠️ ใกล้หมด " + lowStock.length + " รายการ");

  const msg = "📦 สต็อกต่ำ " + dateStr + "\n"
    + parts.join("  ") + "\n"
    + "👉 https://dmj-inventory-dashboard.pages.dev";
  Logger.log("sendLowStockAlert:\n" + msg);
  // สต็อกต่ำ = ข้อมูลประกอบ ไม่เร่งด่วน → ช่องทาง secondary (ไม่แย่ง quota งานจัดของ/order)
  // dedup รายวัน กันส่งซ้ำถ้า trigger ยิงหลายรอบ
  enqueueNoti_({ channel: 'secondary', priority: 4, type: 'text', target: 'user',
    dedupKey: 'lowstock:' + dateStr, payload: { text: msg } });
}

const SHEET_ZORT_FAILED = "ZORT_sync_failed";

// ตรวจว่า ZORT response ล้มเหลวหรือไม่ → คืนข้อความ error ถ้า fail, คืน null ถ้าสำเร็จ
// ZORT: HTTP 200 = สำเร็จ; body อาจมี resCode (200 = success) หรือ description/error
function zortRespError_(res) {
  try {
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code !== 200) return "HTTP " + code + ": " + body.substring(0, 200);
    let json = null;
    try { json = JSON.parse(body); } catch (e) { return null; } // parse ไม่ได้แต่ HTTP 200 → ถือว่าผ่าน
    // resCode ที่ไม่ใช่ "200"/200 = ZORT ปฏิเสธ (เช่น "100" = error)
    if (json && json.resCode != null && String(json.resCode) !== "200") {
      return "resCode " + json.resCode + ": " + (json.resDesc || json.description || body.substring(0, 150));
    }
    return null;
  } catch (e) {
    return String(e);
  }
}

// บันทึกความล้มเหลวของ ZORT push ลงชีต + แจ้ง LINE เจ้าของ (กันความผิดพลาดหายเงียบ)
// action = ชนิดงาน (transfer/stockcount/mto/frontstore), detail = รายละเอียด
function logZortFailure_(action, detail) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sh = ss.getSheetByName(SHEET_ZORT_FAILED);
    if (!sh) {
      sh = ss.insertSheet(SHEET_ZORT_FAILED);
      sh.appendRow(["เวลา", "งาน", "รายละเอียด", "สถานะแก้ไข"]);
    }
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    sh.appendRow([ts, action, String(detail).substring(0, 500), "รอตรวจ"]);
  } catch (e) {
    Logger.log("logZortFailure_ เขียนชีตไม่ได้: " + e);
  }
  // แจ้ง LINE (best-effort — ถ้าส่งไม่ได้ก็ไม่ให้ล้มทั้ง flow)
  try {
    enqueueNoti_({ channel: 'secondary', priority: 2, type: 'text', target: 'user',
      payload: { text: "⚠️ ZORT ไม่อัปเดต\nงาน: " + action + "\n" + String(detail).substring(0, 300) +
                       "\n\nสต็อกในระบบกับ ZORT อาจไม่ตรง — โปรดตรวจชีต " + SHEET_ZORT_FAILED } });
  } catch (e) {
    Logger.log("logZortFailure_ ส่ง LINE ไม่ได้: " + e);
  }
}

function scheduledLineReminder() {
  var today = new Date();
  var dayOfWeek = today.getDay();
  if (dayOfWeek !== 2 && dayOfWeek !== 4) return;

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var orderSh = ss.getSheetByName(SHEET_ORDERS);
  var lastRow = orderSh.getLastRow();
  if (lastRow < 3) return;

  var data = orderSh.getRange('A3:G' + lastRow).getValues();
  var todayStr = Utilities.formatDate(today, 'Asia/Bangkok', 'dd/MM/yyyy');

  var todayOrders = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var dateCell = row[1];
    var dateStr = '';

    if (dateCell instanceof Date) {
      dateStr = Utilities.formatDate(dateCell, 'Asia/Bangkok', 'dd/MM/yyyy');
    } else if (dateCell) {
      dateStr = dateCell.toString().substring(0, 10);
    }

    if (dateStr === todayStr) {
      var sku = row[5];
      var qty = row[6];
      var orderType = row[0];

      if (sku && qty) {
        todayOrders.push(sku + ' (' + qty + ' ชิ้น, ' + orderType + ')');
      }
    }
  }

  if (todayOrders.length === 0) return;

  var msg = "📦 รายการสั่งซื้อประจำวันนี้ (" + todayOrders.length + " รายการ)\n\n" + todayOrders.join('\n');
  // สรุป (ไม่เร่งด่วน) → ช่องทาง secondary
  enqueueNoti_({ channel: 'secondary', priority: 5, type: 'text', target: 'user', payload: { text: msg } });
}

// ───────────────────────────────────────────────────────────
// SECTION 7: Utilities
// ───────────────────────────────────────────────────────────

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ success: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Payload cache (แบ่งเป็น chunk เพราะ CacheService จำกัด 100KB/key) ──
const _CACHE_TTL_SEC   = 180;     // 3 นาที (เพิ่มเป็น 600 แล้วข้อมูล stale ข้ามเครื่อง)
const _CACHE_CHUNK_LEN = 30000;   // อักขระต่อ chunk (Thai 3 ไบต์ → ~90KB ปลอดภัย)
const _CACHE_KEY_COUNT = 'dmj_payload_n';
const _CACHE_KEY_PART  = 'dmj_payload_';
const _CACHE_TS_SUFFIX = '_ts';   // เก็บ "เขียน cache ก้อนนี้เมื่อไหร่" คู่กับคีย์นับ chunk

// ── Phase 7.3: ชั้น "ของสำรอง" (stale) สำหรับ stale-while-rebuild ──
// คีย์แยกคนละชุดกับชั้นสด **โดยตั้งใจ** — `invalidateCache_` ไล่ลบเฉพาะคีย์ชั้นสด
// ของสำรองจึงรอดจากการล้าง cache ทุกครั้งที่มีคนบันทึกข้อมูล ซึ่งเป็นทั้งหมดที่เราต้องการ:
// คนที่มาถึงระหว่างคนแรกกำลัง build ได้ข้อมูลเก่าไม่กี่วินาทีทันที แทนที่จะไปต่อคิว build
// TTL 30 นาที (ไม่ยาวกว่านี้) — ถ้า build พังติดกันนานกว่านี้ ปล่อยให้ผู้ใช้เห็น error
// ดีกว่าเสิร์ฟตัวเลขสต็อกอายุครึ่งวันโดยที่เขาไม่รู้ตัว
const _STALE_TTL_SEC   = 1800;
const _STALE_KEY_COUNT = 'dmj_stale_n_';
const _STALE_KEY_PART  = 'dmj_stale_';
// รอคิว build ของคนแรกนานสุดเท่าไหร่ ก่อนยอม build เอง (build จริงวัดได้ ~10 วิ)
const _BUILD_LOCK_WAIT_MS = 25000;

// ── Phase 7.4: cache ของก้อนเบา `action=stocklite` ──
// TTL สั้นมากโดยตั้งใจ — ก้อนนี้ถูก poll ทุก 30 วิ จากทุกเครื่องที่เปิดแท็บนับสต็อก/เช็คหน้าร้าน
// 15 วิ = อ่านชีตอย่างมาก 4 ครั้ง/นาที ไม่ว่าจะมีกี่เครื่อง (เดิมคือ "กี่เครื่อง × 2 ครั้ง/นาที")
// และ `invalidateCache_` ล้างคีย์นี้ด้วย → เครื่องอื่นบันทึกแล้วเห็นทันที ไม่ต้องรอ TTL หมด
// (ต่างจากชั้นสำรอง `dmj_stale_*` ที่ห้ามล้าง — ตัวนี้ไม่ใช่ของสำรอง ล้างได้ปลอดภัย)
const _STOCKLITE_TTL_SEC   = 15;
const _STOCKLITE_KEY_COUNT = 'dmj_stocklite_n';
const _STOCKLITE_KEY_PART  = 'dmj_stocklite_';
// PERF: payload แยกตาม role แล้ว → cache ต้องแยกคีย์ต่อ variant ด้วย
// ไม่งั้น warehouse ที่มาก่อนจะ cache ก้อนที่ตัดแล้วทับ แล้ว owner ที่มาทีหลังได้ข้อมูลขาด
// (variant 'full' คงคีย์เดิมไว้ — ของที่ cache ไว้ก่อน deploy ยังใช้ได้ ไม่ต้องรอ cache อุ่นใหม่)
const PAYLOAD_VARIANTS_ = ['full', 'ops', 'lite'];
function _cacheKeyCount_(variant) {
  return (!variant || variant === 'full') ? _CACHE_KEY_COUNT : _CACHE_KEY_COUNT + '_' + variant;
}
function _cacheKeyPart_(variant) {
  return (!variant || variant === 'full') ? _CACHE_KEY_PART : _CACHE_KEY_PART + variant + '_';
}

// ───────────────────────────────────────────────────────────
// PERF: payload ต่อ role — ส่งเฉพาะก้อนที่ role นั้นเปิดดูได้จริง
// ───────────────────────────────────────────────────────────
// ที่มา: ไล่ดูจริงว่าแต่ละก้อนถูกใช้ใน view ไหน แล้วเทียบกับ ROLE_TABS (app.jsx)
//   monthlyByCat/dailyByCat/dayLabels → OverviewView, UploadView, MarginView, SeasonView
//   purchases                         → OverviewView, CustomerView, MarginView
//   transfers/transferStats           → TransferView (แท็บ "transfers")
// ⚠️ `products[].mo` (ยอดรายเดือน) **ตัดไม่ได้ทุก role** — CategoryView (ป้าย "กำลังมาแรง")
//    และ StockView (คำนวณ "ควรสั่ง" จากเฉลี่ย 3 เดือนหลัง) ใช้ด้วย ซึ่งเกือบทุก role มีสองแท็บนี้
//    เช่นเดียวกับ monthLabels ที่เป็นฐานดัชนีของ `mo` — ต้องส่งเสมอ
// ⚠️ ตัดเพิ่มทีหลังต้องไล่ดู view จริงก่อนเสมอ ห้ามเดาจากชื่อคีย์ (เคยพลาดมาแล้วตอนเฟส 4 ล็อกอิน)
const PAYLOAD_VARIANT_DROPS_ = {
  full: [],                                                     // owner/dev — เห็นทุกแท็บ ต้องได้ครบ
  ops:  ['monthlyByCat', 'dailyByCat', 'dayLabels', 'purchases'],           // employee — มีแท็บ transfers
  lite: ['monthlyByCat', 'dailyByCat', 'dayLabels', 'purchases',
         'transfers', 'transferStats'],                         // warehouse/frontstore/saler/storedevice
};
// role → variant · role แปลก/ไม่ส่งมา = full เสมอ (ไม่รู้จักแล้วส่งครบ ปลอดภัยกว่าส่งขาดจนหน้าพัง)
const PAYLOAD_ROLE_VARIANT_ = {
  owner: 'full', dev: 'full',
  employee: 'ops',
  warehouse: 'lite', frontstore: 'lite', saler: 'lite', storedevice: 'lite',
};
// หมายเหตุความปลอดภัย: อ่าน role จาก query param ตรง ๆ (ไม่ verify session) โดยตั้งใจ —
// การ verify ต้องสแกนชีต "เซสชัน" ทุก request ซึ่งเพิ่มเวลาให้กับสิ่งที่กำลังพยายามทำให้เร็วขึ้น
// และตัวนี้เป็นแค่ "ตัดของที่ไม่ได้ใช้ออก" ไม่ใช่ประตูความปลอดภัย — ปลอมเป็น owner ก็ได้ข้อมูล
// เท่าที่ทุกคนเคยได้อยู่แล้วก่อนหน้านี้ (ไม่เปิดช่องใหม่) · ของที่ต้องกันจริงยังกันที่ endpoint ของมันเอง
// วัดขนาดจริงของแต่ละก้อนใน payload → ดูที่ Executions log
// มีไว้เพราะ "เดาว่าอะไรหนัก" คือวิธีที่ทำให้จูนผิดจุด — ตัวเลขจริงบอกได้ว่าควรไปต่อตรงไหน
// รันเฉพาะตอน cache miss (ไม่กี่ครั้งต่อชั่วโมง) และ JSON.stringify ต่อคีย์ก็ไม่ได้แพงเทียบกับ build
function logPayloadSizes_(data, variant, sentLen) {
  try {
    const parts = Object.keys(data).map(function (k) {
      let n = 0;
      try { n = JSON.stringify(data[k]).length; } catch (e) {}
      return { k: k, n: n };
    }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
    // ยอดรายเดือนแยกออกมาดูต่างหาก — เป็นก้อนที่โตขึ้นเองทุกเดือน ต้องจับตา
    let moLen = 0, moRows = 0;
    (data.products || []).forEach(function (p) {
      if (!p.mo) return;
      moLen += JSON.stringify(p.mo).length;
      moRows += p.mo.length;
    });
    Logger.log('[perf] payload variant=' + variant + ' ส่งจริง=' + Math.round(sentLen / 1024) + 'KB · '
      + parts.map(function (x) { return x.k + '=' + Math.round(x.n / 1024) + 'KB'; }).join(' ')
      + ' · products[].mo=' + Math.round(moLen / 1024) + 'KB (' + moRows + ' แถว)');
  } catch (e) {}
}

function payloadVariantForRole_(role) {
  return PAYLOAD_ROLE_VARIANT_[String(role || '').trim()] || 'full';
}

// ── payload version (pv) — กันช่วงเปลี่ยนผ่านตอน deploy ──
// `.jsx` ฝั่งเว็บใช้ stale-while-revalidate (ดู service-worker.js) → **โหลดแรกหลัง deploy
// ยังได้โค้ดเก่า** ถ้าเปลี่ยนรูปแบบ payload ทันทีทุกคน เครื่องที่ยังรันโค้ดเก่าจะอ่าน `mo` ไม่เป็น
// → p.monthly ว่าง → "ควรสั่ง"/"กำลังมาแรง" เพี้ยนเงียบ ๆ โดยไม่มี error ให้เห็น (อันตรายกว่าพังดัง ๆ)
// จึงให้ client บอกเวอร์ชันที่ตัวเองอ่านได้มาเอง: ไม่ส่ง pv = ของเดิม (dense) เป๊ะทุกประการ
// ลบทิ้งได้เมื่อมั่นใจว่าไม่มีเครื่องไหนค้างโค้ดเก่าแล้ว (ราว 1-2 สัปดาห์หลัง deploy)
function payloadEncodingForRequest_(e) {
  return (e && e.parameter && String(e.parameter.pv) === '2') ? 2 : 1;
}
// กาง `mo` (ย่อ) กลับเป็น `monthly` (เต็ม) ให้ client เวอร์ชันเก่า — ผลลัพธ์เท่าของเดิมเป๊ะ
function expandMonthlyForLegacy_(data) {
  const labels = data.monthLabels || [];
  const out = {};
  Object.keys(data).forEach(function (k) { out[k] = data[k]; });
  out.products = (data.products || []).map(function (p) {
    if (!p.mo) return p;
    const q = {};
    Object.keys(p).forEach(function (k) { if (k !== 'mo') q[k] = p[k]; });
    const dense = labels.map(function (ml) { return { month: ml, qty: 0, sales: 0 }; });
    p.mo.forEach(function (row) {
      const cell = dense[row[0]];
      if (cell) { cell.qty = row[1]; cell.sales = row[2]; }
    });
    q.monthly = dense;
    return q;
  });
  return out;
}
// คีย์ cache ต้องแยกทั้งตาม role และตามเวอร์ชันการเข้ารหัส ไม่งั้นเสิร์ฟข้ามกันแล้วพัง
function payloadCacheVariant_(variant, enc) {
  return enc === 2 ? variant : variant + '_v1';
}
// คืน payload ที่ตัดคีย์ตาม variant แล้ว — ไม่แตะ object เดิม (ผู้เรียกยังเอา full ไปใช้ต่อได้)
function shapePayloadForVariant_(data, variant) {
  const drops = PAYLOAD_VARIANT_DROPS_[variant] || [];
  if (!drops.length) return data;
  const out = {};
  Object.keys(data).forEach(function (k) { if (drops.indexOf(k) < 0) out[k] = data[k]; });
  return out;
}

// อ่านก้อนที่ถูกหั่นเป็น chunk กลับมาต่อกัน — คืน { str, ts } เสมอ (str=null คือใช้ไม่ได้)
// `ts` = เวลาที่เขียน cache ก้อนนี้ ใช้ 2 ที่: (1) ตัดสินว่าของที่ build เสร็จระหว่างเรารอคิว
// ใหม่พอสำหรับคนที่กดปุ่ม Sync ไหม (2) บอกอายุของ "ของสำรอง" ให้ผู้ใช้เห็น
function _readChunked_(kCount, kPart) {
  try {
    const c = CacheService.getScriptCache();
    const head = c.getAll([kCount, kCount + _CACHE_TS_SUFFIX]);
    const nStr = head[kCount];
    if (!nStr) return { str: null, ts: 0 };
    const n = parseInt(nStr, 10);
    if (!n) return { str: null, ts: 0 };
    const ts = parseInt(head[kCount + _CACHE_TS_SUFFIX], 10) || 0;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(kPart + i);
    const map = c.getAll(keys);
    let out = '';
    for (let i = 0; i < n; i++) {
      const part = map[kPart + i];
      if (part == null) return { str: null, ts: 0 }; // chunk หาย → ถือว่า cache ใช้ไม่ได้
      out += part;
    }
    return { str: out, ts: ts };
  } catch (err) { return { str: null, ts: 0 }; }
}

function _writeChunked_(str, kCount, kPart, ttlSec) {
  try {
    const c = CacheService.getScriptCache();
    const entries = {};
    let n = 0;
    for (let i = 0; i < str.length; i += _CACHE_CHUNK_LEN) {
      entries[kPart + n] = str.substring(i, i + _CACHE_CHUNK_LEN);
      n++;
    }
    entries[kCount] = String(n);
    entries[kCount + _CACHE_TS_SUFFIX] = String(Date.now());
    c.putAll(entries, ttlSec);
  } catch (err) { /* cache ล้มเหลวไม่เป็นไร — แค่ช้าลง */ }
}

// ชั้นสด (TTL 3 นาที) — ถูกล้างทุกครั้งที่มีคนบันทึกข้อมูล
function readFreshPayload_(variant) {
  return _readChunked_(_cacheKeyCount_(variant), _cacheKeyPart_(variant));
}
function getCachedPayload_(variant) { return readFreshPayload_(variant).str; }
function putCachedPayload_(str, variant) {
  _writeChunked_(str, _cacheKeyCount_(variant), _cacheKeyPart_(variant), _CACHE_TTL_SEC);
}

// ชั้นสำรอง (TTL 30 นาที) — `invalidateCache_` ไม่แตะ จึงยังอยู่ระหว่างที่คนแรกกำลัง build ใหม่
function _staleKeyCount_(variant) { return _STALE_KEY_COUNT + (variant || 'full'); }
function _staleKeyPart_(variant)  { return _STALE_KEY_PART  + (variant || 'full') + '_'; }
function readStalePayload_(variant) {
  return _readChunked_(_staleKeyCount_(variant), _staleKeyPart_(variant));
}
function putStalePayload_(str, variant) {
  _writeChunked_(str, _staleKeyCount_(variant), _staleKeyPart_(variant), _STALE_TTL_SEC);
}

// ── Phase 7.3: single-flight — ให้ "คนเดียว" สร้าง payload ต่อหนึ่งรอบ ──
// ใช้ `getUserLock()` ไม่ใช่ `getScriptLock()` **โดยตั้งใจ**:
//   · web app deploy แบบ `executeAs: USER_DEPLOYING` (ดู appsscript.json) → ทุก doGet
//     รันในฐานะเจ้าของคนเดียวกัน → user lock จึงเป็นล็อกร่วมของทุก request จริง
//   · แต่เป็น **คนละตัว** กับ `getScriptLock()` ที่เส้นทางเขียนข้อมูลใช้ (สั่งของ/โอน/รับของ)
//     → การ build ที่กิน ~10 วิ จะไม่ไปขวางคนกดสั่งของให้รอตาม
//   · ถ้าวันหนึ่งเปลี่ยนเป็น `USER_ACCESSING` ล็อกจะแยกตามคน → single-flight ทำงานได้น้อยลง
//     (build บ่อยขึ้น) **แต่ข้อมูลไม่ผิด** — ความถูกต้องไม่ได้ผูกกับล็อกตัวนี้เลย เป็นแค่ตัวลดงานซ้ำ
//   · ล็อกค้างไม่ได้: ทุกเส้นทางปล่อยใน `finally` และ GAS ปล่อยล็อกให้เองเมื่อ execution จบ
function acquireBuildLock_(waitMs) {
  try {
    const lock = LockService.getUserLock();
    return lock.tryLock(waitMs || 0) ? lock : null;
  } catch (err) { return null; }   // ล็อกใช้ไม่ได้ → ถือว่าคว้าไม่ได้ แล้วไปทางสำรอง/build เอง
}
function releaseBuildLock_(lock) {
  if (lock) { try { lock.releaseLock(); } catch (err) { /* ปล่อยไม่ได้ก็หมดอายุเองตอน execution จบ */ } }
}

// แทรกธง "นี่คือของสำรอง" เข้าไปใน JSON string ตรง ๆ โดยไม่ parse ทั้งก้อน (payload ~4.5MB)
// frontend ใช้ `stale` ขึ้นป้ายเตือน และ `staleAt` บอกว่าข้อมูล ณ เวลาไหน
function markStalePayload_(s, ts) {
  if (!s || s.charAt(0) !== '{' || s.charAt(1) === '}') return s;
  return '{"stale":1,"staleAt":' + (ts || 0) + ',' + s.slice(1);
}

function invalidateCache_(skipTsUpdate) {
  try {
    const c = CacheService.getScriptCache();
    // ล้างทุก variant × ทุกเวอร์ชันการเข้ารหัส — ลืมคีย์ไหนไว้ = role นั้นเห็นข้อมูลเก่าค้าง
    // หลังมีคนแก้ข้อมูล (บั๊กแบบที่หาสาเหตุยากที่สุด เพราะเห็นไม่ตรงกันเฉพาะบางเครื่อง)
    const keys = [];
    const allCacheVariants = [];
    PAYLOAD_VARIANTS_.forEach(function (v) {
      allCacheVariants.push(payloadCacheVariant_(v, 2), payloadCacheVariant_(v, 1));
    });
    allCacheVariants.forEach(function (v) {
      const kCount = _cacheKeyCount_(v), kPart = _cacheKeyPart_(v);
      const nStr = c.get(kCount);
      const n = nStr ? parseInt(nStr, 10) : 0;
      keys.push(kCount, kCount + _CACHE_TS_SUFFIX);
      for (let i = 0; i < n; i++) keys.push(kPart + i);
    });
    // Phase 7.4: ก้อนเบา `stocklite` ล้างด้วย — TTL มันสั้น (15 วิ) แต่ถ้าไม่ล้าง คนที่เปิดแท็บ
    // นับสต็อก/เช็คหน้าร้านค้างไว้จะเห็นเลขเก่าได้อีกถึง 15 วิหลังเพื่อนบันทึก ทั้งที่ปลายทาง
    // ของแท็บพวกนี้คือ "เห็นงานของกันและกันแบบสด" · ไม่ใช่ของสำรอง จึงล้างได้ปลอดภัย
    (function () {
      const nStr = c.get(_STOCKLITE_KEY_COUNT);
      const n = nStr ? parseInt(nStr, 10) : 0;
      keys.push(_STOCKLITE_KEY_COUNT, _STOCKLITE_KEY_COUNT + _CACHE_TS_SUFFIX);
      for (let i = 0; i < n; i++) keys.push(_STOCKLITE_KEY_PART + i);
    })();
    // ⚠️ Phase 7.3: **ล้างเฉพาะชั้นสด ห้ามแตะชั้นสำรอง (`dmj_stale_*`)**
    // ของสำรองคือสิ่งเดียวที่คนอื่นมีให้อ่านระหว่างคนแรกกำลัง build ใหม่ (~10 วิ)
    // ถ้าล้างด้วย = กลับไปเป็น stampede เหมือนเดิมทันที (ทุกคน miss พร้อมกัน → build พร้อมกัน)
    // ของสำรองไม่ทำให้ข้อมูลผิด เพราะถูกติดธง `stale` + คง `lastModified` เดิมไว้เสมอ
    // → conflict detection ฝั่ง server ยังปฏิเสธการเขียนทับที่อิงข้อมูลเก่าได้ตามปกติ
    if (keys.length) c.removeAll(keys);
  } catch (err) { /* ignore */ }
  if (!skipTsUpdate) {
    // บันทึก timestamp การเขียนล่าสุดลง Script Properties (ไม่ผ่าน CacheService)
    // เพื่อให้ conflict detection อ่านได้สด ๆ เสมอ แม้ DriveApp.getLastUpdated() จะล่าช้า
    try {
      PropertiesService.getScriptProperties().setProperty('dmj_last_write_ts', String(Date.now()));
    } catch (err) { /* ignore */ }
  }
}

// wrapper รันได้จาก GAS dropdown (ไม่มี _ ต่อท้าย)
function clearCache() { invalidateCache_(); Logger.log("Cache cleared"); }

function error(msg) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────────────────────────────────────
// SECTION 8: MTO Jobs
// ───────────────────────────────────────────────────────────

function getOrCreateMtoJobSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_MTO_JOBS);
  if (!sh) {
    sh = ss.insertSheet("งาน MTO");
    sh.appendRow(["JobID","วันที่","ชื่องาน","ลูกค้า","ราคา","รูป","สถานะ","ปิดงานเมื่อ","ผู้รับผิดชอบ(staffId)","ชื่อผู้รับผิดชอบ"]);
  } else if (!sh.getRange(1, 9).getValue()) {
    // self-heal: ชีตเก่าที่สร้างไว้ก่อนมีคอลัมน์ผู้รับผิดชอบ — เติม header ให้ ไม่กระทบแถวข้อมูลเดิม
    sh.getRange(1, 9, 1, 2).setValues([["ผู้รับผิดชอบ(staffId)", "ชื่อผู้รับผิดชอบ"]]);
  }
  return sh;
}

function getOrCreateMtoItemSheet_(ss) {
  let sh = ss.getSheetByName(SHEET_MTO_ITEMS);
  if (!sh) {
    sh = ss.insertSheet("วัตถุดิบ MTO");
    sh.appendRow(["JobID","รหัสสินค้า","ชื่อสินค้า","จำนวนเบิก","คลัง","จำนวนคืน","ตัดจริง","เวลา"]);
  }
  return sh;
}

// actor/staffId มาจาก session ที่ doPost ตรวจแล้ว (ไม่ใช่ data.actor ดิบจาก client) —
// ผู้รับผิดชอบ default = คนสร้างงานเอง ("ขึ้นตามเครื่องที่เป็นคนสร้าง" ตามที่เจ้าของขอ 2026-07-30)
// เปลี่ยนภายหลังได้ด้วย action=assignMtoJob — ไม่มี session (migration) → เว้นว่างไว้ก่อน
function createMtoJob(ss, data, actor, staffId) {
  const sh = getOrCreateMtoJobSheet_(ss);

  // Lock กัน race condition (2 คนสร้างพร้อมกัน → เลขซ้ำ)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    // ID รูปแบบ MTO-YYYYMM### เรียงตามเดือน (reset ทุกเดือน)
    const now = new Date();
    const prefix = "MTO-" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMM");
    const rows = sh.getDataRange().getValues();
    let maxSeq = 0;
    for (let i = 1; i < rows.length; i++) {
      const id = String(rows[i][0] || "");
      if (id.startsWith(prefix)) {
        const seq = parseInt(id.slice(prefix.length)) || 0;
        if (seq > maxSeq) maxSeq = seq;
      }
    }
    const jobId = prefix + String(maxSeq + 1).padStart(3, "0");

    sh.appendRow([jobId, data.dateStr || "", data.jobName || "", data.customer || "", data.price || "", data.imageUrl || "", "กำลังจัด", "",
      staffId || "", staffId ? (actor || "") : ""]);
    // ถึงจุดนี้ = สร้างสำเร็จ → เขียน audit log (creation ไม่มี before-state)
    writeAuditLog_(actor || data.actor || "ไม่ระบุ", "สร้างงาน MTO", jobId, auditDetail_({
      before: null,
      after: { jobName: data.jobName || "", customer: data.customer || "", price: data.price || "" },
      note: "สร้างงาน MTO (" + (data.jobName || jobId) + ")",
    }));
    invalidateCache_(); // P0-4: bump dmj_last_write_ts ให้ conflict detection มองเห็น write นี้
    return ContentService.createTextOutput(JSON.stringify({ success: true, jobId }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ─── action=assignMtoJob : มอบหมาย/เปลี่ยนผู้รับผิดชอบงาน MTO (เว้น staffId ว่าง = ถอดออก) ───
function assignMtoJob(ss, data, actor) {
  const jobId = String(data.jobId || "").trim();
  if (!jobId) return error("ไม่มี jobId");
  const staffId = String(data.staffId || "").trim();

  let assigneeName = "";
  if (staffId) {
    const staff = readStaffAll_(ss).find(function (x) { return x.staffId === staffId; });
    if (!staff) return error("ไม่พบพนักงานคนนี้");
    assigneeName = staff.displayName || staff.lineDisplayName || "";
  }

  const sh = getOrCreateMtoJobSheet_(ss);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === jobId) {
      const before = { staffId: String(rows[i][8] || ""), name: String(rows[i][9] || "") };
      sh.getRange(i + 1, 9, 1, 2).setValues([[staffId, assigneeName]]);
      writeAuditLog_(actor || "ไม่ระบุ", "มอบหมายงาน MTO", jobId, auditDetail_({
        before: before, after: { staffId: staffId, name: assigneeName },
      }));
      invalidateCache_();
      return ok({ jobId: jobId, staffId: staffId, name: assigneeName });
    }
  }
  return error("ไม่พบงานนี้");
}

function closeMtoJob(ss, data, actor) {
  const jobId = String(data.jobId || "").trim();
  const items = data.items || [];
  const closedAt = data.closedAt || "";
  if (!jobId) return error("ไม่มี jobId");

  // Lock กันเขียนชนกัน (เหมือน transferStockBatch)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");

  const cache = CacheService.getScriptCache();
  try {
    // Idempotency: กันกดปิดงานซ้ำ (รีเฟรช/เน็ตช้า/เครื่องอื่น) → หักสต็อกซ้ำ
    if (cache.get("mto_closed_" + jobId)) {
      return ok({ jobId, duplicate: true, deducted: 0 });
    }

  // ─── Conflict detection: ถ้า sheet ถูกแก้หลังจาก client โหลด → reject ───
  if (data.clientLoadedAt) {
    const lastMod = getSheetLastModified_();
    if (lastMod > Number(data.clientLoadedAt) + 5000) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, conflict: true,
        message: "ข้อมูลถูกแก้ไขหลังจากที่คุณโหลด กรุณา Reload ก่อนบันทึก"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // net = เบิก − คืน (รองรับคืนบางส่วน เช่น เบิก 24 คืน 4 → ตัดจริง 20)
  const netOf = (item) => {
    const qty = Number(item.qty) || 0;
    const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
    return qty - ret;
  };

  // Idempotency เพิ่มเติม: ถ้างานนี้ปิดไปแล้วในชีต ("เสร็จแล้ว") → ไม่หักซ้ำ
  const jobShChk = getOrCreateMtoJobSheet_(ss);
  if (jobShChk) {
    const jd = jobShChk.getDataRange().getValues();
    for (let i = 1; i < jd.length; i++) {
      if (String(jd[i][0]).trim() === jobId && String(jd[i][6]).trim() === "เสร็จแล้ว") {
        cache.put("mto_closed_" + jobId, "1", 21600);
        return ok({ jobId, duplicate: true, deducted: 0 });
      }
    }
  }

  // Deduct stock (รองรับทั้ง split format: qtyWH/qtyFS และ legacy: warehouse)
  const prodSh = ss.getSheetByName(SHEET_PRODUCTS);
  if (prodSh) {
    const prodData = prodSh.getDataRange().getValues();
    items.forEach(item => {
      const sku = String(item.sku || "").trim().toUpperCase();
      const hasNewFmt = item.qtyWH != null || item.qtyFS != null;
      const net = netOf(item);
      const deductWH = hasNewFmt ? (Number(item.qtyWH) || 0) : (item.warehouse !== "frontstore" ? net : 0);
      const deductFS = hasNewFmt ? (Number(item.qtyFS) || 0) : (item.warehouse === "frontstore" ? net : 0);
      if (deductWH <= 0 && deductFS <= 0) return;
      for (let i = 1; i < prodData.length; i++) {
        if (String(prodData[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
          const row = i + 1;
          if (deductWH > 0) {
            const cur = Number(prodSh.getRange(row, COL_PROD_QTYWH).getValue()) || 0;
            prodSh.getRange(row, COL_PROD_QTYWH).setValue(Math.max(0, cur - deductWH));
          }
          if (deductFS > 0) {
            const cur = Number(prodSh.getRange(row, COL_PROD_QTYFS).getValue()) || 0;
            prodSh.getRange(row, COL_PROD_QTYFS).setValue(Math.max(0, cur - deductFS));
          }
          break;
        }
      }
    });
  }

  // Append items to วัตถุดิบ MTO (F=คืน, G=ตัดจริง, H=ปิดงานเมื่อ)
  const itemSh = getOrCreateMtoItemSheet_(ss);
  if (itemSh) {
    // ลบแถว draft (closedAt ว่าง) ของ job นี้ก่อน — กันวัตถุดิบซ้ำถ้าเคยกด "บันทึก" ไว้
    const exRows = itemSh.getDataRange().getValues();
    for (let i = exRows.length - 1; i >= 1; i--) {
      if (String(exRows[i][0]).trim() === jobId && !String(exRows[i][7] || "").trim()) {
        itemSh.deleteRow(i + 1);
      }
    }
    items.forEach(item => {
      const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, Number(item.qty) || 0));
      const hasNewFmt = item.qtyWH != null || item.qtyFS != null;
      const net = netOf(item);
      const deductWH = hasNewFmt ? (Number(item.qtyWH) || 0) : (item.warehouse !== "frontstore" ? net : 0);
      const deductFS = hasNewFmt ? (Number(item.qtyFS) || 0) : (item.warehouse === "frontstore" ? net : 0);
      const whLabel = hasNewFmt ? ("คลัง:" + deductWH + "/ร้าน:" + deductFS) : (item.warehouse || "warehouse");
      itemSh.appendRow([jobId, item.sku || "", item.name || "", Number(item.qty) || 0, whLabel, ret, deductWH + deductFS, closedAt]);
    });
  }

  // Update งาน MTO row
  const jobSh = getOrCreateMtoJobSheet_(ss);
  if (jobSh) {
    const jobData = jobSh.getDataRange().getValues();
    for (let i = 1; i < jobData.length; i++) {
      if (String(jobData[i][0]).trim() === jobId) {
        jobSh.getRange(i + 1, 7).setValue("เสร็จแล้ว");
        jobSh.getRange(i + 1, 8).setValue(closedAt);
        break;
      }
    }
  }

  // Decrease stock in ZORT per warehouse group
  let zortResult = null;
  try {
    zortResult = createZortSaleOrder_(items, jobId + (data.jobName ? " " + data.jobName : ""));
  } catch (e) {
    Logger.log("ZORT Sale Order failed: " + e);
    logZortFailure_("สร้าง Sale Order งานจัดพิเศษ: " + jobId, String(e) + " | SKU: " + items.map(it => it.sku).join(","));
  }

  // ปิดงานสำเร็จ → mark idempotency กันกดซ้ำใน 6 ชม.
  cache.put("mto_closed_" + jobId, "1", 21600);

  // Audit log
  writeAuditLog_(actor, "ปิดงาน MTO", jobId, data.jobName || jobId);

  invalidateCache_();

  // ── 2C: LINE notification เมื่อปิดงาน MTO ──────────────────────────────
  // wrap ใน try/catch เพื่อไม่ให้ LINE error ทำให้ closeMtoJob fail
  try {
    var totalQty = items.reduce(function(s, i) { return s + (Number(i.qty) || 0); }, 0);
    var zortStatus;
    if (zortResult && zortResult.success === true) {
      zortStatus = 'สร้างแล้ว';
    } else if (zortResult && zortResult.skipped === true) {
      zortStatus = 'ข้ามแล้ว';
    } else {
      zortStatus = 'ไม่สำเร็จ (แต่สต็อกตัดแล้ว)';
    }
    var closeMsg = '✅ ปิดงาน ' + jobId + ' แล้ว\n'
      + 'งาน: ' + (data.jobName || '-') + '\n'
      + 'ตัดสต็อก: ' + items.length + ' รายการ, ' + totalQty + ' ชิ้น\n'
      + 'ZORT Order: ' + zortStatus;
    sendLineMessage_(closeMsg);
  } catch (lineErr) {
    Logger.log('LINE notify closeMtoJob error: ' + lineErr);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, jobId, deducted: items.length, zort: zortResult }))
    .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function decreaseMtoStockInZort_(items) {
  // Group items by warehouse (รองรับ split format: qtyWH/qtyFS)
  const groups = {};
  const push_ = (whCode, sku, qty) => {
    if (!sku || qty <= 0) return;
    if (!groups[whCode]) groups[whCode] = [];
    groups[whCode].push({ sku, stock: qty });
  };
  for (const item of items) {
    const sku = String(item.sku || "").trim();
    const hasNewFmt = item.qtyWH != null || item.qtyFS != null;
    if (hasNewFmt) {
      push_(WH_SAI5, sku, Number(item.qtyWH) || 0);
      push_(WH_FRONTSTORE, sku, Number(item.qtyFS) || 0);
    } else {
      const qty = Number(item.qty) || 0;
      const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
      const net = qty - ret;
      push_(item.warehouse === "frontstore" ? WH_FRONTSTORE : WH_SAI5, sku, net);
    }
  }

  const results = {};
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });

  for (const [whCode, stocks] of Object.entries(groups)) {
    if (!stocks.length) continue;
    const payload = { warehousecode: whCode, stocks };
    const res = UrlFetchApp.fetch(`${ZORT_BASE}/Product/DecreaseProductStockList?warehousecode=${encodeURIComponent(whCode)}`, {
      method: "post",
      headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());
    Logger.log(`ZORT DecreaseStock [${whCode}]: ` + JSON.stringify(json));
    results[whCode] = json;
    const err = zortRespError_(res);
    if (err) logZortFailure_("ตัดสต็อก MTO (" + whCode + ")", err + " | SKU: " + stocks.map(s => s.sku).join(","));
  }

  return results;
}

// สร้าง ZORT Sale Order ราคา 0 (หักสต็อกผ่านรายการขาย ไม่ใช่ DecreaseStock โดยตรง)
function createZortSaleOrder_(items, jobName) {
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
  const dateStr = Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy");

  const list = items
    .map(function(it) {
      const net = Number(it.qty) - Math.max(0, Math.min(Number(it.returnedQty) || 0, Number(it.qty)));
      return { sku: String(it.sku || "").trim(), name: String(it.name || "").trim(), number: net, price: 0, totalprice: 0 };
    })
    .filter(function(it) { return it.number > 0; });

  if (!list.length) return { skipped: true };

  const payload = {
    date: dateStr,
    remark: jobName || "",
    list: list,
  };

  const res = UrlFetchApp.fetch(ZORT_BASE + "/Order/AddOrder", {
    method: "post",
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const err = zortRespError_(res);
  if (err) {
    logZortFailure_("สร้าง Sale Order งานจัดพิเศษ: " + jobName, err);
    return { success: false, error: err };
  }
  const json = JSON.parse(res.getContentText() || "{}");
  Logger.log("ZORT Sale Order created: " + JSON.stringify(json));
  return { success: true, orderNumber: json.number || json.ordernumber || null };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🧾 ระบบออกบิล/ใบกำกับภาษี + รับชำระ (POS สำหรับ saler)
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ชื่อ field ลูกค้าของ ZORT (taxid/สาขา/ที่อยู่ ฯลฯ) ยัง "อนุมาน" ตาม ZORT API v4
//    รวมไว้ที่ POS_ZORT_FIELDS ก้อนเดียว — ถ้ายิงจริงแล้ว field ไม่ตรง แก้ที่นี่จุดเดียว
//    รัน exploreZortForBilling() (read-only) ใน GAS editor เพื่อยืนยันชื่อ field จริงก่อนใช้งานจริง
// ─────────────────────────────────────────────────────────────────────────────
var POS_ZORT_FIELDS = {
  // GET /Contact/GetContacts — param ค้นหา (keyword ครอบทั้งชื่อ+เลขภาษี ตาม pattern GetProducts)
  contactSearchParam: "keyword",
  // field ที่อ่านกลับจาก contact (normalize → ฝั่ง frontend ใช้ชื่อกลาง)
  contactId:      ["id", "contactid", "customerid"],
  contactName:    ["name", "contactname", "customername"],
  contactTaxId:   ["taxid", "taxnumber", "customertaxid", "taxno", "idcard", "taxidnumber", "vatid", "idnumber"],
  contactBranch:  ["branch", "branchname"],
  contactBranchNo:["branchcode", "branchno", "branchnumber"],
  contactAddress: ["address", "customeraddress", "fulladdress"],
  contactPhone:   ["phone", "telephone", "tel", "mobile"],
  contactEmail:   ["email"],
  // POST /Order/AddOrder — field ลูกค้าที่ต้องส่ง (mirror ของ contact ด้านบน)
  orderCustomerName:    "customername",
  orderCustomerTaxId:   "customertaxid",
  orderCustomerBranch:  "customerbranch",
  orderCustomerBranchNo:"customerbranchcode",
  orderCustomerAddress: "customeraddress",
  orderCustomerPhone:   "customerphone",
  orderCustomerEmail:   "customeremail",
  orderChannel:         "channel",   // ช่องทางขาย (หน้าร้าน/Line OA/...)
  // line item: ZORT v4 ใช้ pricepernumber เป็นราคาต่อหน่วย (ไม่ใช่ price) — ส่งครบทั้ง 3 กันพลาด
  orderStatusField:     "status",    // field สถานะใน AddOrder / UpdateOrderStatus
  orderStatusDone:      "Success",   // ค่าสถานะ "สำเร็จ" (แก้ที่นี่ถ้า ZORT ใช้ค่าอื่น)
};

// เดินหา value แรกที่ "ชื่อคีย์" ตรง regex ทั่วทั้ง object (nested) — ใช้กันชื่อ field ZORT ไม่ตรงที่เดา
function deepFindByKey_(obj, keyRegex) {
  if (!obj || typeof obj !== "object") return "";
  for (var k in obj) {
    var v = obj[k];
    if (v && typeof v === "object") { var nested = deepFindByKey_(v, keyRegex); if (nested) return nested; continue; }
    if (keyRegex.test(k) && v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// อ่านค่าจาก object ตาม list ชื่อ field ที่เป็นไปได้ (ตัวแรกที่มีค่า)
function pickField_(obj, keys) {
  if (!obj) return "";
  for (var i = 0; i < keys.length; i++) {
    var v = obj[keys[i]];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

// สแกนหาเลขผู้เสียภาษี 13 หลักจากทุก field ของ object (กันชื่อ field ZORT ไม่ตรงที่เดา)
function findTaxId13_(obj) {
  if (!obj || typeof obj !== "object") return "";
  for (var k in obj) {
    var v = obj[k];
    if (v == null) continue;
    if (typeof v === "object") { var nested = findTaxId13_(v); if (nested) return nested; continue; }
    var digits = String(v).replace(/[\s\-]/g, "");
    if (/^\d{13}$/.test(digits)) return digits;
  }
  return "";
}

// normalize contact ของ ZORT → รูปกลางที่ frontend ใช้
// taxId: ลองชื่อ field ที่รู้จักก่อน ถ้าไม่เจอ สแกนหาเลข 13 หลักจากทั้ง object
function normalizeContact_(c) {
  var F = POS_ZORT_FIELDS;
  return {
    id:       pickField_(c, F.contactId),
    name:     pickField_(c, F.contactName),
    taxId:    pickField_(c, F.contactTaxId) || findTaxId13_(c),
    branch:   pickField_(c, F.contactBranch),
    branchNo: pickField_(c, F.contactBranchNo),
    address:  pickField_(c, F.contactAddress),
    phone:    pickField_(c, F.contactPhone),
    email:    pickField_(c, F.contactEmail),
  };
}

// ดึงรายละเอียดลูกค้าเต็ม (taxid/สาขา/ที่อยู่) ตอนเลือกจากผลค้นหา — list บางทีไม่คืน field ครบ
function getContactDetail(id) {
  var cid = String(id || "").trim();
  if (!cid) return error("ไม่มีรหัสลูกค้า");
  try {
    var url = ZORT_BASE + "/Contact/GetContactDetail?id=" + encodeURIComponent(cid);
    var res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    var zErr = zortRespError_(res);
    if (zErr) { logZortFailure_("ดึงรายละเอียดลูกค้า", cid + " | " + zErr); return error("ดึงข้อมูลลูกค้าไม่สำเร็จ: " + zErr); }
    var json = JSON.parse(res.getContentText() || "{}");
    // detail อาจอยู่ใน json ตรง ๆ หรือใน json.contact / json.data
    var c = json.contact || json.data || json;
    return ok({ contact: normalizeContact_(c) });
  } catch (e) {
    return error("ดึงข้อมูลลูกค้าไม่สำเร็จ: " + e);
  }
}

// ค้นลูกค้าด้วย keyword เดียว (ชื่อบริษัท หรือ เลขผู้เสียภาษี) → คืน list ที่ normalize แล้ว
// เจอ "ที่อยู่ไม่สามารถใช้ได้" (UrlFetchApp exception ชั่วคราว คุยกับ ZORT ไม่สำเร็จ) เป็นระยะ
// เมื่อค้นเลขผู้เสียภาษีที่ไม่เคยเป็นลูกค้ามาก่อน — ลอง retry สั้นๆ 1 ครั้งกันเสียเวลาเจ้าของ
// ต้องกดค้นหาซ้ำเอง
function searchContact(query) {
  var q = String(query || "").trim();
  if (q.length < 2) return ok({ contacts: [] });
  var url = ZORT_BASE + "/Contact/GetContacts?page=1&limit=10&" +
    POS_ZORT_FIELDS.contactSearchParam + "=" + encodeURIComponent(q);
  var lastErr = null;
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      var res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
      var zErr = zortRespError_(res);
      if (zErr) { lastErr = zErr; break; } // resCode error จาก ZORT เอง ไม่ใช่ network — ไม่ retry
      var json = JSON.parse(res.getContentText() || "{}");
      var list = json.list || json.contacts || json.data || [];
      var out = list.map(normalizeContact_).filter(function (c) { return c.name || c.taxId; });
      return ok({ contacts: out });
    } catch (e) {
      lastErr = String(e);
      if (attempt === 0) Utilities.sleep(800); // retry เดียวพอ กัน exception ชั่วคราวจากฝั่ง network
    }
  }
  logZortFailure_("ค้นลูกค้า", q + " | " + lastErr);
  return error("ค้นลูกค้าไม่สำเร็จ: " + lastErr);
}

// ── ชีต "บิลขาย" — log บิล POS ฝั่งเราเอง (1 แถว = 1 บิล) ────────────────────
// ทำไมต้องมี: createSaleBill ยิงเข้า ZORT อย่างเดียว ไม่เหลือร่องรอยฝั่งเรา (เหลือแค่ audit log)
// → ดู "ยอดขายวันนี้"/ปิดยอดเงินสด/แยกตามเซล ไม่ได้เลย จนกว่า syncZortSales จะรอบถัดไป (ทุก 2 ชม.)
// เก็บระดับ "บิล" ไม่ใช่ระดับรายการ — รายละเอียดสินค้าในบิลดึงจาก ZORT ได้ด้วย lookupSaleBill(เลขบิล)
function saleBillsSheet_(ss) {
  return getOrCreateSheet_(ss, SHEET_SALE_BILLS, [
    "id", "วันที่", "เวลา", "เลขบิล", "เลขใบกำกับ", "ผู้ขาย", "ช่องทาง", "วิธีชำระ",
    "ยอดสุทธิ", "ก่อน VAT", "VAT", "ส่วนลดรวม", "จำนวนรายการ", "จำนวนชิ้น",
    "ลูกค้า", "เลขผู้เสียภาษี", "ใบกำกับภาษี", "รับเงินสด", "เงินทอน",
    "zortOrderId", "สถานะ", "หมายเหตุ",
  ]);
}

// id กันชนกันแม้มีการลบแถว (บทเรียนเดียวกับ attNextId_ — ห้ามใช้ getLastRow() เฉย ๆ)
function saleBillNextId_(sh, dateStr) {
  var prefix = "SB-" + String(dateStr).replace(/-/g, "") + "-";
  var used = {};
  var last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { used[String(r[0])] = true; });
  }
  var n = last;
  for (var i = 0; i < 10000; i++) {
    var id = prefix + String(n).padStart(4, "0");
    if (!used[id]) return id;
    n++;
  }
  return prefix + Utilities.getUuid().slice(0, 4);
}

// เขียน 1 แถวลงชีตบิลขาย · คืน {ok:true,id} / {ok:false,error}
// **ห้าม throw ออกไป** — ตอนถูกเรียก บิลถูกสร้างใน ZORT สำเร็จแล้ว (เงินรับมาแล้ว)
// เขียนชีตพลาดต้องไม่ทำให้ทั้ง action พัง ผู้ขายต้องได้เลขบิลไปออกใบเสร็จเสมอ
function appendSaleBillRow_(ss, rec) {
  try {
    var sh = saleBillsSheet_(ss);
    var now = new Date();
    var dateStr = Utilities.formatDate(now, "Asia/Bangkok", "yyyy-MM-dd");
    var timeStr = Utilities.formatDate(now, "Asia/Bangkok", "HH:mm:ss");
    var id = saleBillNextId_(sh, dateStr);
    var row = [
      id, dateStr, timeStr,
      String(rec.orderNumber || ""), String(rec.documentNumber || ""),
      String(rec.actor || ""), String(rec.channel || ""), String(rec.paymentMethod || ""),
      Number(rec.grandTotal) || 0, Number(rec.preVat) || 0, Number(rec.vat) || 0,
      Number(rec.discount) || 0, Number(rec.lineCount) || 0, Number(rec.unitCount) || 0,
      String(rec.customerName || ""), String(rec.customerTaxId || ""),
      rec.taxInvoice ? "ใช่" : "",
      rec.cashReceived == null ? "" : Number(rec.cashReceived),
      rec.cashChange == null ? "" : Number(rec.cashChange),
      String(rec.zortOrderId == null ? "" : rec.zortOrderId),
      "สำเร็จ", "",
    ];
    sh.appendRow(row);
    // วันที่/เวลา/เลขบิล เป็น text — กัน Sheets แปลง "2026-07-29" เป็น Date และเลขบิลยาวเป็น
    // number/exponential (บทเรียนข้อ 2 ใน CLAUDE.md) · ตั้งหลัง appendRow เพราะต้องรู้เลขแถว
    var r = sh.getLastRow();
    sh.getRange(r, 2, 1, 3).setNumberFormat("@");   // B วันที่, C เวลา, D เลขบิล
    sh.getRange(r, 5, 1, 1).setNumberFormat("@");   // E เลขใบกำกับ
    sh.getRange(r, 20, 1, 1).setNumberFormat("@");  // T zortOrderId
    return { ok: true, id: id };
  } catch (e) {
    Logger.log("appendSaleBillRow_ error: " + e);
    return { ok: false, error: String(e) };
  }
}

// ── หักสต็อก "หน้าร้าน" (col G) ในชีตหลังขายผ่าน POS ────────────────────────
// ทำไมหัก col G: POS ไม่ได้ส่ง warehousecode ให้ AddOrder → ZORT ตัดจากคลัง default
// ซึ่งเจ้าของยืนยันแล้วว่าคือ "ดูเหมือนจริง/หน้าร้าน" (W0001) = col G (qtyStore)
// ตรงกับที่ POS โชว์ "คงเหลือ N" และเตือน "เกินสต๊อกหน้าร้าน" อยู่แล้ว
//
// ⚠️ **ห้ามเรียก pushStockToZort_ ที่นี่** — AddOrder ตัดสต็อกฝั่ง ZORT ให้แล้ว
//    ยิงซ้ำ = หักสองเด้ง · ตรงนี้เป็นแค่การอัปเดตชีตให้ทันทีไม่ต้องรอ sync (ทุก 2 ชม.)
//    รอบ sync ถัดไปจะเขียนทับด้วยเลขจริงจาก ZORT อยู่ดี (ZORT เป็น source of truth)
//
// ไม่ throw — ตอนถูกเรียกบิลออกไปแล้ว หักสต็อกพลาดต้องไม่ทำให้ผู้ขายไม่ได้เลขบิล
function deductFrontStoreForSale_(ss, list) {
  try {
    var sheet = ss.getSheetByName(SHEET_PRODUCTS);
    if (!sheet) return { ok: false, error: "ไม่พบชีต " + SHEET_PRODUCTS };

    // รวมจำนวนต่อ SKU ก่อน — บิลเดียวอาจมี SKU เดิมหลายบรรทัด
    var want = {};
    list.forEach(function (it) {
      var sku = String(it.sku || "").trim().toUpperCase();
      var q = Number(it.number) || 0;
      if (sku && q > 0) want[sku] = (want[sku] || 0) + q;
    });

    var data = sheet.getDataRange().getValues();
    var applied = [], shortfall = [];
    for (var i = 1; i < data.length; i++) {
      var sku = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
      if (!sku || want[sku] === undefined) continue;
      var qty = want[sku];
      delete want[sku];   // SKU ซ้ำหลายแถวในชีต → หักแถวแรกที่เจอแถวเดียว ไม่หักซ้ำ
      var cur = Number(data[i][COL_PROD_QTYFS - 1]) || 0;
      var next = cur - qty;
      // ไม่ปล่อยติดลบ (สอดคล้องกับ deductStock เดิม) — ขายเกินที่ระบบรู้ = ชั้นมีของมากกว่าที่นับไว้
      if (next < 0) { shortfall.push({ sku: sku, want: qty, had: cur }); next = 0; }
      // เขียนทีละ cell เฉพาะแถวที่เปลี่ยน — syncZortToColumn_ ไม่ได้จับ LockService
      // การเขียนทับทั้งคอลัมน์จึงเสี่ยงทับงาน sync ที่รันคาบเกี่ยว
      sheet.getRange(i + 1, COL_PROD_QTYFS).setValue(next);
      applied.push({ sku: sku, qty: qty, before: cur, after: next });
    }
    SpreadsheetApp.flush();
    return { ok: true, applied: applied, shortfall: shortfall, notFound: Object.keys(want) };
  } catch (e) {
    Logger.log("deductFrontStoreForSale_ error: " + e);
    return { ok: false, error: String(e) };
  }
}

// สร้างบิลขาย + (option) ใบกำกับภาษี + บันทึกรับชำระ
// data = {
//   items:[{sku,name,qty,price,category}],  // price=ราคาปลีก/ชิ้น (รวม VAT)
//   customer:{name,taxId,branch,branchNo,address,phone,email},
//   manualDiscount, paymentMethod, taxInvoice(bool), dryRun(bool), remark
// }
// หมายเหตุ: คิดยอดฝั่ง server ซ้ำด้วย computeBillTotalsGs_ (ไม่เชื่อยอดจาก client) กันตัวเลขถูกแก้
function createSaleBill(ss, data, actor) {
  var items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return error("ไม่มีรายการสินค้าในบิล");

  var totals = computeBillTotalsGs_(items, {
    excludeKeywords: readBillExcludeCats_(),
    manualDiscount: data.manualDiscount,
  });

  // line items สำหรับ ZORT — เฉลี่ยส่วนลดลงราคาต่อชิ้นตามสัดส่วน (ให้ยอดรวม = grandTotal)
  var gross = totals.retailEligible + totals.retailExcluded;
  var factor = gross > 0 ? (totals.grandTotal / gross) : 1;   // อัตราส่วนหลังส่วนลดทั้งบิล
  // line items — ยืนยันจากหน้า ZORT: "มูลค่าต่อหน่วย" มาจาก field pricepernumber (ไม่ใช่ price)
  // ถ้าไม่ส่ง pricepernumber → หน่วย=0 → ยอดรวมสุทธิ=0 · ต้องส่ง pricepernumber = ราคาต่อหน่วยจริง
  // ไม่ใส่ warehousecode (ทั้ง order + line) — mirror createZortSaleOrder_ ที่เวิร์ก · warehousecode
  // ทำให้ ZORT สร้างงานโอนค้าง "รอโอนสินค้า" (ให้ ZORT หักจากคลัง default เหมือน MTO)
  var list = items.map(function (it) {
    var qty = Number(it.qty) || 0;
    var netUnit = Math.round((Number(it.price) || 0) * factor * 100) / 100;  // ราคาต่อชิ้นสุทธิ (หลังเฉลี่ยส่วนลด, รวม VAT)
    return {
      sku: String(it.sku || "").trim(),
      name: String(it.name || "").trim(),
      number: qty,
      pricepernumber: netUnit,                         // ← field ที่ ZORT ใช้เป็น "มูลค่าต่อหน่วย" จริง
      price: netUnit,
      totalprice: Math.round(netUnit * qty * 100) / 100,
    };
  }).filter(function (it) { return it.number > 0; });

  // ประกอบ payload AddOrder — mirror createZortSaleOrder_ (minimal ที่เวิร์ก) + field ลูกค้า
  // ไม่ใส่ warehousecode/status ระดับ order (เดิมใส่แล้วราคากลายเป็น 0) — status ตั้งทีหลังผ่าน UpdateOrderStatus
  var F = POS_ZORT_FIELDS;
  var cust = data.customer || {};
  var payload = {
    date: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy"),
    remark: String(data.remark || ""),
    list: list,
  };
  if (data.channel)  payload[F.orderChannel]          = String(data.channel);
  if (cust.name)     payload[F.orderCustomerName]     = String(cust.name);
  if (cust.taxId)    payload[F.orderCustomerTaxId]    = String(cust.taxId);
  if (cust.branch)   payload[F.orderCustomerBranch]   = String(cust.branch);
  if (cust.branchNo) payload[F.orderCustomerBranchNo] = String(cust.branchNo);
  if (cust.address)  payload[F.orderCustomerAddress]  = String(cust.address);
  if (cust.phone)    payload[F.orderCustomerPhone]    = String(cust.phone);
  if (cust.email)    payload[F.orderCustomerEmail]    = String(cust.email);

  // dryRun = คืน payload + ยอดที่คิดได้ ไม่ยิง ZORT (ให้ตรวจก่อนใช้จริง)
  if (data.dryRun) return ok({ dryRun: true, totals: totals, payload: payload });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    var headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
    // ── (1) AddOrder — สร้างบิล + ตัดสต็อก (ตัวหลักที่ต้องรอ) ──
    var _t0 = Date.now();
    var res = UrlFetchApp.fetch(ZORT_BASE + "/Order/AddOrder", {
      method: "post", headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    Logger.log("POS createSaleBill: AddOrder took " + (Date.now() - _t0) + "ms");
    var zErr = zortRespError_(res);
    if (zErr) { logZortFailure_("ออกบิลขาย (saler)", zErr); return error("สร้างบิลใน ZORT ไม่สำเร็จ: " + zErr); }
    var rawResp = res.getContentText() || "{}";
    Logger.log("POS AddOrder resp: " + rawResp.substring(0, 600));   // ดู field เลขบิลจริงจาก Executions
    var json = JSON.parse(rawResp);
    var orderId     = json.id || json.orderid || json.orderId || deepFindByKey_(json, /^(order)?id$/i) || null;
    // เลขบิลจาก ZORT (เช่น RC-3-2026xxxxx) — ลอง field ตรง ๆ ก่อน แล้ว deep-scan (คีย์ = number/ordernumber เป๊ะ)
    var orderNumber = json.number || json.ordernumber || json.orderNumber || deepFindByKey_(json, /^(order)?number$/i) || null;
    // fallback: ถ้า AddOrder ไม่คืนเลขบิล → ดึงจาก GetOrderDetail (ยิงเฉพาะกรณีจำเป็น ไม่เพิ่ม latency ปกติ)
    if (!orderNumber && orderId != null) {
      try {
        var odRes = UrlFetchApp.fetch(ZORT_BASE + "/Order/GetOrderDetail?id=" + encodeURIComponent(orderId),
          { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
        var odJson = JSON.parse(odRes.getContentText() || "{}");
        orderNumber = deepFindByKey_(odJson, /^(order)?number$/i) || orderNumber;
      } catch (e) { Logger.log("POS GetOrderDetail fallback error: " + e); }
    }

    // ── (2) ใบกำกับภาษี + รับชำระ — ยิงขนานกันด้วย fetchAll (ลดเวลา sequential) ──
    var docNumber = null;
    var reqs = [], kinds = [];
    if (data.taxInvoice && orderId != null) {
      reqs.push({ url: ZORT_BASE + "/Document/AddDocumentOrder", method: "post", headers: headers,
        muteHttpExceptions: true, payload: JSON.stringify({ id: orderId, orderid: orderId, documenttype: 2 }) });
      kinds.push("doc");
    }
    if (data.paymentMethod && orderId != null) {
      reqs.push({ url: ZORT_BASE + "/Order/UpdateOrderPayment", method: "post", headers: headers,
        muteHttpExceptions: true, payload: JSON.stringify({ id: orderId, orderid: orderId,
          paymentmethod: String(data.paymentMethod), paymentamount: totals.grandTotal,
          paymentdate: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy") }) });
      kinds.push("pay");
    }
    // ตั้งสถานะ order เป็น "สำเร็จ" (เผื่อ status ใน AddOrder ไม่มีผล) — best effort ล้มเหลวไม่กระทบบิล
    if (orderId != null) {
      var stPayload = { id: orderId, orderid: orderId };
      stPayload[F.orderStatusField] = F.orderStatusDone;
      reqs.push({ url: ZORT_BASE + "/Order/UpdateOrderStatus", method: "post", headers: headers,
        muteHttpExceptions: true, payload: JSON.stringify(stPayload) });
      kinds.push("status");
    }
    if (reqs.length) {
      var _t1 = Date.now();
      try {
        var resps = UrlFetchApp.fetchAll(reqs);   // parallel
        Logger.log("POS createSaleBill: doc+pay (" + kinds.join(",") + ") took " + (Date.now() - _t1) + "ms");
        for (var i = 0; i < resps.length; i++) {
          var rErr = zortRespError_(resps[i]);
          if (kinds[i] === "doc") {
            if (rErr) { logZortFailure_("ออกใบกำกับภาษี order " + orderNumber, rErr); }
            else { var dj = JSON.parse(resps[i].getContentText() || "{}"); docNumber = dj.number || dj.documentnumber || dj.documentNumber || null; }
          } else if (kinds[i] === "pay" && rErr) {
            logZortFailure_("บันทึกรับชำระ order " + orderNumber, rErr);
          } else if (kinds[i] === "status" && rErr) {
            logZortFailure_("ตั้งสถานะสำเร็จ order " + orderNumber, rErr);
          }
        }
      } catch (e) { logZortFailure_("ใบกำกับ/รับชำระ order " + orderNumber, String(e)); }
    }

    // ── หักสต็อกหน้าร้านในชีตทันที (ไม่ต้องรอ sync ZORT ทุก 2 ชม.) ──
    // กันขายเกิน: คนถัดไปที่เปิด POS จะเห็นเลขที่หักแล้ว ไม่ใช่เลขค้างของเมื่อ 2 ชม.ก่อน
    var stockRes = deductFrontStoreForSale_(ss, list);
    if (!stockRes.ok) {
      logZortFailure_("หักสต็อกหน้าร้านหลังออกบิล " + (orderNumber || ""), stockRes.error);
    }

    writeAuditLog_(actor || "ไม่ระบุ", "ออกบิลขาย", orderNumber || "(ไม่ทราบเลข)",
      auditDetail_({ after: { total: totals.grandTotal, items: list.length,
        customer: (data.customer && data.customer.name) || "", taxInvoice: !!data.taxInvoice,
        payment: data.paymentMethod || "",
        cashReceived: data.cashReceived != null ? Number(data.cashReceived) : undefined,
        channel: data.channel || "",
        // ร่องรอยการหักสต็อก — ไว้ไล่ย้อนตอนตัวเลขไม่ตรง
        stockDeducted: stockRes.ok ? stockRes.applied.length : "FAILED",
        stockShortfall: (stockRes.ok && stockRes.shortfall.length) ? stockRes.shortfall : undefined,
        stockNotFound: (stockRes.ok && stockRes.notFound.length) ? stockRes.notFound : undefined },
        note: "saler ออกบิล/ใบกำกับผ่าน POS" }));

    // ── log ลงชีต "บิลขาย" ฝั่งเรา (ไม่ต้องรอ syncZortSales รอบถัดไป) ──
    // ทำหลัง ZORT สำเร็จแล้วเท่านั้น — บิลที่ยิง ZORT ไม่ผ่านจะ return ไปตั้งแต่ด้านบน ไม่ถึงตรงนี้
    // appendSaleBillRow_ ไม่ throw (บิลออกไปแล้ว เขียน log พลาดต้องไม่ทำให้ผู้ขายไม่ได้เลขบิล)
    var cashRecv = (data.paymentMethod === "เงินสด" && data.cashReceived != null)
                     ? Number(data.cashReceived) : null;
    var billLog = appendSaleBillRow_(ss, {
      orderNumber: orderNumber, documentNumber: docNumber, zortOrderId: orderId,
      actor: actor || "", channel: data.channel || "", paymentMethod: data.paymentMethod || "",
      grandTotal: totals.grandTotal, preVat: totals.preVat, vat: totals.vat,
      // ส่วนลดรวมทุกชนิด = มูลค่าสินค้าก่อนลด − ยอดสุทธิ
      // (computeBillTotalsGs_ ไม่ได้คืน wholesaleDiscount/tierDiscount แยกแบบฝั่ง frontend
      //  — คำนวณจากผลต่างแทน ได้ค่าเดียวกันและไม่ผูกกับ field ที่ไม่มีจริง)
      discount: Math.max(0, gross - totals.grandTotal),
      lineCount: list.length,
      unitCount: list.reduce(function (s, it) { return s + (Number(it.number) || 0); }, 0),
      customerName: (data.customer && data.customer.name) || "",
      customerTaxId: (data.customer && data.customer.taxId) || "",
      taxInvoice: !!data.taxInvoice,
      cashReceived: cashRecv,
      cashChange: cashRecv == null ? null : (cashRecv - totals.grandTotal),
    });
    if (!billLog.ok) logZortFailure_("บันทึกชีตบิลขาย " + (orderNumber || ""), billLog.error);

    invalidateCache_();
    return ok({ orderId: orderId, orderNumber: orderNumber, documentNumber: docNumber,
                totals: totals, billLogId: billLog.ok ? billLog.id : null });
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🧾 ใบกำกับภาษีเต็มรูปแบบย้อนหลัง — ลูกค้ามาขอภายหลังด้วยเลขบิล (RC-3-...)
// ─────────────────────────────────────────────────────────────────────────────
// flow: lookupSaleBill (ดึงบิลเดิมจาก ZORT) → กรอกข้อมูลภาษีลูกค้า → issueFullTaxInvoice
//       (EditOrderInfo ใส่ข้อมูลลูกค้า + AddDocumentOrder documenttype:2 = เอกสารจริงใน ZORT)
// ─────────────────────────────────────────────────────────────────────────────

// หา order ใน ZORT จากเลขบิล → คืน id ที่แท้จริง + object detail (list/customer/amount)
// ZORT GET GetOrderDetail?id= รับเฉพาะ numeric id → ถ้าเลขบิลไม่ใช่ตัวเลข scan GetOrders หา id ก่อน
function findZortOrderByNumber_(orderNumber) {
  var H = zortHeaders_();
  var num = String(orderNumber || "").trim();
  if (!num) return null;
  function get(path) {
    try { return JSON.parse(UrlFetchApp.fetch(ZORT_BASE + path, { method: "get", headers: H, muteHttpExceptions: true }).getContentText() || "{}"); }
    catch (err) { return {}; }
  }
  // (1) ลอง GetOrderDetail?id={number} ตรง ๆ ก่อน (ZORT บาง GET รับ number ได้)
  var direct = get("/Order/GetOrderDetail?id=" + encodeURIComponent(num));
  var d0 = direct.order || direct.data || direct;
  if (d0 && (d0.list || d0.number)) return { id: d0.id || d0.orderid || num, detail: d0 };
  // (2) scan GetOrders ย้อนหลัง ~180 วัน หา number ที่ตรง แล้วดึง detail ด้วย id จริง
  var to = new Date(), from = new Date(to.getTime() - 180 * 86400000);
  var fmt = function (dt) { return Utilities.formatDate(dt, "Asia/Bangkok", "yyyy-MM-dd"); };
  for (var page = 1; page <= 4; page++) {
    var res = get("/Order/GetOrders?page=" + page + "&limit=200&fromdate=" + fmt(from) + "&todate=" + fmt(to));
    var list = res.list || res.orders || res.data || [];
    if (!list.length) break;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].number).trim() === num) {
        var oid = list[i].id || list[i].orderid;
        var dd = get("/Order/GetOrderDetail?id=" + encodeURIComponent(oid));
        return { id: oid, detail: dd.order || dd.data || dd || list[i] };
      }
    }
  }
  return null;
}

// ดึงบิลขายเดิมจาก ZORT (read-only) → normalize เป็นรูปที่ frontend เอาไปโชว์ + พิมพ์ A4
function lookupSaleBill(orderNumber) {
  var num = String(orderNumber || "").trim();
  if (!num) return error("กรุณาระบุเลขบิล");
  var found = findZortOrderByNumber_(num);
  if (!found) return error("ไม่พบบิลเลขที่ " + num + " ในระบบ (ลองตรวจเลขบิลอีกครั้ง)");
  var o = found.detail || {};
  var rawItems = o.list || o.items || o.orderlist || o.products || [];
  var items = rawItems.map(function (it) {
    var qty = Number(it.number) || 0;
    var unit = Number(it.pricepernumber) || 0;                       // ราคาต่อหน่วย (รวม VAT) ตามที่ ZORT เก็บ
    var disc = Number(it.discountPerNumber != null ? it.discountPerNumber : (it.discountPerNumber_pretax || 0)) || 0;
    var amt = Number(it.totalprice != null ? it.totalprice : (unit - disc) * qty) || 0;
    return { sku: it.sku || "", name: it.name || it.sku || "", qty: qty, unitPrice: unit, discPerUnit: disc, amount: amt };
  }).filter(function (it) { return it.qty > 0; });

  var grand = Number(o.amount) || 0;
  var preVat = Number(o.amount_pretax);
  var vat = Number(o.vatamount);
  if (!(preVat > 0) || isNaN(preVat)) { preVat = Math.round(grand / 1.07 * 100) / 100; vat = Math.round((grand - preVat) * 100) / 100; }
  var grossUnits = items.reduce(function (s, it) { return s + it.qty; }, 0);

  // เช็คว่ามีใบกำกับภาษี (documenttype 2) ออกไปแล้วหรือยัง — กันออกซ้ำ
  var existingDoc = null;
  try {
    var H = zortHeaders_();
    var docRes = JSON.parse(UrlFetchApp.fetch(ZORT_BASE + "/Document/GetDocumentOrders?id=" + encodeURIComponent(found.id),
      { method: "get", headers: H, muteHttpExceptions: true }).getContentText() || "{}");
    var docs = docRes.list || docRes.documents || docRes.data || [];
    for (var k = 0; k < docs.length; k++) {
      var dt = String(docs[k].documenttype != null ? docs[k].documenttype : docs[k].type);
      if (dt === "2" || /tax/i.test(String(docs[k].documenttypename || ""))) { existingDoc = docs[k].number || docs[k].documentnumber || "(มีแล้ว)"; break; }
    }
  } catch (e) { /* ไม่ critical — ปล่อยผ่าน */ }

  return ok({
    orderId: found.id,
    orderNumber: o.number || num,
    dateString: o.orderdateString || o.createdatetimeString || "",
    status: o.status || "",
    paymentMethod: o.paymentmethod || "",
    items: items,
    totals: { preVat: preVat, vat: vat, grandTotal: grand, grossUnits: grossUnits },
    customer: {
      name: o.customername || "", taxId: o.customeridnumber || "",
      branch: o.customerbranchname || "", branchNo: o.customerbranchno || "",
      address: o.customeraddress || "", phone: o.customerphone || "", email: o.customeremail || "",
    },
    existingTaxInvoice: existingDoc,   // เลขใบกำกับเดิม ถ้าเคยออกแล้ว (frontend เตือนก่อนออกซ้ำ)
  });
}

// ออกใบกำกับภาษีเต็มรูปแบบจริงใน ZORT: อัปเดตข้อมูลลูกค้าเข้า order แล้วสร้างเอกสาร documenttype:2
// customer = {name, taxId, branch, branchNo, address, phone, email} · ส่งชื่อ field หลัก + alias กันชื่อไม่ตรง
function issueFullTaxInvoice(orderNumber, customer, actor, orderId) {
  var num = String(orderNumber || "").trim();
  if (!num) return error("กรุณาระบุเลขบิล");
  var c = customer || {};
  if (!String(c.name || "").trim() && !String(c.taxId || "").trim())
    return error("ใบกำกับภาษีต้องมีชื่อลูกค้าหรือเลขผู้เสียภาษี");
  // ใช้ numeric id เป็นหลัก (EditOrderInfo/AddDocumentOrder ต้องการ numeric id ไม่ใช่เลขบิล string)
  // ถ้า client ไม่ส่ง orderId มา → resolve จากเลขบิล
  var oid = orderId;
  if (oid == null || String(oid).trim() === "") { var f = findZortOrderByNumber_(num); oid = f ? f.id : num; }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังทำงานอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    var headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });

    // (1) EditOrderInfo — พยายามใส่/อัปเดตข้อมูลลูกค้าเข้า order (best-effort)
    // หมายเหตุ: ZORT ปฏิเสธ EditOrderInfo บน order ที่ปิดแล้ว (Success) → "Invalid ID"
    // ไม่ให้ล้มทั้ง operation · order ส่วนใหญ่มีลูกค้าจากตอนขายอยู่แล้ว + ส่ง customer inline ที่ AddDocumentOrder ด้วย
    var custFields = {};
    var setF = function (val, key) { if (String(val || "").trim() !== "") custFields[key] = String(val); };
    setF(c.name,     "customername");
    setF(c.taxId,    "customeridnumber");
    setF(c.branch,   "customerbranchname");
    setF(c.branchNo, "customerbranchno");
    setF(c.address,  "customeraddress");
    setF(c.phone,    "customerphone");
    setF(c.email,    "customeremail");
    try {
      var editRes = UrlFetchApp.fetch(ZORT_BASE + "/Order/EditOrderInfo",
        { method: "post", headers: headers, payload: JSON.stringify(Object.assign({ id: oid }, custFields)), muteHttpExceptions: true });
      Logger.log("issueFullTaxInvoice EditOrderInfo (id=" + oid + ") resp: " + (editRes.getContentText() || "").substring(0, 200));
    } catch (e) { Logger.log("EditOrderInfo error (ข้ามได้): " + e); }

    // (2) AddDocumentOrder documenttype:2 = สร้างใบกำกับภาษีเต็มรูปแบบจริง (แนบ customer inline เผื่อ order ยังไม่มี)
    var docRes = UrlFetchApp.fetch(ZORT_BASE + "/Document/AddDocumentOrder",
      { method: "post", headers: headers, muteHttpExceptions: true,
        payload: JSON.stringify(Object.assign({ id: oid, orderid: oid, documenttype: 2 }, custFields)) });
    var docErr = zortRespError_(docRes);
    var docBody = docRes.getContentText() || "{}";
    Logger.log("issueFullTaxInvoice AddDocumentOrder resp: " + docBody.substring(0, 300));
    if (docErr) { logZortFailure_("ใบกำกับย้อนหลัง-สร้างเอกสาร " + num, docErr); return error("สร้างใบกำกับภาษีใน ZORT ไม่สำเร็จ: " + docErr); }
    var dj = JSON.parse(docBody);
    var documentNumber = dj.number || dj.documentnumber || dj.documentNumber || deepFindByKey_(dj, /^(document)?number$/i) || null;

    writeAuditLog_(actor || "ไม่ระบุ", "ออกใบกำกับภาษีย้อนหลัง", num,
      auditDetail_({ after: { documentNumber: documentNumber || "(ไม่ทราบเลข)", customer: c.name || "", taxId: c.taxId || "" },
        note: "ออกใบกำกับภาษีเต็มรูปแบบย้อนหลังผ่าน POS" }));
    invalidateCache_();
    return ok({ orderNumber: num, documentNumber: documentNumber });
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 📄 ใบเสนอราคาจากเว็บ — sales staff สร้างเอง แทนเข้า ZORT UI (field name ยืนยันจาก
// exploreZortAddQuotationV2 แล้ว: customeridnumber/customerbranchname/customerbranchno/
// description/saleschannel — คนละชื่อกับ Order API)
// ─────────────────────────────────────────────────────────────────────────────

// สร้างใบเสนอราคาจริงใน ZORT
// data = {
//   items:[{sku,name,qty,price,category}],   // price=ราคาปลีกต่อชิ้น (SKU ล็อค แต่ name แก้ได้ เช่น MTO)
//   customer:{name,taxId,branch,branchNo,address,phone,email},
//   salesRep, remarks:[string...] หรือ remark:string, channel, manualDiscount, dryRun, draftId
// }
// หมายเหตุ: คิดยอด+ส่วนลดขั้นบันไดฝั่ง server ด้วย computeBillTotalsGs_ ตรรกะเดียวกับ POS
// (ไม่พึ่งฟิลด์ discount ของ ZORT — เฉลี่ยส่วนลดลงราคาต่อหน่วยเหมือน createSaleBill กันหมวดที่ยกเว้น
// เช่น "จัดแบบพิเศษ"/MTO ได้ส่วนลดผิดพลาด)
function createQuotation(ss, data, actor) {
  var items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return error("ไม่มีรายการสินค้าในใบเสนอราคา");

  var totals = computeBillTotalsGs_(items, {
    excludeKeywords: readBillExcludeCats_(),
    manualDiscount: data.manualDiscount,
  });

  var gross = totals.retailEligible + totals.retailExcluded;
  var factor = gross > 0 ? (totals.grandTotal / gross) : 1;
  var list = items.map(function (it) {
    var qty = Number(it.qty) || 0;
    var netUnit = Math.round((Number(it.price) || 0) * factor * 100) / 100;
    return {
      sku: String(it.sku || "").trim(),
      name: String(it.name || "").trim(),
      number: qty,
      pricepernumber: netUnit,
      totalprice: Math.round(netUnit * qty * 100) / 100,
    };
  }).filter(function (it) { return it.sku && it.number > 0; });
  if (!list.length) return error("ไม่มีรายการสินค้าที่ถูกต้องในใบเสนอราคา");

  var cust = data.customer || {};
  var remarkText = Array.isArray(data.remarks)
    ? data.remarks.map(function (r) { return String(r || "").trim(); }).filter(Boolean).join("\n")
    : String(data.remark || "").trim();

  // ยืนยันจาก exploreZortQuotationAmountFix() (test-then-void): AddQuotation ไม่คำนวณ
  // ยอดรวมหัวเอกสาร (amount/มูลค่ารวมสุทธิ) จาก list[].totalprice ให้เองเลย — ต้องส่ง
  // amount/amount_pretax/vatamount ที่ header ตรงๆ ไม่งั้นขึ้น 0 ในหน้า ZORT ทั้งที่ line
  // item ถูกต้อง (ห้ามส่ง vattype/vatpercent/discount ปนด้วย — ลองแล้วทำให้ amount_pretax/
  // vatamount ถูก ZORT recompute ทับกลายเป็นค่าผิดแทน)
  var payload = {
    date: Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy"),
    list: list,
    description: remarkText,
    amount: Math.round(totals.grandTotal * 100) / 100,
    amount_pretax: Math.round(totals.preVat * 100) / 100,
    vatamount: Math.round(totals.vat * 100) / 100,
  };
  if (cust.name)     payload.customername       = String(cust.name);
  if (cust.taxId)    payload.customeridnumber   = String(cust.taxId);
  if (cust.branch)   payload.customerbranchname = String(cust.branch);
  if (cust.branchNo) payload.customerbranchno   = String(cust.branchNo);
  if (cust.address)  payload.customeraddress    = String(cust.address);
  if (cust.phone)    payload.customerphone      = String(cust.phone);
  if (cust.email)    payload.customeremail      = String(cust.email);
  if (data.salesRep) payload.tag = [String(data.salesRep)];   // QuoteFollowupView อ่านชื่อเซลจาก tag อยู่แล้ว
  if (data.channel)  payload.saleschannel       = String(data.channel);

  if (data.dryRun) return ok({ dryRun: true, totals: totals, payload: payload });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    var headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
    var res = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/AddQuotation", {
      method: "post", headers: headers, payload: JSON.stringify(payload), muteHttpExceptions: true,
    });
    var zErr = zortRespError_(res);
    if (zErr) { logZortFailure_("สร้างใบเสนอราคา (" + (cust.name || "") + ")", zErr); return error("สร้างใบเสนอราคาใน ZORT ไม่สำเร็จ: " + zErr); }
    var json = JSON.parse(res.getContentText() || "{}");
    var det = json.detail || {};
    var qId = det.id != null ? det.id
      : (json.resDesc && !isNaN(Number(json.resDesc)) ? Number(json.resDesc) : null);
    var qNumber = det.number || json.resDesc2 || null;
    if (qId == null && !qNumber) { logZortFailure_("สร้างใบเสนอราคา", "ไม่ได้ id/number กลับมา: " + res.getContentText()); return error("สร้างใบเสนอราคาไม่สำเร็จ (ไม่ได้เลขที่กลับมาจาก ZORT)"); }

    writeAuditLog_(actor || "ไม่ระบุ", "สร้างใบเสนอราคา", qNumber || "(ไม่ทราบเลข)",
      auditDetail_({ after: { total: totals.grandTotal, items: list.length, customer: cust.name || "", salesRep: data.salesRep || "" },
        note: "สร้างผ่านเว็บแอป" }));

    if (data.draftId) { try { deleteQuotationDraft_(ss, data.draftId); } catch (e) { Logger.log("ลบร่างหลังส่งไม่สำเร็จ (ไม่ critical): " + e); } }

    invalidateCache_();
    return ok({ quotationId: qId, quotationNumber: qNumber, totals: totals });
  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// แก้ไขใบเสนอราคาเดิมใน ZORT (ใบที่ลูกค้ายังไม่อนุมัติ) — action=editQuotation
// ───────────────────────────────────────────────────────────────────────────
// data = เหมือน createQuotation ทุกอย่าง + quotationId (id จริงจาก ZORT ไม่ใช่เลขที่เอกสาร)
//
// ยืนยันพฤติกรรม ZORT แล้วด้วย exploreZortEditQuotation/V2 (2026-07-30, test-then-void):
//   · ทั้ง EditQuotation และ EditQuotationInfo ต้องส่ง `id` ทาง **query string** เท่านั้น
//     (JSON body {id,...} / form-encoded → "Invalid ID." เหมือน VoidQuotation เป๊ะ)
//   · EditQuotation: list ที่ส่งไป **แทนที่ของเดิมทั้งก้อน** (ส่ง 2 รายการทับ 1 → เหลือ 2 ไม่ใช่ 3)
//   · ZORT คำนวณ amount จาก list ให้เองได้ แต่เรายังส่ง amount/amount_pretax/vatamount เอง
//     เหมือน createQuotation เพื่อให้ตัวเลขตรงกับที่ระบบเราคำนวณเป๊ะ (ส่วนลดขั้นบันไดเฉลี่ยลง
//     ราคาต่อหน่วย — ปัดเศษคนละที่อาจคลาดกัน 1 สตางค์)
//   · EditQuotationInfo แก้ข้อมูลลูกค้าได้ครบ (ชื่อ/ที่อยู่/โทร/เลขภาษี/description)
//
// ต้องยิง 2 ครั้ง: EditQuotation (รายการ+ยอด) แล้วตามด้วย EditQuotationInfo (ลูกค้า+หมายเหตุ)
// ถ้าตัวแรกพัง → หยุดเลย ไม่ยิงตัวที่สอง (กันใบมีข้อมูลลูกค้าใหม่แต่รายการเก่า = ยิ่งสับสน)
// ═══════════════════════════════════════════════════════════════════════════
function editQuotation(ss, data, actor) {
  var qId = String(data.quotationId || "").trim();
  if (!qId) return error("ไม่มี id ของใบเสนอราคาที่จะแก้ไข");

  var items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return error("ไม่มีรายการสินค้าในใบเสนอราคา");

  var totals = computeBillTotalsGs_(items, {
    excludeKeywords: readBillExcludeCats_(),
    manualDiscount: data.manualDiscount,
  });

  // เฉลี่ยส่วนลดลงราคาต่อหน่วย — ตรรกะเดียวกับ createQuotation เป๊ะ (ห้ามให้ 2 ที่คิดคนละแบบ
  // ไม่งั้นแก้ใบแล้วยอดเปลี่ยนทั้งที่ไม่ได้แตะราคา)
  var gross = totals.retailEligible + totals.retailExcluded;
  var factor = gross > 0 ? (totals.grandTotal / gross) : 1;
  var list = items.map(function (it) {
    var qty = Number(it.qty) || 0;
    var netUnit = Math.round((Number(it.price) || 0) * factor * 100) / 100;
    return {
      sku: String(it.sku || "").trim(),
      name: String(it.name || "").trim(),
      number: qty,
      pricepernumber: netUnit,
      totalprice: Math.round(netUnit * qty * 100) / 100,
    };
  }).filter(function (it) { return it.sku && it.number > 0; });
  if (!list.length) return error("ไม่มีรายการสินค้าที่ถูกต้องในใบเสนอราคา");

  var cust = data.customer || {};
  var remarkText = Array.isArray(data.remarks)
    ? data.remarks.map(function (r) { return String(r || "").trim(); }).filter(Boolean).join("\n")
    : String(data.remark || "").trim();

  if (data.dryRun) return ok({ dryRun: true, totals: totals, list: list });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ ลองใหม่อีกครั้ง");
  try {
    var headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });

    // ── ① รายการสินค้า + ยอดรวม ──
    var editRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/EditQuotation?id=" + encodeURIComponent(qId), {
      method: "post", headers: headers, muteHttpExceptions: true,
      payload: JSON.stringify({
        list: list,
        amount: Math.round(totals.grandTotal * 100) / 100,
        amount_pretax: Math.round(totals.preVat * 100) / 100,
        vatamount: Math.round(totals.vat * 100) / 100,
      }),
    });
    var zErr = zortRespError_(editRes);
    if (zErr) {
      logZortFailure_("แก้ไขใบเสนอราคา (" + (data.quotationNumber || qId) + ")", zErr);
      return error("แก้ไขรายการสินค้าใน ZORT ไม่สำเร็จ: " + zErr);
    }

    // ── ② ข้อมูลลูกค้า + หมายเหตุ + ชื่อเซล/ช่องทาง ──
    var infoPayload = { description: remarkText };
    if (cust.name)     infoPayload.customername       = String(cust.name);
    if (cust.taxId)    infoPayload.customeridnumber   = String(cust.taxId);
    if (cust.branch)   infoPayload.customerbranchname = String(cust.branch);
    if (cust.branchNo) infoPayload.customerbranchno   = String(cust.branchNo);
    if (cust.address)  infoPayload.customeraddress    = String(cust.address);
    if (cust.phone)    infoPayload.customerphone      = String(cust.phone);
    if (cust.email)    infoPayload.customeremail      = String(cust.email);
    if (data.salesRep) infoPayload.tag = [String(data.salesRep)];
    if (data.channel)  infoPayload.saleschannel       = String(data.channel);

    var infoRes = UrlFetchApp.fetch(ZORT_BASE + "/Quotation/EditQuotationInfo?id=" + encodeURIComponent(qId), {
      method: "post", headers: headers, payload: JSON.stringify(infoPayload), muteHttpExceptions: true,
    });
    var infoErr = zortRespError_(infoRes);
    // รายการสินค้าแก้สำเร็จไปแล้ว — ข้อมูลลูกค้าพลาดไม่ควรทำให้ทั้งงานล้มเหลว แค่เตือน
    if (infoErr) logZortFailure_("แก้ข้อมูลลูกค้าในใบเสนอราคา (" + (data.quotationNumber || qId) + ")", infoErr);

    writeAuditLog_(actor || "ไม่ระบุ", "แก้ไขใบเสนอราคา", data.quotationNumber || qId,
      auditDetail_({ after: { total: totals.grandTotal, items: list.length, customer: cust.name || "", salesRep: data.salesRep || "" },
        note: "แก้ไขผ่านเว็บแอป" + (infoErr ? " (ข้อมูลลูกค้าอัปเดตไม่สำเร็จ: " + infoErr + ")" : "") }));

    invalidateCache_();
    return ok({ quotationId: qId, quotationNumber: data.quotationNumber || null, totals: totals,
      infoWarning: infoErr || null });
  } finally {
    lock.releaseLock();
  }
}

// บันทึกร่างใบเสนอราคา (ยังไม่ส่งเข้า ZORT) — ให้ทำต่อทีหลังได้ เก็บใน SHEET_QUOTE_DRAFTS
// data = { draftId(ถ้าแก้ร่างเดิม), customer, items, salesRep, remarks, manualDiscount, channel }
function saveQuotationDraft(ss, data, actor) {
  try {
    var sh = ss.getSheetByName(SHEET_QUOTE_DRAFTS);
    if (!sh) {
      sh = ss.insertSheet(SHEET_QUOTE_DRAFTS);
      sh.appendRow(["draftId", "createdAt", "updatedAt", "actor", "customerJSON", "itemsJSON", "salesRep", "remarksJSON", "manualDiscount", "channel"]);
      sh.getRange(1, 1, 1, 10).setFontWeight("bold");
    }
    var draftId = String(data.draftId || "").trim();
    var now = new Date();
    var createdAt = now;
    var existingRowIdx = -1;

    if (draftId) {
      var values = sh.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][0]) === draftId) { createdAt = values[i][1]; existingRowIdx = i + 1; break; }
      }
    }
    if (!draftId) draftId = Utilities.getUuid();

    var row = [
      draftId, createdAt, now, actor || "ไม่ระบุ",
      JSON.stringify(data.customer || {}),
      JSON.stringify(data.items || []),
      String(data.salesRep || ""),
      JSON.stringify(data.remarks || []),
      Number(data.manualDiscount) || 0,
      String(data.channel || ""),
    ];

    if (existingRowIdx > 0) sh.getRange(existingRowIdx, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);

    return ok({ draftId: draftId });
  } catch (e) {
    return error("บันทึกร่างไม่สำเร็จ: " + e);
  }
}

// ลบร่างทิ้ง (ใช้ทั้งจาก action=deleteQuotationDraft และภายในหลังส่งเข้า ZORT สำเร็จ)
function deleteQuotationDraft_(ss, draftId) {
  var sh = ss.getSheetByName(SHEET_QUOTE_DRAFTS);
  if (!sh) return;
  var did = String(draftId || "").trim();
  if (!did) return;
  var values = sh.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === did) { sh.deleteRow(i + 1); break; }
  }
}

function deleteQuotationDraft(ss, draftId, actor) {
  try {
    deleteQuotationDraft_(ss, draftId);
    return ok({ deleted: true });
  } catch (e) {
    return error("ลบร่างไม่สำเร็จ: " + e);
  }
}

// ดึงรายการร่างใบเสนอราคาทั้งหมด (ทุกคนเห็นร่วมกัน เหมือนข้อมูลอื่นในระบบ)
function getQuotationDrafts(ss) {
  try {
    var sh = ss.getSheetByName(SHEET_QUOTE_DRAFTS);
    if (!sh) return ok({ drafts: [] });
    var values = sh.getDataRange().getValues();
    var drafts = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      if (!r[0]) continue;
      var customer = {}, items = [], remarks = [];
      try { customer = JSON.parse(r[4] || "{}"); } catch (e) {}
      try { items = JSON.parse(r[5] || "[]"); } catch (e) {}
      try { remarks = JSON.parse(r[7] || "[]"); } catch (e) {}
      drafts.push({
        draftId: String(r[0]),
        createdAt: r[1] ? new Date(r[1]).toISOString() : "",
        updatedAt: r[2] ? new Date(r[2]).toISOString() : "",
        actor: r[3] || "",
        customer: customer, items: items,
        salesRep: r[6] || "", remarks: remarks,
        manualDiscount: Number(r[8]) || 0,
        channel: r[9] || "",
      });
    }
    drafts.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
    return ok({ drafts: drafts });
  } catch (e) {
    return error("ดึงร่างไม่สำเร็จ: " + e);
  }
}

// ── หา payload EditOrderInfo ที่ ZORT รับจริง (แก้ 500) — ลองหลายรูปแบบบน order POS ล่าสุด ──
// เจ้าของกด Run → copy Logs ส่งกลับ · แก้แค่ชื่อลูกค้าเป็นค่าทดสอบ (ไม่สร้างเอกสาร) — ปลอดภัย
function debugEditOrderInfo() {
  var H = zortHeaders_();
  var HJ = Object.assign({}, H, { "Content-Type": "application/json" });
  function get(path) {
    try { return JSON.parse(UrlFetchApp.fetch(ZORT_BASE + path, { method: "get", headers: H, muteHttpExceptions: true }).getContentText() || "{}"); }
    catch (err) { return {}; }
  }
  function post(path, body) {
    var res = UrlFetchApp.fetch(ZORT_BASE + path, { method: "post", headers: HJ, payload: JSON.stringify(body), muteHttpExceptions: true });
    return { code: res.getResponseCode(), text: (res.getContentText() || "").slice(0, 400) };
  }
  // หา order POS ล่าสุด (Success) → เอา numeric id
  var y = new Date().getFullYear();
  var orders = get("/Order/GetOrders?page=1&limit=10&fromdate=" + y + "-01-01&todate=" + y + "-12-31");
  var olist = orders.list || orders.orders || orders.data || [];
  var target = null;
  for (var i = 0; i < olist.length; i++) {
    if (String(olist[i].saleschannel) === "POS" && String(olist[i].status) === "Success") { target = olist[i]; break; }
  }
  if (!target) target = olist[0];
  if (!target) { Logger.log("⚠️ ไม่พบ order"); return; }
  var oid = target.id || target.orderid;   // numeric id
  Logger.log("🎯 order: number=" + target.number + " numericId=" + oid + " (ปัจจุบัน customername=" + JSON.stringify(target.customername) + ")");

  var stamp = "TEST-" + Utilities.formatDate(new Date(), "Asia/Bangkok", "HHmmss");
  var variants = [
    { label: "V1 id(numeric) + customer* ครบ", body: { id: oid, customername: stamp + "-V1", customeridnumber: "0105535087440", customeraddress: "ที่อยู่ทดสอบ", customerphone: "0000000000", customerbranchname: "สำนักงานใหญ่", customerbranchno: "00000" } },
    { label: "V2 id(numeric) + customername อย่างเดียว", body: { id: oid, customername: stamp + "-V2" } },
    { label: "V3 number(string) + customername", body: { number: target.number, customername: stamp + "-V3" } },
    { label: "V4 id + name/taxid (ชื่อ field แบบสั้น)", body: { id: oid, name: stamp + "-V4", taxid: "0105535087440", address: "ที่อยู่" } },
    { label: "V5 id + contactname/customertaxid", body: { id: oid, contactname: stamp + "-V5", customertaxid: "0105535087440" } },
  ];
  for (var v = 0; v < variants.length; v++) {
    var r = post("/Order/EditOrderInfo", variants[v].body);
    Logger.log("\n▶ [" + variants[v].label + "]\n   payload=" + JSON.stringify(variants[v].body) + "\n   HTTP " + r.code + " resp=" + r.text);
    var back = get("/Order/GetOrderDetail?id=" + encodeURIComponent(oid));
    var bo = back.order || back.data || back;
    Logger.log("   → อ่านกลับ: customername=" + JSON.stringify(bo.customername) + " customeridnumber=" + JSON.stringify(bo.customeridnumber));
  }
  Logger.log("\n═══ เสร็จ — ดูว่า variant ไหน HTTP 200 + 'อ่านกลับ' customername เปลี่ยนตาม TEST-...-Vx ═══");
}

// หมวดที่ยกเว้นกฎส่วนลด — เก็บใน Script Property BILL_EXCLUDE_CATS (comma) แก้ได้ไม่ต้อง deploy
// default = Made to Order/จัดแบบพิเศษ, อุปกรณ์สำนักงาน (ตรงกับ frontend BILL_EXCLUDE_CAT_KEYWORDS)
function readBillExcludeCats_() {
  var raw = PropertiesService.getScriptProperties().getProperty("BILL_EXCLUDE_CATS");
  if (!raw) return ["made to order", "จัดแบบพิเศษ", "อุปกรณ์สำนักงาน"];
  return raw.split(",").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

// สำเนา server-side ของ computeBillTotals (frontend: views-analytics.jsx / tests: helpers.js)
// คิดยอดซ้ำฝั่ง server กันตัวเลขถูกแก้จาก client — ตรรกะต้องตรงกับ 3 ที่นั้น
function computeBillTotalsGs_(items, opts) {
  opts = opts || {};
  var kws = opts.excludeKeywords || ["made to order", "จัดแบบพิเศษ", "อุปกรณ์สำนักงาน"];
  var vatRate = opts.vatRate != null ? opts.vatRate : 0.07;
  function excluded(cat) {
    var c = String(cat || "").toLowerCase();
    return kws.some(function (k) { return c.indexOf(String(k).toLowerCase()) >= 0; });
  }
  function tier(a) {
    if (a >= 1000000) return 0.12;
    if (a >= 500000)  return 0.10;
    if (a >= 100000)  return 0.07;
    if (a >= 50000)   return 0.06;
    if (a >= 10000)   return 0.05;
    return 0;
  }
  var pcs = 0, retEl = 0, retEx = 0;
  (items || []).forEach(function (it) {
    var line = (Number(it.qty) || 0) * (Number(it.price) || 0);
    if (excluded(it.category)) retEx += line;
    else { pcs += (Number(it.qty) || 0); retEl += line; }
  });
  var isWs = pcs >= 6;
  var wsSub = isWs ? retEl * 0.80 : retEl;
  var tRate = isWs ? tier(wsSub) : 0;
  var elFinal = wsSub * (1 - tRate);
  var afterRule = elFinal + retEx;
  var manual = Math.max(0, Number(opts.manualDiscount) || 0);
  var grand = Math.max(0, afterRule - manual);
  return {
    eligiblePieces: pcs, isWholesale: isWs,
    retailEligible: retEl, retailExcluded: retEx,
    wholesaleSubtotal: wsSub, tierRate: tRate, eligibleFinal: elFinal,
    manualDiscount: manual, grandTotal: grand,
    vat: grand * vatRate / (1 + vatRate), preVat: grand - grand * vatRate / (1 + vatRate),
  };
}

// ── สำรวจ field ZORT สำหรับระบบออกบิล (READ-ONLY) — เจ้าของกด Run ยืนยัน field จริง ──
// ไม่สร้าง/แก้ข้อมูลใน ZORT · ดู Logs แล้วปรับ POS_ZORT_FIELDS ให้ตรงถ้าจำเป็น
function exploreZortForBilling() {
  var H = zortHeaders_();
  function get(path) {
    try { return JSON.parse(UrlFetchApp.fetch(ZORT_BASE + path, { method: "get", headers: H, muteHttpExceptions: true }).getContentText() || "{}"); }
    catch (err) { return { _error: String(err) }; }
  }
  function keysOf(o) { return o && typeof o === "object" ? Object.keys(o).join(", ") : "(" + typeof o + ")"; }
  function dump(label, o) { Logger.log("──── " + label + " ────\nkeys: " + keysOf(o) + "\n" + JSON.stringify(o).slice(0, 1500)); }

  var byName = get("/Contact/GetContacts?keyword=" + encodeURIComponent("บริษัท") + "&page=1&limit=3");
  dump("GetContacts (keyword=ชื่อ)", byName);
  var list = byName.list || byName.contacts || byName.data || [];
  if (list[0]) {
    Logger.log(">> contact[0] keys: " + keysOf(list[0]) + "\n>> full: " + JSON.stringify(list[0]));
    var cid = list[0].id || list[0].contactid || list[0].customerid;
    if (cid != null) dump("GetContactDetail id=" + cid, get("/Contact/GetContactDetail?id=" + cid));
  }
  dump("GetContacts (keyword=เลขภาษี)", get("/Contact/GetContacts?keyword=0105&page=1&limit=3"));
  var orders = get("/Order/GetOrders?page=1&limit=3");
  var olist = orders.list || orders.orders || orders.data || [];
  if (olist[0]) {
    var oid = olist[0].id || olist[0].orderid;
    Logger.log(">> order[0] keys: " + keysOf(olist[0]));
    if (oid != null) dump("GetOrderDetail id=" + oid + " (ดู field customer/taxid/branch)", get("/Order/GetOrderDetail?id=" + oid));
  }
  dump("GetMerchantProfile", get("/Merchant/GetMerchantProfile"));
  dump("GetPaymentMethods", get("/Merchant/GetPaymentMethods"));
  Logger.log("═══ เสร็จ — ปรับ POS_ZORT_FIELDS ให้ตรง field จริงถ้าจำเป็น ═══");
}

// ── วินิจฉัยเจาะจง: order ล่าสุดที่เราสร้าง ราคาต่อหน่วยเก็บใน field ชื่ออะไร + status ค่าอะไร ──
// (READ-ONLY) เจ้าของกด Run 1 ครั้ง → เปิด Executions → copy Logs ทั้งหมดส่งกลับมา
// ใช้ไล่ปัญหา "ยอด 0 / สถานะรอส่งสินค้า" — ดู field จริงจาก ZORT ไม่ต้องเดา
function debugPosOrderLineFields() {
  var H = zortHeaders_();
  function get(path) {
    try { return JSON.parse(UrlFetchApp.fetch(ZORT_BASE + path, { method: "get", headers: H, muteHttpExceptions: true }).getContentText() || "{}"); }
    catch (err) { return { _error: String(err) }; }
  }
  // ดึงบิลล่าสุดในช่วงปีนี้ (GetOrders คืนใหม่สุดก่อน)
  var y = new Date().getFullYear();
  var orders = get("/Order/GetOrders?page=1&limit=3&fromdate=" + y + "-01-01&todate=" + y + "-12-31");
  var olist = orders.list || orders.orders || orders.data || [];
  Logger.log("จำนวน order ที่ดึงได้: " + olist.length);
  if (!olist.length) { Logger.log("⚠️ ไม่พบ order เลย — ตรวจ credential/ช่วงวันที่"); return; }

  for (var n = 0; n < Math.min(2, olist.length); n++) {
    var o = olist[n];
    Logger.log("\n═══════════ ORDER #" + (n + 1) + " ═══════════");
    Logger.log(">> order keys: " + Object.keys(o).join(", "));
    // field ระดับ order ที่เกี่ยวกับสถานะ/ยอด
    ["number", "ordernumber", "status", "orderstatus", "statustext", "amount", "totalamount", "grandtotal", "netamount"].forEach(function (k) {
      if (o[k] !== undefined) Logger.log("   order." + k + " = " + JSON.stringify(o[k]));
    });
    var oid = o.id || o.orderid;
    var detail = get("/Order/GetOrderDetail?id=" + encodeURIComponent(oid));
    var d = detail.order || detail.data || detail;
    Logger.log(">> detail keys: " + Object.keys(d).join(", "));
    ["number", "status", "orderstatus", "statustext", "amount", "totalamount", "grandtotal"].forEach(function (k) {
      if (d[k] !== undefined) Logger.log("   detail." + k + " = " + JSON.stringify(d[k]));
    });
    var items = d.list || d.items || d.orderlist || d.products || [];
    Logger.log(">> line items: " + items.length + " รายการ");
    if (items[0]) {
      Logger.log(">> item[0] keys: " + Object.keys(items[0]).join(", "));
      Logger.log(">> item[0] FULL: " + JSON.stringify(items[0]));
    }
  }
  Logger.log("\n═══ เสร็จ — ดู 'item[0] FULL' หา field ที่เก็บราคาต่อหน่วย + 'order.status' หาค่าสถานะจริง ═══");
}

// ── dump 10 บิลล่าสุด แยกแยะ POS vs MTO vs manual + สถานะ/ยอด/เวลา (READ-ONLY) ──
// เจ้าของกด Run → copy Logs ส่งกลับ · ใช้ระบุว่าบิลไหนคือ POS ที่ยอด/สถานะเพี้ยน
function debugListRecentOrders() {
  var H = zortHeaders_();
  function get(path) {
    try { return JSON.parse(UrlFetchApp.fetch(ZORT_BASE + path, { method: "get", headers: H, muteHttpExceptions: true }).getContentText() || "{}"); }
    catch (err) { return { _error: String(err) }; }
  }
  var y = new Date().getFullYear();
  var orders = get("/Order/GetOrders?page=1&limit=10&fromdate=" + y + "-01-01&todate=" + y + "-12-31");
  var olist = orders.list || orders.orders || orders.data || [];
  Logger.log("═══ " + olist.length + " บิลล่าสุด (ใหม่→เก่า) ═══\n");
  for (var i = 0; i < olist.length; i++) {
    var o = olist[i];
    var firstItem = (o.list && o.list[0]) || {};
    Logger.log(
      "#" + (i + 1) + "  " + o.number +
      "\n   status=" + o.status + "  amount=" + o.amount + "  ordertype=" + o.ordertype +
      "\n   saleschannel=" + JSON.stringify(o.saleschannel) + "  customername=" + JSON.stringify(o.customername) +
      "\n   warehousecode=" + JSON.stringify(o.warehousecode) + "  createusername=" + JSON.stringify(o.createusername) +
      "\n   description(remark)=" + JSON.stringify(o.description) +
      "\n   created=" + o.createdatetimeString +
      "\n   line[0]: sku=" + (firstItem.sku || "-") + " pricepernumber=" + firstItem.pricepernumber + " totalprice=" + firstItem.totalprice + " (" + ((o.list || []).length) + " รายการ)\n"
    );
  }
  Logger.log("═══ เสร็จ — ดู saleschannel/customername/created เพื่อระบุบิล POS ที่ยอดเพี้ยน ═══");
}

// บันทึกวัตถุดิบ MTO โดยไม่ปิดงาน — ลบแถว draft เก่าแล้วเขียนใหม่ (closedAt ว่าง = draft)
function saveMtoJobItems(ss, data) {
  const jobId = String(data.jobId || "").trim();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!jobId) return error("ไม่มี jobId");

  const itemSh = getOrCreateMtoItemSheet_(ss);
  if (!itemSh) return error("ไม่พบชีต วัตถุดิบ MTO");

  // ลบแถว draft (closedAt ว่าง) ของ job นี้ออกก่อน
  const rows = itemSh.getDataRange().getValues();
  const toDelete = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]).trim() === jobId && !String(rows[i][7] || "").trim()) {
      toDelete.push(i + 1); // 1-indexed, เรียงจากล่างขึ้นบน
    }
  }
  toDelete.forEach(r => itemSh.deleteRow(r));

  // เขียน items ใหม่ (ไม่มี closedAt = ยังไม่ปิด)
  items.forEach(item => {
    const qty = Number(item.qty) || 0;
    const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
    const hasNewFmt = item.qtyWH != null || item.qtyFS != null;
    const deductWH = hasNewFmt ? (Number(item.qtyWH) || 0) : (item.warehouse !== "frontstore" ? qty - ret : 0);
    const deductFS = hasNewFmt ? (Number(item.qtyFS) || 0) : (item.warehouse === "frontstore" ? qty - ret : 0);
    const whLabel = hasNewFmt ? ("คลัง:" + deductWH + "/ร้าน:" + deductFS) : (item.warehouse || "warehouse");
    itemSh.appendRow([jobId, item.sku || "", item.name || "", qty, whLabel, ret, deductWH + deductFS, ""]);
  });

  SpreadsheetApp.flush();
  invalidateCache_();
  return ok({ saved: items.length });
}

function deleteMtoJob(ss, data) {
  const jobId = String(data.jobId || "").trim();
  const actor = data.actor || "ไม่ระบุ";
  const sh = ss.getSheetByName(SHEET_MTO_JOBS);
  if (!sh) return error("ไม่พบชีต งาน MTO");
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === jobId) {
      // 1) อ่าน before-state ก่อนลบ (A..H: jobId,date,jobName,customer,price,image,status,closedAt)
      const before = {
        jobName: rows[i][2] || "", customer: rows[i][3] || "",
        price: rows[i][4] || "", status: rows[i][6] || "",
      };
      // 2) ลบจริง — GAS deleteRow() เป็น synchronous, throw ถ้าล้มเหลว
      sh.deleteRow(i + 1);
      // 3) ถึงจุดนี้ = ลบสำเร็จ → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น (เจองาน+ลบแล้วเท่านั้น)
      writeAuditLog_(actor, "ลบงาน MTO", jobId, auditDetail_({ before: before, after: null, note: "ลบงาน MTO (" + (before.jobName || jobId) + ")" }));
      invalidateCache_(); // P0-4: bump dmj_last_write_ts ให้ conflict detection มองเห็น write นี้
      break;
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, deleted: jobId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function readMtoJobs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const jobSh = ss.getSheetByName(SHEET_MTO_JOBS);
  const itemSh = ss.getSheetByName(SHEET_MTO_ITEMS);
  if (!jobSh) return [];

  const jobRows = jobSh.getDataRange().getValues();
  const itemRows = itemSh ? itemSh.getDataRange().getValues() : [];

  // Build items map by jobId
  const itemsMap = {};
  for (let i = 0; i < itemRows.length; i++) {
    const r = itemRows[i];
    const jid = String(r[0]||"").trim();
    if (!jid || (!jid.startsWith("MTO_") && !jid.startsWith("MTO-"))) continue; // ข้าม header/แถวว่าง
    if (!itemsMap[jid]) itemsMap[jid] = [];
    // F (r[5]) = จำนวนคืน (เลข) — รองรับข้อมูลเก่าที่เป็นข้อความ "คืนแล้ว"/"ไม่คืน"
    const qty = Number(r[3])||0;
    const fRaw = r[5];
    let returnedQty = 0;
    if (typeof fRaw === "number") returnedQty = fRaw;
    else if (String(fRaw||"").trim() === "คืนแล้ว") returnedQty = qty; // ข้อมูลเก่า: คืนทั้งหมด
    returnedQty = Math.max(0, Math.min(returnedQty, qty));
    // closedAt อยู่ col H (r[7]) ในสคีมาใหม่, ข้อมูลเก่าอยู่ col G (r[6])
    const closedAt = String(r[7]||r[6]||"").trim();
    itemsMap[jid].push({
      sku: String(r[1]||"").trim(),
      name: String(r[2]||"").trim(),
      qty,
      warehouse: String(r[4]||"warehouse").trim(),
      returnedQty,
      net: qty - returnedQty,
      closedAt,
    });
  }

  const jobs = [];
  for (let i = 0; i < jobRows.length; i++) {
    const r = jobRows[i];
    const jobId = String(r[0]||"").trim();
    if (!jobId || (!jobId.startsWith("MTO_") && !jobId.startsWith("MTO-"))) continue; // ข้าม header/แถวว่าง
    jobs.push({
      jobId,
      date: String(r[1]||"").trim(),
      jobName: String(r[2]||"").trim(),
      customer: String(r[3]||"").trim(),
      price: Number(r[4])||0,
      imageUrl: String(r[5]||"").trim(),
      status: String(r[6]||"กำลังจัด").trim(),
      closedAt: String(r[7]||"").trim(),
      assigneeId: String(r[8]||"").trim(),
      assigneeName: String(r[9]||"").trim(),
      items: itemsMap[jobId] || [],
    });
  }
  return jobs.reverse(); // newest first
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 จัดการแชทบอท')
    .addItem('🔄 อัปเดตข้อมูลให้บอท (ล้าง Cache)', 'manualClearCache')
    .addToUi();
}

function manualClearCache() {
  const cache = CacheService.getScriptCache();
  const total = cache.get(`${CACHE_KEY}_total`);
  if (total) {
    for (let i = 0; i < parseInt(total); i++) cache.remove(`${CACHE_KEY}_chunk_${i}`);
    cache.remove(`${CACHE_KEY}_total`);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast("บอทพร้อมตอบข้อมูลล่าสุดแล้ว", "✅ อัปเดต Cache สำเร็จ", 5);
}

// ─── Stock Check Requests ───────────────────────────────────────────────────

const SHEET_STOCK_CHECK = "คำขอเช็คสินค้า";

function getOrCreateStockCheckSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_STOCK_CHECK);
  if (!sh) {
    sh = ss.insertSheet(SHEET_STOCK_CHECK);
    sh.appendRow(["reqId","timestamp","requester","skuList","nameList","status","completedBy","completedAt"]);
  }
  return sh;
}

function readStockCheckRequests_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_STOCK_CHECK);
  if (!sh) return [];
  var rows = sh.getDataRange().getValues();
  if (rows.length < 2) return [];
  return rows.slice(1).map(function(r) {
    return {
      reqId:       String(r[0] || ""),
      timestamp:   String(r[1] || ""),
      requester:   String(r[2] || ""),
      skus:        JSON.parse(r[3] || "[]"),
      names:       JSON.parse(r[4] || "[]"),
      status:      String(r[5] || "pending"),
      completedBy: String(r[6] || ""),
      completedAt: String(r[7] || ""),
    };
  }).filter(function(r){ return r.reqId; });
}

function createStockCheckRequest_(skus, names, actor) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = getOrCreateStockCheckSheet_(ss);
  var rows = sh.getDataRange().getValues();
  var seq = rows.length; // row 1 = header, seq = # of data rows after append
  var reqId = "CHK-" + String(seq).padStart(3, "0");
  var ts = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm");
  sh.appendRow([reqId, ts, actor || "owner", JSON.stringify(skus || []), JSON.stringify(names || []), "pending", "", ""]);
  // skipTsUpdate=true — คำขอเช็คสต็อกไม่เปลี่ยน "จำนวนสินค้า" จึงห้าม bump dmj_last_write_ts
  // มิฉะนั้น client ที่โหลดข้อมูลไว้ก่อนจะถูกมองว่า conflict → กดส่งของไม่ได้
  invalidateCache_(true);
  // แจ้งเตือน LINE group — wrap try-catch เพื่อไม่ให้ LINE error พัง endpoint
  try {
    var nameList = names || [];
    var preview = nameList.slice(0, 3).join(", ");
    if (nameList.length > 3) preview += " และอีก " + (nameList.length - 3) + " รายการ";
    var lineMsg = "📋 มีคำขอเช็คสต็อก " + nameList.length + " รายการ\nรายการ: " + preview;
    sendLineGroup_(lineMsg);
  } catch(e) {
    // LINE notification ล้มเหลว — ไม่ block response
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, reqId: reqId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function completeStockCheckRequest_(reqId, actor) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName(SHEET_STOCK_CHECK);
  if (!sh) return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Sheet not found" }))
    .setMimeType(ContentService.MimeType.JSON);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(reqId)) {
      var ts = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HH:mm");
      sh.getRange(i + 1, 6).setValue("done");
      sh.getRange(i + 1, 7).setValue(actor || "");
      sh.getRange(i + 1, 8).setValue(ts);
      // skipTsUpdate=true — ปิดคำขอเช็คไม่เปลี่ยนจำนวนสินค้า จึงไม่ poison conflict timestamp
      invalidateCache_(true);
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: "reqId not found" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION: สำรองข้อมูลขึ้น Supabase (backup ทางเดียว — เว็บหลักไม่พึ่ง Supabase)
// ═══════════════════════════════════════════════════════════════════════════
//
// จุดประสงค์: มีสำเนาข้อมูลอิสระนอก Google Sheets/ZORT ไว้ 2 อย่าง
//   1) daily_snapshots — เก็บ payload เต็ม (เหมือนที่เว็บได้รับ) เป็น JSONB 1 แถว/วัน
//      = ตัว restore จริง (กู้ข้อมูลย้อนหลังได้ทุกวันที่สำรองไว้)
//   2) ตารางแยก products/orders/shipments/transfers/purchases/storage (replace-all ทุกครั้ง)
//      = query ด้วย SQL ได้ + เป็น schema ตั้งต้นถ้าวันหน้าอยากทำ DB ของตัวเอง (เลิกพึ่ง ZORT)
//
// สถาปัตยกรรม: ส่ง payload ทั้งก้อนไปที่ Postgres function `refresh_backup` ครั้งเดียว
//   (PostgREST RPC) → ฝั่ง DB จัดการ upsert snapshot + truncate/insert ตารางแยกใน transaction
//   เดียว (atomic) ไม่ต้องยิงหลาย request ให้ข้อมูลไม่สอดคล้องกัน
//
// ความปลอดภัย: service key เก็บใน Script Property `SUPABASE_SERVICE_KEY` เท่านั้น (ไม่ลงโค้ด)
// SAFE ROLLOUT: gate ด้วย `SUPABASE_BACKUP_ENABLED='true'` + ยังไม่ตั้ง URL/key → เป็น no-op
//   ทั้งฟังก์ชันห่อ try/catch ไม่มีทาง throw ออกไปกระทบส่วนอื่นของระบบ
//
// เจ้าของต้องทำเองใน GAS editor 1 ครั้ง (clasp push ไม่รันให้):
//   1. ตั้ง Script Properties: SUPABASE_URL (เช่น https://xxxx.supabase.co — ห้ามมี /rest/v1 ต่อท้าย)
//      + SUPABASE_SERVICE_KEY = คีย์ service_role แบบ legacy (ขึ้นต้น eyJ...)
//        จาก Supabase → Project Settings → API Keys → แท็บ "Legacy API keys"
//        ⚠️ ห้ามใช้ secret key รุ่นใหม่ (sb_secret_...) — Supabase บล็อกเมื่อ User-Agent
//        ดูเหมือน browser ซึ่ง UrlFetchApp ของ GAS ส่ง Mozilla/5.0 และแก้ไม่ได้
//        → จะเจอ 401 "Forbidden use of secret API key in browser" เสมอ
//   2. รัน `setupSupabaseBackup()` 1 ครั้ง (ตั้ง trigger รายวัน 03:00 + เปิด flag)
//   3. รัน `runSupabaseBackupNow()` เพื่อทดสอบสำรองทันที + ดู Log
//   rollback: รัน `disableSupabaseBackup()` (ลบ trigger + ปิด flag)

function supabaseCfg_() {
  const p = PropertiesService.getScriptProperties();
  return {
    url:     (p.getProperty('SUPABASE_URL') || '').replace(/\/+$/, ''),
    key:     p.getProperty('SUPABASE_SERVICE_KEY') || '',
    enabled: String(p.getProperty('SUPABASE_BACKUP_ENABLED') || '').toLowerCase() === 'true',
  };
}

// เรียก Postgres function ผ่าน PostgREST RPC endpoint
function supabaseRpc_(fnName, body, cfg) {
  cfg = cfg || supabaseCfg_();
  const res = UrlFetchApp.fetch(cfg.url + '/rest/v1/rpc/' + fnName, {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  return { code: res.getResponseCode(), body: res.getContentText() };
}

// สำรองข้อมูลปัจจุบันขึ้น Supabase — ปลอดภัย (no-op ถ้ายังไม่ตั้งค่า/ปิดอยู่), ไม่ throw
function backupToSupabase_() {
  try {
    const cfg = supabaseCfg_();
    if (!cfg.url || !cfg.key) {
      Logger.log('[supabaseBackup] ข้าม: ยังไม่ตั้ง SUPABASE_URL / SUPABASE_SERVICE_KEY');
      return { skipped: true, reason: 'not_configured' };
    }
    if (!cfg.enabled) {
      Logger.log('[supabaseBackup] ข้าม: SUPABASE_BACKUP_ENABLED != true (รัน setupSupabaseBackup() เพื่อเปิด)');
      return { skipped: true, reason: 'disabled' };
    }
    const data = buildFullData_(); // ชุดข้อมูลเดียวกับที่เว็บได้รับเป๊ะ
    const snapshotDate = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    const resp = supabaseRpc_('refresh_backup', {
      p_payload: data,
      p_snapshot_date: snapshotDate,
      p_source: 'gas',
    }, cfg);
    if (resp.code >= 200 && resp.code < 300) {
      Logger.log('[supabaseBackup] สำเร็จ ' + snapshotDate + ' → ' + resp.body);
      return { ok: true, snapshotDate: snapshotDate, result: resp.body };
    }
    Logger.log('[supabaseBackup] ล้มเหลว code=' + resp.code + ' body=' + resp.body);
    return { ok: false, code: resp.code, body: resp.body };
  } catch (e) {
    Logger.log('[supabaseBackup] ERROR ' + e);
    return { ok: false, error: String(e) };
  }
}

// ── ฟังก์ชันที่เจ้าของรันเอง / trigger เรียก (ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown GAS editor) ──

// trigger รายวันเรียกตัวนี้
function backupDailyToSupabase() {
  return backupToSupabase_();
}

// รันทดสอบสำรองทันที (ดูผลใน Log)
function runSupabaseBackupNow() {
  const r = backupToSupabase_();
  Logger.log('runSupabaseBackupNow → ' + JSON.stringify(r));
  return r;
}

// ตั้งค่าเปิดใช้งาน: ตั้ง trigger รายวัน 03:00 + เปิด flag (รัน 1 ครั้งหลังตั้ง URL/key)
function setupSupabaseBackup() {
  const cfg = supabaseCfg_();
  if (!cfg.url || !cfg.key) {
    throw new Error('ตั้ง Script Property SUPABASE_URL และ SUPABASE_SERVICE_KEY ก่อน แล้วค่อยรัน setupSupabaseBackup()');
  }
  // ลบ trigger เดิมกัน duplicate
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDailyToSupabase') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupDailyToSupabase').timeBased().everyDays(1).atHour(3).create();
  PropertiesService.getScriptProperties().setProperty('SUPABASE_BACKUP_ENABLED', 'true');
  Logger.log('ตั้ง trigger สำรอง Supabase รายวัน ~03:00 + เปิด SUPABASE_BACKUP_ENABLED=true แล้ว');
  return { ok: true };
}

// ปิดใช้งาน (rollback): ลบ trigger + ปิด flag
function disableSupabaseBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupDailyToSupabase') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().setProperty('SUPABASE_BACKUP_ENABLED', 'false');
  Logger.log('ปิดการสำรอง Supabase (ลบ trigger + SUPABASE_BACKUP_ENABLED=false) แล้ว');
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
// SECTION: เครื่องมือวัดผล Phase 0 (docs/PLAN-PERF-LOGIN-MULTIUSER.md)
// ═══════════════════════════════════════════════════════════
// ทั้งสองฟังก์ชันในส่วนนี้ **อ่านอย่างเดียว** — ไม่เขียนชีต ไม่เขียน cache ไม่ยิง ZORT/LINE
// ตั้งชื่อไม่มี `_` ต่อท้ายโดยตั้งใจ เพื่อให้โผล่ใน dropdown ของ GAS editor (บทเรียนข้อ 1)

// 1 บรรทัดต่อ 1 request ของเส้นทาง payload — ใช้ดูใน Executions log ว่ารอบไหน hit/miss
// และแต่ละแบบใช้เวลาเท่าไหร่จริง · **ห้าม throw** (เป็นบรรทัดสุดท้ายก่อนตอบผู้ใช้
// — log พลาดต้องไม่ทำให้ทั้ง request ล้ม หลักเดียวกับ appendSaleBillRow_/pushInappNoti_)
// ต้นทุนต่อรอบ = Date.now() + Logger.log เท่านั้น ไม่มีการอ่าน Property/ชีตเพิ่ม
// (จงใจไม่ใส่สวิตช์เปิด-ปิดผ่าน Script Property เพราะการอ่าน Property ทุก request
//  แพงกว่าตัว log ที่พยายามจะปิดเสียอีก) · เอาออกได้เมื่อจบ Phase 0 ถ้ารกเกินไป
function perfLogDoGet_(kind, variant, tStart, bytes, extra) {
  try {
    Logger.log('[perf] doGet ' + kind + ' variant=' + variant
      + ' รวม=' + (Date.now() - tStart) + 'ms'
      + ' ส่ง=' + Math.round((bytes || 0) / 1024) + 'KB'
      + (extra || ''));
  } catch (e) {}
}

// ตารางอ้างอิง: trigger แต่ละตัวถูกตั้งด้วยความถี่เท่าไหร่ (จาก setup function ในไฟล์นี้)
// จำเป็นต้อง hard-code เพราะ **GAS ไม่มี API ให้อ่านความถี่ของ clock trigger กลับมา**
// (`ScriptApp.getProjectTriggers()` บอกได้แค่ชื่อ handler กับชนิด) — ตัวไหนไม่อยู่ในตารางนี้
// จะถูกรายงานว่า "ไม่รู้จัก" ให้ไปตรวจเอง ดีกว่าเดาแล้วรายงานเลขผิด
const PERF_TRIGGER_SCHEDULE_ = {
  drainNotiQueue:          { every: 'ทุก 1 นาที',        perDay: 1440, setup: 'setupNotiSystem()' },
  backfillZortOrders:      { every: 'ทุก 5 นาที',        perDay: 288,  setup: 'startBackfill()' },
  syncZortBoth:            { every: 'ทุก 2 ชม.',          perDay: 12,   setup: 'setupZortStockTrigger()' },
  syncZortSales:           { every: 'ทุก 2 ชม.',          perDay: 12,   setup: 'setupZortSalesTrigger()' },
  sendPendingTruckOrders:  { every: 'วันละ 2 รอบ 08/13น.', perDay: 1,   setup: 'setupOrderReminders()' },
  dailyAttendanceMaintenance: { every: 'ทุกวัน 22:00',    perDay: 1,    setup: 'setupAttendanceMaintenance()' },
  archiveReceivedShipments:{ every: 'ทุกวัน 03:00',       perDay: 1,    setup: 'setupShipmentArchiveTrigger()' },
  backupDailyToSupabase:   { every: 'ทุกวัน 03:00',       perDay: 1,    setup: 'setupSupabaseBackup()' },
  sendWeeklySummary:       { every: 'จันทร์ 08:00',       perDay: 0.14, setup: 'setupNotiSystem()' },
  sendMonthlySummary:      { every: 'วันที่ 1 08:00',      perDay: 0.03, setup: 'setupNotiSystem()' },
  syncZortImages:          { every: 'จันทร์ 05:00',       perDay: 0.14, setup: 'setupZortImageTrigger()' },
  syncZortPurchases:       { every: 'จันทร์ 06:00',       perDay: 0.14, setup: 'setupZortPurchasesTrigger()' },
  sweepEmptyShelfLocations:{ every: 'จันทร์ 05:00',       perDay: 0.14, setup: 'setupShelfSweepTrigger()' },
  rebuildSalesFromRaw:     { every: 'ครั้งเดียว (after)',  perDay: 0,    setup: 'ตั้งเองจาก backfillZortOrders' },
};

// Script Property ที่ปลอดภัยจะพิมพ์ออก log — **allowlist เท่านั้น**
// ห้ามเปลี่ยนเป็น "พิมพ์ทุกคีย์แล้วกรองความลับออก" เด็ดขาด: คีย์ใหม่ที่เป็นความลับ
// จะหลุดออก log ทันทีโดยไม่มีใครรู้ (SHEET_ID/OWNER_PIN/APP_TOKEN/ZORT_*/LINE_* อยู่ที่เดียวกัน)
const PERF_SAFE_PROPS_ = [
  'REQUIRE_LOGIN', 'NOTI_QUEUE_ENABLED', 'INAPP_NOTI_ENABLED', 'PRODUCT_OWNER_ENABLED',
  'SUPABASE_BACKUP_ENABLED', 'NOTI_ORDER_CUTOFF_HOUR', 'NOTI_ORDER_BATCH_MINUTES',
  'NOTI_ORDER_BATCH_MAX', 'NOTI_MONTHLY_CAP', 'NOTI_MAX_SENDS_PER_RUN',
  'WHOLESALE_RATIO', 'STOCK_THRESHOLDS', 'backfill_done', 'dmj_last_write_ts',
];

/**
 * Phase 0 — ตรวจว่ามี trigger อะไรติดตั้งอยู่จริง กินโควตาเท่าไหร่ และมีตัวที่ควรลบค้างอยู่ไหม
 * รันจาก GAS editor: เลือก `perfCheckTriggers` → Run → ดูผลที่ Execution log
 * อ่านอย่างเดียว ไม่แก้อะไรทั้งสิ้น
 */
function perfCheckTriggers() {
  const props = PropertiesService.getScriptProperties();
  const triggers = ScriptApp.getProjectTriggers();
  const counts = {};
  triggers.forEach(function (t) {
    const fn = t.getHandlerFunction();
    counts[fn] = (counts[fn] || 0) + 1;
  });

  const lines = [];
  const warn = [];
  let perDayTotal = 0;

  lines.push('══ trigger ที่ติดตั้งอยู่จริง (' + triggers.length + ' ตัว) ══');
  Object.keys(counts).sort().forEach(function (fn) {
    const n = counts[fn];
    const meta = PERF_TRIGGER_SCHEDULE_[fn];
    if (!meta) {
      lines.push('  ❓ ' + fn + ' ×' + n + ' — ไม่รู้จักความถี่ (ไม่ได้ตั้งจาก setup ในไฟล์นี้?)');
      warn.push('มี trigger ที่ไม่รู้จัก: ' + fn + ' — เปิด Triggers ในเมนูซ้ายของ GAS editor ดูความถี่เอง');
      return;
    }
    const perDay = meta.perDay * n;
    perDayTotal += perDay;
    lines.push('  • ' + fn + ' ×' + n + ' — ' + meta.every + ' ≈ ' + perDay + ' ครั้ง/วัน');
    if (n > 1 && meta.perDay > 0 && fn !== 'sendPendingTruckOrders') {
      warn.push('⚠️ ' + fn + ' ติดตั้งซ้ำ ' + n + ' ตัว — รัน ' + n + ' เท่าโดยไม่ได้ตั้งใจ '
        + '(รัน ' + meta.setup + ' ใหม่ 1 ครั้ง จะลบตัวซ้ำให้เอง)');
    }
  });
  lines.push('  รวม ≈ ' + Math.round(perDayTotal) + ' ครั้ง/วัน');

  // ── ตัวที่แผน Phase 0 ระบุให้ตรวจเป็นพิเศษ ──
  const backfillDone = props.getProperty('backfill_done') === '1';
  if (counts.backfillZortOrders && backfillDone) {
    warn.push('⚠️ `backfillZortOrders` ยังวิ่งอยู่ทั้งที่ backfill_done=1 แล้ว (288 ครั้ง/วันฟรี ๆ) '
      + '— รัน `stopBackfill()` หรือปล่อยให้มันลบตัวเองรอบถัดไป');
  }
  if (counts.drainNotiQueue) {
    warn.push('ℹ️ `drainNotiQueue` = ' + (counts.drainNotiQueue * 1440) + ' ครั้ง/วัน และ**จับล็อกกลาง**ทุกครั้ง '
      + '(Phase 1.1) — ถ้าเวลารวม trigger ใกล้เต็ม 90 นาที/วัน ให้ลดเหลือทุก 5 นาทีก่อน');
  }
  if (counts.syncZortBoth || counts.syncZortSales) {
    warn.push('ℹ️ `syncZortBoth`/`syncZortSales` ล้าง cache ทั้งร้านทุก 2 ชม. (Phase 4.1) '
      + '— ตกกลางเวลาทำงานแน่นอน');
  }

  // ── สถานะระบบ (เฉพาะคีย์ใน allowlist) ──
  lines.push('');
  lines.push('══ Script Properties (เฉพาะที่ไม่ใช่ความลับ) ══');
  PERF_SAFE_PROPS_.forEach(function (k) {
    let v = props.getProperty(k);
    if (v == null) { lines.push('  ' + k + ' = (ไม่ได้ตั้ง → ใช้ค่า default)'); return; }
    if (k === 'dmj_last_write_ts') {
      const ms = parseInt(v, 10);
      v = v + '  (' + (ms > 0 ? Utilities.formatDate(new Date(ms), 'Asia/Bangkok', 'dd/MM HH:mm:ss') : '?') + ')';
    }
    if (v.length > 120) v = v.slice(0, 120) + '…';
    lines.push('  ' + k + ' = ' + v);
  });

  // ── โควตาแจ้งเตือน LINE เดือนนี้ (input ของ notiOrderBatchWindowMin_) ──
  const ym = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMM');
  lines.push('');
  lines.push('══ โควตา LINE เดือน ' + ym + ' ══');
  ['primary', 'secondary'].forEach(function (ch) {
    const used = props.getProperty('NOTI_SENT_' + ch + '_' + ym);
    lines.push('  ' + ch + ' = ' + (used || 0) + ' ข้อความ');
  });

  if (warn.length) {
    lines.push('');
    lines.push('══ ข้อที่ควรดู ══');
    warn.forEach(function (w) { lines.push('  ' + w); });
  }

  lines.push('');
  lines.push('ต่อไป: เปิดเมนูซ้าย → Executions ดู "จำนวน/เวลา/error ต่อชั่วโมง" ช่วงคนใช้เยอะสุด');
  lines.push('แล้วรัน `perfMeasureBuild()` เพื่อได้เวลา build จริง');

  const out = lines.join('\n');
  Logger.log(out);
  return out;
}

/**
 * Phase 0 — วัดว่า "สร้าง payload หนึ่งรอบ" ใช้เวลาเท่าไหร่ และเวลาไปอยู่ขั้นไหน
 * รันจาก GAS editor: เลือก `perfMeasureBuild` → Run → ดู Execution log
 *
 * ต่างจากการรอ cache miss เกิดเอง: สั่งวัดได้ทันทีเมื่ออยากรู้ · **ไม่เขียน cache**
 * (จึงไม่ไปอุ่น cache ให้ใครหรือทำให้ตัวเลขรอบหน้าเพี้ยน) และ **ไม่เขียนชีต**
 *
 * ตัวเลขที่ได้ตอบคำถาม Phase 0 ข้อ "build ครั้งหนึ่งกี่วินาที + เวลาไปอยู่ขั้นไหน"
 * และเป็นตัวตัดสิน Phase 4 โดยตรง (ดูตารางในแผน: enrich หนัก → แยก cache 2 ชั้นคุ้ม ·
 * batchGet หนัก → แยกชั้นช่วยน้อย · รวมต่ำกว่า 2-3 วิ → ข้าม Phase 4 ไปเลย)
 */
function perfMeasureBuild() {
  const t0 = Date.now();
  const data = buildFullData_();          // ตัวมันเองพิมพ์ [perf] buildFullData_ … ให้อยู่แล้ว
  const tBuild = Date.now() - t0;

  // ขั้นตอนหลัง build ที่ **เดิมไม่เคยถูกวัด** — doGet stringify ทุก variant แล้วเขียน cache
  // ต่อจากนี้ ถ้าก้อนนี้กินหลายวินาที การไปเร่ง buildFullData_ อย่างเดียวจะไม่ช่วยอะไรเลย
  const perVariant = [];
  let tShapeTotal = 0;
  PAYLOAD_VARIANTS_.forEach(function (v) {
    const t1 = Date.now();
    const s = JSON.stringify(shapePayloadForVariant_(data, v));
    const ms = Date.now() - t1;
    tShapeTotal += ms;
    perVariant.push(v + '=' + Math.round(s.length / 1024) + 'KB/' + ms + 'ms/'
      + Math.ceil(s.length / _CACHE_CHUNK_LEN) + 'chunk');
  });

  const lines = [
    '══ Phase 0: วัดเวลาสร้าง payload ══',
    'buildFullData_        = ' + tBuild + ' ms   (รายละเอียดต่อขั้นอยู่ในบรรทัด [perf] ด้านบน)',
    'stringify ทุก variant = ' + tShapeTotal + ' ms   ' + perVariant.join(' · '),
    'รวมที่ผู้ใช้คนแรกต้องรอ ≈ ' + (tBuild + tShapeTotal) + ' ms (ยังไม่รวมเวลาเขียน cache/ส่งข้อมูล)',
    '',
    'ตัดสิน Phase 4 จากตัวเลขนี้:',
    '  • รวม < 2,000 ms  → ข้าม Phase 4 ไปเลย ไปลงแรง Phase 1-3 คุ้มกว่า',
    '  • enrich/index หนักสุด → แยก cache 2 ชั้นได้ผลเต็ม',
    '  • batchGet หนักสุด    → แยกชั้นช่วยน้อย ควรลดจำนวน/ขนาดชีตที่อ่านแทน',
    '  • stringify หนักสุด   → ปัญหาอยู่ที่ "payload ใหญ่" → ไป 7.4(ข) ลด payload ก่อน',
  ];
  const out = lines.join('\n');
  Logger.log(out);
  return out;
}
