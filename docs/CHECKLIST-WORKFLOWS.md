# ✅ เช็คลิสต์ทดสอบการใช้งาน + แผนที่ Workflow ทุกตำแหน่ง × ทุกปุ่มแอคชั่น

เอกสารนี้ไล่ "ทุกตำแหน่ง (role) และทุกปุ่มแอคชั่น" ในระบบ DMJ Inventory Dashboard ออกมาเป็น
**ข้อ ๆ ตาม workflow จริง** (สิ่งที่ผู้ใช้กด → วิ่งผ่านอะไรบ้าง → จบที่ไหน) เพื่อ 2 อย่าง:

1. **ทดสอบ** — ติ๊กทีละข้อว่าเส้นทางนั้นยังทำงานครบ (เอาไปใช้ก่อน deploy / หลังแก้ของใหญ่)
2. **หาจุดปรับให้เร็วขึ้น** — ทุก workflow มีบรรทัด **⏱️ จุดที่ช้า / ปรับได้** กำกับไว้

> วิธีอ่านสัญลักษณ์: `[ ]` = ยังไม่ทดสอบ · ⏱️ = โอกาสเพิ่มความเร็ว · ⚠️ = จุดพังเงียบ (พังแล้วจอดูปกติ ไม่มี error)
> อ้างอิงเลขบทเรียน = "บทเรียนที่เจอบ่อย" ใน `CLAUDE.md`

สารบัญ:
- [ส่วน A — เมทริกซ์ ตำแหน่ง × แท็บ (ใครเห็น/ทำอะไรได้)](#ส่วน-a)
- [ส่วน B — Workflow หลัก 12 เส้น (ทดสอบ end-to-end)](#ส่วน-b)
- [ส่วน C — เช็คลิสต์รายปุ่มแอคชั่น (ปุ่ม → endpoint → ชีต)](#ส่วน-c)
- [ส่วน D — สรุปโอกาสเพิ่มความเร็ว (จัดลำดับ)](#ส่วน-d)

---

<a name="ส่วน-a"></a>
## ส่วน A — เมทริกซ์ ตำแหน่ง × แท็บ

ที่มา: `ROLE_TABS` (`app.jsx`) · `owner`/`dev` ได้ nav 2 ชั้น (`OWNER_GROUPS`) · role อื่นแถบเลื่อนแนวนอนเดียว

| แท็บ / งาน | owner | dev | employee | warehouse | frontstore | saler | storedevice |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| ⏱️ ลงเวลา (attendance) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🕐 ใครเข้างานวันนี้ (atttoday) | ✅ | ✅ | | | | | ✅ ดูอย่างเดียว |
| 📅 รายงานเข้างาน (attreport) | ✅ | ✅ | | | | | |
| 📊 ภาพรวม (overview) | ✅ | ✅ | | | | | |
| 👥 ลูกค้า (customers) | ✅ | ✅ | | | | | |
| 🧾 ขาย/ออกบิล (pos) | ✅ | ✅ | | | | ✅ | ✅ |
| 📄 ใบเสนอราคา (quotefollowup) | ✅ | ✅ | | | | ✅ | ✅ |
| 🛍️ สินค้า & สั่ง (categories) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ⚠️ สต๊อก (stock) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📋 รายการสั่งของ (orders) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📡 ติดตามสถานะ (tracking) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🏪 เช็คหน้าร้าน (frontstore) | ✅ | ✅ | ✅ | | ✅ | | |
| 📦 สรุปออกจากคลัง (ordersummary) | ✅ | ✅ | ✅ | ✅ | | | |
| 🔄 โอน/ปรับ/ยกมา (transfers) | ✅ | ✅ | ✅ | | | | |
| 🗺️ ตำแหน่งคลัง (storage) | ✅ | ✅ | ✅ | ✅ | | | |
| 📊 นับ stock คลัง (stockcount) | ✅ | ✅ | | ✅ | | | |
| ➕ เพิ่มสินค้าใหม่ (newproduct) | ✅ | ✅ | | ✅ | | | |
| 🏭 งานคลัง (whhome) | ✅ | ✅ | | ✅ | | | |
| 🎁 งานจัดพิเศษ (mtojobs) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🖨️ พิมพ์ Label (labels) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 📈 เทรนด์ (trends) | ✅ | ✅ | ✅ | | | | |
| 📦 สินค้าจม (deadstock) | ✅ | ✅ | | | | | |
| 🌸 ช่วงขายดี (season) | ✅ | ✅ | | | | | |
| 💰 กำไรขั้นต้น (margin) | | ✅ | | | | | |
| ⬆️ อัปโหลด Zort (upload) | ✅ | ✅ | | | | | |
| 🔗 Google Sheet (connect) | ✅ | ✅ | | | | | |
| 📋 Audit Log (auditlog) | ✅ | ✅ | | | | | |
| 👥 พนักงาน (staff) | ✅ | ✅ | | | | | |
| 🏅 ผลงานพนักงาน (staffperf) | ✅ | ✅ | | | | | |
| 🏠 หน้าหลัก (home) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | (แตะโลโก้ — ทุก role) |

**เช็คลิสต์ระดับ role** (ทดสอบว่าเปิดแอปด้วย role นี้แล้วเห็นถูกชุด):
- [ ] owner: กดโลโก้ → หน้าหลักจัดกลุ่ม 5 หมวด · เห็นทุกแท็บยกเว้น `margin`
- [ ] dev: เหมือน owner + เห็น `margin`
- [ ] employee: 12 แท็บ ไม่มี pos/stockcount/newproduct/whhome · แถบเลื่อนเดียว ไม่มี "เพิ่มเติม"
- [ ] warehouse: `whhome` เป็นแท็บที่ 2 · มี stockcount/newproduct · ไม่มี frontstore/pos
- [ ] frontstore: `frontstore` เป็นแท็บที่ 2 · ไม่มี transfers/stockcount
- [ ] saler: `pos`+`quotefollowup` อยู่ต้น ๆ · ไม่มี frontstore/whhome
- [ ] storedevice: เท่า saler + `atttoday` (ดูอย่างเดียว กดแก้เวลาไม่ได้ — `canEdit={isAdminRole}`)
- [ ] ⚠️ role ที่ไม่รู้จัก/ไม่ส่งมา → payload ได้ `full` เสมอ (ส่งเกินดีกว่าส่งขาดจนหน้าพัง)

---

<a name="ส่วน-b"></a>
## ส่วน B — Workflow หลัก 12 เส้น

แต่ละเส้น = ขั้นตอนที่ผู้ใช้ทำ + เส้นทางเทคนิค (frontend → sync → GAS → ชีต) + จุดที่ช้า/ปรับได้

### B1. เปิดแอป + ล็อกอิน (ทุก role) 🚪

**ขั้นตอนผู้ใช้**: เปิดแอป → (ถ้ายังไม่ล็อกอิน) กดล็อกอิน LINE → กลับมาเห็นแดชบอร์ด

**เส้นทาง**:
1. `<head>` prefetch payload ทันที (`&role=` จาก session เดิม) — ยิงก่อน `ui.jsx` โหลด
2. `dmjMark` วัดทีละขั้น: `html → cachehit/compile → auth → payload:เริ่ม → payload:ไบต์แรก → payload:ครบ → พร้อมใช้งาน`
3. `action=ver` ถามก่อน ("ข้อมูลเปลี่ยนไหม") → ไม่เปลี่ยน = ข้ามโหลด 4.2MB
4. login LINE → handoff (PWA/Safari คนละ storage) → `claimLoginHandoff` poll ทุก 4 วิ + ตอน focus

**เช็คลิสต์**:
- [ ] เปิดครั้งแรกเครื่องใหม่ (ไม่มี cache) → เข้าได้ไม่ค้าง
- [ ] iOS PWA (เปิดจากไอคอนหน้าโฮม) ล็อกอิน LINE → กลับมาได้ session (handoff)
- [ ] 15 เครื่องเปิดพร้อมกันตอนเช้า → ได้ JSON ครบ ไม่ได้หน้า HTML/404 (single-flight + stale)
- [ ] แถบเหลือง "กำลังอัปเดต — ข้อมูล ณ HH:MM" โผล่ตอนได้ของสำรอง แล้วดึงซ้ำเองใน 5-9 วิ
- [ ] `BootTrace` (แท็บเชื่อมต่อ / จอ error) โชว์เวลาแต่ละขั้นได้

**⏱️ จุดที่ช้า / ปรับได้**:
- คอขวดหลักตอนนี้ = **ขนาด payload 4.2MB** (Phase 7.4) — น้ำหนักเกือบทั้งหมดอยู่ `products[]` ทุก role เหมือนกัน (`lite` เล็กกว่า `full` แค่ 8%)
- **ยังไม่ยืนยันว่า Google gzip ให้หรือยัง** — `payload:ครบ (KB)` เป็นไบต์หลังคลายบีบอัด · **งานถัดไป: เช็ค `Content-Encoding` จาก endpoint จริง** ถ้ายังไม่ gzip = ลดได้ทันที ~70%
- Babel compile ครั้งแรกหลัง deploy (`.jsx` ETag เปลี่ยน) จ่ายค่า compile views-main 555KB + views-analytics 583KB รอบหนึ่ง — โอกาส: **precompile** (มี `docs/PRECOMPILE.md`)
- **แนวคิดลดไบต์**: ตัด `products[]` เหลือเฉพาะฟิลด์ที่หน้าแรกต้องใช้ แล้ว lazy-load ส่วนวิเคราะห์ (ดู `docs/PLAN-PHASE8-PAYLOAD.md`)

---

### B2. ลงเวลาเข้า-ออกงาน (ทุก role) ⏱️

**ขั้นตอนผู้ใช้**: กดแท็บลงเวลา → กดปุ่มสลับสถานะ (เข้า/ออก/พัก/ห้องน้ำ) → (ถ่ายรูป+GPS) → บันทึก

**เส้นทาง**: `AttendanceView` → `attPost('punch')` (แนบ sessionToken เอง) → `punchHandler_` → ชีต "ลงเวลา" (17 คอลัมน์, 1 แถว/กด)

**เช็คลิสต์**:
- [ ] ปุ่มสลับ 3 กลุ่ม (work/break/bathroom) เปลี่ยนป้าย/สีตาม `allowed` จาก server
- [ ] "ออกงาน" กดได้เสมอแม้กลางพัก/ห้องน้ำ (กันลืมกดกลับ)
- [ ] พัก = หักชั่วโมง · ห้องน้ำ = ไม่หัก
- [ ] Seg สลับ "⏱️ วันนี้" / "📅 เวลาของฉัน" ในแท็บเดียว
- [ ] owner: `atttoday` เห็นใครเข้างาน/พัก แยกหน้าร้าน/คลังจาก GPS จริง + แก้ย้อนหลัง (`fixAttendance` บังคับเหตุผล)
- [ ] `attreport` สรุปทั้งเดือน (owner/dev) — วันก่อนเข้างานจริงไม่นับ "ขาด"

**⏱️ จุดที่ช้า / ปรับได้**:
- **ทางด่วนทำแล้ว (Phase 7.7)**: `NO_DATA_TABS` ให้ attendance/atttoday/home เรนเดอร์ได้ทันทีที่รู้ว่าเป็นใคร (จบที่ `me` 1 รอบ) **ไม่ต้องรอ payload 4.2MB**
- ⚠️ **`readAttEvents_` ยังอ่านชีตลงเวลาทั้งใบทุกครั้งที่กดปุ่ม/เปิดหน้า** แล้วกรองใน JS — ชีตโต ~2 หมื่นแถว/ปี = **ยิ่งใช้ยิ่งช้าลง** · มี `[perf]` log ไว้แล้ว (≥3,000 แถว หรือ ≥1 วิ) **รอตัวเลขจริงก่อนแก้** · ทางเลือก: index แยก / `TextFinder` / แยกชีตรายเดือน
- ⚠️ ระวัง: ไล่จากล่างขึ้นบนแล้วหยุดใช้ไม่ได้ — `fixAttendance` op=add ใช้ `appendRow` แถวย้อนหลังไปอยู่ล่างสุด
- `attreport` มี cache 5 นาที/เดือนแล้ว (`fixAttendance` ล้าง cache เดือนที่แก้)

---

### B3. สั่งของเข้าหน้าร้าน (frontstore/employee/saler/storedevice/warehouse) 📦

**ขั้นตอนผู้ใช้**: แท็บ "สินค้า & สั่ง" → กดการ์ดสินค้า → (frontstore/employee: ① นับหน้าร้านก่อน) → ② เลือกจำนวน → ยืนยันสั่ง

**เส้นทาง**:
1. `OrderModal` (views-main.jsx) — สร้าง `cid` (client order id) 1 ค่าต่อ "สินค้า+จำนวน+ประเภท"
2. (ถ้าต้องนับ) `syncFrontStoreData` → `updateFrontStore` → ชีตหน้าร้าน + push ZORT + audit
3. `action=order` (doGet, แนบ `&sessionToken=` เอง) → `handleOrder_` → ชีต "ลำดับที่สั่งสินค้า" (cid ที่ col O, ผู้สั่งที่ col L)
4. สำเร็จ → `window._dmjRefetchOrders()` (`fetchOrdersOnly`) ดึงของจริงมาโชว์ป้าย "สั่งแล้ว N"

**เช็คลิสต์**:
- [ ] frontstore/employee: ปุ่มยืนยันกดไม่ได้จนกรอกขั้น ① (นับหน้าร้าน) — `mustFsCheck`
- [ ] saler/storedevice: เห็นการ์ดนับ (`canFsCheck`) **แต่กดยืนยันสั่งได้เลย ไม่บังคับ**
- [ ] เพิ่งเช็ค < 120 นาที → ข้ามการนับ โชว์ "เพิ่งเช็คไป N นาที" + ปุ่มนับใหม่
- [ ] คลังหมด (qtyWH=0) → 2 role หน้าร้านยังนับ/บันทึกหน้าร้านได้ (ปุ่ม "บันทึก N ชิ้น แล้วปิด")
- [ ] ช่อง "กรอกเอง" ลบเลขแล้วพิมพ์ใหม่ได้ (draft pattern — ไม่เด้งเป็น 1)
- [ ] ปุ่มลัด `QUICK_QTYS = [6,12,24,36,48,60]`
- [ ] GAS ตอบ HTML/เน็ตหลุด → **ไม่ขึ้นแดงทันที** → ถาม `action=orderCheck&cid=` ก่อน → ยิงซ้ำได้ปลอดภัย (แถบเหลือง สูงสุด 3 ครั้ง)
- [ ] แบนเนอร์ "🧑 สั่งโดย X · ถามก่อนสั่งซ้ำ" บนของที่ค้างอยู่

**⏱️ จุดที่ช้า / ปรับได้**:
- `action=order` เป็น doGet ที่จับ `LockService` คร่อม "หาแถวว่าง → เขียน" — **ปล่อยล็อกก่อนยิง LINE แล้ว** (ScriptLock เป็นล็อกตัวเดียวทั้งสคริปต์ ถือคร่อม `UrlFetchApp` = คนสั่งพร้อมกันต่อคิว)
- แจ้งเตือน order เข้าคิว + coalesce (ไม่ยิง LINE ทุกครั้ง) — ลด quota
- ⚠️ **`fetchOrdersOnly` หลังสั่งทุกครั้ง** — จำเป็น (ป้ายหาย/เครื่องอื่นไม่เห็น) แต่เป็น request เพิ่ม 1 รอบ · ยอมรับได้เพราะ `action=orders` อ่านชีตตรงไม่ผ่าน cache เล็ก

---

### B4. จัดของ → โอน → หน้าร้านรับ (warehouse → frontstore) 🚚

**ขั้นตอน**: warehouse เห็นออเดอร์ → กรอก "📦 จัด" → แท็บ "สรุปออกจากคลัง" กด "✅ ส่งทั้งหมด" → หน้าร้านแท็บ orders/ส่งแล้ว กด "รับ"

**เส้นทาง**:
1. จัด: `OrderItemRow` → `savePrepQty`/`markComplete` → `syncOrderUpdate` → `updateOrderState` → col M (ผู้จัด)
2. ส่งทั้งชุด: สร้าง `tid` → `syncStockTransferBatch` → `transferStockBatch` → หักสต็อก → ZORT AddTransfer → ชีตโอน (tid col P) → audit → noti
3. ส่งทีละใบ: `ConfirmModal` (กันดับเบิลแท็บด้วย `useRef`) → `finalizeShip` (`shipInflightRef`) → `transferStock`
4. รับ: `ShipmentRow` → `confirmShipmentReceive` (หาแถวจาก `refNum`+SKU) → col N (ผู้รับ)

**เช็คลิสต์**:
- [ ] ช่อง "📦 จัด" แตะแล้ว select ทั้งช่อง (`onFocus select()`) — พิมพ์ทับไม่ต่อท้าย (บทเรียน 14)
- [ ] React key ของ OrderItemRow = `id + orderSig` (ไม่ค้างค่าเก่าเมื่อแถวเลื่อน)
- [ ] "ส่งทั้งหมด" 77 รายการ → ไม่ค้าง/ไม่ขึ้นแดงปลอม (timeout 240 วิ + tid กันซ้ำ)
- [ ] กดส่งซ้ำ/รีเฟรชกลางคัน → ไม่โอนสองเด้ง (tid ใน `localStorage.dmj_ship_tid_v1`)
- [ ] ปุ่ม "🧾 เช็คของที่ส่งไปแล้ว" (`recentTransfers`) ทางกู้ของค้าง — ติ๊กเลือกรายตัว
- [ ] ส่งทีละใบ กดครั้งเดียว → ไม่ได้ TF ซ้ำ (ConfirmModal ref กัน ghost-tap)
- [ ] หน้าร้านกดรับ → บันทึกจริงค่อยขึ้นเขียว (ไม่ "สำเร็จปลอม") · หาแถวจาก refNum ไม่เด้งให้กดใหม่
- [ ] ⚠️ ลำดับ order (orders tab): **ของหิ้วอยู่บนสุดเสมอ** > ยังไม่จัด

**⏱️ จุดที่ช้า / ปรับได้**:
- ก่อนหน้านี้ "ส่งทั้งหมด" ช้าเพราะ `writeAuditLog_` `appendRow` ทีละแถว 77 รอบ → **`writeAuditLogBatch_`** เขียนครั้งเดียวแล้ว + เขียน G:H รวดเดียว (154→77 call)
- ⚠️ **ส่งทีละใบ (`transferStock`) ยังไม่มี tid ฝั่ง GAS** — เส้นนี้ห้ามชวนกดซ้ำเมื่ออ่านคำตอบไม่ได้ (งานต่อ: เพิ่ม tid แบบ batch)
- ชีต "ประวัติรับสินค้า" ยังไม่มีหน้าไหนอ่าน — งานต่อ: ช่องค้นข้าม 2 ชีตในแท็บติดตาม

---

### B5. นับสต็อกคลัง / เช็คหน้าร้าน (warehouse / frontstore) 📊

**ขั้นตอน (คลัง)**: แท็บ "นับ stock คลัง" → คิว "ควรนับก่อน" (ABC) → เลือกล็อค → นับทีละ SKU → ยืนยัน
**ขั้นตอน (หน้าร้าน)**: แท็บ "เช็คหน้าร้าน" → คิว "ควรเช็คก่อน" → นับ → บันทึก

**เส้นทาง**:
- นับคลัง: `StockCountView` → `confirmStockCount` → หัก/ตั้งยอดคลัง + push ZORT
- เจอของอื่นในล็อค: `syncLockData` (`isNew:true`) → append ชีตตำแหน่ง — **ไม่เข้า `confirmStockCount`** (กันทับยอดคลังรวม)
- โพลสต็อก: `action=stocklite` (2 ชีต แทน 9) ทุก 30 วิ — เล็กกว่า ~50 เท่า

**เช็คลิสต์**:
- [ ] คิว "ควรนับก่อน" เรียง A=30/B=60/C=90 วัน · หน้าร้าน A=7/B=14/C=30
- [ ] แตะรายการในคิว → พาไปนับล็อคนั้น/scroll ไปสินค้านั้นเลย
- [ ] A0/B0 (ไม่อยู่บนชั้น) — กดขั้น 1 ข้ามไปขั้น 3 · ปุ่มย้อนกลับไปขั้น 1 (ไม่ใช่ 2)
- [ ] ดาว ⭐ "ของฉัน" (product owner) — เปิดโหมดแล้วเมนูหมวดสั้นลง + หมวดใช้ร่วม (SHARED_CATS) ยังเห็น
- [ ] ⚠️ client คำนวณ `qty`/`isOOS` ใหม่ทุกครั้งที่แตะ qtyStore/qtyWH (ตรงกับ `applyQtyLocToProduct_` — กันบั๊ก WL "มีของแต่โชว์หมด")

**⏱️ จุดที่ช้า / ปรับได้**:
- **`stocklite` ทำแล้ว** — เครื่องจอดหน้าร้านทั้งวันเดิมกิน ~500MB/ชม. → เหลือ ~1/50 · ส่งเป็น array ไม่ใช่ object (คีย์ซ้ำทุกแถวใหญ่สุด)
- ไม่ `saveToStorage` (เดิมเขียน JSON หลายเมกะลง localStorage ทุก 30 วิ → มือถือกระตุก)

---

### B6. ขาย POS — หน้าร้าน + ออนไลน์ (saler / storedevice) 🧾

**ขั้นตอน**: แท็บ "ขาย/ออกบิล" → สลับโหมด (ออนไลน์/หน้าร้าน) → ยิงบาร์โค้ด/เลือกสินค้า → (ค้นลูกค้า) → รับชำระ → ออกบิล → (ใบกำกับ/สรุปส่งลูกค้า)

**เส้นทาง**:
1. ค้นลูกค้า: `syncSearchContact` → `searchContact` (ZORT) · รายละเอียด `getContactDetail`
2. ออกบิล: สร้าง `billCid` → `syncCreateSaleBill` → `createSaleBill` → ZORT AddOrder → ชีต "บิลขาย" (22+ คอลัมน์) → `deductFrontStoreForSale_` หัก col G
3. ใบกำกับเต็ม: `issueFullTaxInvoice`
4. สรุปออนไลน์: `OnlineSaleResult` (บันทึกรูป/แชร์/คัดลอก)

**เช็คลิสต์**:
- [ ] สลับโหมด → รีเซ็ต channel/payMethod/cashReceived (กัน "เงินสด" ค้างมาโหมดออนไลน์)
- [ ] ค่าจัดส่งบวกท้ายสุด (`onlineOrderTotal`) — **ไม่ยัดเข้า `computeBillTotals`** (กันถูกลด/ถอด VAT)
- [ ] จัดส่ง (ขนส่ง/ที่อยู่/เลขพัสดุ) ไม่บังคับกรอก · บังคับแค่ผู้รับ + payMethod
- [ ] COD → ไม่บันทึกรับชำระ (`POS_UNPAID_METHODS_` ตรงกับ `paid:false`)
- [ ] ZORT: `pricepernumber×number` = ยอดที่ ZORT หักจริง (ปัดเศษสะสม `buildZortLineItems_`)
- [ ] ZORT ต้องขึ้นมูลค่า+ช่องทาง (ส่ง `amount`/`amount_pretax`/`vatamount` + `saleschannel`) — ไม่ขึ้น 0
- [ ] GAS ตอบ HTML → ถาม `action=billCheck&cid=` ก่อน (กันออกบิลซ้ำ)
- [ ] สรุปออนไลน์: ทางถอย 3 ชั้น (แชร์ไฟล์→ข้อความ→คัดลอก) · COD ไม่แปะเลขบัญชี
- [ ] ใบเสร็จ 80mm / ใบกำกับ A4 พิมพ์ได้ (โหมดหน้าร้าน)

**⏱️ จุดที่ช้า / ปรับได้**:
- `createSaleBill` ยิง ZORT AddOrder (network) — ยาวได้ · billCid กันซ้ำแล้ว
- **งานต่อ**: อัปโหลดสลิป · ยิงเลขพัสดุกลับ ZORT · ดึงรายการขนส่งจริงจาก `/Merchant/GetShippingChannels` (ตอนนี้ hard-code `POS_SHIP_METHODS`)
- ⚠️ **สถานะ "รอโอน" ใน ZORT** ยังไม่แก้ — ZORT ยังไม่ตัดสต็อกจริง รอบ `syncZortBoth` ถัดไปเขียนยอดเดิมทับ

---

### B7. ใบเสนอราคา → อนุมัติ → ใบแจ้งหนี้ (saler / owner) 📄

**ขั้นตอน**: แท็บ "ใบเสนอราคา" → (saler) สร้างใหม่ → พิมพ์ → ตามผล → อนุมัติ/ปิด · (owner) ดูแดชบอร์ด+ตามเซล

**เส้นทาง**:
1. สร้าง: `QuotationFormView` → `syncCreateQuotation` → `createQuotation` (ZORT AddQuotation, tag=ชื่อ session)
2. ร่าง: `syncSaveQuotationDraft`/`syncGetQuotationDrafts` — ไม่เก็บ imageUrl (หาคืนตาม SKU ตอนโหลด `quoteHydrateItems_`)
3. อนุมัติ: `approveQuotation` (→ ออเดอร์ขาย ตัดสต็อก) · ปิด: `voidQuotation`
4. ใบแจ้งหนี้: `getInvoiceNumber` → `nextInvoiceNumber_` (IVB-yyyyMM###) → พิมพ์ `QuotationPrintDoc`

**เช็คลิสต์**:
- [ ] saler default = โหมด pending (หน้าทำงาน) · owner default = summary (แดชบอร์ด)
- [ ] saler: ปุ่ม "➕ สร้าง" เต็มความกว้าง · ชิป "⭐ ของฉัน/📋 ทั้งหมด" · ซ่อนแดชบอร์ด/ตามเซล
- [ ] "ของฉัน" match `it.sale === window._currentUserName` (ชื่อล้วน ไม่ใช่ `_currentUser` ที่มี "(ตำแหน่ง)")
- [ ] แก้ไขใบ → ยอดเท่าใบเดิม (`pricesFinal` กันหักส่วนลดซ้ำ) · `createQuotation` **ไม่ส่ง** pricesFinal
- [ ] โหลดร่างกลับ → รูปสินค้าคืนครบ (ไม่กลายเป็น 📦) · ไม่ทับ price/qty/name ที่ผู้ใช้แก้
- [ ] ใบแจ้งหนี้ 3 แบบ (full/deposit/remaining) หัวเอกสาร+กล่องยอด+หมายเหตุถูกชุด
- [ ] พิมพ์ผ่าน effect ที่เฝ้า `printReq` (ไม่เรียก `runQuoteDocPrint` ตรงใน handler)
- [ ] ปุ่มพิมพ์ครบทั้ง 2 ชนิด **ทั้งการ์ดมือถือและตาราง**
- [ ] ชื่อไฟล์ PDF = "[ชื่อเอกสาร] _ [เลขที่]" (`document.title` + `window.print`)

**⏱️ จุดที่ช้า / ปรับได้**:
- YoY/ลูกค้าใหม่-เก่า คิดฝั่ง frontend จาก `customers[].byMonth` ที่ส่งมาอยู่แล้ว — ไม่แตะ GAS
- **งานต่อ**: แจ้งเตือนใบใกล้หมดอายุ → saler (ต้อง trigger ใหม่ + วน ZORT หลายหน้า = แพง)

---

### B8. เพิ่มสินค้าใหม่ (owner / warehouse) ➕

**ขั้นตอน**: แท็บ "เพิ่มสินค้าใหม่" → SKU builder (Prefix+Variant+Model) → ชื่อ/ราคา/หมวด/ซัพพลายเออร์/จำนวน → เพิ่ม

**เส้นทาง**: `AddProductView` → เช็คซ้ำ `checkSkuExists` (2 ชีต) → `addNewProduct` → ZORT AddProduct → `pushStockToZort_` → append ชีต (col F=tag) → SELF-HEAL block ใน `readProducts_` โชว์ทันที

**เช็คลิสต์**:
- [ ] SKU builder 2 โหมด: "🆕 แบบใหม่" (`nextModelForPrefix`) · "🎨 สีใหม่" (ล็อค prefix+model, disable สีที่มี)
- [ ] ล็อคเลข Model ตอนเพิ่มหลายสี (`heldDesign`) — สีถัดไปคงเลขเดิม
- [ ] Variant จากตารางรหัสสี (`VARIANT_COLOR_CODES`) หรือพิมพ์เอง (ขนาด/ลำดับ)
- [ ] ⚠️ **ห้ามเดา Prefix/รหัสสี/Model** — ไม่ครบต้องถามผู้ใช้ (business rule)
- [ ] ยังไม่มีรูป → ปุ่ม "🔄 ดึงรูปจาก ZORT" (`fetchProductImage`) หลังอัปรูปใน ZORT

**⏱️ จุดที่ช้า / ปรับได้**: สินค้าใหม่ขึ้นเว็บทันทีไม่ต้อง sync ZORT ทั้งก้อน (SELF-HEAL) — ดีอยู่แล้ว

---

### B9. งานจัดพิเศษ MTO (ทุก role ที่มีแท็บ) 🎁

**เส้นทาง**: `createMtoJob` → `saveMtoJobItems` → `deductMaterials` (ตัดวัตถุดิบ) → `closeMtoJob` · `assignMtoJob` (มอบหมาย)

**เช็คลิสต์**:
- [ ] สร้างงาน → เพิ่มรายการวัตถุดิบ → ตัดสต็อกวัตถุดิบ → ปิดงาน
- [ ] `closeMtoJob` ส่ง `clientLoadedAt` (conflict check)
- [ ] ⚠️ `assignMtoJob` เขียน noti `staff:STxxxx` ไว้แล้ว **แต่ยังไม่มีใครเรียกใช้** (งานต่อ)

---

### B10. แจ้งเตือน — LINE + in-app 🔔

**เส้นทาง (in-app)**: `pushInappNoti_` → ชีต "แจ้งเตือนในแอป" → doGet `inappNoti` → `NotiBell` (poll 25 วิ + focus) → กด → `markNotiRead` + พาไปแท็บ+focus SKU

**เช็คลิสต์**:
- [ ] กระดิ่งเห็นเฉพาะ audience ที่ตรง (all/role/staff) · dev นับเป็น owner
- [ ] กดแจ้งเตือน "ออเดอร์ใหม่" → เด้งไปแท็บ orders + scroll หา SKU นั้น (`dmjRequestFocus` ก่อน `handleSetTab`)
- [ ] กด "ของโอนมาหน้าร้าน" → orders + ตัวกรอง "🚚 ส่งแล้ว" (`dmjRequestView`) — ไม่ใช่แท็บ stock
- [ ] "ของหมดหน้าร้าน คลังมี" → categories + ตัวกรอง "🛒 ควรสั่ง" (เกณฑ์ `FS_REORDER_MAX=12` ตรง UI)
- [ ] "ของค้างรับ >3 วัน" → 2 แถวแยก (หน้าร้าน→orders/รับได้ · คลัง→tracking/ตามของ)
- [ ] หาของไม่เจอ → แถบเหลือง "ไม่พบ X" (ไม่เงียบ)

**⏱️ จุดที่ช้า / ปรับได้**:
- in-app ไม่ยิง LINE = ไม่กิน quota → แจ้งได้มากขึ้น
- **ยังไม่มี Web Push** (เด้งตอนปิดแอป) — GAS เซ็น VAPID เองไม่ได้ ต้องใช้ Cloudflare Pages Function (งานต่อ)
- LINE order เข้าคิว + coalesce time-window + ยืดหน้าต่างอัตโนมัติเมื่อใกล้เพดาน

---

### B11. ติดตามสถานะ + ตรวจของค้างรับ (ทุก role) 📡

**เช็คลิสต์**:
- [ ] โหมดตั้งต้น "📋 รายใบโอน" (จัดกลุ่มตาม refNum) · มี "🧾 รายชิ้น" ให้ย้อนดู
- [ ] หัวการ์ด: `รับแล้ว X/Y ใบ` + แถบชิ้น + `⏳ ค้าง N วัน` (≥3 แดง)
- [ ] ยอดหัวการ์ดคิดจาก "ทั้งใบ" (`b.all`) ไม่ใช่เฉพาะที่ผ่านตัวกรอง
- [ ] หน่วยกำกับทุกช่อง (ไทล์=รายการ · สรุป=ชิ้น)

**⏱️ จุดที่ช้า / ปรับได้**: ยังไม่มีตัวกรองช่วงเวลา · สั่ง→จัด→ส่ง→รับ ยังเป็นคนละการ์ด (ไม่มี key เชื่อม) — งานต่อ

---

### B12. รายงาน/วิเคราะห์ (owner / dev) 📊

**เช็คลิสต์**:
- [ ] overview: ยอดขาย/มูลค่าสต๊อก (ขายส่ง `wholesaleRatio`) · MoM อิงเดือนที่เลือก · YoY
- [ ] customers: ลูกค้าใหม่/เก่า/กลับมา/หาย (6 กลุ่ม) · เทียบช่วงเดียวกัน ตัดเดือนไม่จบ
- [ ] staffperf: งาน/ชั่วโมง จาก Audit Log + ลงเวลา · 💰 ยอดขายต่อเซล · จัดกลุ่มตามตำแหน่ง (ไม่ใช่อันดับรวม)
- [ ] deadstock/trends/season/margin(dev) แสดงถูก
- [ ] ⚠️ `completeMonths()` กรองเดือนไม่จบก่อนหาค่าเฉลี่ยเสมอ (8 จุด)

**⏱️ จุดที่ช้า / ปรับได้**:
- staffperf/attreport cache 5 นาที/เดือน · อ่านคอลัมน์วันที่ก่อนหาช่วงแถว แล้วอ่าน 5 คอลัมน์เฉพาะช่วง (ไม่ `getDataRange()`)
- **งานต่อ**: แนวโน้มคนเดียวข้ามเดือน (sparkline หลายเดือน) · แยก "ขาด" กับ "ลา/วันหยุด"

---

<a name="ส่วน-c"></a>
## ส่วน C — เช็คลิสต์รายปุ่มแอคชั่น (ปุ่ม → endpoint → ชีต)

ที่มา endpoint: `POST_FLAG_ACTIONS_` + `doPost`/`doGet` dispatch (`appsscript_complete.gs`)

### C1. doGet (อ่าน — เร็ว ไม่แตะข้อมูล เว้นแต่ระบุ)
| action | ใช้ทำอะไร | หมายเหตุความเร็ว |
|---|---|---|
| `ping` | วัด latency (0KB) | เครื่องมือ diagnose |
| `ver` | เช็ค ts เปลี่ยนไหม (~40B) | ⏱️ ข้ามโหลด 4.2MB ถ้าไม่เปลี่ยน |
| `stocklite` | โพลสต็อก 2 ชีต | ⏱️ เล็กกว่า payload ~50 เท่า |
| `orders` | ดึงออเดอร์สด (ไม่ผ่าน cache) | อ่านชีตตรง |
| `order` | สั่งของ (มี cid) | จับ lock, ปล่อยก่อนยิง LINE |
| `orderCheck`/`transferCheck`/`billCheck` | ถามก่อนกดซ้ำ | กันซ้ำ 2 เด้ง |
| `recentTransfers`/`zortTransfer` | กู้ของค้างส่ง | อ่านสด |
| `staffPerf`/`attendancePhoto`/`getAuditLog` | รายงาน (session-verified) | cache 5 นาที (staffPerf) |
| `getDeadStock`/`getCustomerAnalytics`/`getQuotationSummary`/`getPendingQuotations` | วิเคราะห์ | |
| `inappNoti`/`productOwners` | กระดิ่ง/ดาว | |
| `lineLoginMeta` | login LINE | |

### C2. doPost แบบ flag (เขียน — มี conflict check / lock)
| flag action | ปุ่ม/หน้า | ชีตที่แตะ |
|---|---|---|
| `updateFrontStore` | นับหน้าร้าน | จำนวนหน้าร้าน + push ZORT |
| `updateOrderState` | จัด/มาร์คเสร็จ | ลำดับสั่งสินค้า col M |
| `transferStock` / `transferStockBatch` | ส่งของ (ทีละ/ทั้งชุด) | สินค้า G:H + โอน (tid col P) |
| `confirmShipmentReceive` | หน้าร้านรับของ | โอน col N |
| `confirmStockCount` | ยืนยันนับคลัง | สินค้า + push ZORT |
| `updateLockData`/`deleteLockEntry` | แก้ตำแหน่งจัดเก็บ | ตำแหน่งจัดเก็บ |
| `createSaleBill` (billCid) | ออกบิล POS | บิลขาย + ZORT + หัก G |
| `issueFullTaxInvoice`/`lookupSaleBill` | ใบกำกับ | ZORT |
| `createQuotation`/`editQuotation`/`saveQuotationDraft`/`deleteQuotationDraft` | ใบเสนอราคา | ZORT + ร่าง |
| `approveQuotation`/`voidQuotation`/`setQuoteSale`/`getInvoiceNumber` | อนุมัติ/ปิด/เลขใบแจ้งหนี้ | ZORT + เลขใบแจ้งหนี้ |
| `addNewProduct`/`checkSkuExists`/`fetchProductImage`/`addPurchaseIn` | เพิ่มสินค้า/ซื้อเข้า | สินค้า + ZORT |
| `createMtoJob`/`saveMtoJobItems`/`deductMaterials`/`closeMtoJob`/`deleteMtoJob`/`assignMtoJob` | MTO | งานจัดพิเศษ |
| `createStockCheck`/`completeStockCheck` | คำขอเช็คสต็อก | |
| `deleteOrder`/`deleteOrders` | ลบออเดอร์ (เช็ค SKU) | ลำดับสั่งสินค้า |
| `zeroStock`/`resetNegativeStock`/`deductStock`/`recordUnscannedSale` | ปรับสต็อก | สินค้า + ZORT |
| `saveThresholds` | เกณฑ์แจ้งเตือน | Script Property |
| `syncZortNow`/`syncZortSalesNow`/`syncZortPurchasesNow` | กด Sync เอง | อ่าน ZORT ทั้งก้อน |

### C3. doPost แบบ action (ล็อกอิน/ลงเวลา/staff/noti/ดาว)
| action | ปุ่ม/หน้า |
|---|---|
| `authLine`/`claimLoginHandoff`/`me`/`logout` | ล็อกอิน |
| `listStaff`/`saveStaff`/`listActiveStaffNames` | จัดการพนักงาน (owner) |
| `punch`/`myToday`/`myAttendanceSummary`/`attendanceToday`/`attendanceMonthlySummary`/`fixAttendance` | ลงเวลา |
| `markNotiRead` | กระดิ่ง (ต้องอยู่ `COMMON_ACTIONS_`) |
| `setProductOwner` | ดาวผู้ดูแลสินค้า |

**เช็คลิสต์รายปุ่ม (หัวใจ)**:
- [ ] ทุกปุ่มที่เขียนข้อมูล → อ่านคำตอบผ่าน `dmjJson` (ไม่ `res.json()` ดิบ — บทเรียน 13) · มี SCAN gate ใน `tests/gasjson.test.js`
- [ ] ปุ่มที่ยิงใกล้กัน → ต่อคิว (`fsInflightRef`/`shipInflightRef`) ไม่ยิงขนาน
- [ ] ปุ่ม confirm → `ConfirmModal` กันดับเบิลแท็บด้วย `useRef`
- [ ] ช่องกรอกตัวเลขพรีฟิล → `onFocus select()` (บทเรียน 14)
- [ ] action ที่มี cid/tid/billCid → กดซ้ำได้ปลอดภัย · ที่ไม่มี → ห้าม auto-retry
- [ ] transferStockBatch/closeMtoJob → ส่ง `clientLoadedAt` (conflict check ไม่ถูก bypass)

---

<a name="ส่วน-d"></a>
## ส่วน D — สรุปโอกาสเพิ่มความเร็ว (จัดลำดับตามผลตอบแทน)

| # | โอกาส | ผล | ความเสี่ยง/หมายเหตุ |
|---|---|---|---|
| 1 | **ยืนยัน gzip บนสาย** — เช็ค `Content-Encoding` ของ payload จริง; ถ้ายังไม่บีบ = เปิดได้ทันที | 🔥 ลดไบต์บนสาย ~70% (คอขวดหลัก Phase 7.4) | ต่ำ — เป็นการตั้งค่า/ยืนยัน ไม่แตะ logic |
| 2 | **ลดขนาด `products[]`** — ตัดฟิลด์ที่หน้าแรกไม่ใช้ + lazy-load ส่วนวิเคราะห์ | 🔥 payload 4.2MB คือน้ำหนักเกือบทั้งหมด | กลาง — ต้องไล่ view จริงก่อนตัด (`PLAN-PHASE8-PAYLOAD.md`) |
| 3 | **`readAttEvents_` เลิกอ่านชีตลงเวลาทั้งใบ** — index/TextFinder/แยกชีตรายเดือน | ยิ่งใช้ยิ่งช้าลง (2 หมื่นแถว/ปี) | รอ `[perf]` log จริงก่อน · ระวัง append ล่างสุด |
| 4 | **precompile `.jsx`** — เลี่ยง Babel compile ครั้งแรกหลัง deploy | ทุกเครื่องจ่ายค่า compile 1 รอบต่อ deploy | มี `PRECOMPILE.md` แล้ว |
| 5 | **tid ให้ `transferStock` (ส่งทีละใบ)** ฝั่ง GAS | ปลดล็อกให้ retry ส่งทีละใบได้ปลอดภัย | ทำแบบเดียวกับ cid/batch tid |
| 6 | **แก้สถานะ "รอโอน" ใน ZORT** (POS) | ยอด/สต็อกไม่ถูกเขียนทับรอบ sync | ต้องเก็บตัวเลขจริงก่อน อย่าเดา |
| 7 | **Web Push** (เด้งตอนปิดแอป) ผ่าน Cloudflare Pages Function | ปลุกได้เหมือน LINE โดยไม่กิน quota | ใหญ่ — GAS เซ็น VAPID เองไม่ได้ |
| 8 | **หน้าอ่านชีต "ประวัติรับสินค้า"** + ค้นข้าม 2 ชีตในแท็บติดตาม | ตรวจของค้างรับย้อนหลังได้ | งานต่อ |
| 9 | **เชื่อม สั่ง→จัด→ส่ง→รับ เป็นเส้นเดียว** (key เชื่อม order↔shipment) | ติดตามทั้งเส้นทางในการ์ดเดียว | ต้องออกแบบ key |
| 10 | **staffperf: sparkline แนวโน้มข้ามเดือน** + แยกลา/วันหยุด/ขาด | ตัดสินใจเรื่องคนได้แม่นขึ้น | แยก "ขาด/ลา" แตะ semantics ใกล้เงินเดือน — ทำก้อนแยก |

**หลักที่ทำไว้ดีแล้ว (อย่าถอย)**: single-flight + stale-while-rebuild (7.3) · payload แยก role + ยอดย่อ · `ver`/`stocklite` skip · `dmjJson`/`dmjFetch` timeout · cid/tid/billCid กันซ้ำ · in-app noti ไม่กิน quota · attendance fast-path (`NO_DATA_TABS`)

---

_เอกสารสร้างจากการไล่โค้ดจริง (`app.jsx` ROLE_TABS/TABS · `appsscript_complete.gs` dispatch) + `CLAUDE.md`_
