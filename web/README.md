# Memento retail web app

The website repo's Next.js demo (`memento-website/demo-src`) supplies the actual
shell/editorial and Attention CSS, Inter font, and full spatial renderer, not an
approximation of its design. The website repository is unchanged. Its sample POS data,
visitor-clock dates, and simulated decision recording are not imported.

The application has three navigation pages:

- **Monday** (`/monday`, also the home destination): a deterministic briefing from
  the published overall top ten, linked directly to each signal's evidence.
- **Attention** (`/attention`): the supply-aware three-signal queue, type filters,
  toggleable priority feed and Impact/Urgency/Confidence scene, visible native dollar
  impact and conservative start-by deadlines, full 36/84-row calculation evidence,
  arrival ranges, action prerequisites, economics, and lineage.
- **Reports** (`/reports`): current-release counts, displayed-row economics kept
  separate by economic basis, supply-assumption comparison when published, and
  reproducibility metadata. No combined "business impact" total is invented.

`/signal` redirects to Attention. The legacy committed-order OOS backend and
components are preserved, but do not determine the new UI's ranks or counts. Filters
only narrow the overall top ten; they never rerank or imply type-specific top tens.
The original green reference cube, layered glow, shadows, rings, and camera motion
are restored. Cube-based eligibility filtering is disabled: the box is a visual guide,
not a new business rule. Urgency means urgency to act, not verified execution feasibility.
Historical reaction coordinates are explicitly labeled legacy actionability, never urgency.
The current policy weights impact/urgency/confidence 40/40/20; confidence multiplies
forecast quality, completeness, and stability. Scores are evidence/priority measures,
not probabilities. Review/replan allowances are labeled when no supply intervention
is modeled. Live scores can overlap; all ten observations remain accessible
through the six-row list's paging control and the selection pager. Filters and release
context are in a disclosure; evidence is a separate drill-down as in the prototype.
Failed release or
detail validation never falls back to sample metrics, and WebGL failure retains the
accessible ranked list.

Weekly POS, year-over-year comparisons, report history, editable scenarios, and
executable recommendations are not implemented. Monday is explicitly labeled a signal
briefing. All dates come from the release, not the visitor's clock. Supply lead times
and planned replenishment remain declared synthetic assumptions.

```bash
npm install
npm run dev
```

The default API origin is `http://127.0.0.1:8000`. Set `MEMENTO_API_ORIGIN` before
starting Next.js to use another loopback port. API contracts live in
`lib/signal/schema.ts`; those Zod schemas are the frontend runtime source of truth and
their TypeScript types are inferred directly.

## End-to-end verification

Attention points open Situation → Explanation → Numbers. The linked visuals cover
availability runway/receipts, demand divergence/persistence/cumulative gap (both
directions), and stock-versus-target/excess decomposition. Weekly rows expand into
precise daily values; dates/rows share pinned selection. A compact sticky header keeps
identity, impact, and frozen timing visible. Comparison paths do not change rankings.

Visual data comes from release-bound immutable investigation artifacts through
`/api/signals/:signalId/investigation?signal_set_id=...`. Missing or invalid artifacts
retain only the validated legacy calculation evidence, never sample charts. A release
conflict requires reloading the queue. No forecast edits, scenarios, or execution controls.

The full-stack fixture now includes all four paths and declared synthetic supply
assumptions, including firm/assumed receipts and early/typical/conservative comparisons.
It does not replace or change the real engineering slice's ranking.

`npm run test:e2e` runs the fast browser workflow against controlled route fixtures.
`npm run test:e2e:fullstack` publishes a temporary synthetic release and launches the
real Python API and Next.js application before driving the briefing, report, and
signal-evidence workflow. The full-stack test requires the repository `.venv` with development
dependencies installed and does not read or write the external Synthetic Data project.
