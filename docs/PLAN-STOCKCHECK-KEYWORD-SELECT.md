# PLAN — เพิ่มวิธีเลือก SKU ในคำขอ "ให้พนักงานนับสต็อก"

> **สถานะ**: แผนงาน (rev.2 — ผ่าน implementation-readiness audit แล้ว) · ยังไม่แก้โค้ด · เขียนไว้ให้ agent
> ตัวถัดไป (Sonnet) ทำตาม
> **เจ้าของสั่ง (ส.ค. 2026)**: "ช่วยนับ เบอร์รี่แดง / สน / คริสต์มาส / โบตั๋น / ซากุระ"
> → ต้องเปลี่ยนคำพวกนี้เป็น SKU ที่ส่งไปนับได้ **โดยไม่ต้องรู้ Supplier**
> **ขอบเขต**: เพิ่ม *วิธีเลือกสินค้า* ในโมดัลเดิม — **ห้ามเปลี่ยน UX/Flow ของฝั่งพนักงาน**
> **สถาปัตยกรรมที่ล็อกแล้ว (เจ้าของยืนยัน)**: **Option B — Union.** โหมด 🏭 ร้านค้า
> คง behavior เดิมทั้งหมด (live-toggle บน `checkSuppliers`) ไม่ผสมกับตะกร้าใหม่ ·
> โหมด 🔍 ค้นชื่อ / 🏷️ หมวด / 🎨 สี เป็น**วิธีเลือก SKU เพิ่มเติม** สะสมใน `checkPicked` ·
> ตอนส่ง = **union** ของทั้งสองแหล่ง ไม่มี provenance tracking ข้ามโหมด (ดู §2)

---

## 0. หลักฐานจากโค้ดจริง — อ่านก่อนแตะอะไรทั้งสิ้น

| # | ข้อเท็จจริง | ที่มา |
|---|---|---|
| 1 | ฝั่งพนักงานรับแค่ **`checkRequest.skus` (array)** ไม่สนใจว่า owner เลือกมาด้วยวิธีไหน | `views-analytics.jsx:228` (FrontStoreView) · `:1712` (StockCountView) |
| 2 | Backend `createStockCheckRequest_(skus, names, actor, suppliers)` — `suppliers` ใช้แค่ทำ **ข้อความ preview** ในแจ้งเตือน ไม่ได้ใช้คัดสินค้า | `appsscript_complete.gs:16216`, `stockCheckPreviewText_` `:16203` |
| 3 | **แปลว่างานนี้เป็น UI ฝั่ง owner เกือบล้วน** — Phase 1-3 ไม่ต้องแตะ `.gs` เลย | สรุปจาก 1+2 |
| 4 | โมดัลปัจจุบันอยู่ที่ `views-main.jsx` **~4890-5010** (`{checkSendOpen && (`) · state ที่ `~3716-3725` | `views-main.jsx` |
| 5 | ⚠️ **ชิปร้านค้าใช้ `supplierList` ← `refineBase` ← `categoryBase(active)` + `globalSearch` ของหน้าหลัก** = ถูกจำกัดตามหมวดที่เปิดค้างอยู่**และ**คำที่พิมพ์ค้างในช่องค้นหาหลักของ CategoryView **แต่ตอนกดส่งกลับ filter จาก `products` ทั้งหมด** | `views-main.jsx:4059` (`supplierList`) · `:4037-4045` (`refineBase` โดน `globalSearch` ด้วย ไม่ใช่แค่ `active`) vs `:4976` |
| 6 | ผลของข้อ 5 = **ชิปบอก "DS (12)" แต่ปุ่มบอก "ส่งขอเช็ค 80 รายการ"** — บั๊กเงียบที่มีอยู่แล้ว (เกิดได้ 2 ทาง: เลือกหมวดค้างไว้ **หรือ** พิมพ์ค้นหาค้างไว้ในหน้าหลัก) ต้องจัดการก่อนเพิ่มโหมดใหม่ | สรุปจากข้อ 5 |
| 7 | `checkSupplierFiltered` (ตัวกรองชิปด้วยช่องค้นหาใน modal เอง) **depend on `supplierList` เดิมตรง ๆ** — แก้แค่ `supplierList`/สร้าง `checkSupplierList` เฉย ๆ ไม่พอ ต้อง repoint dependency ของตัวนี้ด้วย ไม่งั้นชิปยังโชว์ตามหมวด/คำค้นหน้าหลักเหมือนเดิม | `views-main.jsx:4072` (`uM(..., [supplierList, checkSearch])`) |
| 8 | ⚠️ **catalog สะกด `เบอรี่` (ไม่มี ร์) แต่เจ้าของพิมพ์ `เบอร์รี่`** → `includes()` คืน 0 รายการ | `docs/PRODUCT-NAMING-SKU-FORENSIC-ANALYSIS.md:54` · help text ของบอทเอง `appsscript_complete.gs:9799` |
| 9 | ชื่อสินค้ามี grammar `[ชื่อฐาน][สี/ขนาด][ราคาส่ง]` สม่ำเสมอ **93.2%** · `โบตั๋น` = 83 SKU กระจาย 3 prefix (P/RT/PB) | `PRODUCT-NAMING-SKU-FORENSIC-ANALYSIS.md` §1.3, §2.1 |
| 10 | ผลของข้อ 9 = **Supplier/Prefix ตอบ "โบตั๋นเหลือเท่าไหร่" ไม่ได้โดยธรรมชาติ** ไม่ใช่แค่ไม่สะดวก | สรุปจากข้อ 9 |
| 11 | `CategoryView` รับ `data` ทั้งก้อน → เข้าถึง `data.storage` (`verifiedLockMap`/`productLockMap`) ได้ ถ้าจะทำโหมด "ควรนับก่อน" | `views-main.jsx:3641` |
| 12 | `abcClassify` / `abcRevWindow_` เป็น global ใน `views-analytics.jsx:1365-1385` ซึ่งโหลด**หลัง** `views-main.jsx` แต่**เรียกตอน render ได้** (global scope เดียวกัน) — ยืนยันจากลำดับโหลดจริงทั้งใน production HTML (`Doomuenjing Dashboard.html:1822,1824`) และ browser test harness (`tests/browser/harness.html:340-343`) | ทั้งคู่ตรงกัน |
| 13 | `stockCheckPreviewText_` มี **2 call sites**: (ก) `createStockCheckRequest_` ตอนสร้างคำขอ (`:16232`) และ (ข) `completeStockCheckRequest_` ตอนแจ้ง "ฝั่งไหนเช็คเสร็จ" ซึ่งอ่าน `r` (row array ดิบ) เอง ไม่ผ่าน `readStockCheckRequests_` เลย — **ทั้ง 2 จุดต้องได้ `sourceLabel` เท่ากัน** ไม่งั้นแจ้งเตือนตอนสร้างกับตอนเช็คเสร็จของคำขอเดียวกันจะพูดคนละสำนวน | `appsscript_complete.gs:16232` vs `:16332` |
| 14 | ⚠️ **`tests/stockcheck-split.test.js` (มีอยู่แล้ว) ล็อกลายเซ็นฟังก์ชันด้วย regex/literal-string ตรงตัวเป๊ะ** ไม่ใช่แค่เช็คว่าฟังก์ชันมีอยู่ — ดูรายละเอียดเต็มใน §4.D เพราะเป็นจุดที่ Phase 4 พังบ่อยที่สุดถ้าไม่ระวัง | `tests/stockcheck-split.test.js:29,30,329,332` |
| 15 | ✅ **`PAYLOAD_VARIANT_DROPS_` ตัดแค่ top-level keys** (`monthlyByCat`/`purchases`/`transfers` ฯลฯ) **ไม่แตะ field ต่อ product** — `p.color`/`p.vendor`/`p.lastSupplier`/`p.cat` ยังอยู่ครบใน `lite` variant (warehouse/frontstore/saler/storedevice) จึงใช้กับทุกโหมดที่เสนอได้แม้ role เหล่านี้ | `appsscript_complete.gs:13529-13540` |
| 16 | ✅ สินค้าที่ถูกซ่อน (soft-delete จาก ZORT ผ่าน `SHEET_HIDDEN_PRODUCTS`) ถูกกรองออกจาก `data.products` ตั้งแต่ `readProducts_` แล้ว — โหมดใหม่ไม่ต้อง filter ซ้ำ | CLAUDE.md หัวข้อ "เคลียร์สินค้าที่ลบจาก ZORT แล้ว" |
| 17 | ปลายทางที่อ่าน `suppliers` มี **2 ที่**: `.gs stockCheckPreviewText_` (LINE + กระดิ่ง) และ `views-analytics.jsx:13838` (การ์ดติดตามคำขอ) | grep `.suppliers` |

---

## 1. คำถามที่ต้องให้เจ้าของตอบก่อนเริ่ม

| # | คำถาม | สถานะ |
|---|---|---|
| **Q1** | โหมดต่าง ๆ สะสมรวมกันได้ไหม | ✅ **ตอบแล้ว** — สะสมได้ ผ่าน union (ดู "สถาปัตยกรรมที่ล็อกแล้ว" ด้านบน + §2) |
| **Q2** | ชิปร้านค้าควรอิงหมวดที่เปิดค้างอยู่ หรืออิงทั้งคลัง | ✅ **ตอบแล้ว** — (ก) ทั้งคลัง (`checkBase`/`checkSupplierList` แยกจาก `refineBase`) |
| **Q3** | `คริสต์มาส` / `ซากุระ` / `สน` เป็น **ชื่อสินค้า** หรือ **ธีม/เทศกาล** | ⚠️ **ยังไม่ตอบ** — ค้นทั้ง repo แล้วไม่เจอสักคำ ถ้าเป็นธีม ต้องมีมิติใหม่ (ดู §6) แผนนี้ครอบเฉพาะ "ชื่อสินค้า" |

> Sonnet: Q1/Q2 ล็อกแล้วไม่ต้องถามซ้ำ · Q3 ถ้ายังไม่มีคำตอบตอนเริ่มงาน ให้ทำเฉพาะเคส "ชื่อสินค้า" ไปก่อน
> (Phase 1-4 ทั้งหมด) แล้วรายงานไว้ว่าเคส "ธีม/เทศกาล" ยังรอคำตอบอยู่ ไม่ต้องเดา

---

## 2. สถาปัตยกรรม — **Option B (Union)**: 2 แหล่ง แยกกันเด็ดขาด รวมกันที่จุดเดียวตอนส่ง

```
🏭 ร้านค้า (โค้ดเดิมทั้งดุ้น — ห้ามแก้)         🔍 ค้นชื่อ  |  🏷️ หมวด  |  🎨 สี   (ตะกร้าใหม่)
  checkSuppliers: Set<supplierName>              กด "➕ เพิ่มเข้ารายการ"
        │  live toggle, derive ทุกครั้งที่ render        │
        ▼                                                ▼
  supplierSkus = checkBase                      checkPicked: Set<sku>
    .filter(p => checkSuppliers.has(              (สะสมข้ามโหมด 🔍/🏷️/🎨 เท่านั้น
       p.vendor || p.lastSupplier))                ไม่รวม 🏭 เข้ามาเลย)
        │                                                │
        └───────────────────┬────────────────────────────┘
                             ▼   UNION (จุดเดียว — memo `checkFinalSkus`)
              checkFinalSkus = union(supplierSkus, checkPicked) − checkExcluded
                             ▼
        [รายการที่จะส่ง — เห็นรูป+ชื่อ ติ๊กออกได้รายตัว ผ่าน checkExcluded]
                             ▼
        [ปุ่มส่ง] → createStockCheck { skus: checkFinalSkus, names, suppliers, sourceLabel }
```

**ทำไมล็อกเป็น Option B แทน "ทุกโหมดยัดใส่ `checkPicked` ก้อนเดียว" (แผน rev.1 เดิม)**:
โหมดร้านค้าเดิมเป็น **live-derived filter** (กดชิป → คำนวณ SKU ใหม่จาก `checkSuppliers` ทุกครั้ง ไม่มี
SKU ค้างเป็น state) ต่างจากโหมดใหม่ที่เป็น **ตะกร้าสะสมแบบ "➕ เพิ่ม"** ถ้ายัดสองแบบนี้รวมเป็น
`Set<sku>` ก้อนเดียวจะต้องมี **provenance tracking** (SKU ตัวหนึ่งมาจากโหมดไหนบ้าง) เพื่อให้ "ถอน
ชิปร้าน DS" ลบเฉพาะ SKU ที่มาจาก DS โดยไม่ลบ SKU ที่ผู้ใช้ค้นเจอจากโหมดอื่นด้วย ซึ่งซับซ้อนเกิน
ความจำเป็นของงานนี้ — **Option B ตัดปัญหานี้ทิ้งทั้งหมด** โดยไม่ให้สองแหล่งแตะกันเลย รวมกันแค่ตอน
คำนวณ `checkFinalSkus` (union) เท่านั้น

**⚠️ กฎเหล็กของงานนี้** (แก้จาก rev.1):
1. **`checkSuppliers` (Set ชื่อร้าน) ไม่ถูกแตะ ไม่ถูกอ่านจากที่ไหนนอกแท็บ 🏭 เลย** นอกจากตอนคำนวณ
   `checkFinalSkus` — โค้ดในแท็บร้านค้ายังคงเป๊ะทุกบรรทัดของเดิม
2. **`checkPicked` รับ SKU ได้เฉพาะจากแท็บ 🔍/🏷️/🎨** ห้ามมีเส้นทางไหนเขียน SKU จากแท็บร้านค้าลง
   `checkPicked`
3. **มี memo คำนวณ `checkFinalSkus` จุดเดียว** — ทุกที่ที่ต้องรู้ "จะส่งอะไร" (badge นับจำนวน,
   บล็อกพรีวิว, ปุ่มส่ง) อ่านจาก memo นี้ที่เดียว ห้ามมี `products.filter(...)` ซ้ำอีกชุดที่ไหนเลย
   (ของเดิมมี 2 ชุดอยู่แล้วที่ `views-main.jsx:4968` และ `:4976` — **รวมเข้า `checkFinalSkus` ให้หมด**)
4. **`checkExcluded` ใช้ตัดออกจาก union ที่ตัวเดียว ไม่สนว่า SKU มาจากแหล่งไหน** — ถ้า SKU ถูก
   ติ๊กออก แล้วภายหลังไปโผล่ในแหล่งอื่นอีก (เช่นเลือกหมวดที่คลุม SKU นั้นด้วย) **ยังคงถูกตัดออก
   จนกว่าจะกดติ๊กกลับ** (persist ต่อ SKU ไม่สนแหล่งที่มา — ง่ายกว่าและปลอดภัยกว่าการพยายามแยกแยะว่า
   "ถูกติ๊กออกจากแหล่งไหน" ซึ่งไม่มีประโยชน์เชิง business)
5. **ผลพลอยได้ที่สำคัญของ Option B**: payload key `suppliers: Array.from(checkSuppliers)`
   (`views-main.jsx:4989`) **ไม่ต้องแก้เลย** เพราะ `checkSuppliers` ไม่ถูกผสมกับอะไร ยังเป็น literal
   เดิมเป๊ะ — แก้ปัญหา literal-string assertion ที่ `tests/stockcheck-split.test.js:332` ไปได้ฟรี
   โดยไม่ต้องทำอะไรเพิ่ม (ดู §4.D)

---

## 3. งานเป็น Phase (deploy แยกกันได้ · ห้ามยกทั้งชุดขึ้นพร้อมกัน)

> เหตุผลที่ต้องแยก: Phase 7.6 เคยขึ้น 3 ก้อนพร้อมกันแล้วร้านเข้าไม่ได้ทั้งร้าน แยกไม่ออกว่าอะไรพัง

### Phase 1 — โครงตะกร้า + โหมดค้นชื่อ + union (frontend ล้วน · ไม่แตะ `.gs`)

**ไฟล์**: `views-main.jsx` เท่านั้น

1. **State ใหม่** (วางต่อจาก `checkSearch` ที่ `~3725`)
   - `checkMode` — `'supplier' | 'keyword' | 'category' | 'color'` (default `'supplier'` = ของเดิม)
   - `checkKeyword` — ข้อความในช่องค้นชื่อ (รองรับหลายบรรทัด) — **ตั้งชื่อแยกจาก `checkSearch` ให้ชัด**
     (`checkSearch` = ตัวกรองชิปร้านค้าเดิม ยังใช้ต่อในแท็บ 🏭 · `checkKeyword` = textarea ค้นชื่อ
     สินค้าในแท็บ 🔍 คนละหน้าที่กันเด็ดขาด ชื่อใกล้กันเสี่ยงสับสนตอนแก้โค้ด)
   - `checkPicked` — `Set<sku>` ตะกร้า (รับเฉพาะจากแท็บ 🔍/🏷️/🎨 ตาม §2 กฎเหล็กข้อ 2)
   - `checkExcluded` — `Set<sku>` ที่ผู้ใช้ติ๊กออกจากรายการ preview (ใช้ตัด `checkFinalSkus` ตาม
     §2 กฎเหล็กข้อ 4)

2. **`checkBase` memo ใหม่** — ฐานสินค้าของโมดัลทั้งหมด = **`products` ทั้งคลัง** (ไม่ใช่ `refineBase`)
   ```js
   products.filter(p => p.cat && p.cat !== "ไม่มีรหัสสินค้า")
   ```
   ⚠️ **ห้ามไปแก้ `supplierList`/`refineBase` ตัวเดิม** — ใช้โดย dropdown ตัวกรองร้านของหน้าหลักด้วย
   ให้สร้าง **`checkSupplierList`** แยก (อิง `checkBase`) แล้วให้โมดัลใช้ตัวใหม่
   ⚠️ **`checkSupplierFiltered` ต้อง repoint ด้วย** — ของเดิม `uM(..., [supplierList, checkSearch])`
   ต้องเปลี่ยนเป็น `[checkSupplierList, checkSearch]` ไม่งั้นชิปยังโชว์ตามหมวด/คำค้นหน้าหลักเหมือนเดิม
   (ข้อ 0.7 — เป็นจุดที่พลาดง่ายเพราะแก้แค่ `supplierList` แล้วคิดว่าจบ)

3. **`checkMatchTerms(text)` — ตัวแปลงข้อความ → รายการเทอม** (pure, export ได้)
   - แยกเทอมด้วย **ขึ้นบรรทัดใหม่ / `,` / `/`** → เป็น **OR** ระหว่างเทอม
   - ช่องว่างภายในเทอม → **AND** ระหว่าง token (คอนเวนชันเดิมทั้งแอป ห้ามเปลี่ยน)
   - ตัดเทอมว่างทิ้ง
   ```
   "เบอร์รี่แดง / สน\nโบตั๋น"  →  [["เบอร์รี่แดง"], ["สน"], ["โบตั๋น"]]
   "ฟาแลน 148"                →  [["ฟาแลน","148"]]
   ```
   (แต่ละเทอมยังเป็น **array ของ token** ไว้แบบนี้ — ไม่ใช่ string เดียว — เพราะ Phase 2 ต้อง
   normalize ทั้ง token ในเทอมพร้อมกันเป็นชุด ดู Phase 2 ข้อ 2)

4. **`checkKeywordResult` memo** — คืน **ผลแยกรายเทอม** ไม่ใช่ก้อนเดียว
   ```
   [{ term:"เบอร์รี่แดง", skus:[...], loose:false },
    { term:"สน",         skus:[],    loose:false }]   ← ต้องเห็นว่าเทอมนี้ 0
   ```
   ⚠️ **เทอมที่ได้ 0 SKU ต้องโชว์เป็นสีเตือน ห้ามเงียบ** — เจ้าของส่ง 5 คำแล้วเข้าระบบ 4 คำ
   โดยไม่มีอะไรบอก = ของหมวดที่หายไปไม่มีใครนับ **และไม่มีใครรู้ว่าไม่ได้นับ**

5. **UI ในโมดัล** — เพิ่มแถบแท็บบนสุด + ช่อง textarea สำหรับโหมดค้นชื่อ
   - แท็บ `🏭 ร้านค้า` = โค้ดเดิมทั้งดุ้น (ย้ายเข้าไปใน `{checkMode==='supplier' && (...)}`) **ห้ามแก้เนื้อใน**
   - แท็บ `🔍 ค้นชื่อ` = textarea (`checkKeyword`) + ชิปผลรายเทอม + ปุ่ม "➕ เพิ่มเข้ารายการ"
     (เพิ่มแล้ว SKU ของเทอมนั้นเข้า `checkPicked`)
   - **placeholder ต้องสอนรูปแบบ**: `เบอร์รี่แดง\nสน\nโบตั๋น  (ขึ้นบรรทัดใหม่ = คนละอย่าง)`

6. **`checkFinalSkus` memo — จุดรวม union เดียวของทั้งระบบ** (ดู §2 กฎเหล็กข้อ 3)
   ```js
   const supplierSkus = checkBase.filter(p => checkSuppliers.has(p.vendor || p.lastSupplier));
   const checkFinalSkus = uM(() => {
     const merged = new Set(supplierSkus.map(p => p.sku));
     checkPicked.forEach(sku => merged.add(sku));
     checkExcluded.forEach(sku => merged.delete(sku));
     return merged;
   }, [supplierSkus, checkPicked, checkExcluded]);
   ```
   ทุกจุดต่อไปนี้อ่านจาก `checkFinalSkus` ที่เดียว: badge จำนวน, บล็อกพรีวิว, ปุ่มส่ง — **ห้ามมีจุด
   คำนวณ SKU-ที่จะส่งซ้ำอีก**

7. **บล็อก "รายการที่จะส่ง"** (ล่างสุด เหนือปุ่มส่ง) — โผล่เมื่อ `checkFinalSkus.size > 0`
   - โชว์ **รูป + SKU + ชื่อ** ตามกติกา UI ของ repo (ห้ามโชว์แค่รหัส+ชื่อ)
   - ติ๊กออกรายตัวได้ (เขียนเข้า `checkExcluded`)
   - หัวบล็อกบอก "จะส่งไปนับ N รายการ"
   - ⚠️ **ต้องมีเพดานการ render** — ถ้า `checkFinalSkus.size` มาก (เช่นเลือกทั้งหมวด/หลายร้านพร้อมกัน
     อาจได้เป็นร้อย SKU) **ห้าม render การ์ดรูปทุกใบพร้อมกันทั้งหมด** เสี่ยงจอค้างบนมือถือเครื่องพนักงาน
     ต่างด้าวที่เป็นกลุ่มผู้ใช้หลักของระบบนี้ — โชว์ **20-30 แถวแรก + "และอีก N รายการ (แตะเพื่อดูทั้งหมด)"**
     หรือใช้ `Pagination` component ที่มีอยู่แล้วในไฟล์เดียวกัน (ดูวิธีใช้ที่ `views-main.jsx:4869`)
   ⚠️ **บล็อกนี้เป็นข้อบังคับ ไม่ใช่ของแถม** — โหมดค้นชื่อพิมพ์ผิดทีเดียวส่งงานนับ 800 SKU
   ให้พนักงานได้ ต่างจากโหมดร้านค้าที่ขอบเขตชัดอยู่แล้ว

8. **ปุ่มส่ง** — เปลี่ยนมาอ่าน `checkFinalSkus` ที่เดียว (ดู §2 กฎเหล็ก) — `suppliers` field ในการ payload
   ยังคง `Array.from(checkSuppliers)` เป๊ะเหมือนเดิม (ไม่เปลี่ยน แม้บาง SKU ในผลจะมาจาก `checkPicked`)

9. **Reset state ตอนปิดโมดัล — ต้องครบทุก state ใหม่ ไม่ใช่แค่ของเดิม** — ปัจจุบันปุ่ม X/backdrop
   (`views-main.jsx:4893,4898`) reset แค่ `checkSearch` ไม่ reset `checkSuppliers` เลย (quirk เดิม
   ที่ทิ้งไว้แบบนั้นได้ ไม่ใช่บั๊กใหม่ที่ต้องแก้) แต่ **state ใหม่ 4 ตัว (`checkMode`, `checkKeyword`,
   `checkPicked`, `checkExcluded`) ต้อง reset ทั้งชุดเดียวกันทุกจุดที่ปิด/ส่งสำเร็จ** เพื่อไม่ให้ตะกร้า
   จากคำขอก่อนหน้าค้างมาปนกับคำขอครั้งใหม่โดยไม่มีใครสังเกต (ต่างจาก `checkSuppliers` ที่ค้างได้เพราะ
   มันเป็น "ตัวกรอง" ที่ผู้ใช้เห็น สื่อความง่ายกว่า `checkPicked` ที่เป็นตะกร้าซ่อนอยู่หลังชิป) — จุดที่ต้อง
   เพิ่ม reset: `:4893` (backdrop), `:4898` (ปุ่ม X), `:4994-4995` (ส่งสำเร็จ — ปัจจุบัน reset แค่
   `checkSuppliers` ที่ `:4995` ต้องเพิ่มอีก 4 ตัว)

**เสร็จ Phase 1 = เจ้าของพิมพ์ `โบตั๋น` แล้วส่งไปนับได้แล้ว** (แต่ `เบอร์รี่` ยังไม่เจอ — Phase 2)

---

### Phase 2 — Thai normalize (แก้เคส `เบอร์รี่` → `เบอรี่`)

**ไฟล์**: `ui.jsx` (ฟังก์ชันกลาง) + `views-main.jsx` (จุดเรียก)

1. **`dmjThaiKey(s)` ใน `ui.jsx`** — ใส่ใน `Object.assign(window, {...})` ท้ายไฟล์ + `module.exports` สำหรับเทสต์
   ```
   ตัดช่องว่าง + lowercase
   → ตัด "พยัญชนะ + (สระแทรก) + ์"  เป็นคู่   (การันต์ = ตัวนั้นไม่ออกเสียง)
   → ตัดสระบน/ล่าง + วรรณยุกต์
   → ยุบตัวอักษรซ้ำติดกัน
   ```
   **ยืนยันด้วยการรันจริงแล้ว** ว่าครอบทั้ง 5 คำของเจ้าของ:

   | พิมพ์ | catalog | คีย์ | ผล |
   |---|---|---|---|
   | เบอร์รี่ | เบอรี่ | `เบอร` | ✅ |
   | คริสต์มาส | คริสมาส | `ครสมาส` | ✅ |
   | ฟาแลนด์ | ฟาแลน | `ฟาแลน` | ✅ |
   | ซากุระ | ซากุระ | `ซากระ` | ✅ |
   | โบตั๋น | โบตั๋น | `โบตน` | ✅ |

   ⚠️ **ห้ามใช้ `\p{...}` (Unicode property escape)** — runtime ที่ไม่รองรับ = syntax error **ทั้งไฟล์**
   = ทั้งระบบล่ม ไม่ใช่แค่ฟีเจอร์นี้พัง · ใช้ช่วงรหัสอักขระตรง ๆ (หลักเดียวกับ `productOwnerStaffKey_`
   ที่ `appsscript_complete.gs:11691` — อ่านคอมเมนต์ตรงนั้นก่อนเขียน)

2. **ใช้เป็นชั้นสำรอง ไม่ใช่ชั้นหลัก — และ normalize "ทั้งสองฝั่งพร้อมกันเสมอ"**
   - ต่อเทอม (array ของ token): เทียบแบบเดิมก่อน — `strictMatch = token ทุกตัวใน hay ด้วย includes()`
   - ถ้า **ทั้งเทอม (ทุก token AND กัน) ได้ 0 SKU** ทั้งคลัง → ลอง **`looseMatch`**:
     `dmjThaiKey(token) ทุกตัว` เทียบกับ **`dmjThaiKey(hay)`** (normalize **ทั้ง token และ hay
     พร้อมกันด้วยฟังก์ชันเดียวกัน**) แล้วตั้งธง `loose:true`
   - ⚠️ **ห้าม normalize แค่ฝั่งเดียว** (เช่น normalize `hay` อย่างเดียวแล้วเทียบกับ `token` ดิบที่
     ไม่ได้ normalize) — จะไม่มีวันแมตช์เลยเพราะสตริงสองฝั่งอยู่คนละรูปแบบ ต้องแปลงทั้งคู่ด้วย
     ฟังก์ชันเดียวกันก่อนเทียบเสมอ
   - **ไม่ต้องแยกตรรกะเป็นระดับ token กับระดับเทอม** — เพราะ token ที่สะกดถูกอยู่แล้ว (เช่น "แดง"
     ในเทอม "เบอร์รี่แดง") ยัง match ได้ตามปกติหลัง normalize ทั้งคู่ (normalize ไม่ทำให้ token
     ที่ถูกอยู่แล้วเสียหาย) — normalize ทั้งเทอมพร้อมกันจึงครอบคลุมกรณี "1 token ถูก 1 token ผิด"
     ได้เองโดยไม่ต้องเขียนเงื่อนไขแยกราย token ให้ซับซ้อนเกินจำเป็น
   - UI โชว์ป้าย **"≈ ค้นแบบผ่อนการสะกด"** บนเทอมที่ `loose:true`
   ⚠️ **เหตุผลที่ห้ามใช้ตลอด**: การยุบตัวซ้ำ + ตัดวรรณยุกต์ทำให้ `ข้าว` = `ขาว` และคำสั้นอย่าง
   `สน` จะไปโดน `สนิม` (`สนม`) — ใช้ตลอด = ผลกว้างขึ้นโดยไม่มีใครขอ และไม่มีอะไรบอกว่ากว้างขึ้น
   ใช้เป็นชั้นสำรอง = จ่ายราคานี้เฉพาะตอนที่ทางปกติไม่มีคำตอบให้เลย

3. **เกณฑ์ความยาวขั้นต่ำ** — token ใดในเทอมที่ normalize แล้วสั้นกว่า 2 ตัวอักษร → ทั้งเทอมนั้นไม่ใช้
   ชั้นสำรอง (กว้างเกินจนไร้ความหมาย)

---

### Phase 3 — โหมดหมวด + สี (frontend ล้วน)

**ไฟล์**: `views-main.jsx`

- แท็บ `🏷️ หมวด` — ชิปจาก `allCats` (มีในไฟล์อยู่แล้ว `:3643`) + จำนวนต่อหมวดจาก `checkBase`
- แท็บ `🎨 สี` — ชิปจาก `p.color.name` (`detectColor` รันให้ทุกตัวใน `enrichData` แล้ว)
  ใช้ pattern เดียวกับ `colorChips` ที่ `views-main.jsx:4083` แต่อิง `checkBase`
- ทั้งคู่กดแล้ว **"เพิ่มเข้า `checkPicked`"** (ตะกร้าเดียวกับโหมดค้นชื่อ ตาม §2 กฎเหล็กข้อ 2)
⚠️ ชิปทั้ง 2 แท็บต้องโชว์ **จำนวนที่กดแล้วจะได้จริง** — เลขบนชิปกับเลขบน `checkFinalSkus` ต้องมาจาก
ฐานเดียวกัน (`checkBase`)

---

### Phase 4 — `sourceLabel` (แตะ `.gs` · additive · migration-safe 2 ทาง)

**ปัญหา**: แจ้งเตือน LINE/กระดิ่ง กับการ์ดติดตามคำขอ อ่าน `suppliers` แล้วขึ้น `🏭 DS, ACME`
ถ้าเลือกด้วยคำค้น `suppliers` จะว่าง → ตกไป fallback เป็นรายชื่อสินค้ายาว ๆ ที่อ่านไม่รู้เรื่อง

**สิ่งที่ทำ**:
1. `.gs` — เพิ่ม **คอลัมน์ 16 `sourceLabel`** ใน `STOCK_CHECK_HEADERS_` (`:16145`) + `COL_CHK_SOURCE = 16`
   ⚠️ **ต่อท้ายอย่างเดียว ห้ามแทรกกลาง** (บทเรียนข้อ 5) — `COL_CHK_SUPPLIERS = 15` ต้องไม่ขยับ
   `getOrCreateStockCheckSheet_` เติมหัวคอลัมน์ที่ขาดให้เองอยู่แล้ว (`:16160`) → ไม่ต้อง migration
2. `stockCheckPreviewText_(suppliers, names, sourceLabel)` — **`sourceLabel` ชนะเป็นอันดับแรก**
   ลำดับ: `sourceLabel` → `suppliers` (🏭) → `names`
3. ⚠️ **แก้ทั้ง 2 call site** (ข้อ 0.13) ไม่ใช่แค่จุดสร้างคำขอ:
   - `createStockCheckRequest_` (`:16232`) — ส่ง `sourceLabel` ที่รับมาจาก dispatch
   - `completeStockCheckRequest_` (`:16332`) — อ่าน `r[COL_CHK_SOURCE - 1]` แล้วส่งต่อให้
     `stockCheckPreviewText_` ด้วย (จุดนี้อ่าน row array ตรง ๆ ไม่ผ่าน `readStockCheckRequests_`)
   - dispatch ที่ doPost (`:2795`) ต้องส่ง `data.sourceLabel` เป็นอาร์กิวเมนต์ที่ 5 ของ
     `createStockCheckRequest_` ด้วย
4. `readStockCheckRequests_` คืน `sourceLabel` ออกไปด้วย
5. `views-analytics.jsx:13714` เพิ่ม `sourceLabel: req.sourceLabel || ""` · `:13838` อ่านตัวนี้ก่อน `suppliers`
6. **`views-main.jsx` ปุ่มส่ง ประกอบ `sourceLabel` จาก "ทุกโหมดที่มีส่วนร่วมจริง" ไม่ใช่แค่โหมด
   ที่เปิดอยู่ตอนกดส่ง** — เพราะ Option B ให้สะสมข้ามโหมดได้ (Q1) ถ้าเจ้าของเลือกร้าน DS **และ**
   พิมพ์ค้นหา "โบตั๋น" พร้อมกัน แล้ว sourceLabel สร้างจากแค่โหมดค้นชื่อ ข้อมูล "🏭 DS" จะหายไปจาก
   ข้อความแจ้งเตือน (เพราะ `sourceLabel` ชนะ `suppliers` ตามข้อ 2) **ทั้งที่จริงมีทั้งสองแหล่ง**
   → ประกอบ `sourceLabel` เป็นการต่อ segment ของทุกแหล่งที่มีส่วนร่วม เช่น:
   ```
   segments = []
   if (checkSuppliers.size)      segments.push("🏭 " + [...checkSuppliers].join(", "))
   if (keyword terms ที่มีผล)     segments.push("🔍 " + terms.join(", "))
   if (category chips ที่เลือก)   segments.push("🏷️ " + cats.join(", "))
   if (color chips ที่เลือก)      segments.push("🎨 " + colors.join(", "))
   sourceLabel = segments.join(" · ")
   ```
   (ตัวอย่างผล: `🏭 DS · 🔍 โบตั๋น`) — ถ้าไม่ทำแบบนี้ การผสมโหมดจะทำให้แจ้งเตือนสูญข้อมูลบางส่วนไปเงียบ ๆ

**ทำไม migration-safe ทั้ง 2 ทาง**:
- `.gs` เก่า + `.jsx` ใหม่ → `.gs` ไม่รู้จัก field → พฤติกรรมเดิมเป๊ะ (fallback names)
- `.gs` ใหม่ + `.jsx` เก่า → `sourceLabel` ว่าง → fallback `suppliers` เดิมเป๊ะ

---

### Phase 5 — มิติเสริม (ทำต่อได้ ไม่ต้องรวมมาใน 4 Phase แรก)

| โหมด | ข้อมูลที่ใช้ | มีอยู่แล้วไหม |
|---|---|---|
| ⭐ ของที่ฉันดูแล | `mySkus` (`views-main.jsx:3692`) | ✅ ในไฟล์เดียวกัน |
| 📊 ควรนับก่อน (ABC + ค้างนาน) | `abcClassify` + `data.storage.verifiedLockMap` | ✅ ทั้งคู่ (ข้อ 0.11, 0.12) |
| 📦 ของจม | `p.deadMonths` | ✅ enrich แล้ว |
| 🆕 ของเข้าใหม่ | `p.lastStockInDate` + `isNew45` | ✅ ในไฟล์เดียวกัน |
| 🗺️ ตามล็อค/โซน | `data.storage.productLockMap` | ✅ |

⚠️ **"📊 ควรนับก่อน" ต้องใช้ `abcClassify` ตัวเดิมจาก `views-analytics.jsx` ห้ามเขียนสูตรใหม่** —
ไม่งั้นคิว ABC ในหน้านับสต็อกกับที่นี่จะไม่ตรงกัน แล้วไม่มีใครรู้ว่าเชื่ออันไหน · ทุกโหมดในเฟสนี้
ก็เพิ่มเข้า `checkPicked` แบบเดียวกับ Phase 3 (union pattern เดียวกัน ไม่มีอะไรพิเศษ)

---

## 4. เทสต์ที่ต้องเขียน/แก้

### A. ไฟล์ใหม่: `tests/stockcheck-keyword.test.js`

ใช้ pattern **eval ของจริงจากต้นทาง ไม่ copy** เหมือน `tests/saler-fs-count.test.js` (อ่าน `grabFn`/`rolePredicate` ที่นั่นก่อน)

**A1. Behavioral (รันฟังก์ชันจริง)**
1. `checkMatchTerms` — `\n` / `,` / `/` = OR · ช่องว่าง = AND · เทอมว่างถูกตัด
2. `dmjThaiKey` — ครบ 5 คำของเจ้าของในตาราง Phase 2
3. `dmjThaiKey` — เคสที่ **ต้องไม่** ยุบมาชนกัน (คุมขอบเขตความเสียหาย)
4. ชั้นสำรองทำงาน**เฉพาะเมื่อชั้นปกติได้ 0 ทั้งเทอม** (ไม่ใช่ทำเสมอ)
5. เทอมสั้นกว่า 2 ตัวอักษรหลัง normalize → ไม่เข้าชั้นสำรอง
6. **เคสผสม token ถูก+ผิดในเทอมเดียว** (เช่น `["เบอร์รี่","แดง"]` — "แดง" สะกดถูกอยู่แล้ว) ต้อง
   แมตช์ได้หลัง fallback โดยไม่ต้องมี logic แยกราย token (ยืนยันข้อ Phase 2.2)

**A2. Union / Option B (สำคัญที่สุดของไฟล์นี้)**
7. `checkFinalSkus` = union(supplierSkus, checkPicked) − checkExcluded — ทดสอบตรง ๆ ด้วยเซตตัวอย่าง
8. ถอนชิปร้านค้าออก **ไม่กระทบ** SKU ที่อยู่ใน `checkPicked` จากโหมดอื่น (พิสูจน์ว่า 2 แหล่งไม่ผูกกัน)
9. `checkExcluded` ตัด SKU ออกจาก union ได้ไม่ว่า SKU นั้นจะมาจากแหล่งไหน

**A3. Meta-test (จุดที่พังแล้วเงียบ)**
10. ปุ่มส่งอ่านจาก `checkFinalSkus` **memo เดียว** — ต้องไม่มี `products.filter` ซ้ำสองชุดในบล็อกปุ่มส่งอีก
11. โมดัลใช้ `checkSupplierList` (อิง `checkBase`) ไม่ใช่ `supplierList` (อิง `refineBase`)
12. `checkSupplierFiltered` ต้อง depend on `checkSupplierList` ไม่ใช่ `supplierList` เดิม (ข้อ 0.7)
13. `ui.jsx` export `dmjThaiKey` ผ่าน `Object.assign(window, ...)` จริง
14. ห้ามมี `\p{` ในนิพจน์ของ `dmjThaiKey`
15. **`COL_CHK_SUPPLIERS` ยังเป็น 15** และ `STOCK_CHECK_HEADERS_` ยาวขึ้นแบบต่อท้ายเท่านั้น
16. `stockCheckPreviewText_` เรียงลำดับ `sourceLabel` → `suppliers` → `names`
17. `completeStockCheckRequest_` ก็ส่ง `sourceLabel` (จาก column ใหม่) ให้ `stockCheckPreviewText_`
    ด้วย ไม่ใช่แค่ `createStockCheckRequest_` (ข้อ 0.13)
18. บล็อก "รายการที่จะส่ง" มี `imageUrl` จริง (กติกา UI: ห้ามโชว์แค่รหัส+ชื่อ)
19. บล็อก "รายการที่จะส่ง" มีเพดานการ render (ไม่ render ทุกแถวพร้อมกันเมื่อ `checkFinalSkus.size` ใหญ่)
20. ปิดโมดัล (backdrop/X) และส่งสำเร็จ — reset ครบทั้ง `checkMode`/`checkKeyword`/`checkPicked`/`checkExcluded`

**A4. Browser test — ต่อจากเคส `ปุ่มลอยส่งคำขอเช็ค` เดิม (`tests/browser/run.cjs:872-908`)**
21. owner → เปิดโมดัล → สลับแท็บ `🔍 ค้นชื่อ` → พิมพ์ชื่อสินค้าจาก fixture → **เห็นรายการที่จะส่ง** → เลขบนปุ่มตรงกับจำนวนในรายการ
22. พิมพ์คำที่ไม่มีจริง → **ต้องเห็นป้ายเตือนว่าเทอมนี้ 0 รายการ** (ไม่ใช่เงียบ)
23. แท็บ `🏭 ร้านค้า` ยังทำงานเหมือนเดิมทุกประการ (กันเผลอพังของเดิม)
24. **เลือกร้านค้า (แท็บ 🏭) แล้วสลับไปแท็บ 🔍 พิมพ์ค้นเพิ่ม** → บล็อกพรีวิวมี SKU จากทั้ง 2 แหล่ง
    รวมกัน (สโมค Option B บนเบราว์เซอร์จริง ไม่ใช่แค่ unit test)

⚠️ **fixture ต้องมีสินค้าที่สะกดต่างจากคำค้นจริง** (เช่นชื่อ `เบอรี่ 148`) ไม่งั้นเทสต์ Phase 2 เขียวโดยไม่ได้ทดสอบอะไรเลย

---

### B. ต้องแก้ไฟล์เทสต์ที่มีอยู่แล้ว: `tests/stockcheck-split.test.js` (ห้ามลืม — เป็น deliverable ของ Phase 4 ไม่ใช่ทางเลือก)

ไฟล์นี้ล็อกลายเซ็นฟังก์ชันด้วย regex/literal-string ตรงตัว **ถ้า Phase 4 เพิ่มพารามิเตอร์
`sourceLabel` ตามที่ระบุแล้วไม่แก้ไฟล์นี้ด้วย จะพังทันทีตั้งแต่ต้นไฟล์ (`grab()` throw) ก่อนแม้แต่
จะรัน test ไหนเลยสักตัว**:

1. `grab(/function createStockCheckRequest_\(skus, names, actor, suppliers\) \{[\s\S]*?\n\}/)`
   (บรรทัด 33) — ต้องแก้ pattern ให้ตรงกับ signature ใหม่ `(skus, names, actor, suppliers, sourceLabel)`
2. `grab(/function stockCheckPreviewText_\(suppliers, names\) \{[\s\S]*?\n\}/)`
   (บรรทัด 31) — ต้องแก้ pattern ให้ตรงกับ signature ใหม่ `(suppliers, names, sourceLabel)`
3. `expect(SRC).toContain('createStockCheckRequest_(data.skus, data.names, actor, data.suppliers)')`
   (บรรทัด 329) — ต้องแก้ literal string ให้ตรงกับ dispatch line ใหม่ (เพิ่ม `, data.sourceLabel`)
4. `expect(VMAIN).toContain('suppliers: Array.from(checkSuppliers)')` (บรรทัด 332) — ✅ **ไม่ต้องแก้**
   เพราะ Option B (§2 กฎเหล็กข้อ 5) รับประกันว่า literal นี้ยังอยู่เป๊ะ — ตรวจสอบซ้ำหลังเขียนโค้ดจริง
   ว่ายังผ่านโดยไม่ต้องแตะบรรทัดนี้ (ถ้าต้องแก้ = แปลว่า Option B ถูกทำผิดไปจากที่ล็อกไว้)

⚠️ **นี่คือขั้นตอนที่พลาดง่ายที่สุดของ Phase 4** — ถ้า `npm test` แดงทันทีที่รัน Phase 4 ให้เช็คไฟล์นี้
ก่อนไฟล์อื่น

---

## 5. Checklist ก่อน push

- [ ] `npm test` เขียวทั้งหมด **รวม `tests/stockcheck-split.test.js` ที่แก้แล้ว** (ดู §4.B)
- [ ] `bash tests/browser/setup.sh && node tests/browser/run.cjs` เขียวทั้งหมด
- [ ] **bump `CACHE_NAME`** ใน `service-worker.js` (ปัจจุบัน `dmj-v54`) — แก้ `.jsx` ต้อง bump เสมอ (บทเรียนข้อ 15)
- [ ] อัปเดต `CLAUDE.md` — เพิ่มหัวข้อใต้ "คำขอเช็คสต็อก แยกฝั่งหน้าร้าน/คลัง"
- [ ] Phase 4 เท่านั้นที่ต้องรอ auto-deploy `.gs` (Actions ทำเองตอน merge เข้า master) — Phase 1-3 ขึ้นได้ทันที
- [ ] **ห้ามใส่ model ID / ชื่อ internal** ใน commit message หรือคอมเมนต์ในโค้ด

---

## 6. สิ่งที่ตั้งใจ *ไม่* ทำในแผนนี้

| ไม่ทำ | เหตุผล |
|---|---|
| Fuzzy matching (edit distance / bigram) | เสี่ยง "เจอผิดตัว" ซึ่งแย่กว่า "ไม่เจอ" · Phase 2 + บล็อกรายการที่จะส่ง น่าจะพอแล้ว — วัดก่อนค่อยตัดสิน |
| ตาราง alias/synonym | ต้องมีคนดูแลตลอดไป · รอดูก่อนว่า Phase 2 เหลือเคสที่จับไม่ได้จริงกี่คำ |
| มิติ "ฤดูกาล/เทศกาล" (คริสต์มาส/ตรุษจีน) | **ไม่มี field ไหนรองรับเลย** — ต้องรอคำตอบ Q3 ก่อน ว่าเป็นชื่อสินค้าหรือธีม |
| ค้นชื่อฐาน (base name) + รวมยอด | เป็นงานคนละก้อน (ตอบคำถาม "โบตั๋นเหลือเท่าไหร่") ไม่ใช่ "เลือก SKU ไปนับ" |
| เปิดบอท LINE ตอบกลับ (`LINE_REPLY_ENABLED`) | คนละช่องทาง งานคนละก้อน · มี `handleQuery` รออยู่แล้วที่ `appsscript_complete.gs:9315` |
| แตะฝั่งพนักงาน (FrontStoreView / StockCountView) | **ไม่ต้องแตะเลย** ตามข้อ 0.1 — แตะเมื่อไหร่คือทำเกินขอบเขต |
| Provenance tracking ข้ามโหมด (Option A) | **ถูกตัดทิ้งแล้วตามการล็อก Option B ของเจ้าของ** — อย่าเผลอเพิ่มกลับมาทีหลังโดยไม่ถาม |
