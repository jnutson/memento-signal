"""Serve the read-only synthetic MCP through stdio or authenticated HTTP."""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

from .mcp_security import MCPTokenVerifier
from .mcp_server import create_http_app, create_server


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--publication-id")
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--policy", type=Path, help="Operator-owned OAuth policy; required for HTTP")
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    if args.transport == "http" and args.policy is None:
        parser.error("HTTP requires --policy; use stdio for local synthetic development")
    if args.transport == "stdio" and args.policy is not None:
        parser.error("OAuth policy requires HTTP transport")
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    logging.basicConfig(level=logging.INFO)
    try:
        verifier = MCPTokenVerifier(args.policy) if args.policy else None
        server = create_server(args.data_root, args.publication_id, verifier=verifier)
    except Exception:
        parser.exit(1, "MCP startup failed. Check the declared synthetic publication and policy.\n")
    if verifier:
        import uvicorn
        uvicorn.run(create_http_app(server, verifier), host="127.0.0.1", port=args.port,
                    access_log=False, log_level="warning")
    else:
        server.run(transport="stdio")


if __name__ == "__main__":
    main()
