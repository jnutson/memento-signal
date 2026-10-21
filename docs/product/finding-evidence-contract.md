# Three-promise finding/evidence layer

Date: 2026-10-19. Contract: `retail-backend-metrics-v5`, finding model
`promise-evidence-v1`. This is a deterministic analytical bridge, not an ontology,
ranker, action engine or replacement UI. Existing metrics remain independently accessible.

## Published contract

Two immutable derived Parquet artifacts accompany each metric release:

- `finding`: one item/issue group, stable finding ID, promise, factual template,
  distinct affected stores, eligible-store denominator/share, distribution and latest
  closed-week context, dates, financial basis, missing evidence and limitations.
- `finding_evidence`: every affected store-item, stable member ID, exact operands in
  `facts_json`, source artifact names and canonical selection keys, quantities,
  financial amounts, source plan review date and missing evidence. No top-N pruning.

IDs persist across cutoffs for the same item/issue and store membership; the immutable
parent release identifies the evidence version. A disappearing finding means its rule
no longer qualifies, **not** a completed action or causal resolution. Recovery has its
own observed-evidence rule. Item groups deliberately do not introduce a hierarchy,
universal score, cross-promise impact total or ordered work queue.

Manifest hashes bind the canonical inputs, distribution/planned sidecars, calculation
code, thresholds and evidence files. Read-only serving validates the entire release.
No private scenario assignments, latent demand, future actuals, or future realized POs
are product inputs. No source extracts are changed.

## Explicit rules and formulas

### Get more doors, with proof

For each currently eligible store-item, use the last **56 closed calendar days**:
the first 28 are the fixed internal baseline; the latest 28 split into two 14-day
windows. This catches a sustained higher sales level, not just repeated acceleration.

`baseline_rate = baseline fulfilled net units / baseline valid sales days`

Each recent window must meet both:

`window units / window sales days >= baseline_rate * (1 + trend_percent / 100)`

`window units - baseline_rate * window sales days >= trend_minimum_units`

Defaults reuse the published thresholds: **15% and seven incremental units per
window**. Require 56 eligible days, at least 90% valid sales exposure and positive
reported inventory in **each** baseline/recent window, and positive current inventory.
A zero/nonpositive baseline does not establish outperformance. A one-week spike,
large percentage with insufficient units, or baseline failing the positive-inventory
exposure gate cannot qualify. Passing 90% exposure is not proof of unconstrained demand.

Evidence includes baseline/recent U/store/week and $/store/week, both window changes,
all numerators/denominators, store region/frozen tier, latest weekly trend, and item
distribution context. Group affected-store share describes concentration against all
currently eligible pairs, including due promised stores. It is not a category benchmark.

`incremental units = recent units - baseline_rate * recent valid sales days`

This historical comparison is not causal lift, a dollar opportunity estimate, an
optimal door count or evidence that a buyer will authorize expansion.
It is not seasonality- or promotion-adjusted: broad holiday growth can qualify against
the preceding internal baseline. Review those contexts before using an expansion case;
later outcome-only cutoffs are not forced to preserve the initial demonstration cohort.

### Never miss a reorder window

Publish one mutually exclusive **primary availability symptom** per eligible pair:

| Finding | Rule / meaning |
| --- | --- |
| Due promised distribution gap | Fresh reported zero, due promise, no earlier observed positive stock. This does not prove the store was never stocked outside our history |
| Current out of stock | Fresh reported zero with earlier observed positive stock; no forecast is needed to preserve this fact |
| Availability unknown | Otherwise fresh inventory, firm forecast/receipt evidence or planned feed is missing; null is not zero or healthy |
| Future supply gap | Otherwise the conditional firm-plus-plans path still has base unfulfilled demand |
| Conditional plan dependency | Otherwise firm-only demand is uncovered but eligible plans conditionally cover it; informational dependency, not an unconditional stockout alarm |

Firm-sufficient and no-positive-demand projections do not create future-shortage
findings. Current zeros still surface regardless of projection completeness or zero
forecast demand. All current facts/checks remain independently accessible.

Evidence preserves both firm and conditional unmet units, reasons, the exact unchanged
retailer demand/firm receipt traces by reference, and all source plans including
converted, withdrawn and missed-placement statuses. Planned quantities never become
firm supply merely because a finding exists.

Projected event dates are **symptom dates**, not action deadlines. The earliest eligible
source planned placement date is a review date, not a claim that stock, authorization,
transport or capacity is available. Missing brand stock, PO authority and delivery
feasibility stay explicit. The approved 90-day normal production path is contextual
only: the layer never recommends a demand-plan increase to prevent a two-week shortage.
Branch-specific feasible actions/deadlines remain deferred to owner-led registry work.

Separately, a positive current report following a zero-stock episode with an observed
recovery in the latest seven closed days produces an `observed_recovery` finding.
Recovery and a future supply gap can coexist. Recovery is not attributed to software.

### Avoid the markdown

For a pair with a valid base projection and positive reference demand, evaluate
**28-day ending inventory**:

`target units = reference daily demand * excess_cover_days`

`firm excess units = max(firm ending units - target units, 0)`

`conditional excess units = max(conditional ending units - target units, 0)`

Default cover target: **40 days**, explicitly stored in configuration and every excess
calculation. This extends a reference *rate* into a cover target; it does not invent a
40- or 90-day forecast from the available 28-day feed. If firm excess is positive,
publish `excess_inventory` and retain conditional excess as separate member evidence.
Otherwise, if only the planned path exceeds target, publish the separately labeled
`conditional_excess_inventory` with conditional units/capital basis. Never add the
two views or create both excess groups for the same pair. An early shortage and later
horizon excess **can coexist** when a large order arrives late; don't suppress either
fact. Zero/unknown reference demand does not produce an infinite-cover claim.
Tiny numerical residues up to 1e-9 units are ignored.

`inventory capital = finding-basis excess units * approved unit cost`

`carrying cost over 28 days = inventory capital * annual carrying rate * 28 / 365`

No annual carrying rate is assumed by default. Supply it explicitly through
`MetricConfig` or `--annual-carrying-cost-rate` (0–1); adjust cover through
`--excess-cover-days`. Without cost/rate, physical excess still surfaces and the
missing dollar fields remain null. Firm orders are never presumed cancellable.
Conditional-only capital/carrying exposure is hypothetical if the plans execute,
not already committed capital; its finding code and supply/units basis preserve this.
Future eligible planned quantities/dates are available for a human to review, not
automatically recommended reductions. Actual markdown and savings are not predicted.

## Economics and overlap

Future-gap retail exposure comes from the existing conditional supply assessment;
it is not inventory capital or realized lost sales. No profit claim is introduced.
Group financial totals publish only if **all** members have that monetary field;
otherwise the group total is null and explicit valued-member counts remain. Member
amounts remain accessible. Do not sum repeated symptoms across promises or combine
retail exposure, capital and carrying cost into one impact number.

## Read-only API

- `GET /v1/metrics/findings?release_id=met_...&promise=expansion`
- `GET /v1/metrics/findings?release_id=met_...&finding_id=find_...`
- `GET /v1/metrics/finding-evidence?release_id=met_...&finding_id=find_...`
- Evidence also supports `product_id` and `scope_id` (canonical store ID); use evidence,
  not grouped findings, for a store filter. Pagination is bounded to 200 rows/page.

Ordering is stable lexical promise/item/code or store/member ID, **not prioritization**.
Follow source artifact references using existing metric endpoints and matching release
and canonical IDs. `facts_json`/`context_json` are serialized JSON objects with explicit
operands; they do not contain executable expressions or model-selected instructions.
Legacy v1–v4 releases remain readable under their original file inventory; requesting
findings from a release that never contained them fails explicitly, without substitution.

## Verification and remaining boundaries

Minimized fixtures exercise shortage, conditional/firm coverage, unknown inputs,
initial distribution, observed OOS/recovery, sustained versus benign/sparse growth,
excess, economics, evidence reconciliation, API integrity, version compatibility and
repeatability. Replay verifies every member resolves to an eligible canonical pair,
unique groups/members, counts/units and financial totals reconcile. Existing historical,
forecast vintage, PO/plan conversion and conservation checks continue unchanged.

This is authored demo evidence coverage, not a claim of universal stockout detection.
Ranker, owner-managed ontology/action branches, recommendation learning, exports and
replacement UI are not implemented by this layer. Human review of business thresholds
and response context remains necessary before treating findings as operating policy.
