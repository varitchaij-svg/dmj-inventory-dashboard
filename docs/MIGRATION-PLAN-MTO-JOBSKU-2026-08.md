# Migration Plan — MTO_BUNDLE_SKU → Job SKU (VASE/BK/BQ/LP/TREE/VG)

**สถานะ**: 📋 แผน — ยังไม่ implement · ยังไม่ commit
**บริบท**: ต่อยอด/แทนที่ `docs/ADR-MTO-SELLABLE-2026-08.md` (Feature 1) เฉพาะส่วนที่เกี่ยวกับ SKU ที่ใช้ตอนขาย
**การตัดสินใจ**: Option B (Job SKU) แทน Option A (`MTO_BUNDLE_SKU`) — อนุมัติแล้ว (ส.ค. 2026)

---

## 0. ทำไมเปลี่ยน (สรุปจาก Design Review)

Requirement เปลี่ยนจาก "หา SKU ให้ ZORT รับรายได้ MTO" เป็น **"รู้ต้นทุน/margin ต่อประเภทงาน"** —
`MTO_BUNDLE_SKU` (SKU เดียวรวมทุกงาน) ตอบโจทย์แรกได้แต่ตอบโจทย์ใหม่ไม่ได้เลยโดยโครงสร้าง เพราะยอดขาย
MTO ทุกประเภทจะกองที่ SKU เดียวใน ZORT แยกไม่ออกว่า "งานไหนกำไรมาก/น้อย"

ระบบมี SKU ประเภทงานอยู่แล้วจริง (`VASE001-020, BK001-020, BQ001-020, LP001-020, TREE001-020, VG001-020`
หมวด "Made to Order จัดแบบพิเศษ") ใช้บันทึกยอดขายใน ZORT อยู่แล้ว (production-proven) — ใช้ตัวนี้แทนสร้าง
SKU ปลอมใหม่

## 0.1 ข้อเท็จจริงที่ทำให้ migration นี้ "เบา" กว่าที่คิด

**`MTO_BUNDLE_SKU` ไม่เคยถูกตั้งค่าจริงใน production เลย** (ยืนยันจากบทสนทนาการ deploy F1 — เจ้าของ
ตอบ "ยังไม่มี — จะไปสร้างก่อน" แล้วหยุดไปทำ design review แทน) เพราะ `createSaleBill` ปฏิเสธการขาย MTO
ทั้งหมดถ้า Script Property นี้ว่าง (fail-safe บรรทัด "ยังไม่ได้ตั้งค่า MTO_BUNDLE_SKU...") →
**ไม่มีงาน MTO ไหนถูกขายผ่าน POS จริงสักงานเดียวภายใต้ระบบเดิม** ดังนั้น:
- ⚠️ **ไม่ต้อง migrate ข้อมูลงานที่ "ขายไปแล้ว"** — ไม่มีอยู่จริง
- สิ่งที่ต้อง backfill มีแค่ "งานที่สร้างไว้แล้วแต่ยังไม่ขาย" (`saleStatus` ว่าง/`ยังไม่ขาย`) ให้มี `jobSku`
  ก่อนจะขายได้ภายใต้ระบบใหม่

---

## 1. Schema Change

**`SHEET_MTO_JOBS` เพิ่มคอลัมน์ O = `jobSku`** (ต่อท้ายเท่านั้น — กฎ repo ข้อ 5 ห้ามแทรกกลาง)

Header ปัจจุบัน (A–N, 14 คอลัมน์):
```
A=JobID B=วันที่ C=ชื่องาน D=ลูกค้า E=ราคา F=รูป G=สถานะ H=ปิดงานเมื่อ
I=ผู้รับผิดชอบ(staffId) J=ชื่อผู้รับผิดชอบ K=สถานะขาย L=อ้างอิงบิลขาย M=ขายเมื่อ N=billCid ขาย
+ O=รหัสประเภทงาน (jobSku)  ← ใหม่
```

`getOrCreateMtoJobSheet_` ต้อง self-heal เติม header O ให้ชีตเก่า (pattern เดียวกับที่ทำกับ K–N ตอน F1
— เช็ค `sh.getRange(1, 15).getValue()` ว่าง → เติม `"รหัสประเภทงาน"`)

---

## 2. Backend (`appsscript_complete.gs`)

| ฟังก์ชัน | เปลี่ยนอะไร |
|---|---|
| `createMtoJob` | รับ `data.jobSku` → validate ว่ามีจริงในหมวด "Made to Order จัดแบบพิเศษ" (เทียบกับ `readProducts_`/catalog เหมือน `checkSkuExists`) → `appendRow` เพิ่มค่าที่ index 15 (col O) |
| `readMtoJobs_` | เพิ่ม `job.jobSku = String(r[14]\|\|"").trim();` |
| **`validateMtoJobsSellable_`** | ⭐ จุดขยายหลัก — เปลี่ยนจากคืน `{ok, jobId, message}` เป็นคืน `{ok, jobId, message, jobSku}` ต่อ job (อ่านคอลัมน์ O เพิ่มในลูปที่มีอยู่แล้ว — **ไม่เพิ่มการอ่านชีตใหม่** เพราะ `createSaleBill` เรียกฟังก์ชันนี้อยู่แล้ว ไม่เคยเรียก `readMtoJobs_`) |
| `splitMtoSaleItems_(items, bundleSku)` | เปลี่ยน signature เป็น `splitMtoSaleItems_(items, jobSkuMap)` — `jobSkuMap = {jobId: jobSku}` แทนค่าเดียว · แทน `sku: bundleSku` เป็น `sku: jobSkuMap[jobId]` ต่อบรรทัด · ยังเป็น pure function เหมือนเดิม (ไม่แตะชีต) |
| `createSaleBill` | ลบการเรียก `readMtoBundleSku_()` + เงื่อนไข error เดิม · เปลี่ยนมาสร้าง `jobSkuMap` จากผลของ `validateMtoJobsSellable_` (ที่เรียกอยู่แล้ว) ก่อนเรียก `splitMtoSaleItems_` · **เพิ่มเงื่อนไขใหม่**: job ไหนไม่มี `jobSku` (ว่าง) → reject ทั้งบิลด้วยข้อความชัดเจน "งาน {jobId} ยังไม่ได้กำหนดประเภทงาน" (แทนที่เงื่อนไข `!mtoBundleSku` เดิม) |
| `readMtoBundleSku_()` | เลิกเรียกใช้จากทุกจุด — ไม่ต้องลบไฟล์ทิ้ง (ลด diff/ความเสี่ยง) แต่ควร comment กำกับว่า "ไม่ใช้แล้ว เก็บไว้เผื่อ rollback" ไม่ให้ future session สับสนว่ายังจำเป็นอยู่ |

⚠️ **`applyMtoFulfillment_`/`decreaseMtoStockInZort_`/`closeMtoJob` ไม่ต้องแตะเลย** — ไม่รู้จัก SKU ที่จะขายอยู่แล้ว (ตามที่ยืนยันใน Design Review)

---

## 3. Frontend (`views-analytics.jsx`)

| จุด | เปลี่ยนอะไร |
|---|---|
| ฟอร์มสร้างงาน MTO (ใน `MtoJobView`) | เพิ่มขั้นเลือก "ประเภทงาน" จาก catalog หมวด MTO — **reuse `mtoGroupProducts_`/`mtoSkuPrefix_`/`mtoGroupLabel_`** (นิยามอยู่ใน `views-quote.jsx`) ได้ตรงๆ เพราะลำดับโหลดตามที่ CLAUDE.md ยืนยัน: `views-main → views-analytics → views-quote → views-attendance → app.jsx` — แม้ `views-quote.jsx` โหลด**หลัง** `views-analytics.jsx` แต่ฟังก์ชันเป็น global scope เดียวกัน และ `MtoJobView` เป็น React component ที่ render จริงหลังทุกสคริปต์โหลดครบแล้ว (เหมือน pattern `ProductModal` ที่ CLAUDE.md อธิบายไว้) → เรียกได้จริง ไม่ error |
| `addMtoJobToCart` (POS) | **ไม่ต้องแก้เลย** — ยังส่ง `sku: job.jobId` (placeholder) เหมือนเดิม เพราะ backend เป็นคนสลับ SKU ไม่ใช่ frontend |
| การ์ดงานใน MTO Picker | แนะนำ (ไม่บังคับ): โชว์ `job.jobSku` ให้พนักงานเห็นว่างานนี้จะขึ้นเป็น SKU อะไรใน ZORT — ความโปร่งใส ไม่ใช่ requirement เชิงฟังก์ชัน |

---

## 4. คำถามที่ต้องตอบก่อน implement จริง (ยังเปิดอยู่)

**เลือก `jobSku` ตอนไหน?**
1. **ตอนสร้างงาน** (แนะนำ) — รู้ประเภทงานตั้งแต่ต้น ใช้วางแผนคลังได้ด้วย
2. ตอนปิดงาน (fulfillment)
3. ตอนขาย (POS) — เสี่ยง UX สะดุดกลางทางถ้าลืมเลือก

ถ้าเลือกข้อ 1 (แนะนำ): `createMtoJob` บังคับ `jobSku` เป็น required field ทันที (backfill เฉพาะงานเก่าที่ยังไม่ขาย)
ถ้าเลือกข้อ 2/3: ต้องมี UI แก้ไข `jobSku` ย้อนหลังได้ (endpoint ใหม่ หรือรวมกับ `assignMtoJob` เดิม) — งานเพิ่ม

---

## 5. Backfill งานเก่า (เฉพาะที่ยังไม่ขาย — ดูข้อ 0.1)

**Fail-safe ที่แนะนำ** (ปลอดภัยกว่าเดา): งานที่ `jobSku` ว่าง → ปุ่มขายใน POS Picker **ไม่โผล่ในรายการ
sellable เลย** (หรือโผล่แต่กดไม่ได้ + ข้อความ "ยังไม่ได้กำหนดประเภทงาน") จนกว่าเจ้าของ/ผู้รับผิดชอบจะ
ไปกรอกผ่านหน้าที่เหมาะสม (ต่อยอดจาก `assignMtoJob` หรือเมนูแก้ไขงาน)

ไม่แนะนำ auto-migration script เดา `jobSku` จากชื่องาน (`jobName`) — ผิดหลัก "ห้ามเดา" ของ repo นี้
(ตัวอย่าง: ชื่องาน "จัดพวงหรีดคุณสมชาย" เดาไม่ได้ว่าตรงกับ `VASE003` หรือ `VASE007`)

---

## 6. Test ที่ต้องแก้ (จาก diff ของ F1)

- `tests/mto-pos-e2e.test.js`, `tests/mto-pos-picker.test.js`, `tests/mto-sale-status.test.js` —
  รื้อเคสที่ mock/assert single bundle SKU → เปลี่ยนเป็น per-job SKU map
- `tests/online-sale.test.js` — ส่วนที่แตะ `splitMtoSaleItems_`/`createSaleBill` MTO path
- **เพิ่มเคสใหม่**: บิลเดียวมีหลายงาน MTO คนละประเภท (คนละ jobSku) ในบรรทัดเดียวกัน · งานไม่มี jobSku
  ต้อง reject พร้อมข้อความชัดเจน · jobSku ที่กรอกไม่อยู่ในหมวด MTO ต้องถูก validate ตอนสร้างงาน

---

## 7. Rollback Plan

เนื่องจากยังไม่มีข้อมูลจริงใต้ระบบเดิม (ข้อ 0.1) **ไม่มีความเสี่ยง data migration ย้อนกลับไม่ได้** —
ถ้า Option B มีปัญหาหลัง implement สามารถ revert commit ได้ตรงๆ โดยไม่ต้องกู้ข้อมูล

## 8. สิ่งที่ยังไม่แก้ในรอบนี้ (ตั้งใจ — คนละปัญหา)

**ต้นทุนวัตถุดิบยังไม่มีในระบบ** (PO ทุกใบ `pricepernumber=0` — ไม่มีใครกรอกราคาตอนสร้าง PO ใน ZORT)
Option B ทำให้ "รู้ว่าใช้วัตถุดิบอะไรต่องาน" ได้ (มีอยู่แล้วใน `SHEET_MTO_ITEMS`) แต่ "รู้ว่าวัตถุดิบนั้นราคา
เท่าไหร่" เป็นปัญหาคนละชั้น **ยังคำนวณ margin จริงไม่ได้จนกว่าจะแก้เรื่องต้นทุนก่อน** — เจ้าของรับทราบแล้ว
ไม่ใช่ scope ของงานนี้
