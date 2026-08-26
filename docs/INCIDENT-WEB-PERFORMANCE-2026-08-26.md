# INCIDENT — Web Performance, 2026-08-26 ~14:00 (+0700)

**Closure status: OBSERVABILITY LIMITED** (client-side amplification CONFIRMED with code+number linkage;
server-side slow-path mechanism STRONG EVIDENCE but not fully decomposed — no `[perf]`/`[perfB]` log lines were
captured, only execution durations. Same evidence limitation as INCIDENT-2026-08-25.)

**Evidence provenance:** runtime numbers below were transcribed by the owner from BootTrace screenshots, the Apps
Script Executions list, and the Audit Log. The image files themselves did not reach this session — all figures are
treated as **reported runtime evidence**, and every interpretation of an instrumentation mark below is backed by a
trace of the actual source on `origin/master` (`89b6ccb`, 2026-08-26 13:57 +0700). No production data was touched;
no synthetic transactions were made.

---

## 1. Incident summary

During active concurrent use (~14:00, multiple staff stock-counting/punching/updating locks per Audit Log), app
startup on real devices took **68–117 s** in the worst traces, with payload attempts failing at **20.0 s / 47.0 s**
and one LINE login showing **"ล็อกอินด้วย LINE ไม่สำเร็จ ลองใหม่อีกครั้ง (Fetch is aborted)"** while the handoff
poll ("กำลังรอผลการเข้าสู่ระบบ...") kept running. Apps Script executions in the same window ranged **2.3–21.9 s**
(doGet), with `keepWarm_` at **19.1 s** and `drainNotiQueue` ~3.2 s.

## 2. User-visible symptoms
- Very long "กำลังโหลดข้อมูล Dashboard…" (up to ~2 minutes) on some devices; others fine.
- LINE login error with a raw English fragment ("Fetch is aborted") alongside the waiting-for-login banner.
- Values eventually appear — no data loss reported.

## 3. Timeline (reconstructed, +0700)
| Time | Event | Source |
|---|---|---|
| 11:31 | PR #102 merged → **`.gs` deploy** (clasp auto) → GAS containers reset | git `e8db888`/`efe8782` (CODE) |
| 11:54 | **CACHE_NAME v50→v51** deployed → every device re-downloads + recompiles all `.jsx` on next open | git `35d6e75` |
| 13:57 | PR #104 merged → **`.jsx` deploy without CACHE_NAME bump** → ETag change → Babel recompile on next open (and lesson-15 first-load-old-code exposure) | git `89b6ccb` |
| ~14:00–14:02 | Incident window: ~21 executions/2.5 min visible; doGet 2.3–21.9 s; `keepWarm_` 19.1 s at 14:02:03; concurrent stock-count writes in Audit Log | reported Executions/Audit (RUNTIME, reported) |
| ~14:0x | Browser traces: payload failures at 20.0 s ×2, 47.0 s; `auth:me` 20.2 s; total opens 68.4 s / 117.5 s | reported BootTrace (RUNTIME, reported) |

## 4. What each instrumentation mark actually means (traced — do not re-interpret)
| Mark | Meaning (source) |
|---|---|
| `payload:เริ่ม` → `payload:ไบต์แรก` | waiting for GAS to start responding (queue + build + cold start) — `dmjJsonProgress` first byte (app.jsx:1304–1314) |
| `payload:ไบต์แรก` → `payload:ครบ (KB)` | download+decompress time; KB = post-gunzip size (app.jsx:1321) |
| `payload:ล้มเหลว` | a payload **attempt** failed — thrown fetch error incl. **AbortController timeout** (app.jsx:1365). Attempt timeouts: **first = 35 s, retries = 20 s** (app.jsx:1249) |
| `auth:X` → `auth-done:X` | one `postAuthAction` POST; per-action timeouts `authLine 25 s / me 20 s / claim 8 s` (app.jsx:1132), then 2 auto-retries (1.5 s/3 s) |

## 5. Performance measurements (reported)
- Payload transfer: **3,213 KB in ~369–575 ms** → download is **sub-second**.
- Wait-for-first-byte: 5.6 s / 8.0 s / 15.0 s / **22.0 s** → server-side latency dominates.
- Failures: exactly **20.0 s** twice (= the 20 s retry abort, CONFIRMED code match), 47.0 s once (≈ 35 s
  first-attempt timeout + backoff/overhead — exact decomposition UNKNOWN).
- `auth:me` **20.2 s** = the **client 20 s abort firing**, not a measured server duration.
- Server: doGet mostly 2.3–7.6 s, twice **21.88/21.91 s**; `keepWarm_` **19.1 s**; doPost 2.1 s.

## 6. Root cause analysis

### CONFIRMED — client/server timeout mismatch amplifies the degraded path
- Client aborts payload retries and `me` at **20 s** (app.jsx:1249/1132). The degraded server path measured
  **21.88–21.91 s** (doGet) and **19.1 s** (`keepWarm_` build). Requests that would have completed at ~21–22 s are
  aborted at 20 s, the GAS execution **still runs to completion (wasted)**, and the client immediately retries —
  adding load to the already-degraded window. Evidence: exact 20.0/20.2 s failure values ↔ the 20000 ms constants,
  and 21.9 s server executions in the same minutes. This is an **amplifier**, not the original slowness.

### CONFIRMED — "Fetch is aborted" is frontend-generated, not a LINE API failure
- `postAuthAction('authLine')` runs under a **25 s AbortController** (dmjFetch), auto-retries twice, then throws;
  the catch at **app.jsx:1933** embeds the raw `e.message` — WebKit's AbortError text is literally *"Fetch is
  aborted"*. The simultaneous "กำลังรอผลการเข้าสู่ระบบ..." is the login-handoff poll continuing **by design**
  (7.6-B: handoff must survive a lost response). A healthy run in the same evidence set shows `auth-done:authLine`
  5.5 s — the LINE/GAS auth path works; the failure mode is backend slowness exceeding the client budget.

### STRONG EVIDENCE — cache-invalidation churn under concurrent writes drives rebuilds
- Every stock-count write invalidates the fresh payload cache: doPost pre-dispatch `invalidateCache_(true)` +
  `confirmStockCount`/`updateLockData` each call `invalidateCache_()` (verified on master). The Audit Log shows
  continuous counting/punch/lock activity in the window → the fresh layer was being cleared repeatedly →
  payload requests kept missing → repeated builds. Proof the cache was empty mid-incident: `keepWarm_` only
  builds when the fresh cache is missing (gs `keepWarm_`: early-return on warm), and it ran **19.1 s at 14:02:03**.
- Build under load ≈ **19–22 s ≈ 2× the 9.8 s idle baseline** (PHASE0-RESULTS). Consistent with Sheets I/O
  contention (70 % of build is Sheets I/O; the same sheets were being written concurrently). Which specific read
  stretched is **UNKNOWN** — the `[perf]` breakdown lines were not captured.
- The stale-while-rebuild layer explains the mixed distribution: many 2–7 s serves (HIT/STALE) alongside the
  occasional ~22 s builder.

### STRONG EVIDENCE (contributing conditions, magnitude UNKNOWN) — same-day triple deploy
- CACHE_NAME v51 at 11:54 (+0700) → mid-day full client-cache flush (re-download + Babel-recompile all `.jsx`).
- `.gs` deploy ~11:31 → GAS container resets (cold starts; comment in code: cold start 25–30 s for this script).
- `.jsx` deploy at **13:57 — three minutes before the window — without a CACHE_NAME bump** → ETag change → Babel
  recompile on next open, plus the repo's own lesson-15 exposure (first load serves old `.jsx`). Browser traces
  lack `compile:` marks in the transcription, so the compile contribution cannot be quantified.

## 7. Contributing factors — summary
Concurrent real usage (writes → cache churn) + build-time-under-load ≈2× + same-day deploys (cold containers,
client recompile) + client timeouts set just below the degraded server path (abort/retry loop) + retry load.

## 8. Ruled out
- **LINE API failure** — error is a client-side abort; auth succeeded in 5.5 s in a parallel run.
- **Payload download bandwidth** — 3.2 MB moved in ~0.4–0.6 s. The Phase-7.4-era pipe-saturation failure mode is
  **resolved in production** (pv=3 columnar payload: 4,576/4,200 KB → **3,213 KB**, and transfer is sub-second).
- **RC-5 (doPost ≫ minutes)** — not reproduced (doPost 2.1 s).

## 9. Relation to RC-1..RC-5 and INCIDENT-2026-08-25
| RC | Today's evidence | Status |
|---|---|---|
| RC-1 exec-ceiling (~30) | ~21 executions/2.5 min visible; no ceiling signal | **STILL UNKNOWN** |
| RC-2 Drive-in-punch-lock | punches occurred; no lock/hold data captured | **STILL UNKNOWN** |
| RC-3 resolveSession amplification | 7.6-D 300 s cache is deployed; `me` slowness today is a *client abort*, underlying server time uncaptured | **STILL UNKNOWN** |
| RC-4 ZORT-bound | read path has no ZORT calls; not implicated | **STILL UNKNOWN / N-A today** |
| RC-5 doPost 298 s | doPost 2.1 s | **NOT REPRODUCED** |

vs **2026-08-25**: same signal class (doGet up to ~22 s vs 13–30 s; slow auth window), **different** in that the
download bottleneck is gone (pv=3 confirmed working) and a **newly identified component** exists: the 20 s-vs-22 s
timeout-mismatch abort loop, which the 08-25 report did not name. Both incidents share the same closure limitation:
evidence layer too weak (`[perfB]` uncaptured) → **Track B durable observability is the proven prerequisite**.

## 10. Evidence gaps
1. No `[perf]`/`[perfB]` log lines (only durations) → no HIT/MISS/STALE labels, no build-stage breakdown, no
   lock-wait/hold, no per-request session cost → RC-1/2/3 stay UNKNOWN.
2. No `compile:`/`cachehit:` marks in the transcribed traces → deploy-recompile contribution unquantified.
3. The 47 s failure's internal decomposition (timeout vs bad-JSON) — the mark suffix wasn't transcribed.
4. Which sheet read stretches the build from 9.8 s → ~19–22 s under write contention.

## 11–13. Fixes

**Safe, narrow, READY FOR IMPLEMENTATION (NOT implemented — each changes timeout/retry or 7.6-E surface, the exact
class that caused the 7.6 rollback; requires an explicit owner/gate decision):**
1. **Raise the client abort budgets above the observed degraded server path** — payload retry 20 s and `me` 20 s
   → ≥ 30 s (server worst observed 21.9 s; first-attempt is already 35 s). Trade-off: longer spinners instead of
   abort/retry churn. Isolated, reversible, testable (constants at app.jsx:1249/1132).
2. **app.jsx:1933 — surface `dmjErrText(e)` instead of raw `e.message`** so users see Thai guidance, not
   "Fetch is aborted". Cosmetic, but sits on the 7.6-E path → same gate.
3. **Process (no code): restore CACHE_NAME-bump discipline** (#104 shipped `.jsx` without a bump — violates the
   repo's own rule) and avoid deploying during peak counting windows.

**Structural direction (owned by existing tracks — do not fork):** Track B durable observability (capture the next
burst); Track A build-I/O work (F-02 redundant reads) for build-under-load; the invalidation-churn question may
justify a debounced/partial invalidation design — **HYPOTHESIS ONLY, not designed here**.

**Unsafe/speculative (NOT done):** touching lock strategy, invalidation semantics, or stale-layer behavior based on
today's evidence alone.

## 14–17. Regression gate (Phase 0.13) & closure
- **Improvement CONFIRMED:** payload 4,576/4,200 KB → **3,213 KB** (pv=3 in production) and transfer sub-second —
  the Phase-8 direction is working; the bottleneck has **moved server-side**.
- **No new regression class:** worst-case startup 68–117 s is the same magnitude as the 08-25 burst (41–115 s) —
  the **same degraded mode recurring under concurrent writes**, now better characterized. Against the healthy
  budget (§20 of the scrutiny report) the window is firmly RED.
- **Final confidence:** amplifier CONFIRMED · churn mechanism STRONG · deploy contribution STRONG(timing)/UNKNOWN
  (magnitude) · underlying per-stage server decomposition UNKNOWN.
- **Closure: OBSERVABILITY LIMITED.** Production deployment is **not blocked** by this incident (no correctness
  fault found; data intact), but performance-related merges should wait for the timeout-budget decision + Track B.
