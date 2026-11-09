# Demo completion: three promises, one coherent product

Date: 2026-10-19
Status: partially executed. The synthetic source and planned-order backend bridge
were explicitly authorized and implemented. The deterministic three-promise
finding/evidence layer was subsequently authorized and implemented; see
`finding-evidence-contract.md`. Queue/presentation work is not authorized merely by
this plan; UI, ranker and ontology remain untouched.

## Decision

Finish a credible retail-analysis demo, not a forecasting research platform.
Use a deliberately authored synthetic account to demonstrate finished analysis:
what changed, what it means, its financial scale, when a decision matters, and the
evidence a person needs to decide. The product owner supplies business meaning;
neither an LLM nor a synthetic scenario label decides the action.

The controlling presentation is the [Memento Loop growth deck](https://memento-loop.co/growth/),
reviewed on this date. It promises expansion evidence, reorder-window visibility,
overstock visibility, a dollarized ranked queue, drill-in detail and exportable reports.
Its pilot offer also promises validated customer data, with visibility within two
weeks and an Attention Queue within one month. Demo completion does not certify
those customer onboarding commitments or multi-retailer production readiness.

This plan changes the proposed finish line. Previous instructions deferred ranker
and replacement UI work; those remain untouched until a later implementation request
explicitly approves the relevant phases here. The general ontology remains deferred.

## What we keep, and what we stop

Keep the 10-item account, 1,000 trading stores plus 50 promised/unstocked stores,
119-day history, retailer-forecast baseline, existing canonicalization, deterministic
metrics, immutable publications, lineage and replay machinery. Keep all prior worlds
and evaluation receipts. Do not start ingestion over or rewrite the generator.

Stop optimizing aggregate stockout recall as the definition of demo completion.
Stop adding scenario families, forecast models or infrastructure unless a named
demo story cannot be calculated honestly without them. Freeze the old benchmark as
diagnostic evidence, not a scoreboard to massage until it passes.

The backend already exposes descriptive metrics and exhaustive firm-supply assessments.
The older Signal/UI path has separate publications and assumptions. The completion
work must reconcile these paths into one pinned demo release, not simply display new
metrics beside a stale ranked queue. Existing supply code also includes a declared
expected-replenishment overlay: reuse its projection mechanics where appropriate,
but source-published planned order quantities are the primary expected-supply input,
not orders invented by Memento from a replenishment policy.

## Promise-to-demo contract

| Deck promise | Required demonstration | Honest boundary |
| --- | --- | --- |
| Get more doors, with proof | Identify sustained SKU/store-cohort outperformance; show U/store/week, $/store/week, same-store change, distribution and availability; export a buyer-ready evidence brief | A case to discuss expansion, not a prediction that a buyer will approve it. No category/competitor benchmark unless supplied |
| Never miss a reorder window | Surface confirmed current OOS separately from projected gaps; distinguish routine replenishment from an exception; explain the latest review date for a named response path | Conditional projections, not a universal guarantee. A review deadline does not authorize an order |
| Avoid the markdown | Show excess units at a declared horizon relative to a declared cover target, inventory capital and carrying cost; identify whether a future order can still be reviewed | Exposure, not an actual markdown prediction or a claimed saving. Firm commitments do not become cancellable by assumption |
| Dollarized and ranked | A small queue of distinct business issues with visible priority reasons and consistent economics | Retail sales exposure, contribution and inventory capital are separate; do not sum overlapping stories or unlike bases |
| Finished analysis, detail and reports | Plain-language finding, relevant trend/chart, calculation evidence, response considerations and usable export | Deterministic prose is sufficient; generative AI is optional and cannot introduce facts or select actions |
| Your decisions, measured outcomes, improving loop | Compare the same issue across two or three dated releases; show observed state changes and, if demonstrated, an explicitly simulated human decision | A later recovery is not proof our intervention caused it. Learning is future capability, not a required demo subsystem |

Exceed the deck through clarity and trust: explain *why* an issue deserves attention,
why a superficially similar healthy case does not, and what evidence is missing.
Do not exceed it through stronger unsupported performance claims.

## A bounded demonstration account

Author a small story pack inside the existing account rather than redesigning all
10,500 store-item pairs. Proposed scope: six positive story groups and four controls.
Groups may contain multiple stores; their membership and expected observations live
in source/evaluation QA, never in product scoring or narrative selection logic.

| Story | Required observable evidence and expected behavior |
| --- | --- |
| 1. Unfulfilled distribution | The existing 50 due promised stores have confirmed zero stock. Show 50 missing locations per item where applicable, not 500 distinct missing stores. Distinguish never-stocked distribution gaps from stockouts after prior positive stock |
| 2. Current store-level OOS | Previously stocked stores become zero, with valid inventory history and affected-store count. Show duration, availability history and estimated demand exposure separately from observed sales |
| 3. A preventable near-term supply gap | A named group has forecast demand, known stock and late/insufficient firm inbound. Show the gap, quantity, review deadline and only the response paths that can arrive in time |
| 4. Sustained outperformance | An item/cohort has persistent in-stock velocity improvement, adequate exposure and a stated internal comparison. Show broad versus concentrated improvement and assemble expansion evidence |
| 5. Excess inventory | Slower sell-through plus stock/inbound creates measurable excess against an owner-approved cover target. Include an uncommitted future order for review; never assume a firm PO can be reduced |
| 6. Observable resolution | Across later releases, a supply gap is covered, stock recovers, or an excess outlook improves. Explain changed inputs and resulting priority; label any decision history as simulated |
| Control A: routine ordering | Committed-only inventory runs down, but observable synthetic retailer planned order quantities and their expected arrival path cover demand. Preserve committed exposure and planned-order status; do not portray it as an unavoidable imminent stockout or guaranteed coverage |
| Control B: already covered | Known firm inbound arrives before depletion. No near-term shortage alert |
| Control C: benign/sparse movement | A one-week spike or low-volume percentage jump does not produce an expansion headline |
| Control D: missing evidence | Missing/stale inventory or absent forecast produces an explicit unavailable state; never fabricate zero stock or precise risk dollars |

Use the existing velocity mix. Increase velocity only if an identified story requires
a different business assumption, not to make detection artificially easy. Choose two
or three release dates that naturally show the stories developing. These are curated
demo dates, not dates selected to imply broad statistical effectiveness.

## Minimal additional data: explicit assumptions, not hidden completeness

First audit each story against existing observable fields. Add only a small,
versioned synthetic sidecar where evidence is genuinely missing. Required fields need
an identity, unit, effective interval, known-at time and provenance/classification.

- Retailer planned order quantities published in each synthetic release, modeled on
  Walmart's Order Demand Forecast. These are issue-time plans, not the source's
  realized future POs. Planned supply stays separate from firm supply; unknown
  stock/capacity remains unknown. A declared source replenishment policy can generate
  these plans, but Memento consumes the published quantities rather than recreating
  them. A policy-derived fallback is optional, explicitly labeled, and never silent.
- Existing approved unit economics and carrying-cost assumptions, with an explicit
  definition of contribution. Missing economics blocks dollarization, not the fact.
- A declared excess-cover target and internal expansion comparison, approved by Josh.
- Where demonstrating response feasibility requires it, observable synthetic brand
  stock, PO authorization and shipment status. Do not expose private future events
  or private scenario labels as inputs.

Do not add competitor data, buyer intent, shelf audits, retailer order authority,
short-range forecasts or cancellation rights unless genuinely represented. Reported
on-hand zero is not independent proof of an empty shelf; positive on-hand is not
proof the item is physically accessible to shoppers.

## Supply interpretation: the small fix that matters

Use unchanged Walmart demand as the base. Present two distinct supply views:

1. **Committed supply:** what known inventory and firm POs cover today.
2. **Expected replenishment:** what happens if the retailer's published planned order
   quantities are placed and delivered, with their vintage, dates, destination and
   prerequisites identified. Any additional timing assumptions remain explicit.

Do not silently turn expected orders into firm inventory. Compare them to identify
routine replenishment needs versus exceptions, and preserve an uncertainty/review
state when the expected path depends on unverified prerequisites. Expected coverage
does not justify hiding a late, inadequate or unconfirmed order approaching its deadline.

### Planned-order input amendment — 2026-10-19

Josh confirmed that synthetic planned order quantities must be present as data,
not merely inferred by Memento. The supplied [Store Sales Details page](https://developer.walmartdataventures.com/psp-bi-link/reference/store-sales-details)
describes sales grain, not the order-forecast fields. Walmart's [PSP Glossary](https://developer.walmartdataventures.com/psp-bi-link/page/glossary)
separately documents Order Demand Forecast fields: `order_each_qty`, `order_place_dt`,
`sched_arvl_dt`, `sugg_order_dt`, `fcst_seq_nbr`, `store_nbr` and `wm_item_nbr`.
The location field may identify a store or DC. This verifies the business input,
not a complete feed schema or guaranteed store-ready receipt date.

Phase 1 must verify the actual table schema before claiming exact Walmart parity;
use a versioned synthetic contract/sidecar for any metadata not supplied by that
schema. Include plan issue/known-at time, stable identity/version, location role,
quantity in eaches, placement date and scheduled arrival at the stated destination.
Never treat DC arrival as store availability without the remaining downstream time.
Plans are generated from information available at issue time, never backfilled from
realized future orders. Preserve changed quantities, dates and withdrawn plans
across release vintages; only the latest applicable known vintage enters a projection.

Within a selected vintage, retain and sum distinct forecast sequence quantities for
the same suggested order date as the glossary directs. Do not confuse sequence
numbers with superseding vintages. Store on-order inventory aggregates and actual
PO lines are separate evidence, not additional planned supply to add blindly.
When a planned order becomes firm, reconcile it against the linked actual quantity:
replace the converted portion, retain only explicitly still-planned residual units,
and handle partial conversion/revision without counting both quantities. Where
linkage is ambiguous, expose that ambiguity rather than assuming additive coverage.

Acceptance cases include sufficient/on-time planned supply, inadequate or late
plans, plans not placed by their placement deadline, withdrawal/revision, partial
and full conversion to firm POs, and a missing plan feed. A missing feed is unknown,
not zero planned supply. No plan becomes a firm order or authorizes shipment.

The previous 28-day holdout yield of 6.41% remains a real result for committed-only
flags scored as eventual stockout predictions. Relabeling those outputs is not a
numerical improvement. New operational assessments need their own explicit contract
and tests; never retrospectively credit later orders as known supply or prevention.

Preserve the approved single 90-calendar-day production-to-shelf path. Retailer PO
creation is a branch prerequisite, not an extra serial step in normal production.
For a gap in 14 days, a demand-plan increase cannot prevent that gap. Show separately:

- Existing stock plus sufficient valid PO: remaining fulfillment and delivery time.
- Existing stock but absent/insufficient PO: seven-day request-to-PO allowance, then
  remaining fulfillment/delivery; no shipment authorization until the PO exists.
- Stock already shipped/in transit: remaining transit/receiving path only; expedite
  applies only to an eligible remaining transport leg, not to completed movement.

Do not build a general action graph. Josh approves the few demonstrated response
paths, timing and wording. Unknown prerequisites mean “verify,” not “recommended.”
A 28-day demand feed cannot support a 90-day depletion forecast: show the production
constraint without extrapolating unsupported demand. Extend the feed only if a
specific approved long-horizon story actually needs it.

## Execution order and bounded deliverables

Execution update (2026-10-19): phase 1's authored demo series is published in the
source repo. The requested phase-2 planned-feed bridge is implemented and verified:
see `planned-supply-backend-contract.md` and `planned-supply-backend-acceptance.md`.
Subsequently, the explicitly requested three-promise finding/evidence layer was
implemented; see `finding-evidence-contract.md`. This does not mark phase-3 ranker,
phase-4 presentation, exports or action-feasibility/ontology work complete. No current
preview pointer was activated.

### Phase 0 — Freeze the story contract in Memento

Review this matrix with Josh. Select the six positive groups, four controls, two or
three presentation dates, expansion comparator, excess target, response-path timing
and economics. Record expected direction/state/priority for each, with exact fixture
answers where possible. No full ontology exercise. A single reviewed story contract
is the handoff to the two repositories.

### Phase 1 — Patch only missing source evidence in walmart-synthetic

Inventory existing scenario coverage first. Add the smallest versioned demo profile
or sidecars needed to realize the reviewed story contract, including the planned-order
input amendment above. Preserve history,
inventory/PO conservation, source validation and cutoff-safe forecast vintages.
Publish one coherent temporal series. Private QA asserts story outcomes and controls;
product input packages contain observations and declared assumptions, not answers.
Do not regenerate the old benchmark merely to improve its scores.

### Phase 2 — Finish the narrow analytical bridge in Memento

Consume that exact source series. Reuse descriptive, supply, momentum and imbalance
logic where definitions agree. Feed source-published order forecasts into the expected
supply path; reuse existing projection mechanics instead of adding a forecasting
engine or recomputing retailer order quantities. Verify timing, vintage selection,
plan-to-PO reconciliation, double-counting and prerequisites.
Close only the gaps required for the three promise contracts. Publish one bounded
finding/evidence format with affected scope, period, observed facts, projection basis,
financial basis, timing, missing evidence and owner-written interpretation.

Implemented finding bridge: `retail-backend-metrics-v5` adds item/issue groups and
exhaustive store-level evidence for expansion, availability and excess. It reuses
the existing unchanged retailer forecast and separate firm/conditional planned supply.
Its explicit analytical defaults and exclusions live in `finding-evidence-contract.md`.
It does not select feasible actions, certify deadlines or implement phase 3.

### Phase 3 — A transparent demo queue, not a ranking research project

First test the existing deterministic priority policy against reviewed stories.
Keep it if credible. If changes are necessary, approve one small explicit policy:
review-deadline bands first, within-band impact on a consistent basis, then evidence
quality and stable tie-breaking. Do not invent a universal cross-basis dollar score.
Group repeated store-level symptoms into one explainable issue; keep drill-down to
every affected pair. Never use story IDs or private scenario labels to promote rows.
Basic metrics and checks remain accessible outside the queue.

### Phase 4 — Finish one coherent presentation experience

Choose one existing UI direction with Josh; do not maintain two competing new designs.
Replace the rejected Metrics experience only after this phase is approved. The flow:
business briefing -> prioritized issue -> clear explanation -> chart/numbers -> full
evidence -> export. All views and exports pin the same release and calculations.
Provide expansion brief, availability review and excess-inventory report exports.
Use deterministic narrative templates first. No LLM dependency is needed to finish.

### Phase 5 — Rehearse, verify and freeze

Run an end-to-end rehearsal against the exact demo release. Show all three promises
in an 8–10 minute narrative and advance the release once to demonstrate changed facts.
Freeze source/configuration/publication identities and a local startup/runbook.
Document known limitations and distinguish synthetic demonstration from customer proof.
No production deployment, real-data ingestion or new persistent datastore is included.

## Acceptance: when the demo is done

- All six positive story groups and four controls meet their reviewed deterministic
  expectations at the selected releases. This is authored scenario coverage, not
  “100% stockout accuracy.” Unknown states are acceptable only where expected.
- Every headline amount, affected-store count, chart and export reconciles to the
  same published evidence; overlapping opportunities are not double-counted.
- Ordinary replenishment is not presented as an inevitable stockout. Known late or
  insufficient supply still surfaces. All three existing-stock cases and the 14-day
  gap versus 90-day production constraint behave as specified.
- Expansion evidence controls for changing distribution, availability, comparison
  exposure and sparse sales. Excess uses explicit targets and economics.
- One ranked queue has understandable reasons and distinct issues. Basic metrics,
  current OOS and promised-distribution checks remain exhaustively accessible.
- No future leakage, private-label lookup, missing-as-zero fallback, false action
  authorization, causal prevention claim or invented monetary savings.
- Relevant backend/source tests pass, and browser/API/export checks cover the actual
  presentation path. The demo starts reproducibly without manually patching outputs.

Retain the old holdout as a disclosed regression dataset. Its outcomes are already
known, so do not call subsequent tuning on it untouched validation. Run smoke and
invariant checks there; if a new change needs an effectiveness claim, preregister a
fresh seed/configuration after freezing the change. That research is not required
to show the authored demo, but failures of correctness or healthy controls block it.

## Explicitly after the demo

General semantic/decision registry; learned recommendations; causal outcome modeling;
production forecasting calibration; full action-branch matrix; production integrations
for Target/Whole Foods; authentication/tenancy; autonomous execution; broad customer
onboarding automation. Josh remains heavily involved when ontology work resumes.

The proposed order is now: reviewed demo stories -> minimal synthetic amendments ->
metric/supply bridge -> bounded queue -> presentation/exports -> frozen rehearsal.
The registry is not on the critical path. Once this proposed reset is approved, it
takes precedence over unfinished exploratory scope in the earlier plans; their
contracts and acceptance receipts remain evidence, not work to discard.

## Inspection basis

Planning inspection only: growth deck; `mvp-product-shape.md`, `mvp-metric-contract.md`,
`supply-contract.md`, `descriptive-metric-contract.md`,
`retailer-forecast-baseline-acceptance.md`, `focus-ui-draft.md`, existing foundation,
source and registry plans, and current supply helper implementation. No application
or source-generator change, dataset regeneration, test execution or UI change was
performed to create this plan.
