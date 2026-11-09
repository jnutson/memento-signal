# Customer UI security integration

Implemented locally on `codex/customer-ui-security`, from the completed customer UI
commit `e6038fd5a6b35f2fb9f9d0f7ef47fdb31f4d8d8f`. Original UI worktrees,
customer files and hosted demos are untouched. Existing metric arithmetic and
Weekly, Detail and original evidence behavior are preserved.

## Deployment boundary

Vercel serves the UI at `/craftmix`; a separate Linux container serves Python and
DuckDB. The browser uses same-origin Next API routes; the upstream must use HTTPS.
Cloudflare Access is the selected identity verifier, independent of the frontend
hosting provider. A live Access gateway/session arrangement for the Vercel domain
and API still needs staging verification, including assertion forwarding and
issuer/audience compatibility. Page and asset protection must also be configured
at the live gateway. A URL customer name is never authorization.

Use a dedicated container, serving root and policy per customer. Mount only the
approved immutable metric publication and its linked canonical manifest. Serving
does not require raw extracts or canonical record files. The container runs as
UID 10001, with a read-only filesystem and mounts, dropped capabilities, bounded
memory and localhost-only published port. The gateway must be its only ingress.
The container needs outbound HTTPS to the pinned Access issuer for signing keys;
the no-network Docker smoke proves local runtime behavior, not live JWT discovery.

## Application controls

- The exported API defaults to disabled. Explicit local serving is loopback-only
  and accepts declared synthetic publications. Protected serving requires a valid
  operator policy and verified RS256 Access identity, issuer, audience and time
  claims. Membership is keyed by stable subject, not a submitted customer slug.
- Policies bind the tenant, classification and exact SHA-256 of approved metric
  and canonical manifests. Artifact hashes and the canonical linkage are checked.
  Policies reload for requests; atomic membership removal takes effect without a
  restart. Changing issuer, audience or tenant requires restart.
- Tenant ownership markers isolate ingestion/output roots; untagged or conflicting
  root reuse fails. Ownership and classification enter publication identity.
  Existing publications need an explicitly authorized regeneration; relabeling
  existing customer files is not part of this work.
- Protected routes are GET-only, with explicit route/parameter allowlists, pinned
  releases, strict identifiers and bounded pagination/input sizes. Unknown and
  duplicate parameters fail. No arbitrary SQL endpoint exists. Query values use
  bindings and approved identifiers; filesystem paths are constrained.
- Serving DuckDB connections disable extension installation/autoload, external
  access and spill; approved filesystem paths are explicit and configuration is
  locked. Each query has a 10-second interruption deadline, one thread and 256 MB
  memory. The application permits four executing requests and sixteen admitted
  requests, with a two-second queue wait and a global 300 requests/minute budget.
  Uvicorn additionally caps connections/concurrency at eight; limits are process
  local and must be supplemented by gateway limits if scaled horizontally.
- Unneeded raw/evaluation/legacy routes and API docs are unavailable in protected
  mode. Metadata uses an explicit projection; generic table responses use approved
  columns. Added artifact columns do not become API fields automatically.
- Responses disable browser/CDN caching. Audit records use generated request IDs,
  hashed identity/resource identifiers and safe outcomes, without records, tokens
  or query payloads. Production still needs an operator log destination and alerts.
- Frontend requests, assets and navigation support `/craftmix`; local UI notes use
  a path-scoped namespace. Protected mode cannot select frozen demo bundles.

The existing original evidence includes unit-cost/economic operands needed for
reconciliation. These are not hidden by a finance role: obtain data-owner approval
for the exact field disclosure before activation, or implement narrower responses
as a separately accepted requirement. Do not treat column allowlisting as blanket
approval of all sensitive business fields.

## Verification and remaining limits

Synthetic tests cover two customers with overlapping identifiers, publication and
membership separation, token tampering/expiry/issuer/audience, revocation, injection,
path traversal, disclosure drift, resource limits, minimal mounts and artifact
tampering. The protected browser journey traverses Weekly, Sales, Inventory, Demand
and original evidence, then verifies revocation without stale dashboard results.
Its temporary HTTPS server substitutes JWKS discovery with a synthetic signing key;
real Cloudflare/Vercel session integration has not been tested.

Local verification on November 8, 2026:

- Python: 236 passed, two skipped because optional historical local artifacts are
  absent. The 12 customer-security cases also passed after the final forged-token
  assertion was added.
- Frontend: 72 unit tests; 13 original browser tests, seven original full-stack
  tests, three core UI tests and one protected customer journey passed. Two legacy
  briefing tests now enter `/monday` directly because normal root entry is Weekly.
- Python/TypeScript type checks, lint, formatting, source guard and diff whitespace
  checks passed. Normal and protected `/craftmix` production builds passed.
- Runtime Python and runtime/development npm dependency audits reported no known
  vulnerabilities at verification time.
- Docker image built. A smoke run with networking disabled verified UID 10001,
  read-only `/app`, disabled default API serving and bounded DuckDB query execution.

The initial aggregate check stopped on the dependency advisory and then on stale
legacy landing-page assertions. Those were corrected and the affected browser
suites rerun successfully; the aggregate command was not rerun in its entirety.

Python runtime dependencies and the container base are pinned; lock files support
hash-checked installs. A scoped minimatch override fixes the lint dependency's
[upstream advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
Source scanning is a best-effort current-tree guard, not a historical Git audit or
proof that credentials were never committed.

No production deployment, paid resources, live access changes or customer-data
operation is authorized by these local checks. Provider/account/budget, exact field
disclosure, customer-data provenance, retention/backups/restore, live ingress rules,
monitoring ownership and staging acceptance remain release prerequisites.
