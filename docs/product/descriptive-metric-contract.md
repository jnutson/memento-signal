# Retail backend metrics v4

The planned-order bridge is documented in `planned-supply-backend-contract.md`.
New publications use `retail-backend-metrics-v4`: firm supply keeps its previous
meaning and five separate artifacts expose validated plans and conditional expected
supply. Missing planned evidence remains unknown. v1/v2/v3 artifacts remain readable.
The sections below retain the v3 firm-only and descriptive definitions; the bridge
does not change their calculations or authorize UI/ranker/ontology work.

Original firm-only baseline contract: `retail-backend-metrics-v3`. This implements the three authorized backend
phases of the Availability foundation: descriptive correctness, exhaustive firm
supply metrics, and observable temporal evaluation. No UI, ranker, ontology, or
action-selection change is included. Historical descriptive v1 and backend v2 releases remain
readable; the existing preview's current pointers are not changed by replay.

## Retailer-baseline amendment (2026-10-18)

The default `demand_model=retailer_baseline` preserves eligible Walmart weekly
forecast quantities exactly, with multiplier 1 and explicit uniform daily allocation
that conserves the weekly total. The source feed is `long_rng_store_dmd_frcst`;
no separate short-range feed is integrated. Historical WAPE is diagnostic and defines
sensitivity paths, not a correction to base demand or a calibrated probability.
`--demand-model historical_adjusted` explicitly selects the former bias/weekday
challenger under a distinct configuration/release identity. No missing forecast
fallback to sales velocity is introduced. Both publication CLIs support the flag.

New source profile: `config/runs/miro_iteration_retailer_baseline_v2.json`, with
separate golden/holdout scenario files. The default source command is not changed;
operators must explicitly select the profile. Old worlds and evaluation receipts
remain immutable and readable. New baseline publications/replays do not activate
either current preview pointer during this implementation.

Evaluation v2 retains legacy `unique_episode_recall` as **conservative-date recall**.
New `advance_warning_episode_recall` counts an advance flag regardless of whether
its predicted date was late. Seven-day coverage is reported both over all eligible
episodes and over episodes with an actual seven-day warning opportunity. Date MAE,
signed error and within-three-day fraction are separate. Later new POs/revisions
are evaluator-only strata, not forecast inputs or proof of causal prevention.
Velocity strata use the first observable forecast rate (slow <0.5, core <1.5,
faster >=1.5 units/day), not private source bands. Intermediate PO revisions may
be missed between weekly evidence snapshots. Unknown future inventory remains
unknown rather than a false alarm, and unavailable projections remain event misses.

Use the amendment above where the original backend-v2 descriptions below refer to
default bias adjustment or describe only the legacy conservative-date score.

## Coverage

- Store-day rate of sale and U/store/week are one realized velocity calculation in
  different units. $/store/week uses actual net retail sales, not units × list price.
- Item, store, source region and item-specific frozen velocity-tier rollups expose
  units, dollars, expected/valid store-days, coverage, and reported OOS/in-stock rates.
- WoW and MoM compare completed Saturday–Friday weeks and calendar months. Same-store
  normalized rates prevent changed distribution from masquerading as velocity.
  Absolute rate change and exposure-adjusted unit change accompany percentages.
- The `metric_trend` table applies the same comparison rules to unit velocity,
  dollar velocity, total units and actual retail dollars. Totals explicitly include
  distribution changes and are not presented as same-store velocity changes.
- Weekday rates, shares and indexes use actual weekday exposure over eight completed
  weeks. Missing weekday exposure, a nonpositive sum, fewer than four observations
  per weekday, or below-90% coverage makes shares/indexes unavailable. Raw rates
  remain accessible with an explicit reason. No observed-pattern uniform fallback.
- Current inventory and due promised distribution are accessible for every observed
  or promised pair. Confirmed zero, positive stock, unknown/stale and not-applicable
  states remain distinct. Basic checks expose zero stock, unknown inventory, and
  confirmed promised-distribution shortfalls, with store-level history links.
- Daily eligible exposure, stockout episodes, consecutive zero-stock days, and
  low sales/inventory coverage checks are published. Inventory gaps break an
  episode; the next zero report is left-censored, not assumed continuous stockout.

Historical eligibility uses company-item effective intervals, product inception
date, known promises and past observed assortment flags. Missing inventory cannot
erase an expected store-day. For nonpromised pairs, exposure begins at first
observed sales/inventory; past flags are carried forward, never backward. Unknown
flags are labeled. Current dimension status is applied only to current scope:
the source does not provide historical store/item status changes, and no status
history is invented. Historical rollup names/regions remain snapshot dimensions.

All definitions and configurable thresholds are in the release manifest and on the
page. The source profile has 1,000 trading stores plus 50 additional locations with
explicit zero observations; all ten items are promised in 1,050 stores. The additional
locations become due September 25, 2026. They are not counted as shortfalls before due.
The first eight complete weeks end September 25; complete coverage is required for
a velocity tier. Tiers do not change with later actuals when this baseline stays fixed.

## Boundaries and lineage

Raw source packages remain in `walmart-synthetic`. Core canonical data remains under
`data/canonical`. Metrics are new immutable derived Parquet artifacts under
`data/metrics/met_<sha256>`, never edits to source or canonical tables.

The source series binds an observable distribution sidecar to each cutoff through
bytes and SHA-256. Memento validates the source series identity, release-set hash,
cutoff binding, exact sidecar schema, domains, unique store-items, timestamps and dates.
It maps source IDs through canonical dimensions. Promises do not become committed POs.

Each metric manifest binds canonical manifest, release-set and distribution hashes,
calculation source hashes, configuration, formulas, file checksums and row counts.
Publication is deterministic and immutable. Only `data/metrics/current.json` is
replaced atomically after publication; the existing Signal pointer is untouched.
Replay always sets activation false and verifies that both pointers are unchanged.

Current observed state needs no forecast or cost data. Missing observations are never
manufactured as zero. Sales channels are summed before counting exposure. Net returns
remain in realized sales; a nonpositive comparison baseline has no percentage growth.
Available history begins at the earliest canonical actual date, not an inferred
pre-extract promise date. Region is the canonical source region, not an invented map.

## Publish and inspect

First generate/publish/validate the distribution profile in `jnutson/walmart-synthetic`
using `config/runs/miro_iteration_distribution_v1.json`. Then, in Memento:

```sh
.venv/bin/python -m memento.metric_cli /absolute/path/to/series/<id>/manifest.json \
  --cutoff 2026-10-31T12:00:00Z --tier-baseline-end 2026-09-25 --data-root data
```

The command uses existing core ingestion, validates/maps promises, calculates metrics,
and activates the result unless `--no-activate` is passed. Optional flags:
`--minimum-coverage`, `--trend-percent`, `--trend-minimum-units`,
`--trend-minimum-dollars`, `--weekly-persistence`, `--minimum-weekday-observations`,
`--quality-window-days`. Defaults are 90%, 15%, 7 units, $50, two weekly comparisons,
four observations per weekday and a 28-day quality window. One monthly comparison is sufficient. These are
reviewable demo defaults, not learned thresholds or statistical significance claims.

Serve the API with the existing `memento.api_cli` and frontend with the usual web
development command. `/v1/metrics/metadata` exposes release metadata. Read-only
`/v1/metrics/{periods,stores,distribution,weekday,checks,trends,daily,episodes,supply,projection,orders,forecasts}` endpoints support item,
scope and release filters plus bounded pagination (maximum 200 rows). Period metrics
support week/month, starting date and highlights-only; stores support current-state
filtering and checks support check-code filtering. The browser pins every request to
the loaded release ID. Metadata also accepts a pinned `release_id`. Trends support
measure selection; supply supports projection-state filtering. Integrity failure
returns 503, never sample values. Read replay receipts at
`/v1/metrics/evaluations/<evaluation_id>`.

## Exhaustive firm-supply metrics

`supply_assessment` has exactly one row for every declared store-item, independent
of risk, forecast availability or economics. Current observed state and projection
status are separate. `supply_projection` has low/base/high daily inventory traces
for ready pairs; `supply_order` and `supply_forecast` expose the selected observable
PO versions and forecast vintages. Non-ready rows retain input features and reasons.

- Forecast: latest retailer weekly vintage whose creation week is closed by cutoff.
  Bias/error calibration is reconstructed chronologically from up to eight complete
  non-stockout weeks, using the existing pure bias/WAPE helpers. Item/cohort/default
  fallbacks and model-only weekday shaping (including uniform fallback) are explicit.
  This fallback does not replace the separately reported observed weekday pattern.
- Sensitivities use the existing low/base/high demand-path function and WAPE bounded
  to [0,1]; missing error uses a full sensitivity band and an unavailable-quality
  reason. These are not calibrated probabilistic confidence intervals.
- Firm supply uses only the latest PO version known at cutoff. Ordered minus
  received is outstanding; ordered minus invoiced is open; invoiced minus received
  is transit. Cancelled orders contribute zero. Partial receipts are not double-counted.
- Only future, dated, outstanding firm quantities within 28 days enter projections,
  before demand on the expected receipt date. Overdue, undated and beyond-horizon
  quantities remain separate evidence. No planned order or action branch is invented.
- Open/transit balances and observation-day receipt deltas must reconcile to the
  reported inventory snapshot. Missing or mismatched supply evidence is unknown,
  not healthy. Receipt deltas come from known PO versions, not lifetime received totals.
- Cover is on hand divided by average 28-day base demand. Zero/missing reference
  demand has no invented cover. Depletion is the first projected closing zero;
  unfulfilled date is the first positive unfulfilled demand. A 1e-9-unit numerical
  equality guard prevents floating-point residue from moving these dates.
- Unfulfilled retail amount uses reported current unit retail or an explicitly
  labeled realized 28-day average. Retail-minus-unit-cost exposure requires known
  effective cost. Neither is attributable realized lost sales or brand profit.
  Economics gaps do not prevent quantity projections. The canonical source is USD;
  no currency conversion is performed.

## Observable temporal evaluation

```sh
.venv/bin/python -m memento.metric_replay /absolute/path/to/series/<id>/manifest.json \
  --tier-baseline-end 2026-09-25 --data-root data
```

All ten weekly cutoffs are independently published and repeat-published without
activation. Six scoring cutoffs use the four remaining outcome-only releases to
complete the last 28-day window. The evaluator verifies actual prefixes, completed
metric history, frozen tiers, coverage/population, checks, quantity conservation,
forecast creation weeks, PO timestamps, horizon bounds and current-pointer stability.
Completed-history immutability targets this fixed-cohort, fixed-promise source profile.
Backdated business-scope corrections or revised hierarchy membership need an explicit
revision contract; this evaluator must not silently accept them as unchanged history.

Outputs under `data/metric_evaluations/eval_<sha256>` include immutable source and
calculation lineage, invariants, check appearance/clearance, pair-horizon outcomes,
and deduplicated episode evaluation. The report is itself checksum-verified.

- Pair-horizon recall/yield at 7/14/28 days describe whether a later new zero-stock
  event occurs within the predicted window. Timing error is reported separately.
- Unique episode detection is stricter: predicted depletion must be no later than
  actual episode onset, with an observed positive inventory position at the scoring
  cutoff and sufficient warning-window opportunity. Repeated cutoffs do not inflate
  the count of distinct detected episodes.
- Already-zero, outside-scope, unknown-current and incomplete-outcome populations
  remain explicit and separate. Missing future inventory never becomes a false
  alarm. Unavailable projections remain in evaluable event-miss denominators.
- The evaluator reads only later observable inventory, not private source causes,
  scenario assignments or latent demand. Outcomes never enter earlier calculations.
- Golden and holdout use the same frozen configuration. Holdout changes scenario
  assignments and magnitudes on the same store/item cohort and baseline world;
  this tests scenario robustness, not generalization to new retailers or customers.

## Still open in the larger foundation

The deadline-first Availability ranker and replacement UI are explicitly deferred.
Existing Signals and Attention priority remain unchanged. No action authorization,
recommendation, ontology registry or learned decision policy is introduced. Evaluation
results are measurements, not proof that the demo never misses a reorder window.
