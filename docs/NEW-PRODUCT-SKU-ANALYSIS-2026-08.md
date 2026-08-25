# New Product / SKU Creation — Analysis + Conflict Flag (2026-08-25)

Track K: review the product-creation flow and the proposed category→prefix mapping. **Analysis only — traces current
master; flags a conflict that needs an owner decision before ANY implementation.** No code changed. No branch owns
this track (checked), so this is not duplicating existing work.

Tags: CONFIRMED (traced on `origin/master b7e5f1e`) / CONFLICT / UNKNOWN.

---

## 1. Current SKU generation (CONFIRMED)

- **Model** (CLAUDE.md business rule + code): `[Product Prefix][Variant Code (2)][Model Number (3)]`
  e.g. `OL00001`, `R01025` — Prefix = **product type** (`OL`=มะกอก/olive, `R`=กุหลาบ/rose), Variant = **color code**
  from `VARIANT_COLOR_CODES` (views-main:3570), Model = 3-digit running per design (`nextModelForPrefix`, 3612).
- **Flow** (`AddProductView`, views-main:9172):
  - **Name search → prefix** already exists: `prefixNameSearch` "พิมพ์ชื่อสินค้า → หา Prefix (เช่น มะกอก → OL)"
    (9227) → `prefixByName`. So "search existing name first, reuse its prefix" (Track K step 1-2) is **already the
    current design**.
  - Variant chosen from the color table (or typed for non-color categories); Model from `nextModelForPrefix`.
  - Helpers: `suggestNextSku` (legacy, 3540), `parseSkuParts` (3603).
- **Collision handling** (CONFIRMED): two layers — client `checkSkuExistsRemote` (9118) + server `checkSkuExists`
  (gs:7552, checks 2 sheets). `addNewProduct` (gs:7563) writes only after AddProduct succeeds; audited.
- **Ownership:** SKU assembled **frontend** (AddProductView), verified client+server, written backend. Auditable via
  `writeAuditLog_` in `addNewProduct`.
- **Override:** user can type prefix/variant manually (not forced).
- **Guiding rule (CLAUDE.md):** *"ห้ามเดา Prefix / รหัสสี / Variant Rule / Model — ต้องถามผู้ใช้ก่อนเสมอ."*

## 2. CONFLICT — Track K's category→prefix table vs the existing scheme

Track K proposes a **fixed category→prefix mapping**:

```
Flower=F  RealTouch=RT  Bush=FB  Leaf=L  Bush Leaf=LB  Tree=TR
Glass Vase=G  Rock Rose=KB  PS Pot=PS  Branch=BR  Grass Flower=GR
```

This **conflicts** with the current convention (CONFIRMED):
- Current prefixes are **per product type**, not per broad category: `R`=rose, `OL`=olive — **not** a single
  `F`=Flower for all flowers. Track K's `Flower=F` would collapse many distinct product-type prefixes into one.
- Current variant (2 digits) = **color code**; Track K's scheme doesn't mention the color-code layer at all.
- Thousands of existing SKUs follow the current scheme. A fixed category→prefix table applied to new products would
  create **two incompatible SKU taxonomies** in one catalog, and applied retroactively would be a mass migration.

**This is exactly the "do not assume SKU numbering rules" case. Do not silently choose.** The mapping is either:
- **(a)** a proposed *replacement* taxonomy (huge — breaks/duplicates the existing OL/R/color-code scheme, needs
  migration + owner sign-off), or
- **(b)** a *new-category* helper for categories that currently have no prefix convention (additive, low-risk), or
- **(c)** a restatement the owner believes already matches production (it does **not** — CONFIRMED mismatch).

**UNKNOWN which is intended.** Resolving this is an owner decision; implementing either without it risks corrupting
the SKU space.

## 3. Recommendation

- **Do not implement Track K's mapping yet.** Surface the conflict (§2) to the owner and get one of (a)/(b)/(c).
- If **(b)** (additive, per-category default prefix for categories lacking one): small, safe — add a
  `CATEGORY_PREFIX_DEFAULTS` lookup consulted **only when name-search finds no existing prefix**, keeping the color-code
  variant + `nextModelForPrefix` + dual collision check intact. Frontend-owned, mirrors current flow. Gate + test then implement.
- If **(a)** (replacement): **stop** — requires a migration plan (like MTO's Job-SKU migration), owner sign-off, and a
  compatibility strategy for existing SKUs. Out of scope for an autonomous change.
- Either way, keep: name-search-first (exists), dual collision check (exists), manual override (exists), audit (exists).

## 4. Evidence gaps
- Owner intent for the category→prefix table (a/b/c) — **UNKNOWN**, blocking.
- Whether any of F/RT/FB/L/LB/TR/G/KB/PS/BR/GR already exist as live prefixes in production SKUs — needs a catalog
  scan (safe, read-only) once intent is known.
