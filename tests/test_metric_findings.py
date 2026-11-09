"""Finding contracts use public operands, not synthetic scenario assignments."""
from dataclasses import replace
from datetime import date
import json

from fastapi.testclient import TestClient
import pytest

from memento.api import create_app
from memento.manifest import canonical_json, sha256_file
from memento.metric_publication import PLANNED_TABLES, _hash, validate_release
from memento.metric_replay import verify_snapshot
from tests.test_descriptive_metrics import read
from tests.test_metric_backend_v2 import supply_fixture, rewrite_table, set_orders, order
from tests.test_planned_supply import planned_source, plan, publish


def members(release, code):
    return read(release, "finding_evidence", f"finding_code='{code}'")


def test_conditional_coverage_is_not_a_stockout_alarm_and_evidence_reconciles(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    dependent = members(release, "conditional_plan_dependency")
    assert [r["location_id"] for r in dependent] == ["loc_1"]
    assert dependent[0]["units"] == 18
    assert dependent[0]["plan_review_date"] == date(2026, 11, 30)
    assert not members(release, "future_supply_gap")
    gap = members(release, "promised_distribution_gap")
    assert {r["location_id"] for r in gap} == {"loc_2", "loc_3"}
    unknown = members(release, "availability_unknown")
    assert [r["location_id"] for r in unknown] == ["loc_4"]
    assert unknown[0]["units"] is None
    assert "finding_members_reconcile" in verify_snapshot(release)["passed_invariants"]
    for finding in read(release, "finding"):
        detail = read(release, "finding_evidence", f"finding_id='{finding['finding_id']}'")
        assert finding["affected_store_count"] == len(detail)
        assert all(r["product_id"] == finding["product_id"] for r in detail)
        if finding["units"] is not None:
            assert finding["units"] == pytest.approx(sum(r["units"] for r in detail))
        assert "No rank or action recommendation" in finding["limitations"][0]


def test_uncovered_gap_retains_dates_forecast_money_and_does_not_choose_production(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source, plans=[]), config)
    row = members(release, "future_supply_gap")[0]
    assert row["units"] == 18 and row["retail_exposure_amount"] == 180
    assert row["event_date"] == date(2026, 12, 8)
    facts = json.loads(row["facts_json"])
    assert facts["production_path_days"] == 90
    assert facts["action_feasibility"] == "not_established_no_action_selected"
    assert facts["source_key"] == {"location_id": "loc_1", "product_id": "prd_100"}
    assert row["plan_review_date"] is None


def test_missing_plan_feed_is_unknown_not_a_zero_supply_alert(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, source, config)
    assert not members(release, "future_supply_gap")
    row = next(r for r in members(release, "availability_unknown") if r["location_id"] == "loc_1")
    assert "retailer_planned_order_feed" in row["missing_evidence"]
    assert json.loads(row["facts_json"])["conditional_unfulfilled_units"] is None


def test_firm_covered_control_has_no_future_shortage_or_plan_dependency(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    set_orders(canonical, [order(ordered_quantity=28, expected_store_receipt_date=date(2026, 12, 1))])
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27'
        THEN 28 ELSE 0 END::BIGINT AS on_order_quantity) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source, plans=[]), config)
    assert not members(release, "future_supply_gap")
    assert not members(release, "conditional_plan_dependency")
    assert not any(r["location_id"] == "loc_1" for r in members(release, "availability_unknown"))


def test_large_percentage_but_sparse_growth_fails_materiality_gate(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "sales_daily", """SELECT * REPLACE(
        CASE WHEN location_id='loc_1' AND business_date IN (DATE '2026-10-04',DATE '2026-11-01',DATE '2026-11-15')
        THEN 1 ELSE 0 END::BIGINT AS sales_quantity) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    assert not members(release, "sustained_outperformance")


def test_prior_stock_separates_current_oos_and_recovery_from_never_stocked(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE
        WHEN location_id='loc_2' AND business_date<DATE '2026-11-27' THEN 10
        WHEN location_id='loc_1' AND business_date=DATE '2026-11-25' THEN 0
        ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    assert [r["location_id"] for r in members(release, "current_out_of_stock")] == ["loc_2"]
    assert [r["location_id"] for r in members(release, "promised_distribution_gap")] == ["loc_3"]
    assert [r["location_id"] for r in members(release, "observed_recovery")] == ["loc_1"]


@pytest.mark.parametrize("start,quantity,expected", [("2026-10-31", 2, True), ("2026-11-21", 8, False), ("2026-10-31", 1, False)])
def test_expansion_requires_two_material_in_stock_windows_not_one_week_spike(tmp_path, start, quantity, expected):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "sales_daily", f"""SELECT * REPLACE(
        CASE WHEN location_id='loc_1' AND business_date>=DATE '{start}' THEN {quantity} ELSE 1 END::BIGINT AS sales_quantity,
        10.0*CASE WHEN location_id='loc_1' AND business_date>=DATE '{start}' THEN {quantity} ELSE 1 END AS sales_amount) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    rows = members(release, "sustained_outperformance")
    assert bool(rows) is expected
    if expected:
        assert rows[0]["units"] == 28
        assert json.loads(rows[0]["facts_json"])["expansion_comparison"]["first_change_pct"] == 100


def test_stockout_censored_growth_is_not_expansion_proof(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "sales_daily", """SELECT * REPLACE(CASE WHEN business_date>=DATE '2026-10-31' THEN 4 ELSE 1 END::BIGINT AS sales_quantity) FROM original""")
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date BETWEEN DATE '2026-10-01' AND DATE '2026-10-28' THEN 0 ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    assert not members(release, "sustained_outperformance")


def test_excess_firm_and_planned_stay_separate_and_cost_is_not_retail(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE WHEN location_id='loc_1' THEN 100 ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
    rewrite_table(canonical, "company_item", "SELECT *, 'MIRO_TOYS' company_id FROM original")
    rewrite_table(canonical, "company_item_economics", """SELECT 'MIRO_TOYS' company_id,'GAME-100' company_item_id,
        4.0 unit_cost_amount,DATE '2026-08-01' effective_from,NULL::DATE effective_to""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), replace(config, annual_carrying_cost_rate=.2))
    row = members(release, "excess_inventory")[0]
    assert row["units"] == 32  # 100 - 28 demand - 40 target
    assert row["inventory_capital_amount"] == 128
    assert row["retail_exposure_amount"] is None
    assert row["carrying_cost_28d_amount"] == pytest.approx(128*.2*28/365)
    facts = json.loads(row["facts_json"])["excess_calculation"]
    assert facts["conditional_excess_units"] == 60  # separate 28 planned units
    assert row["plan_review_date"] == date(2026, 11, 30)


def test_missing_economics_preserves_excess_fact_and_does_not_impute_cost(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE WHEN location_id='loc_1' THEN 100 ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    row = members(release, "excess_inventory")[0]
    assert row["units"] == 32 and row["inventory_capital_amount"] is None and row["carrying_cost_28d_amount"] is None
    assert "approved_annual_carrying_cost_rate" in row["missing_evidence"]


def test_plans_can_create_excess_without_firm_excess_and_are_labeled_conditional(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE WHEN location_id='loc_1' THEN 50 ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    assert not members(release, "excess_inventory")
    row = members(release, "conditional_excess_inventory")[0]
    assert row["units"] == 10
    facts = json.loads(row["facts_json"])["excess_calculation"]
    assert facts["firm_excess_units"] == 0 and facts["conditional_excess_units"] == 10
    group = read(release, "finding", "finding_code='conditional_excess_inventory'")[0]
    assert group["units_basis"] == "conditional_excess_units_at_28d"
    assert group["supply_basis"] == "firm_plus_plans_conditional"


def test_late_large_order_can_leave_both_an_early_shortage_and_later_excess(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    source = planned_source(tmp_path, source, plans=[plan(order_each_qty=100, remaining_planned_qty=100, sched_arvl_dt=date(2026,12,20))])
    release = publish(tmp_path, canonical, source, config)
    assert members(release, "future_supply_gap")[0]["units"] == 12
    assert members(release, "conditional_excess_inventory")[0]["units"] == 54
    assert not members(release, "excess_inventory")


def test_finding_api_pinned_pagination_integrity_and_stable_republication(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    source = planned_source(tmp_path, source)
    release = publish(tmp_path, canonical, source, config)
    assert publish(tmp_path, canonical, source, config) == release
    client = TestClient(create_app(tmp_path))
    response = client.get("/v1/metrics/findings", params={"release_id": release.name, "promise": "availability", "limit": 1})
    assert response.status_code == 200
    value = response.json()
    assert value["total"] >= 3 and len(value["rows"]) == 1
    fid = value["rows"][0]["finding_id"]
    evidence = client.get("/v1/metrics/finding-evidence", params={"release_id": release.name, "finding_id": fid})
    assert evidence.status_code == 200 and evidence.json()["total"] == value["rows"][0]["affected_store_count"]
    assert client.get("/v1/metrics/findings", params={"finding_id": "../bad"}).status_code == 422
    with (release/"finding_evidence.parquet").open("ab") as handle:
        handle.write(b"corrupt")
    assert client.get("/v1/metrics/findings", params={"release_id": release.name}).status_code == 503


def test_issue_identity_persists_but_changed_plan_evidence_is_release_pinned(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    before = publish(tmp_path, canonical, planned_source(tmp_path, source, plans=[]), config)
    after = publish(tmp_path, canonical, planned_source(tmp_path, source, plans=[plan(order_each_qty=2, remaining_planned_qty=2)]), config)
    a, b = members(before, "future_supply_gap")[0], members(after, "future_supply_gap")[0]
    assert before != after
    assert a["finding_id"] == b["finding_id"] and a["evidence_id"] == b["evidence_id"]
    assert a["units"] == 18 and b["units"] == 16
    assert a["facts_json"] != b["facts_json"]
    assert validate_release(before) and validate_release(after)


def test_v4_publication_remains_readable_without_findings(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    document = json.loads((release/"manifest.json").read_text())
    document.pop("metric_release_id")
    document["contract_version"] = "retail-backend-metrics-v4"
    document["files"] = [f for f in document["files"] if f["path"] in {t+".parquet" for t in PLANNED_TABLES}]
    document["metric_release_id"] = "met_"+_hash(document)
    old = release.parent/document["metric_release_id"]
    old.mkdir()
    import shutil
    for f in document["files"]:
        shutil.copyfile(release/f["path"], old/f["path"])
    (old/"manifest.json").write_bytes(canonical_json(document))
    assert validate_release(old)["contract_version"] == "retail-backend-metrics-v4"
    client = TestClient(create_app(tmp_path))
    assert client.get("/v1/metrics/expected-supply", params={"release_id": old.name}).status_code == 200
    assert client.get("/v1/metrics/findings", params={"release_id": old.name}).status_code == 503


@pytest.mark.parametrize("changes", [{"excess_cover_days": 0}, {"annual_carrying_cost_rate": float('nan')}, {"annual_carrying_cost_rate": 2}])
def test_invalid_assumptions_fail_closed(tmp_path, changes):
    _, _, config = supply_fixture(tmp_path)
    with pytest.raises(ValueError):
        replace(config, **changes)
