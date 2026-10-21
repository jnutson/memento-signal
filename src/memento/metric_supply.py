"""Exhaustive, non-ranked supply metrics over observable canonical inputs only."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
import math
from typing import Any, Sequence

import duckdb
import pyarrow as pa

from .availability_forecasting import choose_bias, choose_wape
from .metrics import demand_paths, normalize_weekday_shares, project_inventory, timing_stability

# Numerical equality guard only, not a business stock or alert threshold.
ZERO_TOLERANCE=1e-9


ASSESSMENT_SCHEMA = pa.schema([
    ("location_id", pa.string()), ("product_id", pa.string()), ("as_of", pa.timestamp("us", tz="UTC")),
    ("observation_date", pa.date32()), ("current_state", pa.string()), ("projection_status", pa.string()),
    ("reasons", pa.list_(pa.string())), ("on_hand", pa.float64()),
    ("forecast_status", pa.string()), ("supply_evidence_status", pa.string()), ("economics_status", pa.string()),
    ("forecast_bias", pa.float64()), ("forecast_wape", pa.float64()), ("forecast_quality", pa.float64()),
    ("forecast_fit_weeks", pa.int64()), ("forecast_fallback", pa.string()), ("weekday_shaping", pa.string()),
    ("demand_model", pa.string()),
    ("latest_forecast_creation_week", pa.int64()), ("reference_daily_demand", pa.float64()),
    ("days_of_cover", pa.float64()), ("cover_status", pa.string()),
    ("demand_low_28d", pa.float64()), ("demand_base_28d", pa.float64()), ("demand_high_28d", pa.float64()),
    ("firm_outstanding_units", pa.float64()), ("firm_open_units", pa.float64()), ("firm_in_transit_units", pa.float64()),
    ("dated_future_units", pa.float64()), ("overdue_units", pa.float64()), ("undated_units", pa.float64()),
    ("beyond_horizon_units", pa.float64()), ("supply_reconciliation_gap_units", pa.float64()),
    ("reported_receipts_units", pa.float64()), ("po_received_units_observation_day", pa.float64()),
    ("receipt_reconciliation_gap_units", pa.float64()),
    *[(f"{p}_{field}", pa.date32()) for p in ("low", "base", "high") for field in ("depletion_date", "unfulfilled_date")],
    *[(f"{p}_unfulfilled_units", pa.float64()) for p in ("low", "base", "high")],
    ("timing_span_days", pa.int64()), ("timing_stability", pa.float64()),
    ("unit_retail_amount", pa.float64()), ("retail_price_basis", pa.string()), ("unit_cost_amount", pa.float64()),
    ("estimated_unfulfilled_retail_amount", pa.float64()),
    ("estimated_retail_minus_cost_amount", pa.float64()),
    ("recent_sales_coverage", pa.float64()), ("recent_inventory_coverage", pa.float64()),
])
PROJECTION_SCHEMA = pa.schema([
    ("location_id", pa.string()), ("product_id", pa.string()), ("projection_date", pa.date32()),
    ("path", pa.string()), *[(name, pa.float64()) for name in
                            ("demand_units", "inbound_units", "opening_units", "available_units",
                             "fulfilled_units", "unfulfilled_units", "ending_units")],
])
ORDER_SCHEMA = pa.schema([
    ("location_id", pa.string()), ("product_id", pa.string()), ("retailer_order_id", pa.string()),
    ("order_line_number", pa.int64()), ("event_version", pa.int64()), ("known_at", pa.timestamp("us", tz="UTC")),
    ("expected_store_receipt_date", pa.date32()), ("status_code", pa.string()),
    ("order_created_at", pa.timestamp("us",tz="UTC")), ("ordered_units",pa.float64()),
    ("outstanding_units", pa.float64()), ("open_units", pa.float64()), ("in_transit_units", pa.float64()),
    ("receipt_timing", pa.string()), ("included_in_projection", pa.bool_()),
])
FORECAST_SCHEMA=pa.schema([
    ("location_id",pa.string()),("product_id",pa.string()),("target_retail_year_week",pa.int64()),
    ("forecast_created_retail_year_week",pa.int64()),("last_closed_retail_week",pa.int64()),
    ("creation_week_end",pa.date32()),("retailer_forecast_units",pa.float64()),
    ("forecast_bias",pa.float64()),("adjusted_weekly_units",pa.float64()),
])


def _finite(value) -> bool:
    return value is not None and math.isfinite(float(value))


def forecast_inputs(con, as_of: datetime, present: set[str], demand_model: str = "retailer_baseline"):
    """Fit chronologically on complete non-stockout weeks; never use outcome truth."""
    if not {"calendar_day", "demand_forecast_weekly"} <= present:
        return {}, [], {}, {}, "forecast_inputs_unavailable"
    observation = as_of.date()-timedelta(days=1)
    horizon = [(r[0], int(r[1]), int(r[2])) for r in con.execute(
        "SELECT calendar_date,retail_year_week,calendar_weekday_number FROM calendar_day WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date",
        [observation+timedelta(days=1), observation+timedelta(days=28)]).fetchall()]
    expected = [observation+timedelta(days=i) for i in range(1,29)]
    if [r[0] for r in horizon] != expected or any(not 1 <= r[2] <= 7 for r in horizon):
        return {}, [], {}, {}, "forward_calendar_incomplete"
    closed = con.execute("SELECT max(retail_year_week) FROM (SELECT retail_year_week,max(calendar_date) end_date FROM calendar_day GROUP BY ALL) WHERE end_date<?", [as_of.date()]).fetchall()[0][0]
    if closed is None:
        return {}, horizon, {}, {}, "no_closed_forecast_vintage"
    # A weekly vintage becomes usable only once its creation week is closed.
    invalid = con.execute("""SELECT count(*) FROM demand_forecast_weekly WHERE forecast_quantity IS NULL
      OR NOT isfinite(forecast_quantity::DOUBLE) OR forecast_quantity<0
      OR forecast_created_retail_year_week IS NULL OR target_retail_year_week IS NULL
      OR forecast_created_retail_year_week>=target_retail_year_week""").fetchall()[0][0]
    if invalid:
        raise ValueError("invalid canonical forecast domain")
    duplicates = con.execute("""SELECT count(*) FROM (SELECT location_id,product_id,forecast_created_retail_year_week,
        target_retail_year_week FROM demand_forecast_weekly GROUP BY ALL HAVING count(*)>1)""").fetchall()[0][0]
    if duplicates:
        raise ValueError("duplicate forecast vintage")
    con.execute("""CREATE TEMP TABLE forecast_known AS SELECT * FROM demand_forecast_weekly
        WHERE forecast_created_retail_year_week<=?""", [closed])
    # Daily sales are already channel-consolidated. Full weeks with closing-zero
    # observations cannot train unconstrained-demand calibration.
    history = con.execute("""WITH weekly AS (
      SELECT d.location_id,d.product_id,c.retail_year_week,min(d.business_date) first_day,
      sum(d.units)::DOUBLE actual_units FROM daily d JOIN calendar_day c ON c.calendar_date=d.business_date
      WHERE d.business_date BETWEEN ? AND ? AND d.sales_valid AND d.inventory_valid
      AND d.on_hand>0 AND d.units>=0 GROUP BY ALL HAVING count(*)=7
    ) SELECT w.*,f.forecast_quantity::DOUBLE forecast_units FROM weekly w JOIN forecast_known f
      ON w.location_id=f.location_id AND w.product_id=f.product_id AND w.retail_year_week=f.target_retail_year_week
      AND f.forecast_created_retail_year_week<f.target_retail_year_week
      QUALIFY row_number() OVER(PARTITION BY w.location_id,w.product_id,w.retail_year_week ORDER BY f.forecast_created_retail_year_week DESC)=1
      ORDER BY w.retail_year_week,w.location_id,w.product_id""", [observation-timedelta(days=55),observation]).fetchall()
    pairs = defaultdict(list); frozen = defaultdict(list)
    item_stats = defaultdict(lambda: [0.,0.,0.]); cohort_stats = [0.,0.,0.]
    item_errors = defaultdict(lambda: [0.,0.,0.]); cohort_errors = [0.,0.,0.]
    from itertools import groupby
    for _, group in groupby(history, key=lambda r: r[2]):
        pending = []
        for store, product, _, first, actual, retailer in group:
            key = (store,product)
            bias,_ = choose_bias(key,product,pairs,item_stats,cohort_stats)
            if demand_model == "retailer_baseline":
                bias = 1.
            pending.append((key,first,float(actual),float(retailer),float(retailer)*bias))
        for key,first,actual,retailer,adjusted in pending:
            pairs[key].append((actual,retailer)); frozen[key].append((actual,adjusted))
            for stats in (item_stats[key[1]],cohort_stats):
                stats[0]+=1; stats[1]+=actual; stats[2]+=retailer
            for stats in (item_errors[key[1]],cohort_errors):
                stats[0]+=1; stats[1]+=actual; stats[2]+=abs(actual-adjusted)
    target_weeks = sorted({r[1] for r in horizon})
    future = defaultdict(dict)
    for store, product, week, qty, created in con.execute("""SELECT location_id,product_id,target_retail_year_week,
        forecast_quantity::DOUBLE,forecast_created_retail_year_week FROM forecast_known
        WHERE target_retail_year_week IN (SELECT unnest(?))
        QUALIFY row_number() OVER(PARTITION BY location_id,product_id,target_retail_year_week ORDER BY forecast_created_retail_year_week DESC)=1
        ORDER BY location_id,product_id,target_retail_year_week""", [target_weeks]).fetchall():
        future[(store,product)][int(week)] = (float(qty),int(created))
    weekday_by_key = defaultdict(lambda: [0.]*7); weekday_by_item = defaultdict(lambda: [0.]*7); cohort_days = [0.]*7
    # The same censored fitting weeks determine shaping, with an explicit fallback.
    for store, product, weekday, units in con.execute("""SELECT d.location_id,d.product_id,d.weekday,sum(d.units)::DOUBLE
      FROM daily d JOIN (SELECT location_id,product_id,week_start FROM daily
      WHERE business_date BETWEEN ? AND ? GROUP BY ALL
      HAVING count(*) FILTER(WHERE sales_valid AND inventory_valid AND on_hand>0 AND units>=0)=7) w
      USING(location_id,product_id,week_start) GROUP BY ALL ORDER BY d.location_id,d.product_id,d.weekday""", [observation-timedelta(days=55),observation]).fetchall():
        weekday_by_key[(store,product)][weekday-1]+=units
        weekday_by_item[product][weekday-1]+=units; cohort_days[weekday-1]+=units
    model = {}
    keys = set(future)
    for key in sorted(keys):
        product=key[1]
        bias,fallback = choose_bias(key,product,pairs,item_stats,cohort_stats)
        wape = choose_wape(key,product,frozen,item_errors,cohort_errors)
        if len(pairs[key])>=4 and sum(weekday_by_key[key])>0:
            units,basis=weekday_by_key[key],"store_item"
        elif item_stats[product][0]>=20 and sum(weekday_by_item[product])>0:
            units,basis=weekday_by_item[product],"item"
        elif cohort_stats[0]>=20 and sum(cohort_days)>0:
            units,basis=cohort_days,"cohort"
        else:
            units,basis=[1.]*7,"uniform_model_fallback"
        model[key]=(bias,wape,"cohort" if fallback=="brand" else fallback,normalize_weekday_shares(units),basis,len(pairs[key]))
        if demand_model == "retailer_baseline":
            model[key]=(1.,wape,"unchanged_retailer",normalize_weekday_shares([1.]*7),"uniform_weekly_conservation",len(pairs[key]))
    return dict(future),horizon,model,dict(pairs),None


def build_supply(con: duckdb.DuckDBPyConnection, *, as_of: datetime, present: set[str], demand_model: str = "retailer_baseline") -> None:
    if demand_model not in {"retailer_baseline", "historical_adjusted"}:
        raise ValueError("unsupported demand model")
    observation=as_of.date()-timedelta(days=1)
    future,calendar,models,_,forecast_problem=forecast_inputs(con,as_of,present,demand_model)
    stocks = {(r["location_id"],r["product_id"]): r for r in con.execute(
        "SELECT * FROM inventory_daily WHERE business_date=?",[observation]).to_arrow_table().to_pylist()}
    recent_sales = {(s,p):(float(u),float(d)) for s,p,u,d in con.execute("""SELECT location_id,product_id,sum(units),sum(dollars)
        FROM daily WHERE sales_valid AND business_date>? GROUP BY ALL""",[observation-timedelta(days=28)]).fetchall()}
    costs = {}
    if "company_item_economics" in present:
        for product,cost in con.execute("""SELECT c.product_id,e.unit_cost_amount FROM company_item c
            JOIN company_item_economics e USING(company_id,company_item_id)
            WHERE c.effective_from<=? AND (c.effective_to IS NULL OR c.effective_to>=?)
            AND e.effective_from<=? AND (e.effective_to IS NULL OR e.effective_to>=?)""",[observation]*4).fetchall():
            if product in costs:
                raise ValueError("ambiguous supply economics")
            if _finite(cost) and float(cost)>=0:
                costs[product]=float(cost)
    orders = defaultdict(list)
    receipts={}
    if "replenishment_commitment" in present:
        invalid=con.execute("""SELECT count(*) FROM replenishment_commitment WHERE known_at IS NULL OR order_created_at IS NULL
          OR retailer_order_id IS NULL OR order_line_number IS NULL OR order_line_number<1
          OR event_version IS NULL OR event_version<1 OR known_at<order_created_at
          OR status_code IS NULL OR status_code NOT IN ('ordered','approved_to_ship','in_transit','partially_received','received','cancelled')""").fetchall()[0][0]
        duplicate=con.execute("""SELECT count(*) FROM (SELECT retailer_order_id,order_line_number,event_version
          FROM replenishment_commitment GROUP BY ALL HAVING count(*)>1)""").fetchall()[0][0]
        if invalid or duplicate:
            raise ValueError("invalid canonical PO identity, chronology, status or version")
        receipts={(s,p):float(q) for s,p,q in con.execute("""WITH versions AS (
          SELECT *,received_quantity-lag(received_quantity,1,0) OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version) delta
          FROM replenishment_commitment WHERE known_at<=?) SELECT location_id,product_id,sum(delta)
          FROM versions WHERE known_at::DATE=? GROUP BY ALL""",[as_of,observation]).fetchall()}
        raw = con.execute("""SELECT * FROM replenishment_commitment WHERE known_at<=?
            QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC)=1
            ORDER BY location_id,product_id,retailer_order_id,order_line_number""",[as_of]).to_arrow_table().to_pylist()
        for row in raw:
            if row["order_created_at"] is None or row["order_created_at"]>as_of:
                raise ValueError("known PO precedes its creation")
            quantities=[row[k] for k in ("ordered_quantity","invoiced_quantity","received_quantity")]
            if any(not _finite(x) or float(x)<0 for x in quantities) or not quantities[0]>=quantities[1]>=quantities[2]:
                raise ValueError("invalid firm PO quantities")
            ordered,invoiced,received=map(float,quantities)
            outstanding=0. if row["status_code"]=="cancelled" else ordered-received
            open_units=0. if row["status_code"]=="cancelled" else ordered-invoiced
            transit=0. if row["status_code"]=="cancelled" else invoiced-received
            due=row["expected_store_receipt_date"]
            timing=("closed" if outstanding==0 else "undated" if due is None else "overdue" if due<=observation
                    else "beyond_horizon" if due>observation+timedelta(days=28) else "future")
            orders[(row["location_id"],row["product_id"])].append({
                **{k:row[k] for k in ("location_id","product_id","retailer_order_id","order_line_number","event_version","known_at","expected_store_receipt_date","status_code")},
                "outstanding_units":outstanding,"open_units":open_units,"in_transit_units":transit,
                "order_created_at":row["order_created_at"],"ordered_units":float(row["ordered_quantity"]),
                "receipt_timing":timing,"included_in_projection":timing=="future"})
    assessments=[]; projections=[]; evidence=[]; forecast_evidence=[]
    closed_weeks={}
    if "calendar_day" in present:
        closed_weeks=dict(con.execute("SELECT retail_year_week,max(calendar_date) FROM calendar_day GROUP BY ALL HAVING max(calendar_date)<?",[as_of.date()]).fetchall())
    for current in con.execute("SELECT * FROM current_store ORDER BY location_id,product_id").to_arrow_table().to_pylist():
        key=current["location_id"],current["product_id"]
        row: dict[str, Any]={field.name:None for field in ASSESSMENT_SCHEMA}
        row.update(location_id=key[0],product_id=key[1],as_of=as_of,observation_date=observation,
                   current_state=current["current_state"],on_hand=current["on_hand"],reasons=[],
                   projection_status="insufficient_data",forecast_status="unavailable",supply_evidence_status="unknown",demand_model=demand_model,
                   economics_status="unavailable",cover_status="unavailable",forecast_fit_weeks=0,
                   recent_sales_coverage=current["recent_sales_coverage"],recent_inventory_coverage=current["recent_inventory_coverage"])
        reasons=[]
        if not current["eligible"]:
            row["projection_status"]="not_applicable"
            reasons.append("outside_current_scope")
        if current["on_hand"] is None:
            reasons.append("inventory_missing_or_stale")
        known_orders=orders[key]; evidence.extend(known_orders)
        if "replenishment_commitment" not in present:
            reasons.append("firm_supply_inputs_unavailable")
        else:
            for field,condition in (("firm_outstanding_units",None),("firm_open_units","open"),("firm_in_transit_units","transit"),
                                    ("dated_future_units","future"),("overdue_units","overdue"),("undated_units","undated"),("beyond_horizon_units","beyond_horizon")):
                row[field]=sum(o["open_units"] if condition=="open" else o["in_transit_units"] if condition=="transit"
                               else o["outstanding_units"] for o in known_orders if condition in (None,"open","transit") or o["receipt_timing"]==condition)
            stock=stocks.get(key,{})
            if stock.get("on_order_quantity") is None or stock.get("in_transit_quantity") is None:
                reasons.append("inventory_supply_balances_unavailable")
            else:
                gap=abs(float(stock["on_order_quantity"])-row["firm_open_units"])+abs(float(stock["in_transit_quantity"])-row["firm_in_transit_units"])
                row["supply_reconciliation_gap_units"]=gap
                if gap:
                    reasons.append("firm_supply_balance_mismatch")
            if stock.get("receipt_quantity") is None:
                reasons.append("inventory_receipt_balance_unavailable")
            else:
                received=receipts.get(key,0.)
                row["reported_receipts_units"]=float(stock["receipt_quantity"])
                row["po_received_units_observation_day"]=received
                row["receipt_reconciliation_gap_units"]=abs(float(stock["receipt_quantity"])-received)
                if row["receipt_reconciliation_gap_units"]:
                    reasons.append("firm_receipt_balance_mismatch")
            if row["overdue_units"]:
                reasons.append("overdue_firm_receipts_excluded")
            if row["undated_units"]:
                reasons.append("undated_firm_receipts_excluded")
            if not any(r in reasons for r in ("inventory_supply_balances_unavailable","firm_supply_balance_mismatch",
                                             "inventory_receipt_balance_unavailable","firm_receipt_balance_mismatch")):
                row["supply_evidence_status"]="known_with_timing_gaps" if row["overdue_units"] or row["undated_units"] else "reconciled"
        model=models.get(key)
        base=[]
        paths: dict[str,list[float]]={p:[] for p in ("low","base","high")}
        if forecast_problem:
            reasons.append(forecast_problem)
        elif model is None or any(week not in future.get(key,{}) for _,week,_ in calendar):
            reasons.append("forward_forecast_incomplete")
        else:
            bias,wape,fallback,shares,shaping,fit=model
            base=[future[key][week][0]*bias*shares[weekday-1] for _,week,weekday in calendar]
            row.update(forecast_status="available",forecast_bias=bias,forecast_wape=wape,
                       forecast_quality=None if wape is None else 1-min(max(wape,0),1),forecast_fit_weeks=fit,
                       forecast_fallback=fallback,weekday_shaping=shaping,
                       latest_forecast_creation_week=max(v[1] for v in future[key].values()))
            daily=sum(base)/28
            row["reference_daily_demand"]=daily
            row["cover_status"]="nonpositive_reference_demand" if daily==0 else "inventory_unavailable" if row["on_hand"] is None else "available"
            if daily>0 and row["on_hand"] is not None:
                row["days_of_cover"]=row["on_hand"]/daily
            if wape is None:
                reasons.append("forecast_error_unavailable_full_sensitivity_band")
            for value in base:
                for name,units in demand_paths(value,wape if wape is not None else 1.).items():
                    paths[name].append(units)
            for name in paths:
                row[f"demand_{name}_28d"]=sum(paths[name])
        if model is not None:
            for week,(quantity,created) in sorted(future[key].items()):
                forecast_evidence.append({"location_id":key[0],"product_id":key[1],"target_retail_year_week":week,
                    "forecast_created_retail_year_week":created,"last_closed_retail_week":max(closed_weeks),
                    "creation_week_end":closed_weeks.get(created),"retailer_forecast_units":quantity,
                    "forecast_bias":model[0],"adjusted_weekly_units":quantity*model[0]})
        stock=stocks.get(key,{})
        price=stock.get("current_unit_retail_amount")
        if _finite(price) and float(price)>=0:
            row["unit_retail_amount"]=float(price); row["retail_price_basis"]="reported_current_inventory_price"
        elif key in recent_sales and recent_sales[key][0]>0 and recent_sales[key][1]>=0:
            row["unit_retail_amount"]=recent_sales[key][1]/recent_sales[key][0]
            row["retail_price_basis"]="realized_28d_average"
        if key[1] in costs:
            row["unit_cost_amount"]=costs[key[1]]
        if row["unit_retail_amount"] is None:
            reasons.append("retail_price_unavailable")
        if row["unit_cost_amount"] is None:
            reasons.append("unit_cost_unavailable")
        row["economics_status"]="available" if row["unit_retail_amount"] is not None and row["unit_cost_amount"] is not None else "partial" if row["unit_retail_amount"] is not None else "unavailable"
        if current["eligible"] and row["on_hand"] is not None and base and row["supply_evidence_status"]!="unknown":
            inbound=defaultdict(float)
            for order in known_orders:
                if order["included_in_projection"]:
                    inbound[order["expected_store_receipt_date"]]+=order["outstanding_units"]
            projection_demand: dict[str,Sequence[float]]={name:tuple(values) for name,values in paths.items()}
            trace,depletion=project_inventory(float(row["on_hand"]),[r[0] for r in calendar],projection_demand,inbound)
            for name in paths:
                sub=[r for r in trace if r.path==name]
                depletion[name]=next((r.date for r in sub if r.ending_units<=ZERO_TOLERANCE),None)
                row[f"demand_{name}_28d"]=sum(paths[name])
                row[f"{name}_depletion_date"]=depletion[name]
                row[f"{name}_unfulfilled_date"]=next((r.date for r in sub if r.lost_units>ZERO_TOLERANCE),None)
                lost=sum(r.lost_units for r in sub)
                row[f"{name}_unfulfilled_units"]=lost if lost>ZERO_TOLERANCE else 0.
            row["projection_status"]=("projected_unfulfilled_demand" if row["base_unfulfilled_units"]>0
                                      else "projected_depletion" if row["base_depletion_date"] is not None else "healthy_28d")
            row["timing_span_days"],row["timing_stability"]=timing_stability(depletion["high"],depletion["base"],depletion["low"])
            if row["unit_retail_amount"] is not None:
                row["estimated_unfulfilled_retail_amount"]=row["base_unfulfilled_units"]*row["unit_retail_amount"]
                if row["unit_cost_amount"] is not None:
                    row["estimated_retail_minus_cost_amount"]=row["base_unfulfilled_units"]*(row["unit_retail_amount"]-row["unit_cost_amount"])
            for r in trace:
                projections.append({"location_id":key[0],"product_id":key[1],"projection_date":r.date,"path":r.path,
                                    "demand_units":r.demand_units,"inbound_units":r.inbound_units,"opening_units":r.opening_units,
                                    "available_units":r.available_units,"fulfilled_units":r.fulfilled_units,"unfulfilled_units":r.lost_units,"ending_units":r.ending_units})
        row["reasons"]=sorted(set(reasons)); assessments.append(row)
    for name,rows,schema in (("supply_assessment",assessments,ASSESSMENT_SCHEMA),("supply_projection",projections,PROJECTION_SCHEMA),
                             ("supply_order",evidence,ORDER_SCHEMA),("supply_forecast",forecast_evidence,FORECAST_SCHEMA)):
        con.register(name,pa.Table.from_pylist(rows,schema=schema))
