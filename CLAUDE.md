# DMJ Inventory Dashboard (Doomuenjing)

ระบบจัดการสต็อกร้านขายสินค้า (แจกัน/ดอกไม้/ของตกแต่ง) — เจ้าของร้าน + พนักงาน
(บางคนเป็นแรงงานต่างด้าวที่ไม่ถนัดเทคโนโลยี) ใช้บนมือถือเป็นหลัก

## สถาปัตยกรรม (สำคัญมาก)

- **Frontend**: React 18 แบบ **ไม่มี build step** — เรนเดอร์ผ่าน Babel standalone ใน browser
  โดยตรง ห้ามใช้ไวยากรณ์ที่ต้อง transpile พิเศษ, ห้าม `import`/`export` ES modules,
  ห้ามเพิ่ม npm dependency ทุกอย่างต้องรันได้จากไฟล์ `.jsx` ที่โหลดผ่าน `<script>`
  - ไฟล์หลัก: `views.jsx` (~10,300 บรรทัด, ทุก View component), `app.jsx` (~670), `ui.jsx` (~190)
  - `Doomuenjing Dashboard.html` = หน้าหลัก + CSS ทั้งหมด (inline `<style>`)
  - `views_fixed.jsx` = ไฟล์เก่า/encoding เพี้ยน (อักษรไทยเป็น `@�@`) — **ไม่ใช่ของจริง** อย่าแก้
  - alias: `uS`=useState, `uE`=useEffect, `uM`=useMemo
- **Backend**: Google Apps Script (`appsscript_complete.gs`, ~3,400 บรรทัด) = REST API + LINE bot
  - Database = Google Sheets
  - มี server-side cache (CacheService, chunk 30k chars, TTL 180s) — แก้ข้อมูลแล้วต้อง
    เรียก `invalidateCache_()`
- **Hosting**: Cloudflare Pages (`dmj-inventory-dashboard.pages.dev`) auto-deploy จาก
  branch `master`

## Constants (ใน appsscript_complete.gs)

```
SHEET_PRODUCTS  = "อัพเดทจำนวนสินค้า"   // สินค้าหลัก: B=SKU, G(7)=หน้าร้าน, H(8)=คลัง, I=ราคา
SHEET_ORDERS    = "ลำดับที่สั่งสินค้า"
SHEET_LOCKS     = "ตำแหน่งจัดเก็บ"      // B=SKU, C=lockKey, D=qty, H=updated
SHEET_TRANSFERS = "รายการโอนสินค้า"
PURCHASES sheet = "รายการซื้อสินค้า"    // col(0-idx) 1=type,2=poNum,4=supplier,11=date,
                                        //   19=status,20=warehouse,24=sku,25=name,26=qty,27=unitPrice
ยอดขายรายเดือน / ยอดขายรายวัน           // header เป็น text format กัน Sheets แปลง MM/YYYY เป็นวันที่
imageUrl sheet  = A=ID,B=SKU,C=ชื่อ,D=manual(fallback),E=ZORT(primary)

WH_SAI5/W0002 = คลังสินค้าสาย5 → col H    WH_FRONTSTORE/W0001 = ดูเหมือนจริง(หน้าร้าน) → col G
ZORT_BASE = "https://open-api.zortout.com/v4"
```

## ความลับ (Security) — ห้ามใส่ในโค้ดที่ push เด็ดขาด

เก็บใน **GAS Script Properties เท่านั้น**: `SHEET_ID`, `OWNER_PIN`, `APP_TOKEN`,
`ZORT_STORE`, `ZORT_APIKEY`, `ZORT_SECRET`, `LINE_ACCESS_TOKEN`, `LINE_USER_ID`
- `APP_TOKEN` ใน `config.js` เป็น public (frontend) — ตรงกับ Script Property `APP_TOKEN`
  (กันคนสุ่มเจอ URL เท่านั้น ไม่ใช่ security จริง)
- ห้ามใส่ model ID / ชื่อ internal ใน commit message, PR, หรือ comment ในโค้ด

## ZORT API endpoints ที่ค้นพบแล้ว (ใช้ได้จริง)

```
GET  /Order/GetOrders              fields: status="Success", orderdateString, list[].sku/number/totalprice
GET  /Product/GetProducts          fields: imagepath(string), imageList[], stock
POST /Product/UpdateProductAvailableStockList   payload: {warehousecode, stocks:[{sku, stock}]}
POST /Product/DecreaseProductStockList          payload: {warehousecode, stocks:[{sku, stock}]}
GET  /Warehouse/GetWarehouses      fields: code, name  (ไม่ใช่ warehousecode/warehousename)
GET  /PurchaseOrder/GetPurchaseOrders  fields: number, customername, purchaseorderdateString,
                                         status, warehousecode, list[].sku/name/number/pricepernumber
POST /Transfer/AddTransfer
GET  /PurchaseReceive/GetPurchaseReceives → 404 (ไม่มี endpoint นี้)
```

ดูเอกสารเต็มที่ `ZORTOUT_API.md`

## บทเรียนที่เจอบ่อย (กับดักที่ต้องระวัง)

1. **GAS function ที่ลงท้าย `_`** จะ **ไม่โผล่ใน dropdown** ของ GAS editor — ถ้าต้องให้
   เจ้าของรันเองต้องตั้งชื่อไม่มี `_` ต่อท้าย
2. **Google Sheets แปลง "05/2026" เป็นวันที่อัตโนมัติ** → ต้อง `setNumberFormat("@")` ก่อนเขียน
3. **CSS grid `repeat(N, 1fr)` ล้นจอ** เพราะ `1fr`=`minmax(auto,1fr)` → ใช้ `minmax(0, 1fr)`
4. **`<input type="number">` มี min-width ในตัว** → flex parent ต้อง `minWidth:0`
5. **column index เพี้ยน** เป็น bug ที่เกิดบ่อยสุด — เช็ค 0-indexed vs 1-indexed
   (`getRange` ใช้ 1-indexed, array ใช้ 0-indexed) ทุกครั้ง
6. **White screen** = JS error ตอน render มักเป็นตัวแปร/state ที่ไม่ได้ประกาศ
7. **squash merge** ทำให้ history แตก → resolve conflict โดยเก็บ HEAD ฝั่งใหม่

## Deploy process (GAS)

เมื่อแก้ `appsscript_complete.gs` เจ้าของต้องทำเอง:
1. copy โค้ดไป GAS editor
2. Deploy → New deployment (หรือ Manage deployments → edit → New version)
3. ถ้า URL เปลี่ยน → อัปเดต `_SHEET_BASE` ใน `config.js` แล้ว push
4. function ใหม่ (sync/setup) ต้องรันเองครั้งแรก + ตั้ง trigger

## Git workflow

- พัฒนาบน feature branch แล้ว merge เข้า `master` (Cloudflare deploy จาก master)
- commit message ภาษาไทยได้, ลงท้ายด้วย session link
- ห้ามสร้าง PR เว้นแต่ผู้ใช้ขอ
