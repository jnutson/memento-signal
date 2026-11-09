"""UI aggregates preserve complete membership and published metric meanings."""
from fastapi.testclient import TestClient
import pytest
import pyarrow as pa
import pyarrow.parquet as pq

from memento.api import create_app
from memento.metric_display import exposure_summary
from tests.test_descriptive_metrics import read
from tests.test_metric_backend_v2 import supply_fixture
from tests.test_planned_supply import planned_source, publish


def test_display_series_is_complete_pinned_and_uses_published_traces(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    finding = read(release, "finding", "finding_code='conditional_plan_dependency'")[0]
    params = {"release_id": release.name, "product_id": finding["product_id"], "finding_id": finding["finding_id"]}
    client = TestClient(create_app(tmp_path))
    response = client.get("/v1/metrics/display-series", params=params)
    assert response.status_code == 200
    value = response.json()
    assert value["metric_release_id"] == release.name and value["member_count"] == finding["affected_store_count"]
    first = next(row for row in value["projections"] if row["basis"] == "firm")
    published = read(release, "supply_projection", f"location_id='loc_1' AND path='base' AND projection_date=DATE '{first['projection_date']}'")[0]
    assert first["ending_units"] == pytest.approx(published["ending_units"])
    assert first["demand_units"] == pytest.approx(published["demand_units"])
    firm = read(release, "supply_assessment", "location_id='loc_1'")[0]
    expected = read(release, "expected_supply_assessment", "location_id='loc_1'")[0]
    assert len(value["store_supply"]) == value["member_count"]
    assert value["store_supply"][0]["demand_base_28d"] == firm["demand_base_28d"]
    assert value["store_supply"][0]["conditional_unfulfilled_units"] == expected["base_unfulfilled_units"]
    assert value["store_supply"][0]["firm_shortage_date"] == firm["base_unfulfilled_date"].isoformat()
    diagnostics = value["diagnostics"]
    assert diagnostics["first_firm_depletion_date"] == firm["base_depletion_date"].isoformat()
    assert diagnostics["planned_receipts_28d"] == expected["dated_planned_units"]
    assert diagnostics["conditional_unmet_retail_amount"] == expected["estimated_unfulfilled_retail_amount"]
    assert diagnostics["zero_previously_stocked_stores"] == 0
    assert diagnostics["zero_without_observed_stock_stores"] == 0
    assert client.get("/v1/metrics/display-series", params={**params, "finding_id": "../bad"}).status_code == 422
    assert client.get("/v1/metrics/display-series", params={**params, "product_id": "not-a-member"}).status_code == 404
    assert client.post("/v1/metrics/display-series", json=params).status_code == 405
    assert not (tmp_path / "metrics/current.json").exists()
    summary = client.get("/v1/metrics/exposure-summary", params={"release_id": release.name})
    assert summary.status_code == 200
    buckets = {r["key"]: r for r in summary.json()["buckets"]}
    assert buckets["a"]["amount"] == 0  # plans cover the firm-only gap
    assert buckets["z"]["member_count"] == 2
    assert client.post("/v1/metrics/exposure-summary").status_code == 405


def test_missing_member_projection_is_not_an_all_item_zero_or_partial_total(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    client = TestClient(create_app(tmp_path))
    params = {"release_id": release.name, "product_id": "prd_100"}
    response = client.get("/v1/metrics/display-series", params=params)
    assert response.status_code == 200
    value = response.json()
    assert value["member_count"] == 4
    assert value["projections"]
    assert all(row["ending_units"] is None for row in value["projections"])
    assert all(row["ready_stores"] < value["member_count"] for row in value["projections"])
    assert value["diagnostics"]["first_firm_depletion_date"] is None
    assert value["diagnostics"]["conditional_unmet_retail_amount"] is None
    assert value["diagnostics"]["zero_without_observed_stock_stores"] == 2
    with (release / "daily.parquet").open("ab") as stream:
        stream.write(b"corrupt")
    assert client.get("/v1/metrics/display-series", params=params).status_code == 503
    assert client.get("/v1/metrics/exposure-summary", params={"release_id": release.name}).status_code == 503


def test_exposure_uses_distinct_pairs_conditional_shortfalls_and_firm_capital(tmp_path):
    rows = [
        ("a", "current_out_of_stock", None),
        ("a", "promised_distribution_gap", None),  # duplicate pair is not double counted
        ("b", "future_supply_gap", None),
        ("c", "conditional_plan_dependency", None),  # not an uncovered gap
        ("d", "excess_inventory", 42.),
        ("e", "conditional_excess_inventory", 900.),  # not firm capital
        ("f", "current_out_of_stock", None),  # unknown valuation stays unknown
    ]
    pq.write_table(pa.Table.from_pylist([dict(location_id=loc, product_id="p", finding_code=code,
        inventory_capital_amount=capital) for loc, code, capital in rows]), tmp_path / "finding_evidence.parquet")
    pq.write_table(pa.Table.from_pylist([dict(location_id=loc, product_id="p", estimated_unfulfilled_retail_amount=value)
        for loc, value in (("a", 20.), ("b", 30.), ("c", 0.), ("f", None))]), tmp_path / "expected_supply_assessment.parquet")
    result = exposure_summary(tmp_path, {"metric_release_id": "test", "observation_date": "2026-10-19"})
    buckets = {r["key"]: r for r in result["buckets"]}
    assert buckets["z"]["member_count"] == 2
    assert buckets["z"]["valued_count"] == 1
    assert buckets["z"]["amount"] is None
    assert buckets["z"]["known_amount"] == 20
    assert buckets["a"]["amount"] == 30
    assert buckets["i"]["amount"] == 42
