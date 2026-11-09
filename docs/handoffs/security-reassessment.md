# Security reassessment and PR coverage

## November 9 reconciliation

PR #9 now reconciles the preserved work with the newer product tree. PR #7 had
reached `main`, but PR #8 was subsequently merged into PR #7's source branch.
The reconciliation includes that branch's security commit and preserves its
complete frontend, customer HTTP boundary, CI checks, dependency policy, and
container configuration.

The unique MCP implementation is retained behind `mcp_signal_store` and
`mcp_signal_reader`, sharing current Signal contracts and validators. Its local
HTTP harness is synthetic-only and loopback-only; it is not mounted in the
customer application. The obsolete alternative dashboard, prediction stack,
duplicate serving configuration, and old browser assertions are superseded by
the newer product implementation. Their original source remains preserved in
commit `114fc10`. No customer data or local settings were migrated.

Signal publications now preserve canonical ownership in their identity and reject
cross-customer output roots before publication. Dependency locks include the MCP
runtime while retaining the newer product's checks. The sections below describe
the earlier preservation review; they are historical evidence, not the final
combined branch's verification results. Final results are recorded in PR #9.

The customer-data release prerequisites below remain in force. Resolving and
merging source conflicts does not activate customer access or production hosting.

## Original preservation assessment

Reviewed November 8, 2026. This is a source/design assessment with synthetic local
verification, not an independent penetration test or production approval.

## Branches and preservation

- PR #7 (`codex/connected-demo-insight-details`) targets `main` and contains the
  connected metric/demo foundation.
- PR #8 (`codex/customer-ui-security`) targets PR #7's branch and includes the
  original-demo restoration, Weekly/Detail product UI, Craftmix branding, and the
  newer customer-security integration. Its original HEAD is
  `52acd19750490d40ee4921501f6c9a24596c8f99`.
- `codex/local-signal-mcp-review` preserves all 110 changed source paths from the
  original `Memento Signal` checkout in commit `114fc10`. That checkout was based
  on `a4a12f8` and diverges from the newer product UI. Its original working files
  were left unchanged; ignored data, credentials, build artifacts, local settings,
  and generated plugin packages were not copied or committed.

This preservation branch is an alternative legacy Signal implementation, not a
successor to PR #8. Do not merge it over the newer product branch. Reconcile the
synthetic MCP adapter with that branch in an explicitly scoped follow-up before
combining the implementations. PR #8 already includes the committed local
`codex/core-product-ui` and `codex/demo-1-original-ui` histories.

## Assessment of the latest product branch

The newer design addresses the earlier isolation and serving concerns through
dedicated customer mounts and policies, verified RS256 identities, explicit subject
membership, per-request revocation, tenant-bound hash-approved publications,
response-column allowlists, cache prevention, bounded DuckDB queries, and a
nonroot read-only serving container. The serving mount now needs metric artifacts
and a linked canonical manifest, rather than general raw or canonical record trees.

Fresh `make verify-ci` passed on the exact PR #8 HEAD: 236 Python tests passed,
two optional historical-artifact cases skipped; Python/TypeScript checks, lint,
formatting, source guard, dependency guard, 72 frontend tests, production build,
13 UI browser tests, seven full-stack browser tests, three core UI tests, and one
protected synthetic browser journey passed. GitHub's Verify run for that HEAD
also succeeded. These checks do not exercise a live customer deployment.

## Remaining customer-data release requirements

1. **Contain ingestion before opening untrusted files.** The documented container
   is a serving boundary. The batch ingest path does not establish an equivalent
   enforced parser sandbox. Before real retailer inputs are processed, require
   a disposable least-privileged worker with scoped read-only inputs, isolated
   writable staging, no unrelated credentials, restricted network, and enforced
   CPU/memory/disk/runtime limits. DuckDB configuration and schema validation do
   not contain faults triggered while parsing a crafted file. This review did
   not implement or verify an ingestion sandbox.
2. **Verify live identity and routing.** Exercise the actual Access issuer/audience,
   MFA, forwarded assertions through Next.js, direct API origins, alternate and
   preview hostnames, page protection, expiry, revocation, and cache behavior in
   synthetic staging. The local browser fixture substitutes signing-key discovery.
3. **Approve disclosure explicitly.** The newer original-evidence responses include
   economic operands and unit costs. Its viewer membership is not a finance-role
   boundary. Obtain data-owner approval for those exact fields or separately
   implement and test narrower response permissions before activation.
4. **Operationalize retention and recovery.** Assign security, incident, and data
   owners; verify log collection/alerts, encrypted storage/backups, customer-specific
   restore, retention/backup expiration, and offboarding evidence. Immutable releases
   must still have a defined retention period. Written runbooks do not establish
   deployed controls.

The customer-data gate remains closed until the relevant requirements are met.
No real customer files were opened, copied, ingested, relabelled, or deployed in
this reassessment. No live access controls or paid services were changed.

## Legacy preservation branch follow-up

The original local tree passed `make verify-ci`: 120 Python tests, 15 frontend
tests, type checks, lint, production build, three UI browser tests, one full-stack
browser test, one protected customer browser test, and one isolated frozen-demo
browser test. The MCP tests include identity/scope checks, revocation, publication
pinning, argument rejection, and economics-field redaction. MCP remains synthetic
only; it does not authorize customer records to enter model context.

A fresh audit additionally found eight moderate npm findings in the legacy lint
dependency chain. This branch applies the same scoped minimatch override already
used by PR #8. The updated lockfile install and full npm audit report zero known
vulnerabilities. Final committed verification is required before publication.
No audit threshold was relaxed or framework migration introduced.

## Primary research

- [DuckDB security model](https://duckdb.org/security): embedded SQL and file
  parsing share host-process privileges; process containment is an application duty.
- [OWASP tenant security](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html):
  verified tenant context, enforceable isolation, cache boundaries, resource limits,
  and retention/restore requirements.
- [Cloudflare application tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/):
  validate the application identity token at the origin.
- [NIST small-business quick start](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1300.pdf):
  risk ownership, MFA, encryption, patching, backups, detection, and recovery.
