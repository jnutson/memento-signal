# Customer security boundary

Implementation status: locally implemented and verified with synthetic data.
Production activation, provider configuration, customer-data handling, and an
independent security review remain separate release gates. This document does not
certify compliance or authorize customer-data processing.

## Deployment decision

The requested dashboard address is `https://memento-loop.co/craftmix`, hosted on
Vercel. Build each customer deployment from the same code with
`MEMENTO_CUSTOMER_PATH=/craftmix`. This is a routing selector, never identity or
authorization proof. Each customer has a separate API identity, data root, and
operator-owned policy. Do not introduce shared customer tables as an optimization.

The implemented API runtime is Python/FastAPI/DuckDB over private local Parquet,
with a nonroot read-only container template. Vercel hosts the Next.js dashboard.
If both frontend and API must run on Vercel, a separate private-object-storage
integration is required before deployment: Vercel functions do not mount the local
repository's data directory. Do not bundle customer files into a Vercel deployment.
The user selected the separate container-host architecture on 2026-11-08. The
specific provider, paid resources, account connection, and production activation
still require confirmation. See [the host proposal](../plans/craftmix-container-host.md).

## Identity and access

- The exported ASGI `app` defaults to disabled. `/livez` returns status only.
- Protected mode requires a valid policy at startup. Cloudflare Access verifies
  login upstream; the Python origin independently verifies RS256 signatures,
  issuer, audience, expiration, issued-at, and subject using issuer-pinned JWKS.
- JWT-supplied key URLs, email-domain membership, tenant headers, and client-selected
  paths cannot grant permission. Only explicitly registered immutable subjects
  receive viewer access. No customer administration or export capability is exposed.
- Policy membership is reloaded on every request. Removing a subject revokes its
  next request even if its token remains unexpired. Previously received browser
  data cannot be remotely recalled. Changes of issuer, audience, or tenant require
  restarting the process.
- The loopback CLI refuses unprotected non-loopback binds. Unprotected local API
  requests require declared synthetic canonical inputs. Production code must use
  the configured entrypoint, not the local factory.
- API docs and schema endpoints are disabled. Only GET requests are supported.

Cloudflare Access is the implemented identity adapter. Vercel Deployment Protection
alone does not replace customer identity or tenant authorization. If a different
customer identity provider is selected, implement and verify its adapter before
activation; do not disable token validation to accommodate it.

## Data ownership and publication

Tenant-bound ingestion requires an explicit `tenant_id` and a dedicated empty
output root, or a matching `.tenant.json` ownership marker. Untagged jobs cannot
write into a tenant-bound root. Batch roots require private host permissions, and
explicitly conflicting source-owner declarations are rejected. Canonical dataset identities incorporate the tenant;
prediction and signal manifests propagate it, and batch publishers check output
root ownership. Source ownership is an operator-reviewed registration decision;
the software cannot infer the legal owner of an unlabelled extract.

Protected serving accepts only manifest paths and SHA-256 digests listed in its
read-only policy. Every approved manifest must declare that policy's tenant.
Canonical classification must match. Canonical/source lineage binding and artifact
integrity checks remain in force. Replacing a pointer, modifying a manifest, or
approving another tenant's manifest digest cannot bypass ownership checks.

`tools.approve_publication` creates a new, inactive policy from explicitly selected
manifests after ownership, integrity, and classification validation. It never
overwrites a live policy. The policy is a deployment control artifact, not evidence
that the operator has reviewed source provenance or obtained processing permission.

Raw, canonical, and derived areas stay separate. Mount only approved serving inputs,
never the general developer `data/` tree. The serving API currently needs its bound
canonical display tables and sales scope as well as signal artifacts. A smaller
precomputed response-publication format is future work, not an implemented boundary.
Existing legacy datasets without ownership metadata cannot be silently adopted;
their reprocessing/registration requires an approved data-handling step.

## Queries and runtime restrictions

- Request values use bound parameters. Query structure uses application-owned
  alternatives and enums. No dashboard interface accepts SQL or expressions.
- Existing offline SQL construction uses fixed schema identifiers and escaped path
  literals where not parameterized. These batch modules are not HTTP endpoints.
  New dynamic identifiers must come from fixed application mappings, not source
  column names or request strings. Classification does not make source files trusted.
- Serving uses one connection per operation, approved directory allowances,
  disabled external access and extension auto-install/load, locked configuration,
  one DuckDB thread, 256 MB memory, no disk spill, and a ten-second interruption
  deadline per operation. Configuration order is deliberate and tested with the
  pinned DuckDB version.
- Per-process backstops allow four active requests and 300 requests/minute.
  URL/query/body limits reject oversized requests. These do not replace deployment
  limits or provide distributed per-user quotas.
- The container uses UID 10001, read-only filesystem/data mounts, dropped Linux
  capabilities, no-new-privileges, and bounded CPU/memory/process count. The host
  must restrict ingress to its trusted gateway and egress to required JWKS traffic.
  DuckDB settings are additional protection, not an operating-system sandbox.

## Browser, caches, and disclosure

API successes, denials, validation errors, and unexpected errors use private/no-store
cache headers. CDN and application caches must preserve that policy. Frontend fetches
use no-store. The protected frontend disables frozen-demo serving and bundling;
unconfigured production builds do not proxy to an unprotected loopback API.

Response models explicitly select fields; arbitrary source rows, internal paths,
and raw unit costs are not response fields. Existing customer economics and evidence
fields require data-owner approval before release. No exports are implemented.
UI content is escaped by React. Security headers restrict framing, object embedding,
referrers, and browser capabilities. The current CSP is a baseline restriction,
not a complete nonce-based script policy.

Audit events contain response status, matched route template, a generated request ID,
a resource fingerprint, and a hashed principal;
they exclude query values, JWTs, raw subject IDs, payloads, and filesystem paths.
Deployment-specific logs must be collected with retention and access controls. The
current events are access-decision evidence, not a complete administrative audit trail.
Uvicorn access logging and trusted forwarded headers are disabled in the supported
production entrypoints. Platform log redaction/retention still needs verification.

## Source, builds, and patching

Python dependency locks include hashes; runtime images exclude development tools.
The base image is digest pinned. Browser dependencies use the npm lock. CI runs the
source boundary guard, synthetic security tests, normal verification, and dependency
audits. Dependabot proposes dependency and action updates; updates must regenerate
locks and pass verification before promotion. No workflow added here deploys software
or exposes production secrets to pull requests.

The source boundary guard checks tracked filenames before opening forbidden assets
and searches permitted text files for common credential formats, reporting locations
only. It is not a comprehensive secret scanner or a historical data-leak audit.
Unknown binary/source assets and customer provenance still need human review.
Demo export always generates fresh artificial inputs; it does not read the supplied
data-root argument. A synthetic label on an arbitrary input is insufficient proof.

## Threats and verification

Synthetic tests cover signed and invalid tokens, wrong audiences/issuers, current
membership, customer separation, unapproved publications, SQL injection, arbitrary
paths, symlink escape, DuckDB network/file/configuration restrictions, query deadlines,
request limits, and safe audit output. The browser test traverses `/craftmix` through
Next.js, HTTPS, real token verification, and Parquet, including revocation.

They do not verify a live identity provider, Cloudflare policies, Vercel project/domain
routing, host filesystem/network controls, customer backups, or actual customer data.

References: [OWASP tenant security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html),
[OWASP SQL injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html),
[DuckDB security](https://duckdb.org/docs/1.5/operations_manual/securing_duckdb/overview),
[Cloudflare application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/).
