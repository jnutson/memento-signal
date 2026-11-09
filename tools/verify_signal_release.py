"""Verify a full published synthetic signal release without reading private truth.

Run with: .venv/bin/python -m tools.verify_signal_release --data-root data
Publication replay checks immutable reuse; it does not recompute source producers.
"""
from __future__ import annotations

import argparse
import json
from decimal import Decimal
from pathlib import Path

import duckdb
from fastapi.testclient import TestClient

from memento.api import create_app
from memento.manifest import sha256_file
from memento.serving import SignalStore
from memento.signal_publication import publish_signal_set
from memento.signal_ranking import rank_signal_candidates
from memento.signal_contract import URGENCY_POLICY_VERSION


def verify(data_root: Path) -> dict[str, object]:
    root = data_root.resolve(strict=True)
    release, manifest = SignalStore(root / "signals", root / "canonical").current_release()
    configuration = manifest["configuration"]
    counts = manifest["candidate_counts_by_type"]
    assert isinstance(configuration, dict) and isinstance(counts, dict)
    canonical = json.loads((root / "canonical" / str(manifest["canonical_dataset_id"]) / "manifest.json").read_text())
    con = duckdb.connect()
    rows = con.execute("SELECT * FROM read_parquet(?) ORDER BY overall_rank_position", [str(release / "signal.parquet")]).to_arrow_table().to_pylist()
    assert len(rows) == manifest["candidate_count"]
    assert len({row["signal_id"] for row in rows}) == len(rows)
    assert len({(row["signal_type"], row["store_id"], row["product_id"]) for row in rows}) == len(rows)
    assert {kind: sum(row["signal_type"] == kind for row in rows) for kind in counts} == counts
    rank_fields = ("impact_score", "rank_score", "signal_type_rank_position", "overall_rank_position", "is_overall_top_10")
    original = {str(row["signal_id"]): tuple(row[key] for key in rank_fields) for row in rows}
    urgency_policy = configuration.get("priority_policy") == URGENCY_POLICY_VERSION
    if urgency_policy:
        contexts = {row["signal_id"]: json.loads(row["context"]) for row in con.execute("SELECT * FROM read_parquet(?)", [str(release / "supply_context.parquet")]).to_arrow_table().to_pylist()} if configuration.get("supply_projection_version") else {}
        for row in rows:
            actions = [action for action in contexts.get(row["signal_id"], {}).get("actions", []) if action["feasibility"] != "not_applicable"]
            action = min(actions, key=lambda option: (option["conservative_days"], option["action"])) if actions else None
            lead = action["conservative_days"] if action else row["minimum_reaction_days"]
            slack = row["days_until_material_impact"] - lead
            expected_urgency = max(Decimal(0), min(Decimal(1), Decimal(1) - Decimal(slack) / 28)).quantize(Decimal(".000001"))
            assert row["decision_lead_time_days"] == lead and row["decision_slack_days"] == slack
            assert row["urgency_score"] == expected_urgency
            assert row["urgency_action"] == (action["action"] if action else "review_and_replan")
            assert row["urgency_basis"] == ("assumed_conservative_action" if action else "declared_review_allowance")
            expected_confidence = (row["forecast_quality"] * row["data_completeness"] * row["stability_score"]).quantize(Decimal(".000001"))
            assert abs(row["confidence_score"] - expected_confidence) <= Decimal(".000001")
    ranked = rank_signal_candidates(rows, urgency_policy=urgency_policy)
    assert all(original[str(row["signal_id"])] == tuple(row[key] for key in rank_fields) for row in ranked)
    # Every candidate has the contracted evidence count, with no orphan evidence.
    evidence_result = con.execute("""WITH evidence AS (
        SELECT signal_id,count(*) n FROM read_parquet(?) GROUP BY signal_id
    ) SELECT count(*) FROM read_parquet(?) s FULL JOIN evidence e USING(signal_id)
      WHERE s.signal_id IS NULL OR e.n IS NULL OR e.n !=
        CASE WHEN s.signal_type='demand_momentum' THEN 36 ELSE 84 END""",
        [str(release / "signal_evidence.parquet"), str(release / "signal.parquet")]).fetchone()
    assert evidence_result is not None and evidence_result[0] == 0
    names = ["manifest.json", "signal.parquet", "signal_evidence.parquet"]
    if configuration.get("supply_projection_version"):
        names.append("supply_context.parquet")
        context_result = con.execute("""SELECT count(*) FROM read_parquet(?) s FULL JOIN
          (SELECT signal_id,count(*) n FROM read_parquet(?) GROUP BY signal_id) c USING(signal_id)
          WHERE s.signal_id IS NULL OR c.n IS NULL OR c.n!=1""", [str(release / "signal.parquet"),str(release / "supply_context.parquet")]).fetchone()
        assert context_result is not None and context_result[0] == 0
    before = {name: sha256_file(release / name) for name in names}
    pointer_before = (root / "signals" / "current.json").read_bytes()
    replay = publish_signal_set([], [], canonical_manifest=canonical, data_root=root, configuration=configuration,
                               supply_context=[] if configuration.get("supply_projection_version") else None)
    assert replay == release
    assert before == {name: sha256_file(release / name) for name in before}
    assert pointer_before == (root / "signals" / "current.json").read_bytes()
    client = TestClient(create_app(root))
    queue_response = client.get("/v1/signals")
    assert queue_response.status_code == 200, queue_response.text
    queue = queue_response.json()
    assert len(queue["signals"]) == manifest["display_count"]
    assert queue["run"]["signal_set_id"] == manifest["signal_set_id"]
    for signal_type in counts:
        response = client.get("/v1/signals", params={"signal_type": signal_type})
        assert response.status_code == 200, response.text
        assert response.json()["signals"] == [row for row in queue["signals"] if row["signal_type"] == signal_type]
    for row in queue["signals"]:
        response = client.get(f"/v1/signals/{row['signal_id']}")
        assert response.status_code == 200, response.text
        assert response.json()["signal"]["overall_rank_position"] == row["overall_rank_position"]
    assert client.get("/v1/signals").json() == queue
    con.close()
    return {
        "signal_set_id": manifest["signal_set_id"],
        "candidate_counts_by_type": manifest["candidate_counts_by_type"],
        "top_ten_counts_by_type": {kind: sum(row["signal_type"] == kind for row in queue["signals"]) for kind in counts},
        "ranking_recalculation": "passed",
        "evidence_counts_and_references": "passed",
        "immutable_publication_replay": "passed",
        "full_source_producer_recomputation": "not run",
        "api_queue_filters_and_all_displayed_details": "passed",
        "sha256": before,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.data_root), indent=2))
