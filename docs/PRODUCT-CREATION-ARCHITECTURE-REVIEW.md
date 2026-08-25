# PRODUCT CREATION — Architecture Review (Investigation Only)

> **สถานะ**: investigation-only · ยังไม่แก้โค้ด ยังไม่ approve architecture
> **ขอบเขต**: การสร้างสินค้าใหม่ (Add Product) + SKU generator เท่านั้น
> (ไม่แตะ Login / MTO / Waiting Transfer) · เอกสารนี้อ้างอิงโค้ดจริง ณ `master` = `363f458`
> อ่านคู่กับ `CLAUDE.md` หัวข้อ "Business Rule: การสร้างรหัสสินค้า (SKU)" + "Sprint 2/4 AddProductView"

---

## 1. Current Architecture

### 1.1 ชั้นข้อมูล (source of truth)

| ระบบ | บทบาท | หมายเหตุ |
|---|---|---|
| **ZORT** (`/Product/AddProduct`) | **source of truth ของ "การมีอยู่" ของสินค้า** | สินค้าถูกสร้างที่ ZORT ก่อนเสมอ · sync กลับเข้าชีตเป็นระยะ |
| **Google Sheets** | สิ่งที่ "เว็บอ่านจริง" | เว็บ**ไม่อ่านสด ZORT** — อ่านจากชีตที่ ZORT sync ลงมา |

**ชีตที่เกี่ยวข้องกับการสร้างสินค้า** (constants ใน `appsscript_complete.gs`):

| ชีต | const | บทบาท | คอลัมน์ที่ใช้ (0-indexed) |
|---|---|---|---|
| `ข้อมูลสินค้า` | `SHEET_PRODUCT_META` (:193) | **catalog หลักที่เว็บอ่าน** (`readProducts_`) | B=sku C=name D=imageUrl(fallback) E=location F=**category** G=tag H=vendor I=qtyStore J=qtyWH K=qtyTotal |
| `อัพเดทจำนวนสินค้า` | `SHEET_PRODUCTS` (:185) | ชีตสต็อก · **`addNewProduct` เขียนที่นี่** | A="" B=sku C=name D=**category** E="" F=tag G=qtyStore H=qtyWH I=price |
| `imageUrl` | (readImageMap_) | รูปสินค้า | A=ID B=SKU C=ชื่อ D=manual(fallback) E=ZORT(primary) F=Drive fileId(ลบรูปชั่วคราว) |
| `ผู้ดูแลสินค้า` | `SHEET_PRODUCT_OWNER` (:202) | ⭐ ใครดูแลสินค้าตัวไหน (แยกจากการสร้าง) | A=sku B=staffId C=ชื่อ D=updatedAt E=status F=note |
| `สินค้าที่ซ่อน` | `SHEET_HIDDEN_PRODUCTS` (:203) | soft-delete (ลบจาก ZORT) | A=sku … |

⚠️ **column semantics ของสองชีตสินค้า "ไม่ตรงกัน"** — `SHEET_PRODUCTS` D=category แต่ `SHEET_PRODUCT_META` D=imageUrl, F=category · `addNewProduct` เขียนลง `SHEET_PRODUCTS` (D=cat) แล้ว **SELF-HEAL** ใน `readProducts_` (:9743) เชื่อมให้สินค้าใหม่โผล่บนเว็บก่อน ZORT sync จะเขียน `SHEET_PRODUCT_META` · SELF-HEAL อ่าน `SHEET_PRODUCTS` C=name D=cat F=tag G/H=qty แต่ **ไม่อ่าน price (I)** → สินค้าใหม่โชว์ **฿0 ชั่วคราว** จนกว่า full ZORT sync จะเขียน META

### 1.2 ชั้น UI (frontend)

- **`AddProductView`** (`views-main.jsx:9172`) — owner + warehouse · แท็บ `newproduct`
  - 2 โหมดบนสุด: **"➕ เพิ่มสินค้าใหม่"** (add) · **"📥 ซื้อเข้า/เติมสต็อก"** (`PurchaseInPanel` :9941 → สร้าง PO จริงใน ZORT)
  - โหมด add มี **SKU builder ตาม business rule** + batch queue (สูงสุด 10) + รูป(ไม่บังคับ)
- helper pure functions (มีสำเนาใน `tests/helpers.js`):
  - `parseSkuParts` (:3603) · `nextModelForPrefix` (:3612) · `suggestNextSku` (:3540, **ของเก่า ไม่ใช้แล้ว**)
  - `VARIANT_COLOR_CODES` (:3570) — ตารางรหัสสี 99 รหัส hardcode
- sync helpers → GAS: `syncAddProduct` (:9070) · `checkSkuExistsRemote` (:9118) · `productShrinkImage` (:9132) · `syncUploadProductPhoto` (:9156)

### 1.3 ชั้น backend (GAS)

- doPost dispatch: `data.addNewProduct` → `addNewProduct(ss, product, actor)` (:2526, ฟังก์ชัน :7400)
- doPost dispatch: `data.checkSkuExists` → `checkSkuExists` (:7389) → `collectExistingSkus_` (:7371)
- `pushStockToZort_` (:5270) — ตั้ง/อัปเดตสต็อกฝั่ง ZORT
- รูป: `saveProductPhoto_` / `writeManualProductImage_` / `cleanupTempProductPhoto_`
- **สิทธิ์**: `addNewProduct` อยู่ใน `ROLE_ACTIONS_.warehouse` (:862) + owner/dev ผ่าน `isAdminRole_` · `REQUIRE_LOGIN` ยัง default ปิด → gate เป็น no-op เป็นส่วนใหญ่ (ไม่อยู่ใน `IMMEDIATE_GATE_*`)

---

## 2. Current Flow (end-to-end)

```
[AddProductView — โหมด "เพิ่มสินค้าใหม่"]
  ① เลือกหมวด            → chips จาก products เดิม (เรียงความถี่) หรือพิมพ์หมวดใหม่ (free text)
  ② สร้าง SKU (client)   → 2 โหมด:
       "🆕 แบบใหม่":  เลือก/พิมพ์ Prefix (1-3 ตัว) → nextModelForPrefix() หา Model ถัดไป
       "🎨 สีใหม่":   ค้นหาแบบเดิม → ล็อค prefix+model → เลือกเฉพาะรหัสสีใหม่
     Variant: เลือกจาก VARIANT_COLOR_CODES หรือพิมพ์เอง (ขนาด/ลำดับ)
     assembledSku = Prefix + Variant(2) + Model(3)   เช่น OL19001
  ③ เช็คซ้ำ:  local (skuSet) ทันที + remote (checkSkuExists, debounce 600ms)
  ④ ชื่อ / ราคาส่ง / จำนวน / คลัง(default W0002) / ซัพพลายเออร์(TAG,ไม่บังคับ) / รูป(ไม่บังคับ)
       ชื่อที่บันทึกจริง (composedName) = ชื่อ + ชื่อสี + "ราคาส่ง"  เช่น "ยิปโซแห้ง เขียว 68"
       sellprice ที่บันทึก = ราคาปลีก = ราคาส่ง × RETAIL_MULT(1.25)   [views-main.jsx:9366]
  ⑤ ➕ พักเข้าคิว (batch) หรือ 💾 บันทึกทั้งหมด → syncAddProduct() ทีละตัว
         │
         ▼  POST { addNewProduct:true, product, actor }
[GAS addNewProduct]  (:7400)
  1. validate sku/name
  2. ScriptLock (tryLock 10s)
  3. เช็คซ้ำในชีต — collectExistingSkus_ (อ่าน SHEET_PRODUCTS.B + SHEET_PRODUCT_META.B)
  4. ZORT POST /Product/AddProduct { sku, barcode:sku, name, sellprice, unittext:"ชิ้น", category, tag:[] }
        └─ ZORT ปฏิเสธ (zErr) → logZortFailure_ + return error (ไม่เขียนชีต)   ← ชั้นกันซ้ำที่ 2
  5. ถ้า qty>0 → pushStockToZort_([{sku, qty, warehousecode}])
  6. appendRow ลง SHEET_PRODUCTS: ["", sku, name, cat, "", tag, qtyStore, qtyWH, price]
  7. รูป (ถ้ามี) → saveProductPhoto_ → writeManualProductImage_ (col D imageUrl) · ไม่ throw
  8. writeAuditLog_ + invalidateCache_
         │
         ▼
[เว็บเห็นสินค้าใหม่ทันที] ผ่าน SELF-HEAL ใน readProducts_ (ราคา ฿0 ชั่วคราว) จนกว่า ZORT sync → META
```

**สิ่งที่ flow ปัจจุบัน "ไม่ทำ" ที่ควรรู้:**
- ❌ **ไม่มีขั้น "มอบเจ้าของ (owner)"** — สินค้าใหม่ไม่มีคนดูแลจนกว่าจะมีคนกด ⭐ หรือรัน bulk assign tool
- ❌ **ไม่มีขั้น barcode generation แยก** — SKU = barcode โดยตรง (Code128 สร้างตอนพิมพ์ label ที่ `LabelPrintView`)
- ❌ **ไม่มี validation ว่า prefix "มีจริง/ถูกต้อง"** — ตรวจแค่ *รูปแบบ* (1-3 ตัว) ไม่ได้ตรวจว่าเป็น prefix ที่รู้จัก

---

## 3. Current SKU Logic (ตอบ objective 2)

| คำถาม | คำตอบจากโค้ดจริง |
|---|---|
| SKU สร้างที่ไหน | **ฝั่ง client ล้วน** (`AddProductView`, `views-main.jsx`) · backend รับ SKU สำเร็จรูป ไม่สร้าง/ไม่แก้ |
| โครงสร้าง | `[Prefix 1-3][Variant 2 หลัก][Model 3 หลัก]` — regex `parseSkuParts` (:3604) `^([A-Z]{1,3})(\d{2})(\d{3})$` |
| Prefix มาจากไหน | ผู้ใช้เลือก/พิมพ์เอง · chip แนะนำมาจาก **prefix ที่มีอยู่ใน products เดิม** (`prefixInfo` :9249) หรือค้นด้วยชื่อสินค้า (`prefixByName` :9265) · **ไม่มี master list / ไม่มี prefix→หมวด mapping** |
| Running number (Model) | `nextModelForPrefix(prefix, products)` (:3612) = max model ของ prefix นั้น **จาก products ที่ client โหลดมา** + 1 · โหมด "สีใหม่" คงเลข Model เดิม · โหมด "แบบใหม่หลายสี" ล็อกเลขด้วย `heldDesign` |
| Variant | จาก `VARIANT_COLOR_CODES` (99 รหัส hardcode) หรือพิมพ์เอง |
| กันซ้ำที่ไหน | **3 ชั้น**: (1) client `skuSet` (products+queue) ทันที · (2) client `checkSkuExists` remote (debounce) · (3) backend `collectExistingSkus_` (2 ชีต) + **ZORT AddProduct ปฏิเสธ** ถ้าซ้ำใน ZORT ที่ยังไม่ sync |
| Source of truth | **ZORT** สำหรับ "มีอยู่จริงไหม" (AddProduct reject) · **ชีต** สำหรับ pre-check เร็ว · ⚠️ dup-check หลักอิงชีต ซึ่ง lag ตาม ZORT sync |

**ข้อสังเกตเชิงสถาปัตยกรรม:** running number ไม่มี authority ฝั่ง server — คำนวณจาก snapshot ที่ client โหลด → **race ได้** (ดูข้อ 6.1)

---

## 4. Product Type / Prefix / Category (ตอบ objective 3)

### 4.1 Category

- **ไม่มี category master sheet / ไม่มี category config** · หมวด = ค่าที่พิมพ์ไว้ใน `SHEET_PRODUCT_META` คอลัมน์ F (ยืนยันในคอมเมนต์ :11305 + เครื่องมือ `listProductCategories()`)
- `AddProductView` สร้าง chip หมวดจาก **products เดิม เรียงความถี่** (`allCats` :9197) + ยอมพิมพ์หมวดใหม่ได้เสมอ (free text) → **หมวดพิมพ์ผิด = หมวดใหม่เงียบ ๆ**
- มี `CAT_ORDER` hardcode ใน `CategoryView` (`views-main.jsx:3642`) — ใช้แค่ *ลำดับการแสดง* ไม่ใช่ master/validation
- `PRODUCT_OWNER_ASSIGN_PLAN_` (`.gs:~11308`) มี **category→owner mapping แบบ hardcode array** (ใช้กับเครื่องมือ assign ดาว ไม่ใช่ตอนสร้าง)

### 4.2 Product Type / Prefix

- **ไม่มี product-type list · ไม่มี prefix master · ไม่มี prefix→category mapping ที่ไหนเลยในโค้ด/config/ชีต**
- business rule (`OL`=มะกอก, `R`=กุหลาบ, รหัสสี) อยู่ **เฉพาะใน `CLAUDE.md` (เอกสาร) + หัวเจ้าของ** — โค้ดรู้แค่ *รูปแบบ* ไม่รู้ *ความหมาย*
- ตัวแยก prefix จาก SKU ที่มีอยู่: `parseSkuParts` (frontend) · `productOwnerSkuPrefix_`/`mtoSkuPrefix_` (:11352, backend) — ทั้งหมดเป็น *parser* ไม่ใช่ *validator/registry*

### 4.3 สรุป hardcoded / config / duplicated

| ข้อมูล | อยู่ที่ | รูปแบบ | ซ้ำที่ไหน |
|---|---|---|---|
| ตารางรหัสสี 99 รหัส | `VARIANT_COLOR_CODES` (views-main.jsx) | **hardcode array** | สำเนาใน `tests/helpers.js` + ตารางใน `CLAUDE.md` (3 ที่) |
| prefix→หมวด (OL=มะกอก) | — | **ไม่มีในโค้ด** (เอกสารเท่านั้น) | `CLAUDE.md` |
| category→owner | `PRODUCT_OWNER_ASSIGN_PLAN_` (.gs) | **hardcode array** | — |
| ลำดับหมวด | `CAT_ORDER` (views-main.jsx) | **hardcode array** | — |
| คลัง default | `W0002` (frontend `wh` state) + `WH_SAI5` (.gs) | hardcode 2 ที่ | frontend/backend แยกกัน |
| ราคา ปลีก/ส่ง factor | `RETAIL_MULT=1.25` (frontend) · `WHOLESALE_RATIO=0.8` (Script Property, .gs) | frontend hardcode / backend config | **นิยาม 2 ที่ ไม่ผูกกัน** |
| หน่วยสินค้า | `"ชิ้น"` (fix ทั้ง frontend+backend) | hardcode | — |

**Script Properties ที่เกี่ยว**: `WHOLESALE_RATIO` (มูลค่าสต๊อก, ไม่เกี่ยว SKU) · `SHEET_ID`/`ZORT_*` (secrets) — **ไม่มี Script Property ใดคุม prefix/หมวด/running number เลย**

---

## 5. Existing UI (ตอบ objective 4)

### 5.1 หน้า Add Product — ที่มีแล้ว (ดี)
- SKU builder แยก 2 โหมด (แบบใหม่ / สีใหม่ของแบบเดิม) ตรง business rule
- ค้นหา prefix ด้วยชื่อสินค้า · disable สีที่แบบนี้มีแล้ว · ล็อกเลข Model ตอนเพิ่มหลายสี
- เช็คซ้ำ 3 ชั้น · batch queue · รูปถ่าย/เลือก(ย่อขนาด) · แสดง SKU ประกอบแบบ live

### 5.2 ปัญหา / ช่องว่าง UX
- ⚠️ **หมวดพิมพ์อิสระ = หมวดผีได้** (พิมพ์ "ดอกไม้ " มีเว้นวรรค = หมวดใหม่) — ไม่มี normalize/validation ตอนสร้าง
- ⚠️ **prefix พิมพ์อิสระ = ครอบครัวรหัสผิดได้เงียบ ๆ** (พิมพ์ `OI` แทน `OL` → format ถูก แต่ผิดประเภทสินค้า) — ไม่มี registry เตือน
- ⚠️ **ไม่มีขั้นมอบเจ้าของ (owner)** ในหน้าสร้าง — คนคลังสร้างเสร็จ สินค้าลอยไม่มีเจ้าภาพ จนกว่าจะมีคนไปกดดาวทีหลัง
- ⚠️ **ราคาที่กรอก = "ราคาส่ง" แต่ระบบบันทึก "ปลีก ×1.25" + ยัดราคาส่งไปต่อท้ายชื่อ** — เป็น convention ที่ซ่อนอยู่ อ่านฟอร์มเปล่า ๆ ไม่รู้ · แก้ factor ต้องแก้โค้ด
- **ฟิลด์ที่ "ไม่มี"** เทียบกับ ERP ทั่วไป: หน่วยนับ (fix "ชิ้น"), ราคาทุนจริง (ZORT ไม่มี — ดู CLAUDE.md ข้อ 3), owner, สถานะเผยแพร่, mapping ประเภท
- **inventory workflow**: จำนวนเริ่มต้นเข้าคลังเดียว (default W0002) · ถ้าต้องการทั้งคลัง+หน้าร้านต้องสร้างแล้วโอนทีหลัง

---

## 6. Required Business Flow — Gap Analysis (ตอบ objective 5)

| ความสามารถที่ต้องการ | ระบบปัจจุบันรองรับ? | หลักฐาน |
|---|---|---|
| **automatic SKU generation** | 🟡 **กึ่งอัตโนมัติ** (ช่วยเดา Model/สี แต่ผู้ใช้ยังเลือก prefix/variant เอง · client-side) | `nextModelForPrefix`, `AddProductView` |
| **configurable prefix mapping** | ❌ **ไม่มี** — prefix ไม่มี registry, ไม่มี prefix↔หมวด, business rule อยู่ในเอกสารเท่านั้น | ไม่มี const/sheet/property |
| **configurable running number** | ❌ **ไม่มี config + ไม่มี authority** — running มาจาก max ของ snapshot ที่ client โหลด | `nextModelForPrefix` (:3612) |
| **configurable category mapping** | 🟡 มี category→owner **hardcode array** (แก้ต้อง deploy) · หมวดเองไม่มี master | `PRODUCT_OWNER_ASSIGN_PLAN_` |
| **configurable owner assignment** | 🟡 มี bulk-assign tool (hardcode plan, รันมือใน GAS editor) · **ไม่ auto ตอนสร้าง** · ⭐ กดทีละตัวได้ | Sprint 7 (CLAUDE.md) |

**สรุป**: ระบบวันนี้ = "**SKU builder ช่วยพิมพ์** + สร้างเข้า ZORT/ชีต" · **ยังไม่ใช่ "SKU/หมวด/เจ้าของ ที่ configurable จากศูนย์กลาง"** — ความรู้ธุรกิจ (prefix→ประเภท, หมวดมาตรฐาน) ยังไม่ถูก encode เป็นข้อมูล

---

## 7. Risks (ตอบ objective 6)

### 7.1 Architectural
1. **Running number ไม่มี server authority → race condition**: 2 เครื่องเพิ่ม "แบบใหม่" ของ prefix เดียวกันพร้อมกัน ต่างคำนวณ Model ถัดไปได้เลขเดียวกัน (เช่นทั้งคู่ได้ 026) แต่คนละสี → SKU ต่างกัน → **dup-check ผ่านทั้งคู่** → เกิด 2 "แบบ" ที่แชร์เลข Model เดียวกัน (ผิดกติกา "Model = running ของแบบ") **โดยไม่มี error**
2. **ความรู้ธุรกิจอยู่ในเอกสาร ไม่ใช่ข้อมูล**: prefix→ประเภท, หมวดมาตรฐาน, กติกา variant ต่อหมวด — ทำให้ validate/automate ไม่ได้ และพึ่งวินัยคนล้วน
3. **2 ชีตสินค้า column semantics ต่างกัน + SELF-HEAL เป็นกาว**: เปราะต่อการเลื่อนคอลัมน์ (บทเรียนข้อ 5) · ราคา ฿0 ชั่วคราวเป็นผลข้างเคียง
4. **dup-check หลักอิงชีต (lag ตาม ZORT sync)** — ชั้นกันซ้ำจริงคือ ZORT reject ซึ่งเห็นตอนกดบันทึกแล้วเท่านั้น

### 7.2 Technical debt / coupling
- factor ราคา (1.25 frontend vs 0.8 backend) **นิยาม 2 ที่ ไม่ผูกกัน** — แก้ WHOLESALE_RATIO แล้ว frontend ไม่ตาม
- `VARIANT_COLOR_CODES` ซ้ำ 3 ที่ (views-main / helpers / CLAUDE.md) — drift ได้
- คลัง default hardcode 2 ที่ (frontend `W0002` / backend `WH_SAI5`)
- convention "ยัดราคาส่งต่อท้ายชื่อสินค้า" ผูกกับ parsing ที่อื่น (ต้องตรวจก่อนเปลี่ยน)

### 7.3 Migration / future risk
- ถ้าจะทำ **prefix/หมวด registry** ต้อง migrate ความรู้จากเอกสาร→ข้อมูล + backfill ตรวจ SKU เดิมที่ prefix ไม่ตรงหมวด
- ถ้าจะให้ **running number authoritative** ต้องย้ายการออกเลขไป backend (endpoint จองเลข) — กระทบ flow client ปัจจุบัน
- ZORT ยังเป็น source of truth — feature ใด ๆ ที่ generate ฝั่งเราต้องคิดเรื่อง "สร้างที่เราก่อน แล้ว reconcile กับ ZORT" (เสี่ยงสองเด้ง เหมือนบทเรียน cid/tid)

---

## 8. Recommendations (ตัวเลือก — ยังไม่ตัดสินใจ)

> เรียงจาก "แก้เจ็บน้อย ได้เยอะ" ไปหา "ยกเครื่อง" · **ทั้งหมดเป็นข้อเสนอ รอ approve ก่อนเขียนโค้ด**

- **R1 (เบา, กันพลาดทันที)**: normalize หมวด (trim/เทียบ case) + เตือน "หมวดใหม่ที่ไม่เคยมี" ก่อนบันทึก · เตือน "prefix ที่ไม่เคยมี" (soft warning ไม่บล็อก)
- **R2 (กลาง, ปิด race)**: ย้ายการออก Model number ไป backend — endpoint `reserveSku`/`nextModel` จับล็อก + อ่านชีต+ZORT เป็น authority (แบบเดียวกับ `cid`/`tid`) · client เป็นแค่ตัวเสนอ
- **R3 (กลาง, encode ความรู้)**: สร้าง **registry เป็นชีต/Script Property** — `prefix → {ประเภท, หมวด default, variant rule}` · ให้ SKU builder + validation อ่านจากที่เดียว (เลิกพึ่งเอกสาร)
- **R4 (กลาง)**: auto-suggest owner ตอนสร้าง จาก category→owner ที่มีอยู่ (`PRODUCT_OWNER_ASSIGN_PLAN_` → ย้ายเป็น config) — ให้กดยืนยันตอนสร้าง ไม่ปล่อยลอย
- **R5 (คุณภาพ)**: รวม factor ราคาเป็นแหล่งเดียว (frontend อ่าน `WHOLESALE_RATIO`/หรือ backend คืน retail มาให้) · รวม `VARIANT_COLOR_CODES` ให้มี source เดียว

> 📌 **R3 ถูกขยายเป็น design เต็มแล้ว** (Product Type Registry schema, target Add-Product flow ทีละ step,
> Supplier/Owner workflow, lifecycle, roadmap) — ดู `docs/PRODUCT-DOMAIN-ARCHITECTURE.md` **Part 2 (§K–§Q)**
> เอกสารนี้ (Creation Review) คงไว้เป็นบันทึก "สถานะปัจจุบัน" ล้วน ไม่ทำซ้ำเนื้อหา target-architecture

---

## 9. Questions requiring OWNER decisions

1. **prefix registry**: อยากให้ prefix→ประเภทสินค้า เป็น **ข้อมูลที่แก้ได้เอง** (ชีต/หน้า config) ไหม หรือคงไว้ในหัว/เอกสารเหมือนเดิม? ถ้าเอา — ใครดูแล mapping และเพิ่ม prefix ใหม่ต้องผ่านใคร?
2. **หมวดมาตรฐาน**: อยากล็อกหมวดเป็น "รายการมาตรฐานเลือกเท่านั้น" (กันพิมพ์ผี) หรือยังต้องพิมพ์หมวดใหม่ได้อิสระ?
3. **running number authority**: ยอมให้ย้ายการออกเลข Model ไป backend (ช้าลงนิดตอนกดสร้าง แต่กันชนเลข) ไหม — หรือความถี่ที่ 2 คนสร้างแบบใหม่ prefix เดียวกันพร้อมกันน้อยจนไม่ต้องแก้?
4. **owner ตอนสร้าง**: อยากให้หน้าสร้างสินค้า **บังคับ/แนะนำ** เลือกเจ้าของเลยไหม หรือคงให้ไปกดดาวทีหลัง?
5. **ราคา**: factor ปลีก = ส่ง × 1.25 ถูกต้องคงที่ไหม หรือต้องตั้งค่าได้ต่อหมวด/ต่อสินค้า? · การ "ยัดราคาส่งต่อท้ายชื่อสินค้า" ยังต้องการอยู่ไหม (มีระบบอื่น parse ชื่อนี้)?
6. **หน่วยนับ**: fix "ชิ้น" พอไหม หรือมีสินค้าที่ขายเป็นชุด/เมตร/แพ็ค ต้องรองรับหน่วยอื่น?
7. **source of truth**: ยืนยันว่า ZORT ยังเป็น master ของการสร้างสินค้า (เราสร้างที่ ZORT ก่อนเสมอ) ใช่ไหม — หรือมีแผนให้ ERP เราสร้างเองแล้ว push ขึ้น ZORT?

---

## ภาคผนวก — ไฟล์/บรรทัดอ้างอิงหลัก

| หัวข้อ | ตำแหน่ง |
|---|---|
| AddProductView (ฟอร์ม) | `views-main.jsx:9172` |
| SKU parser/next-model/สี | `views-main.jsx:3540,3570,3603,3612` |
| sync helpers (add/check/photo) | `views-main.jsx:9070,9118,9132,9156` |
| PurchaseInPanel (ซื้อเข้า) | `views-main.jsx:9941` |
| addNewProduct (backend) | `appsscript_complete.gs:7400` |
| checkSkuExists / collectExistingSkus_ | `appsscript_complete.gs:7389,7371` |
| readProducts_ + SELF-HEAL | `appsscript_complete.gs:9706,9743` |
| pushStockToZort_ | `appsscript_complete.gs:5270` |
| category→owner plan | `appsscript_complete.gs:~11308` |
| sheet/warehouse/ratio consts | `appsscript_complete.gs:185,193,202,272,297` |

*(investigation-only — ไม่มีการแก้โค้ด/commit/deploy · รอ approve architecture ก่อนเขียนโค้ด)*
