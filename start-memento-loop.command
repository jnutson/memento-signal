#!/bin/sh
# On-demand synthetic MCP testing. This launcher never contains credentials.
set -eu
cd -- "$(dirname -- "$0")"
exec .venv/bin/python -m tools.run_mcp_tunnel "$@"
