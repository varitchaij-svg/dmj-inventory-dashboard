# Backend Stability Audit v1 — Closure

ปิด audit รอบที่ 1 · เขียน 2026-08-21 · **documentation-only** (ไม่มีการแก้ application code / deploy / GCP / synthetic data ในการปิดครั้งนี้)

คู่กับ:
- `docs/HANDOFF-BACKEND-OBSERVABILITY.md` (Phase B instrumentation)
- `scripts/perf-report.mjs` (offline log analyzer — ยังไม่ถูกใช้กับข้อมูลจริง เพราะ log เก็บไม่ได้ ดูหัวข้อ OBSERVABILITY LIMITATION)

---

## เหตุผลที่ปิด

Audit v1 ตั้งเป้าพิสูจน์ root cause ของ incident (auth:me ช้า 14.4–64.2s · doPost ค้าง 298.6s · doGet 13–30s · stale banner ซ้ำ) **ด้วยตัวเลขจริงจาก 1 burst** ผ่าน Phase B `[perfB]` instrumentation

การเก็บข้อมูลจริง **ทำไม่สำเร็จ** เพราะข้อจำกัดของแพลตฟอร์ม (ไม่ใช่ข้อจำกัดของโค้ด — ดู OBSERVABILITY LIMITATION) → ไม่สามารถยกระดับ hypothesis ใด ๆ เป็น confirmed root cause ได้ในรอบนี้ จึงปิด audit v1 ตามสถานะที่มีจริง แล้วส่งต่อการเก็บข้อมูลเป็นเงื่อนไขเปิด v2

**ไม่มีการเปลี่ยน priority ของ A1** — A1 PASS ยังคงเดิม การปิดครั้งนี้และ LINE finding ด้านล่างไม่กระทบ A1

---

## สถานะแยกตามระดับความเชื่อมั่น

### ✅ CONFIRMED (มีหลักฐาน commit / deploymentId / file:line / timestamp)

| # | ข้อสรุป | หลักฐาน |
|---|---|---|
| C1 | **A1 Columnar Payload = PASS** | ยืนยันจากเซสชันก่อน · ไม่ถูกแก้ในรอบนี้ (`git diff` scripts/perf-report.mjs = ว่าง, appsscript perfB block ไม่แตะ pv=3) |
| C2 | **Phase B instrumentation อยู่ใน production จริง** | `f3e5956` เพิ่ม instrumentation · live ต่อเนื่องผ่าน `11b4287`→`a6c6267`→`3339fc3` · GitHub Actions run `32346162330`/`32379992252` job steps `Push to GAS`+`Deploy new version` conclusion=success |
| C3 | **deploymentId ที่ deploy = deploymentId ที่ production ใช้** | workflow `--deploymentId AKfycbz4…EDaEPbVcONg` == `config.js:5 _SHEET_BASE` เป๊ะ · ไม่มี version mismatch |
| C4 | **โค้ด instrumentation ไม่มี gate/flag ที่จะระงับ log** | `appsscript_complete.gs:2269` `perfReqBegin_('doPost')` = บรรทัดแรกของ `doPost` (ก่อน `try`) · `:2568`/`:2982` `perfReqEnd_()` ใน `finally` → ทุกทางออก (early-return/error/ปกติ) ต้องผ่าน START+END · helper `:64-119` ไม่มีเงื่อนไข enable/disable |
| C5 | **Executions panel ไม่แสดง log ของ production doPost จริง** | 20/8 17:25:25 · Function=doPost · Duration=10.572s · Status=สำเร็จ · Logs panel = "ไม่มีบันทึกที่พร้อมใช้งานสำหรับการดำเนินการนี้" · ไม่มี `[perfB] START/END` |
| C6 | **โปรเจกต์ใช้ DEFAULT GCP project** | ยืนยันโดยเจ้าของ · `appsscript.json` มีแค่ `exceptionLogging: STACKDRIVER` (คุม exception เท่านั้น ไม่ใช่ Logger.log) · ไม่มี standard project number ใน repo/manifest |

### 🟡 STRONG EVIDENCE (มีข้อมูลจริงแต่ไม่ครบพอ confirm — จาก Executions list: timestamp+duration เท่านั้น ไม่ใช่ `[perfB]`)

| # | ข้อสังเกต | หลักฐาน | ทำไมยังไม่ confirm |
|---|---|---|---|
| S1 | **มี real burst ที่ execution ทับเวลากันจริง** | 19/8 ~17:33 มี doPost/doGet เริ่มพร้อมกัน 2–3 อัน · 20/8 เช้ามี doGet ทับกัน | เห็นว่า "ทับกัน" แต่วัด observed max concurrency ไม่ได้ (ไม่มี START t + END dur) |
| S2 | **มี outlier duration สูงจริง** | doGet 39.728s (19/8 17:34:52) · doGet 17.307s (19/8 17:43:34) · keepWarm_ 12–63s หลายรอบ | ไม่รู้ว่าเวลาไปอยู่ที่ lock/ZORT/Drive/build ตัวไหน (ต้อง `[perfB]`) |
| S3 | **LINE delivery ล้มเหลวจริงใน production** | ดู LINE FINDING ด้านล่าง | เป็น occurrence ที่ confirmed แต่ root cause ของ HTTP 400 = UNKNOWN |

### 🔵 HYPOTHESIS (ยังพิสูจน์/หักล้างไม่ได้ — ต้องรอ `[perfB]` จาก burst จริง)

RC-1 ถึง RC-5 จาก Backend Stability Audit v1 **ทั้งหมดยังเป็น hypothesis** — **ห้ามยกระดับเป็น confirmed root cause จนกว่าจะมี `[perfB]` จริง**

| RC | สมมติฐาน | metric ที่ต้องใช้ตัดสิน (จาก perf-report.mjs) |
|---|---|---|
| RC-1 | concurrency ชนเพดาน (~30 execution พร้อมกัน) เป็น bottleneck | ① concurrency max |
| RC-2 | Drive photo upload คร่อม write lock ของ `punch` | ② lock `punch` holdMs + ⑥ Drive p50/max |
| RC-3 | `resolveSession_` double-resolve ทำให้เกิด write amplification | ④ sessPerReq.max / double-resolve count |
| RC-4 | latency ผูกกับ ZORT (ZORT ช้า/ค้าง) | ⑤ ZORT p50/max/retries |
| RC-5 | doPost 298.6s เกิดจาก action/function เฉพาะ (เช่น sync ZORT) | ③ action ที่ max สูงสุด |

**สถานะปัจจุบันของทั้ง 5: UNKNOWN** — ไม่มีข้อมูลยืนยันหรือหักล้าง

### ⚠️ OBSERVABILITY LIMITATION (สาเหตุที่ปิด audit โดยไม่มี root cause)

**ข้อจำกัดของแพลตฟอร์ม ไม่ใช่ของโค้ด** (โค้ด instrumentation ผ่านทุกจุดตรวจ — ดู C2/C3/C4):

1. **default GCP project → ไม่มี Cloud Logging** — `Logger.log()` เขียนเข้า Cloud Logging ได้เฉพาะเมื่อสคริปต์ผูก **standard** GCP project (Google official: `apps-script/guides/cloud-platform-projects`, `reference/base/logger`) · default project เข้า Logs Explorer ไม่ได้เลย
2. **Executions panel เป็น log ชั่วคราว** — Google ระบุเองว่า execution log "lightweight, real-time, ไม่ persist นาน" · มีรายงาน "No logs available for this execution" จากผู้ใช้ Apps Script วงกว้าง (Google Groups community) — เป็นปัญหาที่พบจริง แต่ Google ไม่เคยยืนยัน root cause อย่างเป็นทางการ (ระดับ **HYPOTHESIS** ของฝั่งแพลตฟอร์ม)
3. **ผลรวม**: production execution ที่ผ่านไปแล้ว **ดึง `[perfB]` คืนไม่ได้** ทั้งสองทาง (panel + Cloud Logging) พึ่งเงื่อนไขเดียวกัน

**นี่คือ blocker หลักของ audit v1** — ไม่ใช่ backend ที่วัดไม่ได้ แต่ **log ที่วัดไว้แล้วเข้าถึงไม่ได้**

---

## 🔴 LINE FINDING (แยกจาก backend root-cause — notification reliability)

**CONFIRMED occurrence · UNKNOWN root cause**

| field | ค่า |
|---|---|
| Function | `drainNotiQueue` |
| วันที่ | 2026-08-21 ~09:01 (เวลาไทย) |
| Duration | 7.427s |
| Status | สำเร็จ (execution ไม่ error — LINE call ต่างหากที่ล้มเหลว) |
| Log | `linePush_primary 400: {"message":"Failed to send messages"}` |

**หลักฐานว่า log นี้มาจากไหน**: `appsscript_complete.gs:11780` `Logger.log("linePush_ " + channel + " " + code + ": " + body.slice(0,200))` — ตรงกับ pattern `linePush_primary 400` เป๊ะ (channel=primary, code=400)

**ระบุได้เท่านี้ (ตามกติกา — ห้ามเดา):**
- LINE notification delivery มี production failure จริง
- HTTP 400 จาก LINE Push API ถูกบันทึก (`/v2/bot/message/push`)
- **สาเหตุที่แท้จริงยังไม่ทราบ** จาก evidence ที่มี (400 = client error ได้หลายอย่าง: payload/mention/target invalid ฯลฯ — **ไม่เดา**)
- **ไม่สรุปว่า LINE เป็นสาเหตุของ backend instability** — เป็นคนละระบบ (drainNotiQueue = trigger รายนาที ไม่ใช่ doPost/doGet ของผู้ใช้)
- **ควรติดตามเป็น separate notification reliability issue** (มี architecture gap รองรับ — ดู `docs/ARCHITECTURE-REVIEW-REPORT-NOTIFICATION.md` §5)

A1 PASS ไม่ถูกเปลี่ยนจาก finding นี้

---

## เงื่อนไขเปิด Audit v2 (ไม่เริ่มตอนนี้)

audit v2 เปิดได้เมื่อ **อย่างน้อยหนึ่งข้อ** เป็นจริง (ทั้งหมดเป็นการ config ไม่ใช่แก้ application code):
1. ผูก **standard GCP project** → `[perfB]` เข้า Cloud Logging เก็บย้อนหลังได้ (persist > 14 วัน, query ได้)
2. หรือ เก็บ log **ทันทีในวันเดียวกับ burst** จาก Executions panel ก่อนหมดอายุ (เสี่ยง "no logs available" ที่เจอแล้ว)

เมื่อได้ `[perfB]` จริง → `node scripts/perf-report.mjs <logfile>` → map RC-1..RC-5 ตามตาราง HYPOTHESIS ข้างบน

---

## สิ่งที่ **ไม่ได้ทำ** ในการปิดครั้งนี้ (ตามกติกา)

- ❌ ไม่แก้ application code · ❌ ไม่ redeploy · ❌ ไม่เปลี่ยน GCP project · ❌ ไม่ยกระดับ hypothesis เป็น root cause
- ❌ ไม่เริ่ม Phase C · ❌ ไม่เริ่ม F1–F7 · ❌ ไม่เริ่ม A2/A3/A4 · ❌ ไม่แก้ A1 · ❌ ไม่สร้าง synthetic transaction
