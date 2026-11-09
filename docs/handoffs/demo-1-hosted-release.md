# Demo 1 hosted release

> Historical release: the interface in this deployment was superseded by the
> [original UI restoration](demo-1-original-ui.md) at the same production URL.

Status: READY, deployed to production after explicit user authorization in chat.

- Project: `memento-loop/demo-1` (`prj_7r5TIZPnFNb3GzF4m1pZ0Wex25HM`).
- Stable URL: [Open Demo 1](https://demo-1-omega-ten.vercel.app).
- Deployment: `dpl_Gv6A5iSg6ozpFbWRrg7gz3eUFfen`.
- Exact deployment URL: https://demo-1-26mfplyru-memento-loop.vercel.app.
- Inspector: https://vercel.com/memento-loop/demo-1/Gv6A5iSg6ozpFbWRrg7gz3eUFfen.
- Runtime: Next.js 16.4.3, Node 24, read-only frozen-result API.
- Source snapshot SHA-256: `9665834826890d3dc7f11409490852a038d9b8ab146a6ab3110ae48a24746028`.
- Frozen signal publication: `mss_95738f7e4939304b46baeca0f8b76fabbde7228b4ac2e74a2e8093c23c8f84ab`.

The deployment uses an explicit 26-file snapshot of the reviewed working tree, not
an asserted Git commit. Its inventory, exact source bytes, synthetic bundle, and
fingerprint are preserved below ignored `data/hosting/demo-1/`. No commit or push
was performed. Manual Git deployment settings prevent a push from publishing.
`memento-os` was not modified.

## User flow and boundaries

Start demo → existing Monday report ↔ existing attention queue → existing evidence.
Restart returns to the start screen, clears this browser's selected publication,
and discards the prior React state using a fresh page navigation. No shared server
session or mutable demo state exists; simultaneous walkthroughs are independent.

The hosted API serves only validated responses exported from the existing
Python/DuckDB pipeline. Calculations and ranking are unchanged. There is no runtime
dependency on a laptop, Python process, new datastore, or external customer data.
The bundle is synthetic and includes no raw extracts, confidential unit-cost rows,
credentials, or evaluator truth. The four-item, one-store demo cohort is unchanged.

The team's default Vercel sign-in protection remains enabled. Owners/team members
should sign in when prompted. An anonymous client browser is not promised access;
showing the demo through the presenter's authenticated browser works without
changing access controls.

## Verification

- `make verify` passed: 85 Python tests, Python and TypeScript checks, ESLint,
  15 frontend tests, production build, three mocked-browser tests, one real
  Python/API/Parquet browser test, and one frozen-hosted-mode browser test.
- A production-mode Next.js build and local production-server browser test passed.
  The frozen bundle is included in the server function's output-file trace.
- Authenticated live report API returned HTTP 200, synthetic classification, the
  exact publication above, and category counts `[1, 3, 1]`.
- The same browser test passed against the live production origin: start, all
  category drilldowns and charts, restart from an open detail, repeat start with
  the same publication, and independent browser-session state.
- Live browser testing used a temporary CLI-authenticated cookie jar without
  exposing credentials. Authenticated test traces were disabled; the jar was
  deleted afterward. Typechecking and lint passed after that test support change.
- Post-deploy error-log scan for this deployment over the preceding hour returned
  zero error records. No recurring monitoring or log drains were added.
- `npm audit` reports zero vulnerabilities. `git diff --check` passed.

The first deployment attempt used an incorrect generic framework configuration and
failed before becoming live. Project settings were corrected to Next.js/Node 24,
then the successful deployment above was built and tested. The Vercel connector
could not create the project (403); its documented CLI fallback used the existing
Vercel login successfully.

## Repeatable manual release

1. Prepare or select declared synthetic inputs and run `make demo-export`.
2. Run verification and a production-mode build with `MEMENTO_DEMO_BUNDLE=1`.
3. Run `.venv/bin/python -m tools.package_demo` to record an explicit source inventory.
4. Materialize only that inventory into an isolated deployment directory and bind it
   to the project/team IDs above. Exclude `.env*`, `.vercel` credentials, local caches,
   raw/canonical data, and tests from the upload. Include only `.demo/demo-1.json`
   from the generated data boundary.
5. Deploy manually using the authenticated CLI, the explicit `memento-loop` scope,
   and `MEMENTO_DEMO_BUNDLE=1` for both build and runtime.
6. Check READY status and run the authenticated live browser verification. Record
   the resulting deployment ID, source fingerprint, and frozen publication.

Future demos should receive separate named snapshots and deliberate publication;
this release does not introduce a generalized demo platform or authorize another
production release without the user's request.
