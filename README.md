# Memento Analytics Demo

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
and Reports. `/signal` remains a redirect for old bookmarks; it is not a separate
product surface.

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
