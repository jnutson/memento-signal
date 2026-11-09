# Craftmix container host

Architecture accepted by the user on 2026-11-08: Vercel dashboard plus a separate
private Python/DuckDB container host. Provider and spending below are proposals;
no resources have been created and no customer files have been processed.

## Proposed initial resources

- Provider: DigitalOcean, one Basic Regular Linux Droplet dedicated to Craftmix.
- Capacity: 2 shared vCPUs, 4 GiB RAM, 80 GiB local SSD. This is an initial serving
  configuration, not a capacity guarantee for full-scale ingestion or analytics.
- Price: listed at $24/month; basic daily backups add 30% ($7.20), for a base total
  of $31.20/month before tax, additional services, and overages. Pricing checked
  2026-11-08. Reconfirm the checkout estimate before creation.
- Region: choose near the Vercel function region after confirming the new dashboard
  project configuration. Do not choose from the developer's physical location alone.
- Runtime: existing `deploy/Dockerfile`, deployed by immutable image digest using
  `deploy/compose.example.yaml`. The server is a VM running Docker, not a fully
  managed container PaaS. Memento owns guest-OS patching and Docker maintenance.
- No new database, Kubernetes cluster, or shared customer filesystem.

This host type supports the Docker controls already implemented: nonroot API,
read-only root/data mounts, restricted capabilities, resource limits, and a separately
mounted read-only policy directory. Managed container platforms must be evaluated
against those controls rather than assumed to support the Compose configuration.

## Network and data boundary

- Dashboard: requested URL `https://memento-loop.co/craftmix`; existing apex routing
  must be inspected before any domain change. Preserve all other applications.
- API: choose an approved dedicated API hostname behind the identity gateway.
  Bind the application to host loopback. Prefer an outbound Cloudflare Tunnel so
  the application needs no public inbound listener. The tunnel provides connectivity;
  identity verification and customer membership remain mandatory.
- Administration: approved key-based access through a restricted management path;
  no public password login, Docker socket exposure, or customer-facing admin shell.
- Host firewall: default-deny inbound traffic, with only the specifically reviewed
  management path if required. Restrict container egress; support the required
  identity/JWKS and tunnel connections without enabling DuckDB remote file reads.
- Data: mount only explicitly approved Craftmix serving artifacts. Keep raw extracts,
  other customers, developer directories, and secrets outside the serving mount.
- Policy: operator-controlled directory, visible read-only to UID/GID 10001. Atomic
  membership replacements must remain visible to the container.
- Backups: provider backups are one recovery layer. Review encryption, retention,
  access, and a tested restore; they do not by themselves establish an independent
  offsite backup or satisfy customer retention obligations.

## Activation sequence

1. Approve the provider/resource budget and select the account/project. Authenticate
   through the provider's normal flow; never paste credentials into chat or source.
2. Create the host and review its guest OS, management access, firewall, patching,
   monitoring, disk capacity alerts, and backup configuration.
3. Deploy the image and verify host/container controls using synthetic data only.
4. Configure the identity application, issuer/audience, explicit member subjects,
   API hostname, and tunnel. Test anonymous, forged, wrong-member, and revoked access.
5. Configure the isolated Vercel customer project and review the exact `/craftmix`
   routing change. Confirm alternate deployment URLs and API origins cannot bypass
   identity or customer authorization.
6. Obtain approval for the exact customer input/serving paths and permitted fields;
   then process/register the customer publication and create its reviewed policy.
7. Test the live protected staging flow, customer-specific restore, rollback, and
   access kill switch; approve the concrete production promotion.

No DigitalOcean connection is currently established through this chat. The advertised
Railway project-list tool returned an unavailable-tool error, so it did not establish
an existing usable host or account. No account secrets were requested or retrieved.

Only documentation changed for this decision. Existing application verification
evidence is in `docs/handoffs/customer-security-verification.md`; it is not evidence
that a cloud host has been configured or secured.

Sources:
- [DigitalOcean Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [DigitalOcean backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/)
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/)
