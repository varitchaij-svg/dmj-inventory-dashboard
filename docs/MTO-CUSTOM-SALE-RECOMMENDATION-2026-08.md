# MTO Custom-Arrangement Sale — Boundary Recommendation (2026-08-25)

Track J: "salesperson builds a custom arrangement (3 flowers×5 + vase + oasis + fee) → price it → deduct components
→ show one bundle line 'แจกันชุด ราคา X'". **This is a recommendation grounded in current master, reconciled with
the existing MTO work — NOT a new architecture.** Architecture ownership stays with the MTO V2 branch. No code changed.

Tags: CONFIRMED (traced on `origin/master b7e5f1e`) / GAP / OWNED-ELSEWHERE.

---

## 1. What already exists on master (CONFIRMED — do not rebuild)

| Track-J requirement | Already in master? | Evidence |
|---|---|---|
| Build arrangement from component SKUs | ✅ **YES** | MTO page component builder "ค้นหาและเพิ่มวัตถุดิบที่ใช้ในงานนี้" (views-analytics ~5349, views-main ~7790); `createMtoJob` + `SHEET_MTO_ITEMS` ("วัตถุดิบ MTO") |
| Deduct all component SKUs from inventory | ✅ **YES** | `applyMtoFulfillment_` deducts per-item `qtyWH`/`qtyFS` (gs:13944–13950) |
| Preserve component-level inventory transaction | ⚠️ partial | components stored in `SHEET_MTO_ITEMS`; but deduct is a current-balance mutation, not a reversible ledger — MTO V2 adds `StockReversal` (its gate §1) |
| Sell via POS | ✅ **YES** (Feature 1) | `canSellMtoJob_`/`markMtoJobSold_`; two independent state machines (fulfillment vs sale) per `ADR-MTO-SELLABLE` |
| Show customer-facing as ONE bundle line, hide components | ✅ **YES** | `splitMtoSaleItems_(items, bundleSku)` → single `MTO_BUNDLE_SKU` to ZORT, components not sent (gs:14591, 14716) |
| Bundle line identity ("แจกันชุด") | ✅ evolving | master = single `MTO_BUNDLE_SKU`; **MTO V2 branch** replaces it with per-Job SKU (`MIGRATION-PLAN-MTO-JOBSKU`, `splitMtoSaleItems_(items, jobSkuMap)`) |

## 2. The A / B / C / D question — already answered

The requirement's architecture choice is **not open** — it is decided and partly built:

> **Answer ≈ C (integrated), precisely: the MTO domain OWNS building the arrangement (recipe/components/job);
> Sale/Billing is a separate bounded context that SELLS the job as a single bundle/Job-SKU line and triggers the
> component deduction.**

- **Not A (MTO only):** it already sells through POS (Feature 1).
- **Not B (Sale/Billing only):** the arrangement (components, fulfillment, stock reversal) is MTO-domain concern —
  the MTO V2 gate explicitly keeps Sale/Billing as a distinct bounded context referencing the Job via Job SKU.
- Building a parallel "custom sale" component system inside Sale/Billing would **duplicate** MTO and re-introduce the
  double-deduct risk `ADR-MTO-SELLABLE` was written to prevent. **Do not.**

## 3. Genuine GAPs vs Track J (route to the MTO V2 branch — do not design competingly here)

1. **Auto-calculated selling price (GAP).** Today `createMtoJob` takes a **single manual `price`** (gs:13878) — the
   salesperson types the total. Track J wants the system to compute it from components (+ markup/margin + arrangement
   fee). Not present anywhere. **Owner: MTO V2** (Template recipe already models components; pricing rule is the new
   piece). Needs an owner decision on the pricing formula (component retail sum × markup? fixed fee? both?).
2. **Explicit arrangement/service-fee line (GAP).** Today the fee is folded into the manual `price`. A separate fee
   component (SKU-less service line) is not modeled. **Owner: MTO V2 pricing.**
3. **Single-step build-at-POS (UX GAP).** Today: create job in MTO page → fulfill → then sell in POS (two surfaces).
   Track J implies a counter salesperson building ad-hoc in one flow. This is a **sequencing/UX** enhancement on top
   of the existing architecture, not a new architecture. **Owner: MTO V2 Phase 2x** — decide whether to add a
   "quick arrangement" entry that runs create→fulfill→sell atomically (respecting the two state machines).

## 4. Recommendation

- **Adopt the existing boundary (§2). Do not build a separate custom-sale engine.** The component builder, deduction,
  and bundle-line sale already exist; Track J = closing the three GAPs (§3) inside MTO V2, not a new track.
- **Sequence:** land the MTO V2 Job-SKU migration first (it is the correct bundle-line identity and is already gated
  READY on `docs/mto-jobsku-migration-plan`), then add auto-pricing + fee, then (optionally) the single-step POS build.
- **Blocked-here rationale:** items in §3 require owner pricing decisions and belong to the MTO V2 branch. Producing a
  competing design here would violate the anti-duplication rule. This doc is the reconciliation + recommendation only.

## 5. Evidence gaps
- Exact MTO V2 pricing intent (formula, fee model) — **UNKNOWN**; owner input required (§3.1/3.2).
- Whether `MTO_BUNDLE_SKU` is set in production — prior docs say it was never set; Job-SKU migration supersedes it.
