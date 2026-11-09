from __future__ import annotations

from dataclasses import replace
from datetime import date

import duckdb
from fastapi.testclient import TestClient
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from memento.api import create_app
from memento.metric_publication import publish_metrics, validate_release
from memento.metric_serving import MetricStore
from memento.metric_source import member
from tests.metric_fixture import distribution_source, metric_fixture, refresh_manifest


@pytest.fixture
def published(tmp_path):
    canonical, source, config = metric_fixture(tmp_path)
    release = publish_metrics(canonical, source, config=config, data_root=tmp_path)
    return tmp_path, canonical, source, config, release


def read(release, table, where="true"):
    with duckdb.connect() as con:
        return con.execute(f"SELECT * FROM read_parquet(?) WHERE {where}", [str(release / (table + ".parquet"))]).to_arrow_table().to_pylist()


def test_velocity_denominator_consolidation_and_zero_days(published):
    row = read(published[-1], "metric_period", "grain='store' AND scope_id='loc_2' AND period_start=DATE '2026-11-21'")[0]
    assert row["sales_days"] == 6 and row["expected_days"] == 7
    assert row["sales_coverage"] == pytest.approx(6/7)
    assert row["store_day_rate"] == 1
    assert row["units_store_week"] == 7 and row["dollars_store_week"] == 70
    assert row["reported_oos_rate"] == 1 and row["in_stock_rate"] == 0
    zero = read(published[-1], "metric_period", "grain='store' AND scope_id='loc_3' AND period_start=DATE '2026-11-21'")[0]
    assert zero["sales_days"] == 7 and zero["units_store_week"] == 0


def test_promised_distribution_reconciles_and_does_not_invent_stockout(published):
    release = published[-1]
    row = read(release, "distribution_summary", "grain='item'")[0]
    assert (row["promised_stores"],row["stocked_stores"],row["confirmed_zero_stores"],row["unknown_stores"],row["unconfirmed_stores"]) == (4,1,2,1,3)
    current = {r["location_id"]: r for r in read(release,"current_store")}
    assert current["loc_4"]["current_state"] == "unknown_inventory"
    assert current["loc_4"]["on_hand"] is None
    assert current["loc_2"]["current_state"] == "reported_zero_on_hand"
    assert len(read(release,"checks","check_code='inventory_unknown'")) == 1
    assert len(read(release,"checks","check_code='promised_distribution_gap'")) == 2


def test_complete_periods_tiers_and_due_exposure(published):
    rows = read(published[-1],"metric_period","grain='store' AND scope_id='loc_3'")
    assert all(r["period_end"] <= date(2026,11,27) for r in rows)
    assert all(r["period_start"].weekday()==5 for r in rows if r["period_kind"]=="week")
    assert not any(r["period_start"]==date(2026,11,1) for r in rows if r["period_kind"]=="month")
    first = next(r for r in rows if r["period_start"]==date(2026,9,19))
    assert first["expected_days"] == 1
    assert read(published[-1],"current_store","location_id='loc_3'")[0]["tier"] == "unranked"
    assert read(published[-1],"current_store","location_id='loc_1'")[0]["tier"] == "high"


def test_same_store_comparisons_and_persistence(published):
    rows = read(published[-1],"metric_period","grain='store' AND scope_id='loc_1' AND period_kind='week'")
    first = next(r for r in rows if r["period_start"]==date(2026,11,14))
    second = next(r for r in rows if r["period_start"]==date(2026,11,21))
    assert first["trend_pct"] == 300 and not first["trend_highlight"]
    assert second["trend_pct"] == 0 and not second["trend_highlight"]  # sustained level != repeated growth
    item = read(published[-1],"metric_period","grain='item' AND period_start=DATE '2026-11-21'")[0]
    assert item["same_store_count"] == 3  # missing sale excludes store 2; real zero store 3 remains
    assert item["same_store_coverage"] == .75
    assert not item["trend_highlight"]


def test_weekday_observed_pattern_and_zero_total(published):
    rows = read(published[-1],"metric_weekday","grain='store' AND scope_id='loc_3'")
    assert len(rows)==7 and all(r["weekday_share"] is None for r in rows)
    assert {r["pattern_status"] for r in rows} == {"nonpositive_total_rate"}
    rows = read(published[-1],"metric_weekday","grain='store' AND scope_id='loc_1'")
    assert sum(r["weekday_share"] for r in rows) == pytest.approx(1)
    assert sum(r["weekday_index"] for r in rows) == pytest.approx(7)


def test_publication_immutable_idempotent_and_tamper_fails(published):
    root, canonical, source, config, release = published
    assert publish_metrics(canonical,source,config=config,data_root=root)==release
    assert validate_release(release)["population"]==4
    assert publish_metrics(canonical,source,config=replace(config,trend_percent=20),data_root=root,activate=False)!=release
    (release/"checks.parquet").write_bytes(b"corrupt synthetic fixture")
    with pytest.raises(ValueError,match="integrity"):
        MetricStore(root).metadata()
    assert TestClient(create_app(root)).get("/v1/metrics/metadata").status_code==503


@pytest.mark.parametrize("field,value", [("known_at","2026-11-29T00:00:00Z"), ("store_nbr",999), ("stocking_due_date","2026-07-01")])
def test_invalid_promises_rejected(tmp_path,field,value):
    canonical,source,config=metric_fixture(tmp_path)
    table=pq.read_table(source.path)
    rows=table.to_pylist()
    rows[0][field]=value
    pq.write_table(pa.Table.from_pylist(rows,schema=table.schema),source.path)
    with pytest.raises(ValueError):
        publish_metrics(canonical,distribution_source(source.path),config=config,data_root=tmp_path)


def test_due_date_future_keeps_observable_facts_but_not_current_shortfall(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    table=pq.read_table(source.path); rows=table.to_pylist()
    rows[2]["stocking_due_date"]="2026-12-01"
    pq.write_table(pa.Table.from_pylist(rows,schema=table.schema),source.path)
    release=publish_metrics(canonical,distribution_source(source.path),config=config,data_root=tmp_path)
    row=read(release,"current_store","location_id='loc_3'")[0]
    assert row["on_hand"]==0 and not row["promised_due"]
    assert row["current_state"]=="not_applicable"
    assert read(release,"distribution_summary","grain='item'")[0]["promised_stores"]==3


def test_duplicate_and_future_actuals_fail_boundary(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    path=canonical/"inventory_daily/part-00000.parquet"
    table=pq.read_table(path)
    pq.write_table(pa.concat_tables([table,table.slice(0,1)]),path); refresh_manifest(canonical)
    with pytest.raises(ValueError,match="duplicate"):
        publish_metrics(canonical,source,config=config,data_root=tmp_path)


def test_no_forecasts_or_economics_required_for_basic_metrics(published):
    assert not (published[1]/"demand_forecast_weekly").exists()
    assert read(published[-1],"current_store","location_id='loc_2'")[0]["reported_zero_on_hand"]


def test_api_pagination_all_pairs_history_and_release_pinning(published):
    client=TestClient(create_app(published[0]))
    meta=client.get("/v1/metrics/metadata").json()
    assert meta["population"]==4 and len(meta["items"])==1
    response=client.get("/v1/metrics/stores?limit=2&offset=2&release_id="+meta["metric_release_id"])
    assert response.status_code==200 and response.json()["total"]==4
    assert len(response.json()["rows"])==2
    assert client.get("/v1/metrics/periods?grain=store&scope_id=loc_3").json()["total"]>1
    assert client.get("/v1/metrics/stores?limit=201").status_code==422
    assert client.get("/v1/metrics/stores?release_id=../../etc").status_code==422
    assert client.get("/v1/metrics/periods?period_start=2026-99-99").status_code==422


def test_symlink_and_traversal_rejected(tmp_path):
    target=tmp_path/"real"; target.write_text("fixture")
    (tmp_path/"link").symlink_to(target)
    for name in ("link","../real","./real"):
        with pytest.raises(ValueError): member(tmp_path,name)


def rewrite_sales(canonical, transform):
    file=canonical/"sales_daily/part-00000.parquet"
    original=pq.read_table(file)
    rows=original.to_pylist()
    for row in rows:
        transform(row)
        row["sales_amount"]=10*row["sales_quantity"]
    pq.write_table(pa.Table.from_pylist(rows,schema=original.schema),file)
    refresh_manifest(canonical)


def test_persistent_increases_highlight_and_tiers_stay_frozen(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    def transform(row):
        if row["location_id"]=="loc_1" and date(2026,11,14)<=row["business_date"]<=date(2026,11,20):
            row["sales_quantity"]=2
    rewrite_sales(canonical,transform)
    release=publish_metrics(canonical,source,config=config,data_root=tmp_path)
    row=read(release,"metric_period","grain='store' AND scope_id='loc_1' AND period_start=DATE '2026-11-21'")[0]
    assert row["trend_pct"]==100 and row["trend_highlight"]
    assert row["adjusted_unit_change"]==14
    assert read(release,"current_store","location_id='loc_1'")[0]["tier"]=="high"


def test_from_zero_and_monthly_comparisons(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    def transform(row):
        if row["location_id"]=="loc_3" and row["business_date"]>=date(2026,11,21):
            row["sales_quantity"]=2
    rewrite_sales(canonical,transform)
    release=publish_metrics(canonical,source,config=config,data_root=tmp_path)
    row=read(release,"metric_period","grain='store' AND scope_id='loc_3' AND period_start=DATE '2026-11-21'")[0]
    assert row["trend_pct"] is None and row["trend_status"]=="from_zero"
    assert row["rate_change"]==2 and not row["trend_highlight"]
    month=read(release,"metric_period","grain='store' AND scope_id='loc_2' AND period_kind='month' AND period_start=DATE '2026-10-01'")[0]
    assert month["units"]==31 and month["prior_rate"]==1 and month["trend_pct"]==0


def test_weekday_pattern_is_exposure_adjusted_not_uniform(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    def transform(row):
        if row["location_id"]=="loc_1": row["sales_quantity"]=row["business_date"].isoweekday()
    rewrite_sales(canonical,transform)
    release=publish_metrics(canonical,source,config=config,data_root=tmp_path)
    for row in read(release,"metric_weekday","grain='store' AND scope_id='loc_1'"):
        assert row["weekday_rate"]==row["weekday"]
        assert row["weekday_share"]==pytest.approx(row["weekday"]/28)
        assert row["weekday_index"]==pytest.approx(row["weekday"]/4)


def test_missing_promised_pair_does_not_disappear(tmp_path):
    canonical,source,config=metric_fixture(tmp_path)
    for table in ("inventory_daily","sales_daily"):
        path=canonical/table/"part-00000.parquet"
        with duckdb.connect() as con:
            data=con.execute("SELECT * FROM read_parquet(?) WHERE location_id<>'loc_4'",[str(path)]).to_arrow_table()
        pq.write_table(data,path)
    refresh_manifest(canonical)
    release=publish_metrics(canonical,source,config=config,data_root=tmp_path)
    assert len(read(release,"current_store"))==4
    assert read(release,"current_store","location_id='loc_4'")[0]["current_state"]=="unknown_inventory"
    assert read(release,"distribution_summary","grain='item'")[0]["unknown_stores"]==1


def test_api_check_names_and_state_filter(published):
    client=TestClient(create_app(published[0]))
    rows=client.get("/v1/metrics/checks?check_code=inventory_unknown").json()["rows"]
    assert len(rows)==1 and rows[0]["location_name"]=="Store 4"
    assert client.get("/v1/metrics/stores?current_state=reported_zero_on_hand").json()["total"]==2
