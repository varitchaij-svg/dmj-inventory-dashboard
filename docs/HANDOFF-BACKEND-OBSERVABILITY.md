# HANDOFF — Backend Observability (Phase B, เสร็จแล้ว 2026-08-20)

คู่กับ **Backend Stability Audit v1** (audit เชิงโครงสร้าง — สืบ root cause ของ incident
auth:me ช้า 14.4–64.2s / doPost ค้าง 298.6s / doGet 13–30s / stale banner ซ้ำ)
· branch: `claude/gas-backend-stability-audit-itscv0` · commit `f3e5956`

---

## สถานะ

**เสร็จแล้ว**: instrumentation ครบ 7 metrics แบบ log-only + fail-safe (ไม่เปลี่ยนพฤติกรรมระบบ)
· unit 2109/2109 ผ่าน · browser 110/110 ผ่าน · pushed ไปแล้ว

**ยังไม่ได้ทำ**: merge เข้า `master` (ยังไม่ deploy จริง) · ยังไม่มี log จาก burst จริง ·
ยังไม่ได้อ่านผลด้วย `scripts/perf-report.mjs` กับข้อมูลจริง · **ยังไม่แก้ performance logic ใด ๆ**
(F1/F2/F3 ในรายงาน audit ยังไม่ได้ทำ — ตั้งใจ รอดูตัวเลขก่อน)

---

## สิ่งที่ต้องทำต่อ (คนถัดไป/เซสชันถัดไป)

### 1. Merge เข้า master → auto-deploy
```
git checkout master && git merge claude/gas-backend-stability-audit-itscv0 && git push
```
Actions จะ `clasp push` ให้เองภายในไม่กี่นาที (ดูหัวข้อ "Deploy process" ใน CLAUDE.md)
— ไม่ต้องรัน setup function ใดๆ เพิ่ม เพราะ instrumentation ไม่มีฟังก์ชันที่ต้องรันครั้งแรก

### 2. เก็บ log ช่วง burst จริง (เข้า/ออกงาน ~15 คนพร้อมกัน)
- เปิด GAS editor → **Executions** (หรือ Cloud Logging ถ้าผูก GCP project ไว้)
- กรองด้วยคำว่า `[perfB]` (และเก็บ `[perf] doGet` คู่กันไว้ด้วย — เป็น metric ⑦)
- **ต้องเป็นช่วง burst จริง** ไม่ใช่ช่วงเงียบ — ไม่งั้นตัวเลขไม่พิสูจน์อะไร
- copy บรรทัดทั้งหมดในช่วงนั้นลงไฟล์ เช่น `burst-2026-08-2X.log`
- จดสถานะ flag ตอนนั้นไว้ด้วย (`INAPP_NOTI_ENABLED`, `PRODUCT_OWNER_ENABLED`) และจำนวนแถวชีต
  "เซสชัน"/"ลงเวลา" — เป็นตัวคูณของ RC-3 (ดูหัวข้อ audit)

### 3. รันตัวสรุป
```
node scripts/perf-report.mjs burst-2026-08-2X.log
```
ได้รายงาน 7 หัวข้อ (① concurrency ② lock wait/hold ③ action+duration ④ resolveSession
⑤ ZORT ⑥ Drive ⑦ cache mix) — อ่านวิธีตีความแต่ละหัวข้อได้จากท้ายข้อความสรุปของ session
ก่อนหน้า (หรือ audit artifact) ย่อ ๆ ไว้ที่นี่:

| หัวข้อ | ตอบคำถาม |
|---|---|
| ① concurrency max | ชนเพดาน ~30 execution พร้อมกันจริงไหม (RC-1) |
| ② lock `punch` holdMs สูง | ยืนยัน Drive upload คร่อมล็อกเขียน (RC-2) |
| ③ action ที่ max สูงสุด | **ชื่อฟังก์ชันจริง**ของ doPost 298.6s (RC-5 syncZortNow vs RC-4 ZORT-bound) |
| ④ sessPerReq.max / double-resolve count | ปริมาณงานเขียนซ้ำจาก resolveSession_ (RC-3) |
| ⑤ ZORT p50/max/retries | ZORT ช้า/ค้างช่วงนั้นจริงไหม (RC-4) |
| ⑥ Drive p50/max | สัดส่วนที่ punch เสียไปกับอัปโหลดรูป |
| ⑦ cache mix | STALE เยอะ = เส้นอ่านยังกันได้ดี / MISS เยอะ = build ทับกัน |

### 4. เอาผลไปตัดสินใจ (ยังไม่ทำในรอบนี้)
เลือกก้อนถัดไปจาก **Recommended fixes** ในรายงาน audit (F1 → F2 → F3 → F4 → F5 → F6 → F7
เรียงตาม impact/risk) — ทำทีละก้อน วัดก่อน/หลังด้วย instrumentation ชุดนี้เอง แล้ว deploy แยกกัน
**ห้ามทำหลายก้อนรวด**

---

## กติกาที่ต้องรู้ก่อนแตะต่อ

- **instrumentation เป็น log-only** — ไม่มีการเขียนชีต/Property/Cache เพิ่ม ไม่กระทบ quota/เวลา
  execution อย่างมีนัยสำคัญ (`Date.now()` + `Logger.log` เท่านั้น) → **ปล่อยไว้ในโค้ดได้ถาวร**
  ไม่ต้องรีบถอดหลัง burst เสร็จ (ต่างจาก perf-phase0 ที่เคยเตือนให้ถอด — ตัวนี้เบากว่ามาก)
- **`scripts/perf-report.mjs` เป็นเครื่องมือ offline ล้วน** — รันบนเครื่อง ไม่ใช่บน GAS
- ห้ามแก้ business logic / lock strategy / timeout / retry จนกว่าจะเห็นตัวเลขจาก burst จริง
  (มี meta-test ใน `tests/perf-observability.test.js` ล็อกไว้ว่า lock args เดิม (8000/15000/10000,
  waitLock 10000) และ retry count เดิม (3 / MAX_RETRIES) ยังอยู่ — แก้แล้วเทสต์จะแดงเตือน)
- A1 (pv=3 columnar payload) **ยังคงเดิม ห้ามย้อน** — พิสูจน์แล้วว่าไม่ใช่ root cause
- ยังไม่แตะ Supabase / ยัง ไม่เริ่ม A2-A4 / ยัง ไม่ทำ Phase 8 เพิ่ม

---

## อ้างอิง

- Audit เต็ม (root-cause candidates + evidence + fix priority): ดูข้อความสรุปในเซสชันที่ทำ audit
  (ไม่ได้ copy เข้า repo เป็นไฟล์ — เป็น artifact แยก) หรือขอให้เซสชันถัดไปสรุปซ้ำจาก
  `appsscript.json`/`appsscript_complete.gs` ตามที่ audit อ้าง file:line ไว้
- `docs/PHASE0-RESULTS.md` — loadtest 15 คนพร้อมกัน (ข้อมูลอ้างอิงเดียวที่มีตัวเลขจริงก่อนหน้านี้)
- `tests/perf-observability.test.js` — parser tests + meta-tests กัน drift ของ behavior เดิม

---

## อัปเดต 2026-08-26 — Durable capture (Track B, Option C) เพิ่มแล้ว

Phase B `[perfB]` (log-only) ยังอยู่ครบเหมือนเดิม · เพิ่มชั้น **durable** ทับไว้ (commit `9fab351`,
branch `claude/durable-observability-impl`, **ยังไม่ merge/deploy, ปิดโดย default**).

**เวิร์กโฟลว์เก็บ burst แบบใหม่ (ไม่ต้องนั่งเฝ้า Executions UI):**
1. เจ้าของรัน **`setupPerfTelemetry()`** 1 ครั้งใน GAS editor (เปิด flag + ตั้ง trigger `drainPerfTelemetry_`)
2. ระบบเก็บ **1 แถวสรุปต่อ 1 request** ลงชีต **`PERF_TELEMETRY`** อัตโนมัติ (drain ทุก 1 นาที) — คงอยู่ถาวร
   ไม่หายเมื่อ Executions UI หมดอายุ (ซึ่งคือสาเหตุที่ incident 25/08 + 26/08 ปิดแบบ observability-limited)
3. หลัง burst: export ชีต `PERF_TELEMETRY` เป็น CSV แล้ววิเคราะห์ (median/p95/lock/zort/cache/corrId) — หรือ
   ใช้ `[perfB]` log เดิมกับ `scripts/perf-report.mjs` ควบคู่ได้ (parser เข้ากันได้ทั้งสองแบบ)
4. เลิกใช้: **`disablePerfTelemetry()`** (ลบ trigger · ข้อมูลในชีตยังอยู่)

**คอลัมน์:** id · ts · corrId · kind · action · durMs · cacheKind · sessN · sessMs · lockSummary · zortMs · driveMs ·
deployVer · schemaVer · **ไม่มี PII** · `corrId` = cid/tid/billCid → ตาม retry ข้าม execution ได้
**FAIL-OPEN:** telemetry พัง (cache/quota/ชีต) ไม่ทำให้ request พัง · ไม่แตะ lock/timeout/retry ของ business
