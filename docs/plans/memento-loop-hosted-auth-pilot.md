# Memento Loop hosted authentication pilot

Date: 2026-11-08. Status: proposed implementation plan, ready for scope review.

This document plans the next milestone after the locally verified synthetic MCP.
The user requested this plan; this turn does not implement it, provision services,
modify authentication, deploy, change DNS, or process customer data. The earlier
authorization for a private local test tunnel does not authorize production access.

## Outcome and scope

A customer adds **Memento Loop** to ChatGPT or Claude, signs into their Memento
account, approves access to their organization, and asks a question. No customer
API key, Terminal command, tunnel, local installation, or developer laptop is needed.
Reconnect and token renewal work through the host's normal connection experience.

The pilot exposes only the five existing read-only tools: business context,
metric listing, metric definition, attention queue, and signal evidence. Retain
metric meanings, deterministic calculations, publication lineage, and economic
field restrictions. Hosted synthetic acceptance precedes any customer-data release.

Explicitly deferred: new ingestion, new retailers, general SQL, promotion scenarios,
decision recording, interventions, order execution, billing, self-service tenant
creation, enterprise SSO, and public plugin-directory submission. Clients may need
workspace-admin approval for a custom connector during the private pilot. Do not
promise a one-click public installation before distribution support is verified.

## What already exists

| Existing component | Evidence and implication |
| --- | --- |
| Five Python MCP tools | `src/memento/mcp_server.py`; tested locally and through a ChatGPT private tunnel |
| Shared analytical readers | `read_monday_report`, `read_signal_queue`, `read_signal_detail` in `src/memento/api.py`; keep one calculation/validation implementation |
| OAuth resource-server prototype | `src/memento/mcp_security.py`; synthetic-only, RS256-only, file-backed membership, explicit custom domain scopes |
| Publication pinning | One publication per server process today; unsuitable for silently choosing publications across multiple organizations |
| Safe query and publication boundary | `query.py`, `serving.py`, `security.py`, ownership checks and approved manifest hashes |
| Dashboard and customer host design | Next.js on Vercel; a separate Python/DuckDB container; dedicated customer data roots and workers |
| Operational-store decision | Neon-managed PostgreSQL is approved; no other operational datastore |

There is no Memento account/session implementation in the inspected `web` package.
Cloudflare Access is an existing protected-serving identity adapter, not evidence
of a reusable product-account system. Check whether another Memento application
already owns customer login before introducing a second identity. Preserve that
application and unrelated work unless migration is separately approved.

The current tunnel proves tool execution. It does not prove customer OAuth,
cross-client interoperability, hosted availability, or production data approval.

## Proposed decisions

| Topic | Proposed decision | Approval or proof still needed |
| --- | --- | --- |
| Identity | Reuse an existing Memento IdP if one exists; otherwise evaluate Neon Managed Better Auth first | Existing identity inventory and phase 0 compatibility evidence; its OAuth provider is beta |
| Application state | Neon PostgreSQL for identities, organizations, memberships, permissions, grants and publication registrations | Exact project, region, environment/branch, migration review |
| Login and connection UI | Next.js pages for sign-in, consent, organization context, connection status and disconnection | Confirm intended Vercel project and domain routing; preserve current customer routes |
| MCP runtime | Keep the official Python SDK and existing tool implementations | Provider-compatible verification and new hosted entrypoint |
| Analytics | Dedicated tenant reader processes and tenant storage credentials; DuckDB over approved Parquet | Host capabilities and concrete per-tenant deployment controls |
| Hosting | Vercel for account UI; container-capable hosting for Python gateway/readers | Reuse the accepted container boundary; select host/account/region and budget before provisioning |
| Distribution | Private OAuth-backed connections in ChatGPT and Claude first | Real client setup, organization-admin requirements, verified install URLs |

`docs/plans/craftmix-container-host.md` proposes a customer-specific DigitalOcean
host, with provider and spending still subject to approval. This plan does not
activate that proposal, share its customer volume, or presume a Railway/Vercel
Python deployment is approved. Choose the smallest host arrangement that meets
the existing container and tenant controls; do not introduce Kubernetes.

Neon Auth documents hosted login/consent pages, EdDSA access tokens, and fixed
OIDC scopes. These differ from the current verifier. Validate the exact token
profile, audience handling, client identity and refresh behavior before selecting
it. See [Neon OAuth Provider](https://neon.com/docs/auth/guides/plugins/oauth-provider).
Retain existing IP/private-network protections; managed Auth eligibility must be
checked rather than disabling controls to enable it.

## Target service boundary

```text
ChatGPT / Claude
  | OAuth authorization code + PKCE, user consent
  v
Hosted Memento account pages <--> chosen identity/authorization provider
  |                              |
  | application grant            | audience-bound access token
  v                              v
Neon authorization records <-- Python MCP gateway (stable HTTPS endpoint)
                               |
                               | authorized typed operation, fixed worker mapping
                               v
                         isolated tenant reader
                               |
                               v
                         approved immutable Parquet
                         queried with bounded DuckDB
```

The gateway has no tenant data volumes. It verifies the caller, resolves the
application grant, checks current permissions in Neon, and sends one of the
existing bounded reader operations to the fixed worker for that tenant.
Workers use the existing shared readers and approved-manifest checks. This is a
small dispatcher and private reader interface, not a general query/proxy platform.

For the first hosted synthetic vertical slice, gateway and reader can be developed
in the same checkout. Production tenant readers remain isolated processes with
separate mounts/credentials; one process mounting every customer's root is outside
this plan. The gateway cannot turn a tool argument, header, or URL into a filesystem
root, SQL string, outbound target URL, or storage credential.

Gateway-to-worker authentication uses a reviewed workload identity, with mutually
authenticated transport or a short-lived, audience-specific signed assertion.
The worker verifies tenant, operation, publication, expiry and calling service.
Never relay a customer OAuth bearer token to a different token audience. Select
one supported workload-auth mechanism with the host; no bespoke token protocol.
Private connectivity alone is not worker authorization.

Use a proposed canonical resource such as `https://mcp.<approved-domain>/mcp`.
This is a placeholder, not a registered endpoint. Exact resource, issuer, allowed
redirects, trusted browser origins, and domains become versioned configuration.
Do not change the apex domain or existing `/craftmix` routing during preparation.

## Customer and administrator journeys

### Customer

1. An administrator invites an identified user to an existing organization.
   Account creation alone grants no retail-data access; no email-domain enrollment.
2. The user adds Memento Loop in their AI host. The host discovers the protected
   resource and opens the authorization flow.
3. The user signs in to Memento. Use the chosen provider's normal login and
   recovery methods. For a new identity system, prefer verified email-code login
   for the first pilot; add production social sign-in only when configured.
4. Memento shows the verified client, organization, requested access and data
   categories. With one eligible organization, show it without an unnecessary
   picker. With multiple organizations, require an explicit selection.
5. Approve or deny. The server records the application grant using the verified
   authorization transaction; it does not trust organization IDs in a return URL.
6. The host completes PKCE token exchange and calls the MCP. Context identifies the
   authorized organization, actual dates, publication and disclosure restrictions.
7. The account Connections page shows grants and offers disconnect. Revocation
   stops subsequent access; already returned chat content cannot be recalled.

The customer never sees storage paths, OAuth secrets, Neon credentials, cloud
project IDs, or runtime setup. Host administrators may have a one-time connector
approval step; document it separately from the individual user's sign-in.

### Operator

Create organizations and memberships, approve publication registrations, issue
invitations, inspect payload-safe access outcomes, and revoke access. For the pilot,
use narrowly scoped authenticated management commands rather than building a full
admin console. An ordinary viewer or AI tool cannot grant membership, economics
access, change publication approval, or invoke those management commands.

## Identity, consent and organization binding

Introduce provider-neutral contracts:

- `VerifiedIdentity`: exact issuer, stable subject, verified client, intended
  audience, issued/expiry time, and provider-supported grant reference.
- `AuthorizedContext`: application principal, organization, grant, permissions,
  policy version and registered worker identity.
- `PublicationContext`: authorized immutable publication and approved artifacts.

The token establishes identity, not tenant permission. Domain permissions such as
`signals.read` and `economics.read` live in application authorization records.
Do not require the prototype's `signal:read`/`economics:read` token scopes when the
chosen provider does not issue them; replace that policy with equally restrictive
verified grant/entitlement checks, not unconditional access.

An essential phase 0 proof is binding the selected organization to the specific
authorization grant. Verify a supported signed grant identifier or authoritative
provider grant lookup, plus its behavior on refresh and revocation. Do not assume
custom JWT claims or a browser session's mutable “active organization” can solve it.
Do not query undocumented managed-auth tables to infer grants or duplicate the
provider's refresh-token store.

**Provider acceptance gate:** an old token must never gain access to a different
organization because the same user signs into another conversation or reconnects.
Test simultaneous ChatGPT/Claude grants and multiple connections in one host.
If the provider lacks an enforceable grant binding, stop provider selection and
record the missing capability. Obtain a reviewed alternative or explicitly narrower
pilot contract; do not silently implement a shared `(user, client)` active-tenant
switch. Neon remains the application store regardless of identity choice.

Verify signatures with an operator-configured algorithm allowlist and trusted key
discovery; require issuer, audience membership, expiry, subject, client and resource
binding. Support key rotation with bounded JWKS refresh. No token-provided key URL,
arbitrary issuer fetching, algorithm inference from an unverified header, or ID
token substitution. Reject tokens from another environment, even if keys overlap.

Prefer supported CIMD for the known hosts, or exact pre-registered clients if a
host/provider requires them. Validate exact redirect URIs. Do not enable open DCR,
wildcard redirects, or skipped third-party consent to make onboarding work. The
authorization server owns PKCE, authorization-code replay protection and refresh
tokens; Memento does not mint replacement customer tokens. See
[OpenAI authentication](https://developers.openai.com/plugins/build/auth).

## Neon application schema

The following tables describe application state, separate from provider-managed
auth schemas. Final grant columns depend on phase 0's verified provider contract.

| Table | Minimum purpose and constraints |
| --- | --- |
| `principals` | Internal ID; unique `(issuer, subject)`; active/disabled state; never email as identity key |
| `organizations` | Stable ID and display name; active/suspended state; no storage credentials |
| `memberships` | Unique `(organization_id, principal_id)`; role; active/revoked state; authorization version |
| `membership_permissions` | Explicit `signals.read` / `economics.read`; economics is not implied by viewer access |
| `connection_grants` | Provider grant reference; principal; verified OAuth client/resource; one selected organization; approved permissions; status and revocation times |
| `publication_registrations` | Organization, publication ID, approved manifest digests, classification, effective availability and registration version; no raw source payload |
| `audit_events` | Request correlation, pseudonymous principal/grant, organization, operation, publication, decision, policy version, duration and safe error code |

Use uniqueness and composite foreign keys to reject grants/memberships/publications
that reference different organizations. Keep worker addresses and storage secrets in
operator-controlled runtime configuration/secret management, not user-editable rows.
Publication rows cannot approve themselves: activation needs the existing lineage,
ownership and manifest-integrity workflow plus operator authorization.

Use pooled application connections, bounded pool/query timeouts and a least-privilege
runtime role. Migration credentials are separate. All authorization queries include
explicit tenant and principal predicates. Consider RLS as defense in depth only when
its execution role and transaction-local tenant settings are independently tested;
do not claim a privileged connection is protected by RLS. Do not expose Neon directly
to browsers or put database credentials in the client.

Do not store customer OAuth bearer/refresh tokens in these tables. Provider-managed
identity/token tables remain provider-owned. Do not copy production auth records,
client secrets, or customer data into development branches; use clean synthetic
environments and verify branch-specific issuers, credentials and redirect settings.

## Request authorization and publication consistency

For every protected discovery/tool/evidence request:

1. Verify the access token under the selected provider contract.
2. Resolve the server-owned grant and selected organization.
3. Read current organization status, membership, grant status and permissions from
   Neon. Fail closed on missing, revoked, suspended or unavailable authorization.
4. Resolve the requested publication through that organization's approved registry.
5. Build the immutable authorization context and select only its configured worker.
6. The worker independently enforces ownership, approved manifest digests, canonical
   binding, classification, file/path safety and bounded queries.
7. Serialize only allowed fields; redact sensitive economics and restrict metric
   discovery consistently. Review inference through ranks/derived measures.
8. Emit a payload-safe audit event. Never log tokens, source rows or full results.

Do not positively cache authorization in the first pilot. Each request checks the
current policy, including when a token is otherwise valid. Revocation blocks the next
request after the database transaction commits; an operation already authorized may
finish within its bounded deadline. Customer disconnection also invokes the supported
provider grant/revocation flow. Document whether host-side disconnect alone notifies
Memento; do not promise immediate JWT invalidation merely from browser sign-out.

Return generic not-available results for unauthorized publication/signal identifiers.
Never reveal another tenant's existence or identifiers through errors or catalog data.
Bound concurrent operations and query time; apply deployment-wide and per-principal
rate limits before expensive work. Do not introduce Redis solely for a speculative
cache; use the chosen edge/host's supported limits for this pilot.

`get_business_context` resolves the latest approved publication for its organization
and returns its ID. Every subsequent queue/evidence/definition request uses an explicit
publication binding. Replace the current process-global single-publication closure
with a validated per-request publication resolver. An updated current pointer must
not change an ongoing investigation. On reconnect, a host can start a new investigation
with a new context. An unavailable pinned publication returns an explicit error.
Do not use one shared mutable conversation/session variable for organization or release.

Publish these changed hosted input/output semantics under a new MCP contract version
and test its schemas explicitly. Keep existing tool names, but do not silently change
the current tunnel's v1 signatures or single-publication behavior. The new hosted
synthetic mode remains synthetic-only through phase 5. Phase 6 adds separately
reviewed classification/registration policy; simply removing the prototype's
synthetic checks is not customer-data activation.

## Implementation packages and order

| Phase | Concrete work | Exit condition |
| --- | --- | --- |
| 0. Identity and grant compatibility | Inventory existing login; select proposed Neon project/environment without provisioning; inspect provider APIs; prepare synthetic identity proof; establish client/claim/grant contract | ChatGPT and Claude login, consent, code exchange, access, refresh, denial, grant binding and revocation are demonstrated in an approved staging setup; provider decision recorded |
| 1. Application authorization | Reviewed Neon migrations, least-privilege queries, principal/membership/grant services, publication registry and operator bootstrap | Two synthetic organizations and users; atomic grants; no cross-tenant authorization; no secrets/payloads in fixtures |
| 2. Customer account UI | Sign-in, signed authorization continuation, consent, organization selection, deny/error states, connection list/disconnect | Full browser flow including expired link, cancelled consent, no membership, lost membership, multiple organizations and reconnect |
| 3. Hosted MCP and readers | Provider-compatible verifier, protected-resource metadata, per-request Neon authorization, worker dispatcher and service auth, publication binding, consistent field policy | All five tools match existing results for authorized synthetic data; anonymous, forged, wrong-org and revoked requests fail |
| 4. Hosting and operational validation | Container/ingress configs, runtime secrets, health/readiness, limits, dependency audit, backup/restore and rollback exercise | Staging works with the developer Mac/tunnel off; two isolated synthetic workers; no ingress/auth bypass |
| 5. Real-host onboarding | Configure OAuth-backed ChatGPT and Claude connections with exact verified clients/redirects; run acceptance scripts | A nondeveloper tester connects both hosts without keys, Terminal or operator intervention beyond the initial invitation/admin approval |
| 6. One-customer activation | Review exact customer artifacts, permissions and disclosure rights; approve production configuration and release | Explicit data/production approval, customer reconciliation, rollback and kill-switch evidence |

Phase 0 is a bounded compatibility gate, not approval for a throwaway public auth
service or a production migration. Independent schema/interface drafts can proceed
before it closes; token/grant wiring cannot. Phases 1 and 2 can develop against the
agreed interface after phase 0; complete local/synthetic checks before requesting
approval for a concrete staging deployment. No parallel-agent work is implied.

## Expected code and documentation changes

Paths below are proposed responsibilities, not files created by this planning turn.

- `src/memento/mcp_security.py`: provider token verification separated from application
  authorization; retain the existing test adapter until its users migrate.
- New focused modules for authorization repository, grant resolution, publication
  registration and worker dispatch; no general plugin/query framework.
- `src/memento/mcp_server.py`: request-scoped context, explicit publication binding,
  permission-aware discovery/serialization; unchanged deterministic readers.
- A hosted CLI/ASGI entrypoint with no default unauthenticated/public mode. Preserve
  `mcp_cli.py` and `start-memento-loop.command` as synthetic developer tooling.
- `web/app` account routes and narrow auth client/server helpers. Use the provider's
  supported authorization continuation and consent APIs, not invented resume helpers.
- Reviewed Neon schema/migrations and safe synthetic bootstrap commands. Add one
  Python PostgreSQL driver only when this package is implemented; regenerate locks.
- New MCP container entrypoint and deployment templates. The existing Docker image
  starts the GET-only API, not the MCP transport; do not assume it already hosts MCP.
- `tests/` for token profiles, grant/membership/publication isolation, worker access,
  redaction and API parity; `web/tests/` for account/consent flows; a live-host checklist.
- Update architecture, classification, and runbooks with the chosen production
  boundary, provisioning manifest, restore/rollback instructions and actual evidence.

Avoid changing `security.py`'s Cloudflare customer boundary merely to make the new
adapter convenient. Extract narrow shared publication-policy interfaces if needed;
do not reuse a policy class with identity-specific assumptions through broad field
overrides. Preserve all unrelated work already present in the checkout.

## Acceptance matrix

| Area | Required evidence |
| --- | --- |
| Customer setup | Invite → sign-in → consent → connected first answer in both hosts; no client API key or local software |
| Identity security | Invalid signatures/algorithms, wrong issuer/audience/client/resource, expired/ID tokens, code replay, bad redirects and failed PKCE are rejected |
| Grant isolation | Two users/two orgs; same user in two orgs; two hosts and concurrent connections; changing/revoking one grant never switches another investigation's tenant |
| Immediate application revocation | Membership removal, org suspension and grant revocation deny subsequent requests even with an unexpired token |
| Refresh | Expiration and renewal succeed without changing identity/org/publication; denied/revoked refresh cannot restore application access |
| Publication safety | Guessed foreign IDs, unapproved/corrupt manifests, missing releases, traversal/symlinks, and pointer updates fail safely; no silent fallback |
| Economics | Permitted user sees approved economics; basic viewer sees neither restricted definitions nor financial fields through context, queue or evidence |
| Worker boundary | A worker cannot read another tenant's mount/credentials; forged/stale/wrong-audience internal calls and direct-origin bypasses fail |
| Failure modes | Neon/provider/worker outages fail closed with safe retry guidance; no stale authorized response; response and request limits hold |
| Operations | No-laptop access, key rotation, deployment rollback, tenant-specific restore and access kill switch tested on synthetic data |
| Regression | Existing deterministic metric/replay/lineage/security tests and affected frontend checks pass; MCP values reconcile with website readers |

The pilot is complete only after the actual ChatGPT and Claude interactions pass.
Unit tests, an SDK client, a live process, and successful token minting individually
do not establish end-to-end client onboarding.

## Rollout and rollback

Keep the current private synthetic tunnel operational until the hosted OAuth flow is
verified. Create a separately labeled staging connection first; do not replace a
working client endpoint or change the original plugin's authentication mid-test.
After acceptance, deliberately update/reconnect the intended Memento Loop clients;
OAuth grants cannot be assumed to survive a change of resource or issuer.

Build the production image and migration artifacts first. Review the exact tenant,
host, domain changes, provider settings, requested permissions, costs and data paths
before asking for deployment/migration approval. Use expand-compatible migrations
where practical; do not rely on destructive down migrations for rollback. Restore
the prior image/config/publication mapping and keep authorization fail-closed.

Independent customer-data approval is still required after synthetic acceptance.
Do not register arbitrary existing files, relabel customer extracts as synthetic,
clone customer auth/data into a preview, or expose a worker to bypass onboarding.
Record all unrun checks, provider limitations and release risks honestly.

## First implementation handoff

Start with phase 0: document the chosen identity's exact token/client/grant contract
and demonstrate the two real client authorization flows using synthetic identities.
The key decision is not just whether a provider can sign users in; it is whether
Memento can safely bind, refresh and revoke organization-specific client access.
Only then implement the Neon authorization schema and hosted request wiring.

Before infrastructure work, resolve the intended existing login, Neon project and
region, staging host/account/budget, account and MCP domains, and provider beta
acceptance. These are activation decisions, not permission to invent missing values.

## Primary references

- [Existing MCP plan](memento-signal-mcp.md) and [MCP runbook](../runbooks/mcp.md).
- [Existing customer security boundary](../architecture/customer-security.md) and
  [container-host proposal](craftmix-container-host.md).
- [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth).
- [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization).
- [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- [Neon OAuth Provider](https://neon.com/docs/auth/guides/plugins/oauth-provider) and
  [production checklist](https://neon.com/docs/auth/production-checklist).

Provider facts were checked on 2026-11-08. Package versions, provider availability,
host policies and configuration must be rechecked when implementation starts.
