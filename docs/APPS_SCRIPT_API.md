# Apps Script API Reference

Web App เดียวรับทั้ง `GET` (อ่าน) และ `POST` (เขียน)
ทุก POST จากเว็บใช้ `Content-Type: text/plain;charset=utf-8` และ body เป็น JSON string

---

## GET — `doGet(e)`

| query | ทำอะไร |
|---|---|
| (ไม่มี) | คืน JSON รวมทุกอย่าง: `products`, `orders`, `mtoJobs`, `transfers`, `purchases`, `storage`, `monthlyByCat`, `dailyByCat`, `totals`, ... |
| `?action=order` | จัดการ order ผ่าน query (handleOrder_) |

ฝั่งเว็บเรียกผ่าน `fetchFromSheet()` ใน `app.jsx` (มี AbortController timeout 15s)

---

## POST — `doPost(e)` actions

ระบุ action ด้วย key ใน body แต่ละ action:

### สต็อก / การโอน
| key | พารามิเตอร์ | ทำอะไร |
|---|---|---|
| `transferStock` | `sku, qty, name` | โอนคลัง→หน้าร้าน 1 รายการ + สร้าง ZORT Transfer |
| `transferStockBatch` | `list:[{orderId,sku,qty,name}]` | **โอนหลายรายการครั้งเดียว** → ZORT Transfer เอกสารเดียว (idempotent, คืน `shortfalls`) |
| `deductStock` | `sku, qty` | หักสต็อกตรงๆ (legacy) |
| `deductMaterials` | `items:[{sku,qty}]` | หักวัตถุดิบหลายรายการ (lock) |
| `confirmStockCount` | `entries:[{sku,qty}]` | ยืนยันนับสต็อกคลัง → set ค่า + push ZORT |
| `updateFrontStore` | `entries, datetime` | บันทึกจำนวนหน้าร้าน + push ZORT |

### Order
| key | พารามิเตอร์ | ทำอะไร |
|---|---|---|
| `updateOrderState` | `orderId, sku, date, status, preparedQty, printFlag, carryMode` | อัปเดตสถานะ order |
| `deleteOrder` | `orderId` | ลบ order 1 แถว |
| `deleteOrders` | `orderIds:[...]` | **ลบหลายแถวครั้งเดียว** (เรียงล่าง→บน) |

### ตำแหน่งจัดเก็บ
| key | พารามิเตอร์ | ทำอะไร |
|---|---|---|
| `updateLockData` | `lockKey, entries, datetime` | อัปเดต/เพิ่มสินค้าในล็อค |
| `deleteLockEntry` | `lockKey, sku` | ลบสินค้าออกจากล็อค |

### งาน MTO
| key | พารามิเตอร์ | ทำอะไร |
|---|---|---|
| `createMtoJob` | `jobName, customer, price, imageUrl, dateStr` | สร้างงาน → คืน `jobId` |
| `closeMtoJob` | `jobId, items, closedAt` | ปิดงาน + หักสต็อก + ZORT DecreaseStock |
| `deleteMtoJob` | `jobId` | ลบงาน |

### ZORT
| key | พารามิเตอร์ | ทำอะไร |
|---|---|---|
| `syncZortNow` | — | sync สต็อกจาก ZORT ทันที (owner) |

### LINE Bot
| key | ทำอะไร |
|---|---|
| `events` (LINE webhook) | ตอบ query เช็คสต็อกผ่าน LINE |

---

## ฟังก์ชัน ZORT API ที่ใช้ (SECTION 4)

| ฟังก์ชัน | ZORT endpoint |
|---|---|
| `createZortTransfer_` / `createZortTransferBatch_` | `POST /Transfer/AddTransfer` |
| `pushStockToZort_` | `POST /Product/UpdateProductAvailableStockList` |
| `decreaseMtoStockInZort_` | `POST /Product/DecreaseProductStockList` |
| `fetchAllZortProducts_` | `GET /Product/GetProducts` |
| `getZortWarehouses` | `GET /Warehouse/GetWarehouses` |

> ดูรายละเอียด field ของ ZORT ใน [`../ZORTOUT_API.md`](../ZORTOUT_API.md)

---

## รูปแบบ response มาตรฐาน

```js
ok(data)      // { success: true, data }
error(msg)    // { success: false, error: msg }
```

`transferStockBatch` คืน:
```json
{ "success": true, "data": {
  "count": 3, "zortNumber": "TR-xxxx", "zortError": null,
  "shortfalls": [{ "sku":"...", "requested":5, "transferred":2 }],
  "results": [...]
}}
```

---

## Triggers

| ฟังก์ชัน | เมื่อไหร่ |
|---|---|
| `syncZortBoth` | ทุกวัน 06:00 (ตั้งด้วย `createDailyTrigger`) |
| `onOpen` | เปิด Sheet → เพิ่มเมนู "จัดการแชทบอท" |
