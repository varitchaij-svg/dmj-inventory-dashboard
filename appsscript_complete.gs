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
const SHEET_PURCHASES      = "รายการซื้อสินค้า"; // ประวัติการซื้อ/PO
const SHEET_MONTHLY_SALES  = "ยอดขายรายเดือน";  // ยอดขายแยกตามเดือน
const SHEET_DAILY_SALES    = "ยอดขายรายวัน";    // ยอดขายแยกตามวัน
const SHEET_TRANSFERS_HIST = "รายการโอน";        // ประวัติโอนสินค้า (ต่างจาก SHEET_TRANSFERS)
const SHEET_MTO_JOBS       = "งาน MTO";          // งานจัดพิเศษ (make-to-order)
const SHEET_MTO_ITEMS      = "วัตถุดิบ MTO";    // วัตถุดิบสำหรับงาน MTO
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
// ───────────────────────────────────────────────────────────
function writeAuditLog_(actor, action, sku, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_AUDIT);
    if (!sh) {
      sh = ss.insertSheet(SHEET_AUDIT);
      sh.appendRow(["วันที่เวลา", "ผู้ใช้", "Action", "SKU", "รายละเอียด"]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold");
    }
    sh.appendRow([new Date(), actor || "ไม่ระบุ", action || "", sku || "", detail || ""]);
  } catch (e) {
    Logger.log("writeAuditLog_ error: " + e);
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
      if (event.type === 'message' && event.message.type === 'text') {
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
      const expected = PropertiesService.getScriptProperties().getProperty('OWNER_PIN') || 'DMJ';
      const okPin = String(data.pin || '') === String(expected);
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

    // ─── Stock Transfer: คลัง → หน้าร้าน ───
    if (data.transferStock) {
      return transferStock(ss, data.sku, Number(data.qty) || 0, data.name);
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
      return updateLockData(ss, data.lockKey, data.entries, data.datetime);
    }

    if (data.deleteLockEntry) {
      return deleteLockEntry(ss, data.lockKey, data.sku);
    }

    // ─── Front Store Count ───
    if (data.updateFrontStore) {
      return updateFrontStore(ss, data.entries, data.datetime);
    }
    if (data.confirmStockCount) {
      return confirmStockCount(ss, data.entries, data.clientLoadedAt, actor);
    }

    // ─── Order Management ───
    if (data.deleteOrder) {
      return deleteOrderRow(ss, data.orderId);
    }
    if (data.deleteOrders) {
      return deleteOrderRows(ss, data.orderIds || []);
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

    // ─── MTO Jobs ───
    if (data.createMtoJob)    return createMtoJob(ss, data);
    if (data.closeMtoJob)     return closeMtoJob(ss, data, actor);
    if (data.deleteMtoJob)    return deleteMtoJob(ss, data);
    if (data.saveMtoJobItems) return saveMtoJobItems(ss, data);

    // ─── Stock Check Requests ───
    if (data.createStockCheck) return createStockCheckRequest_(data.skus, data.names, actor);
    if (data.completeStockCheck) return completeStockCheckRequest_(data.reqId, actor);

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
      const expected = PropertiesService.getScriptProperties().getProperty('OWNER_PIN') || 'DMJ';
      const okPin = String(e.parameter.pin || '') === String(expected);
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
          ts:     r[0] ? new Date(r[0]).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "",
          actor:  r[1] || "",
          action: r[2] || "",
          sku:    r[3] || "",
          detail: r[4] || "",
        };
      });
      return ContentService.createTextOutput(JSON.stringify({ rows: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // สินค้าจม: ดึงสินค้าที่มีในหน้าร้านแต่ไม่ได้รับโอนมานานกว่า 3 เดือน
    if (e && e.parameter && e.parameter.action === 'getDeadStock') {
      return handleGetDeadStock_();
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
          validateHttpsCertificates: false
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

    products.forEach(p => {
      const loc = qtyLoc[p.sku];
      if (loc) {
        p.qtyStore = loc.qtyStore;
        p.qtyWH = loc.qtyWH;
        p.warehouseQty = loc.qtyWH;
        if (loc.price > 0) p.price = loc.price;
      }

      const m = monthly.perSku[p.sku];
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
      p.cost       = p.price * COST_RATIO;
      p.profit     = p.soldRev * (1 - COST_RATIO);
      p.stockValue = p.qty * p.price;

      const sys = sysQtyMap[p.sku];
      if (sys) {
        p.sysStore  = sys.sysStore;
        p.sysWH     = sys.sysWH;
        p.diffStore = p.qtyStore - sys.sysStore;
        p.diffWH    = p.qtyWH    - sys.sysWH;
      }
      p.frontStoreCheckedQty = frontStoreQtys[p.sku] || 0;

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
        totalStockValue: products.reduce((s, p) => s + (p.stockValue || 0), 0),
        totalSoldRev:    products.reduce((s, p) => s + (p.soldRev || 0), 0),
        totalSoldQty:    products.reduce((s, p) => s + (p.soldQty || 0), 0),
        totalProfit:     products.reduce((s, p) => s + (p.profit || 0), 0),
      },
      mtoGroups: Object.values(mtoMap),
      stockCheckRequests: readStockCheckRequests_().filter(function(r){ return r.status === "pending"; }),
      thresholds: { default: 36, overrides: { "แจกันแก้ว": 3, "เรซิ่นและอื่นๆ": 3 } },
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

function transferStock(ss, sku, qty, productName) {
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
        try { logTransfer_(ss, sku, name, actual); } catch (e) { Logger.log("logTransfer_ error: " + e); }
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

const SHIP_HEADERS = ["หมายเลขรายการ","วันที่ทำรายการ","สถานะ(รอ,สำเร็จ)","จากคลัง/สาขา","ไปคลัง/สาขา","รหัสสินค้า","ชื่อสินค้า","จำนวน","จำนวนที่จัด","รูปภาพ","จำนวนที่รับ","สถานะรับ","รับเมื่อ","ผู้รับ"];

function logTransfer_(ss, sku, productName, qty) {
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
  logSheet.appendRow([refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, sku, productName, qty, qty, img, "", "รอรับ", "", ""]);
}

function createZortTransfer_(sku, productname, qty) {
  const now = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const headers = Object.assign({}, zortHeaders_(), { "Content-Type": "application/json" });
  const payload = {
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

  // ─── Conflict detection: ตรวจทั้ง batch ก่อนเริ่ม ───
  // กัน 2 user โอน SKU เดียวพร้อมกัน → สต็อกติดลบ
  if (clientLoadedAt) {
    const lastMod = getSheetLastModified_();
    if (shouldRejectConflict_(clientLoadedAt, lastMod)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, conflict: true,
        message: "ข้อมูลเปลี่ยนไปแล้ว โหลดใหม่แล้วลองอีกครั้ง"
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  const cache = CacheService.getScriptCache();
  try {
    const data = sheet.getDataRange().getValues();
    const transferred = [];   // { sku, name, qty } ที่หักได้จริง
    const results = [];
    const shortfalls = [];     // รายการที่ส่งไม่ครบ (คลังไม่พอ)

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

      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
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
          found = true;
          break;
        }
      }
      if (!found) results.push({ sku, orderId, notFound: true });
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

      try { logTransferBatch_(ss, transferred, zortNumber); } catch (e) { Logger.log("logTransferBatch_ error: " + e); }
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
function logTransferBatch_(ss, items, zortNumber) {
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
    return [refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, it.sku, it.name, it.qty, it.qty, img, "", "รอรับ", "", ""];
  });
  logSheet.getRange(baseRow + 1, 1, rows.length, 14).setValues(rows);
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

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    // Try direct row match via orderId ("R3" = sheet row 3, readOrders_ uses id:`R${i+1}` where i is 0-indexed)
    if (body.orderId) {
      const rowNum = parseInt(String(body.orderId).replace(/[^0-9]/g, ""));
      if (rowNum >= 1) {
        const sheetRow = rowNum; // id already encodes 1-indexed sheet row
        if (body.status)              sheet.getRange(sheetRow, COL_ORD_STATUS).setValue(body.status);
        if (body.preparedQty != null) sheet.getRange(sheetRow, COL_ORD_PREPQTY).setValue(body.preparedQty);
        if (body.printFlag != null)    sheet.getRange(sheetRow, COL_ORD_PRINTFLAG).setValue(body.printFlag); // M2: != null กัน false ถูกข้าม
        if (body.carryMode != null) {
          sheet.getRange(sheetRow, COL_ORD_TYPE).setValue(body.carryMode === "carry" ? "หิ้ว" : "รอขึ้นรถ");
          if (body.carryMode === "carry") {
            try {
              const productName = body.name || body.sku || "(ไม่ทราบชื่อ)";
              sendLineGroupOrderCard_(productName, body.sku||"", body.date||"", body.image||"");
            } catch(e) {}
          }
        }
        SpreadsheetApp.flush();
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
        if (body.status)              sheet.getRange(row, COL_ORD_STATUS).setValue(body.status);
        if (body.preparedQty != null) sheet.getRange(row, COL_ORD_PREPQTY).setValue(body.preparedQty);
        if (body.printFlag != null)    sheet.getRange(row, COL_ORD_PRINTFLAG).setValue(body.printFlag); // M2: != null กัน false ถูกข้าม
        if (body.carryMode != null) {
          sheet.getRange(row, COL_ORD_TYPE).setValue(body.carryMode === "carry" ? "หิ้ว" : "รอขึ้นรถ");
          if (body.carryMode === "carry") {
            try {
              const productName = body.name || body.sku || "(ไม่ทราบชื่อ)";
              sendLineGroupOrderCard_(productName, body.sku||"", body.date||"", body.image||"");
            } catch(e) {}
          }
        }
        SpreadsheetApp.flush();
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

function updateLockData(ss, lockKey, entries, datetime) {
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
      // Audit log: บันทึกทุก entry ที่เปลี่ยน
      try { writeAuditLog_("ระบบ", "updateLockData", sku, "lockKey: " + lockKey + ", qty: " + entry.qty); } catch(e) {}
    }
    return ok({ lockKey, updated: entries.length });
  } finally {
    lock.releaseLock();
    try { invalidateCache_(); } catch(e) {}
  }
}

function deleteLockEntry(ss, lockKey, sku) {
  if (!lockKey || !sku) return error("lockKey หรือ sku ไม่ครบ");
  const sheet = ss.getSheetByName(SHEET_LOCKS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_LOCKS);

  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const rKey = String(data[i][COL_LOCK_KEY - 1]).trim();
    const rSku = String(data[i][COL_LOCK_SKU - 1]).trim().toUpperCase();
    if (rKey === lockKey && rSku === sku.toUpperCase()) {
      sheet.deleteRow(i + 1);
      return ok({ deleted: sku, lockKey });
    }
  }
  return ok({ notFound: sku });
}

function updateFrontStore(ss, entries, datetime) {
  const sheet = ss.getSheetByName(SHEET_FRONTSTORE_QTY);
  if (!sheet) return error("ไม่พบชีต จำนวนหน้าร้าน");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const dt = datetime || new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const rows = sheet.getDataRange().getValues();

    for (const entry of entries) {
      const sku = String(entry.sku).trim().toUpperCase();
      const qty = Number(entry.qty) || 0;
      let found = false;

      for (let i = 1; i < rows.length; i++) {
        const rowSku = String(rows[i][1] || "").trim().toUpperCase();
        if (rowSku === sku) {
          sheet.getRange(i + 1, 4).setValue(qty);
          sheet.getRange(i + 1, 9).setValue(dt);
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
      }
    }
    SpreadsheetApp.flush();
    try {
      const zortItems = entries
        .filter(e => e.sku && Number(e.qty) >= 0)
        .map(e => ({ sku: String(e.sku).trim().toUpperCase(), qty: Number(e.qty), warehousecode: WH_FRONTSTORE }));
      if (zortItems.length) pushStockToZort_(zortItems);
    } catch (e) { Logger.log("updateFrontStore ZORT push error: " + e); }
    return ok({ updated: entries.length });
  } finally {
    lock.releaseLock();
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
    for (const entry of entries) {
      const sku = String(entry.sku || "").trim().toUpperCase();
      const qty = Number(entry.qty) || 0;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
          const oldQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
          sheet.getRange(i + 1, COL_PROD_QTYWH).setValue(qty);
          data[i][COL_PROD_QTYWH - 1] = qty;
          auditRows.push({ sku, oldQty, newQty: qty });
          updated++;
          break;
        }
      }
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

function deleteOrderRow(ss, orderId) {
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
    const rowData = sheet.getRange(rowNum, 1, 1, 7).getValues()[0];
    const sku = String(rowData[5] || '').trim();
    if (!sku) return error("แถวที่ " + rowNum + " ไม่มีข้อมูล SKU — อาจเลื่อนแถวแล้ว");
    sheet.deleteRow(rowNum);
    return ok({ deleted: orderId });
  } finally {
    lock.releaseLock();
  }
}

// ลบหลาย order rows ในครั้งเดียว — เรียงจากแถวล่างขึ้นบนกัน index เลื่อน
function deleteOrderRows(ss, orderIds) {
  if (!Array.isArray(orderIds) || !orderIds.length) return error("orderIds ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต ลำดับที่สั่งสินค้า");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");
  try {
    const rows = orderIds
      .map(id => parseInt(String(id).replace(/[^0-9]/g, "")))
      .filter(n => n >= 3)
      .sort((a, b) => b - a);   // มาก→น้อย
    let deleted = 0;
    for (const r of rows) { sheet.deleteRow(r); deleted++; }
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

// ─── ZORT Sales Auto-Sync ───────────────────────────────────────────────────

function syncZortSales() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const tz = "Asia/Bangkok";
  const today = new Date();
  const MONTHLY_DAYS = 365; // ดึงย้อนหลัง 1 ปี (รายเดือนทั้งปี)
  const DAILY_DAYS   = 60;  // รายวัน 60 วันล่าสุด

  const fromDate = new Date(today.getTime() - MONTHLY_DAYS * 24 * 60 * 60 * 1000);
  const fromStr  = Utilities.formatDate(fromDate, tz, "yyyy-MM-dd");
  const toStr    = Utilities.formatDate(today, tz, "yyyy-MM-dd");

  // ดึง SKU → category/name จาก product sheet
  const catMap = {}, nameMap = {};
  readProducts_().forEach(p => {
    if (!p.sku) return;
    const k = p.sku.toUpperCase();
    catMap[k]  = p.category || "ไม่ระบุ";
    nameMap[k] = p.name || p.sku;
  });

  const allOrders = fetchZortOrdersPaged_(fromStr, toStr);
  Logger.log("ZORT orders fetched: " + allOrders.length);

  const monthly = {}, daily = {};
  const monthSet = new Set(), daySet = new Set();

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
    }
  }

  const sortedMonths = sortMonthKeys_(Array.from(monthSet));
  const sortedDays   = sortDayKeys_(Array.from(daySet));
  Logger.log("months: " + sortedMonths.join(", "));
  Logger.log("days: " + sortedDays.length + " วัน, SKUs monthly: " + Object.keys(monthly).length);

  writeZortSalesSheet_(ss, "ยอดขายรายเดือน", monthly, sortedMonths, "months");
  writeZortSalesSheet_(ss, "ยอดขายรายวัน",   daily,   sortedDays,   "days");
  invalidateCache_();
  Logger.log("✅ syncZortSales เสร็จ");
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

  const zortMap      = {};
  const zortNameMap  = {};
  const zortCatMap   = {};
  const zortTagMap   = {};
  const zortPriceMap = {};
  for (const p of products) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (sku) {
      zortMap[sku]      = Number(p.availablestock || 0);
      zortNameMap[sku]  = String(p.name         || "").trim();
      zortCatMap[sku]   = String(p.category      || "").trim();
      zortTagMap[sku]   = Array.isArray(p.tag) ? p.tag.join(",") : String(p.tag || "").trim();
      zortPriceMap[sku] = Number(p.sellprice      || 0);
    }
  }

  const data = sheet.getDataRange().getValues();
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

function syncZortWarehouse() {
  syncZortToColumn_(WH_SAI5, COL_PROD_QTYWH);
}

function syncZortFrontStore() {
  syncZortToColumn_(WH_FRONTSTORE, COL_PROD_QTYFS);
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
function setupDailySummaryTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "sendDailyMorningSummary") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendDailyMorningSummary").timeBased().everyDays(1).atHour(8).create();
  Logger.log("✅ ตั้ง trigger: sendDailyMorningSummary ทุกวัน 08:00");
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
  return out;
}

function readSysQty_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_PRODUCTS);
  if (!sh) return {};
  const rows = sh.getDataRange().getDisplayValues();
  const map = {};
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[1] || '').toString().trim();
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
    });
  }
  return list;
}

// ย้ายรายการที่ "รับครบ" แล้ว ออกจากชีต "รายการโอนสินค้า" → เก็บในชีตประวัติ
// เพื่อไม่ให้ชีตหลัก/แท็บส่งแล้วบวม ส่วนที่ "รับไม่ครบ" หรือยังไม่ยืนยัน จะคาไว้เสมอ
// ⚠️ ตั้ง trigger รายวัน (เช่น ตี 3) + รันเองครั้งแรกได้ (ชื่อไม่มี _ ต่อท้าย → โผล่ใน dropdown)
function archiveReceivedShipments() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!sheet) { Logger.log("archiveReceivedShipments: ไม่พบชีต " + SHEET_TRANSFERS); return; }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log("archiveReceivedShipments: lock ไม่ได้"); return; }

  try {
    const data = sheet.getDataRange().getValues();
    if (data.length < 3) return;  // มีแค่หัวตาราง 2 แถว

    // หาแถวที่รับครบแล้ว (ข้อมูลเริ่ม index 2 = sheet row 3)
    const toArchive = [];  // { rowNum, values }
    for (let i = 2; i < data.length; i++) {
      const sku    = String(data[i][COL_SHIP_SKU - 1] || "").trim();
      const status = String(data[i][COL_SHIP_RECVSTATUS - 1] || "").trim();
      if (sku && status === "รับครบ") toArchive.push({ rowNum: i + 1, values: data[i] });
    }
    if (!toArchive.length) { Logger.log("archiveReceivedShipments: ไม่มีรายการรับครบ"); return; }

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
      lockMap[key].push({ sku: e.sku, qty: e.qty, sysQty: e.sysQty, status: e.status });
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
      map[sku] = parseInt(String(qty).replace(/,/g, "")) || 0;
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
    const sku = (r[0] || '').toString().trim();
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
      sendLineGroupOrderCard_(productName || sku, sku, Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'), "");
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

function sendLineGroupOrderCard_(name, sku, date, imageUrl) {
  var groupId = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID');
  if (!groupId) { Logger.log("LINE: no LINE_GROUP_ID"); return; }

  // lookup รูปจาก imageUrl sheet ถ้า frontend ไม่ส่งมา
  var imgUrl = imageUrl || "";
  if (!imgUrl && sku) {
    try { imgUrl = (readImageMap_()[(sku||"").trim().toUpperCase()] || ""); } catch(e) {}
  }

  var pushUrl = "https://api.line.me/v2/bot/message/push";
  var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN };

  // @All mention
  var mentionText = "@All order 🚶 " + (name||sku||"-");
  UrlFetchApp.fetch(pushUrl, {
    method: "post", headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({ to: groupId, messages: [{
      type: "text", text: mentionText,
      mention: { mentionees: [{ index: 0, length: 4, type: "all" }] }
    }]})
  });

  // Flex bubble เดียว (หน้าตาเหมือน carousel ของรอขึ้นรถ)
  var bubble = {
    type: "bubble", size: "kilo",
    body: {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px",
      contents: [
        { type: "text", text: "order 🚶", size: "xs", color: "#1565c0", weight: "bold" },
        { type: "text", text: name || sku || "-", weight: "bold", size: "lg", wrap: true },
        { type: "text", text: "รหัส: " + (sku||""), size: "sm", color: "#888888" },
        { type: "text", text: "วันที่: " + (date||""), size: "sm", color: "#888888" }
      ]
    }
  };
  if (imgUrl) {
    bubble.hero = { type: "image", url: imgUrl, size: "full", aspectRatio: "4:3", aspectMode: "fit"};
  }

  var r2 = UrlFetchApp.fetch(pushUrl, {
    method: "post", headers: headers, muteHttpExceptions: true,
    payload: JSON.stringify({ to: groupId, messages: [{ type: "flex", altText: "order 🚶 " + (name||sku||"-"), contents: bubble }] })
  });
  Logger.log("LINE carry card: " + r2.getResponseCode() + " " + r2.getContentText().slice(0,300));
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
  if (!pending.length) {
    sendLineGroup_("✅ ไม่มีของรอขึ้นรถแล้ว\nจัดครบหมดแล้ว 👍");
    return;
  }

  var hour = new Date().getHours();
  var label = hour < 12 ? '🌅 เช้า' : '🌞 บ่าย';
  var groupId = PropertiesService.getScriptProperties().getProperty('LINE_GROUP_ID');
  if (!groupId) return;

  // lookup รูปทุก SKU
  var imgMap = {};
  try { imgMap = readImageMap_(); } catch(e) {}

  // @All mention text
  var mentionText = "@All 🚚 " + label + " รอขึ้นรถ " + pending.length + " รายการ";
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post", muteHttpExceptions: true,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ to: groupId, messages: [{
      type: "text", text: mentionText,
      mention: { mentionees: [{ index: 0, length: 4, type: "all" }] }
    }]})
  });

  // Flex Carousel — max 12 bubbles ต่อ carousel, max 5 messages ต่อ push
  var show = pending.slice(0, 12);
  var bubbles = show.map(function(o) {
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
    if (imgUrl) {
      bubble.hero = { type: "image", url: imgUrl, size: "full", aspectRatio: "4:3", aspectMode: "fit"};
    }
    return bubble;
  });

  var carousel = { type: "flex", altText: "🚚 รอขึ้นรถ " + pending.length + " รายการ",
    contents: { type: "carousel", contents: bubbles } };
  var r2 = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post", muteHttpExceptions: true,
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + LINE_ACCESS_TOKEN },
    payload: JSON.stringify({ to: groupId, messages: [carousel] })
  });
  Logger.log("truck carousel: " + r2.getResponseCode() + " " + r2.getContentText().slice(0,300));
  if (pending.length > 12) {
    sendLineGroup_("... และอีก " + (pending.length - 12) + " รายการ");
  }
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
  sendLineMessage_(msg);
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
    sendLineMessage_("⚠️ ZORT ไม่อัปเดต\nงาน: " + action + "\n" + String(detail).substring(0, 300) +
                     "\n\nสต็อกในระบบกับ ZORT อาจไม่ตรง — โปรดตรวจชีต " + SHEET_ZORT_FAILED);
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
  sendLineMessage_(msg);
}

// ───────────────────────────────────────────────────────────
// SECTION 7: Utilities
// ───────────────────────────────────────────────────────────

function ok(data) {
  return ContentService.createTextOutput(JSON.stringify({ success: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Payload cache (แบ่งเป็น chunk เพราะ CacheService จำกัด 100KB/key) ──
const _CACHE_TTL_SEC   = 600;     // 10 นาที (เดิม 3 นาที — ยืดให้ GAS cold start น้อยลง)
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

  // Deduct stock
  const prodSh = ss.getSheetByName(SHEET_PRODUCTS);
  if (prodSh) {
    const prodData = prodSh.getDataRange().getValues();
    items.forEach(item => {
      const net = netOf(item);
      if (net <= 0) return;
      const sku = String(item.sku || "").trim().toUpperCase();
      for (let i = 1; i < prodData.length; i++) {
        if (String(prodData[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
          const row = i + 1;
          if (item.warehouse === "frontstore") {
            const cur = Number(prodSh.getRange(row, COL_PROD_QTYFS).getValue()) || 0;
            prodSh.getRange(row, COL_PROD_QTYFS).setValue(Math.max(0, cur - net));
          } else {
            const cur = Number(prodSh.getRange(row, COL_PROD_QTYWH).getValue()) || 0;
            prodSh.getRange(row, COL_PROD_QTYWH).setValue(Math.max(0, cur - net));
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
      itemSh.appendRow([jobId, item.sku || "", item.name || "", Number(item.qty) || 0, item.warehouse || "warehouse", ret, netOf(item), closedAt]);
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
  // Group items by warehouse
  const groups = {};
  for (const item of items) {
    const whCode = item.warehouse === "frontstore" ? WH_FRONTSTORE : WH_SAI5;
    if (!groups[whCode]) groups[whCode] = [];
    const sku = String(item.sku || "").trim();
    const qty = Number(item.qty) || 0;
    const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
    const net = qty - ret;
    // ZORT V4: stocks[].sku, stocks[].stock (ไม่ใช่ list/number)
    if (sku && net > 0) groups[whCode].push({ sku, stock: net });
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
    itemSh.appendRow([jobId, item.sku || "", item.name || "", qty, item.warehouse || "warehouse", ret, qty - ret, ""]);
  });

  SpreadsheetApp.flush();
  invalidateCache_();
  return ok({ saved: items.length });
}

function deleteMtoJob(ss, data) {
  const jobId = String(data.jobId || "").trim();
  const sh = ss.getSheetByName(SHEET_MTO_JOBS);
  if (!sh) return error("ไม่พบชีต งาน MTO");
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === jobId) {
      sh.deleteRow(i + 1);
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
