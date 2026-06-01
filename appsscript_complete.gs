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
const WH_NAME_SAI5    = "คลังสินค้าสาย5";
const WH_NAME_FS      = "ดูเหมือนจริง";

// ── Column Mapping (1-based) ──
const COL_PROD_SKU    = 2;   // B
const COL_PROD_QTYFS  = 7;   // G = หน้าร้าน
const COL_PROD_QTYWH  = 8;   // H = คลัง

const COL_ORD_SKU      = 6;   // F
const COL_ORD_DATE     = 2;   // B
const COL_ORD_STATUS   = 3;   // C
const COL_ORD_PREPQTY  = 9;   // I
const COL_ORD_PRINTFLAG= 14;  // N

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
// SECTION 2: Main Handlers (doPost / doGet)
// ───────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ─── LINE Webhook ───
    if (data.events) {
      const event = data.events[0];
      if (!event) return ContentService.createTextOutput("OK"); // delivery/join events have empty array
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

    // มีการแก้ข้อมูล → ล้าง cache ให้ doGet ครั้งถัดไปคำนวณใหม่ (ข้อมูลไม่ค้าง)
    invalidateCache_();

    // ─── Stock Transfer (Batch): คลัง → หน้าร้าน หลาย SKU ในครั้งเดียว ───
    if (data.transferStockBatch) {
      return transferStockBatch(ss, data.list || []);
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
      return deductMaterials(ss, data.items || []);
    }

    // ─── Update Order State ───
    if (data.updateOrderState) {
      return updateOrderState(ss, data);
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
      return confirmStockCount(ss, data.entries);
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

    // ─── MTO Jobs ───
    if (data.createMtoJob)  return createMtoJob(ss, data);
    if (data.closeMtoJob)   return closeMtoJob(ss, data);
    if (data.deleteMtoJob)  return deleteMtoJob(ss, data);

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
    // Lightweight endpoint: ดึงเฉพาะรายการสั่งของ (เบา/เร็ว) สำหรับ polling หน้า orders
    if (e && e.parameter && e.parameter.action === 'orders') {
      return ContentService
        .createTextOutput(JSON.stringify({ orders: readOrders_(), generatedAt: new Date().toISOString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Server-side cache: payload หนัก (อ่าน 11 ชีต) → cache ไว้ ~3 นาที ลดโหลด/timeout
    // ?fresh=1 หรือหลังมีการแก้ข้อมูล (doPost ล้าง cache) จะคำนวณใหม่
    const wantFresh = e && e.parameter && e.parameter.fresh === '1';
    if (!wantFresh) {
      const cached = getCachedPayload_();
      if (cached) {
        return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
      }
    }

    const products  = readProducts_();
    const sysQtyMap = readSysQty_();
    const monthly   = readMonthlySales_();
    const daily     = readDailySales_();
    const transfers = readTransfers_();
    const purchases = readPurchases_();
    const storage   = readStorage_();
    const orders    = readOrders_();
    const mtoJobs   = readMtoJobs_();
    const frontStoreQtys = readFrontStoreCheckedQty_();
    const qtyLoc    = readQtyByLocation_();

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
        p.lastStockInDate = my[0].date;
        p.purchaseCount   = my.length;
      }

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
  }
}

function logTransfer_(ss, sku, productName, qty) {
  let logSheet = ss.getSheetByName(SHEET_TRANSFERS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_TRANSFERS);
    logSheet.appendRow(["หมายเลขรายการ","วันที่ทำรายการ","สถานะ(รอ,สำเร็จ)","จากคลัง/สาขา","ไปคลัง/สาขา","รหัสสินค้า","ชื่อสินค้า","จำนวน"]);
  }
  const now    = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
  const rows   = logSheet.getLastRow();
  const refNum = "TF-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd") + "-" + String(rows).padStart(3,"0");
  logSheet.appendRow([refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, sku, productName, qty]);
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
// หมายเหตุ: AddTransfer ย้ายสต็อกใน ZORT ให้อยู่แล้ว จึงไม่ต้อง push absolute ทับ
function transferStockBatch(ss, list) {
  if (!Array.isArray(list) || !list.length) return error("list ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

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

      // Idempotency: กันกดส่งซ้ำ (เครื่องอื่น/รีเฟรช) ภายใน 6 ชม.
      if (orderId && cache.get("shipped_" + orderId)) {
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
            if (orderId) cache.put("shipped_" + orderId, "1", 21600); // 6 ชม.
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

      try { logTransferBatch_(ss, transferred, zortNumber); } catch (e) { Logger.log("logTransferBatch_ error: " + e); }
    }

    return ok({ count: transferred.length, zortNumber, zortError, shortfalls, results });
  } finally {
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
    logSheet.appendRow(["หมายเลขรายการ","วันที่ทำรายการ","สถานะ(รอ,สำเร็จ)","จากคลัง/สาขา","ไปคลัง/สาขา","รหัสสินค้า","ชื่อสินค้า","จำนวน"]);
  }
  const now     = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "dd/MM/yyyy");
  const baseRow = logSheet.getLastRow();
  const refNum  = zortNumber
    ? String(zortNumber)
    : "TF-" + Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd") + "-" + String(baseRow).padStart(3, "0");
  const rows = items.map(it => [refNum, dateStr, "สำเร็จ", WH_NAME_SAI5, WH_NAME_FS, it.sku, it.name, it.qty]);
  logSheet.getRange(baseRow + 1, 1, rows.length, 8).setValues(rows);
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

        sheet.getRange(row, COL_PROD_QTYWH).setValue(whQty - deductWH);
        if (deductFS > 0) sheet.getRange(row, COL_PROD_QTYFS).setValue(fsQty - deductFS);
        SpreadsheetApp.flush();
        try {
          const zortItems = [];
          if (deductWH > 0) zortItems.push({ sku, qty: whQty - deductWH, warehousecode: WH_SAI5 });
          if (deductFS > 0) zortItems.push({ sku, qty: fsQty - deductFS, warehousecode: WH_FRONTSTORE });
          if (zortItems.length) pushStockToZort_(zortItems);
        } catch (e) { Logger.log("deductStock ZORT push error: " + e); }
        return ok({ sku, deductWH, deductFS, newWH: whQty - deductWH, newFS: fsQty - deductFS });
      }
    }
    return error("ไม่พบ SKU: " + sku);
  } finally {
    lock.releaseLock();
  }
}

function deductMaterials(ss, items) {
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
    return ok({ deducted: results.length, results });
  } finally {
    lock.releaseLock();
  }
}

function updateOrderState(ss, body) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_ORDERS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    // Try direct row match via orderId ("R5" → row 5+1=6 in sheet, index i=4)
    if (body.orderId) {
      const rowNum = parseInt(String(body.orderId).replace(/[^0-9]/g, ""));
      if (rowNum >= 1) {
        const sheetRow = rowNum + 1; // header is row 1, data starts row 2
        if (body.status)              sheet.getRange(sheetRow, COL_ORD_STATUS).setValue(body.status);
        if (body.preparedQty != null) sheet.getRange(sheetRow, COL_ORD_PREPQTY).setValue(body.preparedQty);
        if (body.printFlag)           sheet.getRange(sheetRow, COL_ORD_PRINTFLAG).setValue(body.printFlag);
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
        if (body.printFlag)           sheet.getRange(row, COL_ORD_PRINTFLAG).setValue(body.printFlag);
        return ok({ updated: body.sku, row });
      }
    }
    return ok({ notFound: body.orderId || body.sku });
  } finally {
    lock.releaseLock();
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
    }
    return ok({ lockKey, updated: entries.length });
  } finally {
    lock.releaseLock();
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
  const sheet = ss.getSheetByName("จำนวนหน้าร้าน");
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

function confirmStockCount(ss, entries) {
  if (!Array.isArray(entries) || !entries.length) return error("entries ว่างเปล่า");
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่");

  try {
    const data = sheet.getDataRange().getValues();
    let updated = 0;
    for (const entry of entries) {
      const sku = String(entry.sku || "").trim().toUpperCase();
      const qty = Number(entry.qty) || 0;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku) {
          sheet.getRange(i + 1, COL_PROD_QTYWH).setValue(qty);
          data[i][COL_PROD_QTYWH - 1] = qty;
          updated++;
          break;
        }
      }
    }
    SpreadsheetApp.flush();

    try {
      const zortItems = entries
        .filter(e => e.sku && Number(e.qty) >= 0)
        .map(e => ({ sku: String(e.sku).trim().toUpperCase(), qty: Number(e.qty), warehousecode: WH_SAI5 }));
      if (zortItems.length) pushStockToZort_(zortItems);
    } catch (e) { Logger.log("confirmStockCount ZORT push error: " + e); }

    return ok({ confirmed: updated });
  } finally {
    lock.releaseLock();
  }
}

function deleteOrderRow(ss, orderId) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต ลำดับที่สั่งสินค้า");
  const rowNum = parseInt(String(orderId).replace(/[^0-9]/g, ""));
  if (!rowNum || rowNum < 3) return error("orderId ไม่ถูกต้อง");
  sheet.deleteRow(rowNum);
  return ok({ deleted: orderId });
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
      const res = UrlFetchApp.fetch(`${ZORT_BASE}/Product/UpdateProductAvailableStockList`, {
        method: "post", headers,
        payload: JSON.stringify({ warehousecode: wh, stocks }),
        muteHttpExceptions: true
      });
      Logger.log(`pushStockToZort [${wh}]: ` + res.getContentText());
    } catch (e) {
      Logger.log(`pushStockToZort [${wh}] error: ` + e);
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
  const sh = ss.getSheetByName('imageUrl');
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
  const MONTHLY_DAYS = 90; // ดึง 3 เดือนย้อนหลัง
  const DAILY_DAYS   = 30; // ดึง 30 วันสำหรับรายวัน

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

// ดึงคำสั่งซื้อจาก ZORT แบบ paginated
function fetchZortOrdersPaged_(fromStr, toStr) {
  const all = [], limit = 100, MAX_PAGES = 30;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${ZORT_BASE}/Order/GetOrders?page=${page}&limit=${limit}&fromdate=${fromStr}&todate=${toStr}`;
    const res = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) break;
    const list = (JSON.parse(res.getContentText())).list || [];
    all.push(...list);
    if (list.length < limit) break;
    Utilities.sleep(300);
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

function syncZortToColumn_(warehousecode, colIndex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต: " + SHEET_PRODUCTS); return; }

  const products = fetchAllZortProducts_(warehousecode);
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
      zortTagMap[sku]   = String(p.tag            || "").trim();
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
      sheet.getRange(row, colIndex).setValue(zortMap[sku]);          // qty (G หรือ H)
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
  Logger.log(`อัพเดทแล้ว: ${updated} rows | ไม่พบใน ZORT: ${notFound} rows`);
}

function syncNewProductsFromZort() {
  Logger.log("=== ค้นหาสินค้าใหม่จาก ZORT ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต: " + SHEET_PRODUCTS); return; }

  const productsWH = fetchAllZortProducts_(WH_SAI5);
  const productsFS = fetchAllZortProducts_(WH_FRONTSTORE);
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
        sku,
        "",
        p.name || "",
        p.category || "",
        p.subCategory || "",
        p.tag || "",
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
  syncNewProductsFromZort();
  syncZortWarehouse();
  syncZortFrontStore();
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncZortBoth") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncZortBoth").timeBased().everyDays(1).atHour(6).create();
  Logger.log("✅ ตั้ง trigger: syncZortBoth ทุกวัน 06:00");
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

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลสินค้า');
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('imageUrl');
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ข้อมูลสินค้า');
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('อัพเดทจำนวนสินค้า');
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ยอดขายรายเดือน');
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ยอดขายรายวัน');
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('รายการโอน');
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

function readPurchases_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('รายการซื้อสินค้า');
  if (!sh) return [];
  const rows = sh.getDataRange().getDisplayValues();
  if (rows.length < 3) return [];
  const list = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const sku = (r[24] || '').toString().trim();
    if (!sku) continue;
    list.push({
      type:      (r[1]  || '').toString().trim(),
      poNum:     (r[2]  || '').toString().trim(),
      supplier:  (r[4]  || '').toString().trim(),
      date:      (r[11] || '').toString().trim(),
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
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('ตำแหน่งจัดเก็บ');
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("ลำดับที่สั่งสินค้า");
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    if (!r[5] && !r[6]) continue;
    result.push({
      id:          `R${i+1}`,
      carryMode:   String(r[0]||"").includes("หิ้ว") ? "carry" : "truck",
      date:        r[1] ? Utilities.formatDate(new Date(r[1]), "Asia/Bangkok", "dd/MM/yy") : "",
      status:      r[2] || "รอ",
      from:        r[3] || "",
      to:          r[4] || "",
      sku:         String(r[5] || "").trim(),
      name:        r[6] || "",
      orderQty:    Number(r[7]) || 0,
      preparedQty: Number(r[8]) || 0,
      image:       r[9] || "",
      remaining:   r[10] !== "" ? Number(r[10]) : null,
      printFlag:   r[11] || null,
    });
  }
  return result;
}

function readFrontStoreCheckedQty_() {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName("จำนวนหน้าร้าน");
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
  const sh = ss.getSheetByName('อัพเดทจำนวนสินค้า');
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
    const orderSh = ss.getSheetByName('ลำดับที่สั่งสินค้า');
    if (!orderSh) return ContentService
      .createTextOutput(JSON.stringify({ok:false, error:'ไม่พบ Sheet'}))
      .setMimeType(ContentService.MimeType.JSON);

    const orderNum = orderSh.getLastRow();
    const now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
    var startRow = 3;
    var colA = orderSh.getRange('A' + startRow + ':A').getValues();
    var nextRow = startRow;
    for (var i = 0; i < colA.length; i++) {
      if (colA[i][0] === '') { nextRow = startRow + i; break; }
    }
    orderSh.getRange(nextRow, 1, 1, 11).setValues([[orderType, now, 'รอ', 'คลังสินค้าสาย5', 'ดูเหมือนจริง', sku, '', qty, '', '', '']]);
    var msg = "🛒 มีคำสั่งซื้อใหม่\n"
        + "รหัส: " + sku + "\n"
        + "จำนวน: " + qty + " ชิ้น\n"
        + "ประเภท: " + orderType;
    sendLineMessage_(msg);

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
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify({
      to: LINE_USER_ID,
      messages: [{ type: "text", text: msg }]
    }),
    muteHttpExceptions: true
  });
}

function scheduledLineReminder() {
  var today = new Date();
  var dayOfWeek = today.getDay();
  if (dayOfWeek !== 2 && dayOfWeek !== 4) return;

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var orderSh = ss.getSheetByName('ลำดับที่สั่งสินค้า');
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
const _CACHE_TTL_SEC   = 180;     // 3 นาที
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

function invalidateCache_() {
  try {
    const c = CacheService.getScriptCache();
    const nStr = c.get(_CACHE_KEY_COUNT);
    const n = nStr ? parseInt(nStr, 10) : 0;
    const keys = [_CACHE_KEY_COUNT];
    for (let i = 0; i < n; i++) keys.push(_CACHE_KEY_PART + i);
    c.removeAll(keys);
  } catch (err) { /* ignore */ }
}

function error(msg) {
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ───────────────────────────────────────────────────────────
// SECTION 8: MTO Jobs
// ───────────────────────────────────────────────────────────

function getOrCreateMtoJobSheet_(ss) {
  let sh = ss.getSheetByName("งาน MTO");
  if (!sh) {
    sh = ss.insertSheet("งาน MTO");
    sh.appendRow(["JobID","วันที่","ชื่องาน","ลูกค้า","ราคา","รูป","สถานะ","ปิดงานเมื่อ"]);
  }
  return sh;
}

function getOrCreateMtoItemSheet_(ss) {
  let sh = ss.getSheetByName("วัตถุดิบ MTO");
  if (!sh) {
    sh = ss.insertSheet("วัตถุดิบ MTO");
    sh.appendRow(["JobID","รหัสสินค้า","ชื่อสินค้า","จำนวนเบิก","คลัง","จำนวนคืน","ตัดจริง","เวลา"]);
  }
  return sh;
}

function createMtoJob(ss, data) {
  const sh = getOrCreateMtoJobSheet_(ss);
  const jobId = "MTO_" + Date.now();
  sh.appendRow([jobId, data.dateStr || "", data.jobName || "", data.customer || "", data.price || "", data.imageUrl || "", "กำลังจัด", ""]);
  return ContentService.createTextOutput(JSON.stringify({ success: true, jobId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function closeMtoJob(ss, data) {
  const jobId = String(data.jobId || "").trim();
  const items = data.items || [];
  const closedAt = data.closedAt || "";

  // net = เบิก − คืน (รองรับคืนบางส่วน เช่น เบิก 24 คืน 4 → ตัดจริง 20)
  const netOf = (item) => {
    const qty = Number(item.qty) || 0;
    const ret = Math.max(0, Math.min(Number(item.returnedQty) || 0, qty));
    return qty - ret;
  };

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
    zortResult = decreaseMtoStockInZort_(items);
  } catch (e) {
    Logger.log("ZORT DecreaseStock failed: " + e);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, jobId, deducted: items.length, zort: zortResult }))
    .setMimeType(ContentService.MimeType.JSON);
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
    const res = UrlFetchApp.fetch(`${ZORT_BASE}/Product/DecreaseProductStockList`, {
      method: "post",
      headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const json = JSON.parse(res.getContentText());
    Logger.log(`ZORT DecreaseStock [${whCode}]: ` + JSON.stringify(json));
    results[whCode] = json;
  }

  return results;
}

function deleteMtoJob(ss, data) {
  const jobId = String(data.jobId || "").trim();
  const sh = ss.getSheetByName("งาน MTO");
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
  const jobSh = ss.getSheetByName("งาน MTO");
  const itemSh = ss.getSheetByName("วัตถุดิบ MTO");
  if (!jobSh) return [];

  const jobRows = jobSh.getDataRange().getValues();
  const itemRows = itemSh ? itemSh.getDataRange().getValues() : [];

  // Build items map by jobId
  const itemsMap = {};
  for (let i = 0; i < itemRows.length; i++) {
    const r = itemRows[i];
    const jid = String(r[0]||"").trim();
    if (!jid || jid.indexOf("MTO_") !== 0) continue; // ข้าม header/แถวว่าง
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
    if (!jobId || jobId.indexOf("MTO_") !== 0) continue; // ข้าม header/แถวว่าง
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
