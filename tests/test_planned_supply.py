"""Minimized synthetic order forecasts exercise the real validation/publication path."""
from dataclasses import replace
from datetime import UTC, date, datetime
import json

from fastapi.testclient import TestClient
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from memento.api import create_app
from memento.manifest import sha256_file
from memento.metric_planned_source import PLAN_SCHEMA, CONVERSION_SCHEMA, COVERAGE_SCHEMA, CONTRACT, PLAN_BASIS, LINK_BASIS
from memento.metric_publication import publish_metrics, validate_release
from memento.metric_replay import verify_snapshot
from memento.metric_source import PlannedOrderSource
from tests.test_descriptive_metrics import read
from tests.test_metric_backend_v2 import supply_fixture, set_orders, order, rewrite_table

AS_OF = datetime(2026, 11, 28, 12, tzinfo=UTC)


def plan(**changes):
    return {"plan_id": "PLAN-" + "1" * 32, "plan_version": 1,
        "issued_at": datetime(2026, 11, 21, 12, tzinfo=UTC), "known_at": AS_OF,
        "geo_region_cd": "US", "op_cmpny_cd": 0, "store_nbr": 1, "wm_item_nbr": 100,
        "destination_role": "store", "fcst_seq_nbr": 1, "sugg_order_dt": date(2026, 11, 21),
        "order_place_dt": date(2026, 11, 30), "sched_arvl_dt": date(2026, 12, 6),
        "order_each_qty": 28, "converted_qty": 0, "remaining_planned_qty": 28,
        "withdrawn_qty": 0, "status": "planned", "basis": PLAN_BASIS, **changes}


def planned_source(root, source, plans=None, links=None, coverage=None):
    folder = root / "planned-input"
    folder.mkdir(exist_ok=True)
    descriptor = {"contract": CONTRACT, "classification": "synthetic", "as_of": source.as_of,
                  "release_set_sha256": source.release_set_sha256, "availability": "available"}
    if coverage is None:
        coverage = [{"store_nbr": s, "wm_item_nbr": 100, "known_at": AS_OF,
                     "planned_orders_available": True, "reason": "available"} for s in range(1, 5)]
    if any(not r["planned_orders_available"] for r in coverage):
        descriptor["availability"] = "partial"
    for name, rows, schema in (("plans", [plan()] if plans is None else plans, PLAN_SCHEMA),
                               ("conversions", links or [], CONVERSION_SCHEMA), ("coverage", coverage, COVERAGE_SCHEMA)):
        file = folder / (name + ".parquet")
        pq.write_table(pa.Table.from_pylist(rows, schema=schema), file)
        descriptor[name] = {"path": file.name, "sha256": sha256_file(file), "bytes": file.stat().st_size, "rows": len(rows)}
    return replace(source, planned_orders=PlannedOrderSource(folder.resolve(), descriptor))


def publish(root, canonical, source, config):
    return publish_metrics(canonical, source, data_root=root, config=config, activate=False)


def test_planned_coverage_is_conditional_and_firm_tables_are_byte_identical(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    firm_only = publish(tmp_path, canonical, source, config)
    with_plans = publish(tmp_path, canonical, planned_source(tmp_path, source), config)
    for name in ("supply_assessment", "supply_projection", "supply_order", "supply_forecast", "checks", "current_store"):
        assert sha256_file(firm_only / (name + ".parquet")) == sha256_file(with_plans / (name + ".parquet"))
    firm = read(with_plans, "supply_assessment", "location_id='loc_1'")[0]
    expected = read(with_plans, "expected_supply_assessment", "location_id='loc_1'")[0]
    assert firm["base_unfulfilled_units"] == 18
    assert expected["base_unfulfilled_units"] == 0
    assert expected["comparison_state"] == "firm_gap_conditionally_covered"
    assert expected["execution_prerequisites"] == "unverified_not_authorized"
    assert expected["conditional_unfulfilled_reduction_units"] == 18
    assert validate_release(with_plans)["planned_order_source"]["contract"] == CONTRACT
    assert verify_snapshot(with_plans)["metric_release_id"] == with_plans.name
    assert not (tmp_path / "metrics/current.json").exists()


@pytest.mark.parametrize("changes,expected_lost,excluded", [
    ({"sched_arvl_dt": date(2026, 12, 10)}, 2, False),
    ({"order_each_qty": 2, "remaining_planned_qty": 2}, 16, False),
    ({"order_place_dt": date(2026, 11, 27), "status": "placement_overdue"}, 18, True),
    ({"order_each_qty": 28, "remaining_planned_qty": 0, "withdrawn_qty": 28, "status": "withdrawn"}, 18, True),
    ({"sched_arvl_dt": date(2027, 1, 1)}, 18, True),
])
def test_late_insufficient_missed_withdrawn_and_beyond_horizon(tmp_path, changes, expected_lost, excluded):
    canonical, source, config = supply_fixture(tmp_path)
    release = publish(tmp_path, canonical, planned_source(tmp_path, source, [plan(**changes)]), config)
    row = read(release, "expected_supply_assessment", "location_id='loc_1'")[0]
    assert row["base_unfulfilled_units"] == pytest.approx(expected_lost, abs=1e-9)
    assert read(release, "planned_order")[0]["eligible_for_projection"] is not excluded
    assert read(release, "supply_assessment", "location_id='loc_1'")[0]["base_unfulfilled_units"] == 18


@pytest.mark.parametrize("converted,total", [(6, 20), (20, 20)])
def test_partial_and_full_conversion_never_add_the_same_units_twice(tmp_path, converted, total):
    canonical, source, config = supply_fixture(tmp_path)
    set_orders(canonical, [order(ordered_quantity=converted, expected_store_receipt_date=date(2026, 12, 6),
                               order_created_at=datetime(2026, 11, 23, tzinfo=UTC), known_at=datetime(2026, 11, 24, tzinfo=UTC))])
    rewrite_table(canonical, "inventory_daily", f"""SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27'
        THEN {converted} ELSE 0 END::BIGINT AS on_order_quantity) FROM original""")
    p = plan(order_each_qty=total, converted_qty=converted, remaining_planned_qty=total-converted,
             status="placed" if converted == total else "partially_placed", plan_version=2)
    links = [{"plan_id": p["plan_id"], "retailer_order_id": "PO-FIXTURE-1", "order_line_nbr": 1,
              "allocated_qty": converted, "known_at": AS_OF, "basis": LINK_BASIS}]
    release = publish(tmp_path, canonical, planned_source(tmp_path, source, [p], links), config)
    trace = read(release, "expected_supply_projection", "location_id='loc_1' AND path='base'")
    assert sum(r["inbound_units"] for r in trace) == total
    assert sum(r["firm_inbound_units"] for r in trace) == converted
    assert sum(r["planned_inbound_units"] for r in trace) == total-converted
    assert read(release, "planned_conversion")[0]["allocated_qty"] == converted


def test_missing_feed_and_missing_pair_coverage_do_not_become_zero_plans(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    absent = publish(tmp_path, canonical, source, config)
    row = read(absent, "expected_supply_assessment", "location_id='loc_1'")[0]
    assert row["planned_input_status"] == "not_provided" and row["base_unfulfilled_units"] is None
    coverage = [{"store_nbr": s, "wm_item_nbr": 100, "known_at": AS_OF,
                 "planned_orders_available": s != 1, "reason": "available" if s != 1 else "synthetic_extract_gap"} for s in range(1, 5)]
    release = publish(tmp_path, canonical, planned_source(tmp_path, source, [], coverage=coverage), config)
    row = read(release, "expected_supply_assessment", "location_id='loc_1'")[0]
    assert row["planned_input_status"] == "unavailable" and row["dated_planned_units"] is None
    assert row["projection_status"] == "insufficient_data" and row["base_unfulfilled_units"] is None
    assert not read(release, "expected_supply_projection", "location_id='loc_1'")
    assert read(release, "supply_assessment", "location_id='loc_1'")[0]["base_unfulfilled_units"] == 18


def test_converted_and_already_received_units_are_not_future_supply(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    first = order(ordered_quantity=20, expected_store_receipt_date=date(2026, 12, 6),
                  order_created_at=datetime(2026, 11, 23, tzinfo=UTC), known_at=datetime(2026, 11, 24, tzinfo=UTC))
    second = dict(first, event_version=2, known_at=datetime(2026, 11, 26, tzinfo=UTC),
                  invoiced_quantity=20, received_quantity=4, status_code="partially_received")
    set_orders(canonical, [first, second])
    rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(CASE WHEN location_id='loc_1' AND business_date=DATE '2026-11-27'
        THEN 16 ELSE 0 END::BIGINT AS in_transit_quantity) FROM original""")
    p = plan(converted_qty=20, remaining_planned_qty=8, status="partially_placed", plan_version=2)
    link = {"plan_id": p["plan_id"], "retailer_order_id": "PO-FIXTURE-1", "order_line_nbr": 1,
            "allocated_qty": 20, "known_at": AS_OF, "basis": LINK_BASIS}
    release = publish(tmp_path, canonical, planned_source(tmp_path, source, [p], [link]), config)
    trace = read(release, "expected_supply_projection", "location_id='loc_1' AND path='base'")
    assert sum(r["firm_inbound_units"] for r in trace) == 16
    assert sum(r["planned_inbound_units"] for r in trace) == 8
    assert sum(r["inbound_units"] for r in trace) == 24


def test_multiple_sequences_are_summed_and_revision_changes_only_expected_supply(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    p1 = plan(order_each_qty=10, remaining_planned_qty=10)
    p2 = plan(plan_id="PLAN-" + "2" * 32, fcst_seq_nbr=2, order_each_qty=20, remaining_planned_qty=20)
    first = publish(tmp_path, canonical, planned_source(tmp_path, source, [p1, p2]), config)
    assert read(first, "expected_supply_assessment", "location_id='loc_1'")[0]["dated_planned_units"] == 30
    second = publish(tmp_path, canonical, planned_source(tmp_path, source, [dict(p1, plan_version=2, order_each_qty=2, remaining_planned_qty=2)]), config)
    assert second != first
    assert read(second, "expected_supply_assessment", "location_id='loc_1'")[0]["dated_planned_units"] == 2
    assert sha256_file(first / "supply_assessment.parquet") == sha256_file(second / "supply_assessment.parquet")
    assert read(first, "planned_order")[0]["plan_version"] == 1


@pytest.mark.parametrize("changes", [
    {"known_at": datetime(2026, 11, 29, tzinfo=UTC)}, {"issued_at": datetime(2026, 11, 29, tzinfo=UTC)},
    {"remaining_planned_qty": -1}, {"converted_qty": 1}, {"store_nbr": 999},
    {"destination_role": "dc"}, {"status": "placed"}, {"order_place_dt": date(2026, 11, 1)},
    {"plan_version": 0}, {"fcst_seq_nbr": 0}, {"known_at": None},
])
def test_invalid_plan_boundaries_fail_closed(tmp_path, changes):
    canonical, source, config = supply_fixture(tmp_path)
    with pytest.raises(ValueError):
        publish(tmp_path, canonical, planned_source(tmp_path, source, [plan(**changes)]), config)


def test_duplicate_versions_and_duplicate_sequence_rejected(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    for rows in ([plan(), plan(plan_version=2)], [plan(), plan(plan_id="PLAN-" + "2" * 32)]):
        with pytest.raises(ValueError, match="duplicate"):
            publish(tmp_path, canonical, planned_source(tmp_path, source, rows), config)


def test_descriptor_integrity_binding_and_path_are_checked(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    connected = planned_source(tmp_path, source)
    assert connected.planned_orders is not None
    descriptor = connected.planned_orders.descriptor
    for key, value in (("as_of", "2026-11-21T12:00:00Z"), ("classification", "production")):
        prior = descriptor[key]
        descriptor[key] = value
        with pytest.raises(ValueError): publish(tmp_path, canonical, connected, config)
        descriptor[key] = prior
    descriptor["plans"]["path"] = "../outside.parquet"
    with pytest.raises(ValueError): publish(tmp_path, canonical, connected, config)
    connected = planned_source(tmp_path, source)
    (tmp_path / "planned-input/plans.parquet").write_bytes(b"synthetic corruption")
    with pytest.raises(ValueError): publish(tmp_path, canonical, connected, config)


def test_coverage_must_be_exhaustive_and_available_for_each_plan(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rows = [{"store_nbr": 1, "wm_item_nbr": 100, "known_at": AS_OF, "planned_orders_available": True, "reason": "available"}]
    with pytest.raises(ValueError, match="coverage must match"):
        publish(tmp_path, canonical, planned_source(tmp_path, source, coverage=rows), config)


def test_endpoints_pinned_release_and_repeat_publication(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    connected = planned_source(tmp_path, source)
    release = publish(tmp_path, canonical, connected, config)
    assert publish(tmp_path, canonical, connected, config) == release
    client = TestClient(create_app(tmp_path))
    for kind in ("planned-orders", "planned-conversions", "planned-coverage", "expected-supply", "expected-projection"):
        response = client.get(f"/v1/metrics/{kind}?release_id={release.name}&scope_id=loc_1&limit=200")
        assert response.status_code == 200
        assert response.json()["metric_release_id"] == release.name
        assert all(r["location_id"] == "loc_1" for r in response.json()["rows"])
    row = read(release, "expected_supply_assessment", "location_id='loc_4'")[0]
    assert row["projection_status"] == "insufficient_data" and row["base_unfulfilled_units"] is None
    (release / "planned_order.parquet").write_bytes(b"synthetic corruption")
    assert client.get(f"/v1/metrics/expected-supply?release_id={release.name}").status_code == 503


@pytest.mark.parametrize("failure", ["unknown_po", "excess_allocation", "wrong_pair", "future_knowledge", "duplicate_link", "precedes_po_knowledge"])
def test_invalid_conversions_cannot_erase_planned_units(tmp_path, failure):
    canonical, source, config = supply_fixture(tmp_path)
    po = order(ordered_quantity=6, order_created_at=datetime(2026, 11, 23, tzinfo=UTC),
               known_at=datetime(2026, 11, 24, tzinfo=UTC), expected_store_receipt_date=date(2026, 12, 6))
    if failure == "wrong_pair": po["location_id"] = "loc_2"
    if failure == "future_knowledge": po["known_at"] = datetime(2026, 11, 29, tzinfo=UTC)
    if failure == "precedes_po_knowledge": po["known_at"] = datetime(2026, 11, 28, 11, tzinfo=UTC)
    if failure == "excess_allocation": po["ordered_quantity"] = 5
    if failure != "unknown_po": set_orders(canonical, [po])
    p = plan(order_each_qty=20, converted_qty=6, remaining_planned_qty=14, status="partially_placed")
    link = {"plan_id": p["plan_id"], "retailer_order_id": "PO-FIXTURE-1", "order_line_nbr": 1,
            "allocated_qty": 6, "known_at": AS_OF, "basis": LINK_BASIS}
    if failure == "precedes_po_knowledge": link["known_at"] = datetime(2026, 11, 27, 12, tzinfo=UTC)
    links = [link, dict(link)] if failure == "duplicate_link" else [link]
    with pytest.raises(ValueError):
        publish(tmp_path, canonical, planned_source(tmp_path, source, [p], links), config)


def test_ambiguous_source_dimension_cannot_cancel_an_unresolved_mapping(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    rewrite_table(canonical, "location", "SELECT * REPLACE(CASE WHEN location_id='loc_2' THEN '1' ELSE source_location_id END AS source_location_id) FROM original")
    with pytest.raises(ValueError, match="ambiguous planned-order identity"):
        publish(tmp_path, canonical, planned_source(tmp_path, source), config)


def test_current_oos_check_is_not_removed_by_future_plans(tmp_path):
    canonical, source, config = supply_fixture(tmp_path)
    connected = planned_source(tmp_path, source, [plan(store_nbr=3)])
    release = publish(tmp_path, canonical, connected, config)
    assert read(release, "checks", "location_id='loc_3' AND check_code='reported_zero_on_hand'")
    assert read(release, "expected_supply_assessment", "location_id='loc_3'")[0]["current_state"] == "reported_zero_on_hand"


def test_historical_metric_versions_remain_readable():
    from pathlib import Path
    for root in sorted(Path("data/metrics").glob("met_*")):
        value = json.loads((root/"manifest.json").read_text())
        if value["contract_version"] == "retail-backend-metrics-v3":
            assert validate_release(root)["contract_version"] == "retail-backend-metrics-v3"
            return
    pytest.skip("optional local v3 artifact absent")
