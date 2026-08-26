# WORK 8 — Product Domain Decision Gate (D01–D12)

> **สถานะเอกสาร**: consolidation only — บันทึกชุดการตัดสินใจ D01–D12 ที่ **OWNER-LOCKED** แล้วในรอบงานนี้
> **ขอบเขต**: D01–D12 คือช่วงการตัดสินใจทั้งหมดของ Work 8 — **ครบถ้วน ไม่มี D13**
> **ที่มา**: สร้างจากข้อความ OWNER-LOCKED ที่เจ้าของยืนยันเองในบทสนทนานี้เท่านั้น — ไม่ตีความใหม่ ไม่เปลี่ยนแปลง
> **ข้อจำกัดของเอกสารนี้**: เป็นการ *บันทึกการตัดสินใจ* ไม่ใช่การ implement · ยังไม่มีการแตะโค้ด /
> สร้าง Registry / migration / Sheet / deploy ใด ๆ จากการตัดสินใจชุดนี้

## สัญลักษณ์สถานะ

| | ความหมาย |
|---|---|
| 🔒 **LOCKED** | เจ้าของตัดสินแล้ว — ห้าม reopen/reinterpret |
| ⏸️ **DEFERRED** | ตัดสินแล้วว่า "ยังไม่ทำตอนนี้" — มีเงื่อนไข/จุดปลดล็อกชัดเจน (เป็นการตัดสิน ไม่ใช่ข้อค้าง) |
| 🛠️ **NOT YET IMPLEMENTED** | ตัดสินแล้วในเชิงสถาปัตยกรรม แต่ยังไม่มีโค้ด/Registry/UI จริง |

> ⚠️ **ทุก decision ใน D01–D12 คือ 🔒 LOCKED** · คอลัมน์ "Implementation" บอกว่าของจริงถูกสร้างหรือยัง
> (ทั้งหมดยัง 🛠️ NOT YET IMPLEMENTED เพราะรอบนี้เป็น decision-only) · ⏸️ DEFERRED ใช้กับ **งานย่อย
> ภายใน** decision ที่เจ้าของสั่งเลื่อนโดยเจตนา (L routing, D12 reconciliation)

---

## สรุปช่วงการตัดสินใจ

| # | หัวข้อ | สถานะการตัดสิน | Implementation |
|---|---|---|---|
| D01 | Field Ownership (ERP-master fields → ZORT) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D02 | Product Hierarchy (Family → Form → Variant → SKU) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D03 | Variant Rule (Form เป็นเจ้าของ · single-axis MVP) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D04 | ZORT Sync (ERP domain master / ZORT operational master) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D05 | SKU Generation (ERP backend reservation · per-Prefix model) | 🔒 LOCKED · มีส่วน ⏸️ DEFERRED (L routing) | 🛠️ ยังไม่ทำ |
| D06 | Prefix Registry (formal · Owner/Admin · dedicated Sheet) | 🔒 LOCKED · มีส่วน ⏸️ DEFERRED (L routing) | 🛠️ ยังไม่ทำ |
| D07 | Business Family Registry (formal · optional per Form) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D08 | Product Type/Form Registry (formal · editable) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D09 | Variant Value Registry (per axis) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D10 | Legacy Migration / Backfill (sequential · preview→review→apply) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D11 | Add Product UI / Creation Flow (Option B · two-track) | 🔒 LOCKED | 🛠️ ยังไม่ทำ |
| D12 | ZORT→ERP Sync Direction Reconciliation (Option B · defer) | 🔒 LOCKED · แกนหลัก ⏸️ DEFERRED ถึง Phase F | 🛠️ ยังไม่ทำ |

**รายการที่ ⏸️ DEFERRED โดยเจตนา (สรุปตามที่สั่งให้บันทึกชัด):**
- **L replacement-prefix routing (D05 + D06)** → เลื่อนไปที่ **Prefix Registry design/implementation** ·
  ตอนนี้: L = FREEZE สำหรับสินค้าใหม่เท่านั้น · **ห้ามเดา** replacement prefix
- **D12 sync reconciliation** → เลื่อนจนกว่า **Product Edit / Phase F** จะพร้อม และ **ต้อง land พร้อมกัน**
  ในการ implement เดียวกัน

---

## D01 — Field Ownership 🔒 LOCKED

**ERP = Domain Master** สำหรับ (ทิศทาง ERP → ZORT):
- Product Type/Form · Variant · Name · Category · Sell Price · Barcode (สำหรับสินค้าใหม่)

เพิ่มเติม:
- Existing SKU **immutable**
- Existing Barcode **immutable**
- Legacy Barcode ≠ SKU ต้อง **preserve ตามข้อมูลจริง**
- New Barcode = SKU

---

## D02 — Product Hierarchy 🔒 LOCKED

```
Business Family → Product Type/Form → Variant → SKU
```
- Business Family = real entity
- Product Type/Form = real entity
- Variant = metadata bound to Form
- Prefix ≠ Business Family
- Model Number ≠ Business Family
- Existing SKU **ไม่ถูก rewrite**
- New products ใช้ hierarchy นี้เป็นหลัก
- Existing products backfill metadata ภายหลัง

---

## D03 — Variant Rule 🔒 LOCKED

- 1 Form = 1 Variant Axis ใน **MVP**
- Axis = Color / Size / Material / Style / None
- **Form owns Variant Rule**
- Staff เลือก **readable Variant Value**
- Staff **ห้ามกรอก raw SKU variant code**
- System map business value → SKU code
- Legacy/ambiguous → **human review**
- Prefix/Category **ห้าม**เป็นตัวกำหนด Variant Rule โดยตรง

---

## D04 — ZORT Sync 🔒 LOCKED

- ERP = domain master
- ZORT = operational master
- ERP-owned domain fields → **ERP → ZORT** (primary direction)
- **ห้าม ZORT sync กลับมา overwrite ERP-master fields แบบเงียบ ๆ**

---

## D05 — SKU Generation 🔒 LOCKED (มีส่วน ⏸️ DEFERRED)

- **ERP backend reservation** (Authority = A)
- ScriptLock / authoritative re-read / max+1 / persist / idempotency
- Model allocation = **per Prefix**
- Reserve Model **ครั้งเดียวตอนสร้าง Form**
- New SKU grammar = **`[Prefix][Variant2][Model3]`**
- New Barcode = SKU
- Existing/legacy grammars **untouched**
- **L = FREEZE** สำหรับสินค้าใหม่
- ⏸️ **L replacement routing = DEFERRED** ไปที่ Prefix Registry design

**Sub-decisions ที่ owner ตอบ**: `D05 = A · Model allocation = per-Prefix · Grammar = keep
[Prefix][Variant2][Model3] · New Barcode = SKU · L routing = DEFERRED`

---

## D06 — Prefix Registry 🔒 LOCKED (มีส่วน ⏸️ DEFERRED)

- **Formal Registry** (Option A)
- Governance = **Owner + Admin ผ่าน UI**
- Storage = **Dedicated Sheet**
- อย่างน้อยต้องมีสถานะ **ACTIVE / FROZEN**
- **L = FROZEN** สำหรับสร้าง New Form/Product ใหม่เท่านั้น · existing L ไม่กระทบ คงเดิม
- พนักงานทั่วไป **ห้ามพิมพ์ Prefix เอง**
- New Form ต้องเลือก/ได้รับ Prefix จาก Registry ที่ ACTIVE
- ระบบ **ห้าม auto-create Prefix** เอง
- Prefix Registry **ไม่รับผิดชอบ** Prefix → Family/Category mapping โดยตรง (D02/D04 ล็อกไว้แล้วว่า
  Prefix ≠ Family และ ≠ Category)
- Prefix Registry เป็น independent namespace registry — ไม่ผูก 1:1 กับ Category

**สำหรับ L (ตามที่ owner ล็อก):**
- L = FROZEN · ห้ามออก Model ใหม่ใน L · SKU/Barcode เดิมของ L ห้ามเปลี่ยน
- ⏸️ **การหาว่า Form ใหม่ที่เดิมอาจใช้ L ควรไปใช้ Prefix ไหน = logic ของ New Product/Form flow
  หลัง Registry พร้อม** · **ห้ามเดา** replacement prefix ตอนนี้ · เป็น policy ที่ต้องใช้ข้อมูล
  Registry + business decision ภายหลัง

---

## D07 — Business Family Registry 🔒 LOCKED

- **Formal Family Registry, Optional per Form** (Option C)
- Governance = **Owner + Admin ผ่าน UI** · Storage = **Dedicated Sheet**
- Business Family = real entity · มี canonical identity/ID + name
- **Optional** — Form อาจไม่มี Business Family ก็ได้
- ถ้า Form อยู่ใน Family → เก็บ explicit **family_id** relationship
- Prefix ≠ Family · Model Number ≠ Family
- **ห้าม derive Family จาก Prefix/Model/Category/SKU**
- Staff เลือก Family จาก Registry · **ห้ามใช้ free-text ที่ควบคุมไม่ได้เป็นค่า canonical**
- Existing products/SKUs immutable · Family metadata backfill ภายหลังแบบ phased migration
- **ห้าม auto-guess** Family ตอน migration เมื่อหลักฐานกำกวม → human review
- Family Registry independent จาก Prefix Registry และ Category Registry
- Family = business grouping layer, **ไม่ใช่** SKU-generation mechanism

---

## D08 — Product Type/Form Registry 🔒 LOCKED

- **Formal Form Registry, editable** (Option A)
- Governance = **Owner + Admin ผ่าน UI** · Storage = **Dedicated Sheet**
- Form = real entity · มี canonical **form_id** ที่ stable ไม่เปลี่ยน
- Form รองรับ **nullable family_id** (เพราะ D07: Family optional)
- **Form owns Variant Rule** (ตาม D03)
- Form เก็บ **Prefix + Model Number** ที่ D05 จองให้
- Form identity **ห้าม derive จาก SKU string** ทุกครั้งอีกต่อไป
- Existing SKU/Barcode ห้ามเปลี่ยน · Existing Forms backfill แบบ phased migration
- Legacy/ambiguous Forms **ห้าม auto-guess** → human review
- Form Registry รองรับค้นหา/ตรวจ duplicate ก่อนสร้าง Form ใหม่
- Form metadata **editable** ในอนาคต (Product Edit เป็น requirement)
- **ห้ามใช้ Form Registry เปลี่ยน SKU ของสินค้าที่มีอยู่แล้ว**
- Form Registry = ERP domain master ของ metadata ของ Form · ZORT ยังเป็น operational master ตาม D04
- **ห้ามให้พนักงานกรอก form_id / Prefix / Model / Variant Code เองเป็น raw identity** — ระบบจัดการเอง
- New Product flow ต้องสร้าง/เลือก Form ก่อน แล้วระบบจึงจัดการ Prefix + Model + Variant code + SKU

---

## D09 — Variant Value Registry 🔒 LOCKED

- **Formal Registry per Axis** (Option A)
- Color **seed จาก `VARIANT_COLOR_CODES` เดิม (99 รหัส)**
- Size / Material / Style เริ่มว่าง · populate ตาม business need จริง
- Governance = **Owner + Admin ผ่าน UI** · Storage = **Dedicated Sheet**
- Variant code เป็น **axis-scoped** (ไม่ unique ข้าม axis)
- Staff เลือก **readable value** · System map value → SKU code

---

## D10 — Legacy Migration / Backfill 🔒 LOCKED

- **Sequential** (D10A = A): (1) Prefix Registry → (2) Business Family Registry → (3) Product Type/Form Registry
- ทุก stage: **Preview → Human Review → Apply**
- Existing SKU / Barcode **ห้ามเปลี่ยน**
- **ห้าม auto-guess** ambiguous mapping
- High-confidence = **proposal เท่านั้น** ต้อง human review ก่อน write
- **UNCLASSIFIED / NEEDS_REVIEW = permanent terminal state ได้** ถ้าหลักฐานไม่พอ (D10B = 2)
- **Success = data integrity ไม่ใช่ 100% classification coverage**

---

## D11 — Add Product UI / Creation Flow 🔒 LOCKED

- **Two-track flow** (Option B)

**Track 1 — New Form:**
1. สร้าง/เลือก Business Family
2. สร้าง Product Type/Form ใหม่
3. ระบบจัดการ Prefix + Model ตาม Registry (D06) และ SKU Generation Authority (D05)
4. เลือก Variant ผ่าน readable Variant Value ตามกฎของ Form (D03/D09)
5. พนักงาน **ห้ามกรอก raw Prefix / Model / Variant Code**
6. **Preview → Human Review/Confirm ก่อนสร้างจริง**

**Track 2 — New Variant of Existing Form:**
1. ค้นหาและเลือก Product Type/Form เดิม
2. Family / Prefix / Model **inherit จาก Form เดิม**
3. พนักงานเลือกเฉพาะ Variant Value ที่ต้องการ
4. ระบบ map Business Variant → SKU Variant Code เอง · **ห้ามกรอก raw Variant Code**
5. New SKU ใช้ **Model เดิมของ Form** · คง grammar `[Prefix][Variant2][Model3]`
6. Existing SKU / Barcode **ห้ามแก้**

**Dependencies ที่เคารพ (ไม่ reopen)**: D02, D03, D05, D06, D07, D08, D09, D10

---

## D12 — ZORT→ERP Sync Direction Reconciliation for ERP-Master Fields 🔒 LOCKED (⏸️ core DEFERRED)

- **Option B = Defer** · **12A = YES**

**Locked resolution:**
- **ERP-master fields** (Name, Category, Sell Price, new Barcode, Tag): **ERP → ZORT** เป็น primary direction (D01/D04)
- **Stock / Qty**: **ZORT → ERP** ต่อไป (ZORT operational master ตาม D04) — **12A = YES**
- **Current ZORT→ERP metadata pull ปัจจุบัน**: ⏸️ **temporary compatibility state** — คงไว้ชั่วคราวจนกว่า
  Product Edit + sync reconciliation จะพร้อม

**เงื่อนไขผูกมัดของการเลื่อน (ตามที่ owner ล็อก):**
1. เมื่อ Product Edit / Phase F ถูกทำจริง → sync-direction reconciliation **ต้อง land ในการ implement
   เดียวกัน** (ไม่แยก ไม่ทำทีหลัง)
2. หลังจุดนั้น: ERP เป็น master ของ ERP-domain fields · ZORT ต้องไม่ overwrite กลับแบบเงียบ ๆ
3. ⚠️ **ห้ามตีความ D12=B ว่าอนุญาตให้ Product Edit ship ก่อน sync guard/reconciliation พร้อม** — ทั้งสอง
   แยกกันไม่ได้

---

## ขอบเขตและข้อยืนยัน

- **D01–D12 คือช่วงการตัดสินใจทั้งหมดของ Work 8 — ครบถ้วน** · **ไม่มี D13** และเอกสารนี้ไม่สร้าง decision ใหม่
- เอกสารนี้ **บันทึก** การตัดสินใจเท่านั้น — ยังไม่มีการ implement / สร้าง Registry / migration / Sheet /
  deploy ใด ๆ จาก D01–D12
- ทุกการตัดสินใจสร้างจากข้อความ OWNER-LOCKED ในบทสนทนา — ไม่ตีความใหม่ ไม่เปลี่ยน intent/dependency/
  deferral/constraint
- ⚠️ **หมายเหตุแหล่งที่มา**: `docs/PRODUCT-IMPLEMENTATION-SPEC.md` มีชุด "D01–D05" **คนละชุด** (Legacy L /
  Field Ownership / Supplier Review / ZORT Sync / Dataset Provenance) ซึ่งเป็น decision track เก่าคนละอัน
  กับ Work 8 นี้ — อย่าสับสนสองชุดนี้เข้าด้วยกัน
