# Memento Signal full-scale findings

Assessed: 2026-10-12. Product acceptance is blocked by source calibration,
observed-outcome quality, and signal-generation performance. Passing technical
checks below does not establish v1 readiness.

## Why availability dominates

The initial cohort contains 180,000 store–item pairs. It produces 121,392
Availability candidates (67.44%), 9,065 Demand Momentum candidates, and 67
Inventory Imbalance candidates. The 130,524 signal IDs and type/store/item keys
are unique; these counts are not duplicated ingestion or publication rows.

Availability adapts every eligible legacy prediction: the base path depletes
within 28 days, estimated lost retail sales are positive, and completeness passes.
Only 58,608 pairs are suppressed for no base-path depletion. Candidate generation
has no top-ten cap; the cap applies after ranking.

The projection includes only dated commitments known at the initial cutoff. It
does not assume orders will be created later. Of 180,000 pairs, 154,135 (85.63%)
have no outstanding non-cancelled inbound scheduled within the 28-day horizon.
Average on-hand cover is 20.07 days and average known inbound cover is 3.59 days
against the frozen forward forecast. Aggregate on-hand plus scheduled inbound is
below total forecast demand for 121,128 pairs. The additional 264 depletion
candidates can be explained by receipt timing: sufficient total inbound does not
prevent a stockout before its arrival.

The source generator places new orders whenever inventory position reaches its
reorder threshold. The evaluation release records 181,333 new order lines across
175,109 pairs after the initial cutoff. Those future orders cannot legitimately be
included in the original cutoff-safe projection. The resulting signal is a
conditional commitment gap; it performs poorly as an unconditional forecast of
stockouts under continued automatic replenishment. Any change to that product
meaning requires an explicit contract decision, not silently adding future data.

## Why the top ten contain only availability

Ranking was recalculated for every published candidate and matches all five rank
fields. Impact is a percentile within each signal type, with weights of 0.50
impact, 0.30 reaction, and 0.20 confidence. Larger retail amounts do not alone
explain the cross-type ordering; absolute amounts break equal-score ties.

| Type | Best overall rank | Best total score | Leader impact | Leader reaction | Leader confidence |
|---|---:|---:|---:|---:|---:|
| Availability | 1 | 0.879355 | 0.999497 | 0.642857 | 0.933748 |
| Demand Momentum | 539 | 0.844060 | 0.996690 | 0.500000 | 0.978573 |
| Inventory Imbalance | 24,099 | 0.701677 | 1.000000 | 0.214286 | 0.686956 |

The availability leader reaches impact in 10 days with a 10-day reaction constraint.
The demand leader reaches impact in 14 days. Its better confidence does not offset
the smaller reaction component. All 67 inventory candidates have negative reaction
slack and receive the contracted 0.25 late-to-prevent factor. Inventory eligibility
also excludes all 121,392 base-OOS pairs, and 58,541 remaining pairs have no excess.
The rate of 0.25 is correctly recorded; it is separate from the late-to-prevent
factor, which happens to have the same numeric value.

The approved three-metric plan requires a naturally mixed top ten for a controlled
fixture. Full-scale acceptance requires recording the observed composition, not a
quota for each type. Earlier chat statements describing this full-scale composition
as an automatic contract failure were incorrect. The current UI filters the immutable
overall top ten, so demand/inventory filters correctly return empty queues here.
This is a real demonstration limitation despite correct filtering behavior.

## Source calibration defect requiring a separate Synthetic Data fix

The initial 364-day canonical sales sum is $247,704,507,864.45, or 1,981.64 times
the run profile's $125,000,000 annual target. This discrepancy exists in the
source-derived facts, before Memento signal scoring.

In Synthetic Data's `src/synthetic_retail/miro_oos.py`, store weights are normalized
to sum to one, and item daily units are derived from the total annual sales target.
The subsequent base-demand equation multiplies by `store_count` again. For 2,000
stores, this introduces an extra factor of 2,000. Price effects, seasonality,
rounding, and fulfillment explain why realized sales are not exactly 2,000 times
the target. Because stock and demand both use that base, the scaling defect alone
does not establish the cause of the 67% depletion rate; it does invalidate the
intended economic calibration and greatly inflates impact amounts.

Required source work: correct the allocation of total item demand across normalized
store weights; add an independent cohort-level annual sales/unit calibration gate;
validate the resulting rounding, stock, forecast, and replenishment behavior; and
publish a new content-addressed simulation and three immutable release cutoffs.
Existing releases must remain unchanged. Memento must then repeat consumer acceptance.
This investigation did not modify the Synthetic Data repository. Its implementation
is outside this repository's authority under `AGENTS.md`.

## Matured prediction evaluation

The evaluation release ingested ten canonical tables in 200.05 seconds, with maximum
resident set 4,159,471,616 bytes. Evaluation completed in 1.67 seconds, with maximum
resident set 2,329,788,416 bytes.

All 121,392 initial predictions have a complete observable 28-day evaluation window.
Only 2,341 pairs (1.93%) have an observed stockout. All ten displayed predictions
have no observed stockout: precision at ten is **0.0**. The current Signal top ten
and legacy prediction top ten contain the same ten pairs, so this result applies to
the displayed Signal queue as well.

Mean absolute prediction-date error is 0.5028 days and median error is zero among
the 2,341 predictions with observed stockouts. It is undefined for the displayed
ten because none had a stockout. This conditional date metric must not be presented
as overall forecast accuracy. Evaluation uses observable later inventory, not
private generator truth. Precision is an outcome check, not a causal assessment of
interventions or avoided stockouts.

## Technical acceptance and reproducible checks

Run `.venv/bin/python -m tools.verify_signal_release --data-root data` against the
ignored local generated artifacts. The verifier checks all candidate ranks, unique
identities, evidence counts/references, manifest hashes, immutable publication reuse,
the actual API queue, all three filters, all displayed details, and queue stability.
It passed against the complete release, with 10,528,896 evidence rows.

Publication replay returns the existing immutable release with byte-identical
manifest, signal, evidence, and current pointer. This verifies publication
idempotence and integrity. **It is not an independent rerun of all source producers.**
Full source-producer recomputation has not been rerun against this economically
miscalibrated world and remains a required gate for the corrected world.
Prediction and evaluation CLI-function replays also return the same published
identities, with unchanged prediction manifest and evaluation manifest/file hashes.

The Playwright CLI checked the real full-scale frontend/API: queue counts, rank #1
detail with 84 evidence rows and source lineage, empty demand/inventory filters,
and restoration of the unchanged ten-row overall queue. All checks passed. The only
browser console error was a missing favicon (HTTP 404). This dataset cannot exercise
visible demand or inventory detail flows because those candidates are outside the
contracted overall top ten; existing mocked browser coverage exercises those flows.

## Performance finding

The original source-to-signal run was still active after 7h49m; its final elapsed
time and peak footprint could not be recovered from the expired terminal session.
The final immutable release exists and verifies successfully.

Two repeated-query loops are present: availability reads evidence Parquet separately
for each of 121,392 predictions; demand/inventory query history, calendar, and inbound
per eligible observation, potentially up to 540,000 SQL calls for 180,000 pairs.
These are confirmed code-level bottlenecks, although their separate runtime shares
were not profiled. Bulk evidence adaptation and grouped history/inbound preparation,
with one shared calendar read, should preserve equations, cutoff filtering, ranks,
and immutable outputs. No calculation or ranking code was changed in this assessment.

## Archive and canonical release checks

Archive ingestion passed in 394.48 seconds, with maximum resident set
4,149,837,824 bytes and peak memory footprint 4,224,586,264 bytes. Sales and inventory
cover 728 distinct days, from 2026-01-31 through 2028-01-28, with 131,040,000 rows
each. All three canonical manifests record 143 passing validation results each,
and every canonical file checksum was independently verified.

| Table | Initial rows | Evaluation rows | Archive rows |
|---|---:|---:|---:|
| Sales daily | 65,520,000 | 70,560,000 | 131,040,000 |
| Inventory daily | 65,520,000 | 70,560,000 | 131,040,000 |
| Retailer weekly forecast | 10,080,000 | 10,800,000 | 18,720,000 |
| Replenishment commitment versions | 2,321,252 | 1,540,840 | 2,328,768 |

Each release also contains 728 calendar rows, 2,000 locations, 90 products,
90 company-item mappings, 90 economics rows, and three reaction constraints.

Archive ingestion replay passed in 31.79 seconds, including independent hashes
before and after replay for every file and manifest in all three canonical releases.
Every hash was unchanged, the same archive identity was returned, and staging was
empty. Maximum resident set for that combined verification/replay command was
3,903,537,152 bytes. The original controlling handoff checksum snapshot still matches.

## Published identities and checksums

| Artifact | Identity |
|---|---|
| Simulation | `4ead8d45af58002bfc8a30c0d6241e92019f6ab4e917d7df7e379621788bfd5a` |
| Initial canonical | `mds_0779df6554b9230828803ece846ebbfa454a8e1317b77ba31af03395b3dd929a` |
| Initial prediction | `mps_c1d921fd006f0d11f219ae3e424c73d33d40790d50ff04a8d07710941885ed7d` |
| Signal | `mss_0445d9c7f0390f3165439a9fd7fa531cac678609c8a4a36b8597cdd22df4091f` |
| Evaluation canonical | `mds_6a2e91e4e76815a80c523bf79baa76e9f83b341e3ba2d924ed400b422b11fe73` |
| Evaluation | `mev_39320d7dfd73b8fc0e2dd7bfb829e1966e0db6fdd31861ec320d3a409e9be6d7` |
| Archive canonical | `mds_fce02ebe5a75faf825c5a21976cb1027f9f500f9ddddb98f3d18db118a760af0` |

Signal SHA-256 values:

```text
cf11cb1048eec18f994d6bfe1c7aa507b123129bd42aeb72f52de7864abdb254  manifest.json
d731b28d3179fa2cac6feb987ee06eb63544dc562dea9fb55fbec6112f51bc74  signal.parquet
cb4acd10da3d05d3b17b2bae6ed2046a246f50c6bfe5d150919f24edecf0f8eb  signal_evidence.parquet
5cfd5fa4d9d38e337da862b1360c0427843901954aa2062b2fcd20a05dc4d569  oos_evaluation.parquet
98ab29e0cc397c88474615644d67e2dae50ed6a26c6ba4c958f133d907d1ecd8  archive canonical manifest.json
```

Generated artifacts remain ignored under `data/`; only code, tests, and aggregate
acceptance evidence belong in this PR.

## Repository verification

`make verify` passed: 74 Python tests, clean Python and TypeScript type checks,
ESLint, eight frontend unit tests, production build, two browser tests, and one
browser-to-real-API test. The new verification utility also passes explicit Pyright
checking and its small synthetic regression test. `git diff --check` passed.
The existing FastAPI test-client deprecation warning remains.
