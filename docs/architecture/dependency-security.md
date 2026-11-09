# Dependency security boundary

Production dependencies and development tools have different exposure and are checked
separately.

- Python HTTP contract tests use Starlette's supported `httpx2` test transport. The
  transport is a development dependency and is not part of the application runtime.
- JavaScript runtime dependencies must pass `npm audit --omit=dev` with no high or
  critical findings.
- Development dependencies are audited too. A finding may be accepted only when it is
  unreachable from a production install, has no safe upstream upgrade, and is listed
  explicitly in `web/security-audit-exceptions.json` with an expiration date.
- `tools/verify_node_audit.py` rejects runtime findings, unlisted development findings,
  resolved-but-still-listed findings, and expired exceptions. This prevents the
  exception from becoming a permanent blanket suppression.
- Production packaging must install JavaScript dependencies without development
  dependencies. This repository does not yet define a production deployment image;
  that boundary must be enforced when deployment work is approved.

The current exception covers `GHSA-vfj7-8cjw-p6xm` in the Next.js ESLint dependency
chain. It does not cover application runtime dependencies and expires on 2026-11-15.
