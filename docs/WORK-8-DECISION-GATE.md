# Work 8 — Business Decision Gate

> **Type:** Decision resolution only. **No coding, no Registry, no migration, no deploy, no commit/push.**
> **Purpose:** close the business decisions still open after Work 7 so implementation can begin without later rework of Registry / API / UI.
> **Date:** 2026-08-25 · **Branch:** `claude/product-spec-phase-2-work-6-v43vwx`
> **This document decides nothing on its own.** Every open item ends in `OWNER DECISION: ______` and stays open until the owner answers.

---

## §1. Purpose

Work 7 concluded the architecture direction is largely ready but left several 🟡 **OWNER DECISION REQUIRED** items that, if skipped, force rework of Registry / API / UI. Work 8 presents each as a structured decision (evidence → AS-IS → options → impact → recommendation) for the owner to resolve. **I do not lock any decision myself.**

Already locked by the owner (not reopened):
- **D01** Legacy `L` = FREEZE.
- **D03** Supplier Review = Model C.
- **D05** Dataset Provenance = UNKNOWN.
- **D04** ZORT-sync *direction* is owner-approved; the detailed *policy* still needs owner review (§12).

---

## §2. Source of Truth

| Source | Use |
|---|---|
| `docs/PRODUCT-IMPLEMENTATION-SPEC.md` (commit 53ec321) | Work 6 reconstruction |
| `docs/WORK-7-IMPLEMENTATION-READINESS.md` (commit 3b9951c) | Work 7 audit + conflicts |
| `CLAUDE.md` | AS-IS system behavior |
| Actual code (`appsscript_complete.gs`, `views-*.jsx`, `app.jsx`) | Evidence, cited by `file:line` |

**Conflict handling:** where sources disagree, the conflict is shown with `file:line` and options — never silently reconciled, never resolved by editing the Spec.

**Standing NOT RECOVERABLE facts (from the lost prior session — do not invent):** the 7 architecture docs, the forensic CSV (checksum `d6d7e14dbe3285706ee2d0aafad36550`, statistics unusable per D05), formal Business Family / Type-Form definitions, SKU reservation protocol, Registry schema, and the "suffix-letter"/"fullword" grammars (absent from code).

---

## §3. Decision Method

Each decision below carries: **Problem → Evidence (code) → AS-IS → Options A/B/C → Pros/Cons → Impact (Registry / Creation / Edit / SKU / ZORT / UI / Migration / Permissions / Testing) → Recommendation (tagged *evidence-backed* or *architectural preference*) → `OWNER DECISION`.**

`ALREADY LOCKED` is used only where the owner has genuinely answered. The words "Approved / Locked / Final" are used **only** for those.

---

## §4. Decision 01 — D02 Field Ownership

**Problem:** Work 7 found a conflict (C-1). Work 6 Spec **§8 locks** Type/Form, Variant, Name, Category, Sell price, Barcode as **ERP master → ZORT**; the owner's Work 7/Work 8 D02 table presents these six as **multi-option ("ERP / ZORT / both")**. They must be settled field-by-field, not as one block.

**Evidence (AS-IS, verified):**
- Product domain fields today originate **from ZORT → sheet**: `syncNewProductsFromZort` writes sku/name/category/tag/sellprice from ZORT (`appsscript_complete.gs`, `syncNewProductsFromZort`); `readProducts_` reads name/category/tag/vendor from `SHEET_PRODUCT_META` (`gs:9888–9903`).
- **No product-edit path exists** (frontend or backend) — grep for `updateProduct/editProduct/price edit` is empty (Work 7 §5).
- Only ERP→ZORT writes today: create `addNewProduct` (`gs:7563`, sends name/category/sellprice/barcode), stock `pushStockToZort_` (`gs:5433`), POS AddOrder/AddQuotation.
- SKU immutable; Supplier/Owner ERP-internal; Cost ZORT; Image ZORT-preferred/ERP-fallback — all consistent AS-IS.

**SKU — ALREADY LOCKED:** 🔒 immutable, never editable (D02). Not reopened.
**Supplier / Owner / Cost / Image — ALREADY LOCKED** per D02 (no significant code conflict found: Supplier=ERP tag/vendor, Owner=ERP `setProductOwner`, Cost=ZORT, Image=ERP association + ZORT preferred, `gs:9895/11347/5468/8010`). Image runtime semantics still need §10.

For each of the six multi-option fields:
**Option A** = ERP master → ZORT mirror · **Option B** = ZORT master → ERP mirror · **Option C** = shared/bidirectional (requires a who-wins rule, §12).

General trade-off (applies to all six):
- **A pros:** matches Spec §8 and the D04 "domain data → ERP wins" rule; single source; enables ERP edit UI. **A cons:** requires building ERP→ZORT push + a sync guard so ZORT sync stops overwriting the field (Work 7 C-2/§9); today the flow is the opposite direction.
- **B pros:** matches AS-IS exactly (zero migration; ZORT stays domain source). **B cons:** contradicts D04 domain-ownership; ERP can't be the domain master; edit happens in ZORT UI.
- **C pros:** flexibility. **C cons:** needs conflict detection for every edit; highest complexity; easiest to introduce silent overwrite bugs.

### 01A — Product Type/Form
- **AS-IS:** does not exist as a field; category text + SKU prefix informally carry "type." Evidence: `gs:9894`; `CLAUDE.md` SKU rule.
- **Recommendation:** **A (ERP master → ZORT)** — *architectural preference* (Type/Form is a new ERP domain concept; ZORT has no native Type/Form field, so ERP must own it). Depends on Decision 02 defining what Type/Form is.
- **OWNER DECISION: ______**

### 01B — Variant
- **AS-IS:** exists only as the middle 2 digits of the SKU string; `VARIANT_COLOR_CODES` color table. Evidence: `views-main.jsx:3604, 3570`.
- **Recommendation:** **A (ERP master → ZORT)** — *architectural preference* (Variant is ERP domain data; ZORT has no first-class variant). Depends on Decision 03.
- **OWNER DECISION: ______**

### 01C — Name
- **AS-IS:** ZORT → sheet (`syncNewProductsFromZort`); composed at creation ERP-side (`views-main.jsx:9370` composes name incl. wholesale number). Evidence shows **both** directions exist partially.
- **Options:** A / B / C.
- **Recommendation:** **A (ERP master → ZORT)** — *architectural preference*, but **note** this is the field with the most AS-IS coupling to ZORT; choosing A requires a sync guard (§12). If the owner prefers minimal change, **B** matches AS-IS.
- **OWNER DECISION: ______**

### 01D — Category
- **AS-IS:** ZORT → sheet (`gs:9894`, `syncNewProductsFromZort`). Category also drives dashboard grouping.
- **Recommendation:** **A (ERP master → ZORT)** — *architectural preference*; same sync-guard caveat as Name.
- **OWNER DECISION: ______**

### 01E — Sell Price
- **AS-IS:** stored value = **retail**; at creation user enters **wholesale**, `sellprice = round(wholesale × 1.25)` is what's sent to ZORT and sheet (`views-main.jsx:9366–9370`). Dashboard derives wholesale via `wholesaleRatio_()=0.8` (`gs:297`). See Decision 08 for the price model itself.
- **Recommendation:** **A (ERP master → ZORT)** — *evidence-backed* (price authority is a money-critical domain decision; D04 domain→ERP). Interacts with Decision 08.
- **OWNER DECISION: ______**

### 01F — Barcode
- **AS-IS:** `barcode = sku` at creation (`gs:7588`); Code128 print exists. Legacy barcode exceptions exist per D02 but the **exception list is NOT RECOVERABLE**.
- **Recommendation:** **A (ERP master → ZORT)** — *architectural preference*, **with** an explicit rule to preserve legacy barcode ≠ SKU exceptions (do not normalize them). 
- **OWNER DECISION: ______**

> **Cross-field note:** if the owner picks **A** for any of these, Decision 09 (sync conflict policy) becomes a hard prerequisite before that field is backfilled — otherwise the next ZORT sync silently reverts ERP edits (Work 7 C-2).

---

## §5. Decision 02 — Product Type/Form Definition

**Problem:** Registry depends on formal definitions of Business Family / Product Type/Form / Variant / SKU. Some formal definitions were lost with the architecture docs (NOT RECOVERABLE); only code + CLAUDE + owner concepts survive.

**Evidence (from code/CLAUDE — what actually exists):**
- SKU grammar: `[A-Z]{1,3}` prefix + 2-digit variant + 3-digit model (`views-main.jsx:3603`). Prefix informally = product type (e.g. `OL`=olive/มะกอก, `R`=rose/กุหลาบ — `CLAUDE.md` SKU rule).
- Variant = color (table `VARIANT_COLOR_CODES`) or size/sequence for leaves/branches/equipment (`CLAUDE.md`: rule differs per category, "ask the user").
- MTO grammar: `mtoSkuPrefix_` groups by letters-before-digits (`views-quote.jsx:358`).
- Categories seen in code/CLAUDE: flower, "Made to Order", leaf/branch/equipment; SKU prefixes like `OL`, `R`, and (per owner request) examples like Realtouch, bush, KB/stone rose, legacy `L`. **The precise catalog of prefixes↔types is NOT RECOVERABLE** (lived in forensic docs + CSV).

**AS-IS:** there is **no** Business Family or Type/Form entity — only category text + SKU prefix convention. `readProducts_` carries name/category/tag/vendor only (`gs:9888–9903`).

**Definition options (tested against recoverable examples):**
- **Option A (4-layer):** Business Family = species/business grouping (e.g. "rose"); Product Type/Form = physical/commercial form (e.g. Realtouch rose vs dried rose vs stone rose "KB"); Variant = color/size; SKU = unique sellable item.
  - Fits: a species (rose) appearing under multiple prefixes/forms → one Family, several Type/Forms. Matches the owner's "same species, multiple prefix/form" case.
- **Option B (3-layer):** Business Family = optional grouping only; Product Type/Form = the transactional product model; Variant = sellable variation. (Family is reporting sugar, not structural.)
- **Option C:** other, only if code/business evidence supports it — **no additional evidence found**, so C is not substantiated here.

**Example stress test (recoverable only):**
| Example | Under Option A | Note |
|---|---|---|
| flower (rose `R`) | Family=rose, Form=fresh/realtouch, Variant=color | fits |
| Realtouch | a Form under a species Family | fits |
| bush / leaf | Family=plant part, Form=bush/leaf, Variant=size | fits; variant≠color (Decision 03) |
| KB / stone rose | Form under rose Family? or own Family? | **ambiguous — NOT RECOVERABLE which** |
| MTO | Form="Made to Order" (special) | `isMTO` already flags via category (`views-main.jsx`) |
| legacy `L` | frozen namespace, mapped but not extended | D01 |

**Owner questions:**
1. **What is Business Family for?** A. Reporting/grouping only · B. Product-creation structure · C. Both · D. Not in MVP.
2. **What is Product Type/Form in this system?** (free-form; the definition to lock before Registry.)

**Impact:** Registry (schema shape) · Creation (guided flow steps) · SKU (whether generation keys off Type/Form) · Migration (how existing products classify) · everything downstream. **Registry must not start until this is locked.**

**Recommendation:** **Option A** for the definition and **Family = C (both)** *architectural preference* — it matches every recoverable example and the owner's "same species, many forms" statement; but confidence is **medium** because KB/stone-rose family placement and the full prefix↔type catalog are NOT RECOVERABLE. If the owner wants the smallest MVP, **Family = D (not in MVP)** with Type/Form + Variant only is viable and lower-risk.

- **OWNER DECISION (Business Family purpose): ______**
- **OWNER DECISION (Product Type/Form definition): ______**

---

## §6. Decision 03 — Variant Rule Ownership

**Problem:** variant meaning cannot be tied to prefix alone; exceptions exist within the same category/prefix.

**Evidence:** `VARIANT_COLOR_CODES` (color, `views-main.jsx:3570`); `CLAUDE.md` states leaves/branches/equipment use size/sequence, and "which category uses which rule has no fixed mapping — ask the user." So the variant *type* is not derivable from prefix in code today.

**AS-IS:** variant is just 2 digits in the SKU; the builder lets the user pick a color code OR type a custom code (size/sequence). No stored "variant rule" per category/type.

**Options:**
- **A. Variant rule by Category** — pros: category already exists; cons: category is free text and coarse.
- **B. Variant rule by Prefix** — pros: prefix is structured; cons: CLAUDE explicitly says prefix alone is insufficient (exceptions).
- **C. Variant rule by Product Type/Form** — pros: aligns with Decision 02; cons: needs Type/Form to exist first.
- **D. Variant rule per Product Type/Form + explicit metadata** — pros: handles exceptions; each Type/Form declares its variant axis (color / size / material / none) as config/metadata; cons: most setup.

**Variant axes to support:** color · size · material/other · no-variant. Should the axis be a **fixed enum**, **config**, or **per-form rule**? Evidence points to **per-form + small enum of axis types**.

**Impact:** Registry (variant metadata storage) · Creation (which picker to show) · SKU (variant code source) · Migration (deriving variant from existing SKUs) · Testing (variant metadata cases).

**Recommendation:** **Option D** (per-Type/Form + explicit variant-axis metadata, axis ∈ fixed enum {color,size,material,none}) — *evidence-backed* (CLAUDE's "prefix alone insufficient + per-category exceptions" directly supports it). **Confidence: medium-high.** Depends on Decision 02 (needs Type/Form).

- **OWNER DECISION: ______**

---

## §7. Decision 04 — Legacy `L` Freeze (implementation behavior)

**Policy — ALREADY LOCKED (D01):** `L` = frozen legacy namespace. Not reopened.

**Problem:** only the *implementation behavior* is open.

**Evidence/AS-IS:** no `L` handling exists in code today (Work 7 §7); the authoritative enforcement point identified is the backend create path `addNewProduct` (`gs:7563`).

**When a user tries to create a new product in namespace `L`:**
- **A. Block creation** — pros: simplest, safest, matches "ERP must not generate new L"; cons: none significant.
- **B. Allow only if explicitly marked legacy** — pros: escape hatch; cons: contradicts "no new L"; risk of abuse.
- **C. Redirect to new Type/Form namespace** — pros: guides user to clean namespace; cons: needs Decision 02 mapping; more UI.
- **D. Other.**

**Related sub-questions (answers proposed, owner confirms):**
- Existing `L` SKU readable? → **YES** (D01; already the case — nothing rewrites SKUs).
- Edit metadata of existing `L` SKU? → **governed by Decision 01** (whichever authority is chosen for each field applies to `L` too; SKU/barcode stay immutable).
- Migration of `L`? → link/annotate only, never rewrite (D01/D05; §14).
- Reporting support for `L`? → must continue to include `L` (D01).

**Impact:** Creation (block/redirect) · SKU (reservation refuses `L`) · Registry (mark frozen) · Migration (read-only for `L`) · Testing (L-reject + existing-L-read).

**Recommendation:** **A (block creation)** for MVP, with the frozen-prefix set config-driven (Script Property) so future contaminated prefixes can be frozen without code change — *evidence-backed* (matches D01 exactly; lowest risk). **C** can be a later UX enhancement once Decision 02 lands.

- **OWNER DECISION: ______**

---

## §8. Decision 05 — SKU Generation Authority

**Problem:** AS-IS SKU generation is client-side with no atomic reservation.

**Evidence:** client `nextModelForPrefix`/`suggestNextSku` over the browser array (`views-main.jsx:3540, 3612, 9325`); backend `addNewProduct` takes `LockService.getScriptLock()` and dedup-checks `collectExistingSkus_` but **does not allocate** (`gs:7575–7581`). Existing safe-concurrency patterns in the repo: `cid` (orders), `tid` (transfers), `LockService` (create/transfer).

**AS-IS:** two concurrent creators can compute the same next number; loser gets a hard "SKU exists" error rather than the next free identity.

**Options:**
- **A. Backend reservation + LockService** — pros: atomic, matches existing `cid`/`tid`/lock patterns, race-free, auditable; cons: new backend allocation logic. 
- **B. Keep client-side + stronger duplicate rejection** — pros: minimal change; cons: still race-prone; loser still errors; doesn't fix root cause.
- **C. Central sequence sheet/service** — pros: single source of running numbers; cons: hot-row contention; another sheet to maintain; heavier than needed.
- **D. Other.**

**Comparison:** concurrency (A>C>B) · race (A safe, B unsafe) · recovery/rollback (A: reservation record; B: none) · audit (A via `writeAuditLog_`) · performance (A adds one locked read/write; C risks contention) · legacy compat (all preserve existing SKUs; A/B/C read-preserving).

**Impact:** SKU (core) · Creation (reserve before write) · Registry (reservation store) · Permissions (server-only) · Testing (concurrent-create, dup, L-reject) · Migration (none for existing).

**Recommendation:** **A (backend reservation + LockService)** — *evidence-backed* (directly mirrors the repo's proven `cid`/`tid`/lock idioms and removes the confirmed race). If approved, **do not implement yet** — only lock the decision. Reservation *protocol* detail is NOT RECOVERABLE and would be designed in Work 9+.

- **OWNER DECISION: ______**

---

## §9. Decision 06 — Supplier Review (Model C semantics)

**Model — ALREADY LOCKED (D03):** Supplier → Review Team; Product → Owner. Not reopened. **Must reuse** `SHEET_STOCK_CHECK`, `createStockCheckRequest_`, `completeStockCheckRequest_`, `inappAudienceMatch_`, `staff:STxxxx`; **no new notification engine.**

**Evidence:** stock-check request system with `suppliers` column and fs/wh split status (`gs:15814, 15820–15824, 15891, 15943`); notifications `pushInappNoti_` audiences all/role/`staff:` (`gs:10925, 10978`); aging precedent `shipPendingAging_` (`gs:10178`). **Hidden dependency (Work 7 §8):** current split is frontstore/warehouse, not an arbitrary "Review Team" — the assignee dimension needs modeling.

**Open semantics:**
1. **Review Team is:** A. fixed role · B. configurable staff group · C. named staff list.
2. **Who assigns reviewer:** A. system · B. owner · C. admin/dev.
3. **Supplier review frequency:** A. manual · B. recurring · C. conditional.
4. **Overdue escalation:** A. Review Team · B. supervisor · C. owner · D. both.
5. **Completion requires:** required fields? evidence/photo? comment? timestamp?

**Impact:** Permissions (who creates/completes/assigns) · Registry (supplier↔team mapping) · UI (review screen) · Testing (assignment, overdue, owner≠reviewer) · reuses existing notification/audit.

**Recommendations (all *architectural preference*, low confidence — owner's org knowledge governs):**
1. **B (configurable staff group)** — flexible, fits `staff:STxxxx` targeting.
2. **C (admin/dev assigns)** — matches existing admin-gated actions.
3. **A (manual)** for MVP (recurring adds trigger complexity).
4. **D (both Review Team + owner)** for overdue.
5. Completion: **timestamp + actor (session-verified) required; comment required; photo optional** — mirrors existing complete-request + audit pattern.

- **OWNER DECISION (Review Team type): ______**
- **OWNER DECISION (who assigns): ______**
- **OWNER DECISION (frequency): ______**
- **OWNER DECISION (overdue escalation): ______**
- **OWNER DECISION (completion requirements): ______**

---

## §10. Decision 07 — Image Source Semantics

**Locked intent (D02):** ERP = image authority; if ZORT has an image, use ZORT as the primary displayed image.

**Evidence/AS-IS:** imageUrl sheet col D = manual (ERP), col E = ZORT auto; `readImageMap_` makes **col E win over col D**; `readProducts_` uses imageMap first then meta fallback (`gs:5468, 5490, 7959, 8010, 9890`). This already matches the locked intent.

**Options (resolve wording, not behavior):**
- **A. ZORT = ingestion source; ERP stores a copy** — ERP would copy the ZORT image into its own storage.
- **B. ZORT = runtime display fallback** — inaccurate to AS-IS (ZORT is preferred, not fallback).
- **C. ERP stores canonical association; ZORT is the preferred *source*** — ERP owns the record (which image, metadata), ZORT URL is the preferred content when present, manual (col D) is fallback. **Matches AS-IS.**
- **D. Hybrid.**

**Layer separation (per AS-IS):** Authority = ERP (the imageUrl sheet record) · Source = ZORT (col E, preferred) then manual (col D) · Cache = the sheet mapping / on-demand `fetchProductImage` · Display = col E → col D → meta · Fallback = manual/meta.

**Impact:** minimal — AS-IS already conforms; mostly a wording/lifecycle decision (temp-photo cleanup). Do **not** call ZORT the "image master" — D02 makes ERP the authority.

**Recommendation:** **C** — *evidence-backed* (exactly describes current code: ERP-owned association, ZORT preferred source, ERP/manual fallback).

- **OWNER DECISION: ______**

---

## §11. Decision 08 — Sell Price Model

**Problem:** pin the canonical price representation and the role of the 1.25 factor.

**Evidence (verified):** at creation the user enters **wholesale**; stored `sellprice` (ZORT + sheet col I) = **retail = round(wholesale × 1.25)** (`views-main.jsx:9366–9370`). Backend `wholesaleRatio_()=0.8` derives wholesale from retail for stock value (`gs:297–304`). `1/1.25 = 0.8`. `CLAUDE.md` warns not to mutate `p.price` (shared by POS/quote/stock-value).

**AS-IS:** canonical stored price = **retail**; wholesale is **derived** (×0.8) for reporting; 1.25 is the wholesale→retail markup applied once at creation.

**Sub-decisions:**
1. **ERP canonical price stored as:** A. wholesale · B. retail · C. both.
2. **The 1.25 factor is:** A. canonical business rule · B. legacy conversion only · C. remove later · D. configurable.
3. **Price displayed in ERP:** A. derived · B. stored · C. both.

**Impact:** Pricing (money) · Creation (which price the user types) · Edit (Decision 01E) · ZORT (push direction) · Migration (price parity check) · Testing (conversion parity).

**Recommendations (*evidence-backed* to AS-IS; do not invent a new rule):**
1. **B (retail canonical)** — matches what's stored today (ZORT `sellprice`/col I = retail); wholesale stays derived. (A is defensible if the owner thinks in wholesale, but would invert current storage.)
2. **D (configurable)** — the 0.8 side is already a Script Property (`WHOLESALE_RATIO`); making 1.25 configurable/consistent avoids the two constants drifting.
3. **C (both)** — store retail, display both retail and derived wholesale (already effectively the case).

- **OWNER DECISION (canonical storage): ______**
- **OWNER DECISION (1.25 factor role): ______**
- **OWNER DECISION (display): ______**

---

## §12. Decision 09 — ZORT Sync Conflict Policy

**Direction — owner-approved (D04):** domain→ERP wins; operational→ZORT wins. **Policy detail is open.**

**Evidence/AS-IS:** domain fields currently flow **ZORT→ERP** (`syncNewProductsFromZort`; `syncZortToColumn_` for stock; `gs:8338–8348`). There is **no** per-field who-wins guard today (Work 7 R-1/C-2). If ERP becomes domain master (Decision 01=A), the next sync would overwrite ERP edits unless guarded.

**For ERP-master fields (ERP → ZORT), if ZORT is edited by hand:**
- **A. Overwrite on next sync** (ERP wins silently) — pros: simple, matches "domain→ERP wins"; cons: silently discards ZORT-side edits.
- **B. Detect conflict + alert** — pros: no silent loss; reuses `pushInappNoti_`; cons: needs change-detection.
- **C. Allow temporary override** — pros: operational flexibility; cons: ambiguous authority.
- **D. Reject ZORT edit where API allows** — pros: strongest; cons: ZORT API may not support locking.

**For ZORT-master fields (ZORT → ERP):** define polling frequency (AS-IS: `syncZortBoth` ~every 2h per CLAUDE.md), conflict handling (ZORT wins), stale-data handling, failed-sync retry, and audit.

**Impact:** ZORT (core) · Edit (whether ERP edits survive) · Migration (must precede backfill — Work 7 §14 Phase G before H) · Testing (sync-conflict dry-run) · Registry.

**Recommendation:** **B (detect + alert)** for ERP-master fields — *architectural preference* aligned with the repo's strong "never overwrite silently" doctrine (CLAUDE.md conflict-detection lessons); **A** is acceptable only if the owner accepts that hand ZORT edits to domain fields are discarded. For ZORT-master fields keep AS-IS (ZORT wins, ~2h poll, retry+audit). **This policy must be locked before any ERP-master field is backfilled.**

- **OWNER DECISION (ERP-master conflict policy): ______**
- **OWNER DECISION (ZORT-master poll/stale/retry policy): ______**

---

## §13. Decision 10 — Permission Model

**Evidence:** roles in code = `owner, dev, saler, warehouse, frontstore, employee, storedevice` (`VALID_ROLES`, `gs:1046`); gating via `ROLE_ACTIONS_`/`COMMON_ACTIONS_`/`IMMEDIATE_GATE_*`, master switch `REQUIRE_LOGIN` off by default (`gs:786, 941`); actor session-verified.

**AS-IS:** create=owner/dev+warehouse; owner assign=session-derived; supplier stock-check=owner/dev/saler/storedevice; sync overrides present. No edit/reservation/registry actions exist.

| Action | AS-IS roles | Proposed (needs owner) | Risk |
|---|---|---|---|
| registry management | none | owner/dev | High |
| create product | owner/dev/warehouse | keep | Med |
| edit product | none | **OWNER DECISION REQUIRED** (depends on 01) | Med |
| SKU reservation | none | server-only (no user role) | High |
| owner assignment | session-derived | keep | Low |
| supplier review (create) | (createStockCheck) owner/dev/saler/storedevice | Review Team + owner/dev | Med |
| review-team assignment | none | owner/dev (per §9) | Med |
| pricing | none | **OWNER DECISION REQUIRED** (money) | High |
| image | owner/dev/warehouse | keep | Low |
| archive | GAS-editor tools (owner) | owner/dev | Med |
| sync override | present | owner/dev | Med |
| migration | none | owner/dev only | High |

**Recommendation:** *architectural preference* — align new actions to existing gate tables; make SKU reservation server-only; keep money/edit/registry to owner/dev. Rows marked **OWNER DECISION REQUIRED** stay open (depend on Decisions 01/08).

- **OWNER DECISION (edit product roles): ______**
- **OWNER DECISION (pricing roles): ______**
- **OWNER DECISION (registry/migration roles): ______**

---

## §14. Decision 11 — Migration Safety

**Provenance — ALREADY LOCKED (D05): UNKNOWN.** Not reopened.

**Problem:** migration *policy* only.

**Options:**
- **A. No migration until a verified production export exists** — pros: safest, honors D05; cons: delays backfill.
- **B. Allow dry-run only** — pros: preview without writes; cons: no real backfill yet.
- **C. Allow read-only backfill preview** — pros: see planned mapping; cons: still no writes.
- **D. Other.**

**Hard constraints (non-negotiable):** existing SKU immutable · existing barcode immutable · no destructive migration · preview-before-write · rollback strategy required.

**Impact:** Migration (core) · SKU/Barcode (must not change) · Registry (backfill target) · Testing (dry-run + zero-mutation assertion).

**Recommendation:** **A + B combined** — *evidence-backed* to D05: allow **dry-run/preview now** (like the existing `previewProductOwnerAssign()` / `previewZortDeletedProducts()` patterns), but **gate any production write-migration behind provenance verification.** Production migration must not rely on the lost CSV counts.

- **OWNER DECISION: ______**

---

## §15. Decision 12 — MVP Scope

**Problem:** what goes in the first implementation package, given dependencies and risk.

**Packages:**
- **Option A — Integrity First:** feature flags · SKU reservation (Decision 05) · `L` freeze (Decision 04) · Registry foundation (read-only) · audit.
- **Option B — Product Operations:** A + product creation (guided) · product owner (exists) · product edit · image · price.
- **Option C — Full Product Domain:** A + B + Supplier Review · ZORT sync guards · migration.

**Dependency/risk reasoning (from Work 7 §14):** A is all-🟢 and removes the highest integrity risk (SKU race) without needing the open owner decisions; B needs Decisions 01/08 locked (edit/price authority); C additionally needs Decisions 06/09 and is provenance-gated (Decision 11).

**Recommendation:** **Option A first** — *evidence-backed* (matches Work 7's recommended Phase 0 → Phase C; no dependency on the still-open decisions), then B once Decisions 01/02/03/08 are locked, then C last. Owner chooses.

- **OWNER DECISION: ______**

---

## §16. Decision Summary

| # | Decision | Status | My recommendation | Rec. type | Blocks |
|---|---|---|---|---|---|
| 01A | Type/Form ownership | OPEN | A (ERP→ZORT) | pref | Registry/edit |
| 01B | Variant ownership | OPEN | A (ERP→ZORT) | pref | Registry/edit |
| 01C | Name ownership | OPEN | A (or B for min-change) | pref | edit/sync |
| 01D | Category ownership | OPEN | A | pref | edit/sync |
| 01E | Sell price ownership | OPEN | A | evidence | edit/price |
| 01F | Barcode ownership | OPEN | A (+preserve legacy) | pref | edit |
| 02 | Family/Type-Form definition | OPEN | A + Family=Both (conf: med) | pref | **Registry** |
| 03 | Variant rule | OPEN | D (per-form + enum) | evidence | Registry/creation |
| 04 | `L` freeze behavior | OPEN (policy locked) | A (block, config set) | evidence | creation/SKU |
| 05 | SKU generation | OPEN | A (backend reserve+lock) | evidence | creation |
| 06 | Supplier Review semantics | OPEN (model locked) | B/C/A/D/… (low conf) | pref | supplier review |
| 07 | Image semantics | OPEN | C (matches AS-IS) | evidence | — |
| 08 | Sell price model | OPEN | retail canonical, 1.25 configurable, display both | evidence | price/edit |
| 09 | ZORT conflict policy | OPEN (direction approved) | B (detect+alert) | pref | **sync/backfill** |
| 10 | Permission model | PARTIAL OPEN | align to gate tables; some rows open | pref | all writes |
| 11 | Migration safety | OPEN (provenance locked) | dry-run now, prod gated | evidence | migration |
| 12 | MVP scope | OPEN | Option A first | evidence | sequencing |

**ALREADY LOCKED (not reopened):** D01 (`L`=FREEZE) · D03 (Supplier Review=Model C) · D05 (Provenance=UNKNOWN) · D04 direction (domain→ERP / operational→ZORT).

---

## §17. Remaining Blockers

Ordered by what unblocks the most:

1. **Decision 02 (Type/Form definition)** — hard prerequisite for Registry; NOT RECOVERABLE parts need owner input (Family purpose, Type/Form meaning, KB/stone-rose family placement).
2. **Decision 01 (field ownership ×6)** — blocks product-edit and ZORT push direction; the Spec §8 ↔ Work 7 D02 conflict must be resolved here.
3. **Decision 09 (sync conflict policy)** — must be locked before any ERP-master field is backfilled, else silent overwrite.
4. **Decision 05 (SKU generation)** — needed before guided creation; recommendation is low-risk (matches cid/tid/lock).
5. **Decision 08 (price model)** — money-critical; blocks price edit + migration parity.
6. **Decision 03 (variant rule)** — needed for Registry variant metadata; depends on 02.
7. **Decision 06 (supplier review semantics)** — owner org-knowledge; blocks Supplier Review build.
8. **Decision 10 (permissions)** — several rows depend on 01/08.
9. **Decision 11 / 12** — migration gated by D05; MVP scope depends on the above.

**Independent of all owner decisions (can start regardless):** feature-flag scaffolding, SKU reservation + `L` freeze (Decision 05 rec. A / Decision 04 rec. A), and dry-run migration previews (Decision 11) — i.e. **MVP Option A**.

**Still NOT RECOVERABLE (do not invent):** Registry schema, Family/Type-Form formal definitions, per-category variant catalog, legacy barcode exception list, SKU reservation protocol, forensic CSV statistics.

---

*End of Work 8 decision gate. Nothing here is locked except where marked ALREADY LOCKED (owner's prior D01/D03/D05 + D04 direction). All `OWNER DECISION: ______` lines remain open until the owner answers. No code, Registry, migration, or deploy performed.*
