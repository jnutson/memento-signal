# Core product UI port

Implemented November 8, 2026, on `codex/core-product-ui`, based on Signal's
`codex/demo-1-original-ui` at `f9cd045`. The original Signal `main` working tree,
its uncommitted changes and the original hosted demo are preserved. This is the
customer application's first UI slice, not a production deployment or permission
to ingest confidential data.

## Product behavior

- Normal entry `/` opens `/weekly`. The explicitly enabled frozen original demo
  retains its start screen and `/signal` experience.
- Weekly summarizes the common completed Saturday–Friday sales week, then provides
  searchable product performance and original published findings. A finding is not
  an assigned task or a new financial rank. Cards preserve source order, showing
  six with a link to full exploration; no favorable-case selection is applied.
- `/detail` is a peer workspace for Sales, Inventory and Demand. Search matches
  product names and internal/retailer item codes. Product arrows wrap while
  preserving tab, supply basis and region. Finding membership clears when changing
  products. Invalid scopes fail visibly and can be cleared explicitly.
- Sales uses a weekly line chart, recorded retailer sales and existing unit velocity.
  Region links requery the same release. The regional table explicitly covers all
  regions even when a region is selected above it.
- Inventory leads with estimated unmet retail sales, then estimated store inventory.
  Firm receipts and eligible retailer plans are alternatives. Conditional plans
  require retailer confirmation. A shortage date is not an order-by date; retail
  exposure is not guaranteed recovery, manufacturer revenue or an action benefit.
- Demand exposes the existing total forecast used by Inventory. No driver stack is
  fabricated. Supported model differences remain in the original publication.
- An inventory investigation narrows to the original finding's member stores and
  retains its evidence. A separate paged/searchable store-visibility table provides
  all product stores with unknown stock intact, loading only when expanded.
- Promotion analysis, geographic coordinates and component demand have explicit
  unavailable states. They are false capabilities in this release. Signal lacks
  the demo's validated campaign/funding/event/coordinate contracts. Regional sales
  remains useful without a fabricated map. There is no invented channel mix for
  this single-retailer publication.
- No decision forms, owners, due dates, completion tracking, scenario edits or order
  execution are added. The existing `/signal` exploration remains available with
  the same pinned release; its historical UI is unchanged.

## Data boundary and calculation extension

`workspace-view-v1` is an additive read projection over validated immutable Signal
Parquet, queried with DuckDB. It does not change existing metrics, rankings,
thresholds, forecast vintages, publications or source schemas. New endpoints are
`/v1/metrics/workspace-summary`, `/product-view` and `/workspace-stores`.
Only summary may initially resolve the current pointer; detail and store requests
require an exact `met_...` release. The browser pins all subsequent links and
requests, validates response identities and offers an explicit latest-release
choice if a pinned release is unavailable. No demo fallback is used.

These view contracts extend the existing glossary and `metric_contract.FORMULAS`;
they do not rename the predecessor Signal scores or import the demo's denominators.

| ID | Implemented contract, grain and basis |
| --- | --- |
| UI-W01 | Latest complete source-calendar Saturday–Friday week at/before observation date. Per-product units and retail dollars are the existing `metric_period` item facts. Portfolio totals sum each product once. Available-record totals may be partial; coverage and covered products are explicit. WoW requires every catalog product in both contiguous weeks, fully observed expected store-days, and a positive prior unit total. Unit share requires the same full current coverage and positive total; missing estimates stay null. |
| UI-W02 | Units/store/week retains Signal's `7 × fulfilled net units / valid eligible observed store-days`, including observed zero-selling days. It is not the demo's alternate listing-exposure formula and excludes unavailable sales days. Region/item periods preserve original historical eligibility; finding history intentionally uses the fixed finding-member cohort. Twelve weekly positions are retained, with missing weeks as gaps. |
| UI-W03 | Projected quantities sum existing base-path per-store demand, receipts, ending stock and unfulfilled demand by date, separately for firm/conditional supply. Only complete member projections produce whole-scope totals. Cumulative unmet retail dollars sum each store's published daily unmet units × its published current retailer price, then accumulate dates. Missing prices or store projections withhold dependent totals. Dollars are retail exposure, not the demo's recoverable shipment-revenue proxy. Horizon is 28 days, not 13 weeks. No new forecast, rescue recommendation or causal estimator is introduced. |
| UI-W04 | Store visibility is eligible product × store at the original observation date, optionally filtered by source region and literal name/code search. Pages contain only store identity, region, book stock and evidence state; limits 1–100, default 25. No source payloads, costs, evaluator data or invented coordinates are returned. |

Units retain source precision; browser number formatting rounds only for display.
Dollars remain native USD amounts, not demo cents. Dates stay native, including
publication issuance and reporting-period membership. There is no T25/T27 shift,
staged order window, forced SKU identity, fixed catalog size or fictional retailer.

## Reuse and implementation

The copied controls and icon buttons are recorded with exact source commit and
hashes in `docs/migration/core-ui-port.json`. The card hierarchy, two peer surfaces,
chart grid/hover/keyboard behavior and expandable evidence adapt the reviewed demo
UX. They do not import the 16 MB publication, showcase generators or assumptions.

Components have narrow typed inputs and separate loading/presentation boundaries.
Summary loads portfolio facts; product detail is fetched only for the selected
product/scope; store pages and finding evidence load on demand. No new frontend
dependency or datastore is introduced. Shared CSS tokens are scoped to the new UI.
Weekly/Detail navigation uses labeled 56 px circles, readable text and no dropdowns.
Charts have horizontal/vertical gridlines, nullable gaps, instant nearest-date
hover, keyboard date selection, explicit units and table equivalents. The blue/
orange palette passed the supplied color validator on white.

## Verification and local preview

Use Python 3.12 and `uv sync --python 3.12 --extra dev`; install web dependencies
with `npm --prefix web ci`. No customer dataset is copied or loaded for these checks.

```sh
.venv/bin/python -m pytest tests/test_workspace.py
npm --prefix web test
npm --prefix web run typecheck
npm --prefix web run lint
npm --prefix web run test:core
```

The browser suite starts an isolated eight-product/four-store synthetic world and
real FastAPI/DuckDB server on 8122, with web on 3122. For a manual local preview:

```sh
PYTHONPATH=. .venv/bin/python -m tests.e2e.serve_core_fixture
# Separate terminal:
MEMENTO_API_ORIGIN=http://127.0.0.1:8122 npm --prefix web run dev -- --hostname 127.0.0.1 --port 3122
```

Open `/weekly`; source cutoff dates intentionally remain the fixture dates.
The synthetic fixture uses the same pipeline and contracts; it is not customer
ingestion or evidence that customer data quality is sufficient.

## Remaining customer prerequisites

Production identity, authorization, tenant isolation, encrypted storage/retention,
access logging and operational recovery remain subject to the existing
`docs/architecture/trust-boundaries.md` design gate. This port provides no public
unauthenticated customer deployment. Do not copy the demo MCP's public mode.
Promotion/event/finance/coordinate adapters require separate input validation and
contract work before those capabilities can become supported. The original hosted
demo and existing deployment settings are unchanged.
