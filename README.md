# Memento Analytics Demo

The synthetic MCP adapter is documented in [the MCP runbook](docs/runbooks/mcp.md).
It uses the shared Signal contracts through a separate synthetic reader and does
not replace or add routes to the customer dashboard API.

The `codex/customer-ui-security` integration adds protected customer serving and
the `/craftmix` deployment path to the existing UI. See the
[security architecture](docs/architecture/customer-ui-security.md) and
[release runbook](docs/runbooks/customer-ui-release.md). Local synthetic verification
is implemented; production hosting, identity configuration, disclosure approval
and customer-data activation remain separate release gates.

## Core product workspace

The customer UI branch `codex/core-product-ui` adds `/weekly` and `/detail` over
the existing immutable Signal metric service. Normal `/` opens Weekly. Searchable
product Sales, Inventory investigation and total Demand share the same pinned
release, original dates and regional scope. No demo-world calendar or assumed
promotion components are imported. The original `/signal` exploration and explicitly
enabled frozen hosted demo remain available.

See [the UI contract and local setup](docs/product/core-product-ui.md) for supported
data, calculation mappings and customer-data prerequisites. `npm --prefix web run
test:core` runs the real browser → API → DuckDB flow with eight synthetic products.
The original UI slice did not establish production identity/tenant isolation;
the integration above supplies the application controls without activating production.

This repository is the smallest credible local demo of Memento Loop's deterministic
retail analytics path:

```text
retailer and internal inputs -> validation -> canonical retail data -> signals
```

The implementation accepts an explicit synthetic or internal release-set manifest,
validates and canonicalizes its declared Parquet files, and publishes one immutable
queue containing Availability Risk, Demand Momentum Gap, and Inventory Imbalance
Exposure. DuckDB over Parquet is the only analytics engine.

## Setup

```bash
make setup
```

## Run the local pipeline

```bash
.venv/bin/memento-ingest /absolute/path/to/release-sets/<release-id>/manifest.json \
  --classification synthetic --data-root data

.venv/bin/memento-signal /absolute/path/to/data/canonical/<dataset-id> \
  --data-root data \
  --annual-carrying-cost-rate <approved-rate> \
  --carrying-rate-version <approved-version> \
  --supply-model /absolute/path/to/supply_model.json

.venv/bin/python -m memento.attention_priority \
  data/signals/<baseline-signal-set-id>/manifest.json --data-root data

.venv/bin/python -m memento.investigation --data-root data
.venv/bin/memento-serve --data-root data
```

In another terminal:

```bash
npm --prefix web run dev
```

Open `http://127.0.0.1:3000/monday`. The application exposes Monday, Attention,
Reports, and Metrics. `/signal` remains a redirect for old bookmarks; it is not a separate
product surface.

The read-only [Metrics surface](docs/product/descriptive-metric-contract.md) at
`http://127.0.0.1:3000/metrics` exposes realized velocity, region and store-tier
breakdowns, reported zero stock, promised distribution, completed-period trends,
and weekday patterns. It has its own immutable publication and does not replace
the current Signal release or select actions.

The alternative [Focus UI draft](docs/product/focus-ui-draft.md) is available at
`http://127.0.0.1:3000/draft`, with a guided briefing, layered evidence, and local
follow-through choices.

Only explicit regular-file manifests are accepted. Source files are never modified
or copied. Generated data remains below the ignored `data/` directory, and logs contain
metadata and rule identifiers rather than source rows.

## Verification

```bash
make verify
```

The full gate runs Python tests and type checking, frontend type checking and linting,
dependency security checks, unit tests, the production build, mocked browser flows,
and the full browser-to-API-to-Parquet workflow. Runtime dependencies must be free of
high or critical audit findings; any temporary development-tool exception is explicit
and expiring.

## Current documentation

- [`docs/architecture/canonical-retail-v1.md`](docs/architecture/canonical-retail-v1.md)
  defines canonical Parquet schemas and lineage.
- [`docs/architecture/ingestion.md`](docs/architecture/ingestion.md) defines the local
  ingestion boundary.
- [`docs/architecture/signal-serving.md`](docs/architecture/signal-serving.md) defines
  immutable signal discovery and serving.
- [`docs/product/mvp-product-shape.md`](docs/product/mvp-product-shape.md) defines the
  current product boundary.
- [`docs/product/mvp-metric-contract.md`](docs/product/mvp-metric-contract.md) defines
  current ranking and evidence semantics.
- [`docs/product/data-scope.md`](docs/product/data-scope.md) and
  [`docs/product/supply-contract.md`](docs/product/supply-contract.md) define the
  accepted input and assumption scope.

This demo is synthetic-data-only for its investigation artifacts and is not approved
for confidential customer or production data.
