# Attention urgency and feed acceptance

Date: 2026-10-14. Local implementation; not committed or pushed by this task.

## Outcome

Attention retains the original website demo styling and spatial renderer, with blue
and orange accents. Feed and Graph expose the same immutable overall top ten.
Native financial impact, the assumed conservative start-by date, all three scores,
and full evidence are accessible without inventing execution permission.

The current policy is impact/urgency/confidence 40/40/20. Confidence multiplies the
existing forecast-quality, completeness, and stability inputs. Urgency is urgency
to act, based on decision slack, independent of unknown prerequisites. Review/replan
allowances are labeled where no supply intervention exists. Historical reaction
fields remain compatibility evidence, not the current urgency dimension.

## Immutable release identity

- Data root: `data/iteration-calibrated` (ignored synthetic artifacts).
- Parent: `mss_bf3eab417a2f35fa726db0454f49d604869076ce30fd9e3323b1401874d010ac`.
- New current release: `mss_3420638f59c856482e33fde489ff397c08d998a8f78d526882cbcbe4f81634fc`.
- Metric contract: `memento-signal-metrics-v1.2.0`.
- Ranker: `memento-signal-urgency-ranker-v2`.
- Priority policy: `deadline-urgency-v1`.
- Confidence policy: `multiplicative-evidence-v1`.
- Configuration SHA-256: `1d887dbf2b22a7e4279531adabf60109c32de637d6fc0dee368f5e36ca496efa`.
- New manifest SHA-256: `e8bc0d810f3e92106aa14022a77530fd8b5e1848c058644a4183353bec7651db`.
- Evidence SHA-256: `07319b23a5d1eb0ff183389fd6768451ad09b900cfe1fb4087131b41ba0d81a2`.

The configuration records the parent manifest hash. All parent manifest file hashes
still match. All original signal projection/economic/input fields are unchanged;
only priority/confidence/rank and version/lineage fields change. Calculation evidence
is byte-identical. Supply contexts are equivalent after schema-default normalization,
except for the ranking-policy explanation. No Synthetic Data repository files change.

## Measured result

Admission counts remain 83 availability, 2,400 demand momentum, and 3,213 inventory
imbalance: 5,696 candidates. The new top ten are all demand acceleration, versus eight
demand and two inventory in the parent. Top-ten confidence is 0.686636–0.880987.

All ten have urgency 1: their unchanged material-impact horizon is 14 days, while
the shortest potentially-applicable conservative action is vendor-stock release at
21 days. Decision slack is −7 days, so the assumed start-by date is January 22, 2027,
relative to the January 29 observation snapshot. Stock and allocation authority remain
unknown. This clustering is a consequence of declared assumptions, not a forced
composition or graphical jitter. Across all candidates, urgency varies from
0.25 to 1; availability and demand ranges are 0.714286–1.

## Verification

Story: Attention view selection → same-origin `/api/signals` → loopback FastAPI →
immutable Parquet release → validated queue/detail → visible financial impact,
deadline, graph coordinates, and calculation evidence.

| Boundary/check | Result and evidence |
| --- | --- |
| Python policy/API/legacy suite | 87 passed |
| Python typing | Pyright: 0 errors |
| Frontend types/lint/build | All passed |
| Frontend unit suite | 19 passed |
| Mocked browser workflows | 3 passed, including feed/graph and all three signal types |
| Real API browser workflows | 2 passed, including reopening a selected signal from Feed |
| All-candidate recomputation | Timing, multiplicative confidence, impact/ranking, counts, evidence references passed |
| API release verification | Queue, filters, and all ten complete details passed |
| Immutable replay | Passed; current pointer and published hashes unchanged |
| Live local UI | Feed, graph, 36-row demand detail, unknown action prerequisites, Reports lineage verified |
| Responsive UI | Feed visually verified at 390 × 844; viewport override reset |
| Browser errors | None recorded in the live verification tab |

`make verify` passes. `.venv/bin/python -m tools.verify_signal_release --data-root
data/iteration-calibrated` passes. Screenshots remain ignored under
`data/iteration-calibrated/browser-check/attention-urgency-{feed,graph}.jpg`.

The full source producer and forecast pipeline were deliberately not recomputed:
this task derives a new priority release from frozen predictions/economics. Forecast
accuracy, action prerequisites, intervention effectiveness, and lead-time calibration
are not established by these engineering checks. The demand half-gap material date
and conservative action window remain explicitly versioned heuristics. No execution,
historical report archive, expanded all-candidate feed, or new data source is added.

