# สถาปัตยกรรม & Data Flow

## ภาพรวม ZORT Warehouse

| ZORT code | ชื่อคลัง | บทบาท | คอลัมน์ในชีตสินค้า |
|---|---|---|---|
| `W0001` | ดูเหมือนจริง | หน้าร้าน (front store) | G |
| `W0002` | คลังสินค้าสาย5 | คลังหลัง (warehouse) | H |

---

## 1. Flow: สั่งของ → Done → จัดส่ง

```
หน้า "รายการสั่งของ" (orders)
   │  พนักงานหยิบของ → ใส่จำนวนที่จัด → เลือกหิ้ว/ขึ้นรถ → กด Done
   ▼
syncOrderUpdate({updateOrderState, status:"สำเร็จ", preparedQty, ...})
   │  เก็บ localStorage (กันสถานะเด้งกลับ, อายุ 6 ชม.)
   ▼
หน้า "สรุปสินค้าออกจากคลัง" (ordersummary)
   │  แยก 2 กลุ่ม: 🚶 หิ้วเอง / 🚛 ขึ้นรถ
   │  กด "ส่งทั้งหมด" (batch) หรือ "ส่งแล้ว" (ทีละชิ้น)
   ▼
syncStockTransferBatch([{orderId, sku, qty, name}])   ← ยิงครั้งเดียว
   ▼
Apps Script: transferStockBatch()
   ├─ หักสต็อก Sheet: คลัง(H) − qty, หน้าร้าน(G) + qty   (lock เดียว)
   ├─ idempotency: ข้าม orderId ที่ส่งแล้วใน 6 ชม. (CacheService)
   ├─ createZortTransferBatch_() → POST /Transfer/AddTransfer (เอกสารเดียว เลขที่ auto)
   ├─ logTransferBatch_() → เขียนชีต "รายการโอนสินค้า"
   └─ ลบ order rows ออกจาก Sheet (deleteOrders)
   ▼
ผลลัพธ์: ZORT ย้ายสต็อก W0002→W0001 ให้เอง / เว็บแจ้งเลข ZORT + เตือนถ้าส่งไม่ครบ
```

### หลักการสำคัญ
- **Batch เป็นก้อนเดียว** — ส่ง 25 ชิ้น = 1 request = 1 Transfer ใน ZORT (เดิมยิง 25 ครั้งแล้วชนกัน)
- **ไม่ push absolute stock ทับ ZORT** — `AddTransfer` ย้ายสต็อกใน ZORT ให้แล้ว ถ้า set absolute ทับจะลบยอดขายที่เกิดระหว่างนั้น
- **Idempotency** — กันกดส่งซ้ำจากหลายเครื่อง (server-side, Cache 6 ชม.)
- **ลบ row ทันทีหลังส่ง** — คิวสะอาด ส่วนประวัติเก็บถาวรในชีต "รายการโอนสินค้า"

---

## 2. Flow: งานจัดพิเศษ (MTO)

```
สร้างงาน → createMtoJob() → เพิ่มแถวในชีต "งาน MTO" (สถานะ "กำลังจัด")
   ▼
เพิ่มวัตถุดิบ (พิมพ์/สแกนบาร์โค้ด) → เลือกคลัง (คลังสาย5/หน้าร้าน) + จำนวน
   ▼
ปิดงาน → closeMtoJob()
   ├─ หักสต็อก Sheet ตามคลังที่เลือก
   ├─ เขียนชีต "วัตถุดิบ MTO"
   ├─ อัปเดตสถานะงานเป็น "เสร็จแล้ว"
   └─ decreaseMtoStockInZort_() → POST /Product/DecreaseProductStockList (แยกตาม warehouse)
```

- MTO ไม่นับสต็อกคงเหลือ (เป็นงานสั่งทำ) — ตอนส่งจึงเบิกวัตถุดิบแทนการโอน
- ชีต "งาน MTO" และ "วัตถุดิบ MTO" สร้างอัตโนมัติถ้ายังไม่มี

---

## 3. Flow: Sync สต็อกจาก ZORT → Sheet

```
อัตโนมัติ: trigger ทุกวัน 06:00 → syncZortBoth()
   ├─ syncNewProductsFromZort()  เพิ่มสินค้าใหม่
   ├─ syncZortWarehouse()        ดึง W0002 → คอลัมน์ H
   └─ syncZortFrontStore()       ดึง W0001 → คอลัมน์ G

ด้วยมือ: ปุ่ม ⬇️ (เฉพาะ owner) → syncZortNow()
```

---

## 4. สแกนบาร์โค้ด

- ใช้ library **html5-qrcode** (รองรับ iOS/Android/Desktop)
- Component: `QRScanModal` + `ScanButton` ใน `views.jsx`
- รองรับ: QR, CODE_128/39/93, EAN_13/8, UPC_A/E, DATA_MATRIX, ITF
- **พฤติกรรม:** สแกนสำเร็จ 1 ครั้ง → กล้องปิดอัตโนมัติทุกหน้า
- หน้าที่มีสแกน: ค้นหาสินค้า, นับ stock, ตำแหน่งจัดเก็บ, เช็คหน้าร้าน, เพิ่มรายการ, **งาน MTO**

---

## 5. localStorage ที่ใช้

| key | เก็บอะไร | อายุ |
|---|---|---|
| `dmj_orders_state_*` | สถานะ order (Done/preparedQty) | 6 ชม. |
| `dmj_shipped_orders_v1` | order ที่ส่งแล้ว (timestamp) | 6 ชม. |
| `dmj_missed_truck` | ของที่ไม่ได้ขึ้นรถ | — |
| `dmj_printed_orders` | label ที่พิมพ์แล้ว | — |
| `dmj_last_sync` | เวลา sync ล่าสุด | — |

> ใช้ timestamp + อายุ 6 ชม. เพื่อกันสถานะค้าง/เด้งกลับ จาก stableOrderId ที่อาจชนกัน

---

## 6. CORS — สำคัญ

ทุก `fetch` ที่ยิงไป Apps Script ต้องใช้:
```js
headers: { "Content-Type": "text/plain;charset=utf-8" }
```
**ห้ามใช้** `application/json` (จะ trigger preflight ที่ Apps Script ตอบไม่ได้ → อ่าน response ไม่ได้)
และ **ห้ามใช้** `mode: "no-cors"` (จะอ่าน response ไม่ได้)
