# HANDOFF — ผลตรวจทั้งระบบ (scrutinize 10 ส.ค. 2026)

เอกสารนี้ = **สรุปว่าตรวจอะไรไปบ้าง + แก้อะไรไปแล้ว + ยังเหลืออะไรให้สั่งต่อ**
เป็นผลจากการตรวจ end-to-end งานทั้งชุดที่ merge เข้า `master` ตั้งแต่ Phase 7.3 (70 commit,
~14,000 บรรทัด) — **ทุกอย่างที่ตรวจอยู่บน production แล้ว** (Cloudflare + GAS auto-deploy)
ไม่ใช่ diff ก่อน merge

Baseline ที่รันยืนยัน: unit **1671/1671 ผ่าน** (หลังเพิ่มเทสต์รอบนี้) · browser **91/91 ผ่าน**

---

## ✅ แก้ไปแล้วในรอบนี้ (Blocker + ของถูกที่แก้พร้อมกัน)

### 🔴 ออกบิลขายซ้ำ — createSaleBill ไม่มีตัวกันซ้ำ + อ่านคำตอบด้วย res.json() ดิบ

**อาการที่จะเกิด**: ผู้ขายกด "บันทึกการขาย" → GAS ยิง AddOrder + หักสต็อก + เขียนชีตเสร็จแล้ว
แต่ตอบกลับเป็น**หน้า HTML** (execution ซ้อนกัน เพราะ `executeAs: USER_DEPLOYING` ทุกคนรัน
ในฐานะ user เดียวกัน) หรือ browser ตัดสายที่ 60 วิ → จอขึ้น `Unexpected token '<'…` →
ผู้ขายกดใหม่ = **บิลซ้ำใน ZORT + สต็อกหน้าร้านหักสองเด้ง + ใบกำกับภาษีซ้ำ** (เส้นทางเดียว
ในระบบที่รับเงินลูกค้าจริง และเป็นเส้นทางเดียวที่ยังไม่มีตัวกันซ้ำเหมือน order/transfer)

**แก้แล้ว** (หลักเดียวกับ `cid` ของ `action=order` และ `tid` ของ `transferStockBatch` เป๊ะ):
- **ฝั่ง GAS** (`appsscript_complete.gs`)
  - เพิ่มคอลัมน์ **AD `billCid`** ในชีต "บิลขาย" (`SALE_BILL_HEADERS_` — ต่อท้าย ไม่แทรกกลาง)
    · ตั้ง `setNumberFormat("@")` เทียบ string ตรงตัว
  - `createSaleBill` เช็ค `billCid` ซ้ำ **ในล็อก ก่อนแตะ ZORT** — เจอแล้วคืนผลเดิม (`dedup:true`)
    ไม่ยิง AddOrder ใหม่ ไม่หักสต็อกใหม่ · ดู cache (`sbill_<cid>`, 6 ชม.) ก่อน แล้วถอยไปดูชีต
    (`findBillCidRow_`, อ่าน 600 แถวท้าย ไม่ getDataRange)
  - เก็บผลไว้ตอบซ้ำหลังสำเร็จ (cache) + doGet **`action=billCheck&cid=`** (`billCheckHandler_`)
  - เพิ่ม `createSaleBill: ["saler","storedevice"]` ใน **`IMMEDIATE_GATE_ACTIONS_`**
    (migration-safe — ไม่มี session ยังผ่าน) — เดิม action ที่กระทบเงินมากสุดหลุดจากการตรวจสิทธิ์
- **ฝั่ง frontend** (`views-analytics.jsx`)
  - `syncCreateSaleBill(bill, billCid)` เปลี่ยนไปอ่านด้วย **`dmjJson`** + ติดธง `unreadable`
    เมื่ออ่านคำตอบไม่ได้
  - `syncBillCheck(billCid)` — ถามก่อนขึ้นแดงเสมอ · ตอบไม่ได้/รูปแบบไม่ตรง → `unknown:true`
    → **ห้ามชวนให้กดซ้ำ** (GAS รุ่นเก่าไม่รู้จัก action นี้ = กดซ้ำแล้วออกสองใบ)
  - `billCidRef` ใน `PosView` — 1 ค่าต่อการกด 1 ครั้ง คงค่าเดิมตลอดการลองใหม่ · reset ใน `resetAll`
  - `submitBill`: `unreadable` → `syncBillCheck` → เจอ = เดินเส้นทางสำเร็จ, ไม่เจอ/ไม่รู้ = ปล่อยให้
    ผู้ใช้กดเอง (billCid เดิมยังอยู่ กดใหม่จะ dedup ให้เองถ้าบิลลงแล้ว)

**เทสต์ที่เพิ่ม**: `tests/online-sale.test.js` (+7 → รัน `findBillCidRow_` จริง + meta-test ว่า
เช็ค cid ในล็อกก่อนแตะ ZORT + อยู่ใน immediate gate) · `tests/gasjson.test.js` (+3 → บังคับว่า
`syncCreateSaleBill` ใช้ `dmjJson` และ `submitBill` ถาม `billCheck` ก่อนขึ้นแดง)

**⚠️ เจ้าของต้องทำเองใน GAS editor**: *ไม่มี* — คอลัมน์ AD เติมอัตโนมัติผ่าน `saleBillsSheet_`
(header migrate แบบต่อท้าย) · ตัวกันซ้ำทำงานทันทีที่ deploy `.gs` · แต่ **ต้อง deploy `.gs`
ก่อน frontend เห็นผล** — ถ้า frontend ถาม `billCheck` แล้ว GAS ยังเป็นโค้ดเก่า จะได้ `unknown`
(ปลอดภัย: ไม่ชวนกดซ้ำ) จนกว่า `.gs` จะขึ้น

---

## ✅ แก้เพิ่มในรอบนี้ (handoff item 1 parser-swap + item 2/3/4 ครบ)

### item 2 — meta-test เป็น SCAN แล้ว (เสร็จ)
`tests/gasjson.test.js` เพิ่ม `describe('meta — SCAN …')` ที่สแกนทุกไฟล์ `.jsx` หา `.json()`
ที่ไม่ผ่าน `dmjJson` แล้วบังคับให้อยู่ใน ALLOW ที่ระบุเหตุผล + ล็อกจำนวนรวมของ `app.jsx` ·
เพิ่มจุดใหม่ที่ไหน = แดงทันที (ต่างจาก allowlist รายฟังก์ชันเดิมที่มองไม่เห็นของใหม่)

### item 1 (parser swap) — แปลง `res.json()` → `dmjJson` ครบทุกจุดนอก app.jsx (เสร็จ)
แปลง **~40 จุด** ใน `views-quote.jsx` (7) · `views-analytics.jsx` (~20) · `views-main.jsx` (6) ·
`ui.jsx` (NotiBell poll) · `views-attendance.jsx` (viewPhoto) — รวม `err.message` → `dmjErrText`
· จุดที่เคยเป็น `.json().catch(()=>({}))` (false-success/wrong-reason) ถูกกำจัดหมด
**เหลือ raw `.json()` แค่ 5 จุดใน `app.jsx`** — boot/auth ที่เป็น Phase 7.6 quarantined
(`postAuthAction` มีคอมเมนต์ห้ามแตะโดยตรง) — อยู่ใน ALLOW ของ scan gate พร้อมเหตุผล

### item 3 — browser test เดินเส้นทางล้มเหลว (เสร็จ)
`harness.html` เพิ่มโหมด `window.__DMJ_SALEBILL_HTML` (ตอบ HTML แทน JSON) + `action=billCheck`
· `run.cjs` เคส "ออกบิล GAS ตอบ HTML" ยืนยันบนเบราว์เซอร์จริง: ไม่มี garbage/แดง + เข้าหน้าสรุป
ด้วยเลขจาก billCheck + **ยิง createSaleBill POST ครั้งเดียว** (ไม่ยิงซ้ำอัตโนมัติ) → browser 92/92

### item 4 — CLAUDE.md (เสร็จ)
แก้ test count → 1677/50 + browser 92 · immediate gate → 9 action · เพิ่มหัวข้อ "กันออกบิลซ้ำ
(billCid)" + "res.json() ดิบ = SCAN gate" ใต้หัวข้อขายออนไลน์

---

## 🟠 idempotency ของ document-emitter — 1/5 เสร็จแล้ว

parser swap ทำให้ error **อ่านออก** ทุกจุดแล้ว และกำจัด false-success หมดแล้ว **แต่ยังไม่กัน
"retry → เอกสารซ้ำ"** สำหรับ endpoint ที่ออกเอกสาร/สร้างของใน ZORT — พวกนี้ยังไม่มี idempotency
key (ต่างจาก `createSaleBill` ที่ได้ `billCid` แล้วรอบนี้ · order=`cid` · transfer=`tid`)

| endpoint (.gs) | frontend helper | ผลถ้า retry ตอน GAS ตอบ HTML | สถานะ |
|---|---|---|---|
| `issueFullTaxInvoice` | `syncIssueFullTaxInvoice` | **ออกใบกำกับภาษีจริงซ้ำใบ** (เจ็บสุด) | ✅ ทำแล้ว (ดู CLAUDE.md) |
| `createQuotation` | `syncCreateQuotation` | ใบเสนอราคาซ้ำใน ZORT | ยังไม่ทำ |
| `addNewProduct` | `syncAddProduct` | สินค้าซ้ำใน ZORT | ยังไม่ทำ |
| `addPurchaseIn` | `syncPurchaseIn` | ใบซื้อ (PO) ซ้ำ | ยังไม่ทำ |
| `editQuotation` | `syncEditQuotation` | แก้ซ้ำ (เสี่ยงน้อยกว่า create) | ยังไม่ทำ |

**`issueFullTaxInvoice` ไม่ได้ใช้ pattern `billCid` ตรง ๆ** — endpoint นี้ไม่เขียนชีตของเราเอง
(เขียนแค่ Audit Log) จึงไม่มี "ของเราเอง" ให้เก็บ cid ไว้เทียบ · แก้ด้วยการถาม **ZORT ตรง ๆ**
(`findExistingTaxInvoiceDoc_` ผ่าน `GetDocumentOrders` — ตัวเดียวกับที่ `lookupSaleBill` ใช้เตือน
อยู่แล้ว) เป็น source of truth แทน ไม่ต้องเพิ่มคอลัมน์ชีต/cache/doGet check endpoint ใหม่เลย
· รายละเอียดเต็มอยู่ที่ `CLAUDE.md` หัวข้อ "🧾 กันออกใบกำกับภาษีย้อนหลังซ้ำ"

**ที่เหลือ 4 ตัว** — เขียนชีตของเราเองด้วย (`createQuotation`/`addNewProduct`/`addPurchaseIn`/
`editQuotation`) จึงต้อง copy pattern `billCid` เต็มรูปแบบจริง ๆ (คอลัมน์ชีตใหม่ + check endpoint +
frontend cid ref) บนเส้นทางที่ **เทสต์กับ ZORT จริงไม่ได้ในเซสชัน** · ทำทีละตัว ไม่รวด — surface
ใหญ่เกินกว่าจะกล้าปล่อยบน production ที่รันอยู่พร้อมกันหลายตัว

**สั่งต่อยังไง** (เรียงตามความเจ็บที่เหลือ): `createQuotation` → `addNewProduct` →
`addPurchaseIn` → `editQuotation` · **ทำทีละตัว copy แพทเทิร์น billCid ตรง ๆ**:
1. GAS: คอลัมน์ `<x>Cid` ต่อท้ายชีตที่ log endpoint นั้น (ห้ามแทรกกลาง) + เช็คในล็อกก่อนแตะ ZORT
   + cache ผล + doGet `action=<x>Check&cid=`
2. frontend: cid ref (คงค่าตอน retry) + helper ติดธง `unreadable` + ถาม check ก่อนขึ้นแดง
3. เทสต์: รัน `find<X>CidRow_` จริง + meta-test เช็ค cid ในล็อกก่อนแตะ ZORT (เหมือน online-sale.test.js)
· ⚠️ **ห้ามยิงซ้ำอัตโนมัติจนกว่าจะมี cid** — จนกว่าจะทำ ให้ผู้ใช้กดเอง (แพทเทิร์น `fsSaveFailed`)

**เครื่องมือมีให้แล้ว**: scan gate ใน `gasjson.test.js` จะแดงถ้ามีใครเผลอเพิ่ม `res.json()` ดิบใหม่

---

## สิ่งที่ตรวจแล้ว "ถูกต้อง" (trace จริง ไม่ใช่อ่านผ่าน) — ไม่ต้องแตะ

เพื่อให้รอบหน้าไม่ต้องตรวจซ้ำ:

- **`buildZortLineItems_`** — telescoping sum จริง `sum(totalprice) === round(grandTotal*100)/100`
  และ `pricepernumber × qty === totalprice` ทุกแถว ✓
- **`zortOrderAmounts_`** — ใช้ตัวเดียวทั้งยอดหัวเอกสารและ `paymentamount` ไม่คิดซ้ำ · ไม่ส่ง
  `vattype`/`vatpercent`/`discount` ปนไป ✓
- **`appendSaleBillRow_`** — คอลัมน์ A..AD ตรงลำดับ · Z (เลขพัสดุ) + AD (billCid) ตั้ง `@` ✓
- **`deductFrontStoreForSale_`** — รับ `productList` ไม่ใช่ `list` · ไม่เรียก `pushStockToZort_`
  · clamp ที่ 0 ✓
- **`POS_UNPAID_METHODS_` ↔ `POS_ONLINE_PAY`** — ตรงกันเป๊ะ (COD = `paid:false`) ✓
- **`fsNeedsRestock_` ⊂ `needsReorder`** — MTO/เกณฑ์ 12 ตรงกันสองฝั่ง · default OOS_MAX=0 ✓
- **`inappNotiRoute_`** — เงื่อนไขแคบจริง ไม่ชนเส้น "รับของไม่ครบ" · ทุก `view` ที่ GAS ส่งมี
  `useViewIntent` รับ ✓
- **`notifyPendingReceives_`** — ยิง 2 แถวแยก role (กดรับได้ vs ตามของ) · dedupKey คนละคีย์ ·
  เรียกก่อน early-return ✓
- **เส้นทาง stale** (single-flight) — ไม่ปั๊ม `lastModified` สด (กันเขียนทับงานคนอื่นเงียบ ๆ) ✓
- **`nextInvoiceNumber_`** — จับล็อก + idempotent ต่อเลข QT ✓
- **`app.jsx` NotiBell** — `dmjRequestFocus` + `dmjRequestView` ก่อน `handleSetTab` ✓

---

## สถานะปัจจุบัน (หลังทำ handoff รอบนี้)

- **Blocker (ออกบิลซ้ำ)**: แก้ครบ — billCid + billCheck + immediate gate + เทสต์เส้นล้มเหลว
- **item 1 parser swap**: เสร็จทุกจุดนอก app.jsx (เหลือ 5 จุด boot/auth ที่ 7.6 quarantined)
- **item 2 scan gate · item 3 failure browser test · item 4 CLAUDE.md**: เสร็จ
- **เทสต์**: unit **1677/1677** · browser **92/92**
- **เหลือ**: idempotency key ของ 5 document-emitter (ตารางด้านบน) — parser อ่านออกแล้ว แต่
  retry ยังทำเอกสารซ้ำได้ · ทำทีละตัว copy แพทเทิร์น billCid · scan gate กัน `res.json()` ใหม่ให้แล้ว

⚠️ **ต้อง deploy `.gs` (billCid + billCheck) ไปพร้อม frontend** — GAS เก่าถูกถาม `billCheck`
จะได้ `unknown` (ปลอดภัย: ไม่ชวนกดซ้ำ) แต่ dedup ฝั่ง GAS จะยังไม่ทำงานจนกว่า `.gs` จะขึ้น
