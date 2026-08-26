# Owner Business View — Decision Matrix (2026-08-25)

Track F, Priority 4. **Analysis only — every metric mapped to a real data source on `origin/master b7e5f1e`; nothing
invented.** No competing design doc exists on the dashboard branches (`dashboard-analysis-plan-2r6kn9`,
`system-analysis-owner-saler-i4lp08`, `procurement-demo-dashboard-6y1kji` carry no `docs/` artifact and are dated
Jul 2026 — code prototypes at most), so this is the design-layer analysis, not a duplicate. No code changed.

Goal: the owner opens the ERP and, in seconds, sees **what happened / why / what needs attention / what to decide** —
not more charts. Freshness classes: **RT** (this request) · **NRT** (≤ minutes, poll/cache) · **DAILY** · **WEEKLY**
· **MONTHLY**. Reliability: ✅ trustworthy · ⚠️ caveated · ❌ not reliably computable today.

---

## 1. Decision matrix

### TODAY
| Metric | Data source (traced) | Freshness | Reliable? | Owner action |
|---|---|---|---|---|
| Sales today (฿, bills) | `SHEET_SALE_BILLS` (POS) + ZORT orders | NRT (cache 180s / poll) | ✅ | none / spot-check pace |
| Orders pending (จัด) | `data.orders` status "รอ" (`readOrders_`, poll 15s) | RT–NRT | ✅ | staff/expedite if backlog |
| Of-which "หิ้ว" (customer waiting) | `data.orders` carryMode=carry | RT–NRT | ✅ | prioritize now |
| Pending receives (ของรอรับ) | `data.shipments` receivedAt empty | NRT | ✅ | chase warehouse/front |
| MTO workload (open jobs) | `SHEET_MTO_JOBS` status "กำลังจัด" | NRT | ✅ | staffing |
| Stock exceptions (OOS front, WH>0) | `data.products` isOOS + qtyWH>0 | NRT | ✅ | trigger reorder/transfer |
| Operational failures (ZORT/LINE) | see REAL-TIME/EXCEPTIONS | NRT–DAILY | ⚠️ | investigate |

### THIS WEEK
| Metric | Data source | Freshness | Reliable? | Owner action |
|---|---|---|---|---|
| Sales trend (7d) | `data.dailyByCat`/`dayLabels` | DAILY | ✅ | react to dips |
| Order/fulfilment trend | `data.orders` + shipments history | DAILY | ✅ | capacity |
| Stock movement | transfers + `applyMtoFulfillment_` deductions | DAILY | ✅ | rebalance WH↔front |
| MTO completion rate | `SHEET_MTO_JOBS` fulfilled/created | DAILY | ✅ | throughput |
| Slow-moving items | `getDeadStock` (front>0, no transfer >3mo) | DAILY | ✅ | promo/return |

### THIS MONTH
| Metric | Data source | Freshness | Reliable? | Owner action |
|---|---|---|---|---|
| Sales (฿, qty) | `data.monthlyByCat`/`monthLabels`, `totals` | DAILY (rebuilt) | ✅ (complete months only) | plan |
| **Gross margin** | needs component cost | — | ❌ **cost wall** (ZORT no real cost; `COST_RATIO` is placeholder) | **do not show a margin from placeholder cost** |
| Inventory value / stock risk | `totals.totalStockValue*` (retail × wholesaleRatio) | DAILY | ✅ (wholesale basis) | capital tied up |
| Top / bottom products | `data.products` soldQty/soldRev, ABC | DAILY | ✅ | assortment |
| Quotation conversion | `getQuotationSummary` (approved/pending/void) | NRT (on tab) | ✅ | sales coaching |
| MTO performance | `SHEET_MTO_JOBS` + (later) JobSnapshot | DAILY | ⚠️ margin part Phase 2C | pricing/throughput |
| Customer new vs returning (YoY) | `getCustomerAnalytics` byMonth | NRT | ✅ (per CustomerView) | retention |

### REAL-TIME / EXCEPTIONS
| Signal | Data source | Freshness | Reliable? | Owner action |
|---|---|---|---|---|
| Low stock (WH) | low-stock scan → in-app noti; `computeHealth_` | NRT/2h scan | ✅ | reorder |
| Front OOS, WH has stock | `fsNeedsRestock_` → in-app noti | 2h scan | ✅ | order to front |
| Negative / oversold / orphan stock | `computeHealth_`/`selfcheck` | RT (on request) | ✅ | fix data |
| Pending receives aged >3d | `shipPendingAging_` noti + tracking | DAILY (03:00) | ✅ | chase |
| **Failed ZORT operations** | `SHEET_ZORT_FAILED` (`logZortFailure_`) | append RT | ⚠️ **no dashboard surface** (sheet only) | needs a view (gap) |
| **Failed LINE notifications** | noti queue rows status `failed` | DAILY cleanup | ❌ **no surface, no dead-letter/alert** (F-10) | needs surface (gap) |
| **Unusually slow backend** | `[perfB]` logs | ephemeral | ❌ **log-only, not queryable** (F-14 / Phase B) | needs durable sink |
| Stuck transactions (unsent orders/transfers) | `*Check` (cid/tid/billCid) endpoints | RT (on demand) | ⚠️ per-item, not aggregated | recover via existing tools |

## 2. What the data model genuinely cannot support today (do not fake)
- **Gross margin / COGS / inventory turnover** — ❌ cost wall (ZORT PO prices are 0; `COST_RATIO`=placeholder). Same
  finding as the dashboard audit and MTO cost snapshot (Phase 2C). Show **revenue and stock value**, not margin.
- **Failed-integration visibility** — the *data exists* (`SHEET_ZORT_FAILED`, noti-queue `failed`) but there is **no
  owner-facing surface**; and backend-slowness telemetry is **ephemeral** (F-14). These are the highest-value missing
  exception signals and they depend on Track B (durable observability) + F-10 (notification dead-letter).

## 3. Recommended landing (decision-first, from existing signals — no new data)
- **L1 — Today strip:** sales today · orders pending (+หิ้ว) · pending receives · MTO open · stock exceptions count.
- **L2 — Needs attention (exceptions):** low stock, front-OOS-WH-has, aged receives, negative/orphan stock, **failed
  ZORT/LINE** (once surfaced). Each row is an action link (reuse the existing in-app-noti routing `tab`+`view`+`focus`).
- **L3 — Trends:** week sales/orders/MTO completion; month sales + inventory value + quotation conversion + top/bottom.
- **L4/L5 — Drill-down/transactions:** existing OverviewView / CustomerView / TrackingView / StaffPerformanceView.
- The ingredients (badges, reorder/dead-stock/mismatch filters, in-app noti, health check) already exist; this is a
  **composition** into one exception-first surface, not new analytics (matches scrutiny F-13).

## 4. Implementation note (not authorized here)
- Building the landing is **frontend composition** of existing endpoints — low backend risk — **except** the two
  exception rows that need new surfaces (failed ZORT/LINE) and the durable-slowness signal, which depend on Track B/
  F-10. Sequence: compose L1–L3 from existing data first; add failed-integration rows when their surface lands.
- Owner decision needed before build: which 5–7 L1 tiles matter most to *you* (this matrix offers candidates; the
  choice is yours). No KPI here is invented — each maps to a traced source above.
