# Core product UI verification

November 8, 2026. Customer repository worktree:
`/Users/jnutson/Documents/memento-signal-product-ui`, branch `codex/core-product-ui`.
Baseline: Signal `codex/demo-1-original-ui` / `f9cd045`. User authorization is the
request to implement the reviewed demo-to-customer UI port.

## Verified behavior

The story is Weekly → searchable product Sales → region → Inventory/Demand →
finding investigation and original evidence exploration. All views use the same
immutable Signal metric release. The new FastAPI projections query existing
published Parquet through DuckDB, then typed browser clients validate publication,
product, region and finding identity. Charts format the returned facts.

| Boundary | Evidence |
| --- | --- |
| Source facts → summary | UI-W01 tests reconcile item/portfolio quantities and dollars, demonstrate full versus partial coverage and preserve native dates. Two-product complete data supports real WoW/share; eight-product incomplete data withholds them. |
| Source projections → scoped product response | UI-W02/03 tests reconcile regional demand, receipts and cumulative unmet units against existing firm/conditional paths; cumulative retail exposure matches the published assessment. Unknown store paths withhold dependent totals. |
| Store API → visibility | UI-W04 tests verify distinct bounded pages, literal search, original zero stock and the exact six-field allowlist. No cost/source/evaluator payload is returned. |
| API → browser | Browser checks use a real synthetic release, FastAPI, DuckDB and Next rewrites. They verify product search, eight-item wraparound, preserved region/supply basis, exact daily values, deep-link reload, the finding dialog and the original Explore surface. |
| Failure paths | Corrupt files and missing releases fail closed. A successful HTTP response with the wrong product scope is rejected by the client; retry recovers when the correct response is restored. |
| Accessibility/layout | 390px mobile checks show no page overflow or native select menus. Pointer hover and arrow-key date selection agree; charts preserve unknown gaps, grids, units and tables. Visual QA increased mobile SVG label size by matching the coordinate system to actual chart width and separated the final two date labels. |
| Predecessor preservation | All five original connected browser journeys pass. The separate frozen-original synthetic bundle/start/restart/session journey passes with `MEMENTO_DEMO_BUNDLE=1`. No hosted deployment is modified. |

Final checks run:

- Full Python suite: **224 passed, 2 skipped**. The skips are predecessor tests.
- Python static checking: **0 errors, 0 warnings**.
- Frontend unit tests: **72 passed**.
- Frontend TypeScript, lint, formatting and optimized production build: passed.
- New real-stack customer workspace browser suite: **3 passed**.
- Original connected browser suite: **5 passed**.
- Frozen original hosted-mode browser suite, locally against synthetic inputs: **1 passed**.
- The original demo control/icon source hashes match the imported bytes; the
  reviewed allowlist and exact source commit are in `docs/migration/core-ui-port.json`.

Screenshots are ignored local artifacts under `output/playwright/core-product/`.
All checks use synthetic inputs. No customer source files or credentials are read,
copied, committed or uploaded. Repository-wide `make verify-ci` and a remote
deployment/security acceptance are not claimed; the checks above were run directly.

## Concurrent customer-security integration boundary

During this task the original Signal `main` checkout gained additional uncommitted
security/deployment work, including `src/memento/security.py`, `query.py`, ownership
policies and a customer URL base path. That checkout is not this worktree and was
not modified by this port. These changes postdate the selected UI baseline and
must not be overwritten by copying this worktree wholesale into `main`.

Integration must bring the new metric view endpoints through that branch's approved
authentication, tenant/publication approval and bounded-query controls. Its current
API is based on legacy Signal endpoints and does not yet register the newer
metric router. New workspace routes must not be exposed by bypassing its allowlist
or serving the older unprotected factory in production. Base-path-aware fetches,
the selected identity adapter and tenant-owned metric publications must be verified
together before a customer release. This branch is a tested local UI port, not a
replacement security architecture or an approved customer deployment.

Promotion analysis, a verified-coordinate map and component-level Demand remain
explicitly unsupported until the customer data contracts exist. The working total
Demand forecast, sales and inventory evidence do not depend on those capabilities.
