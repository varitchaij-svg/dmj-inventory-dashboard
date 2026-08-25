# Product Implementation Specification (Phase 2 / Work 6)

> **Status:** RECONSTRUCTED — not a verbatim recovery of the lost original.
> **Document type:** Implementation contract derived from completed Phase 2 architecture work.
> **Scope of this file:** Documentation only. No code, no sheets, no migration, no deploy.
> **Reconstructed on:** 2026-08-25 (branch `claude/product-spec-phase-2-work-6-v43vwx`)

---

## §0. Provenance & Recoverability Notice (READ FIRST)

This document is a **reconstruction**. The original `docs/PRODUCT-IMPLEMENTATION-SPEC.md`
authored in the previous Work 6 session was **never committed** and was lost when its
ephemeral container was reclaimed. This reconstruction was rebuilt from the sources that
actually survive in this repository plus the owner-supplied locked decisions.

### What survives and is authoritative here

| Source | Status | Used for |
|---|---|---|
| **Locked Owner Decisions D01–D05** (supplied directly in the Work 6 task prompt) | AUTHORITATIVE (owner input) | All decision-level content |
| **Owner implementation principles / scope / pricing facts / product-creation requirement** (task prompt) | AUTHORITATIVE (owner input) | TO-BE direction |
| **Actual code** (`appsscript_complete.gs`, `views-main.jsx`, `views-analytics.jsx`, `app.jsx`) | VERIFIED (read at reconstruction time) | AS-IS facts, cited by `file:line` |
| **`CLAUDE.md`** (checked into repo) | VERIFIED (surviving repo artifact) | AS-IS system documentation |

### What does NOT survive — treated as NOT RECOVERABLE

The following expected Phase 2 architecture documents were searched for exhaustively
(working tree, all local/remote branches, every reachable git object, the single dangling
commit, `/tmp`, and the scratchpad) and **do not exist anywhere in this repository or its
history**:

1. `docs/PRODUCT-CREATION-ARCHITECTURE-REVIEW.md` — **NOT RECOVERABLE**
2. `docs/PRODUCT-DOMAIN-ARCHITECTURE.md` — **NOT RECOVERABLE**
3. `docs/PRODUCT-NAMING-AND-SKU-ARCHITECTURE.md` — **NOT RECOVERABLE**
4. `docs/PRODUCT-DATA-EVIDENCE-REVIEW.md` — **NOT RECOVERABLE**
5. `docs/PRODUCT-NAMING-SKU-FORENSIC-ANALYSIS.md` — **NOT RECOVERABLE**
6. `docs/PRODUCT-FAMILY-ARCHITECTURE-DECISION.md` — **NOT RECOVERABLE**
7. `docs/PRODUCT-REGISTRY-ARCHITECTURE.md` — **NOT RECOVERABLE**

**Consequences of this loss (do not paper over these):**

- The **specific terminology, formal definitions, and detailed conclusions** of the
  architecture docs cannot be reproduced. Where this spec names a Phase 2 concept
  (Business Family, Product Type/Form, Variant), it preserves the concept **as the owner
  restated it in the Work 6 prompt** and marks the missing formal definition as NOT
  RECOVERABLE — it is not invented from generic best practice.
- The **original section numbering/titles** of the lost `PRODUCT-IMPLEMENTATION-SPEC.md`
  are **NOT RECOVERABLE**. The 19-section structure below is reconstructed from the
  owner-supplied Implementation Scope list. Section titles are reconstructed, not verbatim.
- The **forensic CSV** (historical checksum `d6d7e14dbe3285706ee2d0aafad36550`) is not
  present. Its numeric/production statistics are **NOT RECOVERABLE** and are **not** cited
  as fact anywhere in this document. Dataset provenance = UNKNOWN (D05).

### Reconstruction rules applied

- No fabricated prose or invented historical detail.
- Every AS-IS claim is cited to a code location or `CLAUDE.md`.
- Every decision-level claim is cited to D01–D05.
- Anything not derivable from a surviving source is labelled **UNKNOWN / NOT RECOVERABLE**.
- AS-IS (what the code does today) and TO-BE (the target contract) are kept explicitly separate.

---

## Decision Gate Summary

| Gate | State | Basis |
|---|---|---|
| **Architecture** | CLOSED | Owner decisions D01–D05 (Phase 2 arch work completed; source docs lost but conclusions locked by owner) |
| **Business Decision Gate** | CLOSED | D01–D05 all APPROVED |
| **Dataset / Migration Data Provenance** | **UNKNOWN** | D05 — forensic CSV unavailable |
| **Coding Readiness (foundation)** | READY | See §19 |
| **Coding Readiness (production-scale migration)** | GATED | Blocked by provenance (D05) — see §17, §19 |

---

## §1. Product Registry

**Nature:** TO-BE. There is **no Product Registry in the current codebase.** Product data
today lives across Google Sheets read by GAS:

- `SHEET_PRODUCTS = "อัพเดทจำนวนสินค้า"` — stock/qty/price rows
  (`appsscript_complete.gs:185`)
- `SHEET_PRODUCT_META = "ข้อมูลสินค้า"` — name/category/price metadata
  (`appsscript_complete.gs:193`)
- `SHEET_IMAGE_URL = "imageUrl"` — image association (`appsscript_complete.gs:192`)
- `SHEET_HIDDEN_PRODUCTS = "สินค้าที่ซ่อน"` — soft-delete of products removed from ZORT
  (`appsscript_complete.gs:203`)
- `readProducts_` merges these and contains a SELF-HEAL block that surfaces products present
  in the stock sheet but not yet in meta (`CLAUDE.md`, Sprint 2 AddProduct notes).

**Contract:**

- The Registry is the ERP **domain master** store for product metadata (per D04).
- Registry rollout MUST be **additive and backward-compatible** (owner Implementation
  Principles). Existing sheets/consumers must keep working during and after introduction.
- Registry MUST continue to represent legacy products, including legacy `L` namespace
  products (D01), and legacy barcode exceptions (D02).
- **NOT RECOVERABLE:** the Registry's concrete schema, sheet name(s), column layout, and the
  exact relationship model between Registry and the existing meta/stock sheets. These were
  defined in `PRODUCT-REGISTRY-ARCHITECTURE.md`, which is lost. Do not invent them; they must
  be re-derived (with the owner) before Registry implementation.

---

## §2. Business Family

**Nature:** TO-BE architecture concept (owner-locked to be preserved).

- The owner directs (Implementation Principles): **"Preserve the architecture conclusions
  already established: Business Family, Product Type/Form, Variant, SKU. Do not collapse
  these concepts back into prefix+model."**
- **AS-IS:** the code has **no** "Business Family" concept. The only structural decomposition
  that exists is `parseSkuParts` → `{prefix, variant, model}` (`views-main.jsx:3603`), i.e.
  the prefix+model model that the architecture explicitly moved beyond.
- **Contract:** Business Family is a domain grouping above Product Type/Form. It is
  ERP-owned domain data (consistent with D02/D04 treating product classification as ERP
  master).
- **NOT RECOVERABLE:** the formal definition of "Business Family", its attributes, its
  cardinality against Product Type/Form, and any worked examples. These lived in
  `PRODUCT-FAMILY-ARCHITECTURE-DECISION.md` / `PRODUCT-DOMAIN-ARCHITECTURE.md` (both lost).
  The concept name is preserved; the definition must be recovered from the owner, not invented.

---

## §3. Product Type / Form

**Nature:** TO-BE architecture concept (owner-locked to be preserved).

- **Field ownership (D02):** Product Type/Form is **ERP domain master**, and syncs **ERP → ZORT** (D04).
- **AS-IS:** no distinct "Type/Form" field exists. `SHEET_PRODUCT_META` carries a free-text
  category; SKU prefix informally encodes "product type" per company SKU rules
  (`CLAUDE.md` → Business Rule: SKU; e.g. `OL`=olive, `R`=rose).
- **Contract:** Product Type/Form is the ERP-owned classification that (together with
  Variant) drives SKU generation (§5) and the guided Add Product flow (§7).
- **NOT RECOVERABLE:** the enumerated Type/Form taxonomy and its mapping to SKU prefixes.
  Lived in `PRODUCT-NAMING-AND-SKU-ARCHITECTURE.md` / `PRODUCT-DOMAIN-ARCHITECTURE.md`. Must
  be recovered with the owner before code relies on it.

---

## §4. Variant

**Nature:** partially AS-IS (variant code exists in SKU grammar), elevated to a first-class
concept in TO-BE.

- **Field ownership (D02):** Variant is **ERP domain master**, syncs **ERP → ZORT** (D04).
- **AS-IS (verified):**
  - SKU grammar carries a 2-digit Variant Code: `parseSkuParts` matches
    `^([A-Z]{1,3})(\d{2})(\d{3})$` → the middle 2 digits are the variant
    (`views-main.jsx:3604`).
  - `VARIANT_COLOR_CODES` is the company color source-of-truth table (codes 01–99), used by
    the Add Product SKU builder (`views-main.jsx:3570`; mirrored in `CLAUDE.md`).
  - Some categories (leaves/branches/equipment) use size/sequence codes instead of color —
    per-category variant rule is **not** hard-coded and must be asked of the user
    (`CLAUDE.md` → Variant Rule per category).
- **Contract:** Variant remains ERP-owned; color codes must not be minted ad hoc (existing
  rule). Variant participates in SKU generation (§5).
- **NOT RECOVERABLE:** the full per-category Variant-rule mapping (color vs size vs sequence)
  as an architecture table. Only the color table survives in code; the rest remains
  "ask the owner" as documented today.

---

## §5. SKU Generation / Reservation

**Nature:** AS-IS is client-side and race-prone; TO-BE requires backend authority.

### AS-IS (verified)

- `suggestNextSku(category, products)` — **client-side** "base + max trailing number + 1"
  over the client's `products` array; recognizes shape `^[A-Za-z]+\d+$`
  (`views-main.jsx:3540`). `CLAUDE.md` explicitly notes this helper "ไม่รู้จัก business rule"
  (does not know the standard SKU rule).
- `nextModelForPrefix(prefix, products)` — **client-side** max(model)+1 over the client
  `products` array for the standard grammar (`views-main.jsx:3612`).
- `parseSkuParts` — parses `[A-Z]{1,3}` + `\d{2}` + `\d{3}` (`views-main.jsx:3603`).
- Backend `addNewProduct` (`appsscript_complete.gs:7563`):
  - takes a **client-supplied** SKU;
  - takes `LockService.getScriptLock()` around check-then-write (`:7575`);
  - rejects duplicates via `collectExistingSkus_` (`:7580–7581`);
  - **does NOT allocate or reserve** the next SKU — it only rejects a collision.

**Race condition (owner-cited, confirmed):** because the *number selection* happens
client-side against a possibly-stale `products` array and the backend only rejects
duplicates (rather than reserving), two concurrent creators can compute the same next
number; the loser receives a hard "SKU already exists" error instead of being handed the
next free identity.

### TO-BE contract (owner-locked)

- **New SKU generation must use backend authority / reservation.** (owner Product Creation
  Requirement)
- **Do not continue client-only max+1 generation where race conditions exist.** (owner)
- The system guides **Product Type/Form → Variant → SKU generation** (§7); the user must not
  have to understand SKU grammar manually (owner).
- SKU, once generated, is **immutable** (D02) — see §6.
- **NOT RECOVERABLE:** the reservation protocol design (e.g., reservation record shape,
  TTL, allocation algorithm, collision-retry semantics). Lived in
  `PRODUCT-NAMING-AND-SKU-ARCHITECTURE.md` / `PRODUCT-REGISTRY-ARCHITECTURE.md`. Must be
  designed with the owner before implementation.

---

## §6. Legacy SKU Handling

**Nature:** owner-locked decision (D01), forward-looking — no current implementation.

### D01 — Legacy `L`: APPROVED = FREEZE

- Existing `L` SKUs **remain valid**.
- Existing `L` SKUs **must not be changed** (consistent with SKU immutability, §6/D02).
- ERP **must not generate new `L` SKUs** (the `L` namespace is contaminated/frozen).
- Registry / reporting / migration **must continue supporting legacy `L`**.
- New products **must use a clean namespace/Form** (§2–§5).

### SKU immutability (D02)

- **SKU is immutable and never editable** under any path (§8 confirms edit UI must exclude it).

### AS-IS (verified)

- There is **no** `L`-namespace freeze logic in the code today. A search for legacy-`L`
  handling found only the unrelated `LegacyLoginScreen` (login, `app.jsx:545`). The `L`
  freeze is therefore a **new** control to be implemented in the generation/reservation path
  (§5) and Registry (§1).
- **NOT RECOVERABLE:** the evidence and rationale that made `L` "contaminated" (the forensic
  analysis). Lived in `PRODUCT-NAMING-SKU-FORENSIC-ANALYSIS.md` + the forensic CSV (both
  lost). The **decision** (FREEZE) is authoritative via D01; the **supporting statistics**
  are NOT RECOVERABLE (see D05, §17).

---

## §7. Product Creation

**Nature:** AS-IS form exists; TO-BE adds guided, backend-authoritative flow.

### AS-IS (verified)

- `AddProductView` (`views-main.jsx`, owner+warehouse) provides a 3-part SKU builder
  `[Prefix][Variant 2-digit][Model 3-digit]` with "🆕 new design" vs "🎨 new color of existing
  design" modes, using `nextModelForPrefix` / `parseSkuParts` / `VARIANT_COLOR_CODES`
  (`CLAUDE.md` → Sprint 2). SKU selection is **client-side** (§5 AS-IS).
- Duplicate check is 2-layer: client (`data.products`) + server `checkSkuExists` across 2
  sheets (`appsscript_complete.gs:7552`).
- On submit, `addNewProduct` posts `/Product/AddProduct` to ZORT with `barcode = sku`
  (`appsscript_complete.gs:7588`), sets initial stock via `pushStockToZort_`, appends the
  stock sheet, writes audit, `invalidateCache_()`.

### TO-BE contract (owner-locked)

- Product creation should **not** make the user manually understand SKU grammar.
- The system **guides** Product Type/Form → Variant → SKU generation.
- **Search existing products before creating a new Product Type/Form** (avoid duplicate
  type/form proliferation).
- **New SKU generation must use backend authority/reservation** (§5); stop client-only
  max+1.
- Existing SKU remains immutable (D02).
- Legacy contaminated namespaces such as `L` must not continue generating new IDs (D01).
- **Do not invent UI details not supported by the architecture docs.** Because
  `PRODUCT-CREATION-ARCHITECTURE-REVIEW.md` is lost, specific screen/step wording beyond the
  above owner-stated direction is **NOT RECOVERABLE** and must not be fabricated.

---

## §8. Product Edit / Field Ownership

**Nature:** owner-locked (D02). Authoritative ownership matrix.

| Field | Master / Authority | Sync direction | Editable in ERP? | Notes |
|---|---|---|---|---|
| **SKU** | — (identity) | — | **No — immutable, never editable** | D02; §5/§6 |
| **Product Type/Form** | ERP domain master | ERP → ZORT | Yes | D02/D04 |
| **Variant** | ERP domain master | ERP → ZORT | Yes | D02/D04 |
| **Name** | ERP domain master | ERP → ZORT | Yes | D02/D04 |
| **Category** | ERP domain master | ERP → ZORT | Yes | D02/D04 |
| **Supplier** | ERP (internal) | ERP-internal (not pushed to ZORT) | Yes | D02/D04 |
| **Owner** | ERP (internal) | ERP-internal | Yes | D02/D04; §10 |
| **Cost** | **ZORT operational master** | ZORT → ERP/cache | **No (read-only cache in ERP)** | D02/D04 |
| **Sell Price** | ERP domain master | ERP → ZORT | Yes | D02/D04; §12 |
| **Image** | ERP owns metadata/association; **ZORT preferred source** | ZORT → ERP (preferred image); ERP holds association + fallback | Association editable; image content preferred from ZORT | D02/D04; §13 |
| **Barcode** | ERP domain master | ERP → ZORT | Yes (**preserve legacy barcode exceptions**) | D02/D04; §14 |

**AS-IS note (verified):** there is currently no unified "product edit" surface enforcing
this matrix; product domain fields largely originate from ZORT sync + sheets. Enforcing this
matrix (especially SKU-immutable, Cost read-only, ERP-as-domain-master) is TO-BE work.

**NOT RECOVERABLE:** any per-field edit-UI specifics beyond the ownership matrix above.

---

## §9. Supplier Review

**Nature:** owner-locked (D03) = **Model C**. Must reuse existing infrastructure.

### D03 — Model C

```
Supplier → Review Team → Review Request → Due Date → Complete / Overdue
Product  → Product Owner
```

- **Reviewer and Product Owner are separate concepts** (a reviewer is not, by default, the
  product owner).
- **Reuse existing infrastructure — do NOT create a new notification engine:**
  - `SHEET_STOCK_CHECK = "คำขอเช็คสินค้า"` (`appsscript_complete.gs:15814`)
  - `createStockCheckRequest_(skus, names, actor, suppliers)` (`:15891`) — already carries a
    `suppliers` column (`COL_CHK_SUPPLIERS = 15`, `:15824`)
  - `completeStockCheckRequest_(reqId, actor, side, roleHint)` (`:15943`)
  - `readStockCheckRequests_` (`:15841`) — with fs/wh split status
    (`COL_CHK_FS_STATUS=9 … COL_CHK_WH_AT=14`)
  - existing due/status pattern (pending / done / overdue derivation)
  - existing notification infrastructure: `pushInappNoti_` with audience `all` /
    `role:...` / **`staff:STxxxx`** (`appsscript_complete.gs:10925`, `:10978`,
    `:10921`), and the LINE queue `enqueueNoti_` (Sprint 3)
  - `staff:STxxxx` targeting for per-person notification.

### Contract

- Supplier Review is expressed as a review **request** over the existing stock-check request
  machinery (which already models supplier, due, and fs/wh completion state).
- Notifications go through `pushInappNoti_` (and, where a LINE push is warranted, the
  existing queue) — **no new engine.**
- Review status is **ERP-internal** master data (D04) and part of what ERP owns (§8 does not
  push it to ZORT).

**AS-IS note:** the stock-check system exists and is used for "should-check-first" queues and
the floating 📤 request button; it already stores suppliers and split status. Supplier Review
is a new *usage* of this infrastructure, not new infrastructure.

**NOT RECOVERABLE:** the precise Review-Team roster model, review cadence/SLA defaults, and any
Model-A/Model-B alternatives that Model C was chosen over. Lived in the lost architecture
docs; only the chosen outcome (Model C) is authoritative.

---

## §10. Product Owner

**Nature:** AS-IS feature exists (Sprint 7); reused as-is by D03.

### AS-IS (verified)

- `SHEET_PRODUCT_OWNER = "ผู้ดูแลสินค้า"` — 1 product = 1 owner; label, **not a permission**
  (`appsscript_complete.gs:202`; `CLAUDE.md` Sprint 7: "เป็น 'ป้ายบอก' ไม่ใช่ 'สิทธิ์'").
- `setProductOwnerHandler_` (`:11347`), gated by `PRODUCT_OWNER_ENABLED` (`:11200`) with
  `setupProductOwner()` / `disableProductOwner()` rollout (`:11425`, `:11432`).
- Owner is derived from **session**, not client-claimed; owner/dev may assign on behalf via
  `targetStaffId` (`CLAUDE.md`).

### Contract

- Owner is an **ERP-internal**, ERP-mastered field (D02/D04), never pushed to ZORT.
- **Owner ≠ Reviewer** (D03): the Product Owner label must not be conflated with Supplier
  Review team assignment.
- Product Owner remains a label (no gating) — must not be turned into an authorization
  mechanism (existing rule; there is a test guarding that `FSCard` has no `disabled` bound to
  ownership).

---

## §11. ZORT Synchronization

**Nature:** owner-locked source-of-truth matrix (D04). Partially AS-IS.

### D04 — Source-of-truth matrix

| Data | Master | Direction |
|---|---|---|
| SKU | ERP | ERP → ZORT |
| Product Type/Form | ERP | ERP → ZORT |
| Variant | ERP | ERP → ZORT |
| Name | ERP | ERP → ZORT |
| Category | ERP | ERP → ZORT |
| Sell Price | ERP | ERP → ZORT |
| Barcode | ERP | ERP → ZORT |
| Supplier | ERP | ERP-internal (not synced) |
| Owner | ERP | ERP-internal (not synced) |
| Review status | ERP | ERP-internal (not synced) |
| **Cost** | **ZORT** | ZORT → ERP |
| **Stock Qty** | **ZORT** | ZORT → ERP |
| **Transactions** | **ZORT** | ZORT → ERP |
| **Operational product status** | **ZORT** | ZORT → ERP |
| **Product image** | **ZORT preferred source** | ZORT → ERP (ERP stores association/metadata + fallback) |

**Conflict rule (D04):**
- **Domain data → ERP wins.**
- **Operational data → ZORT wins.**
- Neither system is master of everything. **Do not describe either system as master of
  everything.**

### AS-IS (verified)

- ZORT is currently the operational master for stock/transactions/cost/status; `syncZortBoth`
  (`appsscript_complete.gs:8338`), `syncZortSales` (`:6693`), `pushStockToZort_` (`:5433`)
  keep sheet numbers aligned to ZORT (ZORT = source of truth for stock, per `CLAUDE.md`).
- Images: ZORT-preferred already implemented — imageUrl sheet col E = ZORT (auto),
  col D = manual ERP fallback; `syncZortImages` writes only col E, ZORT wins over manual
  (`appsscript_complete.gs:5490`; `pickZortImage_` at `:5468`). Matches D04.
- **Gap vs D04:** today product *domain* fields (name/category/price) largely flow **from**
  ZORT/sheets rather than ERP being the authoritative domain master pushing **to** ZORT.
  Making ERP the domain master (ERP → ZORT for the domain fields above) is TO-BE work.
- **NOT RECOVERABLE:** the detailed field-by-field sync sequencing/frequency design and
  conflict-resolution implementation plan. Only the ownership/direction matrix (D04) is
  authoritative.

---

## §12. Pricing

**Nature:** AS-IS verified; TO-BE authority per D02/D04. Migration NOT yet implemented.

### Verified facts (code)

- Frontend `RETAIL_MULT = 1.25`; `retailPrice = round(wholesale × 1.25)`
  (`views-main.jsx:9366`, `:9369`).
- Backend `WHOLESALE_RATIO_DEFAULT = 0.8`; `wholesaleRatio_()` reads Script Property
  `WHOLESALE_RATIO`, falling back to 0.8, valid range `0 < r ≤ 1`
  (`appsscript_complete.gs:297–304`).
- Mathematically **1 / 1.25 = 0.8** — the two constants are reciprocals, i.e. the frontend
  retail markup and the backend wholesale ratio describe the same 0.80 relationship from
  opposite directions.
- `CLAUDE.md` (Dashboard rule 2) documents stock value computed at wholesale
  (`price × wholesaleRatio_()`), and warns **not to mutate `p.price`** because POS/quote use
  the same value.

### CSV corroboration (bounded)

- Earlier CSV analysis is reported (owner prompt) to have observed the same 0.80
  relationship. This is recorded here as **previously reported**, not re-verified: the CSV is
  absent (D05), so the number is **NOT independently re-verifiable** in this reconstruction.

### AS-IS vs TO-BE (kept explicitly separate)

- **AS-IS:** Sell price is effectively a computed retail markup on a wholesale figure via the
  reciprocal constants above; `p.price` (ZORT retail) is treated as the shared price source
  across POS/quote/stock-value.
- **TO-BE (D02/D04):** **Sell Price is ERP domain master**, pushed **ERP → ZORT**. ERP owns
  the authoritative sell price.
- **The pricing migration is NOT implemented.** Do not claim otherwise. Moving sell-price
  authority into ERP (and reconciling the 1.25 / 0.8 constants under a single ERP-owned
  price) is TO-BE work, and any part depending on production-scale price statistics is gated
  by provenance (D05, §17).
- **Cost** is and remains **ZORT master** (D02/D04); ERP holds a read-only cache. (Note:
  `CLAUDE.md` records that ZORT PO cost fields are frequently 0 because POs aren't priced in
  ZORT — so cost completeness is a known operational data-quality caveat, not an ERP concern.)

---

## §13. Images

**Nature:** AS-IS matches TO-BE (D02/D04).

- **ERP owns image metadata/association**; **ZORT is the preferred image source**; if ZORT has
  a usable image, use ZORT; ERP-side image is **fallback** (D02).
- **Verified AS-IS:** imageUrl sheet — col D = manual (ERP fallback), col E = ZORT (auto,
  preferred); `syncZortImages` writes col E only and ZORT wins over manual
  (`appsscript_complete.gs:5490`; `pickZortImage_` `:5468`; `CLAUDE.md` Constants →
  imageUrl sheet). On-demand `fetchProductImage` (`:8011`) pulls a targeted ZORT image and
  writes col E.
- **Contract:** keep ZORT as preferred source; ERP retains association + fallback + metadata.
  No change of authority required — AS-IS already conforms to D04.

---

## §14. Barcode

**Nature:** owner-locked (D02).

- **Barcode is ERP domain master**, syncs **ERP → ZORT**, and **legacy barcode exceptions
  must be preserved** (D02).
- **Verified AS-IS:** at creation, `barcode = sku` (`appsscript_complete.gs:7588`). There is
  a Code128 barcode print mode in the Label tab (git log: "เพิ่มโหมด Barcode (Code128)").
- **Contract:** ERP owns barcode; when barcode differs from SKU for legacy items, that
  exception must be carried through Registry/sync unchanged (do not normalize legacy barcodes
  to equal SKU).
- **NOT RECOVERABLE:** the catalogue of specific legacy barcode exceptions and the rule that
  distinguishes them. Lived in the forensic analysis + CSV (absent). The **requirement** to
  preserve them is authoritative (D02); the **specific exception list** is NOT RECOVERABLE and
  must be sourced from live data with the owner.

---

## §15. Permissions

**Nature:** AS-IS framework exists; TO-BE assignments per new actions.

### AS-IS (verified)

- Role/action gating lives in `ROLE_ACTIONS_`, `COMMON_ACTIONS_`, `IMMEDIATE_GATE_ACTIONS_`
  / `IMMEDIATE_GATE_STRICT_ACTIONS_`, gated overall by `REQUIRE_LOGIN`
  (`appsscript_complete.gs:786`; `CLAUDE.md` → login system). `REQUIRE_LOGIN` currently
  defaults OFF, so most `ROLE_ACTIONS_` are no-ops except the immediate-gate actions.
- Sessions are server-verified via `resolveSession_`; `actor` is overwritten by session
  identity server-side (D-phase 4).
- `createStockCheck` is already permitted for owner/dev + saler/storedevice
  (`appsscript_complete.gs:851–870`); Product Owner assignment is session-derived (§10).

### Contract

- New product-domain write actions (Registry writes, SKU reservation, product edit enforcing
  §8, Supplier Review request/complete) MUST be added to the existing gating tables — do not
  invent a parallel permission system.
- SKU-immutability (D02) is a hard permission: no role may edit SKU.
- Cost is read-only in ERP for all roles (D02/D04).
- Reviewer vs Owner separation (D03) must be reflected in who may create/complete a Supplier
  Review vs who is labelled Product Owner.
- **NOT RECOVERABLE:** the exact role→action assignment table for the new product actions.
  Must be defined against the surviving `ROLE_ACTIONS_` conventions with the owner.

---

## §16. Rollout / Feature Flags

**Nature:** AS-IS pattern is established and must be reused.

### AS-IS (verified) rollout pattern

- Script-Property gate + one-time `setupXxx()` / `disableXxx()`:
  - `PRODUCT_OWNER_ENABLED` + `setupProductOwner()` / `disableProductOwner()`
    (`appsscript_complete.gs:11200`, `:11425`, `:11432`)
  - `INAPP_NOTI_ENABLED` + `setupInappNoti()` / `disableInappNoti()`
  - `NOTI_QUEUE_ENABLED` + `setupNotiSystem()` / `disableNotiSystem()`
  - `REQUIRE_LOGIN` (`:786`)
  - `SUPABASE_BACKUP_ENABLED`
- Deploy of `.gs` is automated via GitHub Actions on merge to `master`; setup functions and
  triggers must be run once by the owner in the GAS editor (`CLAUDE.md` → Deploy process).

### Contract

- **Registry rollout MUST be additive and backward-compatible** (owner Implementation
  Principles): introduce behind a Script-Property flag with a `setup…()` / `disable…()`
  pair, defaulting OFF, so deploying changes nothing until the owner opts in.
- Feature-flag names TBD (e.g. a `PRODUCT_REGISTRY_ENABLED`-style flag) — **NOT RECOVERABLE**
  as an established name; to be chosen with the owner, following the existing convention.

---

## §17. Migration Constraints

**Nature:** owner-locked (D05). This is the gated area.

### D05 — Dataset provenance: APPROVED = UNKNOWN

- The forensic CSV used in earlier work is **not available**.
- Historical checksum on record: `d6d7e14dbe3285706ee2d0aafad36550`.
  **This checksum cannot be re-verified** unless the exact file is recovered (it is absent —
  confirmed at reconstruction; §18).
- **Do not fabricate production statistics.**
- Earlier CSV findings may be treated **only** as previously documented evidence **when
  explicitly cited to a surviving architecture document.** Because **no** architecture
  document survives (§0), such citation is currently impossible → earlier CSV findings are
  **NOT usable as fact** in this reconstruction.
- Dataset provenance remains **UNKNOWN**.

### Constraints

- Provenance UNKNOWN **blocks migration decisions that depend on production-scale numbers**
  (e.g. how many `L` SKUs exist, distribution of variants, how many legacy barcode
  exceptions, dataset-size-driven batch sizing).
- Provenance UNKNOWN **does NOT block** architecture/foundation implementation (§19).
- Any migration step (data backfill into Registry, mass classification of legacy products,
  legacy-`L` inventory reconciliation) MUST NOT rely on the lost CSV's numbers; it must
  re-derive counts from live data with the owner, or remain gated until the dataset is
  recovered/re-established.
- **Backward-compatibility (owner):** migration must not change existing/printed SKU strings
  (D01/D02) and must keep legacy `L` supported.

---

## §18. Testing / Verification

**Nature:** AS-IS test conventions apply; this section also records the reconstruction-time
guardrail verification.

### Test conventions to follow (AS-IS, `CLAUDE.md`)

- New pure logic → add to `tests/helpers.js` with a drift-guard landmark, OR eval the real
  function directly from `.gs`/`.jsx` (preferred for security/authority logic — the
  `auth.test.js` pattern).
- Backend authority code (SKU reservation, permission gates, sync) should be tested by
  **eval-from-source**, not copied, to prevent drift.
- Meta-tests should lock the connection points that "break silently" (the repo's recurring
  failure mode).
- Browser tests (`tests/browser/run.cjs`) assert with `hasAllText` (AND), not `hasText` (OR).

### Guardrails Verification (reconstruction session, 2026-08-25)

| Check | Result |
|---|---|
| Only `docs/PRODUCT-IMPLEMENTATION-SPEC.md` created/modified | ✅ (see §18 command outputs recorded in final report) |
| No `.jsx` modified | ✅ |
| No `.gs` modified | ✅ |
| No `.js` modified | ✅ |
| 7 prior architecture docs unchanged | ✅ **vacuously** — they do not exist in this repo (§0); nothing to change |
| No CSV created/modified | ✅ — no CSV exists in repo; none created |
| CSV checksum `d6d7e14dbe3285706ee2d0aafad36550` | ⚠️ **NOT RE-VERIFIABLE** — source file absent (D05). Recorded as historical only. |
| No Registry sheet created | ✅ |
| No production data migrated | ✅ |
| No SKU modified | ✅ |
| No deploy / commit / push | ✅ (documentation only) |

> The exact `git status` / `git diff --name-only` outputs from this session are reproduced in
> the assistant's final report accompanying this reconstruction.

---

## §19. Coding Readiness

**Nature:** derived from the decision gates.

| Dimension | State |
|---|---|
| **Architecture** | **CLOSED** (D01–D05 locked; source docs lost but conclusions owner-locked) |
| **Business Decision Gate** | **CLOSED** (D01–D05 all APPROVED) |
| **Dataset / Migration Data Provenance** | **UNKNOWN** (D05) |
| **Coding readiness — foundation phases** | **READY** |
| **Coding readiness — production-scale migration** | **GATED by provenance** |

### What may proceed now (foundation)

Architecture-and-foundation implementation may begin, **behind feature flags, additive and
backward-compatible** (§16), specifically:

- Product Registry scaffolding (§1) — **once its schema is re-derived with the owner**, since
  `PRODUCT-REGISTRY-ARCHITECTURE.md` is NOT RECOVERABLE.
- Backend SKU generation/reservation authority (§5) to replace client-only max+1.
- Enforcement of the field-ownership matrix (§8): SKU immutable, Cost read-only.
- Supplier Review as a *usage* of the existing stock-check + notification infrastructure (§9),
  reusing `SHEET_STOCK_CHECK` / `createStockCheckRequest_` / `completeStockCheckRequest_` /
  `pushInappNoti_` — **no new notification engine.**
- Legacy `L` freeze in the generation path (§6/D01).

### What remains gated (migration)

- Any migration/backfill/classification step whose correctness depends on production-scale
  statistics is **blocked** until dataset provenance is resolved (D05, §17). Do **not** mark
  the whole system as blocked — only provenance-dependent migration is gated.

### Hard dependency introduced by the doc loss

Because all 7 architecture docs are NOT RECOVERABLE (§0), the following must be
**re-established with the owner before the corresponding code is written** (they are the
"design not recovered" items, distinct from "decision not made" — the decisions D01–D05 are
made):

- Registry schema & relationship model (§1)
- Business Family / Product Type/Form formal definitions & taxonomy (§2, §3)
- Per-category Variant rule table beyond colors (§4)
- SKU reservation protocol design (§5)
- Legacy barcode exception list (§14)
- Role→action assignments for new product actions (§15)
- Feature-flag names (§16)

---

## Appendix A — D01–D05 Consistency Check

| # | Decision | Where honored in this spec | Consistent? |
|---|---|---|---|
| **D01** | Legacy `L` = FREEZE; existing L valid & unchanged; no new L; registry/reporting/migration keep supporting L; new products use clean namespace | §6 (primary), §1, §5, §17 | ✅ No contradiction found |
| **D02** | SKU immutable; Form/Variant/Name/Category/SellPrice/Barcode = ERP→ZORT; Supplier/Owner = ERP-internal; Cost = ZORT→ERP; Image = ERP metadata + ZORT preferred/ERP fallback | §8 (matrix), §5, §12, §13, §14, §10 | ✅ Matrix in §8 matches §11/D04 exactly |
| **D03** | Model C; Supplier→Review Team→Request→Due→Complete/Overdue; Product→Owner; Reviewer ≠ Owner; reuse stock-check + notification infra; no new engine | §9 (primary), §10, §15 | ✅ Reuse targets verified in code |
| **D04** | ERP master (SKU/Form/Variant/Name/Category/Supplier/Owner/SellPrice/Barcode/Review); ZORT master (Cost/Stock/Transactions/OpStatus); Image ZORT-preferred; domain→ERP wins, operational→ZORT wins; neither master of everything | §11 (matrix), §8, §12, §13 | ✅ §8 and §11 matrices are mutually consistent |
| **D05** | Provenance UNKNOWN; checksum not re-verifiable unless file recovered; no fabricated stats; CSV findings only if cited to surviving arch doc; blocks production-scale migration only | §17 (primary), §12 (CSV bounded), §18, §19 | ✅ Consistent; note CSV citation is impossible because no arch doc survives (§0) |

**Cross-decision consistency:** the §8 field-ownership matrix (D02) and the §11 sync matrix
(D04) were checked field-by-field and agree on master + direction for all listed fields
(SKU, Type/Form, Variant, Name, Category, Supplier, Owner, Cost, Sell Price, Image, Barcode).
No internal contradiction among D01–D05 as applied.

---

## Appendix B — Contradictions Identified (not silently reconciled)

Per the reconstruction rules, contradictions are surfaced, not smoothed over. Where a later
validated conclusion supersedes an earlier assumption, the later one is marked as governing.

1. **AS-IS SKU model (prefix+model) vs TO-BE taxonomy (Business Family / Type/Form / Variant).**
   The code models SKU as `prefix+variant+model` with client max+1 (`parseSkuParts`,
   `nextModelForPrefix`). The Phase 2 architecture (owner Implementation Principles) requires
   NOT collapsing Business Family / Type/Form / Variant into prefix+model.
   → **Governing:** the later architecture conclusion (TO-BE). AS-IS is documented as the
   implementation to be superseded, not as the target. **Not reconciled silently** — both are
   shown (§2–§5, §7).

2. **AS-IS `suggestNextSku` shape vs standard SKU grammar.** `suggestNextSku` recognizes
   `^[A-Za-z]+\d+$` (base+running) while the company standard is `^[A-Z]{1,3}\d{2}\d{3}$`
   (`parseSkuParts`). `CLAUDE.md` itself flags that `suggestNextSku` "does not know the
   business rule."
   → **Governing:** the standard grammar (`parseSkuParts` / `nextModelForPrefix`) and, in
   TO-BE, backend reservation (§5). Legacy helper noted as inconsistent, superseded.

3. **AS-IS domain-field flow (ZORT/sheets → ERP) vs D04 (ERP domain master → ZORT).** Today
   name/category/price largely originate outside ERP; D04 makes ERP the domain master.
   → **Governing:** D04. §11 records this as a gap to close in TO-BE, not as already done.

4. **CSV-derived statistics availability.** Earlier work (and the owner prompt) reference CSV
   findings; the CSV is absent and no arch doc survives to cite them to.
   → **Governing:** D05 — provenance UNKNOWN; CSV numbers are NOT usable as fact here.
   No reconciliation attempted; the earlier statistics are simply not carried forward.

No contradiction was found *within* the locked decisions D01–D05 themselves.

---

## Appendix C — Information That Could NOT Be Recovered

(Consolidated list of NOT-RECOVERABLE items, so the owner can prioritize re-establishing them.)

- The 7 Phase 2 architecture documents in full (§0) — terminology, definitions, conclusions.
- Original section numbering/titles of the lost `PRODUCT-IMPLEMENTATION-SPEC.md` (§0).
- Formal definitions: Business Family (§2), Product Type/Form taxonomy (§3).
- Full per-category Variant rule table beyond the color table (§4).
- SKU reservation protocol design (§5).
- Registry schema, sheet layout, relationship model (§1).
- Product-creation UI step specifics beyond owner-stated direction (§7).
- Legacy barcode exception list and its discriminating rule (§14).
- Role→action assignment table for new product actions (§15).
- Established feature-flag names for Registry/product-domain rollout (§16).
- Forensic CSV and its production statistics; checksum re-verification (§17, D05).

---

*End of reconstructed specification. This document supersedes nothing in code and authorizes
no code changes; it is the implementation contract to be executed in later, separately-gated
work.*
