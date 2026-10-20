# PR 1 — เปิดเว็บเร็วขึ้น: หลักฐานและขอบเขต

ตรวจวันที่ 20 ต.ค. 2026 บน branch `codex/perf-lazy-babel-prefetch`.
ผลด้านล่างเป็นผลทดสอบก่อน deploy ไม่ใช่ประกาศว่าขึ้น production แล้ว
ยังไม่เริ่ม PR 2–4 และไม่มีการแก้หน้าประวัติโอน, backend, ฐานข้อมูล หรือข้อมูลย้อนหลัง

## สถานะสดที่ตรวจ

- master: `82ded3efb388f4a4ea12596bc35e0d325da5ff14`.
- PR #123/#124 merge แล้ว; การแก้ชุดนี้ต่อจาก master ดังกล่าวและรักษางานเหล่านั้นไว้
- #118 ยังเปิด: `a9cafb4`; #122 ยังเปิด: `7080e55`, base เป็น branch ของ #118.
- #120 (`6b2c325`) และ #121 (`9f29fff`) ยังเปิด ไม่ได้นำ feature เหล่านั้นมารวมในชุดนี้
- SW บน master/production คือ `dmj-v61`; #120/#121 ใช้ v63 และ #122 ใช้ v64.
  ชุดนี้ใช้ v65 ทั้ง HTML boot tag และ SW; ต้องตรวจเลขใหม่อีกครั้งก่อน merge ในอนาคต
- เริ่มจาก worktree ที่มี patch startup เดิม 3 ไฟล์และ WebP ที่ยังไม่ commit.
  สำรอง patch, stash, fast-forward สู่ master ล่าสุด แล้วนำ patch กลับโดยไม่มี conflict.
  ไม่ใช้ข้อมูล handoff เป็นหลักฐานสถานะปัจจุบัน

## Production และสาเหตุที่ยืนยันได้

Production URL: https://dmj-inventory-dashboard.pages.dev/

ไฟล์ HTML, SW, `app.jsx`, `views-analytics.jsx` ที่ดึงสดตรงกับ master ข้างต้นแบบ byte-for-byte.
GitHub check ของ commit นี้ระบุ Cloudflare Pages deploy สำเร็จที่ build `73b6f5a8`
(https://73b6f5a8.dmj-inventory-dashboard.pages.dev).
ไม่ได้เข้าถึง account API เพื่ออ่าน mapping ของ production alias หรือ build settings โดยตรง

`/dist/manifest.json` และ `/dist/app.js` ตอบ HTTP 200 แต่เป็น `text/html` ขนาด 1,084 bytes
ซึ่งเป็นหน้า index fallback ไม่ใช่ JSON/JS. ดังนั้น precompile ยังใช้ไม่ได้ที่ production URL
นี้ในเวลาที่ตรวจ ห้ามสรุปว่าตั้ง build command ผิดโดยไม่มีสิทธิ์อ่าน settings;
สาเหตุอาจเป็น build command/output/publish configuration ที่ไม่รวม dist

Trace จาก Chromium บน production ยืนยัน:

- cold boot compile JSX ทั้ง 7 ไฟล์; warm boot มี compiled-cache hit ทั้ง 7 ไฟล์
- รอบ cold แรก Babel มี encoded transfer 656,235 bytes, ระยะดาวน์โหลดรวม 14.41s
  และ TTFB ประมาณ 353ms ภายใต้เครือข่ายจำลองนี้. การ compile เริ่มประมาณ 15.3s
  หลัง mark `html`, แล้วใช้งาน main thread อีกหลายวินาทีก่อนแอปพร้อม
- LCP ใน cold ทั้งสามรอบเป็น DIV ของกล่อง "โหลดนานผิดปกติ" ที่ watchdog แสดง;
  ใน warm ทั้งสามรอบเป็น DIV ข้อความ `Doomuenjing`. ไม่ใช่โลโก้ในการวัดชุดนี้
- ไม่มี session สำหรับงานสต๊อก/สั่ง/รับของ จึงไม่ใช้หน้า login สรุปความเร็ว Action.
  ไม่ได้วัด execution time ของ GAS; TTFB หรือเวลาที่ browser เห็นใช้แทนเวลาฝั่ง server ไม่ได้

## เงื่อนไขและผลวัด

Chromium 154.0.8037.57 headless บน Debian 13, Node 24.19.0, Android mobile UA,
viewport 390×844, DPR 3,
CPU 4× slowdown, latency 150ms, download 200 KiB/s, upload 100 KiB/s.
แต่ละแขนทดลองใช้ context ใหม่ 3 รอบ; warm คือ reload ใน context เดิมหลังโหลดทรัพยากรจบ.
ไม่มีการล็อกอิน production หรือสร้างธุรกรรมจริง

### Production baseline ปัจจุบัน — อย่างละ 3 รอบ, ค่ากลาง

| สภาพ | เห็น login (s) | FCP (s) | LCP (s) | Blocking ก่อนเห็น login (ms) |
| --- | ---: | ---: | ---: | ---: |
| cold | 23.77 | 0.796 | 22.844 | 7,314 |
| warm | 0.75 | 0.428 | 0.720 | 35 |

Browser ใช้ CA ของ proxy ที่ environment กำหนด โดยเพิ่มใน browser trust store;
ไม่ได้ปิด TLS verification. Production warm รวม HTTP, compiled cache และ PWA/vendor cache

### เปรียบเทียบ local mirror — อย่างละ 3 รอบ, ค่ากลาง

ใช้ไฟล์ HTML/JS จริงจาก baseline เทียบกับ patch นี้, backend mock, gzip + conditional ETag,
React/Recharts/Babel/QR/scanner mirror จากไฟล์เวอร์ชันเดียวกับหน้าเว็บ.
ฟอนต์ใช้ CSS ว่าง; block SW ใน benchmark เพื่อวัด loader แยกจาก PWA regression.
ไม่ใช่ตัวเลข production หลังแก้ และห้ามเทียบค่าตรงกับ PageSpeed ที่ผู้ใช้ส่งมา

| เส้นทาง | cache | เห็น login (s) | LCP (s) | Blocking ก่อน login (ms) | transferred bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| master, ไม่มี build เหมือน production | cold | 16.47 | 16.464 | 7,393 | 1,791,181 |
| master, ไม่มี build | warm | 0.92 | 0.932 | 181 | 6,300 |
| master, เปิด build อย่างเดียว | cold | 12.24 | 12.240 | 637 | 2,319,095 |
| master, เปิด build อย่างเดียว | warm | 0.91 | 0.908 | 142 | 6,300 |
| PR นี้, เปิด build | cold | 5.23 | 5.040 | 72 | 920,393 |
| PR นี้, เปิด build | warm | 0.88 | 0.892 | 0 | 6,000 |

master ที่เปิด build ยังโหลด Babel แบบบล็อกและ prefetch JSX ซ้ำใน cold boot จาก hint เดิม.
loader ใหม่ไม่ request Babel หรือ JSX เลยในเส้นทาง build ปกติ.
Blocking ในตารางคือ sum(max(longTask.duration−50ms, 0)) ก่อนเห็น login ไม่ใช่คะแนน/TBT
จาก Lighthouse. FCP ส่วนใหญ่เป็น loading shell จึงไม่ใช่เวลาที่พนักงานใช้งานแอปได้

Raw results ที่ไม่มี URL query/token:
[local](performance/startup-local-2026-10-20.json),
[production](performance/startup-production-2026-10-20.json).
PageSpeed 27/FCP 6s/LCP 19s/TBT 4,640ms ที่ผู้ใช้ส่งมาเป็น baseline คนละสภาพแวดล้อม;
ยังไม่มี PageSpeed หลัง deploy ของ PR นี้

## ไฟล์ที่แก้

| ไฟล์ | เหตุผล |
| --- | --- |
| `Doomuenjing Dashboard.html` | ใช้ manifest ก่อน prefetch เส้นทางเดียว; โหลด Babel เฉพาะ cache miss ของ fallback, singleton + error/timeout; asset timeout ครอบคลุม body; ปฏิเสธ HTML ที่ปลอมเป็น JS; แสดง recovery เมื่อ script พัง |
| `scripts/build-jsx.mjs` | ใช้ระบบเดิม สร้างชื่อไฟล์จาก source hash ที่มีอยู่แล้ว, manifest ระบุ output จริง; เก็บ alias เดิมให้ HTML รุ่นเก่ายังเปิดได้; นับ bytes เป็น UTF-8 |
| HTML + SW | tag boot/SW ตาม release; build filenames ตาม hash; ถ้า build หาย ตรวจ source hash ก่อน fallback ป้องกัน source คนละรุ่น; ไม่บังคับ reload |
| `service-worker.js` | v65; boot network-first และ offline match ด้วย URL รุ่นเดิม; เก็บ app cache ก่อนหน้าเพียงหนึ่งรุ่นสำหรับ controller ที่ยังเขียนแคชระหว่าง activate; API strategy เดิม |
| `app.jsx`, `logo-small.webp` | เปลี่ยนเฉพาะ src โลโก้ 3 จุดที่แสดงบนจอ. PNG เดิม 3306×1991, 268,795 bytes ยังอยู่สำหรับงานละเอียดสูง; WebP ใหม่ 480×289, 43,716 bytes (ลด 83.7%). ไม่เปลี่ยน style/ขั้นตอนงาน |
| `tests/browser/startup.cjs` | ทดสอบ HTML loader จริงที่ harness เดิมข้าม รวม cache transition และการวัดก่อน–หลัง |
| `tests/browser/production-baseline.cjs` | manual read-only login baseline; mock/proxy ไม่ถูกใส่ในโค้ดเว็บ; ไม่เก็บ HAR, headers หรือ URL query/token |
| `package.json`, test workflow, browser README | เพิ่ม build/startup check ใน CI และวิธีทดสอบซ้ำ; checkout history สำหรับ baseline; ไม่มี deploy step ใหม่ |

## ผลทดสอบ

- `npm run build`: PASS; manifest enabled และ output/legacy alias ครบทั้ง 7 ไฟล์
- `npm test`: PASS 2,930 tests / 105 files (local run 17.48s)
- browser regression เดิม: PASS 132/132 ด้วย fixture/mock ไม่แตะ backend จริง
- startup regression สุดท้าย: PASS 15/15 (27.25s), รวม
  precompile ไม่โหลด Babel/JSX ซ้ำ; HTML เก่าใช้ build ใหม่ได้; manifest หาย/ผิด/headers มาแต่
  body ค้าง; dist หลายไฟล์หายพร้อมกันโหลด Babel ครั้งเดียว; Babel fail/ค้าง; source fail;
  dist syntax error; source hash คนละรุ่น; warm compiled cache ไม่โหลด Babel;
  PIN ถูก/ผิด; LINE callback ถูก/ผิด state; PWA เก่า→ใหม่ activate แล้ว offline
- `git diff --check`, JS syntax check: PASS
- ยังไม่ใช่ผล GitHub Actions/Node 20 ของ branch นี้จนกว่าจะ push

เครื่องมือเดิมมีประโยชน์ต่อ role/tab/data regression แต่ใช้ harness ข้าม loader และ bypass login
จึงใช้ยืนยัน precompile/LINE/PWA ไม่ได้. ชุดใหม่เติม coverage นี้ เพิ่มเวลางานตรวจ ไม่ถูกโหลด
หรือ bundle เข้าเว็บของพนักงาน. เวลาที่เคยค้างตอนติดตั้งเกิดจาก sandbox/proxy;
หลังตั้ง npm proxy ถูกต้อง การติดตั้ง 147 packages สำเร็จใน 2s ใน run ที่ตรวจได้

## ข้อจำกัดและความเสี่ยง

- ทดสอบ Chromium desktop ที่จำลองมือถือ ไม่ใช่โทรศัพท์/iOS Safari หรือ LINE app-to-app จริง
- login/PIN/LINE callback ใช้ mock; ไม่มีบัญชีหรือ test GAS deployment สำหรับวัดงานหลังล็อกอิน
  จึงยังไม่ได้แยก Action จริงเป็น feedback/server/body/UI time และไม่สร้างงานจริงเพื่อวัด
- Action fault cases เรื่องสองเครื่อง/คำตอบหาย/retry/หมดสิทธิ์ยังเป็นงาน PR 2–4.
  PR นี้ไม่ได้อ้างว่าสั่งของหรือรับของเสถียรขึ้นแล้ว
- ไม่ได้ re-run PageSpeed หลังแก้เพราะยังไม่ deploy; ไม่อ้างคะแนน production ดีขึ้น
- hashed output มี alias เพื่อ compatibility ทำให้ขนาด artifact บน hosting เพิ่ม แต่ loader ใหม่
  request แต่ hashed output อย่างเดียว. เก็บ app cache ก่อนหน้าเพิ่มอีกหนึ่งรุ่นแบบมีขอบเขต
- fallback จาก build ที่หายต้องมี crypto.subtle/TextEncoder ใน secure context เพื่อตรวจรุ่น;
  หากตรวจไม่ได้จะแสดง recovery ไม่ผสม source ข้ามรุ่น
- ก่อน release ต้องตรวจ Cloudflare build settings ให้รัน `npm run build`, publish root ที่มี
  HTML + `dist/`; output directory สำหรับโครงสร้าง repo ปัจจุบันคือ `.`.
  หลัง preview ต้องตรวจ `/dist/manifest.json` เป็น JSON จริงและทุก output เป็น JS จริง
  มิฉะนั้น fallback ยังทำงานได้แต่ cold boot จะยังจ่ายค่า compile

## ก่อน push และก่อน deploy

อ่าน workflow สดแล้ว: Tests รัน push/PR และไม่ deploy; GAS deploy เฉพาะ push master
ที่เปลี่ยน `.gs`, `appsscript.json` หรือ workflow GAS. ชุดนี้ไม่เปลี่ยนไฟล์เหล่านั้น
Cloudflare Pages preview และ Workers Builds เป็น Git integration ที่อยู่นอก workflow.
Workers check ใช้ URL production service จึงอ่าน branch deployment policy จาก check อย่างเดียวไม่ได้

ยังต้องยืนยันว่า Pages/Workers production branch จำกัดที่ master ก่อน push ตามข้อกำหนดผู้ใช้.
ได้ถามข้อมูล settings นี้แล้ว ไม่มีการตีความการอนุมัติ network เป็นการยืนยัน settings หรือ merge
และไม่ได้เปลี่ยน Cloudflare account settings เพื่อให้ production rebuild เอง

## ข้อค้นพบสำหรับ PR ถัดไป — ยังไม่แก้

- `ui.jsx`: dmjFetch clearTimeout ใน finally หลัง fetch คืน Response แต่ dmjJson ค่อยอ่าน text;
  ยืนยันช่องว่าง timeout ของ body ใน master ปัจจุบัน
- `views-main.jsx`: verifyOrderLanded ยังใช้ยอดรวม SKU >= before + qty เป็น fallback;
  ไม่ใช่หลักฐานว่า cid ของคำสั่งนี้สำเร็จ
- `appsscript_complete.gs`: handleOrder_ dedup จาก cid แต่ไม่เทียบผู้ใช้/action/payload ครบ;
  อ่านช่วง `'A' + 3 + ':A'` เพื่อหาแถวว่างขณะถือ lock และส่ง LINE ของ "หิ้ว" ก่อนคืนผล
- ต้องตรวจ gate ของ orderCheck/สิทธิ์และ compatibility ร่วมกับ #118/#122 ก่อน PR 2,
  แยก telemetry/read/lock/write/LINE ใน test deployment ก่อนเลือกแก้หลังบ้าน
- ไม่วัดหรือเปลี่ยน stock/order/receive polling, optimistic write, schema หรือข้อมูลย้อนหลังใน PR นี้

## Rollback

Revert commit ของ PR นี้ใน branch แยก, build และทดสอบก่อน preview.
เลข SW ต้องเดินหน้าจากเลขสูงสุดที่ใช้จริง (อย่างน้อย v66 ถ้า v65 ยังเป็นล่าสุด), ไม่ย้อนเป็น v61.
หากคง loader ใหม่ไว้ ต้องเปลี่ยน HTML boot version ให้ตรง SW ด้วย; test ตรวจคู่นี้.
ยังเก็บ PNG เดิมและ build alias เดิม จึงย้อน frontend ได้โดยไม่ย้าย/ย้อนข้อมูลธุรกิจ
ต้องรอผู้ใช้อนุมัติก่อน merge/deploy ตามคำสั่งล่าสุด
