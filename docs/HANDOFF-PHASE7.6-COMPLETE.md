# HANDOFF — Phase 7.6 ล็อกอิน rollout: **เสร็จครบ A–E · deployed แล้ว** (ส.ค. 2026)

เอกสารนี้ = สรุปปิดงาน Phase 7.6 (การทำให้ล็อกอิน "ไม่ค้าง/ไม่วน" ทนขึ้น) ที่เอากลับมา
ทีละก้อนหลังเคยถูก revert · แทนที่สถานะ "ยังไม่ deploy" ในเอกสารเก่าทั้งหมด
ดูตารางย่อใน `CLAUDE.md` หัวข้อ "Phase 7.6" · แผน/บริบทเดิม: `docs/HANDOFF-LOGIN-PERF.md`

---

## บริบท — ทำไมงานนี้เสี่ยง

7.6 เดิมเขียนโค้ดครบแล้วในคอมมิตหนึ่ง แต่ **ถูก revert เพราะขึ้น production แล้วพนักงานเข้าแอป
ไม่ได้ทั้งร้าน** · ตอนนั้นขึ้นพร้อมกัน 3 ก้อนแยกไม่ออกว่าอะไรพัง จึงถอยทั้งชุด · หลักฐานชี้ว่า
ตัวที่ทำร้านล่มคือ **timeout/abort ใน `postAuthAction` ที่ตัดคำขอช้าทิ้ง** (เน็ตร้าน/GAS cold start
ช้าเกิน timeout → คำขอถูก abort → escalate เป็น logout/clear-session → เข้าไม่ได้ทั้งร้าน)

รอบนี้เอากลับ **"ปลอดภัยก่อน → เสี่ยงท้าย" ทีละก้อนพร้อมเทสต์** ไม่ยกทั้งชุดซ้ำรอยเดิม
โดยก้อนเสี่ยงสุด (E = timeout) แยกไว้ท้ายสุด + ให้เจ้าของเทสต์ iPhone จริงก่อน merge

> ⚠️ **state machine ล็อกอิน (`checking/needLogin/pending/disabled/ready`) + handoff flow อยู่ใน
> master มาตลอด** — การ revert ถอดแค่ส่วน hardening ไม่ใช่ทั้งระบบ · เอกสารเก่าเขียน "ยังไม่
> deploy" ผิด · **ตรวจจากโค้ดจริงเสมอ อย่าเชื่อ SHA ที่อ้างในเอกสาร** (squash merge ทำให้ SHA เปลี่ยน)

---

## สิ่งที่ทำ (A–E) — ทั้งหมด deployed เข้า master แล้ว

| ก้อน | ไฟล์ | สาระ |
|---|---|---|
| **A** จอ checking มีทางออก | `app.jsx` (`CheckingScreen`) | สปินเนอร์เปล่าเดิม → นับวินาที · เตือน "ช้ากว่าปกติ" ที่ 12 วิ · ปุ่ม "กลับไปหน้าล็อกอิน" ที่ 30 วิ · `onGiveUp` ลบ `?code=`/`state` จาก URL กัน effect แลก code ยิงซ้ำ · **ไม่ตัดคำขอที่ค้าง** |
| **B** handoff ไม่ถูกกินทิ้งถาวร | `appsscript_complete.gs` (`claimLoginHandoffHandler_`) | เดิม `cache.remove` ทันทีที่อ่านเจอ → คำตอบหายกลางทาง = token หายถาวร วนล็อกอินไม่จบ · เปลี่ยนเป็นเขียนทับด้วย TTL สั้น `LOGIN_HANDOFF_CLAIM_GRACE_SEC=60` (retry ที่หลุดแลกคืนได้ · idempotent เพราะ secret อยู่เฉพาะเครื่อง PWA เดียว) |
| **C** poll backoff + TTL 30 นาที | `app.jsx` (effect poll) + `.gs` | poll `claimLoginHandoff` เดิมคงที่ 4 วิ → backoff 4วิ×3→8→15 (cap) + in-flight guard เดิม · onWake (visibilitychange/focus) รีเซ็ตความถี่ · TTL 15→30 นาที: `LINE_HANDOFF_TTL_MS` (app.jsx) + `LOGIN_HANDOFF_TTL_SEC=1800` (.gs) — client ต้องไม่เกิน server |
| **D** resolveSession_ cache | `appsscript_complete.gs` | hot path (ทุก request) เดิมอ่านชีตทั้งใบ + เขียน `lastSeenAt` ทุกครั้ง → cache ผล 300s ต่อ token (แฮช MD5) + เขียน lastSeenAt เฉพาะเก่ากว่า 10 นาที · **⚠️ ล้าง cache 3 จุด**: `revokeSession_` (logout), `saveStaffHandler_` (เปลี่ยน role/status), ตั้ง role จาก GAS editor |
| **E** postAuthAction timeout | `app.jsx` (`postAuthAction`) | `fetch` ดิบไม่มี timeout → คำขอค้าง pending ข้ามนาที · เปลี่ยนเป็น `dmjFetch`+`dmjTimeoutMs` ต่อ action (authLine 25s/me 20s/logout 20s/claim 8s) + `dmjJson` แทน `res.json()` · **ผ่านเทสต์ iPhone จริง (PWA ไอคอนหน้าโฮม + Safari) แล้ว merge** |

---

## 🔒 แกนความปลอดภัยที่ห้ามพังถ้าจะแก้เส้นล็อกอินต่อ

1. **timeout/abort ต้อง THROW เสมอ — ห้าม escalate เป็น logout** (ก้อน E)
   `postAuthAction` reject/abort/HTML → ตก catch ของ `checkMe`/bootstrap → `setAuthPhase(role ? "ready" : "needLogin")`
   = ทำงานต่อด้วย role เดิมที่ cache ไว้ · **logout เกิดเฉพาะ `d.invalid===true` เท่านั้น**
   นี่คือสาเหตุที่ 7.6 เดิมทำร้านล่ม — มี behavioral test ใน `login-resilience.test.js` (ก้อน E)
   พิสูจน์ว่า abort/HTML → rejects ไม่ resolve เป็น invalid · **ห้ามถอด**

2. **ล้าง session cache ให้ครบ 3 จุด** (ก้อน D) — revoke/saveStaff/editor ·
   ลืมจุดใด = logout แล้วยังใช้ได้ต่อ / เปลี่ยนตำแหน่งยังถือสิทธิ์เก่า (ช่องโหว่)

3. **client TTL ต้องไม่เกิน server TTL** (ก้อน C) — `LINE_HANDOFF_TTL_MS (30น) ≤ LOGIN_HANDOFF_TTL_SEC (1800s)`
   ไม่งั้น client คิดว่ายังรอได้แต่ server ลบ handoff ไปแล้ว

4. **จอ checking ต้องมีทางออกเสมอ** (ก้อน A) — ปุ่ม give-up ที่ 30 วิ · ห้ามกลับไปเป็นสปินเนอร์เปล่า

---

## การ deploy + verify

- **Frontend (app.jsx, service-worker.js)** → Cloudflare Pages auto-deploy จาก `master`
  · bump `CACHE_NAME` → `dmj-v50` (A–D = v48, E = v50; v49 เป็นของงาน "ส่ง Central" ที่แทรกเข้ามา)
  · ⚠️ verify Cloudflare ผ่าน HTTP จาก sandbox ไม่ได้ (proxy policy block `*.pages.dev` = 403) —
    ยืนยันได้จาก "master push สำเร็จ" + เปิดเว็บจริงเช็ค service-worker เป็น `dmj-v50`
- **Backend (appsscript_complete.gs)** → GitHub Actions `deploy-gas.yml` auto-deploy
  · B (handoff fix) + D (session cache) อยู่ใน run **#187** (SHA `f35d282`) = **success**
  · E เป็น frontend-only → push ของ E **ไม่ trigger** deploy-gas (ถูกต้อง ไม่มี .gs ใหม่ให้ deploy)
- **เทสต์**: unit **2285/2285** · browser **113/113** · `tests/login-resilience.test.js` 27 เคส
  (ก้อน A 5 · B 6 · C 3 · D 7 · E 6) · gasjson SCAN gate: app.jsx raw `.json()` 5→4

---

## ยังเหลือ (นอกขอบเขต Phase 7.6 login hardening — ไม่บล็อกความ stable)

- **จุด fetch ดิบอื่นในเส้น auth** ที่ยังไม่แปลงเป็น dmjJson (อยู่ใน ALLOW ของ SCAN gate พร้อมเหตุผล):
  `handlePin` (verifyPin), `startLineLogin` (lineLoginMeta), lineLoginMeta prefetch, authLine code exchange
  — E ตั้งใจทำแค่ `postAuthAction` (จุดร้อนสุด) ให้ blast radius เล็ก · จุดที่เหลือความเสี่ยงต่ำ
  (HTML → throw → catch อยู่แล้ว) จะทยอยแปลงเมื่อไหร่ก็ได้ ไม่เร่ง
- **ส่วนที่ 2 ของแผนเดิม (แถบความคืบหน้าโหลดข้อมูล)** และ **ส่วนที่ 3 (Phase 8 ขั้นวัดก่อนตัดคอลัมน์)**
  — คนละเรื่องกับ login hardening · ยังไม่ทำ · ดู `docs/HANDOFF-LOGIN-PERF.md` + `docs/PLAN-PHASE8-PAYLOAD.md`

---

## ถ้าจะทำต่อ / ต้องแตะเส้นล็อกอินอีก

อ่านหัวข้อ "แกนความปลอดภัย" ข้างบนก่อนเสมอ · เทสต์ที่ต้องผ่าน:
```bash
npm test                                                     # 2285+
bash tests/browser/setup.sh && node tests/browser/run.cjs    # 113/113
```
แก้ `postAuthAction`/handoff/session → **ให้เจ้าของเทสต์ iPhone จริงทั้ง PWA (ไอคอนหน้าโฮม) และ
Safari ก่อน merge** เพราะรอบก่อนพังเฉพาะบนอุปกรณ์จริง เทสต์อัตโนมัติจับไม่ได้
