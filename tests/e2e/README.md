# End-to-end pipeline tests

This directory contains tests that cross the product's real runtime boundaries. The
scenarios build minimized synthetic release sets, ingest and canonicalize them,
publish deterministic signals and investigations, and read the results through the
typed Signal HTTP API.

These tests deliberately use only temporary synthetic data. They do not read from
or modify `/Users/mininutson/Desktop/Synthetic Data`, and they do not require a
running database, server, or browser.

Run the pipeline suite with:

```bash
.venv/bin/pytest tests/e2e
```

or by marker:

```bash
.venv/bin/pytest -m e2e
```

The Playwright suite under `web/tests/e2e` has a different purpose: it verifies the
interactive Attention workflow in a real browser against controlled API fixtures.

The full-stack browser test connects both layers. It publishes the same temporary
synthetic release, starts the real FastAPI adapter and Next.js application, then drives
the queue and planning workflow with Playwright:

```bash
cd web
npm run test:e2e:fullstack
```

Together, these suites keep fast contract tests and mocked browser diagnostics while
also proving the complete browser-to-API-to-Parquet path.
