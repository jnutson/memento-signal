# Temporal Synthetic Evaluation Source Plan

Status: temporal source implemented and validated. Revised 2026-10-18 with an
additional, separately versioned promised-distribution profile.

## Forecast-baseline source v2 amendment (2026-10-18)

Implementation was subsequently authorized under `retailer-forecast-baseline-reset-plan.md`;
its forecast/benchmark requirements override conflicting legacy instructions below.
Preserve all existing worlds, identities, releases and acceptance receipts.

Design a new golden profile around accurate synthetic retailer forecasts, an explicit
reviewable velocity mix (20% slow, 50% core, 30% faster proposed), coherent inventory
cover and PO policies, controlled exact reference cases and realistic noisy cases.
Review implied item/brand volume before generating the full world. Forecasts may use
declared calendar/planned effects known at issue time, never future realized demand.
The current long-range observable schema remains the initial input; separate
short-range integration is not included. Source QA expectations stay isolated from
consumer inputs. Do not engineer forecast values from Memento scores.

Define and freeze a new holdout's assignment/error/velocity rules before consumer
tuning; publish/evaluate it only after golden development freezes the baseline and
evaluator. The inspected v1 holdout is not a fresh holdout for this iteration.
Both new profiles are required before reset acceptance, rather than the optional
held-out delivery described by the earlier plan below.

Repository sequence: source small fixture/design -> source v2 golden and audit ->
Memento unchanged-retailer-forecast baseline plus evaluation revision -> frozen
Memento configuration -> source frozen holdout publication -> Memento evaluation.
Source work must not modify Memento; Memento must not patch source extracts.
See source-local `docs/retailer-forecast-baseline-reset-plan.md` for the bounded
source handoff. No UI, ranker, ontology, model training or activation in this reset.

The base world remains 10 items × 1,000 trading stores over 119 observable days,
with ten weekly releases (six scoring cutoffs plus four outcome-only cutoffs).
The approved metric-coverage extension adds 50 explicitly unstocked promised
locations, preserving the original trading cohort and earlier immutable releases.
Its configuration is `config/runs/miro_iteration_distribution_v1.json` in
`walmart-synthetic`. Observable promised-distribution sidecars are checksum-bound
to each cutoff, separate from the existing retailer/internal package schemas.
The shared production path remains 90 calendar days; no new action-selection
logic is introduced. See `descriptive-metric-contract.md` for consumer behavior.

Implementation repository: `https://github.com/jnutson/walmart-synthetic`

Consumer repository: `Memento_Analytics_Demo_1`

Implementation order:

1. This plan: synthetic data rework in `jnutson/walmart-synthetic`.
2. `availability-foundation-plan.md`: metric coverage, supply-state map, and v1 ranking
   in Memento, evaluated against the temporal releases.
3. `decision-semantic-registry-plan.md`: human-governed meanings, action branches,
   refined lead times, and explanation contracts.

The registry is not a prerequisite for generating the synthetic world. Its action
matrix must be grounded in the completed metric and supply-state foundation.

## Outcome

Extend the existing Walmart synthetic generator to produce one small, continuous,
approximately four-month retail world for ten existing Brand A items and the same deterministically
selected 1,000 stores, then expose that world through immutable weekly as-of releases.

The release series must let Memento simulate the passage of time in one evaluation
session:

```text
continuous synthetic world
    -> weekly cutoff-safe observable releases
    -> frozen Memento assessments and rankings
    -> later observable inventory outcomes
    -> walk-forward evaluation scorecard
```

The source world must contain enough causal variation to exercise reported zero-on-hand,
future stockout risk, recovery, late and partial supply, demand shocks, benign volatility,
and excess inventory without encoding Memento's expected ranks or recommendations.

This is a source-generation and release-publication plan. It does not implement the
Memento assessment model, ranking evaluation, semantic registry, AI explanation,
action selection, or automated execution.

## Why this replaces a static evaluation slice

The current small slice is an unchanged projection from a parent release. It contains
ten items, 1,000 stores, 182 days, and one later 28-day outcome window. It is useful for
ingestion and one-cutoff evaluation, but it cannot measure:

- whether a warning appeared early enough to protect availability;
- whether risk changed coherently as sales, inventory, forecasts, and orders evolved;
- whether a resolved or prevented stockout left the queue;
- alert churn across consecutive decisions;
- event recall and alert burden across multiple historical cutoffs; or
- the effect of forecast revisions and changing supply state.

Do not create independently edited weekly copies. Generate one stateful world once and
project every release from that same world using facts known at the cutoff. Past facts
must remain stable unless a separately declared late-arriving-correction test explicitly
models a revision.

## Fixed cohort and calendar

Use the existing iteration cohort with a shorter initial time window:

```text
items                         710000001 through 710000010
item count                    10
store selection               first 1,000 stores by ascending SHA-256 of decimal ID
store count                   1,000
store-item pairs              10,000
observable fact start         2026-08-01
observable fact end           2026-11-27
observable days               119 (17 merchandising weeks)
rows per dense daily fact     1,190,000
```

Use Saturday release cutoffs at `12:00:00Z`. Each release contains sales and inventory
through the preceding fully closed Friday.

The initial proposed scoring cutoffs are every Saturday from `2026-09-26T12:00:00Z`
through `2026-10-31T12:00:00Z`, inclusive:

- the first eight weeks provide warm-up history;
- six weekly scoring cutoffs span five elapsed weeks; and
- four further weeks of facts mature the final cutoff's 28-day outcome window.

This is 17 weeks in total: eight history weeks, five weeks between six decisions, and
four outcome weeks. The earlier conversational estimate of 18 weeks counted six
decision points as six elapsed weeks.

Publish ten weekly releases from 2026-09-26 through 2026-11-28, inclusive. The first
six are scoring cutoffs; the remaining four reveal outcomes. The series manifest must
mark each release's role. Do not score late cutoffs whose outcome window is incomplete.

### Initial delivery and optional benchmark

Deliver the approximately four-month golden profile first. It establishes scenario
coverage, temporal continuity, and a functioning replay workflow with six scored
cutoffs. Repeated observations of the same stockout are correlated; six releases do
not constitute six independent experiments or demonstrate real-world effectiveness.

Keep dates, cutoff count, outcome horizon, and scenario assignment configurable.
After metric coverage and ranking stabilize, freeze a held-out configuration before
evaluating it. The optional extended benchmark retains the original 182-day window
through 2027-01-29, fifteen scoring cutoffs through 2027-01-02, and four later outcome
releases through 2027-01-30. Its dense daily fact count is 1,820,000 per table. Full
held-out generation is a later milestone and does not block initial golden acceptance.

Generate this schedule from declared start, cadence, and end fields, then materialize
the resolved cutoff list into the run manifest. Reject a schedule that is not aligned to
the Walmart merchandising calendar or lacks the configured terminal outcome window.

### Configurable lead times and evaluation horizons

For this demo, use one configurable production path shared by all ten items. Remove
the sewn/molded/assembly distinction from the new temporal profile's assumptions.
Keep the legacy model and releases intact; simplification applies to new identities.

The central process is:

```text
demand-plan change -> production planning/capacity -> production
-> brand DC stock -> retailer PO/authorization -> fulfillment
-> brand DC to retailer DC -> retailer DC processing -> store -> available stock
```

This is a dependency map. Production and obtaining a PO may proceed concurrently;
fulfillment waits for both available stock and a valid PO with sufficient authorized
quantity. Do not sum concurrent waits twice. The source rework needs a small explicit
process configuration, not a general action ontology.

Required source assumptions and cases:

- Retailer order increase: allow seven elapsed calendar days from the request to the
  retailer placing or amending a PO, then the remaining fulfillment and shipping path.
  A request is not a firm order and creates no committed inbound before the PO exists.
- Existing stock: brand stock can bypass new production, but shipment still requires
  a valid PO or approved additional PO quantity. Stock availability alone is insufficient.
- Expedite truck: the branch shortens the brand-DC-to-retailer-DC transport leg.
  Keep retailer processing and the downstream store leg; do not substitute the
  retailer-DC-to-store duration for the expedited supplier transport duration.
- Demand-plan increase: its physical effect passes through the applicable remaining
  production, PO, fulfillment, and delivery stages. A plan update alone adds no stock.

Represent request times, stock readiness, and physical process events in private source
metadata where needed. Preserve existing observable PO versions and inventory schemas.
Do not fabricate publicly observable brand-DC balances or claim consumer action
eligibility when the current source contract does not supply its prerequisites.

Full branch eligibility, calibrated ranges, actor authority, and action-to-outcome
meaning are a key deliverable of stage 3, the registry plan. Synthetic data must preserve
the facts and timing distinctions needed to test those rules later.

Treat three quantities separately:

- **Physical supply lead time:** order, invoice, transit, and receiving durations that
  determine generated receipts and inventory. Changing these inputs creates a new
  synthetic world and simulation identity.
- **Human review lead time:** the configured time needed before projected depletion
  to consider a response. Memento owns this assumption and its deadline calculation.
  Changing it creates a new assessment/configuration identity over the same source
  releases; it does not rewrite sales, inventory, or receipt outcomes.
- **Prediction and outcome horizons:** the interval for which the consumer has
  supported forward demand and the interval over which later events are scored.

Preserve units, calendar convention, effective dates, scope, provenance, and version
for every lead-time configuration. Resolve applicable values deterministically and
bind the resolved configuration hash into replay results. Use the existing constraints
and supply-model contracts where they fit; propose a consumer contract change
explicitly if they cannot represent the agreed configuration. Do not silently add
fields to the ten observable datasets.

Initial scoring remains at 7, 14, and 28 days, with 28 days of supported forward demand.
Exercise short and longer review allowances against those same frozen projections.
Include cases where a deadline is upcoming, today, or already passed. A changed
allowance should change the deadline and potentially priority while preserving
depletion projections and eventual source outcomes.

When the configured lead time exceeds the supported prediction horizon, report that
the replay cannot establish full advance-warning effectiveness for that allowance.
Do not truncate the allowance, invent a later depletion date, or score an unknowable
event as a model miss. If validating a longer planning cycle becomes an acceptance
requirement, extend forward forecast coverage, source history, scenario timing, and
terminal observations together under a new profile version.

Physical supply cycles that start before the observable window require sufficient
internal simulation history to populate opening stock and complete PO lifecycles.
Derive simulation warm-up and lifecycle retention from the configured maximum duration
plus required policy history. The eight observable baseline weeks serve metric
calculation; they are not a universal bound on internal simulation warm-up.

Place golden episode onsets so at least one scoring cutoff precedes the relevant
deadline for the lead-time case being tested. Include deliberately late detections
as separate cases. Record eligibility by episode and cutoff in private acceptance
metadata; never move an event after inspecting Memento ranks.

## Repository baseline to preserve

The implementation must extend, not replace, these existing capabilities in
`walmart-synthetic`:

- `src/synthetic_retail/miro_oos.py` already generates a continuous Brand A world,
  private daily evaluator truth, PO-line lifecycle versions, and immutable cutoff
  releases;
- `src/synthetic_retail/iteration_slice.py` deterministically selects the accepted
  ten-item/1,000-store cohort and preserves retained parent facts;
- `src/synthetic_retail/contracts.py` already defines observable Walmart schemas,
  private evaluator truth, scenario assignments, event ledgers, and a forecast primary
  key containing both creation and target week;
- `src/synthetic_retail/miro_validation.py` validates cutoff safety, forecast coverage,
  PO lifecycle retention, and PO-to-inventory reconciliation; and
- the existing calibrated 90-item/2,000-store world and all previously published
  releases are immutable historical artifacts.

Do not mutate or republish the accepted `miro_brand_a_calibrated_v1` world, the existing
`miro_iteration_calibrated_v1` slices, or their current pointers. The temporal profile
must use new output, release, execution, configuration, and identity roots.

## Product and truth boundaries

### Observable source contract

Each release continues to expose exactly the existing six Walmart datasets and four
Miro extension datasets:

1. `calendar_dim`
2. `store_dim`
3. `omni_item_dimensions`
4. `store_sales`
5. `store_invt`
6. `long_rng_store_dmd_frcst`
7. `dim_item`
8. `retailer_replenishment_commitment`
9. `item_reaction_constraint`
10. `company_item_economics`

Do not add scenario names, future outcomes, latent demand, exact lost demand, or private
causal labels to observable files, manifests, logs, or Memento inputs.

### Private source truth

Private artifacts may contain:

- latent demand and constrained sales;
- exact synthetic lost demand;
- true inventory balance and stockout state;
- scenario assignment and causal event identifiers;
- planned versus realized receipt timing;
- forecast-generation components and error; and
- episode-level outcome summaries derived from the daily truth.

Private truth exists to validate the generator and diagnose benchmark coverage. The v1
Memento availability evaluation must still use later **observable reported zero-on-hand**
as its outcome. Private `is_oos` and lost-demand fields must not become Memento features
or the primary product score.

### Terminology to encode

Keep these states separate in truth and validation:

- `reported_zero_on_hand`: observable ending on-hand is zero while the pair is active,
  assorted, and replenishment enabled;
- `stockout_onset`: the first transition from positive reported on-hand to zero in an
  episode;
- `stockout_episode`: onset through the first later positive reported on-hand date;
- `true_demand_constrained`: private latent demand exceeds fulfilled sales; and
- `recovery`: observable on-hand becomes positive after a stockout episode.

Do not use `reported_zero_on_hand` as proof of on-shelf availability or realized lost
sales.

## Profile and configuration changes

Add a new direct-generation profile rather than generating the full 90-item/2,000-store
world and slicing it after every run.

Suggested committed inputs:

```text
config/runs/miro_iteration_temporal_v1.json
config/scenarios/miro_iteration_temporal_golden_v1.json
config/scenarios/miro_iteration_temporal_holdout_v1.json
```

The run configuration must declare:

- the exact ten item IDs;
- the deterministic 1,000-store selection rule and checked selected-ID hash;
- internal simulation warm-up, metric history, observable start/end, and outcome horizon;
- release weekday, release time, first cutoff, last cutoff, and cadence;
- a fixed master seed;
- forecast-vintage horizon and revision policy;
- replenishment policy and configurable physical PO lifecycle timing;
- lead-time assumption/reference hashes and supported horizon limitations;
- scenario-config path and hash;
- distinct output/release roots;
- source classification `synthetic`;
- contract versions; and
- generator and scenario schema versions.

Suggested generated roots:

```text
outputs/miro_iteration_temporal_golden_v1/
outputs/miro_iteration_temporal_holdout_v1/
releases/miro_iteration_temporal_golden_v1/
releases/miro_iteration_temporal_holdout_v1/
executions/miro_iteration_temporal_v1/
```

Do not duplicate or hand-maintain the 1,000 selected IDs in multiple files. Resolve the
cohort once from the checked 2,000-store reference snapshot, sort the selected IDs, hash
the canonical list, and bind that hash into simulation and release identities.

## Workstream 1: parameterize the existing generator

### Entry readiness and first implementation task

The agreed scope is sufficient to begin source implementation. Complete this bounded
configuration step before generating the full world:

1. Declare one production duration range, normal and expedited supplier-truck ranges,
   fulfillment, retailer processing, and store-delivery/receiving ranges. Carry the
   seven-day retailer PO response allowance separately. Record all durations as
   explicit synthetic assumptions; exact remaining values are engineering profile
   parameters, not calibrated operating promises.
2. Ensure simulation receipt scheduling, PO lifecycle timestamps, release validation,
   ring-buffer sizes, retained lifecycle history, and resource estimates all use those
   declared durations. Remove fixed four-day receipt and other timing shortcuts from
   this profile where they conflict with the new process.
3. Define minimized cases for stock ready/PO absent, order increase after seven days,
   expedited supplier transit, and production too late for a fourteen-day shortage.
   Model source events and dependencies without implementing Memento action selection.
4. Check that the unchanged observable schemas convey actual firm PO and inventory
   facts correctly. Retain unsupported prerequisites in private diagnostics and report
   their absence to the later consumer handoff. If a required observable fact cannot
   be represented, document the exact contract gap before broadening the schema.

Neither the complete ontology nor a final action-ranking policy is an entry dependency.
Generate the small integration fixture and validate these assumptions before the full
119-day golden run. Final registry refinement may change later profile versions; old
worlds and baseline evaluations remain reproducible.

Refactor `src/synthetic_retail/miro_oos.py` only as far as needed to support an explicit
run config and scenario config while preserving the current default profile.

Required behavior:

1. Accept explicit config paths in the CLI and generation functions.
2. Select configured item IDs from the existing Brand A item model.
3. Select the deterministic store cohort from the existing checked reference snapshot.
4. Filter item mappings, reaction constraints, and economics to the selected ten items.
5. Derive expected row counts, shard counts, forecast rows, date ranges, and free-space
   estimates from configuration.
6. Include all controlling config and selected-cohort hashes in simulation identity.
7. Keep seed derivation keyed by stable business identifiers and dates rather than
   iteration order, so shard size or processing order cannot change values.
8. Preserve current 90-item/2,000-store behavior and tests when the old profile is used.

Prefer extracting narrow helpers for profile loading, cohort resolution, scenario
assignment, and cutoff generation. Do not create a second retail simulation engine.

## Workstream 2: scenario model and causal assignment

Add a versioned scenario configuration interpreted by deterministic generator code.
The configuration describes causal interventions and cohort-selection rules; it must not
contain desired Memento scores, ranks, thresholds, or signal IDs.

Every assigned scenario needs a stable identity derived from:

```text
scenario version
+ scenario family
+ store ID
+ item ID
+ episode start
+ parameter hash
```

Scenario assignment must be independent of record-processing order. A store-item may
have multiple non-overlapping episodes, but conflicting interventions must be rejected
or resolved by an explicit, tested precedence rule.

### Required scenario families

| Family | Causal intervention | Expected observable behavior |
|---|---|---|
| Baseline healthy | Normal demand and replenishment | Stable cover; no material alert |
| Low-stock healthy | Low on-hand with firm supply arriving in time | Risk resolves or remains below attention threshold |
| Slow-burn depletion | Sustained demand with insufficient firm supply | Gradual loss of slack, then zero-on-hand |
| Demand shock | Bounded persistent demand uplift unknown to earlier forecasts | Forecast error rises; depletion moves earlier |
| Delayed receipt | Expected receipt date or physical receipt moves later | Increasing availability exposure and urgency |
| Partial receipt | Only part of an ordered quantity arrives | Residual open or in-transit quantity and continued risk |
| Prevented stockout | Firm supply arrives shortly before depletion | Earlier warning followed by observable recovery or avoidance |
| Current zero-on-hand | Prior positive stock transitions to zero | Explicit current reported-zero state |
| Stockout recovery | Receipt restores positive inventory | Episode closes and alert should resolve |
| Demand deceleration | Persistent sales decline | Increasing weeks of supply and possible excess exposure |
| Excess receipt | Large valid receipt exceeds forward demand | Inventory imbalance without availability risk |
| Benign spike | Short-lived noise with rapid normalization | Tests false-alert resistance |
| Stock ready, PO absent | Brand stock exists but the retailer has not ordered | No shipment or committed inbound until a valid PO is known |
| Requested order increase | Seven-day PO decision lag before additional authorized quantity | Additional supply appears only after PO and fulfillment stages |
| Expedited supplier truck | Shorter brand-DC-to-retailer-DC transit for an eligible shipment | Earlier arrival still includes retailer processing and store delivery |

The core generated world remains dense and schema-valid. Missing-file, missing-row,
duplicate, invalid-type, and malformed-lifecycle cases belong in minimized mutation
fixtures and contract tests, not in the benchmark world.

### Golden scenario allocation

The golden profile is a deterministic demonstration suite. It must guarantee enough
instances of each required family across different items, stores, event weeks, and
severities to support UI and end-to-end acceptance.

Golden guarantees apply to causal episodes and observable outcomes, not to Memento
rank placement. The generator must never require that a particular scenario appear in
Memento's top ten.

### Held-out scenario allocation

The held-out profile uses the same engine and schema but a different fixed seed and
different frozen assignment parameters. It should contain:

- a large healthy majority;
- benign volatility and low-stock controls;
- sparse meaningful stockout and excess episodes;
- variation in magnitude, duration, timing, and forecast error; and
- scenarios near, but not copied from, expected decision boundaries.

“Held out” means its config hash is frozen before ranker tuning and its outcome summary
is not used to choose thresholds or weights. It is not required to be cryptographically
secret in this local engineering repository.

Any change to its seed, assignment parameters, scenario rules, or truth derivation must
produce a new benchmark version and identity. Never silently improve the existing
benchmark after seeing an unfavorable score.

## Workstream 3: forecast vintages

The observable forecast primary key already includes forecast creation week and target
week. Use it to publish rolling vintages rather than one frozen four-week-ahead row per
target week.

At every completed creation week, generate forecasts for the next four target weeks.
For a given store-item-target week, later creation weeks may revise the value based only
on information available at that creation time.

Requirements:

- `forecast_created_week < target_week` for every row;
- multiple vintages for one target week are allowed and uniquely keyed;
- previously created forecast rows never change in later releases;
- a release includes only vintages created by its cutoff;
- demand shocks affect a vintage only after their observable evidence is available;
- no realized future demand enters a forecast value;
- deterministic replay reproduces every vintage byte-for-byte; and
- validation checks dense store-item coverage for every declared creation/target pair.

Update `src/synthetic_retail/miro_validation.py` so its forecast density and partition
checks understand multiple creation vintages per target week. Preserve the current
consumer-compatible source columns and primary key.

## Workstream 4: inventory and replenishment continuity

Inventory must be the result of one continuous state transition:

```text
beginning on hand
+ receipts
+ explicit adjustments, if configured
- fulfilled sales
= ending on hand
```

Orders, invoices, in-transit quantities, partial receipts, delayed receipts, and final
receipts must use stable PO-line identities and immutable event versions.

Required invariants:

- no world-state reset at a release boundary;
- no negative on-hand quantity;
- observed sales do not exceed available-to-sell inventory;
- open and in-transit units are disjoint;
- ordered, invoiced, received, cancelled, and outstanding quantities reconcile;
- partial receipts retain the unreceived remainder;
- a delayed or overdue quantity never disappears;
- `store_invt` on-order, in-transit, and receipt fields reconcile to the latest PO state
  known at that observation date; and
- prior daily facts remain identical across later releases.

Model expected-date revisions as new PO versions with later `known_at` timestamps.
Earlier releases must retain the earlier expectation; later releases may expose the
revision once known.

## Workstream 5: weekly release projection

Reuse and generalize `publish_releases()` in `src/synthetic_retail/miro_oos.py`.
The configuration-derived cutoff schedule should be sufficient to publish all weekly
release sets from one generated source root.

For each cutoff:

- `latest_fully_closed_business_date` is the preceding Friday;
- sales and inventory include no later business date;
- forecast rows include no creation week after the cutoff;
- PO versions include no `known_at` after the cutoff;
- dimensions and economics resolve exactly once;
- the complete retained lifecycle is included for every relevant PO line;
- package and release-set manifests are independently hashed;
- publication is atomic and idempotent; and
- replay of an existing identity verifies content rather than overwriting it.

Do not rely on `current.json` for evaluation ordering. Publish a series manifest that
binds the ordered release-set identities:

```text
release_series_id
simulation_id
profile
cohort hash
scenario config hash
first and last cutoff
cadence
outcome horizon
ordered release-set manifest paths and hashes
release role: scoring or outcome-only
terminal truth date
```

The ordinary current pointer may point to the latest successfully published release,
but the series manifest is the stable input for walk-forward evaluation.

## Workstream 6: private episode truth and source acceptance

Derive an immutable private episode table from daily private truth after generation.
Suggested grain:

```text
simulation x store x item x episode
```

Minimum fields:

- stable episode ID and optional scenario instance ID;
- episode family;
- first reported-zero date;
- first true demand-constrained date;
- recovery date;
- zero-on-hand duration;
- exact synthetic lost-demand units;
- causal receipt/order references where applicable; and
- whether the episode is fully observable within the world horizon.

This table is not published to Memento. Use it to validate that scenario interventions
actually produced the intended source behavior and that control scenarios did not
accidentally create the same outcome at unacceptable rates.

The source acceptance report must include, by profile and scenario family:

- assigned episode count;
- distinct store-item count;
- observed zero-on-hand episode count;
- recovered episode count;
- censored episode count;
- duration distribution;
- exact lost-demand distribution, labeled private synthetic truth;
- receipt delay and partial-fill distribution;
- forecast-error distribution by vintage lead; and
- healthy/control outcome rates.

Do not report or optimize Memento precision, recall, or ranking metrics in the source
repository. Source acceptance establishes a coherent world and adequate evaluation
coverage, not product performance.

## Workstream 7: validation and leakage protection

Extend validation with release-series invariants.

### Cross-release invariants

For consecutive releases `R[t]` and `R[t+1]`:

- all previously published sales rows are identical;
- all previously published inventory rows are identical;
- all previously published forecast vintages are identical;
- all previously known PO versions are identical;
- new fact dates are exactly the intervening completed dates;
- new forecast vintages have creation weeks newly available by the cutoff;
- new PO versions have `known_at` in the newly available interval;
- dimensions, mappings, constraints, and economics change only through explicit
  effective-dated source records; and
- no private field, scenario label, truth path, or canary appears in an observable
  package or release-series manifest.

### Generator invariants

- Same inputs and seed reproduce the simulation ID and all file hashes.
- Golden and held-out configs produce different identities.
- Changing shard size or processing order does not change business facts.
- Scenario allocation matches its declared deterministic rules.
- Scenario interventions affect only assigned entities and declared causal descendants.
- Every daily store-item row reconciles through demand, supply, and inventory state.
- Every stockout episode has a valid onset and optional recovery sequence.
- No scenario is validated by calling Memento code or reproducing Memento thresholds.

### Mutation fixtures

Add small, synthetic fixtures that prove validation rejects:

- a rewritten historical actual;
- a forecast vintage created after the release cutoff;
- a forecast using future realized demand;
- a PO version known after cutoff;
- a missing initial PO version;
- double-counted open and in-transit supply;
- a disappearing partial-order remainder;
- a release with an incomplete 28-day terminal outcome window;
- a changed cohort under the same profile identity; and
- private truth or scenario labels in observable output.

## Workstream 8: CLI and operator workflow

Add explicit commands or arguments for:

```text
preflight temporal profile
generate temporal world
publish temporal release series
validate temporal world
validate temporal release series
produce private source-acceptance summary
```

Commands must require an explicit source root for publication. They must never discover
an arbitrary old output implicitly. Generated data stays ignored; only configs, schemas,
tests, and documentation are committed.

Preflight must report:

- selected cohort and hash;
- daily and forecast row estimates;
- number of weekly releases;
- projected copied or referenced release volume;
- available and required disk space;
- scenario counts by family;
- terminal outcome coverage; and
- all source/config hashes participating in identity.

If physical duplication of cumulative releases is material, optimize publication
without changing release semantics—for example, deterministic partition reuse or
hard-link-safe staging only if integrity and portability remain explicit. Do not weaken
immutability or make a release dependent on mutable source files merely to save space.

## Expected file-level implementation

The builder should expect changes in these areas of `walmart-synthetic`:

| Area | Expected change |
|---|---|
| `config/runs/` | Add the 10-item/1,000-store temporal profile and cadence |
| `config/scenarios/` | Add separate golden and frozen held-out scenario definitions |
| `src/synthetic_retail/miro_oos.py` | Parameterize profiles; select the cohort; generate causal variation and rolling forecast vintages; publish weekly releases |
| `src/synthetic_retail/contracts.py` | Reuse existing schemas where possible; add only a private episode schema if daily truth cannot express acceptance needs |
| `src/synthetic_retail/miro_validation.py` | Validate multiple forecast vintages, the full release series, cross-release immutability, and terminal horizons |
| `src/synthetic_retail/iteration_slice.py` | Preserve legacy behavior; extract cohort-selection helper if sharing prevents duplication |
| `src/synthetic_retail/cli.py` or `generate.py` | Add explicit temporal preflight/generate/publish/validate commands |
| `tests/unit/` | Add scenario, vintage, cohort, episode, cutoff, and immutability tests |
| `tests/integration/` | Add a minimized multi-cutoff end-to-end temporal release test |
| `docs/` and `README.md` | Document profile purpose, truth boundary, commands, outputs, and limitations |

New modules are justified only when they isolate a current responsibility. A likely
bounded split is:

```text
src/synthetic_retail/temporal_profile.py   # config, cohort, cutoff schedule
src/synthetic_retail/temporal_scenarios.py # deterministic assignment/interventions
```

Do not add a database, workflow engine, feature store, graph system, or model-training
framework.

## Verification matrix

### Unit verification

- deterministic 1,000-store cohort and hash;
- exact ten-item filtering across dimensions, mapping, constraints, and economics;
- cutoff schedule generation and terminal-horizon rejection;
- physical lead-time changes produce a new world identity;
- a single shared production path across all scoped items;
- no shipment before both stock readiness and sufficient PO authorization;
- seven-day order-increase lag before new firm quantity appears;
- expediting supplier transport preserves retailer processing and store delivery;
- concurrent production and PO waits use dependency joins instead of summed waits;
- review lead-time changes reuse source releases and preserve physical outcomes;
- effective-date resolution and missing/invalid lead-time configuration;
- deadlines before, on, and after a cutoff, including allowances beyond the horizon;
- sufficient internal warm-up and retained PO history for longer supply cycles;
- stable scenario IDs and assignments;
- non-overlap or explicit precedence for conflicting scenarios;
- each causal intervention's inventory and PO behavior;
- forecast revisions using only creation-time information;
- stockout onset, episode, recovery, and censoring derivation;
- cross-release row equality for past actuals and forecast vintages;
- PO lifecycle and inventory reconciliation; and
- private truth leakage rejection.

### Integration verification

Use a minimized cohort, such as two stores, two items, and several weekly cutoffs, to
run:

```text
generate -> publish series -> validate every release -> validate cross-release history
```

Assert immutable replay and exact manifest identities. Do not use the full generated
world as a committed fixture.

### Full-profile acceptance

For the initial golden profile (repeat with configuration-derived counts when the
optional extended held-out benchmark is generated):

1. Preflight passes without weakening resource gates.
2. Generation completes with exactly 1,190,000 sales rows and 1,190,000 inventory rows.
3. All ten weekly release sets publish and validate: six scored and four outcome-only.
4. The release-series manifest contains the exact ordered cutoff set and hashes.
5. Every earlier actual and forecast vintage is byte- or value-identical in later
   releases.
6. PO and inventory quantities reconcile at every cutoff.
7. The final release supplies a complete 28-day outcome window for every scoring cutoff.
8. Required golden scenario families produce their intended observable signatures.
9. The golden profile meets declared scenario/base-rate bounds without reference to
   Memento output. Held-out config loading and identity separation have minimized tests;
   full held-out generation is deferred until the benchmark milestone.
10. Private truth and scenario labels are absent from all observable packages.
11. A fresh replay reproduces simulation, release-set, series, and file identities.
12. Existing 90-item/2,000-store profile tests remain unchanged and passing.
13. Lead-time cases preserve the declared distinction between source dynamics and
    human review allowances, with unsupported horizons identified explicitly.

## Handoff to Memento

The source implementation is complete when it can provide Memento with:

- one golden release-series manifest;
- one frozen held-out release-series manifest at the later benchmark milestone;
- the ordered cutoff identities and terminal outcome date;
- observable-only packages for every cutoff;
- source validation and reconciliation summaries;
- private source-acceptance summaries retained only in the source repository; and
- documented hashes for run, scenario, cohort, simulation, releases, and series.

Memento then owns:

- ingesting each observable release independently;
- computing and freezing complete store-item assessments;
- ranking without private labels;
- evaluating later reported-zero outcomes at 7, 14, and 28 days;
- reporting recall, precision/yield, warning lead time, alert burden, concentration by
  rank cutoff, and alert churn; and
- keeping product evaluation artifacts separate from source truth and Signal releases.

Do not expose the private held-out outcome summary to the Memento computation path. A
human may inspect it after the benchmark run to diagnose source coverage, but product
scores must be derived from later observable releases.

Report episode-level results as well as cutoff-level results so a persistent episode
is not counted as multiple independent successes. Keep already-zero pairs separate
from new-onset prediction. Publish horizon and lead-time eligibility counts, including
events with no timely warning opportunity. Do not remove an observable in-horizon miss
because the configured review deadline had already passed; count it in event recall
and separately report that timely review was unavailable.

## Out of scope

- customer or production data;
- changes to Memento metric formulas or rank weights;
- semantic decision registry implementation;
- AI prose generation;
- recommendations or action learning;
- causal claims about interventions Memento did not execute;
- planogram or door-expansion evaluation;
- calibrated Walmart operational behavior;
- claims that reported inventory equals shelf availability;
- production deployment or externally visible publication; and
- modification or deletion of prior generated worlds and releases.

## Completion criteria

This plan is complete only when:

1. One continuous 10-item/1,000-store world drives the initial 119-day history, with
   an optional 182-day benchmark using the same configurable generation path.
2. Weekly releases reveal only information available at their cutoff.
3. Prior actuals, forecast vintages, and known PO versions remain immutable.
4. Scenario causes are independent of Memento calculations and ranks.
5. Golden and held-out profiles have separate identities; the held-out configuration
   is frozen before benchmark tuning or evaluation begins.
6. Observable reported-zero episodes are sufficiently varied to evaluate warning,
   misses, false alerts, recovery, and rank concentration.
7. Private truth remains physically and logically outside Memento ingestion.
8. Release-series validation proves continuity, cutoff safety, reconciliation, and a
   complete terminal outcome window.
9. Existing source profiles and releases remain valid and unchanged.
10. The source handoff is sufficient for the Availability foundation plan's historical
    replay work without introducing another datastore or simulation engine.
