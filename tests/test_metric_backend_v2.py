from __future__ import annotations

from dataclasses import replace
from datetime import date, datetime, UTC
import json

import duckdb
from fastapi.testclient import TestClient
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from memento.api import create_app
from memento.metric_publication import publish_metrics
from tests.metric_fixture import metric_fixture, distribution_source, refresh_manifest
from tests.test_descriptive_metrics import read, rewrite_sales


def rewrite_table(canonical, table, query):
    prior=json.loads((canonical/"manifest.json").read_text())
    file=canonical/table/"part-00000.parquet"
    file.parent.mkdir(exist_ok=True)
    with duckdb.connect() as con:
        if file.exists():
            con.read_parquet(str(file)).create_view("original")
        result=con.sql(query).to_arrow_table()
    pq.write_table(result,file)
    refresh_manifest(canonical)
    refreshed=json.loads((canonical/"manifest.json").read_text())
    for key in ("as_of","dataset_id","source_release_set_manifest_sha256"):
        refreshed[key]=prior[key]
    (canonical/"manifest.json").write_text(json.dumps(refreshed,sort_keys=True))


def supply_fixture(root):
    canonical,source,config=metric_fixture(root)
    rewrite_table(canonical,"inventory_daily","""SELECT *,0::BIGINT on_order_quantity,0::BIGINT in_transit_quantity,
      0::BIGINT receipt_quantity,10.0::DOUBLE current_unit_retail_amount FROM original""")
    rewrite_table(canonical,"calendar_day","""SELECT d::DATE calendar_date,isodow(d)::INTEGER calendar_weekday_number,
      (202631+floor(date_diff('day',DATE '2026-08-01',d)/7))::INTEGER retail_year_week
      FROM range(DATE '2026-08-01',DATE '2026-12-26',INTERVAL 1 DAY) t(d)""")
    rewrite_table(canonical,"demand_forecast_weekly","""SELECT 'loc_'||s location_id,'prd_100' product_id,
      w::INTEGER target_retail_year_week,(w-a)::INTEGER forecast_created_retail_year_week,7.0::DOUBLE forecast_quantity
      FROM range(202631,202653) t(w) CROSS JOIN range(1,5) u(s) CROSS JOIN range(1,5) ahead(a)""")
    rewrite_table(canonical,"replenishment_commitment","""SELECT NULL::VARCHAR location_id,NULL::VARCHAR product_id,
      NULL::VARCHAR retailer_order_id,NULL::INTEGER order_line_number,NULL::INTEGER event_version,
      NULL::BIGINT ordered_quantity,NULL::BIGINT invoiced_quantity,NULL::BIGINT received_quantity,
      NULL::TIMESTAMPTZ order_created_at,NULL::TIMESTAMPTZ known_at,NULL::DATE expected_store_receipt_date,
      NULL::VARCHAR status_code WHERE false""")
    return canonical,source,config


def test_missing_nonpromised_inventory_keeps_expected_exposure(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    promises=pq.read_table(source.path)
    rows=[r for r in promises.to_pylist() if r["store_nbr"]!=4]
    pq.write_table(pa.Table.from_pylist(rows,schema=promises.schema),source.path)
    release=publish_metrics(canonical,distribution_source(source.path),data_root=tmp_path,config=config)
    current=read(release,"current_store","location_id='loc_4'")[0]
    assert current["current_state"]=="unknown_inventory"
    weekly=read(release,"metric_period","grain='store' AND scope_id='loc_4' AND period_start=DATE '2026-11-21'")[0]
    assert weekly["expected_days"]==7 and weekly["inventory_days"]==6


def test_cutoff_inactive_status_does_not_erase_historical_metrics(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    rewrite_table(canonical,"product","SELECT * REPLACE('INACTIVE' AS source_status_code) FROM original")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    assert {r["current_state"] for r in read(release,"current_store")}=={"not_applicable"}
    assert read(release,"metric_period","grain='store' AND scope_id='loc_1' AND period_kind='week' AND period_start=DATE '2026-08-01'")[0]["units"]==7


def test_ended_mapping_keeps_only_its_historical_effective_dates(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    rewrite_table(canonical,"company_item","SELECT * REPLACE(DATE '2026-10-31' AS effective_to) FROM original")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    assert read(release,"metric_period","grain='item' AND period_start=DATE '2026-10-01'")[0]["expected_days"]==124
    assert not read(release,"metric_period","period_start=DATE '2026-11-21'")


def test_coverage_checks_and_weekday_qualification(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    rewrite_table(canonical,"sales_daily","SELECT * FROM original WHERE NOT(location_id='loc_1' AND business_date>=DATE '2026-11-01' AND isodow(business_date)=1)")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    assert read(release,"checks","location_id='loc_1' AND check_code='sales_coverage_low'")
    weekday=read(release,"metric_weekday","grain='store' AND scope_id='loc_1'")
    assert {r["pattern_status"] for r in weekday}=={"insufficient_evidence"}
    assert all(r["weekday_share"] is None for r in weekday)
    assert all(r["weekday_rate"] is not None for r in weekday)


def test_oos_duration_breaks_at_missing_evidence_and_recovers(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    rewrite_table(canonical,"inventory_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_2' AND business_date=DATE '2026-11-26'
      THEN 5 ELSE on_hand_quantity END AS on_hand_quantity) FROM original
      WHERE NOT(location_id='loc_3' AND business_date=DATE '2026-11-25')""")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    current={r["location_id"]:r for r in read(release,"current_store")}
    assert current["loc_2"]["consecutive_zero_days"]==1
    assert current["loc_3"]["consecutive_zero_days"]==2
    episodes=read(release,"stockout_episode","location_id='loc_3'")
    assert len(episodes)==2 and any(r["end_reason"]=="inventory_gap" for r in episodes)
    assert next(r for r in episodes if r["onset_date"]==date(2026,11,26))["left_censored"]
    assert any(r["recovery_date"]==date(2026,11,26) for r in read(release,"stockout_episode","location_id='loc_2'"))


def test_dollar_and_total_trends_are_distinct_from_unit_velocity(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    rewrite_table(canonical,"sales_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_2' AND business_date>=DATE '2026-11-21'
      THEN 20.0 ELSE sales_amount END AS sales_amount) FROM original""")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    rows={r["measure"]:r for r in read(release,"metric_trend","grain='store' AND scope_id='loc_2' AND period_start=DATE '2026-11-21'")}
    # The missing day makes this pair insufficient for same-store comparison.
    assert rows["unit_velocity"]["comparison_status"]=="insufficient_comparable_history"
    assert rows["retail_sales"]["absolute_change"]==50
    assert rows["retail_sales"]["comparison_basis"]=="total_including_distribution"
    assert rows["units"]["absolute_change"]==-1


def test_supply_population_projection_and_missing_economics(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    rows={r["location_id"]:r for r in read(release,"supply_assessment")}
    assert len(rows)==4
    assert rows["loc_1"]["days_of_cover"]>0
    assert rows["loc_1"]["base_unfulfilled_units"]>0
    assert rows["loc_1"]["estimated_unfulfilled_retail_amount"]>0
    assert rows["loc_1"]["estimated_retail_minus_cost_amount"] is None
    assert "unit_cost_unavailable" in rows["loc_1"]["reasons"]
    assert rows["loc_4"]["projection_status"]=="insufficient_data"
    assert rows["loc_4"]["demand_base_28d"]>0  # forecast readiness independent of inventory
    trace=read(release,"supply_projection","location_id='loc_1'")
    assert len(trace)==84
    assert all(r["ending_units"]>=0 and r["opening_units"]+r["inbound_units"]-r["fulfilled_units"]==pytest.approx(r["ending_units"]) for r in trace)
    assert rows["loc_2"]["current_state"]=="reported_zero_on_hand"


def test_missing_forecast_does_not_hide_confirmed_oos(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"demand_forecast_weekly","SELECT * FROM original WHERE location_id<>'loc_2'")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_2'")[0]
    assert row["current_state"]=="reported_zero_on_hand" and row["projection_status"]=="insufficient_data"
    assert "forward_forecast_incomplete" in row["reasons"]
    assert read(release,"checks","location_id='loc_2' AND check_code='reported_zero_on_hand'")


def test_future_forecast_is_not_used_and_trace_is_unchanged(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    first=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    rewrite_table(canonical,"demand_forecast_weekly","""SELECT * REPLACE(CASE WHEN forecast_created_retail_year_week=202650
      THEN 10000.0 ELSE forecast_quantity END AS forecast_quantity) FROM original""")
    # 202650 is a future creation week for this November 28 cutoff.
    second=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    assert read(first,"supply_projection")==read(second,"supply_projection")


def test_backend_api_serves_new_tables_without_rank_fields(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    client=TestClient(create_app(tmp_path))
    for kind in ("supply","orders","projection","trends","daily","episodes"):
        response=client.get(f"/v1/metrics/{kind}?release_id={release.name}&limit=200")
        assert response.status_code==200
    supply=client.get("/v1/metrics/supply").json()
    assert supply["total"]==4
    assert not any("rank" in k or "action" in k for r in supply["rows"] for k in r)


def set_orders(canonical, rows):
    path=canonical/"replenishment_commitment/part-00000.parquet"
    schema=pq.read_table(path).schema
    pq.write_table(pa.Table.from_pylist(rows,schema=schema),path)
    refresh_manifest(canonical)


def order(**kwargs):
    return {"location_id":"loc_1","product_id":"prd_100","retailer_order_id":"PO-FIXTURE-1",
            "order_line_number":1,"event_version":1,"ordered_quantity":10,"invoiced_quantity":0,"received_quantity":0,
            "order_created_at":datetime(2026,11,20,tzinfo=UTC),"known_at":datetime(2026,11,21,tzinfo=UTC),
            "expected_store_receipt_date":date(2026,11,30),"status_code":"ordered",**kwargs}


def test_partial_po_uses_latest_known_outstanding_quantity_once(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    set_orders(canonical,[order(),order(event_version=2,known_at=datetime(2026,11,26,tzinfo=UTC),invoiced_quantity=10,
                                    received_quantity=4,status_code="in_transit"),
                          order(event_version=3,known_at=datetime(2026,11,29,tzinfo=UTC),invoiced_quantity=10,received_quantity=10,status_code="received")])
    rewrite_table(canonical,"inventory_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27'
      THEN 6 ELSE 0 END::BIGINT AS in_transit_quantity) FROM original""")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["firm_outstanding_units"]==6 and row["firm_in_transit_units"]==6
    assert row["supply_evidence_status"]=="reconciled"
    evidence=read(release,"supply_order","location_id='loc_1'")
    assert len(evidence)==1 and evidence[0]["event_version"]==2
    trace=read(release,"supply_projection","location_id='loc_1' AND path='base'")
    assert sum(r["inbound_units"] for r in trace)==6
    assert next(r for r in trace if r["projection_date"]==date(2026,11,30))["inbound_units"]==6


def test_overdue_undated_and_beyond_horizon_are_not_assumed_receipts(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    set_orders(canonical,[order(expected_store_receipt_date=date(2026,11,26)),
                          order(retailer_order_id="PO-UNDATED",expected_store_receipt_date=None),
                          order(retailer_order_id="PO-LATER",expected_store_receipt_date=date(2027,1,1))])
    rewrite_table(canonical,"inventory_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27'
      THEN 30 ELSE 0 END::BIGINT AS on_order_quantity) FROM original""")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["overdue_units"]==row["undated_units"]==row["beyond_horizon_units"]==10
    assert row["dated_future_units"]==0 and row["firm_outstanding_units"]==30
    assert row["supply_evidence_status"]=="known_with_timing_gaps"
    assert sum(r["inbound_units"] for r in read(release,"supply_projection","location_id='loc_1' AND path='base'"))==0


def test_supply_balance_mismatch_makes_projection_unknown_not_healthy(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    set_orders(canonical,[order()])  # no corresponding observed inventory balance
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["projection_status"]=="insufficient_data" and row["base_depletion_date"] is None
    assert "firm_supply_balance_mismatch" in row["reasons"]
    assert row["demand_base_28d"]>0


def test_cancelled_order_does_not_create_firm_supply(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    set_orders(canonical,[order(status_code="cancelled")])
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["firm_outstanding_units"]==0 and row["supply_evidence_status"]=="reconciled"
    assert not read(release,"supply_order")[0]["included_in_projection"]


def test_future_po_version_has_no_effect_on_firm_supply(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    first=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    set_orders(canonical,[order(known_at=datetime(2026,11,29,tzinfo=UTC),order_created_at=datetime(2026,11,29,tzinfo=UTC))])
    second=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    assert read(first,"supply_assessment")==read(second,"supply_assessment")
    assert read(first,"supply_projection")==read(second,"supply_projection")


def test_depletion_and_unfulfilled_dates_are_distinct(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    # Uniform one unit/day, exact ten units on hand; other stores' sales stay flat.
    rewrite_table(canonical,"sales_daily","SELECT * REPLACE(1::BIGINT AS sales_quantity,10.0::DOUBLE AS sales_amount) FROM original")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["days_of_cover"]==10
    assert row["base_unfulfilled_date"]==row["base_depletion_date"].fromordinal(row["base_depletion_date"].toordinal()+1)


def test_zero_reference_demand_has_no_invented_cover_or_unfulfilled_units(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"demand_forecast_weekly","SELECT * REPLACE(0.0 AS forecast_quantity) FROM original")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["days_of_cover"] is None and row["cover_status"]=="nonpositive_reference_demand"
    assert row["base_unfulfilled_units"]==0 and row["base_unfulfilled_date"] is None


def test_incomplete_calendar_and_receipt_mismatch_are_explicit(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"calendar_day","SELECT * FROM original WHERE calendar_date<>DATE '2026-12-01'")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["projection_status"]=="insufficient_data" and "forward_calendar_incomplete" in row["reasons"]
    assert read(release,"current_store","location_id='loc_2'")[0]["reported_zero_on_hand"]


def test_receipt_gap_does_not_hide_behind_matching_open_balances(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"inventory_daily","""SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27'
      THEN 5 ELSE 0 END::BIGINT AS receipt_quantity) FROM original""")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["supply_reconciliation_gap_units"]==0 and row["receipt_reconciliation_gap_units"]==5
    assert row["projection_status"]=="insufficient_data" and "firm_receipt_balance_mismatch" in row["reasons"]


def test_actuals_after_cutoff_are_rejected(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"sales_daily","""SELECT * FROM original UNION ALL
      SELECT DATE '2026-11-28','loc_1','prd_100',1,10.0""")
    with pytest.raises(ValueError,match="future"):
        publish_metrics(canonical,source,data_root=tmp_path,config=config)


def test_economics_are_effective_dated_but_do_not_select_actions(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"company_item","SELECT *,'MIRO_TOYS' company_id FROM original")
    rewrite_table(canonical,"company_item_economics","""SELECT 'MIRO_TOYS' company_id,'GAME-100' company_item_id,
      4.0 unit_cost_amount,DATE '2026-08-01' effective_from,DATE '2026-12-01' effective_to
      UNION ALL SELECT 'MIRO_TOYS','GAME-100',100.0,DATE '2026-12-02',NULL""")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["economics_status"]=="available" and row["unit_cost_amount"]==4
    assert row["estimated_retail_minus_cost_amount"]==pytest.approx(row["base_unfulfilled_units"]*6)
    assert row["estimated_unfulfilled_retail_amount"]==pytest.approx(row["base_unfulfilled_units"]*10)
