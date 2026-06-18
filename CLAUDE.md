# DMJ Inventory Dashboard (Doomuenjing)

ระบบจัดการสต็อกร้านขายสินค้า (แจกัน/ดอกไม้/ของตกแต่ง) — เจ้าของร้าน + พนักงาน
(บางคนเป็นแรงงานต่างด้าวที่ไม่ถนัดเทคโนโลยี) ใช้บนมือถือเป็นหลัก

## สถาปัตยกรรม (สำคัญมาก)

- **Frontend**: React 18 แบบ **ไม่มี build step** — เรนเดอร์ผ่าน Babel standalone ใน browser
  โดยตรง ห้ามใช้ไวยากรณ์ที่ต้อง transpile พิเศษ, ห้าม `import`/`export` ES modules,
  ห้ามเพิ่ม npm dependency ทุกอย่างต้องรันได้จากไฟล์ `.jsx` ที่โหลดผ่าน `<script>`
  - `views-main.jsx` (~6,600 บรรทัด) — View components ทั้งหมด **ยกเว้น** FrontStoreView/analytics
    (CategoryView, StockView, ProductCard, OrderModal, SupplierView ฯลฯ)
  - `views-analytics.jsx` (~5,300 บรรทัด) — FrontStoreView + analytics
  - **`Doomuenjing Dashboard.html` โหลดจริงแค่: ui.jsx → views-main.jsx → views-analytics.jsx → app.jsx**
    (การแยก views-main / views-analytics ตั้งใจทำเพื่อลด Babel compile time — ห้ามกลับไปรวมเป็นไฟล์เดียว
    มิฉะนั้น FrontStoreView จะถูกประกาศซ้ำ → redeclaration error + compile ช้า)
  - `app.jsx` (~670 บรรทัด) — routing, data loading, ROLE_TABS
  - `ui.jsx` (~190 บรรทัด) — shared UI primitives
  - `Doomuenjing Dashboard.html` = หน้าหลัก + CSS ทั้งหมด (inline `<style>`)
  - alias: `uS`=useState, `uE`=useEffect, `uM`=useMemo, `uC`=useCallback
- **Backend**: Google Apps Script (`appsscript_complete.gs`, ~3,500 บรรทัด) = REST API + LINE bot
  - Database = Google Sheets
  - มี server-side cache (CacheService, chunk 30k chars, TTL 180s) — แก้ข้อมูลแล้วต้อง
    เรียก `invalidateCache_()`
  - `invalidateCache_(skipTsUpdate)` — ถ้า `skipTsUpdate=true` จะล้าง payload cache อย่างเดียว
    ไม่ bump `dmj_last_write_ts` (ใช้ที่ต้น doPost ก่อน conflict check เพื่อไม่ poison timestamp)
- **Hosting**: Cloudflare Pages (`dmj-inventory-dashboard.pages.dev`) auto-deploy จาก
  branch `master`

## Roles & Tabs

```
ROLE_TABS = {
  owner:      overview, categories, trends, stock, storage, stockcount,
              frontstore, transfers, orders, ordersummary, mtojobs,
              upload, connect, labels, auditlog, deadstock
  employee:   categories, trends, stock, storage, frontstore, transfers,
              orders, ordersummary, mtojobs, labels
  warehouse:  categories, stock, storage, stockcount, orders, ordersummary,
              mtojobs, labels
  frontstore: categories, stock, frontstore, orders, mtojobs, labels
  saler:      categories, stock, orders, mtojobs, labels
}
```

tab "categories" = View "สินค้า & สั่ง" = `CategoryView` (views-main.jsx)
tab "stock" = View "สต๊อก & แจ้งเตือน" = `StockView` (views-main.jsx)
tab "frontstore" = View "เช็คหน้าร้าน" = `FrontStoreView` (views-analytics.jsx)

## Constants (ใน appsscript_complete.gs)

```
SHEET_PRODUCTS  = "อัพเดทจำนวนสินค้า"   // B=SKU, G(7)=หน้าร้าน, H(8)=คลัง, I=ราคา
SHEET_ORDERS    = "ลำดับที่สั่งสินค้า"
  COL_ORD_TYPE=1(A), COL_ORD_DATE=2(B), COL_ORD_STATUS=3(C),
  COL_ORD_SKU=6(F), name=G, orderQty=H, COL_ORD_PREPQTY=9(I),
  image=J, remaining=K, COL_ORD_PRINTFLAG=14(N)
  status values: "รอ"=pending, "สำเร็จ"=done, "ส่งแล้ว"=shipped
  printFlag values: "print"=selected, "no-print"=skip, "printed"=already printed

SHEET_LOCKS     = "ตำแหน่งจัดเก็บ"      // B=SKU, C=lockKey, D=qty, H=updated
SHEET_TRANSFERS = "รายการโอนสินค้า"     // shipments log (warehouse→frontstore)
  COL_SHIP_REF=1(A), date=B, status=C, from=D, to=E, SKU=F, name=G,
  qty=H, prepared=I, image=J, receivedQty=K, receivedStatus=L,
  COL_SHIP_RECVAT=13(M)←ว่าง=รอรับ/มีค่า=รับแล้ว, receivedBy=N
PURCHASES sheet = "รายการซื้อสินค้า"    // col(0-idx) 1=type,2=poNum,4=supplier,11=date,
                                        //   19=status,20=warehouse,24=sku,25=name,26=qty,27=unitPrice
ยอดขายรายเดือน / ยอดขายรายวัน           // header เป็น text format กัน Sheets แปลง MM/YYYY เป็นวันที่
imageUrl sheet  = A=ID,B=SKU,C=ชื่อ,D=manual(fallback),E=ZORT(primary)

WH_SAI5/W0002 = คลังสินค้าสาย5 → col H (qtyWH)
WH_FRONTSTORE/W0001 = ดูเหมือนจริง(หน้าร้าน) → col G (qtyStore)
ZORT_BASE = "https://open-api.zortout.com/v4"
```

## Data payload (GAS → Frontend)

`data` object ที่ frontend ได้รับมีทุก field นี้สำหรับทุก role:
```
data.products[]     — สินค้า (qtyWH=คลัง, qtyStore=หน้าร้าน, soldQty, soldRev ฯลฯ)
data.orders[]       — ลำดับที่สั่งสินค้า (pending = status "รอ")
data.shipments[]    — รายการโอนสินค้า (pending = receivedAt ว่าง/null)
data.transfers[]    — ประวัติโอน
data.purchases[]    — รายการซื้อ
data.mtoJobs[]      — งานจัดพิเศษ
data.storage{}      — ตำแหน่งจัดเก็บ
```

## Conflict detection

```
shouldRejectConflict_(clientLoadedAt, sheetLastModified, slopMs=5000)
```
- `clientLoadedAt` = `window._dataLoadedAt` (set จาก `d.lastModified` ตอน fetch)
- `dmj_last_write_ts` เก็บใน Script Properties (ไม่ใช่ CacheService) — ค่าจริงเสมอ
- **ต้องส่ง `clientLoadedAt: window._dataLoadedAt || 0`** ใน payload ของ transferStockBatch
  และ closeMtoJob มิฉะนั้น conflict check ถูก bypass ทั้งหมด
- doPost บรรทัด 227 เรียก `invalidateCache_(true)` (skipTsUpdate) — ล้าง cache อย่างเดียว
  ไม่ bump timestamp ก่อน conflict check เพื่อไม่ให้ทุก request ดู conflict

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

## Testing

**มี Vitest test suite แล้ว** — 176 tests, 10 test files, ทั้งหมด pass

```bash
npm test              # run tests
npm run test:coverage # coverage report (tests/helpers.js)
```

- `tests/helpers.js` — CJS module รวม pure function copies สำหรับ Node testing
  export: `compareSku, mtoBase, parseQty_, parseNum_, parseLocation_,
           detectColor, COLOR_MAP, COLOR_KEYS,
           monthKey_, dayKey_, deductStockCore, netOf, enrichDataCore`
- `tests/*.test.js` — parsing, color, stock, dates, mto, app, format, schema, conflict, orderstate
- export pattern ในไฟล์ต้นฉบับ:
  `if (typeof module!=='undefined') module.exports={...}` (browser ข้าม)

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
8. **printFlag sync ข้ามอุปกรณ์**: กด "พิมพ์ label" ต้องเรียก
   `syncOrderUpdate(order, {printFlag:"printed"})` ด้วย ไม่ใช่แค่ localStorage
   อุปกรณ์อื่น detect ได้ผ่าน `order.printFlag === "printed"` หลัง poll
9. **`invalidateCache_` timestamp poisoning**: doPost เรียก `invalidateCache_(true)`
   (skipTsUpdate) ที่บรรทัด 227 — เพื่อไม่ bump timestamp ก่อน conflict check
   แต่ละ write function เรียก `invalidateCache_()` (ไม่มี arg) ใน finally เองหลังเขียนจริง
10. **multi-token search**: split ด้วย `/\s+/` แล้ว AND-match ทุก token กับ hay string
    (`tokens.every(t => hay.includes(t))`) — ทั้ง StockView และ FrontStoreView ใช้แล้ว

## Features ที่เพิ่มล่าสุด (Sprint 1)

- **Multi-token search** — StockView (views-main.jsx) + FrontStoreView (views-analytics.jsx)
- **ปุ่ม "📦 สั่ง"** — ใน StockView ทุก row ที่ `qtyWH > 0` (ไม่ต้องเปิด reorder mode)
- **Transfer modal + Toast** — หลังโอนสำเร็จ/ล้มเหลวใน StockView และ FrontStoreView
- **Banner "รายการสั่งที่ยังค้างอยู่"** — ใน CategoryView ดึงจาก `data.orders` filter `status==="รอ"`
- **Banner "สินค้าที่โอนแล้ว รอรับ"** — ใน StockView ดึงจาก `data.shipments` filter `!receivedAt`

## Deploy process (GAS) — auto-deploy แล้ว ✅

**ไม่ต้อง copy โค้ดเข้า GAS editor เองอีกต่อไป** — มี GitHub Actions auto-deploy
(`.github/workflows/deploy-gas.yml`):
- trigger: push เข้า `master` ที่แตะ `appsscript_complete.gs` หรือ `appsscript.json`
- รัน `clasp push --force` ด้วย credential ใน secret `CLASPRC_JSON`
- code ใหม่เข้า GAS อัตโนมัติภายในไม่กี่นาทีหลัง merge เข้า master

**สรุป: แก้ `.gs` → commit → merge เข้า `master` → push → จบ** (Actions ทำที่เหลือ)

ข้อควรระวังที่ยังต้องทำเอง:
1. **function ใหม่ (sync/setup) ที่ต้องรันครั้งแรก + ตั้ง trigger** — clasp push ไม่รัน
   ให้ ต้องเปิด GAS editor รันเอง 1 ครั้ง / ตั้ง time-driven trigger เอง
2. ถ้า web app deployment URL เปลี่ยน → อัปเดต `_SHEET_BASE` ใน `config.js` แล้ว push
   (ปกติ clasp push ไม่เปลี่ยน URL — deployment เดิมรัน code ใหม่เลย)

## Git workflow

- พัฒนาบน feature branch แล้ว merge เข้า `master` (Cloudflare deploy จาก master)
- commit message ภาษาไทยได้, ลงท้ายด้วย session link
- ห้ามสร้าง PR เว้นแต่ผู้ใช้ขอ
