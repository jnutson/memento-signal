# Small-slice supply implementation and acceptance

Completed: 2026-10-13. The approved engineering iteration is implemented in both
repositories. This does not certify calibrated commercial estimates or production
readiness. The [controlling supply contract](../plans/small-slice-supply-contract.md)
defines the new assumptions and their limits.

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
