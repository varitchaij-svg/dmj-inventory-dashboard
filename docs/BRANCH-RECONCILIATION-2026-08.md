# BRANCH RECONCILIATION — Parallel Work Map (2026-08-25)

Cross-branch reconciliation requested by the autonomous backlog §0 ("if multiple branches contain work on the same
topic, reconcile them before starting"). **No single topic branch contains this map** — each is scoped to its own
track. **Read-only; no code changed.** Baseline for "master" = `b7e5f1e` (2026-08-24, CONFIRMED via `git fetch`).

Evidence: all branch tips/dates from `git log -1 <ref>` (CODE EVIDENCE). "Design-only" status quoted from each doc's
own header.

---

## 0. Correction to earlier delta (evidence update)

`FULL-SYSTEM-SCRUTINY-DELTA-2026-08.md` §7 said the "2026-08-25 incident" and RC docs were only referenced. **Now
located (CONFIRMED):**
- `docs/INCIDENT-2026-08-25-BURST.md` → **`origin/claude/erp-concurrent-slowness-incident-cbj5e1`** (2026-08-25 07:58).
- `docs/AUDIT-BACKEND-STABILITY-V1-CLOSURE.md` + `docs/HANDOFF-2026-08-21-AUDIT-CLOSE-NEXT-WORK.md` → on branch(es).
- The incident is closed **observability-limited** (evidence rotated out of the Apps Script Executions UI before
  capture). This is the direct motivation for Track B (durable observability).

So the original scrutiny's EG-1 ("RC vocabulary / incident not in repo") was **CONFIRMED-at-`3dbc41d` but is now
superseded**: all of it exists on unmerged branches. **RC-1..RC-5 nonetheless remain UNKNOWN** — the incident doc
itself closes them as unproven (evidence lost). No production evidence exists to upgrade them.

---

## 1. Topic → authoritative branch → status (the anti-duplication map)

| Track | Topic | Authoritative branch (tip) | On master? | Status | Do NOT |
|---|---|---|---|---|---|
| — | **Incident 2026-08-25 burst** | `erp-concurrent-slowness-incident-cbj5e1` (08-25) | ❌ | CLOSED observability-limited | re-investigate the incident; evidence is gone |
| A | Backend stability audit v1 (RC-1..RC-5) + Phase B instrumentation | `gas-backend-stability-audit-itscv0` (08-20) | ✅ Phase B `[perfB]` merged (`f3e5956`); closure doc unmerged | Instrumentation DONE; RC's UNKNOWN (need burst logs) | re-derive RC's; don't call any RC a root cause |
| B | **Durable observability design** | `durable-observability-design-v1` (**08-25, today**) | ❌ | DESIGN-ONLY complete; recommends Option C (Hybrid batched-queue) | author a competing design; implement without the gate |
| G | **Report Engine + Notification Center review** | `docs/report-notification-architecture-review` (08-21) | ❌ | DESIGN-ONLY complete | recreate; assume Report Engine exists (it doesn't) |
| I/J | **MTO V2** (domain model, event flow, migration, review gate) | `docs/mto-jobsku-migration-plan` (08-21) | ❌ | GATE PASSED; Phase 2A READY (aggregates locked: Template/Job/Customer + new `StockReversal`) | reopen closed aggregate decisions; jump to 2B/2C |
| — | MTO POS sell (Feature 1) | merged (#99) | ✅ | LIVE on master | re-audit as "new" without reading ADR-MTO-SELLABLE |
| — | Realtime Stock Count | merged (#101, `b3b443b`) | ✅ | LIVE on master | treat as unaudited-forever; see N-03 |
| — | Phase 7.6 login | merged (A–E) | ✅ | LIVE (`HANDOFF-PHASE7.6-COMPLETE`) | redo; note `resolveSession_` 300s cache changed RC-3 basis |
| E | Payload perf (A1 columnar pv=3) | merged (`ae0c228`) + `gas-payload-perf`, `first-load-perf`, `web-performance-planning-42ych5` | partial | A1 LIVE; further design on branches | re-measure F-01 without pulling these |
| F | Business dashboard / owner view | `dashboard-analysis-plan-2r6kn9`, `system-analysis-owner-saler-i4lp08`, `procurement-demo-dashboard-6y1kji` | ❌ | analysis exists (unread here) | author `BUSINESS-OWNER-DASHBOARD-REVIEW` before reading these = duplicate |
| C | **Security F-07/F-08** | none | ❌ (confirmed unfixed on master) | **READY to implement** (only track with no existing design owner) | — |

## 2. Contradictions found (reconciled, not silently chosen)

1. **"Report Engine exists" (backlog Track G) vs reality.** Track G's own review states no Report Registry/Engine
   exists anywhere; it is a from-scratch design. **Newer doc wins:** treat Report Engine as greenfield design, not
   an existing system to extend. (Backlog wording is aspirational.)
2. **MTO vs LINE ownership.** Both Track G review and MTO gate agree explicitly: **MTO is NOT the owner of LINE
   architecture**; notification consolidation is a separate system-wide concern. No contradiction — aligned. Track H
   (LINE) must not be folded into MTO.
3. **My original audit F-14 "no observability" vs Phase B.** Reconciled in the delta: Phase B added log-only
   `[perfB]`; the durable gap is what Track B (Option C) addresses. No contradiction — F-14 is the *durability*
   layer Track B designs.
4. **My F-01 "4.5 MB / variant 8%" vs A1 columnar pv=3.** A1 (merged) is a different, live lever. F-01 must be
   re-measured against pv=3 before ranking. (Delta §5.)

## 3. Recommended safe merge / execution order (dependency-aware)

1. **Reads before code (this map).** ✅ done.
2. **Security (Track C, F-07/F-08)** — the only track with no existing design owner and confirmed-unfixed on master.
   Smallest safe unit. **One decision gates F-07:** strict session gate risks locking out staff not yet logged in
   while `REQUIRE_LOGIN` is off (same failure class as the 7.6 rollback) → needs owner confirmation of login rollout
   state, OR ship behind a flag. **F-08 (`debugOrders`) is unambiguously safe** (no normal flow calls it). See §4.
3. **Track B durable observability** — merge/implement Option C next; it unblocks proving RC-1..RC-5, which gates
   Track A/D performance decisions (don't tune what you can't measure).
4. **Track D/A lock+perf (F-05, F-02)** — only after B gives durable evidence; needs a write-path integration harness
   (F-15) first.
5. **Track I MTO V2 Phase 2A** — READY per its gate; smallest step only, from its own branch.
6. **Track F dashboard, Track G report** — from their own branches, after reading the existing analysis.

## 4. The one READY implementation gate: Track C security (F-07 / F-08)

**Confirmed on `b7e5f1e` (CODE EVIDENCE); not fixed on any branch.** Prepared but NOT implemented here (belongs on a
fresh branch from `b7e5f1e`, and F-07 carries a rollout decision that is the owner's to make).

**F-08 — `debugOrders` trusts client `role` (SAFE to fix now):**
- Endpoint: `doGet action=debugOrders`, gs `if (!isAdminRole_(e.parameter.role))`.
- Fix: replace with `resolveSession_(ss, e.parameter.sessionToken)` + `isAdminRole_(sess.role)` (mirror `getAuditLog`),
  or delete the endpoint (it returns 15 raw order rows for debugging). No normal user flow calls it → zero lockout risk.
- Regression: add a test asserting `debugOrders` denies a forged `role=owner` without a valid session.

**F-07 — analytics/quote reads unauthorized (NEEDS one owner decision):**
- Endpoints: `getCustomerAnalytics`, `getQuotationSummary`, `getPendingQuotations` (returns customer `phone`/`email`),
  `getQuotationForPrint`, `getDeadStock` — currently token-only, 0 session checks.
- Fix shape: add `resolveSession_` + role check (owner/dev/saler as appropriate per endpoint).
- **Decision required:** strict gate (deny no-session) protects PII immediately **but** can lock out staff who have
  not yet logged in while `REQUIRE_LOGIN` is off (the 7.6-rollback failure class). Options: (a) confirm all
  owner/saler staff are logged in, then strict-gate; (b) ship behind a per-endpoint flag defaulting to current
  behavior, flip when ready. **This is the owner's call — do not auto-decide.**
- Regression: tests asserting each endpoint denies without a valid session/role once gated.

---

## Verdict

The backlog's implementation tracks are **not idle work waiting to be done blindly** — they are **active, recent,
design-gated efforts on separate branches** (Track B's tip is today). The correct engineering move is exactly what
this map enables: **reconcile → pick the one track with no existing owner (security) → gate the rest to their own
branches in dependency order.** Proceeding to author or code Tracks A/B/F/G/I here would duplicate live work, which
the backlog explicitly forbids. **Only Track C (F-07/F-08) is genuinely unclaimed and ready**, and F-07 needs one
owner decision before it can ship safely.
