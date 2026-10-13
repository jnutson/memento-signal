"""Compare frozen committed and supply-aware predictions with later observable facts."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import duckdb

from memento.evaluation import evaluate_predictions
from memento.manifest import sha256_file
from memento.serving import PredictionStore, SignalStore


def evaluate(data_root: Path, later_canonical: Path) -> dict:
    root = data_root.resolve(strict=True)
    prediction, prediction_manifest = PredictionStore(root / "predictions").current_release()
    signal, signal_manifest = SignalStore(root / "signals", root / "canonical").current_release()
    if prediction_manifest.get("canonical_dataset_id") != signal_manifest.get("canonical_dataset_id"):
        raise ValueError("baseline and supply signals must bind the same canonical input")
    later_canonical = later_canonical.resolve(strict=True)
    later_manifest = json.loads((later_canonical / "manifest.json").read_text())
    for entry in later_manifest["files"]:
        path = later_canonical / entry["path"]
        path.resolve(strict=True).relative_to(later_canonical)
        if path.is_symlink() or sha256_file(path) != entry["sha256"]:
            raise ValueError("later observable inventory integrity failure")
    baseline_root = evaluate_predictions(prediction, later_canonical, data_root=root)
    baseline = json.loads((baseline_root / "manifest.json").read_text())
    con = duckdb.connect()
    records = con.execute("""WITH outcome AS (
      SELECT s.signal_id,s.is_overall_top_10,s.days_until_material_impact,s.observation_date,
        count(DISTINCT i.business_date) observed_days,
        min(i.business_date) FILTER(WHERE i.on_hand_quantity=0 AND i.assorted AND i.replenishment_enabled) actual
      FROM read_parquet(?) s LEFT JOIN read_parquet(?) i ON i.location_id=s.store_id AND i.product_id=s.product_id
        AND i.business_date BETWEEN s.observation_date+1 AND s.observation_date+28
      WHERE s.signal_type='availability'
      GROUP BY ALL
    ) SELECT count(*) candidates,coalesce(sum(observed_days=28),0) evaluable,coalesce(sum(actual IS NOT NULL),0) observed_stockouts,
      coalesce(sum(is_overall_top_10),0) displayed,coalesce(sum(is_overall_top_10 AND actual IS NOT NULL),0) displayed_stockouts,
      avg(abs(date_diff('day',actual,observation_date+days_until_material_impact))) date_mae_on_observed_stockouts
      FROM outcome""", [str(signal / "signal.parquet"),str(later_canonical / "inventory_daily/*.parquet")])
    row = records.fetchone()
    if row is None:
        raise ValueError("missing evaluation aggregate")
    result = dict(zip([column[0] for column in records.description],row))
    if result["candidates"] != result["evaluable"]:
        raise ValueError("incomplete supply prediction evaluation horizon")
    result["precision_among_displayed_availability"] = result["displayed_stockouts"] / result["displayed"] if result["displayed"] else None
    con.close()
    return {"signal_set_id":signal_manifest["signal_set_id"],"evaluation_source_dataset_id":later_manifest["dataset_id"],
            "baseline_evaluation":baseline,"supply_aware_evaluation":result,
            "interpretation":"Observed outcomes are not counterfactual intervention outcomes. Only availability signals have stockout precision; other types are not counted as stockout predictions."}


if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root",type=Path,required=True)
    parser.add_argument("later_canonical",type=Path)
    args=parser.parse_args()
    print(json.dumps(evaluate(args.data_root,args.later_canonical),indent=2))
