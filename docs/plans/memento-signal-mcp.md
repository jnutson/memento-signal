# Memento Loop MCP delivery plan

Date: 2026-11-08. User authorized documenting and building the first read-only
release after reviewing the five capability groups. The subsequent instruction
approves Neon as the operational store. This does not authorize a production
deployment, customer-data access, or executing a retail intervention.

## Product outcome

Next milestone: [hosted authentication pilot implementation plan](memento-loop-hosted-auth-pilot.md).
It specifies customer OAuth onboarding, Neon application authorization, isolated
tenant serving, and the gates before customer-data activation.

Authenticated Claude and ChatGPT users discover the permitted retail model,
retrieve reproducible findings, and inspect evidence. Memento owns deterministic
calculations and authorization. The assistant chooses investigations, explains
results, and distinguishes evidence from hypotheses. Tool descriptions and client
instructions assist interpretation; server code enforces permissions.

## Architecture and storage decision

```text
Claude / ChatGPT / MCP client
  -> HTTPS MCP resource server and external OAuth authorization server
  -> per-request identity, membership, client, scope, and publication authorization
  -> typed analyst tools
  -> shared validated signal readers used by the existing website
  -> approved immutable publications / DuckDB over Parquet

Future operational state -> Neon-managed PostgreSQL
```

Neon is the approved operational store for future decisions, interventions,
approvals, idempotency records, and outcome measurements. This is an explicit
exception to the prior Docker-only operational-database boundary for this work.
Do not introduce SQLite, a local persistent DuckDB database, or another store.
The first release needs no operational writes and therefore provisions no Neon
project, runs no migration, and adds no speculative database dependency.
Before adding persistence, select the Neon project/region, use an isolated
development branch with synthetic records, review migrations, and establish
tenant authorization, pooled application access, retention, and recovery.
Neon is not approval to change the analytics engine or adopt Neon Auth.

The current implementation reuses the website's typed response models and the
`read_monday_report`, `read_signal_queue`, and `read_signal_detail` functions in
`src/memento/api.py`. There is no second metric or ranking implementation.

## Capability groups and milestones

| Milestone | Capabilities | Completion gate |
| --- | --- | --- |
| 1: synthetic read-only release | Discovery and evidence investigation | Five tools work through MCP; website parity, stdio protocol, OAuth HTTP boundary, revocation, isolation, and input/output bounds verified |
| 2: production security and one-customer pilot | Same read-only tools on approved customer publications | Identity provider and host interoperability, customer entitlements, hosting, encryption, disclosure policy, retention/recovery, monitoring, incident response, and customer-data approval |
| 3: specialized investigation | `investigate_stockout`, forecast audits, distribution analysis | Each investigation has a reviewed input/evidence contract; unsupported causes remain hypotheses |
| 4: simulation | Promotion comparisons, demand scenarios, replenishment option evaluation | Versioned equations, mechanics, baseline, economics, supply constraints, explicit assumptions and sensitivities; reproducibility and validation |
| 5: actions and outcomes | `record_decision`, `create_intervention`, `measure_outcome` | Approved Neon schema and migrations, separate write scopes, approval binding, idempotency, auditability, measurement methodology |
| Later: advanced analysis | Governed metric queries and compatible period comparisons | Allowlisted dimensions/metrics/filters, grain-safe joins, retailer-calendar rules, bounded execution |

General SQL and additional retailer integrations are lower priorities. Do not
advertise unimplemented tools. Optimization requires a defined objective,
constraints, and method; until then use replenishment-option evaluation.

## First-release tool contract

| Tool | Behavior |
| --- | --- |
| `get_business_context` | Pinned publication, existing report, actual observation/projection periods, semantic entities/grains, freshness limitations, supported capabilities |
| `list_metrics` | Caller-permitted definitions for six published signal fields; this is not the full canonical metric catalog |
| `get_metric_definition` | Metric meaning, grain, units, dimensions, aggregation limits, missing-value semantics, contract reference |
| `get_attention_queue` | Overall top ten or first ten in a category, with full selection count, truncation flag, and original overall ranks |
| `get_signal_evidence` | Existing validated signal detail/evidence and safe lineage, with optional published supply assumptions |

All tools return structured output with MCP contract version, publication ID,
metric/ranker versions, configuration hash, synthetic classification, limitations,
redacted-field disclosure, and data. Queue/evidence calls require the publication
ID discovered in context. One publication is fixed at process startup; a changed
current pointer cannot change a conversation's result. A new publication requires
a deliberate server restart. Missing/corrupt releases fail without fallback.

The catalog documents published outputs rather than recomputing formulas. The
metric contract and executable metric engine remain authoritative. No confidence
score becomes a probability; no opportunity becomes guaranteed savings; no
heterogeneous economic measures are summed. Data-derived text is untrusted data.

## Security and resource boundaries implemented in milestone 1

- Local unauthenticated development is stdio and synthetic-only. HTTP requires an
  explicit OAuth policy and remains loopback-bound behind a future HTTPS ingress.
- HTTP uses Streamable HTTP, public protected-resource discovery, and SDK bearer
  authentication. An external authorization server owns sign-in, consent,
  authorization-code/PKCE, refresh, and client registration.
- Verify RS256 signatures using an operator-pinned JWKS URL, exact issuer and
  audience, expiry/issued-at, subject membership, allowlisted OAuth client ID,
  and `signal:read`. Never forward access tokens to other services.
- Reload the operator policy per request/tool for member/client revocation.
  Issuer, audience, key endpoint, or tenant changes require restart.
- Manifest hash approvals, tenant ownership, canonical binding, and file integrity
  reuse the existing serving controls. The first MCP release explicitly rejects
  non-synthetic classifications, including in OAuth mode.
- `economics:read` controls contribution and cost-valued fields and their discovery.
  Without it these fields are null and explicitly listed as redacted. This is not
  a full information-flow proof: customer launch requires reviewing inferential
  disclosure through ranks and other outputs as well as retailer disclosure rights.
- Existing bounded DuckDB connections enforce memory, execution time, filesystem
  allowances, disabled external access, and locked configuration. MCP adds bounded
  requests/results and process-level rate/concurrency limits. Deployment-wide edge
  controls remain a production prerequisite.
- No raw sources, costs per unit, evaluator truth, secrets, or machine paths are
  exposed. Logs contain controlled tool names, hashed principals, publication IDs,
  outcome, and duration, not request/response payloads or tokens.

## Later simulation and decision contracts

Promotion scenarios must distinguish consumer discount from manufacturer funding,
eligible pairs/baskets, redemption, baseline demand, assumed lift and cannibalization,
inventory/supply constraints, unit economics, trade spend, and sensitivities. Compare
scenarios against the same publication and baseline. A deterministic engine can
evaluate declared uncertainty ranges without claiming their probabilities are known.

Decision records bind the selected scenario and alternatives to publication/model
versions, assumptions, expected outcomes, approver, approval time, execution intent,
and measurement window. Recording approval is separate from executing a promotion
or order. Actual-versus-forecast difference alone does not establish causal impact.

## Sources studied

- [Drivepoint trial experience, pinned commit](https://github.com/Bainbridge-Growth/drivepoint-plugins/blob/61d54a9e08cd90fd2341ba9ed226a3305811fecb/trial/welcome.md): onboarding and analyst experience; not evidence of backend enforcement.
- [MotherDuck MCP](https://github.com/motherduckdb/mcp-server-motherduck): structured execution/discovery and warnings about read-only filesystem access.
- [dbt MCP](https://github.com/dbt-labs/dbt-mcp): semantic discovery, governed metrics, lineage and freshness.
- [Official MCP Python SDK](https://py.sdk.modelcontextprotocol.io/): pinned SDK transport, typed tools and resource-server support.
- [OpenAI authentication](https://developers.openai.com/plugins/build/auth) and [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization): discovery, resource/audience binding, PKCE and client interoperability.
- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): remote connection and individual authorization.

Product contracts and implementation are original to Memento; examples inform
general design patterns. There is no copied onboarding script or artifact template.

## Verification and rollout

See `docs/runbooks/mcp.md` for installation, local use, OAuth policy, host setup,
and remaining deployment gates. Tests generate minimized synthetic fixtures and
ephemeral signing keys. No customer extracts or credentials are fixtures.
Record actual verification results and unrun client/deployment checks at delivery.

### First-release verification record — 2026-11-08

- Full Python test suite: passed, including the new MCP tests and existing demo,
  security, ingestion, deterministic metric, and publication checks.
- Python typechecking: passed with the four new MCP modules included.
- Source-control security boundary check: passed.
- Installed dependency consistency (`pip check`): passed.
- Diff whitespace/error check (`git diff --check`): passed.
- Verified MCP discovery/calls through the official SDK, subprocess stdio,
  authenticated HTTP, supported legacy HTTP handshakes, safe argument rejection,
  publication pinning/integrity, tenant isolation, revocation, and economics scopes.
- Not run: frontend/browser suites, live ChatGPT/Claude authorization/refresh flows,
  public HTTPS/ingress tests, production load tests, or dependency vulnerability audit.
  No frontend files were changed for this milestone; Python website API parity is
  covered. No deployment, customer-data operation, or Neon provisioning was performed.

The checkout contained substantial pre-existing changes. Those were preserved;
this milestone adds the MCP modules/tests/docs, extracts shared signal readers,
and updates dependency declarations/locks and the README entry point.

### Naming and desktop setup — 2026-11-08

The user named the MCP **Memento Loop** and requested ChatGPT testing setup.
The local desktop plugin `memento-loop@memento-loop-local` is installed and
enabled using the supported desktop CLI. Its installed MCP command was verified
for name, five-tool discovery, context, queue, and evidence against the synthetic
publication. See the runbook for launching it in a new Work/Codex chat. Remote
ChatGPT web connection remains pending a private tunnel/workspace runtime
credential or an approved hosted OAuth endpoint; no public exposure was added.

The user subsequently selected web and desktop testing and explicitly approved
the prepared private tunnel creation. Platform confirmed creation and workspace
association. The official checksum-verified tunnel client and a stdio profile are
prepared locally. The remaining gate was user creation/local entry of a restricted
runtime key, followed by healthy polling, ChatGPT connector creation, and an actual
ChatGPT tool call. These gates were completed on 2026-11-08: the managed runtime
reported running, healthy and ready; ChatGPT discovered all five tools; and its
web analysis called context, availability queue, and signal evidence successfully.
The same calls also passed through the Memento Loop connector in this chat. See
the runbook for the connected plugin and verification chat. Runtime availability
still depends on this Mac and the local managed process; this is synthetic
testing, not a production hosting or customer-data approval.
