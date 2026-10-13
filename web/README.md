# Memento Attention web app

The home page opens the restored **Attention** view at `/attention`. The sidebar
also exposes **Memento Signal** at `/signal`, preserving the three-signal workflow.
Attention is the committed-order OOS baseline, not the supply-aware Signal queue. It
contains the ranked queue, interactive Impact/Reaction/Confidence scene, prediction
detail, and evidence-backed planning context. It deliberately excludes recommendations,
editable scenarios, queue mutation, and the supplied Overview, Forecast, Plan, and
Reports panes: those were never imported into this repository, not hidden routes.
Select a point or ranked row, then **Open planning context** to expose the existing
inventory-path chart, calculation table, confidence, receipts, and lineage views.

```bash
npm install
npm run dev
```

The default API origin is `http://127.0.0.1:8000`. Set `MEMENTO_API_ORIGIN` before
starting Next.js to use another loopback port. API contracts live in
`lib/attention/schema.ts`; those Zod schemas are the frontend runtime source of truth and
their TypeScript types are inferred directly.

## End-to-end verification

`npm run test:e2e` runs the fast browser workflow against controlled route fixtures.
`npm run test:e2e:fullstack` publishes a temporary synthetic release and launches the
real Python API and Next.js application before driving the same Attention and planning
workflow. The full-stack test requires the repository `.venv` with development
dependencies installed and does not read or write the external Synthetic Data project.
