from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

import uvicorn

from memento.api import create_app
from tools.demo import prepare_fixture


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publish a temporary synthetic Monday demo release and serve its API."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="memento-attention-e2e-") as directory:
        fixture_root = Path(directory).resolve()
        data_root = fixture_root / "runtime-data"
        result = prepare_fixture(data_root)
        uvicorn.run(
            create_app(data_root, result["signal_set_id"]),
            host=args.host,
            port=args.port,
            log_level="warning",
        )


if __name__ == "__main__":
    main()
