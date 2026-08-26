# Track B — Durable Observability (Option C) — CLOSE-OUT

วันที่: 2026-08-26 · สาขา: `claude/durable-observability-impl` · คอมมิตโค้ด: `9fab351`
สถานะ: **IMPLEMENTED · TESTED · PUSHED · ยังไม่ deploy / ยังไม่เปิดธง** (ตามเจตนา)

> เอกสารนี้คือรายงานปิดงาน Track B — เป็นการต่อยอดจากเครื่องมือวัด `[perfB]` (Phase B)
> ที่มีอยู่แล้ว (Logger ต่อ execution) โดยเพิ่มชั้น "บันทึกถาวร 1 แถว/request" ที่ค้นย้อนหลังได้
> โดย **ไม่แตะ hot path ทางธุรกิจเลย**

---

## 1. Objective — ปัญหาที่แก้

`[perfB]` เดิมเขียนลง **Logger (Stackdriver)** เท่านั้น → ข้อมูลวัดผลมีจริง แต่:

- **ค้นย้อนหลังยาก** — ต้องเปิด GAS Executions ทีละอัน ไม่มีมุมมองรวม "ช้าตรงไหน เมื่อไหร่ กี่ครั้ง"
- **ไม่มี correlation ข้าม execution** — request ที่ retry (cid/tid/billCid) แยกกันคนละ log
  ต่อกันเป็นเส้นเดียวไม่ได้
- **หายเองตามอายุ log** — วิเคราะห์เทรนด์ข้ามสัปดาห์/เดือนไม่ได้

Track B เพิ่ม **durable summary** = 1 แถวต่อ 1 request ลงชีต `PERF_TELEMETRY`
ที่ query/สรุป/ทำกราฟย้อนหลังได้ **โดยต้นทุนบน hot path ≈ ไมโครวินาที** และ **fail-open 100%**

---

## 2. Design Used — ทำไมเลือก Option C (Hybrid)

จาก `docs/DURABLE-OBSERVABILITY-DESIGN-V1.md` มี 3 ทางเลือก:

| Option | วิธี | ทำไม**ไม่**เลือก / เลือก |
|---|---|---|
| A — เขียนชีตตรงจาก perfReqEnd_ | setValues ทุก request | ❌ Sheet I/O + ต้องล็อกบน hot path ของ**ทุก** request = กลายเป็น root cause ใหม่ |
| B — Logger อย่างเดียว (คงเดิม) | ไม่ทำอะไร | ❌ ไม่แก้ปัญหา query/correlation/retention |
| **C — Hybrid (เลือก)** | Logger คงเดิม **+** บัฟเฟอร์ lock-free ใน CacheService → background trigger drain ลงชีตเป็นชุด | ✅ hot path ไม่แตะ Sheet/lock · การเขียนชีตยกไปอยู่ trigger เบื้องหลัง |

**การตัดสินใจที่ design ค้างไว้ แล้วปิดในรอบนี้:**
design เสนอ `getDocumentLock()` กันบัฟเฟอร์ชนกัน — **ปฏิเสธ** เพราะ
`getDocumentLock()` คืน `null` บน standalone script (สคริปต์นี้ไม่ได้ container-bound)
→ จะปิดการ capture เงียบ ๆ · ส่วน `getScriptLock`/`getUserLock` จะไปแย่งกับล็อกธุรกิจ/build lock
→ **เลือก lock-free sharded buffer** (8 shard) ยอมรับการสูญเสียแบบหายากตอน read-modify-write ชนกัน
(ข้อมูลวัดผล ไม่ใช่ข้อมูลธุรกิจ — หายบางแถวได้)

---

## 3. Implementation — สิ่งที่เพิ่มจริง (`appsscript_complete.gs`)

**ขยาย state เดิม (ไม่เพิ่ม path ใหม่บน hot loop):**
- `perfReqBegin_(kind, action, corrId)` — เพิ่มพารามิเตอร์ `corrId` (bounded 64) + ฟิลด์
  `cacheKind/zortMs/driveMs` ใน `_PERF_REQ` · corrId **ต่อท้าย** START log (หลัง `t=`) เพื่อ
  ไม่ทำ parser เดิมพัง
- `perfZort_`/`perfDrive_` — สะสม ms เข้า `_PERF_REQ` (ถ้ามี)
- `perfCache_(kind)` — setter ใหม่ บันทึกว่า request นี้ hit/miss/stale (bounded 16)
- `perfReqEnd_(extra)` — เรียก `perfTelemetryCapture_(r, dur)` **ก่อน** null `_PERF_REQ`

**ชั้น telemetry ใหม่ทั้งหมด (แยกบล็อก):**
- `perfTelemetryCapture_(r, durMs)` — เขียนสรุปลง **CacheService shard** (lock-free,
  read-modify-write, cap `_PERF_TEL_SHARD_MAX`=80/shard) · **ห่อ try/catch ทั้งก้อน ไม่ throw** ·
  ไม่แตะ Sheet/lock บน hot path
- `_perfTelShard_(id)` — hash id % 8 · `_perfTelOn_()` — อ่านธงจาก cache (fallback property, พลาด→false)
- `perfTelemetryRowsFromRecords_(recs, deployVer)` — pure, ประกอบแถวตาม schema + dedup by id
- `drainPerfTelemetry_()` — **trigger ทุก 1 นาที**: อ่าน 8 shard → remove → dedup → `setValues`
  เป็นชุด → trim เก็บ `_PERF_TEL_MAX_ROWS`=20000 · เขียนพลาด = ทิ้งทั้งชุด (ไม่เขียนซ้ำ)
- `setupPerfTelemetry()` / `disablePerfTelemetry()` — เปิด/ปิดธง + ตั้ง/ลบ trigger

---

## 4. Data Schema — ชีต `PERF_TELEMETRY`

```
PERF_TEL_HEADERS_ = ['id','ts','corrId','kind','action','durMs','cacheKind',
                     'sessN','sessMs','lockSummary','zortMs','driveMs','deployVer','schemaVer']
```
- `PERF_TEL_SCHEMA_VER = 1` (คอลัมน์ท้ายสุด) — ขึ้นเวอร์ชันเมื่อเปลี่ยน layout
- **ต่อท้ายอย่างเดียว ห้ามแทรก/สลับ** (บทเรียนข้อ 5) — `perfTelemetryRowsFromRecords_` เขียนตามตำแหน่ง

---

## 5. Correlation — ต่อ retry เป็นเส้นเดียว

`corrId` มาจาก idempotency key ที่มีอยู่แล้ว: `corrId || cid || tid || billCid`
(doGet) · `e.parameter.corrId` (doPost) → request หลายครั้งของคำสั่งเดียว (สั่งของ/โอน/ออกบิล
ที่ retry) แชร์ corrId เดียว → group ในชีตได้

---

## 6. Queue / Batch — ทำไมไม่เขียนชีตตรง

hot path เขียนลง **cache shard** เท่านั้น (RAM-speed) · การเขียนชีต (แพง + ต้องล็อก) ยกไปที่
`drainPerfTelemetry_` เบื้องหลัง เขียนทีละชุด → amortize ต้นทุน · 8 shard × 80 = บัฟเฟอร์สูงสุด
640 แถว (< 100KB cache) ก่อน drain รอบถัดไป

---

## 7. Failure Isolation — FAIL-OPEN ทุกจุด

- `perfTelemetryCapture_` ห่อ try/catch ทั้งฟังก์ชัน — cache พัง/property throw/`r` เป็น null →
  return เงียบ ๆ **ไม่ throw กลับเข้า business path**
- `_perfTelOn_()` พลาด → คืน `false` (ปิด capture) ไม่ใช่ throw
- `drainPerfTelemetry_` เขียนชีตพลาด → ทิ้งทั้งชุด ไม่ retry ในตัว (กันเขียนซ้ำ) — รอบหน้าเก็บใหม่
- **หลักการ**: telemetry ล้มเหลว ≠ business ล้มเหลว · **ห้ามให้เครื่องมือวัดกลายเป็น root cause**
  (เทสต์พฤติกรรมยืนยัน: throw cache/property/null → capture ยังคืนปกติ)

---

## 8. Security / PII — ไม่มีข้อมูลส่วนตัว

schema ไม่มี phone/email/token/sessionToken/authorization/raw body ·
เก็บเฉพาะ metric (kind/action/durMs/cacheKind/ms ต่อ subsystem/lock summary) ·
เทสต์มีทั้ง **source scan** (ไม่มี key ต้องห้ามใน HEADERS/capture) และ **behavioral**
(feed body ที่มี PII แล้วยืนยันว่าแถวที่ได้ไม่มี) · ธงเก็บใน Script Property (ความลับไม่อยู่ในโค้ด)

---

## 9. Parser Compatibility — `scripts/perf-report.mjs`

parseStart/parseEnd เพิ่ม key `corrId`/`cacheKind` **เฉพาะเมื่อมีจริง** → log เก่าที่ไม่มีฟิลด์
ยัง parse ได้เท่าเดิม (เทสต์ `toEqual` เดิมไม่พัง) · START log ย้าย corrId ไปท้ายสุดเพื่อไม่ชน
regex `id=(\S+) action=` ที่ยึดช่องว่าง

---

## 10. Performance Overhead

- Benchmark local (CPU ล้วน): ~125µs/request worst-case — เทียบกับ request ธุรกิจหลักวินาที = ไม่มีนัย
- GAS CacheService I/O จริง (put/get ต่อ shard): **วัดใน sandbox ไม่ได้** (proxy บล็อก
  script.google.com) — ระบุเป็น **CALCULATED** ต้องยืนยันจาก Executions หลัง deploy จริง
- hot path **ไม่มี** Sheet I/O และ **ไม่มี** lock — ต้นทุนคือ 1 cache get + 1 cache put ต่อ request

---

## 11. Tests — `tests/durable-telemetry.test.js` (19) + งานเดิม

eval ฟังก์ชันจริงจาก `.gs` (ไม่ copy) ผ่าน brace-matched extractor · คุม:
flag off/on · summary capture · fail-open (cache throw / property throw / null r) ·
bounded length · burst cap ต่อ shard · dedup by id · schema/column order · PII (source + behavioral) ·
wiring (perfReqEnd_ เรียก capture, doGet/doPost ส่ง corrId) · parser backward-compat
- ปรับ `tests/perf-observability.test.js`: doPost assertion → regex (รับพารามิเตอร์ corrId ใหม่)
- เติม `tests/perf-phase0.test.js`: `PERF_TRIGGER_SCHEDULE_` ต้องมี `drainPerfTelemetry_`
- **ผลรัน close-out**: 3 ไฟล์ที่เกี่ยวข้อง 62/62 ผ่าน · สวีททั้งระบบ (รอบ implement) 2468 ผ่าน

---

## 12. Production Status — ยังไม่มีผลกับ production

- ❌ **ยังไม่ merge master** · ❌ **ยังไม่ deploy** · ❌ **ยังไม่เปิดธง**
- ธง `PERF_TELEMETRY` default **ปิด** → แม้ deploy โค้ดนี้ก็ **ไม่มีอะไรเปลี่ยน** จนกว่าเจ้าของ
  รัน `setupPerfTelemetry()` เอง (SAFE ROLLOUT ตาม convention repo)
- HTTP smoke จาก sandbox ทำไม่ได้ (proxy 403 ที่ script.google.com) — ต้องยืนยันบน Executions จริง

---

## 13. Known Limitations

- สูญเสียแถวหายากตอน read-modify-write ของ shard ชนกัน (ยอมรับได้ — ข้อมูลวัดผล ไม่ใช่ธุรกิจ)
- ต้นทุน cache I/O จริงยัง **CALCULATED** ไม่ใช่ **MEASURED**
- `drainPerfTelemetry_` ต้องตั้ง trigger เอง 1 ครั้งผ่าน `setupPerfTelemetry()` (clasp ไม่ตั้งให้)
- retention เป็นการ trim ตามจำนวนแถว ไม่ใช่ตามเวลา

---

## 14. What This Now Allows Us To Prove (หลังเปิดจริง)

- "request ช้าเกิน N วิ" เกิดกี่ครั้ง/วัน · ช้าที่ **subsystem ไหน** (zortMs vs driveMs vs sessMs vs lock)
- แยก "รอ GAS คิด" ออกจาก "ดาวน์โหลด" ต่อ action ได้จากข้อมูลรวม ไม่ต้องเปิดทีละ execution
- ต่อ retry (corrId) เป็นเส้นเดียว → ตอบได้ว่า "กดซ้ำเพราะช้า" เกิดบ่อยแค่ไหน
- เทรนด์ข้ามวัน/สัปดาห์ (retention 20000 แถว)

## 15. What It Still Cannot Prove

- สาเหตุ RC-1..RC-5 (ยัง UNKNOWN — เครื่องมือนี้ให้ **ข้อมูล**เพื่อไล่ ไม่ใช่คำตอบ)
- อะไรเกิด **ก่อน** doGet/doPost (cold start ของ Google, เน็ตร้าน, การตัดสายฝั่ง browser)
- ต้นทุน cache I/O จริงบน GAS (ต้องดู Executions หลัง deploy)

---

## 16. EXACT NEXT ACTION (สิ่งเดียวที่ต้องทำต่อ)

**เจ้าของตัดสินใจ merge → deploy → แล้วรัน `setupPerfTelemetry()` 1 ครั้งใน GAS editor**
เพื่อเปิดธง + ตั้ง trigger `drainPerfTelemetry_` · จากนั้นรอ ~1 วันให้ชีต `PERF_TELEMETRY`
สะสมข้อมูลจริง แล้วค่อยยืนยันต้นทุน cache I/O จาก Executions (เปลี่ยน CALCULATED → MEASURED)

> จนกว่าจะทำขั้นนี้ Track B **ไม่มีผลกับ production เลย** (โค้ด dormant หลังธงปิด)
