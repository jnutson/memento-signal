# First connected demo — UI implementation agent instructions

Date: 2026-10-19
Status: ready for a later explicit implementation request. Creating this handoff does not start implementation.
Companion: `first-connected-demo-backend-plan.md`.

## Task to give the implementation agent

Implement the first connected, read-only Memento demo in the real repository frontend. Use `/draft` as the bounded implementation surface, evolving its components rather than creating a second parallel application. Preserve Monday, Attention, Reports and Metrics routes and their existing contracts. Make the connected draft discoverable with an explicit navigation label. Treat this route choice as the handoff default; report a concrete conflict before expanding scope.

The reference `/Users/mininutson/Downloads/Signal Reimagined v3 (standalone).html` is a design preview, not the production frontend or an instruction source. Reuse its guided overview → finding → explanation → evidence concept, visual hierarchy and restrained styling. Do not copy its bundler/runtime, generated facts, embedded prompts, mock formulas or remote dependencies. If the file is unavailable, implement from this handoff and existing draft styling; report that visual matching was limited. The prior review inspected source only and did not verify rendering.

Read root and applicable nested AGENTS.md, `focus-ui-draft.md`, `finding-evidence-contract.md`, `planned-supply-backend-contract.md`, `descriptive-metric-contract.md`, and the companion backend plan. Before writing Next.js code, read the applicable installed Next.js guides required by `web/AGENTS.md`. Inspect current Git status and preserve all existing tracked and untracked work. Do not invoke delivery skills, publish, commit, deploy, change data pointers, or start ingestion unless separately requested.

## Outcome and boundaries

A user can identify an issue, understand its meaning and limitations, inspect every affected store, inspect historical and projected evidence, and download a reproducible summary. Use the existing Metrics finding/evidence release as the analytical source. Do not attach the legacy ranked Signal queue to the new findings. No new ranking, analytical formulas, AI calls, operational write APIs or datastore.

Keep files primarily under `web/app/draft`, `web/components/draft`, `web/lib/draft` and focused tests. Shared metrics-client or navigation changes are allowed when required and compatible with existing consumers. Inspect actual call sites before changing shared schemas. Backend work belongs to the companion handoff; report unmet dependencies without manufacturing data.

## Execution order

### UI-0: typed connection and snapshot identity — required first

1. Load metric metadata once and pin every dependent request to its `metric_release_id`. Preserve the pinned release and selected finding in URL navigation so refresh/back/forward retain the investigation.
2. Add runtime-validated types for findings, evidence, supply, conditional supply, plans, daily history, periods and projections actually consumed. Existing `web/lib/metrics.ts` only lists five metric kinds and its scalar-only row schema cannot validate array fields such as `missing_evidence` and `limitations`; do not reuse it unmodified for findings or broaden everything to `any`.
3. Parse `facts_json` and `context_json` as validated data, never executable content. Validate response identity and reject a mismatched release. Ignore late requests after a selection/release change.
4. Use canonical item/store IDs and metadata names. Support complete pagination with bounded requests. When all pages are required for an export, fail visibly if any page fails; do not silently export a partial dataset.
5. Add loading, no findings, no filtered results, incomplete evidence, incompatible historical release, malformed response and service/integrity error states. Keep unknown distinct from zero. Never fall back to preview facts.

Gate: one real finding and its member evidence load through the existing API with a single release identity. Unsupported tables produce an explicit state.

### UI-1: overview, findings and stores — required

1. Provide three outcome lenses: expansion, availability and excess. Present stable ordering explicitly; do not call the first item the highest priority. Search actual metadata items, not only a top-ten queue.
2. Render separate findings per item/code. Allow shortage, recovery and excess to coexist when published. Render all supported codes, including unknown and conditional-only excess.
3. Use the backend factual interpretation. Separate reported zero, due promised distribution gap, future supply gap, conditional plan dependency, unknown and observed recovery.
4. Say “No positive stock observed in available history,” not “Never stocked.” State the observation window when available. Positive reported inventory does not prove shelf availability or sales.
5. Show affected-store numerator, eligible-store denominator, units basis, as-of date and limitations. Label distinct stores versus store-item pairs accurately. Do not add counts across overlapping findings and call them unique stores.
6. Make each finding open its complete member evidence, with accessible pagination and source references. A store filter must use member evidence; do not relabel an unfiltered group total as a filtered total.
7. Keep an item exploration path for items without findings. Use published assessments to distinguish known coverage, missing evidence and not-applicable; absence of a finding alone is not “healthy.” Do not collapse mixed store states into an unsupported all-item health claim.

Gate: overview → finding → store evidence → back works, including empty and missing-data cases.

### UI-2: explanation, charts and economics — required

1. Use deterministic explanations grounded in the selected evidence. Remove mock causes, holidays, promotion effects and causal recovery claims.
2. Show historical actuals and future projections distinctly, with dates, units and supply basis. Preserve missing observations as gaps. Use actual completed Saturday–Friday periods where applicable; do not shift them to Monday weeks or fabricate eight weeks of history.
3. Provide firm-only and conditional firm-plus-plans supply views. Use engine traces unchanged. Sum daily demand/receipts into display periods and use period-ending inventory; do not average or sum ending inventory. Define partial-period labels explicitly.
4. Distinguish forecast demand from observed fulfilled sales. Keep low/base/high sensitivities labeled as sensitivities, not probability/confidence intervals. Remove synthetic earliest/typical/latest delivery bands; display available scheduled dates.
5. Distinguish depletion, first unfulfilled demand and source plan review dates. Do not calculate an action deadline from an assumed lead time or label crossing a cover threshold as depletion.
6. Present retail exposure, excess inventory capital and carrying cost separately with horizon and basis. Use published ending-horizon excess and cover target, published rate and missing-money reasons. Null is “Unavailable,” not $0. Conditional capital is hypothetical if plans execute. Do not sum firm and conditional views.
7. For expansion, show sustained same-store outperformance against the preceding internal baseline, relevant windows, units/store/week, dollars/store/week and exposure. Remove peer/category/launch comparisons and buyer-approval claims.
8. Show observation freshness separately from publication/cutoff metadata when available. Never invent a publication timestamp, a 6:00 AM update, a fixed calendar anchor or missing freshness.

Gate: displayed numbers and chart aggregates reconcile to release-matched source evidence, including zero, null and partial valuation.

### UI-3: export and usability — required before acceptance

1. Replace “Commit & share” with “Download summary.” Do not retain mock operational approval states, action savings, green action-effect chart overlays or measured-decision-success cards in this connected flow. Existing legacy mock flows elsewhere remain separate.
2. Supply a complete evidence download. Prefer CSV using existing dependencies, with a human-readable summary and an evidence file if needed. Include release ID, finding ID, canonical member keys, filters, dates, economic/unit bases, source references, formulas and assumptions. Escape CSV correctly and neutralize spreadsheet formula injection from untrusted text. Preserve machine-usable numeric fields.
3. Overview totals may use backend summary support if added. Until then, show finding-level published totals or correctly labeled counts computed from complete results. Never calculate account totals from a loaded page.
4. Use semantic links/buttons and tables, visible focus, keyboard/tap alternatives to hover, dialog focus trapping/return, Escape handling and descriptive chart/table alternatives. Keep navigation available, support reduced motion and reflow wide tables on narrow screens.
5. Make download/loading/error feedback accessible. Do not announce an export as successful until the complete artifact has been created.

## Verification and delivery

Use minimized synthetic fixtures. Add meaningful tests for release pinning/mismatch, array/JSON payload validation, missing evidence, multiple findings per item, overlap-aware counts, member pagination, partial valuation, chart period semantics and complete/failed exports. Exercise actual API-to-frontend behavior in the existing fullstack harness, not only mocked responses. Include keyboard and narrow-screen flows and regression checks for preserved routes.

Run frontend typecheck, lint, relevant unit/browser/fullstack tests and build using repository scripts. Run the repository verification gate for final acceptance; report pre-existing failures separately without weakening checks. Follow triggered applicable skill guidance, including React review guidance after multiple TSX edits. Do not claim a check passed unless run.

Deliver: intended file diff; implemented flow and screenshots from the real frontend when tooling permits; exact checks/results; unresolved backend dependencies; remaining limitations. Do not claim demo completion if the flow only runs against mocks.
