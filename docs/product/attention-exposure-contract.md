# Dollarized attention — demo v1

The attention queue is an exposure view, not a recommendation engine. It reads
validated immutable metric releases through `/v1/metrics/attention-values` and
returns `attention-exposure-v1` with its declared assumptions. It does not modify
published metrics, source extracts, decisions or Tracking.

## Stockouts: current episode plus replenishment exposure

Calculate per store-item, then sum complete valuations within each finding:

1. Find the observed consecutive zero-inventory episode ending on the observation
   date. Never extend the episode into unknown history.
2. Use sales dollars per valid in-stock store-day in the 28 calendar days immediately
   before the episode. Require at least seven eligible, valid sales-and-inventory
   days with positive inventory. This is the store's own observed rate, not zero-day
   censored velocity. If insufficient, explicitly use the current retailer forecast's
   daily demand × published retail price as a proxy, not claimed historical sales.
3. Estimated missed retail sales to date = max(0, daily baseline × observed zero
   days − recorded retail sales during the episode). Require complete observed
   sales coverage across the episode. This is a counterfactual, not booked loss or
   proof that all demand was permanently lost.
4. Forward exposure uses the unchanged Walmart base forecast and published firm
   receipt simulation. With firm receipts within 28 days, sum unfulfilled retail
   demand through the first receipt day with positive projected ending inventory.
   The receipt day contributes only its actual simulated unfulfilled units.
   A small partial receipt is not assumed to resolve the issue; without recovery,
   retain the full 28-day projection.
5. Without a firm receipt within 28 days, sum the same published forecast's unmet
   demand for a declared **21-day existing-stock replenishment scenario**:
   seven days PO authorization + two fulfillment + five brand-to-retailer DC +
   seven retailer DC-to-store. This assumes ready brand stock and obtainable PO
   authorization. It is neither a booked receipt nor established action feasibility.
   No new production is assumed. `AttentionAssumptions` is explicit and validated;
   changing it changes the scenario, not historical observations or firm supply.
6. The headline estimate is missed-sales-to-date + forward exposure. Why shows
   the two components, baseline coverage and assumed-receipt count separately.

This simple scenario assumes recent in-stock sales are representative; it does
not estimate substitution, deferred purchases, promotion effects, lost margin,
or causal action savings. Walmart forecasts remain the forward demand baseline.
Missing history, price or projection inputs remain unvalued, never zero-filled.
Known subtotals carry `+`; wholly unknown values use an em dash / hollow dot.

## Other types and attention presentation

- Supply gap: published conditional retail exposure over 28 days, assuming eligible
  retailer plans arrive. Dependencies covered under plans are not monetary alarms.
- Excess: published inventory capital at cost above the cover target. Firm and
  planned-only excess retain their published meanings, not markdown-loss claims.
- Retail exposure and inventory capital have different bases and horizons. Do not
  add all cards or interpret dollar order as intervention ROI or an action ranker.

The overview cards use these same estimates as the queue, not a separate formula.
The previous `/exposure-summary` endpoint retains its original forward-28-day-only
contract for other consumers; `/signal` now uses `/attention-values`.

Default attention shows up to three highest-dollar positive or unvalued findings
per type, with Show all / Show less controls. Every source finding remains available
through Explore and its direct URL. Growth, recovery and plan-covered dependencies
remain evidence rather than filling the financial attention list.

The timeline has Supply gap / Stores at zero / Excess lanes. Dot area increases
with estimated dollars using a square-root diameter transform and a minimum visible
target. Hollow dots denote incomplete valuation. Dots are packed within weekly
buckets for legibility, not positioned as exact date coordinates. Tooltips retain
actual symptom timing, valuation coverage and economic basis. Expanding a type
grows lane height instead of stacking inaccessible circles on top of each other.

Finding-specific responses include every store's baseline, observed zero days,
recorded episode sales, retail price, receipt basis, horizon and dollar components.
Evidence CSVs retain the original operands and add versioned valuation JSON and
assumptions, with exact member reconciliation and spreadsheet injection protection.

## Verification

Known-answer tests cover own-stocked sales, fallback labeling, firm recovery,
partial receipts, missing evidence, explicit lead assumptions, future-actual leakage,
read-only serving and corrupt publication rejection. UI tests cover type previews,
expansion, ordering, monetary labels and dot sizing. Existing Review / Tracking
interactions remain regression-tested without adding a decision backend.
