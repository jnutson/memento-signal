"""Prepare, preflight, and serve a pinned synthetic Monday demo locally."""
from __future__ import annotations

import argparse
import json
import tempfile
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from memento.synthetic_api import create_app
from memento.mcp_signal_store import SIGNAL_SET_ID, SignalStore


def preflight(data_root: Path, signal_set_id: str | None = None) -> dict:
    store = SignalStore(data_root / "signals", data_root / "canonical", signal_set_id)
    manifest = store.run()
    pinned = str(manifest["signal_set_id"])
    if not SIGNAL_SET_ID.fullmatch(pinned):
        raise ValueError("invalid publication identity")
    client = TestClient(create_app(data_root, pinned))
    response = client.get("/v1/signals/report")
    if response.status_code != 200:
        raise ValueError("synthetic demo publication failed report validation")
    report = response.json()
    for card in report["categories"]:
        if card["candidate_count"] < 1 or card["leading_signal"] is None:
            raise ValueError("demo requires stockout risk, excess inventory, and acceleration cases")
        params = {"signal_set_id": pinned, "signal_type": card["signal_type"]}
        if card["signal_direction"]:
            params["signal_direction"] = card["signal_direction"]
        queue = client.get("/v1/signals", params=params)
        if queue.status_code != 200 or queue.json()["signals"][0] != card["leading_signal"]:
            raise ValueError("demo category does not reconcile")
        for row in queue.json()["signals"]:
            detail = client.get(f"/v1/signals/{row['signal_id']}", params={"signal_set_id": pinned})
            if detail.status_code != 200:
                raise ValueError("demo evidence failed validation")
    return {"signal_set_id": pinned, "classification": "synthetic", "scope": report["scope"],
            "category_counts": {card["signal_type"]: card["candidate_count"] for card in report["categories"]},
            "preflight": "passed"}


def prepare_fixture(data_root: Path) -> dict:
    from memento.orchestrator import ingest
    from memento.signals import run_signals
    from tools.synthetic_demo import build_attention_release_set

    # All source packages are generated here from literal artificial values.
    with tempfile.TemporaryDirectory(prefix="memento-demo-source-") as temporary:
        source = build_attention_release_set(Path(temporary).resolve(), demo=True)
        canonical = ingest(source, data_root=data_root, classification="synthetic")
        release = run_signals(canonical, data_root=data_root, annual_carrying_cost_rate=Decimal("0.20"),
                              carrying_rate_version="synthetic-browser-test-rate-v1")
    return preflight(data_root, release.name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare", "preflight", "serve"])
    parser.add_argument("--data-root", type=Path, default=Path("data/demo"))
    parser.add_argument("--signal-set-id")
    parser.add_argument("--fixture", action="store_true", help="Generate a four-item artificial fixture; no external inputs")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    try:
        if args.command == "prepare" and args.fixture:
            result = prepare_fixture(args.data_root)
        else:
            result = preflight(args.data_root, args.signal_set_id)
        if args.command == "serve":
            import uvicorn
            uvicorn.run(create_app(args.data_root, result["signal_set_id"]), host="127.0.0.1", port=args.port)
        else:
            print(json.dumps(result, indent=2, default=str))
    except (ValueError, OSError, KeyError, TypeError):
        parser.exit(1, "Demo preflight failed. Check the declared synthetic publication, its bound artifacts, and all three categories.\n")


if __name__ == "__main__":
    main()
