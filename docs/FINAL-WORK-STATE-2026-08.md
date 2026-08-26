# FINAL WORK STATE — 2026-08-26

Single authoritative status for every track this session touched. No track omitted. Statuses:
DONE/MERGED · READY TO MERGE · READY FOR IMPLEMENTATION · ARCHITECTURE READY · BLOCKED–OWNER · BLOCKED–RUNTIME · DEFERRED.

| Track | Branch | Latest commit | Status | Evidence | Next action | Blocker |
|---|---|---|---|---|---|---|
| **1. Performance (incident 08-26)** | `claude/full-system-scrutiny-2026-08` | incident doc | **BLOCKED–RUNTIME** (closed OBSERVABILITY-LIMITED) | doGet 21.9 s / keepWarm 19.1 s CONFIRMED (runtime); timeout amplifier + Fetch-is-aborted CONFIRMED (code); rebuild-storm STRONG; RC-1..4 UNKNOWN | capture 1 burst of `[perfB]` via Track B, then size Fix-1 timeout | durable observability (Track B) + owner timeout-budget decision |
| **2. Security (F-08 + F-07)** | merged → `master` | `7cc4a53` (PR #105) | **DONE / MERGED / DEPLOYED** | CI green (unit+browser); 2378 tests; deploy-gas.yml success (clasp push+deploy); net diff = 6 security files | (F-07 flag flip is separate) | — |
| **2a. F-07 flag** | `master` (deployed OFF) | `7cc4a53` | **BLOCKED–OWNER** (inert, default OFF) | `f07Guard_` pass-through when flag≠'true' (tested) | confirm owner/saler logged in → set `F07_PROTECTION_ENABLED=true` | owner rollout decision |
| **3a. MTO Phase 2A** | `docs/mto-jobsku-migration-plan` | `2b2335b` | **READY FOR IMPLEMENTATION** | gate §11 `READY FOR PHASE 2A` (Job→Template only) | implement smallest step (templateId FK + retired-Template precondition) | owner GO |
| **3b. MTO custom sale / pricing (Track J)** | `docs/mto-jobsku-migration-plan` | `2b2335b` (addendum) | **ARCHITECTURE READY** | verdict D; 12 Q answered vs two-stage snapshot; pricing Option A (margin=Phase 2C cost wall) | owner confirms Option A + arrangement-fee input | owner pricing decision + Phase 2C |
| **3c. MTO cancellation/reversal** | `docs/mto-jobsku-migration-plan` | existing gate | **BLOCKED–OWNER** (Phase 2C) | `StockReversal` schema designed (gate §3/§5); JobCancelled-after-fulfilled open | owner picks auto-return vs manual | owner decision (Phase 2C) |
| **4. SKU taxonomy** | `claude/full-system-scrutiny-2026-08` | `4be6953` | **BLOCKED–OWNER** | SKU=barcode=ZORT key; parseSkuParts/compareSku/grouping depend on current structure; additive-safe / replace=migration | owner picks additive vs replace vs mismatch | owner decision |
| **5. Owner Business Dashboard** | `claude/full-system-scrutiny-2026-08` | `4be6953` | **ARCHITECTURE READY** | decision matrix (metric→source→freshness→reliability→action); margin ❌ cost wall; failed-ZORT/LINE need surface | owner picks L1 tiles → compose from existing endpoints | owner decision (+Track B for exception rows) |
| **6. Report Engine** | `docs/report-notification-architecture-review` | de764bb (owned) | **ARCHITECTURE READY / IMPL BLOCKED** | review complete (no Report Registry exists; PDF via window.print reuse) | gate/merge that branch after perf+observability | sequencing (perf/observability first) |
| **7. Notification / LINE (F-10 dead-letter)** | scrutiny + gate §9 | `4be6953` | **DEFERRED** | drainNotiQueue retries 400 like transient; no dead-letter; code available | persist `code`+body + dead-letter after Track B | sequencing (Track B) |
| **8. Durable Observability (Track B)** | `claude/durable-observability-design-v1` | 0eca5af (owned) | **READY FOR IMPLEMENTATION** | Option C (Hybrid batched-queue) design complete; **now top prerequisite** (2 incidents closed observability-limited) | implement Option C | owner GO |
| **9. Backend Stability / RC-1..5** | `gas-backend-stability-audit-itscv0` + Phase B on master | f3e5956 (Phase B live) | **BLOCKED–RUNTIME** | Phase B `[perfB]` deployed (log-only); RC-1..4 UNKNOWN, RC-5 not reproduced | capture burst logs via Track B → `perf-report.mjs` | runtime evidence |
| **10. Deployment / CI** | `master` | `7cc4a53` | **DONE** | Tests (unit+browser) green on PR; deploy-gas.yml success; live HTTP smoke **blocked by sandbox network policy** (proxy 403 to script.google.com) — owner to browser-verify | owner opens app + confirms debugOrders?role=owner → Unauthorized | — (live smoke = env limitation only) |
| **Audit/scrutiny + delta + reconciliation** | `claude/full-system-scrutiny-2026-08` | head | **DONE** | full-system scrutiny, delta (baseline validation), branch reconciliation | consume | — |

**Branches pushed this session:** `claude/security-debugorders-authz` (merged→master, safe to delete),
`docs/mto-jobsku-migration-plan` (addendum pushed), `claude/full-system-scrutiny-2026-08` (all analysis/incident/handoff).
**No branch deleted** (per instruction). **No production flag flipped.** **No speculative fix implemented.**
