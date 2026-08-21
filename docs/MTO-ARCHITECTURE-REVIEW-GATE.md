# MTO Architecture Review Gate

**สถานะ**: 📋 Architecture Review — ยังไม่ implement, ยังไม่แตะโค้ด, ยังไม่ deploy
**คู่กับ**: `docs/DOMAIN-MODEL-MTO-V2-2026-08.md` (Deliverable 1) + `docs/EVENT-FLOW-MTO-V2-2026-08.md`
(Deliverable 2) — เอกสารนี้คือ **gate ก่อนเข้า Phase 2A** ตามที่ระบุไว้ท้าย Deliverable 2
**วิธีอ่าน**: ทุกข้อสรุปในเอกสารนี้ผูกกับหลักฐานจริงในโค้ด (`appsscript_complete.gs` file:line) ไม่ใช่
ความรู้ทั่วไปเรื่อง DDD — ที่ไหนไม่มีหลักฐาน จะระบุว่า "ไม่ทราบ/ตรวจไม่ได้" ตรงๆ แทนการเดา

---

## Business Decisions ที่ล็อกเป็น constraint ของรอบนี้

ทั้ง 5 ข้อนี้เป็น**ข้อสรุปที่คุณอนุมัติแล้ว** ไม่ใช่ทางเลือกที่เปิดให้ตีความอีก — ทุก section ด้านล่าง
ออกแบบให้สอดคล้องกับข้อเหล่านี้ทั้งหมด ไม่มีข้อไหนขัดกัน:

| # | การตัดสินใจ | ผลต่อ architecture |
|---|---|---|
| 1 | Job = historical fact, snapshot Recipe ตอนสร้าง Job · Template แก้แล้ว Job เก่าไม่เปลี่ยนตาม | ยืนยัน `RecipeCopied` event (Deliverable 2 §1) ตรงตามนี้อยู่แล้ว — ไม่ต้องแก้ |
| 2 | Retired Template ห้ามสร้าง Job ใหม่ (default) · Job เก่า + Recipe snapshot ยังเปิดดู/ขาย/ตรวจย้อนหลังได้ | แก้ไข edge case #2 ของ Event Flow doc จาก "เปิดเป็นคำถาม" → "ปิดเป็นกฎ" (§10 ด้านล่าง) |
| 3 | ต่อรอง/แก้ราคาขายได้ระหว่าง Fulfilled → Sold · Cost freeze ที่ Fulfilled · Price/Margin freeze ที่ Sold · ห้าม recalculate ย้อนหลังด้วยต้นทุนปัจจุบัน | ตรงกับ Two-Stage Snapshot ที่ออกแบบไว้แล้วเป๊ะ (§6) — เป็นจุดเดียวที่ business decision "ยืนยัน" งานที่ทำไว้ก่อนแล้ว ไม่ใช่ต้อง rework |
| 4 | Cancel หลัง Fulfilled ได้ แต่ต้องคืนสต็อกผ่าน explicit reversal transaction (มี jobId/reference/SKU/qty/reason/actor/timestamp/audit) ห้ามแก้ transaction เดิมย้อนหลังแบบเงียบ + ป้องกัน double reversal | เป็น entity ใหม่ทั้งหมด — ไม่มี precedent ในโค้ดปัจจุบัน (ยืนยันด้วย grep แล้ว §5) ต้องออกแบบจากศูนย์ |
| 5 | Recipe เปลี่ยนระหว่าง Job กำลังจัด → Job เดิมใช้ snapshot เดิม ห้าม auto-sync · เปลี่ยนสูตรของ Job ต้องเป็น explicit Job-level change + audit trail | แก้ไข edge case #4 ของ Event Flow doc จาก "เสนอ" → "ยืนยัน" + เพิ่ม entity ใหม่ "Job-level Recipe Override" (§3) |

---

## 1. Aggregate Boundary Decision

ข้อเสนอเดิม (Domain Model doc §2) มี 3 aggregate: `Template`, `Job`, `Customer` — คุณถามให้ทวนว่าควรมี
`MTO Recipe Snapshot`, `MTO Fulfillment`, `Stock Transaction` เป็น aggregate แยกไหม ตรวจกับโค้ดจริงแล้ว:

| Aggregate ที่เสนอในคำถาม | ตัดสินใจ | เหตุผลผูกกับโค้ดจริง |
|---|---|---|
| **MTO Job** | ✅ Aggregate root (คงเดิม) | `SHEET_MTO_JOBS` เป็น root record เดียวที่ระบบทุกจุดอ้างด้วย `jobId` (`canSellMtoJob_`, `markMtoJobSold_`, `applyMtoFulfillment_` ทุกฟังก์ชันรับ `jobId` เป็นกุญแจหลัก) |
| **MTO Recipe Snapshot** | ❌ ไม่ใช่ aggregate แยก — เป็น **internal entity ของ Job** (`MaterialUsage[]`) | หลักฐาน: `applyMtoFulfillment_` (บรรทัด 13553-13622) เขียน `SHEET_MTO_ITEMS` **ภายใน transaction เดียวกับ**การหักสต็อกและปิดสถานะ Job — ไม่มี lifecycle ของตัวเองที่แยกจาก Job เลย (ไม่มีการสร้าง/แก้ MaterialUsage โดยไม่มี Job เป็นเจ้าของ) → invariant ผูกกับ Job เสมอ ตรงนิยาม "internal entity" ไม่ใช่ aggregate |
| **MTO Fulfillment** | ❌ ไม่ใช่ aggregate — เป็น **state transition ของ Job** (`status: "กำลังจัด"→"เสร็จแล้ว"`) ไม่ใช่ entity ที่มีตัวตนเอง | หลักฐาน: ไม่มีชีต/แถวที่แทน "Fulfillment" เป็น record ของตัวเอง — `closeMtoJob` (บรรทัด 13624) เขียนกลับเข้า `SHEET_MTO_JOBS` แถวเดิม (col G/H) ตรงๆ ไม่มี fulfillment record แยก การสร้าง aggregate แยกจะเป็นการสร้าง entity ที่ไม่มีข้อมูลจริงรองรับ |
| **MTO Sale/Billing** | ✅ ยืนยันเป็นคนละ Bounded Context (Domain Model doc §1) — ไม่ใช่ MTO aggregate | หลักฐานเพิ่มจากการตรวจรอบนี้: `createSaleBill` (บรรทัด 14331+) เขียน `SHEET_SALE_BILLS` ที่มี invariant ของตัวเอง (VAT, `billCid` idempotency, เลขใบกำกับจาก ZORT) — เชื่อม MTO ผ่าน `Job.saleRef`/`markMtoJobSold_` เท่านั้น ไม่ share ownership |
| **Stock Transaction** | ⚠️ **ไม่มีอยู่จริงในระบบปัจจุบัน** — ต้อง**สร้างใหม่**เป็น aggregate เล็ก (`StockReversal`) เฉพาะ MTO domain เท่านั้น ไม่ใช่ stock ledger เต็มระบบ | หลักฐาน: `applyMtoFulfillment_` เขียนทับ `SHEET_PRODUCTS` col `qtyWH`/`qtyFS` ด้วย `setValue(Math.max(0, cur - deduct))` ตรงๆ (บรรทัด 13576-13581) — เป็น **current-balance mutation ไม่ใช่ transaction log** ไม่มีแถวไหนแทน "การหักสต็อกครั้งนี้" เป็น record — grep ทั้งไฟล์หาคำว่า reversal/refund/cancel-stock ไม่พบ pattern แบบนี้เลยที่ไหนในระบบ (แม้แต่ `resetNegativeStock_` ก็เป็นแค่ clamp ค่าติดลบ ไม่ใช่ reversal ของ transaction ที่ระบุตัวได้) → **ตาม business decision #4 ต้องสร้าง entity นี้ใหม่ทั้งหมด ไม่มีของเดิมให้ reuse** |
| **Product Catalog** | ✅ อยู่นอก MTO domain ทั้งหมด — ZORT/`SHEET_PRODUCTS` เป็นเจ้าของ | Template อ้างถึง SKU ของ Catalog เพื่อประกอบ Recipe แต่ไม่ own ราคา/สต็อกของวัตถุดิบ (ตรงกับ Domain Model doc §1 "CATALOG/INVENTORY" context) |

**สรุป**: aggregate boundary เดิม (`Template` / `Job` / `Customer`) **ยืนยันว่าถูกต้องและครบ** — สิ่งที่ต้องเพิ่ม
คือ `StockReversal` เป็น aggregate เล็กที่ 4 (ไม่ใช่ "Stock Transaction" แบบเต็มระบบ) ขอบเขตแคบมาก: มีหน้าที่
เดียวคือบันทึกการคืนสต็อกของ MTO Job ที่ถูกยกเลิกหลัง fulfilled — ไม่ทะเยอทะยานเป็น general ledger ของทั้งร้าน

---

## 2. Entity Ownership Matrix

| ข้อมูล | Owner Entity | เก็บที่ (วันนี้/แผน) | ป้องกัน duplicate source of truth อย่างไร |
|---|---|---|---|
| Recipe (สูตรมาตรฐาน) | `Template` (ผ่าน `currentRecipeVersion`) | ใหม่ — ยังไม่มีชีตนี้วันนี้ (Phase 2B) | มีจุดเขียนเดียว: `RecipeVersionPublished` event เท่านั้น — Job ไม่เขียนกลับ Template เด็ดขาด |
| Recipe Snapshot (ต่องาน) | `Job` (ผ่าน `MaterialUsage[]`) | `SHEET_MTO_ITEMS` วันนี้ (col B-D) | copy ครั้งเดียวตอน `RecipeCopied` — หลังจากนั้น Job เป็นเจ้าของสำเนานี้เต็มตัว Template แก้ต่อไม่กระทบ |
| **Job-level Recipe Override** (ใหม่ — จาก business decision #5) | `Job` เช่นกัน (ไม่ใช่ entity แยก) | ใหม่ — field เพิ่มบน `MaterialUsage` row: `overriddenAt`/`overriddenBy`/`overrideReason` | เขียนได้เฉพาะช่วง `status="กำลังจัด"` (ก่อน fulfilled) เหมือน `MaterialPicked`/`MaterialReturned` ทุกประการ — **ไม่ใช่ endpoint ใหม่** เป็นแค่การแก้ `MaterialUsage.qty` ที่มี audit field เพิ่ม ต่างจาก `MaterialPicked` ปกติตรงที่บังคับกรอกเหตุผล |
| Cost Snapshot | `Job` (ผ่าน `JobSnapshot.actualCost`/`unitCostAtClose`) | ใหม่ — freeze ที่ `JobFulfilled` (Phase 2B) | เขียนครั้งเดียวตอน fulfilled แล้ว immutable — ไม่มีจุดอื่นเขียนทับ |
| Sale Price Snapshot | `Job` (ผ่าน `JobSnapshot.actualPrice`/`actualMargin`) | ใหม่ — freeze ที่ `JobSold` (Phase 2B) | เขียนครั้งเดียวตอนขาย แยกจาก Cost Snapshot คนละเวลาโดยตั้งใจ (ตรง business decision #3) |
| Stock Consumption (การเบิกจริง) | `Job` (ผ่าน `MaterialUsage`) | `SHEET_MTO_JOBS`+`SHEET_PRODUCTS` วันนี้ (บรรทัด 13561-13608) | ownership ชัดอยู่แล้ว — จุดเดียวที่หักคือ `applyMtoFulfillment_` |
| **Stock Reversal** (ใหม่) | `StockReversal` aggregate (แยกจาก `Job` แต่ reference `jobId`) | ใหม่ทั้งหมด (Phase 2C) — ดู §5 | entity ใหม่ ไม่มี owner เดิมให้ชนกัน — เป็นจุดเขียนเดียวของ "การคืนสต็อกของ MTO" |
| Billing reference | `Sale` (Billing context) — `Job` เก็บแค่ `saleRef` (ID) | `SHEET_MTO_JOBS` col L (`COL_MTO_SALE_REF`) ↔ `SHEET_SALE_BILLS` | Job **ไม่ copy** ยอดเงิน/VAT เข้ามา — อ่านต้องย้อนไปที่ Sale เสมอ (กัน 2 แหล่งความจริงเรื่องเงิน) |
| Report/audit reference | Read Model (query-only) — ไม่มี entity เป็นเจ้าของ | Derived จาก `JobSnapshot` ทุกใบที่ freeze แล้ว (Domain Model doc §7) | **ห้ามมี field ที่เขียนได้ในฝั่ง report เด็ดขาด** — ถ้าพบว่ามีคน "แก้ตัวเลขใน report" แปลว่ามันไม่ใช่ Read Model แล้ว ต้องแก้กลับไปที่ต้นทาง |

---

## 3. Logical Schema (ก่อน implementation — ไม่มี migration script)

หมายเหตุ: คอลัมน์ "วันนี้" = ชีต/field ที่มีอยู่จริงแล้ว, "ใหม่" = ยังไม่มี ต้องสร้างใน Phase ที่เกี่ยวข้อง

### `Template` (ใหม่ทั้งหมด — Phase 2A สร้างแค่โครง ยังไม่ผูก Recipe/Cost)

| Field | ประเภท | PK/FK | Immutable | Mutable | Snapshot | Audit |
|---|---|---|---|---|---|---|
| `templateId` | string (`TEMPLATE-0001`) | **PK** | ✅ (ตลอดชีพ) | | | |
| `currentSalesSku` | string | FK → Product Catalog (ZORT) | | ✅ | | |
| `name`, `category`, `suggestedPrice`, `image` | mixed | | | ✅ | | |
| `currentRecipeVersion` | int | FK → RecipeVersion.version | | ✅ (Phase 2B) | | |
| `status` | enum(`draft`/`active`/`retired`) | | | ✅ | | `TemplateRetired` event |
| `promoted` | boolean | | | ✅ | | |
| `createdAt`/`createdBy` | timestamp/string | | ✅ | | | ✅ |

### `Job` (วันนี้: `SHEET_MTO_JOBS` A-N, 14 คอลัมน์ + O=`jobSku` ที่วางแผนไว้ใน Migration Plan)

| Field | ประเภท | PK/FK | Immutable | Mutable | Snapshot | Audit |
|---|---|---|---|---|---|---|
| `jobId` (A) | string (`MTO-YYYYMM###`) | **PK** | ✅ | | | |
| `templateId` (**ใหม่ — Phase 2A**, คอลัมน์ P ต่อท้าย) | string | FK → Template | ✅ (ตั้งครั้งเดียวตอนสร้าง — business decision #1) | | | |
| `dateStr`/`jobName`/`customer`/`price`/`imageUrl` (B-F) | mixed | | | ✅ จนกว่า fulfilled | | |
| `status` (G) | enum(`กำลังจัด`/`เสร็จแล้ว`) | | | ✅ | | |
| `closedAt` (H) | timestamp | | ✅ (เขียนครั้งเดียว) | | | |
| `staffId`/`ชื่อผู้รับผิดชอบ` (I-J) | string | | | ✅ (ผ่าน `assignMtoJob`) | | ✅ (`writeAuditLog_`) |
| `saleStatus`/`saleRef`/`soldAt`/`saleBillCid` (K-N) | mixed | FK → Sale (billCid) | ✅ หลัง `JobSold` | ✅ ก่อนขาย | | |
| `jobSku` (O — วางแผนไว้ ยังไม่สร้าง) | string | FK → Catalog (ZORT SKU) | ✅ หลังขายจริง | ✅ ก่อนขาย | ✅ (`salesSkuAtSale`) | |
| `JobSnapshot.*` (**ใหม่ — Phase 2B**) | JSON blob หรือคอลัมน์แยก | | ✅ ทั้งก้อนหลัง freeze | | ✅ (ดู §6) | |

### `MaterialUsage` (วันนี้: `SHEET_MTO_ITEMS`, 8 คอลัมน์)

| Field | ประเภท | PK/FK | Immutable | Mutable | Snapshot | Audit |
|---|---|---|---|---|---|---|
| `jobId` (A) | string | FK → Job | ✅ | | | |
| `sku`/`name` (B-C) | string | FK → Catalog | | ✅ ก่อน fulfilled | | |
| `qty`/`คลัง`/`returnedQty`/`net` (D-G) | number/string | | ✅ หลัง fulfilled | ✅ ก่อน fulfilled | ✅ `actualMaterials` | |
| `closedAt` (H) | timestamp | | ✅ เขียนครั้งเดียว | | | |
| `overriddenAt`/`overriddenBy`/`overrideReason` (**ใหม่ — ผลจาก business decision #5**) | timestamp/string/string | | ✅ (append เท่านั้น) | | | ✅ |

⚠️ **หลักฐานสำคัญที่พบระหว่างตรวจ**: วันนี้ `applyMtoFulfillment_` (บรรทัด 13592-13598) **ลบแถว draft
(closedAt ว่าง) ของ job นั้นทิ้งก่อนเขียนแถวจริง** ("ลบแถว draft ... กันวัตถุดิบซ้ำถ้าเคยกด บันทึก ไว้")
— นี่คือ pattern "mutable จนกว่าจะ fulfilled แล้วเขียนทับ" ตรงกับ invariant ที่ Domain Model doc ประกาศไว้
อยู่แล้ว (§3 "MaterialUsage แก้ไขได้เฉพาะตอน status=กำลังจัด") **ไม่ต้องแก้ pattern นี้เลย** — แค่เพิ่ม field
override ข้างบนเข้าไปในแถวเดิม

### `StockReversal` (ใหม่ทั้งหมด — Phase 2C, ตาม business decision #4)

| Field | ประเภท | PK/FK | Immutable | หมายเหตุ |
|---|---|---|---|---|
| `reversalId` | string (`REV-YYYYMM###`) | **PK** | ✅ | pattern เดียวกับ `jobId`/`MTO-YYYYMM###` |
| `jobId` | string | FK → Job | ✅ | บังคับ (ตามที่คุณระบุ) |
| `referenceTransaction` | string | FK → การหักสต็อกครั้งเดิม (`jobId` + `closedAt` ของ fulfillment) | ✅ | ระบุว่า "แก้อันไหน" — ดู double-reversal guard ด้านล่าง |
| `componentSku` | string | FK → Catalog | ✅ | ต่อบรรทัด (1 reversal อาจมีหลายบรรทัดถ้าคืนหลาย SKU) |
| `quantity` | number | | ✅ | ต้อง ≤ qty ที่หักไปจริงต่อ SKU นั้น (validate ตอนเขียน) |
| `reason` | string | | ✅ | บังคับกรอก ไม่มี default |
| `actor` | string | จาก session เสมอ (ตาม convention ทั้งระบบ — CLAUDE.md "ใครสั่ง/ใครจัด/ใครรับ") | ✅ | ห้ามรับจาก `data.actor` ดิบ |
| `timestamp` | datetime | | ✅ | text format กัน Sheets แปลงวันที่ (บทเรียนข้อ 2 ของ repo) |
| `auditTrail` | ผ่าน `writeAuditLog_` ตัวเดิมของระบบ (ไม่ใช่ field แยกในชีตนี้) | | | | สอดคล้องกับทุก write path อื่นในระบบ ไม่สร้าง audit mechanism คู่ขนาน |

**Double-reversal prevention (ออกแบบใหม่ — ไม่มีของเดิม reuse)**: เพิ่ม field `reversalStatus`
(`none`/`reversed`) บน **`MaterialUsage` row เดิม** (ไม่ใช่บน `StockReversal`) — เพราะสิ่งที่ต้องกันซ้ำคือ
"บรรทัดการเบิกเส้นนี้ถูกคืนไปแล้วหรือยัง" ไม่ใช่ "reversal ใบนี้ถูกสร้างซ้ำไหม" (สอง invariant ต่างกัน) ก่อน
เขียน `StockReversal` ใหม่ ต้องเช็ค `MaterialUsage.reversalStatus !== "reversed"` **ในล็อกเดียวกับที่เขียน**
(หลักการเดียวกับ `LockService` ที่ `closeMtoJob`/`transferStockBatch` ใช้อยู่แล้วทั้งระบบ — ไม่ใช่ pattern ใหม่
แค่ apply กับ entity ใหม่)

---

## 4. State / Lifecycle Model

### Template
```
draft ──▶ active ──▶ retired
                        │
                        └─ (ตาม decision #2) ห้ามสร้าง Job ใหม่จากสถานะนี้ default
                           Job เก่าที่มี templateId ชี้มาที่นี่ยังอ่าน/ขาย/ตรวจสอบได้เสมอ
                           (เพราะ Job ไม่ query สถานะ Template ตอน "อ่าน" — query แค่ตอน "สร้างใหม่")

promoted: boolean ── คู่ขนาน ไม่ใช่ state (ตั้งได้ทุก status)
```

### Job — สอง state machine อิสระ (ของเดิม F1 คงไว้ 100%)
```
fulfillment: กำลังจัด ──▶ เสร็จแล้ว (immutable หลังจากนี้ ยกเว้น reversal ที่มาแก้ทีหลัง)
                              │
saleStatus:  ยังไม่ขาย ───────┴──▶ ขายแล้ว
                 │
                 └──▶ ยกเลิก (ก่อน fulfilled = ปลอดภัย, ไม่กระทบสต็อก)

NEW sub-state (business decision #4):
เสร็จแล้ว + ยกเลิกหลัง fulfilled ──▶ ต้องมี ≥1 StockReversal record ที่ jobId ตรงกัน
                                      ก่อนถือว่า "ยกเลิกสมบูรณ์" (ไม่ใช่แค่เปลี่ยน status)
```

⚠️ **ข้อสังเกตสำคัญ**: การยกเลิกหลัง fulfilled **ไม่ใช่การเปลี่ยน `saleStatus` เฉยๆ** อีกต่อไป — ต้องผูกกับ
การมี `StockReversal` record จริง มิฉะนั้นจะเกิดสถานะ "ยกเลิกแล้วแต่สต็อกไม่เคยถูกคืน" ซึ่งเป็นสิ่งที่ business
decision #4 ห้ามไว้ตรงๆ ("ห้ามแก้ stock ... แบบเงียบๆ") — นี่คือ invariant ใหม่ที่ต้องบังคับตอน implement
Phase 2C ไม่ใช่แค่ UI แนะนำ

---

## 5. Stock Consumption & Reversal Model

**สถานะปัจจุบัน (ยืนยันด้วยโค้ด ไม่ใช่สมมติฐาน)**:
- `applyMtoFulfillment_` (บรรทัด 13561-13587) หักสต็อกด้วย `setValue(Math.max(0, cur - deduct))` ตรงๆ
  บน `SHEET_PRODUCTS` — เป็น **current-balance mutation** ไม่มี transaction log แยก
- `decreaseMtoStockInZort_` หักสต็อกฝั่ง ZORT คู่ขนาน — ล้มเหลว → `logZortFailure_` เขียนลง
  `SHEET_ZORT_FAILED` (บรรทัด 12919) **ไม่ retry อัตโนมัติ ไม่ reconcile อัตโนมัติ** เป็นแค่ log ให้คนไปดูเอง
- grep ทั้งไฟล์หา reversal/refund/คืนสต็อกของ MTO **ไม่พบ pattern นี้ที่ไหนในระบบเลย** — แม้แต่
  `resetNegativeStock_` (บรรทัด 3354) ก็เป็นแค่ clamp ค่าติดลบกลับเป็น 0 ไม่ใช่การคืนสต็อกอ้างอิง
  transaction ที่ระบุตัวได้

**Reversal Model ที่ออกแบบ (Phase 2C — ยังไม่ implement)**:

```
JobCancelled (หลัง fulfilled)
   │
   ▼
สำหรับแต่ละ MaterialUsage row ของ jobId นี้ที่ reversalStatus != "reversed":
   1. เขียน StockReversal record (jobId, referenceTransaction, componentSku,
      quantity ≤ ที่หักไปจริง, reason, actor จาก session, timestamp)
   2. คืนสต็อกกลับ SHEET_PRODUCTS: setValue(cur + quantity)  ← บวกกลับ ไม่ใช่ setValue ค่าตายตัว
      (สมมาตรกับ applyMtoFulfillment_ ที่ลบ ไม่ใช่ตั้งค่าใหม่)
   3. คืนสต็อกฝั่ง ZORT — ต้องมี increaseMtoStockInZort_ (Phase 2C, ยังไม่มี — เขียนแบบ
      สมมาตรกับ decreaseMtoStockInZort_ ที่มีอยู่แล้ว, ใช้ endpoint กลุ่มเดียวกัน
      /Product/UpdateProductAvailableStockList หรือ /Product/DecreaseProductStockList
      แบบค่าติดลบ — ต้องยืนยัน field จริงกับ ZORT ก่อน ไม่เดา ตาม CLAUDE.md convention)
   4. mark MaterialUsage.reversalStatus = "reversed"  ← ป้องกัน double reversal
   5. writeAuditLog_ ("คืนสต็อก MTO ยกเลิก", jobId, ...)
```

⚠️ **ข้อ 3 (ฝั่ง ZORT) เป็นความเสี่ยงที่ต้องตรวจก่อน implement จริง** — `decreaseMtoStockInZort_`
เป็นฟังก์ชันที่ยืนยันแล้วว่าใช้งานได้ (F1 production-proven) แต่ยังไม่เคยมีการยืนยันว่า ZORT มี endpoint
"คืนสต็อก" ที่สมมาตรกันจริง — ต้อง explore เหมือนที่ระบบเคย explore endpoint อื่นๆ มาก่อน (ไม่ใช่เดาว่า
เรียก DecreaseProductStockList ด้วยค่าติดลบแล้วจะได้ผลตรงข้ามเสมอ) — **นี่คือ open risk ไม่ใช่ blocker
ของ Phase 2A** เพราะ Phase 2A ไม่แตะเรื่องนี้เลย

**ทำไมไม่ใช่ "duplicate stock ledger"**: `StockReversal` ไม่ใช่แหล่งความจริงเรื่องยอดคงเหลือ (ยอดคงเหลือ
ยังอยู่ที่ `SHEET_PRODUCTS` cache + ZORT source-of-truth เหมือนเดิมทุกประการ) — มันเป็นแค่ **audit/event
record ว่าเกิดการแก้ไขอะไรไปบ้าง** เหมือนที่ `writeAuditLog_` ทำอยู่แล้วทั่วระบบ ต่างกันแค่ `StockReversal`
มี schema เฉพาะทาง (SKU/qty/reason ที่ query กลับมาใช้ตรวจสอบได้ง่ายกว่า JSON blob ใน audit log ทั่วไป)

---

## 6. Two-Stage Snapshot Model

ส่วนนี้**ไม่มีอะไรต้องแก้** — business decision #3 ที่คุณอนุมัติ ("Cost Snapshot freeze ตอน JobFulfilled,
Sale Price/Margin Snapshot freeze ตอน JobSold, ห้าม recalculate ย้อนหลัง") **ตรงกับสิ่งที่ออกแบบไว้แล้ว
ใน Event Flow doc (§1 "⭐ JobFulfilled — Snapshot ระยะที่ 1" และ "⭐ JobSold — Snapshot ระยะที่ 2")
เป๊ะทุกคำ** — เป็นจุดเดียวในรอบนี้ที่ business decision เป็นการ **ยืนยัน** งานที่ทำไว้ก่อนหน้า ไม่ใช่
สั่งให้ rework

สรุปสั้นๆ (รายละเอียดเต็มอยู่ใน Event Flow doc, ไม่ copy ซ้ำที่นี่):
- **Freeze ระยะ 1** (`JobFulfilled`): `recipeVersionUsed`, `templateNameAtClose`, `actualMaterials[]`,
  `unitCostAtClose[]`, `actualCost`, `arrangeTimeMin`, `designer`
- **Freeze ระยะ 2** (`JobSold`): `salesSkuAtSale`, `actualPrice`, `actualMargin`
- เหตุผลที่แยก 2 จุด (ไม่ใช่จุดเดียว): ต้นทุนต้องสะท้อน **ราคาวัตถุดิบ ณ วันที่ใช้จริง** ไม่ใช่ ณ วันที่ขาย
  ถ้างานจัดไว้ล่วงหน้าแล้วรอลูกค้ามารับหลายวัน ราคาวัตถุดิบอาจขยับไปแล้ว

⚠️ **ยังติดกำแพงเดิมที่ไม่เกี่ยวกับ architecture**: `unitCostAtClose` ต้องใช้ต้นทุนจริง แต่ PO ทุกใบใน ZORT
`pricepernumber=0` (ไม่มีใครกรอกราคาตอนสร้าง PO) — เป็น **process problem ไม่ใช่ architecture problem**
(สรุปเดิมจาก Design Review รอบก่อน ยังไม่เปลี่ยน) — schema ออกแบบให้รองรับ field นี้ได้แล้ว แค่ค่าจะเป็น 0/
ไม่สมบูรณ์จนกว่าเจ้าของจะแก้กระบวนการกรอกราคาที่ต้นทาง

---

## 7. Google Sheets Boundary

| ข้อมูล | อยู่ที่ไหนวันนี้ | Target | เหตุผล |
|---|---|---|---|
| ยอดคงเหลือวัตถุดิบ (stock balance) | `SHEET_PRODUCTS` (cache) ↔ ZORT (truth) | **คงเดิม** — ไม่สร้าง ledger ซ้ำ | ตาม CLAUDE.md ("ZORT = source of truth", `syncZortBoth` sync ทุก 2 ชม.) — `StockReversal` (§5) ไม่ใช่แหล่งยอดคงเหลือ เป็นแค่ audit record |
| Template/RecipeVersion | ยังไม่มี | **Google Sheets ใหม่** (Phase 2A/2B) ไม่ใช่ ZORT | ZORT ไม่มี concept "สูตร/ประเภทงาน" เป็นแค่ catalog SKU — Template เป็นแนวคิดของ DMJ domain ล้วนๆ |
| Job + MaterialUsage | `SHEET_MTO_JOBS`/`SHEET_MTO_ITEMS` | **คงเป็น Google Sheets** | เป็น operational write model ที่ transaction เล็ก (1 job ≈ ไม่กี่แถว) เหมาะกับ Sheets ตาม pattern เดิมทั้งระบบ |
| StockReversal | ยังไม่มี | **Google Sheets ใหม่** (Phase 2C) | เหตุผลเดียวกับ Job — เขียนน้อย อ่านเฉพาะทาง ไม่ต้อง join ซับซ้อน |
| Sale/Billing (VAT, เลขใบกำกับ) | `SHEET_SALE_BILLS` ↔ ZORT (เลขที่เอกสารทางการ) | **คงเดิม** | ZORT เป็นเจ้าของความจริงเรื่องภาษี/เอกสารทางการอยู่แล้ว (ยืนยันจาก Migration Plan §0 — `AddOrder`/`Document/AddDocumentOrder`) |
| Cost/Price ต้นทุนวัตถุดิบ | ไม่มีที่เก็บจริง (`COST_RATIO=0.8` เป็นค่าสมมติ) | **ZORT PurchaseOrder** ควรเป็นเจ้าของ (แต่ข้อมูลว่างเปล่าจริงในทางปฏิบัติ) | ไม่ใช่ปัญหา architecture — เป็นปัญหา data entry ที่ต้นทาง (ซ้ำกับ §6) |
| Report/KPI (top material, margin, ฯลฯ) | ยังไม่มี | **Derived/Read Model** — query จาก `JobSnapshot` เมื่อต้องใช้ ไม่ persist แยก (Phase 3 ค่อยพิจารณา materialize) | ตรงกับ Domain Model doc §7 — กัน "รายงานเพี้ยนเพราะข้อมูลสองชุดไม่ sync กัน" |

**คำตอบตรงต่อคำถาม "อะไรควรอยู่ใน Zort / Sheets / application / derived"**:
- **ZORT**: ยอดคงเหลือวัตถุดิบจริง, เอกสารภาษี/ใบกำกับ, ราคาต้นทุน PO (เมื่อมีข้อมูลจริง)
- **Google Sheets**: Template/RecipeVersion, Job/MaterialUsage, StockReversal — ทุกอย่างที่เป็น "domain
  write model" ของ MTO ที่ ZORT ไม่มี concept รองรับ
- **Application (GAS logic)**: state machine transitions (`canSellMtoJob_`-equivalent), idempotency
  guards, lock coordination — ไม่มี field ใหม่ต้องเก็บ เป็น behavior ล้วนๆ
- **Derived/Read Model**: ทุกอย่างที่เป็นตัวเลขสรุป/รายงาน — **ไม่มี field ไหนใน list นี้ควรมีปุ่ม "แก้"
  ในหน้าเว็บเด็ดขาด** ถ้าพบว่าต้องแก้ แปลว่า field นั้นไม่ใช่ Read Model จริงๆ

---

## 8. Future Database Migration Strategy

แยก 3 ชั้นตามที่ขอ — ออกแบบให้ **Domain Model ไม่ผูกกับ Google Sheets เลย** (ทำได้แล้วจริงในเอกสารนี้และ
Deliverable 1/2 เพราะเขียนเป็น aggregate/entity/event ไม่ใช่ "คอลัมน์ A ของชีต X"):

```
┌─────────────────────────────────────────────────────────┐
│ DOMAIN MODEL  (Deliverable 1/2 + เอกสารนี้)                │
│ Template / RecipeVersion / Job / MaterialUsage /          │
│ StockReversal / Customer — ประกาศเป็น entity+invariant     │
│ ล้วนๆ ไม่มี "col A/col B" ปนอยู่เลย                          │
└──────────────────────┬──────────────────────────────────┘
                        │ mapping (เอกสารนี้ §3 คือตัวนี้)
                        ▼
┌─────────────────────────────────────────────────────────┐
│ PERSISTENCE MODEL  (วันนี้ = Google Sheets)                │
│ SHEET_MTO_JOBS / SHEET_MTO_ITEMS / (ใหม่) SHEET_TEMPLATE / │
│ SHEET_RECIPE_VERSION / SHEET_STOCK_REVERSAL                │
│ ── ย้ายไป Postgres/Supabase ในอนาคต = แก้แค่ชั้นนี้ ──         │
└──────────────────────┬──────────────────────────────────┘
                        │ query/derive
                        ▼
┌─────────────────────────────────────────────────────────┐
│ READ MODEL  (Dashboard/Report — §7 บนสุด)                  │
│ ── ย้าย/cache/materialize อิสระจาก Persistence Model ──      │
└─────────────────────────────────────────────────────────┘
```

**ทำไม migration ในอนาคตจะไม่ต้องแก้ business logic**: เพราะ §3 (Logical Schema) ระบุ PK/FK/immutable/
mutable/snapshot/audit แยกชัดต่อ entity อยู่แล้ว — การย้าย persistence เป็นแค่การแปลง "แถว Sheets" →
"แถว Postgres table" ตาม schema เดิม ตัว business logic (invariant: "MaterialUsage แก้ได้ก่อน fulfilled
เท่านั้น", "Template retired ห้ามสร้าง Job ใหม่" ฯลฯ) เป็นกฎที่อยู่ใน GAS layer (application logic) ซึ่งไม่ผูก
กับว่าเก็บข้อมูลใน Sheets หรือ DB — ย้ายฐานข้อมูลแล้ว logic เดิมยังเรียกผ่าน adapter ใหม่ได้โดยไม่ต้องเขียน
ใหม่

**อ้างอิงทิศทางที่มีอยู่แล้ว**: branch `claude/supabase-backup-strategy` เป็นทิศทางที่เคยถูกพิจารณาไว้ก่อน
รอบนี้ — schema ในเอกสารนี้ออกแบบให้เข้ากันได้กับทิศทางนั้น (ไม่ใช่แนวทางใหม่ที่ขัดกัน) แต่ **ยังไม่ได้ไป
ตรวจ diff ของ branch นั้นในรอบนี้** (นอก scope ที่ขอ — ระบุไว้ตรงๆ ว่ายังไม่ตรวจ ไม่ใช่บอกว่าตรงกันแน่นอน)

**Read Model แยกจาก Persistence Model ตั้งแต่ต้น** (ตาม Domain Model doc §7) — แปลว่าต่อให้ Persistence
Model ยังเป็น Sheets ต่อไปอีกหลายปี Read Model ก็ **cache/materialize ไปที่อื่นได้ก่อน** (เช่น ทำ Supabase
เฉพาะฝั่งรายงานก่อน โดย Write Model ยังเป็น Sheets) — นี่คือประโยชน์เชิงรูปธรรมของการแยก 2 model ตั้งแต่
Deliverable 1

---

## 9. LINE Notification Architecture Review

**ขอบเขต**: ตรวจ code evidence เท่านั้น — ไม่เสนอ fix ไม่แก้โค้ด เสนอ target architecture เท่านั้นตามที่สั่ง

### 9.1 สำรวจจุดส่ง LINE ทั้งหมด (grep ยืนยันครบทุกจุดใน `appsscript_complete.gs`)

มี **2 เส้นทางคู่ขนานที่ไม่ประสานกัน**:

**เส้นทาง A — ผ่านคิว (Queued path)**: `linePush_` (บรรทัด 11768) ← `enqueueNoti_`/`notiSendDirect_`
(11864/11898) ← `drainNotiQueue` (11923) — มี retry/backoff/dedup/dead-letter (บางส่วน ดู 9.2)
- Call sites: `sendLineGroupOrderCard_` (12129, ออเดอร์ใหม่), `pushOrderBatch_` (11804, สรุป/order),
  `sendPendingTruckOrders` (12147, รอบขึ้นรถ), `createStockCheckRequest_` ส่วน in-app (ไม่ใช่ LINE)

**เส้นทาง B — ส่งตรง (Bypass path)**: `sendLineMessage_`/`sendLineGroup_`/`sendLineGroupMentionAll_`
(บรรทัด 12056/12075/12086) + raw `UrlFetchApp.fetch` ตรงๆ ใน `testTruckNotification` (12229, 12255)
— **ไม่มี retry, ไม่มี backoff, ไม่มี dedup, ไม่มี dead-letter, ไม่นับ quota เลย**
- Call sites: บรรทัด 2282 (ping ทดสอบบอท), 7076 (try/catch กลืน error), **13704 (`closeMtoJob` —
  แจ้งเตือนตอนปิดงาน MTO)**, 8027/8150 (สรุปสต็อกต่ำ/health check), 8428 (try/catch กลืน error),
  15531 (`createStockCheckRequest_` — คำขอเช็คสต็อก, try/catch กลืน error)

⚠️ **ข้อค้นพบสำคัญที่สุดของ section นี้**: **`closeMtoJob` — event `JobFulfilled` ของโดเมน MTO เอง — ใช้
เส้นทาง B (bypass) ที่บรรทัด 13704** ไม่ผ่านคิวเลย ห่อแค่ `try/catch` เปล่าๆ (บรรทัด 13688,13705-13707)
ที่ทำแค่ `Logger.log` แล้วปล่อยผ่าน — ถ้า LINE ตอบ error ใดๆ ก็ตาม **ข้อความหายไปเงียบๆ ไม่มีทางรู้เลย
นอกจากไปเปิด Execution log ของ GAS เอง**

### 9.2 ตอบคำถามที่ถามเป็นข้อๆ

| คำถาม | คำตอบจากหลักฐานโค้ด |
|---|---|
| มีกี่จุดส่ง LINE ทั้งหมด | **≥13 call site**, แบ่ง 2 เส้นทาง (A=4 call site, B=9 call site) |
| จุดไหนใช้ `linePush_` ร่วม | เฉพาะเส้นทาง A (ผ่าน `enqueueNoti_`/`drainNotiQueue`) |
| จุดไหน bypass common error handling | เส้นทาง B ทั้งหมด (9 จุด) รวม **`closeMtoJob`** ซึ่งเป็น event ของ MTO เอง |
| มี retry/backoff ไหม | **เฉพาะเส้นทาง A**: `drainNotiQueue` (11923) ทำ exponential backoff (2^attempts นาที, cap 15) + quota backoff 30 นาที (บรรทัด 12016-12028) — เส้นทาง B **ไม่มีเลย** |
| มี error classification ไหม | **มีแค่ 2 กลุ่ม**: `code===429` หรือ body มีคำว่า quota/limit/exceed → `quota:true` (บรรทัด 11779) ส่วนที่เหลือทั้งหมด (รวม **400 Bad Request**) ถูกจัดเป็นกลุ่มเดียวกับ error ทั่วไป → ได้ backoff แบบ transient เหมือนกัน **ทั้งที่ 400 มักเป็น permanent failure (payload ผิดรูปแบบ) ที่ retry เท่าไหร่ก็ไม่มีทางสำเร็จ** — เสีย attempt โดยเปล่าประโยชน์ถึง `NOTI_MAX_ATTEMPTS` (default 6) ครั้งก่อนจะถูก mark `failed` |
| มี dead-letter/failed state ไหม | **มี primitive แต่ไม่มีคนดู**: แถวที่ครบ `maxAttempts` ถูก mark `status='failed'` + `lastError` (บรรทัด 12020-12022) ค้างอยู่ใน `SHEET_NOTI_QUEUE` — **ไม่มีจุดไหนอ่าน/แจ้งเตือนแถว `failed` เหล่านี้เลย** เป็น dead-letter ที่ไม่มีใครเฝ้า (silent dead-letter) — `cleanupNotiQueue_` (12038) แค่ลบทิ้งหลัง 7 วันโดยไม่มีใครได้เห็น |
| retry ได้โดยไม่ duplicate ไหม | **ขึ้นกับ call site**: `sendPendingTruckOrders` ผูก `dedupKey` ตายตัว (วันที่+ช่วงเวลา, บรรทัด 12177) ปลอดภัย · **`sendLineGroupOrderCard_` (order card) ไม่ส่ง `dedupKey` เลย** (บรรทัด 12130-12133) — เรียกซ้ำ (เช่น client retry เพราะ network timeout) จะ enqueue ซ้ำได้จริง · เส้นทาง B ไม่มี concept dedup อยู่แล้วเพราะไม่ผ่านคิว |

### 9.3 ความเชื่อมโยงกับ finding เดิม `linePush_primary 400`

จากหลักฐาน: โค้ด `channel='primary'` **มีเฉพาะในเส้นทาง A** (`sendLineGroupOrderCard_`,
`pushOrderBatch_` ที่ถูกเรียกจากหลายจุด, `sendPendingTruckOrders`) เพราะ `linePush_(channel, ...)` เป็น
low-level function ที่มีแต่เส้นทาง A เรียกตรงๆ — สรุปได้ว่า finding นี้เกิดจาก **เส้นทาง A** ไม่ใช่เส้นทาง B
(เส้นทาง B ไม่มี concept "channel" เลย ส่งไป `LINE_GROUP_ID`/`LINE_USER_ID` ตรงๆ)

โค้ด 400 ที่เกิดขึ้นจริงเข้าเงื่อนไข "error ทั่วไป" (ไม่ใช่ 429) → ได้ backoff แบบ transient ตาม §9.2 →
เสีย attempt ไปเปล่าๆ ก่อนตกไปเป็น dead-letter ที่ไม่มีใครเห็น — **root cause ที่แท้จริงของ "ทำไม 400"
(payload อะไรผิดรูป — ข้อความยาวเกิน/mention index ผิด/target invalid ฯลฯ) ยังตรวจไม่ได้จากรอบนี้**
เพราะต้องดู `lastError`/payload จริงในแถวที่ fail ซึ่งไม่มีสิทธิ์เข้าถึง Google Sheets/Script Properties
โดยตรงในเซสชันนี้ (ข้อจำกัดเดียวกับที่เจอตอน Production Smoke Test รอบก่อน) — สิ่งที่ยืนยันได้แน่นอนคือ
**สถาปัตยกรรมปัจจุบันไม่มีทางแยกแยะ "ผิดแบบถาวร (400)" กับ "ผิดชั่วคราว (5xx/network)" ได้เลย** ซึ่งเป็น
ช่องโหว่ทางสถาปัตยกรรมที่ควรแก้ไม่ว่า root cause ของ 400 ตัวนั้นจะเป็นอะไรก็ตาม

### 9.4 Target Architecture (ออกแบบเท่านั้น — ไม่ implement รอบนี้)

1. **รวมเป็นเส้นทางเดียว** — เลิกใช้เส้นทาง B ทั้งหมด (`sendLineMessage_`/`sendLineGroup_`/
   `sendLineGroupMentionAll_` + raw fetch ใน `testTruckNotification`) ให้ทุกจุดผ่าน `enqueueNoti_`
   รวมถึง **`closeMtoJob`** ซึ่งเป็นจุดเสี่ยงสุดเพราะเป็น event ของ MTO domain เอง
2. **แยก error class**: `429`/`5xx`/network exception = retryable (backoff เดิม) · `4xx` อื่นๆ (400/401/
   403/404) = permanent → ไม่ retry, mark `failed` ทันที ไม่เสีย attempt โดยเปล่าประโยชน์
3. **ทำให้ dead-letter มีคนเห็นจริง** — แถว `failed` ควรยิงเข้ากระดิ่งแจ้งเตือนในแอป (`pushInappNoti_`
   audience `role:owner,dev`) แทนที่จะนอนเงียบอยู่ในชีตจนถูก `cleanupNotiQueue_` ลบทิ้งโดยไม่มีใครเห็น
4. **บังคับ `dedupKey` สำหรับ event ที่ผูกกับ aggregate transition** (Job/Sale events) เป็นข้อกำหนด/
   convention ไม่ใช่ optional พารามิเตอร์เหมือนวันนี้ — โดยเฉพาะ `sendLineGroupOrderCard_` ที่ตอนนี้
   ไม่มี `dedupKey` เลยทั้งที่เป็น business event สำคัญ

⚠️ **ย้ำ**: ทั้ง 4 ข้อนี้เป็น**ข้อเสนอสถาปัตยกรรมเป้าหมาย** ไม่ใช่แผนงานที่อนุมัติให้ทำ — ไม่มีการแก้ไฟล์
`appsscript_complete.gs` ในรอบนี้แม้แต่บรรทัดเดียว ตาม hard constraint

---

## 10. Open Decisions / Risks

### แก้ไขสถานะ 4 edge case จาก Event Flow doc §3 (ผลจาก business decisions รอบนี้)

| # | Edge Case เดิม | สถานะใหม่ | สิ่งที่เหลือเป็น "รายละเอียดการ implement" (ไม่ใช่ "การตัดสินใจที่ยังเปิด") |
|---|---|---|---|
| 1 | ยกเลิกหลัง fulfilled คืนสต็อกไหม | ✅ **ตัดสินแล้ว** (decision #4) | ต้องยืนยัน ZORT reversal endpoint ก่อน implement จริง (§5) — เป็น technical unknown ไม่ใช่ business decision ที่ค้าง |
| 2 | สร้าง Job จาก Template retired ได้ไหม | ✅ **ตัดสินแล้ว** (decision #2 — ห้าม default) | ยังต้องออกแบบ UI ข้อความปฏิเสธ (Phase 2A/2B, เล็กน้อย) |
| 3 | ราคาต่อรองใหม่ได้ไหมระหว่าง fulfilled→sold | ✅ **ตัดสินแล้ว** (decision #3 — ได้, freeze คนละช่วง) | Two-Stage Snapshot ออกแบบรองรับแล้ว (§6) ไม่มีงานเหลือด้าน design |
| 4 | RecipeVersion ใหม่ระหว่าง Job กำลังจัด | ✅ **ตัดสินแล้ว** (decision #5 — ค้าง snapshot เดิม + Job-level override ต้องมี audit) | schema field `overriddenAt/By/Reason` ออกแบบแล้ว (§3) พร้อม implement ตอนถึง phase ที่เกี่ยวข้อง |

**สรุป**: รอบนี้ **ปิด edge case ทั้ง 4 ข้อที่ค้างมาตั้งแต่ Design Review รอบก่อนได้ครบ** — สิ่งที่เหลือทั้งหมด
เป็น "รายละเอียดทาง technical" ที่รอ phase ที่เกี่ยวข้องมาถึง ไม่ใช่ "การตัดสินใจทางธุรกิจที่ยังไม่มีคำตอบ"

### Risk/Unknown ใหม่ที่พบระหว่างตรวจรอบนี้ (ยังไม่มีคำตอบ — ต้องตรวจก่อน phase ที่เกี่ยวข้อง)

| # | ประเด็น | กระทบ phase ไหน | หมายเหตุ |
|---|---|---|---|
| A | ZORT มี endpoint คืนสต็อก (reversal) ที่สมมาตรกับ `decreaseMtoStockInZort_` จริงหรือไม่ | Phase 2C (Reversal) | ต้อง explore endpoint ก่อน ห้ามเดา (ตาม convention repo) |
| B | `NOTI_QUEUE_ENABLED` เปิดอยู่ใน production จริงหรือไม่วันนี้ | Phase LINE consolidation | ไม่มีสิทธิ์เข้า Script Properties จากเซสชันนี้ — ตรวจไม่ได้ตรงๆ |
| C | root cause ที่แท้จริงของ 400 (payload อะไรผิดรูป) | Phase LINE consolidation | ต้องอ่าน `lastError`/`payload` จากแถว `failed` จริงใน `SHEET_NOTI_QUEUE` ซึ่งต้องมีคนเปิด Google Sheets ให้ดู |
| D | ต้นทุนวัตถุดิบจริง (PO price=0) | Phase 2B (Cost Snapshot) | **ไม่ใช่ปัญหาใหม่** — สรุปเดิมจาก Design Review รอบก่อนยังคงอยู่ ระบบยังคำนวณ `actualCost`/margin จริงไม่ได้จนกว่าเจ้าของจะแก้กระบวนการกรอกราคาที่ต้นทาง |
| E | double-reversal guard field (`MaterialUsage.reversalStatus`) ต้องผ่าน schema migration บนชีตเดิม (append column) | Phase 2C | ตาม convention repo ("ต่อท้ายเท่านั้น ห้ามแทรกกลาง") — ระบุไว้แล้วใน §3 ไม่ใช่ unknown แต่เป็นงานที่ต้องทำตอนถึง phase นั้น |

---

## 11. Phase 2A Readiness Verdict

**ขอบเขตของ Phase 2A ตามที่คุณกำหนดไว้ตรงๆ**: เชื่อม `Job → Template` เท่านั้น (`templateId` FK บน
`SHEET_MTO_JOBS`) — **"ยังไม่แตะ Recipe Version ยังไม่แตะ Cost Snapshot และยังไม่แตะ Analytics"**

ตรวจแล้วพบว่า:
- Aggregate boundary (§1) ยืนยันชัดว่า `Template` เป็น aggregate ที่แยกออกจาก `Job` ได้สะอาด — การเพิ่ม
  `templateId` เป็น FK เดียวไม่ทำให้ 2 aggregate ชนกัน
- Entity ownership (§2) ไม่มีจุดไหนที่ `templateId` จะกลายเป็น duplicate source of truth
- Schema (§3) ของ `Template` และ `Job.templateId` ออกแบบไว้ชัดแล้ว รวม field `status`/`retired` ที่
  Phase 2A ต้อง**เช็คแต่ยังไม่ต้อง implement เต็มระบบ** (แค่ precondition ตอนสร้าง Job ใหม่: ถ้า
  `templateId` ที่เลือกมี `status="retired"` → ปฏิเสธตาม decision #2)
- Edge cases ทั้ง 4 ข้อที่เคยเปิดค้างถูกปิดครบแล้ว (§10) — ไม่มีการตัดสินใจทางธุรกิจที่ยังขาดสำหรับงานใน
  ขอบเขต Phase 2A โดยเฉพาะ
- Risk A/B/C/D/E ทั้งหมดใน §10 **ไม่กระทบ Phase 2A** — เป็น risk ของ Phase 2C (Reversal) และ LINE
  consolidation (แยกงานคนละก้อน) ล้วนๆ

### `READY FOR PHASE 2A`

**เงื่อนไขที่ยึดไว้เมื่อเริ่ม implement จริง** (ไม่ใช่สิ่งที่ต้องตัดสินใจเพิ่ม แค่ทวนให้ตรงกับที่ออกแบบไว้):
1. `templateId` เป็น FK เดียว ไม่ copy field อื่นของ Template เข้ามาใน Job (กัน duplicate ownership ตาม §1)
2. เช็ค `Template.status !== "retired"` เป็น precondition ตอนสร้าง Job ใหม่เท่านั้น (decision #2)
3. ไม่แตะ `SHEET_MTO_ITEMS`/`applyMtoFulfillment_`/`closeMtoJob`/LINE notification เลยในรอบนี้ — สิ่งที่
   พบใน §5/§9 (Reversal, LINE bypass path) เป็นคนละ phase โดยตั้งใจ

**สิ่งที่ยังคง `NOT READY` และต้องรอ sign-off แยกก่อนเริ่ม**:
- Phase 2B (Recipe Version + Cost Snapshot) — รอ risk D (ต้นทุนวัตถุดิบ=0) ถูกแก้ที่ต้นทางก่อน มิฉะนั้น
  `actualCost`/margin ที่บันทึกจะไม่มีความหมายทางธุรกิจ
- Phase 2C (Stock Reversal implementation) — รอ risk A (ZORT reversal endpoint) ถูกยืนยันก่อน
- LINE Architecture Consolidation (§9.4) — รอ risk B/C ถูกตรวจก่อน และเป็นงานที่แยกออกจาก MTO domain
  โดยสิ้นเชิง (กระทบทั้งระบบ ไม่ใช่แค่ MTO) — ควรเป็นรอบ sign-off ของตัวเอง ไม่ผูกกับ Phase 2A/2B/2C

**No coding before architecture approval ยังคงมีผลกับ Phase 2B/2C/LINE ทั้งหมด** — เอกสารนี้ให้ไฟเขียว
เฉพาะขอบเขตแคบของ Phase 2A (Job→Template link) เท่านั้นตามที่คุณระบุไว้ชัดเจนแล้วในคำสั่งก่อนหน้า
