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
const COL_PROD_QTYFS  = 7;   // G = จำนวนหน้าร้าน  (แก้ให้ตรง)
const COL_PROD_QTYWH  = 8;   // H = จำนวนคลัง      (แก้ให้ตรง)

// ── คอลัมน์ในชีต orders ──────────────────────────────────────
const COL_ORD_SKU      = 6;   // F = รหัสสินค้า
const COL_ORD_DATE     = 2;   // B = วันที่
const COL_ORD_STATUS   = 3;   // C = สถานะ
const COL_ORD_PREPQTY  = 9;   // I = จำนวนที่จัด
const COL_ORD_PRINTFLAG= 14;  // N = QR code / print flag  (แก้ให้ตรง)

// ── คอลัมน์ในชีต locks ───────────────────────────────────────
const COL_LOCK_KEY     = 1;   // A = lockKey (เช่น A1/01)
const COL_LOCK_SKU     = 2;   // B = SKU
const COL_LOCK_QTY     = 3;   // C = จำนวนที่นับจริง
const COL_LOCK_DATE    = 4;   // D = วันที่เช็ค

// ============================================================

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss    = SpreadsheetApp.getActiveSpreadsheet();

    // 1) หักสต็อกเมื่อส่งสินค้า
    if (body.deductStock) {
      return deductStock(ss, body.sku, Number(body.qty) || 0);
    }

    // 2) อัพเดทสถานะ / printFlag / preparedQty ของ order
    if (body.updateOrderState) {
      return updateOrderState(ss, body);
    }

    // 3) บันทึกผลนับล็อค (ตำแหน่งจัดเก็บ)
    if (body.updateLockData) {
      return updateLockData(ss, body.lockKey, body.entries, body.datetime);
    }

    // 4) ลบ SKU ออกจากล็อค
    if (body.deleteLockEntry) {
      return deleteLockEntry(ss, body.lockKey, body.sku);
    }

    return ok("no action matched");
  } catch (err) {
    return error(err.message);
  }
}

// ── 1) หักสต็อก ──────────────────────────────────────────────
function deductStock(ss, sku, qty) {
  if (!sku || qty <= 0) return error("sku หรือ qty ไม่ถูกต้อง");

  const sheet = ss.getSheetByName(SHEET_PRODUCTS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_PRODUCTS);

  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][COL_PROD_SKU - 1]).trim().toUpperCase() === sku.trim().toUpperCase()) {
      const row = i + 1;
      // หักจากคลังก่อน ถ้าพอ — ถ้าไม่พอค่อยหักจากร้าน
      const whQty = Number(data[i][COL_PROD_QTYWH - 1]) || 0;
      const fsQty = Number(data[i][COL_PROD_QTYFS - 1]) || 0;

      let deductWH = Math.min(qty, whQty);
      let deductFS = qty - deductWH;
      if (deductFS > fsQty) deductFS = fsQty; // ไม่ติดลบเกินที่มี

      sheet.getRange(row, COL_PROD_QTYWH).setValue(whQty - deductWH);
      if (deductFS > 0) sheet.getRange(row, COL_PROD_QTYFS).setValue(fsQty - deductFS);

      return ok({ sku, deductWH, deductFS, newWH: whQty - deductWH, newFS: fsQty - deductFS });
    }
  }
  return error("ไม่พบ SKU: " + sku);
}

// ── 2) อัพเดท order row ──────────────────────────────────────
function updateOrderState(ss, body) {
  const sheet = ss.getSheetByName(SHEET_ORDERS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_ORDERS);

  const data = sheet.getDataRange().getValues();
  // หาแถวที่ตรงกับ sku + date (หรือ sku เดียวถ้าไม่มี date)
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
  return ok({ notFound: body.sku }); // ไม่ error ถ้าหาไม่เจอ (อาจถูกลบไปแล้ว)
}

// ── 3) บันทึกผลนับล็อค ──────────────────────────────────────
function updateLockData(ss, lockKey, entries, datetime) {
  if (!lockKey || !Array.isArray(entries)) return error("lockKey หรือ entries ไม่ถูกต้อง");

  const sheet = ss.getSheetByName(SHEET_LOCKS);
  if (!sheet) return error("ไม่พบชีต: " + SHEET_LOCKS);

  // ── ป้องกัน race condition: ให้ทำทีละคนเท่านั้น ──────────
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(8000); // รอสูงสุด 8 วินาที
  if (!gotLock) return error("ระบบกำลังบันทึกข้อมูลอื่นอยู่ กรุณาลองใหม่");

  try {
    // อ่านข้อมูลล่าสุดหลังได้ lock (ไม่ใช่ก่อน — เพื่อให้เห็นการเปลี่ยนแปลงจากคนอื่น)
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
    lock.releaseLock(); // คืน lock เสมอ แม้จะ error
  }
}

// ── 4) ลบ SKU ออกจากล็อค ────────────────────────────────────
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
  return ok({ notFound: sku }); // ไม่ error ถ้าหาไม่เจอ
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
