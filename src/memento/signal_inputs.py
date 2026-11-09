from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import TypeAlias

import duckdb

from .availability_inputs import AvailabilityInputs
from .metrics import normalize_weekday_shares
from .signal_contract import ForecastVintage, Observation


SignalKey: TypeAlias = tuple[str, str]
WeekdayInputs: TypeAlias = tuple[
    dict[SignalKey, tuple[int, list[float]]],
    dict[str, tuple[int, list[float]]],
    tuple[int, list[float]],
]
SupplyOrder: TypeAlias = dict[str, object]


@dataclass(frozen=True)
class SignalInputs:
    observations: list[Observation]
    reactions: dict[tuple[str, str], int]
    weekday_inputs: WeekdayInputs
    forecasts_by_key: dict[SignalKey, list[ForecastVintage]]
    histories: dict[SignalKey, list[tuple[int, float, float]]]
    calendar_rows: list[tuple[date, int, int]]
    inbounds: dict[SignalKey, dict[date, float]]
    orders_by_key: dict[SignalKey, list[SupplyOrder]]
    categories: dict[str, str]


def scan(canonical_root: Path, table: str) -> str:
    return str(canonical_root / table / "*.parquet")


def _load_observations(
    connection: duckdb.DuckDBPyConnection, canonical_root: Path
) -> list[Observation]:
    rows = connection.execute(
        """WITH sales_day AS (
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
          AND e.effective_from<=i.business_date AND (e.effective_to IS NULL OR e.effective_to>=i.business_date)""",
        [
            scan(canonical_root, "sales_daily"),
            scan(canonical_root, "inventory_daily"),
            scan(canonical_root, "company_item"),
            scan(canonical_root, "company_item_economics"),
            scan(canonical_root, "product"),
            scan(canonical_root, "location"),
            scan(canonical_root, "inventory_daily"),
        ],
    ).fetchall()
    return [
        Observation(
            observation_date=row[0],
            store_id=str(row[1]),
            product_id=str(row[2]),
            on_hand=float(row[3]),
            price=float(row[4]) if row[4] is not None else None,
            assorted=bool(row[5]),
            replenishment_enabled=bool(row[6]),
            location_status=str(row[7]),
            company_item_id=str(row[8]),
            unit_cost=float(row[9]),
        )
        for row in rows
    ]


def _load_reactions(
    connection: duckdb.DuckDBPyConnection,
    canonical_root: Path,
    observation_date: date,
) -> dict[tuple[str, str], int]:
    rows = connection.execute(
        """SELECT item_scope_type_code,item_scope_id,minimum_reaction_days
        FROM read_parquet(?) WHERE company_id='MIRO_TOYS'
          AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)""",
        [scan(canonical_root, "reaction_constraint"), observation_date, observation_date],
    ).fetchall()
    return {(str(scope), str(key)): int(days) for scope, key, days in rows}


def minimum_reaction(
    observation: Observation, reactions: dict[tuple[str, str], int]
) -> int:
    value = reactions.get(
        ("item", str(observation["company_item_id"])),
        reactions.get(("brand", "MIRO_SPARK"), reactions.get(("all", "all"))),
    )
    if value is None:
        raise ValueError(
            f"no effective reaction constraint for product {observation['product_id']}"
        )
    return value


def _load_weekday_inputs(
    connection: duckdb.DuckDBPyConnection,
    canonical_root: Path,
    observation_date: date,
) -> WeekdayInputs:
    history_start = observation_date - timedelta(days=55)
    rows = connection.execute(
        """WITH scoped AS (
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
    GROUP BY ALL ORDER BY p.location_id,p.product_id,p.retail_year_week,c.calendar_weekday_number""",
        [
            scan(canonical_root, "company_item"),
            scan(canonical_root, "product"),
            observation_date,
            observation_date,
            observation_date,
            scan(canonical_root, "sales_daily"),
            history_start,
            observation_date,
            scan(canonical_root, "inventory_daily"),
            scan(canonical_root, "calendar_day"),
            observation_date,
            scan(canonical_root, "demand_forecast_weekly"),
            scan(canonical_root, "calendar_day"),
        ],
    ).fetchall()
    key_weeks: dict[SignalKey, set[int]] = defaultdict(set)
    item_pairs: dict[str, set[tuple[str, int]]] = defaultdict(set)
    brand_pairs: set[tuple[str, str, int]] = set()
    key_units: dict[SignalKey, list[float]] = defaultdict(lambda: [0.0] * 7)
    item_units: dict[str, list[float]] = defaultdict(lambda: [0.0] * 7)
    brand_units = [0.0] * 7
    for location, product, week, weekday, units in rows:
        key = (str(location), str(product))
        product = str(product)
        week = int(week)
        index = int(weekday) - 1
        key_weeks[key].add(week)
        item_pairs[product].add((str(location), week))
        brand_pairs.add((str(location), product, week))
        key_units[key][index] += float(units)
        item_units[product][index] += float(units)
        brand_units[index] += float(units)
    keys = {key: (len(key_weeks[key]), units) for key, units in key_units.items()}
    items = {
        product: (len(item_pairs[product]), units)
        for product, units in item_units.items()
    }
    return keys, items, (len(brand_pairs), brand_units)


def daily_base_forecast(
    observation: Observation,
    future: list[ForecastVintage],
    weekday_inputs: WeekdayInputs,
    calendar_rows: list[tuple[date, int, int]],
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
    weekly = {
        int(row["target_retail_year_week"]): float(row["memento_weekly_demand_base"])
        for row in future
    }
    if len(calendar_rows) != 28 or any(
        int(week) not in weekly for _, week, _ in calendar_rows
    ):
        return []
    return [
        weekly[int(week)] * shares[int(weekday) - 1]
        for _, week, weekday in calendar_rows
    ]


def load_signal_inputs(
    canonical_root: Path,
    availability_inputs: AvailabilityInputs,
    signal_as_of: datetime,
    *,
    include_supply: bool,
) -> SignalInputs:
    with duckdb.connect() as connection:
        observations = _load_observations(connection, canonical_root)
        if not observations:
            return SignalInputs([], {}, ({}, {}, (0, [])), {}, {}, [], {}, {}, {})
        observation_date = observations[0]["observation_date"]
        reactions = _load_reactions(connection, canonical_root, observation_date)
        weekday_inputs = _load_weekday_inputs(connection, canonical_root, observation_date)

        forecasts_by_key: dict[SignalKey, list[ForecastVintage]] = defaultdict(list)
        for row in availability_inputs.forecasts:
            key = (str(row["store_id"]), str(row["product_id"]))
            forecasts_by_key[key].append(
                ForecastVintage(
                    target_retail_year_week=int(row["target_retail_year_week"]),
                    memento_weekly_demand_base=row["memento_weekly_demand_base"],
                    forecast_wape=row["forecast_wape"],
                )
            )

        history_rows = connection.execute(
            """WITH weekly AS (
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
          ORDER BY location_id,product_id,retail_year_week""",
            [
                scan(canonical_root, "sales_daily"),
                scan(canonical_root, "inventory_daily"),
                scan(canonical_root, "calendar_day"),
                observation_date,
                scan(canonical_root, "demand_forecast_weekly"),
            ],
        ).fetchall()
        histories: dict[SignalKey, list[tuple[int, float, float]]] = defaultdict(list)
        for store, product, week, actual, forecast in history_rows:
            histories[(str(store), str(product))].append(
                (int(week), float(actual), float(forecast))
            )

        calendar_rows = [
            (row[0], int(row[1]), int(row[2]))
            for row in connection.execute(
                "SELECT calendar_date,retail_year_week,calendar_weekday_number "
                "FROM read_parquet(?) WHERE calendar_date BETWEEN ? AND ? "
                "ORDER BY calendar_date",
                [
                    scan(canonical_root, "calendar_day"),
                    observation_date + timedelta(days=1),
                    observation_date + timedelta(days=28),
                ],
            ).fetchall()
        ]
        inbound_rows = connection.execute(
            """WITH latest AS (
          SELECT * FROM read_parquet(?) WHERE known_at<=?
          QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC,known_at DESC)=1)
          SELECT location_id,product_id,expected_store_receipt_date,
            sum(CASE WHEN status_code='cancelled' THEN 0 ELSE greatest(ordered_quantity-received_quantity,0) END)::DOUBLE
          FROM latest WHERE expected_store_receipt_date IS NOT NULL GROUP BY ALL""",
            [scan(canonical_root, "replenishment_commitment"), signal_as_of],
        ).fetchall()
        inbounds: dict[SignalKey, dict[date, float]] = defaultdict(dict)
        for store, product, day, units in inbound_rows:
            inbounds[(str(store), str(product))][day] = float(units)

        orders_by_key: dict[SignalKey, list[SupplyOrder]] = defaultdict(list)
        categories: dict[str, str] = {}
        if include_supply:
            order_rows = connection.execute(
                """SELECT * FROM read_parquet(?) WHERE known_at<=?
                QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC,known_at DESC)=1""",
                [scan(canonical_root, "replenishment_commitment"), signal_as_of],
            ).to_arrow_table().to_pylist()
            for row in sorted(
                order_rows,
                key=lambda item: (item["retailer_order_id"], item["order_line_number"]),
            ):
                if row["status_code"] != "cancelled" and Decimal(
                    str(row["ordered_quantity"])
                ) > Decimal(str(row["received_quantity"])):
                    key = (str(row["location_id"]), str(row["product_id"]))
                    orders_by_key[key].append(row)
            categories = {
                str(product): str(category)
                for product, category in connection.execute(
                    "SELECT product_id,source_fineline_name FROM read_parquet(?)",
                    [scan(canonical_root, "product")],
                ).fetchall()
            }

    return SignalInputs(
        observations=observations,
        reactions=reactions,
        weekday_inputs=weekday_inputs,
        forecasts_by_key=dict(forecasts_by_key),
        histories=dict(histories),
        calendar_rows=calendar_rows,
        inbounds=dict(inbounds),
        orders_by_key=dict(orders_by_key),
        categories=categories,
    )
