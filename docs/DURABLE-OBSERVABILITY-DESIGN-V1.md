# Phase B.1 — Durable Production Observability (Design Only)

**สถานะ**: DESIGN / ARCHITECTURE REVIEW เท่านั้น — **ไม่ implement, ไม่ deploy, ไม่แก้ business logic,
ไม่แตะ lock strategy/timeout/retry/ZORT behavior, ไม่สร้าง synthetic transaction, ไม่เริ่ม Phase C**
**เหตุผลที่มีเอกสารนี้**: `docs/INCIDENT-2026-08-25-BURST.md` ถูกปิดในสถานะ **observability-limited**
— หลักฐานหลุดมือก่อนมีใครเปิด `[perfB]` log จากไอ execution ทันเวลา (retention ของ Apps Script
Executions UI หมดก่อน) ปัญหาไม่ใช่ "ตรรกะ instrumentation ผิด" แต่คือ **ชั้นเก็บหลักฐานเปราะเกินไป
สำหรับ production incident ที่ไม่มีใครนั่งเฝ้าตลอดเวลา**
**สิ่งที่เอกสารนี้ทำ**: (1) ชี้ข้อจำกัดจริงของ `[perfB]` ปัจจุบัน (2) เทียบ 3 ทางเลือก (3) ออกแบบ
correlation ID (4) ให้ข้อเสนอแนะว่าควรทำอันไหนต่อ — **แค่นั้น**

---

## 0. สรุปสั้นสำหรับคนอ่านเร็ว

**ข้อเสนอแนะ**: ทำ **Option C — Hybrid (Logger คงเดิม + durable summary แบบ batched-queue)**
เป็นก้อนถัดไป **ไม่ใช่** ย้ายไป Standard GCP Project (Option A) และ **ไม่ใช่** เขียนละเอียดทุก event
ลง Sheet โดยตรง (Option B แบบ naive) — เหตุผลละเอียดอยู่ที่ §4 และ §11

---

## 1. ทำไม Apps Script Execution Logs ไม่พอสำหรับ production นี้

ตรวจจาก instrumentation จริงใน `appsscript_complete.gs` (บล็อก `Phase B — Backend observability`,
บรรทัด ~50–120) และจากประสบการณ์ตรงของ `docs/INCIDENT-2026-08-25-BURST.md`:

| ข้อจำกัด | หลักฐาน/ที่มา |
|---|---|
| **ไม่มี standard GCP project** → Cloud Logging ใช้ query/ดู historical log ย้อนหลังไม่ได้ | ระบุไว้แล้วใน CLAUDE.md ("Apps Script ใช้ default GCP project") และ `docs/HANDOFF-BACKEND-OBSERVABILITY.md` |
| **ต้องพึ่ง Apps Script Executions UI เพียงช่องทางเดียว** — เป็น UI ของมนุษย์ ไม่มี API query จากภายนอกโปรเจกต์ที่ไม่ใช่ standard GCP | เดียวกัน |
| **แสดงทีละหน้า (50 รายการ/หน้า)** — burst 25/08 อยู่ที่ "หน้าที่ 2" ของรายการ ทำให้ evidence ที่ต้องใช้กระจายข้ามหน้า ต้องไล่หามือ | ตรงจาก screenshot ที่ใช้ประกอบ incident report ("กำลังแสดงการเรียกใช้ 50 รายการจากหลายรายการ ... หน้าที่ 2 จากหลายหน้า") |
| **ไม่มี full-text/cross-execution search** — เห็นแค่ list (เวลา/ฟังก์ชัน/duration/สถานะ) ต้อง**เปิดทีละ execution** ถึงจะเห็น Logger.log ข้างใน | เป็นพฤติกรรม UI ที่ทำให้ incident นี้ต้องระบุ "execution ไหนควรเปิดก่อน" เป็น priority list (§7.3 ของ incident doc) — ถ้า search ได้จริงจะไม่ต้องมี priority list แบบนั้น |
| **retention จำกัดและไม่รับประกันยาว** — ไม่มีเอกสารทางการที่ยืนยันอายุคงที่ของ Logs panel ต่อ execution บน default project แต่ **พฤติกรรมจริงที่พบคือหลักฐานหายไปก่อนมีคนไปเปิดดู** | นี่คือสาเหตุตรงที่ incident 25/08 ต้องปิดแบบ observability-limited (ดู §11 ของ incident doc — "หลักฐาน `[perfB]` ของรอบนี้มีอายุจำกัด") |
| **เป็นกระบวนการ manual ล้วน แม้จะรู้ว่าต้องเก็บอะไร** — ต่อให้มี checklist ที่ชัดเจนแล้ว (เหมือนที่เขียนไว้ใน incident doc §7.3) ก็ยังต้องมี "คน" มาเปิด GAS editor → Executions → เปิดทีละ execution → copy ข้อความออก → รวมเป็นไฟล์ → รัน `perf-report.mjs` เอง — **ทุกขั้นตอนเป็น human-in-the-loop** ไม่มีขั้นไหน automate ได้เลยในสถาปัตยกรรมปัจจุบัน | สังเกตจากกระบวนการที่ incident doc กำหนดไว้เอง (§7, §12) |
| **ไม่มี alerting** — ไม่มีใครถูกแจ้งเตือนตอน burst เกิดขึ้นจริง ต้องมีคนมารายงานอาการ ("หมุนนาน") ก่อน ถึงจะมีใครไปเปิด Executions ย้อนหลัง | ลำดับเหตุการณ์จริงของ incident นี้: พนักงานรายงานอาการ → เจ้าของ screenshot → ส่งมาให้ตรวจ (เกิด**หลังเหตุการณ์**เสมอ) |

**สรุปข้อ 6**: instrumentation ของ `[perfB]` (สิ่งที่ **เขียน** log) **ไม่ใช่ปัญหา** — มัน log-only,
fail-safe, ครบ 7 metrics ตามที่ออกแบบไว้ตั้งแต่ Phase B และยัง**ถูกต้องสมบูรณ์อยู่**. ปัญหาอยู่ที่
**ชั้นเก็บ/เข้าถึง log นั้น** (Apps Script Executions UI) ซึ่ง **เปราะ, ต้องเข้าถึงด้วยมือ, กระจายหลายหน้า,
ค้นหาข้ามรายการไม่ได้, และไม่มีใครแจ้งเตือน** — ทำให้หลักฐานหายไปก่อนถูกใช้งานจริงได้

---

## 2. เทียบ 3 ทางเลือก

### Option A — Standard GCP / Cloud Logging

ย้ายโปรเจกต์ Apps Script จาก default GCP project ไปผูกกับ **standard (user-managed) GCP project**
ที่เปิด Cloud Logging/Monitoring ใช้งานได้เต็มรูปแบบ — `Logger.log`/`console.log` ที่มีอยู่แล้วจะไหล
เข้า Cloud Logging โดยไม่ต้องแก้โค้ด instrumentation เลย (สมมติฐาน — ยังไม่ได้ทดลองจริงในโปรเจกต์นี้)

**ข้อดี**: Cloud Logging query language (filter ตาม `[perfB]`/`id=`/`action=` ข้ามทุก execution ได้จริง)
· retention ปรับได้ (วัน–ปี ตามการตั้งค่า) · ต่อ Cloud Monitoring/Alerting ได้ (แจ้งเตือนอัตโนมัติ
ตอน burst เกิด แทนที่จะรอคนรายงาน) · export ไป BigQuery ได้ถ้าต้องการวิเคราะห์เชิงลึกภายหลัง

**ข้อเสีย/ความเสี่ยง**:
- **การย้ายโปรเจกต์เป็นการเปลี่ยนแปลงเชิงโครงสร้างที่ Google เตือนว่าเป็นจุดที่ต้องระวังสูง**
  (ต้องทำผ่าน "Change project" ใน GAS editor settings, มีผลต่อ deployment ID / permission / OAuth
  consent ที่ผูกกับ project เดิม) — โปรเจกต์นี้พึ่ง deployment เดิม (`AKfycbz4ARb5…`) ที่ webhook
  LINE, PWA, และ Cloudflare Pages ทั้งหมดชี้มาที่ URL เดิม → ความเสี่ยงต่อ "ทั้งร้านเข้าไม่ได้"
  แบบเดียวกับที่ Phase 7.6 login rollout เคยพังมาก่อน (revert เพราะขึ้น production พร้อมกันหลายก้อน)
- ต้องมีคนที่มีสิทธิ์ GCP Console/billing (เจ้าของบัญชี Google เดียวกับที่ผูก GAS อยู่) — เป็น
  ขั้นตอนที่ต้องทำโดยมนุษย์นอกเหนือจาก `clasp push`, ไม่อยู่ใน CI/CD pipeline ปัจจุบัน
- มีต้นทุน GCP (Cloud Logging เกิน free tier มีค่าใช้จ่าย — ปริมาณ log ปัจจุบันน้อย แต่เป็น
  ต้นทุนที่ไม่เคยมีมาก่อนในโปรเจกต์นี้ และต้องมีคนดูแล billing alert)
- **ความเสี่ยงต่อ latency ที่กำลังวัดอยู่ ขึ้นกับวิธี implement**: ถ้าเป็นแค่การย้าย project แล้วให้
  `Logger.log` เดิมไหลเข้า Cloud Logging เอง (ไม่มีการเรียก API เพิ่ม) → ความเสี่ยงต่ำ (เท่ากับที่
  `[perfB]` มีอยู่แล้วในปัจจุบัน) **แต่ถ้า implement ด้วยการยิง Cloud Logging API ตรง ๆ ผ่าน
  `UrlFetchApp` บน hot path** → เพิ่ม network call ต่อ event ซึ่งเสี่ยง **เพิ่ม latency ให้ระบบที่
  กำลังพยายามวัด latency อยู่พอดี** (ขัดกับกติกา "ห้าม telemetry ส่งผลต่อสิ่งที่วัด")
- **การเปลี่ยนแปลงระดับ infrastructure แบบนี้ขัดกับสโคปที่ผู้ใช้ตั้งไว้ชัดเจนว่า "ยัง ไม่ deploy"
  และ "design-only"** — Option A มีต้นทุนความเสี่ยงสูงพอที่ควรผ่านการตัดสินใจแยกต่างหาก ไม่ใช่
  ผลพลอยได้จากงาน observability

### Option B — Minimal durable telemetry (เขียนลง Sheet/Property โดยตรง)

เพิ่มการเขียนข้อมูล perf event **ลงปลายทางที่คงอยู่ถาวร** (Google Sheet หรือ Script Property) ทุกครั้ง
ที่มี event (START/LOCK/ZORT/DRIVE/SESSION/END) แทนที่จะพึ่ง `Logger.log` อย่างเดียว

**ข้อดี**: คงอยู่ได้ตราบเท่าที่ยังไม่ลบ (ไม่ผูกกับ retention ของ Executions UI) · query/filter ได้ผ่าน
Google Sheets เอง (filter/pivot/formula) โดยไม่ต้องพึ่ง external tool · ไม่ต้องย้าย GCP project

**ข้อเสีย/ความเสี่ยง — สำคัญที่สุดของ option นี้**:
- **เขียนบน hot path ทุก event = เพิ่ม I/O ต่อ request โดยตรง** — `appendRow`/`SpreadsheetApp` write
  ช้ากว่า `Logger.log` มาก (Logger.log เป็น in-memory buffer, sheet write คือ I/O จริงไปที่ Google
  Sheets backend) การเขียนละเอียดทุก event (START/LOCK/ZORT/DRIVE/END ต่อ 1 request) หมายถึง
  **หลายครั้งของ Sheet write ต่อ 1 execution** — ยิ่ง burst หนักเท่าไหร่ (คือเวลาที่ต้องการ
  telemetry มากที่สุด) ยิ่งเพิ่มโหลดให้ Sheet write มากเท่านั้น = **เครื่องมือวัด stampede
  กลายเป็นตัวเร่ง stampede เอง** (ตรงข้ามกับหลักการ "ห้าม telemetry แก้พฤติกรรมระบบ" ที่ Phase B
  ตั้งไว้ตั้งแต่ต้นและยังต้องคงไว้)
- Script Property เขียนพร้อมกันจากหลาย concurrent execution เสี่ยง **contention เอง** (เขียนทับ/
  race) เว้นแต่จะจับ Lock ครอบ ซึ่งยิ่งเพิ่มความเสี่ยง lock contention บน hot path ที่กำลังพยายาม
  วัด lock contention อยู่พอดี (self-referential risk)
- Sheet ที่โต 1 แถวต่อ 1 event (ไม่ใช่ 1 แถวต่อ 1 request) จะโตเร็วมาก — ระบบนี้เคยเจอปัญหา
  "ชีตโตทุกครั้งที่กด = ยิ่งใช้ยิ่งช้าลง" มาแล้วกับชีตลงเวลา (`readAttEvents_`) ซึ่งเป็นบทเรียนที่
  ยังไม่ได้แก้อยู่ในระบบเดียวกันนี้ — Option B แบบ naive จะสร้างปัญหาเดียวกันซ้ำ
- **สรุป**: Option B "ตามที่ถามตรง ๆ" (เขียนทุก event ลง Sheet) **ขัดกับหลักการพื้นฐานของ Phase B
  เอง** (`บทเรียน PHASE0: อ่าน/เขียน Property ทุก request แพงกว่าตัว log เอง` — คอมเมนต์ในโค้ดจริง
  บรรทัด ~57 ของ `appsscript_complete.gs`) — ถ้าจะใช้ durable write ต้อง **ไม่ใช่ต่อ event** ต้อง
  batched/deferred (นำไปสู่ Option C)

### Option C — Hybrid: Logger (คงเดิม) + durable telemetry แบบ batched/deferred

คง `[perfB]` Logger.log **ทั้งหมดเหมือนเดิมทุกจุด ไม่แก้ ไม่ลบ ไม่เพิ่มความถี่** (ยังเป็นเครื่องมือ
real-time หลักสำหรับดู execution เดี่ยว ๆ ผ่าน Executions UI เหมือนที่ทำได้อยู่ตอนนี้) แล้ว **เพิ่ม
ชั้น durable summary ที่เบามาก** โดยยึดสถาปัตยกรรมที่ระบบนี้มีอยู่แล้วและพิสูจน์แล้วว่าปลอดภัย:

- **`SHEET_NOTI_QUEUE` + `enqueueNoti_` + `drainNotiQueue` (trigger ทุก 1 นาที)** — ระบบคิวแจ้งเตือน
  LINE ที่มีอยู่แล้ว **แก้ปัญหาเดียวกัน** (ต้องการเขียนอะไรบางอย่างถาวรโดยไม่บวก latency บน hot path)
  ด้วยการ **เขียนแค่ record สั้น ๆ ลงคิว แล้วให้ trigger เบื้องหลังมาปล่อย/ประมวลผลทีหลัง** — แพทเทิร์น
  นี้ใช้ซ้ำได้ตรง ๆ สำหรับ perf telemetry
- **`writeAuditLogBatch_`** — เขียน audit หลายแถวรวดเดียวแทนทีละแถว (ใช้ตอน transfer batch 75 SKU)
  พิสูจน์แล้วว่า batched sheet write ปลอดภัยกับ throughput สูงถ้าเขียน **ครั้งเดียวต่อกลุ่ม** ไม่ใช่
  ต่อ sub-event

**การออกแบบที่เสนอ (แนวคิด — ยังไม่ implement)**:
1. เขียน durable record **1 แถวต่อ 1 request (END event เท่านั้น)** ไม่ใช่ 1 แถวต่อ sub-event —
   สรุป LOCK/ZORT/DRIVE/SESSION ทั้งหมดของ execution นั้นให้เป็น field เดียวในแถวสรุป (เหมือนที่
   `[perfB] END` ทำอยู่แล้วตอน log — แค่ต้อง**persist บรรทัดสรุปนั้น** ไม่ใช่ log อย่างเดียว)
2. **ไม่เขียน Sheet ตรง ๆ บน hot path** — buffer ไว้ใน memory ของ execution นั้น (ตัวแปรเดียวกับ
   `_PERF_REQ` ที่มีอยู่แล้ว) แล้ว "ปล่อยเข้าคิว" ด้วยวิธีที่เบาที่สุดเท่าที่จะทำได้ (ตัวเลือกย่อย
   ที่ต้องชั่งน้ำหนักตอน implement จริง ไม่ใช่ตอนนี้): เช่น เขียนแถวเดียวท้าย request ปกติ (มี
   ค่าใช้จ่าย 1 sheet write ต่อ 1 execution ซึ่งน้อยกว่า Option B มาก) **หรือ** ให้ trigger
   เบื้องหลัง (คล้าย `drainNotiQueue`) เป็นตัวเขียนแทน — แนวทางหลังปลอดภัยกว่าแต่ซับซ้อนกว่า
   (ต้องมีที่พักข้อมูลระหว่างรอ trigger ซึ่ง execution ที่จบไปแล้วไม่มี memory เหลือให้ trigger อื่น
   อ่าน — ต่างจาก LINE queue ที่ตัว action เขียนคิวเองอยู่แล้วโดยธรรมชาติ) → **นี่คือจุดที่ต้อง
   ตัดสินใจตอน implement จริง ไม่ใช่ตอนออกแบบนี้**
3. Sheet ใหม่ (สมมติชื่อ `PERF_LOG` — ตั้งชื่อจริงตอน implement) เก็บ: `reqId, ts, kind, action,
   durMs, sessN, sessMs, cacheKind (HIT/STALE/FRESH/MISS), lockSummary, zortSummary, driveSummary,
   corrId` (ดู §3) — บรรทัดเดียวสรุปทุกอย่างของ 1 execution แทนที่จะมี 5-6 บรรทัดเหมือน Logger
4. Retention: cap ด้วยจำนวนแถว (เหมือน `POWN_MAX_ROWS`/`SHEET_SHIP_ARCHIVE` ที่ระบบมีอยู่แล้ว) หรือ
   archive แบบเดียวกับ `archiveReceivedShipments` — ตัดสินใจตอน implement

**ข้อดี**: ได้ durability จริง (ไม่หายเมื่อ Executions UI หมดอายุ) โดยไม่ต้องย้าย GCP project (ความเสี่ยง
ต่ำกว่า A มาก) และไม่เขียนถี่เท่า B (ความเสี่ยงต่อ latency ต่ำกว่า B มาก เพราะ batched/1-แถว-ต่อ-request
แทน 1-แถว-ต่อ-event) · query ได้ผ่าน Sheet formula/filter ธรรมดา หรือ export CSV ให้ `perf-report.mjs`
อ่านได้เหมือนเดิม (ดู §5)

**ข้อเสีย/ความเสี่ยง**:
- ยังมี "1 sheet write ต่อ execution" เป็นต้นทุนเพิ่มที่ไม่มีอยู่เดิม (Logger.log ปัจจุบัน = 0 ต้นทุน
  I/O ภายนอก) — ต้องวัดผลกระทบจริงก่อนตัดสินใจ mode ที่แน่นอน (§2 ข้อ 2 ด้านบน) — **นี่คือเหตุผลที่
  เอกสารนี้ยังไม่ implement**, ไม่ใช่เพราะ Option C ไม่มีความเสี่ยงเลย
- ซับซ้อนกว่า Logger.log เดิม (ต้องมี sheet ใหม่ + cap/archive logic ใหม่) — ต้นทุนพัฒนา/บำรุงรักษา
  สูงกว่า "ไม่ทำอะไรเลย" แต่ต่ำกว่า Option A มาก

### ตารางเทียบ (ตามเกณฑ์ที่โจทย์กำหนด — ข้อ 8)

| เกณฑ์ | A: Standard GCP | B: Minimal durable (naive, ต่อ event) | C: Hybrid (Logger + batched summary) |
|---|---|---|---|
| **Latency added to hot path** | ต่ำ (ถ้าไม่ยิง API เอง) / **สูง** (ถ้ายิง Cloud Logging API ตรง) — ขึ้นกับ implementation | **สูง** — หลาย Sheet write ต่อ request | ต่ำ–กลาง — 1 write ต่อ request (ยังต้องวัดจริง) |
| **Concurrency contention risk** | ต่ำ (ถ้าไม่ implement เอง) | **สูง** — หลาย execution เขียนพร้อมกันถี่มาก | กลาง — เขียนน้อยกว่า B มาก แต่ยัง >0 ตอน burst |
| **Failure safety** (telemetry เอง fail แล้วไม่กระทบ request) | ต้องออกแบบเอง — เสี่ยงถ้าเรียก API sync | ต้องห่อ try/catch ทุกจุดเหมือน B — ทำได้แต่จุดเสี่ยงเยอะ (หลาย write) | ทำได้ง่ายกว่า (จุดเดียวต่อ request, ห่อ try/catch แบบเดียวกับ `[perfB]` เดิม) |
| **Quota/cost** | มีค่าใช้จ่าย GCP (เกิน free tier) + ต้นทุนย้าย project | ไม่มีค่าใช้จ่ายตรง แต่กิน Sheet API quota เร็วกว่า (write ถี่) | ไม่มีค่าใช้จ่ายตรง, กิน Sheet API quota น้อยกว่า B |
| **Retention** | ปรับได้เต็มที่ (วัน–ปี) | ถาวรจนกว่าจะลบเอง (ต้องมี cap/archive เอง) | เหมือน B |
| **Queryability** | ดีที่สุด (Cloud Logging query language, ข้ามทุก execution) | ดี (Sheet filter/pivot) แต่ volume สูงจะช้า | ดี (Sheet filter, volume ต่ำกว่า B มาก) |
| **ความเสี่ยงต่อ "สิ่งที่กำลังวัด" เอง** | ต่ำ–สูง ขึ้นกับ implementation | **สูงสุด** — เขียนถี่ที่สุดตอน burst ที่สุด | ต่ำกว่า B ชัดเจน แต่ยัง >0 |
| **ความเสี่ยงต่อระบบ production โดยรวม** (deploy/migration risk) | **สูงสุด** — ย้าย GCP project กระทบ deployment URL/auth ทั้งระบบ | ต่ำ (แค่เพิ่ม sheet write) | ต่ำ (แค่เพิ่ม sheet write, น้อยกว่า B) |
| **ต้นทุนพัฒนา/บำรุงรักษา** | สูง (ย้าย project + เรียนรู้ Cloud Logging) | ต่ำ–กลาง | กลาง (ต้องออกแบบ queue/cap เพิ่ม) |

---

## 3. Request/Correlation ID Design

### 3.1 สิ่งที่มีอยู่แล้ว (อย่าออกแบบซ้ำ)

`perfReqBegin_(kind, action)` สร้าง `_PERF_REQ.id = t0.toString(36) + random.toString(36)` **ตั้งแต่
บรรทัดแรกสุดของ `doGet`/`doPost`** และทุกฟังก์ชันย่อย (`perfLock_`, `perfZort_`, `perfDrive_`,
`perfSess_`) แนบ `id=` (จาก `_PERF_REQ.id`) เข้าไปในบรรทัด log ของตัวเองอยู่แล้ว — **นี่คือ
correlation ID ที่ผูก START/LOCK/ZORT/DRIVE/SESSION/END เข้าด้วยกัน "ภายใน 1 execution" ได้สมบูรณ์
อยู่แล้วในปัจจุบัน ไม่ต้องออกแบบใหม่**

### 3.2 ช่องว่างจริงที่ต้องเติม

`_PERF_REQ.id` เป็น **server-generated, per-execution เท่านั้น** — มีช่องว่าง 2 จุด:

1. **ไม่มีทางเชื่อม client-side action เดียวกันที่กระจายข้ามหลาย execution** เช่น การ retry
   ของ `orderCheck`/`transferCheck`/`billCheck` (ระบบมี `cid`/`tid`/`billCid` อยู่แล้วสำหรับกัน
   เขียนซ้ำ — แต่ค่าพวกนี้ **ไม่เคย** ถูกแนบเข้า `[perfB]` log) ทำให้วิเคราะห์ไม่ได้ว่า "3 ครั้งที่
   ผู้ใช้กดปุ่มเดียวกัน (retry เพราะ timeout) ไปตกที่ execution ไหนบ้าง และแต่ละครั้งช้าตรงไหน"
2. **execution ที่ fail ก่อนเข้าถึง `perfReqBegin_` เลย (เช่น 2 ตัวที่เห็นใน incident 25/08 — 0s
   FAILED) ไม่มี ID อะไรเลย** — เป็นข้อจำกัดเชิงโครงสร้างที่ **แก้ไม่ได้ด้วยการออกแบบ ID ใหม่**
   (ต้องยอมรับตรง ๆ ว่า correlation ID ช่วยอะไรไม่ได้ตรงจุดนี้ — ดู §3.4)

### 3.3 ข้อเสนอ (แนวคิด — ยังไม่ implement)

เพิ่ม **client-generated correlation id (`corrId`)** ที่ไม่ทับ `_PERF_REQ.id` เดิม แต่แนบเข้าไปเสริม:

- ฝั่ง client (`ui.jsx`/`dmjFetch`): ให้ทุก request ที่มี idempotency key อยู่แล้ว (`cid` ของ order,
  `tid` ของ transfer batch, `billCid` ของ sale bill) **ส่ง key เดิมนั้นซ้ำเป็น `corrId`** แทนที่จะ
  สร้างค่าใหม่ — ไม่เพิ่ม state ใหม่ฝั่ง client เลย เพราะ key เหล่านี้ **มีอยู่แล้ว** ในทุก retry
  (คงค่าเดิมตามกติกาเดิมของระบบ) request ที่ไม่มี idempotency key อยู่แล้ว (เช่น doGet ปกติ)
  ยังไม่ต้องมี `corrId` ก็ได้ในเวอร์ชันแรก (ไม่บังคับทุก call site)
- ฝั่ง server: อ่าน `corrId` จาก **query parameter เสมอ** (`e.parameter.corrId`) แม้เป็น POST —
  เหตุผลสำคัญ: query parameter อ่านได้ **ก่อน** `JSON.parse(e.postData.contents)` ซึ่งเป็นจุดที่
  อาจ throw ได้ถ้า body เพี้ยน → ทำให้ `perfReqBegin_` สามารถรับ `corrId` เข้าไปตั้งแต่บรรทัดแรกสุด
  โดยไม่ต้องรอ parse body สำเร็จก่อน (ปรับปรุงจากปัจจุบันที่ `perfReqBegin_('doPost')` ไม่รับ
  parameter ใด ๆ เลย)
- log format เดิมยังคงอยู่ครบ **แค่ต่อท้าย** field ใหม่: `[perfB] START kind=doPost id=<serverid>
  corrId=<clientkey> action=... t=...` — `id=` (server) ยังเป็นตัวหลักสำหรับ correlate ภายใน
  execution เดียว, `corrId=` (client) เป็นตัวเสริมสำหรับ correlate ข้าม execution/retry

### 3.4 ข้อจำกัดที่ต้องยอมรับตรง ๆ (ไม่ใช่สิ่งที่ ID ออกแบบดีแค่ไหนก็แก้ได้)

**Correlation ID ทุกแบบช่วยอะไรไม่ได้กับ execution ที่ไม่เคยเริ่ม** — ถ้า request ถูกตัดที่ชั้น
dispatch ของ Apps Script เอง (ก่อนถึงบรรทัดแรกของ `doPost`/`doGet`) หรือถูกยกเลิกฝั่ง client
(ปิดแท็บ/รีเฟรชกลางคัน) จะไม่มี log อะไรเกิดขึ้นเลยไม่ว่าจะออกแบบ ID ดีแค่ไหน — นี่ตรงกับ
"doPost 0s FAILED" ใน incident 25/08 ที่ยังเป็น UNKNOWN อยู่ (§6/§8 ของ incident doc) **ID ไม่ใช่
ทางแก้ของเคสนั้น** — สิ่งที่ช่วยได้คือ **client-side logging** (นอกสโคปเอกสารนี้ ซึ่งเป็นเรื่อง
frontend telemetry คนละชั้น) ถ้าต้องการเห็นฝั่ง "request ที่ไม่เคยไปถึง server เลย"

---

## 4. ทำไมเลือก Hybrid (C) ไม่ใช่ A หรือ B — สรุปเหตุผล

1. **A (Standard GCP) แก้ปัญหาได้ดีที่สุดในเชิง query/retention/alerting แต่ต้นทุนความเสี่ยงสูงสุด**
   และเป็นการเปลี่ยนแปลงระดับ infrastructure ที่ควรผ่านการตัดสินใจแยกต่างหาก ไม่ใช่ผลพลอยได้จาก
   งาน observability เร่งด่วนหลัง incident — เก็บไว้เป็นตัวเลือกระยะยาวถ้า C ไม่พอ
2. **B (naive durable ต่อ event) ขัดกับหลักการที่ Phase B วางไว้ตั้งแต่ต้น** (ห้าม I/O ถี่บน hot path)
   และเสี่ยงเป็น telemetry ที่แก้ไขพฤติกรรมของสิ่งที่กำลังวัดอยู่โดยตรง (เขียนถี่ที่สุดตอน burst
   หนักที่สุด — ตรงข้ามกับที่ต้องการ) — ไม่ควรทำในรูปแบบที่ถามตรง ๆ
3. **C ใช้ pattern ที่ระบบพิสูจน์แล้วว่าปลอดภัย** (`SHEET_NOTI_QUEUE`/batched write) ต้นทุนความเสี่ยง
   ต่ำกว่า A มาก (ไม่แตะ deployment/auth) และต่ำกว่า B มาก (เขียนน้อยกว่าหลายเท่า) — **เป็นก้าวที่
   สมเหตุสมผลที่สุดสำหรับสิ่งที่เพิ่งพิสูจน์ว่าเป็นปัญหาจริง**: หลักฐานหายก่อนมีคนไปเปิดดู ไม่ใช่
   "log ไม่มีรายละเอียดพอ" — **แค่ทำให้บรรทัดสรุป 1 บรรทัดต่อ request คงอยู่ถาวรก็แก้ปัญหาที่เจอจริง
   ได้แล้ว โดยไม่ต้องยกเครื่องทั้งระบบ**

---

## 5. ความเข้ากันได้กับ `scripts/perf-report.mjs`

**ยังไม่แก้ parser ในเอกสารนี้** — วิเคราะห์ผลกระทบเผื่อไว้เท่านั้น:

- Parser ปัจจุบัน (`parseStart`/`parseEnd`/`parseLock`/`parseZort`/`parseDrive`/`parseDouble`/
  `parseDoGet`) ใช้ `line.match(/regex/)` แบบ **ไม่ anchor ท้ายบรรทัด** (ไม่มี `$`) — การ **ต่อท้าย**
  field ใหม่ (เช่น `corrId=xxx`) เข้าไปในบรรทัด log เดิม **ไม่ทำให้ regex ที่มีอยู่พัง** (ยังจับกลุ่ม
  เดิมได้ครบ, แค่ไม่เห็น field ใหม่) — **เข้ากันได้แบบ backward-compatible โดยไม่ต้องแก้ parser เดิม**
  ถ้าแค่ต้องการให้ `perf-report.mjs` เดิมยังรันได้กับ log ใหม่
- **ถ้าต้องการให้ `perf-report.mjs` อ่าน `corrId` ได้จริง** (เพื่อ group by corrId ข้าม execution)
  ต้องเพิ่ม parser ใหม่ (เช่น `parseCorrId(line)` หรือขยาย regex ของ `parseStart` ให้ optional-capture
  `corrId=(\S+)`) — **นี่คือ required parser change ที่ระบุแยกไว้ตามข้อ 11 ของโจทย์**
- **Option C (durable Sheet) เป็นแหล่งข้อมูลคนละชนิดจาก log text** — ถ้าจะให้ `perf-report.mjs`
  อ่านจาก Sheet export (เช่น CSV ที่ export จาก sheet ใหม่) แทน/เสริมจาก Logger text จะต้องมี
  parser ใหม่แยกต่างหาก (`parseSheetRow` หรือคล้ายกัน) — ไม่ใช่การแก้ `parseEnd` เดิม เพราะ format
  ต่างกัน (CSV column ≠ `key=value` line) — **เป็น parser เพิ่มเติม ไม่ใช่การแก้ของเดิม** จึง
  "เข้ากันได้" ตามที่โจทย์ขอ (ของเดิมยังใช้ได้กับ Logger-based log เหมือนเดิมเป๊ะ)
- **สรุปข้อ 11**: ไม่ต้องแก้ `perf-report.mjs` ที่มีอยู่เลยถ้าไม่ implement เพิ่ม (มันยัง parse
  `[perfB]`/`[perf] doGet` แบบเดิมได้ 100%) — การแก้ parser เป็นงานแยกที่ทำ **พร้อมกับ** ตอน
  implement corrId/durable sheet จริง ไม่ใช่ตอนนี้

---

## 6. Explicit Non-Goals ของเอกสารนี้ (ย้ำตามโจทย์)

- ❌ ไม่แก้ business logic ใด ๆ
- ❌ ไม่แก้ lock strategy / timeout / retry / ZORT behavior — `_BUILD_LOCK_WAIT_MS`, `lock.tryLock(...)`,
  MAX_RETRIES ทั้งหมดคงเดิมเป๊ะ
- ❌ ไม่สร้าง synthetic transaction / ไม่ทดสอบยิง burst จำลอง
- ❌ ไม่เริ่ม Phase C หรือ performance fix ใด ๆ (F1–F7 ใน Backend Stability Audit v1 ยังไม่แตะ)
- ❌ ไม่ deploy — เอกสารนี้ไม่มีการเปลี่ยนแปลงต่อ `appsscript_complete.gs`/`.jsx` เลยแม้แต่บรรทัดเดียว
- ❌ **ไม่ยกระดับ RC-1..RC-5 จาก hypothesis เป็น confirmed root cause** — เอกสารนี้เป็นเรื่อง
  "จะเก็บหลักฐานให้ดีขึ้นได้อย่างไรในครั้งหน้า" ไม่ใช่ "สาเหตุคืออะไร" (คำถามหลังยังไม่มีคำตอบ
  ตามที่ระบุใน `docs/INCIDENT-2026-08-25-BURST.md` §0/§10)

---

## 7. ข้อเสนอแนะ (Recommendation)

**ทำ Option C (Hybrid: Logger คงเดิม + durable summary แบบ batched, 1 แถวต่อ 1 request) เป็นงานถัดไป**

**เหตุผลสรุป**:
1. แก้ปัญหาที่เจอจริง (หลักฐานหายก่อนมีคนอ่าน) โดยตรง — ไม่ต้องมีใครนั่งเฝ้า Executions UI
   real-time อีกต่อไป
2. ความเสี่ยงต่อระบบ production ต่ำที่สุดในบรรดา 3 ตัวเลือกที่แก้ปัญหาได้จริง (A แก้ได้แต่เสี่ยงสูง
   กว่ามาก, B เสี่ยงเป็นตัวเร่งปัญหาที่กำลังพยายามวัด)
3. ใช้ pattern ที่ codebase นี้มีอยู่แล้วและพิสูจน์แล้วว่าทำงานได้จริงในสภาพ production เดียวกัน
   (`SHEET_NOTI_QUEUE`, `writeAuditLogBatch_`) — ลดความเสี่ยง "แนวคิดใหม่ที่ไม่เคยพิสูจน์ในระบบนี้"
4. Correlation ID (§3) เพิ่มเข้าไปเป็นส่วนขยายเล็ก ๆ ของ instrumentation เดิมโดยไม่กระทบ log format
   เดิม และไม่กระทบ `perf-report.mjs` เดิม (backward-compatible)
5. Option A ยังเป็นตัวเลือกที่ควรพิจารณาใน**ระยะยาว**ถ้า C ยังไม่พอ (เช่น ต้องการ real-time
   alerting) — แต่ควรเป็นการตัดสินใจแยกต่างหากที่มีคนพิจารณาความเสี่ยง migration โดยเฉพาะ ไม่ใช่
   ทำพ่วงกับงานแก้ observability เร่งด่วนหลัง incident

**ขั้นต่อไป (นอกสโคปเอกสารนี้ — ต้องขออนุมัติแยก)**: ออกแบบละเอียดของ durable summary sheet
(schema, cap/archive policy, วิธี "ปล่อยเข้าคิว" ที่เบาที่สุด — ตัวเลือกย่อยใน §2 ข้อ C.2), วัด
ผลกระทบจริงของ 1-sheet-write-ต่อ-request ก่อนตัดสินใจ mode สุดท้าย, แล้วค่อย implement +
เพิ่ม parser ใน `perf-report.mjs` (§5) เป็นก้อนแยกที่มี test คุมแบบเดียวกับ
`tests/perf-observability.test.js` เดิม

---

## 8. IMPLEMENTATION STATUS (2026-08-26 — Option C implemented)

**Status: IMPLEMENTED on branch `claude/durable-observability-impl` (commit `9fab351`). NOT merged, NOT deployed,
gated OFF by default.** This section supersedes the "design-only" header for the parts now built; the design above
is unchanged and remains the rationale of record.

**What was built (matches §2 Option C + §3 corrId):**
- `perfTelemetryCapture_(r,durMs)` — called from `perfReqEnd_`; buffers **1 summary row per request** into a
  **lock-free sharded CacheService buffer** (`_PERF_TEL_SHARDS=8`). No Sheet I/O, no lock on the hot path.
  Chose lock-free over a dedicated lock because `getDocumentLock()` returns null on standalone scripts and
  `getScriptLock/getUserLock` would contend with business/build locks (self-referential risk, §2). Rare
  same-shard collision loss is accepted (FAIL-OPEN; telemetry loss ≠ business loss).
- `drainPerfTelemetry_` — time trigger every 1 min (mirrors `drainNotiQueue`); reads all shards, dedups by `id`,
  batch-writes to sheet **`PERF_TELEMETRY`** via one `setValues` (mirrors `writeAuditLogBatch_`); retention cap
  `_PERF_TEL_MAX_ROWS=20000` (trim oldest); on write failure drops the batch (no put-back → guarantees no dup).
- Schema (§ "PERF_TEL_HEADERS_"): `id, ts, corrId, kind, action, durMs, cacheKind, sessN, sessMs, lockSummary,
  zortMs, driveMs, deployVer, schemaVer(=1)`. All fields bounded length. **No PII.**
- `corrId` (§3): `perfReqBegin_(kind,action,corrId)` reads `e.parameter.corrId` (and `cid/tid/billCid` on the
  check endpoints) → cross-execution/retry correlation with **zero frontend change**. Appended after `t=` so the
  existing `perf-report.mjs` parser stays backward-compatible; `parseStart/parseEnd` now optionally capture
  `corrId`/`cacheKind`.
- SAFE ROLLOUT: Script Property `PERF_TELEMETRY_ENABLED` (default OFF). `setupPerfTelemetry()` enables + installs
  the trigger; `disablePerfTelemetry()` reverses it. Flag read via cache (no per-request Property read).

**Tests:** `tests/durable-telemetry.test.js` (19, eval real `.gs`) + parser-compat cases; full suite **2468 pass**.
**Overhead (Phase 10):** local CPU ~125 µs/req worst-case (full shard). GAS CacheService get/put I/O (~1–5 ms) is
the real per-request cost when ENABLED — **not measurable in the CI sandbox** (no GAS runtime; egress to
script.google.com blocked). It is bounded by design (cache ops only, no Sheet/lock on hot path) and OFF by default,
so deploying is inert until the owner runs `setupPerfTelemetry()`.

**Still cannot prove (unchanged from §3.4):** executions that die before `perfReqBegin_` (the 0s-FAILED class in
INCIDENT-2026-08-25) leave no record — needs client-side telemetry, out of scope. RC-1..RC-5 remain UNKNOWN until a
real burst is captured with this enabled.
