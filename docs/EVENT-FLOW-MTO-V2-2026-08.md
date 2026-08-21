# Event Flow Specification — MTO v2 (Template-Driven Architecture)

**สถานะ**: 📋 Architecture spec — ยังไม่ implement, ยังไม่ commit
**คู่กับ**: `docs/DOMAIN-MODEL-MTO-V2-2026-08.md` (Deliverable 1) — เอกสารนี้แสดง **ลำดับเวลา** ของ
event ที่ประกาศไว้ใน §5 ของเอกสารนั้น

---

## ภาพรวม Lifecycle

```
TemplateCreated
   │
   ▼
[ Template: active, currentRecipeVersion=v1 ]
   │
   │  (ลูกค้าสั่งงาน)
   ▼
JobCreated ──────▶ RecipeCopied
   │                  (copy RecipeVersion.materials → MaterialUsage เป็นค่าตั้งต้น)
   ▼
[ Job: กำลังจัด ]
   │
   ├──▶ MaterialPicked (0..N ครั้ง — คลังเบิกของจริง แก้ qty ทีละ SKU)
   ├──▶ MaterialReturned (0..N ครั้ง — คืนของเบิกเกิน)
   │
   ▼
JobFulfilled ◀── ⭐ SNAPSHOT ระยะที่ 1 (Cost-side freeze)
   │
   │  (รอลูกค้ามารับ/ชำระเงิน — อาจเป็นวันเดียวกันหรือหลังจากนั้น)
   ▼
JobSold ◀── ⭐ SNAPSHOT ระยะที่ 2 (Revenue-side freeze)
   │
   ▼
[ Job: เสร็จแล้ว + ขายแล้ว, JobSnapshot ครบสมบูรณ์ ]
   │
   ▼
(Report queries — ไม่ใช่ event, ดู §4)
```

**เส้นทางขนาน (ไม่ใช่ main flow)**:
- `TemplateRetired` / `TemplatePromoted` — เกิดได้ตลอดเวลา ไม่ผูกกับ Job ใบใดใบหนึ่ง
- `RecipeVersionPublished` — เกิดได้ตลอดเวลา ไม่กระทบ Job ที่มีอยู่แล้ว (อ้าง version เดิม)
- `JobCancelled` — แทรกได้ทั้งก่อนและหลัง `JobFulfilled` (ดู §3)

---

## 1. รายละเอียดแต่ละ Event

### `TemplateCreated`
- **Trigger**: เจ้าของ/staff สร้างประเภทงานใหม่
- **Precondition**: ไม่มี template ชื่อ/SKU ซ้ำ (soft warning ตามธรรมเนียม repo — ห้าม block)
- **เขียน**: `Template{templateId, name, category, ..., status:"active"}` + `RecipeVersion{templateId, version:1, materials:[]}`
- **Postcondition**: Template พร้อมใช้สร้าง Job

### `TemplateRetired` / `TemplatePromoted`
- **Trigger**: เจ้าของตัดสินใจ (อาจอิง signal จาก Read Model — ดู Domain Model spec §7)
- **เขียน**: flag บน Template เท่านั้น
- **⚠️ ไม่กระทบ Job ที่มีอยู่**: Job เก่าอ้าง `templateId` เดิม, ข้อมูลใน `JobSnapshot` ถูก freeze ไปแล้ว
  — retire template ไม่ทำให้ report ย้อนหลังเปลี่ยน (นี่คือเหตุผลที่ JobSnapshot ต้อง exist)

### `RecipeVersionPublished`
- **Trigger**: แก้สูตร (เพิ่ม/ลด/เปลี่ยนวัตถุดิบมาตรฐาน)
- **เขียน**: `RecipeVersion{templateId, version: N+1, materials:[...], effectiveFrom}` (แถวใหม่ ไม่แก้ของเก่า) + `Template.currentRecipeVersion = N+1`
- **Postcondition**: Job ใหม่ที่สร้างหลังจากนี้ใช้ v(N+1) · Job เก่ายังอ้าง version ที่ใช้ตอนนั้น

### `JobCreated`
- **Trigger**: staff รับงานจากลูกค้า
- **Precondition**: `templateId` ต้องมีอยู่และ `status != retired` (retired template สร้างงานใหม่ไม่ได้ —
  แต่ **นี่เป็นจุดตัดสินใจเปิด**: ถ้าเจ้าของอยากให้ยังสร้างได้แต่มีคำเตือน ให้ปรับเป็น soft warning ได้)
- **เขียน**: `Job{jobId, templateId, customerId, createdAt, status:"กำลังจัด"}`

### `RecipeCopied`
- **Trigger**: ทันทีหลัง `JobCreated` (ระบบทำอัตโนมัติ ไม่ใช่ action แยกที่ผู้ใช้กด)
- **เขียน**: copy `RecipeVersion(currentVersion).materials` → `MaterialUsage[]` เป็นค่าตั้งต้น (expected)
- **⚠️ นี่คือค่าเริ่มต้นเท่านั้น** — พนักงานแก้ได้อิสระในขั้นตอนถัดไป (ไม่ใช่ค่าตายตัว)

### `MaterialPicked` / `MaterialReturned`
- **Trigger**: คลังเบิก/คืนวัตถุดิบจริงระหว่างจัดงาน (0 หรือหลายครั้ง)
- **เขียน**: แก้ `MaterialUsage.qty`/`returnedQty` — **ยังไม่หักสต็อกจริง** (ตรงกับ F1 เดิม —
  หักสต็อกจริงเกิดที่ `JobFulfilled` เท่านั้น การเบิก/คืนตรงนี้คือ "บันทึกแผน" ไม่ใช่ "ตัดสต็อกจริง")

### ⭐ `JobFulfilled` — Snapshot ระยะที่ 1 (Cost-side)
- **Trigger**: staff กดปิดงาน (งานประกอบเสร็จจริง)
- **ทำ (reuse จาก F1 เดิมได้ทั้งหมด)**:
  1. หักสต็อกจริง (DMJ sheet + ZORT ผ่าน `decreaseMtoStockInZort_` — **ไม่เปลี่ยน**)
  2. **Freeze JobSnapshot ครึ่งแรก**:
     ```
     recipeVersionUsed      = Template.currentRecipeVersion ณ ขณะนี้
     templateNameAtClose    = Template.name ณ ขณะนี้
     templateCategoryAtClose= Template.category ณ ขณะนี้
     actualMaterials[]      = MaterialUsage ที่ freeze แล้ว (แก้ต่อไม่ได้)
     unitCostAtClose[]      = ต้นทุนวัตถุดิบต่อหน่วย ณ ขณะนี้ (⚠️ ยังติดกำแพงต้นทุน — ดู Domain
                               Model spec, Phase 2C)
     actualCost             = Σ(qty × unitCostAtClose)
     arrangeTimeMin         = closedAt − startAt
     designer               = ผู้รับผิดชอบ
     ```
- **Postcondition**: `Job.status = "เสร็จแล้ว"` · MaterialUsage เป็น immutable ต่อจากนี้ · **`actualPrice`/`actualMargin`/`salesSkuAtSale` ยังว่าง — รอ `JobSold`**

### ⭐ `JobSold` — Snapshot ระยะที่ 2 (Revenue-side)
- **Trigger**: ขายผ่าน POS (Billing context)
- **Precondition**: `canSellMtoJob_`-equivalent (F1 เดิม — sellable state machine **ใช้ต่อได้ 100%**)
- **ทำ**:
  1. สร้าง `Sale` ใน Billing context (คนละ aggregate — อ้าง `jobId`)
  2. ยิง ZORT ด้วย `salesSkuAtSale = Template.currentSalesSku ณ ขณะนี้` (**อาจต่างจาก SKU ตอน
     fulfillment ถ้า SKU ถูกเปลี่ยนระหว่างทาง** — freeze ค่า ณ จุดนี้เท่านั้น)
  3. **Freeze JobSnapshot ครึ่งหลัง**:
     ```
     salesSkuAtSale = SKU ที่ใช้ยิง ZORT จริง
     actualPrice    = ราคาที่ตกลงขายจริง (อาจต่างจาก Job.price ตอนสร้าง ถ้าต่อรองใหม่)
     actualMargin   = actualPrice − actualCost (actualCost มาจากระยะที่ 1 แล้ว)
     ```
  4. `markMtoJobSold_`-equivalent (F1 เดิม — idempotency/billCid dedup **ใช้ต่อได้ 100%**)
- **Postcondition**: `Job.saleStatus = "ขายแล้ว"` · `JobSnapshot` สมบูรณ์ทั้งสองครึ่ง · Job ทั้ง
  aggregate เป็น immutable โดยสมบูรณ์

**ทำไมต้องแยก 2 ระยะ (ไม่ใช่ freeze ครั้งเดียวตอนขาย)**: ถ้ารอ freeze ทุกอย่างจนถึง `JobSold` —
`actualCost`/`unitCostAtClose` จะใช้ **ราคาต้นทุน ณ วันขาย** แทนที่จะเป็น **ราคาต้นทุน ณ วันที่วัตถุดิบ
ถูกใช้จริง** (`JobFulfilled`) ถ้าสองวันนี้ห่างกัน (งานจัดไว้ล่วงหน้า รอลูกค้ามารับ) ต้นทุนจะเพี้ยนตามราคา
วัตถุดิบที่ขยับไปแล้ว — ผิดหลักบัญชี "ต้นทุนคือสิ่งที่เกิดขึ้นจริง ณ ตอนใช้ทรัพยากร ไม่ใช่ ณ ตอนรับเงิน"

### `JobCancelled`
- **Trigger**: ยกเลิกงาน — เกิดได้ 2 จังหวะ ต้องแยกพฤติกรรม:

| จังหวะ | พฤติกรรม | สถานะ |
|---|---|---|
| ก่อน `JobFulfilled` | ยกเลิกตรงๆ ไม่มีผลกระทบ (ยังไม่หักสต็อก) | ปลอดภัย |
| **หลัง `JobFulfilled`** | ⚠️ **ช่องโหว่ที่พบตั้งแต่รอบก่อนหน้า ยังไม่มีคำตอบ** — สต็อกถูกหักไปแล้วจริง (ทั้ง DMJ sheet และ ZORT) ต้อง**ตัดสินใจ**ว่าจะคืนสต็อกอัตโนมัติ หรือปล่อยให้เจ้าของจัดการเอง (manual adjustment) | **ต้องตัดสินใจก่อน implement Phase ที่แตะเรื่องนี้** |

---

## 2. Report Queries (ไม่ใช่ Event — เพื่อความชัดเจน)

`"Report Updated"` ในไดอะแกรมที่ร่างไว้ตอนแรก **ไม่ใช่ domain event** — ไม่มี state ของ aggregate ไหน
เปลี่ยนเมื่อมีคนเปิดดู dashboard เป็นแค่ **query ที่ join ข้อมูลจาก JobSnapshot ทุกใบที่ freeze แล้ว**:

```
ยอดขายต่อ Template     = Σ Sale.amount WHERE Sale.jobId IN (Job WHERE templateId = X)
Top Material           = GROUP BY materialSku จาก MaterialUsage ทุก Job ของ templateId นั้น
Average Margin         = AVG(JobSnapshot.actualMargin) WHERE templateId = X AND saleStatus=ขายแล้ว
```

ถ้าวันหนึ่งต้องการ "อัปเดตแบบ real-time"/"materialize เป็นตาราง" (Phase 3, ดู Domain Model spec §7)
ค่อยเปลี่ยนจาก query-on-demand เป็น event-driven projection (ตอนนั้น `JobSold` ถึงจะมีคน subscribe
จริงๆ เพื่ออัปเดตตาราง materialized) — **วันนี้ยังไม่ต้อง**

---

## 3. Edge Cases ที่ยังเปิดอยู่ (ต้องตัดสินใจก่อน implement)

| # | Edge Case | สถานะ |
|---|---|---|
| 1 | ยกเลิกงานหลัง fulfilled — คืนสต็อกไหม | ❌ ยังไม่ตัดสินใจ (เจอตั้งแต่ Design Review รอบก่อน) |
| 2 | สร้าง Job จาก Template ที่ retired แล้วได้ไหม | ❌ ยังไม่ตัดสินใจ (เสนอ default = ปิดกั้น, เปิดได้ถ้าต้องการ) |
| 3 | ราคาต่อรองใหม่ได้ระหว่าง fulfilled → sold ไหม (กระทบว่า `actualPrice` ควร lock ตอนไหน) | ❌ ต้องถามจาก workflow จริงของร้าน |
| 4 | RecipeVersion ใหม่ระหว่างที่ Job ยัง "กำลังจัด" (ยังไม่ fulfilled) — Job ควรอัปเดตตาม version ใหม่ หรือค้าง version เดิมที่ copy ไปตอนสร้าง | ❌ ยังไม่ตัดสินใจ — เสนอ: ค้าง version เดิม (Job ไม่ควรเปลี่ยนกลางทาง) |

---

## สรุปสถานะเอกสาร

Deliverable 1 (Domain Model) + Deliverable 2 (Event Flow) เสร็จแล้วทั้งคู่ — ยังไม่ commit, ยังไม่แตะโค้ด
ตามที่สั่ง ขั้นต่อไปตาม handoff ของคุณคือ: Review Aggregate Boundaries → Review Entity Ownership →
Review Database Schema → Review Google Sheets Boundaries → Review Future Migration → **แล้วค่อยเริ่ม
Phase 2A (Job → Template Link) เท่านั้น** (ไม่แตะ Recipe Version/Cost Snapshot/Analytics ตามที่ระบุไว้)
