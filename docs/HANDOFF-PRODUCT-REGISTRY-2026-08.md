# HANDOFF — Product Registry / Add Product Two-Track (Work 8)

> **สถานะ**: Phases A + B + C + G **merged เข้า master แล้ว**, code สมบูรณ์และผ่านเทสต์ครบ
> **Registry ยังปิดอยู่ในโปรดักชัน (SAFE-ROLLOUT OFF by default)** — ยังไม่มีผลใด ๆ กับผู้ใช้จริง
> จนกว่าเจ้าของจะรัน `setupProductRegistry()` เอง ดูหัวข้อ "จุดเริ่มต่อที่แนะนำ" ด้านล่าง
>
> เอกสารนี้เขียนขึ้นเพื่อให้ **เซสชันถัดไปเริ่มงานต่อได้โดยไม่ต้องพึ่งประวัติแชท** — อ่านไฟล์นี้ +
> `docs/WORK-8-DECISION-GATE.md` (D01–D12 ที่ล็อกไว้) ก็เพียงพอ

---

## 1. Phase ที่เสร็จแล้ว (merged เข้า master)

| Phase | เนื้องาน | Commit (บน master) |
|---|---|---|
| **A** | Product Domain Registry foundation — 4 ชีตทะเบียน (Prefix/Family/Form/Variant) + pure helpers + list/save handlers (D06–D09) | `ff26f0b` |
| **B** | ERP backend SKU reservation service — `reserveFormHandler_` (ScriptLock → re-read → max+1 per-prefix → persist → idempotent ด้วย `formReqId`) (D05) | `1888195` |
| **C** | Add Product two-track UI — Track 1 (แบบใหม่) / Track 2 (สี-ขนาดใหม่ของแบบเดิม) + `RegistryAdminPanel` (D11) | `baeea5b` |
| **G** | Hardening — behavioral test ล็อกเมทริกซ์สิทธิ์ `canDoOrNull_` + self-gate ของ handler เขียน (non-admin ถูกปฏิเสธก่อนแตะชีต) | `3474012` |
| merge-hygiene | bump `CACHE_NAME` v51→v52 ตอน merge master↔feature branch | `7582514` |

**ยืนยันแล้วว่า `7582514` เป็น ancestor ของ `origin/master` ปัจจุบัน** — Phase A+B+C+G อยู่บน master จริง
ไม่ได้อยู่แค่ใน feature branch

หลัง merge master เดินหน้าต่อด้วยงานอื่น (ไม่เกี่ยวกับ Product Registry เลย): forensic fix เว็บล่ม
26 ส.ค., Phase 8 (`action=boot` + cache domains), label sticker format ใหม่ ๆ — **ตรวจแล้วว่าไม่แตะ
โค้ด Registry ใด ๆ เลยสักบรรทัด** (diff เทียบ `7582514..origin/master` ไม่มี `SHEET_*_REGISTRY`/
`reserveForm`/`RegistryHandler_` โผล่มาเลย)

### สถานะเทสต์ล่าสุด (รันจริงบน master ปัจจุบัน)
- Unit: **93 files / 2631 tests ผ่านหมด** (`npx vitest run`)
- Browser (headless, `node tests/browser/run.cjs`): **122/122 ผ่านหมด** — รวม 2 เคสที่ทดสอบ
  Registry ตรง ๆ: "เพิ่มสินค้า two-track (registry)" (ON: Track1→`OL01900`, Track2→`R19025` สืบทอด
  prefix+model, prefix `L` FROZEN ไม่โผล่เป็นตัวเลือก) และ "เพิ่มสินค้า registry OFF → Legacy"
  (OFF: ฟอร์มเดิมครบทุกอย่าง ไม่มี regression)
- `.gs` syntax check ผ่าน · ทุก component/function เกี่ยวกับ Registry มีนิยามเดียว (ไม่ซ้ำจาก merge)

### สถานะ SAFE-ROLLOUT บน production วันนี้
- **Registry ปิดอยู่** — `PREFIX_REGISTRY_ENABLED` / `FAMILY_REGISTRY_ENABLED` / `FORM_REGISTRY_ENABLED`
  / `VARIANT_REGISTRY_ENABLED` ไม่เคยถูกตั้งเป็น `'true'` ใน production (ค่า default = ไม่มี property
  → `=== 'true'` เป็น false เสมอ)
- `setupProductRegistry()` **ยังไม่เคยถูกรัน** ใน production — เช็คแล้วไม่มีจุดไหนในโค้ดเรียกมันเองอัตโนมัติ
  (มีแค่ comment อ้างถึง ที่ `appsscript_complete.gs:16710` ก่อน merge ล่าสุด — ตัวจริงอยู่ที่บรรทัด
  `17073` บน master ปัจจุบัน)
- แท็บ "➕ เพิ่มสินค้าใหม่" ที่ owner/dev/warehouse เห็นอยู่ตอนนี้ = **`LegacyAddProductView` เดิมทั้งดุ้น**
  (dispatcher ที่ `views-main.jsx:9835` เช็ค `!reg || reg.off` → คืน Legacy component ทันที)

---

## 2. ขอบเขตที่เหลือ — D / E / F (ยังไม่ implement บนสาขาไหนเลย)

| Phase | ขอบเขต | อ้างอิง Decision |
|---|---|---|
| **D** | Legacy Migration/Backfill — preview → human review → apply เท่านั้น (ห้าม auto-apply) จัดลำดับ: (1) Prefix Registry (2) Business Family Registry (3) Product Type/Form Registry | D10 |
| **E** | Supplier Review (Model C) — ยังไม่ได้ระบุรายละเอียด implementation ในเซสชันนี้ ต้องอ่าน `docs/PRODUCT-IMPLEMENTATION-SPEC.md` เรื่อง Supplier Review Model C ก่อนเริ่ม (คนละ decision track กับ D01–D12 ของ Work 8 — ดูคำเตือนท้าย `WORK-8-DECISION-GATE.md`) | Supplier Review Model C (implementation-spec track) |
| **F** | Product Edit + ZORT sync-direction reconciliation — **ต้อง land พร้อมกันในการ implement เดียว ห้ามแยก** (D12 ล็อกไว้ชัดเจนว่าห้าม ship Product Edit ก่อน sync guard พร้อม) | D12 |

**ยังไม่มีโค้ดของ D/E/F แม้แต่บรรทัดเดียว** — ยืนยันด้วย `grep` หา
`migrateFamily/classifyFamily/applyMigration/editProductHandler/updateProductMeta/zortMetaSync`
บน `appsscript_complete.gs` ปัจจุบัน = 0 match

---

## 3. D01–D12 ที่ล็อกแล้ว (สรุปย่อ — ฉบับเต็มอยู่ที่ `docs/WORK-8-DECISION-GATE.md`)

ทุกข้อ 🔒 LOCKED แล้วโดยเจ้าของ ห้าม reopen/reinterpret:

- **D01** Field Ownership — ERP=domain master (Form/Variant/Name/Category/Price/Barcode สินค้าใหม่) · Existing SKU/Barcode immutable · New Barcode = SKU
- **D02** Hierarchy — `Business Family → Product Type/Form → Variant → SKU` · Prefix ≠ Family · Model ≠ Family
- **D03** Variant Rule — 1 Form = 1 axis (MVP) · Form owns rule · staff เลือกค่าที่อ่านได้ ห้ามกรอก raw code
- **D04** ZORT Sync — ERP domain master / ZORT operational master · ห้าม ZORT overwrite ERP-master fields เงียบ ๆ
- **D05** SKU Generation — ERP backend reservation, per-Prefix, ScriptLock+re-read+max+1+idempotent · grammar `[Prefix][Variant2][Model3]` · **L = FREEZE** สำหรับสินค้าใหม่ · ⏸️ L replacement routing DEFERRED ไป Prefix Registry
- **D06** Prefix Registry — Formal, Owner/Admin ผ่าน UI, Dedicated Sheet, ACTIVE/FROZEN, ห้าม auto-create, ห้ามพนักงานพิมพ์เอง
- **D07** Family Registry — Formal, **optional per Form**, ห้าม derive จาก Prefix/Model/Category/SKU
- **D08** Form Registry — Formal editable, `form_id` stable, nullable `family_id`, owns Variant Rule, เก็บ Prefix+Model ที่ D05 จองให้
- **D09** Variant Registry — per-axis, Color seed 99 รหัสจาก `VARIANT_COLOR_CODES` เดิม, code เป็น axis-scoped
- **D10** Migration — sequential (Prefix→Family→Form), preview→review→apply, **ห้าม auto-guess**, UNCLASSIFIED/NEEDS_REVIEW เป็น terminal state ถาวรได้
- **D11** Add Product UI — Two-track (Track1 สร้างแบบใหม่ / Track2 variant ใหม่ของแบบเดิม) — **implement แล้วใน Phase C**
- **D12** ZORT→ERP Sync Reconciliation — Defer ไปพร้อม Phase F, **ห้าม ship Product Edit ก่อน sync guard พร้อม**

---

## 4. สิ่งที่ตั้งใจเลื่อนไว้ (DEFERRED โดยเจตนา — ไม่ใช่ของค้าง)

1. **L replacement-prefix routing** (D05/D06) — ตอนนี้ L=FREEZE เฉยๆ ยังไม่มี logic ว่า "ของที่เคยใช้ L
   ควรย้ายไป prefix ไหน" ต้องรอ Prefix Registry มีข้อมูลจริงก่อนตัดสินใจ ห้ามเดา
2. **D12 sync reconciliation** — เลื่อนไปทำพร้อม Phase F (Product Edit) ในรอบ implement เดียวกันเท่านั้น
3. **Registry Admin UI** (D06 governance) — สร้างแล้วใน Phase C (`RegistryAdminPanel`, Owner/Admin เท่านั้น)
   ครบเพียงพอสำหรับ MVP: เพิ่ม/แก้ Prefix (ACTIVE/FROZEN), Family, Variant value ต่อ axis — **ยังไม่มี**
   หน้าแก้ไข/ลบ Form โดยตรง (ตอนนี้ Form ถูกสร้างผ่าน `reserveForm` เท่านั้น ยังไม่มี edit)

---

## 5. จุดเริ่มต่อที่แนะนำ (ลำดับที่ปลอดภัยที่สุด)

**อย่าเริ่ม D/E/F ทันที** — ขั้นแรกที่ต้องทำคือ **เปิดใช้งาน Registry ใน production แบบควบคุมได้**
เพราะไม่มี test environment แยกต่างหาก (ยืนยันแล้ว: GAS project เดียว, Spreadsheet เดียว,
deployment `/exec` เดียว) — ราย ละเอียดขั้นตอนอยู่ที่คำตอบก่อนหน้าในเซสชันนี้ สรุปย่อ:

1. เปิดตอนร้านปิด/ไม่มีคนใช้แท็บ "เพิ่มสินค้าใหม่อยู่"
2. รัน `setupProductRegistry()` ใน GAS editor ของ production (ปลอดภัย + reversible — ดูหัวข้อ 6)
3. เข้าแอปในฐานะ owner/dev → "➕ เพิ่มสินค้าใหม่" → "⚙️ จัดการทะเบียน" → เพิ่ม Prefix จริงที่ใช้
   เป็น ACTIVE (**ห้ามตั้ง `L` เป็น ACTIVE**)
4. สร้างสินค้าทดสอบ 1 ตัวผ่าน Track 1 เพื่อยืนยันว่า SKU ประกอบถูก + ลง ZORT จริง
5. ถ้าผิดปกติ → รัน `disableProductRegistry()` ทันที (ข้อมูลในชีตไม่หาย, ฟอร์มกลับเป็น Legacy ทันที)

**หลังจากนั้นเท่านั้น** ถึงเริ่ม Phase D (migration preview เท่านั้นก่อน — ห้าม apply จนกว่าจะ review)
โดยมีข้อมูลจริงใน Prefix/Family/Form Registry ให้ทดสอบ classifier ด้วย

Phase E (Supplier Review) เป็นอิสระจากการเปิด registry — เริ่มเมื่อไหร่ก็ได้ แต่ต้องอ่าน
`docs/PRODUCT-IMPLEMENTATION-SPEC.md` ก่อนเพื่อไม่ให้สับสนกับ decision track อื่น

Phase F (Product Edit) ห้ามเริ่มจนกว่าจะพร้อมทำ D12 sync reconciliation ไปพร้อมกันในรอบเดียว

---

## 6. คำสั่ง/ขั้นตอนสำหรับ resume งานอย่างปลอดภัย

```bash
# ตรวจสถานะปัจจุบันก่อนเริ่มงานใด ๆ เสมอ
git fetch origin master
git log --oneline -5 origin/master        # ต้องเห็น 7582514 (หรือใหม่กว่า) เป็น ancestor
npx vitest run                             # ต้องเขียวทั้งหมดก่อนแตะโค้ดต่อ
bash tests/browser/setup.sh && node tests/browser/run.cjs   # 122/122 บนวันที่เขียนเอกสารนี้

# ตรวจว่า Registry ยังปิดอยู่จริงก่อนเริ่มงานที่เกี่ยวกับ Registry
grep -c "REGISTRY_ENABLED') === 'true'" appsscript_complete.gs   # ต้องได้ 4
grep -n "setupProductRegistry()" appsscript_complete.gs | grep -v "function setupProductRegistry"
# ต้องไม่มีบรรทัดไหนเรียกมันจริง (มีแค่ comment อ้างถึงได้)
```

**ฟังก์ชันสำคัญที่ต้องรู้จุดก่อนแก้ต่อ** (บน master ปัจจุบัน):
- `setupProductRegistry()` — `appsscript_complete.gs:17073`
- `disableProductRegistry()` — `appsscript_complete.gs:17096`
- `reserveFormHandler_(ss, data, actor)` — `appsscript_complete.gs:17182`
- Dispatcher (`AddProductView`, Legacy↔Registry) — `views-main.jsx:9835`

**เทสต์ที่ต้องรันผ่านทุกครั้งที่แตะโค้ด Registry**:
`tests/product-registry.test.js`, `tests/sku-reservation.test.js`, `tests/add-product-registry.test.js`,
`tests/registry-permissions.test.js` — ทั้งหมด eval ฟังก์ชันจริงจาก source (ไม่ copy) กันโค้ด drift

**กติกาที่ต้องรักษาต่อ** (ห้ามฝ่าฝืนแม้ทำ D/E/F):
- Existing SKU / Barcode / inventory data **ห้ามแก้เด็ดขาด**
- `L` prefix **ห้าม** ตั้ง ACTIVE หรือ auto-route โดยไม่มี business decision ใหม่จากเจ้าของ
- ทุก feature ใหม่ต้องเป็น SAFE-ROLLOUT (flag OFF by default, dormant จนกว่าจะเปิดเอง)
- Migration (D10) ต้องเป็น preview→review→apply เสมอ ห้าม auto-apply แม้ confidence สูง
- Phase F ห้าม ship แยกจาก D12 sync reconciliation

---

*เขียนโดยเซสชันที่ทำ Phase A–C+G merge (2026-08) — อ้างอิงหลักคือ `docs/WORK-8-DECISION-GATE.md`
(D01–D12 ฉบับเต็ม) และ commit history บน `master` ไม่ใช่บทสนทนา*
