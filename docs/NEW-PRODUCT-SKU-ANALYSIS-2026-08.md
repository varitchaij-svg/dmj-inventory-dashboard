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

## 3b. Deeper trace (Priority 3 request) — how far a structural change ripples (CONFIRMED)

Traced the systems that depend on the **current** SKU structure `[prefix][2-digit variant][3-digit model]`:

| Surface | Dependency on current SKU structure | Impact if taxonomy changes structure |
|---|---|---|
| **SKU = barcode = ZORT key** | `addNewProduct` sends `barcode: sku` (gs:7588); ZORT product keyed by SKU | New scheme → new ZORT products **or** changed barcodes → **label reprints** + ZORT re-mapping |
| **Barcode label printing** | JsBarcode Code128 renders the SKU string directly (views-analytics ~6533) | Changed SKU → every printed label invalid |
| **`parseSkuParts`** (views-main:3603) | regex captures `prefix` + 2-digit variant + 3-digit model | A scheme not matching this regex → `parseSkuParts` returns null → **model numbering / variant display break** |
| **`compareSku`** natural sort (3395) | sorts by letters-prefix → numeric color → numeric seq | Non-conforming SKUs sort wrong across every product list |
| **Prefix grouping** | `mtoSkuPrefix_`, `productOwnerSkuPrefix_` (letters-before-digits) | Product-owner-by-prefix + MTO grouping mis-bucket |
| **Collision** | `collectExistingSkus_` / `checkSkuExists` (2 sheets) | Works regardless of scheme (string compare) — safe |
| **Existing references / reporting** | thousands of live SKUs + monthly/daily sales keyed by SKU | Retroactive change = mass migration of historical records |
| **Duplicate-name behavior** | name-search→prefix reuse (exists) | Compatible with an *additive* prefix default; incompatible with a *replacement* that renames types |

**Conclusion of the deeper trace:** the requested `F/RT/FB/…` table is only safe as **option (b) additive** (a
category default *consulted when name-search finds no existing prefix*, still producing a structure-conforming SKU with
the color-code variant + `nextModelForPrefix`). As a **replacement (a)** it ripples into barcode/ZORT-key/`parseSkuParts`/
sort/grouping/history = a full migration with owner sign-off (comparable in weight to the MTO Job-SKU migration). It is
**not** a mere alias/display layer (3) — SKU is the ZORT/barcode identity, not a label.

## 4. Evidence gaps
- Owner intent for the category→prefix table (a/b/c) — **UNKNOWN**, blocking.
- Whether any of F/RT/FB/L/LB/TR/G/KB/PS/BR/GR already exist as live prefixes in production SKUs — needs a catalog
  scan (safe, read-only) once intent is known.
