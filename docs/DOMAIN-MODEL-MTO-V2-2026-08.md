# Domain Model Specification — MTO v2 (Template-Driven Architecture)

**สถานะ**: 📋 Architecture spec — ยังไม่ implement, ยังไม่ commit
**บริบท**: ต่อจาก `docs/MIGRATION-PLAN-MTO-JOBSKU-2026-08.md` (Phase 2A เดิม) — เอกสารนี้คือเป้าหมายระยะยาว
ที่ Phase 2A/2B/2C จะค่อยๆ เดินไปถึง ไม่ใช่สิ่งที่ต้องสร้างครบวันนี้
**หลักการอ่าน**: นี่คือ Domain Model ใน "โลกอุดมคติ" (greenfield v2) — ไม่ผูกกับโครงสร้างชีตปัจจุบัน

---

## 1. Bounded Contexts

MTO ไม่ได้อยู่โดดๆ — ต้องวาดขอบเขตให้ชัดว่าอะไรเป็นของใคร ไม่งั้น domain model จะบวมจนทับ context อื่น

```
┌─────────────────────────┐      ┌──────────────────────────┐
│  MTO DOMAIN (core)       │      │  CATALOG / INVENTORY      │
│  Template, RecipeVersion │─────▶│  (ZORT)                   │
│  Job, MaterialUsage      │ ref  │  ownership: วัตถุดิบดิบ     │
│  Customer                │      │  (SKU, stock, ราคาต้นทุน)  │
└──────────┬───────────────┘      └──────────────────────────┘
           │ jobId (reference only, ไม่ own)
           ▼
┌─────────────────────────┐      ┌──────────────────────────┐
│  BILLING / POS CONTEXT   │─────▶│  ZORT (finance/tax)       │
│  Sale, Bill, Invoice     │ sync │  ownership: ใบกำกับภาษี,    │
│  (SHEET_SALE_BILLS เดิม) │      │  official order record    │
└──────────┬───────────────┘      └──────────────────────────┘
           │ derive
           ▼
┌─────────────────────────┐
│  ANALYTICS / REPORTING   │   ← Read Model (ดู §7) — ไม่ใช่ bounded context
│  (query-only, no writes) │     ที่มี invariant ของตัวเอง เป็นแค่ projection
└─────────────────────────┘
```

**กฎการอ้างอิงข้าม context**: อ้างด้วย **ID เท่านั้น** ไม่ copy field ข้าม (เช่น MTO domain เก็บ `jobId`
ใน Sale record ไม่ใช่ copy ทั้ง Job object เข้าไปใน Sale) — กันการ duplicate ownership

⚠️ **Sale ไม่ใช่ส่วนหนึ่งของ MTO Aggregate** — เป็นการตัดสินใจสำคัญที่ต่างจากร่างแรกของผม: Sale/Bill
มี invariant ของตัวเอง (VAT, เลขใบกำกับ, billCid idempotency) ที่ไม่เกี่ยวกับ "งานจัดพิเศษ" โดยตรง —
MTO domain แค่ **เป็นเจ้าของความจริงเรื่องต้นทุน/วัตถุดิบ** ส่วน Billing context เป็นเจ้าของความจริงเรื่องเงิน
สองอย่างนี้ join กันผ่าน `jobId` ไม่ใช่ aggregate เดียวกัน

---

## 2. Aggregates

Aggregate = ขอบเขตที่ transaction/invariant ต้องคงเส้นคงวาไปด้วยกัน (all-or-nothing) — เขียนใน DB จริง
ควรเขียนทั้ง aggregate ในธุรกรรมเดียว

### Aggregate: `Template` (root)
```
Template (root)
 └─ RecipeVersion[]   (internal entity, append-only, owned by Template)
```
**Invariant**: มี `currentRecipeVersion` อ้างถึง RecipeVersion ที่มีอยู่จริงเสมอ · retired template
สร้าง Job ใหม่ไม่ได้ (แต่ Job เก่ายังอ้างถึงได้ — ดู §5 Snapshot)

### Aggregate: `Job` (root)
```
Job (root)
 ├─ MaterialUsage[]    (internal entity, owned by Job)
 └─ JobSnapshot        (value object, frozen ที่ closedAt — ดู §4)
```
**Invariant**: `MaterialUsage` แก้ไขได้เฉพาะตอน status = "กำลังจัด" · หลัง `closedAt` ถูกตั้ง →
Job ทั้ง aggregate (รวม MaterialUsage) เป็น **immutable** (append-only correction เท่านั้น ไม่ overwrite)

### Aggregate: `Customer` (root, เล็ก/แบน)
```
Customer (root) — segment, tags
```
ไม่มี internal entity — เป็น reference data ที่ Job/Sale ชี้เข้ามา

### ไม่ใช่ Aggregate ของ MTO Domain
- **Sale** — อยู่ Billing context (§1) · MTO เก็บแค่ `saleRef` (ID reference)
- **Report/KPI** — ไม่ใช่ aggregate เลย เป็น Read Model (§7)

---

## 3. Entities

| Entity | Identity | Key Attributes | Lifecycle States |
|---|---|---|---|
| **Template** | `templateId` (opaque, เช่น `TEMPLATE-0001`) | name, category, image, suggestedPrice, difficulty, designerDefault, tags[], gallery[], currentRecipeVersion, **currentSalesSku** (ดู §3.1) | `draft` → `active` → `retired` (+ `promoted: boolean` flag แยก ไม่ใช่ state) |
| **RecipeVersion** | `(templateId, version)` composite | materials: MaterialLine[] (VO), effectiveFrom, createdBy | ไม่มี state — append-only, ไม่ลบ/แก้ของเก่า |
| **Job** | `jobId` | templateId(FK), customerId(FK), createdAt, startAt?, closedAt?, materials: MaterialUsage[], snapshot: JobSnapshot? | `กำลังจัด` → `เสร็จแล้ว(fulfilled)` × `ยังไม่ขาย/ขายแล้ว/ยกเลิก(saleStatus)` — **สอง state machine อิสระ** (ตาม F1 เดิม ยังใช้ได้) |
| **MaterialUsage** | `(jobId, materialSku, line#)` | qty, returnedQty, net, **unitCostAtClose** (frozen — ดู §4) | เขียนได้จนกว่า Job.closedAt จะถูกตั้ง |
| **Customer** | `customerId` | name, segment (VIP/ร้านดอกไม้/งานศพ/แต่งงาน/...), tags[], contactInfo | ไม่มี lifecycle ซับซ้อน |

### 3.1 ทำไม templateId ≠ SKU (ตามข้อเสนอ 1 ของคุณ)

```
Template.templateId = "TEMPLATE-0001"     ← Domain Identity (stable, internal, ไม่เปลี่ยนตลอดชีพ)
Template.currentSalesSku = "VASE001"      ← External Identifier (projection ไป ZORT, เปลี่ยนได้)
```

**เหตุผลที่ทำให้ต้องแยก และทำไม field เดียวไม่พอ**: ถ้า SKU เปลี่ยน (ร้านรีแบรนด์/ย้าย ERP/ZORT บังคับ
เปลี่ยนรหัส) — `currentSalesSku` เปลี่ยนได้โดย `templateId` และประวัติ (RecipeVersion, Job ทั้งหมด)
ไม่กระทบเลย แต่ **Job ที่ขายไปแล้วต้องรู้ว่าตอนนั้นขายด้วย SKU ไหน** (ใบเสร็จเก่าอ้าง SKU เก่า) →
นี่คือเหตุผลที่ `salesSkuAtSale` ต้องอยู่ใน **JobSnapshot** ด้วย (§4) ไม่ใช่แค่เก็บ `currentSalesSku`
บน Template เฉยๆ — เป็นจุดเชื่อมระหว่างข้อเสนอ 1 และ 2 ของคุณที่ผมรวมเข้าด้วยกัน

---

## 4. Value Objects

VO = ไม่มี identity เป็นของตัวเอง เท่ากันถ้าค่าเท่ากัน อยู่ในกรรมสิทธิ์ของ entity เจ้าของ

| VO | โครงสร้าง | เจ้าของ |
|---|---|---|
| `MaterialLine` | `{materialSku, qty}` | RecipeVersion (expected), Job (ผ่าน MaterialUsage — actual) |
| `Money` | `{amount, currency}` (currency คงที่ THB วันนี้ แต่กันไว้) | ทุกที่ที่มีราคา/ต้นทุน |
| **`JobSnapshot`** | ดูด้านล่าง | Job — เขียนครั้งเดียว ตอนปิด/ขาย แล้ว immutable |

### JobSnapshot (ขยายตามข้อเสนอ 2 ของคุณ — "Snapshot มากกว่าแค่ต้นทุน")

```
JobSnapshot {
  // ── Template ณ ขณะนั้น (เผื่อ Template ถูกแก้ในอนาคต) ──
  templateNameAtClose
  templateCategoryAtClose
  suggestedPriceAtClose
  salesSkuAtSale            ← จาก §3.1 (SKU ที่ใช้จริงตอนขาย ไม่ใช่ current)
  recipeVersionUsed

  // ── Actual (จาก MaterialUsage ที่ freeze แล้ว) ──
  actualMaterials: MaterialLine[]
  actualCost: Money           ← Σ (qty × unitCostAtClose)
  actualPrice: Money
  actualMargin: Money         ← actualPrice − actualCost

  // ── Operational facts ──
  designer
  arrangeTimeMin              ← startAt → closedAt
}
```

⚠️ **จุดที่ต้องระวัง (พบระหว่างร่าง ไม่ได้อยู่ในข้อเสนอเดิม)**: `actualPrice`/`actualMargin` **freeze
ได้สมบูรณ์ตอนไหน**? ถ้า fulfillment (ปิดงาน) กับ sale (ขายจริง) เป็นคนละเวลา และราคาต่อรองใหม่ได้ก่อนขาย
จริง — snapshot ต้อง**แบ่งเป็น 2 ช่วง** ไม่ใช่จุดเดียว ดูรายละเอียดใน Event Flow spec (§ "Two-Stage
Snapshot") — เอกสารนี้แค่ประกาศ shape ของ JobSnapshot แต่ "เขียนตอนไหน" อยู่ในเอกสารที่สอง

---

## 5. Domain Events

| Event | Trigger | เขียนอะไร | หมายเหตุ |
|---|---|---|---|
| `TemplateCreated` | เจ้าของ/staff สร้าง template ใหม่ | Template row + RecipeVersion v1 | — |
| `TemplateRetired` | เจ้าของตัดสินใจเลิกขาย | Template.status = retired | Job เก่ายังอ้างได้ (snapshot ไม่พัง) |
| `TemplatePromoted` | เจ้าของ flag ให้โปรโมต | Template.promoted = true | ไม่ใช่ state, เป็น flag คู่ขนาน |
| `RecipeVersionPublished` | แก้สูตร | RecipeVersion ใหม่ (append) + Template.currentRecipeVersion อัปเดต | เก่าไม่ถูกแก้/ลบ |
| `JobCreated` | staff สร้างงานจากลูกค้า | Job row, link templateId+customerId | — |
| `RecipeCopied` | ทันทีหลัง JobCreated (หรือรวมเป็น step เดียวกัน) | copy RecipeVersion.materials → MaterialUsage (expected, ยังแก้ได้) | pre-fill ไม่ใช่ actual สุดท้าย |
| `MaterialPicked` | คลังเบิกของจริง | MaterialUsage.qty | แก้ได้จนกว่า fulfilled |
| `MaterialReturned` | คืนของที่เบิกเกิน | MaterialUsage.returnedQty | — |
| `JobFulfilled` | staff กดปิดงาน | หักสต็อก (F1 เดิม `applyMtoFulfillment_`/`decreaseMtoStockInZort_` — ใช้ต่อได้) + **freeze ครึ่งแรกของ snapshot** (cost side) | ดู Event Flow spec |
| `JobSold` | ขายผ่าน POS | Sale (Billing context) + **freeze ครึ่งหลังของ snapshot** (price/margin side) + `Job.saleRef` | Sale เป็น context อื่น — จุดเชื่อมคือ event นี้ |
| `JobCancelled` | ยกเลิกงาน (ก่อน/หลัง fulfilled) | Job.status = cancelled | ⚠️ ถ้ายกเลิกหลัง fulfilled — คืนสต็อกไหม? **ยังเป็นช่องโหว่เปิดที่เจอตั้งแต่รอบก่อน ยังไม่มีคำตอบ** |

⚠️ **"Report Updated" ไม่ใช่ Domain Event** — เป็น query/projection (§7) ไม่ใช่ state transition ของ
aggregate ใดๆ ใส่ไว้ใน diagram ของ Event Flow ได้เพื่อความเข้าใจ lifecycle แต่ไม่ควรนับเป็น event
ที่ event store ต้องเก็บ

---

## 6. Relationships (ER สรุป)

```
Template 1───N RecipeVersion         (versioned, append-only)
Template 1───N Job                   (instantiate)
Job      1───N MaterialUsage         (owned, internal to Job aggregate)
Job      1───0..1 Sale               (reference only — Sale อยู่ Billing context)
Customer 1───N Job
Job      1───0..1 JobSnapshot        (embedded VO, ไม่ใช่ entity แยก)
```

---

## 7. Write Model vs Read Model (ตามข้อเสนอ 3 ของคุณ)

```
WRITE MODEL (Aggregates — §2)          READ MODEL (Projections — query-only)
┌────────────────────────┐             ┌──────────────────────────────┐
│ Template                │             │ Dashboard: ยอดขาย/margin       │
│ Job (+MaterialUsage)    │──derive──▶  │ Top Material (by template)    │
│ Customer                │             │ Top Customer                  │
│ Sale (Billing context)  │             │ Template ควร retire/promote   │
└────────────────────────┘             └──────────────────────────────┘
```

**กฎเด็ดขาด**: Read Model **ห้ามมี invariant/business rule เป็นของตัวเอง** — เป็นแค่ shape ที่สะดวกต่อการ
อ่าน (SELECT/aggregate) ไม่มี logic การตัดสินใจ (การตัดสินใจ retire/promote ยังเป็นการกระทำของคนที่เขียน
กลับไปที่ `TemplateRetired`/`TemplatePromoted` event ใน Write Model เท่านั้น — Read Model แค่ **แสดง
สัญญาณ** ให้คนตัดสินใจ ไม่ตัดสินใจเอง)

**ทำไม split นี้สำคัญกับสิ่งที่ถามใน Q8 เดิม (derive vs persist)**: เพราะ Read Model แยกจาก Write Model
โดยสถาปัตยกรรม — จะ **cache**, **materialize เป็นตาราง**, หรือ **ย้ายไป DB จริง** (Phase 3) ก็ทำได้อิสระ
โดยไม่กระทบ Write Model เลย (Template/Job ยังเขียนที่ Sheets เหมือนเดิมได้ต่อไป แม้ Read Model จะย้ายไป
Supabase แล้วก็ตาม) — นี่คือเหตุผลเชิงสถาปัตยกรรมที่แท้จริงว่าทำไม "ไม่ persist average" ถึงถูกต้อง ไม่ใช่
แค่เรื่องความสด

---

## 8. Design Decisions Log (สรุปการตัดสินใจที่ยึดในเอกสารนี้)

| # | การตัดสินใจ | เหตุผลสั้นๆ |
|---|---|---|
| 1 | `templateId` เป็น opaque UUID แยกจาก SKU | อนุมัติจากคุณ — กัน domain พังเมื่อ SKU/ERP เปลี่ยน |
| 2 | Sale เป็นคนละ Bounded Context ไม่ใช่ MTO Aggregate | MTO เป็นเจ้าของ "ต้นทุน/วัตถุดิบ" ไม่ใช่เจ้าของ "เงิน/ภาษี" |
| 3 | JobSnapshot แบ่ง 2 ช่วง (fulfillment-time / sale-time) | ราคาต่อรองใหม่ได้ก่อนขายจริง — freeze จุดเดียวไม่พอ (รายละเอียดใน Event Flow spec) |
| 4 | Read Model ไม่มี business rule เป็นของตัวเอง | กัน logic กระจายสองที่ — decision (retire/promote) เขียนกลับ Write Model เสมอ |
| 5 | RecipeVersion เป็น append-only ไม่มีการแก้/ลบของเก่า | กัน cost ย้อนหลังเพี้ยนเมื่อสูตรเปลี่ยน (ตรงกับ Q5 รอบก่อน) |
