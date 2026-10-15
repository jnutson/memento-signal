import json
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from investigation_fixture import build_canonical, build_model
from memento.api import create_app
from memento.attention_priority import prioritize
from memento.investigation import _receipt_events, publish, weekly_rows
from memento.investigation_contract import Day, Investigation
from memento.manifest import sha256_file
from memento.signals import run_signals


@pytest.fixture
def runtime(tmp_path):
    canonical=build_canonical(tmp_path)
    baseline=run_signals(canonical,data_root=tmp_path,annual_carrying_cost_rate=Decimal(".25"),carrying_rate_version="test-v1")
    prioritize(baseline/"manifest.json",data_root=tmp_path)
    return tmp_path


def test_all_four_paths_publish_reconcile_and_keep_parent_immutable(runtime):
    before={str(p):sha256_file(p) for folder in ("canonical","signals","predictions") for p in (runtime/folder).rglob("*") if p.is_file()}
    release=publish(runtime)
    assert publish(runtime)==release
    assert before=={path:sha256_file(__import__("pathlib").Path(path)) for path in before}
    client=TestClient(create_app(runtime))
    queue=client.get("/v1/signals").json()
    seen=set()
    for signal in queue["signals"]:
        response=client.get(f"/v1/signals/{signal['signal_id']}/investigation",params={"signal_set_id":queue['run']['signal_set_id']})
        assert response.status_code==200
        value=Investigation.model_validate(response.json())
        seen.add((value.signal_type,value.direction))
        assert all(d.date<=value.observation_date for d in value.days if d.phase=="actual")
        assert all(w.forecast_vintage<w.week for w in value.weeks if w.forecast_vintage is not None)
        if value.signal_type=="demand_momentum":
            assert [w.role for w in value.weeks if w.phase=="actual" and w.role!="excluded"]==["baseline"]*6+["recent"]*2
            assert value.diagnostics.multiplier==(.5 if value.direction=="deceleration" else 1.5)
        if value.signal_type=="availability":
            assert value.receipts[0].order_reference=="test-order"
            assert value.receipts[0].state=="open"
            assert any(d.receipts==10 for d in value.days if d.series=="base")
        altered=value.model_dump(mode="json")
        altered["weeks"][0]["stock"]=999
        with pytest.raises(ValueError,match="weekly balances"):
            Investigation.model_validate(altered)
    assert seen=={("availability","risk"),("demand_momentum","acceleration"),("demand_momentum","deceleration"),("inventory_imbalance","excess")}


def test_api_missing_changed_invalid_and_corrupted_release(runtime):
    client=TestClient(create_app(runtime))
    queue=client.get("/v1/signals").json();sid=queue["signals"][0]["signal_id"];parent=queue["run"]["signal_set_id"]
    url=f"/v1/signals/{sid}/investigation"
    assert client.get(url,params={"signal_set_id":parent}).json()["code"]=="investigation_unavailable"
    assert client.get(url,params={"signal_set_id":"other"}).status_code==409
    assert client.get("/v1/signals/bad/investigation",params={"signal_set_id":parent}).status_code==422
    release=publish(runtime)
    member=release/f"{sid}.json"
    member.write_text("{}")
    assert client.get(url,params={"signal_set_id":parent}).status_code==503
    with pytest.raises(ValueError): publish(runtime)


def test_non_synthetic_canonical_is_rejected(runtime):
    parent=json.loads((runtime/"signals"/json.loads((runtime/"signals/current.json").read_text())["manifest"]).read_text())
    path=runtime/"canonical"/parent["canonical_dataset_id"]/"manifest.json"
    value=json.loads(path.read_text());value["source_classification"]="customer";path.write_text(json.dumps(value))
    with pytest.raises(ValueError,match="synthetic"):
        publish(runtime)


def test_partial_missing_and_zero_cover_do_not_invent_balances():
    rows=[Day(date="2027-01-01",week=202701,phase="actual",series="history",stock=8,sales=2,receipts=0),
          Day(date="2027-01-02",week=202701,phase="actual",series="history",opening=8,stock=7,sales=1,receipts=0)]
    weeks=weekly_rows(rows,{}, {})
    assert weeks[0].stock==7 and weeks[0].opening is None and weeks[0].sales==3 and weeks[0].partial
    rows[1].sales=None
    assert weekly_rows(rows,{}, {})[0].sales is None


def test_supply_comparisons_have_frozen_trace_totals_and_prerequisites(runtime):
    model=build_model(runtime)
    canonical=runtime/"canonical/mds_investigation_fixture"
    baseline=run_signals(canonical,data_root=runtime,annual_carrying_cost_rate=Decimal(".25"),carrying_rate_version="test-v1",supply_model_path=model)
    prioritize(baseline/"manifest.json",data_root=runtime)
    publish(runtime)
    client=TestClient(create_app(runtime))
    queue=client.get("/v1/signals").json()
    row=next(row for row in queue["signals"] if row["signal_type"]=="availability")
    detail=client.get(f"/v1/signals/{row['signal_id']}").json()
    response=client.get(f"/v1/signals/{row['signal_id']}/investigation",params={"signal_set_id":queue["run"]["signal_set_id"]})
    assert response.status_code==200
    value=Investigation.model_validate(response.json())
    for scenario in ("committed","early","typical","conservative"):
        trace=[day for day in value.days if day.series==scenario]
        assert len(trace)==28
        assert sum(day.lost for day in trace)==pytest.approx(detail["supply_context"]["supply_timing"][scenario]["lost_units"])
    assert any(event.state=="planned" for event in value.receipts)
    assert all(action["score"]==0 for action in detail["supply_context"]["actions"])


def test_partial_invoice_cancel_and_missing_event_identity():
    order={"retailer_order_id":"order","order_line_number":1,"event_version":2,"ordered_quantity":10,"invoiced_quantity":6,"received_quantity":2,"status_code":"open","known_at":"2027-01-01T12:00:00Z"}
    context={"arrivals":[{"order_state":"open","quantity":4,"early":None,"typical":None,"conservative":None,"basis":"overdue"},{"order_state":"in_transit","quantity":4,"early":"2027-02-01","typical":"2027-02-02","conservative":"2027-02-03","basis":"assumed"}],"planned_replenishment":[]}
    events=_receipt_events(context,[order],"sig_test")
    assert [e.state for e in events]==["open","in_transit"] and sum(e.quantity for e in events)==8
    assert all(e.order_reference=="order" and e.version==2 for e in events)
    events=_receipt_events(context,[{**order,"status_code":"cancelled"}],"sig_test")
    assert all(e.order_reference is None and e.reference_status=="unavailable" for e in events)


def test_zero_forward_demand_publishes_null_cover_not_infinity(tmp_path):
    import pyarrow.parquet as pq
    canonical=build_canonical(tmp_path)
    path=canonical/"demand_forecast_weekly/part-00000.parquet"
    table=pq.read_table(path);rows=table.to_pylist()
    for row in rows:
        if row["product_id"]=="prd_excess" and row["target_retail_year_week"]>=202657:
            row["forecast_quantity"]=Decimal(0)
    import pyarrow as pa
    pq.write_table(pa.Table.from_pylist(rows,schema=table.schema),path)
    mf=canonical/"manifest.json";manifest=json.loads(mf.read_text())
    for entry in manifest["files"]:
        if entry["path"]=="demand_forecast_weekly/part-00000.parquet":entry.update(bytes=path.stat().st_size,sha256=sha256_file(path))
    mf.write_text(json.dumps(manifest))
    run_signals(canonical,data_root=tmp_path,annual_carrying_cost_rate=Decimal(".25"),carrying_rate_version="test-v1")
    publish(tmp_path)
    client=TestClient(create_app(tmp_path));queue=client.get("/v1/signals").json()
    row=next(row for row in queue["signals"] if row["product_id"]=="prd_excess" and row["signal_type"]=="inventory_imbalance")
    value=client.get(f"/v1/signals/{row['signal_id']}/investigation",params={"signal_set_id":queue["run"]["signal_set_id"]}).json()
    assert value["reference_weekly_demand"]==0 and value["cover_status"]=="zero_reference_demand"
    assert all(day["cover"] is None for day in value["days"])

