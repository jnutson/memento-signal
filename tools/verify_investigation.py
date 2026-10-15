"""Rebuild all displayed synthetic investigations in memory and verify frozen bytes."""
import argparse
import json
from pathlib import Path

import duckdb
import pyarrow.parquet as pq
from fastapi.testclient import TestClient

from memento.api import create_app
from memento.investigation import build_investigation, publish, read_investigation
from memento.manifest import canonical_json, sha256_file
from memento.serving import PredictionStore, SignalStore


def verify(root: Path):
    root=root.resolve(strict=True)
    release,manifest=SignalStore(root/"signals",root/"canonical").current_release()
    before={str(p):sha256_file(p) for folder in ("canonical","signals","predictions") for p in (root/folder).rglob("*") if p.is_file()}
    artifact=publish(root)
    cpath=root/"canonical"/str(manifest["canonical_dataset_id"])/"manifest.json"
    canonical=json.loads(cpath.read_text())
    rows=[r for r in pq.read_table(release/"signal.parquet").to_pylist() if r["is_overall_top_10"]]
    evidence=pq.read_table(release/"signal_evidence.parquet").to_pylist()
    config=manifest["configuration"]
    assert isinstance(config,dict)
    contexts={r["signal_id"]:json.loads(r["context"]) for r in pq.read_table(release/"supply_context.parquet").to_pylist()} if config.get("supply_projection_version") else {}
    client=TestClient(create_app(root))
    sizes=[]
    with duckdb.connect() as con:
        for table in ("calendar_day","sales_daily","inventory_daily","demand_forecast_weekly","replenishment_commitment"):
            con.from_parquet([str(PredictionStore._safe_member(cpath.parent,f["path"])) for f in canonical["files"] if f["path"].startswith(table+"/")]).create_view(table)
        for row in rows:
            saved=read_investigation(root,release,manifest,row["signal_id"])
            lineage={key:saved.model_dump(mode="json")[key] for key in ("signal_set_id","canonical_dataset_id","signal_manifest_sha256","canonical_manifest_sha256","supply_model_sha256","configuration_hash","signal_as_of")}
            rebuilt=build_investigation(con,row,[e for e in evidence if e["signal_id"]==row["signal_id"]],contexts.get(row["signal_id"]),lineage)
            assert canonical_json(saved.model_dump(mode="json"))==canonical_json(rebuilt.model_dump(mode="json"))
            response=client.get(f"/v1/signals/{row['signal_id']}/investigation",params={"signal_set_id":manifest["signal_set_id"]})
            assert response.status_code==200 and response.json()==saved.model_dump(mode="json")
            sizes.append(len(response.content))
    assert before=={name:sha256_file(Path(name)) for name in before}
    assert publish(root)==artifact
    return {"investigation_set_id":artifact.name,"signal_set_id":manifest["signal_set_id"],"displayed_count":len(rows),"rebuild_and_api":"passed","parent_hashes_and_replay":"passed","payload_bytes_min":min(sizes,default=0),"payload_bytes_max":max(sizes,default=0)}


if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--data-root",type=Path,required=True)
    print(json.dumps(verify(parser.parse_args().data_root),indent=2))
