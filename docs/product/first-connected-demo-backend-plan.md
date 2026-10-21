# First connected demo — backend execution plan

Date: 2026-10-19
Status: proposed bounded handoff; no backend implementation authorized by creation of this document.
UI handoff: `first-connected-demo-ui-agent-instructions.md`.

## Outcome

Serve the existing deterministic finding/evidence engine to the first connected read-only demo without changing analytical meanings. Prioritize proving existing endpoints are sufficient. Add narrowly scoped presentation support only where the accepted screens require it. DuckDB over immutable Parquet remains the engine; no new datastore, ingestion pipeline, action engine or ranking system.

The connected `/draft` uses Metrics releases. Legacy Signals and their separate publication pointer remain unchanged. Never merge a stale ranked Signal snapshot into a current finding release. Preserve current uncommitted work and existing historical artifacts. Do not ingest real data, regenerate datasets, activate publications, commit or deploy as part of this plan.

## Existing foundation to reuse

- `src/memento/metric_serving.py`: metadata, bounded metric pages and release selection.
- `src/memento/metric_findings.py`: item/issue groups, exhaustive members and deterministic economics.
- Existing firm supply and conditional planned-supply artifacts, daily history, completed periods, stockout episodes, distribution and trend artifacts.
- Publication integrity, lineage, synthetic fixtures and replay invariants.
- `finding-evidence-contract.md`, `planned-supply-backend-contract.md`, `descriptive-metric-contract.md` are the analytical authorities. This plan adds no formulas overriding them.

## B0 — Contract inventory and compatibility gate (P0, required)

Inspect code and relevant tests, not just prose. Produce a field-to-screen matrix covering overview, finding detail, member evidence, current state, charts, deliveries and export. Record endpoint, artifact, grain, keys, units, nullability, dates, economic basis and source references. Establish a representative existing synthetic v5 release only from explicitly known paths; do not broadly search personal data or load raw rows into model context.

Verify these details before introducing any API:

1. Findings/evidence contain array fields and JSON strings. Document those wire shapes for runtime-validated frontend consumption; frontend parsing changes belong to the UI agent.
2. Identify supported tables from validated manifest file inventory and contract version. Older releases remain readable under their original contracts; requesting absent findings must never substitute a newer release.
3. Explain API query semantics: bounded limit/offset, stable order, product/finding filters, and store filtering through evidence. Determine how clients enumerate all pages and handle inconsistent/mismatched responses.
4. Confirm all metadata needed for dates and identities. Distinguish input observation time, analytical cutoff and any actual recorded publication timestamp. Do not add a current wall-clock timestamp and call it historical freshness.
5. Verify each frontend-relevant query's behavior for valid, invalid and inapplicable filters. Tighten only concrete boundary problems encountered by this flow; do not redesign every endpoint.

Acceptance: the matrix proves which screens use existing endpoints and lists specific gaps. Existing firm/conditional quantities, findings and identities remain unchanged.

## B1 — Harden the read-only integration boundary (P1, required where gaps exist)

Keep existing payloads backward compatible. Reuse validators and error conventions. Add explicit response models or narrowly scoped validation where needed for new/modified responses; enforce release identity, bounded pagination, finite numeric values, supported keys and null states. Do not expose file-system paths or sensitive source payloads in errors.

If historical capability detection is inadequate, add an additive metadata capability field derived from validated artifact inventory. Specify an explicit unsupported-capability response for absent historical tables, while retaining integrity failures as service errors. Document any error-code change and test existing clients. Do not treat corruption as merely an unsupported feature.

Keep requests pinned to the exact requested immutable release, and retain the returned release ID on every new response. Handle a current pointer change between metadata and rows without moving pinned requests to another release. Retain integrity validation before serving. Address repeated validation performance only if measured against the actual flow; do not add an unbounded cache or a second data store.

Acceptance: fullstack requests work against a representative v5 synthetic release; older contracts and corrupted releases are explicit, distinct cases; no silent fallback.

## B2 — Add summary aggregation only if required (P2, conditional)

Default: use published finding totals and existing grouped metric endpoints. If the accepted overview needs distinct store counts or complete-population summary figures that cannot be served cleanly, add one read-only summary endpoint, proposed as `GET /v1/metrics/summary?release_id=...` with only the filters actually needed by the UI.

Before coding, freeze a small response contract and matching tests:

- release ID, observation/cutoff context, supported scope and applied filters;
- number of finding groups, affected distinct items, affected distinct stores and affected store-item pairs, each separately named;
- counts by promise/code with explicit overlap semantics; promise totals need not sum to account totals;
- any current-state counts use the exhaustive assessed population, not only finding members;
- financial values remain separate by basis, horizon and supply view; never publish one combined impact value;
- monetary group totals remain null when required member valuations are incomplete, with eligible/valued counts and missingness reasons. Do not present a subtotal of valued members as a complete total;
- filtered member summaries are recomputed from the filtered membership. Do not reuse unfiltered group amounts;
- deduplicate repeated symptoms by canonical pair and the defined financial basis before any cross-finding aggregate. If no unambiguous aggregate is needed, omit it rather than invent a financial deduplication policy;
- deterministic ordering and no dependence on page size/offset.

Execute parameterized queries over the validated release artifacts, using the existing DuckDB access pattern. No new publication artifact is required unless a demonstrated requirement makes serving-time aggregation unsuitable.

Acceptance: summary equals independently calculated fixture expectations, including overlapping findings, multiple items in the same store, partial valuation, nulls, conditional excess and empty filters. No page-size dependence.

## B3 — Chart/evidence sufficiency (P2, required audit; additions conditional)

Use existing daily, period, projection, order and forecast endpoints first. Specify display aggregation in the integration matrix: demand and receipts sum, inventory is period-ending, partial periods are labeled, missing history stays missing, and current observed stock is separate from a projection. Preserve Saturday–Friday completed weeks and forecast vintage semantics.

Confirm that the complete selected 28-day projection and requested historical window can be retrieved through bounded pagination for a store-item. Item-level charts must use explicit membership and completeness rules; do not sum only ready stores and imply full coverage. The UI may begin with a selected store's projection to avoid unsupported aggregate projections.

Only add date/path filters or a narrowly scoped chart response if the real flow demonstrates their necessity. Validate dates, filter applicability and bounds. Do not derive demand from sales when forecasts are missing, invent receipt dates, publish probabilistic arrival bands, or compute action effects.

Acceptance: fixture traces reconcile to engine output and weekly display totals; unknown inputs remain unknown. Existing firm output and planned-order conversion rules are unchanged.

## B4 — Integration verification and handoff (P3, required)

Use minimized synthetic fixtures for:

- all supported finding codes and explicit non-finding/unknown/not-applicable states;
- stable IDs and exact release pinning during a pointer change;
- absent historical capabilities versus corrupt artifacts;
- complete pagination, filter semantics and invalid arguments;
- overlap-aware store/pair counts and incomplete valuation;
- firm versus conditional supply, partial receipts/conversions, null cost/rate and zero demand;
- historical gaps, completed and partial display periods;
- compatibility with current Metrics and legacy Signal consumers.

Run targeted backend tests and Python type checking, then the repository verification gate for acceptance. Reuse existing fixture infrastructure in `tests/metric_fixture.py`, `tests/test_metric_findings.py`, `tests/test_metric_backend_v2.py` and `tests/test_planned_supply.py` where applicable. Add meaningful regression tests for actual serving additions. Do not regenerate or activate source/publication data merely to run a UI demonstration. If a needed release is unavailable, use the synthetic fullstack fixture path and state that limitation.

Coordinate the final wire contract with the UI handoff through documentation in this repository. Finish with a browser → API → immutable evidence flow using the real service; mocked browser success alone is insufficient. Report checks actually run and any existing failures separately.

## Explicitly deferred

Map coordinate serving, store-format rollups, ranker or universal score, action feasibility/scenarios, operational decisions and approvals, persistent workflow, peer/launch benchmarking, causal outcome reporting, cross-release narrative history, AI explanations, new source feeds and ingestion changes. Canonical coordinates already exist: future map support would require serving, not invented city assignments.

## Execution sequence and ownership

1. Backend agent completes B0 and necessary B1 changes and documents the concrete wire contract.
2. UI agent completes typed adapters and the core finding/member flow using existing endpoints.
3. Implement B2/B3 additions only for a named unmet accepted screen requirement; otherwise mark them unnecessary with evidence.
4. UI agent finishes charts, exports and usability; backend agent resolves only in-scope serving gaps.
5. Run integrated acceptance and report remaining limits. Sequential coordination is sufficient; no subagents or external messages are required by this handoff.

## Completion evidence

Deliver the field-to-screen matrix, list of endpoints reused/added, exact response/error changes, reconciliation tests, verification results and remaining limitations. Confirm the diff is limited to intended serving/tests/documentation files, analytical formulas and immutable artifacts are unchanged, and no production/customer data or new datastore was introduced.
