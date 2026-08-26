# PRODUCT REGISTRY ARCHITECTURE — Conceptual Design

> **สถานะ**: architecture design only · **ยังไม่ implement** · ไม่แก้โค้ด/ไม่สร้าง Sheet จริง/
> ไม่ migrate/ไม่เปลี่ยน SKU เดิม/ไม่ commit/ไม่ deploy
> **ฐาน**: เอกสาร 6 ฉบับก่อนหน้า (Creation Review · Domain · Naming&SKU · Data Evidence · Forensic ·
> Family Decision) + โค้ดจริงในรอบนี้ (อ้าง line number) + CSV เดิม (5,903 แถว, provenance = UNKNOWN)
> **Terminology ที่ล็อกแล้ว (ห้ามเปลี่ยน)**: **Business Family → Product Type/Form → Variant → SKU**

## หลักการที่ยึดตลอดเอกสาร (ตามที่สั่ง — ทุกข้อคือ constraint ไม่ใช่ข้อเสนอ)

1. **SKU เดิม = immutable identifier** — ไม่ rewrite ไม่ว่ากรณีใด
2. **Legacy SKU ต้องรองรับได้ 100%** — ทุกตัวอักษรคงเดิมตลอดไป
3. **ห้าม assume Prefix = Category** (พิสูจน์ผิดแล้ว: prefix เดียวหลาย category — Forensic §)
4. **ห้าม assume Prefix = Family** (พิสูจน์ผิดแล้ว: `L` = ถังรวมหลายชนิดพืช — Family Decision §3)
5. **Variant rule = property ของ Product Type/Form** (พิสูจน์แล้ว: KB096 ขนาด vs KB040 สี ใน prefix
   เดียว — Family Decision §1.5/§2)
6. **Backfill legacy ต้องระวัง SKU/model collision** (พิสูจน์แล้ว: L model 002 = ลิลลี่ + กระถินไทย)
7. **ห้ามเปลี่ยน SKU ที่ติด barcode/ป้ายจริงแล้ว** (บาร์โค้ด ≈ SKU 99.68% = พิมพ์ติดของไปแล้วจริง)
8. **Dataset "(ทดสอบ)" = UNKNOWN provenance** — ห้ามอ้างตัวเลขใน dataset เป็น production fact

## ระดับหลักฐาน
| | |
|---|---|
| ✅ **EVIDENCE** | วัดจากข้อมูลจริง (มีเงื่อนไขแฝง "ถ้า dataset = production" — หลักการ 8) |
| 🔵 **CODE** | ยืนยันจากซอร์สโค้ดจริง (อ้าง line) |
| 🔍 **INFERENCE** | อนุมานจากรูปแบบ |
| 💡 **RECOMMENDATION** | ข้อเสนอเชิงสถาปัตยกรรม |
| ❓ **UNKNOWN** | พิสูจน์ไม่ได้ — ไม่เดา |

---

## 1. Product Registry Architecture (Conceptual)

> ยังไม่กำหนด physical Google Sheet columns — ระดับ entity/relationship/ownership เท่านั้น

### 1.1 Entity Catalog

| Entity | คืออะไร | Data owner (ใครแก้ได้) | Source of truth | ประเภทค่า |
|---|---|---|---|---|
| **BusinessFamily** | ชนิดพืช/ดีไซน์กว้าง เช่น "ไฮเดรนเยีย" ครอบหลาย Form (H+HB+RT) — **optional** (จำเป็น ~18-22% ของกรณี) | เจ้าของ/แอดมิน | ERP (registry) | editable · optional |
| **ProductType/Form** | "แบบสินค้าที่ขายจริง" 1 รายการ เช่น "ไฮเดรนเยียดอกเดี่ยว รุ่น 041" — **หน่วย transactional หลัก** | เจ้าของ/warehouse (สร้างตอนเพิ่มสินค้า) | ERP (registry) | editable |
| **VariantDefinition** | ค่าที่เลือกได้ภายใต้ variantRule ของ Form (เช่น สี "01=ชมพู" หรือ ขนาด "01=S") | ERP (ต่อ Form) | ERP (registry) | editable · scoped ต่อ Form |
| **VariantRule** | ชนิดของ variant ของ Form นั้น: COLOR/SIZE/STYLE/OTHER/NONE | ERP (property ของ Form) | ERP (registry) | editable · **1 ต่อ Form** |
| **SKU** | identifier ระดับ variant ที่ซื้อขาย/สแกนได้จริง — **immutable** | ระบบ generate (ห้ามพิมพ์เอง) | **co-owned**: string เกิดที่ ERP, ลงทะเบียนคู่ ZORT | generated · **immutable** |
| **Barcode** | รหัสสแกน — วันนี้ ≈ SKU 99.68% แต่ **ไม่บังคับว่าต้องเท่า** (0.32% ต่างจริง) | ERP mapping (default=SKU) | ERP | derived (default) · overridable |
| **Category** | หมวดนำเสนอ เช่น "ดอกไม้"/"บูช"/"กุหลาบหิน" — **ไม่ใช่ species, ไม่ใช่ variant-rule owner** | เจ้าของ (master list) | ERP + ZORT (มี category ฝั่ง ZORT ด้วย) | editable · master |
| **Supplier** | ผู้ผลิต/ซัพพลายเออร์ (วันนี้เก็บใน tag col F ปนกับ freshness/lot — Data Evidence §) | เจ้าของ (master) | ERP (registry) — **แยกออกจาก tag ที่ overload** | editable · master |
| **Owner (ผู้ดูแล)** | พนักงานที่ดูแลสินค้าตัวนั้น — **ป้ายบอก ไม่ใช่สิทธิ์** (มีระบบแล้ว) | staff กดเอง / owner assign | ERP (`SHEET_PRODUCT_OWNER`) 🔵 :202 | editable · 1 ต่อ SKU |
| **Unit** | หน่วยนับ (วันนี้ fix "ชิ้น") | เจ้าของ (master) | ERP | editable · master |
| **Pricing** | ราคาส่ง (ฐาน) + ราคาปลีก (derive ×factor) | เจ้าของ (ราคาส่ง) · ระบบ (ปลีก) | **ZORT = ราคาขายจริง** · ERP = wholesale ratio | mixed (ดู §1.3) |

### 1.2 Relationship (conceptual)

```
BusinessFamily  1 ──< (optional) ──  ProductType/Form  >── 1  Category
                                            │  1
                                            │
                                     VariantRule (COLOR/SIZE/STYLE/OTHER/NONE)  — property ของ Form
                                            │  1
                                            ▼  many
                                     VariantDefinition (allowed values ของ Form นี้)
                                            │  1
                                            ▼  many
                                          SKU  ───  1:1(default) ─── Barcode
                                            │
                              (attributes ต่อ SKU/variant instance)
                              ├── Owner        (1 ต่อ SKU — มีระบบแล้ว)
                              ├── Supplier     (โยงผ่าน Form หรือ SKU — ดู §6)
                              ├── Unit
                              └── Pricing (wholesale base)
```

### 1.3 Source of Truth — ตารางชี้ขาด (สำคัญที่สุดของ §1)

| ข้อมูล | Master วันนี้ (โค้ดจริง) | Master ที่เสนอ | เหตุผล |
|---|---|---|---|
| **จำนวนสต็อก** | ZORT (`syncZortBoth` เขียนทับทุก 2 ชม.) 🔵 | **ZORT คงเดิม** | หลักการที่ยึดมาตลอด "ZORT = source of truth" (CLAUDE.md) — ห้ามย้าย |
| **ราคาขาย (ปลีก)** | ZORT (`p.price` จาก GetProducts) 🔵 | **ZORT คงเดิม** | POS/ใบเสนอราคาใช้ตัวเดียวกัน — ย้ายแล้วเพี้ยนทั้งระบบ |
| **wholesale ratio** | Script Property `WHOLESALE_RATIO` 🔵 | **ERP config** | เจ้าของปรับเองไม่ผ่าน deploy — มีอยู่แล้ว |
| **transaction (order/bill/transfer)** | ZORT + Sheets log | **ZORT operational master** | ยึดหลัก "ZORT = operational master" |
| **Product metadata** (Family/Form/VariantRule) | **ไม่มี master วันนี้** — derive จาก scan SKU (`designInfo` ใน AddProductView) 🔵 | **ERP (registry ใหม่)** | นี่คือช่องว่างที่ registry มาเติม — SKU ไม่ควรเป็นที่เก็บความหมายอีก (Family Decision §6) |
| **SKU string identity** | เกิด client-side → push ZORT (`addNewProduct` → `pushStockToZort_`) 🔵 | **ERP generate/reserve** (§5) | แก้ race condition — แต่ยัง register ไป ZORT เหมือนเดิม |
| **Owner** | `SHEET_PRODUCT_OWNER` 🔵 :202 | **ERP คงเดิม** | มีระบบครบแล้ว |

💡 **สรุป source-of-truth**: **ZORT = operational master (สต็อก/ราคา/ธุรกรรม) · ERP layer (Google Sheets +
GAS) = domain master (Family/Form/Variant/Owner/Supplier metadata)** — ยืนยันประโยคหลักที่ต้องรักษา
(ดู §11 สำหรับการ challenge/ยืนยันเต็ม)

---

## 2. Legacy SKU Mapping

### 2.1 หลักการ mapping (ตามลำดับ)

```
Existing SKU (immutable, key หลัก)
    → Product Type/Form   (บังคับต้อง map ได้ หรือระบุ UNKNOWN)
    → Business Family     (optional — เติมถ้ารู้)
    → Variant             (derive จาก SKU structure ถ้า rule ชัด)
```

⚠️ **key ของ mapping = SKU เต็มตัวเสมอ ไม่ใช่ prefix+model** (หลักการ 6 — พิสูจน์แล้ว L model 002 ชน) ✅

### 2.2 รองรับทุกรูปแบบ SKU ที่พบจริง (จาก Forensic §)

| รูปแบบ | ตัวอย่าง | กลยุทธ์ map | confidence เริ่มต้น |
|---|---|---|---|
| **standard** `[A-Z]{1,3}\d{2}\d{3}` | `R01025` | prefix+model → Form candidate, **ยืนยันด้วยชื่อ** | INFERRED (ยกเป็น CONFIRMED เมื่อชื่อสอดคล้อง) |
| **legacy prefix ถังรวม** | `L02002` | **SKU เต็ม → Form** (ห้ามใช้ prefix+model) | INFERRED/AMBIGUOUS |
| **full-word SKU** | `NAMETAG`, `Fee` | ตรวจ non-product (§ Forensic) → ไม่ map เป็นสินค้า | UNKNOWN → classify แยก |
| **MTO** `[A-Z]+\d+` (ไม่มี variant slot) | `BK001`, `PACKAGE001` | grammar แยก (`mtoSkuPrefix_` 🔵) → Form = bundle, **ไม่มี Variant** | CONFIRMED (rule ชัด) |
| **suffix-letter SKU** | `...A`, `...B` | ไม่ assume ความหมาย — เก็บ raw, รอเจ้าของยืนยัน | AMBIGUOUS |
| **SKU ที่ไม่มี code (variant slot ว่าง)** | ชื่อล้วน/ตัวเลขล้วน | Form = ตัวมันเอง (singleton), Variant = NONE | INFERRED |
| **ambiguous** | prefix+model ชนข้ามชนิด | **ห้าม auto-map** — เข้า review queue | AMBIGUOUS |

### 2.3 Confidence levels (บังคับติดทุกแถว mapping)

| ระดับ | ความหมาย | การใช้งาน |
|---|---|---|
| **CONFIRMED** | เจ้าของ/staff ยืนยันด้วยมือ **หรือ** rule ชัด 100% (เช่น MTO grammar) | ใช้ได้เต็มที่ · ขึ้นรายงานได้ |
| **INFERRED** | ระบบเดาจาก prefix+model+ชื่อสอดคล้อง แต่ยังไม่มีคนยืนยัน | ใช้ชั่วคราว · ติดป้าย "รอยืนยัน" · **ไม่ใช้เป็นฐานตัดสินใจเงิน** |
| **AMBIGUOUS** | มีมากกว่า 1 ความเป็นไปได้ (เช่น model collision) | **ไม่ auto-map** — เข้า review queue ให้คนเลือก |
| **UNKNOWN** | map ไม่ได้เลย (non-product / รูปแบบแปลก) | คงเป็น SKU เปล่า · แสดงในรายงาน "orphan SKU" |

💡 **กติกาเหล็ก**: **UNKNOWN/AMBIGUOUS ห้าม auto-map แบบมั่วเด็ดขาด** — mapping ที่ระบบเดาเองต้องเป็น
INFERRED สูงสุด และต้อง **แยกให้เห็นชัดจาก CONFIRMED เสมอในทุก UI/report** (หลักเดียวกับที่ทุกเอกสาร
ก่อนหน้าย้ำ: เดาผิดเงียบ ๆ แย่กว่าไม่รู้)

### 2.4 Backfill workflow (conceptual — reuse pattern ที่มี)

🔵 มีต้นแบบแล้ว: `PRODUCT_OWNER_ASSIGN_PLAN_` + `previewProductOwnerAssign()`/`applyProductOwnerAssign()`
(GAS editor tools, preview-before-apply, lock, audit 1 แถว/รอบ) — legacy Form-mapping ใช้ **โครงเดียวกัน**:
`previewFormMapping()` (อ่านอย่างเดียว, รายงาน CONFIRMED/INFERRED/AMBIGUOUS/UNKNOWN แยกกอง) →
เจ้าของตรวจ → `applyFormMapping()` (เขียน INFERRED เท่านั้น, ข้าม AMBIGUOUS/UNKNOWN)

---

## 3. Variant Registry

### 3.1 Variant Type ต่อ Form (ไม่ใช่ global)

```
Form record:
  variantRule.type ∈ { COLOR, SIZE, STYLE, OTHER, NONE }
  variantRule.values = [ {code, label}, ... ]   ← scoped ต่อ Form นี้เท่านั้น
```

ตัวอย่าง concept (ตรงกับที่สั่ง):
```
Form "พิงกุย" (KB040)         → type=COLOR → { 01:ชมพู(แดง), 02:เขียว }
Form "อากาเว่" (KB096)        → type=SIZE  → { 01:S, 02:M, 03:L }
Form "แจกันเซรามิก"           → type=NONE  → (ไม่มี variant — 1 Form = 1 SKU)
```

⚠️ **ห้าม hardcode ความหมาย 01/02/03 จาก global table** (หลักการ 5) ✅ — พิสูจน์แล้วว่า `01` = "ชมพู"
ในโหมดสี แต่ `01` = "S" ในโหมดขนาด (KB096) · **ตาราง 99 สีที่มีอยู่ (`VARIANT_COLOR_CODES` 🔵) กลายเป็น
"default value-set ของ type=COLOR" เท่านั้น** — ไม่ใช่ความหมายสากลของเลข 2 หลัก

### 3.2 ความสัมพันธ์กับตารางสีเดิม

- `type=COLOR` → default values = ตาราง 99 สี (reuse ได้ทันที ไม่ต้องสร้างใหม่) 🔵
- `type=SIZE` → **ยังไม่มี master** → ต้องสร้าง size table (S/M/L + อื่น) — งานใหม่
- `type=STYLE/OTHER` → free value-set ต่อ Form
- Form กำหนด **subset** ของ default ได้ (เช่นสินค้ามีแค่ 3 สีจาก 99) — `VariantDefinition` = subset ที่
  Form นั้นเปิดใช้จริง

### 3.3 กติกา: variant-rule derive จาก category ได้ (default) แต่ override ที่ Form

💡 category → variantRule default แม่น ~94% (Family Decision §2 ✅) → ใช้เป็นค่าเริ่มต้นตอนสร้าง Form ใหม่
เพื่อลดงานกรอก · **แต่ field จริงอยู่ที่ Form** ต้องแก้รายตัวได้ (เช่น KB096)

---

## 4. Product Creation Architecture (Target)

> ออกแบบ target ของ "หน้าเพิ่มสินค้า" — **ยังไม่เขียน UI/code**

### 4.1 พนักงานเลือกเอง (👤 user selects)

Business Family (optional, ค้น/สร้าง) · Product Form (เลือก "แบบเดิม สีใหม่" หรือสร้างใหม่) · Variant
value (สี/ขนาดที่ต้องการ) · Supplier · Unit · Owner · **ราคาส่ง (cost/pricing input)**

### 4.2 ระบบ generate (🤖 system generates)

**Model number** (จาก Form sequence — §5) · **SKU string** (จาก Form+Variant, กันชน) · **ชื่อเต็ม**
(compose: base + variant label + price) · **barcode mapping** (default = SKU ถ้า rule รองรับ)

### 4.3 ระบบ derive (🔍 system derives)

**ราคาปลีก** (×factor) · **variant display** (label จาก code) · **family metadata** (โยงกลับ Family
ถ้าเลือก) · **variantRule default** (จาก category)

### 4.4 Master/config (📋)

Product Family list · Product Form list · Variant definitions · Category · **Prefix rule** (mapping
prefix→ความหมาย, ต้องแก้ได้) · Pricing rules (wholesale ratio, factor)

### 4.5 กติกาเหล็ก

🚫 **พนักงานห้ามกรอก SKU string เอง** ในสถาปัตยกรรมใหม่ (หลักการ 7 + Forensic: 10% ของ SKU เดิมผิด
มาตรฐานเพราะกรอกมือ) · 🚫 ห้ามกรอก prefix โดด/model running เอง (ชนกันได้)

---

## 5. SKU Generation Authority

### 5.1 ปัญหาปัจจุบัน (🔵 CODE)

`nextModelForPrefix` คำนวณ running number **ฝั่ง client** จาก `data.products` ที่มีในมือ →
**race condition**: 2 เครื่องเพิ่มสินค้า prefix เดียวกันพร้อมกัน ได้ model เดียวกัน (มี workaround
`heldDesign` ล็อกเลขระหว่างเพิ่มหลายสี แต่ไม่กันข้ามเครื่อง)

### 5.2 เปรียบเทียบ 3 วิธี

| วิธี | กันชนข้ามเครื่อง | ซับซ้อน | legacy sequence | สรุป |
|---|---|---|---|---|
| **Client-side generation** (วันนี้) | ❌ race | 🟢 ต่ำ | อ่านจาก payload | **ไม่ปลอดภัย** |
| **Backend reservation** | ✅ (LockService คร่อม read→write) | 🟡 กลาง | อ่าน max จริงจากชีต/ZORT ตอน reserve | ✅ ตรงกับ pattern มีอยู่ |
| **Registry sequence** (counter แยกต่อ prefix) | ✅ atomic | 🟡 กลาง-สูง | ต้อง seed จาก legacy max ให้ถูก (ระวัง L collision) | ดีสุดระยะยาว แต่ seed เสี่ยง |

### 5.3 💡 แนะนำ: **Backend reservation** (ปลอดภัยสุด + ตรงของเดิม)

- reserve model number ฝั่ง GAS ภายใน **LockService** (pattern เดียวกับ `handleOrder_` cid / transfer
  tid ที่พิสูจน์แล้วว่ากันซ้ำได้ 🔵) — คว้าล็อก → หา max จริง → +1 → เขียน → ปล่อยล็อก
- **รองรับ legacy โดยไม่แตะ SKU เก่า**: max ที่หา = max ของ Form/prefix นั้นจากทั้ง legacy + ใหม่ ·
  legacy SKU ไม่ถูกแก้ เพียงเป็น "พื้น" ให้เลขใหม่เดินต่อ · **prefix ที่มี collision history (L)
  ต้องไม่ออกเลขใหม่ใน namespace นั้น** — ให้ freeze legacy prefix, สินค้าใหม่ใช้ prefix ใหม่ที่มีวินัย
  (ดู §13 checklist "Prefix policy")
- Registry sequence เก็บเป็น phase ถัดไปได้ (Phase A/B) ถ้าต้องการ counter จริง — แต่ reservation
  พอสำหรับความปลอดภัยแล้ว

---

## 6. Supplier Review / Follow-up Workflow

> **reuse pattern เดิม ไม่สร้าง notification engine ใหม่** (ตามที่สั่ง) — มีครบทุกชิ้นส่วนแล้ว

### 6.1 ชิ้นส่วนที่มีอยู่แล้ว (🔵 CODE — ต้นแบบตรง)

| ต้องการ | มีอยู่แล้วที่ไหน |
|---|---|
| **request + due tracking + สถานะแยกฝั่ง + แจ้งเตือนเมื่อเสร็จ** | `SHEET_STOCK_CHECK` "คำขอเช็คสินค้า" 🔵 :15651 · `createStockCheckRequest_`/`completeStockCheckRequest_` :2620/2624 · แจ้ง owner/saler ผ่าน `pushInappNoti_` |
| **cycle/review due-date ตาม ABC** | `abcClassify` :1336 + `abcRevWindow_` :1330 + per-class due (A=30/B=60/C=90 คลัง, A=7/B=14/C=30 หน้าร้าน) 🔵 |
| **overdue notification** | `shipPendingAging_` :10015 + `notifyPendingReceives_` :10046 + `SHIP_PENDING_ALERT_DAYS=3` :10011 🔵 |
| **staff-specific notification** | `inappAudienceMatch_` :10762 รองรับ `"staff:STxxxx"` **แต่ยังไม่มีใครเรียกเจาะตัว staff** (capability ว่างอยู่ — CLAUDE.md ระบุ) 🔵 |
| **owner dashboard** | Product Owner system `SHEET_PRODUCT_OWNER` :202 + `setProductOwnerHandler_` :11184 🔵 |

### 6.2 Design (ประกอบจากชิ้นส่วนเดิม)

```
Supplier (master ใหม่ — แยกจาก tag ที่ overload)
   └─< Products (Form/SKU ที่ supplier นั้นส่ง)
         └─ Review cycle (ตาม ABC หรือกำหนดเอง ต่อ supplier/Form)
               └─ Due date (คำนวณจาก lastReviewedAt + cycle — pattern เดียวกับ frontStoreCheckedAt)
                     └─ Overdue (age >= threshold — pattern shipPendingAging_)
                           └─ Notification (pushInappNoti_ → owner ของสินค้า + เจ้าของร้าน)
```

- **สินค้าตัวไหนต้องติดตาม**: Form ที่ผูก supplier + ถึงรอบ review (ABC-based default)
- **supplier ไหนรับผิดชอบ**: จาก Supplier master (ต้อง un-overload tag ก่อน — Data Evidence §)
- **ใครเป็น owner**: `SHEET_PRODUCT_OWNER` (มีแล้ว)
- **รอบตรวจสอบ**: ABC default + override ต่อ Form/supplier
- **ถึงกำหนดแจ้งใคร**: `pushInappNoti_({audience:"staff:<ownerId>"})` — **ใช้ capability ที่ว่างอยู่**
  (ครั้งแรกที่มี caller จริงของ staff-targeting) + สำเนาถึง owner ร้าน
- **overdue แจ้งอย่างไร**: pattern `notifyPendingReceives_` — dedupKey ผูกวัน+supplier กัน spam
- **escalation**: ถ้า overdue เกิน N วันไม่ดำเนินการ → ยกระดับ audience จาก `staff:owner` → เพิ่ม
  `role:owner` (เจ้าของร้านเห็นด้วย) — ชั้นเดียว ไม่ทำ escalation tree ซับซ้อน
- **กัน notification spam**: (1) dedupKey (มี pending คีย์เดียวกัน = ข้าม 🔵) (2) in-app ก่อน (ไม่กิน
  LINE quota) (3) clamp จำนวน/รอบเหมือน low-stock scan (แจ้งเฉพาะที่เกินเกณฑ์จริง ไม่ยิงทั้งกอง)

💡 **ไม่ต้องสร้าง engine ใหม่เลย** — ต้องการแค่: (ก) Supplier master (แยกจาก tag), (ข) field
`lastReviewedAt`/`reviewCycleDays` ต่อ Form/supplier, (ค) caller ใหม่ของ `pushInappNoti_` แบบ
staff-targeted (โครงมีแล้ว)

---

## 7. Owner Workflow

### 7.1 Lifecycle

```
Product Created (Form/SKU เกิด)
   → Owner Assigned (staff กดดาว / owner assign / bulk PRODUCT_OWNER_ASSIGN_PLAN_)
       → Supplier Follow-up (รอบ review §6)
           → Review (staff ตรวจ/นับ/ยืนยัน)
               → Action Required (ของใกล้หมด/ต้องสั่ง/supplier ไม่ส่ง)
                   → Completed  (ปิดรอบ → รอรอบถัดไป)
                   → Overdue    (เกินกำหนด → แจ้ง + escalation §6)
```

### 7.2 กรณีที่ต้องรองรับ (สถานะ owner)

| กรณี | การจัดการ (reuse ระบบดาวเดิม) |
|---|---|
| **ยังไม่มี owner** | แสดงใน report "products without owner" (§10) · bulk-assign ได้ (`PRODUCT_OWNER_ASSIGN_PLAN_` 🔵) · **ยังต้องติดตามได้** (review cycle ไม่ผูก owner ก็ทำงาน — audience fallback → role:owner) |
| **มี owner** | แจ้งเจาะตัว `staff:<id>` |
| **owner เปลี่ยน** | เขียนทับ 1 แถว/SKU (มีแล้ว 🔵) + audit ประวัติ · notification ตามเจ้าใหม่ |
| **supplier เปลี่ยน** | อัปเดต Supplier link ของ Form · review cycle เดินตาม supplier ใหม่ |
| **inactive/archive** | หยุด review cycle (ดู §9 lifecycle) · owner ยังเห็นในประวัติ ไม่ลบ |

---

## 8. Add Product UI Architecture (wire-level)

> ยังไม่เขียน UI/code — flow ระดับ wire เท่านั้น

```
Step 1  ค้นหาก่อนสร้าง  ← ป้องกัน duplicate family/product (บังคับ)
          ค้นด้วย: ชื่อพืช / Form / SKU / barcode
Step 2  เลือก/สร้าง Business Family (optional — ข้ามได้ถ้าไม่ต้องการชั้นนี้)
Step 3  เลือก Product Form   (แบบเดิม "สีใหม่" → ล็อก base+model · หรือสร้าง Form ใหม่)
Step 4  เลือก Variant        (ตาม variantRule ของ Form: สี/ขนาด/none)
Step 5  Supplier / Owner / Unit
Step 6  Pricing (ราคาส่ง → ระบบ derive ปลีก)
Step 7  Preview: ชื่อเต็ม + SKU ที่ระบบ generate  ← เห็นก่อน confirm
Step 8  Confirm → reserve SKU (§5) → register (ERP + ZORT)
```

### 8.1 หลักฐานสนับสนุน flow นี้ (🔵)

- flow "แบบเดิม สีใหม่ / แบบใหม่" **มีอยู่แล้ว** ใน `AddProductView` (`heldDesign`, `nextModelForPrefix`,
  โหมด 2 แบบ) 🔵 — Step 3-4 คือ formalize ของที่มีอยู่ ไม่ใช่ของใหม่ทั้งหมด
- **"ค้นหาก่อนสร้าง" (Step 1) เป็นของใหม่ที่จำเป็น** — วันนี้ตรวจซ้ำแค่ตอน submit (`checkSkuExists`)
  ไม่มีขั้นค้น family/Form ก่อน → เสี่ยงสร้าง Form ซ้ำที่ควรเป็น "สีใหม่ของแบบเดิม"

### 8.2 ทางเลือกถ้าเจ้าของอยากเร็วกว่า (💡 challenge flow ตัวเอง)

สำหรับ role หน้าร้าน/warehouse ที่เพิ่มของบ่อย: **fast-path "เพิ่มสีของแบบเดิม"** (ข้าม Step 1-2, เข้า
Step 3 ด้วยการ scan/พิมพ์ SKU ตัวอย่างของแบบเดิม → ระบบดึง Form → เลือกแค่สีใหม่) — ตรงกับ flow ที่
`AddProductView` ทำอยู่แล้ว · **flow เต็ม 8 step ใช้กับ "แบบใหม่จริง" เท่านั้น**

---

## 9. Product Lifecycle

```
Draft      (สร้างใน ERP ยังไม่ push ZORT / ยังไม่มีสต็อก)
  → Active     (register ZORT + มีสต็อก/ราคา)
    → Out of Stock  (qty=0 — สถานะ derived ไม่ใช่ lifecycle จริง, กลับมา Active เองได้)
      → Inactive    (เลิกขายชั่วคราว — ERP flag, ZORT อาจยังมี record)
        → Archived  (เลิกขายถาวร — ERP archive)
```

### 9.1 แยก 4 มิติที่ปนกันไม่ได้ (สำคัญ)

| มิติ | ความหมาย | ใครควบคุม |
|---|---|---|
| **ZORT deletion** | ลบสินค้าใน ZORT | มีระบบแล้ว: soft-delete `SHEET_HIDDEN_PRODUCTS` 🔵 (ไม่ลบชีตจริง, กู้ได้) |
| **ERP archive** | เลิกขายในมุม domain | flag ใน registry (ใหม่) — **ไม่ลบ Form/SKU record** |
| **physical stock** | ของจริงในคลัง | ZORT qty (operational) |
| **historical transaction** | บิล/order/transfer ที่เกิดแล้ว | **ห้ามแตะ — immutable log** |

### 9.2 กติกาเหล็ก

🚫 **ห้าม hard-delete historical SKU** (หลักการ 1-2) — archive = flag เท่านั้น · SKU string + ประวัติ
ธุรกรรมคงอยู่ตลอด · สอดคล้องกับ soft-delete pattern ที่มีแล้ว (`SHEET_HIDDEN_PRODUCTS`) 🔵

---

## 10. Reporting / Analytics (สิ่งที่ registry ปลดล็อก)

| รายงาน | วันนี้ทำได้ไหม | หลัง registry |
|---|---|---|
| sales by **Business Family** | ❌ (ต้อง re-derive จาก SKU เปราะ) | ✅ (Family layer โยงตรง) |
| sales by **Form** | ⚠️ approximate (prefix+model เดา) | ✅ (Form = entity จริง) |
| sales by **Variant** (สี/ขนาดไหนขายดี) | ❌ | ✅ (Variant มี type ชัด) |
| **supplier performance** | ❌ (tag overload แยกไม่ออก) | ✅ (Supplier master) |
| **owner performance** | ⚠️ มี staffperf แต่ไม่ผูกสินค้าที่ดูแล | ✅ (owner ↔ Form/SKU) |
| **products without owner** | ⚠️ ต้องไล่เอง | ✅ (query ตรง) |
| **products overdue for review** | ❌ | ✅ (§6 due tracking) |
| **orphan/ambiguous SKU** | ❌ | ✅ (confidence=UNKNOWN/AMBIGUOUS list) |
| **legacy SKU coverage** | ❌ | ✅ (% ที่ map เป็น Form แล้ว vs ยัง) |

⚠️ ทุกรายงานข้างบนมีเงื่อนไขแฝง provenance (หลักการ 8) — เป็นเครื่องมือ operational ได้ทันที แต่
**ตัวเลขเชิงกลยุทธ์/การเงินต้องรอ provenance ยืนยัน**

---

## 11. Recommended Architecture

### 11.1 Source of truth ต่อ entity (ชี้ขาด)

| Entity | Source of truth | เหตุผล |
|---|---|---|
| สต็อก · ราคาขาย · transaction | **ZORT** (operational master) | ยึดหลัก CLAUDE.md — ห้ามย้าย |
| Family · Form · VariantRule · VariantDef | **ERP layer** (Sheets+GAS registry) | ไม่มี home วันนี้ — registry มาเติม |
| Owner · Supplier master · review cycle | **ERP layer** | domain metadata |
| SKU identity | **ERP generate/reserve** → register ไป ZORT | แก้ race, แต่ ZORT ยังรู้จัก SKU |
| Barcode | **ERP** (default=SKU) | mapping overridable |
| wholesale ratio / factor | **ERP config** (Script Property) | ปรับไม่ผ่าน deploy |

### 11.2 บทบาทแต่ละชั้น

- **ZORT** = operational master (inventory/transaction) — **คงเดิม 100%**
- **ERP layer (Google Sheets + GAS)** = domain layer ของ Product metadata (registry ใหม่อยู่ที่นี่)
- **Google Sheets** = physical store ทั้งของ ZORT-mirror และ registry — บทบาทไม่เปลี่ยน
- **cache/read model** = payload cache เดิม (stale-while-rebuild, variant ต่อ role) — registry data
  เข้า payload แบบ role-aware เหมือนของเดิม
- **notification** = in-app bell + LINE queue เดิม (reuse ทั้งหมด §6) — ไม่มี engine ใหม่

### 11.3 การ challenge ประโยคหลัก (ตามที่สั่ง)

> "ZORT ยังเป็น operational master ของ inventory/transaction แต่ ERP เป็น domain layer ของ Product
> metadata"

✅ **evidence สนับสนุนประโยคนี้ — ยืนยัน ไม่ challenge** เพราะ:
1. ZORT ควบคุม qty/price/txn จริงในโค้ด (`syncZortBoth`, `deductFrontStoreForSale_`) 🔵 — ย้ายไม่ได้
2. Product metadata (Family/Form/variantRule) **ไม่มีที่อยู่วันนี้** — พิสูจน์แล้วว่าต้อง derive จาก
   scan SKU ทุกครั้ง (Family Decision §6) → มีช่องว่างจริงให้ ERP layer เติม

⚠️ **จุดที่ต้องระวัง (nuance ไม่ใช่ challenge)**:
- **"ERP" ที่นี่ = Google Sheets + GAS เอง** ไม่ใช่ระบบ ERP แยกต่างหาก — อย่าตีความว่าต้องซื้อ/สร้าง
  ระบบใหม่
- **SKU identity เป็น co-owned วันนี้** (เกิด client → push ZORT) → ข้อเสนอย้าย authority การ generate
  มาที่ ERP (§5) **แต่ ZORT ยังต้องรู้จัก SKU** (register) — ประโยคหลักยังจริง เพียงเพิ่มความชัดว่า
  ERP เป็นคนออกเลข ZORT เป็นคนรับไปใช้ operational

---

## 12. Implementation Roadmap

> ยังไม่ implement — roadmap เพื่อประกอบการตัดสินใจเท่านั้น

| Phase | ขอบเขต | Dependency | Risk | Migration | Rollback | Test requirement |
|---|---|---|---|---|---|---|
| **A — Registry foundation** | สร้าง entity Form/Family/VariantRule (โครงข้อมูล, ยังไม่ backfill) | — | 🟢 ต่ำ (ข้อมูลใหม่ ไม่แตะเก่า) | ไม่มี (สร้างเปล่า) | drop registry sheets (ไม่กระทบเดิม) | schema-lock test, gate `_ENABLED` |
| **B — Legacy mapping** | map SKU→Form (INFERRED) + review queue AMBIGUOUS/UNKNOWN | A | 🟡 กลาง (map ผิด = report เพี้ยน) | preview→apply, SKU-full-key, ข้าม ambiguous | mapping เป็น metadata แยก — ลบทิ้งได้ไม่แตะ SKU | test collision (L model 002), confidence แยกกอง |
| **C — Add Product** | หน้าเพิ่มสินค้าใหม่ + backend SKU reservation | A,B | 🟡 กลาง (สร้าง SKU ผิด = ของจริง) | ใช้ควบคู่ flow เดิมก่อน (feature flag) | ปิด flag → กลับ AddProductView เดิม | reservation race test (เหมือน cid/tid) |
| **D — Owner/Supplier workflow** | Supplier master (un-overload tag) + review cycle + staff noti | A,B | 🟡 กลาง (tag migration) | tag→Supplier แบบ additive (ไม่ลบ tag เดิม) | ปิด review noti, tag เดิมยังอยู่ | audience `staff:` test, dedup/spam test |
| **E — Reporting** | รายงาน Family/Form/Variant/supplier/owner/orphan | A-D | 🟢 ต่ำ (อ่านอย่างเดียว) | ไม่มี | ซ่อน report | ตัวเลขติดป้าย provenance/confidence |
| **F — Edit Product** | แก้ Form/Variant/metadata (path ที่วันนี้ไม่มี) | A-C | 🟡 กลาง (แก้แล้วกระทบ SKU เก่า?) | edit เฉพาะ metadata ไม่แตะ SKU string | audit + undo | test ว่า edit ไม่ rewrite SKU |

💡 **ลำดับพึ่งพา**: A → B → (C ‖ D) → E → F · **A-B ทำได้แบบ read-safe** (gate ด้วย `_ENABLED` เหมือน
ทุกฟีเจอร์ใน CLAUDE.md) ก่อนแตะ flow ผู้ใช้จริง

---

## 13. Final Decision Gate

> **ห้ามเริ่ม coding จนกว่า checklist นี้ approve ครบ** — ทุกข้อเป็น business decision ที่สถาปนิก
> ตัดสินแทนไม่ได้

- [ ] **Business Family definition** — H+HB+RT ของไฮเดรนเยีย = ครอบครัวเดียว (สำหรับรายงาน) หรือ
      แยกอิสระ? (§1.2)
- [ ] **Product Type/Form definition** — Form = prefix+model วันนี้ ยอมรับเป็นหน่วย transactional?
- [ ] **Variant ownership** — ยอมรับว่า variantRule อยู่ที่ Form (ไม่ใช่ category/prefix)? (§3)
- [ ] **Legacy SKU policy** — freeze legacy prefix (L ฯลฯ) หรือแยกเป็น Form ย่อยตามชนิดพืช? (§5.3)
- [ ] **Prefix policy** — สินค้าใหม่ใช้ prefix เดิมต่อ หรือเริ่มวินัย prefix ใหม่? ใครดูแล master prefix?
- [ ] **SKU generation authority** — ยืนยัน backend reservation (§5.3)?
- [ ] **Supplier ownership** — un-overload tag → Supplier master: ใครเป็นเจ้าของข้อมูล supplier?
- [ ] **Owner workflow** — review cycle default ตาม ABC หรือกำหนดเอง? escalation ชั้นเดียวพอ? (§6-7)
- [ ] **Add Product flow** — 8-step เต็ม + fast-path "สีใหม่" (§8) — ยอมรับ?
- [ ] **Pricing authority** — ราคาส่งกรอกที่ ERP, ปลีก derive, ZORT ยังเป็น master ราคาขาย — ยืนยัน?
- [ ] **ZORT vs ERP source of truth** — ยืนยันประโยค §11 (ZORT=operational, ERP=metadata)?
- [ ] **Dataset provenance** — ⚠️ **ยังเป็น UNKNOWN** (§ Family Decision §4) — ต้องยืนยันก่อนใช้
      ตัวเลข dataset วางแผน migration จริง (ข้อนี้ควรตอบก่อนอื่น)

### สรุป

**พร้อมตัดสินใจระดับทิศทางสถาปัตยกรรม** (Option B ปรับปรุง: Family→Form→Variant→SKU, ZORT operational
+ ERP metadata, backend SKU reservation, reuse notification/review patterns) — **แต่ยังไม่ควรเริ่ม
coding** จนกว่า 12 ข้อใน gate จะ approve โดยเฉพาะ **provenance (ข้อสุดท้าย)** ซึ่งกำหนดว่าตัวเลขทั้ง
7 เอกสารใช้ได้ทันทีหรือต้องขอ export ใหม่

**ไม่มี evidence ใดในรอบนี้ที่ขัดกับข้อสรุปของ Family Decision (Work 4)** — เอกสารนี้เป็นการ *ออกแบบ
ต่อยอด* จากทิศทางที่ validate แล้ว ไม่ใช่การตัดสินใหม่

---

## Guardrails Verification

ตรวจก่อนจบตามที่สั่ง — ผ่านครบ:

| ตรวจ | ผล |
|---|---|
| **ไม่มี code touched** | `git diff --name-only` ว่างเปล่า — ไม่มี tracked file ใดถูกแก้ ✅ |
| **CSV checksum** | `d6d7e14dbe3285706ee2d0aafad36550` — ตรง baseline ✅ ไฟล์ไม่ถูกแตะ |
| **เอกสาร 6 ฉบับก่อนหน้าไม่ถูกแก้** | mtime ทั้ง 6 ตรงกับ baseline ก่อนเริ่ม Work 5 (23-25 ส.ค.) — ไม่มีไฟล์ไหน mtime ใหม่กว่าเดิม · มีแต่ `PRODUCT-REGISTRY-ARCHITECTURE.md` (ฉบับนี้) ที่ใหม่ ✅ |
| **git status** | untracked เฉพาะ `.md` 7 ไฟล์ใน `docs/` — ไม่มีโค้ด/config/CSV staged หรือแก้ ✅ |

**STOP** — ไม่ commit / ไม่ deploy / ไม่สร้าง Registry / ไม่เริ่ม coding · งานจบที่เอกสารเท่านั้น
รอ approve จาก Final Decision Gate (§13) ก่อนขั้นถัดไป
