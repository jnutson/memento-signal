# Retailer-forecast baseline reset — 2026-10-18

Status: implemented and mechanically verified in both repositories. This receipt separates implementation correctness
from predictive effectiveness; it is not acceptance of a never-miss business promise.

## Implemented boundary

- Metrics contract `retail-backend-metrics-v3`; default model `retailer_baseline`.
  Eligible Walmart long-range weekly quantities are unchanged. Daily allocation is
  uniform and explicitly labeled; missing forecast does not become sales velocity.
- Historical adjustment is an explicit `historical_adjusted` comparison mode. Prior
  backend-v2 and descriptive-v1 releases and evaluation-v1 receipts remain readable.
- Evaluation `observable-metric-replay-v2` separates advance-warning coverage,
  seven-day warning coverage/opportunity, conservative-date recall, signed/absolute
  date error, supply-change strata, initial observable velocity strata and risk churn.
- All later actuals, new POs and revisions are outcome/evaluation evidence only.
  They never enter an earlier projection. No private scenario labels enter Memento.
- UI, legacy Signal ranking, ontology and action recommendations are unchanged.
  Replay never activates metrics or Signal pointers. No new dependency/datastore.

## Source design and golden identity

New source profile: `config/runs/miro_iteration_retailer_baseline_v2.json` in
`jnutson/walmart-synthetic`. 10 items, 1,000 trading stores, 50 explicitly unstocked
promised stores, 119 actual days, ten weekly releases/six scoring cutoffs.

Velocity mix: 2,000 slow, 5,000 core, 3,000 faster trading pairs, plus 500 explicitly
unstocked promised pairs. Baseline totals are approximately 97,067 units/week and
$2.906m retail/week before seasonal effects. These are synthetic assumptions, not
measured retailer benchmarks or the old parent revenue target.

Golden world: `e6a8e674f4e405e7d2f11ace6f3952fde3b8dd175d2ee1d4978a8dbe91dfc78b`.
Golden series: `f26ff5542392cd57f02cb3bf95cdeab6be6879a28f45d72392fdcc6da4387f69`.

Source world audit passed with 1,249,500 rows per daily fact, PO/inventory conservation,
cutoff-safe forecast vintages and required observable signatures. None of 6,400
healthy-control pairs stocked out. Delayed receipt, depletion, production-too-late
and recovery cases generated observable zero episodes. Scenario summaries include
whole-history episodes, not isolated causal effects; assignment is not proof of
every named business outcome. Full series audit/replay receipts follow.

Golden full-series audit passed all ten releases: immutable history, cutoff safety,
complete outcomes and PO reconciliation. Golden replay passed ten snapshots, nine
adjacent-history comparisons and byte-identical republication at every cutoff.
Evaluation: `eval_5901c38adb8cccc1e9306a382000b45874f4d3acac96a0b0df9b3d78030d8d8f`.
Last scoring metric: `met_0c2a3017a084e0de77c75725dcbcc554e65e4919035aea9a6c237ae031c96a6e`.

| Golden horizon | Eligible episodes | Advance-warning episode recall | Conservative-date episode recall | Pair-window prediction yield | Date MAE, window true positives |
| --- | ---: | ---: | ---: | ---: | ---: |
| 7 days | 532 | 87.41% | 56.58% | 97.08% | 0.50 days |
| 14 days | 682 | 92.08% | 63.78% | 74.85% | 0.69 days |
| 28 days | 809 | 99.75% | 78.86% | 5.92% | 1.90 days |

At 28 days, 807/809 episodes received an advance flag. Initial forecast-rate core
and faster groups each had 100% advance coverage in this synthetic golden run;
slow sellers had 98.79%. These are development-set measurements, not real-world
effectiveness evidence. The 28-day yield is poor: 32,719 flagged pair-windows had no
observed stockout, and 32,716 of those had a later new PO. Only three were in the
no-observed-supply-change stratum. This association supports separating committed
exposure from outcomes under ongoing replenishment, not a causal prevention claim.
No ranker/alert policy is built to suppress these exposures, and no success threshold
was selected to hide the burden. Do not call exhaustive exposure flags useful alerts
merely because episode warning coverage is high. Date MAE excludes missed events.

The broad source `healthy_control` cohort represents physically healthy ongoing
replenishment, not guaranteed 28-day coverage by already-committed POs at every
cutoff. Fully covered controls have their stated no-shortage expectation when
their known inputs actually cover the horizon; exact covered/on-time cases are
verified independently in fixtures. Family labels must never stand in for current
assessment facts. This distinction is an explicit limitation of the broad scenario
allocation, not permission to hide unfavorable exposure flags or redefine scores.

Independent private source QA (never consumed by the product) measures fully
in-stock realized-sales WAPE: nearest-week core 5.72%, faster 3.53%, slow 22.03%;
four-week core 7.04%, faster 5.45%, slow 19.93%. Multiple vintages of the same
actuals are correlated. The +/-3% to +/-8% generation envelope is around the
issue-time expectation, not a bound on realized-sales error.

## Freeze before holdout

Holdout configuration was declared before golden consumer evaluation; its SHA-256 is
`d7e3901f1e3cb986f28ece66898d025fea6933798b8eef96f12796aff99425a4`.
It changes assignments, event duration, supply delays, magnitudes and demand/forecast
noise realizations while retaining the velocity mix/cohort. It is not new-account
validation and does not replace untouched future real-account history.

Consumer/evaluator code frozen for this benchmark:

| File | SHA-256 |
| --- | --- |
| metric_contract.py | 8f8a0546ec72059ea82295d79bc4df35d3f7cbd9389a4f6e670cfa36ad7363dc |
| metric_supply.py | 9767418933e9106a549160aafb1d19ae0e792f59a77a91698ca5569fd749f559 |
| metric_replay.py | fef5c728cbc17f4b31c5c78adb3acacd12e898af260afcd016f17d2bf3f27634 |

The final metric manifests additionally bind publication/helpers/configuration;
evaluation manifests bind evaluator code and every input metric release. Holdout
generation follows successful golden replay; no thresholds are selected from its
outcomes. Any model/evaluator fix after opening holdout requires disclosure and a
new untouched benchmark for subsequent tuning claims.

## Frozen holdout result

After successful golden replay, the frozen holdout was generated, world-audited,
published and full-series-audited. No model, evaluator or holdout-config changes were
made after golden evaluation; the code/config hashes above match the final files.

- World: `2263606eb3418acbe46ffe6ac9984f55db0b04602124e72051b6b8f5e926c921`.
- Series: `55fd1901e6b0cf57ac262d2539d7b1c1406e3c3b2baf60588a6064e2e42eb70c`.
- Evaluation: `eval_ed0163193440db82a8f07988019834531da2d094f04d884edc1c63cb3e860948`.
- Last scoring metric: `met_5d4b617912b5ba33e7648d7dc44856ce51df0269873e480d9a3ef8691bff6038`.

Holdout passed ten source releases, ten backend snapshots, nine adjacent-history
comparisons and byte-identical metric republication at every cutoff. Both pointers
were unchanged. Source healthy-control zero-pair fraction was again 0%.

| Holdout horizon | Eligible episodes | Advance-warning episode recall | Conservative-date episode recall | Pair-window prediction yield | Date MAE, window true positives |
| --- | ---: | ---: | ---: | ---: | ---: |
| 7 days | 603 | 84.58% | 53.07% | 98.46% | 0.48 days |
| 14 days | 766 | 93.08% | 58.62% | 79.17% | 0.83 days |
| 28 days | 921 | 99.78% | 76.11% | 6.41% | 2.09 days |

At 28 days, 919/921 eligible episodes received an advance flag; seven-day warning
recall among episodes with a seven-day opportunity was 99.44%. Of 32,547 flagged
pair-windows without a later stockout, 32,546 had an observed later new order (three
also had revisions); one had no observed supply change. These are associations,
not proof those orders causally prevented stockouts. The 28-day warning burden
remains unacceptable as an unqualified actionable-alert promise. No ranker or policy
was added to conceal that result. New-world results cannot be attributed solely to
the model switch because velocities, forecast generation and scenarios also changed.

Independent holdout source QA: nearest-week in-stock sales WAPE was 5.79% core,
3.58% faster and 22.09% slow; four-week values were 7.16%, 5.42% and 20.09%.

## Verification and remaining effectiveness boundary

Exact tests cover unchanged retailer totals despite biased sales, daily allocation,
known depletion, sufficient/on-time versus late/insufficient supply, unavailable
inputs, later-order evidence and legacy release reading. Source tests cover exact
mix/counts, stable allocations, observed-only forecast revisions and a real minimized
v2 generate/publish/validate series.

Verification: 140 Memento Python tests passed, with zero Python type-checking errors.
Source suite: 65 passed, one existing full-target disk-capacity preflight test
deliberately not run (`test_target_identity_and_preflight_are_stable`, which needs
180 GiB free). The new profile's own resource gates passed unchanged. The v2 source
integration fixture also repeats generation; a full golden regeneration reproduced
the same simulation ID and checksummed manifest. Both repos passed whitespace
checks. No frontend tests were rerun because frontend files were not changed.

In-process backend HTTP checks returned 200 for legacy metadata, pinned v3 metadata,
10,500 supply assessments, 42,000 selected forecast rows and the golden v2 evaluation
receipt. No development server or browser was started. The three existing Metrics UI
file hashes remain unchanged; replay receipts confirm both pointers unchanged.
Holdout's evaluation and pinned supply endpoints also returned 200 through the
in-process backend client. No commit, push, deployment, activation, real-data access,
new datastore or dependency was introduced. Existing exploratory immutable releases
were preserved rather than deleted.

Stochastic scores are measurements, not self-selected pass thresholds. Exact fixture
failure or invalid source/time boundaries blocks mechanical acceptance regardless
of aggregate scores. Known-firm-supply exposure and eventual outcomes under later
ordering are different questions. New PO/revision strata help explain the mismatch,
but neither a new PO nor absence of a stockout proves causal prevention by Memento.
Seven days is a reporting allowance, not proof that every response can act in time.
No 90-day prevention claim is supported by this 28-day forecast benchmark.
