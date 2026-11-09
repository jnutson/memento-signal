"""Bounded deterministic promise evidence. No ranking, action selection or ontology."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
import hashlib
import json
from typing import Any

import duckdb
import pyarrow as pa

from .metric_contract import MetricConfig

FINDING_SCHEMA = pa.schema([
    *[(n, pa.string()) for n in ("finding_id", "product_id", "promise", "finding_code", "title", "interpretation", "supply_basis", "units_basis")],
    ("as_of", pa.timestamp("us", tz="UTC")), ("affected_store_count", pa.int64()),
    ("eligible_store_count", pa.int64()), ("affected_store_share", pa.float64()),
    ("context_json", pa.string()),
    ("first_event_date", pa.date32()), ("last_event_date", pa.date32()),
    ("earliest_plan_review_date", pa.date32()),
    *[(n, pa.float64()) for n in ("units", "retail_exposure_amount", "inventory_capital_amount", "carrying_cost_28d_amount")],
    ("retail_valued_store_count", pa.int64()), ("cost_valued_store_count", pa.int64()),
    ("missing_evidence", pa.list_(pa.string())), ("limitations", pa.list_(pa.string())),
])
EVIDENCE_SCHEMA = pa.schema([
    *[(n, pa.string()) for n in ("finding_id", "evidence_id", "location_id", "product_id", "finding_code", "facts_json")],
    ("event_date", pa.date32()), ("plan_review_date", pa.date32()),
    *[(n, pa.float64()) for n in ("units", "retail_exposure_amount", "inventory_capital_amount", "carrying_cost_28d_amount")],
    ("missing_evidence", pa.list_(pa.string())),
])

RULES = {
    "sustained_outperformance": ("expansion", "Sustained same-store outperformance", "historical_actuals", "incremental_fulfilled_units_vs_prior_28_day_rate",
        "Both recent 14-day windows outperform the same stores' preceding 28-day baseline with sufficient sales and positive-inventory exposure. This is an internal expansion discussion, not a category benchmark or buyer approval."),
    "promised_distribution_gap": ("availability", "Due promised stores report no inventory", "reported_inventory", "reported_zero_store_item_pairs",
        "Due promised stores report zero inventory and have no earlier observed positive stock. Confirm initial distribution; reported stock is not a shelf audit."),
    "current_out_of_stock": ("availability", "Previously stocked stores report zero inventory", "reported_inventory", "reported_zero_store_item_pairs",
        "Previously stocked stores now report zero inventory. Review replenishment evidence; this does not establish lost sales or prescribe a response."),
    "availability_unknown": ("availability", "Inventory or supply evidence is incomplete", "unknown", "not_available",
        "Missing inventory, forecast or planned-supply evidence prevents a complete availability assessment. Unknown is not healthy or zero."),
    "future_supply_gap": ("availability", "Demand remains uncovered under retailer plans", "firm_plus_plans_conditional", "conditional_unfulfilled_units_28d",
        "The unchanged retailer forecast still has unfulfilled demand even if eligible planned orders arrive. Timing is a projected symptom date, not a feasible-action deadline."),
    "conditional_plan_dependency": ("availability", "Coverage depends on planned orders", "firm_plus_plans_conditional", "firm_only_unfulfilled_units_28d",
        "Firm supply alone is insufficient, but eligible retailer plans conditionally cover the gap. Verify placement and delivery; this is not an unavoidable stockout alarm or guaranteed coverage."),
    "excess_inventory": ("excess", "Inventory exceeds the declared cover target", "firm_and_conditional_separate", "firm_excess_units_at_28d",
        "Firm ending inventory exceeds the declared cover target at the 28-day horizon. Conditional planned inventory is shown separately. Review future plans without assuming firm orders can be cancelled; exposure is not a markdown prediction or saving."),
    "conditional_excess_inventory": ("excess", "Planned orders create conditional excess inventory", "firm_plus_plans_conditional", "conditional_excess_units_at_28d",
        "Firm inventory alone does not exceed the horizon cover target, but inventory including eligible planned orders does. This exposure depends on placement and delivery; review the source plans without treating them as committed inventory or guaranteed savings."),
    "observed_recovery": ("availability", "Reported inventory recovered after zero stock", "historical_actuals", "recovered_store_item_pairs",
        "Positive inventory was observed after a reported zero-stock episode in the last seven days. This is an observed change, not proof an intervention caused recovery."),
}


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=lambda x: x.isoformat(), allow_nan=False)


def _id(prefix: str, *parts: str) -> str:
    return prefix + hashlib.sha256(_json(parts).encode()).hexdigest()


def build_findings(con: duckdb.DuckDBPyConnection, *, as_of: datetime, config: MetricConfig) -> None:
    """Group facts by item and issue, retaining every store and reproducible operand."""
    # A level shift need not accelerate every week. Compare each of two recent
    # windows against one fixed preceding baseline, never future actuals.
    con.execute("""CREATE TEMP TABLE expansion_windows AS
        SELECT location_id,product_id,
        count(*) FILTER(WHERE eligible) eligible_days,
        count(*) FILTER(WHERE sales_valid) sales_days,
        count(*) FILTER(WHERE inventory_valid AND on_hand>0) positive_days,
        sum(units) FILTER(WHERE sales_valid AND business_date<=?::DATE-28) baseline_units,
        count(*) FILTER(WHERE sales_valid AND business_date<=?::DATE-28) baseline_days,
        sum(units) FILTER(WHERE sales_valid AND business_date BETWEEN ?::DATE-27 AND ?::DATE-14) first_units,
        count(*) FILTER(WHERE sales_valid AND business_date BETWEEN ?::DATE-27 AND ?::DATE-14) first_days,
        sum(units) FILTER(WHERE sales_valid AND business_date>?::DATE-14) second_units,
        count(*) FILTER(WHERE sales_valid AND business_date>?::DATE-14) second_days,
        count(*) FILTER(WHERE inventory_valid AND on_hand>0 AND business_date<=?::DATE-28) baseline_positive_days,
        count(*) FILTER(WHERE inventory_valid AND on_hand>0 AND business_date BETWEEN ?::DATE-27 AND ?::DATE-14) first_positive_days,
        count(*) FILTER(WHERE inventory_valid AND on_hand>0 AND business_date>?::DATE-14) second_positive_days,
        sum(dollars) FILTER(WHERE sales_valid AND business_date<=?::DATE-28) baseline_dollars,
        sum(dollars) FILTER(WHERE sales_valid AND business_date>?::DATE-28) recent_dollars
        FROM daily WHERE business_date BETWEEN ?::DATE-55 AND ?::DATE GROUP BY ALL""",
        [as_of.date()-timedelta(days=1)]*16)
    growth = {(r["location_id"], r["product_id"]): r for r in con.sql("SELECT * FROM expansion_windows").to_arrow_table().to_pylist()}
    ending: dict[tuple, dict] = defaultdict(dict)
    for table, basis in (("supply_projection", "firm"), ("expected_supply_projection", "conditional")):
        for loc, prod, value in con.sql(f"SELECT location_id,product_id,ending_units FROM {table} WHERE path='base' QUALIFY row_number() OVER(PARTITION BY location_id,product_id ORDER BY projection_date DESC)=1").fetchall():
            ending[loc, prod][basis] = value
    plans: dict[tuple, list] = defaultdict(list)
    for r in con.sql("SELECT location_id,product_id,plan_id,plan_version,order_place_dt,sched_arvl_dt,remaining_planned_qty,eligible_for_projection,status FROM planned_order ORDER BY plan_id").to_arrow_table().to_pylist():
        plans[r["location_id"], r["product_id"]].append(r)
    recoveries = {(loc, prod): day for loc, prod, day in con.execute("""SELECT location_id,product_id,max(recovery_date) FROM stockout_episode
        WHERE recovery_date BETWEEN ?::DATE-6 AND ?::DATE GROUP BY ALL""", [as_of.date()-timedelta(days=1)]*2).fetchall()}
    historical = set(con.sql("SELECT DISTINCT location_id,product_id FROM daily WHERE inventory_valid AND on_hand>0").fetchall())
    populations = dict(con.sql("SELECT product_id,count(*) FROM current_store WHERE eligible GROUP BY ALL").fetchall())
    distributions = {r["product_id"]: r for r in con.sql("SELECT * FROM distribution_summary WHERE grain='item'").to_arrow_table().to_pylist()}
    period_context = {r["product_id"]: r for r in con.sql("SELECT * FROM metric_period WHERE grain='item' AND period_kind='week' QUALIFY row_number() OVER(PARTITION BY product_id ORDER BY period_start DESC)=1").to_arrow_table().to_pylist()}
    latest_trends = {(r["scope_id"], r["product_id"]): r for r in con.sql("SELECT * FROM metric_trend WHERE grain='store' AND period_kind='week' AND measure='unit_velocity' QUALIFY row_number() OVER(PARTITION BY scope_id,product_id ORDER BY period_start DESC)=1").to_arrow_table().to_pylist()}
    rows = con.sql("""SELECT s.location_id,s.product_id,to_json(s) store_json,to_json(f) firm_json,to_json(e) expected_json
        FROM current_store s JOIN supply_assessment f USING(location_id,product_id)
        JOIN expected_supply_assessment e USING(location_id,product_id) ORDER BY s.product_id,s.location_id""").fetchall()
    evidence: list[dict] = []
    for loc, prod, sj, fj, ej in rows:
        s, f, e = json.loads(sj), json.loads(fj), json.loads(ej)
        if not s["eligible"]:
            continue
        key = loc, prod
        g = growth[key]
        projected = ending[key]
        reviewable = [p for p in plans[key] if p["eligible_for_projection"]]
        review = min((p["order_place_dt"] for p in reviewable), default=None)
        missing = []
        if s["on_hand"] is None:
            missing.append("fresh_reported_inventory")
        if f["base_unfulfilled_units"] is None:
            missing.append("complete_firm_forecast_and_receipt_evidence")
        if e["planned_input_status"] != "available":
            missing.append("retailer_planned_order_feed")
        # References select all operands in this immutable release; no private
        # source scenario names, latent demand, future orders or labels are read.
        facts: dict[str, Any] = {"observation_date": s["observation_date"], "on_hand": s["on_hand"],
            "promised_due": s["promised_due"], "consecutive_zero_days": s["consecutive_zero_days"],
            "store_name": s["location_name"], "product_name": s["product_name"], "region": s["region"], "tier": s["tier"],
            "firm_unfulfilled_units": f["base_unfulfilled_units"], "conditional_unfulfilled_units": e["base_unfulfilled_units"],
            "comparison_state": e["comparison_state"], "firm_reasons": f["reasons"], "conditional_reasons": e["reasons"],
            "firm_ending_units": projected.get("firm"), "conditional_ending_units": projected.get("conditional"),
            "unit_retail_amount": f["unit_retail_amount"], "retail_price_basis": f["retail_price_basis"], "unit_cost_amount": f["unit_cost_amount"],
            "plans": plans[key], "source_tables": ["current_store", "daily", "metric_period", "metric_trend", "supply_assessment", "supply_projection", "supply_order", "supply_forecast", "expected_supply_assessment", "expected_supply_projection", "planned_order", "planned_coverage", "stockout_episode"],
            "source_key": {"location_id": loc, "product_id": prod}, "history": g,
            "latest_closed_week_velocity_trend": latest_trends.get(key),
            "production_path_days": 90, "action_feasibility": "not_established_no_action_selected"}

        def add(code: str, units: float | None, event: Any, *, retail: float | None = None,
                capital: float | None = None, carrying: float | None = None, extra_missing: list[str] | None = None):
            fid = _id("find_", prod, code)
            evidence.append(dict(finding_id=fid, evidence_id=_id("ev_", fid, loc), location_id=loc, product_id=prod,
                finding_code=code, facts_json=_json(facts), event_date=event, plan_review_date=review,
                units=units, retail_exposure_amount=retail, inventory_capital_amount=capital,
                carrying_cost_28d_amount=carrying, missing_evidence=sorted(set(missing + (extra_missing or [])))))

        # Mutually exclusive primary availability symptoms for each store-item.
        if s["reported_zero_on_hand"]:
            code = "current_out_of_stock" if key in historical else "promised_distribution_gap" if s["promised_due"] else "current_out_of_stock"
            add(code, 1., as_of.date()-timedelta(days=1))
        elif missing:
            add("availability_unknown", None, as_of.date()-timedelta(days=1))
        elif e["comparison_state"] == "gap_remains_under_plans":
            add("future_supply_gap", e["base_unfulfilled_units"], e["base_unfulfilled_date"], retail=e["estimated_unfulfilled_retail_amount"],
                extra_missing=["brand_stock_po_authorization_and_response_feasibility"])
        elif e["comparison_state"] == "firm_gap_conditionally_covered":
            add("conditional_plan_dependency", f["base_unfulfilled_units"], f["base_unfulfilled_date"],
                extra_missing=["planned_order_execution_and_stock_readiness"])
        if key in recoveries and s["on_hand"] is not None and s["on_hand"] > 0:
            add("observed_recovery", 1., recoveries[key])
        baseline = (g["baseline_units"] or 0) / g["baseline_days"] if g["baseline_days"] else 0
        good = g["eligible_days"] == 56 and g["sales_days"] >= 56*config.minimum_coverage and g["positive_days"] >= 56*config.minimum_coverage and g["baseline_days"] >= 28*config.minimum_coverage and g["baseline_positive_days"] >= 28*config.minimum_coverage
        for window in ("first", "second"):
            days, units = g[window+"_days"], g[window+"_units"]
            good = good and days >= 14*config.minimum_coverage and g[window+"_positive_days"] >= 14*config.minimum_coverage and baseline>0 and units is not None and units/days >= baseline*(1+config.trend_percent/100) and units-baseline*days >= config.trend_minimum_units
        if good and s["on_hand"] is not None and s["on_hand"] > 0:
            facts["expansion_comparison"] = {"baseline_days": 28, "recent_windows_days": [14, 14], "baseline_rate": baseline,
                "baseline_units_store_week": 7*baseline,
                "recent_units_store_week": 7*(g["first_units"]+g["second_units"])/(g["first_days"]+g["second_days"]),
                "baseline_dollars_store_week": 7*g["baseline_dollars"]/g["baseline_days"],
                "recent_dollars_store_week": 7*g["recent_dollars"]/(g["first_days"]+g["second_days"]),
                "first_change_pct": 100*(g["first_units"]/g["first_days"]/baseline-1), "second_change_pct": 100*(g["second_units"]/g["second_days"]/baseline-1)}
            add("sustained_outperformance", g["first_units"]+g["second_units"]-baseline*(g["first_days"]+g["second_days"]), as_of.date()-timedelta(days=1),
                extra_missing=["category_benchmark_buyer_demand_and_expansion_authorization"])
        demand = f["reference_daily_demand"]
        if demand is not None and demand > 0 and "firm" in projected:
            target = demand*config.excess_cover_days
            excess = max(0., projected["firm"]-target)
            conditional_excess = max(0., projected["conditional"]-target) if "conditional" in projected else None
            if excess > 1e-9 or (conditional_excess is not None and conditional_excess > 1e-9):
                facts["excess_calculation"] = {"horizon_date": as_of.date()+timedelta(days=27), "reference_daily_demand": demand,
                    "target_cover_days": config.excess_cover_days, "target_units": target, "firm_excess_units": excess,
                    "conditional_excess_units": conditional_excess,
                    "future_demand_basis": "28_day_reference_rate_not_a_forecast_beyond_28_days",
                    "annual_carrying_cost_rate": config.annual_carrying_cost_rate}
                cost = f["unit_cost_amount"]
                code = "excess_inventory" if excess > 1e-9 else "conditional_excess_inventory"
                exposed_units = excess if excess > 1e-9 else conditional_excess
                capital = exposed_units*cost if cost is not None and exposed_units is not None else None
                carry = capital*config.annual_carrying_cost_rate*28/365 if capital is not None and config.annual_carrying_cost_rate is not None else None
                add(code, exposed_units, as_of.date()+timedelta(days=27), capital=capital, carrying=carry,
                    extra_missing=(["unit_cost"] if cost is None else []) + (["approved_annual_carrying_cost_rate"] if config.annual_carrying_cost_rate is None else []) + ["order_change_permission_and_markdown_policy"] + (["planned_order_execution_and_stock_readiness"] if code=="conditional_excess_inventory" else []))
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in evidence:
        grouped[row["finding_id"]].append(row)
    findings = []
    for fid, members in sorted(grouped.items()):
        code = members[0]["finding_code"]
        promise, title, basis, units_basis, interpretation = RULES[code]
        dates = [r["event_date"] for r in members if r["event_date"] is not None]
        # DuckDB JSON dates are ISO strings; normalize before comparing dates.
        dates = [datetime.fromisoformat(str(d)).date() for d in dates]
        reviews = [r["plan_review_date"] for r in members if r["plan_review_date"] is not None]
        def complete_sum(field: str):
            return sum(r[field] for r in members) if all(r[field] is not None for r in members) else None
        findings.append(dict(finding_id=fid, product_id=members[0]["product_id"], promise=promise, finding_code=code,
            title=title, interpretation=f"{len(members)} stores; {complete_sum('units'):.2f} {units_basis.replace('_', ' ')}. {interpretation}" if complete_sum('units') is not None else f"{len(members)} stores. {interpretation}", supply_basis=basis, units_basis=units_basis, as_of=as_of,
            affected_store_count=len(members), first_event_date=min(dates) if dates else None, last_event_date=max(dates) if dates else None,
            eligible_store_count=populations[members[0]["product_id"]], affected_store_share=len(members)/populations[members[0]["product_id"]],
            context_json=_json({"distribution": distributions.get(members[0]["product_id"]),
                "latest_closed_week": period_context.get(members[0]["product_id"]),
                "population_basis": "currently_eligible_store_item_pairs_including_due_promised_stores",
                "target_cover_days": config.excess_cover_days}),
            earliest_plan_review_date=min(reviews) if reviews else None,
            **{f: complete_sum(f) for f in ("units", "retail_exposure_amount", "inventory_capital_amount", "carrying_cost_28d_amount")},
            retail_valued_store_count=sum(r["retail_exposure_amount"] is not None for r in members),
            cost_valued_store_count=sum(r["inventory_capital_amount"] is not None for r in members),
            missing_evidence=sorted({m for r in members for m in r["missing_evidence"]}),
            limitations=["No rank or action recommendation. Findings overlap across promises; do not sum them into a portfolio impact.",
                "Retail exposure, inventory capital and carrying cost are separate bases, not realized losses or savings.",
                "Plan placement dates are source review dates, not verified feasible-action deadlines."]))
    # JSON evidence dates may be strings; Arrow requires typed date values.
    for r in evidence:
        if isinstance(r["event_date"], str):
            r["event_date"] = datetime.fromisoformat(r["event_date"]).date()
    con.register("finding", pa.Table.from_pylist(findings, schema=FINDING_SCHEMA))
    con.register("finding_evidence", pa.Table.from_pylist(evidence, schema=EVIDENCE_SCHEMA))
