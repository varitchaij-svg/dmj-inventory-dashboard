# ADR — ทำให้งาน MTO ขายผ่าน POS ได้ (Phase 2, ส.ค. 2026)

สถานะ: **Accepted** — Step 1-4 implement แล้ว (ยังไม่ commit/deploy ณ เวลาที่เขียนเอกสารนี้)

เอกสารนี้บันทึก **เหตุผล** ของการตัดสินใจสถาปัตยกรรมที่ทำในฟีเจอร์นี้ ไม่ใช่ how-to — เป้าหมาย
คือกันไม่ให้ใครในอนาคต (รวมถึง Claude ในเซสชันถัดไป) แก้โค้ดแล้วเผลอทำให้ **สต็อกถูกหักสองที่**
หรือ **กฎ "ขายได้ไหม" ถูกเขียนซ้ำคนละที่** โดยไม่รู้ว่าทำลายอะไรไป

---

## บริบท / ปัญหา

งาน MTO (จัดแบบพิเศษ — ช่อดอกไม้/ของตกแต่งที่จัดตามสั่ง) มีอยู่แล้วในระบบ (`SHEET_MTO_JOBS`,
`createMtoJob`, `closeMtoJob`) แต่ **ขายไม่ได้** — เจ้าของต้องจดราคาแยกแล้วไปออกบิลเองนอกระบบ
โจทย์: ทำให้ POS ขายงาน MTO ได้ **โดยไม่ทำ Bundle System เต็มรูป** (ไม่ต้องมีระบบ "ประกอบสินค้า"
ทั่วไป — เอาแค่ MTO ที่มีอยู่แล้วมาขายได้)

---

## Decision 1 — สอง State Machine แยกกันเด็ดขาด

งาน MTO มี **สถานะอิสระ 2 ตัว** ไม่ใช่ตัวเดียว:

| | ค่า | เขียนโดย | คอลัมน์ |
|---|---|---|---|
| **Fulfillment** ("จัดเสร็จหรือยัง") | `กำลังจัด` → `เสร็จแล้ว` | `applyMtoFulfillment_` | G (col 7) |
| **Sale** ("ขายหรือยัง") | `ยังไม่ขาย` → `ขายแล้ว` / `ยกเลิก` | `markMtoJobSold_` | K (col 11) |

**เหตุผล**: ก่อนหน้านี้ระบบมีสถานะเดียว (fulfillment) แล้วเดิมพัน "ปิดงาน = ขายแล้ว" (ที่จริงคือ
`createZortSaleOrder_` แอบสร้าง order ราคา 0 ตอนปิดงานเลย) — ผูกสองแนวคิดที่ไม่เกี่ยวกันเข้าด้วยกัน
งาน MTO ที่จัดเสร็จแล้วแต่ยังไม่มีลูกค้ามารับ/จ่ายเงิน กับงานที่ขายและรับเงินแล้ว เป็นคนละเรื่อง

**ผลที่ตามมา**: สต็อกไม่รอ "ขาย" ก่อนหัก (ดู Decision 2) และการขายไม่ทำให้จัดของ (ห้าม auto-fulfill
ตอนขาย — ถ้าอยากขายงานที่ยังไม่จัดเสร็จ ต้องไปกด "ปิดงาน" ที่หน้า MTO ก่อน `createSaleBill`
**ไม่เรียก** `applyMtoFulfillment_` เลยแม้แต่ทางอ้อม)

**⚠️ ห้าม**: เพิ่มสถานะที่ 3 ที่พยายาม "รวม" สองอันนี้ (เช่น enum เดียว `กำลังจัด/เสร็จแล้ว/ขายแล้ว`)
— จะกลับไปเป็นปัญหาเดิมที่แก้อยู่นี้พอดี

---

## Decision 2 — หักสต็อกตอน "จบการจัด" ไม่ใช่ตอนจ่ายเงิน

สต็อกองค์ประกอบ (DMJ sheet + ZORT) ถูกหัก **ครั้งเดียว** ที่ `applyMtoFulfillment_` /
`decreaseMtoStockInZort_` (เรียกจาก `closeMtoJob`) — **ไม่ใช่** ตอน `createSaleBill`

**เหตุผล**: ของถูก "ใช้ไปแล้วจริง" ตั้งแต่ตอนจัดเสร็จ (ดอกไม้ถูกตัด/ประกอบแล้ว) ไม่ว่าจะขายวันนี้
พรุ่งนี้ หรือยกเลิกไม่ขายเลยก็ตาม — ผูกกับ "ขาย" จะทำให้เลขสต็อกไม่ตรงกับของจริงบนชั้น

**ที่ยืนยันด้วย test**: `tests/mto-pos-e2e.test.js` STAGE 4 — เช็คตรง ๆ ว่าหลัง `createSaleBill`
ขายงาน MTO แล้ว **คอลัมน์คลัง (H) ของสินค้าองค์ประกอบไม่ขยับอีก** (หักไปแล้วตอน STAGE 2)

**⚠️ ห้าม**: ให้ `createSaleBill`/`splitMtoSaleItems_`/`deductFrontStoreForSale_` แตะสต็อก
องค์ประกอบของ MTO เด็ดขาด — โค้ดปัจจุบันกันไว้แล้วด้วยการตัดบรรทัด MTO ออกจาก `deductItems`
ก่อนส่งเข้า `deductFrontStoreForSale_` (ดู `splitMtoSaleItems_`) — **อย่าลบ filter นี้ออก**

---

## Decision 3 — ZORT ได้ SKU เดียว ราคาเดียวต่องาน (ไม่ใช่ Order ราคา 0)

**Superseded**: ตัวเลือกก่อนหน้า (Option A — ให้ `closeMtoJob` สร้าง ZORT Order ราคา 0 ผ่าน
`createZortSaleOrder_`) **ถูกยกเลิกและลบโค้ดทิ้งแล้ว** (Step 4, ส.ค. 2026)

**Final**: เมื่อ POS ขายงาน MTO — ZORT ได้รับ **1 บรรทัด** สินค้าชื่อ `MTO_BUNDLE_SKU`
(Script Property, เจ้าของสร้างสินค้า placeholder นี้ใน ZORT เอง) ที่ **ราคาเดียวกับ `job.price`**
ส่วนสต็อกองค์ประกอบถูกตัดไปแล้วตอน fulfillment ผ่าน `decreaseMtoStockInZort_`
(`POST /Product/DecreaseProductStockList`) ซึ่ง **ไม่สร้าง order/เอกสารขายใน ZORT เลย**

**เหตุผลที่ต้องเปลี่ยน (ไม่ใช่แค่ทำตามสั่ง — พิสูจน์แล้วจากโค้ดจริง)**:
`aggregateAndWriteSales_` (ตัวป้อนชีต "ยอดขายรายเดือน/รายวัน" → `monthlyByCat`/`dailyByCat` ใน
payload → StockView "ควรสั่ง", OverviewView velocity/momMovers, dead-stock, ABC classification)
ดึง **ทุก** order จาก ZORT `GetOrders` โดยกรองแค่ `status==="Success"` — **ไม่กรอง remark/ราคา
ไม่กรอง MTO เลย** ถ้า order ราคา 0 ของ `createZortSaleOrder_` ได้ status "Success" (คาดว่าใช่ —
ไม่มีอะไรในโค้ดกันไว้) SKU องค์ประกอบจะได้ `soldQty` ปลอมเจือปนเข้าไปในทุกแดชบอร์ดที่อิงยอดขาย
โดยไม่มีรายได้จริงคู่กัน — ตรงกับคำว่า **"polluted reports"** ที่โจทย์เดิมสั่งให้เลี่ยงตรงตัว

**⚠️ ห้าม**: เพิ่ม `/Order/AddOrder` กลับเข้า fulfillment path (`closeMtoJob`/
`applyMtoFulfillment_`) ไม่ว่าจะราคาเท่าไหร่ก็ตาม (แม้ราคา 0) — ให้ ZORT ยิงเฉพาะตอน POS ขายจริง
เท่านั้น ผ่าน `createSaleBill`

**ผลข้างเคียงที่ตั้งใจยอมรับ**: SKU องค์ประกอบจะ**ไม่มี** `soldQty`/velocity โผล่ใน dashboard จาก
การถูกใช้ทำ MTO อีกต่อไป (ต่างจากพฤติกรรมเดิมที่ยังไม่ยืนยันว่าเคยเกิดจริงหรือไม่ — ดู "ความเสี่ยง
ที่ยังไม่ปิด" ด้านล่าง) — เจตนา: การถูกใช้เป็นองค์ประกอบ MTO ไม่ใช่ "ยอดขาย" ไม่ควรถูกนับเป็น
ยอดขายไม่ว่าทางใดก็ตาม (สอดคล้องกับ `SHEET_UNSCANNED_SALE`/"ขายไม่สแกน" ที่มีอยู่แล้วในระบบ
ซึ่งจงใจแยก `soldQty` ออกจาก `soldRev` เช่นกัน แต่เป็นกลไกคนละอันคนละจุดประสงค์ — **ห้ามเอามา
ผูกกับ MTO** เพราะ MTO ถูก track เต็มอยู่แล้วในชีต "วัตถุดิบ MTO" ไม่ใช่ของหายที่ไม่รู้สาเหตุ)

---

## Decision 4 — กฎ "ขายได้ไหม" มีจุดเดียว: `canSellMtoJob_`

**ทุกที่** ที่ต้องรู้ว่างาน MTO ขายได้หรือยัง **ต้องเรียก `canSellMtoJob_(job)`** — ห้ามเทียบ
`status`/`saleStatus` ตรง ๆ ที่จุดอื่นเด็ดขาด

```js
function canSellMtoJob_(job) {
  const fulfilled = job.status === MTO_FULFILL_DONE;         // "เสร็จแล้ว"
  const unsold = (job.saleStatus === "" || job.saleStatus === MTO_SALE_UNSOLD);
  return fulfilled && unsold;
}
```

ผู้เรียกทั้งหมดในระบบ ณ ตอนเขียนเอกสารนี้:
- **Backend**: `markMtoJobSold_` (เป็นตัวกั้นก่อนเขียน — งานที่ขายไม่ได้เขียนสถานะขายไม่ได้เลย)
  และ `readMtoJobs_` (คำนวณ `job.sellable` ส่งไปให้ frontend)
- **Frontend**: **ไม่มีเลย** — `PosView` filter ด้วย `job.sellable` ที่ backend คำนวณมาให้ตรง ๆ
  (ดู `tests/mto-pos-picker.test.js` — มี meta-test บังคับว่าต้องไม่มี `job.status === "เสร็จแล้ว"`
  หรือ `.saleStatus === ...` เขียนซ้ำในไฟล์ `views-analytics.jsx` เลย)

**เหตุผล**: เจ้าของสั่งไว้ชัดตอนอนุมัติ Step 3 — "future rule changes should only require updating
this helper" กฎวันนี้คือ "จัดเสร็จ + ยังไม่ขาย" แต่ถ้าวันหน้าอยากเพิ่มเงื่อนไข (เช่น ต้องมีรูปก่อน
ถึงขายได้) แก้ที่ `canSellMtoJob_` จุดเดียวจบ ไม่ต้องไล่หาทุกจุดที่เทียบ status เอง

**⚠️ ห้าม**: เขียน `if (job.status === "เสร็จแล้ว" && !job.saleStatus)` ซ้ำที่ไหนอีก — แม้จะดู
เหมือนสั้นกว่าเรียกฟังก์ชัน ก็คือการสร้างจุดสอง (drift risk) ที่ตรงตามที่ ADR นี้เขียนมากันไว้

---

## Decision 5 — `applyMtoFulfillment_` เป็น domain-pure ตัวเดียว ไม่รู้จัก POS/Cart/Bill

`applyMtoFulfillment_(ss, jobId, items, closedAt)` (Step 1, extract จาก `closeMtoJob` เดิม)
รู้จักแค่ "งาน MTO / วัตถุดิบ / สต็อก" — **ไม่ import/เรียกอะไรจากโดเมน POS เลย**

**เหตุผล** (เจ้าของสั่งไว้ตอนอนุมัติ Step 3): ความสัมพันธ์ MTO↔POS ต้องผูกกันที่ฝั่ง caller
(`createSaleBill` เรียก `splitMtoSaleItems_`/`markMtoJobSold_`) ไม่ใช่ให้ helper ระดับล่างรู้จัก
เรื่องขาย — งานนี้ยังเป็น helper ที่ `closeMtoJob` เรียกได้เหมือนเดิม 100% และวันหน้าถ้ามีจุดอื่นที่
ต้อง "จบการจัด" MTO (ไม่ผ่าน POS เลยก็ได้) ยังเรียกใช้ได้ตรง ๆ โดยไม่ต้องแกะ logic POS ออกก่อน

**⚠️ ห้าม**: ให้ `createSaleBill` เรียก `applyMtoFulfillment_` (หรือย้อนกลับ) — สอง state machine
ต้องคุมจากคนละฟังก์ชันเสมอ (ดู Decision 1)

---

## Decision 6 — Idempotency: `billCid` เก็บคู่กับสถานะขาย เพื่อ trace

`markMtoJobSold_` เขียน **คอลัมน์ N (billCid)** คู่กับคอลัมน์ K-M (สถานะ/ref/เวลา) — เพิ่มจากที่
เจ้าของขอไว้ตอนอนุมัติ Step 3 ("storing billCid together with billRef... for easier idempotency
tracing and debugging")

**เหตุผล**: `orderNumber`/`saleRef` บอกได้แค่ "ขายในบิลไหน" แต่ debug กรณี "ทำไมกดขายซ้ำแล้ว
ไม่เกิดไร" ต้องเห็น `billCid` ที่ client ส่งมาจริง ๆ เทียบกับ `sbill_<cid>` ใน CacheService —
ถ้ามีแค่ `orderNumber` จะไล่ไม่ออกว่า request ไหนที่ "ทำให้เกิดการ dedup"

**การันตีด้วย test**: `tests/mto-pos-e2e.test.js` STAGE 9-10 (ขายซ้ำด้วย billCid เดิม → dedup,
ไม่ยิง ZORT ซ้ำ · ขายซ้ำด้วย billCid ใหม่ → ปฏิเสธก่อนแตะ ZORT เพราะเช็ค `canSellMtoJob_` ก่อนเสมอ)

---

## ตาราง "ใครหักสต็อกตรงไหน" (single source of truth — กันหักซ้ำ)

| เหตุการณ์ | DMJ Sheet (col G/H) | ZORT | ฟังก์ชัน |
|---|---|---|---|
| ปิดงาน MTO (fulfillment) | ✅ หัก 1 ครั้ง | ✅ หัก 1 ครั้ง (`DecreaseProductStockList`) | `applyMtoFulfillment_` + `decreaseMtoStockInZort_` |
| ขายงาน MTO ผ่าน POS (checkout) | ❌ ไม่แตะ (ตัดออกจาก `deductItems` แล้ว) | ❌ ไม่แตะ (ไม่มี order component — มีแต่ bundle SKU) | `createSaleBill` (แต่ `splitMtoSaleItems_` กันไว้) |
| ขายสินค้าปกติ (ไม่ใช่ MTO) ผ่าน POS | ✅ หัก (col G เท่านั้น) | ✅ หัก (ผ่าน `AddOrder`) | `createSaleBill` (เหมือนเดิมทุกประการ ไม่เปลี่ยน) |

**กติกาที่ห้ามผิด**: แถวไหนมี `it.mtoJobId` → **ห้ามปรากฏใน `deductItems`** และ **`sku` ใน
`zortItems` ต้องถูกแทนด้วย `MTO_BUNDLE_SKU` เสมอ** — ทั้งสองอย่างนี้ทำโดย `splitMtoSaleItems_`
ฟังก์ชันเดียว (ดู `tests/mto-sale-status.test.js` — มี test คุม "ไม่ mutate items เดิม" +
"บรรทัด MTO ไม่เข้า deductItems" ไว้แล้ว)

---

## ความเสี่ยง/ข้อจำกัดที่ยังไม่ปิด (บอกไว้ตรง ๆ ไม่ใช่เดา)

1. **ยังไม่ยืนยันจาก ZORT จริงว่า order ราคา 0 ของ `createZortSaleOrder_` (โค้ดเก่าที่ลบไปแล้ว)
   เคยได้ status "Success" จริงหรือไม่** — วิเคราะห์จากโค้ด `aggregateAndWriteSales_` เท่านั้นว่า
   "ถ้าได้ Success จะเจือปน" แต่ Step 4 ปิดความเสี่ยงนี้ไปแล้วโดยไม่ต้องรู้คำตอบ (เพราะเปลี่ยนไปใช้
   endpoint ที่ไม่สร้าง order เลย) — ถ้าใครอยากรู้ย้อนหลังว่าเคยเจือปนจริงไหม ต้องไปดู
   `ยอดขายรายเดือน`/`ยอดขายรายวัน` เทียบกับชีต "วัตถุดิบ MTO" เอง (นอกขอบเขตงานนี้)
2. **`MTO_BUNDLE_SKU` ต้องมีอยู่จริงใน ZORT และตั้งเป็น Script Property ก่อนขายงาน MTO ได้**
   — ยังไม่ยืนยันว่า ZORT ฝั่ง stock ของสินค้า placeholder นี้ควรตั้งเป็นเท่าไหร่/ต้อง track สต็อก
   ไหม (ถ้า track แล้วไม่เติมสต็อกเลย ตัวสินค้านี้จะโชว์ "หมด" ใน ZORT แม้ยังขายได้จริงในแอป —
   เจ้าของต้องตัดสินใจตอนสร้างสินค้านี้ใน ZORT เอง ไม่ใช่เรื่องที่โค้ดฝั่งเราคุมได้)
3. **ยังไม่มีหน้า UI ให้เจ้าของดู "ประวัติของเข้า/ออกของ MTO_BUNDLE_SKU"** — ยอดขาย MTO ที่แท้จริง
   ต้องไปดูที่ชีต "งาน MTO" (คอลัมน์สถานะขาย) หรือ ZORT โดยตรง ยังไม่มี dashboard สรุปในแอป (ok
   ตามขอบเขตที่สั่งไว้ — Feature 1 ไม่รวม dashboard ใหม่)

---

## แผนที่เทสต์ (ใครคุมอะไร — ใช้ตอนแก้โค้ดจุดนี้ในอนาคต)

| ไฟล์ | คุมอะไร |
|---|---|
| `tests/mto.test.js` | `netOf`, `writeMtoItemsCore` (ตรรกะเดิมของ fulfillment ที่ไม่เปลี่ยน) |
| `tests/mto-sale-status.test.js` | `canSellMtoJob_`, `markMtoJobSold_` (idempotent+gate), `splitMtoSaleItems_`, `validateMtoJobsSellable_`, จุดเชื่อม `createSaleBill`↔MTO |
| `tests/mto-pos-picker.test.js` | frontend ใช้ `sellable` ตรง ๆ ไม่ re-derive, picker แสดงฟิลด์ครบ, qty ล็อก 1, ไม่มี component ใน cart |
| `tests/mto-pos-e2e.test.js` | **integration เต็มเส้นทาง** (eval ทั้ง `.gs` จริง) — สร้าง MTO → Fulfill → POS → Checkout → Audit → Sheet → ZORT payload → กันขายซ้ำ + `decreaseMtoStockInZort_` เดี่ยว ๆ (success/skip/partial-fail) |

**กติกาเวลาแก้ต่อ**: ถ้าแก้ `canSellMtoJob_`/`applyMtoFulfillment_`/`splitMtoSaleItems_`/
`markMtoJobSold_` แล้วเทสต์ 4 ไฟล์นี้ยังผ่านครบ = ยังไม่ทำลาย invariant ที่ ADR นี้บันทึกไว้
ถ้าแก้แล้วเทสต์ต้องแก้ตามด้วย **ให้กลับมาอ่าน ADR นี้ก่อนว่าเทสต์ที่แดงกำลังปกป้อง decision ข้อไหน**
ก่อนแก้เทสต์ทิ้งเฉย ๆ
