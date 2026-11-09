"""Export only validated, synthetic API responses for the frozen hosted demo."""
from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from memento.api import create_app
from tools.demo import preflight, prepare_fixture


def _export_generated_demo(data_root: Path, output: Path) -> dict:
    result = preflight(data_root)
    client = TestClient(create_app(data_root, result["signal_set_id"]))
    def read(path: str, params: dict | None = None) -> dict:
        response = client.get(path, params=params)
        if response.status_code != 200:
            raise ValueError("hosted demo response failed validation")
        return response.json()
    report = read("/v1/signals/report")
    queues = {"all": read("/v1/signals")}
    for kind in ("availability", "inventory_imbalance", "demand_momentum"):
        queues[kind] = read("/v1/signals", {"signal_type": kind})
    for direction in ("acceleration", "deceleration"):
        queues[f"demand_momentum:{direction}"] = read("/v1/signals", {"signal_type": "demand_momentum", "signal_direction": direction})
    ids = sorted({row["signal_id"] for queue in queues.values() for row in queue["signals"]})
    details = {identity: read(f"/v1/signals/{identity}") for identity in ids}
    bundle = {"demo_id": "demo-1", "classification": "synthetic", "report": report, "queues": queues, "details": details}
    # Fixed destination below ignored web/.demo; never write source payloads or raw costs.
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(bundle, sort_keys=True, separators=(",", ":")), encoding="utf-8")
    return {"demo_id": "demo-1", "signal_set_id": result["signal_set_id"], "details": len(details)}


def export_demo(data_root: Path, output: Path) -> dict:
    # Never inspect the caller's data directory. Classification labels alone do
    # not prove provenance; every export starts from literal artificial inputs.
    with tempfile.TemporaryDirectory(prefix="memento-synthetic-export-") as temporary:
        generated = Path(temporary) / "data"
        prepare_fixture(generated)
        return _export_generated_demo(generated, output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=Path("data/demo"))
    args = parser.parse_args()
    destination = Path(__file__).resolve().parents[1] / "web" / ".demo" / "demo-1.json"
    print(json.dumps(export_demo(args.data_root, destination)))
