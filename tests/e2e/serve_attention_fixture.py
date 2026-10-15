from __future__ import annotations

import argparse
import tempfile
from decimal import Decimal
from pathlib import Path

import uvicorn

from investigation_fixture import build_canonical, build_model
from memento.api import create_app
from memento.signals import run_signals
from memento.attention_priority import prioritize
from memento.investigation import publish


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publish a temporary synthetic Attention release and serve its API."
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8100)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory(prefix="memento-attention-e2e-") as directory:
        fixture_root = Path(directory).resolve()
        data_root = fixture_root / "runtime-data"
        canonical_path = build_canonical(data_root)
        baseline_path = run_signals(
            canonical_path,
            data_root=data_root,
            annual_carrying_cost_rate=Decimal("0.20"),
            carrying_rate_version="synthetic-browser-test-rate-v1",
            supply_model_path=build_model(data_root),
        )
        prioritize(baseline_path / "manifest.json", data_root=data_root)
        publish(data_root)
        uvicorn.run(
            create_app(data_root),
            host=args.host,
            port=args.port,
            log_level="warning",
        )


if __name__ == "__main__":
    main()
