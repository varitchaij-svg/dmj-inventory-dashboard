# Report Engine + Notification Center — Architecture Review v1

**สถานะ**: 📋 Architecture Review — ยังไม่ implement, ยังไม่แตะโค้ด, ยังไม่ deploy
**Baseline ที่ยึดในรอบนี้**: A1 Columnar Payload (production PASS, ห้ามย้อน) · Backend Stability Phase B
(observability deploy แล้ว, ยังไม่มี production `[perfB]` log วิเคราะห์ root cause ได้, ยังไม่ทำ Phase C) ·
MTO V2 (Domain Model + Event Flow + Architecture Review Gate เสร็จครบ, Phase 2A READY แต่ห้ามเริ่มใน
session นี้, **MTO ไม่ใช่ owner ของ LINE architecture** — งาน LINE consolidation เป็นคนละก้อนที่กระทบ
ทั้งระบบ)
**วิธีอ่าน**: ทุกข้อสรุปผูกกับหลักฐานจริงในโค้ด/เอกสารที่มีอยู่ (`file:line`) — ไม่มี "Report Engine" หรือ
"Notification Center" เป็นระบบสำเร็จรูปอยู่แล้ว การอ้างถึง "architecture review ก่อนหน้าเกี่ยวกับ Report
Engine + LINE Bot" ในคำสั่งนี้ — ตรวจ repo/docs แล้ว **ส่วน LINE Bot มีจริง** (คือ §9 ของ
`docs/MTO-ARCHITECTURE-REVIEW-GATE.md` ที่ทำไปก่อนหน้าในเซสชันนี้เอง) แต่ **ส่วน "Report Engine"
ไม่พบเอกสาร/โค้ดที่ตรงชื่อนี้ที่ไหนใน repo** — รอบนี้จึงเป็นการออกแบบจากศูนย์สำหรับ Report Engine
โดยอิงกับของที่มีอยู่จริง ไม่ใช่การต่อยอดเอกสารเดิมที่หาไม่เจอ (ระบุตรงๆ แทนการสมมติว่ามี)

---

## 1. Executive Summary

- ระบบมี **ad-hoc report views จำนวนมาก** (StaffPerformanceView, AttendanceReportView, OverviewView,
  CustomerView, MarginView, SeasonView, TrackingView ฯลฯ) แต่ **ไม่มี Report Registry/Report Engine
  กลางที่ไหนเลย** — แต่ละหน้าคำนวณ/cache/render เอง ซ้ำ pattern กันแต่ไม่ share abstraction
- ระบบมี **notification 2 กลไกคู่ขนาน** (LINE queue + in-app bell) ที่ทำงานได้จริงในระดับ delivery
  แต่ **audience/channel ถูก hard-code กระจายอยู่ในแต่ละ call site** (ตรงกับที่คำสั่งเตือนไว้พอดี "ห้าม
  hard-code Group ID กระจายตาม feature" — ระบบวันนี้เป็นแบบนั้นอยู่แล้วจริงๆ)
- ระบบมี **PDF/print capability ที่ทำงานได้จริงและพิสูจน์แล้วในสถาปัตยกรรมนี้**: `window.print()` +
  `document.title` + CSS `@media print` (ไม่มี server-side PDF, ไม่มี html2canvas สำหรับเอกสาร) — เป็น
  แนวทางที่ต้อง **reuse ตรงๆ** ไม่สร้างใหม่
- ระบบ **ไม่มี URL routing จริงเลย** (ไม่มี path-based route, ไม่มี query-param deep link ไปหน้าใดหน้า
  หนึ่ง) — "Report URL" ที่ขอให้ออกแบบเป็น **โครงสร้างใหม่ทั้งหมด** ไม่ใช่ส่วนขยายของของเดิม
- Supabase มีอยู่จริงในระบบแล้ว แต่เป็น **write-only daily backup mirror** (`backupToSupabase_`,
  trigger 03:00) **ไม่ใช่ query/read layer** — ห้ามสมมติว่า Report Engine ยิง query ไป Supabase ได้เลย
  วันนี้
- **Backend มี known perf issue ที่ยังไม่ resolve** (`docs/HANDOFF-BACKEND-OBSERVABILITY.md`: auth:me
  ช้า 14.4–64.2s, doPost ค้างถึง 298.6s ในบาง incident) — ยังไม่มี production `[perfB]` log พิสูจน์
  root cause — นี่คือ risk เชิง sequencing ที่กระทบ Report Engine โดยตรงเพราะ Report Engine = โหลด
  เพิ่มบน backend เดียวกัน
- **สรุป**: สถาปัตยกรรมเดิมรองรับแนวคิด Report Engine + Notification Center ได้แบบ **incremental**
  (ไม่ต้องสร้าง subsystem ใหม่) — รายละเอียดและ blocker อยู่ใน §15/§18

---

## 2. Current Architecture Findings (PART 1)

| หัวข้อที่ขอให้ตรวจ | สิ่งที่พบจริง (พร้อมหลักฐาน) |
|---|---|
| **Frontend framework** | React 18 **ไม่มี build step** — Babel standalone ใน browser, โหลดผ่าน `<script>` เรียงลำดับ `ui.jsx → views-main.jsx → views-analytics.jsx → views-quote.jsx → views-attendance.jsx → app.jsx` (ตาม CLAUDE.md) — **ไม่มี URL router library ใดๆ** (ไม่มี react-router) |
| **Backend architecture** | Google Apps Script เดี่ยว (`appsscript_complete.gs`, ~15,900+ บรรทัด) เป็น REST-ish API ผ่าน `doGet`/`doPost` dispatch ตัวเดียว — ไม่มี microservice/แยก service |
| **Google Apps Script role** | ทั้ง (1) API layer, (2) business logic, (3) DB access layer ผ่าน `SpreadsheetApp`, (4) external integration (ZORT/LINE/Drive/Supabase) — ทำทุกอย่างในไฟล์เดียว |
| **ZORT integration** | Source of truth สำหรับ: สต็อกจริง (sync `syncZortBoth` ทุก 2 ชม.), เอกสารภาษี/ใบกำกับ, ยอดขาย (`AddOrder`) — Sheets เป็น live cache ที่ reconcile กลับหา ZORT เป็นระยะ (ยืนยันซ้ำจาก MTO review รอบก่อน) |
| **Google Sheets usage** | Primary write model ของทั้งระบบ — ทุก entity (Product, Order, Shipment, Session, Attendance, MTO Job, ฯลฯ) เป็นแถวในชีตคนละใบ ผ่าน `SpreadsheetApp.openById(SHEET_ID)` |
| **Supabase usage** | `appsscript_complete.gs:15700-15750+` — **write-only, daily backup only** ผ่าน PostgREST RPC (`supabaseRpc_` → `refresh_backup` function) gate ด้วย `SUPABASE_BACKUP_ENABLED` · **ไม่มี read/query path ไปที่ Supabase เลยในโค้ดปัจจุบัน** — ต่างจากที่อาจสันนิษฐานว่าเป็น "ฐานข้อมูลสำรองที่ query ได้" |
| **Authentication/session model** | LINE OAuth → `authLine_` → `SHEET_SESSIONS` (token, staffId, TTL 30 วัน) — ทุก POST resolve session ผ่าน `resolveSession_(ss, data.sessionToken)` แนบอัตโนมัติผ่าน `dmjFetch` (ui.jsx) — ยืนยันตัวตนจาก server เสมอ ไม่เชื่อ client |
| **Permission model** | `ROLE_ACTIONS_`/`canDoOrNull_` (ตาราง role→action ที่อนุญาต) + `IMMEDIATE_GATE_ACTIONS_`/`IMMEDIATE_GATE_STRICT_ACTIONS_` (บังคับเช็คทันทีสำหรับ action กระทบเงิน/สต็อก) — ⚠️ **`REQUIRE_LOGIN` ยัง default ปิด** แปลว่าตาราง role ส่วนใหญ่เป็น no-op วันนี้ (ของเดิมยังไม่พัง) ยกเว้น 9 action ใน `IMMEDIATE_GATE_*` ที่เช็คจริงเสมอ |
| **Existing notification system** | **2 ระบบคู่ขนาน**: (1) LINE queue v2 (`enqueueNoti_`/`drainNotiQueue`, `SHEET_NOTI_QUEUE`, gate `NOTI_QUEUE_ENABLED`) (2) In-app bell (`pushInappNoti_`/`listInappNotiHandler_`, `SHEET_INAPP_NOTI`, gate `INAPP_NOTI_ENABLED`) — ทั้งคู่ audience/channel **hard-code ต่อ call site** ไม่มี central rule table |
| **Existing LINE integration** | ตรวจละเอียดแล้วใน §9 ของ `docs/MTO-ARCHITECTURE-REVIEW-GATE.md` — สรุปซ้ำใน §10 ของเอกสารนี้ |
| **Existing PDF/print capability** | `window.print()` + `document.title` (ตั้งชื่อไฟล์ตอน "บันทึกเป็น PDF") + CSS `@media print` — ใช้กับ `QuotationPrintDoc`/`IntakePdfDoc`/label printing — **ไม่มี server-side PDF generation ที่ไหนในระบบ** (`html2canvas` self-host มีอยู่จริงแต่ใช้เฉพาะแปลง "สรุปคำสั่งซื้อออนไลน์" เป็นรูปภาพส่งแชท ไม่ใช่เอกสาร PDF) |
| **Existing report/dashboard architecture** | **ไม่มี central engine** — แต่ละ View (`OverviewView`, `StaffPerformanceView` [views-analytics.jsx:8049], `TrackingView`, `CustomerView`, `MarginView`, `SeasonView` ฯลฯ) เป็น React component แยกอิสระ บางตัวมี GAS handler+cache เฉพาะทาง (เช่น `staffPerfHandler_` cache 300s ต่อเดือน) บางตัวคำนวณสดจาก payload ที่โหลดมาแล้วทั้งหมด — **ไม่มี concept "report instance"/"report URL"/"historical snapshot" ที่ไหนเลย** ทุกอย่างคือ regenerate-on-view |
| **Existing queue/retry/dead-letter mechanism** | มีเฉพาะใน LINE queue (`SHEET_NOTI_QUEUE`) — exponential backoff, `maxAttempts`→`status='failed'` (dead-letter primitive แต่ไม่มีใครอ่าน ตามที่สรุปไว้แล้วใน MTO review §9) — **ไม่มี general-purpose job queue อื่นในระบบ** |
| **URL routing** | **ไม่มีเลย** — `app.jsx` ใช้ in-memory state (`activeTab`) สลับหน้า ไม่มี path-based route, `history.pushState` มีจุดเดียว (บรรทัด 1636) ใช้ดักปุ่ม back ของมือถือ ไม่ใช่ routing จริง · `URLSearchParams` ใช้เฉพาะอ่าน OAuth callback `code` param แล้วเคลียร์ทิ้ง |

---

## 3. Report Engine Architecture (PART 2)

**หลักการที่ยึด**: `Data + Template + Configuration = HTML Report` — ตรงกับ pattern ที่ระบบใช้อยู่แล้วจริง
กับเอกสาร (`QuotationPrintDoc` = data จาก cart/quote + template component + config เช่น `isInvoice`/
`labelMode`) เพียงแต่วันนี้ pattern นี้ใช้กับ "เอกสารการเงิน" ไม่ใช่ "รายงาน" — Report Engine คือการดึง
pattern เดียวกันมาใช้กับรายงานอย่างเป็นระบบ ไม่ใช่คิดใหม่

```
┌──────────┐   ┌───────────┐   ┌───────────────┐
│  Data     │ + │ Template   │ + │ Configuration  │  =  HTML Report
│ (GAS      │   │ (React     │   │ (role/period/  │
│  handler   │   │  component,│   │  filter จาก    │
│  หรือ query)│   │  reuse doc  │   │  Report Registry)│
└──────────┘   │  pattern)  │   └───────────────┘
                └───────────┘
```

**AI ไม่อยู่ใน runtime path** — ยืนยันชัดเจน: Report Engine เป็น deterministic pipeline (data query →
template render) เหมือน `QuotationPrintDoc` ทุกวันนี้ ไม่มี LLM call ระหว่าง generate report เลย — ถ้า
ต้องการ "สรุปด้วยภาษาธรรมชาติ" ในอนาคตต้องเป็น**ขั้นตอนแยกก่อน**ที่เขียนผลลัพธ์ (ข้อความ) เป็น data
เข้าไปในระบบ ไม่ใช่ให้ AI generate ตอนเปิดรายงานทุกครั้ง (deterministic reproducibility ของรายงาน
ต้องคงอยู่ — คนละ instance ของรายงานเดียวกันต้องได้ผลเหมือนกันเป๊ะถ้า data เหมือนกัน)

**ข้อเสนอ — สร้างแบบ incremental บนของเดิม**:
- **ชั้น Data**: reuse GAS handler + cache pattern ที่มีอยู่แล้ว (`staffPerfHandler_` เป็นตัวอย่างที่ดี
  ที่สุด — cache ต่อ scope key, `fresh=1` ข้าม cache) — Report Engine **ไม่ต้องสร้าง data-fetching
  layer ใหม่** แค่บังคับให้ทุก report ใหม่เดินตาม pattern นี้ผ่าน Registry แทนที่จะเขียน handler
  แบบ ad-hoc เหมือนที่ผ่านมา
- **ชั้น Template**: reuse React component pattern ของ `QuotationPrintDoc`/`IntakePdfDoc` — component
  รับ `data` + `config` เป็น prop ตรงๆ ไม่มี templating language ใหม่ (Handlebars/EJS ฯลฯ) — เหตุผล
  เดียวกับที่ระบบทั้งหมดไม่มี build step: เพิ่ม templating engine = เพิ่ม dependency ที่ขัดกับ
  สถาปัตยกรรม "ไม่มี npm dependency" ที่ CLAUDE.md ระบุไว้ตรงๆ
- **ชั้น Configuration**: มาจาก Report Registry (§4) — ไม่ hard-code ต่อ report

---

## 4. Report Registry (PART 2)

**ควรมี** — เหตุผล: วันนี้ "รายงาน" แต่ละตัวไม่มีที่ไหนบอกว่า "มีรายงานอะไรบ้างในระบบ" ต้องไล่เปิด
`app.jsx`/`views-analytics.jsx` เอง (เหมือนที่พบตอนสำรวจ §2 ต้อง grep หาเอง) — Registry แก้ปัญหานี้โดย
ไม่ต้องเปลี่ยนของเดิมทั้งหมดพร้อมกัน

**Schema ที่เสนอ (ตรวจกับ repo แล้ว ไม่ copy ตัวอย่างในคำสั่งมาตรงๆ)**:

| Field | เหตุผลที่ใส่/ตัดจากตัวอย่างเดิม |
|---|---|
| `reportId` | จำเป็น — ใช้ pattern เดียวกับ ID อื่นในระบบ (`MTO-YYYYMM###`, `TF-...`, `SB-...`) เพื่อความสม่ำเสมอ ไม่ใช่ UUID สุ่ม |
| `reportType` | จำเป็น — key อ้างถึง template component (เช่น `"staff-performance"`, `"inventory-snapshot"`) |
| `template` | จำเป็น — **ชื่อ React component จริง** ไม่ใช่ path ไปไฟล์ template ภายนอก (สอดคล้องกับ "ไม่มี templating engine ใหม่" ข้างบน) |
| `permission` | **ต้องเป็น role string ชุดเดียวกับ `ROLE_ACTIONS_`/`ROLE_TABS`** ไม่ใช่ permission language ใหม่ — ตัวอย่างในคำสั่งไม่ได้บอกว่าใช้ระบบไหน แต่ระบบมี role model อยู่แล้วสมบูรณ์ (owner/dev/employee/warehouse/frontstore/saler/storedevice) ใช้ตัวนี้ตรงๆ กัน permission language ที่สองเกิดขึ้นมาแข่งกัน |
| `source` | จำเป็น — ชื่อ GAS handler function ที่ผลิต data (เช่น `"staffPerfHandler_"`) เพื่อ traceability |
| `version` | **เสนอเพิ่ม** (ไม่มีในตัวอย่างเดิม) — เผื่อ template เปลี่ยนแล้ว snapshot เก่า (§6) ต้องรู้ว่า render ด้วย template เวอร์ชันไหน (เทียบกับ `RecipeVersion` ของ MTO — pattern เดียวกัน: "เวอร์ชันของ template ที่ snapshot อ้างถึง ต้องคงที่แม้ template ปัจจุบันเปลี่ยนไปแล้ว") |
| `exportEnabled` | จำเป็น — boolean ว่ารายงานนี้พิมพ์ PDF ได้ไหม (ไม่ใช่ทุกรายงานต้องมี PDF) |
| `status` | จำเป็น — `active`/`deprecated` (**ไม่ใช้คำว่า "retired"** เหมือน Template ของ MTO เพื่อไม่ให้สับสนกับ concept ของอีกโดเมน ทั้งที่ความหมายคล้ายกัน) |
| ~~`owner`~~ | **ตัดออกจากตัวอย่างที่อาจคาดว่าจะมี** — ระบบนี้ไม่มี concept "เจ้าของรายงานเป็นรายบุคคล" (permission เป็น role-based ทั้งระบบ ไม่ใช่ user-based) ใส่เข้าไปจะสร้าง concept ใหม่ที่ไม่มีอะไรรองรับ |

**เก็บที่ไหน**: Google Sheets ใบใหม่ (`SHEET_REPORT_REGISTRY`) — ไม่ใช่ Script Property (จำนวนรายงานจะ
โตขึ้นเรื่อยๆ, Script Property เหมาะกับ config ค่าเดียวไม่ใช่รายการที่โต) ตาม pattern เดียวกับตารางอื่นๆ
ทั้งระบบ (`STOCK_THRESHOLDS` เป็น Property เพราะเป็น config ก้อนเดียว ต่างจาก entity ที่โตเป็นรายการ)

---

## 5. Report URL / Security (PART 2 + PART 8)

**ข้อเท็จจริงตั้งต้น (จาก §2)**: ระบบไม่มี URL routing เลย — ทั้งสองแบบที่ให้เปรียบเทียบ
(`/reports/inventory/2026-08` vs `/reports/INV-202608-001`) **ไม่มีโครงสร้างรองรับอยู่ก่อนทั้งคู่**
ต้องสร้างใหม่ ไม่ว่าจะเลือกแบบไหน

**เปรียบเทียบ**:

| | `/reports/inventory/2026-08` (dimensional) | `/reports/INV-202608-001` (opaque ID) |
|---|---|---|
| Authentication | ต้องแยกจาก path เสมอ (URL ไม่ควรมีสิทธิ์ในตัวเอง) | เหมือนกัน — ไม่ต่างกันตรงนี้ |
| Authorization | ยาก — "inventory ของเดือนไหนก็ได้" ต้อง evaluate สิทธิ์ทุกครั้งจาก dimension ใน path เอง ไม่มี record ที่ผูก permission ไว้ล่วงหน้า | ง่ายกว่า — ID ผูกกับ record ใน Registry/instance table ที่มี permission ติดมาแล้วตอนสร้าง |
| Audit | ยาก — "ใครเปิดดู inventory เดือนไหน" ต้อง log แยกจาก path parsing | ง่าย — log `reportId` ตรงๆ พอ |
| **Historical report** | ⚠️ **มีปัญหาตรงๆ**: `2026-08` เป็น dimension ที่ query ซ้ำได้เสมอ = **regenerate ทุกครั้ง** ไม่มีทางแทน "snapshot ตอนสร้าง" ได้ในตัว URL เอง — ถ้า ZORT data เปลี่ยนย้อนหลัง (มีจริง — ดู §6) คนละครั้งที่เปิด `/reports/inventory/2026-08` จะเห็นค่าต่างกัน โดยที่ URL เหมือนเดิมทุกตัวอักษร ซึ่งขัดกับสิ่งที่ URL ควรสื่อ ("ลิงก์เดิม = สิ่งเดิม") | ✅ ID ผูกกับ **instance** ที่สร้างครั้งเดียว — snapshot ได้ตรงไปตรงมา ID ไม่เปลี่ยนความหมายแม้ data ต้นทางเปลี่ยน |
| Expiration | ยาก — dimension ไม่มีที่เก็บ metadata "หมดอายุเมื่อไหร่" ตามธรรมชาติ | ง่าย — เพิ่ม field `expiresAt` บน instance record ได้ตรงๆ |
| Shareability | เดาง่าย (ใครก็เดา URL เดือนถัดไปได้) — **ไม่ใช่ security issue ถ้า auth ทำถูก** แต่เป็น UX signal ที่ผิด (ดูเหมือนเปิดได้ทุกคน) | เดาไม่ได้ (สอดคล้องกับ business decision ที่เพิ่งอนุมัติใน MTO — `templateId` เป็น opaque ID แยกจาก dimension ที่เปลี่ยนได้ — **pattern เดียวกันถูกนำมาใช้ซ้ำที่นี่**) |

**ตัดสินใจ: opaque ID (`/reports/INV-202608-001` แบบ)** — เหตุผลหลักคือ Historical Report ต้องการ
"instance" ที่ผูก snapshot ได้ ไม่ใช่ "สูตรคำนวณจาก dimension" — ตรงกับเหตุผลเดียวกับที่ MTO แยก
`templateId` ออกจาก SKU (Domain Model doc §3.1) คือหลักการเดียวกันถูก apply ซ้ำในบริบทใหม่

**Security — ห้ามใช้ URL secrecy**:
- **Precedent ที่มีอยู่แล้วในระบบให้ reuse ได้ตรงๆ**: `attendancePhoto` (doGet proxy endpoint ที่ตรวจ
  `resolveSession_` จริงก่อนคืนรูปจาก Drive) — เป็นตัวอย่างของ "endpoint ที่ path/id ไม่ใช่ secret แต่ยัง
  ปลอดภัยเพราะเช็ค session ทุกครั้ง" ที่ตรงกับความต้องการนี้เป๊ะ ไม่ต้องคิดแพทเทิร์นใหม่
- Report URL ควรทำงานแบบเดียวกัน: `?action=report&id=INV-202608-001` (หรือเทียบเท่า) ที่ **ทุก
  request ต้องผ่าน session check จริง** — `reportId` ไม่ใช่ secret เอง (บันทึกลง log/audit ได้อย่าง
  สบายใจ) แต่สิทธิ์เข้าถึงมาจาก `resolveSession_` + role permission (จาก Registry §4) เสมอ
- **Ownership/revocation**: instance record (§6) ต้องมี `createdBy`/`allowedRoles`/`revokedAt` — revoke
  ได้โดยไม่ต้องลบ URL/เปลี่ยน ID (`revokedAt` ตั้งค่า → session check ปฏิเสธ แม้ ID ยังใช้งานได้ตาม
  รูปแบบ) — เทียบเท่ากับ pattern soft-delete ที่ระบบมีอยู่แล้ว (`SHEET_HIDDEN_PRODUCTS`)
- **Historical report access**: role ที่มีสิทธิ์เห็น report **ประเภทนั้น** วันนี้ ไม่ได้แปลว่ามีสิทธิ์เห็น
  **instance เก่าทุกใบ** โดยอัตโนมัติ — ต้อง design ว่า permission check ใช้ role ปัจจุบันของ report
  type (จาก Registry) หรือ snapshot สิทธิ์ ณ ตอนสร้าง — **นี่คือ open question ใหม่ ไม่ใช่ตัดสินใจแล้ว**
  (ระบุใน §17)

---

## 6. Historical Report Strategy (PART 2)

**A (regenerate) vs B (snapshot) vs C (hybrid)** — ตัดสินใจ: **C — hybrid ตามประเภทรายงาน**
ไม่ใช่กฎเดียวทั้งระบบ เพราะหลักฐานจากระบบเดิมชี้ชัดว่า 2 กรณีต้องการพฤติกรรมต่างกัน:

| ประเภทรายงาน | ควรเป็น | เหตุผล |
|---|---|---|
| **Dashboard ที่เปิดดูในแอปเอง** (เช่น `OverviewView`, `StaffPerformanceView` วันนี้) | **A — Regenerate เสมอ** | พฤติกรรมเดิมของระบบ 100% วันนี้อยู่แล้ว (ไม่มี view ไหน snapshot เลย) — เจ้าของเปิดดู "ตอนนี้" ต้องการเลขล่าสุดเสมอ ไม่มีเหตุผลเปลี่ยน |
| **รายงานที่ถูก "ส่ง" ออกไป** (ผ่าน LINE link, PDF ที่ save/print, Report URL ที่แชร์ให้คนอื่น) | **B — Snapshot ตอนสร้าง** | เหตุผลตรงกับที่ระบุไว้ใน MTO domain แล้ว (`JobSnapshot` — "สิ่งที่สื่อสารออกไปแล้วต้องคงที่ตามที่สื่อสารไป") — ถ้า ZORT data เปลี่ยนย้อนหลัง (เช่น `syncZortBoth` sync ทุก 2 ชม. เขียนทับยอดขายเดือนก่อนที่เพิ่งแก้ไข) รายงานที่ส่งให้เจ้าของไปแล้วต้อง**ไม่เปลี่ยนตัวเลขโดยที่เจ้าของไม่รู้ตัว** — mismatch ระหว่าง "ตัวเลขที่คุยกันในแชท" กับ "ตัวเลขที่เห็นตอนเปิดลิงก์ทีหลัง" คือบั๊กแบบ "ไม่มี error ให้เห็น" ตาม convention ที่ CLAUDE.md เตือนซ้ำๆ ทั้งไฟล์ |

**เกี่ยวกับกรณี ZORT data เปลี่ยนย้อนหลัง (ที่ระบุไว้ตรงๆ ในคำสั่ง)**: ยืนยันจาก CLAUDE.md ว่ากรณีนี้**เกิด
ขึ้นจริง** — `syncZortBoth` (ทุก 2 ชม.) เขียนทับยอดตามเลขจริงจาก ZORT เสมอ ("ZORT = source of truth")
ซึ่งรวมถึงยอดของเดือนก่อนหน้าที่แก้ไขย้อนหลังได้ (เช่น ยกเลิกออเดอร์เก่า/แก้ราคา) — Regenerate-only
report ที่ดึงยอดเดือนก่อนจะได้ค่าใหม่ที่ไม่ตรงกับตอนที่เคยรายงานไปแล้ว ต่างจากรายงานที่มี snapshot ซึ่งจะ
"ผิดแบบรู้ตัว" (มี timestamp ตอน generate กำกับชัดว่า "ข้อมูล ณ วันที่นี้") ดีกว่า "ผิดแบบไม่รู้ตัว"

**Instance record (สิ่งที่ snapshot จริงๆ)**: ไม่ใช่ HTML ทั้งหน้า — เก็บแค่ **data + config + template
version** ที่ใช้ตอน generate (เทียบเท่า `JobSnapshot` เก็บ field ไม่ใช่เก็บ rendered output) — render
HTML ใหม่จาก snapshot data ได้ทุกครั้งที่เปิด (เผื่อแก้ template ภายหลัง เช่น ปรับ CSS ไม่ต้อง
re-generate ข้อมูล) — นี่คือเหตุผลที่ `version` field ใน Registry (§4) จำเป็น

---

## 7. Large Report Strategy (PART 3)

**ตรวจของเดิม**: วันนี้ payload เต็มก้อนถูกโหลดมาที่ client ครั้งเดียว (`data.products[]` เป็น array
เต็ม) แล้ว filter/sort/paginate **ฝั่ง client ทั้งหมด** ด้วย in-memory array (StockView/CategoryView
ใช้ pattern "gridUnits"/pagination บน array ที่โหลดมาแล้ว) — ไม่มี server-side cursor pagination ที่
ไหนในระบบ เพราะ **สเกลของข้อมูลยังเป็นระดับ Sheets** (พันกว่า SKU ไม่ใช่ล้านแถว) — pattern นี้ยัง
เหมาะสมกับขนาดข้อมูลปัจจุบัน ไม่ต้องเปลี่ยน

**สำหรับ 100+/500+/1000+ SKU report**:

| ช่องทาง | แนวทาง | เหตุผล |
|---|---|---|
| **LINE** | ส่งแค่ **สรุปตัวเลข + ลิงก์** ไม่เคยส่งรายการเกิน ~20 แถว | ตรงกับ convention ที่มีอยู่แล้วจริงในระบบวันนี้ (`pushOrderBatch_`: `orders.slice(0, 20)` + "…และอีก N รายการ") — ไม่ใช่แนวทางใหม่ แค่ apply กับ report notification ด้วย |
| **Web (report URL)** | **Server-side pre-aggregation** ที่ GAS handler (reuse pattern `staffPerfHandler_`) คืนข้อมูลที่ **สรุปแล้ว** ไม่ใช่ raw 1000 แถว แล้ว client paginate ต่อบนชุดที่สรุปแล้ว (เหมือน StockCountView ทำกับ array ที่ไม่ใหญ่มาก) | ข้อมูลระดับ Sheets (พันแถว) โหลดทั้งก้อนได้ไม่ช้าเกินไปถ้า**สรุปก่อนส่ง** ต่างจากส่ง raw ทุก field — ตรงกับที่ A1 Columnar Payload (baseline ของรอบนี้) พิสูจน์แล้วว่าการลด shape ของ payload ช่วยได้จริง (production PASS) |
| **PDF export** | ใช้ pagination ธรรมชาติของ `@media print` (หน้า A4 ต่อหน้า) เหมือน `IntakePdfDoc` ทำกับสินค้าเข้าใหม่หลายร้อยรายการอยู่แล้ว | ของเดิมพิสูจน์แล้วว่ารองรับได้ (`INTAKE_PDF_PER_PAGE` 9 รายการ/หน้า) ไม่ต้องคิดกลไกใหม่ |

**ห้ามเพิ่ม complexity ที่ยังไม่จำเป็น**: **ไม่แนะนำ** true server-side cursor pagination (offset/limit
query ต่อเนื่อง) ในรอบนี้ — ไม่มีหลักฐานว่าข้อมูลจะโตถึงระดับที่ pre-aggregation ธรรมดาเอาไม่อยู่ · ถ้า
volume โตขึ้นจริงในอนาคตค่อยพิจารณา (คนละ phase)

---

## 8. PDF Strategy (PART 4)

**ตรวจของเดิมแล้ว** (ตาม hard constraint "ห้ามสร้าง PDF engine ใหม่โดยยังไม่ตรวจของเดิม"):
- `runQuoteDocPrint`/`window.print()` + `document.title` + CSS `@media print` — ใช้กับใบเสนอราคา/
  ใบแจ้งหนี้/label/เอกสารของเข้าใหม่ **ทำงานได้จริงใน production มาแล้ว**
- เหตุผลที่ระบบเลือกทางนี้แต่แรก (บันทึกไว้ใน CLAUDE.md แล้ว): เลย์เอาต์ A4 จริงอยู่ใน `@media print`
  block ทั้งชุด, `html2canvas`/`jsPDF` เคย**ถูกทดลองแล้วมีปัญหา** (CDN ไม่เสถียรบนเน็ตร้าน ต้อง self-host,
  และ rasterize DOM ได้ผลลัพธ์คนละหน้าตากับที่ print จริง)
- **server-side PDF generation ไม่มีอยู่จริง** และ GAS ไม่มี headless-browser runtime ให้ใช้ (ไม่มี
  Puppeteer-equivalent ใน Apps Script) — การสร้าง server-side PDF ต้องพึ่งบริการภายนอก (เพิ่ม
  external dependency ใหม่ทั้งระบบ)

**ตัดสินใจ: reuse `window.print()` pattern ตรงๆ กับ Report Engine** — Report template component
(§3) เป็น React component ธรรมดาที่มี `@media print` CSS เหมือน `QuotationPrintDoc`/`IntakePdfDoc`
ทุกประการ ไม่สร้าง PDF engine ใหม่เลย — **PDF เป็น secondary output** (export ปุ่มเดียวจาก report ที่
เปิดดูในเว็บอยู่แล้ว) ตรงกับหลักคิดที่ให้มา ("PDF = Document/Evidence" ไม่ใช่ primary surface)

---

## 9. Notification Center (PART 5)

**Event → Notification Center → Rule → Channel → Delivery → Delivery Status**

```
ERP Event (เช่น JobFulfilled, Stock Low, Monthly Sales Ready)
   │
   ▼
Notification Center  ── บันทึก event เกิดขึ้น (ไม่ใช่แค่ "ยิง LINE ตรงๆ" เหมือนวันนี้)
   │
   ▼
Notification Rule  ── lookup จาก config กลาง (ไม่ hard-code ต่อ feature — ดู §11)
   │   {eventType → audience, channel(s), template}
   ▼
Recipient resolution  ── audience string (role:xxx / staff:xxx) → รายชื่อจริง
   │   (reuse inappAudienceMatch_ ที่มีอยู่แล้วสำหรับ in-app bell)
   ▼
Channel  ── LINE (primary/secondary) / Web (in-app bell) / Email (future, ยังไม่มี)
   │
   ▼
Delivery  ── reuse enqueueNoti_ (LINE) / pushInappNoti_ (Web) ตัวเดิม — ไม่สร้างกลไกส่งใหม่
   │
   ▼
Delivery Status  ── SHEET_NOTI_QUEUE.status (LINE) — ⚠️ In-app bell วันนี้ไม่มี "delivery status"
                     เป็นแค่ read/unread — ต่างกันโดยธรรมชาติ (push ไม่มี concept "ส่งไม่สำเร็จ"
                     เพราะเขียนลง Sheets ตรงๆ ไม่ผ่านเครือข่ายภายนอก)
```

**สิ่งที่ต้องเพิ่มจริงๆ (ของเดิมไม่มี)**: มีแค่ **ชั้น Rule** — วันนี้ audience/channel/ข้อความถูก
hard-code ในทุก call site (`sendLineGroupOrderCard_` เขียน `audience:'role:warehouse,employee,owner'`
ตรงในโค้ด, `fsNeedsRestock_` เขียน audience ของตัวเองแยกอีกชุด) — Notification Center **ไม่ใช่การเขียน
delivery mechanism ใหม่** (มีแล้ว 2 ตัว ใช้ได้จริง) แต่คือการ**ดึง audience+channel ออกมาเป็น config
กลาง** แล้วให้ event เรียกผ่าน Rule Lookup แทนที่จะ hard-code — ตรงกับ §11

---

## 10. LINE Delivery Architecture Review (PART 6)

ตรวจ codebase อีกครั้งตามที่สั่ง — ผลตรงกับ §9 ของ `docs/MTO-ARCHITECTURE-REVIEW-GATE.md` ทุกประการ
(ไม่มีอะไรเปลี่ยนแปลงในโค้ดตั้งแต่รอบก่อน) สรุปคำตอบ 10 ข้อที่ถามตรงๆ:

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | จุดเดียวหรือหลายจุด | **มี 2 เส้นทางคู่ขนานวันนี้** — ควรเหลือจุดเดียว (เป้าหมาย) |
| 2 | ทุก message ผ่าน common delivery layer ไหม | **ไม่** — เส้นทาง Bypass (`sendLineMessage_`/`sendLineGroup_`/`sendLineGroupMentionAll_` + raw fetch ใน `testTruckNotification`) ข้าม `linePush_`/`enqueueNoti_` ไปเลย 9 จุด รวม **`closeMtoJob`** |
| 3 | retry อยู่ตรงไหน | เฉพาะใน `drainNotiQueue` (เส้นทาง Queue) — เส้นทาง Bypass ไม่มี retry เลย |
| 4 | exponential backoff ต้องมีไหม | มีอยู่แล้วในเส้นทาง Queue (2^attempts นาที cap 15, quota=30 นาที) — **ต้องคงไว้** สำหรับ error class ที่เป็น transient เท่านั้น (ดูข้อ 5-7) |
| 5 | error classification (400/401/403/429/5xx/timeout) | **ยังไม่มี** — วันนี้แยกแค่ 2 กลุ่ม: `429`/quota-text → `quota:true` · ที่เหลือทั้งหมด (รวม 400/401/403/5xx/timeout) → กลุ่มเดียวกันหมด ได้ backoff แบบเดียวกัน |
| 6 | error ไหน retry ได้ | **เป้าหมาย** (ยังไม่ implement): `429`, `5xx`, network timeout — เป็น transient จริง |
| 7 | error ไหนต้อง dead-letter ทันที | **เป้าหมาย**: `400`/`401`/`403` — malformed payload หรือ auth ผิด **retry เท่าไหร่ก็ไม่มีทางสำเร็จ** เสีย attempt โดยเปล่าประโยชน์ตามที่วิเคราะห์ไว้แล้วใน MTO review |
| 8 | ป้องกัน duplicate notification | **ไม่สม่ำเสมอ** — `dedupKey` เป็น optional parameter, บาง call site ใส่ (`sendPendingTruckOrders`) บางที่ไม่ใส่เลย (`sendLineGroupOrderCard_`) |
| 9 | เก็บ delivery status ที่ไหน | `SHEET_NOTI_QUEUE.status`/`lastError`/`sentAt` (เฉพาะเส้นทาง Queue) — เส้นทาง Bypass **ไม่เก็บสถานะที่ไหนเลย** นอกจาก `Logger.log` ชั่วคราว |
| 10 | replay ได้อย่างไร | **วันนี้: ไม่ได้เลย** — แถว `failed` ไม่มีปุ่ม/mechanism ให้ replay ต้องไปแก้ status ในชีตด้วยมือ — **เป้าหมาย**: endpoint/ปุ่มสำหรับ owner/dev "ลองส่งใหม่" ที่ reset `status='pending'`+`attempts=0` ของแถวที่เลือก |

**ย้ำ**: ตารางนี้เป็น**คำตอบเชิงสถาปัตยกรรมเท่านั้น** — ไม่มีการแก้ `appsscript_complete.gs` แม้แต่บรรทัด
เดียวในรอบนี้ ตาม hard constraint

---

## 11. Retry / Error / Dead-letter Model (PART 6 + PART 9)

Target model (ผูกกับ §10 ข้างบน โดยตรง ไม่ซ้ำรายละเอียด):

```
LINE API response
   │
   ├─ 200 ────────────────────────────────▶ sent (เดิมมีอยู่แล้ว)
   ├─ 429 / body มีคำ quota/limit ────────▶ retry, backoff 30 นาที (เดิมมีอยู่แล้ว)
   ├─ 5xx / network timeout ──────────────▶ retry, exponential backoff (เดิมมีอยู่แล้ว บางส่วน
   │                                          — วันนี้ปนกับกลุ่ม 400 อยู่ ต้องแยกออก)
   └─ 400 / 401 / 403 ─────────────────────▶ ⭐ ใหม่: ไม่ retry, mark failed ทันที
                                                + แจ้ง owner/dev ผ่าน in-app bell (reuse pushInappNoti_)
```

**ทำไมไม่สร้าง queue ใหม่**: `SHEET_NOTI_QUEUE` + `drainNotiQueue` เป็น mechanism ที่มี lock/backoff/
attempt-tracking ครบอยู่แล้ว — สิ่งที่ขาดคือ **error classification** (ปรับ logic ใน `linePush_` ให้
แยก code group) กับ **dead-letter visibility** (แจ้งเตือนแทนที่จะนอนเงียบ) ไม่ใช่ infra ใหม่

---

## 12. Idempotency (PART 9)

ระบบมี convention idempotency ที่พิสูจน์แล้วจากหลายจุด (`billCid`/`cid`/`tid` — client-generated token,
เช็คในล็อกก่อนเขียนจริง, คืนผลเดิมถ้าเจอซ้ำ) — **Report Engine/Notification Center ควรใช้ pattern
เดียวกัน ไม่ใช่คิดกลไกใหม่**:

| Failure scenario | Idempotency key ที่เสนอ | อิง pattern จาก |
|---|---|---|
| Report generation ถูกยิงซ้ำ (double-click/retry) | `reportInstanceId` client-generated เหมือน `billCid` — เช็คก่อนสร้าง instance ใหม่ | `createSaleBill` billCid dedup |
| LINE notification ถูก enqueue ซ้ำ | บังคับ `dedupKey` ทุก event ที่มาจาก aggregate transition (ตามที่เสนอไว้ใน MTO review §9.4 ข้อ 4) | `sendPendingTruckOrders` ที่มี dedupKey อยู่แล้ว |
| Zort/Sheets failure ระหว่าง generate report | ไม่ throw ทันที — เขียน log ความล้มเหลว (reuse `logZortFailure_` pattern) แล้วให้ report แสดงสถานะ "ข้อมูลบางส่วนไม่พร้อม" แทนที่จะพังทั้งหน้า | `appendSaleBillRow_`/`logZortFailure_` — "งานหลักสำเร็จแล้ว log พลาดต้องไม่ทำให้งานหลักพัง" |
| Partial report generation | Instance record มี field `status` (`generating`/`complete`/`partial`/`failed`) — ไม่ commit เป็น "complete" จนกว่าทุกส่วนเสร็จ | เทียบเท่า `Job.status` ของ MTO ที่ commit เป็น "เสร็จแล้ว" ครั้งเดียวตอนจบ transaction |
| duplicate event (event ยิงมาซ้ำจาก trigger) | dedup ที่ระดับ Notification Rule ก่อนเข้า Delivery — ใช้ `dedupKey` เดียวกับที่ `enqueueNoti_` เช็คอยู่แล้ว | ของเดิมมีอยู่แล้ว (แค่ต้องบังคับใช้ให้ครบ ไม่ใช่ optional) |

---

## 13. Permission / Audience (PART 7 + PART 9)

**ตรวจ permission/audience model ปัจจุบันก่อนออกแบบ**: มี 2 ระบบที่ทับซ้อนกันบางส่วน:
- `ROLE_ACTIONS_`/`canDoOrNull_` — ใช้กับ **action** (สั่งของ/แก้ราคา/ลบ ฯลฯ)
- `inappAudienceMatch_`/audience string (`"all"`/`"role:xxx,yyy"`/`"staff:ST0001,ST0002"`) — ใช้กับ
  **การรับแจ้งเตือน** (in-app bell)

**ข้อเสนอ Notification Configuration** (PART 7):

```
Event Type          Rule                          Audience              Channel
─────────────────────────────────────────────────────────────────────────────────
"stock-low"     →   ตามเกณฑ์ threshold           role:owner,warehouse   LINE (primary)
"monthly-sales" →   ทุกวันที่ 1 เดือนถัดไป        role:owner,dev         LINE (secondary)
"mto-completed" →   ทันทีที่ JobFulfilled         role:saler             LINE (primary) + Web
```

- **Audience** ใช้ syntax เดียวกับที่ in-app bell มีอยู่แล้ว (`role:xxx`/`staff:xxx`) — **ไม่สร้าง
  permission language ใหม่** เพื่อไม่ให้ Report Registry permission (§4) กับ Notification audience
  กลายเป็นคนละระบบที่ drift กัน
- **เก็บ config ที่ไหน**: เสนอ `SHEET_NOTIFICATION_RULES` (ไม่ใช่ Script Property) เหตุผลเดียวกับ
  Report Registry (§4) — จำนวน rule จะโตตามจำนวน event type ที่เพิ่มขึ้น
- **ห้าม hard-code Group ID กระจายตาม feature** (ตามที่สั่งตรงๆ) — วันนี้ `LINE_GROUP_ID`/
  `LINE_GROUP_ID_2` เป็น Script Property กลางอยู่แล้ว (ไม่ได้ hard-code ในโค้ดจริง) **แต่ audience
  role list ต่างหากที่ hard-code กระจาย** (เช่น `'role:warehouse,employee,owner'` เขียนตรงในบรรทัด
  โค้ดของแต่ละฟังก์ชัน) — Rule table แก้ปัญหานี้โดยย้าย audience ออกจากโค้ดมาไว้ที่ config กลาง

---

## 14. Failure Scenarios (PART 9)

| Scenario | แนวทาง (ผูกกับ §12 Idempotency) |
|---|---|
| Report generation failure | คืน error message ที่ user เข้าใจได้ (ไม่ใช่ raw exception — ตาม convention `dmjJson`/`dmjErrText` ทั้งระบบ) + ไม่ mark instance เป็น `complete` |
| LINE API failure | จัดการผ่าน error classification ใหม่ (§11) — retryable vs permanent |
| Network timeout | เหมือน LINE API failure ฝั่ง caller — ฝั่ง report generation ใช้ `dmjFetch` timeout pattern เดิม (default 60s, ปรับได้) |
| Zort failure | ไม่ throw — log ผ่าน `logZortFailure_` pattern, report แสดง partial data + คำเตือนชัดเจน |
| Google Sheets failure | ปกติ GAS จะ throw ตรงๆ — ห่อ try/catch ที่ report handler เหมือนทุก handler อื่นในระบบ ไม่ต้อง pattern ใหม่ |
| Duplicate event | dedup ที่ Notification Rule layer (§12) |
| Duplicate notification | `dedupKey` บังคับ (§10 ข้อ 8, §12) |
| Partial report generation | instance `status` field (§12) — ไม่ commit ว่าเสร็จจนกว่าจะครบ |

---

## 15. Architecture Decision (PART 10)

**ควรสร้างแบบ incremental บนของเดิม** ไม่ใช่ subsystem ใหม่ — หลักฐานสนับสนุน:

1. **Data layer**: Google Sheets รองรับ report handler pattern ได้แล้วจริง (`staffPerfHandler_` cache
   300s ทำงานได้ใน production) — ไม่มีหลักฐานว่าสเกลข้อมูลปัจจุบันเกินความสามารถของ pattern นี้
2. **Delivery layer**: LINE queue (`enqueueNoti_`/`drainNotiQueue`) + in-app bell
   (`pushInappNoti_`) เป็น mechanism ที่ **proven ใน production แล้ว** — สร้างใหม่ = ทิ้งของที่ทำงาน
   ได้แล้วไปเปล่าๆ
3. **Document/PDF layer**: `window.print()` pattern proven แล้วกับเอกสารการเงินจริง (ใบกำกับภาษี —
   ความถูกต้องสูงสุดของระบบ) — ไม่มีเหตุผลที่ report (ซึ่ง requirement ต่ำกว่าเอกสารการเงิน) จะต้องการ
   engine ที่แข็งแรงกว่า
4. **Supabase**: เป็น write-only backup **ไม่ใช่ subsystem ที่พร้อมใช้เป็น query layer** — สร้าง
   "Supabase-based Report Engine" ตอนนี้ = ต้องสร้าง read-path ใหม่ทั้งหมดที่ไม่เคยมี (ขัดกับ hard
   constraint "ห้ามสร้าง Supabase subsystem ใหม่" โดยตรง — ยืนยันว่าตัดสินใจถูกที่ไม่เสนอแนวทางนี้)
5. **สิ่งที่ขาดจริงๆ มีแค่ 2 อย่าง**: Report Registry (ยังไม่มีที่ไหนเลย) + Notification Rule layer
   (audience hard-code กระจาย) — ทั้งคู่เป็น **config/metadata layer** ไม่ใช่ infra ใหม่ สร้างเป็นชีต
   ใหม่ 2 ใบ + GAS function อ่าน config เหล่านั้น ก็ครบ

**ไม่เลือกสร้าง subsystem ใหม่** เพราะไม่มีหลักฐานสักข้อที่บอกว่าของเดิม "เอาไม่อยู่" — ทุก gap ที่พบ
เป็น**ช่องว่างของ config/registry ที่ขาด** ไม่ใช่ข้อจำกัดทาง infra

---

## 16. Implementation Phases (PART 10 — design only, ห้าม implement)

| Phase | ขอบเขต | เงื่อนไขก่อนเริ่ม |
|---|---|---|
| **P0** | Architecture prerequisites — ยืนยัน schema ของ `SHEET_REPORT_REGISTRY`/`SHEET_NOTIFICATION_RULES` เป็นรอบ sign-off แยก (เหมือนที่ MTO ทำ) + ตัดสินใจ open question §17 (historical permission model) | เอกสารนี้ผ่านการ review |
| **P1** | Report Engine foundation — สร้าง Registry (เขียน, ไม่ยังต้อง render จริง) + 1 report ตัวอย่างที่ **ไม่ผ่าน production notification** (เช่น migrate `StaffPerformanceView` เข้า pattern ใหม่แบบไม่กระทบ user) | ไม่มี — เป็นงาน foundation ล้วนๆ |
| **P2** | Notification Center — สร้าง Rule table + Rule lookup layer เชื่อมกับ `enqueueNoti_`/`pushInappNoti_` เดิม (ยังไม่ปิดเส้นทาง Bypass) | P1 เสร็จ |
| **P3** | LINE consolidation — ปิดเส้นทาง Bypass (§10 ข้อ 2), เพิ่ม error classification (§11), เพิ่ม dead-letter visibility | ⚠️ **แยกจาก MTO โดยสิ้นเชิง** (ตาม baseline "MTO ไม่ใช่ owner ของ LINE architecture") — กระทบทั้งระบบ ต้อง sign-off ของตัวเอง ไม่ผูกกับ Phase ของ MTO |
| **P4** | First production report — เลือก 1 report จริงที่ผ่าน Registry + Notification Rule ครบวงจร ไปหา user จริง | ⚠️ **ควรรอ Backend Stability Phase C data** (ดู §17/§18) — เพิ่มโหลดใหม่บน backend ที่ยังไม่รู้ root cause ของ incident เดิมมีความเสี่ยง |
| **P5** | Additional reports — migrate report อื่นๆ (`OverviewView`, `TrackingView` ฯลฯ) เข้า pattern ใหม่ทีละตัว | P4 พิสูจน์ pattern ใช้ได้จริงใน production แล้ว |

---

## 17. Open Questions / Risks

จำแนกตามความมั่นใจของหลักฐานตามที่สั่งไว้ตรงๆ (**ห้ามยกระดับ hypothesis เป็น fact**):

| # | ประเด็น | ระดับ | รายละเอียด |
|---|---|---|---|
| 1 | Backend perf issue ยังไม่ resolve (auth:me 14.4–64.2s, doPost ถึง 298.6s) | **CONFIRMED** | มีหลักฐานตรงจาก `docs/HANDOFF-BACKEND-OBSERVABILITY.md` — เป็น production incident ที่บันทึกไว้จริง ไม่ใช่การคาดเดา |
| 2 | ยังไม่มี production `[perfB]` log วิเคราะห์ root cause | **CONFIRMED** | ระบุตรงๆ ใน handoff doc เดียวกัน ("ยังไม่ได้อ่านผลด้วย scripts/perf-report.mjs กับข้อมูลจริง") |
| 3 | Supabase เป็น write-only ไม่ใช่ query layer | **CONFIRMED** | อ่านโค้ดตรงๆ (`appsscript_complete.gs:15700+`) — ไม่มี read path เลย |
| 4 | LINE bypass path (9 call site) ไม่มี retry/dead-letter | **CONFIRMED** | grep + read โค้ดตรงๆ (ซ้ำกับ MTO review §9) |
| 5 | root cause ของ `linePush_primary 400` ที่แท้จริง | **HYPOTHESIS** | ยังตรวจไม่ได้จากเซสชันนี้ (ไม่มีสิทธิ์เข้า `SHEET_NOTI_QUEUE.lastError` จริง) — คงสถานะเดิมจาก MTO review ไม่ยกระดับ |
| 6 | เพิ่ม Report Engine load จะทำให้ backend incident แย่ลง | **HYPOTHESIS ที่มีเหตุผลสนับสนุนแรง (STRONG EVIDENCE)** | ไม่ใช่ fact เพราะยังไม่มีตัวเลขจริงว่า Report Engine "จะ" กินโหลดเท่าไหร่ — แต่ทิศทางสมเหตุสมผลชัดเจน (โหลดเพิ่ม + backend ที่มี known bottleneck ที่ยังไม่วัด = ความเสี่ยงจริง) จึงจัดเป็น STRONG EVIDENCE ไม่ใช่ CONFIRMED |
| 7 | Historical report permission (role ปัจจุบันหรือ role ณ ตอนสร้าง) | **OPEN — ยังไม่มีหลักฐาน/คำตอบเลย** | ไม่ใช่ finding จากโค้ด เป็นคำถามออกแบบที่ยังไม่ตัดสินใจ (§5) |
| 8 | เพิ่ม `overriddenAt`/version field ลง schema จริงกี่ตัว/ชื่ออะไร | **OPEN — implementation detail** | รอ P0 sign-off round ก่อน |

---

## 18. Phase Readiness Verdict

**สรุปให้ตรงกับที่ขอ ("READY FOR IMPLEMENTATION" หรือ "NOT READY — [blocker]")**:

### `NOT READY — [blockers ด้านล่าง]`

**เหตุผล**: แม้ P0/P1 (architecture foundation, ไม่กระทบ user จริง) จะเริ่มได้ทันทีโดยไม่มี blocker
แต่คำถามคือ "READY FOR IMPLEMENTATION" ในภาพรวม — ซึ่งรวมถึง P4 (first production report ที่ยิง
notification จริงหาคนจริง) และ P3 (LINE consolidation ที่กระทบทั้งระบบ) — สองส่วนนี้มี blocker ที่
เป็น CONFIRMED evidence จริง:

| Blocker | ระดับ | ต้องแก้ก่อนเริ่ม Phase ไหน |
|---|---|---|
| Backend perf incident ยังไม่มี root cause (§17 #1, #2) | **CONFIRMED** | P4 (ก่อนเพิ่มโหลด production report ใดๆ ควรรู้ว่า backend รับได้แค่ไหน) |
| LINE bypass path ยังไม่รวมเป็นจุดเดียว (§10) | **CONFIRMED** | P3 — และ **P3 ต้อง sign-off แยกจาก MTO** เพราะ MTO ไม่ใช่ owner ของ LINE architecture ตาม baseline |
| Report Engine เพิ่มโหลด backend ที่ perf ยังไม่นิ่ง (§17 #6) | **STRONG EVIDENCE** (ไม่ใช่ confirmed) | P4 — ควรรอดู `[perfB]` log burst จริงก่อนตัดสินใจว่าปลอดภัยพอจะเพิ่ม report handler ใหม่หรือไม่ |
| Historical report permission model ยังไม่ตัดสินใจ (§17 #7) | **OPEN** | P0 — ต้องปิดคำถามนี้ก่อนออกแบบ schema ของ instance record ให้ครบ |

**สิ่งที่ READY จริงและเริ่มได้**: **P0 (architecture prerequisites/sign-off) และ P1 (foundation ที่ไม่
กระทบ production user)** — ไม่มี blocker ที่ระบุไว้ข้างต้นกระทบสองก้อนนี้เลย เพราะเป็นแค่การสร้าง
Registry/schema + migrate 1 report แบบไม่ยิง notification จริง

**ไม่ READY สำหรับ P3/P4** จนกว่าจะมี: (1) production `[perfB]` log จริงพร้อมตัวเลข concurrency/
lock/action duration ตามที่ observability handoff doc ระบุไว้ (2) รอบ sign-off แยกสำหรับ LINE
consolidation ที่ไม่ผูกกับ MTO phase ใดๆ (3) คำตอบสำหรับ open question #7

**No coding before this document's sign-off** สำหรับทุก Phase ที่ระบุไว้ — เอกสารนี้เป็น architecture
review เท่านั้น ไม่ใช่ไฟเขียวให้เริ่ม implementation ใดๆ ในเซสชันนี้หรือเซสชันถัดไปโดยไม่มีคำสั่งเพิ่มเติม
