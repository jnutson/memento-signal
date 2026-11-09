# Memento Signal Demo

Customer hosting controls and their production limits are documented in
[the security architecture](docs/architecture/customer-security.md) and
[the customer release runbook](docs/runbooks/customer-release.md). The requested
Vercel customer path is `/craftmix`; no production access or routing is activated
by these local changes. Run `make test-e2e-security` for the synthetic protected flow.

> **Hosted UI source:** Demo 1 now uses the original Explore/search/timeline UI from
> branch `codex/demo-1-original-ui` (application commit `0ba536a`), based on
> `codex/connected-demo-insight-details`. The older UI in this main working tree
> is not the current hosted interface. See [the restoration record](docs/handoffs/demo-1-original-ui.md)
> before preparing another deployment. Existing uncommitted main work is preserved.

[Open hosted Demo 1](https://demo-1-omega-ten.vercel.app) · Vercel team `memento-loop`
(sign in to Vercel if prompted). Start or restart a walkthrough on demand.

A local, read-only retail reporting demo for Miro Toys / Miro Spark at synthetic
Walmart US:

**Monday report → attention queue → evidence → return to report.**

The report surfaces stockout risk, excess inventory, and demand overperformance
from one pinned, immutable publication. Category drilldowns read the complete
publication and preserve overall ranks, even when a category is absent from the
overall top ten. Demand overperformance selects acceleration only.

The [approved demo contract](docs/product/demo-contract.md) controls current product
scope. Existing deterministic calculations, validation, lineage, and DuckDB over
Parquet remain the foundation. This is a demonstration of reporting and
prioritization, not order execution or a calibrated production forecasting product.

## Run the self-contained demo

Requires Python 3.11+ and Node 20.9+. `make setup` uses `uv` when available to obtain
Python 3.11; otherwise your `python3` must meet the requirement.

```bash
make setup
make demo-prepare
make demo
```

Open [the Monday report](http://127.0.0.1:3000/report). `make demo` runs preflight,
pins the API to the selected publication, starts both local services, and stops its
child services when interrupted. Ports 8000 and 3000 must be free.

`demo-prepare` creates a small **four-item, one-store artificial fixture** using the
existing validation, canonicalization, and signal pipeline. This is separate from
the corrected-scale engineering slice. It does not read external source data or
change existing extracts. It contains stockout risk, excess, acceleration,
deceleration, and non-candidate cases. Its 20% annual carrying rate is a versioned
synthetic test assumption, not a customer benchmark.

Generated canonical and signal artifacts stay under ignored `data/demo/`. Source
fixture packages are temporary; their manifest checksums remain recorded in the
canonical lineage. They can be regenerated from the committed synthetic generator.
The report labels its actual observation dates and frozen cutoff; “Monday” names
its review cadence.

## Use an existing synthetic publication

No corrected-scale local artifacts were present when this workflow was implemented.
To use an already published synthetic slice, declare its root and optional exact ID:

```bash
make demo-preflight DATA_ROOT=data/iteration-calibrated SIGNAL_SET_ID=mss_<64-hex-digest>
make demo DATA_ROOT=data/iteration-calibrated SIGNAL_SET_ID=mss_<64-hex-digest>
```

Without `SIGNAL_SET_ID`, preflight selects the current publication. Startup pins that
selection for the server session. The browser additionally retains its selected
publication in session storage; a missing publication produces an error with an
explicit “Open latest publication” choice. It never silently switches releases.

Preflight validates bound files and synthetic classification, checks all three
report selections, reconciles their leaders with the queues, and validates evidence
for every displayed category case. It fails if any required category is absent.
Do not relax eligibility or alter ranking to make preflight pass.

## Boundaries and verification

The API reads published artifacts and does not invoke metric or ranking producers.
The frontend validates JSON at runtime, formats values, and plots published evidence.
Report summaries are computed on the backend. Revenue exposure, contribution
opportunity, inventory capital, and carrying cost retain their separate meanings.

```bash
make verify
```

This runs Python tests/typechecking, frontend typechecking/lint/unit tests, a
production build, mocked-browser tests, and the real browser → API → Parquet
workflow. The full-stack test builds its own temporary synthetic fixture and never
reads the external Synthetic Data project. See [web instructions](web/README.md).

Existing `memento-ingest`, `memento-predict`, `memento-signal`, `memento-evaluate`,
and `memento-serve` CLIs and legacy prediction APIs remain available for engineering
compatibility. No new ingestion capability is part of this cleanup. Historical
plans and acceptance reports record earlier milestones; their broader UI scope is
not additional demo work.

Relevant references: [metric contract](docs/product/mvp-metric-contract.md),
[trust boundaries](docs/architecture/trust-boundaries.md),
[synthetic data classification](docs/architecture/data-classification.md), and
[corrected-slice findings](docs/handoffs/small-slice-supply-acceptance.md).

## Hosted Demo 1

`/` now opens the lightweight demo start screen. **Start demo** opens the existing
Monday report; **Restart demo** returns to the opening screen and clears this
browser session's selected publication. Report, queue, and evidence behavior remain
unchanged. Each browser session is independent.

For hosting, `make demo-export` exports a validated, synthetic API-response bundle
under ignored `web/.demo/`. Set `MEMENTO_DEMO_BUNDLE=1` when building and running the
Next.js app to serve its read-only API from that frozen bundle. Python/DuckDB still
produce the metrics before deployment; no raw extracts or unit costs are packaged.
Local development without this flag continues to proxy to the Python service.

`python -m tools.package_demo` records the exact source and bundle fingerprint under
ignored `data/hosting/demo-1/`. Vercel deployments are manual and separate from
`memento-os`; pushing Git changes does not publish this app. The hosted verification
runs with `npm --prefix web run test:e2e:hosted`; set `DEMO_URL` to the live origin to
run the same start, drilldown, restart, and session-isolation check after publishing.

## Memento Loop MCP

The read-only MCP exposes business context, governed signal metric definitions,
the attention queue, and published evidence through the same validated readers as
the website. Local development uses stdio and declared synthetic publications;
HTTP requires an explicit OAuth resource-server policy. No customer-data serving
or production endpoint is enabled by this change.

See the [MCP plan](docs/plans/memento-signal-mcp.md) and
[setup and verification runbook](docs/runbooks/mcp.md). Neon is the approved
operational store for future decision history; DuckDB over Parquet remains the
analytics engine. This first release requires no operational database.
