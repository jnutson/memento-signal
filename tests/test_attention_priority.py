import json
import shutil
from decimal import Decimal

import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient

from memento.api import SignalRow, create_app
from memento.attention_priority import conservative_confidence, decision_timing, prioritize
from memento.manifest import sha256_file
from memento.signal_contract import PRIORITY_SCHEMA, URGENCY_RANKER_VERSION
from memento.signal_ranking import rank_signal_candidates
from memento.signals import run_signals
from test_prediction_pipeline import _canonical_fixture


def test_urgency_tracks_decision_deadline_and_keeps_unknown_feasibility_separate():
    actions = [{"action": "expedite", "conservative_days": 6, "feasibility": "not_applicable"},
               {"action": "release_vendor_stock", "conservative_days": 21, "feasibility": "unknown"},
               {"action": "production", "conservative_days": 60, "feasibility": "unknown"}]
    overdue = decision_timing(14, 10, actions)
    assert overdue["decision_slack_days"] == -7
    assert overdue["urgency_score"] == 1
    assert overdue["urgency_action"] == "release_vendor_stock"
    assert actions[1]["feasibility"] == "unknown"
    assert decision_timing(28, 10, actions)["urgency_score"] == Decimal("0.750000")
    assert decision_timing(21, 10, actions)["urgency_score"] == 1


def test_review_allowance_is_explicit_and_urgency_is_monotonic():
    rows = [decision_timing(day, 10, []) for day in range(1, 29)]
    assert rows[0]["urgency_basis"] == "declared_review_allowance"
    assert rows[-1]["decision_slack_days"] == 18
    assert rows[-1]["urgency_score"] == Decimal("0.357143")
    assert all(left["urgency_score"] >= right["urgency_score"] for left, right in zip(rows, rows[1:]))
    with pytest.raises(ValueError):
        decision_timing(29, 10, [])


def test_confidence_cannot_be_rescued_by_completeness_or_stability():
    assert conservative_confidence(.4, 1, 1) == .4
    assert conservative_confidence(.8, .75, .5) == pytest.approx(.3)
    assert conservative_confidence(1, 0, 1) == 0
    for value in (-.1, 1.1, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            conservative_confidence(value, 1, 1)


def test_all_three_dimensions_influence_priority_and_urgency_has_equal_impact_weight():
    rows = [{"signal_id": str(index), "signal_type": "availability", "primary_economic_value": 10,
             "urgency_score": urgency, "confidence_score": confidence, "reaction_score": 0,
             "days_until_material_impact": 14, "store_id": "s", "product_id": "p"}
            for index, (urgency, confidence) in enumerate(((.9, .5), (.5, .9), (.9, .9)))]
    ranked = rank_signal_candidates(rows, urgency_policy=True)
    assert [row["signal_id"] for row in ranked] == ["2", "0", "1"]
    # Equal economic amounts share the midpoint economic percentile, not 100%.
    assert ranked[0]["impact_score"] == Decimal("0.500000")
    assert ranked[0]["rank_score"] == Decimal("0.740000")


def test_derived_publication_is_immutable_replayable_and_served_with_new_contract(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    canonical = _canonical_fixture(source)
    manifest_path = canonical / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["source_classification"] = "synthetic"
    manifest_path.write_text(json.dumps(manifest))
    root = tmp_path / "data"
    target = root / "canonical" / "mds_fixture"
    target.parent.mkdir(parents=True)
    shutil.copytree(canonical, target)
    baseline = run_signals(target, data_root=root, annual_carrying_cost_rate=Decimal(".25"), carrying_rate_version="test-v1")
    before = {path.name: sha256_file(path) for path in baseline.iterdir()}
    derived = prioritize(baseline / "manifest.json", data_root=root)
    assert derived != baseline
    assert {path.name: sha256_file(path) for path in baseline.iterdir()} == before
    assert prioritize(baseline / "manifest.json", data_root=root) == derived
    table = pq.read_table(derived / "signal.parquet")
    assert table.schema == PRIORITY_SCHEMA
    old, new = pq.read_table(baseline / "signal.parquet").to_pylist()[0], table.to_pylist()[0]
    for field in ("reaction_score", "primary_economic_value", "estimated_retail_sales_impact_amount", "forecast_quality"):
        assert old[field] == new[field]
    client = TestClient(create_app(root))
    response = client.get("/v1/signals")
    assert response.status_code == 200
    payload = response.json()
    assert payload["run"]["ranker_version"] == URGENCY_RANKER_VERSION
    assert payload["run"]["source_signal_set_id"] == baseline.name
    row = payload["signals"][0]
    SignalRow.model_validate(row)
    assert row["urgency_score"] == "1.000000"
    detail = client.get(f"/v1/signals/{row['signal_id']}")
    assert detail.status_code == 200
    assert len(detail.json()["evidence"]) == 84
    with pytest.raises(ValueError, match="reconcile"):
        SignalRow.model_validate({**row, "rank_score": "0.000000"})
    with pytest.raises(ValueError, match="synthetic-only"):
        target_manifest = json.loads((target / "manifest.json").read_text())
        target_manifest.pop("source_classification")
        (target / "manifest.json").write_text(json.dumps(target_manifest))
        prioritize(baseline / "manifest.json", data_root=root)

