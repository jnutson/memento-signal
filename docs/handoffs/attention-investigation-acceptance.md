# Attention investigation acceptance

Date: 2026-10-14. Implemented locally on the existing dirty task branch. No commit,
push, PR update, production deployment, new dependency, or new datastore by this task.

## Delivered experience

The accepted [investigation plan](../plans/attention-investigation-ux.md) is implemented
for availability, demand acceleration, demand deceleration, and inventory excess.

- Selecting a Feed/Graph point opens Situation inside Attention, with one primary
  visual and a compact sticky identity/impact/observation/cutoff header.
- Selecting a date/week reveals Explanation. The selected interval persists through
  linked visuals and the weekly ledger; weeks expand into precise daily evidence.
- Availability shows equivalent stock cover/units, receipts, lost-demand strip,
  demand/supply reconciliation, receipt identity/ranges, and distinct demand versus
  supply-timing comparison modes. Firm and assumed receipts are differentiated.
- Demand shows historical sales/retailer forecast, highlighted qualifying recent
  weeks, forward published baseline/adjusted demand, persistence ratios, and cumulative
  gap. Acceleration and deceleration have opposite gap direction and truthful financial
  language. The impact milestone is the half-gap date, not a stockout.
- Excess shows stock versus target, excess shading, selected-date decomposition,
  target-cover policy, and capital/carrying-cost exposure kept separate.
- Urgency exposes conservative action windows and the material-impact marker;
  confidence exposes its published components, not probability. Unknown prerequisites
  remain non-executable. No forecast editing or order execution is introduced.
- Back navigation restores Feed/Graph/filter/list state; the original scene stays
  mounted, with filtered inputs memoized so drill-down does not recreate its data.
- Monday/Attention/Reports and the original Inter/white/blue/orange design remain.
  Both original CSS files retain their pre-task SHA-256 values.

## Data and API boundary

`python -m memento.investigation --data-root ...` publishes separate immutable,
synthetic-only investigation artifacts. It does not modify canonical/signal/prediction
files or the current signal pointer. The artifact binds the parent signal/canonical
manifest hashes, configuration, cutoff, cohort, and supply-model hash when present.

The new read-only endpoint is
`GET /v1/signals/{signal_id}/investigation?signal_set_id=...`, proxied through the
same-origin web API. It resolves one current release, verifies top-ten membership,
checks hashes/lineage, validates bounded rows and reconciliations, and serves only the
selected point. Changed releases return 409/reload; missing or invalid investigations
retain only validated legacy calculation evidence. No synthetic substitute charts.

History uses canonical retail-calendar weeks and matching pre-target forecast vintages,
not the old observation-relative evidence labels. Forward raw retailer forecasts are
distinct from the frozen, potentially corrected baseline. Actual observations never
extend past the observation snapshot. Weekly flows sum daily values; inventory is a
balance, never a sum. Missing/partial data and observed balance discrepancies stay
explicit. Ledger quantities display up to six decimals.

## Current immutable dataset acceptance

- Signal set unchanged:
  `mss_3420638f59c856482e33fde489ff397c08d998a8f78d526882cbcbe4f81634fc`.
- Canonical dataset unchanged:
  `mds_ea0495deed591497bb8d841cbf0cd2b6b53b28c5a67df9c9318884c4abf0faae`.
- New investigation set:
  `mis_67c2ed7aea691b8c3046d1baee4eed80d0f571a994675a1a1cfc594cfe3b5225`.
- Investigation contract: `attention-investigation-v1`.
- Stock-cover contract: `attention-investigation-stock-cover-v1`.
- All ten investigations independently rebuilt in memory and matched frozen JSON bytes.
- Every displayed investigation API response matched the validated artifact.
- Parent canonical, signal, prediction files and pointer hashes remained unchanged.
- Immutable publication replay passed. Response sizes: 81,284–86,634 bytes per point.
- Existing full signal verification still passes: 5,696 candidates, unchanged type
  counts (83 availability / 2,400 demand / 3,213 inventory), unchanged ranking and
  economics, complete evidence, and all displayed details.

The current top ten remain acceleration signals. The other paths are verified using
minimized synthetic canonical/Parquet fixtures and declared test supply assumptions;
the real dataset was not reranked or supplemented to make them appear.

## Verification evidence

Story: select Attention point → same-origin proxy → FastAPI → release-bound artifact
and canonical lineage → validated visual → explanation → weekly ledger → daily rows.

| Check | Result |
| --- | --- |
| Python suite | 94 passed |
| Pyright | 0 errors |
| Frontend typecheck/lint | Passed, no lint warnings |
| Frontend unit suite | 24 passed |
| Production build | Passed |
| Mocked browser workflows | 8 passed, all four paths and release conflict |
| Real API/Parquet browser workflows | 6 passed, all four paths and supply comparison |
| Independent current-slice investigation rebuild/API checks | All ten passed |
| Original full signal release verifier | Passed |
| Parent hash preservation and immutable replay | Passed |
| Current dataset live browser | Situation, explanation, weekly/daily detail verified |
| Browser JavaScript errors | None in verified fixture/current investigation tabs |
| Diff whitespace | `git diff --check` passed |

The Python suite emits the existing Starlette/httpx deprecation warning. Focused
investigation tests and typing were rerun after adding payload-size/symlink guards.
React/end-to-end checks caught and corrected duplicate development-lifecycle requests,
historical/forward chart ordering, and stale/static-detail navigation assumptions.

Visual evidence: all four paths × Situation/Explanation/Numbers × desktop 1280×720
and mobile 390×844 were captured and inspected across representative views. Files
are ignored under `data/iteration-calibrated/browser-check/`:

- `investigation-{risk,acceleration,deceleration,excess}-{situation,explanation,numbers}-{desktop,mobile}.jpg`
- `investigation-current-{situation,explanation,numbers}.jpg`

Viewport overrides were reset. The temporary fixture service is stopped; the delivered
local UI uses the current engineering slice at `http://127.0.0.1:3200/attention`
through the loopback API on 8200.

Reproduce checks:

```bash
make verify
.venv/bin/python -m tools.verify_investigation --data-root data/iteration-calibrated
.venv/bin/python -m tools.verify_signal_release --data-root data/iteration-calibrated
git diff --check
```

## Remaining product boundaries

No external Synthetic Data files were modified. Full source generation/forecasting
was not rerun; existing frozen signals/projections/economics are the controlling
inputs. Lead times, planning prerequisites, intervention effectiveness, and confidence
are not commercially calibrated by these engineering checks. There is no real-customer
ingestion, DC balance invention, expanded candidate feed, historical report archive,
editable scenario, execution, or AI recommendation platform in this work.
