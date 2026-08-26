# MTO Custom-Arrangement Sale — Addendum to MTO V2 (2026-08-25)

**Extends** `DOMAIN-MODEL-MTO-V2`, `EVENT-FLOW-MTO-V2`, `MTO-ARCHITECTURE-REVIEW-GATE`, `MIGRATION-PLAN-MTO-JOBSKU`,
`ADR-MTO-SELLABLE`. **Not a competing architecture** — every answer maps to a decision already locked in those docs.
Purpose: connect the business requirement "sell a custom arrangement (แจกันชุด) as one bundle line while deducting
components" to the existing V2 model and its phasing. **No code changed.** Evidence tags: CONFIRMED (traced on master
`b7e5f1e` / V2 docs) / GAP / OPEN-DECISION.

---

## 0. Verdict up front

- **A/B/C/D → D (existing MTO Job flow extended).** The arrangement is built in the **MTO domain** (Template/Job +
  MaterialUsage); the **Billing context** sells the Job as one bundle/Job-SKU line. This is exactly how V2 already
  frames it (`DOMAIN-MODEL §1`, `EVENT-FLOW JobSold`). **Not C** (do NOT build a second component builder inside
  Sale/Billing — it would duplicate MTO and re-open the double-deduct risk `ADR-MTO-SELLABLE` closed).
- **Implementation authorization: NOT NOW.** Track J's pricing + cost snapshot + cancellation-reversal are **Phase 2C**
  (`GATE §3/§5/§11`, cost wall). The only READY gate is **Phase 2A = link `Job → Template` (`templateId`), explicitly
  excluding Recipe/Cost/Analytics** (`GATE §11`). So Track J is design-complete but **gated behind Phase 2C**; the
  actionable next step is Phase 2A (its prerequisite), not Track J itself.

## 1. The 12 questions — answered against the locked V2 model

| # | Question | Answer (reconciled with V2) |
|---|---|---|
| 1 | Recommended UX flow | Create Job (from Template or ad-hoc) → pick components (`MaterialUsage`, editable) → **JobFulfilled** (deduct + cost snapshot) → **JobSold** via POS (revenue snapshot + bundle line). `EVENT-FLOW` lifecycle, unchanged. |
| 2 | Which screen owns it | **MTO page** owns the build (component picker already exists: "เพิ่มวัตถุดิบที่ใช้"). **POS/Billing** owns the sale (Feature 1). No new screen. |
| 3 | What happens on component select | Writes `MaterialUsage` (expected pre-filled from `RecipeVersion` via `RecipeCopied`; editable until fulfilled). `DOMAIN-MODEL §5`. |
| 4 | How selling price is calculated | See §2 — **Option A** (Σ component *selling* price + arrangement fee) as `suggestedPriceAtClose`; `actualPrice` = final agreed at sale. |
| 5 | Arrangement/service fee | A **fee amount on the Job** folded into suggested/actual price. **NOT** a ZORT stock line and **NOT** a component SKU (bundle sells as one Job SKU). New small field (§5). |
| 6 | Component cost preservation | `JobFulfilled` freezes `actualMaterials[]` + `unitCostAtClose[]` + `actualCost` (`EVENT-FLOW`, immutable). ⚠️ **cost wall**: ZORT has no real cost → `unitCostAtClose` unreliable until Phase 2C. |
| 7 | Stock deduction | Existing `applyMtoFulfillment_` (DMJ sheet) + `decreaseMtoStockInZort_` (ZORT), component-level, at fulfillment. **Reuse 100%** — do not add a second deduction path. |
| 8 | What the customer sees | One bundle line = Job SKU (`splitMtoSaleItems_` → per-Job SKU per Migration Plan; master still uses single `MTO_BUNDLE_SKU`) + `actualPrice`, e.g. "แจกันชุด — X฿". Components hidden. |
| 9 | What warehouse/accounting sees | Warehouse: component-level `MaterialUsage` (internal). Accounting: bundle revenue now; `actualCost`/`actualMargin` once Phase 2C lands cost data. |
| 10 | Cancellation/reversal | **OPEN-DECISION (Phase 2C).** JobCancelled *after* fulfilled requires a `StockReversal` record (`GATE §3/§4`) — auto-return vs manual is the unresolved business decision. Do not resolve here. |
| 11 | Job state ↔ Sale/Billing | Two **independent** state machines (fulfillment vs saleStatus), locked (`GATE §4`, F1). Sale is a separate bounded context referencing `jobId`; `JobSold` is the join event. |
| 12 | New entities/fields? | **Mostly reuse** (Job, MaterialUsage, JobSnapshot). New: (a) an **arrangement-fee** field on Job; (b) a **suggested-price computation** (read-only helper). `StockReversal` already planned (Phase 2C). No new aggregate for Track J. |

## 2. Pricing model recommendation (Priority 2)

**Recommend Option A — component *selling* prices + arrangement fee — for the auto-`suggestedPrice`.** Rationale
grounded in existing evidence:

- **Option B (component cost + margin + fee) is NOT computable today.** ZORT provides retail price but **no real
  cost** (dashboard audit + `GATE §5` cost wall). `COST_RATIO = 0.8` is a *placeholder*, not real cost. Building an
  auto-price on cost would print a fabricated number — forbidden.
- **Option A is computable now:** component *selling* price (`p.price`, retail) exists in `SHEET_PRODUCTS`/ZORT; a
  wholesale ratio exists. `suggestedPrice = Σ(componentQty × componentSellingPrice) + arrangementFee`.
- **Map to the two-stage snapshot (no new machinery):**
  - `suggestedPriceAtClose` = Option-A computed value (already a field in `JobSnapshot`).
  - `actualPrice` = final agreed price at `JobSold` (override allowed — salesperson may renegotiate).
  - `actualMargin` = `actualPrice − actualCost` — **deferred to Phase 2C** (needs real cost). Until then, show
    revenue only; do **not** display a margin computed from placeholder cost.
- **Historical immutability (required):** price is frozen at `JobSold` into `actualPrice`; cost at `JobFulfilled`.
  A later Template/price change must never alter a sold Job's snapshot (V2 guarantees this — Job immutable after sale).
- **Override / discount:** `actualPrice` is the single source for what the customer pays; discounts adjust
  `actualPrice`, not the components. **Never silently recompute a completed sale's price** (the directive's hard rule;
  V2's immutability already enforces it).
- **Tax:** the bundle line goes to ZORT as one SKU at `actualPrice`; VAT handling follows the existing POS bill path
  (`createSaleBill` / `computeBillTotalsGs_`) — no MTO-specific tax logic.

**Chosen model = Option A now → Option D (hybrid) at Phase 2C**: auto-suggested from component selling price + fee,
manual `actualPrice` override, and margin added only once real cost exists.

## 3. Phasing (authorization map)

| Track-J capability | V2 phase | Authorized now? |
|---|---|---|
| Link Job → Template | **Phase 2A** | ✅ READY (`GATE §11`) — the prerequisite |
| Build arrangement from components + deduct | already on master (F1) | ✅ exists |
| Sell as bundle/Job SKU | Migration Plan (Job SKU) | ready on its branch, not merged |
| Auto-suggested price (Option A) + arrangement fee | **Phase 2B/2C** (pricing) | ❌ not gated yet |
| Cost snapshot / margin | **Phase 2C** (cost wall) | ❌ blocked by cost data |
| Cancellation reversal (`StockReversal`) | **Phase 2C** | ❌ open business decision |

## 4. Recommended next step (smallest, authorized)

**Do Phase 2A only** (link `Job.templateId` → Template; reject creating a Job from a `retired` Template) — it is the
gated-READY prerequisite and does not touch pricing/cost/reversal. Track J's pricing/fee is the *next* design gate
(Phase 2B) and needs an owner pricing decision (confirm Option A + define the fee input). Do not implement Track J
end-to-end until Phase 2C authorization.

## 5. Open decisions for the owner (do not assume)
1. **Arrangement-fee input:** flat per-job amount, or per-arrangement-type default? (needed for §2 auto-price).
2. **Cancellation-after-fulfilled:** auto stock-return vs manual adjustment (Phase 2C, `EVENT-FLOW JobCancelled`).
3. **Confirm Option A** as the suggested-price basis (vs waiting for cost to enable margin-based pricing).
