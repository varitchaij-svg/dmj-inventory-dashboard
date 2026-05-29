// ============================================================
// doPost handler — เพิ่ม/แก้ไข function นี้ใน Google Apps Script
// ที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่ — ใส่ต่อท้ายหรือแทนที่ doPost เดิม)
// ============================================================

// ── ชื่อชีตที่ใช้ (แก้ให้ตรงกับ Google Sheet ของคุณ) ────────
const SHEET_PRODUCTS  = "อัพเดทจำนวนสินค้า";   // ชีตสินค้า (มี qty)
const SHEET_ORDERS    = "รายการซื้อสินค้า";     // ชีต orders (สั่งซื้อ)
const SHEET_LOCKS     = "ตำแหน่งจัดเก็บ";      // ชีต lock/ตำแหน่งคลัง

// ── คอลัมน์ในชีตสินค้า (นับจาก 1) ──────────────────────────
const COL_PROD_SKU    = 1;   // A = รหัสสินค้า
const COL_PROD_QTYFS  = 7;   // G = จำนวนหน้าร้าน (ดูเหมือนจริง W0001)
const COL_PROD_QTYWH  = 8;   // H = จำนวนคลัง     (คลังสาย5 W0002)

// ── คอลัมน์ในชีต orders ──────────────────────────────────────
const COL_ORD_SKU      = 6;   // F = รหัสสินค้า
const COL_ORD_DATE     = 2;   // B = วันที่
const COL_ORD_STATUS   = 3;   // C = สถานะ
const COL_ORD_PREPQTY  = 9;   // I = จำนวนที่จัด
const COL_ORD_PRINTFLAG= 14;  // N = QR code / print flag

// ── คอลัมน์ในชีต locks ───────────────────────────────────────
const COL_LOCK_KEY     = 1;   // A = lockKey (เช่น A1/01)
const COL_LOCK_SKU     = 2;   // B = SKU
const COL_LOCK_QTY     = 3;   // C = จำนวนที่นับจริง
const COL_LOCK_DATE    = 4;   // D = วันที่เช็ค

// ── ZORT API ──────────────────────────────────────────────────
// ⚠️ ใส่ข้อมูลจริงใน Google Apps Script Editor เท่านั้น ห้าม commit ลง git
const ZORT_STORE  = "YOUR_ZORT_EMAIL";
const ZORT_APIKEY = "YOUR_ZORT_APIKEY";
const ZORT_SECRET = "YOUR_ZORT_SECRET";
const ZORT_BASE   = "https://open-api.zortout.com/v4";
const WH_FRONTSTORE = "W0001";  // ดูเหมือนจริง → col G
const WH_SAI5       = "W0002";  // คลังสินค้าสาย5 → col H

// ============================================================

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();

    // 1) โอนสต็อก คลัง(H) → หน้าร้าน(G) เมื่อส่งสินค้าออกคลัง
    if (body.transferStock) {
      return transferStock(ss, body.sku, Number(body.qty) || 0);
    }

    // 2) หักสต็อกตรงๆ (legacy / ปรับมือ)
    if (body.deductStock) {
      return deductStock(ss, body.sku, Number(body.qty) || 0);
    }

    // 3) เบิกวัตถุดิบสำหรับงาน MTO — หักหลายรายการพร้อมกัน
    if (body.deductMaterials) {
      return deductMaterials(ss, body.items || []);
    }

    // 4) อัพเดทสถานะ / printFlag / preparedQty ของ order
    if (body.updateOrderState) {
      return updateOrderState(ss, body);
    }

    // 5) บันทึกผลนับล็อค (ตำแหน่งจัดเก็บ)
    if (body.updateLockData) {
      return updateLockData(ss, body.lockKey, body.entries, body.datetime);
    }

    // 6) ลบ SKU ออกจากล็อค
    if (body.deleteLockEntry) {
      return deleteLockEntry(ss, body.lockKey, body.sku);
    }

    return ok("no action matched");
  } catch (err) {
    return error(err.message);
  }
}

// ── 1) โอนสต็อก คลัง → หน้าร้าน ─────────────────────────────
function transferStock(ss, sku, qty) {
  if (!sku || qty <= 0) return error("sku หรือ qty ไม่ถูกต้อง");

  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku.trim().toUpperCase()) {
      const row   = i + 1;
      const whQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
      const fsQty = Number(data[i][COL_PROD_QTYFS - 1]) || 0;
      const actual = Math.min(qty, whQty); // ไม่โอนเกินที่มีในคลัง

      sheet.getRange(row, COL_PROD_QTYWH).setValue(whQty - actual);
      sheet.getRange(row, COL_PROD_QTYFS).setValue(fsQty + actual);
      SpreadsheetApp.flush();
      return ok({ sku, transferred: actual, newWH: whQty - actual, newFS: fsQty + actual });
    }
  }
  return error("ไม่พบ SKU: " + sku);
}

// ── 2) หักสต็อกตรงๆ (legacy) ─────────────────────────────────
function deductStock(ss, sku, qty) {
  if (!sku || qty <= 0) return error("sku หรือ qty ไม่ถูกต้อง");

  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const data  = sheet.getDataRange().getValues();
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
      return ok({ sku, deductWH, deductFS, newWH: whQty - deductWH, newFS: fsQty - deductFS });
    }
  }
  return error("ไม่พบ SKU: " + sku);
}

// ── 3) เบิกวัตถุดิบ MTO — หักจากคลัง(H) หลายรายการ ──────────
function deductMaterials(ss, items) {
  if (!Array.isArray(items) || items.length === 0) return error("items ว่างเปล่า");

  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(8000);
  if (!gotLock) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ กรุณาลองใหม่");

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
          data[i][COL_PROD_QTYWH - 1] = newWH; // update in-memory to handle same sku twice
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

// ── 4) อัพเดท order row ──────────────────────────────────────
function updateOrderState(ss, body) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_ORDERS);

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const rowSku  = String(data[i][COL_ORD_SKU  - 1]).trim().toUpperCase();
    const rowDate = String(data[i][COL_ORD_DATE - 1]).trim();
    const matchSku  = body.sku  && rowSku  === body.sku.trim().toUpperCase();
    const matchDate = !body.date || rowDate.includes(String(body.date).trim());
    if (matchSku && matchDate) {
      const row = i + 1;
      if (body.status)      sheet.getRange(row, COL_ORD_STATUS).setValue(body.status);
      if (body.preparedQty != null) sheet.getRange(row, COL_ORD_PREPQTY).setValue(body.preparedQty);
      if (body.printFlag)   sheet.getRange(row, COL_ORD_PRINTFLAG).setValue(body.printFlag);
      return ok({ updated: body.sku, row });
    }
  }
  return ok({ notFound: body.sku });
}

// ── 5) บันทึกผลนับล็อค ──────────────────────────────────────
function updateLockData(ss, lockKey, entries, datetime) {
  if (!lockKey || !Array.isArray(entries)) return error("lockKey หรือ entries ไม่ถูกต้อง");

  const sheet = ss.getSheetByName(SHEET_LOCKS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_LOCKS);

  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(8000);
  if (!gotLock) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ กรุณาลองใหม่");

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
        sheet.appendRow([lockKey, sku, entry.qty, dt]);
      }
    }
    return ok({ lockKey, updated: entries.length });
  } finally {
    lock.releaseLock();
  }
}

// ── 6) ลบ SKU ออกจากล็อค ────────────────────────────────────
function deleteLockEntry(ss, lockKey, sku) {
  if (!lockKey || !sku) return error("lockKey หรือ sku ไม่ครบ");

  const sheet = ss.getSheetByName(SHEET_LOCKS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_LOCKS);

  const data  = sheet.getDataRange().getValues();
  const skuUC = sku.trim().toUpperCase();

  for (let i = data.length - 1; i >= 1; i--) {
    const rKey = String(data[i][COL_LOCK_KEY - 1]).trim();
    const rSku = String(data[i][COL_LOCK_SKU - 1]).trim().toUpperCase();
    if (rKey === lockKey && rSku === skuUC) {
      sheet.deleteRow(i + 1);
      return ok({ deleted: sku, lockKey });
    }
  }
  return ok({ notFound: sku });
}

// ── helpers ──────────────────────────────────────────────────
function ok(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, data })
  ).setMimeType(ContentService.MimeType.JSON);
}
function error(msg) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: false, error: msg })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ZORT API Sync Functions
// รันใน Apps Script Editor (ไม่ใช่ผ่าน doPost)
// ============================================================

function zortHeaders_() {
  return { storename: ZORT_STORE, apikey: ZORT_APIKEY, apisecret: ZORT_SECRET };
}

// รันครั้งเดียวเพื่อดูรายการคลัง
function getZortWarehouses() {
  const res  = UrlFetchApp.fetch(`${ZORT_BASE}/Warehouse/GetWarehouses`,
    { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
  const json = JSON.parse(res.getContentText());
  if (json.list) {
    json.list.forEach(w => Logger.log(`[${w.code}] ${w.name}`));
  } else {
    Logger.log(res.getContentText());
  }
}

// ดึงสินค้าทั้งหมดจาก ZORT พร้อม pagination
function fetchAllZortProducts_(warehousecode) {
  let page = 1;
  const all = [];
  while (true) {
    let url = `${ZORT_BASE}/Product/GetProducts?page=${page}&limit=500`;
    if (warehousecode) url += `&warehousecode=${encodeURIComponent(warehousecode)}`;
    const res  = UrlFetchApp.fetch(url, { method: "get", headers: zortHeaders_(), muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    if (!json.list || json.list.length === 0) break;
    all.push(...json.list);
    Logger.log(`Page ${page}: ${json.list.length} items (total: ${all.length})`);
    if (all.length >= (json.total || 0)) break;
    page++;
    Utilities.sleep(300);
  }
  return all;
}

// Core sync: ดึงสต็อกจาก ZORT คลังที่ระบุ แล้วเขียนลงคอลัมน์เป้าหมาย
function syncZortToColumn_(warehousecode, colIndex, label) {
  Logger.log(`=== Sync ${label} (${warehousecode}) → col ${colIndex} ===`);
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต: " + SHEET_PRODUCTS); return; }

  const products = fetchAllZortProducts_(warehousecode);
  Logger.log(`ZORT: ${products.length} items`);

  const zortMap = {};
  const zortPriceMap = {};
  for (const p of products) {
    const sku = String(p.sku || p.barcode || "").trim().toUpperCase();
    if (sku) {
      zortMap[sku] = Number(p.availablestock || 0);
      zortPriceMap[sku] = Number(p.sellprice || 0);
    }
  }

  const data = sheet.getDataRange().getValues();
  let updated = 0, notFound = 0;
  for (let i = 1; i < data.length; i++) {
    const sku = String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase();
    if (!sku) continue;
    if (zortMap[sku] !== undefined) {
      sheet.getRange(i + 1, colIndex).setValue(zortMap[sku]);
      // Update price in col I if this is WH or FS sync
      if (zortPriceMap[sku] > 0) {
        sheet.getRange(i + 1, 9).setValue(zortPriceMap[sku]); // col I = price
      }
      updated++;
    } else {
      notFound++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log(`อัพเดทแล้ว: ${updated} | ไม่พบใน ZORT: ${notFound}`);
}

// เพิ่มสินค้าใหม่จาก ZORT ที่ยังไม่มีในชีต
function syncNewProductsFromZort() {
  Logger.log("=== ค้นหาสินค้าใหม่จาก ZORT ===");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) { Logger.log("ไม่พบชีต: " + SHEET_PRODUCTS); return; }

  const productsWH = fetchAllZortProducts_(WH_SAI5);
  const productsFS = fetchAllZortProducts_(WH_FRONTSTORE);
  const allProducts = [...productsWH, ...productsFS];

  // deduplicate by sku
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
        sku,                           // col A (col index 1)
        "",                            // col B (name placeholder)
        p.name || "",                  // col C (name)
        p.category || "",              // col D (category)
        p.subCategory || "",           // col E (subCategory)
        p.tag || "",                   // col F (tag)
        0,                             // col G (FS qty) - start with 0
        Number(p.availablestock || 0), // col H (WH qty)
        Number(p.sellprice || 0)       // col I (price)
      ];
      sheet.appendRow(newRow);
      added++;
    }
  }
  SpreadsheetApp.flush();
  Logger.log(`เพิ่มสินค้าใหม่: ${added} รายการ`);
}

// Sync คลังสาย5 → col H
function syncZortWarehouse() {
  syncZortToColumn_(WH_SAI5, COL_PROD_QTYWH, "คลังสาย5");
}

// Sync ดูเหมือนจริง → col G
function syncZortFrontStore() {
  syncZortToColumn_(WH_FRONTSTORE, COL_PROD_QTYFS, "ดูเหมือนจริง");
}

// Sync ทั้ง 2 คลัง (ใช้สำหรับ trigger อัตโนมัติ)
function syncZortBoth() {
  syncNewProductsFromZort();  // เพิ่มสินค้าใหม่ก่อน
  syncZortWarehouse();         // แล้วอัพเดทสต็อก
  syncZortFrontStore();
}

// ตั้ง trigger auto-sync 06:00 ทุกวัน (รันแค่ครั้งเดียว)
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "syncZortBoth") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("syncZortBoth").timeBased().everyDays(1).atHour(6).create();
  Logger.log("✅ ตั้ง trigger: syncZortBoth ทุกวัน 06:00 น.");
}
