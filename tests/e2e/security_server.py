"""Local-only security fixture. Never imported by production entrypoints."""
import json
import sys
from pathlib import Path

import uvicorn

from memento.api import create_app
from memento.security import ServingSecurity


def main():
    config = json.loads(Path(sys.argv[1]).read_text())
    security = ServingSecurity("cloudflare", Path(config["policy"]))
    # Exercise real JWT verification using an ephemeral test issuer's public key.
    # Network discovery is covered by AccessVerifier; no production bypass exists.
    security.verifier.keys.fetch_data = lambda: config["jwks"]
    uvicorn.run(create_app(Path(config["root"]), security=security),
                host="127.0.0.1", port=config["port"], access_log=False,
                proxy_headers=False, log_level="warning",
                ssl_keyfile=config["tls_key"], ssl_certfile=config["tls_cert"])


if __name__ == "__main__":
    main()
