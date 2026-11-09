"""Known-answer stockout counterfactuals use observable inputs, never scenario labels."""
from datetime import date, timedelta

from fastapi.testclient import TestClient
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from memento.api import create_app
from memento.metric_attention import attention_values, AttentionAssumptions
from tests.test_metric_backend_v2 import supply_fixture
from tests.test_planned_supply import planned_source, publish

OBS = date(2026,9,25)
FID = "find_" + "a"*64


def world(root, *, receipt_day=None, receipt_qty=100, baseline_days=14, missing_sale=False, missing_projection=False, price=10.):
    def write(name, rows):
        pq.write_table(pa.Table.from_pylist(rows), root / (name + ".parquet"))
    write("finding_evidence", [dict(finding_id=FID, finding_code="current_out_of_stock", product_id="p", location_id="s",
        inventory_capital_amount=None, retail_exposure_amount=None, event_date=OBS)])
    write("current_store", [dict(location_id="s", product_id="p", consecutive_zero_days=3)])
    write("supply_assessment", [dict(location_id="s", product_id="p", unit_retail_amount=price, demand_base_28d=28.)])
    write("expected_supply_assessment", [dict(location_id="s", product_id="p", estimated_unfulfilled_retail_amount=280.)])
    write("daily", [dict(location_id="s", product_id="p", business_date=OBS-timedelta(days=i), eligible=True,
        sales_valid=not(missing_sale and i==1), inventory_valid=True, on_hand=0. if i<3 else 10.,
        dollars=0. if i<3 else 20.) for i in range(baseline_days+3)])
    stock=0.
    projections=[]
    for i in range(1,29):
        inbound=float(receipt_qty if i==receipt_day else 0)
        unfulfilled=max(0.,1-stock-inbound)
        stock=max(0.,stock+inbound-1)
        projections.append(dict(location_id="s", product_id="p", path="base", projection_date=OBS+timedelta(days=i),
            demand_units=1., inbound_units=inbound, unfulfilled_units=unfulfilled, ending_units=stock))
    write("supply_projection", projections[:-1] if missing_projection else projections)
    return {"metric_release_id":"met_"+"a"*64,"observation_date":OBS.isoformat()}


def test_own_in_stock_sales_and_declared_lead_time_have_known_dollar_answer(tmp_path):
    result=attention_values(tmp_path, world(tmp_path), finding_id=FID)
    row=result["rows"][0]
    assert row["retrospective_amount"] == 60  # $20/day × 3 observed zero days
    assert row["forward_amount"] == 210  # Walmart $10/day × declared 21-day scenario
    assert row["amount"] == 270
    assert row["members"][0]["baseline_basis"] == "own_store_in_stock_sales"
    assert row["assumed_receipt_stores"] == 1
    assert next(b for b in result["buckets"] if b["key"] == "z")["amount"] == 270


def test_real_firm_recovery_replaces_assumed_lead_and_receipt_day_is_not_double_counted(tmp_path):
    result=attention_values(tmp_path, world(tmp_path, receipt_day=5), finding_id=FID)
    row=result["rows"][0]
    assert row["forward_amount"] == 40  # days 1–4 only; receipt covers day 5
    assert row["amount"] == 100
    assert row["assumed_receipt_stores"] == 0
    assert row["window_end_date"] == (OBS+timedelta(days=5)).isoformat()


def test_small_partial_receipt_does_not_imply_recovery(tmp_path):
    row=attention_values(tmp_path, world(tmp_path, receipt_day=5, receipt_qty=1), finding_id=FID)["rows"][0]
    assert row["forward_amount"] == 270
    assert row["members"][0]["receipt_basis"] == "partial_firm_receipts_no_recovery_within_28d"


def test_forecast_proxy_is_explicit_when_own_stocked_sales_are_insufficient(tmp_path):
    row=attention_values(tmp_path, world(tmp_path, baseline_days=2), finding_id=FID)["rows"][0]
    assert row["retrospective_amount"] == 30
    assert row["historical_baseline_stores"] == 0
    assert row["members"][0]["baseline_basis"] == "current_retailer_forecast_proxy_not_historical_sales"


@pytest.mark.parametrize("kwargs", [{"missing_sale":True},{"missing_projection":True},{"price":None}])
def test_missing_evidence_is_not_a_zero_or_a_full_valuation(tmp_path, kwargs):
    row=attention_values(tmp_path, world(tmp_path, **kwargs), finding_id=FID)["rows"][0]
    assert row["amount"] is None and row["valued_count"] == 0


def test_config_is_explicit_validated_and_changes_only_scenario_horizon(tmp_path):
    manifest=world(tmp_path)
    assumptions=AttentionAssumptions(retailer_dc_to_store_days=2)
    row=attention_values(tmp_path, manifest, assumptions=assumptions)["rows"][0]
    assert row["retrospective_amount"] == 60 and row["forward_amount"] == 160
    with pytest.raises(ValueError):
        AttentionAssumptions(po_authorization_days=90)


def test_future_actuals_cannot_change_retrospective_or_forward_estimates(tmp_path):
    manifest=world(tmp_path)
    before=attention_values(tmp_path,manifest)
    file=tmp_path / "daily.parquet"
    rows=pq.read_table(file).to_pylist()
    rows.append({**rows[0],"business_date":OBS+timedelta(days=1),"dollars":999999.,"on_hand":99999.})
    pq.write_table(pa.Table.from_pylist(rows),file)
    assert attention_values(tmp_path,manifest) == before


def test_endpoint_is_pinned_read_only_and_rejects_corrupt_publications(tmp_path):
    canonical, source, config=supply_fixture(tmp_path)
    release=publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    client=TestClient(create_app(tmp_path))
    query={"release_id":release.name}
    response=client.get("/v1/metrics/attention-values",params=query)
    assert response.status_code == 200
    value=response.json()
    assert value["metric_release_id"] == release.name
    assert all(r["lane"] in {"a","z","i"} for r in value["rows"])
    assert all("members" not in r for r in value["rows"])
    first=value["rows"][0]
    detail=client.get("/v1/metrics/attention-values",params={**query,"finding_id":first["finding_id"]}).json()
    assert len(detail["rows"][0]["members"]) == first["member_count"]
    assert detail["rows"][0]["amount"] == first["amount"]
    assert client.get("/v1/metrics/attention-values",params={**query,"finding_id":"../bad"}).status_code == 422
    assert client.post("/v1/metrics/attention-values").status_code == 405
    with (release / "daily.parquet").open("ab") as stream:
        stream.write(b"corrupt")
    assert client.get("/v1/metrics/attention-values",params=query).status_code == 503
    assert not (tmp_path / "metrics/current.json").exists()
