# Customer dashboard release and operations

Target: Vercel dashboard at `https://memento-loop.co/craftmix`.
Nothing in this runbook grants permission to change production or process customer
files. Follow `AGENTS.md` and obtain approval for the concrete release and exact data
locations. No production configuration was changed by the local implementation.

## Before activation

Record the security owner, incident contact, data owner, processing permission,
classification, exact input/output locations, permitted dashboard fields, retention,
backup recovery objectives, and deletion obligations. Unassigned values block launch.
The user selected the provided private container runtime, with Vercel hosting the
dashboard. Confirm the specific provider/account and approved resource budget using
[the host proposal](../plans/craftmix-container-host.md).

Enable phishing-resistant MFA on developer email, GitHub, Vercel, Cloudflare, identity,
and API-host administration. Remove shared accounts; limit administrator membership.
Protect the release branch and require CI success. Review scoped build/deployment
credentials. Preview/development environments must have synthetic data and separate
credentials, with no production storage access.

Review the complete source/build inventory without opening customer records in model
context. Verify that customer files are not tracked or present in previous artifacts,
logs, issue attachments, or Git history. The local source guard does not certify
history or previously published builds. If exposure is found, restrict access, rotate
exposed credentials, preserve incident evidence, and involve the designated owner
before any history rewrite or deletion.

## Prepare a customer serving release

1. Obtain approval for the precise customer-data processing operation and paths.
2. Register source ownership explicitly. Use a new dedicated output root with the
   customer's `--tenant-id`; do not relabel or move existing extracts implicitly.
3. Run existing validation/canonicalization/metrics with the approved classification.
   Preserve original extracts. Inspect safe summaries, not source rows in logs/chat.
4. Review tenant-tagged manifests, lineage, result contracts, and permitted fields.
5. Prepare a curated serving root with only the approved canonical and signal artifacts.
   This is a data-copy operation requiring approval. Keep raw inputs, quarantines,
   backups, credentials, and local developer files outside that mount.
6. Create a separate operator-owned policy using `tools.approve_publication` with the
   explicit root, publication ID, tenant, identity issuer/audience, classification,
   and a protected file of immutable member subject IDs. Policy examples have no
   members and invalid placeholder hashes, so they cannot grant accidental access.
7. Review the new policy before activating it. Policy and serving trees must not be
   writable by the serving identity. Membership removal uses an atomic policy-file
   replacement in the host control directory, not an in-place partially written file.

Source data, policies containing membership, and approved outputs are not committed.
Do not put credentials or policy contents in command arguments or `NEXT_PUBLIC_*`.

## Vercel frontend

Use a separate project for this customer, built from this repository's `web` directory.
Build-time configuration:

```text
MEMENTO_CUSTOMER_PATH=/craftmix
MEMENTO_SERVING_MODE=cloudflare
MEMENTO_API_ORIGIN=https://REVIEWED_PROTECTED_API_ORIGIN
MEMENTO_DEMO_BUNDLE=0
```

`basePath` is compiled into client assets; changing the path requires rebuilding.
The path, page redirects, native forms, and API fetch URLs are covered by the browser
test. The project must not include `.demo`, `data`, customer datasets, or policy files.

The Vercel domain lookup during implementation returned an association for
`os.memento-loop.co`, not an apex dashboard mapping. Verify ownership and existing
apex routing before attaching `memento-loop.co`. If an existing project owns the apex,
review a narrowly scoped `/craftmix` and `/craftmix/:path*` routing change there;
preserve the customer prefix and all asset/API paths. Never repoint the apex or alter
other applications as an incidental step. Live routing has not been verified.

Vercel previews and alternate `vercel.app` URLs must enforce the same identity boundary
or be unavailable to customer traffic. Customer responses must never be placed in
shared caches. Do not assume platform sign-in grants customer permissions.

## Protected API and identity gateway

The provided `deploy/Dockerfile` and `deploy/compose.example.yaml` are for a separate
container host. They are not a Vercel Functions deployment. Mount the dedicated
serving tree and policy read-only; bind the API on loopback behind the trusted gateway.
No storage or hosting resources are provisioned by these files.
Mount the policy's control directory rather than the individual file so an atomic
host-side `policy.json` replacement is visible inside the container immediately.
Provision narrow read access for runtime UID/GID 10001 without giving that identity
host-side write permission. Developer-owned private batch roots are not automatically
readable by that UID; review the serving copy and its permissions explicitly.

Configure the managed identity gateway for every dashboard/API hostname and customer
path, including previews/alternate names. Use invite-only membership and enforce MFA.
Configure issuer/audience consistently between the gateway and the Python policy.
If the Next.js proxy crosses a second Access-protected hostname, verify that the
upstream application accepts the forwarded session for the intended audience. Do not
solve a mismatch by bypassing API authentication or embedding shared user credentials.
The local test verifies header forwarding, not Cloudflare's live edge session behavior.

Restrict direct-origin ingress. Allow outbound traffic only for explicitly needed
identity/JWKS endpoints and required infrastructure; DuckDB itself needs no network.
Configure HTTPS, request/body/rate limits, cache bypass, and log access/retention.
Per-process limits are backstops; deployment limits must cover all instances.

## Verification and promotion

Run `make verify-ci` with synthetic fixtures and audit both lockfiles and browser
runtime dependencies. `make test-e2e-security` creates temporary synthetic records,
RSA/TLS keys, and policies; credentials and customer records are not persisted in
browser traces. The fixture replaces JWKS discovery locally and never changes the
production verifier.

Before an approved production promotion, verify a protected staging deployment with
two synthetic customers. Test direct and alternate origins, anonymous/wrong-customer
requests, current/revoked membership, publication selection, cache behavior, oversized
requests, valid reports and evidence, platform log redaction, and rollback. Commission
an independent review of the actual deployed boundaries before broader customer use.
Synthetic screenshot/trace defaults must not be reused for customer sessions.

Promote only the reviewed build after approval. This implementation adds no automatic
deployment workflow and does not weaken existing Vercel sign-in protection.

## Operations, recovery, and deletion

- **Revoke access:** atomically remove the subject from the policy; its next request
  must fail. Disable the gateway application or stop the API for a customer-wide
  kill switch. Test this before launch. Never promise to erase data already received.
- **Patch:** review dependency advisories and update both hash-locked Python files,
  npm lock, and base-image digest as applicable. Run verification before promotion.
- **Backup:** encrypt and access-restrict declared inputs, immutable releases, and
  control metadata; keep backup access separate from serving credentials. Record
  recovery-point/time objectives and test a tenant-specific restore into an isolated
  environment. Do not restore another tenant's ownership marker or memberships.
- **Delete/offboard:** revoke identity first; inventory raw/canonical/derived data,
  exports, temporary files, replicas, and backups. Follow approved retention/expiry
  and legal holds. Verify deletion or scheduled backup expiry and record safe evidence.
  Deletion is a separately approved operation; no automatic customer deletion exists.
- **Incident:** restrict affected access; preserve safe audit metadata and evidence;
  identify affected tenants and time range; rotate implicated credentials; coordinate
  customer/provider notifications with the designated owner and applicable agreements;
  verify remediation and recovery before restoring service. Test this as a tabletop.

Account MFA, branch rules, log collection, retention, backups, restore, notification
contacts, and production policy settings require operator evidence; documentation
alone does not establish these controls.
