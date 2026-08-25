# FULL SYSTEM SCRUTINY — DMJ Inventory Dashboard (2026-08-25)

> ⚠️ **BASELINE: `3dbc41d` (2026-08-15) — OUTDATED.** This report was written against a local HEAD that
> origin/master has since moved **67 commits / 8,021 line-insertions** past (current tip `b7e5f1e`, 2026-08-24).
> Read every finding here as *"as-of `3dbc41d`"*. For what changed, what still holds, and what is new surface,
> see **`FULL-SYSTEM-SCRUTINY-DELTA-2026-08.md`** (verdict: B — AUDIT VALID WITH DELTA). Findings below are
> **not** rewritten; the delta reconciles them. EG-1 here ("RC vocabulary not in repo") was true at `3dbc41d`
> but is superseded — the RC set exists on master via `f3e5956`; see the delta §7.

Principal-auditor end-to-end review. **Audit only** — no production code changed, nothing deployed,
nothing merged to master. Companion: `FULL-SYSTEM-SCRUTINY-FINDINGS.md` (compact register, IDs F-01…F-17).

Confidence tags used throughout: **CONFIRMED** (traced in code / measured file), **STRONG** (strong
code evidence, magnitude inferred), **HYPOTHESIS** (plausible, unproven). Evidence gaps are marked, not guessed.

---

## 1. Executive Summary

DMJ is a **mobile-first inventory/POS/ERP** for a flower & décor shop: React-18 (no build step, Babel-in-browser)
served from Cloudflare Pages, a single ~15.4K-line Google Apps Script (GAS) web app as the API, Google Sheets
as the database, and ZORT (external inventory SaaS) as the stock/sales source of truth. ~10 staff, several roles,
LINE for notifications. 152 commits (2026-08-01…08-15), 1602 unit tests + a browser suite, all green.

**The engineering quality is genuinely high for its class.** The hard problems this codebase has already solved —
single-flight + stale-while-rebuild cache, idempotent writes (`cid`/`tid`/`billCid`), session-verified actors,
`dmjJson` HTML-response defense, iOS timer-freeze handling, meta-tests that scan real source — are the marks of a
team that has been burned and learned. Much of what a naive audit would "discover" is already documented and fixed.

**The system is therefore NOT broken. It is at an architectural inflection point defined by one number: payload size.**
The measured `buildFullData_` is **9.8 s** and the payload is **4.5 MB, ~all of it `products[]` (~5,876 SKUs)**
(`PHASE0-RESULTS.md`). Everything else scales; that one artifact grows with the catalog and is the ceiling every
future user and every future product pushes against. The cache work (Phase 7.3/7.4/7.5) bought head-room by not
*rebuilding* 15× — but every client still *downloads* 4.5 MB, and Phase 8 (cut the payload) is explicitly unmet.

**Verdict: HEALTHY WITH RISKS.** Two risk clusters deserve attention before piling on features:
1. **Confidentiality of reads (F-07):** customer PII (phone/email) and the full sales/quote pipeline are served
   with only the shared token that ships in public JS — no per-user authorization. Writes are gated; reads are not.
2. **Locks across external calls (F-05):** `createSaleBill` and `transferStockBatch` hold the *global* script lock
   across ZORT round-trips, serializing all writes behind network latency — the exact pattern `handleOrder_` was fixed to avoid.

Neither is an emergency; both are the kind of thing that turns a good week into a bad incident under load. The
request's incident vocabulary (RC-1..RC-5, `linePush_primary 400`, Phase B, Report Engine) **does not exist in this
repository** — see §26. I did not invent root causes for it.

---

## 2. System Map

```
Staff phone / tablet / desktop  (PWA, iOS/Android/Chrome; shared "storedevice" tablet in store)
        │
        ▼
Cloudflare Pages  (static: *.jsx via Babel-standalone, service-worker.js SWR cache, dmj-v34)
        │  HTTPS + ?token=APP_TOKEN (public)
        ▼
Google Apps Script Web App  (executeAs: USER_DEPLOYING → every request runs as ONE owner identity)
   doGet(e)                                   doPost(e)
     ├─ ping / ver            (tiny, no I/O)    ├─ resolveSession_ → overwrite actor  (gs:2223)
     ├─ payload (cached)      (§5,§7,§10)        ├─ canDoOrNull_ gate + IMMEDIATE_GATE (gs:2234)
     ├─ stocklite / orders    (poll)            ├─ order / updateOrderState
     ├─ *Check (cid/tid/bill) (recovery)        ├─ transferStock(Batch) ── ZORT ── §4
     ├─ analytics/quote reads (⚠ no session F-07)├─ createSaleBill ──────── ZORT ── §4
     └─ attendance/audit/staffPerf (session ✓)  ├─ punch / fixAttendance
        │                                        ├─ createQuotation/editQuotation ── ZORT
        ▼                                        └─ setProductOwner / markNotiRead / …
   Business logic (buildFullData_, read*_, write*_)
        │
        ├── Google Sheets  (DB: ~20 sheets — products, orders, transfers, locks, sales, attendance,
        │                    sessions, audit log, noti queue, sale bills, inapp noti, …)
        ├── ZORT Open API v4  (stock/sales/quotation/transfer — source of truth for stock)  §6
        ├── LINE Messaging API  (queue → drain trigger → push)  §13
        ├── Drive  (attendance photos, proxied)
        └── Supabase  (OPTIONAL backup sink only — gated off; not a live source)
        │
   Cache (CacheService: fresh 180s + stale 30min, per role×encoding) · Build lock (getUserLock)
   Write lock (getScriptLock — 39 sites, global) · Script Properties (secrets + config + last_write_ts)
        │
        ▼
   Response (JSON; stale flag; conflict via lastModified)
```

**Time-driven triggers / background jobs:** `keepWarm_` (5 min — warm container + cache), `drainNotiQueue`
(1 min), `syncZortBoth` (2 h — stock/sales reconcile), `archiveReceivedShipments` (03:00), `dailyAttendanceMaintenance`
(22:00 — photo purge + session cleanup + inapp purge), weekly/monthly LINE summaries.

**Deploy pipeline:** push to `master` → GitHub Actions `deploy-gas.yml` (`clasp push --force`) for `.gs`;
Cloudflare auto-deploys static from `master`. `executeAs: USER_DEPLOYING` means new code is live immediately.

---

## 3. Architecture Assessment

**Fit for purpose: yes, with a known ceiling.** The "no build step / Babel-in-browser / Sheets-as-DB / GAS-as-API"
stack is unusual but *deliberate and internally consistent* — it lets one owner-operator maintain the whole thing
without a toolchain, and the team has invested heavily in making it survive real mobile/retail conditions
(captive portals, iOS PWA storage quirks, flaky in-store WiFi).

Strengths:
- **Idempotency everywhere it touches money/stock** (`cid` orders, `tid` transfers, `billCid` sales) — mature.
- **Cache architecture** (single-flight + 2-layer stale-while-rebuild + keep-warm) — genuinely good; directly
  answers the measured stampede.
- **Session-verified actors** on the write side; `dmjJson` defense against GAS returning HTML.
- **Test discipline**: meta-tests that scan/`eval` real source to prevent copy-drift; browser tests with `hasAllText`.

Structural risks (not aesthetics):
- **One identity for all reads** (`executeAs: USER_DEPLOYING`) is what makes the build-lock and keep-warm work,
  but also means the platform's per-user quotas (execution count, simultaneous executions, URLFetch/day) are a
  *shared* budget for the entire store. This is the capacity frame (§16).
- **Reads bypass the auth system that writes use** (F-07) — an asymmetry that grew organically.
- **External calls inside the global lock** (F-05) — a coupling that turns ZORT latency into store-wide write latency.

---

## 4. Frontend Performance

- **Initial load** dominated by (a) Babel compiling ~1.3 MB of `.jsx` in-browser on first paint after any deploy
  that changes ETags (mitigated by a separate `dmj-babel*` cache that survives `CACHE_NAME` bumps —
  `service-worker.js:36`), and (b) the **4.5 MB payload** (F-01). BootTrace splits "wait for GAS" vs "download".
- **Payload** is the dominant cost and it is server-driven (F-01/§5). `action=ver` lets a client skip the 4.5 MB
  download when data is unchanged — a strong mitigation for repeat opens, capped at 30 min (`VER_MAX_SKIP_MS`).
- **Polling** is correctly **tab-scoped**: orders/ordersummary → `fetchOrdersOnly` 15 s (`app.jsx:1479`);
  stockcount/frontstore → `fetchStockLite` 30 s (`app.jsx:1491`); `NotiBell` 25 s all tabs; login-handoff tick 4 s.
  All gate on `navigator.onLine` and re-fetch on `visibilitychange`/`focus` (iOS timer-freeze aware).
- **Rendering**: SKU-keyed detail via `detailSku` state (avoids stale object capture); `useIsMobile` switches
  table↔card. Recharts is deferred (`useRechartsReady`). No obvious render-storm; `OrderItemRow` key includes
  `orderSig` to avoid instance reuse bugs.
- **Duplicate calls**: prefetch in `<head>` is abortable (`_dataPrefetchAbort`) so a role-mismatch prefetch doesn't
  double-spend the pipe — a fix already made (Phase 7.5).

**Net:** frontend is well-tuned; the remaining lever is payload weight, which is a backend shape decision (F-01).

---

## 5. Backend Performance

Measured (`PHASE0-RESULTS.md`, `perfMeasureBuild`):
- `buildFullData_` = **9,807 ms**; **70% is sheet I/O**, 12% product parse (5,876 rows), **enrich+index = 1.2%**.
- I/O breakdown: batchGet 2,545 ms · `readPurchases_` 1,362 · `readQtyByLocation_` 1,247 · `readMtoJobs_` 826 ·
  `readTransferHistory_` 456 · `readUnscannedSalesMap_` 382.
- The compute the team could optimize is 1.2% — **correctly** they did NOT chase it (Phase 4 was skipped on evidence).

Findings:
- **F-02**: `readQtyByLocation_` (1,247 ms) re-reads the stock sheet that `buildFullData_` already holds in memory
  (`gs:2890` vs `gs:2902`). The batchGet excludes it deliberately (date-serial concern) but the *stock* rows are
  already available. Reuse would remove ~13% of build time. Similar redundant reads hide in "assemble".
- Build is O(n) after the O(n²) `filter`-in-loop fix (pre-indexed `purchasesBySku`/`adjustBySku`, `gs:2913`).
- The `totals` block (`gs:3059`) runs ~11 separate `.reduce()/.filter()` passes over `products[]` — ~60K iterations,
  negligible vs I/O; **not worth changing** (noted for completeness, not a finding).

Growing-sheet hot paths (unbounded, will degrade with time — CALCULATED, not yet measured, EG-3):
- **F-03** `readAttEvents_` (`gs:1071`) full-scans the attendance sheet **on every punch** (and every "my today").
  ~1 row per button press ⇒ tens of thousands of rows/year, all read+filtered-in-JS per press.
- **F-04** `getAuditLog` (`gs:2612`) `getDataRange()` on the **entire** Audit Log (the fastest-growing sheet)
  to return the last 200 rows. `staffPerf` was already fixed to read the date column first; `getAuditLog` was not.

---

## 6. ZORT / External API

- **89 `UrlFetchApp.fetch` call sites.** ZORT is the stock/sales **source of truth**; sheet numbers are downstream.
- **No configurable timeout** (GAS platform limitation) — **F-12**. Retry loops of 3 (`gs:4028/6620/6690`) and 2
  (`gs:13477`) multiply worst-case latency.
- **Latency is inside user-facing critical sections** for two paths (**F-05**): `createSaleBill` (AddOrder +
  GetOrderDetail fallback + status `fetchAll`, `gs:13948/13963/14002`) and `transferStockBatch`
  (`createZortTransferBatch_`, `gs:3966`) run **inside the global `getScriptLock()`**. `handleOrder_` correctly
  releases the lock *before* its LINE call (`gs:10288`) — the good pattern to copy.
- **Field-guessing risk is documented and real**: `POS_ZORT_FIELDS` order fields were "assumed per v4" and silently
  wrong (channel `channel`→`saleschannel`; missing header `amount`/`vatamount` → ZORT recorded 0). ZORT does not
  error on unknown fields — it silently drops them (`checkSaleBillInZort` exists to detect this). Treat any new ZORT
  field as unverified until confirmed against a live order.
- **Caching**: ZORT is not on the read path for the app payload (the app reads sheets, `syncZortBoth` reconciles
  every 2 h). Good — external latency is kept off the common read path.

---

## 7. Data Fetching (page/data matrix)

| Page/Tab | Request | Source | Payload | Cache | Freq | Notes / opportunity |
|---|---|---|---|---|---|---|
| App boot (all) | doGet payload (role variant) | 9 sheets via batchGet + 5 more | **~4.2–4.6 MB** | fresh 180s + stale 30min, single-flight | on open + Sync | F-01 (size), F-02 (I/O). `ver` skips unchanged. |
| orders / ordersummary | `action=orders` | orders sheet (`readOrders_`) | small–med | **none** | 15 s | Fresh sheet read each poll; bounded by pending rows. |
| stockcount / frontstore | `action=stocklite` | 2 sheets, array-encoded | ~50× smaller | 15 s TTL | 30 s | Well-optimized (Phase 7.4). |
| Overview/analytics | in payload | payload | (in 4.5 MB) | as payload | — | Client-side filter/aggregate; fine given data is already local. |
| Customers | `getCustomerAnalytics` | sales sheets | med | none | on tab | **F-07 no session.** |
| Quote follow-up | `getQuotationSummary` | ZORT-synced sheet | med | none | on tab | **F-07 no session.** |
| Quote print | `getQuotationForPrint` | sheet/ZORT | small | none | on print | **F-07 IDOR by id.** |
| Attendance | `punch`/`myToday`/`myAttendanceSummary` | attendance sheet | small | none | on action | **F-03 full-scan per call.** |
| Staff perf | `staffPerf` | audit + attendance | med | 300 s | on tab | session ✓; audit read is date-ranged ✓. |
| Notifications | `inappNoti` | inapp sheet | small | none | 25 s | session ✓. |

Filtering: mostly **client-side** (payload is already local) — reasonable here, *because* the whole dataset ships once.
That is only tenable while the payload is downloadable; it is the same coin as F-01. Pagination exists only for
pickers/MTO groups, not for `products[]`.

---

## 8. Data Writes (mutation audit)

| Path | Lock | Idempotency | External-in-lock | Audit | Failure handling | Verdict |
|---|---|---|---|---|---|---|
| `handleOrder_` (order) | ScriptLock, released **before** LINE (`gs:10288`) | `cid` + `findOrderRowByCid_` | **No** (correct) | ✓ | `orderCheck` recovery | **SAFE** (reference pattern) |
| `transferStockBatch` | ScriptLock across ZORT+audit+noti (`gs:3882→4011`) | `tid` (cache+sheet) + `shp2_` 90 s | **Yes (ZORT)** | batch ✓ | `transferCheck`; clamp≥0; repair tools | **RISKY** (F-05, F-11) |
| `createSaleBill` | ScriptLock across 3 ZORT calls (`gs:13926→14089`) | `billCid` in-lock | **Yes (ZORT×3)** | via bill sheet | `billCheck`; `deductFrontStoreForSale_` no double-deduct | **RISKY** (F-05, F-11) |
| `updateOrderState` | per-op | actor from session; SKU-match guard | No | ✓ | `notFound`=fail; not auto-retried | **ACCEPTABLE** |
| `punch` | append | `attNextId_` | No | event log | sequence warn-not-block | **ACCEPTABLE** (F-03 read cost) |
| `setProductOwner`/`markNotiRead` | light | dedup | No | summary | no-op on gate-off | **SAFE** |

Cross-cutting: **write-then-external-confirm** ordering means a crash/timeout between the local sheet write and the
ZORT confirmation leaves a **partial commit** (F-11). It is *logged* and recoverable via owner-run tools
(`checkZortTransfer`, `repairZortTransferLog`, `applyZortTransferStock`, `checkSaleBillInZort`) and via `syncZortBoth`
overwriting with ZORT truth — but there is **no automatic reconciliation** and ZORT is the tie-breaker only every 2 h.

---

## 9. Google Sheets (as a database)

- ~20 sheets. Read hot path uses **batchGet** (good). 105 `getDataRange()` sites total — most are in **manual
  `exploreZort*`/repair tools** (e.g. `gs:5297–5815`) that run in the GAS editor, **not** hot paths.
- Genuinely hot full-scans: **F-03** (attendance/punch), **F-04** (audit/getAuditLog), and `drainNotiQueue`
  (`gs:11661`, bounded by 7-day cleanup).
- Writes: 44 `appendRow`, 87 `.setValue()` (single-cell), 33 `.setValues()` (batch). The team has already converted
  the worst offender (transfer G:H → one `setValues` per row; audit → `writeAuditLogBatch_`) after the 77-SKU
  timeout incident. Remaining single-cell writes are mostly low-frequency.
- **Column-position coupling** is the standing hazard (lesson #5, cited throughout CLAUDE.md): many reads/writes are
  by numeric index. New columns are appended, never inserted — a discipline that is working but is one careless edit
  from silent corruption. Well-covered by tests (`who-did-it`, `order-rowshift`, schema tests).

**Migration verdict:** Do **not** replace Sheets wholesale. It is the right substrate for owner-operability at this
scale. The two sheets with unbounded-growth read patterns (attendance, audit) are the only ones with a real
scalability argument, and the fix is *read-pattern* (tail/index/monthly split), not *engine* change.

---

## 10. Cache

- **Two layers**: fresh `dmj_payload_*` (TTL 180 s) + stale `dmj_stale_*` (TTL 30 min), written together on build,
  keyed per **role variant × encoding** (`gs:2820`). `invalidateCache_` clears fresh only (never stale — by design,
  or the stampede returns) and bumps `dmj_last_write_ts` unless `skipTsUpdate`.
- **Stampede answer** (the measured problem): `doGet` MISS → `acquireBuildLock_(0)`; winner builds once and fills
  all variants; losers get the stale copy in ~300 ms (`gs:2783`); `fresh=1` waits the queue instead of building 15×.
  `keepWarm_` (5 min) keeps container + cache warm so off-hours first-open isn't a cold 20 s build.
- **"15 users at once"**: with 7.3 deployed, one builds, fourteen get stale ≈ instantly. **CONFIRMED in code + unit
  tests** (`stampede.test.js`), **not** re-measured in production post-deploy (EG-2). The residual cost is *download*
  (F-01), not *rebuild*.
- Correctness guard: stale path must **not** stamp fresh `lastModified` (`gs:2779`) or it would silently defeat
  conflict detection — the code gets this right and it is tested.

---

## 11. Locks / Concurrency

| Lock | Type | Protects | Hold includes | Class |
|---|---|---|---|---|
| Build lock | `getUserLock` (2 sites) | payload build | sheet reads only | **SAFE** (separate from writes) |
| Order write | `getScriptLock`, released pre-LINE | order row | sheet write + flush | **SAFE** |
| Transfer batch | `getScriptLock` | stock cols | **ZORT + audit + noti** | **RISKY** (F-05) |
| Sale bill | `getScriptLock` | — | **ZORT×3 + deduct + bill row** | **RISKY** (F-05) |
| Noti drain | `getScriptLock` 5 s | queue | LINE pushes (throttled) | **ACCEPTABLE** (background trigger) |

- **39 `getScriptLock()` sites share one global lock.** At the real scale (≤~15 staff, a handful of concurrent
  sales/transfers) contention is bounded, but F-05 means a single slow ZORT sale can make every other write wait up
  to its `tryLock` timeout (10–20 s) and then fail with "ระบบกำลังบันทึกข้อมูลอื่นอยู่". Magnitude is **INFERRED**
  (no production trace, EG-2); the pattern is **CONFIRMED**.
- No sheet-level races found in the audited write paths (SKU-match guards, clamps, idempotency keys). The removal of
  global conflict detection in `transferStockBatch` is justified by the in-lock clamp (`gs:3877`).

---

## 12. Authentication / Authorization

- **Sessions**: `resolveSession_` (token → staff row), cached; `doPost` resolves once and **overwrites `actor`**
  from the session (`gs:2223`) — actor spoofing on writes is closed.
- **Write gate**: `canDoOrNull_` + `ROLE_ACTIONS_`; `IMMEDIATE_GATE_ACTIONS_` (migration-safe) and
  `IMMEDIATE_GATE_STRICT_ACTIONS_` (deny-by-default) protect the 9 money/stock actions **even with `REQUIRE_LOGIN`
  off** — a correct, deliberate carve-out.
- **Read gate — the gap (F-07)**: `getCustomerAnalytics`, `getQuotationSummary`, `getPendingQuotations`
  (returns customer `phone`/`email`), `getQuotationForPrint`, `getDeadStock` resolve **no session** — only the
  shared `APP_TOKEN`, which ships in public `config.js`. Anyone who can load the site can pull customer PII and the
  full sales/quote pipeline. Contrast: `attendancePhoto`, `getAuditLog`, `staffPerf`, `inappNoti`, `productOwners`
  all verify a real session — the pattern exists; these five predate/​skip it.
- **F-08**: `debugOrders` trusts client-supplied `e.parameter.role` — the bypassable pattern `getAuditLog`'s own
  comment (`gs:2596`) says was abandoned. Low data exposure (15 order rows) but it should not exist as-is.
- **F-09**: the token is obscurity, documented as such; the fix is session gating (F-07), not a "better token".

---

## 13. Notification / LINE

- **Queue** (`SHEET_NOTI_QUEUE`) → `drainNotiQueue` (1 min) with throttle (`NOTI_MAX_SENDS_PER_RUN`), coalescing
  (order batch window / daily cutoff), quota-aware window stretching, two channels (primary/secondary), dedup keys.
  This is a thoughtful design that directly targets the LINE free-tier ~200/month ceiling.
- **In-app bell** (`pushInappNoti_`, 11 call sites) is quota-free and carries `focus`/`view` routing so a tap lands
  on the exact SKU/filter — a nice touch, and tested that every routed `view`/`focus` has a receiver.
- **F-10 (reliability)**: `linePush_` returns `{ok, code, quota}` but `drainNotiQueue` inspects only `quota`.
  A permanent **400** (malformed push — bad `to`, message shape, mention index) is retried like a transient error
  6× then the row is marked `failed` and **deleted after 7 days** (`cleanupNotiQueue_`). There is **no dead-letter,
  no owner escalation, and the `code`/body is not persisted** (only `Logger.log`, ephemeral). A notification that
  hits a 400 is silently lost with no durable trace of why.
- **linePush_primary 400 (from the request)**: the code path that would log `linePush_ primary 400: <body>` exists
  (`gs:11513`). The body carries LINE's reason, but it is not persisted — so **root cause is UNKNOWN from the repo**
  (EG-1). Per the request this stays *CONFIRMED-OCCURRENCE (in the owner's logs) / UNKNOWN-ROOT-CAUSE*. Fixing F-10
  (persist `code`+body, dead-letter) is the prerequisite to ever diagnosing it.
- **Notification Center architecture (from the request)** does not exist in the repo (EG-1). The current in-app bell
  + LINE queue is a reasonable foundation; a "center" would build on `pushInappNoti_` + the queue, not replace them.

---

## 14. Reliability / Failure Modes

| Scenario | Behavior | Class |
|---|---|---|
| ZORT down | writes: sheet committed, ZORT error logged (`logZortFailure_`), no rollback; reads: unaffected (sheet-backed) | **PARTIALLY RECOVERABLE** (F-11) |
| Sheets down | build fails → `doGet` returns error JSON; stale copy may still serve reads | **RECOVERABLE** |
| Drive down | attendance photo proxy fails gracefully ("ไม่พบรูป") | **RECOVERABLE** |
| LINE down/400 | queued, retried, then dropped after 7 days silently | **DATA RISK (notification loss)** (F-10) |
| Cache down | `acquireBuildLock_` returns null → build-your-own path; correctness intact | **RECOVERABLE** |
| Timeout (browser cuts) | `*Check` (cid/tid/billCid) endpoints tell the truth; no blind resend | **RECOVERABLE** (mature) |
| Refresh during write | idempotency keys prevent double-apply | **RECOVERABLE** |
| Two users, same SKU | transfer clamps to available; sale via ZORT truth | **RECOVERABLE** |
| Trigger overlaps user write | shared `getScriptLock` serializes; may cause `tryLock` failure | **PARTIALLY RECOVERABLE** (F-05) |
| GAS 6-min execution cap | 77-SKU transfer already tuned under it; larger batches unproven | **DATA RISK at scale** (EG-3) |
| Payload > download-link life | 4.5 MB × N through one pipe → 404 mid-download (measured pre-7.4) | **RECOVERABLE now** (ver/stale) / ceiling (F-01) |

The failure-handling maturity here is a real asset: the "read the answer, don't trust HTML, verify before showing
red, recover via *Check" discipline is applied consistently on the paths that have `cid`/`tid`/`billCid`.

---

## 15. Testing

- **63 test files, 1602 unit assertions + a browser suite (`tests/browser/run.cjs`)**, all green (exit 0).
- Standout practice: **meta-tests `eval` real functions from `.gs`/`.jsx`** (auth, staff-perf, order/transfer/bill
  idempotency, payload-variant, dashboard-metrics) instead of copies — this is what keeps the drift-prone parts honest.
  `drift-guard.test.js` enforces landmark parity for `helpers.js` copies.
- Coverage present: parsing, dates (พ.ศ.), stock/qtyloc, stampede (read path), payload variants, auth gates,
  metrics, attendance, i18n, browser role×tab smoke + interaction.
- **Gap (F-15)**: **write-path concurrency and partial-commit** are not integration-tested — lock contention (F-05)
  and write-then-ZORT-fail (F-11) have no harness (hard in Vitest; would need a GAS-side mock of Sheets+ZORT+Lock).
  Given these are the two RISKY paths, an integration harness there is the highest-value test investment.

---

## 16. Capacity Model

Platform constraints (**CONFIRMED** — GAS documented limits): ~**6 min/execution**, ~**30 simultaneous executions
per user**, a **daily URLFetch + execution-time quota**. Because of `executeAs: USER_DEPLOYING`, **all requests share
one user's budget** — this is the true capacity frame.

| Users (concurrent open) | Read path (post-7.3) | Write path | First ceiling |
|---|---|---|---|
| 1 | HIT ~instant; cold build 10 s once | fine | none |
| 5 | 1 builds, 4 stale (~300 ms) | occasional lock wait | none |
| 10 | same; 10× 4.5 MB downloads if all cold-open | lock waits under concurrent sales/transfer | **download bandwidth + URLFetch quota** |
| 15 | **MEASURED pre-7.3: 41–115 s, 87–93% HTML** → post-7.3 rebuild solved; **download of 15×4.5 MB remains** | `getScriptLock` serialization visible | **F-01 payload pipe** |
| 30 | stale serves reads; **simultaneous-execution cap (~30) becomes reachable** with polling load | write queue lengthens | **execution-slot cap + F-01** |
| 50 | polling alone (orders 15 s + stocklite 30 s + noti 25 s per client) approaches the 30-slot cap in bursts | serialized | **execution-slot cap** — **hard ceiling** |

- **MEASURED**: the 15-user pre-7.3 numbers (`PHASE0-RESULTS.md`).
- **CALCULATED**: bandwidth ceiling from 4.5 MB × N (Phase 7.4 analysis: 15×4.2 MB ≈ 63 MB / ~2.3 MB·s⁻¹ ≈ 27 s > link life).
- **INFERRED**: the execution-slot cap at ~30–50 concurrent (polling + writes) — needs a production Executions trace to confirm (EG-2).

**First hard ceiling: the 4.5 MB payload (F-01)** for anyone above ~10 simultaneous cold opens, then the **~30
simultaneous-execution slot cap** as steady-state polling grows. Both are addressable without leaving the stack:
shrink/segment the payload (Phase 8) and, if needed, lengthen poll intervals or push-notify instead of poll.

---

## 17. Code Quality / Architecture

- **Monolith size (F-16)**: `appsscript_complete.gs` 15,409 lines; `views-analytics.jsx` 12,242; `views-main.jsx`
  10,166; `app.jsx` 2,469. Large, but **deliberately split** on the frontend to keep Babel compile time down
  (CLAUDE.md forbids re-merging FrontStoreView). Managed by tests + docs. **Do not refactor for aesthetics.**
- **Knowledge concentration (F-17)**: `CLAUDE.md` is **369 KB** — an extraordinary amount of institutional memory in
  one file. It is why quality is high; it is also a single point of onboarding friction and a searchability risk.
- **Duplication is controlled on purpose**: pure-logic copies in `tests/helpers.js` are guarded by `drift-guard`.
- **Magic constants / config**: mostly hoisted to Script Properties (thresholds, ratios, cutoffs) — good operability.
- **Dead code**: the `exploreZort*` and one-off `debug*` functions are intentional editor tools, not shipped paths.
  `getAuditLog` carries a `sku: r[3]` backward-compat field marked for removal — harmless.

No aesthetic refactor is recommended. The maintainability lever that *would* pay off is durable observability (F-14)
so the next incident is diagnosable without spelunking ephemeral logs.

---

## 18. Security

- **Secrets**: none hardcoded in committed code (scan clean); all in Script Properties (ZORT keys, LINE tokens,
  OWNER_PIN, SHEET_ID). Supabase service key documented as properties-only. **Good.**
- **F-07 (P1)**: read endpoints expose customer PII + sales pipeline with token-only auth (see §12). This is the
  single most important security item.
- **F-08 (P2)**: `debugOrders` client-role trust (IDOR-ish).
- **F-09**: public `APP_TOKEN` = obscurity by design.
- **IDOR surface**: `getQuotationForPrint` by id, `attendancePhoto` by Drive id — the latter is session-gated
  (owner-only) ✓; the former is not (F-07).
- **Logging of sensitive data**: `linePush_` logs response bodies (may include `to`/message) and `AddOrder` logs
  responses — into ephemeral GAS logs only, not persisted. Low risk but worth noting if a durable sink is added (F-14).
- **Audit trail**: comprehensive (`writeAuditLog_`/`Batch_`), and it is the backing store for staff-perf — but it is
  full-scanned (F-04) and its integrity depends on column position discipline.

---

## 19. Observability

- **Present**: `perfLogDoGet_` (HIT/MISS/STALE/WAIT-HIT + build/shape timings), `[perf]` marks in `buildFullData_`/
  `readAttEvents_`, client `BootTrace` (boot stage timings, surfaced in-app on the "connect" tab and error screen),
  `logPayloadSizes_`, `logZortFailure_` → `SHEET_ZORT_FAILED`, `computeHealth_`/`selfcheck`.
- **The gap (F-14)**: server telemetry is **`Logger.log` only = ephemeral** (GAS Executions view, rotates); client
  telemetry is **localStorage-only** (one device). There is **no durable, queryable sink**. After the Executions
  window ages out, an incident (e.g. the request's `linePush_primary 400`, or a morning-stampede recurrence) cannot
  be reconstructed. `SHEET_ZORT_FAILED` is the one durable failure log and is the model to generalize.
- **Telemetry-affecting-performance**: the code is careful (`logPayloadSizes_` runs *after* lock release; `[perf]`
  gated at ≥3000 rows/≥1 s). Any durable sink must keep this discipline (sampled, async, never in a lock).
- **Phase B / Phase B.1 (from the request)** does not exist in the repo (EG-1). If it is an external design doc,
  reconcile it against F-14; the durable-sink need is real regardless.

---

## 20. Performance Budgets (proposed)

Reasoning: these are a retail floor with in-store WiFi and cheap Android phones; the business need is "no indefinite
spinners", not sub-second SPA polish. Thresholds are set against measured constraints (build 9.8 s, payload 4.5 MB).

**Frontend**
| Metric | GREEN | YELLOW | RED | Rationale |
|---|---|---|---|---|
| First usable (attendance/home, `NO_DATA_TABS`) | ≤3 s | 3–6 s | >6 s | already achievable — no payload dependency |
| Full boot (payload) warm | ≤6 s | 6–12 s | >12 s | HIT + 4.5 MB download over in-store WiFi |
| Full boot cold (build) | ≤15 s | 15–25 s | >25 s | 10 s build + download; keep-warm should keep this rare |
| Common navigation (cached) | ≤500 ms | 0.5–2 s | >2 s | client-local data |
| Poll (stocklite/orders) | ≤2 s | 2–5 s | >5 s | small payloads |

**Backend**
| Metric | GREEN | YELLOW | RED | Rationale |
|---|---|---|---|---|
| doGet HIT | ≤1 s | 1–3 s | >3 s | cache serve + patch |
| doGet MISS (build) | ≤10 s | 10–20 s | >20 s | measured 9.8 s is at the GREEN/YELLOW edge → **improve via F-02/F-01** |
| Write (order) | ≤3 s | 3–8 s | >8 s | lock + sheet, LINE outside |
| Write (sale/transfer) | ≤6 s | 6–15 s | >15 s | includes ZORT; F-05 makes this everyone's latency |
| ZORT call | ≤3 s | 3–8 s | >8 s | external; must not be in a lock (F-05) |

**Standing rule (business):** no user-facing action should be able to spin indefinitely. The `dmjFetch` 60 s cap +
`*Check` recovery already enforces this on the mature paths; extend the discipline to any new write.

---

## 21. Prioritization (see FINDINGS for the full register)

- **P1**: F-01 (payload ceiling), F-05 (lock across ZORT), F-07 (read authorization / PII).
- **P2**: F-02 (redundant build I/O), F-03 (attendance full-scan), F-04 (audit full-scan), F-08 (debugOrders role),
  F-10 (notification 400/dead-letter), F-11 (partial commit), F-13 (owner exec view), F-14 (durable observability).
- **P3**: F-06 (lock granularity), F-09 (token=obscurity), F-12 (URLFetch timeout), F-15 (write-path tests),
  F-16 (monolith — watch), F-17 (CLAUDE.md size — watch).

Business-impact ordering (not technical interest): **F-07 → F-05 → F-01 → F-14 → F-10** are the five that most
change outcomes for the owner (a leak, a store-wide stall, the growth wall, blind incidents, lost alerts).

---

## 22. Prioritized Roadmap (phases — each gated on measurement, no fix implemented in this audit)

**Phase A — Safety & confidentiality (low effort, high value):**
- F-07: session-gate the 5 analytics/quote read endpoints (reuse `resolveSession_` + `isAdminRole_`/role list).
- F-08: fix/remove `debugOrders` client-role trust.
- F-12: bound retries/backoff on user-facing ZORT calls.

**Phase B — Concurrency relief:**
- F-05: release the global lock *before* ZORT in `createSaleBill` and `transferStockBatch` (mirror `handleOrder_`),
  keeping idempotency + clamp as the correctness guarantee. Add the write-path integration harness (F-15) first.
- F-11: an automatic reconciliation pass (extend `syncZortBoth`) for write-then-ZORT-fail gaps.

**Phase C — Growth & observability:**
- F-02: reuse in-memory stock rows in `readQtyByLocation_`; fold redundant reads (~13% build).
- F-03/F-04: tail/index reads for attendance and audit; consider monthly attendance sheets.
- F-14: durable, sampled, async telemetry sink (generalize `SHEET_ZORT_FAILED`) — prerequisite for diagnosing F-10/EG-1.
- F-10: persist LINE `code`+body; dead-letter + owner escalation on permanent failure.

**Phase D — Payload ceiling (the strategic one):**
- F-01: finish Phase 8 — segment/paginate `products[]` or ship a stock-only slice + lazy detail. Re-measure at 15/30
  concurrent afterward.

**Phase E — Owner decision layer:**
- F-13: compose existing exception signals into an L1/L2 executive landing.

---

## 23. Finding Register

See `FULL-SYSTEM-SCRUTINY-FINDINGS.md` (F-01…F-17 + evidence gaps EG-1…EG-3 + RC-1..RC-5 held UNKNOWN).

---

## 24. What NOT to change

- **The stack** (no-build React / Sheets / GAS) — it fits the owner-operator model; the audit found no evidence to
  justify a rewrite.
- **The cache design** (single-flight + stale + keep-warm) — it correctly answers the measured stampede. Do not
  touch stale-layer invalidation.
- **Idempotency keys** (`cid`/`tid`/`billCid`) and the `*Check` recovery endpoints — mature; extend, don't disturb.
- **`dmjJson`/`dmjFetch` discipline** and the meta-test approach — keep enforcing.
- **Column-append-only discipline** and the drift-guard tests.
- **`handleOrder_` lock ordering** — it is the pattern others should copy.
- **The file split** for Babel compile time — do not re-merge.
- **Compute in `buildFullData_`** — it is 1.2%; optimizing it is proven waste.

---

## 25. Evidence Gaps

- **EG-1**: the request's incident vocabulary (RC-1..RC-5, `linePush_primary 400`, Phase B/B.1, Report Engine,
  Notification Center, "2026-08-25 incident") is **not in the repository** (last commit 2026-08-15). Provide the
  GAS Executions export / external design docs to close.
- **EG-2**: no production runtime data in-session → F-05 magnitude, current post-7.3 stampede behavior, and the LINE
  400 root cause are INFERRED/UNKNOWN.
- **EG-3**: real sheet row counts (attendance, audit, orders) unmeasured → F-03/F-04 ceiling *timing* is CALCULATED.

**RC-1..RC-5 remain UNKNOWN** — no runtime evidence exists in this repository to prove any of them.

---

## 26. Reconciliation with existing handoff/audit docs

This audit **agrees with and extends** the team's own prior work — it does not contradict it:
- `PHASE0-RESULTS.md` — source of the measured build/payload/stampede numbers used here; its conclusion (payload +
  I/O, not compute) is confirmed. Its recommended Phase 7.3 is deployed; **Phase 8 (payload) remains open = F-01**.
- `PLAN-PERF-LOGIN-MULTIUSER.md` / `PLAN-PHASE8-PAYLOAD.md` — Phase 8 explicitly "ยังไม่ถึงเป้า" (not at target),
  matching F-01 as the top open item.
- `HANDOFF-SCRUTINIZE-2026-08-10.md` — prior scrutinize; this is the next iteration. New here vs then: **F-07 read
  authorization**, **F-05 lock-across-ZORT for sale/transfer**, **F-10 notification dead-letter**, **F-14 durable
  observability**, **F-13 owner exec view** are given first-class evidence and IDs.
- `PROPOSALS-OWNER.md` — owner-decision proposals; F-13 is the UX complement.

Nothing in the prior docs claims F-07 or F-05 are solved; they are new/underweighted, hence their P1 ranking.

---

## 27. Recommended Next Phases (implementation gate)

Do **not** begin implementation until an explicit gate is approved. When approved, order:
1. **Phase A** (F-07, F-08, F-12) — small, high-value, no architectural risk. Ship behind the existing session
   plumbing; verify with the auth meta-tests.
2. **Phase B** (F-05, F-11, +F-15 harness) — measure lock-wait in a real window first (needs F-14 or an Executions
   export), then relieve.
3. **Phase C** (F-02, F-03, F-04, F-14, F-10) — growth + observability; F-14 first so the rest is measurable.
4. **Phase D** (F-01) — the strategic payload cut; re-measure capacity after.
5. **Phase E** (F-13) — owner decision layer.

Each phase must **measure before and after** (the team's own rule, honored in Phase 0). No hypothesis ships as a fix.

---

## Final Audit Verdict

**SYSTEM STATUS: HEALTHY WITH RISKS.**

This is a well-engineered system for its class, built by a team that measures before it optimizes and has already
solved most of the hard reliability problems. It is not in trouble. It is at the point where its two organic
asymmetries — **reads aren't authorized like writes are (F-07)** and **two write paths hold the global lock across
ZORT (F-05)** — plus its **one growth ceiling (the 4.5 MB payload, F-01)** should be addressed before new surface
area is added on top of them.

**WHAT MUST BE FIXED BEFORE ADDING MORE FEATURES**
- **F-07** — session-gate the analytics/quote read endpoints (customer PII is currently token-only). *Confidentiality.*
- **F-05** — take ZORT out of the global lock in `createSaleBill`/`transferStockBatch` (copy `handleOrder_`). *Store-wide write stalls.*
- **F-14 (enabling)** — a durable telemetry sink, so F-05/F-10/EG-1 become diagnosable rather than guessed.

**WHAT CAN SAFELY WAIT**
- **F-01 payload** — real, but the cache/`ver`/stale work already bought head-room; do it deliberately (Phase D),
  not reactively. It is a ceiling, not a fire.
- **F-02/F-03/F-04** — growth-driven; measure row counts first (EG-3), fix before they cross into the RED band.
- **F-10 dead-letter, F-13 owner view, F-16/F-17** — valuable, not urgent.
- **Monolith/refactor** — do not, absent a concrete change that needs it.

No production behavior was changed. No fix was implemented. Implementation awaits an explicit, separate gate.
