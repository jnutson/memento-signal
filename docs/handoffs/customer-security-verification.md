# Customer security implementation verification

Verified locally on 2026-11-08. This is implementation evidence, not a production
security certification or approval to handle existing customer records.

## Implemented

- Default-disabled ASGI serving and synthetic-only unprotected loopback mode.
- Managed Cloudflare Access JWT verification, current explicit subject membership,
  per-request policy reload, safe errors, no-store headers, bounded requests, and
  payload-safe access-decision logging with request/resource fingerprints.
- Tenant-owned batch roots and manifests, conflicting owner rejection, classification
  checks, explicit publication digest approvals, and read-only deployment controls.
- Bound serving queries, validated selectors/paths, symlink confinement, restricted
  DuckDB connections, query interruption, memory limits, and extension/network controls.
- Vercel `/craftmix` routing support for assets, API requests, forms, and publication
  state. Customer builds disable synthetic bundles and local unprotected proxy fallback.
- Fresh synthetic-only demo exports, temporary hosted-test fixtures, deployment data
  exclusions, hashed dependency locks, CI checks/audits, and update configuration.
- A digest-pinned nonroot container build and a read-only per-customer runtime template.

## Verification results

`make verify-ci` passed:

| Check | Result |
|---|---|
| Source boundary guard | Passed; forbidden assets are rejected before content reads |
| Python suite | 99 passed, including 14 security cases |
| Python and TypeScript type checks | Passed |
| Frontend lint | Passed |
| Frontend unit tests | 15 passed |
| Next.js production build | Passed with demo bundling disabled |
| Browser UI tests | 3 passed |
| Real synthetic pipeline browser test | 1 passed |
| Protected `/craftmix` browser test | 1 passed |
| Isolated frozen-synthetic-demo browser test | 1 passed |

The protected browser case traverses Next.js, HTTPS, real RSA JWT verification,
authorization, and real synthetic Parquet. It checks anonymous/wrong-member denials,
an unapproved publication, injection input, the customer path, evidence rendering,
cache headers, and membership revocation. Only the test issuer's JWKS discovery is
substituted; production verification has no test bypass.

The Docker image built successfully. A local smoke check ran as UID 10001 with a
read-only root, dropped capabilities, no-new-privileges, no networking, and a bounded
temporary filesystem; the restricted DuckDB connection returned the expected result.
This does not verify a particular cloud host's network or volume configuration.

Python development/runtime lockfile audits and npm production-dependency audit
reported no known vulnerabilities. A vulnerable pytest version discovered during
implementation was upgraded. This is a point-in-time dependency assessment.

The current tracked-path inventory and reachable Git history's filenames contained
no forbidden data paths. The source guard passed for tracked and nonignored new
source files. These checks do not establish that every historical file's contents,
previous deployment, or external artifact is free of customer information or secrets.

## Still required before production

- Confirm API hosting. The implemented/recommended target is Vercel dashboard plus
  a separate private Python/DuckDB container host. All-Vercel hosting would need a
  separate private-object-storage integration; it is not implemented by this change.
- Configure/verify the live identity provider, Access issuer/audience, MFA, members,
  alternate deployment URLs, direct-origin restrictions, and edge/cache policies.
- Verify ownership and existing routing for `memento-loop.co` before adding `/craftmix`.
  Vercel's read-only domain lookup returned `os.memento-loop.co`; no apex routing was
  changed. Existing hosted Demo 1 and its different release branch were not redeployed.
- Obtain explicit approval for exact Craftmix data paths, processing, serving copies,
  publication fields, classification, retention/deletion, and backups. No real customer
  data was opened, ingested, copied, modified, or added to fixtures during this work.
- Assign security/incident/data owners; verify account/branch/credential controls,
  log collection, recovery objectives, a tenant-specific restore, and incident response.
- Verify the actual protected staging deployment and obtain production approval.

No commits, pushes, production deploys, account permission changes, paid-service
provisioning, or customer communications were performed. Existing unrelated working
tree changes remain in place. The local verification does not replace independent
review of the deployed security boundaries.

See [architecture](../architecture/customer-security.md) and
[release/operations runbook](../runbooks/customer-release.md).
