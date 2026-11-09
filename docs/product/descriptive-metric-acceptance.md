# Backend metric acceptance — 2026-10-18

Scope: the three explicitly authorized backend phases. No UI, priority/ranker,
ontology, learned decision policy, or action recommendation was added.

Historical receipt note (2026-10-18): the tables below describe the previous
adjusted-forecast implementation. The unchanged-retailer-forecast reset is now
implemented and evaluated; see `retailer-forecast-baseline-acceptance.md` for its
separately versioned worlds, new measurements and verification evidence.
The strict timely-episode score combines advance flagging with a predicted-date
requirement. It is not the share receiving any warning before actual onset. Preserve
these historical scores and version the revised evaluator rather than relabeling them.

## Latest backend completion

Contract: `retail-backend-metrics-v2`. Descriptive hardening includes dated historical
eligibility, preserved missing-day exposure, dollar and total-sales comparisons,
qualified weekday patterns, stockout episodes/duration and coverage checks.
Supply assessments cover all 10,500 pairs independently of current risk or economics.
Selected forecast vintages, known firm PO versions and low/base/high traces are
published with cutoff, reconciliation and unavailable-input reasons.

Golden source series: `d478e32e82651ccffecfa8d120f46a7f29e33d9273cb7eb3fb608549dbe5cb9a`.
Holdout source series: `2e78d2ecba6742c497711a5d1a61a2002dfcd667376bb034e2528427fda4a87c`.
Holdout world: `ef999c34a0eb0938c1881283e13623338f5f9a4c6ca2a09faa3673bfc842ee13`.
Both use 10 items, 1,000 trading stores plus 50 explicitly unstocked promised stores,
119 actual days and ten weekly cutoffs. The 90-day source production path is unchanged.

Evaluation receipts (under ignored `data/metric_evaluations/<id>/manifest.json`):

- Golden: `eval_3bf0f72676f24c952b70710a200a7bf706e9dc1b20d0e8f246a6a551fe7510d6`.
- Holdout: `eval_d5b1bc1e98dd89557c36bb2d1fdc8fd1563233f3466db95202f5fe5b9e67a49c`.

Each passed ten snapshots, nine adjacent-cutoff history/tier comparisons, and
byte-identical republication of every cutoff. Six scoring cutoffs per profile
produce 189,000 pair-horizon observations (7/14/28 days). Later actuals are used
only for evaluation. Neither current pointer was activated or changed.

### Measured performance, not a claim of effectiveness

| Profile / horizon | Pair-window recall | Prediction yield | Timely unique-episode recall |
| --- | ---: | ---: | ---: |
| Golden, 7 days | 9.66% | 50.84% | 23 / 951 = 2.42% |
| Golden, 14 days | 7.08% | 48.75% | 36 / 1,206 = 2.99% |
| Golden, 28 days | 30.03% | 11.05% | 164 / 1,341 = 12.23% |
| Holdout, 7 days | 8.82% | 47.93% | 22 / 926 = 2.38% |
| Holdout, 14 days | 6.72% | 47.19% | 37 / 1,174 = 3.15% |
| Holdout, 28 days | 30.17% | 10.88% | 149 / 1,303 = 11.44% |

Window recall asks whether a later new zero-report occurs within the predicted
window; it does not prove the predicted date is early enough. Timely episode recall
requires predicted depletion no later than observed episode onset and deduplicates
overlapping cutoffs. Holdout 28-day median lead among timely detections is 23 days;
mean absolute onset error among window true positives is 12.12 days. Neither statistic
should be generalized to missed events.

Already-zero pairs are excluded from new-event scores, not counted as easy hits.
Episodes without an available positive-stock warning cutoff are reported separately
(28-day: four golden and three holdout). Incomplete outcome inventory is unknown;
fixtures verify it cannot become a false alarm. Missing projections remain in the
event-miss denominator when outcomes are known.

These are weak baseline forecasts, not proof of “never miss a reorder window.”
Observed non-events can follow new POs, revised supply timing or changed demand;
the mismatch counts do not establish causal model errors or prevented stockouts.
Holdout changes scenario assignment/magnitudes on the same baseline cohort, not
the retailer/customer population. No thresholds or policies were tuned to improve
either profile's measured results.

### Backend verification

- 131 Python tests passed; Python type checking reports no errors.
- Fixtures cover missing/nonpromised exposure, inactive/ended mappings, unit/dollar
  comparisons, weekday evidence, OOS censoring/recovery, partial/cancelled/late POs,
  receipt balance mismatch, unavailable economics/calendar/forecast, forbidden
  future actuals, future vintages/POs having no effect, and depletion versus unfulfilled dates.
- Replay fixtures cover immutable history, unknown outcomes, timely versus late
  predictions, missed events with unavailable forecasts, duplicate publication,
  pointer preservation and fail-closed evaluation serving.
- Golden and holdout source audits passed independently. Backend replay uses no
  private scenario labels or latent demand. No source code or source extracts changed.
- UI source files and current preview/Signal pointers remain unchanged. The prior
  frontend verification below is historical; UI tests were not rerun for this
  backend-only change. No new dependency, datastore, commit, push or deployment.
- Live backend smoke checks returned 200 for legacy metadata, pinned v2 metadata,
  all-pair supply assessments, forecast evidence and both evaluation receipts.

## Unchanged descriptive-v1 preview snapshot

## Source and publication

- Source repository: `jnutson/walmart-synthetic`.
- Profile: `config/runs/miro_iteration_distribution_v1.json`.
- World: `f46a26521c0d0bcb44ad1056f7b947803a99ac6778ed491f0b22cfc3914317ba`.
- Series: `d478e32e82651ccffecfa8d120f46a7f29e33d9273cb7eb3fb608549dbe5cb9a`.
- Source series path: `releases/miro_iteration_distribution_golden_v1/series/<series>/manifest.json`.
- Coverage: 1,050 stores, ten items, 119 days, 1,249,500 rows per daily fact.
  All ten release cutoffs have observable promised-distribution sidecars.
- Source audit passed: historical immutability, cutoff safety, forecast vintages,
  daily inventory conservation, PO/inventory reconciliation and explicit zero
  observations for the additional 50 promised locations.
- Memento published cutoff: `2026-10-31T12:00:00Z`; observation date October 30;
  frozen tier baseline ends September 25.
- Canonical dataset: `mds_bf5d364a94faaa8b837472effa1e8ebdff429de887d5fe4f23b0f9f9483e5d15`.
- Metric release: `met_d5c903325d6fc634d92c01cc900134434d195f5d93c7d4d734d994bbede90c02`.
- Three full-sized repeated publications produced the same release and file hashes.
  Single-threaded aggregation is intentional: parallel floating-point reduction
  produced small byte differences during verification and was corrected.

At this cutoff, 10,500 store-items reconcile to 9,933 with positive reported
inventory and 567 with reported zero inventory. There are no unknown inventory
positions in this deliberately complete source slice. Every item has 1,050 due
promised stores; confirmed zero counts range from 51 to 66. Missing/stale cases
are separately exercised by minimized fixtures and must not become zero stock.

## Earlier descriptive-only verification

- Memento: 104 Python tests passed, including 19 new metric tests.
- Python type checking: no errors.
- Frontend: type checking, lint, formatting, 22 unit/component tests and production
  build passed.
- Existing browser regressions: 13 passed; existing full-stack regressions: seven passed.
- New Metrics flow additionally verified in a real browser against the generated
  Parquet release: metric values/coverage, promised distribution, per-store check
  history, and weekday pattern. Relevant requests returned 200 and pinned the same
  metric release ID. Initial cancelled requests were React development-mode cleanup;
  the only unrelated console error was the existing missing favicon.
- Dependency audit: runtime clean; the repository's existing development-only
  advisory exception remains in effect.
- Source repository: 61 tests passed. One unchanged legacy target preflight test
  was excluded because it requires 180 GiB free disk, more than this host had.
- Both repository diffs passed whitespace checks. No commit, push or deployment.

## Remaining foundation work

Exhaustive supply assessments and observable event evaluation are now implemented
as described above. The remaining scope is predictive-quality investigation and,
only after a subsequent request, the deadline ranker/replacement UI. Existing
Attention/Signal releases were not replaced. The ontology and action-branch registry
remain deferred and require substantial product-owner context and approval.
