# F-07 — Authorization Review + Flag-Gated Rollout (2026-08-25)

Caller/dependency analysis for F-07 (analytics/quotation reads exposing customer PII with token-only auth), the
rollout decision, and the implemented flag-gated fix. Evidence on `origin/master` `b7e5f1e` + branch
`claude/security-debugorders-authz`. Tags: CONFIRMED / STRONG EVIDENCE / HYPOTHESIS / UNKNOWN.

---

## 1. Endpoints in scope (CONFIRMED)

| Endpoint (doGet action) | Data exposed | Owning view / role |
|---|---|---|
| `getCustomerAnalytics` | customer purchase totals per month, top customers | CustomerView → **owner/dev** (customers tab) |
| `getQuotationSummary` | all quotations, amounts, sales reps | QuoteFollowupView → **owner/dev + saler/storedevice** |
| `getPendingQuotations` | **customer `phone`/`email`** + pipeline | (none — see §3) |
| `getQuotationForPrint` | full quotation by id | quote print → **owner/dev + saler/storedevice** |
| `getQuotationDrafts` | saved quote drafts | quote drafts → **owner/dev + saler/storedevice** |
| `getDeadStock` | slow-moving inventory | DeadStockView → **owner/dev** (deadstock tab) |

## 2. Caller analysis (the decisive evidence)

**CONFIRMED — no F-07 caller currently sends a session token:**
- `dmjFetch` attaches `sessionToken` **only to POST bodies** (`ui.jsx:220`, `opts.method === "POST"`). Every F-07
  caller is a **GET** → `dmjFetch` adds nothing.
- `getCustomerAnalytics` (`views-analytics.jsx:9961`) and `getDeadStock` (`8716`) use **plain `fetch`** — no token.
- `getQuotationSummary` (`9075`), `getQuotationForPrint` (`views-quote.jsx:66`), `getQuotationDrafts` (`50`) use
  `dmjFetch` as GET — no token.
- Reference: `getAuditLog` (`views-analytics.jsx:8143`) is the only GET that manually appends `&sessionToken=`.

**Implication (STRONG EVIDENCE):** a naive strict gate would return `Unauthorized` to **every** caller, including a
logged-in owner — a blank CustomerView/QuoteFollowupView/DeadStockView. This is the same failure class as the
Phase 7.6 rollback ("whole store can't use it"). **A flag + caller-token change are both required.**

## 3. Anonymous / pre-login workflow check (CONFIRMED)

- None of these endpoints is on the app boot/login path (boot = payload/`me`/`ver`, not these).
- `getPendingQuotations` has **no frontend caller anywhere** (`grep` clean) — like `debugOrders`, effectively
  backend/manual only.
- No legitimate anonymous/public workflow depends on any of them — they are internal owner/saler analytics.
- `REQUIRE_LOGIN` does **not** touch these — they had no session gate at all before this change.

## 4. Existing helpers / tests reused

- `resolveSession_(ss, token)` → `{role, status, …}`; `isAdminRole_(role)` = owner||dev (`gs:768`).
- Secure pattern mirrored: `getAuditLog`/`attendancePhoto`/`staffPerf`/(now) `debugOrders`.
- Test idiom: eval real functions from `.gs` (auth.test.js) + source-scan meta-tests.

## 5. Rollout decision

**Chosen: flag-gated (default OFF).** Strict-gating-now is unsafe (§2). A flag lets the two halves ship together
with zero behavior change, then the owner flips it once login rollout is confirmed.

- **`F07_PROTECTION_ENABLED` (Script Property).** Unset/`!= 'true'` → **existing behavior** (token-only).
  `'true'` → require active session + role.
- **Both halves shipped:** backend guard + all 5 callers now append `&sessionToken=`. So when flipped ON,
  logged-in owner/saler keep working; anonymous PII access is denied.
- **Owner action (NOT done here — do not flip production):** verify owner/saler/storedevice staff are logged in
  (`lastLoginAt` in the พนักงาน sheet), then set `F07_PROTECTION_ENABLED = 'true'`. Roll back = unset the flag.

## 6. Implemented change (branch `claude/security-debugorders-authz`)

- **Backend:** `f07Guard_(e, allowedRoles)` (`gs`, after `isAdminRole_`) — flag-off → `null` (pass); flag-on →
  `resolveSession_` + `status==='active'` + (`isAdminRole_` or role in `allowedRoles`), else `Unauthorized`.
  Inserted at all 6 handlers: `getDeadStock`/`getCustomerAnalytics` = admin-only (`null`); the four quote endpoints =
  `['saler','storedevice']` (owner/dev always allowed via `isAdminRole_`).
- **Frontend:** `getDeadStock`/`getQuotationSummary`/`getCustomerAnalytics` (views-analytics) +
  `getQuotationDrafts`/`getQuotationForPrint` (views-quote) now append
  `&sessionToken=${encodeURIComponent(localStorage.getItem("dmj_session_token")||"")}`.
- **Tests:** `tests/security-f07-authz.test.js` (10) — eval `f07Guard_` (flag off/on × role matrix) + source-scan
  (6 handlers guarded, 5 callers send token). **Full suite 2327 pass.**

## 7. Gate criteria — all satisfied (CONFIRMED)

- All callers understood ✓ · permissions clear ✓ · no anonymous workflow broken (flag default OFF) ✓ ·
  regression tests written ✓. → Implementation was safe **as a flag-gated change**; done. Not merged, not deployed.

## 8. Residual / UNKNOWN

- **Production login-rollout state** (are all owner/saler logged in?) — UNKNOWN in-session; owner must confirm
  before flipping the flag. This is the one remaining decision; it does not block shipping the (OFF-by-default) code.
- Enabling the flag while a stale `.jsx` client (pre-token) is cached would 401 that client until it reloads — same
  cache-generation caveat as any `.jsx` change; the service-worker `CACHE_NAME` bump on deploy handles it.
