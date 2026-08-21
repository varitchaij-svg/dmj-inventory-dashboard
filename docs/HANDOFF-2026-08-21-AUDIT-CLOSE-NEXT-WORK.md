# HANDOFF — 2026-08-21 · ปิด Audit v1 + Architecture Review เสร็จ · งานธุรกิจถัดไป

รับช่วงต่อจาก session ที่ปิด Backend Stability Audit v1 และทำ Report/Notification Architecture Review

---

## ⚠️ อ่านก่อน: branch นี้ตามหลัง master

- เอกสาร handoff/audit/review ทั้งหมด commit บน branch `claude/production-burst-capture-9iyg0q` (ฐาน `11b4287`)
- **`origin/master` เดินหน้าไปแล้ว** (ล่าสุด `3339fc3` = PR #99 "ขาย MTO ผ่าน POS") — **มี MTO-sell feature ที่เกี่ยวกับ NEXT WORK ข้อ 1 โดยตรง**
- **session ถัดไปควรเริ่มจาก `origin/master`** ไม่ใช่ branch นี้ (เอกสารเป็น docs-only, cherry-pick/merge เข้า master ได้ปลอดภัย ไม่กระทบ code)

---

## 1. สถานะปัจจุบัน

| งาน | สถานะ |
|---|---|
| A1 Columnar Payload (pv=3) | **PASS** — ไม่ถูกแก้ |
| Backend Stability Audit v1 | **CLOSED WITH OBSERVABILITY LIMITATION** |
| RC-1..RC-5 | ยังเป็น **HYPOTHESIS ทั้งหมด** (ไม่มี `[perfB]` จริง — ห้ามยกเป็น root cause) |
| LINE HTTP 400 (`drainNotiQueue` `linePush_primary 400`) | **CONFIRMED occurrence / UNKNOWN root cause** · แยกเป็น notification reliability issue |
| Report Engine + Notification Center Architecture Review | **COMPLETED** (decision-support) |
| Application code change จาก architecture review | **ไม่มี** (documentation-only ล้วน) |
| Phase C / A2-A4 / F1-F7 | **ยังไม่เริ่ม** |

**Observability blocker หลัก**: โปรเจกต์ใช้ **DEFAULT GCP project** → ไม่มี Cloud Logging + Executions panel log ชั่วคราว → ดึง `[perfB]` ย้อนหลังไม่ได้ (ปัญหาแพลตฟอร์ม ไม่ใช่โค้ด — instrumentation ผ่านทุกจุดตรวจแล้ว)

---

## 2. เอกสารอ้างอิงที่สร้างแล้ว

| ไฟล์ | เนื้อหา |
|---|---|
| `docs/AUDIT-BACKEND-STABILITY-V1-CLOSURE.md` | ปิด audit v1 · CONFIRMED / STRONG EVIDENCE / HYPOTHESIS / OBSERVABILITY LIMITATION · LINE finding · เงื่อนไขเปิด v2 |
| `docs/ARCHITECTURE-REVIEW-REPORT-NOTIFICATION.md` | 12 sections + ตอบ 18 คำถาม · gap analysis · recommendation · implementation phases · risk |
| `docs/HANDOFF-BACKEND-OBSERVABILITY.md` | (เดิม) Phase B instrumentation + วิธีเก็บ/อ่าน burst — หมายเหตุ: ส่วน "ยังไม่ merge" ล้าสมัย, merge แล้ว |

---

## 3. Architecture Recommendation ที่ตัดสินใจไว้ (ยังไม่ implement)

- **Incremental บน architecture เดิม** — ไม่สร้าง subsystem ใหม่ (ระบบมี primitive ครบพอเป็นฐาน)
- **Report Engine = shared architecture** — `REPORT_REGISTRY` (frontend) + report shell + thin server report-identity layer · เพิ่ม report = 1 entry + 1 component ไม่แตะ core · reuse payload กลาง + print pipeline
- **Notification Center = shared dispatcher** — promote `pushInappNoti_` audience เป็น dispatcher กลาง (event→rule→channel) · in-app + LINE เป็น channel adapter
- **LINE = channel ไม่ใช่ logic กระจายตาม feature** — consolidate 6 bypass senders → `linePush_` ตัวเดียว · เพิ่ม error classification (permanent 4xx ไม่ retry / transient 429·5xx retry) · dead-letter จริง · `LINE_GROUP_CONFIG` routing ตามหัวข้อ
- **Historical report = hybrid** — operational=regenerate จากข้อมูลปัจจุบัน · official/เอกสารการเงิน=snapshot ณ เวลาสร้าง + report instance ID
- **Report URL ต้องผ่าน authentication/permission ทุกครั้ง** — ห้ามพึ่ง URL-secrecy · ตรวจ session/role ตรง ๆ เหมือน `staffPerf`/`getAuditLog` (ไม่พึ่ง `REQUIRE_LOGIN`)
- **PDF = คง client `window.print()`** — ห้าม server-side/rasterize (บทเรียนในโค้ด)
- **ลำดับ**: P0 ผูก standard GCP (config, ปลด observability) → P1 LINE consolidate → P2 dispatcher → P3 report registry → P4 report permission → P5 snapshot → P6 scheduled/event report
- **ยังไม่ implement จนกว่าจะได้รับคำสั่ง**

---

## 4. สิ่งที่ยังไม่ควรทำ (hard constraints คงเดิม)

- ❌ ห้ามแก้ application code
- ❌ ห้าม deploy
- ❌ ห้ามเปลี่ยน GCP project
- ❌ ห้ามแก้ LINE integration
- ❌ ห้ามเริ่ม Phase C
- ❌ ห้ามเริ่ม A2 / A3 / A4 / F1–F7
- ❌ ห้ามสร้าง synthetic transaction

---

## 5. NEXT WORK — งานธุรกิจ 2 เรื่อง (ต้อง investigate architecture ก่อน ห้ามเขียน code ทันที)

### Work 1 — MTO Sales / จัดแจกัน / จัดดอกไม้ / จัดแผงใบไม้ (bundle ขายเป็นชุดเดียว)

**Business requirement:**
- ลูกค้าเลือก component: ดอกไม้ 3 SKU × 5 ชิ้น · แจกัน 1 SKU · โอเอซิส 1 ชิ้น · ค่าจัด
- ระบบช่วยคำนวณราคา
- ตอนขายจริงแสดงเป็น **สินค้า/ชุดเดียว** เช่น `แจกันชุด ราคา 1,xxx บาท`
- ต้อง: ตัด stock component จริงออกจาก inventory · ใบเสร็จ/ใบกำกับ**ไม่แจกแจง** component ภายใน · stock component **ต้องไม่หายจากระบบ** · มี **audit trail** ว่า bundle นี้ประกอบจากอะไร

**ต้องสรุปก่อน implement:** ควรทำใน **หน้า MTO** / **หน้า ขาย/ออกบิล** / หรือ **ใช้ logic กลางร่วมกันทั้งสองหน้า**

**⚠️ สิ่งที่ต้องเช็คบน `origin/master` ก่อน (มีของที่เกี่ยวข้องแล้ว — อย่าเริ่มจากศูนย์):**
- **PR #99 (`3339fc3`) ลง MTO-sell-via-POS แล้ว** — `appsscript_complete.gs` มี `canSellMtoJob_`, `markMtoJobSold_`, `applyMtoFulfillment_`, `decreaseMtoStockInZort_`, MTO sale columns K–N (`MTO_SALE_UNSOLD`/`SOLD`/`CANCELLED`) · **branch นี้ (`11b4287`) ยังไม่มี** → ต้องอ่านจาก master
- CLAUDE.md หัวข้อ "🎁 หมวด Made to Order ในหน้าสร้างใบเสนอราคา" — มี "งานต่อ #3" ที่เจ้าของสั่งคิดไว้แล้ว: MTO เป็น bundle · **สูตรเลือกใหม่ทุกใบ** (composition ผูกกับบรรทัด ไม่ใช่ต่อ SKU) · **หักสต็อกแค่ "บันทึกไว้ให้คนคลังจัด/หักเอง" ไม่ auto-หักผ่าน ZORT** (เจ้าของตัดสินไว้แล้ว — เส้นทางขาย+ZORT เสี่ยงหักสองเด้ง)
- `createSaleBill` / `deductFrontStoreForSale_` / `buildZortLineItems_` — เส้นทางขายจริง (ถ้า bundle จะขายผ่าน POS ต้องเข้าใจตรงนี้)
- **จุดตัดสินใจที่ต้องถามเจ้าของ**: composition ผูกกับบรรทัดบิลหรือต่อ SKU · หักสต็อกผ่าน ZORT หรือบันทึกให้คลังหักเอง (CLAUDE.md บอกว่าเจ้าของเลือก "บันทึกให้คลัง" — ยืนยันซ้ำก่อนทำ)

### Work 2 — New Product / SKU Generation (ช่วยหา SKU จากชื่อ+หมวด)

**Flow ที่ต้องการ:**
1. พิมพ์ชื่อสินค้า → ค้นว่าเคยมีชื่อใกล้เคียงในระบบไหม
2. มี → ใช้ข้อมูลเดิม/ช่วยหา SKU ที่เหมาะสม
3. ไม่มี → ดู prefix จากหมวดหมู่

**Prefix table (จากเจ้าของ):**
`ดอกไม้=F · Realtouch=RT · บูช=FB · ใบ=L · ใบบูช=LB · ต้นไม้=TR · แจกันแก้ว=G · กุหลาบหิน=KB · กระถางPS=PS · กิ่งไม้=BR · ดอกหญ้า=GR`

จากนั้นช่อง "ชื่อสินค้า" ใส่ชื่อที่ได้จากขั้นตอนค้นหา/ตรวจสอบข้อ 1

**⚠️ สิ่งที่ต้องเช็คก่อน (ตรวจแล้วบางส่วน — pointer):**
- `AddProductView` (`views-main.jsx:9114`) = หน้าเพิ่มสินค้าปัจจุบัน · SKU builder ใช้ `parseSkuParts`(`:3603`) / `nextModelForPrefix`(`:3612`) / `VARIANT_COLOR_CODES`(`:3570`) · `checkSkuExistsRemote`(`:9060`) เช็คซ้ำ
- `suggestNextSku`(`:3533`) = ตัวเก่า category-based (CLAUDE.md บอกว่า "ไม่รู้จัก business rule" — ยึด parseSkuParts/nextModelForPrefix แทน)
- **Category→prefix auto-mapping (F/RT/FB/…) ยังไม่มีในโค้ด** — ปัจจุบัน prefix ผู้ใช้เลือก/พิมพ์เอง · ต้องเพิ่ม mapping table นี้
- **⚠️ prefix table ของ Work 2 ต่างจากตัวอย่างใน CLAUDE.md business rule** (นั่น `OL`=มะกอก, `R`=กุหลาบ) → **อย่า assume ว่าแทนกัน — ยืนยันกับเจ้าของว่า table ใหม่นี้เพิ่มเข้ากับของเดิมอย่างไร** (เป็น superset? แทนที่? คนละหมวด?)
- **ชื่อ-ค้นหาใกล้เคียง (fuzzy/token search) ยังไม่มีในหน้าเพิ่มสินค้า** — search แบบ multi-token มีในหน้าอื่น (StockView/FrontStore) reuse แนวคิดได้
- Business rule SKU (Prefix+Variant+Model, ห้ามเดา prefix/สี/model) ใน CLAUDE.md ยังบังคับใช้ — Work 2 ต้องเข้ากันกับกฎนี้

---

## 6. session ถัดไปเริ่มอย่างไร

**เริ่มด้วย codebase investigation + architecture check ของ Work 1 และ Work 2 ก่อน — ห้ามเขียน code ทันที**

1. checkout `origin/master` (ไม่ใช่ branch นี้ — master มี MTO-sell แล้ว)
2. Work 1: อ่าน MTO-sell ที่ลงแล้ว (`canSellMtoJob_`/`markMtoJobSold_`/`applyMtoFulfillment_`) + createSaleBill + CLAUDE.md MTO section → สรุปว่า bundle ควรอยู่ MTO/Sales/logic กลาง แล้ว**ถามเจ้าของจุดตัดสินใจ** (composition ผูกที่ไหน · หักสต็อกทางไหน) ก่อนเสนอ design
3. Work 2: อ่าน `AddProductView` + SKU builder ปัจจุบัน → สรุป gap (category→prefix mapping, name search) แล้ว**ยืนยัน prefix table ใหม่กับเจ้าของ** ก่อนเสนอ design
4. เสนอ architecture/design ก่อน → รอคำสั่ง → ค่อย implement

---

*Audit v1 + Architecture Review ปิดตาม scope · ไม่มี code change/deploy · งานถัดไปเป็น investigation-first*
