from __future__ import annotations

from dataclasses import replace
from datetime import date
import json
from pathlib import Path
import shutil

import duckdb
import pyarrow.parquet as pq
import pytest

from memento.manifest import canonical_json
from memento.metric_publication import publish_metrics
from memento.metric_replay import evaluate_observable,verify_pair,verify_snapshot
from memento.metric_replay import replay
from memento.metric_evaluation_serving import read_evaluation
from memento.api import create_app
from fastapi.testclient import TestClient
from tests.metric_fixture import refresh_manifest
from tests.test_metric_backend_v2 import supply_fixture,rewrite_table


def cutoff_fixture(root, cutoff="2026-10-31T12:00:00Z", gap=False):
    final_canonical,source,config=supply_fixture(root)
    rewrite_table(final_canonical,"inventory_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_1' AND
      (business_date BETWEEN DATE '2026-11-03' AND DATE '2026-11-06' OR business_date BETWEEN DATE '2026-11-12' AND DATE '2026-11-14')
      THEN 0 ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
    if gap:
        rewrite_table(final_canonical,"inventory_daily","SELECT * FROM original WHERE NOT(location_id='loc_1' AND business_date=DATE '2026-11-17')")
    final=publish_metrics(final_canonical,source,data_root=root,config=config,activate=False)
    canonical=root/"canonical/mds_cutoff_fixture"
    shutil.copytree(final_canonical,canonical)
    cutoff_day=date.fromisoformat(cutoff[:10])
    for table in ("sales_daily","inventory_daily"):
        path=canonical/table/"part-00000.parquet"
        with duckdb.connect() as con:
            data=con.execute("SELECT * FROM read_parquet(?) WHERE business_date<?",[str(path),cutoff_day]).to_arrow_table()
        pq.write_table(data,path)
    refresh_manifest(canonical)
    manifest=json.loads((canonical/"manifest.json").read_text())
    manifest.update(as_of=cutoff,dataset_id=canonical.name)
    (canonical/"manifest.json").write_bytes(canonical_json(manifest))
    scoring=publish_metrics(canonical,replace(source,as_of=cutoff),data_root=root,config=config,activate=False)
    return canonical,source,config,scoring,final


def test_replay_excludes_already_zero_and_deduplicates_episodes(tmp_path):
    _,_,_,scoring,final=cutoff_fixture(tmp_path)
    assert verify_snapshot(scoring)["metric_release_id"]==scoring.name
    assert verify_pair(scoring,final)["actual_prefix_immutable"]
    pairs,events,summary=evaluate_observable([scoring],final)
    rows=pairs.to_pylist()
    assert len(rows)==12
    assert {r["result"] for r in rows if r["location_id"] in {"loc_2","loc_3"}}=={"excluded_already_zero"}
    first7=next(r for r in rows if r["location_id"]=="loc_1" and r["horizon_days"]==7)
    assert first7["observed_new_event"] and first7["result"]=="false_negative"
    first14=next(r for r in rows if r["location_id"]=="loc_1" and r["horizon_days"]==14)
    assert first14["result"]=="true_positive" and first14["onset_error_days"]>0
    # A late predicted date is not a timely episode warning even if the window contains an event.
    event14=[r for r in events.to_pylist() if r["horizon_days"]==14]
    assert len(event14)==2
    assert not next(r for r in event14 if r["onset_date"]==date(2026,11,3))["detected"]
    assert summary["14"]["unique_episodes_with_warning_opportunity"]==2


def test_missing_future_inventory_is_unknown_not_false_alarm(tmp_path):
    _,_,_,scoring,final=cutoff_fixture(tmp_path,gap=True)
    pairs,_,summary=evaluate_observable([scoring],final)
    row=next(r for r in pairs.to_pylist() if r["location_id"]=="loc_1" and r["horizon_days"]==28)
    assert row["result"]=="unknown_outcome" and row["valid_outcome_days"]==27
    assert summary["28"]["pair_horizon_results"]["unknown_outcome"]>=1


def test_mutated_historical_actuals_are_detected(tmp_path):
    canonical,source,config,scoring,final=cutoff_fixture(tmp_path)
    rewrite_table(canonical,"sales_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-08-01'
      THEN sales_quantity+1 ELSE sales_quantity END AS sales_quantity) FROM original""")
    changed=publish_metrics(canonical,replace(source,as_of="2026-10-31T12:00:00Z"),data_root=tmp_path,config=config,activate=False)
    with pytest.raises(ValueError,match="actuals changed"):
        verify_pair(changed,final)


def test_outcome_window_must_be_complete(tmp_path):
    _,_,_,scoring,final=cutoff_fixture(tmp_path)
    with pytest.raises(ValueError,match="outcome window"):
        evaluate_observable([final],final)


def test_unavailable_prediction_remains_in_event_miss_denominator(tmp_path):
    canonical,source,config,_,final=cutoff_fixture(tmp_path)
    rewrite_table(canonical,"demand_forecast_weekly","SELECT * FROM original WHERE location_id<>'loc_1'")
    scoring=publish_metrics(canonical,replace(source,as_of="2026-10-31T12:00:00Z"),data_root=tmp_path,config=config,activate=False)
    pairs,_,summary=evaluate_observable([scoring],final)
    row=next(r for r in pairs.to_pylist() if r["location_id"]=="loc_1" and r["horizon_days"]==14)
    assert row["result"]=="unassessed_event"
    assert summary["14"]["pair_horizon_results"]["unassessed_event"]==1


def test_complete_replay_is_deterministic_and_never_activates_pointers(tmp_path,monkeypatch):
    cutoffs=["2026-10-31T12:00:00Z","2026-11-07T12:00:00Z","2026-11-14T12:00:00Z",
             "2026-11-21T12:00:00Z","2026-11-28T12:00:00Z"]
    inputs={}
    for index,cutoff in enumerate(cutoffs):
        canonical,source,config,_,_=cutoff_fixture(tmp_path/str(index),cutoff=cutoff)
        inputs[cutoff]=(canonical,replace(source,as_of=cutoff))
    # Only source discovery/ingestion is mocked; all metric publications, checks,
    # temporal comparisons, evaluation tables and integrity validation are real.
    monkeypatch.setattr("memento.metric_replay.series_entry",lambda series,cutoff: inputs[cutoff])
    monkeypatch.setattr("memento.metric_replay.ingest",lambda path,**kwargs:path)
    series=tmp_path/"series.json"
    series.write_bytes(canonical_json({"release_series_id":"synthetic-test-series","releases":[
        {"as_of":cutoff,"role":"scoring" if index==0 else "outcome_only"} for index,cutoff in enumerate(cutoffs)]}))
    root=tmp_path/"runtime"
    (root/"metrics").mkdir(parents=True)
    (root/"signals").mkdir()
    (root/"metrics/current.json").write_bytes(b"synthetic metric pointer fixture")
    (root/"signals/current.json").write_bytes(b"synthetic signal pointer fixture")
    first=replay(series,data_root=root,config=config)
    second=replay(series,data_root=root,config=config)
    assert first==second
    assert (root/"metrics/current.json").read_bytes()==b"synthetic metric pointer fixture"
    assert (root/"signals/current.json").read_bytes()==b"synthetic signal pointer fixture"
    report=read_evaluation(root,first.name)
    assert report["identical_republication_verified"] and report["adjacent_cutoff_invariants_passed"]==4
    assert len(report["releases"])==5 and len(report["scoring_releases"])==1
    assert TestClient(create_app(root)).get("/v1/metrics/evaluations/"+first.name).status_code==200
    (first/"pair_horizon.parquet").write_bytes(b"corrupted synthetic evaluation fixture")
    with pytest.raises(ValueError,match="integrity"):
        read_evaluation(root,first.name)
    assert TestClient(create_app(root)).get("/v1/metrics/evaluations/"+first.name).status_code==503
