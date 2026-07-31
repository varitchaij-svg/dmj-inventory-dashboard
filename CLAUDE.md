# DMJ Inventory Dashboard (Doomuenjing)

ระบบจัดการสต็อกร้านขายสินค้า (แจกัน/ดอกไม้/ของตกแต่ง) — เจ้าของร้าน + พนักงาน
(บางคนเป็นแรงงานต่างด้าวที่ไม่ถนัดเทคโนโลยี) ใช้บนมือถือเป็นหลัก

## สถาปัตยกรรม (สำคัญมาก)

- **Frontend**: React 18 แบบ **ไม่มี build step** — เรนเดอร์ผ่าน Babel standalone ใน browser
  โดยตรง ห้ามใช้ไวยากรณ์ที่ต้อง transpile พิเศษ, ห้าม `import`/`export` ES modules,
  ห้ามเพิ่ม npm dependency ทุกอย่างต้องรันได้จากไฟล์ `.jsx` ที่โหลดผ่าน `<script>`
  - `views-main.jsx` (~6,600 บรรทัด) — View components ทั้งหมด **ยกเว้น** FrontStoreView/analytics
    (CategoryView, StockView, ProductCard, OrderModal, SupplierView ฯลฯ)
  - `views-analytics.jsx` (~5,300 บรรทัด) — FrontStoreView + analytics + QuoteFollowupView
  - `views-quote.jsx` — QuotationFormView (สร้างใบเสนอราคาเอง แทนเข้า ZORT UI) + sync helper
    (syncCreateQuotation/syncSaveQuotationDraft/syncGetQuotationDrafts/syncDeleteQuotationDraft)
    ใช้ computeBillTotals/POS_SALES_CHANNELS/POS_TRANSFER_INFO/syncSearchContact จาก
    views-analytics.jsx (global scope เดียวกัน) — เรียกจาก `QuoteFollowupView` โหมด `mode==="create"`
  - `views-attendance.jsx` (~750 บรรทัด) — ลงเวลาเข้า-ออกงาน: `AttendanceView` (พนักงาน — `Seg`
    สลับ "⏱️ วันนี้"/"📅 เวลาของฉัน", ปุ่มสลับสถานะ 3 กลุ่ม), `MyAttendanceMonth` (สรุปเดือนของ
    ตัวเอง ทุก role), `AttendanceTodayView` (owner ดูใครเข้างาน + แก้ย้อนหลัง), `AttFixModal` ·
    helper `attPost` แนบ `sessionToken` จาก localStorage ให้ทุก request เอง (ไม่ใช้ syncXxx ของไฟล์อื่น)
  - **`Doomuenjing Dashboard.html` โหลดจริงแค่: ui.jsx → views-main.jsx → views-analytics.jsx → views-quote.jsx → views-attendance.jsx → app.jsx**
    (การแยกไฟล์ตั้งใจทำเพื่อลด Babel compile time — ห้ามกลับไปรวมเป็นไฟล์เดียว
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
  dev:        ทุกแท็บที่มีในระบบ (รวม margin ที่ยังซ่อนจาก owner)
  owner:      attendance, overview, customers, pos, quotefollowup, categories,
              stock, orders, tracking, frontstore, ordersummary, transfers,
              storage, stockcount, newproduct, deadstock, trends, season,
              mtojobs, labels, upload, connect, auditlog, staff, atttoday
  employee:   attendance, categories, trends, stock, storage, frontstore,
              transfers, orders, tracking, ordersummary, mtojobs, labels
  warehouse:  attendance, whhome, orders, stock, stockcount, storage,
              categories, newproduct, ordersummary, tracking, mtojobs, labels
  frontstore: attendance, categories, stock, frontstore, orders, tracking,
              mtojobs, labels
  saler:      attendance, pos, categories, stock, orders, tracking,
              quotefollowup, mtojobs, labels
  storedevice: attendance, pos, quotefollowup, categories, stock, tracking,
              orders, mtojobs, labels, atttoday
}
```
role `storedevice` = บัญชี LINE กลาง ("เครื่องกลาง"/เครื่องแท็บเล็ตประจำร้าน ใช้ร่วมกันหลายคน
ไม่ผูกกับพนักงานคนใดคนหนึ่ง) — สิทธิ์ API เท่า `saler` ทุกอย่าง (`ROLE_ACTIONS_`/
`IMMEDIATE_GATE_ACTIONS_` มี `storedevice` คู่กับ `saler` ทุกจุด) + เพิ่มแท็บ `atttoday`
("ใครเข้างานวันนี้") ให้ดูว่าใครทำงาน/พัก/เข้าห้องน้ำอยู่ได้ — **ดูอย่างเดียว** แก้เวลาย้อนหลัง
(`fixAttendance`) ไม่ได้ (`fixAttendanceHandler_` ยังเช็ค `isAdminRole_` เดิม, ไม่รวม
`storedevice`) · frontend ซ่อนปุ่มแก้/เพิ่มการลงเวลาใน `AttendanceTodayView` ด้วย prop
`canEdit={isAdminRole(role)}` (app.jsx ส่งเข้าไป)
(ค่าจริงอยู่ที่ `app.jsx` เสมอ — ถ้าสองที่ไม่ตรงให้เชื่อ `app.jsx` · `tests/browser/run.cjs`
ก็ mirror ตารางนี้ไว้ (บางส่วน — ไม่ครบทุก role/tab) ถ้าแก้ ROLE_TABS ควรอัปเดตที่นั่นด้วย)
(navtabs: **owner/dev เท่านั้น** ที่ได้ nav 2 ชั้นแบบกลุ่ม (`OWNER_GROUPS`) — 5 หมวดหลัก + "อื่นๆ"
ถ้ามีเหลือ · role อื่นทั้งหมด (employee/warehouse/frontstore/saler) ไม่มี "เพิ่มเติม" เลย ไม่ว่าจะกี่แท็บ
โชว์ทุกแท็บบนแถบเลื่อนแนวนอนเดียว — ลำดับใน ROLE_TABS จึงมีผลแค่ว่าอันไหนอยู่ซ้ายสุด/ไม่ต้องเลื่อนหา)
(**`tests/browser/run.cjs` แก้ NAV_FAIL แล้ว (2026-07-31) — ผ่าน 77/77** · `navigateTo()` รองรับ
nav 2 ชั้นของ owner/dev แล้ว: ลองเมนูย่อยของหมวดที่เปิดอยู่ก่อน ไม่เจอค่อยไล่กดหมวดในชั้น 1 ทีละอัน
จนกว่าเมนูย่อยที่ต้องการจะโผล่ (**ไล่กดแทนการ mirror `OWNER_GROUPS` ไว้ในเทสต์ — จะได้ไม่ drift
เวลาย้ายแท็บข้ามหมวด**) · `harness.html` โหลด `views-quote.jsx`/`views-attendance.jsx` ครบตาม
ลำดับจริงแล้ว (เดิมขาด → ทุก role ที่ไม่ใช่ owner white-screen ที่ `AttendanceView`))

**role `dev`** = ผู้ดูแลระบบ/คนพัฒนา — สิทธิ์เท่า owner ทุกอย่าง + เห็นแท็บที่ยังซ่อน
- frontend: `isAdminRole(r)` (app.jsx) ใช้แทนการเทียบ `role === "owner"` ในเรื่อง nav/สิทธิ์
- View ต่าง ๆ เช็ค `role === "owner"` อยู่หลายสิบจุด → app.jsx ส่ง `viewRole` (dev→"owner")
  เข้าไปแทน `role` เพื่อไม่ต้องไล่แก้ทุกจุด · `role` ตัวจริงยังเป็น "dev" ใช้กับ nav/ป้ายชื่อ/audit
- backend: `isAdminRole_(role)` (appsscript_complete.gs) ใช้แทน `role === 'owner'`
  ทุกจุดที่ตรวจสิทธิ์ + `VALID_ROLES` มี "dev" แล้ว
- เจ้าของตั้งให้ใครเป็น dev ได้ที่แท็บ "พนักงาน" (`STAFF_ROLE_OPTIONS` ใน views-analytics.jsx)
- **ข้อควรรู้**: guard "กันถอดสิทธิ์ owner คนสุดท้าย" ยังนับเฉพาะ role `owner` เท่านั้น
  — dev ไม่นับเป็น owner สำรอง

tab "categories" = View "สินค้า & สั่ง" = `CategoryView` (views-main.jsx)
tab "stock" = View "สต๊อก & แจ้งเตือน" = `StockView` (views-main.jsx)
tab "frontstore" = View "เช็คหน้าร้าน" = `FrontStoreView` (views-analytics.jsx)
tab "newproduct" = View "เพิ่มสินค้าใหม่" = `AddProductView` (views-main.jsx, owner+warehouse)

## UI Convention: สินค้าต้องมีรูป + กดดูรายละเอียดได้เสมอ (บังคับ)

**ทุกที่ที่แสดง "รหัส SKU + ชื่อสินค้า" ต้องมีรูปสินค้าประกอบเสมอ** — ผู้ใช้หลักคือพนักงาน
(บางคนอ่านไทย/รหัสไม่คล่อง) จำสินค้าจาก "รูป" ไม่ใช่รหัส · ห้ามทำ list/row/การ์ดที่โชว์แต่
รหัส+ชื่อโดยไม่มี thumbnail

- **รูป**: อ่านจาก `p.imageUrl` (มาจากชีต imageUrl) · ถ้าไม่มีรูป → โชว์ placeholder 📦
  (กล่องเทา) ขนาดเท่ากัน ห้ามปล่อยว่าง · thumbnail มาตรฐาน ~38–44px มุมมน
- **กดดูรายละเอียด**: แถว/การ์ด/รูปสินค้า **ต้องกดได้** เพื่อเปิด `ProductModal` (views-main.jsx)
  ดูรูปใหญ่ + qtyWH/qtyStore/ราคา/ตำแหน่งล็อค/ยอดขาย · ส่ง product object เข้า modal
  ผ่าน state (เช่น `const [modalProduct,setModalProduct]=uS(null)`) · ถ้าอยู่ในไฟล์
  views-analytics.jsx ที่ไม่มี ProductModal ในสโคป ให้เปิดรูปใหญ่ (`imgOpen` modal) เป็นอย่างน้อย
  หรือ nav ไปหน้าที่มีการ์ดเต็ม
- **ค้นหา**: ช่องค้นหาสินค้าทุกหน้าใช้ multi-token AND-match (split `/\s+/` แล้ว
  `tokens.every(t => hay.includes(t))` โดย hay = `sku+" "+name` lower-case) — พิมพ์
  "ฟาแลน 148" ต้องเจอสินค้าที่มีทั้ง "ฟาแลน" และ "148" (ดูข้อ 10 ใน "บทเรียนที่เจอบ่อย")

เวลาเพิ่ม/แก้ View ใดก็ตามที่ลิสต์สินค้า ให้ยึด convention นี้เป็น default — รูป + กดดูรายละเอียด +
multi-token search ครบทั้ง 3 อย่างเสมอ

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
SHEET_SALE_BILLS = "บิลขาย"             // log บิล POS ฝั่งเรา 22 คอลัมน์ (1 แถว = 1 บิล)
  A=id(SB-yyyyMMdd-NNNN) B=วันที่ C=เวลา D=เลขบิล E=เลขใบกำกับ F=ผู้ขาย G=ช่องทาง H=วิธีชำระ
  I=ยอดสุทธิ J=ก่อนVAT K=VAT L=ส่วนลดรวม M=จำนวนรายการ N=จำนวนชิ้น O=ลูกค้า P=เลขผู้เสียภาษี
  Q=ใบกำกับภาษี R=รับเงินสด S=เงินทอน T=zortOrderId U=สถานะ V=หมายเหตุ
  · B,C,D,E,T เป็น text format (setNumberFormat "@") — บทเรียนข้อ 2
  · เขียนโดย `appendSaleBillRow_` ใน `createSaleBill` **หลัง ZORT สำเร็จแล้วเท่านั้น**
    ฟังก์ชันนี้ **ไม่ throw** โดยเจตนา — บิลออกไปแล้ว เขียน log พลาดห้ามทำให้ผู้ขายไม่ได้เลขบิล
    (พลาดแล้วลง SHEET_ZORT_FAILED ผ่าน logZortFailure_ แทน)
  · รายละเอียด "สินค้าในบิล" ไม่ได้เก็บที่นี่ — ดึงจาก ZORT ด้วย `lookupSaleBill(เลขบิล)`

WH_SAI5/W0002 = คลังสินค้าสาย5 → col H (qtyWH)
WH_FRONTSTORE/W0001 = ดูเหมือนจริง(หน้าร้าน) → col G (qtyStore)
ZORT_BASE = "https://open-api.zortout.com/v4"
```

### หักสต็อกหลังขายผ่าน POS (`deductFrontStoreForSale_`)

**คลัง default ของ ZORT = หน้าร้าน/ดูเหมือนจริง (W0001)** — เจ้าของยืนยันแล้ว (ก.ค. 2026)
`createSaleBill` ไม่ได้ส่ง `warehousecode` ให้ `AddOrder` → ZORT ตัดสต็อกจากคลัง default ตัวนี้
ฝั่งชีตจึงหัก **col G (qtyStore)** ให้ตรงกัน ตรงกับที่ POS โชว์ "คงเหลือ N" อยู่แล้ว

- ⚠️ **ห้ามเรียก `pushStockToZort_` ในเส้นทางนี้เด็ดขาด** — `AddOrder` ตัดสต็อกฝั่ง ZORT
  ให้เรียบร้อยแล้ว ยิงซ้ำ = **หักสองเด้ง** (ต่างจาก `deductStock`/`transferStock` ที่ต้อง push
  เพราะไม่มี ZORT order มาตัดให้)
- เป็นแค่การอัปเดตชีตให้เห็นทันที ไม่ต้องรอ `syncZortBoth` (ทุก 2 ชม.) — กันขายเกิน
  รอบ sync ถัดไปจะเขียนทับด้วยเลขจริงจาก ZORT อยู่ดี (**ZORT = source of truth**)
- ไม่ปล่อยติดลบ (clamp ที่ 0) + เก็บ `shortfall`/`notFound` ลง audit log ไว้ไล่ย้อน
- เขียนทีละ cell เฉพาะแถวที่เปลี่ยน — `syncZortToColumn_` **ไม่ได้จับ LockService**
  เขียนทับทั้งคอลัมน์จึงเสี่ยงทับงาน sync ที่รันคาบเกี่ยว
- ไม่ throw (บิลออกไปแล้ว หักพลาดต้องไม่ทำให้ผู้ขายไม่ได้เลขบิล) → ลง `SHEET_ZORT_FAILED` แทน
- pure logic มีสำเนาใน `tests/helpers.js` = `saleFrontStoreDeductCore` + drift-guard landmark

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

## Login handoff — กู้ล็อกอินที่ "เริ่มที่หนึ่ง ไปจบอีกที่หนึ่ง" (iOS PWA)

ปัญหา: iPhone ที่เปิดแอปจากไอคอนหน้าโฮม กดล็อกอิน LINE แล้ว iOS เด้งไปจบใน Safari →
sessionToken ไปอยู่ storage ของ Safari → กลับมาเปิดไอคอนก็ยังไม่ได้ล็อกอิน (วนไม่จบ)

```
PWA: สุ่ม secret (32 bytes) เก็บใน localStorage → state = SHA-256(secret) ส่งให้ LINE
Safari (หรือที่ไหนก็ตามที่รับ callback): authLine → GAS เก็บผลไว้ใต้คีย์ = state (CacheService 15 นาที)
PWA: ยื่น secret → claimLoginHandoff → GAS แฮชแล้วหาคีย์ → คืน sessionToken + ลบทิ้ง (ใช้ครั้งเดียว)
```

- frontend (`app.jsx`): `makeHandoffPair` (crypto.subtle) · `markHandoffPending(state)` ตอนแตะปุ่ม ·
  `readPendingHandoff`/`clearHandoff` · `claimHandoff` + effect poll ทุก 4 วิ **และ**
  ตอน `visibilitychange`/`focus` (iOS แช่แข็ง timer ตอน background — ห้ามพึ่ง interval อย่างเดียว)
- backend: `saveLoginHandoff_` (เรียกจาก `authLine_` เมื่อมี `data.handoffId`) ·
  `claimLoginHandoffHandler_` (action `claimLoginHandoff`) · `sha256Hex_`
- ปลอดภัย: ค่าที่โผล่ใน URL/ประวัติคือ **แฮช** ไม่ใช่ secret · แลกคืนได้ครั้งเดียว · หมดอายุ 15 นาที
- ต้องรัน https ถึงมี `crypto.subtle` — ถ้าไม่มีจะ fallback เป็น state สุ่มธรรมดา (ไม่มี handoff)
  และ `markHandoffPending` จะไม่ตีตรารอ (กันหน้าจอค้าง "กำลังรอผล" ที่ไม่มีวันมา)

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

**มี Vitest test suite แล้ว** — 683 tests, 19 test files, ทั้งหมด pass

```bash
npm test              # run tests
npm run test:coverage # coverage report (tests/helpers.js)
```

- `tests/helpers.js` — CJS module รวม pure function copies สำหรับ Node testing
  export: `compareSku, mtoBase, parseQty_, parseNum_, parseLocation_,
           detectColor, COLOR_MAP, COLOR_KEYS,
           monthKey_, dayKey_, deductStockCore, netOf, enrichDataCore`
- `tests/*.test.js` — parsing, color, stock, dates, mto, app, format, schema, conflict, orderstate,
  sku, billing, bahttext, transfer, cleanup, analytics, **attendance**, **auth**, drift-guard
- **`tests/auth.test.js`** — เฟส 4 ล็อกอิน (`canDoOrNull_`/`ROLE_ACTIONS_`/`IMMEDIATE_GATE_*`) —
  **ไม่ copy โค้ดเข้า helpers.js** แต่ eval ฟังก์ชันจริงจาก `.gs` ตรง ๆ (กันสำเนา drift ของโค้ด
  ด้านความปลอดภัย) ต่างจากไฟล์เทสต์อื่นที่ copy pure function เข้า `helpers.js`
- **`tests/drift-guard.test.js`** — กัน `helpers.js` drift จากต้นทาง: ทุก export ต้องมี entry ใน
  `TRACKED` (พร้อม landmark ที่ต้องเจอทั้งในไฟล์ต้นทางและ helpers.js) หรืออยู่ใน
  `BEHAVIORAL_MODELS` · **เพิ่ม export ใหม่ใน helpers.js แล้วไม่เพิ่ม landmark = test แดงทันที**
- `tests/browser/run.cjs` — headless smoke test (ทุก role × ทุก tab) · mirror `ROLE_TABS` ไว้เอง
  ต้องอัปเดตตามเมื่อแก้ ROLE_TABS · รัน `bash tests/browser/setup.sh && node tests/browser/run.cjs`
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
12. **iOS PWA + OAuth = คนละ storage**: แอปที่เปิดจากไอคอนหน้าโฮม (standalone) พอ navigate
    ข้าม origin iOS มักเด้งไปเปิด Safari → ล็อกอินสำเร็จ **ใน Safari** แต่ token อยู่ localStorage
    ของ Safari ซึ่งคนละใบกับ PWA → กลับมาเปิดไอคอนก็ยังไม่ได้ล็อกอิน · การบังคับ
    `window.location.href` ใน webview ตัวเอง (`lineLoginNavigate`) ช่วยได้บาง iOS เท่านั้น
    **ห้ามพึ่งอย่างเดียว** — ต้องมี **login handoff** (ดูหัวข้อด้านล่าง) เป็นทางกู้เสมอ

## ระบบล็อกอินพนักงาน + ลงเวลาเข้า-ออกงาน (Sprint 5)

แผนเต็ม: `docs/PLAN-EMPLOYEE-LOGIN.md` · `docs/PLAN-ATTENDANCE.md` · งานต่อ: `docs/PLAN-NEXT-STAFF-DATA.md`

**ชีตใหม่** (สร้างอัตโนมัติเมื่อเรียกครั้งแรก ผ่าน `getOrCreateSheet_`):
```
SHEET_STAFF      = "พนักงาน"    // A=staffId B=provider C=providerUserId(LINE sub) D=displayName
                                //   E=lineDisplayName F=role G=status H=pictureUrl I=createdAt
                                //   J=lastLoginAt K=note
SHEET_SESSIONS   = "เซสชัน"     // token, staffId, createdAt, expiresAt, lastSeenAt, revoked (TTL 30 วัน)
SHEET_ATTENDANCE = "ลงเวลา"     // event log 17 คอลัมน์ (1 แถว = 1 การกดปุ่ม)
                                //   A=id B=staffId C=ชื่อ D=วันที่ E=เวลา F=serverTs G=clientTs
                                //   H=ประเภท I=lat J=lng K=accuracy L=ระยะห่าง M=จุดใกล้สุด
                                //   N=ในพื้นที่ O=รูป(Drive fileId) P=ที่มา Q=หมายเหตุ
SHEET_ATT_SITES  = "จุดลงเวลา"   // code, ชื่อจุด, lat, lng, รัศมี(ม.) — seed 2 จุดครั้งแรก
SHEET_ATT_SHIFTS = "ตั้งค่ากะ"   // ตำแหน่ง, วัน(0=อา..6=ส), เริ่ม, เลิก, ชื่อกะ
```

**action ที่มี**: `authLine` `me` `logout` `listStaff` `saveStaff` · `punch` `myToday`
`myAttendanceSummary` `attendanceToday` `fixAttendance` · doGet: `lineLoginMeta`
`attendancePhoto` `getAuditLog`

**กฎที่ต้องรู้เวลาแก้ระบบนี้**:
- ทุก action ของลงเวลา/staff ตรวจสิทธิ์ด้วย **`resolveSession_(ss, data.sessionToken)`**
  (server-verified)
- **เฟส 4 ทำแล้ว (ก.ค. 2026)** — `doPost` resolve session ทุก request แล้ว **ทับ `actor`
  ด้วยชื่อจาก session เสมอ** (`staffActorName_` → "ชื่อ (ตำแหน่ง)" ตรง format กับ frontend)
  ถ้าไม่มี session ยังรับ `data.actor` ต่อ เพื่อให้ช่วงเปลี่ยนผ่านไม่พัง
  · **`dmjFetch` (ui.jsx)** ห่อ `fetch` แนบ `sessionToken` เข้า body ของทุก POST อัตโนมัติ
    — ทำที่เดียวจบ **เวลาเพิ่มจุดเรียก API ใหม่ให้ใช้ `dmjFetch` ไม่ใช่ `fetch`** (`getAuditLog`
    เป็น GET ไม่ผ่าน `dmjFetch` — แนบ `sessionToken` เป็น query param เองแทน)
  · `canDoOrNull_(sess, action)` + ตาราง `ROLE_ACTIONS_` (ล้อ ROLE_TABS)
    · `resolvePostAction_` แปลง dispatch 2 แบบ (`data.action` / `data.someFlag`) เป็นชื่อเดียว
    **เพิ่ม dispatch ใหม่ใน doPost ต้องเติมชื่อใน `POST_FLAG_ACTIONS_` ด้วย** ไม่งั้น
    action นั้นหลุดการตรวจสิทธิ์ (มี meta-test ใน `tests/auth.test.js` คอยจับให้แล้ว)
  · ⚠️ **`REQUIRE_LOGIN` ยัง default ปิด** → `ROLE_ACTIONS_`/`canDoOrNull_` ส่วนใหญ่เป็น no-op
    (ของเดิมไม่พัง) **ยกเว้น `IMMEDIATE_GATE_ACTIONS_`/`IMMEDIATE_GATE_STRICT_ACTIONS_`** (ใกล้
    `canDoOrNull_`) — 7 action ที่กระทบเงิน/สต็อกจริง (`voidQuotation`/`approveQuotation`/
    `issueFullTaxInvoice`→saler, `deleteOrder`/`deleteOrders`→employee/warehouse,
    `zeroStock`→warehouse, `resetNegativeStock`→เฉพาะ owner/dev) **เช็คสิทธิ์ทันทีไม่รอ
    REQUIRE_LOGIN** เพราะเดิมไม่เคยเช็คอะไรเลย เสี่ยงเกินกว่าจะรอ rollout ของ role ที่เหลือ
    · `IMMEDIATE_GATE_ACTIONS_` = migration-safe (ไม่มี session → ปล่อยผ่าน) ใช้กับ action ที่มี
    caller จาก UI จริง · `IMMEDIATE_GATE_STRICT_ACTIONS_` = deny-by-default เสมอ (ไม่มี session
    → ปฏิเสธ) ใช้กับ `zeroStock`/`resetNegativeStock` ที่ไม่มี caller จาก UI เลย — **ห้ามสลับ
    สองตัวนี้กัน** ใช้ตัว migration-safe กับ action ที่ควร deny-by-default จะเปิดช่องโหว่แทน
    · `canDoOrNull_` **ไม่เช็ค `sess.status`** — `resolveSession_` ต้นทางคืนเฉพาะ session ที่
    active อยู่แล้ว เช็คซ้ำจะขัด convention
    · เปิด `REQUIRE_LOGIN='true'` ให้ครบทุก action **ต่อเมื่อพนักงานล็อกอิน LINE ครบทุกคนแล้ว**
    (เช็ค `lastLoginAt` ในชีต "พนักงาน") — เปิดก่อนคนครบ = คนที่ยังไม่ล็อกอินทำงานไม่ได้ทั้งร้าน
  · role ที่ gate จริงตรวจกับ UI แล้ว **ไม่ใช่ "owner อย่างเดียว"** ตามที่ร่างแผนไว้ตอนแรก — ดู
    `PLAN-EMPLOYEE-LOGIN.md` ข้อ 5.1 ก่อนแก้ role list พวกนี้ (เคยพังเพราะเดาจากแผนแทนที่จะเช็ค UI)
  · `getAuditLog` (doGet) ตรวจ session จริงแล้ว (เหมือน `attendancePhoto`) — **ไม่เช็คจาก
    `role`/`data.role` query param ที่ client ส่งเองอีกต่อไป**
- **`actor` เป็นชื่อจริง** ผ่าน `window._currentUser = "ชื่อ (ตำแหน่ง)"` ที่ตั้งใน
  `applyStaffSession()` (app.jsx) ตอน login/resume — ไม่ต้องแก้จุดเรียก API ทีละจุด
- **วันที่/เวลาในชีตลงเวลาเขียนเป็น text** (`setNumberFormat("@")`) — บทเรียนข้อ 2
  · ทุกฟังก์ชันเวลาใช้ `Asia/Bangkok` เสมอ (`attDateKey_`/`attDowBkk_`/`attMinOfDay_`)
  **ห้ามใช้ `toISOString()` ฝั่ง frontend** จะเพี้ยนไป 1 วัน → ใช้ `attTodayKey()`
- **id ของแถวลงเวลาต้องสร้างด้วย `attNextId_`** (เช็ค id ที่มีจริงในชีต) — ห้ามกลับไปใช้
  `getLastRow()` เฉย ๆ เพราะพอลบแถวได้แล้ว id จะชนกัน → แก้/ลบผิดแถว
- **แก้เวลาย้อนหลัง (`fixAttendance`) บังคับเหตุผทุกครั้ง** + มาร์ค col P = `"แก้โดยเจ้าของ"`
  + audit log before/after · ตรวจลำดับแบบ**เตือน ไม่บล็อก** (`attSequenceWarning_`)
- **รูปลงเวลาไม่แชร์สาธารณะ** — เก็บ Drive แล้วดึงผ่าน `attendancePhoto` proxy ที่ตรวจ session
  · `dailyAttendanceMaintenance()` (trigger 22:00) ลบรูปเกิน `ATT_PHOTO_KEEP_DAYS` (90 วัน) +
  ล้างเซสชันหมดอายุ + เตือนคนที่ลืมกดออกงาน · เจ้าของต้องรัน **`setupAttendanceMaintenance()`** 1 ครั้ง
- **ปุ่มลงเวลาเป็น "ปุ่มสลับสถานะ"** ไม่ใช่ 4 ปุ่มตายตัว — `ATT_TOGGLE_GROUPS` (views-attendance.jsx)
  3 กลุ่ม (`work`=เข้า/ออกงาน, `break`=พัก, `bathroom`=ห้องน้ำ) แต่ละกลุ่มมีปุ่มเดียวสลับป้าย/สี
  ตาม `allowed` ที่ server ส่งมา · `ATT_TYPE_META` = flat lookup กลาง (label/emoji/color ต่อ
  ประเภท) ใช้ทั้งปุ่ม/ไทม์ไลน์/`AttFixModal` — **ห้ามกลับไปใช้ `ATT_BTN`** (ลบไปแล้ว)
  · พัก/ห้องน้ำเป็นคนละสถานะ ทำพร้อมกันไม่ได้ (`attAllowedNext_`) แต่ "ออกงาน" กดได้เสมอแม้กลาง
  พัก/ห้องน้ำ (กันคนลืมกดกลับ) · เวลาห้องน้ำ**ไม่หัก**จากชั่วโมงทำงาน (ต่างจากพักที่หัก) —
  ตัดสินใจไว้ที่ `attSummarize_`, แก้ได้บรรทัดเดียวถ้าเจ้าของอยากเปลี่ยน (event log ไม่เสียข้อมูล)
  · "ใครเข้างานวันนี้" นับคนแยก หน้าร้าน/คลังสินค้า จาก **GPS จริง** (`attSiteBucket`,
  views-attendance.jsx) ไม่ใช่ role — `saler` ก็ทำงานหน้าร้านจริง role เดียวเดาไม่พอ · เดินย้อนหา
  อีเวนต์ล่าสุดที่มีพิกัด (`attLatestSiteName`) เทียบกับชื่อจุดใน `ATT_SITES_SEED` · ไม่มี GPS เลย
  ทั้งวัน → fallback ไป role เฉพาะ `frontstore`/`warehouse` (mapping ชัด) role อื่นไม่นับ
  (ไม่เดา) โผล่เป็น "❓ ไม่ทราบตำแหน่ง"
- **"เวลาของฉัน"** (ทุก role) = `Seg` toggle ในแท็บ "⏱️ ลงเวลา" เดิม ไม่ใช่แท็บใหม่ — ตั้งใจ กัน
  role ที่มีแท็บเกิน 9 อยู่แล้วโดนดันเข้า "เพิ่มเติม" เพิ่ม · `attMonthRange_` ตัดเดือนปัจจุบันที่
  วันนี้เสมอ (ไม่โชว์วันอนาคต) · ยังไม่นับ "ขาด" ถ้าเป็นวันนี้ (อาจยังไม่ถึงเวลากะ)
  · `attDowOfDateStr_` = helper กลาง หา day-of-week จาก `"yyyy-MM-dd"` ตรง ๆ (ใช้แทน
  `attDowBkk_` เมื่อไม่มี `Date` object เช่นตอนดูวันในอดีต/เดือนอื่น)

## Features ที่เพิ่มล่าสุด (Sprint 4)

- **นับหน้าร้านก่อนสั่ง** — `OrderModal` (views-main.jsx): role `frontstore`/`employee` ต้องกรอก
  "หน้าร้านเหลือกี่ชิ้น" (ขั้น ①) ก่อน ปุ่มยืนยันสั่งถึงจะกดได้ · กดสั่ง → `syncFrontStoreData`
  (ชีต "จำนวนหน้าร้าน" + push ZORT + audit) ก่อน แล้วค่อยยิง `action=order` · ถ้าเช็คล่าสุด
  (`p.frontStoreCheckedAt`) ใหม่กว่า `FS_CHECK_FRESH_MIN` (120 นาที) → ข้ามการนับ โชว์แบนเนอร์
  "เพิ่งเช็คไป N นาทีที่แล้ว" + ปุ่ม "นับใหม่" · **auto-save debounce 2 วิ** ทันทีที่คีย์เลข
  (นับแล้วไม่สั่งต่อ/ปิด modal ยอดก็เข้าระบบ — มี flush ตอน unmount) กดสั่งเร็วกว่า 2 วิ = บันทึกทันที
  ก่อนยิง order · **คลังหมด (qtyWH=0) ก็ยังกรอก/บันทึกจำนวนหน้าร้านได้** (modal โชว์การ์ดนับ + ปุ่ม
  "บันทึกหน้าร้าน N ชิ้น แล้วปิด" แทนปุ่มสั่ง) · ProductCard: หมดทั้งคลัง+หน้าร้าน ปุ่มไม่ disable สำหรับ
  2 role นี้ แต่เปลี่ยนเป็น "📋 หมด — นับหน้าร้าน" · `fsSaveFailed` หยุด auto-retry กันยิงรัวตอนเน็ตหลุด
  · บันทึกพัง → มีปุ่ม "สั่งเลยโดยไม่บันทึก"
  กันงานหน้าร้านสะดุด · role อื่นไม่เห็นขั้นตอนนี้ · `role` ส่งเป็น prop เข้า OrderModal
  (fallback `sessionStorage.dmj_role`)

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
- **รอบสรุปประจำวัน (ค่าปัจจุบัน)** — `notiOrderCutoffHour_`/`orderNotiDueMs_`: ออเดอร์ที่สั่ง**ก่อน**
  `NOTI_ORDER_CUTOFF_HOUR` (default 16 = 4 โมงเย็น) ถูกกลั้นไว้ทั้งวัน ส่งรวมเป็นข้อความเดียวตอนเวลาตัด
  (พาดหัว "📋 สรุปของที่ต้องจัด") · สั่ง**หลัง**เวลาตัด → ส่งทันทีในรอบ drain ถัดไป (≤1 นาที,
  พาดหัว "🚶 order เข้าใหม่") เพราะเลยรอบจัดของแล้ว ถ้าไม่บอกเดี๋ยวนั้นจะตกค้างข้ามวัน ·
  คำนวณด้วยการบวก "นาทีที่เหลือจนถึงเวลาตัด" เข้ากับ timestamp (ใช้แค่ ชม./นาที จาก `Utilities.formatDate`
  ตามเขตเวลาสคริปต์ — ห้าม parse string เป็น Date จะเพี้ยนตาม timezone) · quota ลดเหลือ ~30 ข้อความ/เดือน
  + เฉพาะออเดอร์นอกเวลา · ตั้ง `NOTI_ORDER_CUTOFF_HOUR = -1` เพื่อปิดโหมดนี้ กลับไปใช้ time-window ข้างล่าง
- **coalesce order แบบ time-window** (fallback เมื่อปิดโหมดรอบสรุป — `pushOrderBatch_`/`notiOrderBatchWindowMin_`): ปริมาณ order จริง
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
