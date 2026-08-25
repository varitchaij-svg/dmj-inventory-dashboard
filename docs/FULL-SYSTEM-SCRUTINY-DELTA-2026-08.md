# FULL SYSTEM SCRUTINY — Baseline Validation Delta (2026-08-25)

**Purpose:** validate whether `FULL-SYSTEM-SCRUTINY-2026-08.md` was performed against current production.
**Answer: it was NOT.** The audit ran against a baseline that origin/master has since moved 67 commits past.
This document reconciles the two without rewriting the original findings. **No code changed; audit only.**

Evidence tags: **CONFIRMED** · **STRONG EVIDENCE** · **HYPOTHESIS** · **OUTDATED BASELINE** · **NOT APPLICABLE**.
Distinguish **CODE EVIDENCE** (traced on a ref) from **PRODUCTION EVIDENCE** (none available in-session).

---

## 1. Audit baseline commit

- **`3dbc41d`** — "fix(stockcount): มือถือ autosave ไม่ทำงาน…" — **2026-08-15**.
- This is the `git merge-base` of the audit branch `claude/full-system-scrutiny-2026-08` and origin/master (CONFIRMED).
- The original report's claim "last commit ~2026-08-15" was true **only for the local HEAD** at audit time. It was
  **OUTDATED BASELINE** relative to origin/master, which already carried newer production commits. The original
  report should be read as *"as-of `3dbc41d`"*, not *"as-of production"*.

## 2. Current origin/master commit

- **`b7e5f1e`** — "Merge pull request #101 … claude/stock-count-realtime-y18igl" — **2026-08-24 14:15 +0700** (CONFIRMED).
- User-named commits verified present: **`b7e5f1e`** (tip), **`b3b443b`** ("feat: Realtime Stock Count", 2026-08-23).

## 3. Commits between baseline and current (67 total, CONFIRMED)

Grouped by track (representative commits):

| Track | Commits (sample) | Touches |
|---|---|---|
| **Realtime Stock Count** | `b3b443b`, `b7e5f1e` (#101), `4f37867`, `a7801cb`, `7fc3543`, stockcheck-instant-patch | views + `.gs` write/patch path |
| **Phase 7.6 login (A–E, COMPLETE)** | `7fe74b8`,`e761908`,`6dfeb86`,`eda485b`,`b5aba65`,`736f01c`,`363f458` | app.jsx auth, `resolveSession_` 300s cache, handoff |
| **Phase B observability** | `f3e5956`, `11b4287` (+`scripts/perf-report.mjs`) | `.gs` `[perfB]` log-only instrumentation |
| **Payload Phase A1 (pv=3 columnar)** | `ae0c228`, `5de1e85` | `buildFullData_`/shaping/cache-key |
| **MTO Sell via POS (Feature 1, #99)** | `a95e745`,`236b381`,`e4aa7db`,`56c511c`,`fd04f03`,`3339fc3` | `applyMtoFulfillment_`, `decreaseMtoStockInZort_`, views-analytics |
| **Transfer "ส่ง Central" / dup-fix** | `8fe994c`(#98), `da7ebf8`, `f0a6b14`, `transferStockBatchCentral` | `.gs` new transfer path |
| **Order dup-close fix** | `df2daa2` | OrderModal |
| **Label printing (barcode/card)** | many `แผ่นแปะสินค้า` + `f191757`, `jsbarcode.min.js` | views + new client lib |
| **Quotation (saler) view** | `383ee8e`, `1f83488` | views-quote/analytics |
| **Stock-check split follow-ups** | `a6c6267`, `b5c7be3`, `747ac5b`, `6e80f74` | `.gs` + views |

## 4. Files changed between them (CONFIRMED — `git diff --stat 3dbc41d..b7e5f1e`)

**8,021 insertions / 404 deletions across 40 files.** Not a minor delta.

| Area (gate's list) | Change | Bears on |
|---|---|---|
| `appsscript_complete.gs` | **+1140 / −171** | F-01,F-02,F-03,F-04,F-05,F-07,F-08,F-10,F-14 (the most-audited file) |
| `views-analytics.jsx` | **+1099 / −123** | MTO-POS, realtime, labels, quote |
| `views-main.jsx` | +473 / −12 | labels, cards, product |
| `app.jsx` | +205 / −38 | Phase 7.6 login, polling |
| `views-quote.jsx` | +53 | quotation |
| `service-worker.js` | +1 / −1 | CACHE_NAME bump only |
| `config.js` | **unchanged** | F-09 token model unchanged |
| deploy workflow (`.github/`) | **unchanged** | §2 deploy pipeline unchanged |
| `tests/` | **25 files changed** (+11 new suites: columnar-payload, mto-pos-*, stock-count-session, login-resilience, perf-observability, order-central, label-*, intake-pdf, latest-intake, stockcheck-instant-patch) | F-15 coverage improved |
| `docs/` | +ADR-MTO-SELLABLE, +HANDOFF-BACKEND-OBSERVABILITY, +HANDOFF-PHASE7.6-COMPLETE | Phase B, MTO, 7.6 |

Areas the gate asked about, resolved: **auth/session** = changed (7.6). **LINE** = unchanged in the 67 (F-10 stands).
**MTO** = major new (POS sell). **realtime stock count** = new. **report code** = not on master (see §7). **deploy
workflow** = unchanged.

## 5. Findings potentially INVALIDATED / changed by the delta

| ID | Status | Why | New evidence |
|----|--------|-----|--------------|
| **F-01** payload 4.5 MB | **PARTIALLY ADDRESSED — RE-MEASURE** | Phase A1 added `pv=3` **columnar** products encoding (`ae0c228`), a different lever than the role-variant the original called "only 8%". `payloadEncodingForRequest_` handles enc=3, cache-keyed `_v3` (CODE EVIDENCE, gs origin/master:13471/13502). Round-trip equivalence tested (`columnar-payload.test.js`). | The original "4.5 MB / variant cuts 8%" is **OUTDATED BASELINE** for the size question. Current on-wire size with pv=3 is **UNKNOWN in-session** (no production measure) → the *ceiling* concern stands as HYPOTHESIS pending re-measure; the *characterization* is stale. |
| **F-14** no durable observability | **STILL VALID — RE-CHARACTERIZE** | Phase B (`f3e5956`) added 7 structured `[perfB]` metrics + `scripts/perf-report.mjs`. But `HANDOFF-BACKEND-OBSERVABILITY.md` states it is **log-only, fail-safe** — **still ephemeral (no durable sink)**. | The gap the finding names (durable, queryable sink) **remains**; the finding must credit Phase B and point at the (unmerged) `DURABLE-OBSERVABILITY-DESIGN-V1` work rather than imply nothing exists. |
| **F-15** write-path concurrency untested | **PARTIALLY ADDRESSED** | New suites `stock-count-session`, `mto-pos-e2e`, `login-resilience`, `perf-observability`, `transfer-idempotent` (+32) raise coverage. Pure lock-contention across ZORT still not integration-tested. | Downgrade scope, keep open. |
| **F-16/F-17** monolith / CLAUDE.md size | **WORSE (as expected)** | `.gs` +1140 lines, CLAUDE.md +118. Still WATCH, not action. | — |

## 6. Findings STILL VALID against current origin/master (re-verified, CODE EVIDENCE)

| ID | Re-verify result on `b7e5f1e` | Evidence |
|----|-------------------------------|----------|
| **F-07** reads unauthorized (customer PII) | **STILL VALID — CONFIRMED** | `handleGetCustomerAnalytics_/QuotationSummary_/PendingQuotations_/DeadStock_` = **0** `resolveSession_`/`isAdminRole_` on origin/master. `getPendingQuotations` still returns `phone`/`email`. |
| **F-08** `debugOrders` trusts client role | **STILL VALID — CONFIRMED** | origin/master gs:3002 `if (!isAdminRole_(e.parameter.role))`. |
| **F-05** lock across ZORT | **STILL VALID — EXPANDED** | `transferStockBatch` lock 4228 → `createZortTransferBatch_` 4314 → release 4359. **New** `transferStockBatchCentral` (4379→4464) same pattern. `createSaleBill` lock 14794 → AddOrder 14825 / GetOrderDetail 14840 / fetchAll 14879 → release 14983. Corroborated by **RC-2** (Backend Stability Audit: Drive-in-`punch`-lock — same class). |
| **F-03** attendance full-scan/punch | **STILL VALID — CONFIRMED** | `readAttEvents_` still `getRange(2,1,last-1,17)`. |
| **F-04** `getAuditLog` full-scan | **STILL VALID — STRONG EVIDENCE** | No commit targeted `getAuditLog`; full `getDataRange()` pattern persists. |
| **F-02** `readQtyByLocation_` redundant read | **STILL VALID — STRONG EVIDENCE (re-verify)** | Perf work was payload-encoding + observability, not build I/O; no commit touched this read. |
| **F-06/F-09/F-10/F-11/F-12/F-13** | **STILL VALID** | 39→more `getScriptLock` sites (F-06 worse); config.js unchanged (F-09); no LINE-queue commit (F-10/F-12); write-then-confirm pattern intact (F-11); Overview unchanged structurally (F-13). |

## 7. New risks introduced AFTER the original audit (new surface — NOT covered by original)

| ID | Area | Status | Note |
|----|------|--------|------|
| **N-01** | `transferStockBatchCentral` (`ส่ง Central`) | HYPOTHESIS | New transfer path; same lock-across-ZORT shape as F-05 — inherits F-05, needs the same treatment. |
| **N-02** | MTO-POS sell: `applyMtoFulfillment_` / `decreaseMtoStockInZort_` (`e4aa7db`,`56c511c`) | HYPOTHESIS | New ZORT write path from POS. Verify lock scope (F-05 class), idempotency, and component-SKU deduction vs double-deduct. |
| **N-03** | Realtime Stock Count instant-patch (`b3b443b`) | HYPOTHESIS | Patches numbers immediately post-save + "Counting Session" timing. Verify interaction with `stocklite` poll + conflict detection. |
| **N-04** | Phase 7.6 login deployed (`resolveSession_` 300s cache, `eda485b`) | STRONG EVIDENCE (context) | Changes session cost — directly relevant to **RC-3** (resolveSession amplification). Reduces per-request session writes; re-baseline auth cost before acting on RC-3. |
| **N-05** | `jsbarcode.min.js` new client dependency | HYPOTHESIS | New asset; verify it's self-hosted (CSP/offline), size impact on boot. |
| **N-06** | **RC-1..RC-5 (Backend Stability Audit v1, `f3e5956`)** | **UNKNOWN (unproven)** | `HANDOFF-BACKEND-OBSERVABILITY.md` defines RC-1 (~30-exec ceiling), RC-2 (Drive-in-punch-lock), RC-3 (resolveSession), RC-4 (ZORT-bound), RC-5 (doPost 298s=syncZortNow) as **hypotheses awaiting real burst logs** ("ยังไม่มี log จาก burst จริง"). **No production evidence exists** → per the gate, **all RC-1..RC-5 remain UNKNOWN.** They corroborate F-05/§16 capacity but are not proven. |

**Reconciliation note (gate item):** The original audit's EG-1 said the RC vocabulary "does not exist in the repo."
That was **CONFIRMED-at-`3dbc41d`** but is **OUTDATED** — the RC set exists on origin/master via `f3e5956`. Corrected
here. The audit's independent findings (F-05 lock-across-external, §16 ~30-exec ceiling, F-14 observability) **match**
the Backend Stability Audit's RC-2/RC-1/RC-4 — two independent audits converging is signal, not coincidence.

**Design docs the gate/backlog names that are NOT on origin/master** (live on unmerged branches — seen in fetch:
`origin/docs/report-notification-architecture-review`, `origin/docs/mto-jobsku-migration-plan`, worktree-agent
branches): `DURABLE-OBSERVABILITY-DESIGN-V1.md`, `REPORT-NOTIFICATION-ARCHITECTURE-REVIEW-V1.md`,
`DOMAIN-MODEL-MTO-V2-2026-08.md`, `EVENT-FLOW-MTO-V2-2026-08.md`, `MTO-ARCHITECTURE-REVIEW-GATE.md`. **Status:
NOT APPLICABLE to a master-vs-baseline delta**; they must be reconciled at branch level before those tracks proceed
(flagged for the autonomous backlog, not this gate).

## 8. Findings requiring RE-VERIFICATION (against origin/master, before any fix)

1. **F-01** — measure current pv=3 on-wire payload size (needs a live request or a local build harness). Until then
   its severity is HYPOTHESIS, not the original CONFIRMED-measured 4.5 MB.
2. **F-02** — confirm `readQtyByLocation_` still re-reads the in-memory stock sheet on origin/master (STRONG, not re-run).
3. **N-01/N-02/N-03** — audit the three new write/patch paths for lock-across-ZORT, idempotency, double-deduct.
4. **F-14** — reconcile against `DURABLE-OBSERVABILITY-DESIGN-V1` (unmerged) before designing anything new.
5. **RC-1..RC-5** — remain UNKNOWN until real burst `[perfB]` logs are collected and run through `perf-report.mjs`.

## 9. Updated P0/P1/P2/P3 ranking (against origin/master)

- **P0 (do first — confirmed on current master, safe/narrow):**
  - **F-07** read authorization / customer PII (CONFIRMED on b7e5f1e).
  - **F-08** `debugOrders` client-role trust (CONFIRMED on b7e5f1e).
- **P1:**
  - **F-05 + N-01 + N-02** lock across ZORT (transfer, central, sale, MTO-POS) — one coherent fix family.
  - **F-14** durable observability — reconcile with `DURABLE-OBSERVABILITY-DESIGN-V1`; enables proving RC-1..RC-5.
  - **F-01** payload — re-measure pv=3 first (may have dropped it from P1).
- **P2:** F-02, F-03, F-04, F-10, F-11, F-13, N-03 (realtime concurrency).
- **P3:** F-06, F-09, F-12, F-15 (residual), F-16, F-17, N-05.
- **UNKNOWN (evidence-gated):** RC-1..RC-5 — instrument→collect→prove before ranking.

---

## VERDICT

# B. AUDIT VALID WITH DELTA

The original scrutiny was performed against **`3dbc41d` (OUTDATED BASELINE)**, 67 commits / 8,021 line-insertions
behind origin/master **`b7e5f1e`**. It is **not** invalid: every P0/P1 structural finding re-verified on current
master **still holds** (F-07, F-08, F-05, F-03, F-04), and two of them are **independently corroborated** by the
newer Backend Stability Audit (RC-1/RC-2/RC-4). But it is **not** current: F-01 must be re-measured against pv=3,
F-14 must credit Phase B, and **three new write/patch paths (N-01/N-02/N-03) plus the RC-1..RC-5 hypothesis set are
new surface the original audit never saw.**

**Consume the original report as "as-of `3dbc41d`", this delta as the reconciliation to `b7e5f1e`.** Do not merge old
and new evidence silently. Before any implementation, re-verify on origin/master (§8) and branch from `b7e5f1e`,
never from the audit branch.

RC-1..RC-5: **UNKNOWN** — no production evidence in the repository; they are instrumented hypotheses, not root causes.
