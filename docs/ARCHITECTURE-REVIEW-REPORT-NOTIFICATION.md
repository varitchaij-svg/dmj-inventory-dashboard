# Architecture Review — Report Engine + Notification Center

Decision-support only · เขียน 2026-08-21 · **ไม่มี implementation / code change / deploy ในเอกสารนี้**

ตรวจจาก codebase จริง (cite `file:line`) · จุดที่ระบบยังไม่มี = เขียนว่า **"ยังไม่มี"** ไม่สมมติขึ้นเอง

---

## 1. Current Architecture (ระบบปัจจุบันเป็นอย่างไรจริง)

```
ZORT (source of truth: stock/sales)
   │  sync ทุก ~2 ชม. (syncZortBoth) + on-demand
   ▼
Google Sheets  ← primary database (ชีตหลายสิบใบ · ดู CLAUDE.md Constants)
   │
   ▼
Google Apps Script  = REST-ish API + LINE bot   (appsscript_complete.gs, ~15,600 บรรทัด · ไฟล์เดียว)
   │  doGet  → payload (columnar pv=3) / ver / stocklite / *Check / report-ish handlers
   │  doPost → actions (order/transfer/punch/createSaleBill/…)  dispatch ด้วย if-chain
   ▼
ERP Web App  = React 18 **ไม่มี build step** (Babel standalone ใน browser)
   │  Doomuenjing Dashboard.html:1623 (react umd) + :1638 (babel standalone)
   │  ui.jsx → views-main → views-analytics → views-quote → views-attendance → app.jsx
   │  hosting: Cloudflare Pages (static) + service worker cache
   ▼
[Report/PDF ปัจจุบัน = client-side window.print() ล้วน]  ← ยังไม่มี report engine
[Notification = 2 ระบบแยกกัน: LINE queue + in-app bell]
```

**ข้อเท็จจริงที่ยืนยันจากโค้ด:**

| ด้าน | สถานะจริง | หลักฐาน |
|---|---|---|
| Framework | React 18 UMD + Babel standalone, **ไม่มี build/bundler** | `Doomuenjing Dashboard.html:1623,1638` |
| Frontend | .jsx โหลดผ่าน `<script>` · compile ใน browser · cache ผ่าน service worker | CLAUDE.md สถาปัตยกรรม |
| Backend | GAS ไฟล์เดียว · doGet/doPost · dispatch ด้วย if-chain (`data.xxx`) | `appsscript_complete.gs:2268`(doPost) `:2572`(doGet) |
| Data source | Google Sheets (primary) · ZORT (source of truth) · Supabase (backup อย่างเดียว, ปิดอยู่) | ARCHITECTURE.md · `:15494` supabase |
| Auth | session token ในชีต → `resolveSession_` · role table `ROLE_ACTIONS_` + `canDoOrNull_` | `:476` `:785` `:842` |
| Deploy | GAS auto-deploy (GitHub Actions `clasp push`+`deploy` deploymentId เดิม) · web = Cloudflare | `.github/workflows/deploy-gas.yml` |

---

## 2. Gap Analysis (อะไรมีแล้ว / อะไรขาด)

### ✅ มีแล้ว (reuse ได้)

| ของที่มี | อยู่ที่ไหน | ใช้ต่อยอดอะไรได้ |
|---|---|---|
| Payload กลาง (columnar pv=3) | doGet | data source ของ report ทุกตัว (ไม่ต้องอ่านชีตซ้ำ) |
| Client print → PDF (A4, ตั้งชื่อไฟล์) | `views-quote.jsx:156` `runQuoteDocPrint` · `views-main.jsx:1306` `runIntakePrint` | PDF strategy (พิสูจน์แล้ว, ดู §8) |
| Print doc components | `QuotationPrintDoc` `IntakePdfDoc` `AttendanceReport` `StaffPerformanceView` | ต้นแบบ "report view = template" |
| In-app noti + **audience routing** | `:10599` `pushInappNoti_` · `:10546` `inappAudienceMatch_` (all/role:/staff:) | **แกนของ Notification Center — มี event→audience อยู่แล้ว** |
| LINE queue + retry/backoff/dedup | `:11864` `enqueueNoti_` · `:11923` `drainNotiQueue` | channel adapter ของ notification center |
| Central LINE sender (บางส่วน) | `:11768` `linePush_` คืน `{ok,code,quota}` | sender ที่ควร consolidate เข้าหา |
| Role/permission model | `:842` `canDoOrNull_` + `ROLE_ACTIONS_` | permission ของ report (ดู §6) |
| Daily snapshot (JSONB) | `:15545` `backupToSupabase_` (`daily_snapshots`) | historical snapshot primitive (แต่ backup-only + ปิดอยู่, ดู §7) |
| Scheduled trigger pattern | `drainNotiQueue`(1 นาที) `keepWarm_`(5 นาที) `syncZortBoth`(2 ชม.) | scheduled report (ดู §9) |
| Precomputed monthly numbers | ชีต "ยอดขายรายเดือน/รายวัน" | report data ที่ไม่ต้องคำนวณสด |

### ❌ ยังไม่มี (ต้องออกแบบ/สร้างถ้าจะทำ)

| ที่ขาด | ยืนยัน |
|---|---|
| Report Engine กลาง (Template+Data+Config) | grep `REPORT_REGISTRY`/`reportId`/`/reports/` = ว่าง |
| Report URL / Report ID (canonical identifier) | ไม่มี route/handler `/reports/…` เลย |
| Report registry (เพิ่ม report ใหม่โดยไม่แตะ core) | ยังไม่มี |
| Report-purpose snapshot (ณ เวลาสร้าง report) | มีแค่ daily backup snapshot คนละวัตถุประสงค์ |
| Notification Center กลาง (event→rule→channel) | มี 2 ระบบแยก (LINE + in-app) ไม่มีตัวรวม |
| Notification Rule engine (เงื่อนไข→ช่องทาง) | routing กระจายในแต่ละ call site |
| `LINE_GROUP_CONFIG` (routing ตามหัวข้อ/ทีม) | routing = primary/secondary + Script Property group เท่านั้น |
| LINE error classification (retryable vs permanent) | มีแค่ quota-vs-อื่น (ดู §5) |
| Failed-notification record / dead-letter พร้อม payload | status='failed' ในชีตคิว 7 วันแล้วลบ (ไม่ใช่ dead-letter จริง) |
| Report-level authentication/permission | ยังไม่มี (เพราะยังไม่มี report URL) |
| Report pagination/search/filter/sort ฝั่ง report | มีในบาง view (Category/Stock) แต่ไม่ใช่ report framework |

---

## 3. Report Engine Recommendation

**แนวทางที่แนะนำ: Report Engine = "frontend view registry" + "thin server report-identity layer" — ไม่ใช่ subsystem ใหม่บน GAS**

เหตุผล (จากข้อจำกัดจริงของระบบ):
- GAS มีเพดาน execution 6 นาที + คอขวด "ขนาด payload" ที่พิสูจน์แล้ว (Phase 7.4: payload 4.2MB × 15 เครื่อง → 404 กลางคัน) → **ไม่ควรให้ GAS เรนเดอร์ HTML report ก้อนใหญ่ฝั่ง server**
- report ที่มีอยู่ (Overview/staffperf/attendance/intake) เป็น **client-side view ที่ reuse payload เดิม** อยู่แล้ว = ต้นแบบที่ถูกทางและ low-risk

**โครงที่เสนอ (concept — ยังไม่สร้าง):**

```
REPORT_REGISTRY (frontend)     = [{ id, type, title, component, dataSelector, permission, exportEnabled, status }]
   │  Template  = React report component (เหมือน QuotationPrintDoc)
   │  Data      = selector จาก payload กลาง / report-specific endpoint (ถ้าจำเป็น)
   │  Config    = filter/date/category ที่ report รับ
   ▼
Report View  = <ReportShell registry[id] params={...} />   → HTML (primary)
   │  reuse: print pipeline เดิม → PDF (secondary)
   ▼
[server เฉพาะเท่าที่จำเป็น]: report identity + permission + snapshot-on-demand (ดู §6/§7)
```

**หลักการ:**
- เพิ่ม report ใหม่ = เพิ่ม 1 entry ใน `REPORT_REGISTRY` + 1 component → **ไม่แตะ core** (ตรงเป้าหมายที่ต้องการ)
- Data ดึงจาก payload กลางก่อนเสมอ · เปิด report-specific endpoint เฉพาะเมื่อ payload ไม่มีข้อมูลนั้น (เช่น staffPerf/attendance ที่มี endpoint ของตัวเองอยู่แล้ว)
- Large report (100+ SKU): pagination/search/filter/sort ทำ **ฝั่ง client** จาก data ที่โหลดมา (แพทเทิร์นเดียวกับ CategoryView/StockView ที่ทำได้ระดับพัน SKU แล้ว) — ไม่ยิง server ต่อหน้า

**Report ID ควรเป็น canonical identifier หรือไม่ → ควร แต่แยก 2 ระดับ:**
- **Report *type* URL** (`/reports/inventory/2026-08`) = "เปิด report แบบไหน ช่วงไหน" → regenerate จากข้อมูลปัจจุบัน (ดู §7 default)
- **Report *instance* ID** (`INV-202608-001`) = **เฉพาะ report ที่ต้อง snapshot/เป็นเอกสารทางการ** (monthly closing, official document) → ผูกกับ snapshot + audit trail
- อย่าบังคับให้ทุก report มี instance ID (จะกลายเป็นภาระ storage โดยไม่จำเป็น) — ใช้เมื่อ report เป็น "หลักฐาน" เท่านั้น

---

## 4. Notification Center Recommendation

**แนวทาง: promote ระบบที่มีอยู่ (in-app audience) ให้เป็น dispatcher กลาง แล้วให้ LINE เป็น 1 channel — ไม่เขียนใหม่จากศูนย์**

ระบบปัจจุบันใกล้ concept `Event→Rule→Channel` อยู่แล้วครึ่งทาง:
- `pushInappNoti_({audience, type, title, tab, focus, view})` = **event ที่มี audience routing** (`:10599`)
- `enqueueNoti_({channel, priority, dedupKey, payload})` = **channel queue** (`:11864`)
- แต่ **แต่ละ feature เรียกตรงทั้งสองระบบเอง** → ไม่มีตัวกลางที่ตัดสิน "event นี้ → ไปช่องไหนบ้าง"

**โครงที่เสนอ (concept):**

```
ERP Event (stock ต่ำ / order ใหม่ / MTO เสร็จ / จัดส่ง / adjustment / monthly closing)
   ▼
Notification Center  = dispatch(event)   ← ตัวกลางตัวเดียว
   ▼
Notification Rule    = ต่อ event: audience + channels + dedup + priority
   ▼
Channel adapters     = in-app (มีแล้ว) · LINE (มีแล้ว, consolidate ก่อน §5) · [email/web-push อนาคต]
```

**ทำน้อยที่สุดที่ได้ผล**: เขียน `dispatch(eventType, context)` ที่ map event → rule → เรียก `pushInappNoti_` และ/หรือ enqueue LINE ให้ (แทนที่ feature จะเรียกเอง) · rule table เป็น config เดียว = แก้ปลายทาง/ช่องทางที่เดียว

**`LINE_GROUP_CONFIG` — สมเหตุสมผล แต่หมายเหตุ:** LINE group **ไม่ได้ hard-code กระจายทั่ว codebase** อยู่แล้ว (อ่านจาก Script Property `LINE_GROUP_ID`/`LINE_GROUP_ID_2` ผ่าน `lineGroupTarget_` `:11741`) · ที่ขาดคือ **routing ตามหัวข้อ/ทีม** (Management/Warehouse/Sales) → `LINE_GROUP_CONFIG` ควรเป็น mapping `topic → group` ใน Script Property/config เดียว ให้ rule ชี้ topic ไม่ใช่ group id ตรง ๆ

---

## 5. LINE Reliability (นำ HTTP 400 finding มาประกอบ — ยังไม่แก้ code)

จาก finding: `linePush_primary 400: {"message":"Failed to send messages"}` (`drainNotiQueue`, 2026-08-21 ~09:01) — **CONFIRMED occurrence, UNKNOWN root cause** (ดู closure doc)

**ตรวจ architecture ปัจจุบันเทียบ checklist:**

| ความสามารถ | มี? | หลักฐาน / gap |
|---|---|---|
| Centralized sender | 🟡 **บางส่วน** | `linePush_` `:11768` เป็นตัวกลางที่ดี **แต่มี 6 จุดยิง `api.line.me/.../push` ตรง** bypass มัน: `:12057 sendLineMessage_` `:12078 sendLineGroup_` `:12090 sendLineGroupMentionAll_` `:12229` `:12255` (+reply/loading) |
| Error classification | 🟡 **หยาบ** | `linePush_` แยกแค่ `quota` (429 หรือ regex body) vs อื่น (`:11779`) — **ไม่แยก 400 permanent จาก 5xx transient** |
| Retry | ✅ | `drainNotiQueue` backoff (`:12024`) max 6 (`:12016`) |
| Retry เฉพาะ retryable | ❌ | **400 ถูก retry 6 ครั้งเท่ากับ error ชั่วคราว** — 400 (client error) แก้เองไม่ได้ด้วยการยิงซ้ำ = เปลือง + หน่วง |
| Logging / correlation ID | 🟡 | มี `Logger.log` (`:11780`) แต่ **ephemeral** (default GCP project) + ไม่มี correlation id ผูก event↔attempt |
| Dead-letter / failed record | 🟡 | status='failed' + lastErr ในชีตคิว (`:12021`) แต่ลบใน 7 วัน (`:12043`) + ไม่เก็บ payload แยกไว้ inspect = ไม่ใช่ dead-letter จริง |
| Duplicate-send protection | ✅ | dedupKey บน pending (`:11879`) |
| Observability success/failure | 🟡 | นับ **success** ต่อเดือน (`:11787 notiBumpQuota_`) แต่ **ไม่มี failure counter** |
| Group/token config validation | 🟡 | มี guard `no token/target` (`:11771`) แต่ไม่ validate group id ใช้ได้จริง |

**Design ที่เสนอ (ยังไม่แก้ code):**
1. **Consolidate**: ทุกการส่ง LINE ผ่าน `linePush_` ตัวเดียว (ยุบ 6 bypass senders) → error handling/quota/observability ครบทุกเส้น
2. **Classify**: 400/401/403/404 = **permanent → ไม่ retry, ลง dead-letter ทันที** · 429/5xx/timeout = **transient → retry backoff เดิม**
3. **Record**: failed record เก็บ payload + code + body + correlation id ไว้ inspect (ไม่ลบเร็ว) → เจ้าของเห็นว่า "อะไรส่งไม่ออก เพราะอะไร"
4. **Observe**: failure counter คู่ success counter → เห็น delivery rate จริง
5. ⚠️ **ยังไม่ทราบว่า 400 นี้เกิดจากอะไร** — design นี้ทำให้ครั้งหน้า**วินิจฉัยได้** ไม่ใช่เดา (แก้ที่ observability ก่อน แก้สาเหตุทีหลังเมื่อรู้)

---

## 6. Security Model (permission / authentication)

**ปัจจุบัน:** `resolveSession_(ss, token)` `:476` (session token ในชีต) → role → `canDoOrNull_(sess, action)` `:842` เทียบ `ROLE_ACTIONS_` · **แต่ส่วนใหญ่ยัง gate หลัง `REQUIRE_LOGIN` ที่ default ปิด** (no-op ยกเว้น `IMMEDIATE_GATE_ACTIONS_` 9 action)

**gap สำหรับ report:** ยังไม่มี report เลยจึงยังไม่มี report permission

**หลักที่ต้องยึด (เสนอ):**
- ⚠️ **ห้าม assume "ใครมี URL = ดูได้"** — report URL ที่เปิดข้อมูลธุรกิจ **ต้องผ่าน `resolveSession_` + role check ทุกครั้ง** (เหมือน `attendancePhoto`/`getAuditLog`/`staffPerf` ที่ตรวจ session จริงแล้ว — เป็นแพทเทิร์นที่มีในระบบ)
- report data ต้องตัดตาม role เหมือน payload variant (`full`/`ops`/`lite`) ที่ทำอยู่ — เช่น warehouse ไม่เห็นต้นทุน/margin
- role → report access (เสนอ):

| role | report ที่ควรเห็น |
|---|---|
| Management (owner/dev) | ทุก report (sales/inventory/purchase/employee/monthly) |
| Warehouse | inventory/stock movement/shipping/MTO/low-stock (ไม่มีต้นทุน/ยอดขายเป็นเงิน) |
| Sales | sales/order status ของตัวเอง (ไม่เห็น employee report คนอื่น/ต้นทุน) |

- **report identity ต้องผูก audit trail** (ใครสร้าง/เปิด report ไหน เมื่อไหร่) — reuse `writeAuditLog_` ที่มีอยู่

---

## 7. Historical Report Strategy (current vs snapshot vs hybrid)

**คำถามหลัก:** ZORT แก้ข้อมูลย้อนหลังได้ → report ที่สร้างวันนี้ ถ้าเปิดพรุ่งนี้ควรเห็นเลขเดิมหรือเลขใหม่?

**Recommendation: HYBRID (C)** — แยกตามวัตถุประสงค์ของ report

| ประเภท report | กลยุทธ์ | เหตุผล |
|---|---|---|
| **Operational** (low-stock, stock movement, order/shipping status) | **Regenerate (A)** จากข้อมูลปัจจุบันทุกครั้ง | ต้องการภาพ "ตอนนี้" · การ snapshot จะทำให้เห็นของเก่าที่ไม่ตรงความจริง |
| **Official / เอกสารการเงิน** (monthly sales closing, monthly inventory, report ที่เอาไปคุยเงินเดือน/บัญชี) | **Snapshot (B)** ณ เวลาสร้าง + report instance ID | ต้อง "แช่แข็ง" ตัวเลขไว้เป็นหลักฐาน · ZORT แก้ย้อนหลังต้องไม่เปลี่ยนเอกสารที่ออกไปแล้ว |

**เหตุผลที่ไม่เลือก A หรือ B อย่างเดียว:**
- A ล้วน → เอกสารทางการเปลี่ยนเองเมื่อ ZORT แก้ย้อนหลัง = หลักฐานเชื่อไม่ได้
- B ล้วน → operational report เห็นของเก่าตลอด + storage บวมโดยไม่จำเป็น

**ของที่มีช่วยได้:**
- daily snapshot (`daily_snapshots` JSONB `:15498`) เป็น primitive ที่ **พิสูจน์ว่าทำ snapshot payload ได้** — แต่ backup-only, daily granularity, **และ constraint รอบนี้ห้ามแตะ Supabase** → **ไม่ใช้เป็น report store ตอนนี้**
- ชีต "ยอดขายรายเดือน/รายวัน" = ตัวเลขรายเดือนที่ถูก precompute ไว้แล้ว → monthly report ส่วนมาก snapshot ได้จากตรงนี้โดยไม่ต้องสร้าง store ใหม่
- snapshot-on-demand (สร้างเฉพาะตอนกด "ออกเอกสารทางการ") ดีกว่า snapshot-everything

---

## 8. PDF Strategy

**Recommendation: คง HTML-primary + browser `window.print()` → PDF (secondary) — ห้ามย้ายไป server-side/rasterize**

เหตุผล (ทั้งหมดมีหลักฐานในระบบ):
- แพทเทิร์นนี้พิสูจน์แล้ว: `runQuoteDocPrint` `:156` / `runIntakePrint` — เลย์เอาต์ A4 จริงอยู่ใน `@media print`, ตั้งชื่อไฟล์ผ่าน `document.title`
- **ห้าม html2canvas/jsPDF สำหรับเอกสาร A4** (บทเรียนในโค้ด `views-quote.jsx:121`): rasterize จากจอได้คนละหน้าตากับที่พิมพ์ + เน็ตร้าน/iPad โหลด CDN ไม่เสถียร (jsPDF ใช้เฉพาะการ์ด label ที่ยอมรับ canvas ได้)
- **GAS สร้าง PDF ฝั่ง server ไม่คุ้ม**: เพดาน 6 นาที + คอขวดขนาด payload + ต้อง reรเนอร์ HTML ที่ layout ซับซ้อน → เสี่ยงกว่าประโยชน์
- native print โหลด `<img>` จริง (รูปสินค้าใน report ขึ้นได้) — ต่างจาก html2canvas ที่ CORS พังเป็นช่องว่าง (`views-main.jsx` intake note)

**สรุป: HTML = primary output, PDF = ผลของ print ในเบราว์เซอร์ผู้ใช้** — report engine แค่ผลิต HTML ที่ print-friendly (มี `.no-print`/`@media print`) ก็ได้ PDF ฟรี

---

## 9. Queue / Retry / Error Handling

| ด้าน | ปัจจุบัน | เพียงพอสำหรับ report/notification center? |
|---|---|---|
| Queue | มีสำหรับ LINE (`enqueueNoti_`/`drainNotiQueue`, sheet + trigger 1 นาที) | ✅ reuse เป็น channel adapter ได้ · report ไม่ต้องมี queue (สร้างตอนผู้ใช้กด/ตาม schedule) |
| Retry | LINE: backoff+max6 · report: N/A | LINE ok แต่ **ไม่ classify** (ดู §5) |
| Error handling | ห่อ try/catch + `Logger.log` แทบทุกที่ · noti/backup ไม่ throw โดยเจตนา | โครงดี **แต่ log ephemeral** (default GCP) = วินิจฉัยย้อนหลังไม่ได้ (ดู closure OBSERVABILITY LIMITATION) |
| Scheduled | time-driven trigger มีแล้ว (drain/keepWarm/syncZortBoth) | ✅ scheduled report reuse pattern นี้ได้ (เช่น monthly closing 1 ค่ำ) |
| Event-driven | ยังไม่มี event bus (feature เรียก noti ตรง) | ต้องมี Notification Center §4 ก่อน ถึงจะทำ event-driven report ได้สะอาด |

**Retry architecture ควรอยู่ตรงไหน:** ที่ **channel adapter (drain layer)** เหมือนที่ LINE ทำอยู่ — **ไม่ใช่ที่ตัว event/feature** · report generation ที่ผู้ใช้กดเองไม่ควร auto-retry (ให้ผู้ใช้กดใหม่ — แพทเทิร์นเดียวกับ non-idempotent actions ในระบบ)

---

## 10. Implementation Phases (เสนอลำดับ — ยังไม่ implement)

เรียงตาม (ผลตอบแทน ÷ ความเสี่ยง) และ dependency:

| Phase | งาน | ทำไมก่อน | ขนาด/ความเสี่ยง |
|---|---|---|---|
| **P0** | (config, ไม่ใช่ code) ผูก **standard GCP project** เพื่อปลดล็อก observability | ทุก phase หลังพึ่ง log วินิจฉัยได้ + ปลด audit v2 | เล็ก / ต่ำ — ไม่แตะ application code |
| **P1** | LINE **consolidate 6 senders → `linePush_`** + error classification + failure record | address CONFIRMED finding · เป็นฐานของ notification center | กลาง / กลาง (แตะ LINE — เลี่ยงตอนนี้ตาม constraint) |
| **P2** | **Notification Center dispatcher** ครอบ in-app+LINE (event→rule→channel) + `LINE_GROUP_CONFIG` | รวม routing ที่กระจาย · เปิดทาง event-driven report | กลาง / กลาง |
| **P3** | **Report registry (frontend)** + report shell + 2 report แรก (reuse payload+print) | เพิ่ม report โดยไม่แตะ core · low-risk (client-side) | กลาง / ต่ำ |
| **P4** | **Report identity + permission (server)**: report URL ผ่าน session/role + audit | ก่อนเปิด report ที่มีข้อมูลอ่อนไหว | กลาง / กลาง (security-critical) |
| **P5** | **Snapshot-on-demand** สำหรับ official report (monthly closing) | หลังมี report identity แล้ว | กลาง / กลาง |
| **P6** | Scheduled/event-driven report (reuse trigger + notification center) | ปลายทาง หลัง P2–P5 พร้อม | เล็ก-กลาง / ต่ำ |

**ไม่ควรทำ:** ย้าย report ไป server-side rendering บน GAS · สร้าง report store แยกก้อนใหญ่ · ย้าย DB/ออกจาก Sheets เพื่อ report · ทำ snapshot-everything

---

## 11. Risk Assessment

| ความเสี่ยง | ระดับ | หมายเหตุ |
|---|---|---|
| **Observability ตาบอด** (default GCP → log ดึงย้อนหลังไม่ได้) | 🔴 สูง | P0 แก้ก่อน · ไม่แก้ = P1–P6 debug production ไม่ได้ |
| **Report URL รั่วข้อมูล** ถ้า ship ก่อน P4 | 🔴 สูง | ห้าม ship report URL ที่ไม่ผ่าน session/role |
| **GAS payload-size / 6-min limit** | 🟠 กลาง | บังคับให้ report เป็น client-side (Phase 7.4 บทเรียน) — ถ้าเผลอทำ server จะซ้ำรอย 404 |
| **แตะ LINE code (P1) ตอนที่ยังห้าม** | 🟠 กลาง | รอบนี้ **ห้ามแตะ** · P1 เป็นงานรอบหน้า |
| **Snapshot ผิดวัตถุประสงค์** (snapshot operational report) | 🟠 กลาง | ยึด §7 hybrid เข้ม |
| **Dependency กับผู้สร้างระบบ** | 🟠 กลาง | ไฟล์ GAS เดียว 15,600 บรรทัด + if-chain dispatch + no-build frontend = ความรู้กระจุก · registry-based (report/noti) ช่วยลด (ดู §12 คำถาม 18) |
| **ZORT เป็น source of truth ที่แก้ย้อนหลัง** | 🟡 ต่ำ-กลาง | §7 hybrid รองรับแล้ว |

---

## 12. Final Recommendation

**"ควรสร้าง Report Engine + Notification Center บน architecture ปัจจุบันหรือไม่" → ควร แต่แบบ incremental บนของที่มี ไม่ใช่ subsystem ใหม่**

ระบบปัจจุบันมี primitive ครบพอเป็นฐาน (payload กลาง · print→PDF · audience routing · queue · role model · trigger) — การสร้างของใหม่ทั้งหมดจะซ้ำซ้อนและเพิ่มความเสี่ยงโดยไม่จำเป็น

### อะไรควรใช้ของเดิม
- payload กลาง (columnar) เป็น data source ของ report
- `runQuoteDocPrint`/print pipeline เป็น PDF engine
- `pushInappNoti_` audience เป็นแกน Notification Center
- LINE queue (`enqueueNoti_`/`drainNotiQueue`) เป็น channel adapter
- `resolveSession_`/`canDoOrNull_`/`ROLE_ACTIONS_` เป็น report permission
- time-driven trigger เป็น scheduled report
- `writeAuditLog_` เป็น report audit trail

### อะไรควรเพิ่ม
- `REPORT_REGISTRY` (frontend) + report shell + report identity/permission layer (server บาง ๆ)
- Notification Center dispatcher (event→rule→channel) + `LINE_GROUP_CONFIG`
- LINE error classification + failure record (P1)
- snapshot-on-demand เฉพาะ official report

### อะไรไม่ควรสร้าง
- server-side HTML report rendering บน GAS
- report store ก้อนใหญ่แยก / snapshot-everything
- ระบบ notification ที่สามที่แยกจาก in-app+LINE
- ย้าย DB ออกจาก Sheets เพื่อ report

### อะไรควรทำก่อน
1. **P0 standard GCP project** (config, ปลด observability — ฐานของทุกอย่าง + ปิด audit v2)
2. **P1 LINE consolidate + classify + failure record** (address CONFIRMED finding)

### อะไรควรรอ
- report ที่มีข้อมูลอ่อนไหว **รอ P4** (permission) ก่อน ship URL
- event-driven / scheduled report **รอ P2** (notification center) ให้เสร็จก่อน
- snapshot official report **รอ P4/P5**
- ทั้งหมดนี้ **รอหลัง Backend Stability Audit v1 ปิด + P0 observability** เพราะถ้า production พังต้อง debug ได้ก่อน

---

## ตอบ Data / infrastructure questions (18 ข้อ — ตรวจจาก codebase จริง)

1. **Framework**: React 18 UMD + Babel standalone, **ไม่มี build step** (`Doomuenjing Dashboard.html:1623,1638`)
2. **Frontend architecture**: .jsx หลายไฟล์โหลดผ่าน `<script>` · compile ใน browser · service-worker cache · Cloudflare Pages
3. **Backend architecture**: GAS ไฟล์เดียว (`appsscript_complete.gs`) · doGet/doPost · dispatch ด้วย if-chain
4. **Data sources**: Google Sheets (primary DB) · ZORT (source of truth stock/sales) · Supabase (backup อย่างเดียว, ปิดอยู่)
5. **Authentication**: session token ในชีต "เซสชัน" → `resolveSession_` (`:476`) · TTL 30 วัน · LINE login + handoff
6. **Apps Script role**: เป็นทั้ง REST API layer, business logic, LINE bot, scheduler — **ทุกอย่างฝั่ง server รวมที่เดียว**
7. **Sheets/DB usage**: Sheets เป็น DB จริง (อ่าน/เขียนทุก action) · cache 2 ชั้น (payload/stale) กัน stampede
8. **Dynamic HTML**: ทำได้ **ฝั่ง client** (React render) เป็นหลัก · GAS ทำ HTML ได้ (HtmlService) แต่**ไม่แนะนำ**สำหรับ report ก้อนใหญ่ (§3/§8)
9. **Metadata ควรเก็บที่ไหน**: report/notification config → ชีตใหม่ + Script Property (แพทเทิร์นเดียวกับ `STOCK_THRESHOLDS`/noti config) · runtime state → CacheService/Property
10. **PDF generation**: **frontend (browser `window.print()`)** — ไม่ใช่ server/service (§8)
11. **LINE Messaging API เชื่อมตรงไหน**: GAS → `linePush_` (`:11768`) + 6 bypass senders (§5) · queue drain trigger รายนาที
12. **ต้องมี queue ไหม**: มีแล้วสำหรับ LINE (พอสำหรับ notification) · report **ไม่ต้อง** (สร้างตอนกด/ตาม schedule)
13. **Logging/error handling พอไหม**: โครง try/catch+ไม่ throw ดี **แต่ observability ไม่พอ** (default GCP → log ดึงย้อนหลังไม่ได้ — closure OBSERVABILITY LIMITATION) → P0
14. **Retry architecture ควรอยู่ตรงไหน**: ที่ **channel adapter (drain)** ไม่ใช่ที่ event/feature (§9)
15. **Report URL ควรหมดอายุไหม**: operational report — ไม่ต้อง (regenerate + gate ด้วย session) · official/snapshot report — **ไม่หมดอายุ** (เป็นหลักฐาน) แต่ **ต้อง gate ด้วย permission ทุกครั้ง ไม่ใช่ URL-secrecy** (§6)
16. **Historical: snapshot หรือ regenerate**: **hybrid** — operational=regenerate, official=snapshot (§7)
17. **Permission model ปัจจุบันรองรับ report security ไหม**: **มีฐาน** (`canDoOrNull_`/`ROLE_ACTIONS_`) แต่ส่วนใหญ่ gate หลัง `REQUIRE_LOGIN` ที่ปิดอยู่ → report ต้องตรวจ session/role **ตรง ๆ** เหมือน `staffPerf`/`getAuditLog` (ไม่พึ่ง REQUIRE_LOGIN)
18. **Architecture ใดลด dependency กับผู้สร้างระบบมากสุด**: **registry-based** — report เพิ่มด้วย 1 entry ใน `REPORT_REGISTRY` + 1 component · notification เพิ่มด้วย 1 rule · **ไม่ต้องเข้าใจ core ทั้ง 15,600 บรรทัด** = ลดความรู้กระจุกที่ตัวระบบมากที่สุด

---

*เอกสารนี้เป็น decision-support · ไม่มีการแก้ code/deploy/DB/GCP/LINE/implementation · รอคำสั่งถัดไปก่อนเริ่มงานใด ๆ*
