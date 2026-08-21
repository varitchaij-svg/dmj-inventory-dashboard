# MTO Roadmap — Status Snapshot (ส.ค. 2026)

**What this document is**: a synchronization snapshot of where the MTO roadmap actually stands,
written because the existing MTO documents (`ADR-MTO-SELLABLE-2026-08.md`,
`HANDOFF-MTO-QUOTE-2026-08.md`) no longer reflect the current product direction on their own.

**What this document is NOT**: it does not decide anything, does not propose a new architecture,
and does not supersede `ADR-MTO-SELLABLE-2026-08.md` — that file is left untouched. Where this
snapshot and the ADR appear to disagree, this document says so explicitly rather than picking a
side. Read `docs/ADR-MTO-SELLABLE-2026-08.md` and `docs/HANDOFF-MTO-QUOTE-2026-08.md` in full
before acting on anything below — this is a map to them, not a replacement for them.

A future session (or a human) landing on this file first should be able to reconstruct: what's
actually shipped, what's deliberately on hold, what's still an open question, and — critically —
which recent branch work is **not** authoritative even though it exists in the repository.

---

## 1. Completed

- **A — Sellable MTO jobs via POS** (`docs/ADR-MTO-SELLABLE-2026-08.md`, PR #99, merged to
  `master`). Decisions 1, 2, 4, 5, 6 of that ADR are shipped and uncontested. Decision 3
  (the ZORT sale-SKU model) has an open question attached — see §6, not §1.
- **B — MTO group-card UI in quotation creation** (`docs/HANDOFF-MTO-QUOTE-2026-08.md`, item 2).
  Frontend-only: `QuotationFormView`'s MTO category collapses SKUs into one card per prefix
  (`mtoSkuPrefix_`/`mtoGroupProducts_`/`mtoGroupLabel_`). Ships each tap as its own registered-SKU
  line — no composition, no shared/placeholder SKU. Shipped, no open question.
- **C — Soft-delete for products removed from ZORT** (`docs/HANDOFF-MTO-QUOTE-2026-08.md`, item 3
  of its "เสร็จแล้ว" section). Shipped, no open question.
  ⚠️ **Naming collision worth flagging**: that handoff labels this "item 3" in its *done* section,
  and separately labels the still-pending Bundle work "**#3**" in its *ค้าง* (pending) section —
  same number, two unrelated items. Anyone skimming that doc for "item 3" should check which
  section they're in.
- **D — MTO job staff assignment/ownership** (`docs/PLAN-NEXT-STAFF-DATA.md`, marked done
  2026-07-30/31). `assignMtoJob`, "งานของฉัน" filtering. This is a different roadmap track
  entirely (who owns a job, not how it prices or sells) — included here for completeness only,
  not connected to anything below.

---

## 2. Paused (intentionally — not blocked, not abandoned)

- **Bundle/composition pricing in quotations** — the work `HANDOFF-MTO-QUOTE-2026-08.md` calls
  pending (§1-C's "#3"). Paused by explicit product-owner instruction this session, not by a
  technical obstacle. See §3.
- **Job SKU / Template exploration** — an implementation attempt was made and then paused pending
  architecture review, also this session. See §4 and §6 for what that attempt was and why it's
  not settled.

---

## 3. Why Bundle quotation work has been postponed

A full "Bundle as its own domain entity" design was independently worked out in this session
(header + items sheets mirroring `MTO_JOBS`/`MTO_ITEMS`, its own lifecycle
`draft → sent → converted → cancelled`, `bundleId` as stable identity independent of SKU/line
order) — and then explicitly set aside by the product owner: *"I don't want to start a new Bundle
project right now... The Bundle discussion is valuable, but I want to postpone it until we
actually need it."*

This is a prioritization call, not a dead end. The design isn't rejected — it's shelved. The two
decisions `HANDOFF-MTO-QUOTE-2026-08.md` already locked for this feature (composition bound to
the quote *line*, not the SKU; stock only recorded as a prep list for the warehouse, never
auto-deducted through ZORT) still stand as the design to resume from *if and when* work restarts —
see §5. Nothing about *when* that will be has been decided.

---

## 4. Why Template / Job / Analytics is being explored

This direction was introduced in conversation this session ("Keep moving toward the Template-based
architecture we discussed earlier") — it does not originate in any repository document. A grep of
`origin/master` (the state before this session touched anything) for "Job SKU," "jobSku," or
"Template" across every `.md`/`.gs`/`.jsx` file returns zero matches.

The motivation, as stated: the shipped `MTO_BUNDLE_SKU` model (§1-A, Decision 3) sends **one
shared SKU for every MTO job**, which means ZORT-side sales reporting can't distinguish a `BK001`
bouquet from a `VASE001` arrangement — all MTO revenue collapses into a single line. The
"Job SKU"/"Template" language is an intent to fix that, not a design.

An implementation attempt this session (a flat `groupSku` field on each MTO job, used directly as
the literal ZORT sale SKU) surfaced the actual open question blocking this from being finalized:
**should the analytics-correlation key and the literal ZORT-facing sale SKU be the same value, or
two separate concepts mediated by a Template layer?** The attempt assumed "same value" without
that question being asked and answered first. That's why it was paused rather than continued.

---

## 5. Architecture decisions that are FINAL (uncontested, currently authoritative)

- ADR Decision 1 — fulfillment and sale are two independent state machines; never merge them.
- ADR Decision 2 — stock is deducted at fulfillment only, never at sale time.
- ADR Decision 4 — `canSellMtoJob_` is the single sellability gate; nothing else re-derives it.
- ADR Decision 5 — `applyMtoFulfillment_` stays domain-pure; no POS/Cart/Bill knowledge inside it.
- ADR Decision 6 — `billCid` is stored alongside sale status for idempotency tracing.
- MTO group-card UI in quotation creation (§1-B) — shipped, no open question.
- Soft-delete for ZORT-removed products (§1-C) — shipped, no open question.
- Bundle composition's two locked sub-decisions from `HANDOFF-MTO-QUOTE-2026-08.md` — composition
  bound to the quote line, not the SKU; stock recorded for the warehouse, never auto-deducted —
  final **whenever that work resumes**. Not currently being acted on (§2/§3).

---

## 6. Architecture decisions that are OPEN — do not implement against these

- **ADR Decision 3** (`MTO_BUNDLE_SKU`, one shared placeholder SKU for every MTO job) is **still
  the last-approved, merged-to-`master` architecture** as of this writing. A competing
  implementation — one SKU per job ("Job SKU"), stored flat on the job row, used directly as the
  ZORT sale SKU — exists on branch `claude/work-1-2-investigation-4gfehk` (commit `7283f5c`).
  **That branch is not merged, not deployed, and was not approved through architecture review** —
  a future session should not treat it as authoritative just because it exists in the repository.
  `docs/ADR-MTO-SELLABLE-2026-08.md` currently carries a "🔴 SUPERSEDED" banner over Decision 3
  that was written during that same unapproved attempt — the banner is part of the open question,
  not a resolution of it. (Per this session's instruction, that file has not been touched again to
  remove or soften the banner — it's flagged here instead, deliberately left as-is.)
- Whether the eventual per-job analytics-correlation key should be identical to the literal ZORT
  `AddOrder` sale SKU, or a distinct value resolved through a separate layer (Template or
  otherwise) — unresolved, see §4.
- Whether a Template entity gets introduced at all. No schema, no relationship to Job, no scope
  has been defined anywhere — not in the repo, not in conversation. "Template" is currently a name
  for an intent, not a design.
- When, or whether, Bundle/composition quotation work resumes (§2/§3).
- The ZORT-side stock-tracking behavior required for whichever sale-SKU model wins. This was
  flagged as unresolved in the **original** ADR text itself, before this session
  (*"ยังไม่ยืนยันว่า ZORT ฝั่ง stock ของสินค้า placeholder นี้ควรตั้งเป็นเท่าไหร่/ต้อง track
  สต็อกไหม"*), and remains unresolved regardless of which model is chosen.

---

## Appendix — repository state at time of writing

- Current branch `claude/work-1-2-investigation-4gfehk` is one commit ahead of `origin/master`:
  `7283f5c`, containing the unapproved Job SKU implementation described in §6. That commit is
  pushed to the remote branch but not merged, and nothing has been deployed (GAS auto-deploy only
  fires on a `master` push).
- No document named `HANDOFF-2026-08-21-AUDIT-CLOSE-NEXT-WORK` exists anywhere in this
  repository — checked the working tree, both branches, both remotes, and the full commit history
  of every branch. If that document was expected to exist, it does not, under that name or any
  close variant.
