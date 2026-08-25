# FULL SYSTEM SCRUTINY — Finding Register (2026-08-25)

Compact register. Full analysis + evidence traces in `FULL-SYSTEM-SCRUTINY-2026-08.md`.

Confidence legend: **CONFIRMED** = traced in code / measured file; **STRONG** = strong code evidence,
magnitude inferred; **HYPOTHESIS** = plausible, not proven. No hypothesis is silently upgraded.

Severity: P0 (fix before anything) · P1 (fix soon) · P2 (planned) · P3 (opportunistic).
Effort: S (<½day) · M (1–3 days) · L (1–2 weeks) · XL (>2 weeks).

| ID | Area | Sev | Conf | Evidence (file:line) | Impact | Recommendation (audit — do NOT implement yet) | Effort | Deps | Status |
|----|------|-----|------|----------------------|--------|-----------------------------------------------|--------|------|--------|
| F-01 | Payload size | P1 | CONFIRMED (measured) | `PHASE0-RESULTS.md` 40,61; `buildFullData_` gs:2932 `p.mo`/products[] | Perf, Business | Payload 4.5MB ≈ all `products[]` (~5,876 SKUs); role-variant cuts only 8%. Grows with catalog. Finish Phase 8: paginate/segment products, or send a stock-only slice + lazy detail. This is the remaining hard ceiling. | L | — | OPEN (Phase 8 unmet) |
| F-02 | Backend build I/O | P2 | CONFIRMED (measured) | `PHASE0-RESULTS.md` 48,67; `buildFullData_` gs:2902 `readQtyByLocation_` | Perf | build=9.8s, 70% is sheet I/O. `readQtyByLocation_` (1,247ms) re-reads the stock sheet already in memory. Reuse in-memory rows; fold redundant reads. | M | — | OPEN |
| F-03 | Sheets growth | P2 | CONFIRMED | `readAttEvents_` gs:1071 (full-scan per punch) | Perf, Reliability | Every punch reads the WHOLE attendance sheet then filters in JS. O(all rows), unbounded (~1 row/press). Add index / monthly sheets / TextFinder. Already flagged `[perf]` in code. | M | — | OPEN (known) |
| F-04 | Sheets growth | P2 | CONFIRMED | `getAuditLog` gs:2612 `getDataRange()...slice(-200)` | Perf | Reads the entire (fastest-growing) Audit Log to return 200 rows. Read tail range only (last N rows via `getLastRow`). | S–M | — | OPEN |
| F-05 | Lock ↔ external API | P1 | STRONG (code) / INFERRED (magnitude) | `createSaleBill` gs:13926→14089 across Zort 13948/13963/14002; `transferStockBatch` gs:3882→4011 across Zort 3966 | Reliability, Perf | Global `getScriptLock()` held across Zort HTTP round-trips (+retries). Serializes ALL writes behind a sale/transfer's Zort latency. `handleOrder_` already releases before its network call (gs:10288) — apply same pattern. | M | F-12 | OPEN |
| F-06 | Lock granularity | P3 | CONFIRMED | 39 `getScriptLock()` sites | Reliability, Perf | One global script lock protects every unrelated write. Consider per-resource keys only if F-05 relief is insufficient. | L | F-05 | OPEN |
| F-07 | AuthZ (reads) | P1 | CONFIRMED | gs:2660/2655/2640/2650/2635 handlers have 0 session checks; `getPendingQuotations` returns `phone`/`email` (gs handler); token in public `config.js:3` | Security | Customer PII + full sales/quote pipeline served with only the shared public token — no per-user authorization. Gate these behind `resolveSession_` like `getAuditLog`/`attendancePhoto`. | M | — | OPEN |
| F-08 | AuthZ (IDOR) | P2 | CONFIRMED | `debugOrders` gs:2701 `isAdminRole_(e.parameter.role)` | Security | Trusts client-supplied `role` param (the bypassable pattern `getAuditLog` was migrated off, per gs:2596 comment). Switch to `resolveSession_` or remove endpoint. | S | — | OPEN |
| F-09 | Token model | P3 | CONFIRMED (by design) | `config.js:1-3` | Security | `APP_TOKEN` is a static shared secret in public JS = obscurity only. Documented and accepted; real gate must be session (see F-07). No action beyond F-07. | — | F-07 | ACCEPTED |
| F-10 | Notification reliability | P2 | CONFIRMED | `drainNotiQueue` gs:11750-11761; `linePush_` returns `code` gs:11515 but only `quota` used | Reliability | Permanent 400 retried like transient (6×) then row deleted after 7 days — no dead-letter, no escalation, root cause (`code`/body) not persisted. Persist `code`+body; dead-letter/alert on permanent failures. | S–M | F-14 | OPEN |
| F-11 | Partial commit | P2 | STRONG | `transferStockBatch` sheet-write gs:3949 then Zort gs:3966; `createSaleBill` Zort gs:13948 then sheet gs:14022 | Reliability | Failure between local write and external confirm leaves inconsistent state (logged, not auto-reconciled). Idempotency (cid/tid/billCid) + owner repair tools mitigate; add automatic reconciliation pass. | L | — | OPEN (mitigated) |
| F-12 | External API timeout | P3 | CONFIRMED | 89 `UrlFetchApp.fetch`; retry loops gs:4028/6620/6690/13477 | Reliability | GAS `UrlFetchApp` has no per-call timeout; 3× retry multiplies worst-case, inside locks (F-05). Bound retries/backoff on user-facing paths. | S | F-05 | OPEN |
| F-13 | Business-owner UX | P2 | STRONG | `OverviewView` views-main:1204 (pickers/YoY/trends first); exceptions scattered across tabs + `NotiBell` | Business | No single decision-first "state + exceptions to act on today" surface. Compose existing signals (reorder, dead-stock, mismatch, pending receives, low-stock) into an L1/L2 executive view. | M–L | — | OPEN |
| F-14 | Observability | P2 | CONFIRMED | `perfLogDoGet_` gs:15234 (Logger only); BootTrace = client localStorage | Reliability, Maintainability | No durable telemetry sink — after the GAS Executions window rotates, incidents can't be reconstructed. Add append-only metrics sheet / external sink (sampled, async, non-blocking). | M | — | OPEN |
| F-15 | Test coverage | P3 | CONFIRMED | `tests/` 63 files/1602 unit + browser; no write-path concurrency test | Correctness | Excellent unit/meta/browser coverage; gap = lock contention & partial-commit paths (hard in unit). Add a GAS-level integration harness for the write paths. | M | — | OPEN |
| F-16 | Monolith size | P3 | CONFIRMED | `appsscript_complete.gs` 15,409 lines; `views-analytics.jsx` 12,242; `views-main.jsx` 10,166 | Maintainability | Large single files. Managed by strong tests + docs; do NOT refactor for aesthetics. Split only when a concrete change needs it. | XL | — | WATCH |
| F-17 | Knowledge concentration | P3 | CONFIRMED | `CLAUDE.md` 369KB | Maintainability | Institutional memory concentrated in one doc; onboarding/searchability risk. Consider splitting by domain. | M | — | WATCH |

## Evidence gaps (required — not upgraded to findings)

| ID | Gap | Why it matters | To close |
|----|-----|----------------|----------|
| EG-1 | Incident vocabulary in the audit request — `RC-1..RC-5`, `linePush_primary 400`, `Phase B`/`Phase B.1`, `Report Engine`, `Notification Center`, "2026-08-25 incident" — **does not exist anywhere in the repo** (last commit 2026-08-15). | Cannot verify or root-cause what isn't in the tree. `linePush_` *can* emit `linePush_ primary 400: <body>` (gs:11513); the body carries LINE's reason but is **not persisted** (F-14). | Provide the GAS Executions export / log where the 400 was seen, or the external doc describing Phase B / Report Engine. |
| EG-2 | No production runtime data available in-session (live Executions, real concurrency traces, current post-7.3 stampede behavior). | Concurrency **magnitude** (F-05), the 400 **root cause**, and whether 7.3/7.4/7.5 fully resolved the morning stampede are INFERRED/UNKNOWN. | Export Executions for a real busy window; add durable telemetry (F-14). |
| EG-3 | Real sheet row counts (attendance, Audit Log, orders) not measurable in-session. | Growth-ceiling **timing** for F-03/F-04 is CALCULATED from architecture, not measured. | Log row counts (attendance already has a `[perf]` gate at ≥3000 rows). |

## RC-1..RC-5 (per request — held UNKNOWN)

The request instructs keeping RC-1..RC-5 marked UNKNOWN unless runtime evidence proves otherwise.
No runtime evidence for any RC exists in this repository (EG-1/EG-2). **All RC-1..RC-5 remain UNKNOWN.**
