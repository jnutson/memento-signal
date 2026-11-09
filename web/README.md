# Memento retail web app

The Next.js application has three product pages:

- `/monday` — briefing from the current published top ten
- `/attention` — ranked feed, spatial graph, and release-bound investigation
- `/reports` — release coverage, economics by basis, and lineage

`/signal` redirects to `/attention` for bookmark compatibility. It does not expose a
separate application or data contract.

The UI reads only `/api/signals` endpoints. Python response models and frontend Zod
schemas independently reject malformed payloads before data reaches presentation code.
Filters narrow the published overall top ten without reranking it.

Investigation artifacts support availability risk, demand acceleration, demand
deceleration, and inventory excess. Missing or invalid artifacts retain the validated
calculation evidence and never substitute sample data.

```bash
npm install
npm run dev
```

The default API origin is `http://127.0.0.1:8000`. Override it with
`MEMENTO_API_ORIGIN` when using another loopback port.

Verification commands are `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run test:e2e`, and `npm run test:e2e:fullstack`.
