# Monday demo cleanup — verification record

The approved [demo contract](../product/demo-contract.md) is implemented as a local,
read-only Monday report → category queue → evidence → report workflow.

## Delivered behavior

- `/report` is the entry point. `/` and the retired `/attention` route redirect
  there; `/signal` opens the same product surface.
- Three report cards use complete-publication counts and published leading cases.
  Demand overperformance selects acceleration, excluding deceleration.
- Category queues read up to ten matching cases from the full publication and retain
  overall ranks, including ranks outside the overall top ten. The All view remains
  the natural overall top ten and accurately labels demand deceleration.
- Browser and API session pinning prevent silent publication changes. Missing or
  invalid artifacts produce explicit error states and an intentional latest-release
  choice. Type-specific charts and expandable published evidence replace the raw-row
  summary and 3D scene. Supply assumptions remain disclosed when applicable.
- Obsolete Attention components, scene/client helpers, and Three.js dependencies are
  removed. Legacy prediction APIs, schemas, and their compatibility tests remain.
- README and older product/plan documents point to the approved scope. Calculation
  formulas, eligibility, ranking weights, and historical publications are unchanged.

## Reproducible local demo

Run `make setup`, `make demo-prepare`, then `make demo`. See the root README for
using a declared existing synthetic publication instead.

The prepared fallback is four artificial items at one store, observed November 30,
2026 through January 29, 2027, with a January 30 cutoff and 28-day projection through
February 26. It produces one stockout-risk signal, three excess-inventory signals,
one acceleration signal, and one deceleration signal. The 20% annual carrying rate
is a versioned synthetic test assumption. Report figures describe leading cases,
not portfolio totals or realized outcomes.

Fixture packages are generated from literal synthetic inputs through the existing
validation and publication pipeline. Canonical and derived outputs stay under
ignored `data/demo/`. Temporary source packages are discarded; their checksums and
lineage remain recorded. The existing one-item legacy pipeline fixture is retained
for prediction compatibility; both generators share the same explicit source helper.

## Verification evidence

- `make setup`: passed with Python 3.11, declared dependencies, and Playwright Chromium.
- `make demo-prepare` and `make demo-preflight`: passed; all three required report
  categories present and displayed category evidence validated.
- `make verify`: passed — 85 Python tests, Python/TypeScript typechecking, ESLint,
  13 frontend unit tests, production build, three mocked-browser tests, and one
  real browser → API → Parquet workflow covering all three report drilldowns.
- Backend coverage includes category leaders beyond the overall top ten, old
  publication retrieval after the current pointer advances, invalid/missing IDs,
  empty categories blocking readiness, and corrupt published artifacts.
- Frontend coverage includes unchanged pinning, invalid evidence, empty selections,
  and repeatedly selecting the active category without leaving the UI loading.
- Report and evidence screenshots were inspected. Screenshots remain under ignored
  `web/test-results/`; they are not source-controlled artifacts.
- `make demo` startup smoke passed through the frontend proxy to the pinned API and
  synthetic publication. Interrupting it stopped both services; ports 8000 and 3000
  were confirmed no longer listening. Startup rejects occupied ports. A transient
  closed-socket reuse issue found in this smoke was corrected; Python typechecking
  and the startup/shutdown smoke passed after that correction.
- `git diff --check`: passed. No customer data, source extracts, credentials,
  generated Parquet files, or external source-repository changes are included.

## Limits and remaining checks

The corrected-scale ten-item/1,000-store artifacts were not present locally. This
cleanup has not rerun that slice, its supply-aware performance, matured outcome
metrics, or full-scale commercial calibration. Existing recorded findings remain
historical evidence, not new verification. No production deployment was attempted.

The initial cleanup left six affected npm packages. The separately authorized
security follow-up updated Next.js and eslint-config-next to 16.4.3, Zod to 4.6.7,
Vitest and its mocker to 5.0.5, Vite to 8.3.5, and source-map-js to 1.2.2. Compatible
transitive dependencies were refreshed in the lockfile without `--force` or audit
suppression. `npm audit` now reports zero vulnerabilities. The complete `make verify`
gate passed again with those versions (85 Python tests, 13 frontend tests, four
browser tests, typechecks, lint, and production build).

The installed FastAPI/Starlette test stack still emits an httpx deprecation warning.
Vite also emits a warning about a future native config-loader default; current
configuration and tests pass. Neither warning is an npm audit vulnerability.
