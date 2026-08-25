# PRODUCT DOMAIN — Architecture (Investigation + Design)

> **สถานะ**: investigation + architecture only · ไม่มีการแก้โค้ด/commit/deploy/ADR
> **ขอบเขต**: โดเมน "สินค้า" ทั้งหมด (ไม่แตะ Login / Waiting Transfer) · อ้างอิงโค้ดจริง ณ `master` = `363f458`
> **อ่านคู่กับ**: `docs/PRODUCT-CREATION-ARCHITECTURE-REVIEW.md` (เจาะเฉพาะการสร้าง) · `CLAUDE.md` (business rule SKU, payload, sprint 2/4/7)
> เขียนในมุม **System Architect** — โมเดลโดเมน ไม่ใช่รายละเอียด UI

---

## A. Current Domain (ภาพรวม)

โดเมนสินค้าปัจจุบัน **ไม่มี "Product entity" ที่เป็นก้อนเดียว** — สินค้าหนึ่งตัวคือ **ข้อมูลที่กระจายอยู่ 4-5 ที่
แล้วประกอบร่างตอน read** (`buildFullData_` → `readProducts_` + `readSysQty_` + `readImageMap_` + owner/hidden):

```
                         ┌──────────────── ZORT (ระบบภายนอก) ────────────────┐
                         │  Product: sku, barcode, name, sellprice,          │
                         │  category, tag[], unittext, stock/คลัง, imagepath │  ← "มีอยู่จริงไหม" + core attrs
                         └───────────────────────┬───────────────────────────┘
                              syncZortBoth (ทุก 2 ชม.) / addNewProduct (สร้าง)
                                                  ▼
   Google Sheets (สิ่งที่เว็บอ่านจริง — ZORT เป็น master, ชีตเป็น cache):
   ┌────────────────────────┬────────────────────────┬───────────────┬────────────────┬─────────────────┐
   │ "ข้อมูลสินค้า" (META)   │ "อัพเดทจำนวนสินค้า"     │ "imageUrl"     │ "ผู้ดูแลสินค้า"  │ "สินค้าที่ซ่อน"  │
   │ = catalog หลัก          │ = stock (+price col I) │ = 3-tier image │ = owner (⭐)    │ = soft-delete   │
   │ B..K (ดูตาราง Entities) │ B,C,D,F,G,H,I          │ D=manual E=ZORT│ A=sku B=staffId │ A=sku …         │
   └───────────┬────────────┴───────────┬────────────┴───────┬───────┴────────┬───────┴────────┬────────┘
        readProducts_               readSysQty_          readImageMap_    listOwners     getHiddenSkuSet_
               │              (ชนะ META: qty/price)          │                │                │
               └──────────────────────┴─── buildFullData_ (ประกอบ) ─────────┴────────────────┘
                                                  ▼
                            data.products[]  (payload → frontend)
                                                  ▼
                       enrichDataCore (frontend) เติม field derived: cat, supplierTags/statusTags, vendor, deadMonths
```

**ข้อสังเกตแกน**: (1) ไม่มี Product Master · (2) ZORT = master, ชีต = cache หลายใบ · (3) การประกอบร่างเกิดตอน read
· (4) **สร้างได้ผ่านแอป แต่แก้ core attrs (ชื่อ/ราคา/หมวด) ผ่านแอปไม่ได้** — POST dispatch ที่แตะ product มีแค่
`addNewProduct` / `fetchProductImage` / `uploadProductPhoto` (ยืนยันจาก grep) · แก้ต้องไปทำที่ ZORT แล้วรอ sync

---

## B. Entities (ตอบ objective 1)

| Entity | มีจริงในโค้ด? | เก็บที่ไหน | Purpose / Responsibility | Lifecycle |
|---|---|---|---|---|
| **Product** | 🟡 **implicit** (ไม่มี object เดียว) | ประกอบจาก META+stock+image+owner ตอน read | หน่วยสินค้าที่ขาย/นับ/โอน | เกิดที่ ZORT → sync ลงชีต → เว็บ read-compose · ไม่มี id นอกจาก SKU |
| **SKU** | ✅ | ZORT + ชีต (B) | รหัสประจำสินค้า **= primary key ทั้งระบบ** | ผู้ใช้ประกอบฝั่ง client (`AddProductView`) · immutable หลังสร้าง (ไม่มี rename) |
| **Barcode** | ✅ (**= SKU**) | ไม่แยกเก็บ | บาร์โค้ดสินค้า | `barcode = sku` เสมอ (`addNewProduct` payload) · Code128 เรนเดอร์ตอนพิมพ์ label (`LabelPrintView`, JsBarcode) |
| **Category** | ✅ (free text) | META col F / stock col D | จัดกลุ่มสินค้า | พิมพ์อิสระตอนสร้าง · **ไม่มี master** · เปลี่ยนได้เฉพาะที่ ZORT |
| **Product Type** | ❌ **ไม่มี entity** | — (นัยผ่าน prefix) | ประเภทสินค้า (มะกอก/กุหลาบ) | มีแต่ในหัวคน/เอกสาร — โค้ดไม่รู้จัก |
| **Prefix** | 🟡 **derived only** | ฝังใน SKU (1-3 ตัวหน้า) | บอกประเภทสินค้า | parse ด้วย `parseSkuParts`/`productOwnerSkuPrefix_` · **ไม่มี registry / ไม่มี prefix→หมวด** |
| **Model Number** | 🟡 **derived** | ฝังใน SKU (3 หลักท้าย) | running ของ "แบบสินค้า" | `nextModelForPrefix` = max+1 จาก snapshot client · **ไม่มี authority** |
| **Variant** | ✅ | ฝังใน SKU (2 หลักกลาง) + `VARIANT_COLOR_CODES` | สี/ขนาด/ลำดับของแบบ | เลือกจากตารางสี 99 รหัส (hardcode) หรือพิมพ์เอง |
| **Owner (⭐)** | ✅ | ชีต "ผู้ดูแลสินค้า" (key=SKU) | ป้ายบอก "ใครดูแล" (**ไม่ใช่สิทธิ์**) | กดดาวทีละตัว / bulk-assign tool · **ไม่ผูกกับตอนสร้าง** — สินค้าใหม่ไม่มีเจ้าของ |
| **Price** | ✅ (3 มุม) | ZORT sellprice → stock col I · derived fallback | ราคาขาย | ปลีก(ZORT) · ส่ง=ปลีก×`WHOLESALE_RATIO`(0.8) · ทุน=ปลีก×`COST_RATIO`(0.8, **สมมติ**) |
| **Stock** | ✅ | stock sheet G/H (ZORT sync) | จำนวนคงเหลือ 2 คลัง | qtyStore(W0001 หน้าร้าน) / qtyWH(W0002 คลังสาย5) · `applyQtyLocToProduct_` ให้ stock sheet **ชนะ META เสมอ** |
| **Meta** | ✅ | ชีต "ข้อมูลสินค้า" | ชื่อ/หมวด/ตำแหน่ง/tag/vendor/qty | เขียนโดย ZORT sync · เว็บอ่านหลัก · **ไม่มี price ในเส้น read** |
| **Images** | ✅ (3-tier) | ชีต imageUrl D(manual)/E(ZORT)/F(Drive fileId) | รูปสินค้า | ZORT(E) ชนะ manual(D) · รูปถ่ายชั่วคราว(D)→ลบทิ้งเมื่อ ZORT มีรูป (`cleanupTempProductPhoto_`) |
| **Tag** | ✅ (**overloaded**) | META col G / stock col F | ซัพพลายเออร์ + สถานะ | **ฟิลด์เดียวเก็บ 2 ความหมาย** — `enrichDataCore` แยก non-Thai=`supplierTags`(→vendor) · Thai=`statusTags` |
| **ZORT Product** | ✅ (external) | ZORT | source of truth ของ core attrs | สร้าง/แก้/ลบ ที่นี่ · เราอ่านผ่าน `fetchAllZortProducts_` |
| **Sheet Product** | ✅ (**2 ชีต**) | META + stock | cache ของ ZORT ที่เว็บอ่าน | column semantics 2 ชีต**ต่างกัน** · SELF-HEAL เชื่อม |

---

## C. Relationships (ตอบ objective 2 — จากโค้ดจริง ไม่สมมติ)

**ความจริงสำคัญ: ความสัมพันธ์ส่วนใหญ่เป็น "derived / embedded" ไม่ใช่ FK ที่บังคับ**

```
  Category ─(free text, ไม่มี master)─► Product.category         [META col F — พิมพ์อิสระ]

  Product Type ✗ (ไม่มี entity)
       ╎ (ควรจะ)
  Prefix ──embedded──► SKU ──1:1──► Product                      [parseSkuParts: SKU = Prefix+Variant+Model]
       ▲ ไม่มี Prefix→Category / Prefix→ProductType link เลย

  Variant ─embedded (2 หลักกลาง)─► SKU                            [VARIANT_COLOR_CODES lookup]
  Model  ─embedded (3 หลักท้าย)─► SKU  ── "แบบเดียวกันหลายสี" = prefix+model เดียวกัน, variant ต่าง

  Owner ──(ชีตแยก key=SKU, 1 Product : 1 Owner)──► Product        [SHEET_PRODUCT_OWNER — ไม่ผูกตอนสร้าง]
       ▲ มี category→owner mapping (PRODUCT_OWNER_ASSIGN_PLAN_) แต่เป็น hardcode + ใช้ผ่าน bulk tool เท่านั้น

  Product ──► Stock (qtyStore/qtyWH)                              [stock sheet ชนะ META: applyQtyLocToProduct_]
  Product ──► Price (retail→wholesale→cost derived)              [ZORT sellprice → stock col I → derived]
  Product ──► Meta                                               [META = catalog เว็บอ่าน]
  Product ──► Images (3-tier: ZORT>manual>temp)                  [imageUrl sheet D/E/F]
  Product ──► Tag → {supplierTags, statusTags}                   [ฟิลด์เดียว แยกด้วยภาษา]

  ZORT Product ══(master)══► Sheet Product ══(compose)══► data.products[]
       ▲ ZORT สร้าง/แก้/ลบ · ชีตเป็น cache (lag ≤2 ชม.)
```

**ไม่มีความสัมพันธ์เหล่านี้ (ที่ ERP ทั่วไปมี)**: Product↔ProductType, Prefix↔Category, Product↔Family(นอกจากนัย prefix+model), Product↔Template, Product↔Version

---

## D. Sources of Truth (ตอบ objective 3)

| Field | เจ้าของจริง | cache/สำเนา | Authority ซ้ำ? |
|---|---|---|---|
| **การมีอยู่ของสินค้า** | **ZORT** (AddProduct reject) | ชีต (dup pre-check) | 🟡 ชีต lag ตาม sync — dup pre-check ไม่ authoritative |
| **SKU** | **Client ประกอบ** → ZORT เก็บ | ชีต B | 🟡 client เป็นคนคิด (running number ไม่มี server authority) |
| **Barcode** | **Derived (= SKU)** | — | ✅ ไม่ซ้ำ |
| **Name** | **ZORT** | ชีต C | ✅ (แก้ที่ ZORT เท่านั้น) · แต่ชื่อ "ยัดราคาส่งต่อท้าย" ตอนสร้างฝั่ง client |
| **Price (retail)** | **ZORT sellprice** | **stock sheet col I** (`applyQtyLocToProduct_`) · derived จากยอดขายถ้า ≤0 | 🔴 **3 ที่**: ZORT / stock col I / sales-average fallback |
| **Price (wholesale)** | **Derived** (retail × `WHOLESALE_RATIO` 0.8) | — | 🔴 factor คนละที่กับ frontend `RETAIL_MULT` 1.25 |
| **Cost** | **สมมติ** (retail × `COST_RATIO` 0.8) | — | ⚠️ **ไม่ใช่ต้นทุนจริง** — ZORT ไม่มีราคาทุน (CLAUDE.md ข้อ 3) |
| **Category** | **ZORT** | META F / stock D | 🟡 free text + ไม่มี master |
| **Prefix** | **Derived จาก SKU** | — | ✅ (แต่ไม่มี validation ว่า valid) |
| **Owner** | **ชีต "ผู้ดูแลสินค้า"** (ERP เราเอง ไม่ใช่ ZORT) | localStorage cache (client) | ✅ ไม่ซ้ำ · แต่ **disconnect จากตอนสร้าง** |
| **Stock** | **ZORT** | **stock sheet G/H** (ชนะ META) | 🟡 POS/โอน หักชีตเองระหว่างรอ sync (reconcile ทุก 2 ชม.) |
| **Image** | **ZORT (E) > manual (D)** | Drive (รูปชั่วคราว) | 🟡 3-tier priority — จัดการโดย `pickZortImage_`/`cleanupTempProductPhoto_` |
| **Description** | ❌ **ไม่มี field** (ชื่อทำหน้าที่แทน) | — | — |
| **Tag (supplier/status)** | **ZORT tag[]** | META G / stock F | 🔴 **overloaded** — 1 ฟิลด์ 2 ความหมาย แยกด้วยภาษา |

**Authority ที่ซ้ำ/เสี่ยงที่สุด**: **Price** (3 แหล่ง + factor 2 ที่) · **Tag** (overloaded) · **Stock** (ชีต vs ZORT ระหว่าง sync) · **การมีอยู่** (dup pre-check อิงชีตที่ lag)

---

## E. Product Lifecycle (ตอบ objective 4)

| ขั้น | เกิดที่ไหน | มีใน ERP เรา? | หมายเหตุ |
|---|---|---|---|
| **Creation** | `AddProductView` → `addNewProduct` → ZORT → stock sheet | ✅ | ประกอบ SKU client · ZORT ก่อน · SELF-HEAL ให้โผล่ทันที (price ฿0 ชั่วคราว) |
| **Validation** | client (format+dup) + ZORT reject | 🟡 | ตรวจ format+ซ้ำ · **ไม่ตรวจ prefix/หมวด valid** |
| **→ ZORT** | `UrlFetchApp AddProduct` | ✅ | master · reject = ไม่เขียนชีต |
| **→ Google Sheets** | `appendRow` stock sheet | ✅ | เขียน stock sheet (ไม่ใช่ META) |
| **Sync** | `syncZortBoth` (2 ชม.) · `syncNewProductsFromZort` · `syncZortImages` | ✅ | ZORT→ชีต: qty/price/รูป · เขียน META เต็ม |
| **Editing** | **ZORT UI เท่านั้น** | ❌ **ไม่มี path ในแอป** | แก้ชื่อ/ราคา/หมวด/tag ต้องทำที่ ZORT แล้วรอ sync · แอปแก้ได้แค่ รูป/สต็อก/owner/ซ่อน |
| **Selling** | POS `createSaleBill` → ZORT AddOrder + `deductFrontStoreForSale_` | ✅ | หัก qtyStore ในชีต + ZORT ตัดเอง (ห้าม push ซ้ำ) |
| **Inventory** | `deductStock` / `transferStock(Batch)` / `confirmStockCount` / stockcount | ✅ | นับ/โอน/ปรับ · push ZORT ตามกรณี |
| **Deletion** | ลบที่ ZORT → `hideDeletedFromZort()` (GAS editor) | 🟡 | **soft-delete** — เขียนชีต "สินค้าที่ซ่อน" (ไม่ลบแถวจริง) · มี safety (≤40%, ดึงครบ) |
| **Archive** | ชีต "สินค้าที่ซ่อน" | 🟡 | กู้กลับได้ (`unhideProduct`/`clearHiddenProducts`) · **ไม่มี UI** (GAS editor เท่านั้น) |

**ช่องโหว่ lifecycle ที่ชัดสุด**: **ไม่มีขั้น Edit ในแอปเลย** · Archive/Delete ทำได้เฉพาะ GAS editor · Creation ไม่ผูก Owner

---

## F. Configuration — สิ่งที่ควร configurable แต่ตอนนี้ hardcode (ตอบ objective 5)

| สิ่งที่ควร config | ตอนนี้อยู่ที่ | รูปแบบปัจจุบัน | แก้ต้อง |
|---|---|---|---|
| Category list (master) | — | **ไม่มี** (derive จาก products) | — |
| Prefix list / registry | — | **ไม่มี** (derive จาก SKU) | — |
| Prefix → Product Type → Category | `CLAUDE.md` | **เอกสารเท่านั้น** | แก้เอกสาร (โค้ดไม่รู้) |
| Product Type list | — | **ไม่มี** | — |
| Owner mapping (category→owner) | `PRODUCT_OWNER_ASSIGN_PLAN_` (.gs) | hardcode array | **deploy** |
| Retail multiplier | `RETAIL_MULT = 1.25` (views-main.jsx) | hardcode frontend | **deploy** |
| Wholesale multiplier | `WHOLESALE_RATIO` (Script Property, default 0.8) | ✅ config (แต่คนละที่กับ retail) | Script Property |
| Cost ratio | `COST_RATIO = 0.8` (.gs) | hardcode (**ค่าสมมติ**) | deploy |
| Running number rule | `nextModelForPrefix` (client) | hardcode logic + client snapshot | deploy |
| Variant/Color codes | `VARIANT_COLOR_CODES` (99 รหัส) | hardcode (ซ้ำ 3 ที่) | deploy |
| Barcode rule | `barcode = sku` | hardcode | deploy |
| Warehouse default | `W0002`/`WH_SAI5` | hardcode 2 ที่ | deploy |
| Unit (หน่วยนับ) | `"ชิ้น"` | hardcode fix | deploy |
| Naming convention (ยัดราคาต่อท้ายชื่อ) | `composedName` (client) | hardcode logic | deploy |

**สรุป**: เกือบทั้งหมดของ "กติกาโดเมน" เป็น hardcode/เอกสาร · มีแค่ `WHOLESALE_RATIO` เดียวที่ config ได้จริง

---

## G. Risks (ตอบ objective 6)

### Architecture debt
1. **ไม่มี Product Master / ไม่มี Product entity** — ข้อมูลกระจาย 5 ชีต ประกอบตอน read · เพิ่ม field/feature ต้องแตะหลายที่
2. **ความรู้โดเมนอยู่ในเอกสาร ไม่ใช่ข้อมูล** (prefix→ประเภท, หมวดมาตรฐาน) → validate/automate ไม่ได้
3. **ไม่มี Edit path ในแอป** — ผูกกับ ZORT UI ถาวร
4. **Tag overloaded** (supplier + status ในฟิลด์เดียว แยกด้วยภาษาไทย/อังกฤษ) — เปราะมาก (ซัพพลายเออร์ชื่อไทย = แตกทันที)

### Data consistency
5. **Price 3 แหล่ง + factor 2 ที่** (`RETAIL_MULT` frontend vs `WHOLESALE_RATIO` backend ไม่ผูกกัน) → แก้ตัวเดียวอีกตัวไม่ตาม
6. **2 ชีตสินค้า column ต่างกัน + SELF-HEAL เป็นกาว** → เลื่อนคอลัมน์ = พังเงียบ (บทเรียนข้อ 5)
7. **dup pre-check อิงชีตที่ lag** → ชั้นกันซ้ำจริงคือ ZORT reject (เห็นตอนกดบันทึกแล้ว)

### Race conditions
8. 🔴 **Running number ไม่มี server authority** — 2 คนสร้าง "แบบใหม่" prefix เดียวกันพร้อมกัน → Model ชนกัน โดย dup-check ผ่านทั้งคู่ (คนละสี = คนละ SKU) → 2 แบบแชร์เลข Model เดียว (ผิดกติกา) เงียบ ๆ
9. **Stock ชีต vs ZORT ระหว่าง sync** — POS/โอนหักชีตเอง, `syncZortBoth` เขียนทับด้วยเลข ZORT ทุก 2 ชม. (จัดการด้วย invalidateCache/idempotency แล้ว แต่เป็นจุดที่ต้องระวังทุกครั้ง)

### Migration / scalability
10. **ย้ายไป Product Master / registry** ต้อง migrate ความรู้เอกสาร→ข้อมูล + backfill ตรวจ SKU เดิม (prefix ไม่ตรงหมวด)
11. **`getDataRange()` เต็มชีตหลายจุด** (collectExistingSkus_, readProducts_) — โตตามจำนวน SKU (พันตัว) ยังไหว แต่เป็นเพดาน
12. **ZORT เป็น master ถาวร** — feature ที่ generate ฝั่งเราต้องคิด reconcile 2 ทาง (เสี่ยงสองเด้ง เหมือน cid/tid)

---

## H. Future Features — รองรับได้ไหม? (ตอบ objective 7)

| Feature | รองรับ? | เหตุผล (จากสถาปัตยกรรมปัจจุบัน) |
|---|---|---|
| **Product Add** | ✅ มีแล้ว | `addNewProduct` ครบ (แต่ SKU client-side, ไม่ผูก owner) |
| **Product Edit** | ❌ **ไม่ได้** | **ไม่มี edit endpoint เลย** — ต้องสร้าง `updateProduct` + ตัดสินใจว่าแก้ที่ ZORT หรือชีต (source of truth) |
| **Bulk Import** | ❌ ยาก | ไม่มี batch endpoint ฝั่ง import · dup/running number เป็น per-item client · ZORT AddProduct ทีละตัว |
| **CSV Import** | ❌ ยาก | ต้องมี parser + validation + prefix/หมวด registry ก่อน (ไม่งั้น garbage เข้า ZORT) |
| **Bulk Export** | 🟡 ได้บางส่วน | เว็บมี `data.products` เต็มอยู่แล้ว · export CSV ฝั่ง client ทำได้ แต่ยังไม่มี |
| **Owner Assignment** | 🟡 มีแต่ disconnect | ⭐ ทีละตัว + bulk tool (hardcode plan, GAS editor) · ไม่ผูกตอนสร้าง · ไม่มีหน้า config |
| **Analytics** | ✅ มีแล้ว | Overview/ABC/velocity/YoY ใช้ `p.monthly`/`soldRev` — แต่ **COGS/margin จริงไม่ได้** (ไม่มีทุน) |
| **Product History** | 🟡 บางส่วน | Audit Log จับ action (สร้าง/แก้สต็อก/ดาว) แต่**ไม่มี snapshot ค่าเก่าของ attr** (ราคา/ชื่อเปลี่ยนไม่บันทึก) |
| **Versioning** | ❌ ไม่ได้ | ไม่มี concept version/snapshot ของ product เลย |
| **Product Templates** | ❌ ไม่ได้ | ไม่มี template entity · SKU builder เป็น input ช่วยพิมพ์ ไม่ใช่ template |
| **Product Families** | 🟡 นัยอยู่แล้ว | "แบบเดียวกันหลายสี" = prefix+model เดียว (implicit family) · แต่ไม่มี Family entity/หน้าจัดการ |
| **Bundles** | 🟡 ผ่าน MTO | MTO bundle มีบางส่วน (นอกขอบเขตนี้) · ไม่มี bundle ทั่วไป |
| **MTO** | ✅ มีแล้ว | (นอกขอบเขต — ห้ามแตะ) |

**บทสรุปความพร้อม**: สถาปัตยกรรมปัจจุบันรองรับ **Add + Analytics** ได้ดี · **Edit/Import/Versioning/Templates ทำไม่ได้จนกว่าจะมี (ก) Product entity/service กลาง (ข) prefix/category registry (ค) edit endpoint + source-of-truth policy**

---

## I. Recommended Architecture (ข้อเสนอ — ยังไม่ตัดสินใจ ยังไม่ทำ)

> เป้าหมาย: ยก "ความรู้โดเมน" จากเอกสาร→ข้อมูล + มี service กลาง โดย **ไม่ทิ้ง ZORT เป็น master** (ลดความเสี่ยง migration)

**เลเยอร์ที่เสนอ** (เพิ่มทีละชั้น ไม่ยกเครื่องรวดเดียว):

1. **Config layer (ชีต config ใหม่ อ่านที่เดียว)** — 3 ชีต master:
   - `PrefixRegistry`: prefix → {productType, defaultCategory, variantRule(color/size/seq), defaultOwner}
   - `CategoryMaster`: หมวดมาตรฐาน (+ normalize) · owner default · variant rule
   - `PricingRules`: retailMult / wholesaleRatio / costRule ต่อหมวด (ที่เดียว เลิก hardcode 2 ที่)
   - → SKU builder + validation + owner-suggest + pricing อ่านจากที่นี่ทั้งหมด

2. **Product service (backend กลาง)** — endpoint ใหม่:
   - `reserveSku` / `nextModel` (จับล็อก + authority = ชีต+ZORT, ปิด race ข้อ 8 — แบบเดียวกับ cid/tid)
   - `updateProduct` (edit path ที่ขาด — ตัดสินใจ policy: แก้ ZORT→sync หรือ ชีต optimistic)
   - `validateProduct` (prefix/หมวด valid, ราคา, หน่วย) ก่อนแตะ ZORT

3. **Product read model (คงเดิม + เสริม)** — `buildFullData_` ยังประกอบเหมือนเดิม แต่ enrich จาก config layer
   (เช่น productType จาก prefix, owner suggest) · **ไม่แตะ ZORT-as-master**

4. **แยก Tag เป็น 2 ฟิลด์จริง** (supplier / status) แทน overload — migration: split ตอน sync

**หลักการที่ยึด**: ZORT ยังเป็น master ของ core attrs · ชีตเป็น cache · **เพิ่ม "config + service" ไม่ใช่ "ย้าย source of truth"**
· ทุกอย่างเป็น SAFE ROLLOUT (feature flag) เหมือน pattern เดิมของ repo

---

> 📌 **อัปเดต**: Part 1 (A–J) ได้รับ approve หลักการแล้ว (เจ้าของ) — คำถามใน §J ยังเป็นคำถามเปิดเหมือนเดิม
> ไม่ได้ถูกตอบเป็นรายข้อ แต่เจ้าของสั่งขยาย scope ต่อ (**Part 2 ด้านล่าง**: §K–§Q) ตาม 7 หัวข้อที่เคยคุยกันไว้
> ก่อนเริ่ม implementation — Part 2 เป็น **target architecture (ข้อเสนอ)** ไม่ใช่สิ่งที่อนุมัติแล้ว
> ยังต้องตอบคำถามใน §J + คำถามใหม่ใน §Q ก่อนเขียนโค้ด

## J. Questions requiring OWNER decisions

1. **Source of truth ระยะยาว**: ZORT ยังเป็น master ของการสร้าง/แก้สินค้าต่อไปใช่ไหม — หรืออยากให้ ERP เราเป็นเจ้าของ แล้ว push ขึ้น ZORT? (คำตอบนี้กำหนดสถาปัตยกรรมทั้งหมด)
2. **Product Edit**: อยากแก้ ชื่อ/ราคา/หมวด ในแอปได้ไหม? ถ้าได้ — แก้แล้วให้ push ขึ้น ZORT ทันที หรือแก้ชีตก่อนแล้ว reconcile?
3. **Prefix/Category registry**: ยอมทำเป็น "ชีต config ที่แก้เองได้" ไหม (ยกความรู้ออกจากหัว) — ใครมีสิทธิ์แก้ mapping?
4. **Running number authority**: ยอมย้ายการออกเลข Model ไป backend (กันชนเลข ช้าลงนิดตอนกดสร้าง) ไหม?
5. **Owner ตอนสร้าง**: บังคับ/แนะนำเลือกเจ้าของตอนสร้างไหม — และ category→owner ควรเป็น config แก้เองได้ไหม?
6. **Tag**: ยอมแยกเป็น 2 ฟิลด์ (ซัพพลายเออร์ / สถานะ) ไหม — หรือคง overload (เสี่ยงถ้าซัพพลายเออร์ชื่อไทย)?
7. **Pricing model**: factor ปลีก/ส่ง/ทุน — อยากตั้งต่อหมวด/ต่อสินค้าได้ไหม หรือคงคูณคงที่? · ต้องการราคาทุนจริงไหม (ต้องกรอกใน ZORT ก่อน — ตอนนี้เป็น 0/สมมติ)
8. **Edit/Delete/Archive UI**: อยากมีหน้าจัดการ (แก้/ลบ/กู้) ในแอปไหม หรือคงทำที่ GAS editor/ZORT?
9. **ขอบเขตเฟสถัดไป**: อยากเริ่มจาก "Config layer + validation" (เจ็บน้อย) หรือ "Product service + edit" (ใหญ่กว่า)?

---

*(investigation + architecture only — ไม่มีการแก้โค้ด/commit/deploy/ADR · รอ approve architecture ก่อนเขียนโค้ด)*

---
---

# PART 2 — TARGET ARCHITECTURE (ขยาย scope ตามที่คุยกันไว้)

> **สถานะ**: documentation only · ไม่มีการแก้โค้ด/commit/deploy/ADR
> Part 1 (A–J ด้านบน) ถูก approve หลักการแล้ว — Part 2 นี้คือ **ข้อเสนอสถาปัตยกรรมเป้าหมาย** สำหรับ
> 7 หัวข้อที่คุยกันไว้ ยังไม่ใช่สิ่งที่อนุมัติให้ implement — ทุก design decision ที่เป็นของเจ้าของธุรกิจ
> (ไม่ใช่ของสถาปนิก) จะถูก mark **⚠️ NEEDS DECISION** ไว้ในเนื้อหา แล้วรวมเป็นคำถามท้ายสุดใน §Q
>
> **หลักการที่ยึดต่อจาก Part 1**: ZORT ยังเป็น master ของ core attrs (ยังไม่ตัดสินใจเปลี่ยนใน §J-1)
> ทุกของใหม่เป็น **config เพิ่มเติม + SAFE ROLLOUT** (Script Property `_ENABLED='true'`, pattern เดียวกับ
> `INAPP_NOTI_ENABLED`/`PRODUCT_OWNER_ENABLED`/`NOTI_QUEUE_ENABLED` ที่มีอยู่แล้ว) — ไม่ใช่ย้าย source of truth

---

## K. Product Type Registry — Design

### K.1 การค้นพบสำคัญก่อนออกแบบ

เทียบตัวอย่าง Product Type ที่เจ้าของยกมา (Flower→F, Realtouch→RT, Bush→FB, Leaf→L, Leaf Bush→LB,
Tree→TR, Glass Vase→G, Stone Rose→KB, PS Pot→PS, Branch→BR, Grass→GR) กับ**หมวดหมู่ที่มีอยู่จริงในชีต
วันนี้** (`CAT_ORDER`, `PRODUCT_OWNER_ASSIGN_PLAN_` — ดู §B/§C ด้านบน) — **ชื่อแทบตรงกัน 1:1**:

| ตัวอย่างที่เจ้าของยกมา | หมวดที่มีอยู่จริงในชีตวันนี้ |
|---|---|
| Flower | ดอกไม้ |
| Realtouch | Realtouch |
| Bush | บูช |
| Leaf | ใบ |
| Leaf Bush | ใบบูช |
| Tree | ต้นไม้ |
| Glass Vase | แจกันแก้ว |
| Stone Rose | กุหลาบหิน |
| PS Pot | กระถางPS |
| Branch | กิ่งไม้ |
| Grass | ดอกหญ้า |

⚠️ **นี่คือข่าวดี**: Product Type Registry **ไม่ต้องออกแบบจากศูนย์** — seed ได้จาก**หมวดที่มีอยู่แล้ว** (ลด
migration risk ลงมาก เทียบกับสร้างโครงสร้างใหม่ทั้งหมด)

⚠️ **แต่มีจุดที่ต้องตัดสินใจก่อนออกแบบ schema**: business rule ปัจจุบัน (`CLAUDE.md`) ใช้ **Prefix ระดับ
"สายพันธุ์"** ไม่ใช่ระดับ "หมวด" — เช่นหมวด "ดอกไม้" มีหลาย prefix ข้างใน (`R`=กุหลาบ, `OL`=มะกอก, ฯลฯ
หลายสิบ prefix) ในขณะที่ตัวอย่าง "Flower → F" ของเจ้าของเป็น **1 หมวด = 1 prefix เดียว**

**สองแบบนี้ไม่ใช่โครงสร้างเดียวกัน** ⚠️ **NEEDS DECISION** (รวมเป็นคำถามใน §Q):
- **แบบ A** — Product Type = ระดับหมวดกว้าง (Flower/Tree/…) ยังคง prefix สายพันธุ์ย่อยแบบเดิมไว้ข้างใน
  (Registry แค่กำหนด "หมวดนี้ default prefix ยังไม่ระบุ ให้เลือกจาก prefix ย่อยที่มีอยู่")
- **แบบ B** — Product Type แทนที่ prefix สายพันธุ์ทั้งหมด (ทุกดอกไม้ใช้ prefix `F` เดียว ไม่แยก R/OL อีก)
  → กระทบ SKU เดิมหลายพันตัวที่ผูก prefix สายพันธุ์อยู่แล้ว (ต้อง migrate/คงคู่ขนาน)

Registry schema ด้านล่างออกแบบให้ **รองรับได้ทั้ง 2 แบบ** (ความละเอียดของ 1 แถว = 1 Product Type
จะเป็นระดับหมวดกว้างหรือสายพันธุ์ย่อยก็ได้ ขึ้นกับคำตอบของเจ้าของ)

### K.2 Entity: Product Type (แต่ละแถวใน Registry)

| Field | ตามที่เจ้าของสั่ง | คำอธิบาย/ค่าเริ่มต้นที่เสนอ |
|---|---|---|
| **Display Name** | ✅ | ชื่อไทย (หลัก, ตรงกับหมวดเดิม) + ชื่ออังกฤษ (ใหม่, ไม่บังคับ) |
| **SKU Prefix** | ✅ | 1-3 ตัวอักษร ต้อง**ไม่ซ้ำ**ข้าม row (unique constraint) — ตรง regex เดิม `^[A-Z]{1,3}` |
| **Running Number Rule** | ✅ | ขยายเป็น 2 ส่วน (ดู K.3): **Variant Rule** (ใช้ตารางสีมาตรฐาน / พิมพ์เอง-ขนาด-ลำดับ) + **Model Scope** (ปัจจุบัน: running ต่อ prefix, width 3 หลัก, เริ่ม 001) |
| **Barcode Rule** (ถ้าจำเป็น) | ✅ | default = "**เหมือน SKU**" (พฤติกรรมปัจจุบัน) · เผื่อ override อนาคต (เช่น type ที่ต้องใช้ EAN13 จริง) — **ไม่มีความต้องการใช้วันนี้** จึงออกแบบเป็น extension point เฉย ๆ ไม่ implement |
| **Default Owner** (future) | ✅ | staffId อ้างอิงชีต "พนักงาน" — ใช้ suggest ตอนสร้าง (ดู §O) · แทนที่ `PRODUCT_OWNER_ASSIGN_PLAN_` (hardcode array วันนี้) ระยะยาว |
| **Default Supplier** (future) | ✅ | อ้างอิง Supplier Master ใหม่ (ดู §M) — ใช้ suggest ตอนสร้าง |
| **Active / Inactive** | ✅ | type ที่ inactive ไม่โผล่ในตัวเลือกตอนสร้างสินค้าใหม่ (แต่สินค้าเก่าที่ใช้ prefix นี้อยู่ยังอ่านได้ปกติ) |
| **Display Order** | ✅ | เลขจัดลำดับการโชว์ chip/dropdown (แทน `CAT_ORDER` hardcode array วันนี้) |

### K.3 ส่วนขยายที่จำเป็น (ไม่ได้อยู่ใน list ที่เจ้าของยกมา แต่ต้องมีเพื่อให้ Registry แทนที่ business rule ได้จริง)

- **Variant Rule** — วันนี้แต่ละหมวดใช้กฎ variant คนละแบบ (บางหมวดใช้ตารางสี 99 รหัส, บางหมวดพิมพ์เอง
  เป็นขนาด/ลำดับ) แต่**ไม่มี mapping ว่าหมวดไหนใช้กฎอะไร** (CLAUDE.md เขียนตรง ๆ ว่า "ยังไม่มี mapping
  ตายตัว ต้องถามผู้ใช้ทุกครั้ง") — ถ้าจะให้ Registry ตัดสินใจแทนคน ต้องเพิ่มฟิลด์นี้: `variantRule ∈ {color-table, manual-size, manual-sequence}`
- **Category link** — ถ้าเลือก**แบบ A** (K.1) ต้องมีฟิลด์ผูก Product Type → Category ที่มันสังกัด (สำหรับ
  กรณี 1 หมวด มีหลาย Product Type ย่อย)

### K.4 Schema ที่เสนอ (ภาพประกอบ ไม่ใช่ spec สุดท้าย)

```
SHEET_PRODUCT_TYPE_REGISTRY = "ประเภทสินค้า (ตั้งค่า)"
  A=typeId  B=displayNameTh  C=displayNameEn  D=prefix  E=variantRule
  F=modelNumberWidth(=3)  G=barcodeRule(=""→เหมือนSKU)  H=defaultOwnerStaffId
  I=defaultSupplierId  J=categoryLink(ถ้าเลือกแบบA)  K=active  L=displayOrder  M=note
```

- อ่านทีเดียวตอน build payload (เหมือน `readThresholds_`) ไม่ต้องอ่านทุก request
- SKU builder (`AddProductView`) เปลี่ยนจาก "พิมพ์/เลือก prefix อิสระ" → **"เลือก Product Type จาก list"**
  แล้ว prefix/variantRule ถูกกำหนดให้อัตโนมัติ (ดู §L)
- Seed ครั้งแรก: ดึงจากหมวดที่มีอยู่ + prefix ที่เจอจริงในสินค้าปัจจุบัน (`prefixInfo` logic ที่มีอยู่แล้ว
  ใน `AddProductView` ใช้เป็นตัวช่วย generate seed data ได้เลย ไม่ต้องคิดใหม่)

---

## L. Future Add Product UI — Target Workflow

### L.1 Flow ที่เจ้าของสั่ง (ขยายรายละเอียด)

```
① ค้นหาสินค้าที่มีอยู่ก่อน (Search existing product)
      │
      ├─ พบ → [ไปหน้ารายละเอียด/แก้ไข]  ⚠️ ต้องมี Product Edit ก่อน (§J-2, ยังไม่มีวันนี้)
      │
      └─ ไม่พบ ▼
② Create Product (เปิดฟอร์มสร้าง)
      │
③ เลือก Product Type (จาก Registry §K — เลือกจาก list ไม่พิมพ์อิสระ)
      │
④ Registry กำหนด Prefix อัตโนมัติ (+ variantRule ของ type นั้น)
      │
⑤ Generate SKU
      │  ├─ Variant: ตามตารางสี (ถ้า variantRule=color-table) หรือพิมพ์เอง (manual)
      │  └─ Model number: 🔴 ต้องตัดสินใจ (§J-4) — ยังเป็น client snapshot (เดิม)
      │     หรือย้ายไป backend `reserveSku` service (เสนอใน Part 1 §I) ที่กันชนเลขได้จริง
      │
⑥ เช็คซ้ำ (Validate duplicate) — เหมือนเดิม 3 ชั้น (local + remote + ZORT reject)
      │
⑦ Save → addNewProduct (เหมือนเดิม) + [ใหม่] auto-suggest Owner/Supplier จาก Registry (§O)
```

### L.2 ตาราง "ปัจจุบัน vs เป้าหมาย" ต่อ step

| Step | วันนี้ | เป้าหมาย | ขึ้นกับ |
|---|---|---|---|
| ① ค้นหาก่อนสร้าง | ❌ ไม่มี — เข้าฟอร์มสร้างตรง ๆ | ✅ ด่านค้นหาก่อนเสมอ (กันสร้างซ้ำโดยไม่รู้ตัว) | ระบบค้นหาสินค้ามีอยู่แล้วในหน้าอื่น (`CategoryView` multi-token search) — reuse ได้ ไม่ต้องสร้างใหม่ |
| ③ เลือก Product Type | 🟡 เลือก/พิมพ์ prefix อิสระ + ค้นหาด้วยชื่อ | ✅ เลือกจาก Registry list เท่านั้น (กัน prefix ผิด) | §K เสร็จก่อน |
| ④ Prefix อัตโนมัติ | ❌ ผู้ใช้พิมพ์/เลือกเอง | ✅ Registry กำหนดให้ | §K |
| ⑤ Generate SKU (Model) | 🟡 client คำนวณจาก snapshot (race ได้) | 🔴 ยังไม่ตัดสินใจ — เสนอย้าย backend | §J-4, Part 1 §I |
| ⑥ Validate duplicate | ✅ มีอยู่แล้ว 3 ชั้น — คงไว้ | ✅ เหมือนเดิม | — |
| ⑦ Save + assign owner/supplier | 🟡 บันทึกได้ แต่ owner/supplier ไม่ auto-suggest | ✅ suggest จาก Registry (แก้ได้ก่อนบันทึก) | §K, §M, §O |

⚠️ **Batch queue เดิม (สูงสุด 10 รายการ) ยังคงอยู่ได้** — ไม่ขัดกับ flow ใหม่ (แค่ step ③-⑤ เปลี่ยนวิธีเลือก
prefix/model) — **แต่ queue ยังเป็น client-only ชั่วคราว** (ปิดแท็บ = ของในคิวหาย) ซึ่งไม่ตรงกับคอนเซ็ปต์
"Draft" ที่ขอใน §P — ถ้าต้องการ Draft ที่กู้คืนได้จริง ต้องยกระดับ queue เป็น server-side draft (ดู §P)

---

## M. Supplier Domain

### M.1 สถานะวันนี้ (สรุปจาก Part 1)

**ไม่มี Supplier entity เลย** — สิ่งที่เรียกว่า "ซัพพลายเออร์" วันนี้คือ**ค่า free-text ที่ฝังอยู่ในฟิลด์
`tag` ที่ overload กับ "สถานะ"** (แยกกันตอน read ด้วยการเช็คว่ามีตัวอักษรไทยไหม — `enrichDataCore`,
`THAI_RE`) · ไม่มี id, ไม่มี master list, ไม่มีข้อมูลติดต่อ, พิมพ์ผิด/สะกดต่าง = ซัพพลายเออร์คนละคนเงียบ ๆ

### M.2 Entity: Supplier (ที่เสนอ)

| Field | คำอธิบาย |
|---|---|
| `supplierId` | key ใหม่ (เดิมไม่มี — ใช้ชื่อ free-text เป็น key ไม่ได้เพราะสะกดไม่คงที่) |
| `name` | ชื่อที่โชว์ |
| `contact` | เบอร์/LINE/ที่อยู่ (ไม่มีข้อมูลนี้อยู่เดิมเลย — ต้องกรอกใหม่ทั้งหมด) |
| `active` | ใช้งานอยู่ไหม |
| `defaultCategories`/`productTypes` | ซัพพลายเออร์รายนี้มักส่งสินค้าประเภทไหน (ไม่บังคับ, ใช้ suggest) |
| `lastReviewedAt` / `nextReviewDue` | ดูรายละเอียดที่ §N |

### M.3 Supplier ↔ Product relationship

- วันนี้: **1 Product : หลาย tag string** (ซัพพลายเออร์เป็นแค่ 1 ใน tag เหล่านั้น, ไม่มี FK จริง)
- เสนอ: **1 Product : 1 Supplier (optional, FK เป็น `supplierId`)** — ตรงกับพฤติกรรมจริงที่สังเกตได้
  (`allSuppliers`/`lastSupplier`/`vendor` ใน `AddProductView` ใช้เป็น "1 ค่า" อยู่แล้วในทางปฏิบัติ แม้
  โครงสร้างข้อมูลจะเป็น array) — **ไม่รองรับ "หลายซัพพลายเออร์ต่อสินค้า"** เว้นแต่เจ้าของต้องการ (⚠️
  ถามใน §Q)

### M.4 Default Supplier

มาจาก **Product Type Registry** (§K.2, field `defaultSupplierId`) — เมื่อเลือก Product Type ตอนสร้าง
สินค้า ระบบ pre-fill supplier ให้ (แก้ได้) แทนที่ chip แนะนำแบบ frequency-based วันนี้ (`allSuppliers`
เรียงตามความถี่ที่เคยใช้ — ยังใช้เป็น fallback ได้ถ้าไม่ได้ตั้ง default ไว้)

### M.5 Supplier ownership

หมายถึง **"ใครมีสิทธิ์แก้ไขข้อมูลซัพพลายเออร์" ไม่ใช่ "ใครเป็นเจ้าของสินค้า"** (คนละเรื่องกับ Product
Owner ⭐ ใน §O) — เสนอ: เหมือน config entity อื่น ๆ ในระบบ (Product Type Registry, threshold settings)
คือ **owner/dev เท่านั้น** แก้ได้ (`isAdminRole_` gate เดิม) · staff ทั่วไปแค่ *เลือก* ตอนสร้าง/รีวิว

---

## N. Supplier Review Workflow

### N.1 ออกแบบโดยยึด pattern ที่มีอยู่แล้วในระบบ (ไม่ประดิษฐ์ใหม่)

ระบบมี **2 กลไกที่ตรงกับสิ่งที่ต้องการเป๊ะอยู่แล้ว** — เอามาปรับใช้แทนออกแบบใหม่ทั้งหมด:

1. **Cycle-review pattern** (StockCountView "ควรนับก่อน") — `abcClassify` + `lastCheck` timestamp ต่อ
   SKU + due-date ตามคลาส (A=30วัน, B=60, C=90) → คิว "ที่ต้องเช็คก่อน" เรียงตามความเก่า
2. **Overdue-notification pattern** (`shipPendingAging_` + `notifyPendingReceives_` + threshold
   `SHIP_PENDING_ALERT_DAYS`) — สแกนของที่เก่าเกินเกณฑ์แล้วยิงกระดิ่งในแอป

### N.2 Flow ที่เจ้าของสั่ง → map เข้ากับ pattern ข้างบน

```
Supplier (เลือกจากรายการ)
   ↓
แสดงสินค้าทั้งหมดของ Supplier นี้ (query: products where supplierId = X)
   ↓
รีวิวสต็อก (ใช้หน้าจอ/ตรรกะเดียวกับ "นับ stock" ที่มีอยู่แล้ว — ไม่ต้องสร้างใหม่)
   ↓
กด "รีวิวแล้ว" (Mark reviewed) → เขียนแถวใหม่ในชีตรีวิว
   ↓
บันทึก lastReviewedAt + คำนวณ nextReviewDue = lastReviewedAt + reviewCadence
   ↓
Scan รอบถัดไป (piggyback บน trigger ที่มีอยู่แล้ว เช่น scan ทุก 2 ชม./trigger 22:00 —
ไม่เปิด process ใหม่ เหมือนที่ shipPendingAging_ เกาะ archiveReceivedShipments อยู่แล้ว)
   ↓
เกินกำหนด → pushInappNoti_({audience:'role:owner', type:'supplier-review-overdue', tab:'suppliers'})
```

### N.3 Schema ที่เสนอ

```
SHEET_SUPPLIER_REVIEW = "รีวิวซัพพลายเออร์"
  A=reviewId  B=supplierId  C=reviewedBy  D=reviewedAt  E=nextDueAt
  F=productsReviewedCount  G=note
```

⚠️ **NEEDS DECISION** (→ §Q): reviewCadence เป็นค่าคงที่เดียว (เช่น 60 วันทุกซัพพลายเออร์ — เหมือน
`SHIP_PENDING_ALERT_DAYS` ที่เป็นค่าเดียว) หรือ**แบ่งชั้นแบบ ABC** (ซัพพลายเออร์ที่มูลค่าสต็อกสูง
รีวิวถี่กว่า) เหมือนคิวนับสต็อก? — เริ่มจากง่าย (ค่าคงที่ + ปรับได้ผ่าน Script Property) แล้วค่อยทำ ABC
ทีหลังถ้าจำเป็นก็ได้ (**เสนอ**: เริ่มแบบง่ายก่อน)

---

## O. Product Owner Workflow (ขยายจาก Part 1 §B)

### O.1 สถานะวันนี้ (ทวนจาก CLAUDE.md Sprint 7)

⭐ Owner มีกลไกครบแล้ว (ชีต + endpoint + `useProductOwners()` hook + toggle ดาว 2 จุด) **แต่ disconnect
จาก creation โดยสิ้นเชิง** — และมีของที่ "สร้างไว้แล้วแต่ไม่มีใครเรียกใช้": **`pushInappNoti_` รองรับ
`audience: "staff:STxxxx"` (แจ้งเตือนเจาะตัว) เขียนไว้ครบ มีเทสต์ แต่ยังไม่มี call site ไหนเรียกเลย**
(ยืนยันจาก CLAUDE.md: "ยังไม่มีใครเรียกใช้เลยสักที่") — เป็นโอกาส**ต่อยอดโดยไม่ต้องสร้างกลไกใหม่**

### O.2 Flow ที่เจ้าของสั่ง

```
Creation
   ↓
Assign Owner  ⚠️ NEEDS DECISION: บังคับหรือไม่บังคับ (§J-5 เดิมถามไว้แล้ว)
   │   ถ้าไม่บังคับ → suggest จาก Product Type defaultOwner (§K.2) ให้เลือกยืนยัน/เปลี่ยน
   ↓
Owner Dashboard   [ใหม่ — ไม่มีวันนี้]
   ↓
Owner Notifications   [กลไกมีแล้ว แค่ไม่ถูกเรียก — ดู O.1]
   ↓
Owner KPIs   [ใหม่ — ไม่มีวันนี้]
   ↓
Products without Owner   [ตรงกับ "งานต่อยอด" ที่ CLAUDE.md ระบุไว้แล้วว่ายังไม่ทำ]
```

### O.3 Owner Dashboard — design

ยังไม่มีหน้านี้วันนี้ (มีแค่ตัวกรอง "⭐ ของฉัน" ใน `CategoryView`/`FrontStoreView` ซึ่งเป็นแค่ filter
ไม่ใช่ dashboard) · เสนอโครงหน้าใหม่แบบเดียวกับ `StaffPerformanceView`/`AttendanceReportView` (pattern
ที่มีอยู่แล้ว: การ์ดสรุป + ตาราง/รายการ) — เนื้อหา:
- สินค้าที่ตัวเองดูแล (reuse `useProductOwners()` → `mySkus`)
- สถานะสต็อก (ใกล้หมด/หมด) ของสินค้าที่ดูแล
- วันที่รีวิวล่าสุด (ถ้าผูกกับ concept "product review" — คนละเรื่องกับ Supplier Review §N แต่ pattern
  เดียวกัน — ⚠️ **NEEDS DECISION**: ต้องการ "Product-level review cadence" แยกจาก Supplier Review ไหม
  หรือพอแค่ระดับ Supplier?)

### O.4 Owner Notifications — design

**ไม่ต้องสร้างกลไกใหม่** — เรียก `pushInappNoti_({audience:"staff:"+ownerStaffId, ...})` ที่มีอยู่แล้ว
ตอน trigger ที่เกี่ยวข้อง (เช่น สต็อกของที่ตัวเองดูแลใกล้หมด — ต่อยอดจากตัวสแกน "ของหมดหน้าร้าน" ที่
CLAUDE.md ระบุไว้แล้วว่า "ต่อยอดได้เลย" — ตรงกับที่เจ้าของขอ)

### O.5 Owner KPIs — design (เก็งล่วงหน้า, ยังไม่ commit)

แนวทางเดียวกับ `staffPerfBuild_` (อ่าน Audit Log + คำนวณสรุปต่อคน) — เสนอ metric เบื้องต้น:
- จำนวน SKU ที่ดูแล
- มูลค่าสต็อกรวมที่ดูแล (`stockValue` ที่มีอยู่แล้วต่อสินค้า — sum ได้เลย)
- % ที่ยัง "สด" ตาม review cadence (ถ้าตัดสินใจทำ O.3 ข้อสุดท้าย)

⚠️ เป็นแค่แนวทาง — เจ้าของยังไม่ได้สั่งชัดว่าต้องการ KPI แบบไหน → ไม่ล็อก metric ในเอกสารนี้

### O.6 Products without Owner — design

Query ง่ายที่สุดในเอกสารนี้ทั้งหมด: `data.products` ที่ `sku ∉ keys(ownersMap)` — ไม่มี risk เชิงข้อมูล
เพราะเป็น derived report ล้วน (ไม่เขียนอะไร) · ตรงกับที่ CLAUDE.md ระบุไว้แล้วว่าเป็นงานต่อยอดที่ยังไม่ทำ
("หน้าสรุปฝั่งเจ้าของ — ใครดูแลกี่ SKU / ยังไม่มีคนดูแล N ตัว")

---

## P. Product Lifecycle (Draft → Created → Selling → Maintained → Archived → Deleted)

### P.1 Map เข้ากับ lifecycle เดิม (Part 1 §E) + ระบุเจ้าของข้อมูลแต่ละสถานะ

| สถานะใหม่ (ที่เจ้าของสั่ง) | เทียบกับ §E เดิม | ใครเป็น source of truth | มีวันนี้ไหม |
|---|---|---|---|
| **Draft** | *(สถานะใหม่ ไม่มีใน §E เดิม)* | **ERP เท่านั้น** (ยังไม่ถึง ZORT) | 🟡 **มีแค่เงา** — batch queue ใน `AddProductView` เป็น draft ชั่วคราวจริง แต่**อยู่ใน client memory ล้วน** ปิดแท็บ/รีเฟรช = หายหมด ไม่ใช่ persisted draft |
| **Created** | = Creation + →ZORT + →Sheets + Sync | **ZORT** (เขียนก่อนเสมอ) → ชีตตาม | ✅ มีครบ |
| **Selling** | = Selling | **ZORT** (AddOrder ตัดสต็อก/ยอดขาย) → ชีตหักคู่ขนานระหว่างรอ sync | ✅ มีครบ |
| **Maintained** | = Editing + Inventory (รวมกัน) + [ใหม่] Owner/Supplier review | **ผสม**: stock count/transfer = ERP เขียนชีต+push ZORT (มีอยู่) · core attrs (ชื่อ/ราคา/หมวด) = **ZORT เท่านั้น** (§J-2 ยังไม่ตัดสินใจ) · owner/supplier review = **ERP metadata ล้วน** (ไม่เกี่ยว ZORT เลย) | 🟡 inventory ✅ · core-attr edit ❌ · review 🆕 (ออกแบบใน §N/§O) |
| **Archived** | = Archive (soft-delete) | **ERP เท่านั้น** (ชีต "สินค้าที่ซ่อน" — ZORT ไม่มีคอนเซ็ปต์นี้) | ✅ มี (แต่ไม่มี UI ในแอป — ต้อง GAS editor) |
| **Deleted** | *(ไม่มีใน §E — §E เรียก "Deletion" แต่จริง ๆ หมายถึงเหตุการณ์ที่ ZORT ไม่ใช่สถานะปลายทางของ ERP)* | **ZORT เท่านั้น** — เป็น**เหตุการณ์ต้นทาง** ที่ ERP ตรวจจับแล้วแปลงเป็น Archived | ✅ ตรวจจับได้ (`hideDeletedFromZort`) — **ERP ไม่มี concept "ลบถาวร" ของตัวเอง** |

### P.2 ข้อสังเกตสำคัญที่ต้องเข้าใจก่อนออกแบบต่อ

⚠️ **"Deleted" ใน ERP นี้ไม่ใช่สถานะปลายทาง — มันคือทริกเกอร์**. ระบบยึดปรัชญา **soft-delete only**
(กู้กลับได้เสมอ) — ปลายทางจริงของ ERP คือ **Archived** เท่านั้น ไม่มีการลบถาวรฝั่งเรา · ถ้า flow ที่
เจ้าของวาดไว้ตั้งใจให้ "Deleted" เป็นสถานะสุดท้ายจริง ๆ (ลบถาวร ไม่กู้คืน) — **นี่คือการเปลี่ยนปรัชญา
จากที่ระบบยึดมาตลอด** ⚠️ **NEEDS DECISION** (→ §Q)

⚠️ **"Draft" ต้องเลือกว่าจะ implement จริงหรือปล่อยเป็นเงาแบบวันนี้** — ถ้าต้องการ Draft ที่กู้คืนได้จริง
(ปิดแท็บแล้วกลับมาทำต่อ) ต้องมี**ชีต draft แยก** (เขียน optimistic, ยังไม่แตะ ZORT) ซึ่งเป็นงานเพิ่มที่ไม่
มีใน scope Part 1 เลย — ระดับความคุ้มค่าขึ้นกับว่าพนักงานเจอปัญหา "กรอกค้างแล้วหาย" บ่อยแค่ไหนจริง ๆ
(ไม่มีหลักฐานในโค้ด/audit log ว่าเคยเป็นปัญหา — เป็นการเสนอเชิงทฤษฎีจาก flow ที่เจ้าของวาด ไม่ใช่จาก
เคสที่พบจริง)

### P.3 Diagram รวม (เจ้าของข้อมูลกำกับทุกลูกศร)

```
[Draft]──(ERP only, ยังไม่มี persisted)──►[Created]──(ZORT master)──►[Selling]──(ZORT master)──►
                                                                                                  │
                                                                                                  ▼
                                                                                          [Maintained]
                                                                          (ผสม: ZORT=core attrs · ERP=stock/owner/review)
                                                                                                  │
                                                    ┌─────────────────────────────────────────────┤
                                                    ▼                                              ▼
                                            [Archived] (ERP metadata,                    ลบที่ ZORT (เหตุการณ์)
                                             กู้คืนได้เสมอ) ◄──────── ตรวจจับ ──────────────────────┘
                                                                    (hideDeletedFromZort)
```

---

## Q. Final Architecture Gap — Roadmap

> ⚠️ คอลัมน์ **Priority** เป็น**ข้อเสนอเบื้องต้นจากมุมสถาปัตยกรรม/ความเสี่ยงทางเทคนิค** ไม่ใช่การตัดสินใจ
> เชิงธุรกิจ — ลำดับความสำคัญจริงต้องเจ้าของยืนยัน (ผลกระทบต่องานหน้าร้าน/ความถี่ที่เจอปัญหา คือข้อมูล
> ที่สถาปนิกไม่มี)

| # | หัวข้อ | Current | Target | Migration Difficulty | Priority (เสนอ) |
|---|---|---|---|---|---|
| 1 | **Product Type / Prefix Registry** | Hardcode/เอกสารล้วน ไม่มี config | ชีต Registry (§K) — seed จากหมวดเดิมได้เลย | 🟡 กลาง (ต้องตอบคำถาม granularity แบบ A/B ก่อน — §K.1) | 🔴 **สูง** — เป็นรากของปัญหาอื่นเกือบทั้งหมด (SKU, running number, category, owner-default ล้วนพึ่งสิ่งนี้) |
| 2 | **Running Number Authority** | client snapshot, race ได้ (§Part1 G.8) | backend `reserveSku` service (ล็อก, authority=ชีต+ZORT) | 🟡 กลาง (endpoint ใหม่ + lock, pattern เดียวกับ cid/tid ที่มีอยู่แล้ว) | 🟡 กลาง (race หายากในทางปฏิบัติ แต่ผลเสียเงียบ+แก้ยากย้อนหลัง) |
| 3 | **Product Edit (in-app)** | ไม่มีเลย — ต้องแก้ที่ ZORT UI | `updateProduct` endpoint + policy (push ZORT ทันที หรือ ERP-first reconcile) | 🔴 สูง (ต้องยืนยัน ZORT UpdateProduct API + ตัดสินใจ conflict policy) | ⚠️ **ต้องเจ้าของชี้** — ไม่รู้ว่าทีมงานเจอ pain point นี้บ่อยแค่ไหนจริง |
| 4 | **Supplier Domain (master + FK)** | Free-text ฝังใน tag overload | Supplier master sheet + FK (§M) | 🟡 กลาง (data migration: normalize ชื่อซัพพลายเออร์ที่สะกดไม่คงที่ในข้อมูลเดิม) | 🟡 กลาง |
| 5 | **Supplier Review Workflow** | ไม่มีเลย | cycle-review (§N) — reuse pattern เดิม 100% | 🟢 ต่ำ (ไม่มี pattern ใหม่ต้องคิด แค่ประกอบของเดิม) | 🟡 กลาง (ขึ้นกับ #4 เสร็จก่อน) |
| 6 | **Owner-at-Creation + Dashboard + KPI** | Disconnect จากการสร้างโดยสิ้นเชิง | ผูกตอนสร้าง + dashboard + noti (§O) | 🟢 ต่ำ-กลาง (กลไก noti staff-audience มีอยู่แล้วไม่ได้ใช้ — เหลือแค่ UI) | 🟡 กลาง |
| 7 | **Products without Owner (รายงาน)** | ไม่มีหน้า | derived query ล้วน (§O.6) | 🟢 ต่ำมาก (read-only, ไม่แตะข้อมูล) | 🟢 **ต่ำแต่ทำง่ายสุด** — เหมาะเป็น quick win |
| 8 | **Pricing rules unification** (RETAIL_MULT vs WHOLESALE_RATIO) | 2 factor แยกกัน คนละที่ (Part1 G.5) | Config เดียว (`PricingRules`, Part1 §I.1) | 🟢 ต่ำ | 🟢 ต่ำ (ไม่กระทบผู้ใช้ปลายทาง แค่ลด tech debt) |
| 9 | **Tag field split** (supplier vs status) | overload ฟิลด์เดียว แยกด้วยภาษา (เปราะ) | 2 ฟิลด์จริง | 🔴 สูง (ต้อง backfill ข้อมูลเดิมทั้งหมด + แก้ทุกจุดที่อ่าน tag) | 🟡 กลาง (ความเสี่ยงเพิ่มขึ้นเรื่อย ๆ ถ้ามีซัพพลายเออร์ชื่อไทย — ยังไม่เกิดจริงวันนี้) |
| 10 | **Draft (persisted)** | Client-memory queue เท่านั้น (§P.2) | Draft sheet แยก | 🟢 ต่ำ-กลาง | ⚪ **ต่ำ** — ไม่มีหลักฐานว่าเป็นปัญหาจริง (theoretical จาก flow ไม่ใช่จาก pain point ที่พบ) |
| 11 | **Product History/Versioning** | ไม่มีเลย (audit log จับ action ไม่จับ snapshot ค่าเก่า) | attribute change log | 🟡 กลาง | ⚪ **ต่ำ** — analytics-only ไม่กระทบงานประจำวัน |
| 12 | **Deleted = terminal state จริง** (ถ้าต้องการ) | ไม่มี (soft-delete only, Archived คือปลายทาง) | เปลี่ยนปรัชญา ต้องมี hard-delete path | 🔴 สูง (ขัดกับ pattern soft-delete ทั้งระบบ) | ⚠️ **ต้องเจ้าของยืนยันก่อน** — ถ้าไม่ได้ตั้งใจจริง แนะนำ**ไม่ทำ** (เสี่ยงเกินประโยชน์) |

**ลำดับที่เสนอถ้าจะเริ่ม** (จากมุมเทคนิคล้วน): **#1 (Registry) ก่อนเสมอ** เพราะ #2/#4/#6 ทั้งหมดพึ่งมัน →
ตามด้วย #7 (quick win, ทำคู่ขนานได้) → ค่อยดู #2/#4/#5/#6 ตามลำดับความสำคัญที่เจ้าของยืนยัน · #3, #9, #12
เป็นของที่ **impact สูงกว่า effort จะรู้ได้ก็ต่อเมื่อเจ้าของให้บริบทเพิ่ม**

---

## คำถามใหม่จาก Part 2 (เพิ่มเติมจาก §J เดิม)

10. **Product Type granularity** (§K.1): Product Type = ระดับหมวดกว้าง (คงสายพันธุ์ย่อยแบบเดิมไว้) หรือ
    แทนที่ prefix สายพันธุ์ทั้งหมด? — ตัวอย่างที่ยกมา (Flower→F) ตรงกับหมวดกว้าง แต่ SKU จริงวันนี้ใช้
    prefix สายพันธุ์ย่อย (R, OL, …) สองอย่างนี้ไม่ใช่โครงสร้างเดียวกัน
11. **Barcode Rule**: มี product type ไหนที่ต้องการ barcode ต่างจาก SKU จริงไหม หรือ default "เหมือน
    SKU" พอสำหรับทุกกรณี (ออกแบบไว้เป็น extension point เฉย ๆ)?
12. **Supplier ↔ Product**: 1 สินค้า 1 ซัพพลายเออร์พอไหม หรือต้องรองรับหลายซัพพลายเออร์ต่อสินค้า?
13. **Supplier review cadence**: ค่าคงที่เดียวทุกซัพพลายเออร์ หรือแบ่งชั้นแบบ ABC เหมือนคิวนับสต็อก?
14. **Product-level review**: ต้องการ review cadence ระดับสินค้า (แยกจาก Supplier Review) ไหม หรือรีวิว
    ระดับซัพพลายเออร์พอ?
15. **"Deleted" ใน lifecycle ที่ขอ**: ตั้งใจให้เป็นสถานะลบถาวรจริง (เปลี่ยนปรัชญา soft-delete) หรือหมายถึง
    เหตุการณ์ "ลบที่ ZORT" ที่ระบบมีอยู่แล้ว (แปลงเป็น Archived)?
16. **Draft ที่ persist ได้จริง**: คุ้มที่จะสร้างชีต draft แยกไหม หรือ batch queue ปัจจุบัน (client-only)
    เพียงพออยู่แล้วในทางปฏิบัติ?

*(documentation only — ไม่มีการแก้โค้ด/commit/deploy/ADR · รอ approve ก่อนเขียนโค้ด)*
