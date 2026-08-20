# Phase A1 — ใบวัดผล Production (pv=3 Columnar Payload)

คู่กับ `docs/PHASE0-RESULTS.md` (baseline ก่อน A1) และ `docs/PLAN-PHASE8-PAYLOAD.md`
(แผนแม่ที่ A1 เป็นก้อนแรก) · วัดจาก **production จริง** (`dmj-inventory-dashboard.pages.dev` +
GAS deploy จริง) ไม่ใช่ estimate — เก็บเลขวันที่ 19 ส.ค. 2026

**สถานะ: 🟢 A1 PASS — หยุด payload optimization ต่อ**

---

## 1. Production Verification

| ข้อ | ผล |
|---|---|
| master merge สำเร็จ | ✅ `ab9a793` (รวม `ae0c228` Phase A1 + `5de1e85` blocker fix) |
| Deploy Google Apps Script | ✅ สำเร็จ 07:17-07:18 UTC (GitHub Actions) |
| Frontend production ใช้ pv=3 | ✅ ยืนยันจาก BootTrace หลายรอบ + load test |
| GAS production รองรับ+ตอบ pv=3 | ✅ ยืนยันจาก load test หลายรอบ, payload variant ถูกต้องตาม role |
| pv=2 fallback ยังอยู่ในโค้ด | ✅ อยู่ในโค้ด (ไม่ได้ยิงทดสอบเทียบสดในรอบนี้) |

## 2. Payload: Before → After

| Variant | Before (baseline, PHASE0) | After (A1, pv=3) | ลดลง |
|---|---|---|---|
| full (owner/dev) | 4,576 KB | 2,742-2,743 KB | **~40%** |
| ops (employee) | 4,382 KB | 2,544-2,545 KB | **~42%** |
| lite (frontstore/saler/warehouse) | 4,200 KB | 2,362-2,363 KB | **~44%** |

## 3. Server / Client Latency: Before → After

- Baseline `buildFullData_()` เดี่ยว ๆ (Phase 0): 9,807 ms
- Production หลัง A1 (BootTrace, backend นิ่งแล้ว): `payload:ไบต์แรก` 2.9-15.1 วิ,
  ดาวน์โหลดหลังไบต์แรก **364-612 ms สำหรับ ~3.2MB คงที่ทุกรอบ** (ไม่ใช่คอขวด)
- ไม่มี GAS-side build/shape/cache breakdown แยกจาก production log ของรอบนี้ (Executions
  ไม่ label HIT/MISS) — เป็นช่องว่างที่เหลืออยู่ ดู §7

## 4. 15-Concurrent Load Test (`tests/loadtest.html`, pv=3, role mix)

| เวลา | Scenario | Success | Fail | มัธยฐาน | ช้าสุด | หมายเหตุ |
|---|---|---|---|---|---|---|
| baseline (PHASE0) | — | 10/15 | 5/15 (404) | 41-52 วิ | 115 วิ | ก่อน A1 |
| 17:25 | ทั่วไป | 7/15 | 8/15 (404) | — | 21.7 วิ | **ระหว่าง backend incident** ดู §6 |
| 17:50 | ทั่วไป | 15/15 | 0 | 6.3 วิ | 15.2 วิ | backend นิ่งแล้ว |
| 18:06 | อ้าง stampede | 14/15 | 1 (network blip, ไม่ใช่ 404) | 4.9 วิ | 36.4 วิ | ไม่ reproduce ซ้ำ |
| — | เปิดเว็บ | 15/15 | 0 | 3.9 วิ | 13.6 วิ | |
| — | **สั่งของแล้วยิงทันที (stampede แท้)** | **15/15** | 0 | 3.3 วิ | 12.3 วิ | เกณฑ์ยากสุดในแผน — ผ่านสมบูรณ์ |
| — | ยิงตอนกำลังเข้าเว็บ | 15/15 | 0 | 3.5 วิ | 21.4 วิ | |

**รวม 4 รอบหลัง backend นิ่ง: 74/75 สำเร็จ (98.7%)** ตัวที่ล้มเหลว 1 ครั้ง (18:06) เป็น
network-level ("Load failed", HTTP 0) ไม่ใช่ 404 จาก server และไม่ reproduce ซ้ำในรอบถัดมา
รวมถึงรอบ stampede แท้ (เขียนข้อมูลจริงแล้วยิงทันที) ที่ผ่าน 15/15 สมบูรณ์

## 5. Data Integrity

✅ **ผ่าน** — เช็คกรณี `doPost` ที่ค้าง 298.6 วิ แล้วขึ้นสถานะ "ไม่รู้จัก" (ดู §6) แล้วไม่พบ
ข้อมูลหาย/ซ้ำใน Audit Log หรือชีตที่เกี่ยวข้อง

## 6. ⚠️ Backend Instability Incident — แยกออกจาก A1 อย่างชัดเจน

ช่วง 16:04-17:25 น. วันเดียวกัน พบปัญหาต่อเนื่อง**ไม่เกี่ยวกับ A1**:
- `auth:me`/`auth-done:me` ช้าผิดปกติ (14.4-64.2 วิ ต่อครั้ง จากปกติควรหลักร้อย ms)
- `claimLoginHandoff` ยิงถี่ผิดปกติ (กลไกกู้ล็อกอินทำงานบ่อยกว่าที่ควร)
- GAS Executions log พบ `doPost` ค้าง 298.6 วิ สถานะ "ไม่รู้จัก" (Google เองก็ยืนยันผลไม่ได้)
- `doGet` หลายรายการช้า 13-30 วิ เป็น cluster ช่วงเดียวกัน
- แถบเหลือง stale-while-rebuild ขึ้นซ้ำ ๆ (บ่งชี้ cache miss/build ไม่ทันต่อเนื่อง)

**เหตุผลที่แยกจาก A1**: payload ที่ดาวน์โหลดสำเร็จระหว่าง incident ก็ยังคงขนาดปกติ
(3,193-3,194 KB) และเร็ว (364-612 ms) — ตัวที่ช้า/ล้มเหลวคือชั้น auth และชั้น build+cache
ของ backend ไม่ใช่ชั้น payload encoding ที่ A1 แตะ · backend ฟื้นตัวเองระหว่าง 17:25-17:50
โดยไม่มีการแก้โค้ดใด ๆ ในช่วงนั้น

**ไม่ได้สืบสาเหตุจบในรอบนี้** — เป็น scope ของงานถัดไป (การไล่ observability/stability ของ
GAS backend แยกต่างหาก) **ยังไม่เริ่มงานนั้นในรอบนี้**

## 7. Observation (ไม่ใช่ blocker) — `owner`/full variant ช้ากว่าเพื่อนสม่ำเสมอ

ทุกรอบ load test หลัง backend นิ่ง มี **1 request ที่ช้าผิดปกติ (12-21 วิ) แต่ยังสำเร็จ
(HTTP 200 JSON) เสมอ** — ส่วนใหญ่คือ role `owner` (variant `full`, ใหญ่สุด) บางรอบเป็น
`employee` (variant `ops`)

**สมมติฐาน**: `rolesFor()` ใน loadtest.html ยิง `owner` แค่ 1 ครั้ง/ชุด (เทียบ
frontstore/saler/warehouse ที่ share variant `lite` เดียวกันและปรากฏ ~3 ครั้ง/ชุด จึงอุ่น
cache ให้กันเองภายในชุดยิงเดียวกัน) → variant `full`/`ops` มีโอกาส cache-miss สูงกว่า
ไม่ใช่บั๊ก เป็นพฤติกรรมที่คาดได้ตามสถาปัตยกรรม cache-per-variant · **บันทึกไว้เป็น
observation สำหรับติดตาม ไม่ใช่ตัวบล็อก A1 PASS**

## 8. Missing / ยังไม่ได้วัด

- **Attendance burst**: ไม่มีข้อมูล — ไม่มีช่วงเข้า/ออกงานจริงเกิดขึ้นระหว่างวัดผล และไม่ได้
  สร้าง transaction เทียมตามที่ตั้งใจไว้ (ไม่กระทบ verdict หลัก — แนะนำเก็บข้อมูลจริงในรอบ
  เข้า/ออกงานถัดไป)
- **Cache HIT/MISS/STALE/WAIT-HIT ratio ที่แม่นยำ**: Executions log ไม่มี label แยก
  ต้องเพิ่ม log statement ถ้าต้องการตัวเลขนี้ในอนาคต (นอก scope รอบนี้ — ห้ามแก้โค้ด)

## 9. Verdict

### 🟢 A1 PASS

- Payload เล็กลงจริง 40-44% ทุก variant
- 404 หายไปหมดเมื่อ backend ปกติ (0/60 requests ใน 4 รอบหลัง incident)
- **15/15 success ในรอบ cache-stampede จริง** (เกณฑ์ยากสุดที่ตั้งไว้ — เขียนข้อมูลจริงแล้ว
  ยิงทันที)
- Latency ดีขึ้นมหาศาล: มัธยฐาน 41-52 วิ → 3.3-6.3 วิ, ช้าสุด 115 วิ → 12-21 วิ (เฉพาะ role
  ที่ cache ยังไม่อุ่น แต่ก็ยังสำเร็จ ไม่ล้มเหลว)
- Data integrity ผ่าน

**Decision**: หยุด payload optimization เพิ่มเติมตามเกณฑ์ที่ตั้งไว้เอง — **ไม่เริ่ม A2/A3/A4,
Phase 8 ส่วนที่เหลือ, Supabase migration, หรือแก้ cache strategy ใด ๆ**

## 10. งานถัดไป (ยังไม่เริ่มในรอบนี้)

การไล่สาเหตุ backend instability (§6) + วาง observability ให้เห็น cache HIT/MISS/build
duration แยกชัดใน production — เป็น**งานแยกต่างหาก**จาก A1 โดยสิ้นเชิง ต้องเปิด session/
งานใหม่เพื่อทำ (session นี้เป็นการวัดผลอย่างเดียว ไม่แก้โค้ด)
