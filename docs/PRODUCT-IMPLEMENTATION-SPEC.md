# PRODUCT IMPLEMENTATION SPECIFICATION

> **สถานะ**: implementation contract · **owner approve ครบ 5 decision gate แล้ว (D01-D05, ดูหัวข้อ
> "🔒 LOCKED OWNER DECISIONS")** · **ยังไม่ implement** · documentation only · ไม่แก้โค้ด/Sheet/SKU ·
> ไม่ migrate/commit/deploy
> **เป้าหมาย**: เปลี่ยน architecture (7 เอกสาร) → contract ที่พร้อม coding · ตอบให้ได้ว่า
> **"ถ้า owner approve แล้ว เริ่ม coding ได้เลยไหมโดยไม่ต้องออกแบบใหม่?"** →
> **Architecture = CLOSED · Business Decision Gate = CLOSED · Coding Readiness = READY WITH
> CONDITIONS (เฉพาะจุดที่พึ่ง migration-scale numbers/provenance) — รายละเอียดใน §18-19**
> **ฐาน**: เอกสาร 7 ฉบับ + code pattern ที่ Work 5/6 ตรวจจริง (อ้าง line) + CSV (provenance = UNKNOWN,
> ตั้งใจคงไว้ตาม D05 — ไม่บล็อก architecture)

## ระดับหลักฐาน (ตามที่สั่ง)
| | |
|---|---|
| ✅ **CONFIRMED** | มีหลักฐานตรงจาก code จริง (อ้าง line) หรือ owner ตัดสินแล้วในเอกสารก่อน |
| 🔍 **INFERRED** | อนุมานจากรูปแบบ/ข้อมูล — มีเหตุผลรองรับ แต่ไม่ใช่ fact ยืนยัน |
| 💡 **PROPOSED** | ข้อเสนอเชิง implementation — ยังไม่ผูกมัดจนกว่า owner approve |
| ⚠️ **OWNER DECISION REQUIRED** | ต้องให้เจ้าของตัดสิน — ห้ามเดาแทน |
| 🔒 **LOCKED (Owner-approved)** | Owner ตัดสินแล้วในรอบนี้ — แทนที่ 💡/⚠️ เดิมทุกจุดที่เกี่ยวข้อง ห้ามเปิดใหม่โดยไม่มีคำสั่ง owner ซ้ำ |

> **วินัยหลักฐาน**: ห้ามเอา PROPOSED/RECOMMENDATION มาเขียนเป็น business fact · ทุก fact trace กลับ
> เอกสาร/โค้ดจริงได้ · ข้อขัดแย้งระหว่างเอกสารระบุตรง ๆ (§ ท้าย) ไม่ reconcile เงียบ

---

## 🔒 LOCKED OWNER DECISIONS (approved — ตัดสินครบ 5 ข้อ)

> Owner approve ครบทั้ง 5 decision gate ที่เหลือแล้ว — เนื้อหานี้ **แทนที่** ทุก ⚠️ OWNER DECISION
> REQUIRED / 💡 PROPOSED ในหัวข้อ 1-19 ด้านล่างที่เกี่ยวข้อง (แต่ละหัวข้อถูกอัปเดตให้ตรงกันแล้ว —
> ดู cross-reference ท้ายแต่ละแถว) · **Architecture = CLOSED · Business Decision Gate = CLOSED**

### 🔒 D01 — Legacy `L` : **FREEZE**
- L SKU เดิมยังอ่าน/ใช้งานได้เต็มที่ ไม่เปลี่ยนแปลง
- ห้าม generate เลข `L` ใหม่จากนี้ไป (ERP ไม่ออกเลขในเนมสเปซนี้อีก)
- Registry/reporting/migration ยังต้องรองรับ `L` เดิมตลอดไป
- สินค้าใหม่ **ต้องใช้ prefix/namespace ใหม่ที่สะอาด** (ไม่ใช่ `L`)
- แทนที่ §4.3 (เดิม "OWNER DECISION REQUIRED: freeze vs แตก Form") · มีผลกับ §17 Phase E' และ §18/§19

### 🔒 D02 — Product Edit / Field Ownership (LOCK ตาราง master ต่อ field)

| Field | Master | Direction |
|---|---|---|
| SKU | **immutable** | ไม่มี edit เด็ดขาด |
| Product Type/Form | **ERP** | ERP → ZORT |
| Variant | **ERP** | ERP → ZORT |
| Name | **ERP** | ERP → ZORT |
| Category | **ERP** | ERP → ZORT |
| Supplier | **ERP** | ERP-internal |
| Owner (ผู้ดูแล) | **ERP** | ERP-internal |
| Cost | **ZORT** (operational) | ZORT → ERP/cache |
| Sell Price | **ERP** | ERP → ZORT |
| Image | ERP เป็นเจ้าของ metadata/association · **ZORT = preferred source** (ถ้า ZORT มีรูปใช้ได้ ใช้รูป ZORT) · ERP-side = fallback | ZORT → ERP (รูปที่ preferred) |
| Barcode | **ERP** | ERP → ZORT · ต้องรักษา legacy barcode exception |

แทนที่ §2 (Source of Truth), §6 (Product Edit), §9 (Pricing), §10 (ZORT Sync), §12 (Images) — อัปเดตครบ
ด้านล่าง

### 🔒 D03 — Supplier Review : **Model C**

```
Supplier → Review Team → Review Request → Due Date → Complete / Overdue
Product  → Product Owner   (คนละ concept กับ Reviewer — แยกกันเด็ดขาด)
```

- Reviewer (คนตรวจตามรอบ) ≠ Product Owner (คนดูแลสินค้า) — **ยืนยันเป็นบทบาทแยกกันถาวร** (ไม่ default
  ทับกันอีกต่อไปเหมือนที่เอกสารเดิมเสนอ)
- reuse ของเดิมทั้งหมด: `SHEET_STOCK_CHECK` · `createStockCheckRequest_` · `completeStockCheckRequest_`
  · due/status pattern เดิม · notification infrastructure เดิม · `staff:STxxxx` targeting
- 🚫 ห้ามสร้าง notification engine ใหม่
- แทนที่ §7 (Supplier Review) — อัปเดตด้านล่าง

### 🔒 D04 — ZORT Sync : field-level source of truth (ฉบับสมบูรณ์)

| ERP MASTER (ERP → ZORT) | ZORT MASTER (ZORT → ERP) | ERP-internal (ไม่ sync ข้าม) |
|---|---|---|
| SKU · Product Type/Form · Variant · Name · Category · Sell Price · Barcode | Cost · Stock Qty · Transactions · Operational product status · **รูปที่ preferred** | Supplier · Owner · Review status |

**Conflict policy**: **Domain data → ERP ชนะ · Operational data → ZORT ชนะ** — **ห้ามอธิบายว่าฝั่งใด
ฝั่งหนึ่งเป็น master ของทุกอย่าง** (ทั้ง ERP และ ZORT ต่างเป็น master เฉพาะ field ของตัวเอง)

แทนที่ §10 (ZORT Sync) ทั้งตาราง — อัปเดตด้านล่าง

### 🔒 D05 — Dataset Provenance : **UNKNOWN (คงไว้)**

- CSV forensic findings **ใช้เป็นหลักฐานเชิงโครงสร้างได้** (pattern/grammar/relationship)
- **ห้ามใช้ตัวเลขใน dataset อ้างเป็นสถิติ production ที่ยืนยันแล้ว**
- **ไม่บล็อก architecture หรือ implementation foundation** — บล็อกเฉพาะ **การตัดสินใจ migration ที่
  พึ่งพาตัวเลขระดับ production scale** (เช่น ขนาด review-queue จริง, จำนวน SKU ที่ต้อง backfill จริง)
- แทนที่ §18 item #16 และปรับ §19 ให้ยังมี CONDITION เฉพาะจุดที่พึ่งตัวเลข — อัปเดตด้านล่าง

---

## 1. Locked Domain Model

**Terminology ที่ล็อกแล้ว (จาก Work 4 — Family Decision, owner ยอมรับแล้ว)** ✅:

```
Business Family   (optional · ชนิดพืช/ดีไซน์กว้าง · จำเป็น ~18-22% ของกรณี)
      │  1-to-many (optional)
      ▼
Product Type/Form (หน่วย transactional หลัก · ≈ prefix+model วันนี้ แต่ผูกด้วย SKU เต็ม)
      │  1 (variantRule เป็น property ของ Form)
      ▼
Variant           (COLOR / SIZE / STYLE / OTHER / NONE — rule ของ Form นี้เอง)
      │  1-to-many
      ▼
SKU               (= identifier ระดับ variant ที่ขาย/สแกนได้จริง · immutable)
```

### กติกาที่ห้ามย้อน (พิสูจน์ผิดแล้วในเอกสารก่อน — ห้ามใช้เป็น assumption หลัก) ✅

- ❌ **`prefix = category`** — พิสูจน์ผิด (prefix เดียวหลาย category · Forensic §)
- ❌ **`prefix+model = Business Family`** — พิสูจน์ผิด (`L` model 002 = ลิลลี่ + กระถินไทย · Family §3)
- ❌ **`variant code 01/02 = ความหมายสากล`** — พิสูจน์ผิด (KB096 "01"=S แต่ KB040 "01"=สี · Family §1.5)

**SKU = identifier ของ Product Variant ไม่ใช่ Product entity** ✅ (Family §6) — ทุก contract ด้านล่างยึดข้อนี้

---

## 2. Source of Truth (write/read authority)

> ✅ ยึด Registry §1.3 + §11 · เพิ่มคอลัมน์ "เขียนได้" / "อ่านอย่างเดียว" ตามที่สั่ง

| ข้อมูล | System of record | เขียนได้ (authority) | อ่านอย่างเดียว | หลักฐาน |
|---|---|---|---|---|
| **operational stock (qty)** | **ZORT** | ZORT · `syncZortBoth`/`pushStockToZort_` mirror ลงชีต | ERP read model, frontend | ✅ `syncZortToColumn_` :7217 · CLAUDE.md "ZORT=source of truth" |
| **cost** | **ZORT** (operational) | ZORT | ERP/cache | 🔒 D02/D04 — ⚠️ ดู §9 caveat: ข้อมูลต้นทุนจริงใน ZORT ว่างเกือบทั้งหมดวันนี้ |
| **sell price** | **ERP** 🔒 (เปลี่ยนจากเดิม — ดู §9 AS-IS vs TO-BE) | ERP → push ZORT | ZORT (POS อ่านจาก ZORT mirror) | 🔒 D02/D04 |
| **wholesale ratio** | **ERP config** | Script Property `WHOLESALE_RATIO` | build payload | ✅ `wholesaleRatio_()` :298 |
| **product metadata (Family/Form/VariantRule/Variant/Name/Category)** | **Product Registry (ERP)** 🔒 | Registry (owner/warehouse ผ่าน Add/Edit) → push ZORT | frontend, reporting, ZORT (mirror) | 🔒 D02/D04 (ยังไม่มี registry จริง — Phase A เติม · Family §6) |
| **SKU string identity** | **Product Registry (ERP)** ออกเลข → register ZORT | ERP reserve (§4) · ZORT รับไป | ทุกที่ | ✅ generate client วันนี้ (`nextModelForPrefix`) → ย้าย ERP |
| **barcode** | **ERP** 🔒 (default=SKU, ต้องรักษา legacy exception) | ERP mapping → push ZORT | ZORT, scan | ✅ imageUrl-style mapping · barcode≈SKU 99.68% |
| **images** | ERP owns metadata/association · **ZORT = preferred source** 🔒 | `fetchProductImage`/upload → ชีต imageUrl col E(ZORT)/D(manual, fallback) | frontend | ✅ `pickZortImage_` :5305 · `SHEET_IMAGE_URL` :192 · 🔒 D02/D04 |
| **owner (ผู้ดูแล)** | **ERP** `SHEET_PRODUCT_OWNER` | staff กดดาว / owner assign | frontend | ✅ :202 · `setProductOwnerHandler_` :11184 |
| **supplier** | **ERP** (master ใหม่ — วันนี้ปนใน tag col F) | owner (master) | frontend, review | 🔍 tag overload (Data Evidence §) → แยก · 🔒 D02/D04 ยืนยัน ERP-internal |
| **review status** | **ERP** | review workflow (§7) | frontend | 🔒 D02/D04 — ERP-internal |
| **transactions** | **ZORT** | ZORT | ERP log/audit | 🔒 D04 |

🔒 **LOCKED (D02/D04)**: **ไม่มีฝั่งใดเป็น master ของทุกอย่าง** — **ERP = master ของ domain/identity data
(SKU/Form/Variant/Name/Category/SellPrice/Barcode/Supplier/Owner/Review)** · **ZORT = master ของ
operational data (Cost/Stock/Transactions/Operational status)** · conflict: domain→ERP ชนะ,
operational→ZORT ชนะ · "ERP" = Google Sheets + GAS เอง ไม่ใช่ระบบใหม่

---

## 3. Product Registry — Logical Schema (implementation-level)

> ยังไม่สร้าง Sheet จริง · ระบุ logical entity + field + relationship พอสำหรับ coding · physical
> column mapping เป็นงาน Phase A

### 3.1 Entities (logical)

**BusinessFamily** (optional)
```
familyId       (generated, stable)       ✅ PK
name           (editable)                — "ไฮเดรนเยีย"
note           (editable, optional)
status         (active/archived)
```

**ProductForm** (หน่วยหลัก)
```
formId         (generated, stable)       ✅ PK
familyId       (FK → BusinessFamily, NULLABLE)   ← optional link
baseName       (editable)                — "ไฮเดรนเยียดอกเดี่ยว"
categoryId     (FK → Category)
variantRuleType  (COLOR/SIZE/STYLE/OTHER/NONE)   ← property ของ Form (Family §2)
prefix         (string · legacy หรือใหม่)  ⚠️ ไม่ derive ความหมายจาก prefix เดี่ยว
modelNumber    (string · 3 หลัก legacy หรือ sequence ใหม่)
supplierId     (FK → Supplier, NULLABLE)
status         (draft/active/inactive/archived)
lastReviewedAt (สำหรับ review cycle §7)
reviewCycleDays (override; default จาก ABC)
```
⚠️ `prefix+modelNumber` **ไม่ใช่ PK** — เป็น attribute · PK จริงคือ `formId` (กัน L collision · Family §3)

**VariantDefinition** (ค่าที่ Form เปิดใช้)
```
formId  (FK)  ✅
code    (เช่น "01")           ← ความหมายผูกกับ formId + variantRuleType เท่านั้น
label   (เช่น "ชมพู" หรือ "S") ← ไม่ใช่ global
```

**SKURecord** (immutable)
```
sku       (string, immutable)   ✅ PK — ห้ามแก้ตลอดกาล
formId    (FK → ProductForm)     ← mapping (confidence §13)
variantCode (FK → VariantDefinition, NULLABLE ถ้า NONE)
barcode   (default = sku, overridable)
mappingConfidence (CONFIRMED/INFERRED/AMBIGUOUS/UNKNOWN)
source    (legacy/created-via-registry)
```

**Supplier** · **Category** · **Unit** · **Owner** · **Pricing** — logical fields ใน §2/§9/§7

### 3.2 Relationship (cardinality)

```
BusinessFamily 1 ──< ProductForm (optional FK, many Form ต่อ 1 Family)
ProductForm    1 ──< VariantDefinition (many)
ProductForm    1 ──< SKURecord (many · 1 SKU ต่อ 1 variant instance)
ProductForm    * ──> Category (1)   ·   * ──> Supplier (0..1)
SKURecord      1 ──> Owner (0..1)   ·   1 ──> Barcode (1, default=sku)
```

### 3.3 Editable / Generated / Derived (ต่อ field สำคัญ)

| field | ประเภท | ใคร |
|---|---|---|
| `formId`/`familyId`/`skuRecord.sku` | **generated** | ระบบ (§4) |
| `baseName`/`categoryId`/`supplierId`/`variantRuleType` | **editable** | owner/warehouse |
| `variantRuleType` default | **derived** | จาก category (~94% · Family §2) แล้วให้ override |
| `barcode` | **derived** (default=sku) แก้ได้ | ระบบ + override |
| `mappingConfidence` | **derived/assigned** | migration (§13) |

---

## 4. SKU Generation Contract

> ✅ ยึด Registry §5.3 (backend reservation) · ระบุ exact behavior ตามที่สั่ง

### 4.1 Happy path (ลำดับบังคับ)

```
1. create request        (Form + Variant ที่เลือก · ห้ามส่ง SKU string มาจาก client)
2. validation            (Form มีจริง · variantCode ถูก rule ของ Form · ไม่ใช่ legacy-frozen prefix)
3. LockService.getScriptLock  (คร่อม read→write — pattern เดียวกับ handleOrder_ cid ✅)
4. re-read authoritative state (max model/variant จริงจาก Registry + ชีต ณ ตอนนั้น ไม่ใช่ payload cache)
5. reserve model/variant (คำนวณเลขถัดไป · เขียน SKURecord สถานะ "reserving")
6. compose SKU           (prefix + variantCode + model — กันชนด้วย full-SKU uniqueness check)
7. persist               (เขียน Registry + ปล่อยล็อก **ก่อน** ยิง ZORT)
8. ZORT registration     (AddProduct — นอกล็อก · pattern: ปล่อยล็อกก่อน UrlFetch ✅ handleOrder_)
```

### 4.2 Behavior ต่อกรณี (บังคับกำหนด)

| กรณี | Behavior ที่กำหนด | อ้างอิง pattern |
|---|---|---|
| **concurrent requests** | ScriptLock serialize · re-read ใน lock → เลขไม่ชน · คว้าล็อกไม่ได้ → `retryable:true` | ✅ handleOrder_ |
| **duplicate SKU** | full-SKU uniqueness check ใน lock · เจอซ้ำ → ไม่เขียน, คืน existing (`dedup:true`) | ✅ findOrderRowByCid_ |
| **ZORT failure (AddProduct)** | SKU reserved ใน ERP แล้ว (source of truth SKU=ERP) · ZORT fail → mark `zortPending`, ลง retry queue · **ไม่ปล่อย SKU กลับ** (กัน reuse) | 🔍 (SKU=ERP §2) |
| **timeout** | client เพดานเวลา (`dmjTimeoutMs`) · "อ่านคำตอบไม่ได้ ≠ ไม่สำเร็จ" → ถาม `skuCheck?requestId=` ก่อนตัดสิน | ✅ orderCheck/transferCheck |
| **retry** | idempotent ด้วย **`skuReqId`** (client สร้าง 1 ต่อการกดสร้าง) · reserve ซ้ำ reqId เดิม → คืนผลเดิม | ✅ cid/tid/billCid |
| **partial failure** (ERP ok, ZORT fail) | ERP = truth · แสดง "สร้างแล้ว · รอ sync ZORT" · retry ZORT เบื้องหลัง · ไม่สร้าง SKU ใหม่ | 🔍 |
| **sequence burn/reuse** | เลขที่ reserve แล้ว **burn ถาวร** (ไม่ reuse แม้ ZORT fail) — กัน 2 ของได้เลขเดียว · gap ยอมรับได้ | 💡 PROPOSED |
| **idempotency** | key = `skuReqId` · ตรวจในล็อกก่อนแตะ ZORT | ✅ |

### 4.3 Legacy contaminated prefix (เช่น `L`) — policy บังคับ 🔒 LOCKED (D01 — FREEZE)

- 🚫 **ห้าม generate เลขใหม่ต่อใน namespace ปนเปื้อนอัตโนมัติ** (Registry §5.3 · Family §3.1) ✅
- ✅ **ต้องอ่าน/report ของเดิมได้** — legacy SKU ทุกตัว immutable, map ผ่าน full-SKU (§13)
- 🔒 **LOCKED policy = FREEZE** (D01, owner-approved): `L` (และ prefix ปนเปื้อนอื่นที่พบในอนาคต)
  **ไม่ออกเลขใหม่ต่ออีก** — SKU เดิมยังอ่าน/รองรับได้เต็มที่ตลอดไป, Registry/reporting/migration
  ยังต้อง map `L` เดิมได้ (§13) · **สินค้าใหม่ทั้งหมด (รวมของหมวดที่เคยใช้ `L`) ต้องใช้ prefix/Form
  namespace ใหม่ที่สะอาด** — ไม่มีการแตก `L` เป็น 270 Form ย่อยแบบ retroactive (ตัวเลือก (ข) เดิม **ไม่
  approve**)

---

## 5. Product Creation / Add Product UI

> ✅ ยึด Registry §8 (wire-level) · เพิ่ม field-ownership/validation/permission/error/success/batch

### 5.1 Target flow

```
Step 1 ค้นหาก่อนสร้าง (บังคับ) → Step 2 Business Family (optional) → Step 3 Product Form
→ Step 4 Variant → Step 5 Supplier/Owner/Unit → Step 6 Pricing → Step 7 Preview → Step 8 Confirm
```

### 5.2 Field ownership (ต่อ step)

| Step | field | user กรอก | เลือกจาก Registry | ระบบ generate | derive |
|---|---|---|---|---|---|
| 1 | search term | ✅ | — | — | ผลค้น (Family/Form/SKU/barcode) |
| 2 | Business Family | (พิมพ์ใหม่ถ้าไม่มี) | ✅ (ถ้ามี) | familyId | — |
| 3 | Product Form | (สร้างใหม่) | ✅ ("แบบเดิม สีใหม่") | formId, prefix, model | variantRuleType default (จาก category) |
| 4 | Variant | ✅ (เลือกค่า) | ✅ (จาก Form) | — | variant display label |
| 5 | Supplier/Owner/Unit | ✅ | ✅ (master) | — | — |
| 6 | Pricing (ราคาส่ง) | ✅ | — | — | ราคาปลีก (×1.25 §9) |
| 7 | Preview | — | — | **ชื่อเต็ม + SKU** | — |
| 8 | Confirm | — | — | reserve+register (§4) | — |

🚫 **user ไม่ต้องจำ prefix/variant rule เอง** (ตามที่สั่ง) — ระบบดึงจาก Form ✅

### 5.3 Behavior states

- **validation**: Step 1 บังคับก่อน Step 8 · variantCode ต้องตรง rule ของ Form · ราคาส่ง > 0
- **duplicate detection**: Step 1 (ก่อนสร้าง) + Step 8 (server `checkSkuExists` :2532 ✅) — 2 ชั้น
- **permission**: `newproduct` tab = owner/dev/warehouse ✅ (app.jsx :51/:56) · `addNewProduct` action
  = warehouse+owner ✅ (:862)
- **error state**: reserve fail → "ลองใหม่ (คิว)" เหลือง · ZORT fail → "สร้างแล้ว รอ sync" (ไม่แดง — SKU ok)
- **success state**: โชว์ SKU + ชื่อที่ generate · refetch (`onAdded` ✅ :2516)
- **batch creation**: 💡 PROPOSED — "แบบเดิมหลายสี" ล็อก model เดิม (`heldDesign` ✅ มีแล้ว) · แต่ละสี =
  1 reserve (reqId แยก) · ⚠️ burn sequence ต่อสี (§4.2) · fast-path (Registry §8.2)

---

## 6. Product Edit

### 6.1 หลักฐานปัจจุบัน ✅

**วันนี้ไม่มี product edit path ใน ERP** — `AddProductView` เป็น create-only (`onAdded`=refetch, ไม่มี
update handler) · การแก้ราคา/ชื่อทำใน **แอป ZORT** แล้ว `syncZortBoth` ดึงกลับ · การแก้รูปทำผ่าน
`fetchProductImage` (on-demand pull จาก ZORT :7848) — **ไม่ใช่ edit ของ ERP metadata**

### 6.2 Target contract 🔒 LOCKED (D02 — Phase F)

| Field | แก้ได้ที่ | sync direction |
|---|---|---|
| **SKU** | ❌ ไม่มีที่ไหนแก้ได้ | immutable เสมอ |
| **Product Type/Form** | ERP | ERP → ZORT (push หลังแก้) |
| **Variant** | ERP | ERP → ZORT |
| **Name** | ERP | ERP → ZORT |
| **Category** | ERP | ERP → ZORT |
| **Sell Price** | ERP | ERP → ZORT |
| **Barcode** | ERP (ต้องรักษา legacy exception — ไม่ overwrite barcode เดิมที่ต่างจาก SKU) | ERP → ZORT |
| **Supplier** | ERP | ERP-internal (ไม่ sync ZORT) |
| **Owner** | ERP | ERP-internal |
| **Review status** | ERP | ERP-internal |
| **Cost** | ❌ แก้ใน ERP ไม่ได้ — ต้องแก้ที่ ZORT | ZORT → ERP (pull/cache เท่านั้น) |
| **Stock** | ❌ แก้ใน ERP ไม่ได้ — ต้องแก้ที่ ZORT (หรือผ่าน transfer/count flow เดิม) | ZORT → ERP |
| **Image** | ERP เลือก/ผูก association ได้ แต่ **ตัวรูปที่แสดง = ZORT preferred เสมอถ้ามี** | ZORT → ERP (preferred image) |

⚠️ **การกลับทิศ (สำคัญ — AS-IS vs TO-BE)**: วันนี้ (AS-IS ✅ code) ราคา/ชื่อ/หมวด **แก้ในแอป ZORT** แล้ว
`syncZortBoth` ดึงกลับ ERP (ทิศตรงข้ามกับที่ล็อกไว้ข้างบน) · Decision 02 **กลับทิศ (TO-BE)**: ต่อไป ERP
เป็นที่แก้ ไม่ใช่ ZORT — ต้องมี **capability ใหม่ "push name/category/price/barcode ไป ZORT"** ซึ่ง
**ยังไม่มี pattern อยู่จริงในโค้ดวันนี้** (มีแค่ push ตอนสร้าง `addNewProduct` :7427 และ push สต็อก
`pushStockToZort_` :5270 — ไม่มี push-update-metadata) → เป็นงานสร้างใหม่ทั้งหมดใน Phase F ไม่ใช่ reuse

- **audit**: ทุก edit เขียน audit (pattern `writeAuditLog_` ✅)
- **permission**: 💡 PROPOSED default (ไม่ได้อยู่ใน 5 decision ที่ owner ล็อก — ใช้ pattern เดิมของ
  `addNewProduct` :862 ต่อยอด คือ **owner/dev + warehouse แก้ metadata ได้**, staff อื่นแก้ไม่ได้) ·
  รายละเอียด field-level ต่อ role ยังปรับได้โดย owner ภายหลังโดยไม่ต้องเปิด architecture ใหม่ (ไม่ใช่
  blocker เพราะเป็น default ที่สอดคล้องกับ pattern มีอยู่แล้ว ไม่ใช่ business decision ใหม่)
- 🚫 **ห้าม implement เหมือนมี edit อยู่แล้ว** — เป็น path ใหม่ทั้งหมด (Phase F, ท้ายสุด)

---

## 7. Supplier Review / Work Tracking 🔒 LOCKED (D03 — Model C)

> ✅ ยึด Registry §6 · reuse ของเดิมทั้งหมด — 🚫 ไม่สร้าง notification engine ใหม่

### 7.1 Reuse (code จริง ✅)

| ต้องการ | มีแล้ว |
|---|---|
| request + status แยกฝั่ง | `SHEET_STOCK_CHECK` :15651 · `createStockCheckRequest_` :2620 · `completeStockCheckRequest_` :2624 |
| due/cycle by ABC | `abcClassify` :1336 · `frontStoreCheckedAt` pattern |
| overdue detect + notify | `shipPendingAging_` :10015 · `notifyPendingReceives_` :10046 · `SHIP_PENDING_ALERT_DAYS=3` :10011 |
| staff-targeted noti | `inappAudienceMatch_` :10762 รองรับ `staff:STxxxx` (**caller ใหม่ตัวแรก**) |
| dedup กัน spam | dedupKey (pending คีย์เดียว = ข้าม) ✅ |

### 7.2 Lifecycle contract

```
Supplier → Review Team → Review Request → Assigned Staff → Due Date → In Progress → Completed / Overdue
Product  → Product Owner   (แยกจาก Review Request โดยสิ้นเชิง — คนละ entity คนละบทบาท)
```

| คำถาม | คำตอบ (contract) |
|---|---|
| ใครได้ notification | **Reviewer ที่ถูก assign** (`staff:<reviewerId>`) เป็นหลัก + **Product Owner ของสินค้านั้นได้สำเนา** (คนละ audience, ยิงแยก 2 แถวถ้าคนละคน — ตัดซ้ำด้วย dedupKey ถ้าเป็นคนเดียวกัน) + สำเนาเจ้าของร้าน · **ไม่มี reviewer assign → fallback `role:owner`** |
| แจ้งเมื่อไร | ถึง due date (lastReviewedAt + cycleDays) |
| overdue แจ้งอย่างไร | pattern `notifyPendingReceives_` · dedupKey ผูกวัน+supplier |
| กัน spam | dedupKey + in-app ก่อน (ไม่กิน LINE quota) + clamp จำนวน/รอบ ✅ |
| staff เปลี่ยนคน (reassign reviewer) | เขียนทับ assignedReviewer ใน Review Request + audit — **ไม่กระทบ Product Owner เลย** (คนละ record) |
| owner ต่างจาก reviewer อย่างไร | 🔒 **LOCKED (D03)**: **Product Owner** = ผู้ดูแลสินค้าถาวร (`SHEET_PRODUCT_OWNER`, มีอยู่แล้ว) ตอบคำถาม "ใครดูแลสินค้าตัวนี้" · **Reviewer** = คนที่ถูก assign ให้ตรวจ **รอบ review ของ supplier นั้น** (ตอบคำถาม "รอบนี้ใครต้องไปตรวจ") — **แยกกันถาวร ไม่ default ทับกัน** · Review Team เป็นกลุ่ม/รายชื่อที่ assign reviewer ได้ (ต่อ supplier หรือต่อรอบ) |

---

## 8. Owner Assignment

> ✅ ยึด Registry §7 · reuse `SHEET_PRODUCT_OWNER` (มีครบ)

### 8.1 Lifecycle

```
Created → Unassigned / Assigned → Active → Reassigned → Archived
```

### 8.2 กรณีที่รองรับ

| กรณี | contract |
|---|---|
| **no owner** | report "products without owner" (§14) · review ยังทำงาน (fallback role:owner) |
| **owner inactive** | staff status≠active → owner ถือว่าว่าง (แจ้ง fallback) + report flag · ✅ `resolveSession_` กรอง inactive |
| **reassignment** | เขียนทับ 1 แถว/SKU ✅ + audit ประวัติ · notification ตามเจ้าใหม่ |
| **bulk assignment** | `PRODUCT_OWNER_ASSIGN_PLAN_` + preview→apply ✅ (มีแล้ว) |
| **audit** | ทุกเปลี่ยนมือ = audit (pattern มีแล้ว) |

---

## 9. Pricing 🔒 LOCKED (D02/D04 — Sell Price = ERP master, Cost = ZORT master)

> ✅ trace จาก code จริง — 🚫 ไม่สร้าง pricing rule ใหม่จากการเดา

⚠️ **AS-IS (code วันนี้) vs TO-BE (locked decision) — ทิศทางกลับกัน ต้องแยกให้ชัด**:

| ชั้น | AS-IS (✅ code จริงวันนี้) | TO-BE (🔒 locked target) |
|---|---|---|
| **sell price master** | ZORT `sellprice` (GetProducts) เป็นตัวจริง | **ERP เป็น master** — ราคาที่ ERP ตั้ง = ค่าจริง, push ไป ZORT |
| **sync direction** | ZORT → ERP (payload อ่าน `p.price` จาก ZORT mirror) | **ERP → ZORT** (ERP แก้แล้ว push) |
| **cost** | ไม่มี field "cost" จริงจาก ZORT (PO cost ว่างเกือบหมด — CLAUDE.md "ZORT ไม่มีราคาต้นทุนให้") | ยังคง **ZORT = master ของ cost** ตามที่ล็อก — **แต่ข้อมูลจะว่างจนกว่า ZORT PO cost จะถูกกรอกจริง** (เป็น data-quality gap ไม่ใช่ architecture gap) |

| ชั้น | ค่า | ที่มา | หลักฐาน |
|---|---|---|---|
| **stock sheet (cache)** | col I ราคา (mirror จาก ZORT วันนี้) | ZORT sync | ✅ CLAUDE.md SHEET_PRODUCTS — **หลัง TO-BE จะกลาย mirror ของค่าที่ ERP push ไปแทน** |
| **retail multiplier (สร้างใหม่)** | ราคาส่ง × **1.25** = sellprice | `RETAIL_MULT` frontend | ✅ views-main.jsx:9366 — **ยังใช้สูตรเดิม เพียงแค่ ERP เป็นคนตั้งค่าแล้ว push แทนที่จะรับจาก ZORT** |
| **wholesale ratio (มูลค่าสต๊อก)** | ปลีก × **0.8** | `wholesaleRatio_()` | ✅ :298 |
| **composed name pricing** | ตัวเลขในชื่อ = **ราคาส่ง** (ไม่ใช่ปลีก) | AddProductView | ✅ :9373 |

### แยกชั้น (ตามที่สั่ง — TO-BE)

- **source (sell price)**: 🔒 **ERP** (owner/warehouse กรอกราคาส่งตอนสร้าง/แก้ → derive ปลีก ×1.25)
- **source (cost)**: 🔒 **ZORT** operational — ⚠️ ข้อมูลจริงยังว่างเกือบทั้งหมด (ดูแถวบน)
- **cache**: stock sheet col I — ตอนนี้ mirror จาก ZORT, TO-BE จะกลาย mirror ของ ERP push
- **derived**: มูลค่าสต๊อกขายส่ง (×0.8) · ราคาปลีกตอนสร้าง/แก้ (×1.25)
- **display**: sellprice (POS/ใบเสนอราคา อ่านจาก ZORT mirror ที่ ERP push ไป) · ตัวเลขในชื่อ = ราคาส่ง

✅ **ความสอดคล้อง**: 1.25 (ส่ง→ปลีก) กับ 0.8 (ปลีก→ส่ง) เป็น inverse กัน (1/1.25=0.8) · ตรงกับ CSV
ratio 0.80 (87% ของแถว) — **แต่ตัวเลขทั้ง 2 คนละที่ คนละทิศ ห้ามยุบรวม** · ⚠️ `COST_RATIO=0.8` :292 เป็น
**ค่าสมมติ ไม่ใช่ต้นทุนจริง** (ห้ามใช้เป็นตัวเลขการเงิน) — **ไม่ใช่ตัวเดียวกับ "Cost" ที่ล็อกให้ ZORT
เป็น master ใน D02** (นั่นคือ field ใหม่ที่ยังไม่มีข้อมูลจริง, นี่คือค่าประมาณเดิมที่ใช้แสดงกำไรคร่าว ๆ)

⚠️ **Implementation gap ที่ต้องรู้ก่อน Phase F**: 🔍 **ไม่มี pattern "push sell price ไป ZORT" อยู่จริง
ในโค้ดวันนี้** — มีแค่ push ตอนสร้างครั้งแรก (`addNewProduct` :7427) ไม่มี push-on-edit · ต้องสร้างใหม่
(pattern ใกล้เคียงสุด = `pushStockToZort_` :5270 ที่ push ค่าตัวเลขไป ZORT อยู่แล้ว — โครงคล้ายกันแต่
เป็น endpoint คนละตัว `/Product/Update...` ไม่ใช่ stock)

---

## 10. ZORT Sync — Direction & Conflict 🔒 LOCKED (D04)

| ข้อมูล | direction | conflict policy | หลักฐาน |
|---|---|---|---|
| **SKU** | ERP → ZORT (register ครั้งเดียวตอนสร้าง, immutable ตลอดไป) | ไม่มี conflict (ERP ออกเลข, ห้ามแก้) | ✅ addNewProduct · 🔒 D04 |
| **Product Type/Form** | **ERP → ZORT** | Domain → **ERP ชนะ** | 🔒 D04 |
| **Variant** | **ERP → ZORT** | Domain → **ERP ชนะ** | 🔒 D04 |
| **Name** | **ERP → ZORT** | Domain → **ERP ชนะ** (แก้ไขจาก AS-IS ที่ ZORT ชนะ — ดู §9 AS-IS/TO-BE) | 🔒 D04 (แทนที่ข้อขัดแย้งเดิม) |
| **Category** | **ERP → ZORT** | Domain → **ERP ชนะ** | 🔒 D04 (แทนที่ข้อขัดแย้งเดิม) |
| **Sell Price** | **ERP → ZORT** | Domain → **ERP ชนะ** (กลับทิศจาก AS-IS — ดู §9) | 🔒 D04 |
| **Barcode** | **ERP → ZORT** (ต้องรักษา legacy exception ที่ barcode≠SKU) | Domain → **ERP ชนะ** | 🔒 D04 |
| **Cost** | **ZORT → ERP/cache** | Operational → **ZORT ชนะ** | 🔒 D04 |
| **Stock** | **ZORT → ERP** (`syncZortBoth` ทุก 2 ชม.) | Operational → **ZORT ชนะ** · การหักฝั่ง ERP เป็น mirror ชั่วคราว | ✅ CLAUDE.md `deductFrontStoreForSale_` · 🔒 D04 |
| **Transactions** | **ZORT → ERP** (log) | Operational → **ZORT ชนะ** | 🔒 D04 |
| **Operational product status** | **ZORT → ERP** | Operational → **ZORT ชนะ** | 🔒 D04 |
| **รูปภาพที่ preferred** | **ZORT → ERP** (ERP เก็บ association) | ZORT preferred ถ้ามีใช้ได้ · ERP fallback | 🔒 D04 |
| **Supplier** | **ERP-internal** — ไม่ sync ข้าม | ไม่มี conflict (ZORT ไม่รู้จัก concept นี้) | 🔒 D04 |
| **Owner** | **ERP-internal** — ไม่ sync ข้าม | ไม่มี conflict | 🔒 D04 |
| **Review status** | **ERP-internal** — ไม่ sync ข้าม | ไม่มี conflict | 🔒 D04 |
| **ERP archive flag vs ZORT deletion** | **แยกกันเด็ดขาด** (§11) | คนละมิติ ไม่ conflict | ✅ soft-delete `SHEET_HIDDEN_PRODUCTS` |

🔒 **conflict policy หลัก (LOCKED)**: **Domain data (identity/metadata) → ERP ชนะเสมอ · Operational
data (cost/stock/transaction/status) → ZORT ชนะเสมอ** · **ห้ามอธิบายว่าฝั่งใดฝั่งหนึ่งเป็น master ของ
ทุกอย่าง** — ทั้งสองระบบเป็น master คนละชุด field ตามตารางข้างบน (ไม่ใช่ "ZORT=master ทั้งหมด" หรือ
"ERP=master ทั้งหมด")

---

## 11. Lifecycle / Archive

> ✅ ยึด Registry §9 · soft-delete เท่านั้น

| สถานะ | visibility | stock behavior | reporting | restore |
|---|---|---|---|---|
| **active** | เห็นทุกที่ | ZORT qty | นับทุกรายงาน | — |
| **archived** (ERP flag) | ซ่อนจาก catalog default · เห็นในโหมด archive | หยุด review cycle | นับในประวัติ · แยก "archived" | flag กลับได้ |
| **ZORT deleted** | soft-delete `SHEET_HIDDEN_PRODUCTS` ✅ | qty ไม่ sync | ซ่อน · กู้ได้ | `unhideProduct()` ✅ |

- 🚫 **ห้าม hard-delete historical SKU** ✅ (Registry §9.2) · archive = flag · ธุรกรรม immutable
- restore policy: ✅ มีแล้วฝั่ง ZORT-deleted (`unhideProduct`/`clearHiddenProducts`)

---

## 12. Images / Metadata 🔒 LOCKED (D02/D04)

> ✅ สอดคล้อง path จริง — 🔒 ยืนยัน ownership ตามที่ owner ล็อก

| สิ่ง | ownership | lifecycle | หลักฐาน |
|---|---|---|---|
| **image association/metadata** | 🔒 **ERP เป็นเจ้าของ** (ว่าสินค้าตัวนี้ผูกกับรูปไหน) | ชีต `SHEET_IMAGE_URL` :192 เก็บ mapping | ✅ + 🔒 D02 |
| **preferred image source** | 🔒 **ZORT** — ถ้า ZORT มีรูปใช้ได้ ใช้รูป ZORT เสมอ | `pickZortImage_` :5305 · ZORT ชนะ manual | ✅ ตรงกับ locked decision พอดี (ไม่ต้องเปลี่ยนโค้ด) |
| **uploaded photo (ERP-side)** | 🔒 **fallback เท่านั้น** — ใช้เมื่อ ZORT ยังไม่มีรูป | ชีต imageUrl col D · ✅ :7467 | ✅ + 🔒 D02 |
| **image URL mapping** | ชีต `SHEET_IMAGE_URL` :192 | A=ID B=SKU C=name D=manual(fallback) E=ZORT(preferred) | ✅ |
| **on-demand fetch** | ERP action (pull จาก ZORT) | `fetchProductImage` :7848 (pull ตาม keyword=sku) | ✅ |
| **fallback image** | frontend | placeholder 📦 (ไม่มีรูป = กล่องเทา) | ✅ CLAUDE.md UI convention |

- **contract**: รูปใหม่ (AddProduct ยังไม่มีรูป ZORT) → manual/placeholder ก่อน → `fetchProductImage`
  ดึง ZORT ทีหลัง (ZORT ชนะเมื่อมี) · frontend `imgOverride` โชว์ทันทีไม่ต้อง refresh ✅ :5706
- ✅ **หมายเหตุ**: พฤติกรรมโค้ดวันนี้ (ZORT ชนะ manual) **ตรงกับ locked decision อยู่แล้ว** — ไม่ต้อง
  กลับทิศเหมือน §9/§10 (pricing/name/category) · ส่วนที่เป็นของใหม่คือ "ERP เป็นเจ้าของ association"
  ต้องทำให้ชัดเป็น field จริงใน Registry (§3) ไม่ใช่แค่ implicit ผ่านชีต imageUrl

---

## 13. Migration / Backfill

> ✅ ยึด Registry §2 · SKU immutable · ห้าม auto-map ambiguous

### 13.1 Pipeline (บังคับ)

```
legacy SKU → classification → mapping → confidence → preview → approval → write
             (ห้าม auto-map AMBIGUOUS/UNKNOWN)
```

reuse โครง `previewProductOwnerAssign()`/`applyProductOwnerAssign()` ✅ (preview→apply, lock, audit 1/รอบ)

### 13.2 Classification ต่อชนิด SKU (จาก Forensic §)

| ชนิด | ตัวอย่าง | mapping | confidence |
|---|---|---|---|
| **standard** | R01025 | prefix+model→Form, ยืนยันด้วยชื่อ | INFERRED→CONFIRMED |
| **L collisions** | L02002/L09002 | **full-SKU→Form** (ห้าม prefix+model) | AMBIGUOUS → review |
| **cross-prefix family** | ไฮเดรนเยีย H/HB/ON/V | แต่ละ prefix = Form แยก, link Family optional | INFERRED |
| **variant ambiguity** | KB096 (ขนาด) ปนกลุ่มสี | อ่าน variantRule จากชื่อ, ไม่เหมา category | AMBIGUOUS → review |
| **suffix-letter** | ...A/...B | ไม่ assume ความหมาย · เก็บ raw | AMBIGUOUS |
| **fullword SKU** | NAMETAG | non-product classify | UNKNOWN |
| **MTO** | BK001 | `mtoSkuPrefix_` ✅ · Form=bundle, ไม่มี variant | CONFIRMED |
| **NoCode** | variant slot ว่าง | Form=singleton, variant=NONE | INFERRED |
| **BlankSKU** | — | orphan list | UNKNOWN |
| **Service/Supply** | Fee | non-product | UNKNOWN |

🚫 **AMBIGUOUS/UNKNOWN ไม่ auto-map** — เข้า review queue ให้คนเลือก ✅

---

## 14. Reporting / Search

> ✅ ยึด Registry §10

### Canonical searchable identity

```
Business Family · Product Type/Form · Variant · SKU   (+ legacy SKU รองรับเต็ม)
```

- **ห้าม parse SKU string ทุกครั้งในอนาคต** — report query จาก Registry entity ตรง (Form/Family/Variant
  เป็น field จริง) ✅ · SKU parse ใช้เฉพาะตอน migration (§13) ครั้งเดียว
- legacy SKU: ค้นด้วย string เต็มได้เสมอ (immutable) · map แล้วค้นด้วย Form/Family ได้เพิ่ม
- รายงานที่ปลดล็อก: sales by Family/Form/Variant · supplier/owner performance · without-owner ·
  overdue review · orphan/ambiguous · legacy coverage % (Registry §10)
- ⚠️ ตัวเลขเชิงกลยุทธ์ยังติดเงื่อนไข provenance (§18)

---

## 15. Permissions / Security

| การกระทำ | warehouse | owner/dev | staff (frontstore/saler) | reviewer | หลักฐาน |
|---|---|---|---|---|---|
| **create (Add Product)** | ✅ | ✅ | ❌ | — | ✅ :862 (warehouse+owner) |
| **edit metadata** | ✅ 💡 (default — ดู หมายเหตุ) | ✅ | ❌ | — | 💡 PROPOSED default (reuse pattern create) |
| **assign owner** | — | ✅ (assign แทน) · staff กดดาวตัวเอง | ✅ (ดาวตัวเอง) | — | ✅ `productOwnerCanSet_` |
| **review (complete)** | ✅ | ✅ | ✅ (ถ้า assigned เป็น reviewer) | ✅ | ✅ createStockCheck ใน role · 🔒 D03 (reviewer ≠ owner) |
| **archive** | ⚠️ 💡 (default: ไม่ให้ — เฉพาะ owner/dev) | ✅ | ❌ | — | 💡 PROPOSED default |
| **registry management** | ❌ | ✅ (owner/dev) | ❌ | — | 💡 (isAdminRole_ ✅) |
| **migration approval** | ❌ | ✅ (owner/dev, GAS editor) | ❌ | — | ✅ pattern assign tools |

⚠️ ทุก action ที่กระทบ registry ควรผ่าน `resolveSession_` + gate (pattern `IMMEDIATE_GATE_ACTIONS_` ✅)
· **field-level permission granularity ไม่ได้อยู่ใน 5 decision ที่ owner ล็อกรอบนี้** (D01-D05 ล็อก
*field-master ownership ระหว่าง ERP/ZORT*, ไม่ใช่ *role-level ใครแก้ได้บ้างในฝั่ง ERP*) — ตารางนี้ใช้
**default ที่สอดคล้องกับ pattern การให้สิทธิ์ "create" ที่มีอยู่แล้ว** (`addNewProduct` :862) แทน ·
**ไม่ใช่ blocker** เพราะเป็น default ที่ปรับทีหลังได้โดยไม่ต้องเปิด architecture ใหม่ (เปลี่ยนแค่ role
list ในโค้ด ไม่กระทบ domain model/source-of-truth ที่ล็อกไปแล้ว)

---

## 16. Testing Contract

| layer | ต้องมี | pattern อ้างอิง |
|---|---|---|
| **unit** | classification, compose SKU, variantRule derive, pricing (×1.25/×0.8) | ✅ eval จาก .gs/.jsx (auth.test.js style) |
| **integration** | reserve→persist→register happy path | ✅ |
| **concurrency** | **SKU reservation concurrent test (บังคับ)** — 2 reqId พร้อมกัน prefix เดียว ไม่ชน | ✅ stampede.test.js style |
| **migration** | L collision (002), cross-prefix, ambiguous ไม่ auto-map | ✅ zort-deleted.test.js style |
| **ZORT failure** | AddProduct fail → SKU ยัง reserved, ไม่ปล่อยเลข, retry queue | ✅ online-sale.test.js style |
| **notification** | staff:STxxxx targeting, dedup, overdue, escalation | ✅ inapp-noti.test.js style |
| **permission** | create/edit/archive per role · migration owner-only | ✅ auth.test.js style |
| **legacy SKU** | immutable (ไม่มี path ไหน rewrite), full-SKU map | ✅ meta-test scan |
| **browser/UI** | Add Product flow 8-step, preview SKU, duplicate block, batch | ✅ tests/browser/run.cjs |

⚠️ **SKU reservation concurrent test = mandatory** (race condition คือปัญหาต้นเรื่องของ §4)

---

## 17. Rollout / Backward Compatibility

> ✅ ยึด Registry §12 · 🚫 ไม่ big-bang

```
Phase 0  gate ทุกอย่างด้วย _ENABLED (pattern มาตรฐาน ✅) — deploy แล้วไม่มีอะไรเปลี่ยน           [🔒 ล็อกครบ]
Phase A  registry foundation (สร้าง entity, ยังไม่ backfill)                                    [🔒 ล็อกครบ]
Phase B  backfill legacy (INFERRED + review queue)                                              [🔒 D01 FREEZE]
Phase B' read-only (report/search จาก registry, ไม่แตะ create)                                  [ปลอดภัย]
Phase C  creation (Add Product + backend reservation)                                           [🔒 ล็อกครบ]
Phase C' generation authority (ย้าย SKU gen client→backend เต็ม)                                 [🔒 D01 — namespace ใหม่เท่านั้น]
Phase F  edit product                                                                           [🔒 D02 — ดู implementation gap §6/§9]
Phase D  supplier review + owner workflow                                                       [🔒 D03 Model C]
Phase E' legacy freeze (ไม่มี migration policy อื่นแล้ว — D01 ปิดตัวเลือก (ข) ทิ้ง)               [🔒 D01]
```

- แต่ละ phase gate อิสระ · rollback = ปิด flag → กลับ flow เดิม (AddProductView เดิมยังอยู่)
- **backward compat**: legacy SKU ทำงานตลอด · client เก่า (cache .jsx) ไม่พัง (registry เป็น additive
  field · pattern `pv=2`/migration-safe ✅)
- 🔒 **ทุก phase ข้างบนไม่มี business-decision blocker เหลือแล้ว** (D01-D05 ปิดครบ) — เงื่อนไขที่เหลือ
  เป็น **implementation/data-quality** ล้วน (เช่น Phase F ต้องสร้าง push-metadata capability ใหม่ §9,
  Phase B'/migration ตัวเลขจริงยังพึ่ง provenance §18/§19)

---

## 18. Final Decision Gate — 🔒 CLOSED (ทั้ง 16 ข้อ)

> owner approve ครบแล้วทุกข้อ (D01-D05 + evidence-supported items) — gate นี้ **ปิด**

| # | Decision | สถานะ |
|---|---|---|
| 1 | **terminology** (Family→Form→Variant→SKU) | ✅ ตัดสินแล้ว (Work 4) |
| 2 | **source of truth** (ERP domain / ZORT operational) | 🔒 **LOCKED** (D02/D04) |
| 3 | **registry** (logical schema §3) | ✅ approved (ยึด §3 ตามเดิม — ไม่มีการเปลี่ยนแปลงจาก 5 decision) |
| 4 | **SKU authority** (backend reservation) | ✅ approved (ยึด §4 ตามเดิม) |
| 5 | **legacy policy** (freeze L) | 🔒 **LOCKED = FREEZE** (D01) |
| 6 | **variant rule** (ผูก Form) | ✅ evidence · ตัดสินแล้ว (Work 4) |
| 7 | **Add Product UI** (8-step + fast-path) | ✅ approved (ยึด §5 ตามเดิม) |
| 8 | **edit policy** (field ไหนแก้ที่ไหน) | 🔒 **LOCKED** (D02, ตารางเต็ม §6.2) |
| 9 | **supplier review** (owner vs reviewer) | 🔒 **LOCKED = Model C** (D03, แยก owner/reviewer ถาวร) |
| 10 | **owner** (lifecycle §8) | ✅ approved (reuse ของเดิม ไม่เปลี่ยน) |
| 11 | **pricing** (sell price master) | 🔒 **LOCKED = ERP master** (D02/D04 — กลับทิศจาก AS-IS, ดู §9) |
| 12 | **ZORT sync** (field-level master table) | 🔒 **LOCKED** (D04, ตารางเต็ม §10) |
| 13 | **migration** (preview→approve→write) | ✅ approved (ยึด §13 ตามเดิม — ยังต้อง freeze L ตาม D01) |
| 14 | **permissions** (field-level edit) | ✅ approved as default (💡 ไม่ใช่ decision ที่ owner ล็อกโดยตรง — ใช้ default ตาม §15, ปรับได้ทีหลังไม่กระทบ architecture) |
| 15 | **rollout** (phased §17) | ✅ approved (ยึด §17 ตามเดิม, ปลด decision-tag ทุก phase แล้ว) |
| 16 | **dataset provenance** | 🔒 **LOCKED = คง UNKNOWN โดยตั้งใจ** (D05) — **นี่คือ decision ที่ปิดแล้ว** (owner ตัดสินใจแล้วว่า "ไม่รู้แน่ชัด และไม่บล็อก architecture") ไม่ใช่ค้างคาว่าง |

🔒 **Business Decision Gate = CLOSED** — **ทุกข้อมีคำตอบแล้ว** รวมข้อ #16 (คำตอบคือ "คง UNKNOWN โดย
เจตนา ไม่บล็อกโครงสร้าง") · สิ่งที่ยังไม่ปิดไม่ใช่ "การตัดสินใจ" แต่เป็น **"ข้อมูล production-scale
จริง"** ที่ยังไม่มี — แยกกันคนละเรื่อง: decision ปิดแล้ว, data confidence ยังจำกัดสำหรับ migration
(ดู §19)

---

## 19. Coding Readiness — recalculated หลัง D01-D05 ปิดครบ

| Decision | Status | Blocker | Required owner decision |
|---|---|---|---|
| Terminology | ✅ READY | — | — |
| Source of truth | ✅ READY | — | 🔒 ปิดแล้ว (D02/D04) |
| Registry schema | ✅ READY | — | — |
| SKU authority | ✅ READY | — | — |
| Legacy policy | ✅ READY | — | 🔒 ปิดแล้ว = FREEZE (D01) |
| Variant rule | ✅ READY | — | — |
| Add Product UI | ✅ READY | — | — |
| Edit policy | ✅ READY | — | 🔒 ปิดแล้ว (D02) · ⚠️ implementation gap เท่านั้น: push-metadata capability ยังไม่มีโค้ด (§9) — เป็นงานสร้างใหม่ ไม่ใช่ decision ค้าง |
| Supplier review | ✅ READY | — | 🔒 ปิดแล้ว = Model C (D03) |
| Owner workflow | ✅ READY | — | (reuse ของเดิม) |
| Pricing | ✅ READY | — | 🔒 ปิดแล้ว = ERP master (D02/D04) |
| ZORT sync | ✅ READY | — | 🔒 ปิดแล้ว (D04, ตารางเต็ม §10) |
| Permissions | ✅ READY | — | default ตาม §15 (ไม่ใช่ blocker) |
| Rollout | ✅ READY | — | (phased) |
| Migration — **pipeline/logic** | ✅ READY | — | โครงสร้าง preview→approve→write ไม่พึ่งตัวเลข CSV |
| Migration — **execution ที่ scale จริง** | 🟡 **CONDITION** | ❓ provenance | ต้องยืนยันว่า CSV สะท้อน production ก่อนใช้ตัวเลข (จำนวน SKU ที่ backfill, ขนาด review queue) วางแผน operationally |
| Dataset provenance (ตัวเลขเชิงกลยุทธ์/รายงาน) | 🟡 **CONDITION** | ❓ UNKNOWN (🔒 D05 — ตั้งใจคงไว้) | ไม่ต้อง "ตัดสิน" เพิ่ม — แค่ **ระวังการใช้ตัวเลข** จนกว่าจะยืนยัน production ได้ |

### 🎯 คำตัดสิน: **Architecture = CLOSED · Business Decision Gate = CLOSED · Coding Readiness = READY
WITH CONDITIONS (เฉพาะจุดที่พึ่ง migration/provenance)**

**ตอบคำถามหลัก**: "approve แล้ว coding ได้เลยโดยไม่ต้องออกแบบ architecture ใหม่ไหม?" →
**ได้เต็มที่ — architecture ปิดแล้ว, business decision gate ปิดแล้วทั้ง 16 ข้อ (§18)** · **ไม่มี
business-decision blocker เหลืออยู่เลย** — ทุก phase (0, A, B, B', C, C', D, F) **เริ่มได้ทันทีตาม
ลำดับ dependency ใน §17** โดยไม่ต้องรอ owner ตัดสินอะไรเพิ่ม

**เงื่อนไขที่เหลือ (2 จุด — เป็น data-confidence/implementation gap ไม่ใช่ business decision ค้าง)**:
1. **Migration execution ที่ scale จริง** — โครงสร้าง/pipeline (§13) พร้อม coding ได้เลย แต่**การรัน
   จริงกับตัวเลข production** (จำนวน SKU ที่ backfill ต้องตรวจสอบด้วยมือกี่รายการ ฯลฯ) ควรรอยืนยัน
   provenance ก่อน — **ไม่บล็อกการเขียนโค้ด migration engine เอง** เพียงบล็อก "รันจริงกับข้อมูล
   production scale เต็มรูปแบบ"
2. **Phase F (Edit) — implementation gap ไม่ใช่ decision gap**: field-master ล็อกแล้ว (D02) แต่
   **ยังไม่มี push-metadata-to-ZORT capability ในโค้ดวันนี้** (§9 ท้ายหัวข้อ) — เป็นงานสร้างใหม่ตาม
   ปกติของ Phase F ไม่ใช่สิ่งที่ต้องกลับไปถาม owner

**เริ่มได้ทันทีทุก phase**: Phase 0 → A → B (backfill, FREEZE L ตาม D01) → B' → C → C' → D → F —
**ไม่มี phase ไหนติด business blocker แล้ว** · Phase B'/migration ที่พึ่งตัวเลข CSV จริงควรทำเป็น
"เตรียมพร้อม" (schema/pipeline/test) ก่อน แล้วค่อย run เต็มรูปแบบเมื่อ provenance ชัดขึ้น — **เป็น
sequencing ที่ดี ไม่ใช่ hard blocker**

💡 **สรุป**: เริ่ม coding ได้จริงตาม roadmap §17 ทันทีที่ owner สั่ง — **ไม่ต้องกลับมาออกแบบ Product
Architecture ใหม่อีก** ✅

---

## ข้อขัดแย้งระหว่างเอกสาร (ระบุตรง ๆ ไม่ reconcile เงียบ — ตามที่สั่ง)

| ประเด็น | เอกสาร/แหล่ง | ขัดกันอย่างไร | ต้องตัดสินอะไร |
|---|---|---|---|
| **"Family"** | Naming&SKU (Work 3) เดิมเสนอ Family=prefix+model · Family Decision (Work 4) แก้เป็น "Form=prefix+model, Family=ชั้น optional กว้างกว่า" | ชื่อแนวคิดต่างกัน | ✅ **แก้แล้ว** — Work 4 เป็นตัวล่าสุด, เอกสารนี้ยึด Work 4 (ระบุไว้ ไม่ใช่ reconcile เงียบ) |
| **prefix "สะอาด"** | Forensic (Work 3) ยก KB = "สะอาด 100%" · Family Decision (Work 4) พบ KB096 exception | Work 3 เข้าใจผิด | ✅ **แก้แล้ว** — Work 4 override, เอกสารนี้ยึด Work 4 |
| **barcode≠SKU** | Data Evidence (Work 3 ต้น) รายงาน "96.9%" (เฉพาะกลุ่ม V) · Forensic แก้เป็น 0.32% dataset-wide | scope ต่างกัน | ✅ **แก้แล้ว** — Forensic ระบุ correction ไว้แล้ว |
| **CLAUDE.md SKU rule** | CLAUDE.md ระบุ SKU = `[Prefix][Variant 2][Model 3]` เป็นกฎ · ข้อมูลจริงพบ 10% ไม่เข้ากฎ + MTO grammar ต่าง | code assumption ไม่ตรงข้อมูลจริง | 🔒 **ปิดแล้วโดย D01**: กฎ SKU ใหม่ (namespace สะอาด) บังคับเฉพาะสินค้าที่สร้างต่อจากนี้ · legacy (รวม `L` และรูปแบบเดิมที่ไม่เข้ากฎ) **ยกเว้นถาวร ไม่ rewrite** — ตรงกับ "FREEZE" ที่ owner approve |
| **dataset provenance** | header "(ทดสอบ)" · row content เอนไป production | พิสูจน์ไม่ได้ | 🔒 **ปิดแล้วโดย D05 = UNKNOWN (ตั้งใจคงไว้)** — ไม่ใช่ค้างคาว่าง (§18) |

> ✅ ทุกข้อขัดแย้งจาก investigation ก่อนหน้าถูก **แก้ในเอกสารรุ่นหลังแล้ว** (ไม่ใช่ค้างอยู่) · เอกสารนี้
> ระบุให้เห็นว่าแก้ที่ไหน · **ทั้ง 2 ข้อที่เหลือถูกปิดแล้วโดย locked owner decisions รอบนี้** (D01, D05)
> — ไม่มีข้อขัดแย้งที่ยัง "เปิดค้าง" อีกในเอกสารชุดนี้

---

## Guardrails Verification

### รอบแรก (สร้างเอกสาร — Work 6)

| ตรวจ | ผล |
|---|---|
| **1. git diff** | `git diff --name-only` ว่างเปล่า — ไม่มี tracked file (.jsx/.gs/.js) ถูกแก้ ✅ |
| **2. git status** | untracked เฉพาะ `.md` 8 ไฟล์ใน `docs/` — ไม่มีโค้ด/Sheet/config/CSV ✅ |
| **3. CSV checksum** | `d6d7e14dbe3285706ee2d0aafad36550` — ตรง baseline ✅ ไม่ถูกแก้ |
| **4. แก้เฉพาะไฟล์เดียว** | ไฟล์ใหม่มีแค่ `docs/PRODUCT-IMPLEMENTATION-SPEC.md` (mtime 08-25 03:57) · เอกสาร 7 ฉบับก่อนหน้า mtime เดิมทุกไฟล์ (23-25 ส.ค.) ไม่ถูกแตะ ✅ |
| **5. หยุดทันที** | ไม่ commit / ไม่ push / ไม่ deploy / ไม่สร้าง Registry/Sheet / ไม่ migrate / ไม่แตะ SKU · ไม่เริ่ม Work ถัดไป ✅ |

### รอบสอง (apply + LOCK 5 owner decisions — คำขอล่าสุด)

| ตรวจ | ผล |
|---|---|
| **CSV checksum** | `d6d7e14dbe3285706ee2d0aafad36550` — ตรง baseline ✅ ไม่ถูกแก้ |
| **เอกสาร 7 ฉบับก่อนหน้าไม่ถูกแก้** | mtime ทั้ง 7 ตรงกับ baseline เดิมทุกไฟล์ (23-25 ส.ค.) — ไม่มีไฟล์ไหนถูกแตะ ✅ |
| **ไม่มี .jsx/.gs/.js ถูกแก้** | `git diff --name-only` ว่างเปล่า ✅ |
| **แก้เฉพาะ PRODUCT-IMPLEMENTATION-SPEC.md** | ไฟล์เดียวที่ mtime เปลี่ยน (08-25 04:15, จาก 41,486 → 62,388 ไบต์) — ไฟล์อื่นทั้งหมด (รวม 7 เอกสารเดิม) ไม่ถูกแตะ ✅ |
| **git status** | untracked เฉพาะ `.md` 8 ไฟล์ใน `docs/` เหมือนเดิม — ไม่มีโค้ด/Sheet/config/CSV ✅ |

**สิ่งที่เปลี่ยนในรอบนี้** (สรุปตามที่สั่งให้รายงาน):
1. เพิ่ม 🔒 tag ในตาราง evidence-level legend
2. เพิ่มหัวข้อใหม่ **"🔒 LOCKED OWNER DECISIONS"** (D01-D05) ทันทีหลัง legend ก่อน §1
3. อัปเดต **§2 Source of Truth** — แยก cost(ZORT)/sell price(ERP) + เพิ่มแถว review status/transactions
4. อัปเดต **§4.3** Legacy `L` — ปิดเป็น FREEZE (ตัด ตัวเลือก (ข) ทิ้ง)
5. อัปเดต **§6.2 Product Edit** — แทนตารางเดิมด้วยตาราง field-master เต็ม + หมายเหตุ AS-IS/TO-BE
   กลับทิศ + implementation gap (ไม่มี push-metadata pattern อยู่จริง)
6. อัปเดต **§7** — ล็อก Model C, แยก Reviewer/Product Owner ถาวร
7. อัปเดต **§9 Pricing** — เพิ่มตาราง AS-IS vs TO-BE (sell price กลับทิศเป็น ERP master) +
   implementation gap note
8. อัปเดต **§10 ZORT Sync** — แทนตารางเดิมด้วยตาราง field-level master เต็มตาม D04
9. อัปเดต **§12 Images** — ยืนยัน ownership ตรงคำที่ owner ล็อก (พฤติกรรมโค้ดวันนี้ตรงอยู่แล้ว)
10. อัปเดต **§15 Permissions** — เปลี่ยน "OWNER DECISION" 2 แถวเป็น default ที่ไม่ใช่ blocker
11. อัปเดต **§17 Rollout** — ปลด decision-tag ทุก phase
12. อัปเดต **§18 Final Decision Gate** — ปิดครบ 16/16 ข้อ (รวม provenance = ปิดในสถานะ UNKNOWN โดยเจตนา)
13. **recalculate §19 Coding Readiness** — จาก 5 BLOCKER + 8 CONDITION เหลือ 0 blocker, 2 condition
    (เฉพาะ migration-scale execution + provenance-dependent numbers)
14. อัปเดตตาราง "ข้อขัดแย้งระหว่างเอกสาร" — ปิด 2 ข้อที่เหลือ (SKU rule scope → ตอบโดย D01,
    provenance → ปิดโดย D05)
15. อัปเดต header บนสุดของเอกสาร — สรุปสถานะใหม่

**STOP** — งานจบที่เอกสารเท่านั้น (ไฟล์เดียว, ไม่แตะไฟล์อื่น) ไม่ commit/push/deploy/สร้าง Registry/
migrate data/แก้ code · Architecture = CLOSED · Business Decision Gate = CLOSED ·
Coding Readiness = READY WITH CONDITIONS (เฉพาะจุด migration-scale/provenance) — รอ owner สั่งเริ่ม
Work ถัดไป
