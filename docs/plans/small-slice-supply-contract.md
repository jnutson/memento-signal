# Small-slice supply and actionability contract

Approved in chat on 2026-10-12; implemented 2026-10-13. This contract supersedes
the 90-item/2,000-store iteration cohort and single reaction-allowance assumptions
for the optional supply-aware mode. Legacy mode remains available and unchanged.
The supply projection implementation is `expected-replenishment-v4`, which fixes
publication ordering, handles partially invoiced orders as disjoint open/transit
portions, and records committed-supply ranks for comparison.

## Inputs and identity

Core: existing source items 710000001–710000010, 1,000 existing stores selected by
ascending SHA-256 of their decimal store IDs, and 2026-08-01 through 2027-01-29
(182 days). Evaluation adds 2027-01-30 through 2027-02-26. Slice publication preserves
all retained values, item mappings, PO event versions, and original simulation lineage.
Calendar and original forecast support remain declared supporting inputs, rather
than six-month fact observations. No future private truth is consumed.

Source packages retain their six-plus-four v1 schemas. A separately hashed supply-model
JSON is referenced in the slice manifest. Canonical manifests preserve that reference,
slice selection, parent hash, and engineering-only calibration status. Supply-aware
signals use `memento-signal-metrics-v1.1.0` and
`memento-signal-actionability-ranker-v1`. Calculation/configuration fingerprints
separate them from every legacy immutable signal set.

The slice inherits the parent's known demand/economic scaling defect. It must not be
used for calibrated dollar estimates. No existing fact is rescaled or regenerated.

## Assumption model

The Synthetic Data reference `config/miro_iteration/supply_model.json` declares
effective dates, classification, provenance, stage ranges, category assignments,
a shared illustrative domestic route, action prerequisites, and reorder policy.
The factory/vendor DC/customer DC/store nodes are roles, not observed physical facilities.
No DC balances, manufacturing capacity, or approval authority are invented.

Every duration is minimum/typical/conservative **elapsed calendar days**. Ranges
must be ordered, nonnegative, bounded, and resolve through valid stage references.
Production profiles distinguish molded, sewn, and assembled toy categories; tooling
is assumed to exist. Generic manufacturing and transport references inform the process
structure, not the exact numeric ranges. Those ranges remain illustrative assumptions,
not supplier quotations or measured retailer lanes. Research references:

- https://www.protolabs.com/services/injection-molding/on-demand-manufacturing/molding-options/
- https://www.maersk.com/de-de/support/faqs/2026/03/10/how-long-does-ocean-freight-take

## Arrivals and planning

Outstanding supply is ordered minus received, latest version known at cutoff,
excluding cancelled lines. In-transit estimates start from the DC invoice milestone;
unshipped estimates start from order creation and include remaining fulfillment stages.
Elapsed time is not restarted at each snapshot. An explicit future receipt date
anchors the typical date; stage assumptions provide early/conservative sensitivities.
An explicit overdue date stays overdue and contributes no automatically rescheduled
supply. Missing dates use milestone-plus-lead-time estimates, with overdue typical
estimates excluded rather than silently shifted into the future.

The planned-replenishment overlay uses only frozen forecast, current stock, outstanding
firm supply, and declared reorder/target-cover days. It places assumed orders when
inventory position reaches the reorder threshold. Quantity is the ceiling of the
gap to target cover. Future firm supply and existing planned supply are included in
position, preventing duplicate replenishment for the same outstanding units.
Each later snapshot rebuilds plans from newly observed firm PO state; prior plans
are not appended as additional supply. No later actual orders determine earlier plans.

Committed supply and early/typical/conservative planned-supply sensitivities are
reported separately, holding demand constant. They are not probabilities and are
distinct from low/base/high demand sensitivity paths. Supply-aware availability
uses typical planned arrivals, at least one projected unfulfilled unit, and the
existing valid-observation/completeness gates. Existing demand equations remain
unchanged; inventory-excess projection uses the same typical planned inbound.

## Actionability

Actions: expedite an existing shipment, release vendor stock, or request incremental
production. Stage sums determine each action's duration range and typical/conservative
slack relative to material impact. Timing is robust if conservative completion fits,
conditional if only the early completion fits, and too late otherwise.

Feasibility is unknown when prerequisites such as vendor stock, capacity, or authority
are unavailable, or not applicable when no existing shipment can be expedited. Unknown
or missing prerequisites contribute **zero** actionability; they are never inferred
from a route map. With confirmed prerequisites, robust timing scores 1, conditional
timing 0.5, and too-late timing 0. The maximum supported action score replaces the
reaction component while rank weights remain impact 0.50, actionability 0.30,
confidence 0.20. Excess/deceleration have no supported supply intervention in this
bounded action catalogue and receive zero rather than a fabricated production action.

Legacy reaction days/slack are retained and labeled as legacy allowances. The detail
context supplies actual per-action stage ranges, slack, missing prerequisites, and the
old reaction score for comparison. The current source contains no authority/capacity
confirmations, so options are explanatory and conditional, not executable recommendations.

## Publication, API, and UI

Supply-aware publication atomically adds `supply_context.parquet`, with exactly one
JSON context per signal. It is bound by the immutable manifest's file hash and
configuration. Context exposes derived quantities only, not raw unit costs.
The API's additive optional context is validated against strict response models;
legacy releases return null context. Frontend runtime validation also rejects malformed
ranges and positive scores with missing prerequisites.

The UI preserves the overall top-ten/filter contract, labels uncalibrated economic
amounts, compares supply timing, and shows arrival ranges and action prerequisites.
The context is structured evidence suitable for later AI reasoning. No agent platform,
order execution, production commitment, or new datastore is introduced.

## Verification

Check exact slice cohort/density, retained-value equality against parent files, cutoff
safe PO state, unchanged parent hashes, immutable slice replay, lead-time boundary
cases, planning reproducibility/no duplicated firm supply, missing prerequisites,
API/UI evidence, independent signal recomputation, and measured outcome quality.
Acceptance measures signal reduction and quality; it does not enforce a favorable
composition or claim improved precision without evaluation.
