# Monday Report + Attention Queue — Demo Contract

Status: approved by the user in chat, including implementation of the cleanup.
Contract version: `memento-monday-demo-v1`

## Product promise

On Monday morning, a Miro Toys user opens a report for Miro Spark at synthetic
Walmart US, sees stockout risk, excess inventory, and demand overperformance, and
follows each finding into a ranked attention queue and inspectable evidence.

The completed workflow is understanding and prioritizing an exception. It does
not include ordering, replenishment execution, or tracking whether a user acted.

## Authority and existing contracts

This is the single authority for the demo's product scope and
acceptance behavior. For this demo it supersedes conflicting UI and scope passages
in `mvp-product-shape.md`, `../plans/memento-signal-three-metric-mvp.md`, and
`../plans/attention-ui-integration.md`. Those documents remain historical context
where they conflict; their broader features are not additional demo requirements.

Existing validation, deterministic calculations, ranking, immutable publication,
lineage, and trust boundaries remain in force. This document does not change metric
formulas, thresholds, rank weights, or source contracts. The metric documentation
contains mixed OOS-only and three-signal language; discrepancies with implemented
behavior must be recorded and resolved explicitly before claiming demo acceptance.
Do not silently change calculations to match this presentation scope.


## Fixed demo boundary

- One company, brand, retailer, and explicitly declared synthetic cohort.
- One pinned, immutable signal publication and its bound source releases,
  configuration, canonical dimensions, and evidence for the entire session.
- Reuse the corrected-scale ten-item, 1,000-store slice if its local artifacts and
  lineage pass preflight. This is the engineering cohort, not the earlier
  90-item, 2,000-store target.
- Eight completed weeks support demand evidence; projections cover 28 days.
- Report date, source cutoff, observed period, and projection horizon are explicit.
  “Monday report” names the review cadence; it does not relabel the existing
  Saturday synthetic cutoff as Monday or imply live data.
- Local, read-only demonstration using DuckDB over published Parquet. No new
  ingestion pipeline, persistent datastore, external service, or deployment.

## One workflow

### 1. Open the Monday report

The report is the entry point. Show brand, retailer, cohort, reporting period,
as-of cutoff, and a visible synthetic-data label. Present three exception cards:

| Display label | Existing signal selection | Report summary |
|---|---|---|
| Stockout risk | `availability`, direction `risk` | Eligible store-item signal count and leading case's estimated retail sales exposure |
| Excess inventory | `inventory_imbalance`, direction `excess` | Eligible store-item signal count and leading case's inventory capital exposed |
| Demand overperformance | `demand_momentum`, direction `acceleration` | Eligible store-item signal count and leading case's forward demand gap |

Each card identifies the leading eligible case by published overall rank and links
to its queue selection. Summary counts cover the complete eligible selection,
not just the displayed ten. Label them as store-item signals, not unique products
or stores. Leading-case amounts are labeled as such, not portfolio totals.

The initial report needs no cross-signal financial total, weekly publication
comparison, general sales dashboard, generated narrative, export, or email delivery.

### 2. Drill into the attention queue

The queue offers All, Stockout risk, Excess inventory, and Demand overperformance
views. All shows the published overall top ten. Category views show up to ten
matching signals in published rank order from the complete publication, including
cases outside the overall top ten. Demand overperformance selects acceleration
only; existing deceleration signals may remain visible in All with accurate labels.

Filtering never recalculates scores or renumbers ranks. A published overall rank
of 24 remains 24. No type quotas, forced promotion, or favorable-case selection
changes the natural overall queue. Category counts and leading cases must use the
same selection rules as the report.

Selecting a report card opens its category with the leading case selected. Returning
to the report and reopening a category preserves the same publication and results.

### 3. Inspect evidence

Each detail identifies the item and store, states what was detected, and shows its
native impact, timing, published confidence score, and one primary evidence chart:

| Finding | Primary evidence | Economic meaning |
|---|---|---|
| Stockout risk | Projected inventory, dated inbound, and depletion timing | Estimated retail sales exposure over the projection horizon |
| Excess inventory | Projected inventory versus the published target | Inventory capital exposed; 28-day carrying cost shown separately |
| Demand overperformance | Eight historical actual-versus-forecast weeks, distinguishing six baseline and two recent weeks | Forward demand gap; retail and contribution opportunity labeled separately if shown |

Use existing published values and evidence. Any additional derived report value
must be defined and verified on the backend; the frontend formats and plots values
without computing business metrics, eligibility, or rank.

Keep confidence components, sensitivity paths, calculation versions, and source
lineage available in expandable evidence. Supply scenarios, anticipated order
schedules, and action-feasibility diagnostics are outside the primary demo flow.
If supply assumptions affect the published result, disclose that basis and make its
version and limitations accessible; simplifying the screen must not hide it.

## Meaning and trust rules

- “Stockout risk” means projected end-of-day book-inventory depletion. It does not
  assert current shelf unavailability or observed lost sales.
- “Demand overperformance” means persistent acceleration relative to the existing
  forecast/baseline calculation, beyond its error-band rule. It does not mean
  year-over-year growth, promotion lift, or causal demand attribution.
- Inventory capital, carrying cost, revenue exposure, and contribution opportunity
  remain distinct. Do not add them into one opportunity or savings figure.
- Confidence is an evidence-quality score, not a probability. Missing values stay
  missing. Projections are estimates, not realized outcomes or guaranteed savings.
- All surfaces resolve to the pinned publication. An updated current pointer must
  not mix releases mid-session. An unavailable pinned release produces a clear error.
- Preserve validation and source lineage. Do not expose raw source payloads,
  confidential unit costs, private evaluator truth, or machine-specific paths.

## Demo preparation and acceptance

1. A documented local preparation command selects a declared synthetic release
   without modifying its source extracts or historical publications. A documented
   startup command launches the read-only demo.
2. Preflight verifies the selected publication and its bound artifacts and confirms
   at least one eligible case for each of the three report selections, including an
   acceleration case. Missing categories block demo readiness; do not fabricate
   findings, relax thresholds, or change ranking to fill them.
3. A real browser-to-API-to-Parquet check opens the report, follows each card into
   its selected case, checks the relevant evidence, and returns to the report.
4. Report counts, category membership, leading cases, and queue ranks agree with
   the complete pinned publication. Category drilldown works even when that type
   is absent from the overall top ten.
5. Detail charts match published evidence, units, dates, and economic labels.
   Empty categories, loading, unavailable releases, and invalid evidence have
   explicit states and never display fabricated or stale findings.
6. Existing relevant validation, calculation, replay, API, and UI checks pass.
   Report checks not run and any unresolved discrepancies. The diff contains only
   intended code/docs and minimized synthetic fixtures; generated data stays ignored.

Acceptance establishes a reproducible demonstration, not commercial calibration,
complete stockout detection, or validated operational recommendations. The recorded
corrected-slice run has no availability cases in its overall top ten; category
drilldown is intentional and must not be presented as a mixed overall top ten.

## Cleanup and explicit exclusions

Align the README and conflicting scope documents to this contract.
Consolidate the product around the report, queue, and detail. Remove superseded UI
code or dependencies only after tracing their consumers and preserving required
compatibility and verification. Backend refactoring is limited to what this
workflow needs; broad repository reorganization is not a prerequisite.

Deferred: recommendations, order/transfer execution, editable scenarios, workflow
assignment/status persistence, new retailers, expanded cohorts, new data sources,
weekly change claims, causal analysis, new forecast models, 3D scene work,
authentication, production hosting, and real customer data.

## Delivery boundary

Implementation is limited to this approved cleanup and workflow. No external data,
production release, new datastore, or operational execution is authorized. The
self-contained four-item fixture is a fallback demo cohort when the corrected-scale
slice is not available locally; its scale and synthetic assumptions are explicit.

## Approved hosted demo-1 extension

The user subsequently authorized hosting `demo-1` in the existing Vercel team
`memento-loop`. Preserve the current report, queue, and evidence UI. Add only a
start page and a restart control that restores the initial browser state. Freeze
one validated synthetic publication per deployment; concurrent sessions share no
mutable server state. A server-side read-only API may serve the existing pipeline's
validated response bundle. No calculation or ranking moves into the browser.
Hosting this isolated demo is authorized; it does not authorize changes to
`memento-os`, real customer data, authentication controls, or other deployments.
