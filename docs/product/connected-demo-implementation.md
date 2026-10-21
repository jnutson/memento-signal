# Connected evidence demo

Implemented at `/signal`; corrected 2026-10-20 to use the **actual supplied UI**
from `MASTER MEMENTO 2/web`, not the replacement design first built October 19.
The supplied folder is unchanged. `ReimaginedView.tsx` directly retains its render
tree and inline styling. Types, hooks, request/state handling and view-model wiring
are replaced independently. Mock products, simulations, authored outcomes and
remote map scripts are not imported. Existing `/draft`, Attention, Reports and
Metrics remain separate. `/signal` no longer redirects to Attention.

The original render markup is guarded by ordered fingerprints in
`web/tests/reimagined.test.ts`, with bounded user-approved attention and Details
insertions tracked explicitly. All 323 original literal inline style objects remain
in place; separate fingerprints protect the unchanged Review and Tracking cards.
This guards against another layout rewrite. The original home/timeline/hero/queue,
Tracking, search, Explore, Story/Details, chart/table controls, review panels,
weekly report, expansion dialog and one-pager remain in their supplied positions.
The supplied canvas layout, typography and palette are retained for the one-pager;
its data, plots and footer no longer assert simulated action benefits.

The three financial Details paths now use the [Details MVP](insight-details-mvp.md):
case-specific charts and paginated store evidence, with exact reconciliation to
the attention valuations. Review, Tracking and the action vocabulary are untouched.

## Connection

The new typed adapter reads `/api/metrics` through the existing backend proxy.
Metadata resolves an immutable release; every dependent request pins that ID.
Finding and member arrays, nested JSON operands and canonical identities are
validated. All pages are fetched before displaying a complete member population
or enabling its export. An unsupported historical release, corrupt publication,
failed page or identity mismatch fails visibly; there is no fallback product data.

Overview and Review use item/issue groups, not a single assigned issue per item.
The supplied three overview cards show modeled dollars, not finding counts.
`/v1/metrics/attention-values` now supplies the overview, queue, case estimates
and per-store valuation evidence using the [attention exposure contract](attention-exposure-contract.md).
Unavailable combines estimated missed retail sales during current zero episodes
with forward forecast exposure through replenishment. Own in-stock sales provide
the historical baseline where supported; a forecast proxy is explicitly labeled
otherwise. Actual firm receipt projections precede the declared 21-day existing-stock
scenario. Supply gap retains conditional 28-day retail exposure; Excess retains
capital at cost. These different economic measures/horizons must not be added.
The queue previews three largest-dollar issues per type, expands on request, and
uses dollar-sized dots in labeled lanes. Other observations remain in Explore.
Tooltips disclose basis and valuation coverage; `+` denotes a known subtotal with
missing members, while no valuations displays an em dash. None is realized loss,
action benefit or savings. Current finding copy is mapped at presentation time so
immutable published releases need not be regenerated. Tracking and decision-making
were left unchanged in the dollar-card correction.
Explore exposes the actual catalog and completed-week unit/dollar velocities,
sales, coverage and inventory rates. Evidence exposes every affected store,
unfiltered group totals and complete-population firm/conditional base projections.
The small `/v1/metrics/display-series` presentation endpoint joins the complete
finding membership (or current eligible item population) before aggregating daily
history and base traces. It includes all member identities and readiness counts.
Totals are null when a required member is missing; absent future dates are explicit
null display slots, never inferred forecasts. Weekly flows are summed and inventory
uses period-ending balances. The chart population and economic basis are explicit.
Actual observations are not extended with simulated history. Conditional supply
is not added again to the firm curve. Source plans show real placement/arrival
dates and remaining quantities; no probabilistic delivery ranges are invented.

The supplied Excel controls produce clearly labeled Excel-compatible CSV without
adding a spreadsheet dependency. The original PNG one-pager interaction is retained.
Finding downloads include all members, immutable identities, source operands/context,
economic basis, missing evidence and limitations. Null remains unavailable, not
zero. CSV text is quoted and protected against spreadsheet formula injection.

## Small demo interaction bridge

`GET /v1/metrics/review-context?release_id=...&finding_id=...` validates the release
and returns a finding-type cue and a short list of explicit human review questions.
The vocabulary lives in `demo_review.py`; it is not an ontology or feasibility engine.
After the user's October 20 correction, `/signal` no longer substitutes this
vocabulary for the supplied prototype's Decide controls. It retains the original
Transfer / Expedite PO, Expedite restock / Resolve distribution, Cut inbound /
Markdown, and Watch choices. Selection toggles, Commit & share / Share / Update
& share, recipient selection and the proposed → sent → approved → done → declined
status cycle are local demo interactions. Original tracking colors and seven-day
check-ins are retained. These statuses do not send messages, approve orders,
execute actions or schedule reminders. Unknown timing and action benefits display
as unavailable; the original fixed lead times and synthetic benefit formulas are
not reintroduced. Earlier demo status labels migrate without discarding notes.

Why is case-specific again: stockout duration, historical stock status, last
recorded sale and distinct dated-PO store coverage; supply depletion, firm receipts,
eligible planned receipts and Walmart demand; or cover target, excess units,
inventory capital, approved carrying cost and firm versus uncommitted inbound.
These come from published store-item operands and complete-population traces.
Release metadata remains in Evidence, not in place of business metrics. No fixed
3% carrying rate, peer velocity, inferred order cadence or intervention model is
invented. History qualifications and missing values remain visible.
Metadata additionally lists capabilities derived from validated artifact inventory.

| Prototype feature | Connected demo behavior |
| --- | --- |
| Priority/confidence score | Finding-type cue and stable published ordering. No numerical rank, probability or recommended first item. |
| Action options | Original prototype choices, selected by the human as local demo intent. No assumed transfer/expedite capacity, authorization or shipping date. |
| Action benefits | Unavailable. Existing firm/conditional projection differences are not causal savings. |
| Approvals/tracking | User-entered, clearly labeled demo status/context in browser-tab session storage, keyed by release and finding. No backend writes, external messages or PO changes. |
| Decision results | Not measured. Marking a demo note complete does not establish business success. Recovery remains observational. |

This intentionally adds no datastore, cross-user workflow, ranker, ontology,
automatic action selection or learning. Session notes are not durable/shared
approvals. The backend API is read-only, including the interaction bridge.

## Confidence/prose corrections

- “Never stocked” → no earlier positive inventory observed in available history.
- “Lost to stock-outs” / “sales recovered” → use the published projection's units
  and retail exposure, or unavailable; no realized-loss/causal-recovery claim.
- “Nothing needs action” → absence of a qualifying finding is not a health rating.
- “Likely cause” → remove authored promotion/holiday/seasonality diagnoses.
- “Arrives in time” / action deadline → source plan review date and projected
  symptom date are separate; feasibility is unverified.
- “Costing 3% over four weeks” → published carrying cost only; unavailable without
  an approved annual rate.
- “New placements outperform peers” → sustained same-store performance versus
  the prior internal baseline, not a peer/category or launch-cohort benchmark.
- “Decisions worked” / “cash freed” → not measured; observed changes are not
  attributed to user annotations.
- “Updated at 6:00 AM” → actual observation/cutoff metadata; no invented freshness.

## Running and verification

Use an existing v5 metric publication, not the legacy Signals current pointer.
Start the backend with `memento.api_cli --data-root <publication-parent>`. That
folder must contain `metrics/met_<id>/manifest.json`. Then start the web application
with `MEMENTO_API_ORIGIN` pointing at that local API and open
`/signal?release=met_<id>`. Optional server-only `MEMENTO_DEMO_RELEASE_ID` supplies
the initial release when the URL omits it. Explicit URLs override that default.
No release generation, ingestion or pointer activation is required.

The current `/healthz` endpoint checks legacy Signals, not Metrics. It may return
503 for a metrics-only root even when pinned Metrics endpoints work. Do not
activate a Signal publication simply to make that legacy health check green.

`npm run test:connected` starts an isolated synthetic publication and frontend,
exercises the real API, evidence, projection, export and session-note flow, and
checks missing-pointer behavior. `tests/test_demo_review.py` covers the read-only
bridge and integrity failures; `web/tests/connected.test.ts` covers runtime
contracts, pagination failures, missing money and safe complete exports.

## Deliberate omissions

Map/geographic history, peer/new-placement cohorts, modeled interventions,
numerical ranking/confidence, operational approvals, measured savings, AI prose
generation and recursive learning are not connected. No placeholders masquerade
as those capabilities. Existing metrics are deterministic and unchanged.

## Verification receipt (2026-10-19)

- Python: 205 tests passed; Python type check: zero errors/warnings.
- Frontend: 31 unit tests, 13 existing browser tests, seven existing fullstack
  tests and two new connected fullstack tests passed.
- Frontend type check, lint, formatting check and production build passed.
- Manually inspected the published full-size v2 September 26 release through the
  browser: all three outcome lenses; Toy 010 excess ($6,289.39 / 14 stores);
  exhaustive member evidence; actual single-store firm/conditional traces.
- Existing tests that used `/signal` as an Attention redirect now explicitly open
  `/attention`; their original workflow assertions are retained.
- No data generation/activation, dependency additions, commits or deploys. The
  dependency audit was not rerun; no dependency versions were changed.

## Correction verification (2026-10-20)

- Final checks: 207 Python tests, 34 frontend tests, 22 browser tests, both type
  checks, lint, formatting and the production build passed. Dependency audit was
  not rerun; dependencies were unchanged.

- Source-render preservation: 509 elements and 323 inline style objects match the
  supplied frontend; no `ts-nocheck`, `any` model or disabled lint rule was introduced.
- Backend display aggregation tests verify complete membership, unchanged published
  traces, missing-member nulls, invalid selections, read-only methods and integrity.
- Browser tests follow the supplied UX (not the discarded replacement design):
  overview, expansion/weekly dialogs, Story/Details, review choice, one-pager PNG,
  complete CSV, restored session note, Explore and the explicit unavailable map.
- Map/geographic history and store-format metrics remain unavailable in their
  original UI locations; no synthetic fallback readings are shown. Explore's
  unsupported historical `vs forecast` column is labeled `WoW` and uses published
  same-store velocity change instead. This is a metric-label correction, not a
  fabricated historical forecast-accuracy calculation.
