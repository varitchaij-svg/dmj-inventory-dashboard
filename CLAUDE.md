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
              newproduct, frontstore, transfers, orders, ordersummary, mtojobs,
              upload, connect, labels, auditlog, deadstock
  employee:   categories, trends, stock, storage, frontstore, transfers,
              orders, ordersummary, mtojobs, labels
  warehouse:  categories, stock, storage, stockcount, newproduct, orders,
              ordersummary, mtojobs, labels
  frontstore: categories, stock, frontstore, orders, mtojobs, labels
  saler:      categories, stock, orders, mtojobs, labels
}
```
(navtabs: แสดงครบบนแถบเมื่อ ≤9 แท็บ เกินนั้น 5 ตัวแรก + "เพิ่มเติม" — owner/employee เท่านั้นที่เกิน)

tab "categories" = View "สินค้า & สั่ง" = `CategoryView` (views-main.jsx)
tab "stock" = View "สต๊อก & แจ้งเตือน" = `StockView` (views-main.jsx)
tab "frontstore" = View "เช็คหน้าร้าน" = `FrontStoreView` (views-analytics.jsx)
tab "newproduct" = View "เพิ่มสินค้าใหม่" = `AddProductView` (views-main.jsx, owner+warehouse)

## Business Rule: การสร้างรหัสสินค้า (SKU)

โครงสร้าง SKU: `[Product Prefix][Variant Code][Model Number]` เช่น `OL00001`,
`OL19001`, `R01025`, `R10025`, `R19025`

- **Product Prefix** = ตัวอักษรภาษาอังกฤษ 1–3 ตัว แทนประเภทสินค้า
  (เช่น `OL`=มะกอก, `R`=กุหลาบ) — **ห้ามเดา Prefix ที่ไม่เคยเห็น ต้องถามผู้ใช้ก่อนเสมอ**
- **Variant Code** = เลข 2 หลัก ส่วนใหญ่คือรหัสสี (ใช้ตารางรหัสสีมาตรฐานของบริษัท
  เป็น source of truth เท่านั้น — **ห้ามสร้างรหัสสีใหม่เอง** ถ้าสีไม่อยู่ในตาราง ต้องถามผู้ใช้ก่อน)
  บางหมวด (ใบไม้/กิ่งไม้/อุปกรณ์) ไม่ใช้รหัสสี อาจใช้รหัสขนาด/รุ่น/ลำดับแทน —
  **ถ้าไม่ทราบกฎของหมวดนั้น ห้ามเดา ต้องถามผู้ใช้ว่าหมวดนี้ใช้รหัสสี/ขนาด/แบบใด**
- **Model Number** = เลข 3 หลัก (`001–999`) เป็น running ของ **"แบบสินค้า"** ไม่ใช่ running
  ของสี — สินค้าแบบเดียวกันต่างแค่สี ใช้ Model Number เดิมร่วมกัน (เช่น `R01025`/`R10025`/`R19025`
  = กุหลาบแบบเดียวกัน 3 สี) ต่อเมื่อเป็น**แบบสินค้าใหม่**จริง ๆ ถึงจะขึ้น Model Number ใหม่

ก่อนสร้าง/แนะนำ SKU ให้ผู้ใช้ ต้องถามตัวเองตามลำดับ:
1. Product Prefix ของสินค้านี้คืออะไร (มีอยู่แล้วหรือของใหม่)
2. สินค้าอยู่หมวดอะไร
3. หมวดนี้ใช้รหัสสี / รหัสขนาด / รหัสลำดับ / หรือ business rule อื่น
4. สินค้านี้เป็น **แบบใหม่** (หา Model Number ถัดไป) หรือ **สีใหม่ของแบบเดิม**
   (ใช้ Model Number เดิม)

**ข้อห้ามเด็ดขาด**: ห้ามเดา Prefix, ห้ามเดารหัสสี, ห้ามเดา Variant Rule, ห้ามเดา Model Number
— ถ้าข้อมูลไม่ครบข้อใดข้อหนึ่งข้างต้น ต้องถามผู้ใช้กลับทันทีก่อนสร้าง SKU เสมอ (เช่น "Prefix ของ
สินค้านี้คืออะไร", "หมวดนี้ใช้รหัสสีหรือไม่", "เป็นแบบใหม่หรือสีใหม่ของแบบเดิม")

เป้าหมาย: SKU ทุกตัวไม่ซ้ำ, ใช้มาตรฐานเดียวกันทั้งบริษัท, รองรับทั้งการเพิ่มสีของสินค้าเดิม
และการเพิ่มสินค้าแบบใหม่ — ห้ามสร้างรหัสจากการคาดเดาเด็ดขาด

### ตารางรหัสสีมาตรฐาน (source of truth — Variant Code สำหรับหมวดที่ใช้สี)

เก็บใน code จริงที่ `VARIANT_COLOR_CODES` (views-main.jsx) + มี copy ใน `tests/helpers.js`
(ยังไม่ export — เป็น data ล้วน) · **รหัส (code) ไม่ซ้ำ แต่ชื่อสีซ้ำได้** (เช่น "ชมพูเข้ม" = 03 และ 24,
"ชมพู" = 04 และ 25) · **ห้ามสร้างรหัสสีใหม่เอง — สีที่ไม่อยู่ในตารางต้องถามผู้ใช้/แจ้งเจ้าของเพิ่มก่อน**

```
01 แดง        02 แดงอมม่วง   03 ชมพูเข้ม    04 ชมพู        05 ชมพูอ่อน    06 ชมพูขาว
07 กะปิ       08 โอลด์โรส    09 ส้ม         10 เหลือง      11 เหลืองอ่อน  12 ฟ้า
13 ม่วง        14 ม่วงอ่อน     15 ม่วงบานเย็น 16 ม่วงแซงเกรีย 17 น้ำตาล      18 ดำ
19 ขาว        20 น้ำเงิน      21 ครีม        22 ครีมชมพู    23 พีช         24 ชมพูเข้ม
25 ชมพู       26 พีชชมพู     27 ชมพูเขียว   28 ม่วงแดง      29 ชมพูพาสเทล  30 ชมพูแสด
31 เขียว       32 โอวัลติน    33 ชมพูบานเย็น 34 ชมพูโรสวูด  35 ครีมส้ม     36 ขาวครีม
37 แดงอ่อน     38 ขาวชมพู     39 เขียวชมพู   40 เขียวแก่     41 แดงขาว      42 พีชแดง
43 ชมพูอมม่วง  44 ขาวหม่น     45 แดงไวน์     46 แดงเข้ม      47 ขาวลินิน    48 เฮเซลนัท
49 ชมพูเลโมเนด 50 หมอก        51 ฟ้าโทนเทาอมน้ำเงิน 52 เหลืองทอง 53 ชมพูสตรอเบอร์รี่ 54 ไม้เฮเซลนัท
55 ม่วงพลัม    56 ขาวไส้ชมพู  57 ส้มแดง      58 ชมพูอ่อนแซมขาว 59 ชมพูอ่อนแซมชมพู 60 เขียวอ่อน
61 ขาวไส้ม่วง  62 ขาวไส้เหลือง 63 ขาวไส้ส้ม   64 เหลืองไส้เหลือง 65 เหลืองอ่อนไส้เหลือง 66 น้ำตาลเข้ม
67 เทา        68 เขียวฟ้า     69 เบจ         70 ม่วงเขียวอ่อน 71 เหลืองไส้เข้ม 72 เขียวขุ่น
73 เขียวขอบขาว 74 ขาวแซมเขียว 75 ขาวแซมเขียวแดง 76 เขียวแซมม่วง 77 เขียวไล่สี  78 เขียวเข้มผสมอ่อน
79 เขียวเข้ม   80 ม่วงครีม     81 ม่วงลายจุด  82 ขาวลายจุด   83 เขียวเหลือง 84 น้ำเงินม่วง
85 เหลือง,ม่วง 86 น้ำตาลเหลือง 87 เขียวครีม   88 น้ำเงินเข้ม  89 น้ำเงินอ่อน 90 ม่วงอมชมพู
91 ขาวอมเหลือง 92 เหลืองไส้ส้ม 93 ขาวไส้ม่วงอ่อน 94 ชมพูม่วงอ่อน 95 ม่วงฟ้า   96 ไวโอเล็ต
97 ม่วงขาว     98 ขาวอมเขียว  99 แดงชมพู
```

**Variant Rule ต่อหมวด**: หมวดดอกไม้ที่มีสีเยอะ → ใช้รหัสสีจากตารางนี้ · หมวดใบไม้/กิ่งไม้/
อุปกรณ์/ขนาด → ใช้เลขลำดับ (`01,02,03…`) หรือรหัสขนาด (เล็ก=01 กลาง=02 ใหญ่=03) แทน —
**หมวดไหนใช้กฎอะไร ยังไม่มี mapping ตายตัว ให้ถามผู้ใช้กลับทุกครั้งที่ไม่แน่ใจ** (ผู้ใช้เองก็จำหมวดไม่ครบ)

(หมายเหตุ: `suggestNextSku` ในโค้ด (views-main.jsx) เป็นตัวช่วยเดา running number แบบเก่า (บวกเลขท้าย)
— **ไม่รู้จัก business rule นี้** · โครงสร้างมาตรฐานใช้ `parseSkuParts`/`nextModelForPrefix`/
`VARIANT_COLOR_CODES` แทน · เวลาคุยกับผู้ใช้เรื่องสร้าง SKU ให้ยึด business rule ข้างต้นเป็นหลัก)

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

**มี Vitest test suite แล้ว** — 440 tests, 14 test files, ทั้งหมด pass

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
11. **วันที่ในชีตเป็นปี พ.ศ.**: client เขียน datetime ด้วย `toLocaleString("th-TH")`
    → ได้ "4/7/2569 11:30:45" — `new Date()` ตีเป็น ค.ศ. 2569 (อนาคต 543 ปี)
    ต้อง parse ด้วย `parseCheckDateMs` (views-analytics.jsx, ลบ 543 เมื่อปี ≥ 2400)

## Features ที่เพิ่มล่าสุด (Sprint 2)

- **กราฟเทียบปีต่อปี (YoY)** — OverviewView (views-main.jsx): `buildYoYSeries` จัด
  monthlyByCat เป็น 12 เดือน × ปี + chip สรุปเดือนล่าสุด vs ปีก่อน + เดือนหน้าปีที่แล้ว
- **เกณฑ์แจ้งเตือนถาวร** — เก็บใน Script Property `STOCK_THRESHOLDS` (GAS:
  `readThresholds_`/`saveThresholds_`/`sanitizeThresholds_`), StockView auto-save
  หลังแก้ 1.5 วิ ผ่าน `{saveThresholds:true, thresholds:{default,overrides,coverMonths}}`
- **คิว "ควรนับก่อน"** — StockCountView (views-analytics.jsx): `abcClassify` (A/B/C จาก
  cumulative revenue 80/95) + lastCheck จาก verifiedLockMap ครบกำหนด A=30/B=60/C=90 วัน
  แตะแล้วพาไปนับล็อคนั้นเลย
- **คิว "ควรเช็คก่อน" หน้าร้าน** — FrontStoreView: ABC + `p.frontStoreCheckedAt`
  (GAS อ่านชีต "จำนวนหน้าร้าน" col I) ครบกำหนดถี่กว่าคลัง A=7/B=14/C=30 วัน
  แตะแล้ว set search + scroll ไปสินค้านั้น
- **"เจอสินค้าอื่นในล็อคนี้"** — StockCountView step 3: ค้นหาสินค้าทั้งระบบ เพิ่มเข้า
  รายการนับ → save ผ่าน `syncLockData` พร้อม `isNew:true` (append แถวในชีตตำแหน่ง)
  **ไม่ส่งเข้า `confirmStockCount`** — กันจำนวนที่เจอหลงล็อคไปทับยอดคลังรวม + push ZORT ผิด
- **SKU builder ตาม business rule** — AddProductView (views-main.jsx): ช่อง SKU รื้อเป็น 3 ส่วน
  `[Prefix][Variant 2 หลัก][Model 3 หลัก]` + โหมด **"🆕 แบบใหม่"** (เลือก/พิมพ์ Prefix →
  `nextModelForPrefix` หาเลข Model ถัดไป) vs **"🎨 สีใหม่ของแบบเดิม"** (ค้นหาแบบเดิม `parseSkuParts`
  → ล็อค prefix+model → เลือกแค่รหัสสีใหม่, disable สีที่มีแล้ว) · Variant เลือกจาก **ตารางรหัสสี**
  (`VARIANT_COLOR_CODES`, ค้นหาได้) หรือ **พิมพ์เอง** (ขนาด/ลำดับ สำหรับใบไม้) · โชว์ SKU ที่ประกอบ
  แบบ live + เช็คซ้ำทันที · ยึด business rule ข้างบน ไม่ใช้ `suggestNextSku` แล้ว
  - **ล็อกเลข Model ตอนเพิ่มแบบใหม่หลายสี** (`heldDesign` state): พอเซฟสีแรกของแบบใหม่เสร็จ
    `onAdded` refetch → `nextModelForPrefix` จะรันเลขต่อ ทำให้สีถัดไปของแบบเดียวกันได้เลขใหม่ (บั๊ก)
    → ล็อก `{prefix,model}` ไว้หลังเซฟ ให้สีถัดไปคงเลข Model เดิม + โชว์แบนเนอร์ "🔒 กำลังเพิ่มสีของแบบใหม่"
    + ปุ่ม "ขึ้นแบบใหม่ ▸" (`setHeldDesign(null)`) · ล้าง lock เมื่อเปลี่ยน prefix/โหมด · `effTaken`
    disable สีที่แบบนี้ (prefix+model) มีแล้วทั้ง 2 โหมด
- **เพิ่มสินค้าใหม่เข้า ZORT** — AddProductView (views-main.jsx, owner+warehouse): ฟอร์ม
  SKU(=barcode, จาก SKU builder ข้างบน)/ชื่อ/ราคา/หมวด/**ซัพพลายเออร์(TAG)**/จำนวน+คลัง
  หน่วย fix "ชิ้น" · เช็คซ้ำ 2 ชั้น (client `data.products` + server `checkSkuExists` 2 ชีต)
  · ช่องซัพพลายเออร์ = TAG (ไม่บังคับ) มีชิปแนะนำจาก `p.lastSupplier||p.vendor` ที่เคยใช้ + พิมพ์เองได้
  GAS `addNewProduct`: POST `/Product/AddProduct` → `pushStockToZort_` ตั้งสต็อกตาม warehouse
  → append ชีต SHEET_PRODUCTS (**col F = tag/ซัพพลายเออร์**) → audit → `invalidateCache_()` · ZORT payload:
  `{sku,barcode,name,sellprice,unittext:"ชิ้น",category[,tag]}` (ส่ง tag เฉพาะเมื่อกรอก) · ถ้า AddProduct fail ไม่เขียนชีต
  · สินค้าใหม่ขึ้นเว็บทันที (ไม่ต้อง sync ZORT ใหม่ทั้งก้อน) ผ่าน SELF-HEAL block ใน `readProducts_`
  (ดึงสินค้าที่อยู่ในชีตสต็อกแต่ยังไม่มีใน SHEET_PRODUCT_META มาแสดง พร้อม tag จาก col F)
- **ดึงรูปสินค้าจาก ZORT แบบ on-demand** — ProductCard (views-main.jsx): การ์ดที่ไม่มีรูป
  มีปุ่ม "🔄 ดึงรูปจาก ZORT" → `syncFetchProductImage(sku)` → GAS `fetchProductImage`
  (targeted GetProducts ด้วย `keyword=sku` ไม่ fetch ทั้งคลัง) → `pickZortImage_` → เขียน col E
  ชีต imageUrl (ZORT auto ชนะ manual) → `invalidateCache_()` · ใช้หลังอัปรูปในแอป ZORT เสร็จ
  (ตอน AddProduct ยังไม่มีรูป) · ProductCard เก็บ `imgOverride` state โชว์รูปทันทีไม่ต้อง refresh

## ระบบแจ้งเตือน LINE v2 — คิว + throttle + 2 ช่องทาง (Sprint 3)

**ปัญหาเดิม**: quota push รายเดือนของ LINE OA หมดกลางเดือน → บอทเงียบ → งานสะดุด
ตัวกินหนักสุด = การ์ด order (`sendLineGroupOrderCard_`) ส่ง **2 ข้อความ/ออเดอร์** ยิงเป็นชุดตอนสั่งของรัว

**สถาปัตยกรรม** (ทั้งหมดใน `appsscript_complete.gs`, section "ระบบคิวแจ้งเตือน LINE v2"):
- **คิวบนชีต** `SHEET_NOTI_QUEUE` ("คิวแจ้งเตือน LINE") — cols: id, createdAt, channel, priority,
  type, dedupKey, target, payload(JSON), status, attempts, nextRetryAt, lastError, sentAt
- **`enqueueNoti_({channel,priority,type,dedupKey,target,payload})`** — เขียนเข้าคิว · **dedup** ด้วย
  dedupKey (มี pending คีย์เดียวกันแล้ว → ข้าม กันส่งซ้ำ) · ถ้า enqueue พัง → ส่งตรงกันข้อความหาย
- **`drainNotiQueue()`** — trigger ทุก 1 นาที ปล่อยคิว · throttle `NOTI_MAX_SENDS_PER_RUN` (default 4)
  push/channel/รอบ · retry/backoff: quota→30 นาที, error→2^att นาที (cap 15), ครบ `NOTI_MAX_ATTEMPTS` (6) → failed
- **coalesce order แบบ time-window** (`pushOrderBatch_`/`notiOrderBatchWindowMin_`): ปริมาณ order จริง
  (~5-10/วัน) ชนเพดานฟรี 200/เดือนได้ง่ายถ้าส่งทุกครั้ง จึง (1) **รวมทุกออเดอร์ที่มาห่างกันแต่ยังในหน้าต่างเดียวกัน
  เป็นชุดเดียว** — ไม่ flush ทันที รอจนออเดอร์เก่าสุดในคิวรอครบ `NOTI_ORDER_BATCH_MINUTES` (default 20 นาที)
  หรือคิวยาวเกิน `NOTI_ORDER_BATCH_MAX` (default 15) ค่อย flush (2) **ตัดเหลือข้อความเดียว/ชุด** (@All + bullet
  list ชื่อ/จำนวน) แทน mention+flex carousel เดิม — ยังคง @All ไว้เพราะสำคัญกับพนักงานที่ไม่ถนัดเทคโนโลยี
  ตัดเฉพาะ carousel (สวยแต่แพง) ออก (3) **หน้าต่างยืดอัตโนมัติเมื่อใกล้เพดาน**: ใช้ quota เดือนนี้ (`notiQuotaUsed_`)
  ถึง 60% ของ `NOTI_MONTHLY_CAP` (default 200) → หน้าต่าง ×2, ถึง 85% → ×4 (ประหยัดสุดตอนใกล้หมด กันเงียบซ้ำ)
- **`sendPendingTruckOrders`** เดิมส่งตรงผ่าน `UrlFetchApp` ไม่ผ่านคิว (นับ quota ไม่ได้) — เปลี่ยนให้ผ่าน
  `enqueueNoti_` เหมือนกัน ตัดเหลือ 1 ข้อความ/รอบ (bullet list แทน mention+carousel) + dedup กันรัน trigger ซ้ำ
- **2 ช่องทาง**: `primary` = `LINE_ACCESS_TOKEN` เดิม (งานจัดของ/order priority 1 ห้ามเงียบ) ·
  `secondary` = `LINE_ACCESS_TOKEN_2` (สรุป/สต็อกต่ำ/health/ZORT-fail) · ไม่ตั้ง token2 → fallback ใช้ตัวหลัก
  · `lineToken_/lineGroupTarget_/resolveNotiTarget_/linePush_` จัดการ routing · target: ''=กลุ่ม, 'user'=LINE_USER_ID
  · **หมายเหตุ LINE ตัวที่ 2**: 1 กลุ่มไลน์ใส่ OA ได้แค่ 1 ตัว — ต้องสร้างกลุ่มแยกให้บอทตัวที่ 2 เชิญเข้ากลุ่มเดิมไม่ได้
    (LINE เตะออกอัตโนมัติ) · userId ก็ผูกกับแต่ละ OA แยกกัน (`target:'user'` บน secondary ใช้ `LINE_USER_ID_2`
    ถ้าตั้งไว้ ไม่ตั้ง fallback ไปกลุ่มแทน)
- **นับ quota รายเดือน/ช่องทาง** ใน Script Property `NOTI_SENT_{channel}_{yyyyMM}` — ตัวนี้เป็นทั้งข้อมูลประกอบ
  และ input ให้ `notiOrderBatchWindowMin_` ใช้ตัดสินใจยืดหน้าต่าง batch อัตโนมัติ
- **SAFE ROLLOUT**: ทุกอย่าง gate ด้วย `NOTI_QUEUE_ENABLED='true'` — ยังไม่เปิด → `enqueueNoti_` ส่งตรง
  ทันทีแบบเดิมทุกประการ (merge แล้วไม่พังของเดิม) · เปิดจริงเมื่อเจ้าของรัน **`setupNotiSystem()`** 1 ครั้ง
- **สรุปรายวัน → รายสัปดาห์ + รายเดือน**: `sendWeeklySummary` (จันทร์ 08:00) + `sendMonthlySummary`
  (วันที่ 1, 08:00) ส่ง secondary · `sendDailyMorningSummary` เลิก trigger (setupNotiSystem ลบให้)
- **routed เข้าคิวแล้ว**: order card + truck reminder (primary), low stock, health check, ZORT-fail,
  scheduledLineReminder (secondary)

**เจ้าของต้องทำเองใน GAS editor** (clasp push ไม่รันให้):
1. (ถ้าใช้ 2 ช่องทาง) สร้าง LINE OA ตัวที่ 2 → ตั้ง Script Property `LINE_ACCESS_TOKEN_2`
   (+ `LINE_GROUP_ID_2` ถ้าแยกกลุ่ม — **ต้องเป็นกลุ่มใหม่ ไม่ใช่กลุ่มเดิม**) + เชิญบอทตัวที่ 2 เข้ากลุ่มใหม่นี้
   · ไม่ทำก็ได้ ระบบ fallback ไปช่องเดียว ยังได้ประโยชน์จากคิว+coalesce+batch window เต็มที่
2. รัน **`setupNotiSystem()`** 1 ครั้ง (เปิดคิว + ตั้ง trigger drain/สัปดาห์/เดือน + ลบ trigger รายวัน)
3. ปรับ `NOTI_ORDER_BATCH_MINUTES`/`NOTI_MONTHLY_CAP` ผ่าน Script Properties ได้ถ้าอยากปรับความเร่งด่วน/เพดานให้ตรงแพ็กเกจ LINE จริง
3. rollback ได้ด้วย `disableNotiSystem()` (กลับไปส่งตรงแบบเดิม)

## Features ที่เพิ่มก่อนหน้า (Sprint 1)

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
