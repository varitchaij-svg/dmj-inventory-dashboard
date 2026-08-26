# FINAL PRE-FIX ARCHITECTURE REVIEW — Web Outage / Startup Timeout

**Date:** 2026-08-26 · **Mode:** REVIEW ONLY — nothing modified, nothing deployed
**Mandate:** independently challenge the previous (Opus) forensic diagnosis
(`docs/INCIDENT-WEB-OUTAGE-2026-08-26-FORENSIC.md`) and decide whether the current
fix direction is the right *final* architecture, before any further "fix → deploy →
slow again" round.

> **PHASE 0 UPDATE (2026-08-26, later same day):** measured evidence has been collected
> and is recorded in **§15–§21 at the end of this document**. The verdict below is
> **upheld (C)**, but three claims in this review were **corrected by measurement** —
> the payload-size argument is weaker than written here, and the localStorage finding
> is far stronger (now CONFIRMED, 22.9 MB vs a ~5 MB quota). Read §15 onward for the
> authoritative numbers; treat §1–§14 as the reasoning that led to the measurements.

**Verdict up front: C — the current architecture has a fundamental bottleneck.**
The bootstrap design ("open the app" ⇒ "download the entire operational dataset,
rebuilt from 14 sheet reads, cached only in a best-effort cache, served by a
single-identity Apps Script web app") cannot reliably serve the store's real
concurrency, and every fix round since July has been retiring one symptom of that
same design. Several claims in the previous diagnosis do **not** survive scrutiny
(§2), and this review found **three architecture-level defects the previous
investigation missed** (§2.9–§2.11). Details and the phased plan follow.

---

## 1. Reconstructed History — are we fixing symptoms?

Chronology assembled from git history, `CLAUDE.md`, `docs/PHASE0-RESULTS.md`,
`docs/PLAN-PHASE8-PAYLOAD.md`, `docs/HANDOFF-LOGIN-PERF.md`,
`docs/HANDOFF-BACKEND-OBSERVABILITY.md`.

| Date | Change | Problem targeted | What changed | Evidence after | Solved it? | New failure mode created? | Status |
|---|---|---|---|---|---|---|---|
| ~Jul 2026 | Phase 7.6 **original** (`be2c3aa`) | login fragility | bundled login hardening | **store-wide outage** → reverted `cc583ea` | ❌ caused an outage | yes (bundled rollout, undiagnosable) | reverted, re-landed piecewise later |
| 2026-07-31 | Enable server cache for real (drop `fresh=1` everywhere) + role variants + `mo` compact | every open rebuilt payload | cache actually used; payload per role | role split saved only **~8 %** (lite 4,200 vs full 4,576 KB) | partially | — | live |
| 2026-08-05 | **Phase 0 measurement** | stop guessing | loadtest 15 concurrent | **87–93 % got HTML, median 41–52 s, worst 115 s**; `buildFullData_` = **9,807 ms**, 70 % sheet I/O; payload 4.2–4.6 MB | n/a (measurement) | — | baseline numbers |
| ~2026-08-05 | **Phase 7.3** single-flight + stale-while-rebuild (user lock, 25 s wait, stale layer 30 min) | build stampede | one builder, others get stale copy | executions now 2–3.6 s all complete — **but browsers still got 404 at 24–28 s (5/15)** | build stampede: yes · user outcome: **no** | new dependency on CacheService reliability (§2.10) | live |
| ~2026-08-06 | **Phase 7.4** `stocklite` + `action=ver` | 4.2 MB poll every 30 s | tiny polls; skip unchanged loads | poll traffic → **761 KB / 7.7 min** (was tens of MB) | yes, for polls · **first load untouched** | ver-stamp edge cases (documented) | live |
| ~2026-08-07 | **Phase 7.5** prefetch abort, badjson backoff+jitter, `dmjFetch` 60 s default | double downloads, infinite retries, forever-pending | see left | no more multi-minute pending requests | yes, for those behaviors | — | live |
| 2026-08-13 | **keepWarm_** every 5 min + precompile + vendor cache (`3ff1d77`) | cold container + cold cache off-hours | timed warm build | **no post-deploy measurement in repo**; current trigger status **UNKNOWN** | unproven | none known | live (status unverified) |
| ~2026-08-15–21 | Phase 7.6 A–E re-landed piecewise | login resilience | checking-screen exit, handoff grace, poll backoff, `resolveSession_` 300 s cache + lastSeen throttle, postAuthAction timeouts | passed iPhone test; A–E deployed | yes (login layer) | — | live |
| 2026-08-19 | **Phase A1 / pv=3** columnar products (`ae0c228`) | payload size (keys ≈ ⅔ of bytes) | `{cols,rows}` encoding | **no measured pv=3 size anywhere in the repo** | unproven (see §2.4) | one missed-invalidation bug (fixed with meta-test) | live |
| 2026-08-19–20 | **Backend Stability Audit v1** + **`[perfB]` observability** | recurring incident: auth:me 14.4–64.2 s, doPost 298.6 s, doGet 13–30 s | log-only instrumentation; RC-1…RC-5 named; fixes **deferred pending burst log** | **burst log never collected** (no burst file in repo) | n/a | governance lock: no lock/timeout/retry changes without burst data | live, unused |
| 2026-08-21–25 | Central transfer, Realtime stock count, R1 (send only changed SKUs) | stock-count reliability | client patches + smaller writes | — | (different problem) | more frequent small writes → more invalidations (§6) | live |
| 2026-08-25–26 | F-07/F-08 authz, Phase A registry, Phase B SKU service, Phase C add-product, **CACHE_NAME v52** | security + product domain | additive, flag-gated; `.gs` grew again | deploys 09:57 & 10:09 succeeded | n/a | cold-start parse weight; forced fleet-wide JSX recompile | live |
| **2026-08-26** | **This outage** | — | — | ~121 s boot, me 9.6 s, payload 35 s→20 s×3 → timeout banner, multiple devices | — | — | **open** |

**Pattern (the §1 question answered):** every round was evidence-driven and each
retired a *real* mechanism — this is not cargo-cult patching. But the sequence is a
textbook **bottleneck migration**: build stampede → download size → hung requests →
login → (today) startup timeouts again. Each fix moved the failure to the next
constraint of the *same* architecture. The floor that no round has touched:
**a multi-MB bootstrap monolith, a ~10 s rebuild, a best-effort cache as the only
availability layer, and a single-identity execution pool.** `docs/PLAN-PHASE8-PAYLOAD.md`
said exactly this on **Aug 5** ("what remains is size") and, beyond A1, Phase 8 is
still marked **ยังไม่เริ่ม**.

---

## 2. Claim-by-claim review of the previous (Opus) diagnosis

| # | Claim | Verdict after challenge |
|---|---|---|
| 2.1 | Frontend timeouts = 35 s first attempt / 20 s retries, ≤4 attempts; banner at `app.jsx:1381` | **CONFIRMED** (app.jsx:1240–1392). Survives review. |
| 2.2 | Retry budget 20 s < server build-queue wait 25 s (`_BUILD_LOCK_WAIT_MS`) → retries structurally cannot outlast the queue and re-fire heavy requests | **CONFIRMED** (app.jsx:1249 vs appsscript:13452). Survives review. This mismatch only *bites* when the stale layer misses — see 2.10. |
| 2.3 | `buildFullData_` ≈ 9.8 s baseline, 70 % sheet I/O | **CONFIRMED but stale** — measured 2026-08-05 with 5,876 rows. Sheets have grown for 3 weeks (sessions, attendance ~20k rows/yr, audit log grows per action). Current value UNKNOWN; could be worse. |
| 2.4 | "pv=3 payload ~3.2 MB" | **UNSUPPORTED.** No pv=3 size measurement exists anywhere in the repo. Last measured numbers are **pv=2**: 4,576/4,382/4,200 KB (Aug 5). The Phase-8 estimate (keys ≈ ⅔ of *products* bytes) suggests pv=3 could be materially smaller — but nobody has read the `[perf] doGet ส่งจริง=…KB` line or a device's `payload:ครบ (KB)` mark since A1 shipped. Whether bytes-on-wire are gzipped is *also* still an open question (flagged in CLAUDE.md, never answered). **Two consecutive investigations have reasoned about the load without knowing the actual current payload size.** |
| 2.5 | "Two deploys (09:57, 10:09) → cold containers → trigger of this outage" | **Downgrade to HYPOTHESIS, and partially wrong.** Cold **containers**: yes, deployments invalidate warm instances. But the previous report implied the *payload cache* also went cold with the deploy — **CacheService is script-scoped, not version-scoped; it survives redeploys.** At 10:09 on a business day, the stale layer (30-min TTL) was very likely still populated. More damning: the *same incident class* (auth:me 14–64 s, doGet 13–30 s) occurred on days with **no deploy** (Audit v1). A transient cold start also cannot explain an outage that persists across user retries for an extended period. The deploys are at most an aggravator, not the architecture-level cause. |
| 2.6 | "keepWarm_ may not be firing — most load-bearing unknown" | **Challenged — overweighted.** Its status is still UNKNOWN and worth checking (2 minutes), but §5 shows that even a perfectly-firing keepWarm cannot prevent this class of outage. Repairing keepWarm is not a candidate *final* fix. |
| 2.7 | Retry amplification worsens the burst (≤4 heavy GETs/device; server keeps executing after client abort) | **CONFIRMED.** GAS does not observe client aborts; every abort strands a full execution and the client immediately queues another. Survives review. |
| 2.8 | "Cache invalidation from concurrent writes can cause rebuild storms" | **CONFIRMED and understated.** ~50 write call sites invoke `invalidateCache_()`; every one clears the **entire payload for every role and encoding**. During stock-counting (auto-save ~3 s cadence) the fresh layer's effective lifetime is the write inter-arrival, not 180 s. Single-flight serializes rebuilds, but the system can still spend entire working sessions in a rebuild-every-few-GETs regime (~10 s of sheet I/O each), occupying execution slots. |
| 2.9 | **MISSED by previous diagnosis — the offline layer that should have prevented "cannot enter":** the blocking pane renders only when `data === null` (app.jsx `dataPane`); a device with a localStorage payload boots instantly from cache and fetches in the background. Fleet-wide blocking therefore requires the localStorage safety net to be **absent on every affected device.** Mechanism found: `saveToStorage` (app.jsx:949) stringifies the **enriched, fully-expanded** payload — `enrichData` re-inflates compact `mo` into dense per-product `monthly` arrays, so the stored JSON is **larger than the 4.2–4.6 MB wire form**, plausibly 8–15 MB. iOS Safari's localStorage quota is ~5 MB per origin, and the store's fleet is primarily iOS PWA. `QuotaExceededError` is swallowed with `console.warn` only. **If this is happening, the offline-boot layer has been silently dead fleet-wide for months, converting any server slow-down into a full blocking outage.** | **HYPOTHESIS with strong mechanical support — the single most explanatory finding of this review.** It answers the question the previous diagnosis never asked: *why did the app's designed degrade-to-cache behavior not engage?* Verification costs one DevTools check on any store device (§13 Phase 0). |
| 2.10 | **MISSED — the stale layer is not a guarantee:** each payload is chunked into ~140 × 30 k-char CacheService entries; a read fails **entirely if any single chunk is missing** (`_readChunked_` all-or-nothing). The build writes fresh+stale × 3 variants × 2 encodings ≈ **1,600+ entries / ~50 MB** into a cache Google documents as **best-effort with unannounced eviction**. One evicted chunk out of 140 silently kills a whole layer for a variant — and then a burst falls through to the 25 s queue path, where the 20 s client budget (2.2) guarantees failure. | **STRONG EVIDENCE (from code + documented CacheService semantics).** This is the likely reason bursts keep breaking through a stampede shield that "should" hold: the shield is built on storage with no retention contract. Metric ⑦ of `[perfB]` (STALE/MISS mix) can confirm from logs. |
| 2.11 | **MISSED — fresh-cache repopulation race (data correctness, not just perf):** the build lock (`getUserLock`) is deliberately independent of the write lock (`getScriptLock`), so a doPost write can commit + `invalidateCache_()` **during** a ~10 s build. The build then unconditionally `putCachedPayload_` — repopulating the *fresh* layer with **pre-write data after the invalidation**. The HIT path then stamps a **live `lastModified`** onto that pre-write payload (`serveCached` regex-patch), which is exactly the "timestamp poisoning" the codebase carefully avoids on the stale path — but it exists on the fresh path. Consequence: for up to 180 s after such a race, clients hold pre-write data with a post-write timestamp → **conflict detection is bypassed → silent overwrites of colleagues' work** are possible. `keepWarm_` has the same race. | **STRONG EVIDENCE (code reading; occurrence needs timing but writes are frequent and builds are 10 s long, so the window is material).** This is an architectural flaw of the *invalidate-then-rebuild-without-versioning* model — CacheService has no compare-and-set, so it cannot be fully fixed within this model. |

**Summary of the challenge:** the previous diagnosis's *mechanics* (timeouts, retry
math, build cost, amplification) are correct and confirmed. Its *causal story*
("this morning's deploys + cache bump tipped a fragile backend") is weaker than
presented — deploys don't clear CacheService, the incident class predates today's
deploys, and the story never explained the absence of the offline fallback. The real
subject is not this morning's trigger; it is that **four independent defects (2.8,
2.9, 2.10, 2.11) all live in the same architectural decision** — one giant payload,
one cache, one identity.

---

## 3. Are we fixing the right layer? (ranked by evidence)

```
CLIENT → Cloudflare Pages (static only) → GAS web app → doGet/doPost
       → session → CacheService → buildFullData_ → Sheets → (ZORT: not on boot path)
```

| Rank | Layer / question | Assessment | Evidence class |
|---|---|---|---|
| **1** | **(H)+(I) One request constructs/ships too much data; "open app" is coupled to "load entire dataset"** | Dominant. `ping` 15/15 OK while payloads died mid-download (measured); role-split saved only 8 %; Phase-8 plan already concluded "size is what remains" | MEASURED (Aug 5) |
| **2** | **(D) Sheets I/O in `buildFullData_`** | 9.8 s per rebuild, 70 % I/O — every cache miss pays it; growing with sheet size | MEASURED (Aug 5) |
| **3** | **(A) Apps Script scheduling** — browser waiting for an execution slot | `executeAs: USER_DEPLOYING` ⇒ all traffic shares one identity's ~30-concurrent ceiling; queue time is invisible in Executions but fully visible to the browser (`me` 9.6 s with **no lock anywhere on its path** is best explained by this + cold start) | STRONG (code + platform docs + Audit v1) |
| **4** | **(F) Invalidation-triggered synchronized rebuilds** | ~50 sites clear the whole cache; write cadence during counting ≈ seconds | CONFIRMED (code) |
| **5** | **(G) Frontend retry thundering herd** | ≤4 heavy GETs/device; 20 s < 25 s mismatch; aborts don't cancel server work | CONFIRMED (code) — **amplifier, not initiator** |
| 6 | (B) Waiting on a lock | Bounded 25 s by design; only reached when both cache layers miss (see 2.10) | CONFIRMED (code) |
| 7 | (E) Auth/session as bottleneck | Largely retired by 7.6-D (300 s session cache, lastSeen throttle). `me` slowness today is queueing/cold-start, not session scans. Auth is already decoupled from data loading (separate endpoint; optimistic `authPhase="ready"`) | STRONG |
| 8 | (C) Rebuild frequency itself | Real but single-flighted; a consequence of #4 | CONFIRMED |
| — | Cloudflare/proxy | Serves static assets only; payload goes browser→script.google.com directly. Not implicated (its only role today: v52 bump forced fleet-wide JSX recompile — a one-time CPU aggravator) | CONFIRMED |
| — | (J) GAS as API server + query engine + cache + sync layer + notification worker simultaneously | True as an umbrella statement — and it is precisely why #1–#5 all collide in one ~30-slot pool. Full replacement is a business decision (see Option E'/§11), but the *read path* can be decoupled incrementally | STRONG |

**Answer to the critical question: we have been fixing layers 4–7 while layers 1–3
are the bottleneck.** No previous round has reduced what one boot fundamentally
costs: *(cold start?) + (rebuild if unlucky) + N × multi-MB download through one
identity's pipe.*

---

## 4. Previous-fix classification ("patches on patches" test)

| Fix | Reduced work? | Moved off critical path? | Reduced contention? | Reduced payload? | Reduced requests? | Added mechanism? |
|---|---|---|---|---|---|---|
| Server cache (Jul 31) | ✔ (on HIT) | — | — | — | — | +cache |
| Role variants | — | — | — | ✔ (8 % only) | — | +3 variants |
| `mo` compact | — | — | — | ✔ | — | +pv gate |
| 7.3 single-flight+stale | — | — | ✔ | — | — | +lock +2nd cache layer |
| 7.4 stocklite/ver | ✔ | ✔ (polls) | — | ✔ (polls) | ✔ (polls) | +2 endpoints +stamp |
| 7.5 timeout/backoff | — | — | ✔ (herd) | — | ✔ | +timeout +jitter |
| keepWarm | — | ✔ (pre-build) | — | — | — | +trigger +warm path |
| 7.6 A–E | ✔ (session) | — | ✔ | — | — | +session cache |
| pv=3 (A1) | — | — | — | ✔ (unmeasured) | — | +encoding, ×2 cache entries |
| Client prefetch | — | ✔ (overlap) | — | — | — | +prefetch +abort +role/pv gates |

The interaction inventory now: fresh cache + stale cache + stocklite cache + session
cache + ver stamp + localStorage payload + SW caches (3 kinds) + prefetch + single-
flight user-lock + script-lock + keepWarm + pv1/2/3 encodings × 3 variants + client
retry ladder + per-action timeouts. **This is a control system, and its mechanisms
already defeat each other in documented ways** (ver vs stale banner; prefetch vs
role; pv=3 vs invalidation — each has a CLAUDE.md warning born from a real bug), plus
the two newly-found interactions (2.10 chunk eviction defeats single-flight; 2.11
invalidation race defeats conflict detection). Verdict: **yes — complexity is now
itself a failure source.** Every additional compensating mechanism raises the chance
that two of them disagree silently.

---

## 5. keepWarm_ — reliability mechanism or optimization?

**Verdict: best-effort optimization. Production availability must not depend on it.**

1. **Guard scope:** it returns immediately if the fresh `full/pv2` cache exists — by
   design it only acts off-hours. During business hours, ~50 write paths clear the
   fresh cache far more often than the 5-minute tick; users' own GETs do the
   rebuilding. keepWarm is irrelevant exactly when bursts happen.
2. **Container warmth is per-instance:** one execution every 5 min keeps *one*
   instance warm. A 15-device burst makes Google spin **multiple** instances, each
   paying the full cold parse of a 17-k-line script. keepWarm cannot pre-warm a pool.
3. **No storage guarantee:** everything it writes goes into CacheService (2.10) —
   evictable at any time without notice.
4. **Race:** it has the same repopulation race as the doGet build path (2.11).
5. **It does nothing about egress:** even a 100 % HIT rate does not change N × MB
   through the download pipe (§10).

So "keepWarm not firing → fix keepWarm → solved" is **false** even if the trigger
turns out to be dead. Checking it is still worth 2 minutes (if dead, off-hours cold
opens are needlessly bad), but it cannot be the fix direction.

---

## 6. Cache + invalidation model

Trace: `WRITE → invalidateCache_() [clears fresh, all variants+encodings, + stocklite;
keeps stale] → next GET MISS → user-lock → buildFullData_ (~10 s) → stringify ×6 →
putCachedPayload_ + putStalePayload_ ×6 → release → concurrent GETs during the build
got STALE (if chunks intact) or queued 25 s (client aborts at 20 s)`.

- **Can one write cause N users to rebuild?** No — single-flight holds (**one**
  builder), *provided* the stale layer serves everyone else. When stale chunks are
  evicted (2.10), the answer degrades to "N users each wait 25 s and mostly abort."
- **Do multiple invalidations collapse into one rebuild?** Yes (next GET rebuilds
  once) — good.
- **Can invalidation happen while keepWarm/user build is running?** Yes → race 2.11,
  fresh cache repopulated with pre-write data + live timestamp. **Data-correctness
  defect.**
- **Is stale-while-revalidate used?** Yes, correctly designed (stale keeps original
  `lastModified`; flag + client auto-refetch). It is the *storage substrate* that is
  unreliable, not the pattern.
- **Is whole-payload invalidation on a stock change the wrong granularity?**
  **Yes — architecturally wrong.** A one-cell stock edit invalidates ~50 MB of cached
  material across 6 payload forms for all roles, because stock lives inside the
  monolith. The codebase itself already discovered the right granularity and built it
  for polls: `stocklite` (50× smaller, own 15 s cache, patched client-side) and
  `patchProductQtys` (client-side overlay after saves). **The correct architecture
  applies that same split to the boot payload: stock quantities become an overlay on
  a slow-moving catalog payload, and stock writes stop invalidating the catalog at
  all.** That single change would collapse the working-hours rebuild churn and shrink
  the race window of 2.11 to catalog edits (rare).

---

## 7. Payload architecture — why does the browser need this at startup?

Classification of the current bootstrap monolith (from `PAYLOAD_VARIANT_DROPS_`,
view usage in CLAUDE.md, and payload keys):

| Data | Startup shell needs it? | Change rate | Correct home |
|---|---|---|---|
| products: sku/name/imageUrl/price/cat | for first meaningful screen (categories/stock) | slow (catalog) | **bootstrap-lite**, cacheable for hours |
| products: qtyWH/qtyStore/checkedAt | yes, but *tiny* | fast | **stocklite overlay** (already exists!) |
| products: `mo` monthly history | only for "ควรสั่ง"/"มาแรง" badges | monthly | deferrable second request, cache 24 h |
| orders / shipments | orders tab, badges | medium | `action=orders` (already exists) + small badge counts |
| storage / locks | storage & count tabs | medium | per-view fetch |
| purchases, monthlyByCat, dailyByCat, transfers | owner analytics tabs only | slow | per-view fetch (pattern already exists: `getCustomerAnalytics`, `staffPerf`, `getQuotationSummary`, `recentIntake`, `recentTransfers` are all per-view endpoints already) |
| mtoJobs, stockCheckRequests, misc | specific tabs | medium | per-view or small |

**The striking fact: the codebase has already migrated *polls* and *new features* to
the per-domain model** (stocklite, ver, orders, recentTransfers, recentIntake,
customer analytics, staff perf, quotations, attendance — attendance even boots with
**no payload at all**, `NO_DATA_TABS`). Only the **legacy boot monolith** remains on
the old model — and it is where every incident lives.

**Recommendation: architecture (B) — lightweight shell + targeted APIs + cached
domain datasets — implemented as a hybrid migration** (§11 Option F): a
**bootstrap-lite** payload (catalog core + stock overlay + badge counts; estimated
hundreds of KB, not MB) that renders every high-traffic tab, with heavy/analytic
domains loaded per-view through the endpoint pattern that already exists and already
works. Not (A): the monolith is the proven failure. Not pure (B) big-bang: the repo's
own history (7.6 `be2c3aa` revert) shows big-bang rollouts here cause outages.

---

## 8. Auth / session

- Auth is **already decoupled** from data: separate `me` endpoint, optimistic
  `authPhase="ready"` from cached role, attendance fast path needs no payload.
- 7.6-D retired the per-request session sheet-scan (300 s cache + lastSeen throttle).
- Remaining `me` slowness (9.6 s observed) is **shared-infrastructure**: cold
  container parse + the same ~30-slot execution pool that payload requests and their
  retry storms are flooding. **Auth does not need its own fix; it needs the payload
  path to stop starving the pool.** They fail together today precisely because they
  share the pool — the only true decoupling is reducing payload executions (§7).
- One real coupling remains: boot **blocks** on payload when localStorage is empty
  (2.9). Session succeeds, then the user still stares at the loading pane. The shell
  should render on session + whatever cache exists, always.

---

## 9. Retry / timeout policy review

- **Is retry safe/idempotent?** For the payload GET, yes (read-only). But it is
  **not load-safe**: aborts don't cancel server executions, so each retry adds a full
  build/serve execution to a saturated pool.
- **Does client timeout cancel server work?** **No** (GAS limitation). This makes
  aggressive client budgets actively harmful under load.
- **Can a retry overlap the previous request?** The in-chain `fetchingRef` guard
  prevents overlap within the chain; but the **aborted server execution still runs**,
  so server-side overlap is guaranteed anyway.
- **Synchronized bursts?** Jitter exists (good), but budgets are fixed constants, so
  devices that started together abort together within ±base.
- **The 20 s retry < 25 s queue mismatch (2.2)** makes retries *structurally unable
  to succeed* in exactly the situation they exist for.

**Correct policy (recommendation only — DO NOT IMPLEMENT NOW):** one attempt with a
long budget (≥ 25 s queue + build + download; ~60 s) using the already-present
streamed first-byte progress for UX; at most **one** retry, jittered, and only on
`badjson`/network-error (not on slow-but-alive downloads); never hard-block the UI
when any cached data exists. Note the governance lock: these constants are pinned by
`tests/perf-observability.test.js` **pending burst evidence** — that gate stays.

---

## 10. Logical concurrency simulation (using actual constants)

Constants: build ≈ 10 s (Aug-05) · lock wait 25 s · client budgets 35/20/20/20 s ·
fresh TTL 180 s / stale TTL 1800 s · payload 4.2 MB (pv2 measured; pv=3 unmeasured) ·
egress ≈ 2.3 MB/s *shared* (Aug-05 measurement — single browser/single uplink;
CLAUDE.md itself flags that separate networks may be lighter, and gzip status is
unknown; treat as the store-WiFi worst case, which is the real deployment).

| Users | Cache state | doGets | Builds | Waiting | Retries | Expected user latency |
|---|---|---|---|---|---|---|
| 1 | HIT, warm container | 1 | 0 | 0 | 0 | 1–3 s ✅ |
| 1 | all-cold (off-hours, keepWarm dead) | 1–2 | 1 | 0 | 0–1 | cold parse 10–20 s + build 10 s + DL 2 s ≈ **22–32 s** — attempt-1 (35 s) marginal ⚠️ |
| 5 | fresh miss, stale intact | 5 | 1 | 0 (4 × STALE ~0.3 s) | 0 | builder ~12 s, others ~2–7 s ✅ (the design working) |
| 5 | fresh miss, **stale chunk evicted** | 5–9 | 1(+) | 4 × 25 s-wait | 4+ | waiters' first-byte ~11 s+DL; retries at 20 s budget mostly fail ⚠️ |
| 10 | as above + cold instances | 10–25 | 1–2 | many | 10+ | pool pressure begins; `me` slows for everyone |
| 20 | **even 100 % HIT** | 20 | 0 | 0 | grows | 20 × 4.2 MB = 84 MB ÷ 2.3 MB/s ≈ **37 s of shared egress** → late downloaders blow every budget → aborts → +N heavy retries → **cliff** ❌ |
| 20 | miss + stale evicted | 20→60+ (retries) | 1–3 | ~19 × 25 s slots held | 40+ | slots exhausted (~30 cap) → `me` queues (≈ the observed 9.6 s) → **exactly the observed outage** ❌ |

**The cliff is real and sits roughly at 10–20 simultaneous opens on shared uplink —
and the 20-user row shows the crucial result: the cliff exists even with perfect
caching.** No cache/warm-up/lock tuning removes it; only smaller payloads and fewer
boot requests do. (Caveat: if pv=3 + gzip already cut wire bytes ~5–10×, the cliff
moves substantially — which is precisely why Phase 0 must measure it before Phase 2
is sized.)

---

## 11. Candidate "final fix" architectures

| Option | Short-term | Long-term | Risk | Complexity | Handles 20+ users | GAS-quirk dependence | Fixes root cause? |
|---|---|---|---|---|---|---|---|
| **A** Repair keepWarm only | off-hours cold opens improve | none | none | trivial | ❌ (§5) | high (CacheService, triggers) | ❌ |
| **B** Tune timeout/retry/lock | removes amplification + un-survivable retries | none | low (constants, reversible) | trivial | ❌ alone | — | ❌ (amplifier only) |
| **C** Invalidation granularity + SWR hardening (stock writes stop nuking catalog cache) | large — ends working-hours rebuild churn; shrinks race 2.11 | medium | medium (touches conflict-detection semantics — the most dangerous ground in this codebase) | medium | partial (misses egress) | still CacheService-bound | **half** of it |
| **D** Bootstrap-lite payload + lazy per-view data | biggest single win: boot bytes ↓ ~10×, boot executions unchanged but cheap | compounds forever (payload stops growing with history) | medium-high (frontend data-flow; must be flag-gated like pv) | high | ✅ (egress math finally changes) | reduced | **the other half** |
| **E** Split read APIs by domain | per-view latency isolation | clean architecture | medium | medium | ✅ with D | reduced | with D, yes |
| **E′** (long-term) serve reads outside GAS — the Supabase mirror (`backupToSupabase_`, already scaffolded + flag-gated) or static JSON on Cloudflare | — | removes the ~30-slot ceiling and the best-effort cache entirely | high (consistency model, auth) | high | ✅✅ | near-zero | yes, but a business/platform decision — not this round |
| **F** Hybrid: B (safety) → C+D+E staged (destination) | immediate relief + real fix | durable | staged = bounded | staged | ✅ | decreasing | ✅ |

**Recommendation: OPTION F**, with the destination being §7's architecture (B):
lightweight shell + stock overlay + per-domain reads — built by *extending the
pattern the codebase has already proven eight times over* (stocklite/orders/
attendance/analytics endpoints), not by inventing a new one. E′ is the eventual
endgame if the store keeps growing, but it is a platform decision the owner must
make; nothing in Phases 0–3 below forecloses it.

---

## 12. FINAL VERDICT

**C — the current architecture has a fundamental bottleneck; change the
data/request architecture before any more patches.**

Grounds (all measured or code-confirmed, not vibes): the ping-vs-payload experiment
isolates size as the binding constraint; role-splitting's 8 % proved trimming within
the monolith is exhausted; the 20-user simulation shows a concurrency cliff **that
perfect caching does not remove**; the availability layer rests on storage with no
retention contract (2.10); the offline fallback that should degrade gracefully is
plausibly silently dead (2.9); and the invalidation model has a correctness race
(2.11). Four defects, one architectural decision.

Two honest caveats, so this verdict is not oversold:
- **This specific morning's trigger remains unproven** (deploy aggravation vs.
  ordinary burst vs. stale-chunk eviction). That affects *narrative*, not the
  verdict — every candidate trigger detonates the same architecture.
- **Phase 2's sizing depends on numbers not yet collected** (current pv=3 wire size,
  gzip status, burst `[perfB]` log, localStorage presence on a store device). The
  repo's own governance already demands these; the plan below starts there.

---

## 13. FINAL PLAN

### PHASE 0 — evidence still required (owner/GAS editor + one store device; read-only)
**WHAT:** ① `perfCheckTriggers` → keepWarm/trigger inventory. ② Collect `[perfB]` +
`[perf] doGet` lines for a burst window → `node scripts/perf-report.mjs` (metrics ①
concurrency, ⑦ HIT/STALE/MISS mix — directly tests 2.10). ③ `perfMeasureBuild` →
current build ms vs 9.8 s baseline. ④ Read one `[perf] doGet … ส่งจริง=…KB` line for
**pv=3 actual size** + check `Content-Encoding` on a real device (gzip question).
⑤ On one store iPhone: `localStorage.getItem("dmj_data")` present or null? +
`dmj_last_backend_error` + BootTrace `payload:ไบต์แรก`→`ครบ` split (server-wait vs
download — the decisive discriminator). **WHY:** every remaining fork (2.4, 2.9,
2.10, §10 caveat) closes with these five numbers. **RISK:** none (read-only).
**VERIFY:** numbers recorded into this doc. **ROLLBACK:** n/a.

### PHASE 1 — immediate safe mitigation (small, reversible, after Phase 0 numbers)
**WHAT (each its own deploy):** (a) if keepWarm dead → `setupKeepWarm()` (operational,
zero code); (b) align the 20 s/25 s mismatch — one constant on one side; (c) cap
payload retries at 2; (d) if 2.9 confirmed → make `saveToStorage` store the
**compact** (pre-expansion) payload or an essential subset so it fits iOS quota —
this alone converts future server slowness back into "degraded, usable" instead of
"outage". **WHY:** stops the amplifier and restores the designed offline floor
without touching the architecture. **RISK:** low; constants + storage format (format
change must keep `loadFromStorage`'s existing re-expansion net, which already
handles compact input). **VERIFY:** unit + browser suites; BootTrace on a store
device; `[perfB]` before/after. **ROLLBACK:** revert single commit / `disableKeepWarm()`.
Note: (b)/(c) require lifting the perf-observability meta-test lock **with** the
Phase-0 burst log in hand — that is the documented procedure, not a formality.

### PHASE 2 — architectural correction (the actual fix; flag-gated like `pv`)
**WHAT:** ① **bootstrap-lite** (`pv=4` or `action=boot`): catalog core + stock
overlay + badge counts — target < 500 KB; heavy keys (`mo`, purchases, monthlyByCat,
dailyByCat, transfers) move to deferred/per-view requests reusing the existing
endpoint pattern; ② **stop stock writes invalidating the catalog payload** — stock
lives in the stocklite-style overlay with its own 15 s cache (granularity fix, §6);
③ close race 2.11 by re-checking `dmj_last_write_ts` after build and declining to
repopulate fresh cache if a write landed mid-build (cheap versioning; CacheService
CAS not required for *decline-to-write*). **WHY:** removes the egress cliff, the
rebuild churn, and the correctness race at their shared root. **RISK:** highest of
the plan — mitigated by the `pv` gating pattern (old clients keep old behavior),
per-view fallbacks, and shipping ①/②/③ as separate deploys. **VERIFY:** deep-equal
expansion tests (the pv=3 template), browser suite per role, `[perfB]` mix, payload
size marks. **ROLLBACK:** clients stop sending the new `pv` → server serves today's
format; each server piece behind a Script-Property flag.

### PHASE 3 — verification
**WHAT:** repeat the Phase-0 loadtest (15 concurrent, same harness as Aug 5) against
the new boot path; compare: % HTML failures, median, worst; one week of `[perfB]`
under real morning bursts; confirm zero conflict-detection anomalies. **WHY:** the
Aug-5 loadtest is the only apples-to-apples benchmark this project has. **RISK:**
none. **VERIFY:** numbers into a `PHASE2-RESULTS.md`. **ROLLBACK:** n/a.

### PHASE 4 — production rollout
**WHAT:** default-on the new boot path (flag flip), single deploy, quiet hour, owner
notified; keep old path serving un-upgraded clients ~2 weeks (existing pv
convention), then remove. **WHY:** the 7.6 lesson — never bundle, never big-bang.
**RISK:** bounded by the flag. **VERIFY:** BootTrace from 2–3 store devices, day-one
`[perfB]`. **ROLLBACK:** flag off (no redeploy needed), CACHE_NAME roll **forward**
only (per service-worker rule).

---

## 14. Hard stop honored

Nothing was implemented, modified, tuned, repaired, cleared, deployed, or opened as a
PR in this session. The only artifact is this review document. The next session must
begin at **PHASE 0** — not at a fix.

---
---

# PHASE 0 — MEASURED EVIDENCE & FINAL ARCHITECTURE GATE

**Added 2026-08-26 (later same day). Review/measurement only — no code, config, cache,
trigger, timeout, retry, or deployment change was made.**

## 15. Method & its limits (read before using any number)

This environment has **no production access** (no GAS Executions, no Cloud Logging, no
store device). Rather than leave the key quantities UNKNOWN, the measurable ones were
measured **locally by executing the real production functions** — `packProductsColumnar_`
and `shapeColumnarPayload_` `eval`-ed out of `appsscript_complete.gs`, and
`expandProductsColumnar` / `expandMonthlyCompact` / `enrichData` `eval`-ed out of
`app.jsx` (plus the real `detectColor` / `mtoBase` from `tests/helpers.js`). This is the
repo's own established test convention (`auth.test.js` et al.: eval real source, never
copy).

They were run against a **corpus calibrated to the single known measured anchor**:
5,876 products × 30 month-columns, tuned until pv=2 output landed at **4,216 KB chars /
4,537 KB UTF-8** against the Aug-05 production measurement of **4,576 KB** — i.e. within
**~8 %** of the real payload.

**What this makes each number worth:**

| Kind | Trust |
|---|---|
| **Transformation ratios** (pv2→pv3, wire→localStorage, gzip) | **MEASURED** — real code, real algorithms; ratios are essentially independent of my synthetic values |
| **Absolute byte counts** | **CALIBRATED ESTIMATE, ±~8 %** — anchored to the one real measurement |
| **Chunk counts** | **MEASURED** — deterministic arithmetic on `_CACHE_CHUNK_LEN` |
| **Whether Google actually gzips the wire** | **STILL UNKNOWN** — a compressibility measurement is not a transport measurement (§19) |
| **Build ms, keepWarm status, burst telemetry** | **STILL UNKNOWN** — production-only (§19) |

Reproduce: scripts in the session scratchpad (`measure.cjs` / `measure2.cjs` /
`measure3.cjs`); they read the repo read-only.

---

## 16. Measurement results

### 16.1 Payload size — request §1 (**answers the UNSUPPORTED claim 2.4**)

| Form | Raw chars | UTF-8 | gzip (zlib-6) | CacheService chunks |
|---|---|---|---|---|
| pv=2 (pre-A1 format, still served to old clients) | 4,216 KB | 4,537 KB | **574 KB** | **144** |
| **pv=3 (what every current client requests)** | **2,120 KB** | **2,442 KB** | **455 KB** | **73** |
| pv3 ÷ pv2 | **0.503** | | | |

- **CONFIRMED: pv=3 halves the payload (−49.7 %).** Phase A1 delivered real value that
  had never been quantified.
- **CORRECTION to the previous forensic report:** its "pv=3 ≈ 3.2 MB" was not merely
  unsupported, it was **too high**. Today's payload is ≈ **2.1 MB raw / 0.45 MB gzipped**,
  not 3.2 MB and not the 4.2 MB both earlier documents reasoned with.
- **gzip compressibility is extreme (≈ 5.4×)** because columnar rows repeat structure.
  Whether that saving is *realised on the wire* is §19-Q1 — the single highest-leverage
  open question left.

### 16.2 Build performance — request §2

**NOT MEASURABLE HERE.** `buildFullData_` is Sheets-bound; no Sheets access exists in
this environment. The only trustworthy figure remains **9,807 ms (Aug-05, production
`perfMeasureBuild`)**, 70 % sheet I/O. Sheets have grown ~3 weeks since (audit log grows
per action; attendance ~20 k rows/yr), so **the true current value is ≥ 9.8 s and
UNKNOWN**. Re-running `perfMeasureBuild` is §19-Q3. **No build number was invented.**

### 16.3 Cache reliability — request §3

| Property | Value | Source |
|---|---|---|
| Chunk size | 30,000 chars (`_CACHE_CHUNK_LEN`) | code |
| Chunks per pv=3 payload | **73** | measured |
| Fresh TTL / stale TTL | **180 s** / **1800 s** | code |
| Key structure | `dmj_payload_{variant}[_v1\|_v3]_{i}` + `_n`, `_n_ts`; stale `dmj_stale_{variant}_{i}` | code |
| Entries written per full build | **≈ 1,300** chunk entries (3 variants × 2 encodings × fresh+stale) | measured |
| Chunk independently evictable? | **YES** — each is its own CacheService key | code |
| One missing chunk ⇒ whole payload MISS? | **YES** — `_readChunked_` returns `{str:null}` on any `part == null` | code (appsscript:13640) |

> **Answer to the §3 question: NO. The system cannot guarantee the complete payload
> remains available.** ~1,300 independently-evictable best-effort entries, where losing
> any **one** of 73 silently invalidates an entire layer. This is a **structural
> reliability limitation**, CONFIRMED from code — not a bug to patch. When the stale
> layer dies this way, requests fall to the 25 s queue, where the 20 s client retry
> budget (2.2) guarantees failure. *Not redesigned here, per instruction.*
>
> Whether eviction has actually been observed: **UNKNOWN** — needs `[perfB]` metric ⑦
> (STALE/MISS mix), §19-Q4.

### 16.4 keepWarm — request §4

| Question | Answer | Class |
|---|---|---|
| Warms the same pv=3 keys clients request? | **YES** — `payloadCacheVariant_(v,3)` written for all variants (appsscript:13737–13740) | CONFIRMED (code) |
| Guard key | fresh `full`/enc-2 — skips entirely when warm | CONFIRMED (code) |
| Runs after invalidation? | **YES** — invalidation empties fresh, so the next 5-min tick rebuilds | CONFIRMED (code) |
| Can it overlap invalidation? | **YES** — it takes the *build* lock; `invalidateCache_` takes **no lock**, so it carries the §17 race identically | CONFIRMED (code) |
| Trigger exists / exactly one / firing / last success? | **UNKNOWN** — production only | UNKNOWN (§19-Q2) |

> **Self-correction to §5 of this document:** §5 claimed keepWarm "only acts off-hours."
> That is **wrong**. Because ~50 write paths empty the fresh cache during business hours,
> the 5-minute tick frequently *does* find an empty cache and build. It is more active
> than §5 stated. The §5 *conclusion* nevertheless stands — it still cannot pre-warm a
> multi-instance pool, cannot guarantee cache retention (16.3), and does nothing about
> egress — so it remains **an optimization, not a reliability mechanism**.

### 16.5 localStorage safety net — request §5 ⚠️ **THE DECISIVE FINDING**

Path: `fetchFromSheet` → `enrichData(d)` → `setData` → **`saveToStorage(enriched,"sheet")`**
→ `localStorage.setItem("dmj_dashboard_data_v1", JSON.stringify(d))`, wrapped in
`try/catch` whose entire failure handling is `console.warn("Could not persist data:")`
(app.jsx:949–956).

Measured by running the **real `enrichData`**:

| Quantity | Value |
|---|---|
| pv=3 wire received | 2,120 KB chars |
| **Actually written to localStorage** | **12,018,128 chars = 11.90 MB UTF-8** |
| Expansion vs wire | **5.54×** |
| — of which `products[].monthly` (dense re-expansion of compact `mo`) | **5,855 KB** |
| — of which `mtoGroups` (**re-serialised duplicate product objects**, 415 groups) | **1,705 KB** |
| **iOS/Safari quota accounting (UTF-16 ≈ 2 B/char)** | **22.92 MB** |
| Safari per-origin quota | **≈ 5 MB** |
| Verdict | **EXCEEDS BY ≈ 4.6×** |

> **CONFIRMED (measured, real code): the offline safety net is dead on every iOS device
> holding the real catalog.** `setItem` throws `QuotaExceededError`, the throw is
> swallowed with a `console.warn`, and **no data is ever persisted**. Therefore
> `loadFromStorage()` returns `null` on every boot, `data === null`, and the blocking
> pane renders — so **any** server slowness becomes "cannot enter the app" rather than
> "stale data, still usable."
>
> **This is the mechanism that converts server latency into an outage, and it explains
> the reported symptom better than any cold-start/stampede story.** It also explains a
> pattern worth confirming with the owner: desktop Chrome has a far larger per-origin
> quota, so **the owner's computer would keep working while every phone fails** — the
> classic signature of this bug.
>
> Note the compounding design smell: the wire format was deliberately compacted (`mo`,
> columnar) and then **re-inflated before storage**, so the client stores 5.5× what it
> received. `mtoGroups` is pure derived duplication that never needed persisting.

Classification: **CONFIRMED as a mechanism** (arithmetic + real code). **Confirming it
is live on the store's specific devices** needs the one-line check in §19-Q5.

---

## 17. Correctness gate — the invalidation race (request §6)

Traced against current `master`:

```
T0  doGet MISS → acquireBuildLock_ (getUserLock) → buildFullData_ begins
      └ reads sheets → in-memory snapshot S0
T1  doPost write commits (getScriptLock — a DIFFERENT lock; no mutual exclusion)
T2  invalidateCache_() → clears fresh chunks; sets dmj_last_write_ts = T2
      └ takes NO lock, and does not signal in-flight builds
T3  build (started T0, still holding S0) completes ~10 s later
T4  putCachedPayload_(S0) — UNCONDITIONAL. No version check, no CAS, no re-read of
      dmj_last_write_ts. (appsscript:3174–3195; verified: no guard exists)
T5  next GET → HIT → serveCached() rewrites "lastModified" to a LIVE
      getSheetLastModified_() = T2  (appsscript:3110)
```

Result: for up to **`_CACHE_TTL_SEC` = 180 s**, clients receive **pre-write data (S0)
stamped with a post-write timestamp (T2)**. The client stores that as
`window._dataLoadedAt = T2`; on its next write `shouldRejectConflict_(T2, T2)` sees
client-time ≥ sheet-time and **permits the write** — conflict detection is bypassed and
a colleague's committed change can be **silently overwritten**.

| Aspect | Classification |
|---|---|
| Race is possible in current code (no guard exists on the fresh-cache write path) | **CONFIRMED** |
| Existing version/`lastModified` logic prevents stale serving | **NO — it is the amplifier.** The stale path deliberately preserves the old `lastModified` (documented, correct); the **fresh** path deliberately overwrites it with a live value, which is safe for genuinely-fresh data and unsafe for this race |
| `keepWarm_` carries the same race | **CONFIRMED** (16.4) |
| Window size | build duration ≈ **10 s**, exposure ≈ **≤ 180 s** per occurrence |
| Has it actually occurred in production? | **UNKNOWN** — would appear as unexplained "my edit disappeared" reports, not as an error |

> **Gate result: this is a genuine silent-data-loss path, CONFIRMED as reachable.** It
> is precisely the failure class this codebase treats as most serious ("แย่กว่าเห็นข้อมูลช้า").
> It cannot be fully closed inside the current model because **CacheService offers no
> compare-and-set**; the cheap 90 % mitigation (*re-read `dmj_last_write_ts` after the
> build and decline to repopulate the fresh layer if it moved*) is specified in the
> blueprint. **Not fixed here, per instruction.**

---

## 18. Concurrency model (request §7) — ⚠️ SIMULATION, NOT MEASUREMENT

Inputs: measured payload 2.44 MB UTF-8 / 0.455 MB gzip (16.1); build 9.8 s (Aug-05,
lower bound); `_BUILD_LOCK_WAIT_MS` 25 s; client budgets 35/20/20/20 s, ≤4 attempts;
GAS ≈ 30 concurrent executions per identity (`executeAs: USER_DEPLOYING`); shared
store-WiFi uplink ≈ 2.3 MB/s (Aug-05 figure — itself inferred, treat as worst case).

**Egress alone** (the number that decides whether a cliff exists at all):

| Users | gzip **ON** | gzip **OFF** | pv=2 (pre-A1, for reference) |
|---|---|---|---|
| 5 | 2.3 MB → **~1 s** | 12.2 MB → ~5 s | 22.7 MB → ~10 s |
| 10 | 4.6 MB → **~2 s** | 24.4 MB → ~11 s | 45 MB → ~20 s |
| **20** | **9.1 MB → ~4 s** | **48.8 MB → ~21 s** | 91 MB → ~39 s |

**Scenario matrix** (users × cache state), worst-case user-visible latency:

| Users | A · 100 % HIT | B · cold cache | C · stale chunk lost (16.3) | D · concurrent invalidation | E · + retry amplification |
|---|---|---|---|---|---|
| 1 | 1–3 s ✅ | cold parse + build ≈ 20–30 s ⚠️ (attempt-1 35 s marginal) | same as B | rebuild ≈ 12 s ✅ | n/a |
| 5 | ~1–5 s ✅ | 1 builds (~12 s), 4 get STALE ~0.3 s ✅ | 4 × 25 s queue → **abort at 20 s** ❌ | churns rebuild each write ⚠️ | 5→~15 executions |
| 10 | ~2–6 s ✅ | as above + multi-instance cold parse ⚠️ | 9 queued; slots pressured ❌ | near-continuous rebuild ⚠️ | 10→~30 executions — **slot ceiling reached** |
| **20** | **gzip ON ~4–8 s ✅ / gzip OFF ~21 s+ ❌** | ❌ | ❌ | ❌ | 20→**up to 80 executions** vs ~30 slots → `me` queues (≈ the observed 9.6 s) → ❌ |

**Where the cliff actually is — corrected:**

1. **The egress cliff is CONDITIONAL ON GZIP.** With gzip on, 20 users cost ~4 s of
   bandwidth and there is **no egress cliff at all**. This **overturns §10 of this
   document**, which asserted a cliff "even with 100 % cache hits" using the stale
   4.2 MB figure. That assertion is **withdrawn pending §19-Q1**.
2. **The execution-slot cliff is unconditional and sits at ~10 users** once retries
   engage: 4 heavy GETs per device against ~30 slots, with aborted clients leaving
   server executions running (CONFIRMED, §8 of this document).
3. **The availability cliff is unconditional and sits at 1 user**, because localStorage
   is dead (16.5): with no client-side fallback, *any* server delay past 35 s is a
   hard blocking failure for a single user, with no degraded mode.

---

## 19. Remaining UNKNOWNs — exactly 5 production checks

**Q1 (highest leverage) — is the wire gzipped?** Open the app on any device →
DevTools/Web Inspector → Network → the `/exec` payload row → compare **Transferred**
vs **Size**. Transferred ≈ 455 KB ⇒ gzip ON (no egress cliff; Phase 2 is justified by
storage + build + invalidation only). Transferred ≈ 2.4 MB ⇒ gzip OFF (egress cliff is
real; Phase 2 gains a second independent justification).
*Note: BootTrace's `payload:ครบ (KB)` cannot answer this — it counts decompressed bytes.*

**Q2 — keepWarm status.** GAS editor → run `perfCheckTriggers` → is `keepWarm_` present,
exactly once, and firing?

**Q3 — current build cost.** GAS editor → run `perfMeasureBuild` → compare to 9,807 ms.

**Q4 — burst telemetry.** Executions/Cloud Logging → filter `[perfB]` + `[perf] doGet`
over a morning burst → `node scripts/perf-report.mjs <file>` → metric ① concurrency peak,
metric ⑦ HIT/STALE/MISS mix (**directly tests the 16.3 eviction hypothesis**).

**Q5 — the one browser command** (§5's "one exact instruction"; on a *store iPhone*,
Safari → Advanced → Web Inspector, or any phone's browser console on the live site):

```js
(function(){var v=localStorage.getItem('dmj_dashboard_data_v1');
console.log('stored:', v?((v.length*2/1048576).toFixed(2)+' MB (UTF-16)'):'*** NULL — safety net dead ***');
try{localStorage.setItem('__dmj_probe','x'.repeat(1024*512));localStorage.removeItem('__dmj_probe');console.log('512KB probe: OK');}
catch(e){console.log('512KB probe FAILED:',e.name);}
console.log('last backend error:', localStorage.getItem('dmj_last_backend_error'));})()
```

Read-only apart from a 512 KB probe key it deletes immediately. **`stored: NULL`
confirms 16.5 is live in production** — expected result given the arithmetic.

---

## 20. FINAL ARCHITECTURE GATE

| Option | Performance | Reliability | Correctness | 20-user concurrency | Complexity | Migration risk | Rollback | Fixes root cause? |
|---|---|---|---|---|---|---|---|---|
| **A** keepWarm repair | off-hours only | ✗ (16.3/16.4) | ✗ | ✗ | trivial | none | trivial | ❌ |
| **B** timeout/retry tuning | removes amplifier | partial | ✗ | partial (slot cliff) | trivial | low | trivial | ❌ |
| **C** cache/invalidation redesign | ends rebuild churn | partial | **✅ closes §17** | partial | medium | medium-high (touches conflict semantics) | medium | half |
| **D** bootstrap-lite | raw −41 %, gzip −61 %, **storage 22.9→2.0 MB** | **✅ restores offline net durably** | — | ✅ | high | medium (flag-gated like `pv`) | flag-off | **the other half** |
| **E** domain APIs | per-view isolation | ✅ | — | ✅ | medium | low (pattern already proven ×8) | per-endpoint | with D |
| **F** hybrid B→D/E→C | ✅ | ✅ | ✅ | ✅ | staged | bounded per phase | per phase | **✅** |

### VERDICT: **C — architecture change** (delivered via option **F**, staged)

**Upheld, but on substantially revised grounds.** Three corrections were forced by
measurement, and I record them explicitly because they change *why* — not *whether* —
the architecture must change:

1. **The payload-size argument is weaker than §1–§14 claimed.** pv=3 already halved the
   payload; bootstrap-lite adds ~1.7× raw / ~2.5× gzip, **not the "~10×" §13 asserted.**
   That estimate is **withdrawn**.
2. **The "cliff even at 100 % cache HIT" claim (§10) is withdrawn**, pending Q1 — with
   gzip on, there is no egress cliff at 20 users.
3. **The localStorage finding is far stronger than hypothesised** — not "plausibly
   dead" but **22.92 MB against a ~5 MB quota, i.e. dead by a factor of 4.6**, measured
   through the real `enrichData`.

**Why C rather than B (targeted multi-fix), given #1 and #2:** the deciding factor is
**unbounded growth**, exactly as `PLAN-PHASE8-PAYLOAD.md` warned on Aug 5
("ยิ่งนานยิ่งแย่เอง"). Even the *compact* wire form is **4.14 MB in iOS UTF-16 accounting —
already MARGINAL against a 5 MB quota today**, and it grows on two axes simultaneously
(product count, and `mo` gaining a column every month). A targeted Phase-1 storage fix
buys months, not years; **bootstrap-lite lands at 2.04 MB and stays there** because the
history and analytics that drive the growth move off the boot path entirely. Add the
CONFIRMED structural items — an availability layer on ~1,300 evictable best-effort keys
(16.3) and a silent-overwrite race with no CAS available (§17) — and the conclusion is
that the monolith, not any single constant, is the thing to retire.

### Target architecture (as requested; NOT implemented)

```
APP SHELL                    renders on session alone (attendance/home already do this)
   ↓
BOOTSTRAP-LITE               catalog core + stock overlay + badge counts
                             ~1.0 MB raw / ~145 KB gzip / 2.04 MB stored (fits iOS)
   ↓
DOMAIN DATA (on demand)      stock · orders · attendance · analytics · quotations · storage · MTO
                             each an endpoint of the kind this repo already ships ×8
```

---

## 21. IMPLEMENTATION BLUEPRINT (request §9) — **do not start in this task**

Governing rule throughout: **extend the proven in-repo patterns** (`stocklite`, `orders`,
`recentTransfers`, `recentIntake`, `getCustomerAnalytics`, `staffPerf`, attendance
`NO_DATA_TABS`, and the `pv` version-gate) — invent no new framework. One phase per
deploy; never bundle (the `be2c3aa` lesson).

### Phase 1 — safe mitigation *(highest value per unit of risk; would likely have prevented today's outage)*
- **Files/functions:** `app.jsx` — `saveToStorage` / `loadFromStorage` (949, 874);
  optionally `fetchFromSheet` timeout constant (1249); `appsscript_complete.gs`
  `_BUILD_LOCK_WAIT_MS` (13452).
- **Change:** persist the **compact wire payload** (pre-`enrichData`) instead of the
  enriched one, and **never persist `mtoGroups`** (pure derived duplication). Re-enrich
  on load — `loadFromStorage` *already* calls `expandProductsColumnar` +
  `expandMonthlyCompact` as a safety net, so the compact form is already a supported
  input. Surface quota failure instead of swallowing it. Separately, align the
  20 s/25 s mismatch and cap retries at 2.
- **Data contract:** unchanged on the wire; only the local storage format changes.
- **Migration:** on first load an old (enriched) blob still parses — expansion functions
  are no-ops on already-expanded data. No key rename needed; if renamed, old key is
  simply ignored and refetched once.
- **Tests:** unit — round-trip compact→`loadFromStorage`→deep-equal vs today's enriched
  object; a size guard asserting stored bytes < 3 MB for a 6 k-product corpus (the
  measurement in 16.5 becomes a regression test). Browser — `?nodata=1` path still works.
- **Rollback:** single-commit revert. **Verify:** Q5 command returns a non-null size on
  a store iPhone; boot on a warm device no longer hits the network-blocking pane.
- **Governance note:** the retry/lock constants are pinned by
  `tests/perf-observability.test.js` **pending burst evidence (Q4)** — that gate must be
  satisfied first, or ship only the storage half of Phase 1.

### Phase 2 — bootstrap-lite
- **Files/functions:** `.gs` — new `shapeBootstrapLite_` beside `shapeColumnarPayload_`,
  new `payloadEncodingForRequest_` value (`pv=4`) and matching `payloadCacheVariant_`
  suffix, plus `PAYLOAD_VARIANTS_` cache/invalidate coverage (13764 — **must** add the
  new enc, per the existing meta-test in `tests/columnar-payload.test.js`).
  `app.jsx` — request `pv=4`; views needing history/analytics fetch on demand.
- **Data contract:** `{cols,rows}` over the shell key set (16.1/§F) + `monthLabels` +
  `totals`; `mo`, `purchases`, `monthlyByCat`, `dailyByCat`, `transfers` **removed** from
  boot.
- **Migration/compat:** the **`pv` gate is the proven mechanism** — clients that do not
  send `pv=4` keep receiving today's pv=3 byte-for-byte. Old cached `.jsx` is therefore
  safe (the exact hazard `pv` was invented for).
- **Tests:** deep-equal expansion tests (the pv=3 template); per-role browser suite;
  meta-test that every new enc appears in `invalidateCache_`.
- **Rollback:** clients stop sending `pv=4` → instant revert to current behaviour, no
  redeploy. **Verify:** `[perf] doGet ส่งจริง=…KB` ≈ 1 MB; BootTrace first-byte→complete
  shrinks; Q5 shows ~2 MB stored.

### Phase 3 — domain reads
- Move `mo`/history, purchases, analytics behind endpoints modelled on
  `getCustomerAnalytics` / `staffPerf`; views fetch on mount with their own short cache.
- **Rollback:** per-endpoint; views fall back to boot payload while both exist.
- **Verify:** per-view latency; boot executions unchanged but cheap.

### Phase 4 — cache/invalidation redesign *(closes §17)*
- `invalidateCache_` becomes **granularity-aware**: stock writes invalidate only the
  stock overlay (the `stocklite` precedent), not the catalog.
- **Close the race:** re-read `dmj_last_write_ts` after `buildFullData_`; **decline** to
  repopulate the *fresh* layer if it moved (stale layer may still be written — it keeps
  its original `lastModified`, which is safe by design). This needs no CAS, only a
  compare-and-skip.
- **Tests:** simulated interleave (write during build) asserting the fresh layer is not
  poisoned; existing conflict-detection suite must stay green.
- **Rollback:** single constant/flag. **Verify:** `[perfB]` metric ⑦ MISS rate drops
  during counting sessions; no "my edit vanished" reports.

### Phase 5 — retire the monolith
- Remove `pv=1`/`pv=2` paths and `expandMonthlyForLegacy_` once telemetry shows no client
  requests them (the repo's own "1–2 weeks after deploy" convention).
- **Verify:** payload-size regression test; full suite; one clean burst window.

---

## 22. Stop condition

| Required | Status |
|---|---|
| 1. Five measurements collected | ✅ 3 measured locally (16.1/16.3/16.5) · 2 production-only, with exact commands (§19) |
| 2. Correctness race classified | ✅ **CONFIRMED reachable**; occurrence UNKNOWN (§17) |
| 3. Concurrency cliff quantified | ✅ three cliffs, separated; egress cliff explicitly conditional on Q1 (§18) |
| 4. Architecture option selected | ✅ **C**, via staged **F** (§20) |
| 5. Implementation blueprint | ✅ Phases 1–5 (§21) |
| 6. No code changed | ✅ only this document |

**STOP — implementation not started. Next session begins at §19 (Q1–Q5), then Phase 1.**
