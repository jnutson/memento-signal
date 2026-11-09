# Monday report and attention queue

The single demo surface follows the [approved contract](../docs/product/demo-contract.md):
report → category queue → evidence → report. `/` opens the demo start screen; `/attention` leads to `/report`;
`/signal` remains a compatible entry to the same workflow.

Run `make demo-prepare` and `make demo` from the repository root. For frontend-only
development, use `npm run dev` here with the read-only API on port 8000. Override
`MEMENTO_API_ORIGIN` to use a different loopback API origin.

Runtime contracts live in `lib/signal/schema.ts`. The report is served by
`GET /v1/signals/report`. Queue and detail requests include `signal_set_id`.
Category views select the full publication, limit to ten, and retain overall rank;
demand overperformance additionally selects `signal_direction=acceleration`.
The backend binds a store to one validated release for the duration of each request.

The old 3D Attention UI and its Three.js dependency have been retired. Legacy
prediction API schemas and their compatibility tests remain; backend prediction
serving is unchanged.

`npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` check the frontend.
`npm run test:e2e` exercises the workflow and failure states using route fixtures.
`npm run test:e2e:fullstack` starts temporary synthetic publication, API, and Next.js
services and traverses all three report selections against real Parquet. It captures
report and detail screenshots under ignored `test-results/`.

## Hosted release

Demo 1 is deployed in Vercel team `memento-loop` as project `demo-1`:
[Open Demo 1](https://demo-1-omega-ten.vercel.app). The team’s existing Vercel sign-in
protection applies. Start and restart use fresh document navigation to discard
previous React state; only the current browser session’s publication key is cleared.

Hosted runtime uses a frozen, server-validated bundle exported by the Python API,
with no dependency on a running laptop or mutable shared data. Local Python proxy
mode remains available. The release’s exact artifact and verification are recorded
in [the hosted release notes](../docs/handoffs/demo-1-hosted-release.md).

For protected live browser checks, `DEMO_COOKIE_JAR` may reference a temporary
Netscape cookie jar produced by the authenticated `vercel curl` command. Never
print or commit it; delete it after the check. Live test traces are disabled.
