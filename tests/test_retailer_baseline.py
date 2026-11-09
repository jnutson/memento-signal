"""Retailer quantity is authoritative; corrections are explicit challengers."""
from dataclasses import replace
from datetime import date,datetime,UTC

import pytest

from memento.metric_publication import publish_metrics,validate_release
from memento.metric_replay import evaluate_observable
from tests.test_metric_backend_v2 import supply_fixture,rewrite_table,set_orders,order
from tests.test_descriptive_metrics import read
from tests.test_metric_replay import cutoff_fixture


def test_default_forecast_is_unchanged_despite_sales_bias(tmp_path):
    canonical,source,config=supply_fixture(tmp_path)
    rewrite_table(canonical,"sales_daily","SELECT * REPLACE(3::BIGINT AS sales_quantity,30.0::DOUBLE AS sales_amount) FROM original")
    baseline=publish_metrics(canonical,source,data_root=tmp_path,config=config,activate=False)
    adjusted=publish_metrics(canonical,source,data_root=tmp_path,config=replace(config,demand_model="historical_adjusted"),activate=False)
    assert baseline!=adjusted
    row=read(baseline,"supply_assessment","location_id='loc_1'")[0]
    assert row["demand_model"]=="retailer_baseline"
    assert row["forecast_bias"]==1
    assert row["weekday_shaping"]=="uniform_weekly_conservation"
    assert row["demand_base_28d"]==pytest.approx(28)
    assert read(adjusted,"supply_assessment","location_id='loc_1'")[0]["demand_base_28d"]>28
    assert all(r["retailer_forecast_units"]==r["adjusted_weekly_units"] for r in read(baseline,"supply_forecast"))
    trace=read(baseline,"supply_projection","location_id='loc_1' AND path='base'")
    assert len(trace)==28 and all(r["demand_units"]==pytest.approx(1) for r in trace)
    assert validate_release(baseline)["supply_model"]["demand_model"]=="retailer_baseline"


@pytest.mark.parametrize("receipt_date,quantity,expected_depletion",[
    (None,0,date(2026,12,7)),
    (date(2026,12,6),30,None),
    (date(2026,12,9),30,date(2026,12,7)),
    (date(2026,12,6),2,date(2026,12,9)),
])
def test_controlled_known_demand_supply_cases(tmp_path,receipt_date,quantity,expected_depletion):
    canonical,source,config=supply_fixture(tmp_path)
    if receipt_date:
        set_orders(canonical,[order(ordered_quantity=quantity,invoiced_quantity=0,received_quantity=0,
                                    expected_store_receipt_date=receipt_date)])
        rewrite_table(canonical,"inventory_daily",f"SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27' THEN {quantity} ELSE 0 END::BIGINT AS on_order_quantity) FROM original")
    release=publish_metrics(canonical,source,data_root=tmp_path,config=config,activate=False)
    row=read(release,"supply_assessment","location_id='loc_1'")[0]
    assert row["base_depletion_date"]==expected_depletion
    if not receipt_date or receipt_date<=date(2026,12,7):
        assert row["base_unfulfilled_units"]==pytest.approx(max(28-10-quantity,0))
    else:
        assert row["base_unfulfilled_units"]>0


def test_warning_before_onset_is_not_lost_when_estimated_date_is_late(tmp_path):
    _,_,_,scoring,final=cutoff_fixture(tmp_path)
    _,events,scores=evaluate_observable([scoring],final)
    episode=next(r for r in events.to_pylist() if r["horizon_days"]==14 and r["onset_date"]==date(2026,11,3))
    assert episode["advance_warning"]
    assert not episode["detected"]
    assert episode["advance_warning_lead_days"]==4
    assert not episode["seven_day_warning"]
    assert scores["14"]["advance_warning_episode_recall"]>scores["14"]["unique_episode_recall"]


def test_invalid_demand_model_rejected(tmp_path):
    _,_,config=supply_fixture(tmp_path)
    with pytest.raises(ValueError,match="demand model"):
        replace(config,demand_model="silent_sales_fallback")


def test_later_order_is_outcome_evidence_not_forecast_input(tmp_path):
    _,source,config,scoring,final=cutoff_fixture(tmp_path)
    canonical=tmp_path/"canonical/mds_metric_fixture"
    set_orders(canonical,[order(order_created_at=datetime(2026,11,2,tzinfo=UTC),
        known_at=datetime(2026,11,5,tzinfo=UTC),expected_store_receipt_date=date(2026,11,5),
        ordered_quantity=20,invoiced_quantity=20,received_quantity=20,status_code="received")])
    revised_final=publish_metrics(canonical,replace(source,as_of="2026-11-28T12:00:00Z"),data_root=tmp_path,config=config,activate=False)
    before=read(scoring,"supply_assessment")
    pairs,_,scores=evaluate_observable([scoring],revised_final)
    row=next(r for r in pairs.to_pylist() if r["location_id"]=="loc_1" and r["horizon_days"]==7)
    assert row["later_new_order"] and not row["later_order_revision"]
    assert scores["7"]["observable_supply_change_strata"]["later_new_order"]
    assert read(scoring,"supply_assessment")==before


def test_legacy_metric_release_remains_readable():
    from pathlib import Path
    path=Path("data/metrics/met_788aae23efc037364abc77be61e4a86db9bce87e2f10d45c5dc52332679a07c9")
    if not path.exists():
        pytest.skip("optional local historical release is absent")
    assert validate_release(path)["contract_version"]=="retail-backend-metrics-v2"
