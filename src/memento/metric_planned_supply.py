"""Conditional expected supply; never mutates the committed-supply projection."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Sequence

import duckdb
import pyarrow as pa

from .metric_planned_source import PLAN_SCHEMA, CONVERSION_SCHEMA
from .metric_supply import PROJECTION_SCHEMA, ZERO_TOLERANCE
from .metrics import project_inventory

IDS = [("location_id", pa.string()), ("product_id", pa.string())]
EVIDENCE_SCHEMA = pa.schema([
    *IDS, *[(f.name, f.type) for f in PLAN_SCHEMA if f.name not in {"store_nbr", "wm_item_nbr"}],
    ("receipt_timing", pa.string()), ("eligible_for_projection", pa.bool_()),
])
MAPPED_CONVERSION_SCHEMA = pa.schema([*IDS, *[(f.name, f.type) for f in CONVERSION_SCHEMA]])
MAPPED_COVERAGE_SCHEMA = pa.schema([
    *IDS, ("known_at", pa.timestamp("us", tz="UTC")),
    ("planned_orders_available", pa.bool_()), ("reason", pa.string()),
])
EXPECTED_SCHEMA = pa.schema([
    *IDS, ("as_of", pa.timestamp("us", tz="UTC")), ("current_state", pa.string()),
    ("planned_input_status", pa.string()), ("projection_status", pa.string()),
    ("comparison_state", pa.string()), ("supply_basis", pa.string()),
    ("execution_prerequisites", pa.string()), ("reasons", pa.list_(pa.string())),
    *[(name, pa.float64()) for name in (
        "remaining_planned_units", "converted_units", "withdrawn_units", "dated_planned_units",
        "placement_overdue_units", "arrival_overdue_units", "beyond_horizon_planned_units",
        "firm_dated_future_units", "firm_base_unfulfilled_units", "conditional_unfulfilled_reduction_units",
        "estimated_unfulfilled_retail_amount", "estimated_retail_minus_cost_amount")],
    *[(f"{path}_{field}", pa.date32()) for path in ("low", "base", "high")
      for field in ("depletion_date", "unfulfilled_date")],
    *[(f"{path}_unfulfilled_units", pa.float64()) for path in ("low", "base", "high")],
])
EXPECTED_PROJECTION_SCHEMA = pa.schema([
    *[(f.name, f.type) for f in PROJECTION_SCHEMA],
    ("firm_inbound_units", pa.float64()), ("planned_inbound_units", pa.float64()),
    ("supply_basis", pa.string()),
])
BASIS = "firm_plus_unconverted_plans_conditional"


def build_expected(con: duckdb.DuckDBPyConnection, *, as_of: datetime, feed_provided: bool) -> None:
    cutoff = as_of.date()
    end = cutoff + timedelta(days=27)
    coverage = {}
    plans = defaultdict(list)
    conversions = []
    if feed_provided:
        coverage = {(r["location_id"], r["product_id"]): r for r in
                    con.sql("SELECT * FROM planned_input_coverage").to_arrow_table().to_pylist()}
        for row in con.sql("SELECT * FROM planned_input_plans ORDER BY plan_id").to_arrow_table().to_pylist():
            plans[row["location_id"], row["product_id"]].append(row)
        conversions = con.sql("SELECT * FROM planned_input_conversions").to_arrow_table().to_pylist()
    # Reuse the *exact* firm forecast demand and firm inbound, not a new forecast.
    paths = defaultdict(dict)
    for store, product, path, dates, demand, inbound in con.sql("""SELECT location_id,product_id,path,
        list(projection_date ORDER BY projection_date),list(demand_units ORDER BY projection_date),
        list(inbound_units ORDER BY projection_date) FROM supply_projection GROUP BY ALL""").fetchall():
        paths[store, product][path] = (dates, demand, inbound)
    assessments, evidence, projections, coverage_rows = [], [], [], []
    for firm in con.sql("SELECT * FROM supply_assessment ORDER BY location_id,product_id").to_arrow_table().to_pylist():
        key = firm["location_id"], firm["product_id"]
        cov = coverage.get(key)
        coverage_rows.append(cov if cov is not None else {
            "location_id": key[0], "product_id": key[1], "known_at": None,
            "planned_orders_available": False, "reason": "feed_not_provided"})
        row: dict[str, Any] = {field.name: None for field in EXPECTED_SCHEMA}
        row.update(location_id=key[0], product_id=key[1], as_of=as_of,
                   current_state=firm["current_state"], planned_input_status="available" if cov and cov["planned_orders_available"]
                   else "unavailable" if feed_provided else "not_provided",
                   projection_status="insufficient_data", comparison_state="unknown", supply_basis=BASIS,
                   execution_prerequisites="unverified_not_authorized",
                   firm_dated_future_units=firm["dated_future_units"], firm_base_unfulfilled_units=firm["base_unfulfilled_units"])
        reasons = []
        ready = key in paths
        in_scope = firm["projection_status"] != "not_applicable"
        incoming = defaultdict(float)
        if row["planned_input_status"] == "available":
            for name in ("remaining_planned_units", "converted_units", "withdrawn_units", "dated_planned_units",
                         "placement_overdue_units", "arrival_overdue_units", "beyond_horizon_planned_units"):
                row[name] = 0.
            for source in plans[key]:
                qty = float(source["remaining_planned_qty"])
                row["remaining_planned_units"] += qty
                row["converted_units"] += source["converted_qty"]
                row["withdrawn_units"] += source["withdrawn_qty"]
                if qty == 0:
                    timing = "no_remaining_quantity"
                elif source["order_place_dt"] < cutoff or source["status"] == "placement_overdue":
                    timing = "placement_overdue"
                    row["placement_overdue_units"] += qty
                elif source["sched_arvl_dt"] < cutoff:
                    timing = "arrival_overdue"
                    row["arrival_overdue_units"] += qty
                elif source["sched_arvl_dt"] > end:
                    timing = "beyond_horizon"
                    row["beyond_horizon_planned_units"] += qty
                else:
                    timing = "future"
                    row["dated_planned_units"] += qty
                    if in_scope:
                        incoming[source["sched_arvl_dt"]] += qty
                evidence.append({**source, "receipt_timing": timing,
                                 "eligible_for_projection": timing == "future" and in_scope})
            if row["placement_overdue_units"]:
                reasons.append("missed_placement_deadline_excluded")
            if row["arrival_overdue_units"]:
                reasons.append("past_planned_arrival_excluded")
            if row["dated_planned_units"]:
                reasons.append("conditional_on_order_placement_stock_readiness_and_delivery")
        else:
            reasons.append("planned_feed_unavailable" if feed_provided else "planned_feed_not_provided")
        if not in_scope:
            row["projection_status"] = "not_applicable"
            row["comparison_state"] = "not_applicable"
        elif not ready:
            reasons.append("firm_projection_inputs_insufficient")
        elif row["planned_input_status"] == "available":
            grouped = paths[key]
            dates = grouped["base"][0]
            demand_paths: dict[str, Sequence[float]] = {path: tuple(grouped[path][1]) for path in ("low", "base", "high")}
            firm_inbound = dict(zip(dates, grouped["base"][2]))
            inbound = {day: firm_inbound[day] + incoming[day] for day in dates}
            trace, _ = project_inventory(float(firm["on_hand"]), dates, demand_paths, inbound)
            for path in demand_paths:
                selected = [t for t in trace if t.path == path]
                lost = sum(t.lost_units for t in selected)
                row[path + "_unfulfilled_units"] = lost if lost > ZERO_TOLERANCE else 0.
                row[path + "_depletion_date"] = next((t.date for t in selected if t.ending_units <= ZERO_TOLERANCE), None)
                row[path + "_unfulfilled_date"] = next((t.date for t in selected if t.lost_units > ZERO_TOLERANCE), None)
            row["projection_status"] = ("conditional_projected_unfulfilled_demand" if row["base_unfulfilled_units"] > 0
                                        else "conditional_projected_depletion" if row["base_depletion_date"] is not None
                                        else "conditional_healthy_28d")
            row["comparison_state"] = ("no_positive_reference_demand" if not firm["reference_daily_demand"]
                else "firm_only_sufficient" if firm["base_unfulfilled_units"] == 0
                else "firm_gap_conditionally_covered" if row["base_unfulfilled_units"] == 0
                else "gap_remains_under_plans")
            row["conditional_unfulfilled_reduction_units"] = max(0., firm["base_unfulfilled_units"] - row["base_unfulfilled_units"])
            if firm["unit_retail_amount"] is not None:
                row["estimated_unfulfilled_retail_amount"] = row["base_unfulfilled_units"] * firm["unit_retail_amount"]
                if firm["unit_cost_amount"] is not None:
                    row["estimated_retail_minus_cost_amount"] = row["base_unfulfilled_units"] * (firm["unit_retail_amount"] - firm["unit_cost_amount"])
            for t in trace:
                projections.append({"location_id": key[0], "product_id": key[1], "projection_date": t.date,
                    "path": t.path, "demand_units": t.demand_units, "inbound_units": t.inbound_units,
                    "opening_units": t.opening_units, "available_units": t.available_units,
                    "fulfilled_units": t.fulfilled_units, "unfulfilled_units": t.lost_units, "ending_units": t.ending_units,
                    "firm_inbound_units": firm_inbound[t.date], "planned_inbound_units": incoming[t.date], "supply_basis": BASIS})
        row["reasons"] = sorted(reasons)
        assessments.append(row)
    for name, rows, schema in (("planned_order", evidence, EVIDENCE_SCHEMA),
        ("planned_conversion", conversions, MAPPED_CONVERSION_SCHEMA), ("planned_coverage", coverage_rows, MAPPED_COVERAGE_SCHEMA),
        ("expected_supply_assessment", assessments, EXPECTED_SCHEMA),
        ("expected_supply_projection", projections, EXPECTED_PROJECTION_SCHEMA)):
        con.register(name, pa.Table.from_pylist(rows, schema=schema))
