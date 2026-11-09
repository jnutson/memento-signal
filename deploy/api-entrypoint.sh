#!/bin/sh
set -eu
# The supported container entrypoint cannot start an unprotected API.
test "${MEMENTO_SERVING_MODE:-}" = cloudflare
test -n "${MEMENTO_SECURITY_POLICY:-}"
test -n "${MEMENTO_DATA_ROOT:-}"
exec uvicorn memento.api:app --host 0.0.0.0 --port 8000 --no-access-log --no-proxy-headers --limit-concurrency 8 --timeout-keep-alive 5
