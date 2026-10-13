from datetime import date, datetime, timezone
from pathlib import Path
import json
import shutil

import duckdb
import pytest
from fastapi.testclient import TestClient
from decimal import Decimal

from memento.api import create_app, SupplyContext
from memento.signals import run_signals
from memento.supply import SupplyModel, arrival, order_arrivals, action_options, plan_replenishment, load_model
from test_prediction_pipeline import _canonical_fixture


def model_data():
    stages = {name: [1, 2, 3] for name in ("decision", "production", "vendor_fulfillment", "vendor_to_customer_dc", "customer_dc_processing", "customer_dc_to_store", "store_receiving")}
    return {"version":"synthetic-test-v1","classification":"synthetic_assumption","effective_from":"2026-01-01","effective_to":"2028-01-01","calendar":"elapsed_calendar_days","calibration":"engineering_only","provenance":{"basis":"synthetic fixture"},"stages":stages,"category_production":{"Toys":"production"},"routes":{"synthetic_domestic":["factory","vendor_dc","customer_dc","store"]},"actions":{"expedite_existing_shipment":{"stages":["customer_dc_to_store","store_receiving"],"prerequisites":["existing_in_transit","authority"]},"incremental_production":{"stages":["decision","$production","vendor_to_customer_dc","customer_dc_processing","customer_dc_to_store","store_receiving"],"prerequisites":["capacity"]}},"planning_policy":{"reorder_cover_days":10,"target_cover_days":32,"minimum_lost_units":1}}


def test_arrival_uses_milestone_and_preserves_explicit_or_overdue_dates():
    model = SupplyModel.model_validate(model_data())
    obs = date(2027,1,29)
    order = {"ordered_quantity":10,"received_quantity":2,"status_code":"in_transit","dc_invoiced_at":datetime(2027,1,28,tzinfo=timezone.utc),"expected_store_receipt_date":None}
    result = arrival(order,obs,model,"Toys")
    assert result["quantity"]==8
    assert (result["early"],result["typical"],result["conservative"]) == (date(2027,1,30),date(2027,2,1),date(2027,2,3))
    order["expected_store_receipt_date"]=date(2027,1,31)
    assert arrival(order,obs,model,"Toys")["typical"]==date(2027,1,31)
    order["expected_store_receipt_date"]=obs
    assert arrival(order,obs,model,"Toys")["typical"] is None


def test_actionability_is_unknown_without_prerequisites_and_timing_specific():
    model = SupplyModel.model_validate(model_data())
    unknown=action_options(10,model,"Toys",True,"availability")[0]
    assert unknown["timing"]=="robust" and unknown["feasibility"]=="unknown" and unknown["score"]==0
    assert action_options(10,model,"Toys",True,"availability",{"authority"})[0]["score"]==1
    assert action_options(3,model,"Toys",True,"availability",{"authority"})[0]["timing"]=="conditional"
    assert action_options(1,model,"Toys",True,"availability",{"authority"})[0]["timing"]=="too_late"
    assert action_options(10,model,"Toys",False,"availability")[0]["feasibility"]=="not_applicable"
    assert action_options(10,model,"Toys",True,"excess")==[]


def test_partial_order_keeps_open_and_transit_units_separate():
    model=SupplyModel.model_validate(model_data()); obs=date(2027,1,29)
    order={"ordered_quantity":100,"invoiced_quantity":60,"received_quantity":20,"status_code":"partially_received",
           "order_created_at":datetime(2027,1,28,tzinfo=timezone.utc),"dc_invoiced_at":datetime(2027,1,29,tzinfo=timezone.utc),"expected_store_receipt_date":None}
    portions=order_arrivals(order,obs,model,"Toys")
    assert [(row["order_state"],row["quantity"]) for row in portions]==[("open",40),("in_transit",40)]
    assert portions[0]["typical"]>portions[1]["typical"]


def test_planning_does_not_duplicate_firm_supply_and_repeats_deterministically():
    model=SupplyModel.model_validate(model_data()); obs=date(2027,1,29)
    assert plan_replenishment(30,[1]*28,obs,{date(2027,2,1):100},model,"Toys")==[]
    assert plan_replenishment(0,[1]*28,obs,{},model,"Toys",undated_outstanding=100)==[]
    plans=plan_replenishment(5,[1]*28,obs,{},model,"Toys")
    assert plans[0]["quantity"]==28
    assert plans==plan_replenishment(5,[1]*28,obs,{},model,"Toys")


def test_model_rejects_unordered_ranges_and_checksum_changes(tmp_path):
    value=model_data(); value["stages"]["production"]=[3,2,1]
    with pytest.raises(ValueError): SupplyModel.model_validate(value)
    value=model_data(); value["stages"]["production"]=[False,1,2]
    with pytest.raises(ValueError): SupplyModel.model_validate(value)
    path=tmp_path/"model.json"; path.write_text(json.dumps(model_data()))
    with pytest.raises(ValueError,match="checksum"): load_model(path,date(2027,1,29),"0"*64)


def test_supply_publication_api_and_independent_replay(tmp_path: Path):
    source=tmp_path/"source"; source.mkdir(); fixture=_canonical_fixture(source)
    product=fixture/"product/part-00000.parquet"
    with duckdb.connect() as con:
        table=con.execute("SELECT *, 'Toys'::VARCHAR source_fineline_name FROM read_parquet(?)",[str(product)]).to_arrow_table()
    import pyarrow.parquet as pq
    pq.write_table(table,product)
    from memento.manifest import sha256_file
    manifest=json.loads((fixture/"manifest.json").read_text())
    for row in manifest["files"]:
        if row["path"]=="product/part-00000.parquet": row.update(bytes=product.stat().st_size,sha256=sha256_file(product))
    (fixture/"manifest.json").write_text(json.dumps(manifest))
    root=tmp_path/"data"; target=root/"canonical/mds_fixture"; target.parent.mkdir(parents=True); shutil.copytree(fixture,target)
    model=tmp_path/"model.json"; model.write_text(json.dumps(model_data()))
    output=run_signals(target,data_root=root,annual_carrying_cost_rate=Decimal(".25"),carrying_rate_version="synthetic-test",supply_model_path=model)
    before={str(p.name):sha256_file(p) for p in output.iterdir()}
    assert run_signals(target,data_root=root,annual_carrying_cost_rate=Decimal(".25"),carrying_rate_version="synthetic-test",supply_model_path=model)==output
    assert before=={str(p.name):sha256_file(p) for p in output.iterdir()}
    client=TestClient(create_app(root)); queue=client.get("/v1/signals")
    assert queue.status_code==200
    for row in queue.json()["signals"]:
        response=client.get('/v1/signals/'+row["signal_id"])
        assert response.status_code==200,response.text
        context=SupplyContext.model_validate(response.json()["supply_context"])
        assert context.classification=="synthetic_assumption"
