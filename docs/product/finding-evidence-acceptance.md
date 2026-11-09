# Three-promise findings — acceptance receipt

Date: 2026-10-19. Scope: deterministic backend findings and exhaustive evidence using
existing metrics and planned supply. No UI, ranker, ontology, action selection,
recommendation learning, new database or source-data rework.

## Verified implementation

- Contract `retail-backend-metrics-v5`, model `promise-evidence-v1`.
- New immutable `finding` and `finding_evidence` artifacts, code/input/configuration
  hashes and read-only pinned-release list/member endpoints.
- Expansion uses two recent 14-day windows against a fixed preceding 28-day internal
  baseline, with coverage, in-stock exposure, percentage and unit-materiality gates.
  Evidence includes U/store/week, $/store/week, regional/tier identity and distribution.
- Availability distinguishes reported OOS, due initial-distribution gaps, unknown
  inputs, residual conditional shortages, plan-dependent coverage and observed recovery.
  Primary symptoms are exclusive per pair; recovery can coexist with a future risk.
- Excess preserves firm versus conditional ending inventory and the declared 40-day
  cover target. Plans-only excess is separately labeled. An early shortage followed
  by late-order excess may surface both facts without combining their financial bases.
- Physical facts survive missing economics. Carrying cost is null unless an explicit
  annual rate is supplied. Group monetary totals are null when any member lacks that
  field; valued-member counts and all individual amounts remain accessible.
- No action is selected. Source placement dates are review dates, not guaranteed
  response deadlines. No two-week shortage is presented as preventable by the normal
  90-day production path. Unverified stock/PO/delivery prerequisites stay explicit.

## Checks

- **195 Python tests passed**, no skips or deselections.
- Python type checking: **zero errors** with the project interpreter.
- Exact fixtures cover firm/conditional coverage, late/insufficient plans, missing
  inventory/feed, initial distribution, previously stocked OOS/recovery, sustained
  versus one-week/sparse/censored growth, firm and plans-only excess, separate
  economics, evidence counts/units/financial reconciliation, API integrity/pagination,
  stable issue IDs with immutable evidence revisions and historical v4 compatibility.
- Existing firm/planned-feed tests continue to pass, including exact retailer weekly
  quantity preservation, no plan-to-PO double counting and firm artifacts unchanged
  with versus without the planned feed over the same canonical data.
- All **18** preexisting descriptive, firm and planned artifacts are byte-identical
  between the prior v4 publication and this v5 layer over the September 26 input.
- UI and ontology hashes match the pre-task values. No frontend checks were run:
  frontend behavior was out of scope. No active Metrics or Signal pointer was changed.

## Frozen full-size replay

Source series: `c6688020cab72f83d0c07c34c0fae7e014ef3cf3dfe12bb601cf401a02ef7cfc`.

Replay: `eval_e987d100782229452cbaad84017f1e229348d5b04c487dc408f0147998889640`.
Its local manifest is
`data/metric_evaluations/eval_e987d100782229452cbaad84017f1e229348d5b04c487dc408f0147998889640/manifest.json`.
It lists all ten pinned releases and binds source/configuration/evaluator identities.
Earlier prototype releases are preserved but are not this acceptance run.

All **ten** weekly cutoffs passed **29 snapshot invariants each**, all **nine**
adjacent-release checks passed, and identical republication was verified for each
cutoff. Both current product pointers remained unchanged. Existing history, forecast,
PO/plan conversion and conservation checks ran alongside finding membership, unique
IDs, quantity and financial reconciliation checks.

| Cutoff | Pinned v5 release |
| --- | --- |
| September 26 | `met_e0332fd1477299018767d5dfe55ece8beb8fc76bd8cdb0f054743d54958fd202` |
| October 3 | `met_ef6493783abb3de09f8c64c1dc0fd1c154d309989b0e7099303e832beaf59ae5` |
| October 17 | `met_eeeb02afb01757221f4dc0376aa11ce76cba6f1b7b81ad1e47347d9e5f844d71` |
| November 28 | `met_d0d3e24a78c5213688a60c47397f90dba666088a0b09f9d5529cbaa6c6555b9a` |

In-process HTTP checks passed for the findings list at all ten releases, **27**
promise/member drilldowns with matching group counts, and the final evaluation
receipt. The existing active legacy metadata endpoint still returned HTTP 200.
This was API verification, not browser or frontend verification.

## Presentation-date observations

Counts below are **store-item members**, not a ranked list, effectiveness score,
causal prevention count or unique-store account total.

| Finding | September 26 | October 3 | October 17 |
| --- | ---: | ---: | ---: |
| Sustained internal outperformance | 144 | 128 | 31 |
| Due promised distribution gap | 500 | 500 | 500 |
| Previously stocked, currently reported zero | 88 | 140 | 200 |
| Residual future gap under plans, excluding current-zero primary symptoms | 160 | 497 | 812 |
| Conditional plan dependency | 3,733 | 3,367 | 5,030 |
| Unknown availability evidence | 0 | 10 | 0 |
| Firm-basis excess | 110 | 95 | 18 |
| Observed recovery within the last seven closed days | 19 | 0 | 150 |

Plans-only excess is covered by exact fixtures; these three presentation cutoffs
do not have qualifying plans-only excess groups. The layer does not invent a positive
source example to fill a quota. Later outcome releases can have different membership;
the internal velocity rule is not a seasonality-adjusted or category-relative expansion
model. Holiday-wide growth, promotions and buyer context still require human review.

## Interpretation boundaries

These are descriptive/conditional findings and authored demo evidence, not a new
stockout accuracy score or prevention claim. Grouping is item/issue, not priority.
Member totals across different items are **store-item pairs**, not unique physical
stores: 500 due distribution-gap members here correspond to 50 stores across ten
items. Findings across promises can overlap and must not be summed into one impact.

Definitions and endpoints: `finding-evidence-contract.md`. The previously published
firm-path forecasting evaluation is not relabeled as improved detection effectiveness.
