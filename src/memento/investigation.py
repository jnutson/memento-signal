"""Offline, release-bound investigations over synthetic canonical data only."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import uuid
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import duckdb
import pyarrow.parquet as pq

from .demand_signal import calculate_demand_momentum
from .investigation_contract import COVER_VERSION, VERSION, Day, Diagnostics, Investigation, Receipt, Week
from .manifest import canonical_json, sha256_file
from .metrics import project_inventory
from .serving import SIGNAL_ID, SignalStore, safe_member, validate_release_files


def weekly_rows(days: list[Day], forecasts: dict, roles: dict) -> list[Week]:
    groups: dict[tuple, list[Day]] = defaultdict(list)
    for row in days:
        groups[(row.series, row.phase, row.week)].append(row)
    result = []
    for (series, phase, week), rows in sorted(groups.items()):
        rows.sort(key=lambda row: row.date)
        def flow(name):
            values = [getattr(row, name) for row in rows]
            return sum(values) if all(value is not None for value in values) else None
        forecast = forecasts.get(week)
        actual = flow("sales")
        ratio = actual / forecast[0] if actual is not None and forecast and forecast[0] > 0 and len(rows) == 7 else None
        result.append(Week(key=f"{series}:{week}", week=week, phase=phase, series=series,
                           start=rows[0].date, end=rows[-1].date, days=len(rows), partial=len(rows) != 7,
                           opening=rows[0].opening, stock=rows[-1].stock, sales=actual,
                           receipts=flow("receipts"), demand=flow("demand"), fulfilled=flow("fulfilled"), lost=flow("lost"),
                           baseline=flow("baseline"), adjusted=flow("adjusted"), gap=flow("gap"),
                           target=rows[-1].target, excess=rows[-1].excess,
                           retailer_forecast=forecast[0] if forecast else None, forecast_vintage=forecast[1] if forecast else None,
                           ratio=ratio, role=roles.get(week, "excluded") if phase == "actual" else "forward",
                           flags=sorted({flag for row in rows for flag in row.flags})))
    return result


def _receipt_events(context: dict | None, orders: list[dict], signal_id: str) -> list[Receipt]:
    if not context:
        result = []
        for order in orders:
            if order["status_code"] == "cancelled": continue
            day = order["expected_store_receipt_date"]
            for state, quantity in (("open",max(order["ordered_quantity"]-order["invoiced_quantity"],0)),("in_transit",max(order["invoiced_quantity"]-order["received_quantity"],0))):
                if quantity:
                    ref = f"{signal_id}:{order['retailer_order_id']}:{order['order_line_number']}:{order['event_version']}:{state}"
                    result.append(Receipt(event_id="evt_"+hashlib.sha256(ref.encode()).hexdigest(),state="open" if state=="open" else "in_transit",quantity=quantity,
                                          early=day,typical=day,conservative=day,basis="explicit_expected_date_no_assumed_range",
                                          order_reference=order["retailer_order_id"],line=order["order_line_number"],version=order["event_version"],known_at=order["known_at"],reference_status="source_version"))
        return result
    # The producer emits sorted latest-version orders, open then transit portions.
    # Match the complete ordered sequence, not ambiguous date/quantity joins.
    portions = []
    for order in sorted(orders, key=lambda row: (row["retailer_order_id"], row["order_line_number"])):
        if order["status_code"] == "cancelled":
            continue
        for state, quantity in (("open", max(order["ordered_quantity"] - order["invoiced_quantity"], 0)),
                                ("in_transit", max(order["invoiced_quantity"] - order["received_quantity"], 0))):
            if quantity:
                portions.append((state, quantity, order))
    arrivals = context["arrivals"]
    mapped = len(portions) == len(arrivals) and all(p[0] == a["order_state"] and abs(p[1] - a["quantity"]) < .000001 for p, a in zip(portions, arrivals))
    result = []
    for index, row in enumerate(arrivals + context["planned_replenishment"]):
        planned = index >= len(arrivals)
        order = portions[index][2] if mapped and not planned else None
        result.append(Receipt(event_id="evt_" + hashlib.sha256(f"{signal_id}:{index}:{canonical_json(row).decode()}".encode()).hexdigest(),
                              state="planned" if planned else row["order_state"], quantity=row["quantity"],
                              early=row["early"], typical=row["typical"], conservative=row["conservative"], basis=row["basis"],
                              order_reference=order["retailer_order_id"] if order else None,
                              line=order["order_line_number"] if order else None,
                              version=order["event_version"] if order else None, known_at=order["known_at"] if order else None,
                              reference_status="assumed_order" if planned else "source_version" if order else "unavailable"))
    return result


def build_investigation(con, signal: dict, evidence: list[dict], context: dict | None, lineage: dict) -> Investigation:
    obs = signal["observation_date"]
    key = [signal["store_id"], signal["product_id"]]
    calendar = {row[0]: int(row[1]) for row in con.execute("SELECT calendar_date,retail_year_week FROM calendar_day ORDER BY calendar_date").fetchall()}
    boundaries: dict[int, list[date]] = defaultdict(list)
    for day, week in calendar.items():
        boundaries[week].append(day)
    completed = sorted(week for week, dates in boundaries.items() if len(dates) == 7 and max(dates) < obs)
    history = con.execute("""WITH eligible AS (
        SELECT c.retail_year_week,sum(s.sales_quantity)::DOUBLE actual
        FROM sales_daily s JOIN inventory_daily i USING(business_date,location_id,product_id)
        JOIN calendar_day c ON c.calendar_date=s.business_date
        WHERE s.location_id=? AND s.product_id=? AND s.business_date<? AND s.sales_quantity>=0
          AND NOT(i.on_hand_quantity=0 AND i.assorted AND i.replenishment_enabled)
        GROUP BY c.retail_year_week HAVING count(DISTINCT s.business_date)=7
      ) SELECT e.*,f.forecast_quantity::DOUBLE,f.forecast_created_retail_year_week
        FROM eligible e JOIN demand_forecast_weekly f ON f.target_retail_year_week=e.retail_year_week
        WHERE f.location_id=? AND f.product_id=? AND f.forecast_created_retail_year_week<f.target_retail_year_week
        QUALIFY row_number() OVER(PARTITION BY e.retail_year_week ORDER BY f.forecast_created_retail_year_week DESC)=1
        ORDER BY e.retail_year_week DESC LIMIT 8""", [*key, obs, *key]).fetchall()[::-1]
    roles = {row[0]: "baseline" if index < 6 else "recent" for index, row in enumerate(history)} if len(history) == 8 else {}
    start = min([min(boundaries[week]) for week in completed[-8:]] + [min(boundaries[row[0]]) for row in history] + [obs])
    core_start = con.execute("SELECT min(business_date) FROM inventory_daily WHERE location_id=? AND product_id=?", key).fetchone()[0]
    start = max(start, core_start) if core_start else start
    if (obs - start).days > 182:
        raise ValueError("history exceeds iteration boundary")
    inv = {row["business_date"]: row for row in con.execute("SELECT business_date,on_hand_quantity,receipt_quantity,assorted,replenishment_enabled FROM inventory_daily WHERE location_id=? AND product_id=? AND business_date BETWEEN ? AND ?", [*key, start - timedelta(days=1), obs]).to_arrow_table().to_pylist()}
    sales = dict(con.execute("SELECT business_date,sum(sales_quantity)::DOUBLE FROM sales_daily WHERE location_id=? AND product_id=? AND business_date BETWEEN ? AND ? GROUP BY business_date", [*key, start, obs]).fetchall())
    forecasts = {int(w): (float(q), int(v)) for w, q, v in con.execute("""SELECT target_retail_year_week,forecast_quantity,forecast_created_retail_year_week
      FROM demand_forecast_weekly WHERE location_id=? AND product_id=? AND forecast_created_retail_year_week<target_retail_year_week AND forecast_created_retail_year_week<=?
      QUALIFY row_number() OVER(PARTITION BY target_retail_year_week ORDER BY forecast_created_retail_year_week DESC)=1""", [*key,calendar[obs]]).fetchall()}
    base = sorted((row for row in evidence if row["path"] == "base"), key=lambda row: row["evidence_date"])
    daily = [float(row["retailer_forecast_units"] if signal["signal_type"] == "demand_momentum" else row["demand_units"]) for row in base]
    if len(daily) != 28:
        raise ValueError("forward base requires 28 days")
    reference = sum(daily) / 4
    def cover(stock):
        return stock / reference if stock is not None and reference else None
    days = []
    for offset in range((obs - start).days + 1):
        day = start + timedelta(days=offset)
        current = inv.get(day)
        stock = float(current["on_hand_quantity"]) if current and current["on_hand_quantity"] >= 0 else None
        prior = inv.get(day - timedelta(days=1))
        opening = float(prior["on_hand_quantity"]) if prior and prior["on_hand_quantity"] >= 0 else None
        flags = []
        if stock is None: flags.append("missing_or_invalid_inventory")
        if day not in sales: flags.append("missing_sales")
        if sales.get(day, 0) < 0: flags.append("negative_sales_excluded")
        if current and stock == 0 and current["assorted"] and current["replenishment_enabled"]: flags.append("observed_oos_excluded")
        if opening is not None and stock is not None and current and day in sales and abs(stock - opening - current["receipt_quantity"] + sales[day]) > .00001: flags.append("observed_balance_difference")
        days.append(Day(date=day, week=calendar[day], phase="actual", series="history", opening=opening, stock=stock,
                        sales=sales.get(day), receipts=float(current["receipt_quantity"]) if current else None, cover=cover(stock), flags=flags))
    diagnostics = Diagnostics(material_date=obs + timedelta(days=signal["days_until_material_impact"]))
    if signal["signal_type"] == "demand_momentum":
        old = sorted((row for row in evidence if row["evidence_type"] == "historical_week"), key=lambda row: row["evidence_date"])
        if len(history) != 8 or len(old) != 8 or any(abs(h[1] - float(e["actual_units"])) > .00001 or abs(h[2] - float(e["retailer_forecast_units"])) > .00001 for h, e in zip(history, old)):
            raise ValueError("qualifying history does not match published evidence")
        calculated = calculate_demand_momentum([(row[1], row[2]) for row in history], daily)
        if not calculated.eligible or calculated.direction != signal["signal_direction"] or calculated.days_until_material_impact != signal["days_until_material_impact"] or abs(abs(calculated.forecast_gap_units) - float(signal["headline_metric_value"])) > .00001:
            raise ValueError("demand explanation does not match signal")
        diagnostics.baseline_ratio = calculated.baseline_ratio
        diagnostics.recent_ratio = calculated.recent_ratio
        assert calculated.recent_ratio is not None and calculated.baseline_ratio is not None
        diagnostics.raw_multiplier = calculated.recent_ratio / calculated.baseline_ratio
        diagnostics.multiplier = calculated.momentum_multiplier
        diagnostics.error_allowance = calculated.error_band_units
        cumulative = 0
        for row in base:
            baseline, adjusted = float(row["retailer_forecast_units"]), float(row["adjusted_forecast_units"])
            cumulative += abs(adjusted - baseline)
            days.append(Day(date=row["evidence_date"], week=calendar[row["evidence_date"]], phase="projected", series="base",
                            baseline=baseline, adjusted=adjusted, gap=adjusted-baseline, cumulative_gap=cumulative))
    else:
        for row in evidence:
            stock, demand, lost = float(row["ending_units"]), float(row["demand_units"]), float(row["lost_units"])
            target = float(row["target_units"]) if row["target_units"] is not None else None
            days.append(Day(date=row["evidence_date"], week=calendar[row["evidence_date"]], phase="projected", series=row["path"],
                            opening=float(row["opening_units"]), stock=stock, demand=demand, receipts=float(row["scheduled_inbound_units"]),
                            fulfilled=demand-lost, lost=lost, target=target, excess=max(stock-target,0) if target is not None else None,
                            within_target=min(stock,target) if target is not None else None, cover=cover(stock)))
        if signal["signal_type"] == "inventory_imbalance":
            # Recover the published cover, not a ceil near a rounded quality boundary.
            diagnostics.target_cover_days = round(float(base[0]["target_units"]) * 28 / sum(daily)) if sum(daily) else signal["minimum_reaction_days"] + math.ceil(7 * (1 - float(signal["forecast_quality"])))
            diagnostics.safety_days = diagnostics.target_cover_days - signal["minimum_reaction_days"]
    orders = con.execute("""SELECT * FROM replenishment_commitment WHERE location_id=? AND product_id=? AND known_at<=?
      QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC,known_at DESC)=1""", [*key, signal["signal_as_of"]]).to_arrow_table().to_pylist()
    events = _receipt_events(context, orders, signal["signal_id"])
    if context:
        starting = inv[obs]["on_hand_quantity"]
        for scenario in ("committed", "early", "typical", "conservative"):
            inbound = defaultdict(float)
            for event in events:
                if scenario == "committed" and event.state == "planned": continue
                receipt_day = getattr(event, "typical" if scenario == "committed" else scenario)
                if receipt_day: inbound[receipt_day] += event.quantity
            dates = [obs + timedelta(days=i) for i in range(1,29)]
            trace, oos = project_inventory(starting, dates, {p: daily for p in ("low", "base", "high")}, inbound)
            trace = [row for row in trace if row.path == "base"]
            expected = context["supply_timing"][scenario]
            if (oos["base"].isoformat() if oos["base"] else None) != expected["first_oos_date"] or abs(sum(row.lost_units for row in trace) - expected["lost_units"]) > .00001:
                raise ValueError("supply explanation differs from published summary")
            for row in trace:
                days.append(Day(date=row.date, week=calendar[row.date], phase="projected", series=scenario, opening=row.opening_units,
                                stock=row.ending_units, receipts=row.inbound_units, demand=row.demand_units, fulfilled=row.fulfilled_units,
                                lost=row.lost_units, cover=cover(row.ending_units)))
    return Investigation(**lineage, signal_id=signal["signal_id"], observation_date=obs, signal_type=signal["signal_type"], direction=signal["signal_direction"],
                         reference_weekly_demand=reference, cover_status="available" if reference else "zero_reference_demand", diagnostics=diagnostics,
                         days=sorted(days,key=lambda row:(row.series,row.date)), weeks=weekly_rows(days,forecasts,roles), receipts=events)


def publish(data_root: Path) -> Path:
    root = data_root.resolve(strict=True)
    release, manifest = SignalStore(root / "signals", root / "canonical").current_release()
    configuration = manifest["configuration"]
    if not isinstance(configuration, dict): raise ValueError("invalid signal configuration")
    canonical_path = safe_member(root / "canonical", str(manifest["canonical_dataset_id"]) + "/manifest.json")
    canonical = json.loads(canonical_path.read_text())
    if canonical.get("source_classification") != "synthetic" or canonical.get("dataset_id") != manifest["canonical_dataset_id"] or canonical["as_of"] != manifest["signal_as_of"]:
        raise ValueError("investigation requires matching synthetic canonical snapshot")
    validate_release_files(canonical_path.parent, canonical)
    lineage = dict(signal_set_id=manifest["signal_set_id"], canonical_dataset_id=manifest["canonical_dataset_id"],
                   signal_manifest_sha256=sha256_file(release / "manifest.json"), canonical_manifest_sha256=sha256_file(canonical_path),
                   supply_model_sha256=configuration.get("supply_model_sha256"), configuration_hash=manifest["configuration_hash"], signal_as_of=manifest["signal_as_of"])
    identity = {**lineage,"contract_version":VERSION,"cover_version":COVER_VERSION,"slice":canonical.get("slice")}
    artifact_id = "mis_" + hashlib.sha256(canonical_json(identity)).hexdigest()
    output = root / "investigations" / artifact_id
    if output.exists():
        m = json.loads((output / "manifest.json").read_text())
        if m.get("identity") != identity: raise ValueError("investigation identity mismatch")
        validate_release_files(output,m)
        return output
    stage = root / "staging" / ("investigation_" + uuid.uuid4().hex)
    try:
        stage.mkdir(parents=True)
        signals = [row for row in pq.read_table(release / "signal.parquet").to_pylist() if row["is_overall_top_10"]]
        if len(signals) != manifest["display_count"]: raise ValueError("display count mismatch")
        all_evidence = pq.read_table(release / "signal_evidence.parquet").to_pylist()
        contexts = {row["signal_id"]:json.loads(row["context"]) for row in pq.read_table(release / "supply_context.parquet").to_pylist()} if configuration.get("supply_projection_version") else {}
        files = []
        with duckdb.connect() as con:
            for table in ("calendar_day","sales_daily","inventory_daily","demand_forecast_weekly","replenishment_commitment"):
                paths = [str(safe_member(canonical_path.parent,f["path"])) for f in canonical["files"] if f["path"].startswith(table+"/")]
                con.from_parquet(paths).create_view(table)
            for signal in signals:
                payload = build_investigation(con, signal, [row for row in all_evidence if row["signal_id"] == signal["signal_id"]],contexts.get(signal["signal_id"]),lineage)
                path = stage / (signal["signal_id"] + ".json")
                path.write_bytes(canonical_json(payload.model_dump(mode="json")))
                files.append({"path":path.name,"bytes":path.stat().st_size,"sha256":sha256_file(path)})
        (stage / "manifest.json").write_bytes(canonical_json({"investigation_set_id":artifact_id,"identity":identity,"files":files}))
        output.parent.mkdir(parents=True,exist_ok=True)
        os.rename(stage,output)
        return output
    finally:
        if stage.exists(): shutil.rmtree(stage)


def read_investigation(root: Path, release: Path, manifest: dict, signal_id: str) -> Investigation:
    if not SIGNAL_ID.fullmatch(signal_id): raise ValueError("invalid signal identity")
    canonical = safe_member(root / "canonical", manifest["canonical_dataset_id"] + "/manifest.json")
    c = json.loads(canonical.read_text())
    if c.get("source_classification") != "synthetic": raise ValueError("synthetic only")
    validate_release_files(canonical.parent,c)
    lineage = dict(signal_set_id=manifest["signal_set_id"],canonical_dataset_id=manifest["canonical_dataset_id"],
                   signal_manifest_sha256=sha256_file(release/"manifest.json"),canonical_manifest_sha256=sha256_file(canonical),
                   supply_model_sha256=manifest["configuration"].get("supply_model_sha256"),configuration_hash=manifest["configuration_hash"],signal_as_of=manifest["signal_as_of"])
    identity = {**lineage,"contract_version":VERSION,"cover_version":COVER_VERSION,"slice":c.get("slice")}
    name = "mis_" + hashlib.sha256(canonical_json(identity)).hexdigest()
    if (root / "investigations" / name).is_symlink(): raise ValueError("investigation directory cannot be a symlink")
    directory = safe_member(root / "investigations", name)
    if (directory / "manifest.json").is_symlink() or (directory / "manifest.json").stat().st_size > 65536:
        raise ValueError("invalid investigation manifest size or path")
    m = json.loads((directory / "manifest.json").read_text())
    if m.get("identity") != identity or m.get("investigation_set_id") != name: raise ValueError("investigation identity mismatch")
    member = signal_id + ".json"
    file = next((f for f in m["files"] if f["path"] == member),None)
    if not file: raise FileNotFoundError("investigation not published")
    if (directory / member).is_symlink() or file.get("bytes",0)>2*1024*1024:
        raise ValueError("invalid investigation payload size or path")
    validate_release_files(directory,{"files":[file]})
    payload = Investigation.model_validate_json(safe_member(directory,member).read_text())
    if payload.signal_id != signal_id or payload.signal_set_id != manifest["signal_set_id"] or payload.signal_manifest_sha256 != lineage["signal_manifest_sha256"] or payload.configuration_hash != lineage["configuration_hash"] or payload.canonical_manifest_sha256 != lineage["canonical_manifest_sha256"]:
        raise ValueError("investigation provenance mismatch")
    return payload


def main():
    parser = argparse.ArgumentParser(description="Publish immutable synthetic Attention investigations.")
    parser.add_argument("--data-root",type=Path,required=True)
    args = parser.parse_args()
    try: print(publish(args.data_root))
    except (ValueError,KeyError,TypeError,OSError): parser.exit(2,"Investigation publication failed validation. Source releases remain unchanged.\n")


if __name__ == "__main__": main()
