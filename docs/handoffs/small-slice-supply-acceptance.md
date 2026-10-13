# Small-slice supply implementation and acceptance

Completed: 2026-10-13. The approved engineering iteration is implemented in both
repositories. This does not certify calibrated commercial estimates or production
readiness. The [controlling supply contract](../plans/small-slice-supply-contract.md)
defines the new assumptions and their limits.

The original results below describe the deliberately unchanged, mis-scaled parent
world. The corrected-world rerun is recorded in the follow-up section at the end;
historical results and artifacts have not been rewritten.

## Delivered

- Removed the requested Synthetic Data read-only rule from Memento `AGENTS.md`.
- Added an immutable slice publisher and versioned generic-toy lead-time references
  in Synthetic Data, commit `8832cb883505c6d8f35e31c5ab59fbc96f424b92`.
- Published initial/evaluation slices containing the exact ten existing source items
  710000001–710000010 and the same 1,000 SHA-256-selected stores. No fact regeneration,
  rescaling, or modification of prior releases occurred. Unrelated `analysis/` remains.
- Added effective-date/hash/schema validation for supply references at ingestion.
- Added separate open/in-transit arrival ranges, partial-order handling, overdue
  handling, frozen-input planning, and committed/planned supply-timing comparisons.
- Added action-specific stage durations/slack/prerequisites. Unknown or unsupported
  actions score zero. Inventory balances, production capacity, and authority remain
  unverified rather than invented. Before/after overall ranks are inspectable.
- Added atomic hashed supply-context publication, strict API/frontend validation,
  and UI evidence for plans, arrivals, action stages, uncertainty, and calibration.
- Replaced availability's per-prediction evidence queries and demand/inventory's
  per-observation history/calendar/inbound queries with bulk reads.

## Dataset and lineage checks

Core facts: 2026-08-01–2027-01-29, 182 days, 10,000 store–item pairs, and
**1,820,000 rows each** for sales and inventory. The evaluation slice extends facts
through 2027-02-26 (210 days, 2,100,000 rows each). Calendar and original forecast
support remain declared supporting data; they are not additional core fact history.

Bidirectional `EXCEPT ALL` checks against the selected parent canonical records found
zero differences in sales, inventory, or forecasts. Source unit tests also verify
unchanged retained values, complete retained event versions, unchanged parent files,
deterministic cohort selection/replay, and rejection of damaged published artifacts.
Both source slice replays and both Memento ingestion replays returned the same
identities. Initial/evaluation source-model references validate successfully.

| Artifact | Identity |
|---|---|
| Initial source release | `a43806574dac9dc9-20270130T120000Z` |
| Evaluation source release | `40ac922ae2a59e9c-20270227T120000Z` |
| Initial canonical | `mds_5657bff6c5a15a3ed80d9b0b8165decc9ca3b234f327655b6ac662c77dbe1cad` |
| Evaluation canonical | `mds_1ea31bb9991eee19726330c0a3ead44e6270a80d99d682493312db2af21b3591` |
| Committed prediction | `mps_39a1b7bb8d06bb0a739424c3ac003afbb948a9efbb1f93c46bf46e8d8a63f03e` |
| Supply-aware signals | `mss_363efea79c848dbb9737eb30f9c349b3a0320fd4be026ab1ae6d87fc82278956` |
| Baseline evaluation | `mev_b3015c686d5f28a77eec0718935714f79f0ecc24154eb51c9da4e58db3943a4c` |

Source release manifests live under Synthetic Data's ignored
`releases/miro_iteration/release-sets/`. Consumer outputs live under ignored
`data/iteration/`. Source model SHA-256:
`7689e35286d0e42b9379697d26b02e54a9c45cf0d8060fed0cd01f3fc44a7e65`.

## Measured runtime

| Operation | Seconds | Maximum resident set |
|---|---:|---:|
| Initial slice ingestion | 6.16 | 2,802,843,648 bytes |
| Evaluation slice ingestion | 7.27 | 3,104,473,088 bytes |
| Final signal CLI run with cached prediction inputs | 14.94 | 2,119,204,864 bytes |
| Fresh-root prediction plus signal recomputation | 21.68 | 2,374,860,800 bytes |

The old full cohort ingestion took 211.46 seconds and its signal process was still
running after 7h49m. These are different workloads; improvement reflects both the
smaller slice and bulk-query implementation, not a controlled single-factor benchmark.

## Outputs and evaluation

| Type | Candidates | Overall top ten |
|---|---:|---:|
| Availability | 5,694 | 4 |
| Demand momentum | 482 | 3 |
| Inventory imbalance | 615 | 3 |

No quotas or UI reranking created this composition. Every published rank was
recalculated and matched. Supply contexts have one-to-one signal references;
ordinary evidence preserves the required 84/36-row counts and references.

With frozen demand, committed supply predicts material shortages for 6,675 pairs;
typical planned arrivals reduce that to 5,694 (14.7% reduction). Early arrivals yield
81, while conservative arrivals yield 7,475. This large sensitivity is evidence of
uncertainty, not a probability interval or a reason to select the most favorable case.

All 5,694 availability candidates have complete outcome windows. Only 123 (2.16%)
have an observed stockout. All **four displayed availability signals** have observed
stockouts, compared with zero of the baseline's ten displayed OOS predictions.
This is **4/4 within the availability subset**, not 10/10 across three signal types,
and the changed selection is not a controlled proof of general forecast improvement.
Mean absolute date error is 0.4959 days among the 123 observed-stockout pairs only.
No precision claim is made for demand or inventory-exposure signals.

The current inputs do not confirm stock/capacity/authority prerequisites. Consequently,
all current action options are unknown or not applicable and actionability contributes
zero to rank. The timing ranges and conditional options remain visible for reasoning.
This must not be interpreted as evidence that no operational action is possible.

## Reproducibility and UI

Fresh-root prediction and signal computation reproduced all four final artifacts
byte-for-byte. Evidence/context ordering is explicitly deterministic. Immutable
publication replay leaves the current pointer and all output hashes unchanged;
staging is empty. The published-release verifier checks all candidate ranks/counts,
evidence/context references, file integrity, filters, and every displayed API detail.
Its `full_source_producer_recomputation: not run` field describes that utility's own
scope; the separate fresh-root computation above supplies the independent replay.

The real slice was served through the API and frontend with Playwright CLI. All
three type filters retained ranks. Availability, demand, and inventory detail views
showed their native evidence plus supply/action contexts, anticipated order schedule,
before/after ranks, and missing prerequisites. Returning to All types restored the
identical ten-row queue. Only a missing favicon produced a browser console error.

Final artifact SHA-256 values:

```text
345749956f60b0c730f60dbb8d148da68a3ea23584b5181b6534cc3902c09cf1  manifest.json
e6627f793a4474b3572846deaf23002c43c2cd9582686a5369f82c5a0c8cd792  signal.parquet
ba2dad82ec7f2edd95ac42b2c8687dd0ef1c5172f327714070a5f012b58db7c9  signal_evidence.parquet
aced3ef95189c6e18d8c514442e19378f551ea691bb1c5384b9eb9d9f986d098  supply_context.parquet
```

## Verification and remaining limits

Memento `make verify`: **82 Python tests passed**, clean expanded Pyright checks,
TypeScript, ESLint, **nine frontend tests**, production build, two browser tests,
and one browser-to-real-API test. Focused supply checks cover milestone/explicit/overdue
dates, partial orders, missing prerequisites, invalid references/ranges, deterministic
planning, no duplicate outstanding supply, API contexts, and publication replay.

Synthetic Data focused slice tests: **2 passed**. Full source suite: **36 passed,
1 environment-gated failure** in the unchanged target preflight, requiring 180 GiB
free while 175.2 GiB was available. No test or resource gate was weakened.
Both repositories pass `git diff --check`.

Remaining limits are intentional or measured: parent economic miscalibration;
poor all-candidate stockout precision; illustrative shared routes/lead times;
unverified facility stock/capacity/authority; no automated order execution; and no
daily historical PO backtest across the whole six-month period. The source scaling
fix and a freshly calibrated fact world are outside the approved unchanged-slice task.

## Follow-up: corrected sales-scale world — 2026-10-13

The subsequent approved task corrects the source generator and publishes a separate
world, then reruns the same cohort and acceptance checks. Source commit:
[`c8a92d365a8397dba36c5f35e4a18e028cd3e27e`](https://github.com/jnutson/walmart-synthetic/commit/c8a92d365a8397dba36c5f35e4a18e028cd3e27e),
pushed on `codex/miro-brand-a-two-year`. Generated datasets remain local and ignored;
they are not uploaded to GitHub.
Generator version is 0.5.2; the allocation version is `normalized-store-share-v1`.
Normalized store shares now allocate brand revenue exactly once, without the extra
store-count multiplier. Regression tests conserve revenue for 1, 2, and 2,000 stores.

Full-world generation passed its new annual realized-revenue gate. An independent
scan of observable sales also checks dense annual coverage, revenue, weighted ASP,
and reconciliation to generator totals. The explicit tolerance is 10%; measured
deviations are much smaller. This is scale calibration, not operational calibration.

| Fiscal year | Realized retail sales | $125 million target ratio | Weighted ASP |
|---|---:|---:|---:|
| 2027 | $124,369,230.67 | 99.4954% | $24.8822 |
| 2028 | $124,634,101.60 | 99.7073% | $24.9348 |

Each fiscal year contains 65,520,000 observable sales records. Targets, items,
store references, seasonality, seed, costs, and PO policies were not retuned.
No old fact values were divided or patched. A new world was generated from the
corrected allocation, with new immutable source and release identities.

### New lineage

| Artifact | Identity |
|---|---|
| Source simulation | `3c3ade5a1ec16284bba1ed483d9f66117bf9a7cf56d427d0734ba3c70e49ec27` |
| Source configuration hash | `1260bcbe14ba4861add76b0118570c4ca11cb01c46348c389af55dc08df55961` |
| Initial slice release | `f445d45980851282-20270130T120000Z` |
| Evaluation slice release | `94ce583983a96737-20270227T120000Z` |
| Initial canonical | `mds_ea0495deed591497bb8d841cbf0cd2b6b53b28c5a67df9c9318884c4abf0faae` |
| Evaluation canonical | `mds_e7739bf4768d4b6df2d521d2cb0f23bdb69e09e6ebbabfec40bd8668d8647e6c` |
| Committed prediction | `mps_d6b6c7171a3f8d3a033919b0f0830176dfec3e738449deccbf2fa92830c45cc9` |
| Supply-aware signals | `mss_bf3eab417a2f35fa726db0454f49d604869076ce30fd9e3323b1401874d010ac` |
| Baseline evaluation | `mev_b0ab26afb7230972b45937fe20b1de88f399d72a24f927e5e4425f8c3c86e56a` |

The source-world manifest is
`/Users/mininutson/Desktop/Synthetic Data/outputs/miro_brand_a_calibrated_v1/3c3ade5a1ec16284bba1ed483d9f66117bf9a7cf56d427d0734ba3c70e49ec27/manifest.json`.
Its SHA-256 is `74c906efbf88b638c2f10829651b4b84fb9e0d5d92b17a104c2ba36866bff9a7`.
The complete `source_input_hashes` and independent annual scan are retained in
`/Users/mininutson/Desktop/Synthetic Data/executions/calibrated-v1-20261013/revenue-calibration.json`.
The source run configuration SHA-256 is
`df630af8fe111269b237e5fd4b60a7108448265ddf253241242be24a5a3b170f`.

Declared source-input hashes (also contained in the pinned source-world manifest):

```text
config/calibration/toy_us_v4.json               86348b262845331c1481a7c94364b930dcb26a11c233b28888b41908dbcbd5b1
config/miro_oos/item_mapping.json              97f3c7a8286644f3fb6f6c80e8c403ca12a4f262cae2d64e9511cc947b7f9311
config/miro_oos/reaction_constraints.json       0ec90c0fa9067bf194902d2c166e50314120f8e372111dbcc17c71795c9af88b
config/miro_signal/company_item_economics.json  81892be6a53210b62b683fd2b2fefabe99cd83931945414d00d113f99709b36c
config/reference_sources/PSP Glossary.csv      056283e7c90d83b338ab8e239b5c2b2f6229cf6da29fc9eb9c8f2e067941a6e5
config/reference_sources/target_reference.json f2fbb952d58c6cdb300e10c893b961139ad53ca2114a39b621675eda0aa8917d
config/runs/miro_brand_a_two_year.json          df630af8fe111269b237e5fd4b60a7108448265ddf253241242be24a5a3b170f
config/scenarios/miro_brand_a_oos.json          92e462b0f46a4276cb4c0dba1474bde8ca1aa165332c64b3da2e13217c1de3fe
```

New full releases are under Synthetic Data's ignored
`releases/miro_brand_a_calibrated_v1/`, with cutoffs 2027-01-30, 2027-02-27,
and 2028-01-29. Their release-set manifest checksums, in that order, are:

```text
fea026a054730b2c400caa844e24dc08487355b82caa92bd16a8b0c1e1c92c53
ce53e65ce1e2c4db5fc23d06c649e5547a15517d12fd828e1070ede06aca8813
7ff24c9b8162dcd0887325c7057cca3474b4b45723e31bd57ab975642970c4da
```

Slices are under ignored `releases/miro_iteration_calibrated_v1/`. The supply model
SHA-256 is `8d9c8dc33e91026745ce11ecab395fb5e71cfc9f17fb8511305862bed140302d`.
Only its version and calibration disclosure changed; all numerical lead times,
planning parameters, routes, and prerequisites match the original model exactly.
The UI now distinguishes validated sales scale from assumed operational behavior.

### Same slice, different measured outcomes

The same 1,000 store IDs and ten items are retained. Initial sales and inventory
again contain 1,820,000 rows each across exactly 182 days, 2026-08-01–2027-01-29.
Bidirectional `EXCEPT ALL` found zero differences between the new slice and the
selected corrected parent sales, inventory, and forecasts. The later slice supplies
the complete 28-day evaluation window. No private truth enters consumer ingestion
or outcome evaluation.

| Type | Candidates | Natural overall top ten |
|---|---:|---:|
| Availability | 83 | 0 |
| Demand momentum | 2,400 | 8 |
| Inventory imbalance | 3,213 | 2 |

Total candidates: 5,696. No thresholds, rank weights, type quotas, or carrying-cost
assumptions changed. The annual carrying-cost rate remains 25%. Committed, early,
typical, and conservative supply scenarios predict material shortages for
2,491 / 74 / 83 / 2,549 store–item pairs, respectively. This spread still indicates
substantial sensitivity to replenishment assumptions, not a probability interval.

All 83 availability candidates are evaluable; 81 have observed zero on-hand inventory
(97.5904% candidate precision), versus 123/5,694 (2.16%) in the original slice.
Date MAE among the 81 observed-stockout candidates is 1.3580 days. No availability
signals are displayed, so displayed availability precision is undefined. Demand
and inventory signals do not receive stockout-precision claims. The separate
committed-only OOS prediction queue has one observed stockout among its top ten.

There are 302 observed zero-on-hand store–item pairs across the entire later slice.
The availability candidates capture 81/302 (26.8212% coverage) and omit 221; two
candidates have no observed stockout. This observed-zero definition does not establish
lost-sale ground truth. The fixed one-unit projected-loss admission threshold and
low-volume demand assumptions still need recall/materiality investigation. Strong
candidate precision must not be presented as complete detection or model calibration.
Demand and inventory candidates also need separate outcome validation.

All 2,553 action options still contribute zero actionability because prerequisites
are unknown or unavailable. Correct revenue scale does not supply facility stock,
capacity, execution authority, or measured transport times.

### Runtime and verification

Initial ingestion took 7.66 seconds; later ingestion took 7.69 seconds. Initial
prediction plus signal generation took 22.28 seconds while other checks were running;
an independent fresh-root prediction/signal computation took 18.89 seconds. These
are local measured runtimes, not a controlled benchmark.

Fresh-root ingestion returned the same canonical identity, and fresh prediction/signal
computation reproduced all four published signal artifacts byte-for-byte:

```text
be8e641c810c14fa367db55060937b1b093f68154cabf3b8400410eaf25336d0  manifest.json
be06cc1fb4f6e5c4ba19036c602d89739d3f8ebc57f75fc1867be662a37f32f1  signal.parquet
07319b23a5d1eb0ff183389fd6768451ad09b900cfe1fb4087131b41ba0d81a2  signal_evidence.parquet
9d2ec297e5ecec1322fbf526cc54591d6227b817184261be9804590f3caa8c2f  supply_context.parquet
```

Both source slice publication replays passed. Published consumer ranks, counts,
evidence/context references, checksums, immutable reuse, API filters and all ten
displayed details passed. The browser showed the corrected scale disclosure and
real demand/inventory details with 36/84 evidence rows. Demand filtering retained
ranks 1/3/4/5/7/8/9/10; inventory filtering retained 2/6; availability filtering was
correctly empty because filters do not expand the overall top ten. Returning to All
restored the same ten rows. All API requests returned 200; only the existing missing
favicon produced a console error. Local verification servers were stopped afterward.

Memento `make verify` passed: 82 Python tests, expanded Python and TypeScript checks,
lint, ten frontend tests, production build, two browser tests and one real-API test.
Synthetic Data focused checks: 25 passed. Full source suite: 44 passed, one unchanged
environment-gated failure requiring 180 GiB free with 169.8 GiB available. No gate
was weakened and no old data was deleted to make it pass.

All MS-01 through MS-09 source checks passed for all three full releases, including
zero receipt, open-order, and in-transit reconciliation mismatches. The report is
`/Users/mininutson/Desktop/Synthetic Data/executions/calibrated-v1-20261013/release-validation.json`.
The post-publication preservation audit compared every file to the pre-run snapshot:
**232,430 existing files remain byte-identical**, including old source worlds,
releases, model copies, and current pointers. Its record is
`/Users/mininutson/Desktop/Synthetic Data/executions/calibrated-v1-20261013/preservation-after-publication.json`.
Consumer audit/evaluation records and slice-density/difference checks are retained
under ignored `data/iteration-calibrated/consumer-acceptance.json` and
`data/iteration-calibrated/slice-validation.json`.

Independent full-world source recomputation passed in 393.27 seconds. It regenerated
all 40 store shards from the fixed inputs, recomputed every dataset tree hash, and
passed the existing-world immutable manifest equality gate before discarding only
its own staging attempt. The source-world manifest SHA-256 remains the exact value
recorded above; the world and published releases were not replaced. This closes the
source-producer replay gate as well as the separate fresh consumer-producer gate.
Both repositories pass `git diff --check`. The requested scaling correction,
immutable publication, unchanged-cohort slice, and acceptance rerun are complete;
the precision/coverage and operational-assumption limits above remain open.
