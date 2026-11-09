from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn

from .api import create_app
from .security import ServingSecurity


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the local read-only Memento Attention API")
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--security-policy", type=Path, help="Enable Cloudflare JWT and publication authorization")
    args = parser.parse_args()
    if args.security_policy is None and args.host not in {"127.0.0.1", "::1"}:
        parser.error("unprotected serving is restricted to loopback")
    security = ServingSecurity("cloudflare", args.security_policy) if args.security_policy else ServingSecurity("local")
    uvicorn.run(create_app(args.data_root, security=security), host=args.host, port=args.port,
                access_log=False, proxy_headers=False)


if __name__ == "__main__":
    main()
