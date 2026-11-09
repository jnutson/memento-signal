# Insight Details MVP

Implemented for the three financial attention paths: stores at zero, future supply
gap and excess (including planned-only excess). The supplied Story/Details shell,
palette, cards and right-hand Review/Tracking behavior remain unchanged. Nonfinancial
growth/recovery detail paths are not part of this milestone.

## Source and reconciliation

`InsightDetails` reads the same versioned `/attention-values` finding/store
valuations as the attention queue. It does not recalculate an alternative dollar
headline. It requires matching release, finding, product, store membership,
valuation coverage and money totals. Disagreement produces a local Details error,
not a replacement number or a store-count fallback.

The store ledger additionally checks each known calculation: missed-sales-to-date
plus forward exposure for zero stores; conditional unmet units × retail price for
supply gaps; max(0, projected stock − target) × unit cost for excess. Firm versus
conditional excess follows the finding's declared basis. Complete unknown values
stay unknown; incomplete groups show a known subtotal and valuation coverage.

The underlying store ledger uses a stable largest-remainder cent allocation so
its sum reconciles exactly to the full-finding cents. Why and Details display
compact dollars and whole units only; independently rounded visible rows may not
sum to the rounded total. Calculations, original floating-point estimates and
operands remain unchanged in the evidence export. The compact headline uses the
same formatter and raw estimate as the attention queue.

`/display-series` adds a narrow complete-population `store_supply` list: member
identity, 28-day demand, firm/conditional shortage dates and unmet units. Existing
published artifacts remain immutable. No ingestion, forecast, datastore, action
counterfactual or decision backend was added.

## Screens

Each view contains three summary cards, explicit finding scope, one labeled chart,
one five-column store table and collapsed calculation/source evidence. Store
search, region filter, dollar sorting, 10/25-row pagination and one open store
expansion affect only the table; the full-finding headline, ledger footer and
chart remain stable. Export includes every member regardless of visible filters.

- **Stores at zero:** missed sales + forward exposure; observed zero counts for
  this affected-store cohort over eight weeks; store duration, sales baseline,
  receipt/scenario and dollars. Expansion shows baseline/proxy, actual episode
  sales, both dollar components and firm/planned receipts.
- **Supply gap:** conditional 28-day retail exposure, uncovered units and first
  shortage; firm versus including-plans inventory and a separate uncovered-units
  strip, so aggregate stock cannot obscure store-level shortages. Table exposes
  conditional demand shortfall and its price calculation.
- **Excess:** capital at cost, excess units and target units; firm versus
  including-plans inventory against the declared target; projected/target stock,
  excess and capital by store. Planned-only findings remain explicitly conditional.

Supply and excess have a compact disclosure of receipt groups, separated by firm,
conditional planned and excluded planned status. Store expansions retain placement
dates and exact source references; group rows are not invented orders or presumed
permissions to change supply. No arbitrary first-20 truncation is used in this view.
Carrying cost is shown only as a published approved-rate amount or unavailable,
without an empty chart or an invented rate.

Charts support hover and keyboard arrow-key readouts. Historical calendars retain
missing dates as gaps, not zeroes or interpolated observations. Actual history and
future projections are labeled explicitly; alternative supply paths are never added.

## Checks

Known-answer unit tests cover all financial paths, per-store and parent mismatches,
partial valuation, planned-only excess, cent allocation, filtering, pagination and
keyboard readouts. Browser tests exercise real isolated synthetic publications for
all three paths, verify queue-to-ledger cents, inspect stores and complete exports,
and retain the original Commit/Share and Tracking regression flow. Protected markup
fingerprints independently guard the unchanged Review and Tracking cards.
