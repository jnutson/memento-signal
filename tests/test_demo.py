from copy import deepcopy
import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from memento.synthetic_api import create_app
from memento.mcp_signal_store import SignalStore
from memento.signal_publication import publish_signal_set
from tools.demo import preflight, prepare_fixture


@pytest.fixture
def demo(tmp_path):
    root = tmp_path / "data"
    result = prepare_fixture(root)
    return root, result["signal_set_id"]


def test_report_matches_complete_selection_and_excludes_deceleration(demo):
    root, pinned = demo
    client = TestClient(create_app(root))
    report = client.get("/v1/signals/report").json()
    assert report["scope"] == {"classification": "synthetic", "observed_from": "2026-11-30", "observed_through": "2027-01-29", "horizon_from": "2027-01-30", "horizon_through": "2027-02-26", "item_count": 4, "store_count": 1}
    assert report["run"]["candidate_counts_by_type"]["demand_momentum"] == 2
    for card in report["categories"]:
        params = {"signal_set_id": pinned, "signal_type": card["signal_type"]}
        if card["signal_direction"]:
            params["signal_direction"] = card["signal_direction"]
            assert card["candidate_count"] == 1
            assert card["leading_signal"]["signal_direction"] == "acceleration"
        queue = client.get("/v1/signals", params=params).json()
        assert queue["signals"][0] == card["leading_signal"]
        assert len(queue["signals"]) == card["candidate_count"]
        assert client.get(f"/v1/signals/{card['leading_signal']['signal_id']}", params={"signal_set_id": pinned}).status_code == 200
    assert client.get("/v1/signals", params={"signal_type": "availability", "signal_direction": "acceleration"}).status_code != 200


def test_full_publication_drilldown_pinning_and_missing_release(demo):
    root, pinned = demo
    store = SignalStore(root / "signals", root / "canonical", pinned)
    original = store.run()
    canonical = json.loads((root / "canonical" / original["canonical_dataset_id"] / "manifest.json").read_text())
    kinds = ["inventory_imbalance"] * 11 + ["availability", "demand_momentum"]
    candidates, evidence = [], []
    for rank, kind in enumerate(kinds, 1):
        source = store.top_signals(kind, "acceleration" if kind == "demand_momentum" else None)[0]
        row = deepcopy(source)
        row.update(signal_id=f"sig_{rank:064x}", overall_rank_position=rank, is_overall_top_10=rank <= 10)
        candidates.append(row)
        evidence.extend([{**entry, "signal_id": row["signal_id"]} for entry in store.evidence(source["signal_id"])])
    new_release = publish_signal_set(candidates, evidence, canonical_manifest=canonical, data_root=root,
                                     configuration={**original["configuration"], "test_rank_fixture": "category-outside-top-ten"})
    client = TestClient(create_app(root))
    assert client.get("/v1/signals").json()["run"]["signal_set_id"] == new_release.name
    report = client.get("/v1/signals/report").json()
    availability = report["categories"][0]
    assert availability["leading_signal"]["overall_rank_position"] == 12
    filtered = client.get("/v1/signals", params={"signal_type": "availability"}).json()
    assert filtered["signals"][0] == availability["leading_signal"]
    assert client.get(f"/v1/signals/{availability['leading_signal']['signal_id']}").status_code == 200
    old_report = client.get("/v1/signals/report", params={"signal_set_id": pinned}).json()
    assert old_report["run"]["signal_set_id"] == pinned
    assert old_report["categories"][0]["leading_signal"]["overall_rank_position"] != 12
    for route in ["/v1/signals", "/v1/signals/report", f"/v1/signals/{availability['leading_signal']['signal_id']}"]:
        assert client.get(route, params={"signal_set_id": f"mss_{'f'*64}"}).status_code == 503
        assert client.get(route, params={"signal_set_id": "../../unsafe"}).status_code == 503
    assert preflight(root, pinned)["signal_set_id"] == pinned


def test_preflight_rejects_incomplete_categories_and_corrupt_artifacts(demo):
    root, pinned = demo
    store = SignalStore(root / "signals", root / "canonical", pinned)
    manifest = store.run()
    canonical = json.loads((root / "canonical" / manifest["canonical_dataset_id"] / "manifest.json").read_text())
    empty = publish_signal_set([], [], canonical_manifest=canonical, data_root=root,
                               configuration={**manifest["configuration"], "test_empty": True})
    with pytest.raises(ValueError, match="requires stockout"):
        preflight(root, empty.name)
    artifact = root / "signals" / pinned / "signal_evidence.parquet"
    artifact.write_bytes(b"corrupt synthetic fixture")
    with pytest.raises(ValueError, match="integrity failure"):
        preflight(root, pinned)
