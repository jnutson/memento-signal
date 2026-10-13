from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import duckdb

from .availability_signal import build_availability_candidates
from .demand_signal import build_demand_candidate
from .inventory_signal import build_inventory_candidate
from .models import IngestionFailure, ValidationResult
from .prediction import run_predictions
from .signal_contract import ForecastVintage, Observation, SIGNAL_TYPE_ORDER
from .signal_publication import publish_signal_set
from .signal_ranking import rank_signal_candidates
from .metrics import clamp, normalize_weekday_shares
from .supply import load_model, order_arrivals, projection_context, action_options, json_context
from .manifest import sha256_file
from .metrics import project_inventory, timing_stability, reaction_metrics, confidence_score
from .signal_contract import decimal_value, stable_signal_id, CandidateBatch

__all__ = ["rank_signal_candidates", "run_signals"]


def _scan(canonical_root: Path, table: str) -> str:
    return str(canonical_root / table / "*.parquet")


def _load_observations(connection: duckdb.DuckDBPyConnection, canonical_root: Path) -> list[Observation]:
    rows = connection.execute("""WITH sales_day AS (
        SELECT business_date,location_id,product_id,sum(sales_quantity)::DOUBLE units,sum(sales_amount)::DOUBLE amount
        FROM read_parquet(?) GROUP BY ALL)
        SELECT i.business_date observation_date,i.location_id store_id,i.product_id,
        i.on_hand_quantity::DOUBLE on_hand,
        CASE WHEN s.units>0 THEN s.amount/s.units ELSE i.current_unit_retail_amount END::DOUBLE price,
        i.assorted,i.replenishment_enabled,l.source_status_code location_status,
        c.company_item_id,e.unit_cost_amount::DOUBLE unit_cost
        FROM read_parquet(?) i JOIN read_parquet(?) c USING(product_id)
        JOIN read_parquet(?) e USING(company_id,company_item_id)
        JOIN read_parquet(?) p USING(product_id) JOIN read_parquet(?) l USING(location_id)
        LEFT JOIN sales_day s USING(business_date,location_id,product_id)
        WHERE i.business_date=(SELECT max(business_date) FROM read_parquet(?))
          AND c.company_id='MIRO_TOYS' AND c.display_brand_id='MIRO_SPARK'
          AND p.brand_name='BRAND_A' AND upper(p.source_status_code) IN ('A','ACTIVE')
          AND p.effective_date<=i.business_date AND p.replenishment_enabled
          AND c.effective_from<=i.business_date AND (c.effective_to IS NULL OR c.effective_to>=i.business_date)
          AND e.effective_from<=i.business_date AND (e.effective_to IS NULL OR e.effective_to>=i.business_date)""", [
            _scan(canonical_root, "sales_daily"), _scan(canonical_root, "inventory_daily"),
            _scan(canonical_root, "company_item"), _scan(canonical_root, "company_item_economics"),
            _scan(canonical_root, "product"), _scan(canonical_root, "location"),
            _scan(canonical_root, "inventory_daily"),
        ]).fetchall()
    return [Observation(
        observation_date=row[0], store_id=str(row[1]), product_id=str(row[2]),
        on_hand=float(row[3]), price=float(row[4]) if row[4] is not None else None,
        assorted=bool(row[5]), replenishment_enabled=bool(row[6]), location_status=str(row[7]),
        company_item_id=str(row[8]), unit_cost=float(row[9]),
    ) for row in rows]


def _load_reactions(connection: duckdb.DuckDBPyConnection, canonical_root: Path, observation_date: date) -> dict[tuple[str, str], int]:
    rows = connection.execute("""SELECT item_scope_type_code,item_scope_id,minimum_reaction_days
        FROM read_parquet(?) WHERE company_id='MIRO_TOYS'
          AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)""", [
            _scan(canonical_root, "reaction_constraint"), observation_date, observation_date,
        ]).fetchall()
    return {(str(scope), str(key)): int(days) for scope, key, days in rows}


def _minimum_reaction(observation: Observation, reactions: dict[tuple[str, str], int]) -> int:
    value = reactions.get(("item", str(observation["company_item_id"])), reactions.get(("brand", "MIRO_SPARK"), reactions.get(("all", "all"))))
    if value is None:
        raise ValueError(f"no effective reaction constraint for product {observation['product_id']}")
    return value


def _load_history(connection: duckdb.DuckDBPyConnection, canonical_root: Path, observation: Observation) -> list[tuple[int, float, float]]:
    rows = connection.execute("""WITH weekly AS (
      SELECT c.retail_year_week,sum(s.sales_quantity)::DOUBLE actual_units
      FROM read_parquet(?) s JOIN read_parquet(?) i USING(business_date,location_id,product_id)
      JOIN read_parquet(?) c ON c.calendar_date=s.business_date
      WHERE s.location_id=? AND s.product_id=? AND s.business_date<? AND s.sales_quantity>=0
        AND NOT(i.on_hand_quantity=0 AND i.assorted AND i.replenishment_enabled)
      GROUP BY c.retail_year_week HAVING count(DISTINCT s.business_date)=7
    ), selected AS (
      SELECT w.retail_year_week,w.actual_units,f.forecast_quantity::DOUBLE forecast_units
      FROM weekly w JOIN read_parquet(?) f ON f.target_retail_year_week=w.retail_year_week
      WHERE f.location_id=? AND f.product_id=? AND f.forecast_created_retail_year_week<f.target_retail_year_week
      QUALIFY row_number() OVER(PARTITION BY w.retail_year_week ORDER BY f.forecast_created_retail_year_week DESC)=1)
    SELECT * FROM selected ORDER BY retail_year_week DESC LIMIT 8""", [
        _scan(canonical_root, "sales_daily"), _scan(canonical_root, "inventory_daily"), _scan(canonical_root, "calendar_day"),
        observation["store_id"], observation["product_id"], observation["observation_date"],
        _scan(canonical_root, "demand_forecast_weekly"), observation["store_id"], observation["product_id"],
    ]).fetchall()[::-1]
    return [(int(week), float(actual), float(forecast)) for week, actual, forecast in rows]


def _load_weekday_inputs(
    connection: duckdb.DuckDBPyConnection, canonical_root: Path, observation_date: date,
) -> tuple[
    dict[tuple[str, str], tuple[int, list[float]]],
    dict[str, tuple[int, list[float]]],
    tuple[int, list[float]],
]:
    history_start = observation_date - timedelta(days=55)
    rows = connection.execute("""WITH scoped AS (
      SELECT c.product_id FROM read_parquet(?) c JOIN read_parquet(?) p USING(product_id)
      WHERE c.company_id='MIRO_TOYS' AND c.display_brand_id='MIRO_SPARK' AND p.brand_name='BRAND_A'
        AND upper(p.source_status_code) IN ('A','ACTIVE') AND p.effective_date<=? AND p.replenishment_enabled
        AND c.effective_from<=? AND (c.effective_to IS NULL OR c.effective_to>=?)
    ), sales_day AS (
      SELECT business_date,location_id,product_id,sum(sales_quantity)::DOUBLE units
      FROM read_parquet(?) WHERE business_date BETWEEN ? AND ? GROUP BY ALL
    ), eligible_week AS (
      SELECT s.location_id,s.product_id,c.retail_year_week
      FROM sales_day s JOIN scoped q USING(product_id) JOIN read_parquet(?) i USING(business_date,location_id,product_id)
      JOIN read_parquet(?) c ON c.calendar_date=s.business_date
      WHERE s.units>=0 AND i.on_hand_quantity>=0 AND i.assorted AND i.replenishment_enabled
        AND NOT(i.on_hand_quantity=0 AND i.assorted AND i.replenishment_enabled)
      GROUP BY s.location_id,s.product_id,c.retail_year_week
      HAVING count(DISTINCT s.business_date)=7 AND max(s.business_date)<?
    ), selected_pair AS (
      SELECT e.location_id,e.product_id,e.retail_year_week
      FROM eligible_week e JOIN read_parquet(?) f ON f.location_id=e.location_id AND f.product_id=e.product_id
        AND f.target_retail_year_week=e.retail_year_week
      WHERE f.forecast_created_retail_year_week<f.target_retail_year_week
      QUALIFY row_number() OVER(PARTITION BY e.location_id,e.product_id,e.retail_year_week ORDER BY f.forecast_created_retail_year_week DESC)=1
    )
    SELECT p.location_id,p.product_id,p.retail_year_week,c.calendar_weekday_number,sum(s.units)::DOUBLE units
    FROM selected_pair p JOIN read_parquet(?) c USING(retail_year_week)
    JOIN sales_day s ON s.business_date=c.calendar_date AND s.location_id=p.location_id AND s.product_id=p.product_id
    GROUP BY ALL ORDER BY p.location_id,p.product_id,p.retail_year_week,c.calendar_weekday_number""", [
        _scan(canonical_root, "company_item"), _scan(canonical_root, "product"),
        observation_date, observation_date, observation_date, _scan(canonical_root, "sales_daily"),
        history_start, observation_date, _scan(canonical_root, "inventory_daily"),
        _scan(canonical_root, "calendar_day"), observation_date, _scan(canonical_root, "demand_forecast_weekly"),
        _scan(canonical_root, "calendar_day"),
    ]).fetchall()
    key_weeks: dict[tuple[str, str], set[int]] = defaultdict(set)
    item_pairs: dict[str, set[tuple[str, int]]] = defaultdict(set)
    brand_pairs: set[tuple[str, str, int]] = set()
    key_units: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0] * 7)
    item_units: dict[str, list[float]] = defaultdict(lambda: [0.0] * 7)
    brand_units = [0.0] * 7
    for location, product, week, weekday, units in rows:
        key = (str(location), str(product)); product = str(product); week = int(week); index = int(weekday) - 1
        key_weeks[key].add(week); item_pairs[product].add((str(location), week)); brand_pairs.add((str(location), product, week))
        key_units[key][index] += float(units); item_units[product][index] += float(units); brand_units[index] += float(units)
    keys = {key: (len(key_weeks[key]), units) for key, units in key_units.items()}
    items = {product: (len(item_pairs[product]), units) for product, units in item_units.items()}
    return keys, items, (len(brand_pairs), brand_units)


def _daily_base_forecast(
    connection: duckdb.DuckDBPyConnection,
    canonical_root: Path,
    observation: Observation,
    future: list[ForecastVintage],
    weekday_inputs: tuple[
        dict[tuple[str, str], tuple[int, list[float]]],
        dict[str, tuple[int, list[float]]],
        tuple[int, list[float]],
    ],
    calendar_rows: list[tuple[date, int, int]] | None = None,
) -> list[float]:
    key = (str(observation["store_id"]), str(observation["product_id"]))
    keys, items, brand = weekday_inputs
    key_count, key_units = keys.get(key, (0, [0.0] * 7))
    item_count, item_units = items.get(key[1], (0, [0.0] * 7))
    if key_count >= 4:
        shares = normalize_weekday_shares(key_units)
    elif item_count >= 20:
        shares = normalize_weekday_shares(item_units)
    elif brand[0] >= 20:
        shares = normalize_weekday_shares(brand[1])
    else:
        shares = normalize_weekday_shares([1.0] * 7)
    weekly = {int(row["target_retail_year_week"]): float(row["memento_weekly_demand_base"]) for row in future}
    first_day = observation["observation_date"] + timedelta(days=1)
    last_day = observation["observation_date"] + timedelta(days=28)
    calendar = calendar_rows if calendar_rows is not None else connection.execute(
        "SELECT calendar_date,retail_year_week,calendar_weekday_number FROM read_parquet(?) "
        "WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date",
        [_scan(canonical_root, "calendar_day"), first_day, last_day],
    ).fetchall()
    if len(calendar) != 28 or any(int(week) not in weekly for _, week, _ in calendar):
        return []
    return [weekly[int(week)] * shares[int(weekday) - 1] for _, week, weekday in calendar]


def _load_inbound(connection: duckdb.DuckDBPyConnection, canonical_root: Path, observation: Observation, signal_as_of: datetime) -> dict[date, float]:
    rows = connection.execute("""WITH latest AS (
      SELECT * FROM read_parquet(?) WHERE location_id=? AND product_id=? AND known_at<=?
      QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC,known_at DESC)=1)
      SELECT expected_store_receipt_date,
        sum(CASE WHEN status_code='cancelled' THEN 0 ELSE greatest(ordered_quantity-received_quantity,0) END)::DOUBLE
      FROM latest WHERE expected_store_receipt_date IS NOT NULL GROUP BY expected_store_receipt_date""", [
        _scan(canonical_root, "replenishment_commitment"), observation["store_id"], observation["product_id"], signal_as_of,
    ]).fetchall()
    return {row[0]: float(row[1]) for row in rows}


def run_signals(
    canonical_root: Path, *, data_root: Path,
    annual_carrying_cost_rate: Decimal,
    carrying_rate_version: str,
    supply_model_path: Path | None = None,
) -> Path:
    """Orchestrate independent candidate producers, ranking, and atomic publication."""
    canonical_root = canonical_root.resolve(strict=True)
    if not Decimal("0") <= annual_carrying_cost_rate <= Decimal("1"):
        raise ValueError("annual carrying cost rate must be between zero and one")
    if not carrying_rate_version.strip():
        raise ValueError("carrying rate version is required")
    manifest = json.loads((canonical_root / "manifest.json").read_text())
    model = None
    if supply_model_path is not None:
        model = load_model(supply_model_path, datetime.fromisoformat(str(manifest["as_of"]).replace("Z", "+00:00")).date(),
                           (manifest.get("supply_model") or {}).get("sha256"))
    tables = {item["path"].split("/", 1)[0] for item in manifest.get("files", [])}
    if "company_item_economics" not in tables:
        raise IngestionFailure("signal_validation", [ValidationResult("SIGNAL_ECONOMICS_REQUIRED", "FAIL", "company_item_economics", 1, "approved unit economics are required")])

    prediction_root = run_predictions(canonical_root, data_root=data_root)
    connection = duckdb.connect()
    observations = _load_observations(connection, canonical_root)
    if not observations:
        raise IngestionFailure("signal_validation", [ValidationResult("SIGNAL_OBSERVATIONS_REQUIRED", "FAIL", count=1, summary="no eligible observations resolved")])
    reactions = _load_reactions(connection, canonical_root, observations[0]["observation_date"])
    weekday_inputs = _load_weekday_inputs(connection, canonical_root, observations[0]["observation_date"])
    signal_as_of = datetime.fromisoformat(str(manifest["as_of"]).replace("Z", "+00:00"))
    batch = build_availability_candidates(connection, prediction_root=prediction_root, observations=observations, canonical_manifest=manifest)
    baseline_availability = {(str(row["store_id"]),str(row["product_id"])):row for row in batch.candidates}
    committed_batch = CandidateBatch(candidates=[dict(row) for row in batch.candidates]) if model is not None else None
    baseline_ranks = {}
    if model is not None:
        # Keep the committed comparator immutable; expected-supply output has new identity.
        batch.candidates.clear()
        batch.evidence.clear()
        baseline_ranks = {key: dict(value) for key,value in baseline_availability.items()}
    supply_rows: list[dict[str, str]] = []
    projection_counts = {"committed": 0, "early": 0, "typical": 0, "conservative": 0}

    forecast_rows = connection.execute(
        "SELECT store_id,product_id,target_retail_year_week,memento_weekly_demand_base,forecast_wape FROM read_parquet(?)",
        [str(prediction_root / "demand_forecast_vintage.parquet")],
    ).fetchall()
    forecasts_by_key: dict[tuple[str, str], list[ForecastVintage]] = defaultdict(list)
    for row in forecast_rows:
        forecasts_by_key[(str(row[0]), str(row[1]))].append(ForecastVintage(
            target_retail_year_week=int(row[2]), memento_weekly_demand_base=row[3], forecast_wape=row[4],
        ))

    # Prepare each source once; preserve the legacy per-key equations and order.
    history_rows = connection.execute("""WITH weekly AS (
      SELECT s.location_id,s.product_id,c.retail_year_week,sum(s.sales_quantity)::DOUBLE actual_units
      FROM read_parquet(?) s JOIN read_parquet(?) i USING(business_date,location_id,product_id)
      JOIN read_parquet(?) c ON c.calendar_date=s.business_date
      WHERE s.business_date<? AND s.sales_quantity>=0
        AND NOT(i.on_hand_quantity=0 AND i.assorted AND i.replenishment_enabled)
      GROUP BY ALL HAVING count(DISTINCT s.business_date)=7
    ), selected AS (
      SELECT w.*,f.forecast_quantity::DOUBLE forecast_units
      FROM weekly w JOIN read_parquet(?) f ON f.location_id=w.location_id AND f.product_id=w.product_id
        AND f.target_retail_year_week=w.retail_year_week
      WHERE f.forecast_created_retail_year_week<f.target_retail_year_week
      QUALIFY row_number() OVER(PARTITION BY w.location_id,w.product_id,w.retail_year_week ORDER BY f.forecast_created_retail_year_week DESC)=1
    ) SELECT * FROM selected
      QUALIFY row_number() OVER(PARTITION BY location_id,product_id ORDER BY retail_year_week DESC)<=8
      ORDER BY location_id,product_id,retail_year_week""", [
        _scan(canonical_root,"sales_daily"),_scan(canonical_root,"inventory_daily"),_scan(canonical_root,"calendar_day"),
        observations[0]["observation_date"],_scan(canonical_root,"demand_forecast_weekly"),
    ]).fetchall()
    histories: dict[tuple[str, str], list[tuple[int, float, float]]] = defaultdict(list)
    for store, product, week, actual, forecast in history_rows:
        histories[(str(store),str(product))].append((int(week),float(actual),float(forecast)))
    calendar_rows = connection.execute("SELECT calendar_date,retail_year_week,calendar_weekday_number FROM read_parquet(?) WHERE calendar_date BETWEEN ? AND ? ORDER BY calendar_date", [
        _scan(canonical_root,"calendar_day"),observations[0]["observation_date"]+timedelta(days=1),observations[0]["observation_date"]+timedelta(days=28),
    ]).fetchall()
    inbound_rows = connection.execute("""WITH latest AS (
      SELECT * FROM read_parquet(?) WHERE known_at<=?
      QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC,known_at DESC)=1)
      SELECT location_id,product_id,expected_store_receipt_date,
        sum(CASE WHEN status_code='cancelled' THEN 0 ELSE greatest(ordered_quantity-received_quantity,0) END)::DOUBLE
      FROM latest WHERE expected_store_receipt_date IS NOT NULL GROUP BY ALL""",[_scan(canonical_root,"replenishment_commitment"),signal_as_of]).fetchall()
    inbounds: dict[tuple[str, str], dict[date, float]] = defaultdict(dict)
    for store, product, day, units in inbound_rows:
        inbounds[(str(store),str(product))][day] = float(units)
    orders_by_key: dict[tuple[str, str], list[dict]] = defaultdict(list)
    categories = {}
    if model is not None:
        order_rows = connection.execute("""SELECT * FROM read_parquet(?) WHERE known_at<=?
            QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC,known_at DESC)=1""",
            [_scan(canonical_root,"replenishment_commitment"),signal_as_of]).to_arrow_table().to_pylist()
        for row in sorted(order_rows,key=lambda item:(item["retailer_order_id"],item["order_line_number"])):
            if row["status_code"] != "cancelled" and row["ordered_quantity"] > row["received_quantity"]:
                orders_by_key[(row["location_id"],row["product_id"])].append(row)
        categories = dict(connection.execute("SELECT product_id,source_fineline_name FROM read_parquet(?)",[_scan(canonical_root,"product")]).fetchall())

    for observation in observations:
        if (
            float(observation["on_hand"]) < 0
            or observation["price"] is None
            or float(observation["price"]) < 0
            or not observation["assorted"]
            or not observation["replenishment_enabled"]
            or observation["location_status"] not in {"O", "OPEN", "Open"}
        ):
            batch.reason_codes.extend(["demand_momentum_invalid_observation", "inventory_imbalance_invalid_observation"])
            continue
        key = (str(observation["store_id"]), str(observation["product_id"]))
        history = histories.get(key, [])
        future = sorted(forecasts_by_key.get(key, []), key=lambda row: row["target_retail_year_week"])
        daily = _daily_base_forecast(connection, canonical_root, observation, future, weekday_inputs, calendar_rows)
        if len(daily) != 28:
            batch.reason_codes.extend(["demand_momentum_missing_forward_horizon", "inventory_imbalance_missing_forward_horizon"])
            continue
        minimum_reaction = _minimum_reaction(observation, reactions)
        context = None
        selected_inbound = inbounds.get(key, {})
        first_candidate = len(batch.candidates)
        if model is not None:
            category = categories[str(observation["product_id"])]
            arrivals = [portion for row in orders_by_key[key] for portion in order_arrivals(row,observation["observation_date"],model,category)]
            context = projection_context(float(observation["on_hand"]),daily,observation["observation_date"],arrivals,model,category)
            selected_inbound = context.pop("firm_inbound")
            for plan in context["planned_replenishment"]:
                day = plan["typical"]
                selected_inbound[day] = selected_inbound.get(day,0) + plan["quantity"]
            for scenario, result in context["supply_timing"].items():
                projection_counts[scenario] += result["lost_units"] >= model.planning_policy.minimum_lost_units and result["first_oos_date"] is not None
            source = baseline_availability.get(key)
            if source is not None:
                selected_wape = future[0].get("forecast_wape") if future else None
                band = clamp(float(selected_wape) if selected_wape is not None else 1,0,1)
                days = [observation["observation_date"]+timedelta(days=i) for i in range(1,29)]
                trace, oos = project_inventory(float(observation["on_hand"]),days,{"low":[v*(1-band) for v in daily],"base":daily,"high":[v*(1+band) for v in daily]},selected_inbound)
                lost = sum(row.lost_units for row in trace if row.path=="base")
                if oos["base"] is not None and lost >= model.planning_policy.minimum_lost_units:
                    count_days = (oos["base"]-observation["observation_date"]).days
                    _, stability = timing_stability(oos["high"],oos["base"],oos["low"])
                    candidate = dict(source)
                    sid = stable_signal_id(str(manifest["source_release_set_id"]),str(manifest["as_of"]),*key,"availability",str(oos["base"]))
                    candidate.update(signal_id=sid,days_until_material_impact=count_days,headline_metric_value=decimal_value(lost,6),
                        estimated_retail_sales_impact_amount=decimal_value(lost*float(observation["price"] or 0),2),
                        primary_economic_value=decimal_value(lost*float(observation["price"] or 0),2),
                        estimated_contribution_impact_amount=decimal_value(lost*max(float(observation["price"] or 0)-observation["unit_cost"],0),2),
                        stability_score=decimal_value(stability or 0,6))
                    _, updated_confidence = confidence_score(1-float(str(candidate["forecast_quality"])),float(str(candidate["data_completeness"])),stability or 0)
                    candidate["confidence_score"] = decimal_value(updated_confidence,6)
                    batch.candidates.append(candidate)
                    for row in trace:
                        batch.evidence.append({"signal_id":sid,"evidence_type":"inventory_projection","evidence_date":row.date,"path":row.path,
                            "actual_units":None,"retailer_forecast_units":None,"adjusted_forecast_units":None,
                            "demand_units":decimal_value(row.demand_units,6),"scheduled_inbound_units":decimal_value(row.inbound_units,6),
                            "opening_units":decimal_value(row.opening_units,6),"ending_units":decimal_value(row.ending_units,6),
                            "lost_units":decimal_value(row.lost_units,6),"target_units":None})
        demand_batch = build_demand_candidate(observation, manifest, weekly_history=history, forward_daily_forecast=daily, minimum_reaction_days=minimum_reaction)
        if committed_batch is not None:
            committed_batch.candidates.extend(dict(row) for row in demand_batch.candidates)
        batch.extend(demand_batch)
        selected_wape = future[0].get("forecast_wape") if future else None
        forecast_quality = 1 - clamp(float(selected_wape) if selected_wape is not None else 1, 0, 1)
        if committed_batch is not None:
            committed_batch.extend(build_inventory_candidate(observation,manifest,forward_daily_forecast=daily,forecast_quality=forecast_quality,
                history_count=len(history),minimum_reaction_days=minimum_reaction,inbound_by_date=inbounds.get(key,{}),annual_carrying_cost_rate=float(annual_carrying_cost_rate)))
        batch.extend(build_inventory_candidate(
            observation, manifest, forward_daily_forecast=daily, forecast_quality=forecast_quality,
            history_count=len(history), minimum_reaction_days=minimum_reaction,
            inbound_by_date=selected_inbound,
            annual_carrying_cost_rate=float(annual_carrying_cost_rate),
        ))
        if model is not None and context is not None:
            for candidate in batch.candidates[first_candidate:]:
                options = action_options(int(str(candidate["days_until_material_impact"])),model,categories[str(observation["product_id"])],
                    any(row["invoiced_quantity"]>row["received_quantity"] for row in orders_by_key[key]),
                    "availability" if candidate["signal_type"]=="availability" else str(candidate["signal_direction"]))
                original_score = candidate["reaction_score"]
                candidate["reaction_score"] = decimal_value(max((row["score"] for row in options),default=0),6)
                # Legacy slack fields stay explicit legacy allowances; action-specific slack is in the context.
                candidate["action_slack_days"], _ = reaction_metrics(int(str(candidate["days_until_material_impact"])),minimum_reaction)
                source_context = {**context,"actions":options,"legacy_reaction_score":str(original_score),"legacy_reaction_days":minimum_reaction,
                    "legacy_availability_present": key in baseline_ranks,
                    "ranking_policy":"unknown prerequisites contribute zero actionability; weights remain 0.50/0.30/0.20"}
                supply_rows.append({"signal_id":str(candidate["signal_id"]),"context":json_context(source_context)})

    configuration = {
        "annual_carrying_cost_rate": format(annual_carrying_cost_rate, "f"), "carrying_rate_version": carrying_rate_version,
        "momentum_multiplier_range": ["0.50", "1.50"], "weights": {"impact": "0.50", "reaction": "0.30", "confidence": "0.20"},
        "signal_type_order": list(SIGNAL_TYPE_ORDER),
    }
    if model is not None and supply_model_path is not None:
        configuration.update(supply_model_sha256=sha256_file(supply_model_path),supply_model_version=model.version,
            supply_projection_version="expected-replenishment-v4",actionability_version="prerequisite-aware-v1",
            projection_counts=projection_counts,calibration_status=model.calibration)
    ranked = rank_signal_candidates(batch.candidates)
    if model is not None:
        baseline_by_key = {(str(row["store_id"]),str(row["product_id"]),str(row["signal_type"])):row
                           for row in rank_signal_candidates(committed_batch.candidates if committed_batch is not None else [])}
        current_by_id = {str(row["signal_id"]):row for row in ranked}
        for row in supply_rows:
            candidate = current_by_id[row["signal_id"]]
            baseline = baseline_by_key.get((str(candidate["store_id"]),str(candidate["product_id"]),str(candidate["signal_type"])))
            value = json.loads(row["context"])
            value.update(committed_overall_rank=baseline["overall_rank_position"] if baseline else None,
                         committed_rank_score=str(baseline["rank_score"]) if baseline else None)
            row["context"] = json_context(value)
        batch.evidence.sort(key=lambda row:(str(row["signal_id"]),str(row["evidence_date"]),str(row["evidence_type"]),str(row["path"])))
        supply_rows.sort(key=lambda row:row["signal_id"])
    return publish_signal_set(ranked, batch.evidence, canonical_manifest=manifest, data_root=data_root, configuration=configuration, reason_codes=batch.reason_codes,
                              supply_context=supply_rows if model is not None else None)
