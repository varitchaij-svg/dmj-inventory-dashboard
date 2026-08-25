# INCIDENT — Burst slowness (concurrent doGet + doPost failures)

**วันที่เกิด**: 2026-08-25 ~14:38–14:39 (Asia/Bangkok)
**สถานะเอกสาร**: **ปิดเคสแล้ว — closed as OBSERVABILITY-LIMITED (2026-08-25)** ดู §0 ·
เอกสารนี้ยังเป็น FORENSIC INVESTIGATION เท่านั้น — **ไม่มีการเสนอ/ทำ code fix, ไม่ deploy,
ไม่แตะ lock/cache/retry/session/LINE, ไม่เริ่ม Phase C** ตลอดทั้งเอกสาร
**ผู้รายงานอาการ**: พนักงานหลายคน — "ERP/Web App หมุนนานตอนใช้งานพร้อมกัน"
**หลักฐานหลักที่มี**: 1 screenshot จาก Apps Script Executions (หน้า 2 จากหลายหน้า) + repo/git/Actions
**หลักฐานที่ยังไม่มี**: log `[perfB]` จริงของ execution ในรอบ incident (ไม่ได้เก็บทันเวลา — ดู §0)

> ⚠️ กติกาหลักของเอกสารนี้: **ห้ามยกระดับสิ่งที่ไม่มี log เป็น confirmed root cause** ·
> ทุกข้อสรุปติดป้าย `CONFIRMED / STRONG EVIDENCE / HYPOTHESIS / UNKNOWN` ·
> "เวลาที่ browser เห็น ≠ เวลาที่ script ใช้" (บทเรียน Phase 7.4) — แยกสองอย่างนี้เสมอ

---

## 0. Closure Statement (2026-08-25)

**เคสนี้ปิดในสถานะ "observability-limited"** ไม่ใช่ "resolved" และไม่ใช่ "root cause confirmed"

- หลักฐานที่มีอยู่ (§2–§6) **พอเห็นภาพ** ว่ามี burst จริงและ latency ไล่ระดับตรงกับลายเซ็น
  queue/stampede ที่เคยพบมาก่อน (§9) แต่ **ไม่พอปิดคดี** — ไม่มีใครเปิด `[perfB]` ของ 6 execution
  ที่ระบุไว้ใน §7.3 ทันเวลาก่อนหลักฐานหมดอายุใน Apps Script Executions UI (ความเสี่ยงที่เตือนไว้ใน §11
  เกิดขึ้นจริง)
- **RC-1..RC-5 (จาก Backend Stability Audit v1) และ HYPOTHESIS ทั้งหมดใน §10 ของเอกสารนี้
  ยังคงเป็น HYPOTHESIS — ไม่มีข้อใดถูกยกระดับเป็น CONFIRMED** จากการปิดเคสนี้
- เหตุผลที่ปิดแทนที่จะปล่อยค้าง: การไล่ล่า log ทีละ execution ผ่าน UI ด้วยมือ **เป็นคอขวดที่ทำให้
  incident นี้เอง evidence หมดอายุก่อนจะสรุปได้** — นี่คือข้อจำกัดเชิงโครงสร้างของ observability
  ชุดปัจจุบัน ไม่ใช่ปัญหาที่แก้ด้วยการพยายามซ้ำ (retry) แบบเดิม
- **สิ่งที่ตามมาจากเคสนี้**: งานถัดไปคือปรับปรุง **observability layer เอง** (ไม่ใช่ performance fix)
  เพื่อไม่ให้ incident ครั้งหน้าจบลงแบบเดียวกัน — ดู `docs/DURABLE-OBSERVABILITY-DESIGN-V1.md`
  (Phase B.1, design-only, ยังไม่ implement)
- **ยังไม่ตัดสินใจว่า RC ใดคือสาเหตุจริง** ของ burst 25/08 — ถ้า pattern เกิดซ้ำอีกและมี observability
  ที่ดีขึ้นแล้ว ให้กลับมาอ้างอิงโครงเอกสารนี้ (§7.3 checklist, §9 comparison table) ในการสืบสวนรอบถัดไป

---

## 1. Incident Summary

ช่วง ~14:38:30–14:39:30 (Bangkok) มี `doGet` หลายตัว **เริ่มพร้อมกันในวินาทีเดียว** (burst) แล้ว
duration พุ่งสูงผิดปกติ (สูงสุด 30.4s) พร้อมกับ `doPost` 2 ตัวที่ขึ้น **0s → ล้มเหลว (FAILED)** ·
อาการฝั่งผู้ใช้ = "หน้าจอหมุนนาน" ตรงกับ latency ที่เห็นใน Executions

ลักษณะนี้ **เข้ากันได้กับ** pattern "concurrent open → build/queue contention" ที่เคยวัดไว้ใน
`docs/PHASE0-RESULTS.md` (15 request พร้อมกัน → มัธยฐาน 41–52s) และที่ Phase 7.3–7.4 พยายามแก้
(single-flight + stale-while-rebuild + payload ลดขนาด) — **แต่ยังพิสูจน์ root cause ไม่ได้จนกว่าจะ
อ่าน `[perfB]` ของ execution จริง**

**สิ่งที่ยืนยันได้แน่ (โครงสร้าง/deploy)** และ **สิ่งที่ยังเดาไม่ได้ (สาเหตุ runtime)** แยกกันชัดเจน
ในเอกสารนี้ · production version ณ เวลาเกิดเหตุ **มี instrumentation `[perfB]` ครบ** → ถ้า log ยังอยู่
ใน Executions ก็สามารถปิดคดีได้ด้วยตัวเลขจริง (§7)

---

## 2. Timeline

เวลาจาก screenshot (Bangkok). Screenshot เป็น **หน้า 2 จากหลายหน้า** → burst จริงอาจมีมากกว่าที่เห็น

| เวลา (BKK) | ชนิด | duration | สถานะ | หมายเหตุ |
|---|---|---|---|---|
| 14:38:30 | doPost | 5.429s | สำเร็จ | write ปกติ (มี duration → เข้า body แล้ว) |
| 14:38:37 | doGet | 2.786s | สำเร็จ | |
| 14:38:40 | doGet | **17.609s** | สำเร็จ | doGet ช้าตัวแรก ๆ |
| 14:38:45 | doGet | 3.243s | สำเร็จ | |
| 14:38:50–53 | doGet ×5 | 3.1–6.7s | สำเร็จ | เริ่มหนาแน่น |
| 14:38:52 | **doPost** | **0s** | **ล้มเหลว** | ← Priority #1 (§6, §8) |
| 14:38:54–56 | doGet ×3 | 3.2–5.1s | สำเร็จ | |
| 14:38:57 | **drainNotiQueue** | 5.563s | สำเร็จ | trigger เบื้องหลัง (§7) รันคาบเกี่ยว burst |
| 14:38:58 | **doPost** | **0s** | **ล้มเหลว** | ← Priority #2 (§6, §8) |
| 14:38:58 | doGet | 1.499s / 4.41s | สำเร็จ | |
| 14:38:59 | doGet | 6.474s | สำเร็จ | |
| **14:39:28** | **doGet ×5 เริ่มพร้อมกัน** | 4.846 / 5.857 / **14.851** / **22.356** / **30.416**s | สำเร็จ | ← **จุดพีคของ burst** (§4) |
| 14:39:29 | doGet | 6.887s | สำเร็จ | |
| 14:39:30 | doGet | 4.392s | สำเร็จ | |

**ข้อสังเกตเชิงเวลา**: 14:39:28 มี doGet อย่างน้อย 5 ตัว **ประทับเวลาเริ่มวินาทีเดียวกัน** และ
duration ไล่ระดับ 4.8 → 30.4s — เป็นลายเซ็นของ **"เข้าคิว/ทับกัน"** (คนแรกเร็ว คนท้ายรอนานสุด)
มากกว่าลายเซ็นของ "ทุกคนช้าเท่ากันเพราะ backend ช้าตัวเดียว"

---

## 3. Observed Evidence (จาก screenshot — ระดับ Executions เท่านั้น)

| สิ่งที่เห็น | ค่า | ป้าย |
|---|---|---|
| burst window | ~14:38:30–14:39:30 | CONFIRMED (screenshot) |
| doGet เริ่มพร้อมกัน 14:39:28 | ≥ 5 ตัว/วินาที | CONFIRMED (screenshot) |
| doGet duration สูงสุด | 30.416s | CONFIRMED (screenshot) |
| doPost FAILED | 2 ตัว, duration 0s | CONFIRMED (screenshot) |
| drainNotiQueue รันคาบเกี่ยว | 14:38:57, 5.563s | CONFIRMED (screenshot) |
| keepWarm_ รันคาบเกี่ยว | ไม่เห็นในหน้านี้ | UNKNOWN (อาจอยู่หน้าอื่น — trigger ทุก 5 นาที §7) |

**สิ่งที่ screenshot ตอบไม่ได้ (ต้องเปิด execution detail / Logs)**: cache HIT/STALE/MISS, lock
wait/hold, resolveSession double-resolve, ZORT/Drive latency, exception ของ doPost ที่ FAILED,
concurrency ที่แท้จริง (screenshot คือ page 2 — เห็นไม่ครบ)

---

## 4. Concurrency Evidence

- **STRONG EVIDENCE**: มี doGet ≥5 ตัวเริ่ม **วินาทีเดียวกัน** (14:39:28) → มีการเปิด/poll พร้อมกันจริง
- **STRONG EVIDENCE**: duration ไล่ระดับ (4.8 / 5.9 / 14.9 / 22.4 / 30.4s) = pattern ของ **serialization /
  queueing** ไม่ใช่ backend latency คงที่ · เข้ากับสถาปัตยกรรม single-flight build-lock:
  - `doGet` (บรรทัด 3077/3099) คว้า `acquireBuildLock_(0)` → คว้าไม่ได้ + มีของสำรอง = เสิร์ฟ STALE (เร็ว) ·
    คว้าไม่ได้ + ไม่มีของสำรอง (หรือ `fresh=1`) = **รอคิว `_BUILD_LOCK_WAIT_MS`** แล้วอาจ build เอง (ช้า)
  - `acquireBuildLock_` ใช้ **user-lock** (deploy แบบ `executeAs: USER_DEPLOYING` → ทุก doGet รันในฐานะ
    เจ้าของคนเดียว) = ล็อกร่วมของ doGet ทุกตัว → ถ้าคนแรก build (~10s) คนที่ตามมาที่ต้อง build เองจะรอ
- **HYPOTHESIS (ยังไม่ยืนยัน)**: burst นี้อาจตรงกับจังหวะ **cache MISS พร้อมกัน** (หลัง TTL หมด /
  หลังมีคนเขียนข้อมูล → `invalidateCache_`) ซึ่งเป็นเงื่อนไขที่ Phase 7.3 อธิบายว่าทำให้เกิด stampede
- **UNKNOWN**: concurrency สูงสุดจริง (GAS มีเพดาน ~30 simultaneous execution/user) — screenshot หน้าเดียว
  พิสูจน์ไม่ได้ว่าชนเพดานหรือไม่ (นี่คือ RC-1 ของ audit เดิม — ต้องใช้ metric ① จาก `[perfB]`)

**ต้องการเพื่อยกเป็น CONFIRMED**: metric ① `maxConcurrency` + metric ⑦ cache mix จาก `perf-report.mjs`
(STALE เยอะ = เส้นกันได้ดี · MISS/FRESH เยอะพร้อมกัน = build ทับกันจริง)

---

## 5. doGet Latency

| doGet | duration | การตีความ (ยังไม่ยืนยัน) |
|---|---|---|
| 14:38:40 | 17.609s | ช้าเดี่ยว ๆ ก่อน burst หนา — อาจ build เอง / cold container |
| 14:39:28 | 30.416s | ตัวช้าสุด — ผู้ที่ตกไป path "build เองหลังรอคิว" (HYPOTHESIS) |
| 14:39:28 | 22.356s | คิวถัดลงมา |
| 14:39:28 | 14.851s | คิวถัดลงมา |
| 14:39:28 | 4.846 / 5.857s | ผู้ที่ได้ STALE/HIT เร็ว (HYPOTHESIS) |

- ช่วง 4.8–30.4s **ใกล้เคียง** ช่วง doGet 13–30s ของ incident เดิม (§9) — **แต่ยังต่ำกว่า** ตัวเลข
  loadtest PHASE0 (มัธยฐาน 41–52s, ช้าสุด 115s) ที่วัด "ก่อนแก้ Phase 7.3–7.4" · ตีความว่าอาจเป็น
  "อาการเดิมที่เบาลงแล้วแต่ยังไม่หาย" — **HYPOTHESIS เท่านั้น** (ไม่มี cache-mix มายืนยัน)
- ⚠️ ตัวเลขเหล่านี้คือ **เวลาที่ Executions บันทึก = เวลาที่ script ใช้จริง** (ต่างจาก 404 ที่ browser เห็น
  ในบทเรียน Phase 7.4 ซึ่งรวมขั้นดาวน์โหลด) — ดังนั้น latency นี้เกิด **ในฝั่ง GAS** จริง ไม่ใช่ท่อ
  ดาวน์โหลด · ต้องแยกต่อว่า "รอคิว build" หรือ "build เอง" หรือ "รอ resolveSession/ZORT/Drive" — **ต้อง `[perfB]`**

---

## 6. doPost Failures

**2 ตัว: 14:38:52 (0s, FAILED) · 14:38:58 (0s, FAILED)** — Priority #1 และ #2

**สิ่งที่ยืนยันได้จากโค้ด (production b7e5f1e)**:
- `doPost(e)` บรรทัด 2446: **บรรทัดแรกสุด**เรียก `perfReqBegin_('doPost')` — **ก่อน** `try { JSON.parse(...) }`
- `perfReqEnd_()` อยู่ใน `finally` (บรรทัด 2759) → **ถ้า body เข้าและ finally ทำงาน จะมีทั้ง START และ END**
- catch (บรรทัด 2752) เรียก `console.error("doPost Error:", error)` แล้วคืน JSON `{success:false,...}` (ไม่ throw ออก)

**ผลลัพธ์เชิงตรรกะ (ยังไม่ยืนยันด้วย log จริง)**:
- ถ้า execution **เข้า body**: ต้องมี `[perfB] START kind=doPost` และ (ปกติ) `[perfB] END ...` เพราะ
  finally รันเสมอใน JS · การ catch คืน `{success:false}` = **สำเร็จในสายตา GAS** (ไม่ใช่ FAILED) →
  ดังนั้น **"FAILED + 0s" ไม่น่าใช่ exception ที่ถูก catch ปกติ**
- "0s + FAILED" จึงชี้ไปทาง **ล้มเหลวก่อน/ระหว่างเข้า body** เช่น: request ถูกตัด (client cancellation),
  execution ถูก kill, หรือ error ระดับ runtime ก่อน user code — กรณีพวกนี้ **จะไม่มี `[perfB]` เลย**
- ⚠️ **ห้าม assume ว่า "0s" = backend ทำงาน 0 วินาที** — Executions ปัด/บันทึกเป็น 0s ได้ทั้งกรณี
  fail ที่ dispatch, cancel, และ startup failure · ต้องเปิด execution detail

**ต้องตรวจจาก execution detail ของ 2 ตัวนี้** (§8):
1. มี **exception / error message** หรือไม่ (แดงเพราะ throw จริง vs ถูกตัด)
2. Logs panel **มี `[perfB] START kind=doPost` ไหม** → มี = เข้า body แล้ว (fail หลัง perfReqBegin_) ·
   ไม่มี = fail **ก่อน** perfReqBegin_ (dispatch/cancel/startup)
3. เป็น **client cancellation** (พนักงานปิด/รีเฟรช/เน็ตหลุดกลางคัน) vs **GAS execution failure** จริง

**ป้าย: ROOT CAUSE ของ doPost FAILED = UNKNOWN** (มีสมมติฐานหลายทาง แยกไม่ได้จนกว่าจะเปิด detail)

---

## 7. `[perfB]` Evidence

### 7.1 มี instrumentation ใน production หรือไม่ — **CONFIRMED: มี**

- `[perfB]` ถูกเพิ่มโดย commit **`f3e5956`** ("Phase B: backend observability", 2026-08-20)
- อยู่ใน master และใน **production version ปัจจุบัน `b7e5f1e`** (`git show b7e5f1e:appsscript_complete.gs | grep -c perfB` = 7)
- **wiring ครบ** (บรรทัดใน b7e5f1e):
  - `doPost`: `perfReqBegin_` (2446) → `perfReqAction_` (2504) → `perfReqEnd_` ใน finally (2759)
  - `doGet`: `perfReqBegin_('doGet', action)` (2764) → `perfReqEnd_` (3173)
  - `perfSess_` (552, ใน `resolveSession_` → ตรวจ **DOUBLE-RESOLVE**)
  - `perfLock_` — `punch` (1412), `transferStock` (3445/3471), `transferBatch` (4230/4360), `saleBill` (14796/14984)
  - `perfZort_` — `AddTransfer` (4516/4521), `GetProducts` (7156/7159)
  - `perfDrive_` — `attPhoto` (1332/1336)
  - metric ⑦ cache-mix: `perfLogDoGet_` → `[perf] doGet HIT|STALE|FRESH|MISS variant=… รวม=…ms ส่ง=…KB` (16203)
- instrumentation เป็น **log-only + fail-safe** (Logger.log เท่านั้น, ห่อ try/catch, ไม่เขียนชีต/Property/Cache
  บน hot path) → **ไม่ใช่สาเหตุของ latency เอง** และปล่อยไว้ถาวรได้ (ตาม `docs/HANDOFF-BACKEND-OBSERVABILITY.md`)

### 7.2 log ของรอบ 25/08 อยู่ที่ไหน — **ต้องเปิดจาก GAS Executions UI (เอกสารนี้เปิดให้ไม่ได้ — §11)**

`[perfB]` ออกทาง `Logger.log` → ปรากฏใน **Logs panel ของแต่ละ execution** ใน Apps Script Executions UI
(retention จำกัด — ต้องรีบเก็บ) · Cloud Logging ประวัติใช้ไม่ได้ (default GCP project) ตามข้อจำกัดเดิม

### 7.3 ลำดับ execution ที่ควรเปิดก่อน + ต้องการ log อะไรจากแต่ละตัว

| ลำดับ | execution (BKK) | เปิดหา log อะไร | ตอบคำถาม |
|---|---|---|---|
| **1** | doPost 14:38:52 (0s FAILED) | **มี `[perfB] START kind=doPost` ไหม** + error message ในหัว execution | fail ก่อน/หลัง perfReqBegin_ · client-cancel vs GAS-fail (§8) |
| **2** | doPost 14:38:58 (0s FAILED) | เหมือน #1 | ยืนยันว่าเป็น pattern เดียวกับ #1 หรือคนละแบบ |
| **3** | doGet 14:39:28 **30.416s** | `[perfB] START/END` (durMs, sessN, sessMs, lock=…) + `[perf] doGet …` (HIT/STALE/FRESH/MISS) + `[perfB] LOCK`/`ZORT`/`DRIVE` | ตัวช้าสุดเสียเวลาไปกับ **build / คิว lock / session / ZORT / Drive** ตัวไหน |
| **4** | doGet 14:39:28 **22.356s** | เหมือน #3 | เทียบกับ #3 — คิวลดหลั่นจริงไหม |
| **5** | doGet 14:39:28 **14.851s** | เหมือน #3 | จุดตัดระหว่าง "รอคิว" กับ "ได้ STALE" |
| **6** | doGet 14:38:40 **17.609s** | เหมือน #3 (ตัวช้าก่อน burst หนา) | cold container / build เดี่ยว ๆ ก่อนพีค |
| 7 | doGet เร็ว 14:39:28 (4.846 / 5.857s) | `[perf] doGet …` (คาดว่า STALE/HIT) | ยืนยันว่าคนเร็ว = ได้ของสำรอง (เส้นกันทำงาน) |
| 8 | drainNotiQueue 14:38:57 (5.563s) | (ไม่มี `[perfB]` — ไม่ผูก perfReqBegin_) ดู Logs ปกติ | trigger เบื้องหลังกินเวลา/lock ช่วง burst ไหม (§ก่อนสรุป root cause ต้องมี evidence) |

### 7.4 วิธีวิเคราะห์เมื่อได้ log

คัดทุกบรรทัด `[perfB]` และ `[perf] doGet` ในช่วง 14:38–14:40 (จากทุก execution ที่เปิด) ใส่ไฟล์เดียว เช่น
`burst-2026-08-25.log` แล้วรัน:

```
node scripts/perf-report.mjs burst-2026-08-25.log
```

ได้ 7 metrics: ① concurrency max · ② lock wait/hold (ต่อ tag) · ③ action+duration · ④ session count/DOUBLE-RESOLVE ·
⑤ ZORT p50/max/retries · ⑥ Drive p50/max · ⑦ cache mix (HIT/STALE/FRESH/MISS)

---

## 8. ตรวจ failed doPost เป็นพิเศษ (Priority #1, #2)

เปิด execution detail ของ **14:38:52** และ **14:38:58** แล้วบันทึกทีละข้อ (ห้าม assume):

1. **Exception**: มี stack/error ในหัว execution ไหม? เป็น error อะไร (เช่น `Cannot read properties of
   undefined (reading 'contents')` = `e.postData` ว่าง / body malformed → JSON.parse ล้ม **ใน** try →
   ถูก catch → คืน `{success:false}` = ปกติจะ **ไม่** ขึ้น FAILED · ถ้าขึ้น FAILED แปลว่าคนละสาเหตุ)
2. **เข้า doPost ไหม**: Logs มี `[perfB] START kind=doPost` หรือไม่
   - **มี** → เข้า body แล้ว → fail **หลัง** perfReqBegin_ (ดูว่ามี END ไหม, action อะไร)
   - **ไม่มี** → fail **ก่อน** perfReqBegin_ = dispatch/startup/cancel (perfB มองไม่เห็นโดยธรรมชาติ)
3. **ก่อน/หลัง perfReqBegin_**: สรุปจากข้อ 2
4. **client cancellation vs GAS failure**: 0s + ไม่มี log + ไม่มี exception ที่มีความหมาย = โน้มไป
   **client ตัดการเชื่อมต่อ** (พนักงานปิด/รีเฟรช/เน็ตร้านหลุด) · มี exception จริง = **GAS failure**
5. **HTTP/backend error**: มีร่องรอย response code / "Service invoked too many times" / quota /
   "Exceeded maximum execution time" ไหม

> จำไว้: doPost 14:38:30 (5.429s, สำเร็จ) พิสูจน์ว่า write path **ทำงานได้** ในช่วงเดียวกัน →
> การ FAILED ของอีก 2 ตัวเป็น **เหตุการณ์เฉพาะตัว** ไม่ใช่ "doPost ล่มทั้งระบบ"

**ป้าย: UNKNOWN จนกว่าจะเปิด detail** · สมมติฐานที่เปิดอยู่ (ยังไม่เลือก): client-cancel · simultaneous-
execution rejection ของ GAS (เคยเป็นต้นเหตุ "GAS ตอบ HTML" ในบทเรียนข้อ 13) · startup/quota failure

---

## 9. Comparison with Previous Incident (Backend Stability Audit v1)

อ้างอิง: `docs/HANDOFF-BACKEND-OBSERVABILITY.md` — incident เดิมคือ **auth:me ช้า 14.4–64.2s · doPost
ค้าง 298.6s · doGet 13–30s · stale banner ซ้ำ** พร้อม root-cause candidates RC-1..RC-5

| มิติ | Incident เดิม (audit v1) | Incident 25/08 (นี้) | เทียบ |
|---|---|---|---|
| auth/session | auth:me 14.4–64.2s (RC-3 resolveSession writes) | **ไม่มีข้อมูล** — screenshot ไม่แยก action | UNKNOWN (ต้อง metric ④) |
| concurrent doGet | doGet 13–30s, stampede | doGet 4.8–30.4s, burst 14:39:28 | **คล้ายมาก** — STRONG EVIDENCE แต่ยังไม่ CONFIRMED |
| doPost failure | doPost **ค้าง 298.6s** (RC-5 syncZortNow / RC-4 ZORT-bound) | doPost **0s FAILED** | **คนละลายเซ็น** (hang ยาว vs fail ทันที) |
| global script lock | write lock contention | ไม่เห็นในหน้านี้ | UNKNOWN (ต้อง metric ②) |
| ZORT | RC-4 ZORT ช้า/ค้าง | ไม่เห็น | UNKNOWN (ต้อง metric ⑤) |
| Drive | RC-2 upload คร่อม punch lock | ไม่เห็น | UNKNOWN (ต้อง metric ⑥) |
| cache | MISS พร้อมกัน (RC-1) | ไม่เห็น (screenshot) | UNKNOWN (ต้อง metric ⑦) |
| execution quota | RC-1 ชนเพดาน ~30 exec | burst จริง ≥5/วินาที | STRONG EVIDENCE ว่ามี burst, เพดาน = UNKNOWN |

**คำตอบข้อ 6 (เลือก A/B/C/D):**
- ส่วน **concurrent doGet latency** → **B — มี pattern คล้าย incident เดิมแต่หลักฐานยังไม่พอ**
  (duration ไล่ระดับ + burst = ลายเซ็น stampede/queue เดิม แต่ไม่มี cache-mix/lock/concurrency มายืนยัน)
- ส่วน **doPost 0s FAILED** → **C/D — น่าจะเป็นคนละ failure mode จาก doPost ค้าง 298.6s ของเดิม**
  (298.6s = ทำงานจริงจนค้าง = ZORT/lock-bound · 0s FAILED = ไม่ทันได้ทำงาน) **แต่ยังระบุไม่ได้ (D)**
  จนกว่าจะเปิด execution detail
- **ภาพรวม incident = B เป็นหลัก** โดยมีชิ้นส่วน doPost ที่อาจเป็น failure mode ใหม่ (C) รอยืนยัน

---

## 10. Confirmed / Strong Evidence / Hypothesis / Unknown

**CONFIRMED**
- Production version ณ 25/08 ~14:38 = commit **`b7e5f1e`** — deploy โดย GitHub Actions run
  `32700698655` (workflow "Deploy to Google Apps Script"), **success**, 2026-08-24 14:15:23 (+07);
  **ไม่มี deploy `.gs` อีกเลย**ระหว่างนั้นถึงเวลาเกิดเหตุ
- `[perfB]` instrumentation (7 จุด + metric wiring ครบ) **อยู่ใน production version นั้นจริง** (commit `f3e5956`)
- workflow `deploy-gas.yml` ทำ `clasp push` **และ** `clasp deploy --deploymentId …` (redeploy /exec เดิม) →
  โค้ดใหม่เสิร์ฟจริง (run #190 success, ไม่พบ error 200-version-limit)
- เกิด burst จริง: doGet ≥5 ตัวเริ่มวินาทีเดียว 14:39:28; doGet ช้าสุด 30.416s; doPost 2 ตัว 0s FAILED
  (ทั้งหมดจาก screenshot)
- trigger `drainNotiQueue` (ทุก 1 นาที) รันคาบเกี่ยว burst (14:38:57, 5.563s); `keepWarm_` ตั้ง trigger
  **ทุก 5 นาที** (โครงสร้าง) → มีโอกาสสูงที่รันในหน้าต่าง 14:35/14:40

**STRONG EVIDENCE**
- doGet latency ไล่ระดับ (4.8→30.4s) = **serialization/queueing** มากกว่า backend-latency คงที่ →
  เข้ากับ single-flight build-lock (user-lock ร่วมของ doGet ทุกตัว)
- อาการฝั่งผู้ใช้ ("หมุนนานตอนใช้พร้อมกัน") = ตรงกับ doGet latency ที่วัดได้ในฝั่ง GAS (ไม่ใช่แค่ท่อ download)

**HYPOTHESIS**
- burst เกิดในจังหวะ cache MISS พร้อมกัน (หลัง TTL/invalidateCache_) → build stampede เบา ๆ (Phase 7.3 pattern)
- doPost 0s FAILED = client cancellation หรือ simultaneous-execution rejection ของ GAS
- keepWarm_/drainNotiQueue แย่ง execution slot หรือ build-lock กับ user request

**UNKNOWN**
- concurrency สูงสุดจริง / ชนเพดาน ~30 exec หรือไม่ (metric ①)
- lock wait/hold ช่วง burst (metric ②) · resolveSession count/DOUBLE-RESOLVE (metric ④)
- ZORT latency (⑤) · Drive latency (⑥) · cache HIT/STALE/MISS mix (⑦)
- action จริงของ doGet ช้า/doPost FAILED · สาเหตุ 0s FAILED
- สถานะ flag ตอนนั้น (`INAPP_NOTI_ENABLED`, `PRODUCT_OWNER_ENABLED`, `REQUIRE_LOGIN`) และจำนวนแถว
  ชีต "เซสชัน"/"ลงเวลา" (ตัวคูณของ RC-3) — ยังไม่เก็บ

---

## 11. Immediate Risk

- **หลักฐาน `[perfB]` ของรอบนี้มีอายุจำกัด** — Logs ของ execution ใน Apps Script UI ถูกหมุนทิ้งตามเวลา ·
  **ความเสี่ยงสูงสุดตอนนี้คือ "หลักฐานหาย"** ถ้าไม่รีบเปิด 6 execution ใน §7.3 แล้ว copy `[perfB]` ออกมา
  → ถ้าหายจะเหลือแค่ screenshot (ระดับ Executions) ซึ่งพิสูจน์ root cause ไม่ได้
- **ข้อจำกัดของเซสชันนี้ (ตรงไปตรงมา)**: เอกสารนี้ทำจาก **repo + git + GitHub Actions + screenshot เท่านั้น** ·
  **เข้าถึง GAS Executions Logs / Cloud Logging ของ production ไม่ได้** → **ยังยืนยัน root cause runtime ไม่ได้
  จากที่นี่** · ต้องให้เจ้าของ/ผู้มีสิทธิ์เปิด GAS UI เก็บ log ตาม §7.3
- ผู้ใช้ยังเจออาการซ้ำได้ทุกครั้งที่เปิดพร้อมกันหนา ๆ (เช้า/หลังมีคนบันทึกข้อมูล) จนกว่าจะยืนยันสาเหตุ
- doPost FAILED = **ผู้ใช้บางคนกด "บันทึก/สั่ง/ลงเวลา" แล้วไม่สำเร็จจริง** — ต้องดูว่าเป็น action เขียนเงิน/
  สต็อกหรือไม่ (ถ้าใช่ = เสี่ยงงานหาย/กดซ้ำ) · idempotency (`cid`/`tid`/`billCid`) กันซ้ำได้เฉพาะ action
  ที่มี key เท่านั้น

---

## 12. Recommended Next Investigation (ยังไม่ใช่ fix)

**ทำทันทีก่อนหลักฐานหาย** (เจ้าของ/ผู้มีสิทธิ์เปิด GAS Editor):
1. เปิด **6 execution ตาม §7.3** (Priority 1→6) → copy บรรทัด `[perfB]` และ `[perf] doGet` ในหน้าต่าง
   14:38–14:40 ลงไฟล์ `burst-2026-08-25.log` (รวมทุก execution ในไฟล์เดียว)
2. สำหรับ **doPost 14:38:52 / 14:38:58**: บันทึกตาม checklist §8 (exception? มี `[perfB] START`? 0s แปลว่าอะไร)
3. จดสถานะ **flag** (`INAPP_NOTI_ENABLED`, `PRODUCT_OWNER_ENABLED`, `REQUIRE_LOGIN`) และจำนวนแถวชีต
   "เซสชัน"/"ลงเวลา" ณ ตอนนี้ (ตัวคูณของ RC-3 จาก audit เดิม)
4. เปิดหน้า Executions **หน้าอื่น** (screenshot เป็นหน้า 2) หา `keepWarm_` / `syncZortBoth` / `backfillZortOrders`
   ที่รันในหน้าต่าง 14:35–14:45 → ดูว่ามี trigger เบื้องหลังกินเวลา/ชน build-lock จริงไหม

**วิเคราะห์**:
5. รัน `node scripts/perf-report.mjs burst-2026-08-25.log` → อ่าน 7 metrics
6. สรุปทับตาราง §9/§10: ถ้า ⑦ cache mix = MISS/FRESH เยอะพร้อมกัน + ① concurrency สูง → ยก RC "build
   stampede" จาก STRONG EVIDENCE เป็น CONFIRMED · ถ้า ② lock hold สูงที่ `punch`/`saleBill`/`transferBatch`
   หรือ ⑤ ZORT/⑥ Drive สูง → ชี้ไป RC-2/RC-4 เดิม · ถ้า doPost FAILED ไม่มี `[perfB] START` → สรุปเป็น
   client-cancel/dispatch (คนละ mode กับ 298.6s เดิม)

**ยังไม่ทำในรอบนี้ (ตามคำสั่ง)**: ไม่เสนอ code fix · ไม่ Phase C · ไม่แตะ lock/cache/retry/session/LINE ·
เลือกก้อนแก้ (F1→F7 ใน audit) **หลัง**เห็นตัวเลข burst จริงเท่านั้น

---

### ภาคผนวก — หลักฐาน version/deploy (สำหรับตรวจซ้ำ)

- `origin/master` tip: `b7e5f1e` — "Merge pull request #101 … Realtime Stock Count" (2026-08-24 14:15 +07)
- commit `.gs` ล่าสุดก่อน incident: `b3b443b` "Realtime Stock Count" (2026-08-23) → trigger deploy run #190
- deploy runs (workflow `deploy-gas.yml`, ทั้งหมด success): #190 `b7e5f1e` (24 ส.ค. 14:15), #189 `f0a6b14`
  (22 ส.ค.), #188 `da7ebf8` (21 ส.ค.), #187 `f35d282` (21 ส.ค.), #186 `3339fc3` (20 ส.ค.)
- `[perfB]` เข้า master ตั้งแต่ run #184 (`11b4287`, 20 ส.ค.) / โค้ดจริง `f3e5956`
- เครื่องมือ: `scripts/perf-report.mjs` (offline, `node scripts/perf-report.mjs <logfile>`), spec ใน
  `docs/HANDOFF-BACKEND-OBSERVABILITY.md`
