# PR 1 independent review corrections — 22 October 2026

Scope: local branch `codex/perf-lazy-babel-prefetch`. Reviewed commit
`eb5f2cd9de5d5c56ca8c45e84c4ceb5928a0924b`; cumulative base
`82ded3efb388f4a4ea12596bc35e0d325da5ff14`. At start the branch/worktree were clean
and HEAD matched the reviewed commit. GitHub master was read again on 21 and 22 October:
both returned the base above. The only resumed work was our diagnostic test instrumentation.
No backend, database, business data, auth rules, staff UI/actions or deployment settings are changed.
No push, merge, deployment, PR 2–4, or new remote PR is performed.

## R1 — validate before using or caching boot assets

`service-worker.js` used a case-sensitive HTML MIME check only for tagged URLs;
legacy URLs accepted any successful response. Neither path validated HTML bodies or
existing entries, and the legacy cache write was detached from `waitUntil`.

The HTML loader and SW now apply the same MIME/body policy (tested by evaluating
both real functions). JS/JSX require JavaScript/ECMAScript/JSX MIME, irrespective of
case/charset. HTML bodies are rejected even with a JS MIME. Build manifests require
JSON MIME, parseable object bodies and a boolean `enabled` marker. Invalid app
responses return empty 503 to the caller and cannot enter the app cache. API/data
exclusions are unchanged. Existing poisoned exact entries in current/retained app
caches are deleted individually; compiled/vendor caches and unrelated entries survive.
Validation, selective deletion and cache writes are followed by `waitUntil`. Valid network
bytes still reach the caller when cache opening/writing is unavailable (covered by unit test).

Unit tests execute the real SW fetch handler. Browser tests assert returned status/body,
inspect bytes stored in real CacheStorage, seed poisoned JS/JSX/manifests under tagged
and untagged URLs, and test their rejection offline. A delayed-write unit test verifies
the event lifetime stays pending until the write finishes.

## R2 — bind HTML, manifest, output and fallback source

The reviewed loader accepted any safe-looking `.js` output including legacy aliases,
and treated an incompatible manifest like an absent build. Source identity was checked
only when a compiled build was selected.

The existing build script now stamps the HTML with a deterministic build ID and seven
source hashes, and emits the same release/build ID in `dist/manifest.json`. No additional
runtime request or build system is introduced. The loader requires matching identities,
source hashes, and the exact `<source>.<srcHash>.js` filename. A present incompatible
manifest stops before app prefetch/injection; it never bypasses the check via fallback.
An absent/unavailable build (including SPA HTML/404) or legacy `enabled:false` marker
can still use source fallback, but every source must match the hashes embedded in HTML.
The compiled cache is keyed by verified source identity rather than a possibly reused ETag.
Aliases remain byte-for-byte equal to all seven hashed bundles for old HTML.

Build must run after changing JSX, including source-only releases: commit the updated
HTML identity. A source mismatch or browser without secure-context Web Crypto shows
existing boot recovery rather than mixing releases. Hashes identify versions; they are
not a cryptographic signature or authorization check. Query `dmj-boot` remains a cache
namespace only, never proof of response identity.

## R3 — competing registration URLs and lifecycle evidence

The original isolated scenario passed twice and the original full startup suite passed
15/15 before corrections here. Later expanded full runs **did reproduce** the independent
symptom: the unversioned worker stayed active/controlling, while a new version-tagged
worker remained installed/waiting. It occurred even after removing the extra test
`registration.update()`, so that call alone was not the cause. Baseline-worker diagnostic
observers found no pending `waitUntil` or response-body promises at a captured failure.
A guarded post-install activation message was tried, failed to eliminate the symptom,
and was **removed**. Its forced-waiting fixture and all experimental outcomes are retained
as evidence; none is substituted for final-source results.

The confirmed design conflict is that old HTML registers `/service-worker.js`, while the
reviewed HTML registers `/service-worker.js?dmj-boot=...` for the same scope. Old/new pages
and the test's explicit update job can select different script URLs during one upgrade.
The correction keeps `/service-worker.js` stable and sets `updateViaCache: "none"` so
freshness is checked from the script bytes. Versioned app asset URLs remain unchanged.
This change alone did not eliminate the symptom: stable-startup12-system still failed
one lifecycle round (26/27). The exact browser-engine scheduling remains unconfirmed;
no Chromium defect or sole test-only cause is claimed. The same full suite is compared
before/after this change, with every failure preserved.

Install awaits `skipWaiting()` after precaching; activation follows cleanup and
`clients.claim()` within `waitUntil`. A read-only message returns the actual worker's
cache version. The test observes and awaits the page's own registration, ensures both
baseline registrations are activated before changing the served release, and does not
enqueue `registration.update()`. Another race was found in the new identity observer:
it sent identity messages to v61 (which has no handler) while its replacement was still
installing/waiting. The observer now waits for registration to settle before sending
any identity message; this avoids restarting/holding the legacy worker during activation.
The exact browser-internal effect of that unsupported message remains unconfirmed.
It requires actual matching active/controller versions
on both tabs, activation, controller change with a draft preserved, and the same actual
versions after reloading one tab offline. The worker script URL is not used as proof of
release identity. No reload of the other tab or storage clearing is introduced.

The first expanded test exposed two additional test errors: Playwright 1.47.0's
`waitForFunction` treats an async predicate's Promise as truthy (confirmed in its installed
`frames.js`), and context offline emulation did not reliably cut SW network responses.
The test now awaits a lifecycle-event Promise and makes the mock server reject connections
as well. Timeouts are unchanged; no skip, weaker assertion or retry-until-pass is added.
Three normal lifecycle rounds run consecutively with a fixed count in every final suite.
The draft is a test DOM input plus test localStorage value, not a real business write.

System Chromium 154 is not the version bundled with Playwright 1.47. Tests were also run
with its matching Chromium 129. The tagged-URL experiment could fail there too, ruling
out browser mismatch as a complete explanation. Final-source outcomes for both versions
are listed separately. iOS/Android installed-PWA behavior remains untested.

## R4 — real HEAD bundles behind baseline HTML

Fixture selection is split into `htmlRevision` and `assetRevision`. The legacy test
serves baseline HTML with current build assets; it collects all seven alias responses
and compares their bytes to the corresponding current hashed bundles. The old compiled
`beforeAppJs` is used only by explicit baseline-asset scenarios, not legacy compatibility.

## Validation and limitations

Runtime: Node **20.20.2**, Chromium **129.0.6668.29** and system Chromium
**154.0.8037.57**, Playwright **1.47.0**, local mock API
and locally served vendor libraries. Full output, lifecycle traces, source identities,
all PWA outcomes and final HEAD association are provided in the review archive's
`evidence/`, `TEST-RESULTS.json` and `REVIEW-METADATA.json`.

Every completed PWA run is listed here; FAIL results are not discarded. Intermediate
runs include diagnostic observers and rejected code experiments. The review archive's
TEST-RESULTS.json associates final-source tests with the new local HEAD.

| Run / captured log | Startup result | PWA outcomes in order |
| --- | --- | --- |
| pre-fix-run1 | 1/1 isolated | PASS |
| pre-fix-run2 | 1/1 isolated | PASS |
| pre-fix-full | 15/15 | PASS |
| post-fix-startup1 | 21/23 | PASS, PASS, FAIL; SW offline assertion also failed |
| post-fix-startup2 | 23/23 | PASS, PASS, PASS |
| post-fix-startup3 | 26/27 | FAIL, PASS, PASS |
| diagnostic-startup4 | 3/3 isolated | PASS, PASS, PASS |
| diagnostic-startup5 | 27/27 | PASS, PASS, PASS |
| diagnostic-startup6-cpu4 | 3/3 isolated, CPU 4x | PASS, PASS, PASS |
| final-startup7 (rejected activation-message experiment) | 27/28 | FAIL, PASS, PASS, forced waiting PASS |
| matched-startup8 (same experiment, Chromium 129) | 27/28 | PASS, PASS, PASS, forced waiting FAIL |
| pending-startup9 (baseline waitUntil observer) | 27/28 | PASS, FAIL, PASS, forced waiting PASS |
| body-startup10 (baseline body observer) | 26/28 | FAIL, PASS, FAIL, forced waiting PASS |
| stable-startup11 (stable URL, Chromium 129) | 27/27 | PASS, PASS, PASS |
| stable-startup12-system (before observer settling fix) | 26/27 | PASS, PASS, FAIL |
| settled-startup13-system (settled observer, Chromium 154) | 27/27 | PASS, PASS, PASS |

The later system-browser and committed-HEAD runs are recorded in TEST-RESULTS.json and
retained raw logs. Attempts interrupted before execution/without test output are recorded
as unmeasured interruptions, not PASS/FAIL. The independent review's 14/15 remains part
of the baseline evidence; a local passing run never cancels it.

No new PageSpeed/performance score or save-action timing is claimed. Existing lab and
production measurements in the October 20 report are historical and belong to the
reviewed PR1 work. Normal startup/fallback downloads and login/PIN/LINE callbacks are
regression assertions, not a new production speed benchmark. The fixes add body checks
in SW and hash verification on source fallback; their cost on staff devices is unmeasured.

Cloudflare production branch, preview rules, build command, output directory and current
production deployment identity: **ยังไม่ยืนยัน** in this correction run; no callable
Cloudflare settings reader is available. GitHub workflow/check status does not establish
push safety. No settings are changed and no push is attempted.

## Rollback and integration

Local review can compare/apply the binary diffs from either reviewed HEAD or base; both
exact source snapshots are included. Reverting a released correction must keep a new,
increasing HTML/SW release number (greater than v66), rebuild all seven outputs, retain
legacy aliases and test the upgrade/offline path. Do not simply revert the cache number.
HTML and SW are v66 here; when later integrating PR #122 (v64), retain the higher release
number and regenerate HTML/build identity. Independent review should repeat R1–R4 on the
new snapshot before any merge/release decision. PR 2–4 remain outside this work.
