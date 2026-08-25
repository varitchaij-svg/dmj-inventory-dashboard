# Work 7 — Implementation Readiness Audit + Execution Plan

> **Type:** Investigation + implementation planning only. No code/config/data changed.
> **Audited spec:** `docs/PRODUCT-IMPLEMENTATION-SPEC.md` (commit `53ec321`, itself a Work 6 reconstruction).
> **Date:** 2026-08-25 · **Branch:** `claude/product-spec-phase-2-work-6-v43vwx`
> **Authoritative decisions:** owner D01–D05 (as restated in the Work 7 task).
> **No commit / no push / no deploy in this work.**

Evidence-status vocabulary used throughout:
`CONFIRMED AS-IS` (verified in code) · `INFERRED` (reasonable from code, not explicit) ·
`PROPOSED` (TO-BE, not built) · `OWNER DECISION REQUIRED` · `NOT RECOVERABLE` (lost with prior session).

---

## §1. Scope

This audit answers one question: **is `PRODUCT-IMPLEMENTATION-SPEC.md` ready to implement, measured against the actual codebase, and in what order is it safest to build?**

Covered: Spec↔code traceability; the live product-creation path; product-edit path; SKU/Family/Variant grammar and storage; legacy `L` freeze enforcement; Supplier Review (Model C) reuse feasibility; ZORT sync field-by-field; images; pricing; permissions; migration dependency map; a phased rollout plan; a pre-coding test matrix; risks/conflicts; and a final readiness gate.

**Guardrails honored:** no `.jsx`/`.gs`/`.js`/config/data changes; no Registry/sheet/migration; no deploy; no commit/push; no production GAS calls; no use of the lost CSV statistics as fact; `NOT RECOVERABLE` items kept as such; the audited spec and the (absent) architecture docs untouched.

---

## §2. Evidence / Provenance

### Sources actually used

| Source | Status |
|---|---|
| `docs/PRODUCT-IMPLEMENTATION-SPEC.md` (commit 53ec321) | Read in full — the reconstruction being audited |
| `appsscript_complete.gs` | Read (targeted functions), cited by line |
| `views-main.jsx`, `views-analytics.jsx`, `views-quote.jsx`, `app.jsx` | Read (targeted), cited by line |
| `CLAUDE.md` | Cross-reference for AS-IS behavior |
| Owner decisions D01–D05 (Work 7 task) | Authoritative |

### NOT RECOVERABLE (unchanged from Work 6 — do not invent)

- The 7 Phase 2 architecture docs — absent from repo/history (confirmed again this session).
- Forensic CSV (`d6d7e14dbe3285706ee2d0aafad36550`) — absent; **its statistics are not used as fact** (D05 = UNKNOWN).
- Formal definitions of **Business Family** and **Product Type/Form** taxonomy.
- SKU **reservation protocol** design; Registry **schema**.
- The **"suffix-letter grammar"** and **"fullword grammar"** named in the Work 7 audit request: **these do NOT exist in the current code** (grep for `suffix`/`fullword` in SKU context returns nothing). They appear to originate in the lost forensic analysis. Treated as `NOT RECOVERABLE` assumptions, **not** reconstructed. The grammars that DO exist in code are: standard `parseSkuParts` (`prefix+variant+model`), the legacy `suggestNextSku` base+running shape, and the MTO prefix grammar `mtoSkuPrefix_`.

### Provenance caveat

D05 remains **UNKNOWN** and is **not** upgraded to production-confirmed. Any planning item that would need production-scale counts (how many `L` SKUs, variant distribution, legacy barcode-exception count) is flagged as provenance-gated, not answered with the lost numbers.

---

## §3. Spec ↔ Code Traceability Matrix

| # | Requirement | Spec § | Current implementation | Evidence (file:line) | Status | Gap |
|---|---|---|---|---|---|---|
| 1 | Product Registry | §1 | None. Data spread across sheets `อัพเดทจำนวนสินค้า` / `ข้อมูลสินค้า` / `imageUrl` / `สินค้าที่ซ่อน`, merged by `readProducts_` | gs:185,192,193,203; gs:9869 | PROPOSED | No registry entity/schema; **schema NOT RECOVERABLE** |
| 2 | Business Family | §2 | None. Only prefix+variant+model exists | views-main.jsx:3603 | PROPOSED / NOT RECOVERABLE (definition) | No storage/ID/UI/API |
| 3 | Product Type/Form | §3 | None as a field; category is free text; prefix informally encodes type | gs:9894; CLAUDE.md SKU rule | PROPOSED | No storage/ID/UI/API |
| 4 | Variant | §4 | Variant code = middle 2 digits of SKU; `VARIANT_COLOR_CODES` color table | views-main.jsx:3604,3570 | CONFIRMED AS-IS (as SKU substring) | No first-class variant entity; per-category non-color rule NOT RECOVERABLE |
| 5 | SKU | §5/§6 | `parseSkuParts` grammar `[A-Z]{1,3}\d{2}\d{3}` | views-main.jsx:3603 | CONFIRMED AS-IS | — |
| 6 | SKU generation | §5 | **Client-side** `nextModelForPrefix` / `suggestNextSku`; backend only dedup-checks | views-main.jsx:3540,3612,9325; gs:7580 | CONFIRMED AS-IS | No backend reservation/allocation (race-prone) |
| 7 | Legacy `L` freeze | §6 | **None.** No `L`-namespace logic anywhere | (grep: only `LegacyLoginScreen`, app.jsx:545) | PROPOSED | Freeze must be built (§7 below) |
| 8 | Product edit | §8 | **No edit path — frontend or backend** | (grep: no `updateProduct/editProduct/price edit`) | CONFIRMED AS-IS (absent) | Entire edit path is a gap |
| 9 | Supplier (field) | §8/§9 | Stored as `tag`/`vendor` from ZORT; supplier list in stock-check `suppliers` col | gs:9895,9896; gs:15824 | CONFIRMED AS-IS | Supplier as ERP-owned editable field not implemented |
| 10 | Supplier Review (Model C) | §9 | Not built. Precedent: stock-check request system | gs:15814,15891,15943 | PROPOSED (reuse) | Review-Team dimension missing (§8 below) |
| 11 | Product Owner | §10 | Built (Sprint 7), flag-gated | gs:202,11347,11200 | CONFIRMED AS-IS | Reuse as-is |
| 12 | Pricing | §12 | `RETAIL_MULT=1.25` (FE), `wholesaleRatio_()=0.8` (BE); price from ZORT/sheets | views-main.jsx:9366; gs:297–304 | CONFIRMED AS-IS | ERP-as-sell-price-master not built |
| 13 | Image | §13 | col D=manual(ERP fallback), col E=ZORT(preferred); ZORT wins | gs:5468,5490,7959,7995,8010 | CONFIRMED AS-IS | Matches D02 already |
| 14 | Barcode | §14 | `barcode = sku` at create; Code128 print exists | gs:7588 | CONFIRMED AS-IS | Legacy barcode exceptions list NOT RECOVERABLE |
| 15 | ZORT sync | §11 | ZORT→ERP for stock/new-products/images/purchases; ERP→ZORT only create+stock+POS | gs:8338,8346–8350,5433 | CONFIRMED AS-IS | Domain-field ERP→ZORT direction not built (§9) |
| 16 | Notification | §9 | `pushInappNoti_` (all/role/staff), LINE queue `enqueueNoti_` | gs:10925,10978; CLAUDE.md Sprint 3 | CONFIRMED AS-IS | Reuse mandated (no new engine) |
| 17 | Permissions | §15 | `ROLE_ACTIONS_`/`COMMON_ACTIONS_`/`IMMEDIATE_GATE_*`, `REQUIRE_LOGIN` off by default | gs:786,941; CLAUDE.md | CONFIRMED AS-IS | New product actions not yet mapped |
| 18 | Migration | §17 | None | — | PROPOSED | Provenance-gated (D05) |
| 19 | Rollout flags | §16 | Pattern established (`*_ENABLED` + `setup*/disable*`) | gs:11200,11425; 10888; 12100 | CONFIRMED AS-IS | New flag name TBD |

---

## §4. Product Creation Path (trace + answers)

**Traced path (CONFIRMED AS-IS):**
`AddProductView` (views-main.jsx:9172) → client SKU builder using `nextModelForPrefix`/`parseSkuParts`/`VARIANT_COLOR_CODES` (views-main.jsx:9325, 3540–3624) → client dup pre-check `checkSkuExistsRemote` (views-main.jsx:9118 → gs `checkSkuExists` gs:7552) → `syncAddProduct` posts `{addNewProduct, product, actor}` via `dmjFetch`+`dmjJson` (views-main.jsx:9070) → doPost dispatch `data.addNewProduct` (gs:2647) → `addNewProduct` (gs:7563): `LockService.getScriptLock()` (gs:7575) → dedup `collectExistingSkus_` (gs:7580) → ZORT `/Product/AddProduct` with `barcode=sku` (gs:7600) → initial stock `pushStockToZort_` (gs:7615) → append `SHEET_PRODUCTS` (gs:7625) → optional temp photo → col D via `writeManualProductImage_` (gs:7637) → `writeAuditLog_` (gs:7641) → `invalidateCache_()` (gs:7644). New product appears on web via `readProducts_` SELF-HEAL (gs:9906).

**Answers to the 8 required questions:**

1. **Who generates SKU today?** The **client** (`AddProductView`, `nextModelForPrefix`/`suggestNextSku` over the browser's `products` array). CONFIRMED AS-IS (views-main.jsx:9325, 3612).
2. **Where is the race condition?** Number selection is client-side against a possibly-stale array; the backend (`addNewProduct`) takes a lock but **only rejects duplicates — it does not allocate** (gs:7575–7581). Two concurrent creators can compute the same next model number; the loser gets a hard "SKU exists" error instead of the next free identity. CONFIRMED AS-IS.
3. **Where should backend reservation live?** In a server-side allocation step inside/around `addNewProduct` (and any future bulk/import), under the existing `LockService` lock, backed by the Registry (§1). PROPOSED. **Reservation protocol design = NOT RECOVERABLE**, must be defined with owner.
4. **Where will Type/Form/Variant metadata be created/stored?** Nowhere today (no such fields; `readProducts_` only has name/category/tag/vendor — gs:9888–9903). Target = Registry (§1). PROPOSED; storage schema NOT RECOVERABLE.
5. **How are existing SKUs preserved?** They are read from sheets and never rewritten; creation only appends (gs:7625). D01/D02 require they stay immutable — CONFIRMED AS-IS that nothing rewrites them today.
6. **Where is legacy `L` freeze enforced?** **Nowhere today.** Must be added to the generation/reservation path (§7). PROPOSED.
7. **Where is duplicate protection today?** Two layers: client `checkSkuExistsRemote` (views-main.jsx:9118) + backend `collectExistingSkus_` under lock (gs:7580). CONFIRMED AS-IS. (Protection ≠ reservation — see #2.)
8. **Failure/rollback behavior?** If ZORT `AddProduct` fails → **no sheet write, no stock set** (`zortRespError_` guard, gs:7606–7611) → logged to ZORT-failed sheet. Photo failure is swallowed (non-fatal, gs:7638). Stock-set failure is swallowed after product exists (gs:7616). CONFIRMED AS-IS: creation is "ZORT-first, sheet-second," so a ZORT success + sheet-append crash would leave ZORT ahead of the sheet (SELF-HEAL later reconciles via ZORT sync). Reversible: no.

---

## §5. Product Edit Path

**Headline finding (CONFIRMED AS-IS): there is NO product-domain edit path — neither backend nor frontend.**
- No `updateProduct`/`editProduct`/`saveProduct`/price/name/category/barcode edit function in `appsscript_complete.gs` (grep empty).
- No edit UI in `views-*.jsx`/`app.jsx` (grep empty).
- Product domain fields (name/category/tag/price) are **populated from ZORT** via `syncNewProductsFromZort` (writes sku/name/category/tag/sellprice from ZORT — gs, syncNewProductsFromZort body) and displayed from sheets by `readProducts_`.

The only product-mutating actions that exist are: create (`addNewProduct`), image (`uploadProductPhoto` col E / `fetchProductImage`), owner (`setProductOwner`), stock (`pushStockToZort_`, transfer/deduct/stockcount), and hide (soft-delete tools).

| Field | Current authority (AS-IS) | D02 target (Work 7) | Existing API/path | Implementation gap | Decision needed |
|---|---|---|---|---|---|
| SKU | Immutable (never written after create) | LOCKED / no edit | — | none (must stay locked) | No |
| Product Type/Form | ZORT→sheet (as category text) | **ERP / ZORT / both — not locked** | none | new field + edit + push | **YES — direction (§16)** |
| Variant | SKU substring only | **ERP / ZORT / both — not locked** | none | first-class field + edit | **YES — direction** |
| Name | ZORT→sheet | **ERP / ZORT / both — not locked** | none (edit) | edit + push | **YES — direction** |
| Category | ZORT→sheet | **ERP / ZORT / both — not locked** | none (edit) | edit + push | **YES — direction** |
| Supplier | ZORT `tag`/`vendor` | ERP | none (edit) | ERP-owned field + edit | No (authority locked ERP) |
| Owner | ERP (built) | ERP | `setProductOwner` (gs:11347) | reuse | No |
| Cost | ZORT | ZORT | ZORT sync (read) | make read-only in any edit UI | No |
| Sell price | ZORT/sheet + FE markup | **ERP / ZORT / both — not locked** | none (edit) | ERP price master + push | **YES — direction** |
| Image | col D manual / col E ZORT (ZORT wins) | ERP owns, ZORT preferred | `uploadProductPhoto` (gs:7995), `fetchProductImage` (gs:8011) | matches target | No |
| Barcode | `=sku` at create | **ERP / ZORT / both — not locked**; preserve legacy exceptions | none (edit) | edit + push + exception handling | **YES — direction + exceptions** |

> ⚠️ **Conflict flagged (do not reconcile):** Work 6 Spec **§8 locks** Type/Form, Variant, Name, Category, Sell price, Barcode as **"ERP domain master, ERP→ZORT."** The Work 7 D02 table presents the same fields as **multi-option ("ERP / ZORT / both")**. These disagree. See §16 conflict C-1. Per guardrail, direction stays `OWNER DECISION REQUIRED` — I do not pick.

---

## §6. SKU / Family / Variant

**Grammar in code (CONFIRMED AS-IS):**
- Standard: `parseSkuParts` = `^([A-Z]{1,3})(\d{2})(\d{3})$` → prefix / variant(2) / model(3) (views-main.jsx:3603).
- `nextModelForPrefix` = client max(model)+1 (views-main.jsx:3612).
- Legacy `suggestNextSku` = base+running `^[A-Za-z]+\d+$` — CLAUDE.md notes it "does not know the business rule" (views-main.jsx:3540).
- `VARIANT_COLOR_CODES` = color table 01–99 (views-main.jsx:3570).
- MTO grouping: `mtoSkuPrefix_` = letters before digits (views-quote.jsx:358).
- **"suffix-letter grammar" / "fullword grammar": NOT in code → NOT RECOVERABLE** (see §2).

**Layer readiness (each layer: storage / ID / unique / migration / UI / API):**

| Layer | Storage | ID | Unique constraint | Migration path | UI path | API path | Verdict |
|---|---|---|---|---|---|---|---|
| **Business Family** | ❌ none | ❌ | ❌ | ❌ | ❌ | ❌ | PROPOSED; definition NOT RECOVERABLE |
| **Product Type/Form** | ❌ (category text only) | ❌ | ❌ | ❌ | ❌ | ❌ | PROPOSED; taxonomy NOT RECOVERABLE |
| **Variant** | ⚠️ only as SKU substring | ⚠️ implicit (2 digits) | ❌ (no standalone) | ❌ | ⚠️ builder picks color | ❌ | PARTIAL; needs first-class entity |
| **SKU** | ✅ sheets | ✅ the string | ⚠️ dedup-only (no reservation) | ✅ read-preserving | ✅ builder | ✅ create/check | CONFIRMED AS-IS; reservation gap |

**Spec assumptions the current code cannot yet support:**
1. A 4-layer hierarchy (Family → Type/Form → Variant → SKU) with real storage/IDs — only SKU has real storage. PROPOSED.
2. Backend SKU reservation — not present (client generation only). PROPOSED.
3. Legacy `L` freeze — not present. PROPOSED.
4. First-class Variant independent of the SKU string — not present. PROPOSED.
No new schema is invented here (Spec did not define one; Registry schema NOT RECOVERABLE).

---

## §7. Legacy `L` Freeze

**AS-IS:** no `L`-namespace handling exists anywhere (CONFIRMED — grep). D01 = FREEZE (authoritative): existing `L` SKUs remain valid and must not be renamed/re-barcoded; ERP must not mint new `L` SKUs.

**Enforcement points to consider, and the authoritative one:**

| Layer | Role | Enforce here? |
|---|---|---|
| 1. Frontend (AddProductView) | UX guard — hide/disable `L` as a new prefix | Yes (UX only, **not** authoritative) |
| 2. Backend `addNewProduct` (gs:7563) | Reject any new SKU whose parsed prefix ∈ frozen set, before ZORT call | **YES — authoritative point** |
| 3. SKU reservation (future, §5) | Never allocate into frozen namespaces | Yes (once reservation exists) |
| 4. Bulk/import | None exists today | Apply same backend rule if/when built |
| 5. API | Same as #2 (single doPost create entry) | Covered by #2 |
| 6. Migration | Preserve existing `L`; never generate | Read-only for `L` |

**Recommendation (PROPOSED):** the **authoritative freeze belongs in the backend create path (`addNewProduct`)**, because it is the single server-side entry that writes new SKUs and already holds the lock + dedup. Frontend guard is convenience only. The frozen-prefix set should be config-driven (Script Property) so `L` (and any future contaminated prefix) can be frozen without a code change. **How many `L` SKUs exist = provenance-gated (D05) — not asserted here.**

---

## §8. Supplier Review (Model C)

**Precedent verified (CONFIRMED AS-IS):**
- `SHEET_STOCK_CHECK = "คำขอเช็คสินค้า"` with a `suppliers` column (`COL_CHK_SUPPLIERS=15`) and **fs/wh split status** (`COL_CHK_FS_STATUS=9 … COL_CHK_WH_AT=14`) (gs:15814, 15820–15824).
- `createStockCheckRequest_(skus, names, actor, suppliers)` (gs:15891); `completeStockCheckRequest_(reqId, actor, side, roleHint)` (gs:15943); `readStockCheckRequests_` derives pending/done/overdue (gs:15841).
- Notifications: `pushInappNoti_` audiences `all` / `role:` / **`staff:STxxxx`** (gs:10925, 10978); LINE queue `enqueueNoti_` (CLAUDE.md Sprint 3).
- Aging/overdue precedent: `shipPendingAging_` (gs:10178). Prioritization precedent: `abcClassify` (views-analytics.jsx:1371).
- Product Owner is separate and built (gs:11347) — satisfies D03 "Owner ≠ Reviewer."

**Can Model C reuse this? Mostly yes — with one real gap (hidden dependency):**
- ✅ Request/due/notification/audit pattern is directly reusable.
- ⚠️ **Assignee dimension mismatch:** the stock-check split is **frontstore/warehouse** (`fs`/`wh`), not an arbitrary **"Review Team."** Model C needs Supplier → **Review Team** as the responsible party. Mapping "Review Team" onto the fs/wh split is a poor fit; a cleaner approach is a separate assignee/team field or reusing `staff:STxxxx` targeting for the reviewer. This is a **design decision**, not a blocker. `OWNER DECISION REQUIRED` on Review-Team modeling.
- ⚠️ Current stock-check is **SKU-centric** (skus/names). Supplier Review is **supplier-centric** (review a supplier). The `suppliers` column exists but the request keying is per-SKU-list. Needs a supplier-keyed request shape. PROPOSED.

**Implementation-level flow (PROPOSED — no code written):**
```
Supplier (ERP)
  → create Review Request  (reuse createStockCheckRequest_-style writer, supplier-keyed)
  → assign Review Team     (new assignee field or staff:STxxxx targeting)
  → set due date           (existing due pattern)
  → notify assignee        (pushInappNoti_ audience staff:/role:, + LINE queue if warranted)
  → review result recorded (status + actor via resolveSession_)
  → overdue detection      (shipPendingAging_-style age check → notify)
  → completion             (completeStockCheckRequest_-style, session-verified actor)
  → audit                  (writeAuditLog_ / writeAuditLogBatch_)
```
No new notification engine (D03 honored).

---

## §9. ZORT Sync — field by field

Legend: dir = data flow. "AS-IS" = today's code. "TO-BE" per D02/D04 (⚠️ where D02 is multi-option, TO-BE authority is `OWNER DECISION REQUIRED`).

| Field | AS-IS source & dir | Evidence | TO-BE authority | TO-BE dir | Conflict rule | Fallback | Migration need |
|---|---|---|---|---|---|---|---|
| SKU | ERP create → ZORT; else immutable | gs:7588 | ERP | ERP→ZORT | domain→ERP | — | preserve existing |
| Type/Form | ZORT→sheet (as category) | syncNewProductsFromZort | ⚠️ not locked | ⚠️ | domain→ERP (if ERP) | category text | build field + backfill |
| Variant | none (SKU substring) | views-main.jsx:3604 | ⚠️ not locked | ⚠️ | domain→ERP (if ERP) | parse from SKU | derive from SKU |
| Name | ZORT→sheet | syncNewProductsFromZort | ⚠️ not locked | ⚠️ | domain→ERP (if ERP) | ZORT name | backfill |
| Category | ZORT→sheet | gs:9894 | ⚠️ not locked | ⚠️ | domain→ERP (if ERP) | ZORT category | backfill |
| Supplier | ZORT tag/vendor→sheet | gs:9895,9896 | ERP | ERP-internal (not pushed) | ERP wins | tag | own in ERP |
| Owner | ERP only | gs:11347 | ERP | ERP-internal | ERP wins | — | reuse |
| Cost | ZORT→ERP | CLAUDE.md/D04 | ZORT | ZORT→ERP | operational→ZORT | cache | read-only cache |
| Sell price | ZORT sellprice + FE ×1.25 | views-main.jsx:9366; gs:297 | ⚠️ not locked | ⚠️ | domain→ERP (if ERP) | ZORT price | reconcile 1.25/0.8 |
| Image | ZORT(colE)/ERP(colD); ZORT wins | gs:5468,5490,8010 | ERP owns, ZORT preferred | ZORT→ERP (preferred) | image: ZORT preferred | col D manual | matches target |
| Barcode | `=sku` at create | gs:7588 | ⚠️ not locked; preserve legacy | ⚠️ | domain→ERP (if ERP) | sku | preserve exceptions (list NOT RECOVERABLE) |
| Qty (stock) | ZORT→sheet (`syncZortToColumn_`); ERP→ZORT (`pushStockToZort_`) | gs:8347,5433 | ZORT | ZORT master; ERP push on movements | operational→ZORT (ZORT truth) | — | none |

**Concurrent-change (both sides change) — CONFIRMED direction of current risk:** today domain fields flow **ZORT→ERP** (via `syncNewProductsFromZort`/sync). If TO-BE makes ERP the domain master, the next ZORT sync must **not** overwrite ERP-authoritative fields — otherwise ERP edits are silently reverted (this is the exact class of "silent overwrite" bug CLAUDE.md repeatedly warns about). This requires a per-field "who-wins" guard in the sync, which does **not exist today**. PROPOSED; high-attention item.

**Do not describe as "sync" generically:** each field above has an explicit direction + conflict rule per D04 (domain→ERP wins, operational→ZORT wins), except the multi-option fields which are `OWNER DECISION REQUIRED`.

---

## §10. Images

- **Source of truth (association/metadata):** ERP `imageUrl` sheet — col D manual (`writeManualProductImage_`, gs:7959), col E ZORT-auto (`uploadProductPhoto`/`syncZortImages`, gs:7995/5490).
- **Display source:** `readImageMap_` makes **col E (ZORT) win over col D (manual)** (gs:8010 comment; `readProducts_` uses imageMap first, gs:9890).
- **Fallback source:** col D manual (ERP), then meta `r[3]` (gs:9890).
- `pickZortImage_` selects a usable ZORT URL (gs:5468); `fetchProductImage` pulls on-demand (gs:8011).

**Verdict:** AS-IS **already matches D02** (ERP owns association; ZORT image preferred; ERP fallback). No authority change needed — CONFIRMED AS-IS. Only cleanup (temp-photo lifecycle) is incidental.

---

## §11. Pricing

**AS-IS (CONFIRMED):**
- Frontend `RETAIL_MULT = 1.25`; `retail = round(wholesale × 1.25)` (views-main.jsx:9366, 9369).
- Backend `WHOLESALE_RATIO_DEFAULT = 0.8`; `wholesaleRatio_()` reads Script Property `WHOLESALE_RATIO`, range `0 < r ≤ 1` (gs:297–304).
- **1 / 1.25 = 0.8** — reciprocal constants describing one 0.80 relationship.
- Sell price today originates from ZORT `sellprice` / sheets; `p.price` shared across POS/quote/stock-value; `CLAUDE.md` warns not to mutate `p.price`.
- Sales-average fallback for "should order" quantity uses `completeMonths` (CLAUDE.md dashboard rules) — separate from price.

**TO-BE (D02/D04):** ERP as Sell-price master (⚠️ D02 Work 7 marks direction multi-option → `OWNER DECISION REQUIRED`). Cost stays ZORT.

**Conversion formula (do not invent a new rule):** the existing 0.80 wholesale ratio is the only conversion in code. If ERP becomes price master, decide whether ERP stores **retail** (and derives wholesale ×0.8) or stores **wholesale** (and derives retail ×1.25) — both are consistent with today's constants; the choice is `OWNER DECISION REQUIRED`.
- **Storage:** today price sits in stock sheet col I + meta; TO-BE would move authority into Registry.
- **Display:** POS/quote/stock-value read one price; must remain single-sourced.
- **Sync:** if ERP master, push price ERP→ZORT and guard against ZORT overwrite (§9).
- **CSV note:** earlier CSV reportedly observed the same 0.80 — recorded as previously-reported only; **not re-verifiable** (D05).

---

## §12. Permissions

**Roles in code (CONFIRMED):** `owner, dev, saler, warehouse, frontstore, employee, storedevice` (`VALID_ROLES`, gs:1046). Gating via `ROLE_ACTIONS_`/`COMMON_ACTIONS_`/`IMMEDIATE_GATE_ACTIONS_`/`IMMEDIATE_GATE_STRICT_ACTIONS_`, master switch `REQUIRE_LOGIN` (off by default) (gs:786, 941). Actor is session-verified server-side.

| Action | Current roles (AS-IS) | Required role (TO-BE) | Risk |
|---|---|---|---|
| create product (`addNewProduct`) | owner/dev + warehouse (AddProductView; in `COMMON_ACTIONS_`-ish gs:941) | owner/dev/warehouse | Med — writes ZORT + stock |
| edit product | **none (no path)** | `OWNER DECISION REQUIRED` | — |
| assign owner (`setProductOwner`) | session-derived; owner/dev may target others | owner/dev + self | Low (label only) |
| reserve SKU | **none (no path)** | server-only, same as create | High — identity integrity |
| manage registry | **none** | owner/dev | High |
| supplier review — create | (precedent `createStockCheck`: owner/dev/saler/storedevice, gs:851–870) | Review Team + owner/dev | Med — `OWNER DECISION REQUIRED` (who is Review Team) |
| supplier review — approve/complete | (precedent `completeStockCheck`) | Review Team | Med |
| price edit | **none** | `OWNER DECISION REQUIRED` | High — money |
| image edit (`uploadProductPhoto`) | present | owner/dev/warehouse | Low |
| archive/hide product | GAS-editor tools only (owner-run) | owner/dev | Med — visibility |
| migration | **none** | owner/dev only | High — data |
| sync override (`syncZortNow` etc.) | present (gs:2712–2720) | owner/dev | Med |

Several rows are `OWNER DECISION REQUIRED` because the Spec does not lock role assignments for the new product-domain actions (§15 of Spec marks these NOT RECOVERABLE / to-be-defined).

---

## §13. Migration Dependency Map

**No migration performed.** Dependency ordering (each: prerequisite → reversible? destructive? preview? validation gate). **All counts are provenance-gated (D05) — not asserted.**

| # | Step | Prerequisite | Reversible? | Destructive? | Preview possible? | Validation gate |
|---|---|---|---|---|---|---|
| 1 | Registry foundation | schema decided (NOT RECOVERABLE → owner) | Yes (additive) | No | Yes | schema review |
| 2 | Product Type/Form | (1) | Yes | No | Yes | taxonomy confirmed (owner) |
| 3 | Business Family | (1),(2) | Yes | No | Yes | definition confirmed (owner) |
| 4 | Variant metadata | (1); parse from SKU | Yes | No | Yes | variant rules per category (owner) |
| 5 | SKU mapping (link existing SKU → registry) | (1)–(4) | Yes (read-preserving) | **No — existing SKU must not change (D01/D02)** | Yes | zero-SKU-mutation assertion |
| 6 | Legacy `L` freeze | (1),(5) | Yes (config flag) | No | Yes | frozen-set config review |
| 7 | Supplier mapping | (1) | Yes | No | Yes | supplier list reconciled |
| 8 | Owner mapping | Owner feature (built) | Yes | No | Yes | existing (`applyProductOwnerAssign` preview) |
| 9 | Price mapping | (1); price authority decided (owner) | Yes | **Risk if overwrites live price** | Yes | price-parity check vs current |
| 10 | Image mapping | none (matches target) | Yes | No | Yes | col D/E integrity |
| 11 | ZORT sync (who-wins guards) | (1)–(9) | Partial | **Risk — could overwrite ERP edits** | Yes (dry-run) | per-field direction guard tests |
| 12 | Reporting | (1)–(11) | Yes | No | Yes | totals reconcile |

**Hard constraint (D01/D02):** existing/printed SKU strings must never change → step 5 must be a **link/annotate**, never a rewrite; a "zero SKU mutations" assertion is the gate.

---

## §14. Rollout Plan (phased, deployable)

Ordering adjusted from the generic template to match code reality (rationale inline). Every phase is additive + flag-gated (`*_ENABLED` + `setup*/disable*`, per §16 of Spec and gs precedent).

| Phase | Goal | Files likely touched | BE/FE | Migration risk | Test requirements | Rollback | Production gate |
|---|---|---|---|---|---|---|---|
| **0 — Observability + flags** | Add `PRODUCT_REGISTRY_ENABLED`-style flag(s); logging; no behavior change | `appsscript_complete.gs` (flag readers), `service-worker.js` (cache bump if FE) | BE(+FE) | None | flag off = no-op tests | flip flag off | flag defaults OFF |
| **A — Registry foundation (read-only)** | Registry store + `readProducts_` reads it additively | gs (`readProducts_`, new sheet accessor) | BE | Low (additive) | eval-from-source, drift-guard | disable flag | owner-run `setup*` |
| **B — Domain model surface (read-only)** | Expose Type/Form/Variant/Family in payload without editing | gs (payload), `views-*.jsx` (display) | BE+FE | Low | payload-variant tests, browser | flag off | flag |
| **C — Backend SKU reservation** | Replace client max+1 with server allocation; enforce `L` freeze here (§7) | gs (`addNewProduct`, new reserve fn), views-main.jsx (call reserve) | BE+FE | Med (identity) | concurrent-create, dup, L-reject (unit, eval-from-source) | keep old path behind flag | flag; staged |
| **D — Product creation (guided)** | Type/Form→Variant→SKU guided flow | views-main.jsx (`AddProductView`), gs | FE+BE | Med | browser + creation integration | flag off → old form | flag |
| **E — Supplier Review (Model C)** | Reuse stock-check/notification; Review-Team assignee | gs (request writer, aging), views-analytics.jsx | BE+FE | Low | request/due/overdue/owner≠reviewer | flag off | flag; **owner decision on Review Team first** |
| **F — Product edit** | Edit domain fields per locked D02 authority | gs (new edit action + push), views-main.jsx | BE+FE | Med | field-ownership, SKU-immutable, cost read-only | flag off | **owner must lock D02 directions first** |
| **G — ZORT sync who-wins guards** | Per-field direction + conflict guards (§9) | gs (`syncZortBoth`, `syncNewProductsFromZort`) | BE | **High — silent overwrite risk** | sync-conflict dry-run tests | disable guard / revert | staged; dry-run first |
| **H — Migration / backfill** | Populate registry; link SKUs (no mutation); price/supplier/owner mapping | gs tools (owner-run, preview-first) | BE | **High** | migration dry-run + zero-SKU-mutation | preview→apply, reversible steps | **provenance (D05) for scale-dependent parts** |
| **I — Cleanup** | Remove legacy client generation, temp-photo lifecycle | views-main.jsx, gs | BE+FE | Low | regression | keep behind flag until stable | after H stable |

**Why this order:** C (reservation) precedes D (creation) because guided creation must generate identities safely first; G (sync guards) precedes H (backfill) because backfilling ERP-authoritative data before the sync respects it would let the next ZORT sync silently revert it (§9). F (edit) is gated on D02 directions being locked (§16 C-1).

---

## §15. Test Strategy (pre-coding matrix)

Follow repo conventions: authority/security logic = **eval-from-source** (auth.test.js pattern), meta-tests lock silent-break seams, browser tests use `hasAllText`. **No production API calls.**

| Scenario | Level | Notes |
|---|---|---|
| Duplicate SKU rejected | Unit (eval `addNewProduct`/`collectExistingSkus_`) | already dedup; keep |
| Concurrent SKU creation → single winner, loser gets next free (post-reservation) | Integration (simulated lock) | new for Phase C |
| Legacy `L` rejected for new SKU | Unit (eval reservation/`addNewProduct`) | Phase C/§7 |
| Existing `L` SKU still readable/usable | Unit + browser | D01 preservation |
| Variant metadata create/read | Unit + integration | Phase B/D |
| Product edit respects field ownership (SKU locked, Cost read-only) | Unit (eval edit action) | Phase F; needs D02 locked |
| Supplier review assignment (Review Team) | Integration | Phase E |
| Overdue notification fires once/day, correct audience | Unit (eval aging + `inappAudienceMatch_`) | Phase E |
| Owner ≠ Reviewer enforced | Unit | D03 |
| ZORT sync conflict — ERP-authoritative field not overwritten | Integration dry-run | Phase G (critical) |
| Image fallback (ZORT missing → col D) | Unit (eval `readImageMap_`/`pickZortImage_`) | matches AS-IS |
| Price conversion parity (1.25 / 0.8) | Unit | Phase F/H |
| Permission denial for unauthorized role | Unit (eval `canDoOrNull_`/gate tables) | Phase C–F |
| Rollback: flag off restores prior behavior | Integration | every phase |
| Migration dry-run: zero SKU mutations | Migration dry-run | Phase H (gate) |

---

## §16. Risks / Conflicts

**Conflicts (reported, not reconciled — guardrail #7):**

- **C-1 — D02 direction disagreement (HIGH).** Work 6 Spec **§8 locks** Type/Form, Variant, Name, Category, Sell price, Barcode as **ERP master, ERP→ZORT**; Work 7 D02 presents them as **multi-option ("ERP/ZORT/both")**. Evidence: Spec §8 table vs Work 7 D02 table. → `OWNER DECISION REQUIRED`. Options: (a) confirm Spec §8 (ERP→ZORT) stands; (b) reopen per-field; (c) set some "both" with a who-wins rule. **Do not proceed to Phase F (edit) until resolved.** I do not choose.
- **C-2 — Domain-field flow reversed vs D04 (HIGH).** AS-IS domain fields flow **ZORT→ERP** (`syncNewProductsFromZort`); D04 TO-BE wants ERP as domain master. Evidence: gs `syncNewProductsFromZort` (writes name/category/tag/sellprice from ZORT); D04. → not a contradiction to reconcile silently; it's the core migration gap. Needs Phase G who-wins guards before Phase H.
- **C-3 — Grammar assumptions absent (MED).** Work 7 request names "suffix-letter" and "fullword" SKU grammars; **neither exists in code.** → `NOT RECOVERABLE`; do not build to them. Only `parseSkuParts`/`suggestNextSku`/`mtoSkuPrefix_` exist.
- **C-4 — `suggestNextSku` vs standard grammar (MED).** `suggestNextSku` recognizes `[A-Za-z]+\d+`, not the standard `[A-Z]{1,3}\d{2}\d{3}`; CLAUDE.md flags it as not business-rule-aware. Evidence: views-main.jsx:3540 vs 3603. → governed by standard grammar + Phase C reservation; legacy helper superseded.
- **C-5 — Creation is ZORT-first (MED).** `addNewProduct` writes ZORT before sheets; a sheet-write crash leaves ZORT ahead (SELF-HEAL later reconciles). Evidence: gs:7600–7627. → acceptable AS-IS but note for reservation redesign (Phase C).

**Risks:**
- **R-1 (HIGH):** ZORT sync silently overwriting ERP-authoritative edits once ERP becomes domain master (§9/C-2). Mitigation: Phase G before Phase H.
- **R-2 (HIGH):** SKU identity integrity during reservation rollout (race). Mitigation: server allocation under existing lock; keep old path behind flag.
- **R-3 (HIGH):** any migration touching SKU strings violates D01/D02. Mitigation: link-not-rewrite + zero-mutation gate.
- **R-4 (MED):** provenance UNKNOWN (D05) → scale-dependent migration steps mis-sized. Mitigation: derive counts from live data with owner; keep gated.
- **R-5 (MED):** Review-Team modeling onto fs/wh split is a poor fit (§8). Mitigation: owner decision before Phase E.

---

## §17. Final Readiness Gate

### 🟢 READY TO CODE (foundation — no owner decision needed)
- **Phase 0** (flags/observability) — pattern exists (gs:11200,11425).
- **Phase A** (Registry read-only scaffolding) **once schema is agreed** — additive; `readProducts_` is the integration point (gs:9869). *(Schema itself is NOT RECOVERABLE → needs a short owner confirmation, see 🟡.)*
- **Phase C** backend SKU **reservation + `L` freeze** — authoritative point identified (`addNewProduct`, gs:7563); `L` freeze rule is config-driven and does not need production counts. D01 is locked.
- **Image** work — AS-IS already matches D02 (§10); safe.
- **Product Owner** reuse — built (gs:11347).

### 🟡 NEED OWNER DECISION (blocks the dependent phase)
1. **D02 field directions** for Type/Form, Variant, Name, Category, Sell price, Barcode (C-1) → blocks **Phase F (edit)** and price authority.
2. **Registry schema / Business Family & Type-Form definitions** (NOT RECOVERABLE) → blocks **Phase A/B** detail and **D**.
3. **Sell-price storage choice** (store retail vs wholesale; §11) → blocks price migration.
4. **Review-Team modeling** for Model C (§8, R-5) → blocks **Phase E**.
5. **Role assignments** for new product actions (§12) → blocks gating in C–F.
6. **Per-category Variant rules** beyond colors (NOT RECOVERABLE) → blocks **Variant** metadata backfill.

### 🔴 ARCHITECTURE / CODE GAP (must be built; not just decided)
- No Registry / Family / Type-Form / Variant storage (§3, §6).
- No backend SKU reservation (§4).
- No product-edit path at all (§5).
- No ZORT sync who-wins guards; domain flow currently reversed vs D04 (§9, C-2).
- No `L` freeze enforcement (§7).
- No Supplier Review implementation (§8).

### "If coding starts tomorrow, what forces a mid-way stop?" (specific + evidence)
1. **Starting Phase F (product edit) before D02 directions are locked** — you'd be guessing authority for 6 fields (C-1; Spec §8 vs Work 7 D02). **Stop.**
2. **Starting Phase A/D against an undefined Registry schema** — schema is NOT RECOVERABLE; building a concrete sheet now = inventing architecture (guardrail). **Stop until owner confirms.**
3. **Backfilling ERP-authoritative domain data (Phase H) before Phase G sync guards** — the next `syncZortBoth`/`syncNewProductsFromZort` would silently overwrite it (C-2, gs:8346; R-1). **Stop.**
4. **Any migration sizing that relies on lost CSV counts** — D05 UNKNOWN; numbers unavailable (R-4). **Stop / derive from live data.**
5. **Modeling Supplier Review on the fs/wh split** without deciding Review-Team representation (§8, R-5). **Stop before Phase E.**

**Recommended first coding phase:** **Phase 0 (flags/observability) → Phase C (backend SKU reservation + `L` freeze).** Both are 🟢: D01 is locked, the enforcement point (`addNewProduct`, gs:7563) and the race (client `nextModelForPrefix`, views-main.jsx:9325) are confirmed, no lost-doc dependency, and they remove the highest-integrity risk (R-2) first — all while the 🟡 owner decisions (especially C-1) are gathered in parallel for the later edit/sync/migration phases.

---

*End of Work 7 readiness audit. This document authorizes no code changes; it is a planning artifact. Owner decisions in §17 🟡 and conflicts in §16 must be resolved before their dependent phases.*
