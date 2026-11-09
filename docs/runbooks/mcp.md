# Memento Loop MCP

This release provides five read-only tools on a frozen synthetic publication.
It uses the official Python MCP SDK, supports stdio and authenticated Streamable
HTTP. It uses shared Signal response contracts and validators through a dedicated
synthetic reader. The Craftmix dashboard keeps its newer metric-serving API and
customer authorization boundary; MCP does not add routes to that API.

After the November 9 merge reconciliation, local demo HTTP tests use
`memento.synthetic_api`, which accepts loopback clients and synthetic publications
only. `memento.api` remains the default-disabled customer application. MCP HTTP
still requires its separate OAuth policy; the test harness is not its ingress.
Production customer-data serving is deliberately not enabled.

See [the staged plan](../plans/memento-signal-mcp.md) for capability groups,
acceptance gates, and the approved Neon operational-store boundary.

## Install and run locally

Use the existing Python 3.11+ virtual environment. To update Python dependencies
without reinstalling the frontend:

```sh
.venv/bin/python -m pip install --require-hashes -r requirements.lock
.venv/bin/python -m pip install --no-deps -e .
make demo-prepare
.venv/bin/python -m memento.mcp_cli --data-root data/demo
```

The last command speaks MCP on stdin/stdout; it is not an interactive shell.
Logs go to stderr. It opens only the explicitly selected data root and requires
synthetic classification. It does not read external extracts or invoke producers.
`demo-prepare` separately generates the repository's existing artificial fixture.
Use `--publication-id mss_<64-hex-digest>` to pin a specific publication; otherwise
startup resolves the current pointer once and pins that publication.

For a local stdio-capable MCP client, configure the absolute Python executable
and absolute data root. For example, replacing both placeholders:

```json
{
  "mcpServers": {
    "memento-loop": {
      "command": "/absolute/project/.venv/bin/python",
      "args": ["-m", "memento.mcp_cli", "--data-root", "/absolute/project/data/demo"]
    }
  }
}
```

This local configuration is separate from remote connectors in ChatGPT and Claude.

## Installed local ChatGPT desktop plugin

The MCP display name is **Memento Loop**. On 2026-11-08 its local plugin was
registered and installed with the desktop client's supported CLI:

```sh
.venv/bin/python -m tools.setup_mcp_plugin --install
codex plugin list --marketplace memento-loop-local --json
```

The plugin ID is `memento-loop@memento-loop-local`, display name `Memento Loop`.
The CLI reports it installed and enabled. The installer produces an inspected
local package under ignored `data/mcp/`, with absolute executable/repository
paths for this Mac and a pinned, preflight-validated synthetic publication.
No data extracts or credentials are packaged. Re-run after moving the repository,
changing the selected synthetic publication, or updating plugin package metadata.

Open a new chat in ChatGPT desktop Work/Codex mode and select **Memento Loop**
from **Memento Loop Local** in the plugin directory. If the current app session
has not refreshed its plugins, reload/restart it when convenient. The agent did
not restart the app or interrupt existing chats. Test with:

> Use Memento Loop to show the synthetic stockout-risk queue and explain the
> evidence behind the leading signal. State the publication's dates and limitations.

The installed package's actual stdio command was verified with an official MCP
client: server name, discovery of all five tools, business context, attention
queue, and signal evidence passed. A tool call from the ChatGPT UI itself has
not been verified. This is a local desktop installation, not a web/mobile or
account-wide remote connection. It launches the local process on demand.

For ChatGPT web, [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
connects this existing stdio command without a public server. On 2026-11-08 the
user approved creation of the private **Memento Loop** tunnel in the signed-in
Personal organization, associated with the selected ChatGPT workspace. Exact
account/tunnel metadata stays in ignored `data/mcp/tunnel-connection.json`.
The official `tunnel-client` v0.0.20 was downloaded from OpenAI's release and its
archive SHA-256 verified. A stdio profile is prepared under `data/mcp/profiles/`.

The initial `doctor --explain` passed configuration/profile checks and failed
because `CONTROL_PLANE_API_KEY` was unset. The user subsequently created and
entered the credential locally. The runtime is now running, healthy and ready,
and the web connector has been verified end to end. The saved key's UI confirms
Tunnels Read + Use with all other endpoint permissions unset. The form was
prepared with a 30-day expiration; the user's created key is listed as Never,
so do not assume it expires automatically. No literal secret was stored in
source, this runbook, the package, or model context.

From the repository directory, start the managed runtime with the exact tunnel ID:

```sh
.venv/bin/python -m tools.run_mcp_tunnel --tunnel-id tunnel_<actual-id>
```

Or run `start-memento-loop.command` using its absolute path from any directory.
It sets the correct working directory and uses the saved tunnel connection, so
neither a preceding `cd` nor copying a tunnel ID is required. It can also be
opened in Finder. The earlier `python -m tools.run_mcp_tunnel` command depended
on being in the project folder and fails elsewhere with `No module named tools`.

The helper uses a hidden terminal prompt when `CONTROL_PLANE_API_KEY` is not
already supplied by the environment. It rejects noninteractive secret entry,
preflights the synthetic publication, calls `tunnel-client runtimes connect`, and
checks `runtimes status`. The profile contains only `env:CONTROL_PLANE_API_KEY`.
The runtime inherits the credential; the helper writes it to no file and prints
no credential. After stopping/restarting the runtime, provide the key again.
Do not use an admin key or a broadly privileged model API key for the runtime.

Before claiming web setup complete, require managed status to report the process
running, healthy and ready. The connected [Memento Loop MCP](https://chatgpt.com/plugins/plugin_asdk_app_6af15e24e23c819192cbd0aeb671f509)
was created through ChatGPT's Add custom MCP server flow with Connection **Tunnel**.
This stdio synthetic test server relies on the private tunnel/workspace boundary
and needs no separate server OAuth login. This does not change or bypass the
OAuth-only public HTTP interface.

On 2026-11-08, ChatGPT web discovered all five tools, showed “Memento Loop is now
connected,” and successfully called `get_business_context`, `get_attention_queue`
for availability, and `get_signal_evidence`. Application audit records confirm
all three returned `outcome=ok`. The [verification chat](https://chatgpt.com/c/6af15e56-dcb4-83e8-bd6d-3f405220579d)
returned a synthetic availability report with the publication's actual periods
and limitations. All three calls were also verified through the newly available
Memento Loop connector tools in this chat. In a new web chat, type `@Memento`
and select **Memento Loop**.

The earlier uploaded development archive is labeled **Memento Loop Development**
and remains a separate private source package. Use the connected MCP above for
web testing. The local desktop plugin remains available independently.

Managed process mode can report `tmux.running=false` while `process_running`,
`healthy`, and `ready` are true. That is normal: tmux is not the supervisor in
this mode. The launcher now prints only the three relevant health flags and a
short readiness message instead of dumping the entire diagnostic JSON.

This is on-demand local testing: the Mac, managed tunnel process, and network must
remain available for ChatGPT web calls. For always-available access, a separately
approved hosted service is still needed. Stop the managed runtime when testing
is over; inspect `tunnel-client runtimes --help` for the supported lifecycle commands.
Keep credentials out of chat, package files, command arguments, and logs. Never
expose the unauthenticated local stdio interface through public HTTP.

## Tool workflow

1. Call `get_business_context` and retain its `publication_id`. Explain the actual
   observation/projection periods and synthetic classification to the user.
2. Use `list_metrics` and `get_metric_definition` for meanings and aggregation
   restrictions. This catalog covers published signal fields, not arbitrary sales
   queries or every canonical metric.
3. Call `get_attention_queue` with that publication ID. Optional `signal_type` is
   `availability`, `demand_momentum`, or `inventory_imbalance`. Optional direction
   is `acceleration`/`deceleration` and requires `demand_momentum`.
4. Use `get_signal_evidence` with a returned signal ID and the same publication.
5. Explain the published finding and limits. Do not claim causality, calibrated
   probabilities, executed actions, or guaranteed savings.

Overall/category selections return at most ten signals, a complete selection
count, and a truncation flag. There is no pagination or export in this release.
Ranks are original published overall ranks; category filtering never reranks.

## OAuth HTTP configuration

HTTP requires a separate operator-owned policy. Keep actual policies under ignored
`data/` or external runtime configuration. Do not commit membership lists or tokens.
The policy uses existing manifest approval checks with a pinned OAuth issuer and
key endpoint instead of assuming a Cloudflare browser assertion is an MCP token.

The following is illustrative, not a ready-to-use policy. Replace the manifest
entries with the exact selected synthetic signal/canonical manifest paths and
SHA-256 digests, and use the actual tenant recorded by both manifests:

```json
{
  "version": 1,
  "tenant_id": "synthetic-tenant",
  "classification": "synthetic",
  "issuer": "https://identity.example.com",
  "audience": "https://signal.example.com/mcp",
  "jwks_url": "https://identity.example.com/.well-known/jwks.json",
  "clients": ["registered-client-id"],
  "members": {"immutable-user-subject": "viewer"},
  "manifests": {
    "signals/mss_<digest>/manifest.json": "<manifest-sha256>",
    "canonical/mcd_<digest>/manifest.json": "<manifest-sha256>"
  }
}
```

The placeholder canonical prefix must be replaced with the publication's actual
`canonical_dataset_id`. The current local demo's publications may be unowned;
OAuth mode requires an explicitly tenant-owned synthetic publication prepared
through the existing ownership/approval workflow. Never relabel customer data
as synthetic to satisfy this gate.

```sh
.venv/bin/python -m memento.mcp_cli \
  --data-root data/declared-synthetic-tenant \
  --transport http --policy data/operator/mcp-policy.json --port 8001
```

The service binds to `127.0.0.1`. A separately approved HTTPS ingress must preserve
the public Host header and expose `/mcp` and the advertised protected-resource
metadata URL. The SDK serves path-specific discovery at
`/.well-known/oauth-protected-resource/mcp` when the resource is `/mcp`.
Unauthenticated requests receive a Bearer challenge with its metadata URL.

The external authorization server must implement:

- Exact issuer/discovery metadata; authorization-code flow with PKCE S256.
- Exact registered redirect URIs and a registration mechanism supported by each
  client, such as published client metadata or predefined client registration.
- Resource/audience binding for the configured canonical MCP resource URL.
- RS256 access tokens with `iss`, `aud`, `sub`, `iat`, `exp`, `client_id`, and
  a space-delimited `scope` claim. This release intentionally uses this token
  profile; providers using other client/scope claims need an explicitly reviewed
  adapter rather than relaxing verification.
- `signal:read`; optionally `economics:read` for contribution and cost-valued
  metrics. Scopes are grants from the authorization server, never user arguments.
- User consent, refresh/revocation policy, and client-specific access restrictions.

The MCP server is a resource server, not an authorization server. It does not
provide login/consent pages, register remote clients, or issue/refresh tokens.
The service checks user/client membership at every request and again at tool
execution. Removing membership or a client takes effect without restart.
Changing issuer, audience, JWKS endpoint, or tenant requires restart.
Signed tokens otherwise remain valid until expiry; user disconnect does not
implement immediate per-token revocation here. Use short-lived access tokens and
review authorization-server revocation requirements before production.

Without `economics:read`, contribution, carrying cost, inventory capital, and
estimated cost fields are null and listed in `redacted_fields`. Their metric
definitions are unavailable to that caller. Local synthetic stdio includes them.
This field gate is not proof that every inference about costs is impossible.

## Connecting real hosts

After HTTPS and the authorization server are configured and approved:

1. Add the public MCP endpoint to the intended ChatGPT and Claude environments;
   confirm account/workspace administrator permissions.
2. Configure each client's actual published identity or registered client ID and
   exact redirect URI at the authorization server. Allowlist that client ID in
   the operator policy. Do not copy a callback URI from an old example.
3. Sign in as an authorized synthetic tenant member. Verify consent, discovery,
   all five tools, economics scope behavior, token refresh, and reconnect.
4. Remove membership/client approval and verify access stops. Confirm incorrect
   audiences, unknown users, and other tenant publications cannot be accessed.
5. Verify an answer's queue/evidence against the website on the exact publication.

Do not put an interactive browser-only access challenge in front of `/mcp` or
public OAuth discovery; remote hosts need protocol responses. Keep existing
website access controls intact. Any ingress/access-control change requires its
own review and authorization.

## Limits and operations

- HTTP body: 16 KiB; structured tool result: 256 KB.
- Four concurrent HTTP requests and four tool executions per process.
- 300 HTTP requests and 300 tool executions per minute per process.
- Bounded existing DuckDB queries: 256 MB, one thread, ten-second query deadline,
  no external access, and only approved local data directories.
- No shared mutable customer sessions, caches, arbitrary SQL, ingestion, or writes.
- Private/no-store responses and payload-safe application audit records.

Limits are process-level backstops, not deployment-wide quotas or fairness.
Before public hosting, require edge body/time/rate limits, TLS, restricted origin
access, a deployment-wide concurrency budget, monitored errors, recovery/rollback,
reviewed audit retention, and dependency vulnerability checks.
Read-only tool annotations communicate behavior; they do not enforce permissions.

## Verification

```sh
.venv/bin/python -m pytest tests/test_mcp.py tests/test_demo.py tests/test_security.py
make python-typecheck
make security-source
```

`tests/test_mcp.py` exercises actual SDK discovery/calls in memory, a subprocess
stdio handshake, OAuth HTTP discovery/tool calls, token failures, membership
revocation, tenant-bound publication rejection, economics redaction, request
bounds, safe validation errors, and publication pinning. All records and signing
keys are generated synthetic fixtures.

These tests do not establish live ChatGPT/Claude OAuth interoperability, production
load capacity, customer-data approval, or a deployed service. Those are explicit
rollout gates. Neon provisioning, schemas, migrations, and decision writes belong
to the later approved persistence milestone.
