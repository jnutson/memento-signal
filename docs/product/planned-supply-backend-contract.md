# Planned-order backend bridge v1

Date: 2026-10-19. Metrics publication contract: `retail-backend-metrics-v4`.
Boundary: validated synthetic source evidence -> deterministic metrics -> read-only API.
No UI, ranker, ontology, policy-selected action or new datastore.

## The two supply views

`supply_assessment`, `supply_projection`, `supply_order` and `supply_forecast` retain
their existing firm-only meanings. Planned order input never changes their quantities,
dates or forecast. Tests require byte-identical firm artifacts with and without plans
over identical canonical inputs. Walmart weekly demand quantities remain unchanged.

Five additional immutable Parquet artifacts are published separately:

| Artifact | Meaning |
| --- | --- |
| `planned_order` | Canonically mapped current source plan versions, original quantities/dates and source basis; remaining/converted/withdrawn partitions, timing classification and projection eligibility |
| `planned_conversion` | Allocations from plan IDs to actual observable PO lines; this synthetic feed uses explicitly declared FIFO linkage, not authoritative retailer matching |
| `planned_coverage` | Exactly one row per assessment pair; feed availability and known-at evidence. Missing feed and missing pair evidence are not zero quantities |
| `expected_supply_assessment` | Exactly one row per assessment pair comparing firm coverage against a conditional firm-plus-plan scenario |
| `expected_supply_projection` | Separate low/base/high daily traces with distinct `firm_inbound_units` and `planned_inbound_units`; demand is copied unchanged from the firm path |

Normalized planned evidence is a derived metric-publication artifact. It does not
alter the ten-table core canonical contract, mutate source extracts or create another
operational database. Source, core canonical and metric outputs remain separate.

## Source selection and validation

The existing temporal-series adapter discovers the optional `planned_orders` binding
on the exact requested cutoff. Contract `synthetic-order-demand-forecast-v1` is
explicitly synthetic, not a claim of exact Walmart feed-schema parity. The binding
must match the series release-set checksum, canonical release-set checksum and cutoff.
All three source files are verified for safe regular paths, byte counts, SHA-256,
exact Arrow schemas, declared row counts and bounded compressed/uncompressed sizes.
No private scenario labels, process events or later actuals are read.

Validation rejects null fields, unsupported location roles/company/region, ambiguous
identity mappings, invalid dates/knowledge times, negative/nonconserving quantities,
invalid statuses and duplicate current plan IDs or sequence grains. The source
contract supplies one current row per plan ID, not a mixed-history table from which
Memento can arbitrarily pick a favorable version. Future known-at rows are rejected,
not quietly made available early. Distinct forecast sequences are retained and summed.

Coverage must exactly match the exhaustive assessment population. An available pair
with no plan rows means no currently published plan; a missing/unavailable feed does
not. The old series without this binding remain supported with explicit `not_provided`
coverage and unknown expected-supply results, not a policy-derived planning fallback.

Conversion allocations must sum to each plan's converted quantity. Every conversion
must resolve to the same canonical store/item and an actual PO line observable by
the conversion timestamp, created after the plan was issued. Total allocations to
a PO line cannot exceed its ordered quantity. Missing matching PO evidence rejects
publication rather than inventing a commitment. Long-horizon feeds whose conversion
history outlives retained PO evidence will need an explicit archival contract; this
does not silently relax the currently approved short demo contract.

## Calculation rules

For a selected plan version:

```text
order_each_qty = converted_qty + remaining_planned_qty + withdrawn_qty
conditional inbound = dated future firm outstanding units
                    + eligible remaining_planned_qty
```

Converted quantities enter only through actual firm outstanding PO evidence, after
receipts/cancellations are accounted for by the unchanged firm calculation. Converted
and withdrawn portions are never added again as planned supply. Do not add store
on-order or in-transit aggregates a second time on top of the same PO lines.

Eligible planned supply requires available coverage, an in-scope pair, positive
remaining quantity, placement date on/after the cutoff date, and store arrival within
the same 28-day horizon. Missed placement deadlines remain visible and are excluded;
they are not automatically moved forward. Arrivals outside the horizon are retained
as evidence, not pulled into the forecast window. v1 accepts store destinations only;
an unsupported DC destination is rejected rather than treating its arrival as store
availability. `eligible_for_projection` describes timing/scope eligibility; unknown
inventory, forecast or firm evidence can still prevent a complete projection.

The same deterministic inventory helper, dated firm receipts and exact demand
sequences are reused. Receipts are available before demand on the stated date, as
in the firm model; this remains a coarse calendar-day assumption. The new path does
not forecast different demand or recreate Walmart's order quantities.

An expected projection requires valid firm-projection inputs and available planned
coverage. Otherwise projected amounts/dates remain null and no expected trace is
published for that pair. Current observed OOS and distribution checks are unchanged,
including cases with zero forecast demand. Future plans cannot erase today's OOS.

## Interpretation, not action selection

Expected projection statuses are `conditional_healthy_28d`,
`conditional_projected_depletion`, `conditional_projected_unfulfilled_demand`,
`insufficient_data` or `not_applicable`. Comparison states distinguish:

- `firm_only_sufficient`: firm-only base demand has no unfulfilled units.
- `firm_gap_conditionally_covered`: the firm gap disappears under the eligible plans.
- `gap_remains_under_plans`: unfulfilled base demand remains even if the plans arrive.
- `no_positive_reference_demand`: do not mistake zero forecast demand for proof that
  current zero inventory or promised distribution has been resolved.
- `unknown` / `not_applicable`: no supported comparison.

All expected views carry `firm_plus_unconverted_plans_conditional` and
`unverified_not_authorized`. A plan is not a PO; stock readiness, order placement and
delivery are not guaranteed, and no shipment/action is authorized. An overdue small
remainder alone is not a stockout recommendation. Its quantity, current stock, firm
inbound and next-cycle plans remain visible separately.

`conditional_unfulfilled_reduction_units` is a difference between two projections
holding demand fixed. It is not measured prevention, realized lost sales, incremental
profit or savings. Estimated retail and retail-minus-cost exposure retain the existing
economic definitions and missing-cost handling; do not sum unlike financial bases.
No 90-day production prevention claim is supported by a 28-day demand horizon.

## Publication, API and verification

Source file digests, row counts, cutoff/binding, contract and availability are included
in metric lineage without exposing absolute source paths. All metric calculation
modules are hashed. Existing descriptive-v1, backend-v2 and backend-v3 publications
remain readable, with their historical file inventories unchanged.

New read-only `/v1/metrics/` kinds:

- `planned-orders`, `planned-conversions`, `planned-coverage`.
- `expected-supply`, `expected-projection`.

Use a pinned `release_id`, existing `product_id` / `scope_id` filters, and bounded
pagination (maximum 200). Expected supply accepts its conditional projection-status
filter. `supply`, `projection`, `orders`, `forecasts` remain firm-only. Historical
releases without the requested table return unavailable rather than fabricated rows.

```sh
.venv/bin/python -m memento.metric_cli '/Users/mininutson/Desktop/Synthetic Data/releases/miro_iteration_demo_v1/series/c6688020cab72f83d0c07c34c0fae7e014ef3cf3dfe12bb601cf401a02ef7cfc/manifest.json' --cutoff 2026-09-26T12:00:00Z --tier-baseline-end 2026-09-25 --no-activate
.venv/bin/python -m memento.metric_replay '/Users/mininutson/Desktop/Synthetic Data/releases/miro_iteration_demo_v1/series/c6688020cab72f83d0c07c34c0fae7e014ef3cf3dfe12bb601cf401a02ef7cfc/manifest.json' --tier-baseline-end 2026-09-25
```

Replay verifies source/metric integrity, unchanged actual prefixes and tiers,
nonregressing plan versions and immutable issue identities, coverage gaps, exact
conditional demand/firm reuse and quantity conservation. Every cutoff is republished
to verify identical bytes; neither Metrics nor Signal current pointer is activated.
Existing event evaluation remains explicitly firm-only; conditional comparison counts
are reported separately and do not replace the old precision/recall definitions.

This completes the planned-feed bridge, not the entire demo. A coherent finding
layer for all three business promises, a reviewed queue policy, UI, reports and the
general ontology remain separate, unimplemented follow-on scope.
