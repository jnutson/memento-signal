"""Versioned urgency prioritization of an existing immutable synthetic signal release.

No projection, source data, action feasibility, or economic amount is changed.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import pyarrow.parquet as pq

from .api import SupplyContext
from .manifest import sha256_file
from .serving import safe_member, validate_release_files
from .signal_contract import SIGNAL_SCHEMA, URGENCY_POLICY_VERSION, decimal_value
from .signal_publication import publish_signal_set
from .signal_ranking import rank_signal_candidates


def decision_timing(days: int, review_days: int, actions: list[dict]) -> dict[str, object]:
    if not 1 <= days <= 28 or review_days < 0:
        raise ValueError("invalid decision timing input")
    applicable = [row for row in actions if row["feasibility"] != "not_applicable"]
    # Unknown prerequisites do not erase the decision deadline. They remain unknown.
    if applicable:
        action = min(applicable, key=lambda row: (row["conservative_days"], row["action"]))
        lead, name, basis = action["conservative_days"], action["action"], "assumed_conservative_action"
    else:
        lead, name, basis = review_days, "review_and_replan", "declared_review_allowance"
    if not isinstance(lead, int) or lead < 0:
        raise ValueError("invalid decision lead time")
    slack = days - lead
    urgency = max(0.0, min(1.0, 1 - slack / 28))
    return {"urgency_score": decimal_value(urgency, 6), "decision_slack_days": slack,
            "decision_lead_time_days": lead, "urgency_basis": basis, "urgency_action": name}


def conservative_confidence(quality: float, completeness: float, stability: float) -> float:
    if any(not math.isfinite(value) or not 0 <= value <= 1 for value in (quality, completeness, stability)):
        raise ValueError("invalid confidence component")
    return quality * completeness * stability


def prioritize(source_manifest: Path, *, data_root: Path) -> Path:
    """Read an explicitly selected baseline release; publish a new derived release."""
    root = data_root.resolve(strict=True)
    signals_root = (root / "signals").resolve(strict=True)
    if source_manifest.is_symlink() or not source_manifest.is_file():
        raise ValueError("source manifest must be a regular file")
    source = source_manifest.resolve(strict=True)
    source.relative_to(signals_root)
    if source.name != "manifest.json" or source.parent.parent != signals_root:
        raise ValueError("source must be a published signal manifest")
    manifest = json.loads(source.read_text())
    if manifest.get("signal_set_id") != source.parent.name or manifest["configuration"].get("priority_policy"):
        raise ValueError("expected an immutable baseline signal release")
    validate_release_files(source.parent, manifest)
    expected = {"signal.parquet", "signal_evidence.parquet"}
    has_supply = bool(manifest["configuration"].get("supply_projection_version"))
    if has_supply:
        expected.add("supply_context.parquet")
    if {row["path"] for row in manifest["files"]} != expected:
        raise ValueError("invalid source inventory")
    canonical_root = (root / "canonical").resolve(strict=True)
    canonical_path = safe_member(canonical_root, manifest["canonical_dataset_id"] + "/manifest.json")
    canonical = json.loads(canonical_path.read_text())
    if canonical.get("source_classification") != "synthetic":
        raise ValueError("priority publication is currently synthetic-only")
    if canonical["dataset_id"] != manifest["canonical_dataset_id"]:
        raise ValueError("canonical identity mismatch")
    validate_release_files(canonical_path.parent, canonical)
    table = pq.read_table(source.parent / "signal.parquet")
    if table.schema != SIGNAL_SCHEMA or table.num_rows != manifest["candidate_count"]:
        raise ValueError("invalid baseline signal schema or count")
    candidates = table.to_pylist()
    if len({row["signal_id"] for row in candidates}) != len(candidates):
        raise ValueError("duplicate baseline signal")
    contexts: dict[str, dict] = {}
    if has_supply:
        for row in pq.read_table(source.parent / "supply_context.parquet").to_pylist():
            if row["signal_id"] in contexts:
                raise ValueError("duplicate supply context")
            contexts[row["signal_id"]] = SupplyContext.model_validate_json(row["context"]).model_dump(mode="json")
        if set(contexts) != {row["signal_id"] for row in candidates}:
            raise ValueError("supply context must cover all signals")
    for row in candidates:
        context = contexts.get(row["signal_id"])
        row.update(decision_timing(row["days_until_material_impact"], row["minimum_reaction_days"], context["actions"] if context else []))
        row["confidence_score"] = decimal_value(conservative_confidence(float(row["forecast_quality"]), float(row["data_completeness"]), float(row["stability_score"])), 6)
        if context:
            context["ranking_policy"] = "priority uses 40% impact, 40% deadline urgency, 20% multiplicative confidence; feasibility remains separate and unknown prerequisites remain non-executable"
    configuration = {**manifest["configuration"], "priority_policy": URGENCY_POLICY_VERSION,
                     "weights": {"impact": "0.40", "urgency": "0.40", "confidence": "0.20"},
                     "confidence_policy": "multiplicative-evidence-v1", "urgency_horizon_days": 28,
                     "urgency_action_policy": "shortest_potentially_applicable_conservative_duration_else_review_allowance",
                     "source_signal_set_id": manifest["signal_set_id"], "source_signal_manifest_sha256": sha256_file(source)}
    ranked = rank_signal_candidates(candidates, urgency_policy=True)
    supply = [{"signal_id": key, "context": json.dumps(value, sort_keys=True, separators=(",", ":"))} for key, value in sorted(contexts.items())] if has_supply else None
    return publish_signal_set(ranked, pq.read_table(source.parent / "signal_evidence.parquet").to_pylist(),
                             canonical_manifest=canonical, data_root=root, configuration=configuration, supply_context=supply,
                             reason_codes=[code for code, count in manifest["reason_code_counts"].items() for _ in range(count)])


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish urgency priorities from an immutable synthetic signal release.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--data-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        output = prioritize(args.manifest, data_root=args.data_root)
    except (ValueError, KeyError, TypeError, OSError):
        parser.exit(2, "Priority publication failed validation; no source release was modified.\n")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
