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

## 🟠 ยังไม่ได้ทำ — งานที่ต้องสั่งต่อ (เรียงตามความสำคัญ)

### 1. `res.json()` ดิบยังเหลือ ~43 จุด (บทเรียนข้อ 13 ยังไม่ครบจริง)

**ปัญหา**: CLAUDE.md บทเรียนข้อ 13 ประกาศว่าเรื่อง "GAS ตอบ HTML" แก้แล้ว แต่ยังเหลือ
`res.json()` ดิบ ~43 จุดใน 5 ไฟล์ · จุดที่**เขียนข้อมูล/ออกเอกสาร**และเจ็บถ้าอ่านคำตอบไม่ได้
แล้วผู้ใช้ทำซ้ำ:

| จุด | ไฟล์:บรรทัด (โดยประมาณ) | ผลถ้าทำซ้ำ |
|---|---|---|
| `syncIssueFullTaxInvoice` | `views-analytics.jsx:~9811` | ออกใบกำกับภาษีจริงซ้ำใบ |
| `syncCreateQuotation` / `syncEditQuotation` | `views-quote.jsx:18,30` | ใบเสนอราคาซ้ำใน ZORT |
| `confirmStockCount` | `views-analytics.jsx:~853` | งานนับสต็อกทั้งรอบส่งซ้ำ/หาย |
| `syncAddProduct` / `syncPurchaseIn` | `views-main.jsx:8367,8385` | สินค้า/ใบซื้อซ้ำ |
| MtoJobView fetch หลายจุด | `views-analytics.jsx:6607–6841` | งาน MTO เพี้ยน |

**สั่งต่อยังไง**: ไล่เปลี่ยน `res.json()` → `dmjJson(res)` ทุกจุด · **แต่ลำดับความสำคัญคือ
"จุดที่เขียนข้อมูลแล้วยังไม่ idempotent" ก่อน** — `syncIssueFullTaxInvoice` และ
`syncCreateQuotation` เจ็บที่สุด (ออกเอกสารซ้ำ) ควรได้ตัวกันซ้ำแบบ `billCid` ด้วย ไม่ใช่แค่
เปลี่ยน parser · จุดที่เป็น GET อ่านอย่างเดียว (`AuditLogView`/`DeadStockView`/`CustomerView`)
เปลี่ยน parser พอ ไม่ต้องมีตัวกันซ้ำ

**⚠️ ห้ามยิงซ้ำอัตโนมัติกับ action ที่ยังไม่มี cid/tid/billCid** — ต้องให้ผู้ใช้กดเอง หรือถาม
check-endpoint ก่อน (แพทเทิร์น `fsSaveFailed`) เหมือนที่ทำกับบิลขายรอบนี้

### 2. meta-test ของ dmjJson เป็น allowlist ไม่ใช่ scan (นี่คือสาเหตุที่บั๊กบิลหลุดมาได้)

**ปัญหา**: `tests/gasjson.test.js` (บล็อก `describe('meta …')`) ตรวจแค่ **5 ฟังก์ชันที่ระบุชื่อ
ตายตัว** (`syncFrontStoreData`, `placeOrder`, `syncOrderUpdate`, `markComplete`, `savePrepQty`)
ไม่ได้สแกนหา `res.json()` ทั้งไฟล์ → ฟังก์ชันใหม่ (ทั้งชุดขายออนไลน์) หลุด 100% โดยเทสต์เขียว
— นี่คือเหตุผลตรง ๆ ที่ `syncCreateSaleBill` shipped แบบใช้ `res.json()` ดิบได้

**สั่งต่อยังไง**: เปลี่ยนเป็น **scan** — `grep \.json\(\) ในไฟล์ .jsx ทุกไฟล์` แล้วบังคับให้ทุก
match อยู่ใน allowlist ที่ระบุเหตุผล (เหมือน meta-test ของ `writeAuditLog_` ใน
`staff-perf.test.js` ที่สแกน call site จริงและเคยจับของหลุดได้จริง) · ทำข้อนี้ **ก่อน** ข้อ 1
จะได้รู้ว่ายังเหลือกี่จุดจริง ๆ และกันไม่ให้ถอยกลับ

### 3. ไม่มีเทสต์เดินเส้นทางล้มเหลว (HTML response) ผ่าน sync helper ที่เขียนข้อมูล

**ปัญหา**: เทสต์ที่จำลองคำตอบ HTML มีแค่ใน `gasjson.test.js` (ทดสอบ `dmjJson` เดี่ยว ๆ) ·
harness ของ browser test ตอบ `createSaleBill` เป็น JSON เสมอ (`harness.html:122`) → เส้นทาง
"ออกบิลแล้วเจอ HTML" **ไม่เคยถูกเดินเลย** — นั่นคือเหตุผลที่ 1671+91 เทสต์เขียวแต่บั๊กยังอยู่

**สั่งต่อยังไง**: เพิ่มโหมดใน `harness.html` ให้ตอบ HTML ได้ (คู่กับ `?nodata=1` ที่มีอยู่แล้ว)
แล้วเพิ่ม browser test 1 เคส: ออกบิล → เจอ HTML → ต้องขึ้นข้อความไทย **และปุ่มต้องไม่กดซ้ำ
ได้ทันที** · ต่อยอดได้ถึงการทดสอบ dedup: กด 2 ครั้งด้วย billCid เดิม → ต้องได้บิลใบเดียว

### 4. CLAUDE.md drift (เล็ก แต่เป็น interface หลักของทุกงานถัดไป)

- บรรทัด ~743: เขียน "1606 tests, 48 test files" — ของจริง **1671 / 50** (browser 91/91 ถูก)
- หัวข้อ immediate gate: เขียน "7 action" — ตอนนี้ **9** (เพิ่ม `editQuotation` ก่อนหน้า +
  `createSaleBill` รอบนี้)
- **ควรเพิ่มหัวข้อ "ตัวกันออกบิลซ้ำ (billCid)"** ใต้หัวข้อ POS/ขายออนไลน์ ให้ตรงกับที่ทำจริง
  (ไม่งั้นรอบหน้าจะมีคนเขียนตัวกันซ้ำใหม่ซ้อน หรือลบทิ้งเพราะไม่รู้ว่าทำไมมี)

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

## Verdict ตอนตรวจ

**Fix-then-ship** — blocker (ออกบิลซ้ำ) แก้แล้วในรอบนี้ · ที่เหลือ (ข้อ 1–4) เป็นงานลด
ความเสี่ยงประเภทเดียวกัน (เอกสาร/ข้อมูลซ้ำเมื่อ GAS ตอบ HTML) ที่ยังกระจายอยู่หลายจุด —
ทำตามลำดับ **ข้อ 2 (scan test) → ข้อ 1 (ไล่แก้จุดที่เหลือ) → ข้อ 3 (เทสต์เส้นล้มเหลว)**
เพื่อไม่ให้แก้แล้วถอยกลับเงียบ ๆ อีก
