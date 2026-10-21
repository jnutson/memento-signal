# Retailer-forecast baseline and benchmark reset

Status: implementation explicitly authorized 2026-10-18 after the velocity review.
Source/backend changes and golden/holdout verification are complete; see
`retailer-forecast-baseline-acceptance.md` for exact results and limitations. No pointer activation,
UI change, ranker, ontology or learned decision policy is authorized.

### Implementation defaults recorded before benchmark evaluation

The user accepted the velocity mix and instructed implementation without another
design-review round. The explicit engineering defaults are:

- Synthetic retailer forecast multiplier error bounded at +/-3% for the nearest
  target week, widening linearly to +/-8% at four weeks, around the issue-time
  expectation. These are not promises of realized-sales forecast accuracy. Whole-unit
  actual demand has 8% daily lognormal noise plus carry-forward fractional demand.
  Known calendar effects are shared expectations, not future realized observations.
  Persistent observed in-stock deviations may revise later retailer vintages.
- Primary scenario counts over 10,000 trading pairs: healthy 6,400; low-stock-covered
  1,500; depletion 200; demand shock 100; delayed receipt 150; partial receipt 100;
  prevented/expedited-supply control 200; current zero 100; recovery 100; demand decline
  100; excess receipt 100; benign spike 300; stock/no PO 150; insufficient PO 150;
  existing PO 150; expedited truck 100; production-too-late 100. Velocity and scenario
  assignments use independent identity-keyed seeds.
- Exact consumer fixtures must all pass. Source gates require observable depletion,
  delay, production-too-late and recovery signatures, a healthy-control zero-pair
  fraction no greater than 2%, temporal safety, reconciliation and full coverage.
  Stochastic predictive measures are reported, not passed by inventing a universal
  accuracy target or changing thresholds after seeing holdout. No business promise
  of never missing a reorder window is accepted by these engineering gates.
- The velocity profile implies approximately 97,067 baseline units and $2.906m at
  base retail prices per week across the ten items. These are declared synthetic
  demo volumes, not parent/customer calibrated totals; source manifests identify
  the explicit allocation override instead of claiming the parent target unchanged.

The chronological model/evaluator freeze and final release IDs are recorded in
`retailer-forecast-baseline-acceptance.md`. Mechanical acceptance is not acceptance
of the business promise; in particular, unranked 28-day exposure has poor yield.

This amendment takes precedence over conflicting forecast/calibration and benchmark
instructions in `availability-foundation-plan.md` and
`temporal-synthetic-evaluation-source-plan.md`. Existing v1 worlds, backend-v2
artifacts, contracts and acceptance receipts describe historical implemented behavior;
do not relabel them as this proposed baseline or rewrite their scores.

## Product outcome and baseline

Memento projects availability using the retailer's demand forecast, inventory and
known supply. It does not need to outperform the retailer at demand forecasting to
provide useful supply-planning evidence. The retailer forecast is the reference
baseline, not a guarantee that every store-item forecast is correct.

At each cutoff, use the latest eligible retailer forecast vintage for each target
week, unchanged in weekly quantity. Calculate daily closing inventory as:

`closing_inventory = max(0, opening_inventory + dated_firm_receipts - forecast_demand)`

Track unfulfilled demand separately. Preserve receipt-before-demand convention,
depletion versus first-unfulfilled dates, explicit missing evidence, and current
zero-stock checks independently of projection readiness.

The current consumer maps `long_rng_store_dmd_frcst` to
`demand_forecast_weekly`; it does not consume a separate short-range feed. Initial
implementation uses that existing feed, not a fictional short/long blend. A later
short-range integration needs verified schema, grain, issue-time semantics,
overlap precedence and separate authorization before contract expansion.

Default baseline bias multiplier is 1: no silent historical bias correction.
Daily allocation is still an assumption, not a new weekly forecast. Start with an
explicit seven-day uniform split that conserves the retailer weekly total, and
align controlled cases accordingly. A historical weekday allocation may be compared
as a separately labeled challenger; it must also conserve the weekly quantity.
Neither allocation establishes exact daily forecast accuracy. Record method,
vintage, target period and model/configuration identity in evidence and manifests.

Historical sales initially supply descriptive velocity, forecast-versus-actual
deviation and evidence quality. Existing bias/weekday adjustments remain reproducible
under their old model identity, not silently active in the new default. Future
account-specific corrections are challengers that must beat the unchanged retailer
baseline on untouched chronological outcomes before promotion. Missing retailer
forecast remains unavailable; do not silently substitute sales velocity.

## Source design: credible golden, untouched holdout

Retain ten items, 1,000 trading stores plus 50 explicitly unstocked promised stores,
119 actual days, six scoring cutoffs and four outcome-only cutoffs, with 7/14/28-day
evaluation. Preserve the shared 90-day production path and all three existing-stock
cases. This scope cannot prove prevention over the full production cycle.

Golden is an intentional development suite with known business cases and observable
expectations. It may be improved during development under new identities. Holdout
tests the frozen approach, not a duplicate of golden's exact records. The already
inspected v1 holdout is historical evidence, not an untouched benchmark for this reset.

### Proposed velocity profile: explicit demo assumptions for review

Use baseline unconstrained units per trading store-item-day, not fulfilled sales
during stockouts, to assign the following initial design bands. These are proposals,
not empirical Walmart benchmarks or approved customer volume claims.

| Segment | Share of 10,000 trading pairs | Baseline units/store/day | Purpose |
| --- | ---: | ---: | --- |
| Slow / intermittent | 20% | 0.1 to <0.5 | Keep genuine uncertainty and whole-unit effects |
| Core | 50% | 0.5 to <1.5 | Main operational demo population |
| Faster | 30% | 1.5 to 4.0 | Clear depletion and replenishment cases |

The 500 unstocked promised pairs are outside this allocation and remain explicitly
zero; they must not become easy successes in future-stockout prediction. Spread
bands across items and stores; do not make velocity identify a scenario label.
Preserve sensible item/store heterogeneity and whole-unit actual sales.

First source task: show a small fixture and implied item/brand weekly units and
retail dollars for owner review before locking the full profile. Reconcile any
parent revenue-allocation assumptions rather than assigning full parent volume to
the ten-item subset. If these bands imply implausible totals, revise the declared
profile before full generation; do not uniformly multiply inventory and sales just
to improve a score. Recompute opening inventory, reorder points, order quantities
and pipeline warm-up from declared cover/lead-time policies when velocities change.

### Retailer forecast generation

Replace the source's simple fixed-baseline/recent-fulfilled-sales blend for the new
profile with a controlled synthetic retailer forecast. Known calendar effects,
declared planned events and baseline expectations may enter it when known at issue
time. Realized future random sales, unknown shocks and private future receipt
outcomes may not. Generate actual demand separately from those shared expectations;
never build the forecast backwards from realized future sales or desired scores.

Declare forecast error and revision regimes: accurate/stable, modest known bias,
unanticipated persistent uplift, temporary noise and recovery. Keep accurate cases
representative without making every case perfect. Record source forecast-error
diagnostics by horizon and velocity band, distinguishing in-stock realized-sales
error from private unconstrained-demand error; private error is source QA only.

### Expected outcomes, fixed before consumer evaluation

| Case | Declared source behavior | Expected Memento behavior |
| --- | --- | --- |
| Exact depletion | Controlled daily demand matches baseline allocation; no rescue receipt | Exact depletion and first-unfulfilled dates/quantities match independent hand calculation |
| Healthy control | Inventory plus known receipts covers forecast | No baseline depletion inside the tested horizon |
| Low stock, covered | Firm receipt arrives before depletion | Low stock visible, but no forecast shortage |
| Supply gap | Forecast accurate; receipt absent, insufficient, or known late | Shortage appears at the first cutoff where the relevant facts are known |
| Partial receipt / recovery | PO lifecycle and received quantity evolve coherently | Remaining supply not double-counted; observed recovery closes the episode |
| Unexpected demand shock | Earlier retailer forecast cannot know the shock | Pre-shock prediction not guaranteed; divergence visible after evidence and forecast revision |
| Benign spike / slow seller | Whole-unit variability without persistent demand change | Current facts remain correct; uncertainty and false-warning burden reported separately |
| Current zero / distribution gap | Fresh zero inventory, or explicitly missing evidence in fixtures | Zero distinguished from unknown; no forecast requirement to surface the check |
| New future PO prevents depletion | No PO at first cutoff; commitment appears later | Initial committed-supply exposure remains valid; new evidence changes the next assessment |

Use deterministic controlled cases as exact reference tests, not as the entire
benchmark. Source acceptance records intended onset/recovery ranges, event duration,
available warning cutoffs and observable receipt signatures per case. Fail source
acceptance when a required case does not materialize; do not assign its label anyway.
Expectations belong to evaluator-only fixtures/QA, never product calculation inputs.
Validate broad background behavior too: healthy majority, background stockout rate,
episode duration, velocity distributions and forecast error. Deliberate interventions
must not be drowned out by unintended baseline replenishment failures.

Holdout preserves scenario families and velocity mixture but changes assignments,
timing, magnitudes and demand-noise seeds under a new version. Freeze its configuration,
expected outcome rules and evaluation gates before consumer tuning/first benchmark
inspection. If used to choose model settings, it becomes development data; reserve
another benchmark version. Same-cohort holdout measures scenario robustness, not
generalization to a new customer. Do not optimize seeds after reading scores.

## Evaluation contract: separate questions

1. **Mechanical correctness:** exact controlled cases must pass 100%, including
   quantities, cutoff boundaries, missing data and temporal leakage protection.
2. **Advance warning coverage:** distinct eligible stockout episodes with a risk flag
   issued before onset / distinct eligible episodes. A later estimated depletion
   date is a date error, not automatically absence of an advance warning. Report
   both any advance warning and a predeclared minimum-lead measure (initially seven
   days for comparison, not a claim that every action takes seven days).
3. **Date accuracy:** signed/absolute onset error and declared tolerance bands;
   retain the old predicted-date-no-later-than-actual metric as a separately labeled
   conservative-date measure. Do not silently replace or compare unlike scores.
4. **Warning burden:** yield, false warnings and churn by horizon, velocity and case;
   retain missed events and unknown outcomes explicitly. An episode and overlapping
   store-item/cutoff windows are different denominators.
5. **Supply-conditioned interpretation:** core projection includes only committed
   supply known at cutoff. Actual outcomes may include later orders or revisions.
   Stratify such outcomes using later observable PO evidence in the evaluator only;
   a later intervention is not proof Memento caused prevention. Include cases where
   supply remains unchanged for a clean test of the projection. Any frozen-supply
   counterfactual is separately labeled private synthetic analysis, never mixed into
   observable recall or ingested as product evidence.

Report all results by horizon, velocity band, scenario QA category and overall.
Private labels can stratify an isolated diagnostic report, never influence model
inputs or selection; production-style scores must work from observable outcomes.
Freeze case-specific date tolerances, minimum event counts and stochastic quality
gates with the owner after golden development and before opening holdout. No
universal predictive target is established by the old 11% score or this plan.
Exact fixture failure blocks acceptance regardless of aggregate performance.

## Required implementation order across repositories

| Step | Owning repo | Bounded change and exit gate |
| --- | --- | --- |
| 1. Freeze design | walmart-synthetic | Review small velocity/volume fixture, source scenario expectations, forecast issue-time rules and new profile identities; freeze holdout rules |
| 2. Build source v2 | walmart-synthetic | New versioned profiles/configs; coherent demand, retailer vintages, inventory and POs; exact source fixtures and audits pass; no Memento edits |
| 3. Publish golden handoff | walmart-synthetic | New immutable golden series, observable manifests, reconciliation/coverage receipt; isolated QA expectations, no private data in packages; preserve old releases |
| 4. Implement baseline | Memento | New calculation/model identity; retailer quantity unchanged, explicit daily allocation, no default bias; preserve prior replay; exact reference tests pass |
| 5. Evaluate/freeze | Memento | Revised metrics and golden walk-forward evaluation; agree gates and freeze model, allocation and evaluator before inspecting new holdout results |
| 6. Publish holdout | walmart-synthetic | Generate/audit frozen holdout without tuning to Memento outputs; observable series handed off separately |
| 7. Blind evaluation | Memento | Same frozen configuration on holdout; report misses, burden, date errors and supply changes; no silent tuning or automatic activation |

Only after this baseline is understood should a separately approved experiment
compare account-specific historical corrections with it. Ranker/replacement UI and
the human-governed ontology/action registry remain later, separately authorized work.
No training platform, new datastore, automatic action selection or learned policy.

## Implementation surfaces and verification handoff

Source: versioned configs under `config/runs/` and `config/scenarios/`, narrow changes
in `src/synthetic_retail/temporal.py`, `miro_oos.py`, `temporal_validation.py`, and
minimized unit/integration tests. Reuse existing schemas and generation engine.
See source-local `docs/retailer-forecast-baseline-reset-plan.md` for the owner boundary.

Memento: `metric_contract.py`, `metric_supply.py`, `metric_replay.py`, publication
manifests/validation and backend tests; serving changes only if evidence needs new
fields. Keep current contracts honest until implementation publishes a new version.
Do not modify legacy Signal ranking or frontend files.

Verification after separate implementation approval: source unit/integration tests,
profile preflight/generate/validate/publish on explicit new roots; consumer minimized
exact fixtures, full Python suite and type checks, golden replay, then frozen holdout
replay with immutable-history/no-future/PO-conservation checks and unchanged pointers.
Both repos run `git diff --check`; report unrun checks. No tests or generation are
claimed by this planning document. Commit, push, deployment, real-data access and
activation are not part of this handoff.
