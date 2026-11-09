"""Reproducible descriptive metrics, separate from canonical data and Signals."""
from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

import duckdb
import pyarrow as pa

from .canonical import SCHEMAS
from .ownership import require_owner
from .manifest import canonical_json, sha256_file
from .metric_contract import FORMULAS, VERSION, PLANNED_SUPPLY_VERSION, RETAILER_BASELINE_VERSION, PREVIOUS_VERSION, LEGACY_VERSION, MetricConfig
from .metric_queries import CURRENT, DAILY, PERIODS, WEEKDAY, TRENDS, QUALITY_EPISODES
from .metric_source import DistributionSource, load_distribution, member, verified_file


LEGACY_TABLES = ("current_store", "metric_period", "metric_weekday", "distribution_summary", "checks", "promises")
FIRM_TABLES = (*LEGACY_TABLES, "daily", "stockout_episode", "metric_trend", "supply_assessment", "supply_projection", "supply_order", "supply_forecast")
PLANNED_TABLES = (*FIRM_TABLES, "planned_order", "planned_conversion", "planned_coverage", "expected_supply_assessment", "expected_supply_projection")
TABLES = (*PLANNED_TABLES, "finding", "finding_evidence")
REQUIRED = {"location", "product", "company_item", "sales_daily", "inventory_daily"}
RELEASE_ID = re.compile(r"^met_[a-f0-9]{64}$")


def _hash(value: object) -> str:
    return hashlib.sha256(canonical_json(value)).hexdigest()


def scalar(con: duckdb.DuckDBPyConnection, sql: str, params: list | None = None):
    row = con.execute(sql, params or []).fetchone()
    if row is None:
        raise ValueError("metric aggregate returned no result")
    return row[0]


def validate_release(path: Path) -> dict:
    value = json.loads(member(path, "manifest.json").read_text())
    identity = {k: v for k, v in value.items() if k != "metric_release_id"}
    if value.get("contract_version") not in {VERSION, PLANNED_SUPPLY_VERSION, RETAILER_BASELINE_VERSION, PREVIOUS_VERSION, LEGACY_VERSION} or value.get("metric_release_id") != "met_" + _hash(identity):
        raise ValueError("metric release identity mismatch")
    files = value.get("files", [])
    tables = LEGACY_TABLES if value["contract_version"] == LEGACY_VERSION else TABLES if value["contract_version"] == VERSION else PLANNED_TABLES if value["contract_version"] == PLANNED_SUPPLY_VERSION else FIRM_TABLES
    if len(files) != len(tables) or {x.get("path") for x in files} != {x + ".parquet" for x in tables}:
        raise ValueError("invalid metric file inventory")
    for entry in files:
        verified_file(path, entry)
    return value


def publish_metrics(canonical: Path, source: DistributionSource, *, data_root: Path,
                    config: MetricConfig, activate: bool = True) -> Path:
    if canonical.absolute() != canonical.resolve(strict=True):
        raise ValueError("non-symlink canonical path required")
    manifest_path = member(canonical, "manifest.json")
    manifest = json.loads(manifest_path.read_text())
    require_owner(data_root.resolve(), manifest)
    as_of = datetime.fromisoformat(manifest["as_of"].replace("Z", "+00:00"))
    if as_of.tzinfo is None:
        raise ValueError("timezone-aware release cutoff required")
    observation = as_of.date() - timedelta(days=1)
    if config.tier_baseline_end > observation:
        raise ValueError("tier baseline cannot use future observations")
    with duckdb.connect() as con:
        # Stable reduction order is part of the reproducible demo contract.
        # Parallel floating-point sums can otherwise change Parquet bytes on replay.
        con.execute("SET threads=1")
        con.execute("SET preserve_insertion_order=true")
        by_table: dict[str, list[str]] = {}
        for entry in manifest["files"]:
            file = verified_file(canonical, entry)
            table = entry["path"].split("/")[0]
            if table not in SCHEMAS:
                raise ValueError("unsupported canonical metric input")
            by_table.setdefault(table, []).append(str(file))
        if not REQUIRED <= by_table.keys():
            raise ValueError("canonical metric inputs missing")
        for table, paths in by_table.items():
            con.read_parquet(sorted(paths)).create_view(table)
        # Boundaries reject ambiguous joins rather than multiplying facts.
        for table, keys in (("location", "location_id"), ("product", "product_id"),
                            ("inventory_daily", "business_date,location_id,product_id")):
            if scalar(con, f"SELECT count(*) FROM (SELECT {keys} FROM {table} GROUP BY ALL HAVING count(*)>1)"):
                raise ValueError("duplicate canonical metric grain")
        if scalar(con, "SELECT count(*) FROM (SELECT product_id FROM company_item WHERE effective_from<=? AND (effective_to IS NULL OR effective_to>=?) GROUP BY ALL HAVING count(*)>1)", [observation, observation]):
            raise ValueError("ambiguous active company-item mapping")
        for table in ("inventory_daily", "sales_daily"):
            if scalar(con, f"SELECT count(*) FROM {table} WHERE business_date>=? OR business_date IS NULL", [as_of.date()]):
                raise ValueError("future or undated actuals in metric input")
            if scalar(con, f"SELECT count(*) FROM {table} s LEFT JOIN location l USING(location_id) LEFT JOIN product p USING(product_id) WHERE l.location_id IS NULL OR p.product_id IS NULL"):
                raise ValueError("metric fact has unresolved identity")
        for table in ("demand_forecast_weekly", "replenishment_commitment"):
            if table in by_table and scalar(con, f"SELECT count(*) FROM {table} s LEFT JOIN location l USING(location_id) LEFT JOIN product p USING(product_id) WHERE l.location_id IS NULL OR p.product_id IS NULL"):
                raise ValueError("supply input has unresolved identity")
        if scalar(con, "SELECT count(*) FROM sales_daily WHERE NOT isfinite(sales_quantity::DOUBLE) OR NOT isfinite(sales_amount::DOUBLE)"):
            raise ValueError("nonfinite canonical sales")
        promises = load_distribution(source, manifest, con)
        con.register("promises", promises)
        start = scalar(con, "SELECT min(d) FROM (SELECT min(business_date) d FROM inventory_daily UNION ALL SELECT min(business_date) FROM sales_daily)")
        if start is None or not 0 <= (observation - start).days < 730:
            raise ValueError("metric history must contain 1–730 closed days")
        pairs = scalar(con, "SELECT count(*) FROM (SELECT location_id,product_id FROM inventory_daily UNION SELECT location_id,product_id FROM sales_daily UNION SELECT location_id,product_id FROM promises)")
        if pairs * ((observation - start).days + 1) > 10_000_000:
            raise ValueError("metric profile exceeds bounded demo capacity")
        weekday_end = observation - timedelta(days=(observation.weekday() - 4) % 7)
        con.register("cfg", pa.Table.from_pylist([{
            "observation_date": observation, "history_start": start,
            "baseline_end": config.tier_baseline_end, "weekday_end": weekday_end,
            **{k: v for k, v in config.document().items() if k != "tier_baseline_end"},
        }]))
        con.execute(DAILY)
        con.execute(PERIODS)
        con.execute(TRENDS)
        con.execute(QUALITY_EPISODES)
        con.execute(CURRENT)
        con.execute(WEEKDAY)
        from .metric_supply import build_supply
        build_supply(con, as_of=as_of, present=set(by_table), demand_model=config.demand_model)
        from .metric_planned_source import load_planned
        from .metric_planned_supply import build_expected
        planned_lineage = load_planned(source.planned_orders, manifest, con)
        build_expected(con, as_of=as_of, feed_provided=planned_lineage is not None)
        from .metric_findings import build_findings
        build_findings(con, as_of=as_of, config=config)
        con.execute("""INSERT INTO checks
          SELECT DISTINCT s.location_id,s.product_id,'weekday_pattern_weak',
          'Observed weekday rates have insufficient coverage or history; no reliable share is published.',
          s.location_name,s.product_name,s.source_location_id,s.source_product_id
          FROM current_store s JOIN metric_weekday w ON w.grain='store' AND w.scope_id=s.location_id AND w.product_id=s.product_id
          WHERE s.eligible AND w.pattern_status IN ('insufficient_evidence','missing_weekday_exposure')""")
        current_count = scalar(con, "SELECT count(*) FROM current_store")
        if pairs != current_count:
            raise ValueError("metric population failed reconciliation")
        if scalar(con, "SELECT count(*) FROM distribution_summary WHERE promised_stores<>stocked_stores+confirmed_zero_stores+unknown_stores OR unconfirmed_stores<>confirmed_zero_stores+unknown_stores"):
            raise ValueError("distribution reconciliation failed")
        metrics_root = data_root.resolve() / "metrics"
        metrics_root.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=".staging-", dir=metrics_root))
        try:
            files = []
            for table in TABLES:
                output = stage / (table + ".parquet")
                con.sql(f"SELECT * FROM {table} ORDER BY ALL").write_parquet(str(output), compression="zstd")
                files.append({"path": output.name, "bytes": output.stat().st_size,
                              "sha256": sha256_file(output),
                              "rows": scalar(con, f"SELECT count(*) FROM {table}")})
            states = dict(con.execute("SELECT current_state,count(*) FROM current_store GROUP BY ALL ORDER BY current_state").fetchall())
            document = {
                "contract_version": VERSION, "as_of": manifest["as_of"],
                "source_classification": manifest.get("source_classification", "unclassified"),
                **({"tenant_id": manifest["tenant_id"]} if "tenant_id" in manifest else {}),
                "observation_date": observation.isoformat(), "history_start": start.isoformat(),
                "canonical_dataset_id": manifest["dataset_id"],
                "canonical_manifest_sha256": sha256_file(manifest_path),
                "source_release_set_sha256": source.release_set_sha256,
                "distribution_sha256": source.sha256, "configuration": config.document(),
                "planned_order_source": planned_lineage,
                "calculation_sha256": {name: sha256_file(Path(__file__).with_name(name)) for name in
                                       ("metric_contract.py", "metric_source.py", "metric_queries.py", "metric_publication.py",
                                        "metric_supply.py", "metric_planned_source.py", "metric_planned_supply.py", "metric_findings.py", "metrics.py", "availability_forecasting.py")},
                "formulas": FORMULAS, "population": current_count, "states": states,
                "weekday_window_start": (weekday_end-timedelta(days=55)).isoformat(),
                "weekday_window_end": weekday_end.isoformat(),
                "supply_model": {"version": "retailer-firm-supply-v2", "demand_model": config.demand_model,
                    "daily_allocation": "uniform_weekly_conservation" if config.demand_model=="retailer_baseline" else "historical_weekday",
                    "horizon_days": 28,
                                 "forecast": "unchanged eligible retailer weekly vintages" if config.demand_model=="retailer_baseline" else "chronologically bias-adjusted retailer weekly vintages; stockout-censored fit weeks",
                                 "inbound": "known firm outstanding POs with future dated receipts only; no assumed orders",
                                 "numerical_zero_tolerance_units": 1e-9,
                                 "timing": "receipts available before demand on expected receipt date; elapsed calendar days"},
                "expected_supply_model": {"version": "retailer-planned-supply-v1", "horizon_days": 28,
                    "demand": "identical to firm-only published demand, no new demand forecast",
                    "inbound": "firm receipts plus unconverted future-dated retailer plans; missed placements excluded",
                    "basis": "conditional_on_order_placement_stock_readiness_and_delivery_not_authorization",
                    "policy_fallback": "none; missing feed remains unavailable"},
                "finding_model": {"version": "promise-evidence-v1", "grouping": "item_and_issue_no_ranking",
                    "expansion": "two recent 14-day windows versus preceding 28-day same-store baseline; coverage and materiality gates",
                    "excess": "max(28-day ending stock - reference daily demand * declared cover days, 0); firm first, conditional-only excess separately labeled; never additive",
                    "carrying_cost": "excess units * unit cost * explicit annual rate * 28/365; unavailable without approved rate",
                    "timing": "symptom dates and source plan placement dates only; action feasibility not established"},
                "limitations": ["Reported inventory is not on-shelf availability.",
                                "Velocity measures fulfilled net sales, not unconstrained demand.",
                                "Current dimension status is not historical status; history uses dated mappings and past assortment evidence.",
                                "No ranker, action recommendation or 90-day production-path prevention claim is published.",
                                "Retail-minus-unit-cost exposure is not brand profit or attributable realized lost sales.",
                                "Trend thresholds are configurable demo defaults, not learned recommendations."],
                "files": files,
            }
            identity = "met_" + _hash(document)
            document["metric_release_id"] = identity
            (stage / "manifest.json").write_bytes(canonical_json(document))
            target = metrics_root / identity
            if target.exists():
                if validate_release(target) != document:
                    raise ValueError("immutable metric publication conflict")
            else:
                os.replace(stage, target)
            if activate:
                with tempfile.NamedTemporaryFile(dir=metrics_root, prefix=".pointer-", delete=False) as handle:
                    pointer_temp = Path(handle.name)
                    handle.write(canonical_json({"metric_release_id": identity, "manifest": identity + "/manifest.json"}))
                os.replace(pointer_temp, metrics_root / "current.json")
            return target
        finally:
            if stage.exists():
                shutil.rmtree(stage)
