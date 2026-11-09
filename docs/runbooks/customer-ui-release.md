# Customer UI release runbook

## Local review

Worktree: `/Users/jnutson/Documents/memento-signal-secure-ui`.
Branch: `codex/customer-ui-security`.

Run `make setup`, then `make verify-ci`. Browser suites must run sequentially;
they share Next's build directory. `make test-e2e-security` creates temporary
synthetic tenant roots, keys and an HTTPS fixture, runs `/craftmix` through the
real proxy/API/DuckDB path, and removes its temporary material. It does not contact
Cloudflare or activate customer access. Build the source-only API image with
`docker build -f deploy/Dockerfile -t memento-customer-ui-api:local .`.

## Required release approvals

Before any externally visible or paid action, confirm the container provider,
account, region and budget; Vercel project/domain routing; Cloudflare Access
application/issuer/audience and stable user subjects; customer ownership and data
classification; permitted disclosure of original evidence fields; and operating
owners for alerts, backups, restore tests, retention and incident response.
No provider purchase or production activation has been performed by this change.

Start staging with synthetic data and separate credentials. Do not copy customer
files into a preview deployment, build context or test fixture. A confidential
publication requires an explicitly approved data operation and tenant-owned root.
Never mutate an existing extract to satisfy publication checks.

## Prepare an inactive policy

Use `python -m tools.approve_metric_publication --help`. Supply the exact dedicated
data root, immutable `met_…` release ID, tenant ID, Access issuer/audience,
classification and a private members JSON file. Member entries map verified subject
IDs to `viewer`. Write the result with `--output` to an absolute private control
location outside the serving root and source control. The tool validates artifact
integrity, tenant ownership, classification and canonical linkage and refuses to
overwrite a policy. It does not activate access.

Provide only the approved `metrics/<release>/` artifacts and linked
`canonical/<dataset>/manifest.json` in the serving mount, preserving relative paths.
Verify filesystem ownership/permissions allow UID 10001 to read them and the
policy, while preventing application writes. Keep all raw data outside that mount.

## Configure reviewed staging

Backend configuration:

```text
MEMENTO_SERVING_MODE=cloudflare
MEMENTO_SECURITY_POLICY=/run/memento/policy.json
MEMENTO_DATA_ROOT=/srv/memento
```

Use `deploy/compose.example.yaml` as the hardening baseline, with a reviewed image
digest and dedicated customer mounts. Mount the control directory rather than an
individual policy inode so atomic replacements are visible. Only `/livez` is a
public, content-free liveness endpoint. The API port binds to loopback; configure
the approved gateway/tunnel with HTTPS and issuer-scoped outbound JWKS access.

Frontend build configuration:

```text
MEMENTO_SERVING_MODE=cloudflare
MEMENTO_CUSTOMER_PATH=/craftmix
MEMENTO_API_ORIGIN=https://REVIEWED_API_HOST
MEMENTO_DEMO_BUNDLE=0
```

The upstream is server-only. Do not put secrets or upstream assertions in public
environment variables. Configure the live Access protection for dashboard pages
and assets as well as the API. Verify the signed assertion survives the Next proxy
and is valid for the API's pinned audience. Test login, expiry, logout, membership
revocation, wrong-customer URLs, artifact rejection and absence of cache reuse in
an actual staged browser session. Do not disable token verification to fix routing.

## Activation and rollback

After reviewed synthetic staging acceptance, separately approve customer-data
activation and production deployment. Record the image digest, publication ID,
manifest hashes, policy version, approved members and verification evidence in a
private operator record. Do not place memberships or customer payloads in Git.

Revoke membership by atomically replacing the policy with a reviewed policy that
removes the subject. For a full kill switch, stop the API or withdraw gateway
access; malformed/missing policies deny protected requests. Confirm an already-open
browser fails its next request. Roll back using the previous reviewed image and
approved publication/policy together; never broaden authorization to restore service.
