# Attention investigation UX and implementation plan

Date: 2026-10-14
Status: implemented locally; acceptance evidence in
`docs/handoffs/attention-investigation-acceptance.md`. No commit/push/deployment by this task.
Scope: local synthetic-data MVP; existing 10-item, 1,000-store iteration slice.

## 1. Outcome and authority

Turn an Attention point into a guided, interactive investigation:

**What is happening? → What explains it? → Show me the numbers.**

Users begin with the existing Feed or Graph, select a store–item signal, and reveal
three progressively deeper layers. Each layer has a purpose-built visual, not a
replacement wall of explanatory text. The final layer exposes the actual weekly
sales/inventory/forecast values and expandable daily reconciliation.

This document controls the new investigation experience. It supersedes the detail
UX, single-page navigation, Reaction terminology, and prohibition on stock-cover
display in `attention-ui-integration.md` for this work. That document remains a
historical OOS integration plan. The current product has Monday, Attention, Reports,
Feed/Graph, and Impact/Urgency/Confidence; none is removed or renamed here.

Metric authority remains `mvp-metric-contract.md` (current priority v1.2.0 section),
`memento-glossary.md`, and the implemented immutable release. This plan adds a
versioned explanatory stock-cover measure, not new eligibility or ranking logic.
It does not change 40/40/20 weights, confidence components, urgency assumptions,
forecasts, material-impact definitions, target-stock policy, or economics.

Source reference: `/Users/mininutson/Downloads/memento-signal-mvp/web/app/forecast/`
and its `web/components/forecast/` components. Reuse the linked chart/week-grid
interaction and visual restraint; do not copy its sample data, stores, editing,
drag-to-adjust forecast behavior, ECharts/AG Grid dependencies, or standalone page.
Both the supplied reference and `/Users/mininutson/Desktop/Synthetic Data` remain
read-only. If implementation requires a Synthetic Data change, stop and report it.

## 2. Current baseline and gaps

Observed implementation:

- `SignalAttention.tsx` offers the ranked queue, graph/feed, selected card, then
  static evidence text and a complete 36/84-row calculation table.
- Demand detail publishes eight qualifying historical pairs and 28 forward days.
- Availability/excess detail publishes 28 days for each low/base/high demand path.
- Supply context includes planned receipts, arrival ranges, action durations,
  prerequisite status, and summary outcomes for supply-timing comparisons.
- The detail API does not expose a complete observed sales/inventory weekly ledger,
  row-level historical eligibility, or all daily supply-timing comparison traces.
- Some demand evidence dates are observation-relative offsets rather than explicit
  retail-week identifiers. Its forward `retailer_forecast_units` field is populated
  from the published daily baseline, which may already include forecast correction.
  These fields cannot simply be relabeled as true week-ending dates/raw forecasts.
- `SignalStore` methods resolve the current pointer independently. A multi-part
  investigation must pin one release to avoid mixing snapshots during publication.

Baseline inspection commit: `e7db556ec521efac61c81745978610f190c517f0`.
The working tree also contains uncommitted frontend restoration and urgency-policy
work. That working tree, not HEAD alone, is the implementation baseline; preserve it.
Current local release and prior verification are recorded in
`docs/handoffs/attention-urgency-acceptance.md`.

## 3. Target navigation and disclosure

```text
Attention Feed / Graph — same published top ten
  └─ select signal → Situation
       └─ select chart interval / receipt / gap → Explanation
            └─ Show numbers → Weekly ledger
                 └─ expand week → Daily rows (within the same ledger layer)
```

### Entry and persistent context

- Feed keeps priority order and visible native financial impact. Graph keeps the
  original spatial renderer. Do not add ten animated charts to the queue.
- Selection opens a focused investigation workspace within Attention. On desktop,
  retain a compact queue rail and a wide chart area; on mobile, use a full-width
  workspace with an explicit Back to Attention control, not a cramped side drawer.
- Keep item, store, signal type/direction, frozen observation/cutoff, financial impact,
  and published priority visible in a compact header. No silent scope aggregation.
- Start at Situation; an accessible three-step breadcrumb shows current depth.
  Explanation/Numbers become available when a relevant feature is selected, with
  explicit buttons as keyboard/touch alternatives to chart selection.
- Back moves one depth; Back to Attention restores view, type filter, list page,
  selected point, and graph camera. Switching signal resets date/event selection and
  opens Situation. Selecting the same signal must not discard already loaded data.
- Monday deep links open Situation for that signal. Keep `/attention?signal=...`
  compatibility; do not create a fourth navigation page.

### Layer responsibilities

1. **Situation:** one sentence, one primary chart, impact/timing. The question is
   "What should I notice?" No long prerequisite list or raw ledger by default.
2. **Explanation:** a selected feature and a linked second visual explain the
   calculation/mechanics. The question is "What accounts for this result?"
3. **Numbers:** the weekly ledger reconciles to both visuals; daily expansion and
   lineage are available here. The question is "Can I verify the evidence?"

Hover gives a lightweight tooltip. Click/tap/keyboard selection pins a date, week,
receipt, or interval and reveals the next layer. Ledger selection highlights the
same period on the charts; chart selection highlights the corresponding ledger row.
Use stable keys, not display labels or array positions. Do not auto-scroll or change
layers on hover. Keep selections visible with text labels, not color alone.

## 4. Visual specification by metric path

### A. Availability risk

**Situation — inventory runway.**

- Show actual historical stock before the snapshot divider and the published base
  projected ending stock afterwards. Blue is the main trajectory; future lines are
  dashed. Break lines at missing observations; never forward-fill unknown stock.
- Default to equivalent weeks of supply; offer Units using the identical dates.
  Show receipt markers and the resulting stock movement, not fabricated spikes.
- Orange identifies dates with projected unfulfilled demand. Stock never goes below
  zero; a separate lost-demand strip shows quantities unmet while stock is depleted.
- Headline identifies the shortage interval and receipt relationship when supported.
  Zero stock with zero demand must not be described as lost sales.
- Dollar impact is estimated lost retail sales; contribution is separate. Display
  "as of" timing, not urgency relative to the visitor's clock.

**Explanation — demand/supply timeline.**

- Selecting a shortage interval reveals aligned demand and receipt bars with a
  pinned opening/receipts/fulfilled/unfulfilled/closing breakdown.
- Selecting a receipt reveals firm open/in-transit versus assumed replenishment,
  quantity, early/typical/conservative arrival dates, basis, and safe order reference
  if available. Missing identity is explicit, never matched by date/quantity alone.
- A compact action-duration timeline relates the conservative start-by date to the
  impact milestone. Aggregate duration bars and ordered stage names are sufficient
  initially; no invented per-stage durations or confirmed facility stock.
- Comparison mode chooses either demand sensitivity (low/base/high under the
  published supply assumption) or supply timing (committed/early/typical/conservative
  with demand fixed at base). Do not imply a published nine-combination simulation.
- Unknown stock, capacity, and authority remain visible, non-executable prerequisites.

**Numbers — inventory reconciliation.**

Weekly opening inventory, receipts, projected demand, fulfilled units, unfulfilled
units, and closing inventory; expand a week into daily rows. Separate historical
observed sales/receipts from future projected demand/receipts. Observed sales are
not a measurement of total unconstrained demand or historical lost sales.

### B. Demand acceleration

**Situation — demand divergence.**

- Historical weekly sales bars and matched retailer forecast line show six qualifying
  baseline weeks and two recent qualifying weeks. Highlight the latter two.
- Forward published baseline and momentum-adjusted demand are dashed and separated
  by an orange gap. Clearly name the baseline if bias correction is already applied.
  Raw forward retailer forecast, when supplied, is a separately named weekly series,
  not a misleading label on the corrected baseline.
- Headline: persistent demand above the forecast-relative baseline. Show forward
  unit gap, estimated retail opportunity, and contribution magnitude. Do not promise
  realizable revenue or claim that supply can capture all of the opportunity.

**Explanation — persistence and accumulating gap.**

- Selecting the recent interval shows baseline actual/retailer-forecast ratio versus
  each recent week's ratio. Both recent weeks must support the published direction.
- Show the momentum multiplier and any 0.50/1.50 clamp; the historical forecast-error
  allowance is an admission comparator, not a confidence interval.
- Selecting the forward gap shows cumulative absolute unit divergence over 28 days.
  Mark the published half-gap material-impact milestone; do not call it a stockout.
- Connect the selected week to its eligibility notes, including stockout censorship
  or missing history. Sales growth alone is not the metric's admission explanation.

**Numbers — historical/forward demand ledger.**

Actual sales, matched retailer forecast/vintage, variance, eligibility, and baseline
or recent role for history; forward published baseline, momentum-adjusted demand,
and unit gap for projection. Show raw retailer forecasts separately where available.
Expand forward weeks into daily forecast values; do not manufacture daily historical
forecasts from weekly quantities.

### C. Demand deceleration

Use the same three-layer structure and shared components as acceleration, with
direction-sensitive copy and a gap below the baseline. Headline describes persistent
weaker forecast-relative demand; financial exposure is forecast overstatement, not
lost sales or guaranteed savings. A falling sales line does not imply demand fell
when the period is stockout-censored. No production action is invented for this path;
urgency explains the declared review/replan allowance.

### D. Inventory imbalance / excess

**Situation — inventory versus target.**

- Blue projected stock line, neutral published target line, orange excess area,
  and receipt markers; show persistent excess through the horizon when supported.
- Keep units as the default, distinct from the availability stock-cover visual.
- Show capital exposed and 28-day carrying cost separately. Capital is tied up, not
  realized loss; carrying cost is not automatically recoverable savings.

**Explanation — stock-position decomposition.**

- Selecting a date reveals projected stock partitioned into stock within target and
  excess: `within_target = min(stock, target)` and `excess = max(stock - target, 0)`.
  Do not imply every date has at least target stock.
- Explain target cover as the declared allowance plus safety days. Supply intervention
  options are not substituted for the excess policy's reaction allowance.
- Selecting a receipt highlights its contribution to projected stock. Low/base/high
  demand toggles expose whether excess persists under stronger demand.
- Label this as the modeled balance, not proof of overordering or a causal diagnosis.

**Numbers — excess inventory ledger.**

Opening/closing stock, receipts, demand, published target, excess quantities, and
existing derived economic exposure. Preserve the headline economics' horizon-end
definition; date-selected excess is a diagnostic, not a replacement rank input.
Do not sum daily excess capital or invent daily carrying-cost accumulation.

## 5. Shared visual and metric rules

- Preserve original Inter typography, white canvas, restrained borders, original
  shell and spacing. Keep `OriginalDemo.module.css` and `OriginalAttention.module.css`
  unchanged where possible; add scoped investigation styles.
- Blue is the principal trajectory; orange highlights exposure and pinned selection.
  Muted neutral lines distinguish reference/alternate series. Use labels, patterns,
  and line styles so colors are never the only encoding.
- All charts use actual dates/retail weeks, named units, tooltips, legends, and a
  snapshot boundary. Sensitivity envelopes are not probabilistic confidence bands.
- Missing/not-applicable is not zero. Partial weeks show covered days and are labeled;
  mixed actual/projected weeks keep those quantities separate.
- Urgency opens the deadline/action-window visual. Confidence opens the three
  published components and their product. No probability gauge or editable sliders.
- Long narratives, all action prerequisites, and source lineage move into selected
  explanation sections or ledger disclosures. Short caveats remain visible.

### Versioned equivalent stock-cover definition

Introduce `attention-investigation-stock-cover-v1`, computed server-side/offline:

```text
reference_weekly_demand_units = sum(published base daily demand over 28 days) / 4
equivalent_weeks_of_supply(t) = stock_units(t) / reference_weekly_demand_units
```

Use one fixed base denominator for the selected investigation and all demand-path
comparisons. Display "weeks at snapshot projected average demand"; historical
values are normalized historical stock, not a historical realized-demand WOS metric.
Future stock is the selected published ending-stock trajectory, already containing
receipts; do not add future receipts again in the denominator or numerator.
If reference demand is zero, return null with `zero_reference_demand`; offer Units,
not infinity, zero cover, or fabricated depletion. Round only for display.

## 6. Data and API implementation

### Immutable investigation artifact

Add a bounded offline investigation publisher, operating only on the current
synthetic release's overall top ten and its declared canonical snapshot. Proposed
modules: `src/memento/investigation.py`, `investigation_contract.py`, and
`investigation_publication.py` (combine small modules if clearer).

Publish a separate derived artifact under ignored `data/.../investigations/`; never
append files to an existing signal/canonical release. Bind its identity to parent
signal ID/manifest hash, canonical ID/manifest hash, supply-model hash if used,
cohort, cutoff, and investigation/stock-cover contract versions. Atomic publication,
file hashes, validated paths, immutable replay, and no current signal reranking.
Rebuilding explanations must not change the signal current pointer.

The publisher must produce:

1. Daily actual history and retail-calendar-aligned weekly ledger for the selected
   store–item, initially eight completed retail weeks plus any earlier qualifying
   weeks needed to explain the existing signal, bounded by the six-month core slice.
   No 52-week/YoY history, artificial history, or evaluation actuals after cutoff.
2. All 28 forward days from the existing evidence. For availability/excess, retain
   all published demand paths; for demand, retain the existing forward gap values.
3. Explicit qualifying history identities and exclusion/coverage flags, matched to
   the producer's forecast vintage and eligibility rules. The engine can choose eight
   qualifying weeks that are not the last eight contiguous calendar weeks.
4. Demand diagnostic inputs: six/two roles, ratios, multiplier/clamp, error allowance,
   cumulative gap, and published material date. Validate against frozen signal values.
5. Supply comparison daily traces generated offline with the existing deterministic
   supply functions, frozen base demand, PO state, and hashed assumption model.
   Confirm summary outcomes match existing supply context before publication.
6. Receipt events with deterministic event IDs, source basis/state, quantity, arrival
   window, and safe line/version reference where provenance supports it. Separate
   disjoint open/transit portions and assumed orders; no double-counting.
7. Existing target-stock and economic outputs; no raw company unit cost in responses.

Historical inventory uses first opening/last closing balance, not a sum or weekly
average masquerading as closing stock. Flow quantities (sales, receipts, demand,
lost units) sum within retail-calendar boundaries. Historical opening stock is only
reported where a prior closing observation or valid source field supports it; no
invented balance. Partial first/last weeks and unavailable history remain explicit.
Freeze historical forecast vintages to the producer's pre-target-week selection;
freeze forward selection to publication cutoff. Never use a subsequently revised
forecast to explain an earlier decision.

### Release-bound serving contract

Add `GET /v1/signals/{signal_id}/investigation?signal_set_id=...`, proxied through
the existing same-origin `/api/signals/...` path. The response uses a new strict
`memento-signal-investigation-api-v1` contract; existing queue/detail remain compatible.

- Resolve current signal release once. Validate requested signal is in its top ten,
  expected release matches, and investigation parent/hash/canonical/cutoff agree.
- On a changed release return a sanitized 409 `release_changed`; prompt to reload
  the queue, rather than silently mixing data or introducing historical browsing.
- On a missing investigation artifact, retain existing published evidence and clearly
  show that visual investigation is unavailable. Never fabricate a chart.
- Return bounded daily/weekly records, explicit series semantics/roles, event IDs,
  units, partial/missingness flags, comparison axis, diagnostic values, and lineage.
- Validate decimals, dates, IDs, counts, expected horizon, nonnegative projections,
  ordered arrival ranges, join uniqueness, and reconciliations. Parameterized DuckDB
  queries and manifest-validated files only; no client-selected paths or source scans.
- No per-request full forecast/signal simulation or N+1 store–item queries. Only the
  selected signal is fetched; a bounded in-memory per-release cache is optional, not
  a new persistent database.

## 7. Frontend implementation boundaries

- `web/components/product/SignalAttention.tsx`: replace the static deep view with
  the three-layer investigation workspace; retain the queue and graph mount/state.
- New focused components: `SignalInvestigation`, `InvestigationHeader`,
  `InventoryRunway`, `DemandDivergence`, `ExcessInventory`, `SupplyTimeline`,
  `DemandDiagnostics`, and `WeeklyLedger`. Shared small chart primitives and a
  pinned selection model are appropriate; avoid a generic dashboard framework.
- `web/lib/signal/schema.ts` and `client.ts`: strict investigation validation and
  abortable release-bound fetch. Put presentation-only formatting in `presentation.ts`;
  no new metric logic in React. Financial/scoring values remain server authoritative.
- Add a narrow `web/lib/investigation/` adapter/selection module if useful. Model
  signal ID, release ID, depth, selected week/date/event, units mode, and comparison
  mode explicitly. Do not reuse the reference application's forecast-editing store.
- Fetch once on selection, cancel on changes, ignore stale responses, and reuse
  validated data when changing depth. Queue/release errors and investigation errors
  remain distinct. Deep links must handle missing/non-top-ten signals truthfully.
- Keep tables available as accessible alternatives to charts. Prefer responsive SVG
  primitives for these bounded series; a new chart/grid dependency requires a concrete
  current need, not parity with the reference package.
- Update product shape, metric/glossary stock-cover definitions, web README, and
  acceptance documentation after implementation. Do not rewrite historical release
  contracts or claim the original Forecast page has been restored.

## 8. Delivery sequence

1. **Contracts and fixtures:** freeze investigation series semantics, ledger/window
   rules, stock-cover definition, identity/error contracts, and tiny synthetic fixtures
   for availability, acceleration, deceleration, and excess.
2. **Publisher/API and shared workspace:** add release-bound evidence publication,
   serving, strict client parsing, disclosure state, and synchronized weekly ledger.
3. **Availability vertical slice:** runway → supply/demand timeline → weekly/daily
   reconciliation; verify responsive/keyboard behavior and data identities end to end.
4. **Demand and excess paths:** add distinct visuals and diagnostic interactions,
   using the same shell/ledger. Availability alone is not completion of this plan.
5. **Current-slice publication and acceptance:** publish new investigation artifacts
   without changing existing releases, verify all displayed signals, and document
   actual screenshots, hashes, caveats, and performance measurements.

## 9. Acceptance and verification

### UX acceptance

- All four paths open Situation from Feed/Graph/Monday, with one dominant chart,
  correct impact language, snapshot divider, and visible assumption caveats.
- Selecting a relevant feature reveals Explanation; Show numbers opens the linked
  weekly ledger; week expansion exposes daily records. Charts and ledger agree on
  pinned selection. Hover alone does not navigate or create a request waterfall.
- Back and view switching preserve queue/filter/page/camera; same-signal reopen works.
- Urgency/confidence explain their actual inputs; no unsupported execution controls.
- Availability receipt bumps occur only where the underlying balance actually rises;
  inventory cannot plot below zero. Demand acceleration/deceleration reverse the
  gap direction correctly. Excess visuals distinguish capital from carrying cost.
- Validate desktop 1280×720 and mobile 390×844: no document-level horizontal overflow,
  readable chart/legend/tooltips, scrollable ledger, touch controls, keyboard selection,
  focus restoration, reduced-motion handling, and chart textual alternatives.
- Preserve original typography/shell/blue-orange accents with visual comparison.

### Data/correctness acceptance

- All original signal ranks, scores, counts, predictions, economics, and release hashes
  remain identical; investigation publication and replay cannot mutate the parent.
- Weekly flows sum from daily values; opening/closing inventory are balances, not
  sums. Projected `fulfilled = demand - lost` and `closing = opening + inbound - fulfilled`
  reconcile within declared decimal tolerance. Historical discrepancies are flagged,
  not silently forced to satisfy a projection equation.
- Qualifying historical rows and selected forecast vintages reconcile with the
  producer, including excluded/noncontiguous weeks and real retail-week labels.
- Zero/missing demand, missing history, zero stock/no demand, partial weeks, arrivals
  outside the horizon, overdue receipts, partially invoiced orders, cancellation,
  unknown prerequisites, and legacy releases have explicit tests.
- Demand error comparator and cumulative half-gap milestone match the producer;
  raw retailer and corrected baseline forecasts never share a misleading label.
- Units/WOS conversion uses the declared fixed denominator; null zero-demand behavior
  is correct. Low/high demand and early/conservative supply are distinct modes.
- Wrong release/hash, malformed values, duplicate joins/events, unsafe paths,
  non-synthetic inputs, out-of-cutoff facts/vintages, and stale client responses fail
  closed without raw payload leakage. Missing investigation permits only the existing
  validated evidence fallback, not an unvalidated visual.
- API responses contain no raw unit cost, private truth, fabricated DC balances,
  capacity, authority, probability bands, or claimed causal explanation.

### Checks to run during implementation

- Focused Python tests for investigation definitions, aggregation, publication, and API.
- Frontend tests for each path, selection/depth state, synchronized chart/ledger,
  release changes, cancellation, fallback, and malformed responses.
- Mocked browser workflows for all four paths; real API-to-Parquet browser workflows
  for publication, selection, chart explanation, ledger expansion, and back navigation.
- `make verify`, `git diff --check`, parent hash/replay checks, and all-ten investigation
  validation on `data/iteration-calibrated`. Record measured payload sizes and request
  counts; demonstrate selected-signal loading without scanning or prefetching all candidates.
- Live visual verification with screenshots for each path/depth and both breakpoints.
  The current top ten contain only acceleration, so minimized synthetic fixtures must
  exercise the other paths without altering the production demo ranking.

The original plan-writing task was documentation-only. Implementation and verification
are now recorded in the linked acceptance handoff; requirements below remain the scope.

## 10. Non-goals, dependencies, and approval boundaries

No forecast editing, scenarios, overrides, order execution, AI recommendations,
52-week/YoY reporting, all-candidate feed, aggregate item/store dashboards, auth,
production data, new datastore, or external publication. No Synthetic Data edits.

Dependencies: valid current canonical/signal manifests, calendar mappings, retained
historical fact coverage, forecast-vintage evidence, and the hashed supply model.
If source history or event identity cannot support a promised view, show the gap and
report the required source change rather than synthesizing evidence or changing scope.
Any new metric beyond the defined explanatory stock cover requires separate approval.
Commit/push/PR/deployment and real-data ingestion remain separately authorized actions.

## Builder handoff

Task: `attention-layered-investigation`

Outcome: a release-bound three-layer Attention investigation for availability,
demand acceleration/deceleration, and inventory excess, with purpose-built interactive
charts leading into a synchronized weekly/daily evidence ledger and preserved original
styling/navigation. Implement the full accepted scope, in the sequence above.

Non-goals: section 10; especially no ranking/forecast changes, source mutations,
editable scenarios, execution, extra top-level pages, or new persistent datastore.

Expected files/boundaries: sections 6–7; investigation publisher/contracts, serving
and API, selected-point workspace/charts/ledger, client validation, scoped styles,
fixtures/tests, and relevant current product documentation.

Acceptance: section 9, including all four paths, frozen lineage, truthful forecast and
calendar semantics, stock/flow reconciliation, coordinated selection, responsive and
accessible drill-down, immutable parent hashes, and explicit missing-data states.

Verification: focused tests, complete `make verify`, all-ten current-slice artifact
checks, browser-to-API-to-Parquet evidence, and visual screenshots. Report omissions
and measured limitations; never equate passing tests with calibrated business outcomes.

Review intent: inspect snapshot isolation, source-vintage correctness, data semantics,
chart/table agreement, legacy/error compatibility, confidentiality, and original visual
fidelity. Do not invoke a review workflow unless the user requests it.
