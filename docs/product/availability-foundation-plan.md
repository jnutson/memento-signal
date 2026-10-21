# Availability assessment foundation plan

Status: the three previously authorized backend phases are implemented and verified;
predictive effectiveness is not accepted. The retailer-baseline reset below is also
implemented and verified, with its measured burden retained. UI, ranker and ontology
remain frozen.

## Retailer-forecast baseline reset amendment (2026-10-18)

The next proposed work is governed by `retailer-forecast-baseline-reset-plan.md`.
It supersedes conflicting forecast and benchmark instructions below, not the
historical completion receipt. Implementation was subsequently authorized; see
`retailer-forecast-baseline-acceptance.md` for the verification receipt.

- Make unchanged Walmart weekly forecast quantity the reference baseline; default
  bias multiplier 1, with explicit quantity-conserving daily allocation. Historical
  corrections are separately evaluated challengers, not an assumed improvement.
- The available input is the long-range feed. A separate short-range feed is not
  currently integrated; do not claim otherwise or invent a blend.
- Rebuild golden/holdout under new source identities with a reviewed slow/core/fast
  velocity mix, coherent cover and supply, and explicit per-case expectations.
- Require exact controlled-case correctness, then report advance warning coverage,
  minimum lead, date accuracy, warning burden and later supply changes separately.
  The old strict date score must not be described as absence of any advance warning.
- Sequence: source design/fixtures -> source v2 golden -> consumer baseline and
  golden evaluation -> frozen consumer/evaluator -> source frozen holdout -> consumer
  holdout evaluation. Source changes belong to walmart-synthetic; consumer changes
  belong here. Ranker, UI, ontology and learned recommendations remain deferred.

See the reset plan for proposal values, gates, repository/file ownership and
historical-learning direction. Existing metrics and releases remain reproducible.

### Backend completion receipt

- Descriptive correctness, exhaustive firm-supply assessments and temporal
  evaluation are implemented under `retail-backend-metrics-v2`.
- Golden and holdout each passed all ten cutoffs, six scoring cutoffs, repeated
  publication and adjacent-history checks. Current preview/Signal pointers stayed
  unchanged. Every cutoff publishes 10,500 supply assessments, with no ranking.
- 131 Python tests and Python type checking pass. No frontend file was changed
  during this backend-only implementation.
- Holdout 28-day pair-window recall is 30.17%, prediction yield 10.88%, and strict
  timely unique-episode recall 11.44% (149/1,303 episodes with an opportunity).
  These measurements do not justify the business promise of never missing a
  reorder window. Future investigation should distinguish demand uncertainty,
  newly committed supply and receipt-timing changes; no tuning against labels or
  action/priority policy was introduced to improve these scores.

## Backend completion authorization (2026-10-18)

Execute sequentially, without editing frontend files or existing Signal ranking:

1. **Descriptive correctness.** Evaluate historical mapping eligibility by day;
   do not apply a cutoff-only dimension status retrospectively. Carry only past
   assortment observations forward so missing inventory cannot erase exposure.
   Publish zero-stock episodes/duration and explicit coverage checks. Provide
   weekly/monthly comparisons for unit velocity, dollar velocity, total units and
   actual retail dollars. Normalized comparisons use same stores; total comparisons
   explicitly retain distribution changes. Keep legacy unit-velocity fields.
   Qualify weekday patterns using configurable coverage and minimum observations.
2. **Exhaustive supply metrics.** Publish exactly one non-ranked supply assessment
   per observed/promised pair plus daily low/base/high traces and dated PO evidence.
   Reuse pure inventory projection and demand-path calculations. Forecast inputs
   must be available at cutoff, with explicit model, vintage, shaping and fallback
   labels. No candidate-only admission, economics requirement, new planned orders,
   action selection, review deadline or priority score. Missing forecast, calendar,
   inventory, firm-supply reconciliation or economics remain separate reasons.
   Include cover, current outstanding POs, dated/overdue/undated supply, depletion,
   first unfulfilled demand, unfulfilled units and explicitly labeled retail and
   retail-minus-unit-cost exposure (not brand profit).
3. **Temporal acceptance.** Publish metrics without activation for all ten source
   cutoffs. Evaluate only six scoring cutoffs against later observable actuals.
   Verify immutable actual prefixes, stable qualified tiers, as-of boundaries,
   denominator reconciliation and repeatability. Score *new* reported-zero episodes
   separately from already-zero pairs at 7/14/28 days. Track unknown/missing outcome
   coverage, event misses, prediction yield and check appearance/clearance. No
   private latent truth, scenario labels or future outcomes enter calculations.
   Report results honestly; imperfect prediction is an evaluation finding, not a
   reason to tune against golden labels. Include an independent holdout run.

Demo defaults to be explicit in configuration: weekday evidence >=4 observations
per weekday and >=90% coverage; dollar trend materiality $50 (unit materiality
remains 7). A 28-day supply horizon cannot prove prevention along the 90-day
production path. Historical dimension status is unavailable in the current source
contract: use dated mappings and observed assortment for history, apply current
status only to current assessments, and publish this limitation rather than
inventing status history. Firm supply requires a currently known PO; overdue and
undated receipts do not enter future daily balances. Unknown supply is not zero.

Completion means backend fixtures, all-cutoff golden/holdout evaluation, deterministic
publication and backend API checks pass, with measured prediction limitations and
unchanged UI/Signal pointers. Ranking and ontology require a subsequent request.

## Approved metric-coverage amendment (2026-10-18)

Deliver basic metrics independently of alerts. A read-only Metrics surface must
make all store-items accessible, with item, region, and frozen store-tier rollups,
completed-period history, transparent checks, and relevant trend highlights.
This amendment precedes the broader Availability ranking/replay acceptance below;
it does not authorize a semantic registry or automatic action recommendations.

### Definitions and consolidation

Let U be fulfilled retail units, R actual retail sales dollars, and E the count of
valid eligible observed store-days in the period. Expected exposure is reported
separately; missing records are never zero-filled. Real zero-sales and reported
zero-stock days remain in realized velocity. Sales channels are summed before
counting store-days. Returns remain net sales, not estimated latent demand.

| Metric | Formula / interpretation |
| --- | --- |
| Store-day rate of sale | sum(U) / E |
| U/store/week | 7 × sum(U) / E; a different unit for the same velocity |
| $/store/week | 7 × sum(R) / E; actual retail sales, not contribution |
| Store-tier velocity | The same velocity, grouped by item and frozen store tier |
| Sales by region | sum(U), sum(R), and exposure-normalized velocity by source region |
| Reported store OOS | Latest closed inventory reports on-hand = 0; not proof of shelf OOS |
| Historical reported OOS rate | Zero-on-hand store-days / valid eligible inventory store-days |
| Reported in-stock rate | 1 − reported OOS rate |
| Due promised distribution | P = distinct promised store-items effective and due by the observation date |
| Stocked / confirmed zero / unknown | P = S + Z + M; S has positive fresh stock, Z has fresh zero stock, M has missing/stale inventory |
| Unconfirmed distribution | P − S = Z + M; show confirmed shortfall Z separately from unknown M |
| WoW / MoM velocity change | 100 × (current realized rate / previous realized rate − 1), plus absolute units/rate change |
| Day-of-week rate | μ[d] = units on weekday d / valid eligible exposure on weekday d |
| Day-of-week share / index | μ[d] / sum(μ), and 7 × share; unavailable if any weekday lacks exposure or the total rate is nonpositive |

Weeks are completed Saturday–Friday weeks; months are completed calendar months.
Do not compare partial periods. Trend percentages are null for a nonpositive
baseline (label positive growth from zero explicitly). Publish same-store trends:
only stores with at least 90% valid sales exposure in both periods participate.
Total sales/distribution change remains separately visible. Do not confuse these
descriptive trends with forecast-relative Demand Momentum.

Three velocity tiers per item use the first eight complete weeks and remain frozen
through replay. Require complete 56-day baseline coverage; otherwise label unranked.
Use deterministic store ID tie-breaking. The observed weekday pattern is distinct
from internal demand-shaping fallbacks and must not silently fall back to uniform.

Initial configurable relevance defaults, not business facts: at least 90% same-store
coverage, 15% rate movement, at least 7 units of exposure-adjusted movement, and two
consecutive same-direction weekly comparisons (one monthly comparison). These
control highlighting, not whether a basic metric is accessible.

### Source and population amendment

Keep the existing 1,000 trading stores and add 50 explicitly unstocked promised
locations: 1,050 promised stores × 10 items. Publish dense observed zero sales and
inventory for the additional locations, not absent observations. Version this
source profile and output roots; preserve previous worlds and packages.

Promised distribution is an observable, independently validated sidecar bound to
each release cutoff and file checksum. Its store-item rows carry effective dates,
stocking due date, minimum stock units (initially 1), and known-at timestamp.
Future or not-yet-due promises are not current distribution shortfalls. Avoid
adding these fields to unrelated existing source contracts.

The descriptive population is the union of observed pairs and known promises,
joined to active business identities. Missing inventory, assortment flags, demand
forecasts, or economics must not silently remove a due promised pair. Current
observed state and analytical/projection readiness are separate: a missing
forecast cannot hide a confirmed zero-stock observation. Missing/stale inventory
is an explicit check, not a fabricated stockout. Preserve lineage and coverage at
every rollup. Retain zero-stock facts even if they cannot enter a forecast rank.

### Delivery order and acceptance

1. Version and validate the synthetic distribution extension, preserving old data.
2. Publish deterministic descriptive metric Parquet artifacts and a bound manifest.
3. Serve all metrics with filters, pagination, history, weekday evidence, and checks;
   expose a basic read-only Metrics view without a top-ten restriction.
4. Verify formulas, missing-versus-zero handling, due dates, tier freeze, same-store
   comparisons, period boundaries, immutable publication, and real source coverage.
5. Complete the remaining Availability supply-map, ranker, and event-replay workstreams
   below before declaring the entire foundation accepted or starting the registry.

No AI chooses meanings or actions. Full action branches, prerequisites and
action-specific deadlines remain a later registry deliverable with the product
owner heavily involved in supplying and approving business context.

### Implementation boundary

The descriptive amendment is implemented in `metric_contract.py`,
`metric_queries.py`, `metric_source.py`, `metric_publication.py`, and
`metric_serving.py`, with the `/metrics` product route. See
`descriptive-metric-contract.md` for publication and operating instructions.
`metric_supply.py`, `metric_replay.py` and `metric_evaluation_serving.py` now implement
the approved supply and evaluation backend phases. Existing Signal publications,
Attention ranking and investigation remain unchanged. The original broader
Workstreams below still describe a later ranker/replacement UI scope, not permission
to implement it now. The ontology remains deferred. See the backend acceptance
receipt for precise evaluation definitions and remaining predictive limitations.

This plan is a prerequisite to `decision-semantic-registry-plan.md`. Complete and
evaluate this foundation before implementing a general semantic registry, AI
explanations, decision logging, or learned recommendations.

Implementation order: (1) `temporal-synthetic-evaluation-source-plan.md` in
`jnutson/walmart-synthetic`; (2) this metric/supply-map foundation in Memento;
(3) `decision-semantic-registry-plan.md`. Use the completed temporal source series
for foundation acceptance before starting the registry.

Here, the supply map means the deterministic state of inventory, firm PO quantities,
receipts, missing evidence, and remaining supply stages. The foundation must keep
requested orders separate from firm supply and expose enough evidence for later
action-specific rules. It does not implement the general action-branch matrix.

## Objective

Build a complete, deterministic view of store-item availability and a transparent v1
priority method for the business promise “never miss a reorder window.”

The foundation must answer four questions for every in-scope store-item:

1. Is the pair valid and sufficiently covered by the required data?
2. What is its current and projected availability state?
3. When must a human begin reviewing a response before material impact?
4. Where should it appear relative to other Availability assessments, and why?

The result is an exhaustive assessment population. The ranked Attention view becomes
one projection of that population rather than the only stored product state.

## Why this precedes the semantic registry

The current system has strong candidate calculations but does not yet prove complete
business coverage:

- it emits Availability signals only after a store-item qualifies as projected risk;
- healthy, not-applicable, and insufficient-data pairs are not materialized as
  individually queryable assessments;
- the API exposes only the overall top ten and refuses detail access outside it;
- current reported zero-on-hand state and historical in-stock rate are not explicit
  published metrics;
- the active local release uses the baseline ranker and does not publish supply
  context;
- no current evaluation contract measures event recall, warning lead time, or alert
  burden.

A semantic registry built before these gaps are closed would organize incomplete
product truth. This plan establishes the truth surface first.

## Product boundary

### In scope

- one explicit store-item assessment population;
- deterministic Availability metric coverage;
- current reported zero-on-hand and projected-risk classification;
- a deadline-first Availability ranker v1;
- immutable assessment publication and lineage;
- complete read-only serving and a basic Availability monitoring surface;
- historical replay and ranking evaluation using synthetic data;
- reconciliation between total population and all assessment states.

### Out of scope

- a general metric, outcome, response-option, or ontology registry;
- AI-generated explanations;
- action selection, authorization, or execution;
- decision and outcome logging;
- machine learning or contextual-bandit recommendations;
- item-retailer expansion proof;
- cross-outcome or cross-economic-basis ranking;
- a graph database, feature store, or new persistent datastore;
- customer or production data;
- production deployment, authentication, or tenancy.

## Definitions

### Assessment grain

```text
assessment release x observation date x retailer x store x item
```

One and only one row must exist for every pair in the declared assessment population.

### Reported zero-on-hand

`reported_zero_on_hand` means the latest closed inventory observation reports zero
on-hand units while the store and item remain active, assorted, and replenishment
enabled. It must not be labeled “shelf out-of-stock” unless a future source contract
provides on-shelf availability.

### Firm supply

The core assessment uses outstanding, non-cancelled firm replenishment known at the
release cutoff. Assumed planned replenishment and supply-timing sensitivities may be
published as separate evidence, but must not make the core committed-supply assessment
appear healthy.

### Material impact and timing

Use one configurable production path for the demo. Category-specific sewn/molded
production paths are not required. Keep the current legacy supply model unchanged
until a new version is explicitly published.

Preserve distinct timing for obtaining a retailer PO, fulfillment, brand-DC-to-retailer-DC
transport, retailer processing, and delivery to the store. Existing brand stock does
not authorize a shipment without a valid PO and sufficient ordered quantity. A request
to increase an order must not appear as committed inbound; the source demo assumes
seven elapsed days to obtain the PO, followed by remaining delivery stages.

Any single human review allowance used in v1 ranking is an explicitly labeled review
assumption. It must not imply that every response can affect the imminent shortage.
Action-specific start-by dates and prevention/mitigation eligibility are a required
registry deliverable. Until those rules exist, use evidence and review language rather
than presenting demand-plan increases as a remedy for a two-week stockout.

Publish both:

- `projected_depletion_date`: first date the projected closing balance reaches zero;
- `projected_unfulfilled_date`: first date projected demand cannot be fulfilled.

The implementation plan must declare which date anchors the human review deadline and
use it consistently. The initial default is the earlier depletion date because the
outcome is protecting availability before stock is exhausted. Lost-unit and economic
estimates remain based on projected unfulfilled demand.

```text
start_by_date = projected_depletion_date - decision_lead_time_days
decision_slack_days = start_by_date - observation_date
```

Elapsed-day and calendar conventions must remain explicit and versioned.

## Workstream 1: assessed population contract

Define the exact population before changing signals or ranking.

For forecast-based assessments, the original scope requirements were:

- an active retailer location;
- an active item mapped to the supported company and brand cohort;
- an applicable company-item mapping;
- a latest closed inventory observation;
- active assortment and replenishment flags at the cutoff.

Pairs excluded by business scope are `not_applicable`. Pairs inside business scope but
missing required analytical inputs are `insufficient_data`.

The release manifest must report:

- total candidate store-item pairs before scope rules;
- in-scope population count;
- count by assessment state;
- count by reason code;
- count with complete demand, inventory, forecast, inbound, reaction, and economics
  inputs;
- a reconciliation showing that every in-scope pair has exactly one assessment.

No pair may disappear silently. The approved amendment above supersedes any rule
that would exclude a promised pair or hide observed state behind missing analytical
inputs. Publish current-state coverage independently of forecast readiness.

## Workstream 2: Availability assessment artifact

Publish a new immutable artifact, provisionally named:

```text
availability_assessment.parquet
```

The final name is an implementation decision, but the artifact must remain distinct
from canonical inputs, ranked Signals, and investigation evidence.

### Required field groups

| Group | Required fields or concepts |
| --- | --- |
| Identity | assessment ID, retailer, store, item, observation date |
| Scope | store status, item status, assorted, replenishment enabled |
| Current state | on-hand units, reported-zero-on-hand flag |
| Historical coverage | valid sales days, valid inventory days, recent reported in-stock rate |
| Demand | 28-day base demand, low/base/high sensitivity totals, forecast WAPE or unavailable reason |
| Supply | firm inbound units, dated inbound, overdue or undated inbound state |
| Projection | low/base/high depletion dates, base unfulfilled date, projected lost units |
| Economics | estimated lost retail sales, estimated contribution impact, economic basis |
| Timing | decision lead time, start-by date, decision slack |
| Evidence quality | forecast quality, completeness, timing stability, confidence |
| Assessment | state, attention eligibility, reason codes, priority band and rank |
| Lineage | source release, canonical dataset, calculation, ranker, and configuration versions |

Nullable fields must use explicit reason codes. Null must not ambiguously mean healthy,
missing, not applicable, or calculation failure.

### Initial metric coverage

The first implementation should calculate or explicitly classify:

- latest reported on-hand units;
- reported-zero-on-hand state;
- consecutive reported zero-on-hand days where history is complete;
- recent reported in-stock rate over one declared window;
- units and days of cover when reference demand is positive;
- 28-day low, base, and high demand;
- firm inbound quantity and timing;
- projected depletion and first-unfulfilled dates by supported path;
- projected lost units, lost retail sales, and contribution;
- forecast quality, data completeness, and timing stability;
- reaction or review lead time, start-by date, and slack.

Do not add speculative metrics merely to make the artifact look comprehensive.

## Workstream 3: deterministic state classification

Every in-scope store-item receives exactly one state. Apply rules in a fixed precedence
order so classifications cannot overlap.

1. `not_applicable`
2. `insufficient_data`
3. `reported_zero_on_hand`
4. `response_window_missed`
5. `act_now`
6. `prepare`
7. `watch`
8. `healthy_28d`

Initial semantics:

- `not_applicable`: outside the declared active, assorted, replenishable population.
- `insufficient_data`: inside scope but missing or failing required analytical inputs.
- `reported_zero_on_hand`: latest closed reported on-hand is zero.
- `response_window_missed`: projected depletion exists and decision slack is negative.
- `act_now`: decision slack is zero through two days.
- `prepare`: decision slack is three through seven days.
- `watch`: projected depletion and positive unfulfilled demand exist, with more than
  seven days of decision slack.
- `healthy_28d`: no qualifying base-path availability impact occurs in the 28-day
  horizon.

Thresholds and horizon belong to the versioned assessment contract. Changing one must
produce a new assessment contract version.

## Workstream 4: Availability ranker v1

Create an Availability-specific, deadline-first ranker. Do not use the mixed-signal
composite rank as its primary policy.

### Eligibility

Only these states participate in the attention rank:

- `reported_zero_on_hand`
- `response_window_missed`
- `act_now`
- `prepare`
- `watch`

Other states remain queryable but unranked.

### Ordering

Use a deterministic lexicographic key:

```text
state priority ascending
decision slack ascending
estimated lost retail sales descending
projected lost units descending
confidence descending
store ID ascending
item ID ascending
assessment ID ascending
```

The initial economic tie-breaker remains estimated lost retail sales to preserve the
current Availability economic basis. Estimated contribution must remain visible as a
separate value. Changing the primary economic basis requires an explicit product
decision and a ranker version change.

### Published ranking fields

- `priority_band`
- `priority_rank`
- `ranker_version`
- `rank_reason`
- every input used by the ordering key

A composite score is not required. If retained for visual continuity, it must not
override the lexicographic rank and must be labeled as secondary presentation data.

Impact percentiles may remain diagnostic, but they must not determine whether an
absolute deadline is surfaced.

## Workstream 5: publication and serving

Publish the assessment set completely or not at all. Bind the manifest to source,
canonical, calculation, classification, ranker, and configuration hashes.

Read-only serving must support:

- release identity and coverage summary;
- count by state and reason code;
- a pageable or bounded Availability assessment list;
- filters by state, store, item, deadline range, and minimum evidence quality;
- detail access for any assessment, not only top-ranked rows;
- evidence for calculation and classification;
- a derived top-attention query without removing access to the rest of the population.

Failed integrity or validation must fail closed and must never fall back to sample
metrics.

## Workstream 6: end-user Availability surface

Build only the minimum surface needed to evaluate the outcome:

- a coverage summary showing assessed, healthy, attention, insufficient-data, and
  not-applicable counts;
- an Availability queue grouped or filterable by priority band;
- store, item, current inventory, projected depletion, start-by date, slack, lost
  units, economics, and evidence quality;
- clear distinction between reported zero-on-hand and projected future risk;
- detail access for any assessed pair;
- explicit data-gap and assumption language.

The default view may show a small number of priorities, but users must be able to reach
the complete assessed population. The existing cross-signal Attention experience may
remain available but is not the acceptance surface for this plan.

## Workstream 7: historical replay and evaluation

Evaluate the Availability contract and ranker using synthetic historical cutoffs. The
evaluation must prevent future data from entering features or release-time decisions.

### Ground truth

The initial observable event is a later `reported_zero_on_hand` state under the same
active, assorted, and replenishment-enabled rules. It is not proof of on-shelf
availability or realized lost sales.

### Required measures

- assessed-population coverage rate;
- event recall at 7-, 14-, and 28-day horizons;
- miss rate;
- alert precision or yield;
- median and distribution of warning lead time;
- false alerts per 1,000 assessed store-items;
- alert volume by priority band;
- event concentration by rank cutoff;
- results by confidence band, store, item, and category where sample sizes permit;
- stability of rank and state under identical replay inputs.

The primary v1 evaluation should optimize event recall subject to an explicit,
manageable alert burden. A ranking change must be justified by these outcome-facing
measures, not only by a different distribution of composite scores.

Evaluation outputs must be immutable, versioned, and separate from Signal publication.

## Workstream 8: release and contract alignment

Before presenting the new Availability surface:

- choose one current calculation and ranker contract;
- publish an assessment release using that contract;
- ensure the current pointer references the intended release;
- remove ambiguity between the active baseline ranker and the documented urgency
  policy;
- verify that manifests, APIs, UI labels, and documentation report the same versions;
- keep assumed supply context optional and distinct from the committed-supply core.

Do not rewrite or mutate earlier immutable releases.

## Verification requirements

Use only synthetic, minimized fixtures. Verification should cover:

- one fixture for every assessment state;
- classification precedence when multiple conditions are true;
- zero and positive demand;
- exact depletion without unfulfilled demand;
- current zero-on-hand with and without firm inbound;
- overdue, undated, cancelled, partial, and duplicate-version replenishment lines;
- missing forecast, inventory, reaction, economics, and calendar coverage;
- low, base, and high timing stability;
- population and state-count reconciliation;
- deterministic ranking ties and replay identity;
- immutable publication and checksum validation;
- complete API access beyond the default attention cutoff;
- browser flows for coverage, filtering, detail, data gaps, and mobile use;
- end-to-end browser-to-API-to-Parquet verification.

## Completion criteria

This prerequisite plan is complete only when:

1. Every declared store-item pair is classified exactly once.
2. Healthy, attention, insufficient-data, and not-applicable states reconcile to the
   declared population.
3. Current reported zero-on-hand and projected future risk are visibly distinct.
4. Core risk uses firm supply; assumed replenishment remains separate evidence.
5. Priority is deadline-first, deterministic, and explainable from published fields.
6. Every assessment is accessible through the read-only serving boundary.
7. The user can inspect complete Availability coverage rather than only the top ten.
8. Historical replay reports recall, miss rate, lead time, precision or yield, and
   alert burden.
9. Release, ranker, calculation, API, and UI versions agree.
10. Relevant automated checks pass, the diff remains in scope, and no sensitive data
    is introduced.

## Handoff to the semantic direction

After these criteria are met, the implemented Availability contract becomes the first
concrete input to `decision-semantic-registry-plan.md`:

- assessment fields become candidate governed metrics;
- state rules become the first outcome assessment policy;
- rank reasons become inputs to explanation packets;
- evaluation measures become outcome and guardrail definitions;
- the complete Availability population becomes the reference pattern for later
  expansion and inventory outcomes.

This plan does not authorize implementation. Begin implementation only after a
separate, explicitly accepted build scope.
