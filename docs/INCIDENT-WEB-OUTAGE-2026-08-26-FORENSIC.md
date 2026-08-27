# Current Web Outage Forensic Investigation

**Date:** 2026-08-26
**Investigator:** Claude (forensic session, code + repository evidence only)
**Branch:** `claude/web-outage-forensic-investigation-lvhnym`
**Symptom reported:** App unreachable across **multiple/all devices**; frontend
repeatedly shows `เซิร์ฟเวอร์ตอบช้า — กรุณาลองใหม่อีกครั้ง [timeout]`.

> **Scope of evidence.** This investigation was performed from a sandboxed clone of
> the repository. It has **no access to the live Apps Script Executions log, Cloud
> Logging, `[perfB]` output, CacheService state, or the GAS trigger list.** Every
> claim below is labelled **CONFIRMED** (proven from committed code / GitHub API),
> **STRONG EVIDENCE**, **HYPOTHESIS**, or **UNKNOWN**. No runtime evidence was
> fabricated. No production probe / synthetic transaction was run (hard rule
> respected). **No application code, config, cache, or deployment was changed.**
> This session ends in **STATE B — EVIDENCE BLOCKED** (see §15–§19).

---

## 1. Incident Summary

Users on multiple devices cannot enter the app. The boot sequence in the attached
screenshot reaches **~121 s** total, with the `me` auth call completing in **~9.6 s**
and the full-payload request timing out and retrying repeatedly (durations clustered
at **35 s / ~20 s / ~17 s / ~19 s**, plus some fast values **98 ms / 1.1 s / 5.2 s**).
The terminal state is the frontend timeout banner.

This is **the same incident class** already documented internally in the *Backend
Stability Audit v1* (see `docs/HANDOFF-BACKEND-OBSERVABILITY.md`): *"auth:me slow
14.4–64.2 s / doPost hang 298.6 s / doGet 13–30 s / repeated stale banner."* Those
root causes were **identified but deliberately left unfixed pending real burst
telemetry.** The three incident files named in the mission brief
(`INCIDENT-WEB-PERFORMANCE-2026-08-26.md`, `INCIDENT-2026-08-25-BURST.md`,
`DURABLE-OBSERVABILITY-DESIGN-V1.md`) **do not exist in the repository** — they were
not created, so no prior conclusions were inherited from them.

---

## 2. Production Version (CONFIRMED)

| Item | Value |
|---|---|
| Current branch / HEAD | `claude/web-outage-forensic-investigation-lvhnym` == `master` == `7582514` |
| Working tree | clean (no local edits) |
| HEAD commit | `7582514 deploy: bump CACHE_NAME dmj-v51 → dmj-v52 (merge master ↔ Phase A–C combined jsx)` @ 2026-08-26 10:00:02Z |
| `CACHE_NAME` (service-worker.js:15) | `dmj-v52` |
| `VENDOR_CACHE` | `dmj-vendor-v1` |
| Frontend GAS `_SHEET_BASE` (config.js) | `AKfycbz4ARb5…EOUvWEDaEPbVcONg/exec` (unchanged) |
| GAS auto-deploy workflow | `.github/workflows/deploy-gas.yml` → `clasp push` + `clasp deploy` on push to `master` touching `.gs`/`.json`/workflow |

**GitHub Actions deploy history (CONFIRMED via API):**

| Run | Commit | Time (UTC) | Conclusion |
|---|---|---|---|
| #193 | `7582514` (v52 bump) | 2026-08-26 **10:09** | **success** |
| #192 | `7cc4a53` (F-08/F-07 merge) | 2026-08-26 **09:57** | **success** |
| #191 | `628afa9` (stockcount R1) | 2026-08-26 04:31 | success |

`.gs` commits landing on master today: Phase A registry `ff26f0b` (05:04), Phase B SKU
reservation `1888195` (07:55), merges `6c1e90a` (09:47) / `dddda31` (09:59).

**Conclusion:** the web app `/exec` is serving the **latest** code (both `clasp push`
and `clasp deploy` succeeded — the historical 200-version-limit failure did **not**
recur). The backend redeployed **twice within ~12 minutes this morning** (09:57 and
10:09), i.e. **two cold-container events immediately before the incident window.**

---

## 3. User-Visible Symptoms

- Boot stalls; banner: `เซิร์ฟเวอร์ตอบช้า — กรุณาลองใหม่อีกครั้ง [timeout]`
  (app.jsx:1381 — the AbortError branch of `fetchFromSheet`).
- Reproduced across multiple devices → **not** one browser/network → a **server-side
  or shared-infrastructure** condition, not a per-client fault.

---

## 4. Client Timeline (CONFIRMED from code — `app.jsx`)

### 4.1 Auth (`postAuthAction`, app.jsx:1109–1155)
- `me` POST has an explicit budget: `_TIMEOUTS.me = 20000` ms (line 1129–1130) via
  `dmjFetch({dmjTimeoutMs})`.
- On failure it **retries internally twice** (line 1144–1148) with 1.5 s / 3 s backoff.
- Marks `auth:me` at start, `auth-done:me` in `finally` — so **`auth-done:me` measures
  the wall-clock the `me` call actually took.** Screenshot ~9.6 s ⇒ the `me` request
  really took ~9.6 s (well under the 20 s abort budget → it **succeeded slowly**, it
  did not abort).

### 4.2 Payload (`fetchFromSheet`, app.jsx:1240–1392) — the retry engine
- `retryLeft` starts at **3**. **Attempt-1 timeout = 35000 ms; every retry = 20000 ms**
  (line 1249: `const timeoutMs = retryLeft === 3 ? 35000 : 20000`).
- AbortController fires at that budget (line 1250).
- On AbortError: `nextLeft = retryLeft - 1`; if `retryLeft > 0`, schedule
  `fetchFromSheet(nextLeft, force)` after `base + random*base` where
  `base = 800 (attempt1) / 2000 / 4000` (line 1367–1375).
- On `badjson` (HTML instead of JSON — a *cut-off* download): `nextLeft = max(0,
  retryLeft-2)` and `base = 3000` (line 1362, 1367, 1369) — deliberately backs off
  harder and does fewer tries.
- After the last attempt aborts (`retryLeft === 0`), it sets the
  `เซิร์ฟเวอร์ตอบช้า … [timeout]` banner (line 1381).

**Reconstructed single-chain worst case (all AbortError):**

```
t=0     attempt1 fetch  (budget 35s) ── abort @35s
        + backoff 0.8–1.6s
~36s    attempt2 fetch  (budget 20s) ── abort @20s
        + backoff 2–4s
~59s    attempt3 fetch  (budget 20s) ── abort @20s
        + backoff 4–8s
~85s    attempt4 fetch  (budget 20s) ── abort @20s → BANNER
~105s   (+ the ~9.6s me before payload started ≈ 115s)   ≈ the ~121s observed
```

The observed **35 s → ~20 s → ~17–20 s** cluster is **exactly** these abort budgets.
The fast values (**98 ms / 1.1 s / 5.2 s**) are **not** full-payload successes — they
are the interleaved lightweight calls on the boot path that share the BootTrace:
`action=ver` (checkDataUnchanged, app.jsx:920, ~40-byte reply), the `<head>` prefetch
resolving from already-buffered bytes, and/or `stocklite` polls. **They must not be
summed with the payload budgets** (per the mission's explicit warning — different
instruments measure different things).

### 4.3 CONFIRMED contributing defect — retry budget < server queue wait
- Server single-flight queue wait is `_BUILD_LOCK_WAIT_MS = 25000` ms
  (appsscript_complete.gs:13452).
- Payload **retries** use a **20 s** budget (§4.2).
- Therefore a retry that lands in the server's build queue **aborts at 20 s while the
  server is still legitimately waiting/building at 25 s+** — it can never receive the
  in-flight result, and instead fires yet another heavy request. Only attempt-1 (35 s)
  can outlast the 25 s queue. **This is a genuine timing mismatch that prevents
  recovery and amplifies load** — see §8.

---

## 5. Server Timeline (CONFIRMED from code — `appsscript_complete.gs`)

### 5.1 `doGet` payload path (2805–3228)
1. `perfReqBegin_` (telemetry, log-only).
2. `checkToken_`; fast routes (`ping`, `ver`, `stocklite`, `order*`, …) return early.
3. Payload path: compute `variant` (role) + `enc` (pv). Frontend requests **pv=3**
   (app.jsx:1257) → cache key suffix `_v3` (appsscript:13562–13566).
4. **Fresh cache HIT** (`getCachedPayload_`, TTL 180 s) → return immediately (patches
   live `lastModified`).
5. **MISS** → `acquireBuildLock_(0)` (**getUserLock**, appsscript:13690–13695).
   - Lock **not** obtained → serve **STALE** payload (`dmj_stale_*`, TTL 1800 s) in
     ~0.3 s, flagged `stale`.
   - No stale available (e.g. cold cache after deploy) → `acquireBuildLock_(25000)`
     wait; if a fresh build appears, serve `WAIT-HIT`; else **build yourself**.
6. Build path: `buildFullData_()` once, then stringify **3 variants × 2 encodings
   (pv2 + pv3) = 6 large payloads** and populate fresh+stale cache (3174–3195).

### 5.2 `buildFullData_` cost (CONFIRMED, measured 2026-08-05 — `docs/PHASE0-RESULTS.md`)
- Total **9,807 ms**; **70 % is sheet I/O** (`batchGet` 2,545 · `purchases` 1,362 ·
  `qtyByLocation` 1,247 · `mtoJobs` 826 …). No ZORT/Drive calls on this path.
- Full payload **4,576 KB** (ops 4,382 / lite 4,200). Stock sheet 5,876 × 12.
- **First user to build waits ≈ 10.1 s even on a warm container.** On a **cold**
  container, add the V8 spin-up + full-script parse on top.

### 5.3 `doPost` `me` path (2474–2549)
- `JSON.parse` → `getActiveSpreadsheet` → `checkToken_` →
  **`resolveSession_`** (2521) → `resolvePostAction_` → `canDoOrNull_` → `meHandler_`.
- **No global ScriptLock** is taken on the auth path → `me` slowness is **not** write-
  lock contention. It is cold-start + `resolveSession_` sheet scan + **platform-level
  execution queueing** (see §7).
- `resolveSession_` (513–554): 300 s CacheService cache; on **miss** it scans the whole
  "เซสชัน" sheet (`getLastRow` + read all rows × 6) then reads the staff row. `me`
  typically resolves the session **twice** (doPost + `meHandler_`) — the RC-3 "double
  resolve" the audit flagged.

### 5.4 `keepWarm_` (13721–13755) — the stampede shield
- Timed trigger (every 5 min, installed by `setupKeepWarm()`) that (a) keeps the
  container warm and (b) rebuilds fresh+stale cache for **all variants including pv=3**
  (13735–13740) when the fresh cache is empty.
- **Correctly warms pv=3.** `invalidateCache_` (13764–13800) correctly clears pv=3 and
  correctly leaves the stale layer intact.
- **UNKNOWN (no runtime access):** whether the `keepWarm_` trigger is currently
  installed and firing. If it is **not** running, cold cache after a deploy is **not**
  auto-refilled → every simultaneous opener stampedes the build/queue path. This is the
  single most load-bearing UNKNOWN in this investigation.

---

## 6. Cache Analysis

- **Two-layer cache is architecturally intact (CONFIRMED):** fresh `dmj_payload_*`
  (180 s) + stale `dmj_stale_*` (1800 s); `invalidateCache_` clears only the fresh
  layer and covers enc=1/2/3 for every variant. Single-flight + stale-while-rebuild is
  wired correctly in `doGet`.
- **STRONG EVIDENCE of a cold-cache window this morning:** two GAS redeploys (09:57,
  10:09). A new deployment version cold-starts the V8 container. Whether the **stale**
  pv=3 layer survived depends on timing (CacheService persists across deploys, but the
  stale entry only exists if a pv=3 build ran in the prior 30 min). Right after the
  first client to run the new `dmj-v52` app.jsx requests **pv=3**, if neither the fresh
  nor stale `_v3` entry is warm, that client hits the 25 s build-lock-wait path.
- **HYPOTHESIS:** during the post-deploy window, no warm pv=3 payload existed and many
  devices opened together → the classic stampede the two-layer cache exists to prevent,
  re-appearing because the cache was cold, not because the mechanism is broken.

---

## 7. Lock / Concurrency Analysis (CONFIRMED from code)

- **Build lock = `getUserLock()`** (13692), separate from the write path's
  `getScriptLock()`. So payload builds do **not** block order/transfer writes and vice
  versa. Correct by design.
- **No ZORT / Drive / cache-rebuild call is held inside the payload path.** (`me` and
  payload paths are free of the RC-2 "Drive-inside-lock" hazard, which lives on the
  attendance `punch` path, not on boot.)
- **Platform-level concurrency is the real serializer.** `appsscript.json` deploys the
  web app `executeAs: USER_DEPLOYING` → **every** `doGet`/`doPost` runs as the single
  owner identity → subject to Apps Script's **~30 simultaneous executions per user**
  ceiling. When a whole store opens at once (each device firing `me` + up to 4 payload
  attempts — see §8), the platform **queues** executions. Queued time is invisible to
  the GAS Executions duration but **fully visible to the browser** — this is precisely
  why `auth-done:me` reads 9.6 s while server-side execution logs may show far less
  (the exact lesson recorded in Phase 7.4: *"time the browser sees ≠ time the script
  uses."*).

**UNKNOWN:** the actual concurrency peak during the incident (needs `[perfB]` metric ①).

---

## 8. Retry / Timeout Analysis (CONFIRMED from code) — the amplifier

Per device, one boot can fire **1 `me` + up to 4 full-payload requests** (§4). Each
aborted payload fetch closes the client connection, **but the GAS execution keeps
running to completion** (GAS does not observe the client abort). So:

- N devices × up to 4 heavy `doGet` payload requests = **up to 4N executions** thrown
  at a container already at/над its concurrency ceiling.
- Retries 2–4 use a **20 s** budget that is **shorter than the 25 s server queue wait**
  (§4.3) → they cannot succeed while queued; they abort and **re-queue another heavy
  build request**, feeding the stampede.
- The `badjson` branch (HTML from a cut-off 4.6 MB download) at least backs off harder
  (3 s base, `-2` tries) — that path is well-tuned. The pure-timeout path is the one
  that amplifies.

**This is a CONFIRMED contributing factor**, independent of whatever first tipped the
system cold. It does not, on its own, start an outage, but it **deepens and prolongs**
one and blocks self-recovery.

---

## 9. Deployment / Version Analysis

- **CONFIRMED:** GAS `/exec` runs current code (deploys #192/#193 succeeded). **Not** a
  stale-version / 200-version-limit inconsistency.
- **CONFIRMED:** `CACHE_NAME dmj-v51 → dmj-v52`. On first open after this bump, every
  device drops the old SW cache and must **re-download + Babel-recompile** `views-main`
  (~555 KB) + `views-analytics` (~583 KB). This is a **one-time, per-device** CPU cost
  (`compile:` marks, not `payload:`) that coincides with — and compounds — the server
  slowness, making the whole boot feel dead. (The separate `dmj-babel*` / vendor caches
  are preserved, so React/Babel libs are not re-fetched.)
- **CONFIRMED (weight, not logic):** Phase A registry (`ff26f0b`) + Phase B SKU
  reservation (`1888195`) are **additive, feature-flagged, and NOT on the
  payload/auth/build hot path** (they live at appsscript:16445+, only reachable via
  their own `list*Registry`/`save*Registry` doPost actions, each gated by a `*_ENABLED`
  flag returning `{off:true}` when disabled). Their only hot-path effect is **making the
  `.gs` file larger (~3k+ lines) → a slower cold-start parse.** They did **not** add
  work to `buildFullData_`/`readProducts_`/`doGet`. → **Ruled out as a build-time
  regression.**

---

## 10. Correlation Evidence

Because live server logs are inaccessible, this table correlates the **observed client
values** with the **code paths that produce them**. Server columns are the
*mechanism*, not measured runtime.

| Client event (screenshot) | Client code | Server mechanism | Assessment |
|---|---|---|---|
| `auth:me` ~4 ms | mark set (app.jsx:1119) | — | timer start |
| `auth-done:me` ~9.6 s | `me` POST wall-clock (1153) | cold start + `resolveSession_` scan + platform queue; no lock | **STRONG EVIDENCE** cold container + queueing |
| payload **35.0 s** | attempt-1 abort budget (1249) | MISS → 25 s build-lock-wait → build ~10 s; no warm stale ⇒ exceeds 35 s | **STRONG EVIDENCE** cold pv=3 cache |
| payload **~17–20 s** ×3 | retry abort budget 20 s (1249) | still queued/building; 20 s < 25 s wait ⇒ always aborts | **CONFIRMED** retry/queue mismatch |
| **98 ms / 1.1 s** | `ver`/prefetch/`stocklite` | `action=ver` ~40 B; prefetch buffered | **CONFIRMED** not a payload success |
| final `[timeout]` banner | retryLeft=0 (1381) | 4th attempt aborted | **CONFIRMED** |

---

## 11. Root Cause

**PRIMARY CAUSE (STRONG EVIDENCE, not CONFIRMED):**
A **cold-container + cold pv=3-payload stampede** triggered by **two back-to-back GAS
redeploys this morning (09:57 & 10:09)** combined with the **`dmj-v52` cache bump that
forced every device to re-download and re-compile the JSX at the same time**. With the
container cold and the warm pv=3 payload cache empty, simultaneous device openings each
paid *cold-start + ~10 s `buildFullData_` + 4.6 MB download*, which **exceeds the
client 20–35 s abort budgets**, producing the timeout banner. The frontend then
**amplifies** the load (up to 4 heavy retries/device, with a 20 s retry budget that is
shorter than the 25 s server queue wait), which **prevents self-recovery** for as long
as devices keep re-opening.

This is the **same failure family** as the internally-documented *Backend Stability
Audit v1* (auth:me 14.4–64.2 s / doPost 298.6 s / doGet 13–30 s), whose fixes were
**deliberately deferred pending burst telemetry** — i.e. the backend was **already
known to be fragile under burst**, and this morning's deploy/recompile event tipped it
over.

**Causal chain:**
```
2 GAS redeploys (09:57, 10:09)  +  CACHE_NAME v52 bump
        │                                   │
   cold V8 container                 every device force-recompiles JSX
   (larger .gs → slower parse)       (one-time CPU spike per device, same moment)
        │                                   │
   warm pv=3 payload cache empty ── IF keepWarm_ not refilling (UNKNOWN) ──┐
        │                                                                  │
   many devices open together (morning) ──────────────────────────────────┤
        │                                                                  │
   platform queues executions (executeAs owner, ~30 concurrent cap)        │
        │                                                                  │
   me ≈ 9.6s ;  payload: MISS → 25s build-wait + ~10s build + 4.6MB DL     │
        │                                                                  │
   first byte > 20–35s  →  client AbortController fires  →  BANNER         │
        │                                                                  │
   client retries (≤4/device, 20s budget < 25s server wait) ──────────────┘
        │
   retries re-queue heavy builds → amplify → no self-recovery while devices reopen
```

---

## 12. Confidence Level

| Element | Confidence |
|---|---|
| Frontend abort budgets 35 s / 20 s; up to 4 retries; banner text/path | **CONFIRMED** |
| Retry 20 s budget < server 25 s build-lock-wait (mismatch) | **CONFIRMED** |
| `buildFullData_` ≈ 9.8 s, payload ≈ 4.6 MB (prior measurement) | **CONFIRMED** (historical, not live) |
| Two successful GAS deploys 09:57 & 10:09; /exec on latest code | **CONFIRMED** (GitHub API) |
| Phase A/B not on hot path; deployment-staleness ruled out | **CONFIRMED** |
| `me` path has no global lock; slowness = cold start + queueing | **CONFIRMED (code)** / STRONG (runtime) |
| Primary cause = deploy-induced cold stampede on a fragile backend | **STRONG EVIDENCE** |
| Whether `keepWarm_` trigger is currently running | **UNKNOWN** |
| Live concurrency peak, actual build/`me` durations right now, cache HIT/MISS/STALE mix | **UNKNOWN** |
| Whether the outage is still ongoing vs. a post-deploy transient | **UNKNOWN** |

---

## 13. Contributing Factors

1. **Frontend retry amplification** (CONFIRMED): up to 4 heavy payload requests/device;
   retry budget (20 s) < server queue wait (25 s) ⇒ retries cannot succeed while queued
   and re-queue more builds.
2. **`CACHE_NAME` v52 forced JSX recompile** (CONFIRMED): simultaneous per-device CPU
   spike at the same moment as the server slowness.
3. **Two redeploys within 12 min** (CONFIRMED): two cold-start events back-to-back.
4. **Large single payload (~4.6 MB) + ~10 s build** (CONFIRMED historical): even one
   cold build blows past the 20 s retry budget.
5. **`executeAs: USER_DEPLOYING` concurrency cap** (CONFIRMED): all requests serialize
   through one identity's ~30-execution ceiling; burst → platform queueing (invisible
   in Executions duration, visible to the browser).
6. **`.gs` growth from Phase A/B** (CONFIRMED): larger script → slower cold-start parse
   (weight only, no logic on hot path).
7. **Known-but-unfixed backend RCs** (per audit): RC-3 `resolveSession_` double-resolve
   + session-sheet growth, RC-1 concurrency ceiling.

---

## 14. Ruled-Out Causes

1. **Stale/old GAS code served by `/exec`** — deploys #192/#193 succeeded; not a
   200-version-limit failure. **CONFIRMED ruled out.**
2. **Phase A/B registry / SKU-reservation regression on the payload path** — additive,
   flag-gated, off the hot path. **CONFIRMED ruled out** as a build-time regression
   (residual cold-start-parse weight only).
3. **Broken single-flight / stale-while-rebuild / cache-invalidation logic** — code is
   intact and correctly covers pv=3. **CONFIRMED ruled out** as a logic defect (the
   issue is a **cold** cache, not a broken cache).
4. **Write-lock contention on the auth path** — `me`/`doGet` take no `getScriptLock`.
   **CONFIRMED ruled out.**
5. **Pure network/client fault** — reproduces across devices. **Ruled out.**
6. **pv=3 columnar payload as root cause** — prior audit proved it is not; it reduces
   size. **Ruled out.**

---

## 15. Fix Recommendation

**Fix class: E — multiple layers**, and **F — cannot safely fix without more evidence**
for the *primary* trigger. The repository's own governance
(`docs/HANDOFF-BACKEND-OBSERVABILITY.md` + `tests/perf-observability.test.js`)
**explicitly forbids changing lock / timeout / retry strategy until real burst
telemetry is read**, and the mission hard-rule forbids changing code/config/cache/
deploy before the root cause is CONFIRMED. Both point to the same disciplined outcome:
**do not make a speculative change now.** Candidate fixes, ranked, to apply **after**
§19 produces evidence:

- **(Operational, zero-code, highest value — verify first):** confirm `keepWarm_` is
  installed and firing (`perfCheckTriggers` in the GAS editor). If it is not, running
  `setupKeepWarm()` once restores the anti-stampede shield. *This is a runtime/GCP
  action, out of scope for this no-touch investigation, but it is the first thing to
  check and likely the fastest mitigation.*
- **(Backend, narrow):** align the client/server budgets so retries can actually
  outlast the queue — i.e. make retry budgets ≥ `_BUILD_LOCK_WAIT_MS` **or** lower
  `_BUILD_LOCK_WAIT_MS`. *Blocked:* touches the exact retry/timeout constants the
  perf-observability meta-test locks; requires burst numbers first.
- **(Frontend, narrow):** cap payload retries and/or serve last-good `localStorage`
  data on repeated timeout instead of re-firing heavy builds. *Blocked:* same
  governance; needs burst numbers to size correctly.
- **(Backend, structural — the audit's F1/F2/F3):** cut `buildFullData_` sheet-I/O
  and/or payload size (the durable win). *Blocked on the audit's own sequencing.*

For each, once unblocked: exact file/function, behavior change, regression risk,
rollback (single-constant revert / `disableKeepWarm()`), and before/after `[perfB]`
benchmark must be recorded — one change at a time, per repo rules.

---

## 16. Implementation Performed

**None.** No application code, configuration, cache, deployment, or GCP state was
changed. The only file added is this forensic document. Rationale: the **primary root
cause is STRONG-EVIDENCE, not CONFIRMED** (it hinges on the UNKNOWN `keepWarm_`/live-
concurrency state), and the repo governance + mission hard-rule both forbid speculative
timeout/retry/lock edits without burst telemetry. Ending state: **STATE B — EVIDENCE
BLOCKED.**

---

## 17. Tests

No code changed → no test run required. Existing guards remain green by construction:
`tests/perf-observability.test.js` (locks lock args 8000/15000/10000 + waitLock 10000 +
retry counts), `tests/columnar-payload.test.js` (enc build vs. invalidate parity). None
were modified.

---

## 18. Remaining Risk

- If `keepWarm_` is not running, the outage will **recur after every deploy** and every
  quiet period, regardless of any frontend change.
- The frontend retry amplifier (§8) will **deepen any future burst** until the 20 s-vs-
  25 s mismatch is corrected.
- The backend remains at its **pre-existing fragility** (audit RC-1/RC-3, ~10 s build,
  4.6 MB payload). Nothing in this session changed that.
- Every future `.gs`/`CACHE_NAME` deploy reintroduces the cold-start + forced-recompile
  window; back-to-back deploys (as this morning) double it.

---

## 19. Exact Next Action (to convert STRONG EVIDENCE → CONFIRMED)

Ordered, all read-only, no synthetic transaction:

1. **GAS editor → run `perfCheckTriggers`.** Confirm `keepWarm_` is installed and
   firing every 5 min (and check for duplicate/za triggers). *If absent → that is the
   confirmed primary trigger; mitigate by running `setupKeepWarm()` once.*
2. **GAS editor → Executions (or Cloud Logging), filter `[perfB]` and `[perf] doGet`
   for the incident window (~09:57–now, 2026-08-26).** Then
   `node scripts/perf-report.mjs <burst>.log`. Read:
   - metric ① concurrency max → did it hit the ~30 ceiling? (confirms §7)
   - metric ⑦ cache mix → MISS-heavy right after deploy? STALE serving? (confirms §6)
   - metric ③ action+duration → real `me` and payload build durations now (confirms §5)
   - metric ④ `resolveSession_` count/duration → RC-3 weight
3. **Run `perfMeasureBuild`** once → current `buildFullData_` ms + payload KB vs. the
   9.8 s / 4.6 MB baseline (detects any drift since 2026-08-05).
4. **Note flag/row state** at incident time (`INAPP_NOTI_ENABLED`,
   `PRODUCT_OWNER_ENABLED`, session/attendance sheet row counts) — RC-3 multipliers.
5. With (1)–(4) in hand, pick **one** fix from §15, implement on this branch, benchmark
   before/after with `[perfB]`, and deploy alone — per repo governance.

**Until (1)–(2) are read, the primary root cause stays STRONG EVIDENCE, and no
timeout/retry/lock/cache change should be made.**

---

### Appendix — Key file:line references (current `master` = `7582514`)

- `app.jsx:1240–1392` `fetchFromSheet` (retry engine; 35 s/20 s budgets @1249; banner @1381)
- `app.jsx:1109–1155` `postAuthAction` (`me` 20 s budget @1129; internal 2 retries @1144)
- `app.jsx:1509–1521` boot data effect; `app.jsx:1257` requests `pv=3`
- `appsscript_complete.gs:2805–3228` `doGet` (single-flight + stale-while-rebuild)
- `appsscript_complete.gs:3232+` `buildFullData_`
- `appsscript_complete.gs:13448/13452` `_STALE_TTL_SEC=1800` / `_BUILD_LOCK_WAIT_MS=25000`
- `appsscript_complete.gs:13690–13695` `acquireBuildLock_` (getUserLock)
- `appsscript_complete.gs:13721–13755` `keepWarm_` / `setupKeepWarm`
- `appsscript_complete.gs:513–554` `resolveSession_` (300 s cache; sheet scan on miss)
- `service-worker.js:15` `CACHE_NAME = "dmj-v52"`
- `docs/PHASE0-RESULTS.md` (build 9,807 ms; payload 4,576 KB)
- `docs/HANDOFF-BACKEND-OBSERVABILITY.md` (Backend Stability Audit v1; `[perfB]`; RC list)

---
---

# ADDENDUM — Post-#106 production trace (23.7 s) + residual diagnosis (2026-08-27)

**Production evidence (owner screenshot, after PR #106 / GAS @309):** total 23.7 s ·
`auth:me` 3.4 s · payload time-to-first-byte **19.3 s** · payload complete **3228 KB in
607 ms** · ready ~50 ms.

## What the 19.3 s is — CONFIRMED (code + GAS architecture)

- Between `payload:เริ่ม` and `payload:ไบต์แรก` the client does **only `fetch().then(getJson)`**
  — zero client compute — and the same bytes downloaded in **607 ms**. So the 19.3 s is
  **time-to-first-byte**, not the transfer.
- Every `doGet` return path uses `ContentService.createTextOutput(...)`, and **GAS
  ContentService buffers — it does not stream** — so no byte leaves the server until `doGet`
  returns. Therefore **19.3 s ≈ full `doGet` server execution time.**
- It was **not** a HIT or STALE serve (both return ~0.3 s). It completed on the **first
  attempt** (~19.9 s < the 35 s budget) → **no abort, no retry, no HTML** → **the old
  retry-storm outage did not recur.** `auth:me` 3.4 s vs the incident's 9.6–64 s.

## Root cause of the residual — STRONG EVIDENCE

The 19.3 s = `buildFullData_` (**~9.8 s, measured Aug-05, 70 % sheet I/O**) + build overhead
(shape+stringify of pv2+pv3 × 3 variants + ~12 CacheService chunk-writes, ~3–6 s on GAS) +
cold-start — **paid only because both cache layers were cold at that moment.** With a warm
cache the identical open is a ~0.3 s HIT. A fully-cold cache (fresh 180 s **and** stale
1800 s both expired) requires >30 min with no user **and** no keep-warm — i.e. **`keepWarm_`
(the 5-min trigger the owner installs via `setupKeepWarm()`) is not running.** That is the
decisive lever, and it is **operational, not a code defect** — trigger creation cannot be
done from a `clasp push` deploy.

`bootstrap-lite` (Phase 2) would cut stringify + download but **not** the dominant sheet-I/O
term, so it is **not** the fix for this 19.3 s either — **only a warm cache is.**

## Fix shipped in code (safe, minimal, reversible) — classification: build-overhead trim

`logPayloadSizes_` (a diagnostic that **re-serialises the whole ~3 MB payload + every
product's `mo`**, ~0.3 s on GAS) ran on **every** cold build, on the critical path of the
very user who triggered the build. It is now **sampled at 15 %** (`if (Math.random() < 0.15)`
in `doGet`), preserving periodic size observability while removing the tax from most cold
builds. `perfLogDoGet_` (the ~0-cost HIT/MISS/STALE + `build=`/`shape+cache=` ms line) still
runs on **every** request. No data semantics, business rules, `buildFullData_` I/O,
pv-encoding, TTLs, retries, or the stale business-cap were touched. `.gs`-only → **no
`CACHE_NAME` bump.**

- Tests: `tests/startup-resilience.test.js` +2 meta-cases (logPayloadSizes_ is sampled, not
  unconditional; perfLogDoGet_ still unconditional). Unit **2473/2473**.
- Honest scale: this trims ~0.3 s of the 19.3 s. **It is not the fix for the 19 s** — the fix
  is the operational `setupKeepWarm()` below. It ships because it is the only clearly-safe
  in-code reduction on the proven hot path.

## The operational fix (owner, 1 minute, GAS editor) — this is what removes the 19 s

1. Run **`perfCheckTriggers`** → confirm whether `keepWarm_` is installed and firing.
2. If absent, run **`setupKeepWarm()`** once → installs the 5-min warm trigger. After this,
   first-open (even on a brand-new device) becomes a ~0.3 s HIT instead of a ~19 s build,
   because the cache never goes fully cold.
3. Optional confirmation: **`perfMeasureBuild`** → current `buildFullData_` ms vs 9.8 s.

## Remaining limitation

The intrinsic cold build (~10 s sheet I/O) is unchanged; it is only *avoided* by warm cache
(keepWarm) or *reduced in download/stringify* by Phase 2 (which does not address the I/O).
The durable removal of first-build cost is Phase 2 (bootstrap-lite), still deliberately not
started.

## Rollback

`git revert` the sampling commit (single, `.gs`-only). No deploy-URL/version pinning change.
