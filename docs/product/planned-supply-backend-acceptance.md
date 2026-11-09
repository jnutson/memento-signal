# Planned-order backend bridge — acceptance receipt

Date: 2026-10-19. Status: implemented and verified over all ten demo releases.
Scope: planned-feed validation, canonical identity mapping, immutable evidence,
separate conditional supply metrics, read-only API and replay checks. No UI,
ranker, ontology, learned recommendation or new datastore.

## Pinned inputs and outputs

- Source series: `c6688020cab72f83d0c07c34c0fae7e014ef3cf3dfe12bb601cf401a02ef7cfc`.
- Source world: `7596eb505d62d4e7effd7e52ab53cbbbd12901b3d47538acd10b3d57b0d79823`.
- Backend contract: `retail-backend-metrics-v4`.
- Replay: `eval_4dfdf6d5a7e3f0e3822f12a6ea955bfb61bc84680c588cdd1267de2c3dc8e4d5`.
- Replay manifest: `data/metric_evaluations/eval_4dfdf6d5a7e3f0e3822f12a6ea955bfb61bc84680c588cdd1267de2c3dc8e4d5/manifest.json`.

| Cutoff | Pinned metric release |
| --- | --- |
| September 26 | `met_5e56dc3d8d302099b5c80a6c3a93864d87700dc629fd8d953d9574fd95b6dc39` |
| October 3, including feed gap | `met_854a36c091398782e2d4b9935d1de31eb3c825fa8ed7be4514ec67fc7c4265c7` |
| October 17 | `met_f184470e68cd6321849b5722a3e863fba1e59ed0a369bd503ab3638a9f2317d2` |
| November 28, final outcome release | `met_321f8ca521da701c99992de2f3b627d2fd68e7bd81221b3d1a8d9dd16c8a8f83` |

The replay manifest lists every release identity and binds the evaluator, source
series and configuration. Prototype metric publications are preserved but are not
this handoff. New runs did not activate either Metrics or Signal current pointer.

## Implemented behavior

The four existing firm-supply artifacts retain their previous semantics. Tests prove
their bytes, current-store facts and checks remain identical with and without planned
input over the same canonical dataset. All eligible Walmart weekly baseline quantities
remain unchanged. The new expected trace reuses the exact firm demand sequences and
dated firm receipts; it does not fit another demand forecast or invent order quantities.

Five separate artifacts expose canonically mapped plans, PO conversion links,
exhaustive feed coverage, expected assessments and expected daily traces. Only remaining
unconverted, future-placement, in-horizon store-dated planned quantities enter the
conditional path. Converted/withdrawn quantities, missed placements and out-of-horizon
arrivals do not become extra firm receipts. Received quantities remain accounted for
through on-hand/firm-outstanding logic, not added again from conversion history.

Unavailable planned evidence produces an explicit unknown conditional result, not zero
plans, a policy-derived fallback or a hidden missing store-item. Missing inventory and
forecast/firm evidence still prevent unsupported expected projections. Today's observed
OOS and promised-distribution checks are unchanged and independently accessible.

The strict adapter rejects invalid binding/classification/schema/path/checksum, future
knowledge, invalid/null quantities and dates, duplicate versions/sequences, incomplete
or ambiguous coverage, unsupported DC destinations and unjustified conversion claims.
Conversion allocations must match an observable same-pair PO, respect its knowledge
time and reconcile quantities without exceeding the PO's ordered units.

## Full-size observations

These counts describe conditional scenario comparisons, not ranked alerts or prevented
stockouts. Every cutoff retains all 10,500 store-item assessments.

| Cutoff | Firm gap conditionally covered by plans | Gap remains under plans | Firm-only sufficient | No positive reference demand | Unknown expected supply |
| --- | ---: | ---: | ---: | ---: | ---: |
| September 26 | 3,733 | 248 | 6,019 | 500 | 0 |
| October 3 | 3,367 | 637 | 5,986 | 500 | 10 |
| October 17 | 5,030 | 1,007 | 3,963 | 500 | 0 |
| November 28 | 4,451 | 149 | 5,400 | 500 | 0 |

October 3 has exactly 10,490 available planned-feed pairs and ten unavailable pairs.
Their expected quantities/dates remain null and no expected trace is fabricated.
The 500 zero-demand pairs remain observable inventory/distribution facts; zero demand
is not proof that their due promised distribution has been fulfilled.

## Verification evidence

- **175 Python tests passed**; no tests deselected or skipped in the final run.
- Python type checking: **zero errors**, using the project's existing interpreter.
- Full ten-cutoff replay: all snapshot invariants passed; all nine adjacent-cutoff
  comparisons passed; identical republication verified at every cutoff.
- Replay checked actual-history immutability, frozen tiers/completed periods, plan
  version/issue identity consistency, explicit coverage gaps, unchanged retailer
  quantities, exact demand/firm reuse, expected inventory conservation and exclusion
  of missed-placement quantities. Neither current product pointer changed.
- Exact minimized cases cover on-time/late/insufficient plans, multiple sequences,
  revision/withdrawal, partial/full conversions, already-received quantities,
  unknown/missing inputs, duplicate and overallocated links, wrong-pair/future PO
  claims, conversion-before-PO knowledge, path traversal/corruption and ambiguous IDs.
- In-process HTTP checks returned 200 for all nine firm/planned/expected endpoint
  kinds on pinned September 26 and October 3 releases. Legacy current metadata and
  the replay receipt endpoint also returned 200. Tests verify failed artifact integrity
  returns 503 rather than substituted data.
- Historical v2/v3 publications remain readable; v1 inventory support is retained
  and the legacy current metadata endpoint was checked successfully.
- Whitespace checks passed. No development server/browser was launched. Frontend
  tests were not run because no frontend files were changed.

The existing Metrics component, client library and Next configuration hashes stayed
unchanged. The registry-plan hash also stayed unchanged. The synthetic source repo
was read only; no source data/configuration was changed. No commit, push, deployment,
new dependency, customer-data access or persistent operational datastore was introduced.

## Limits and next boundary

Conditional coverage assumes orders are placed and stock/delivery prerequisites hold;
it never confirms feasibility or authorization. The source's conversion linkage is
explicitly synthetic FIFO matching. Unsupported/expired PO linkage requires a proper
future source contract, not silent trust. This is not exact production Walmart schema
parity and is not customer-account validation.

The existing replay's precision/recall scores still evaluate firm-only projections.
The comparison counts above are not a new accuracy score or causal improvement to
the earlier 6.41% holdout yield. The input account also differs from the old benchmark.
No “never miss,” 90-day prevention, savings or learned-recommendation claim is made.

This completes the requested planned-feed backend phase. The broader demo's common
finding/evidence presentation across three promises, reviewed queue policy, UI and
exports remain separate work. The ontology remains deferred. See
`planned-supply-backend-contract.md` for formulas, API kinds and pinned-run commands.
