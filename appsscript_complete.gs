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
const SHEET_MTO_ITEMS      = "วัตถุดิบ MTO";    // วัตถุดิบสำหรับงาน MTO
const SHEET_CUST_MONTHLY   = "สรุปลูกค้า-เดือน";  // ยอดซื้อลูกค้า แยกตามเดือน (customer×month)
const SHEET_CUST_PRODUCTS  = "สรุปลูกค้า-สินค้า"; // สินค้าที่ลูกค้าแต่ละรายซื้อบ่อย (top-N/ลูกค้า)
const SHEET_QUOTE_SALE     = "เซลใบเสนอราคา";    // mapping เลขที่ QT → ชื่อเซลที่ทำใบ (assign ใน dashboard)
const SHEET_UNSCANNED_SALE = "ขายไม่สแกน";        // นับสต็อกแล้วของหาย=ขายออก (บวก soldQty ไม่แตะยอดเงิน) col: date,SKU,qty,actor,time
const SHEET_ORDERS_RAW     = "ZORT ออเดอร์ดิบ";   // ออเดอร์ดิบทั้งระบบ (per-line) สำหรับ backfill+วิเคราะห์ย้อนหลัง
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

    // ── ผู้ใช้ที่ส่ง action มา (frontend ส่งใน body.actor) ──
    var actor = data.actor || "ไม่ระบุ";

    // ─── Verify PIN (POST path) ───
    if (data.action === 'verifyPin') {
      const expected = (PropertiesService.getScriptProperties().getProperty('OWNER_PIN') || 'DMJ').trim();
      const okPin = String(data.pin || '').trim() === expected;
      return ContentService
        .createTextOutput(JSON.stringify({ ok: okPin }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // มีการแก้ข้อมูล → ล้าง cache ให้ doGet ครั้งถัดไปคำนวณใหม่ (ข้อมูลไม่ค้าง)
    invalidateCache_(true); // clear payload cache เท่านั้น — ห้าม bump dmj_last_write_ts ก่อน conflict check

    // ─── Stock Transfer (Batch): คลัง → หน้าร้าน หลาย SKU ในครั้งเดียว ───
    if (data.transferStockBatch) {
      return transferStockBatch(ss, data.list || [], actor, data.clientLoadedAt);
    }

    // ─── Zero Stock: ตั้ง WH qty=0 ใน Sheets + ZORT (สินค้าหมด ไม่ได้จัด) ───
    if (data.zeroStock) {
      return zeroStockItem_(ss, data.sku, actor);
    }

    // ─── Void Quotation: ปิดใบเสนอราคาค้าง (ไม่อนุมัติ) ใน ZORT ───
    if (data.voidQuotation) {
      return voidZortQuotation_(data.quotationId, data.quotationNumber, actor);
    }

    // ─── Set Quotation Sale: บันทึกชื่อเซลที่ทำใบเสนอราคา (ในชีตเรา) ───
    if (data.setQuoteSale) {
      return setQuoteSale_(data.quoteNumber, data.sale, actor);
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
      return confirmShipmentReceive(ss, data.rowId, data.sku, Number(data.receivedQty) || 0, actor);
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

    // ─── Order Management ───
    if (data.deleteOrder) {
      return deleteOrderRow(ss, data.orderId, actor);
    }
    if (data.deleteOrders) {
      return deleteOrderRows(ss, data.orderIds || [], actor);
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
    if (data.resetNegativeStock) {
      if (data.role !== 'owner') return unauthorized_();
      return resetNegativeStock_(ss, actor);
    }

    // ─── MTO Jobs ───
    if (data.createMtoJob)    return createMtoJob(ss, data);
    if (data.closeMtoJob)     return closeMtoJob(ss, data, actor);
    if (data.deleteMtoJob)    return deleteMtoJob(ss, data);
    if (data.saveMtoJobItems) return saveMtoJobItems(ss, data);

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
    if (e && e.parameter && e.parameter.action === 'order') {
      return handleOrder_(e.parameter);
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
    // Audit Log endpoint: ดึง 200 แถวล่าสุดจาก Audit Log sheet
    // เฉพาะ owner เท่านั้น — ตรวจจาก role parameter ที่ frontend ส่งมา
    if (e && e.parameter && e.parameter.action === 'getAuditLog') {
      if (e.parameter.role !== 'owner') {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unauthorized" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      const ss = SpreadsheetApp.openById(SHEET_ID);
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

    // สินค้าจม: ดึงสินค้าที่มีในหน้าร้านแต่ไม่ได้รับโอนมานานกว่า 3 เดือน
    if (e && e.parameter && e.parameter.action === 'getDeadStock') {
      return handleGetDeadStock_();
    }

    // ใบเสนอราคาค้าง (Pending): ดีลที่รอลูกค้าตัดสินใจ พร้อมข้อมูลติดต่อ — ไว้ตามปิดการขาย
    if (e && e.parameter && e.parameter.action === 'getPendingQuotations') {
      return handleGetPendingQuotations_();
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
      if (e.parameter.role !== 'owner') {
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
    const wantFresh = e && e.parameter && e.parameter.fresh === '1';
    if (!wantFresh) {
      const cached = getCachedPayload_();
      if (cached) {
        // แทรก lastModified สด ๆ ลงใน cached payload ก่อน return
        // แทนที่ค่าใน JSON string ตรง ๆ เพื่อความเร็ว (ไม่ parse ทั้งก้อน)
        const freshMod = getSheetLastModified_();
        const patched = cached.replace(
          /"lastModified"\s*:\s*\d+/,
          '"lastModified":' + freshMod
        );
        return ContentService.createTextOutput(patched).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const products  = readProducts_();
    const sysQtyMap = readSysQty_();
    const monthly   = readMonthlySales_();
    const daily     = readDailySales_();
    const transfers = readTransfers_();
    const shipments = readShipments_();
    const purchases = readPurchases_();
    const storage   = readStorage_();
    const orders    = readOrders_();
    const mtoJobs   = readMtoJobs_();
    const frontStoreQtys = readFrontStoreCheckedQty_();
    const qtyLoc    = readQtyByLocation_();
    const transferHist = readTransferHistory_(); // วันโอนสาย5→หน้าร้านล่าสุด ต่อ SKU
    const unscannedMap = readUnscannedSalesMap_(); // ขายไม่สแกน (นับสต็อกแล้วของหาย=ขายออก) → บวกเข้า soldQty ไม่แตะยอดเงิน

    products.forEach(p => {
      // normalize SKU ก่อน lookup — กัน qty จากชีต "ข้อมูลสินค้า" (เก่า) รั่วมาโชว์
      // เมื่อรหัสในชีต "อัพเดทจำนวนสินค้า" พิมพ์ต่าง case/ช่องว่าง (ที่อื่นในระบบใช้ trim().toUpperCase() หมด)
      const skuU = (p.sku || '').toString().trim().toUpperCase();
      const loc = qtyLoc[skuU];
      if (loc) {
        p.qtyStore = loc.qtyStore;
        p.qtyWH = loc.qtyWH;
        p.warehouseQty = loc.qtyWH;
        if (loc.price > 0) p.price = loc.price;
      }

      const m = monthly.perSku[p.sku] || monthly.perSku[skuU];
      if (m) {
        p.monthly = monthly.monthLabels.map(ml => ({
          month: ml,
          qty:   (m.months[ml] || {}).qty   || 0,
          sales: (m.months[ml] || {}).sales || 0,
        }));
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
      p.stockValue      = p.qty     * p.price;
      p.stockValueWH    = (p.qtyWH    || 0) * p.price; // มูลค่าฝั่งคลัง
      p.stockValueStore = (p.qtyStore || 0) * p.price; // มูลค่าฝั่งหน้าร้าน

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

      const my = purchases.filter(pu => pu.sku === p.sku)
                          .sort((a, b) => (a.date < b.date ? 1 : -1));
      if (my.length > 0) {
        p.lastSupplier    = my[0].supplier;
        p.lastStockInDate = my[0].date ? my[0].date.split('-').reverse().join('/') : '';
        p.lastStockInQty  = my[0].qty;
        p.purchaseCount   = my.length;
      }

      // วันโอนสาย5→หน้าร้านล่าสุด (yyyy-MM-dd) → ใช้คำนวณสินค้าจมฝั่ง frontend
      const th = transferHist[(p.sku || "").toUpperCase()];
      if (th) p.lastTransferDate = th;

      const adjs = transfers.filter(t => t.sku === p.sku && t.type === 'ปรับ');
      if (adjs.length > 0) {
        p.adjustments    = adjs.length;
        p.adjustmentQty  = adjs.reduce((s, a) => s + a.qty, 0);
      }
    });

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
        const key = `${loc.side}${loc.shelf}/${loc.lock}`;
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

    const out = JSON.stringify(data);
    putCachedPayload_(out); // เก็บ cache สำหรับ request ถัดไป
    return ContentService.createTextOutput(out)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    console.error("doGet Error:", error);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.message, stack: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
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

const SHIP_HEADERS = ["หมายเลขรายการ","วันที่ทำรายการ","สถานะ(รอ,สำเร็จ)","จากคลัง/สาขา","ไปคลัง/สาขา","รหัสสินค้า","ชื่อสินค้า","จำนวน","จำนวนที่จัด","รูปภาพ","จำนวนที่รับ","สถานะรับ","รับเมื่อ","ผู้รับ","ผู้จัด"];

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

// Batch: หักสต็อกหลาย SKU ในครั้งเดียว → สร้าง ZORT Transfer เอกสารเดียว (เลขที่ auto)
// list = [{ sku, qty, name, orderId }, ...]
// clientLoadedAt = epoch ms ที่ client โหลดข้อมูล (ใช้ตรวจ conflict ก่อนทำ batch)
// หมายเหตุ: AddTransfer ย้ายสต็อกใน ZORT ให้อยู่แล้ว จึงไม่ต้อง push absolute ทับ
function transferStockBatch(ss, list, actor, clientLoadedAt) {
  if (!Array.isArray(list) || !list.length) return error("list ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  // หมายเหตุ: เลิกใช้ global conflict detection (dmj_last_write_ts) ที่นี่แล้ว
  // เหตุผล: การโอนอ่าน whQty สดจาก sheet "ใน lock" แล้ว clamp ด้วย Math.min(qty, whQty)
  //   → สต็อกติดลบไม่ได้อยู่แล้วต่อให้ 2 user โอน SKU เดียวพร้อมกัน (คนหลังได้เท่าที่เหลือ
  //   + รายงาน shortfall) global timestamp ทำให้ทุก write ของคนอื่น (นับสต็อก/MTO/ส่งของ)
  //   ไป block การส่งของที่ไม่เกี่ยวกันเลย → false conflict ตอนใช้หลายคนพร้อมกัน

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  const cache = CacheService.getScriptCache();
  try {
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

      sheet.getRange(row, COL_PROD_QTYWH).setValue(newWH);
      sheet.getRange(row, COL_PROD_QTYFS).setValue(newFS);
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

    let zortNumber = null, zortError = null;
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

      try { logTransferBatch_(ss, transferred, zortNumber, actor); } catch (e) { Logger.log("logTransferBatch_ error: " + e); }
      // Audit log: บันทึกทุก SKU ที่โอนจริง
      transferred.forEach(function(t) {
        writeAuditLog_(actor, "โอนสต็อก", t.sku, "qty " + t.qty + ": W0002→W0001");
      });
    }

    return ok({ count: transferred.length, zortNumber, zortError, shortfalls, results });
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

// log หลายรายการที่อ้าง ZORT number เดียวกัน
function logTransferBatch_(ss, items, zortNumber, actor) {
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
    // คอลัมน์ O (preparedBy) เพิ่มใหม่ Sprint 2 — ต่อท้าย ไม่แทรกกลาง กัน column-index เพี้ยน
    return [refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, it.sku, it.name, it.qty, it.qty, img, "", "รอรับ", "", "", actor || ""];
  });
  logSheet.getRange(baseRow + 1, 1, rows.length, 15).setValues(rows);
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
      if (rowNum >= 1) {
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

    // Fallback: match by sku + date
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const rowSku  = String(data[i][COL_ORD_SKU - 1]).trim().toUpperCase();
      const rowDate = String(data[i][COL_ORD_DATE - 1]).trim();
      const matchSku  = body.sku && rowSku === body.sku.trim().toUpperCase();
      const matchDate = !body.date || rowDate.includes(String(body.date).trim());
      if (matchSku && matchDate) {
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
          note: "อัปเดต order (match by sku+date, row " + row + ")",
        }));
        return ok({ updated: body.sku, row });
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
function confirmShipmentReceive(ss, rowId, sku, receivedQty, actor) {
  const sheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_TRANSFERS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const rowNum = parseInt(String(rowId).replace(/[^0-9]/g, ""));
    if (!(rowNum >= 3)) return error("rowId ไม่ถูกต้อง");

    // กัน row เลื่อน: เทียบ SKU ของแถวกับที่ client ส่งมา
    const rowSku = String(sheet.getRange(rowNum, COL_SHIP_SKU).getDisplayValue()).trim().toUpperCase();
    if (sku && rowSku !== String(sku).trim().toUpperCase())
      return error("ข้อมูลไม่ตรง (แถวอาจเลื่อน) — โปรดรีเฟรชแล้วลองใหม่");

    const sentQty = parseInt(sheet.getRange(rowNum, COL_SHIP_QTY).getDisplayValue()) || 0;
    const recv    = Math.max(0, receivedQty || 0);
    const status  = recv >= sentQty ? "รับครบ" : "รับไม่ครบ";
    const nowStr  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    sheet.getRange(rowNum, COL_SHIP_RECVQTY).setValue(recv);
    sheet.getRange(rowNum, COL_SHIP_RECVSTATUS).setValue(status);
    sheet.getRange(rowNum, COL_SHIP_RECVAT).setValue(nowStr);
    sheet.getRange(rowNum, COL_SHIP_RECVBY).setValue(actor || "");

    try { writeAuditLog_(actor, "รับสินค้า", rowSku, status + " " + recv + "/" + sentQty); } catch (e) {}
    return ok({ row: rowNum, receivedQty: recv, status });
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

function deleteOrderRow(ss, orderId, actor) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต ลำดับที่สั่งสินค้า");
  const rowNum = parseInt(String(orderId).replace(/[^0-9]/g, ""));
  if (!rowNum || rowNum < 3) return error("orderId ไม่ถูกต้อง");

  // orderId encode row number ณ เวลาที่โหลดข้อมูล — LockService ป้องกัน concurrent delete
  // แต่ถ้าเวลาผ่านไปนานและมี delete อื่นเกิดขึ้น row อาจเลื่อน
  // ตรวจ sanity: row ต้องมีข้อมูล SKU (col F, index 5) ก่อนลบ
  const lock = LockService.getScriptLock();
  if (!lock.waitLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    // 1) อ่าน before-state ก่อนลบ (A..I: mode,date,status,from,to,sku,name,orderQty,preparedQty)
    const rowData = sheet.getRange(rowNum, 1, 1, 9).getValues()[0];
    const sku = String(rowData[5] || '').trim();
    if (!sku) return error("แถวที่ " + rowNum + " ไม่มีข้อมูล SKU — อาจเลื่อนแถวแล้ว");
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
function deleteOrderRows(ss, orderIds, actor) {
  if (!Array.isArray(orderIds) || !orderIds.length) return error("orderIds ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต ลำดับที่สั่งสินค้า");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    const items = orderIds
      .map(id => ({ id: id, rowNum: parseInt(String(id).replace(/[^0-9]/g, "")) }))
      .filter(x => x.rowNum >= 3)
      .sort((a, b) => b.rowNum - a.rowNum);   // มาก→น้อย กัน index เลื่อนตอนลบ
    let deleted = 0;
    for (const item of items) {
      // 1) อ่าน before-state ก่อนลบ (A..I: mode,date,status,from,to,sku,name,orderQty,preparedQty)
      const rowData = sheet.getRange(item.rowNum, 1, 1, 9).getValues()[0];
      const before = {
        status: rowData[2] || "", sku: rowData[5] || "", name: rowData[6] || "",
        orderQty: rowData[7] || "", preparedQty: rowData[8] || "",
      };
      // 2) ลบจริง — GAS deleteRow() เป็น synchronous, throw ถ้าล้มเหลว
      sheet.deleteRow(item.rowNum);
      deleted++;
      // 3) ถึงจุดนี้ = ลบสำเร็จ → 4) เขียน audit log เฉพาะตอนสำเร็จเท่านั้น
      writeAuditLog_(actor, "ลบ order (batch)", item.id, auditDetail_({ before: before, after: null, note: "ลบ order แบบ batch" }));
    }
    if (deleted > 0) invalidateCache_(); // P0-4: bump dmj_last_write_ts ครั้งเดียวหลัง batch เสร็จ
    return ok({ deleted });
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

function parseLocation_(loc) {
  if (!loc) return null;
  const m = String(loc).trim().match(/^([AB])(\d+)\/(\d+)$/i);
  if (!m) return null;
  return { raw: String(loc).trim(), valid: true, side: m[1].toUpperCase(), shelf: +m[2], lock: +m[3] };
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

function readProducts_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCT_META);
  const rows = sh.getDataRange().getDisplayValues();
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
      locationRaw: (r[4] || '').toString().trim(),
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

    const stockSh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
    if (stockSh) {
      const srows = stockSh.getDataRange().getDisplayValues();
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
          locationRaw: '',
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

function readSysQty_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
  if (!sh) return {};
  const rows = sh.getDataRange().getDisplayValues();
  const map = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[1] || '').toString().trim().toUpperCase();
    if (!sku) continue;
    map[sku] = { sysStore: parseInt(r[6]) || 0, sysWH: parseInt(r[7]) || 0 };
  }
  return map;
}

function readMonthlySales_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_MONTHLY_SALES);
  if (!sh) return { monthLabels: [], monthlyByCat: {}, perSku: {} };
  const rows = sh.getDataRange().getDisplayValues();
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

function readDailySales_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_DAILY_SALES);
  if (!sh) return { dayLabels: [], dailyByCat: {} };
  const rows = sh.getDataRange().getDisplayValues();
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

function readTransfers_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TRANSFERS_HIST);
  if (!sh) return [];
  const rows = sh.getDataRange().getDisplayValues();
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
function readShipments_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_TRANSFERS);
  if (!sh) return [];
  const rows = sh.getDataRange().getDisplayValues();
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

// ย้ายรายการที่ "รับครบ" แล้ว ออกจากชีต "รายการโอนสินค้า" → เก็บในชีตประวัติ
// เพื่อไม่ให้ชีตหลัก/แท็บส่งแล้วบวม ส่วนที่ "รับไม่ครบ" ค้างเกิน SHIP_PARTIAL_ARCHIVE_DAYS วัน
// (นับจากเวลายืนยันรับครั้งล่าสุด) ก็จะถูกย้ายออกด้วยเช่นกัน ถือว่าปิดเคสแล้ว
// ส่วนที่ยังไม่เคยยืนยันรับเลย (receivedAt ว่าง) จะคาไว้เสมอ เพราะยังรอ action จริง
// ⚠️ ตั้ง trigger รายวัน (เช่น ตี 3) + รันเองครั้งแรกได้ (ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown)
const SHIP_PARTIAL_ARCHIVE_DAYS = 7;

// แปลง "dd/MM/yyyy HH:mm" (ค่าที่ confirmShipmentReceive เขียนลง COL_SHIP_RECVAT) เป็น Date
function parseShipRecvAt_(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
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

    // หาแถวที่ปิดเคสแล้ว (ข้อมูลเริ่ม index 2 = sheet row 3):
    //  - "รับครบ" → archive ทันที
    //  - "รับไม่ครบ" ที่ค้างเกิน SHIP_PARTIAL_ARCHIVE_DAYS วันนับจากยืนยันรับครั้งล่าสุด → archive เช่นกัน
    const partialCutoffMs = SHIP_PARTIAL_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const toArchive = [];  // { rowNum, values }
    for (let i = 2; i < data.length; i++) {
      const sku    = String(data[i][COL_SHIP_SKU - 1] || "").trim();
      if (!sku) continue;
      const status = String(data[i][COL_SHIP_RECVSTATUS - 1] || "").trim();
      if (status === "รับครบ") {
        toArchive.push({ rowNum: i + 1, values: data[i] });
      } else if (status === "รับไม่ครบ") {
        const recvAt = parseShipRecvAt_(data[i][COL_SHIP_RECVAT - 1]);
        if (recvAt && (now - recvAt.getTime()) >= partialCutoffMs) {
          toArchive.push({ rowNum: i + 1, values: data[i] });
        }
      }
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

function readStorage_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_LOCKS);
  if (!sh) return { entries: [], lockMap: {} };
  const rows = sh.getDataRange().getDisplayValues();
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
    };
    entries.push(e);
    if (parsed) {
      const key = `${parsed.side}${parsed.shelf}/${parsed.lock}`;
      lockMap[key] = lockMap[key] || [];
      lockMap[key].push({ sku: e.sku, qty: e.qty, sysQty: e.sysQty, status: e.status, lastCheck: e.lastCheck });
    }
  }
  return { entries, lockMap };
}

function readOrders_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) {
    Logger.log("[readOrders_] ERROR: ไม่พบ sheet '" + SHEET_ORDERS + "'");
    return [];
  }

  const rows = sheet.getDataRange().getDisplayValues();
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
      printFlag:   r[13] || null,
    });
  }
  Logger.log("[readOrders_] result=" + result.length + " skippedBlank=" + skippedBlank + " skippedHeader=" + skippedHeader + " skippedNoSku=" + skippedNoSku);
  return result;
}

function readFrontStoreCheckedQty_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_FRONTSTORE_QTY);
  if (!sh) return {};
  const rows = sh.getDataRange().getDisplayValues();
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

function handleOrder_(params) {
  try {
    const sku = (params.sku || '').toString().trim();
    const qty = parseInt(params.qty) || 0;
    const orderType = (params.orderType || 'หิ้ว').toString().trim();
    if (!sku || qty < 1) return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:'ข้อมูลไม่ครบ'}))
      .setMimeType(ContentService.MimeType.JSON);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orderSh = ss.getSheetByName(SHEET_ORDERS);
    if (!orderSh) return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:'ไม่พบ Sheet'}))
      .setMimeType(ContentService.MimeType.JSON);

    const orderNum = orderSh.getLastRow();
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
    orderSh.getRange(nextRow, 1, 1, 11).setValues([[orderType, now, 'รอ', 'คลังสินค้าสาย5', 'ดูเหมือนจริง', sku, productName, qty, '', imageUrl, '']]);
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
function pushOrderBatch_(channel, orders) {
  if (!orders || !orders.length) return { ok:true, quota:false };
  var show = orders.slice(0, 20);
  var lines = show.map(function(o) {
    var qtyNum = Number(o.qty) || 0;
    if (qtyNum <= 0 && o.sku) qtyNum = lookupOrderQty_(o.sku);
    return "• " + (o.name || o.sku || "-") + (qtyNum > 0 ? (" × " + qtyNum) : "");
  });
  if (orders.length > show.length) lines.push("… และอีก " + (orders.length - show.length) + " รายการ");
  var mentionText = "@All order 🚶 " + orders.length + " รายการ\n" + lines.join("\n");
  return linePush_(channel, [{ type: "text", text: mentionText,
      mention: { mentionees: [{ index: 0, length: 4, type: "all" }] } }]);
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
        var ageMin = (now - oldestMs) / 60000;
        var windowMin = notiOrderBatchWindowMin_(ch);
        var maxBatch = parseInt(PropertiesService.getScriptProperties().getProperty('NOTI_ORDER_BATCH_MAX') || '15', 10) || 15;
        if (ageMin >= windowMin || orders.length >= maxBatch) {
          var res = pushOrderBatch_(ch, orders.map(function(x){ return x.payload; }));
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

function getCachedPayload_() {
  try {
    const c = CacheService.getScriptCache();
    const nStr = c.get(_CACHE_KEY_COUNT);
    if (!nStr) return null;
    const n = parseInt(nStr, 10);
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(_CACHE_KEY_PART + i);
    const map = c.getAll(keys);
    let out = '';
    for (let i = 0; i < n; i++) {
      const part = map[_CACHE_KEY_PART + i];
      if (part == null) return null; // chunk หาย → ถือว่า cache ใช้ไม่ได้
      out += part;
    }
    return out;
  } catch (err) { return null; }
}

function putCachedPayload_(str) {
  try {
    const c = CacheService.getScriptCache();
    const entries = {};
    let n = 0;
    for (let i = 0; i < str.length; i += _CACHE_CHUNK_LEN) {
      entries[_CACHE_KEY_PART + n] = str.substring(i, i + _CACHE_CHUNK_LEN);
      n++;
    }
    entries[_CACHE_KEY_COUNT] = String(n);
    c.putAll(entries, _CACHE_TTL_SEC);
  } catch (err) { /* cache ล้มเหลวไม่เป็นไร — แค่ช้าลง */ }
}

function invalidateCache_(skipTsUpdate) {
  try {
    const c = CacheService.getScriptCache();
    const nStr = c.get(_CACHE_KEY_COUNT);
    const n = nStr ? parseInt(nStr, 10) : 0;
    const keys = [_CACHE_KEY_COUNT];
    for (let i = 0; i < n; i++) keys.push(_CACHE_KEY_PART + i);
    c.removeAll(keys);
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
    sh.appendRow(["JobID","วันที่","ชื่องาน","ลูกค้า","ราคา","รูป","สถานะ","ปิดงานเมื่อ"]);
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

function createMtoJob(ss, data) {
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

    sh.appendRow([jobId, data.dateStr || "", data.jobName || "", data.customer || "", data.price || "", data.imageUrl || "", "กำลังจัด", ""]);
    // ถึงจุดนี้ = สร้างสำเร็จ → เขียน audit log (creation ไม่มี before-state)
    writeAuditLog_(data.actor || "ไม่ระบุ", "สร้างงาน MTO", jobId, auditDetail_({
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
  contactTaxId:   ["taxid", "taxnumber", "customertaxid", "taxno", "idcard", "taxidnumber", "vatid"],
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
function searchContact(query) {
  var q = String(query || "").trim();
  if (q.length < 2) return ok({ contacts: [] });
  try {
    var url = ZORT_BASE + "/Contact/GetContacts?page=1&limit=10&" +
      POS_ZORT_FIELDS.contactSearchParam + "=" + encodeURIComponent(q);
    var res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    var zErr = zortRespError_(res);
    if (zErr) { logZortFailure_("ค้นลูกค้า", q + " | " + zErr); return error("ค้นลูกค้าไม่สำเร็จ: " + zErr); }
    var json = JSON.parse(res.getContentText() || "{}");
    var list = json.list || json.contacts || json.data || [];
    var out = list.map(normalizeContact_).filter(function (c) { return c.name || c.taxId; });
    return ok({ contacts: out });
  } catch (e) {
    return error("ค้นลูกค้าไม่สำเร็จ: " + e);
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

    writeAuditLog_(actor || "ไม่ระบุ", "ออกบิลขาย", orderNumber || "(ไม่ทราบเลข)",
      auditDetail_({ after: { total: totals.grandTotal, items: list.length,
        customer: (data.customer && data.customer.name) || "", taxInvoice: !!data.taxInvoice,
        payment: data.paymentMethod || "",
        cashReceived: data.cashReceived != null ? Number(data.cashReceived) : undefined,
        channel: data.channel || "" }, note: "saler ออกบิล/ใบกำกับผ่าน POS" }));

    invalidateCache_();
    return ok({ orderId: orderId, orderNumber: orderNumber, documentNumber: docNumber, totals: totals });
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
