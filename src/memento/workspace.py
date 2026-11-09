"""Customer UI projections over immutable Signal metrics; no demo calendar/model.

workspace-view-v1 / UI-W01..04: see docs/product/core-product-ui.md.
All business arithmetic is server-side. Existing metric formulas/ranks are unchanged.
"""
from __future__ import annotations

from datetime import date, timedelta
from math import fsum
from pathlib import Path

import duckdb

VERSION = "workspace-view-v1"


def _sum(values):
    values = list(values)
    return fsum(values) if values and all(v is not None for v in values) else None


def _week_end(observed: str) -> date:
    day = date.fromisoformat(observed)
    return day - timedelta(days=(day.weekday() - 4) % 7)


def _sales(row):
    if row is None:
        return None
    return {k: row[k] for k in ("period_start", "period_end", "units", "dollars",
                                "units_store_week", "sales_days", "expected_days", "sales_coverage")}


def _capabilities(manifest):
    files = {f["path"] for f in manifest["files"]}
    return {
        "inventory": {"supply_projection.parquet", "supply_assessment.parquet"} <= files,
        "conditional_supply": "expected_supply_projection.parquet" in files,
        "findings": "finding.parquet" in files,
        "demand_components": False,
        "promotion_analysis": False,
        "store_map": False,
    }


def summary(root: Path, manifest: dict) -> dict:
    """UI-W01: one common complete calendar week; never cherry-pick a fuller week."""
    end = _week_end(manifest["observation_date"])
    start = end - timedelta(days=6)
    with duckdb.connect() as con:
        products = con.execute("""SELECT DISTINCT product_id, product_name, source_product_id, company_item_id
            FROM read_parquet(?) ORDER BY product_name,product_id""",
            [str(root / "current_store.parquet")]).to_arrow_table().to_pylist()
        periods = con.execute("""SELECT * FROM read_parquet(?) WHERE grain='item'
            AND period_kind='week' AND period_end IN (?,?) ORDER BY product_id,period_end""",
            [str(root / "metric_period.parquet"), end, end - timedelta(days=7)]).to_arrow_table().to_pylist()
        stores = con.execute("SELECT count(DISTINCT location_id) FROM read_parquet(?) WHERE eligible",
                             [str(root / "current_store.parquet")]).fetchall()[0][0]
    indexed = {(p["product_id"], p["period_end"]): p for p in periods}
    rows = []
    for item in products:
        current, prior = indexed.get((item["product_id"], end)), indexed.get((item["product_id"], end - timedelta(days=7)))
        rows.append({**item, "current": _sales(current), "prior": _sales(prior)})

    def total(key):
        facts = [r[key] for r in rows]
        complete = bool(facts) and all(r and r["sales_days"] == r["expected_days"] and r["expected_days"] > 0 for r in facts)
        return {"units": _sum(r["units"] if r else None for r in facts),
                "retail_sales": _sum(r["dollars"] if r else None for r in facts), "complete": complete,
                "sales_days": sum(r["sales_days"] for r in facts if r),
                "expected_days": sum(r["expected_days"] for r in facts if r),
                "covered_products": sum(r is not None for r in facts)}

    current, prior = total("current"), total("prior")
    change = (100 * (current["units"] / prior["units"] - 1)
              if current["complete"] and prior["complete"] and prior["units"] and prior["units"] > 0 else None)
    for row in rows:
        row["unit_share_pct"] = (100 * row["current"]["units"] / current["units"]
                                  if current["complete"] and current["units"] and current["units"] > 0 else None)
    return {"view_version": VERSION, "metric_release_id": manifest["metric_release_id"],
            "metric_version": manifest["contract_version"], "issued_at": manifest["as_of"],
            "observation_date": manifest["observation_date"],
            "week_start": start, "week_end": end, "store_count": stores,
            "current": current, "prior": prior, "units_change_pct": change,
            "products": rows, "capabilities": _capabilities(manifest),
            "sales_basis": "Recorded retailer sales; not manufacturer shipment revenue. Velocity uses valid eligible observed store-days, including zero-selling days."}


def product_view(root: Path, manifest: dict, product_id: str, *, region: str | None = None,
                 finding_id: str | None = None) -> dict:
    """UI-W02/03/04: scoped facts and 28-day alternatives, no new demand estimator."""
    end = _week_end(manifest["observation_date"])
    cap = _capabilities(manifest)
    with duckdb.connect() as con:
        con.execute("SET threads=1")
        exists = con.execute("SELECT count(*) FROM read_parquet(?) WHERE product_id=?",
                             [str(root / "current_store.parquet"), product_id]).fetchall()[0][0]
        if not exists:
            raise LookupError("Product not found")
        regions = [r[0] for r in con.execute("SELECT DISTINCT region FROM read_parquet(?) WHERE product_id=? AND eligible ORDER BY region",
                                           [str(root / "current_store.parquet"), product_id]).fetchall()]
        if region is not None and region not in regions:
            raise LookupError("Region not found")
        member_sql = "SELECT location_id,product_id FROM read_parquet(?) WHERE product_id=? AND eligible AND (? IS NULL OR region=?)"
        params: list = [str(root / "current_store.parquet"), product_id, region, region]
        if finding_id:
            if not cap["findings"]:
                raise LookupError("Finding evidence unavailable")
            member_sql += " AND location_id IN (SELECT location_id FROM read_parquet(?) WHERE finding_id=? AND product_id=?)"
            params += [str(root / "finding_evidence.parquet"), finding_id, product_id]
        con.execute("CREATE TEMP TABLE members AS " + member_sql, params)
        members = con.execute("SELECT count(*) FROM members").fetchall()[0][0]
        if finding_id and not members:
            raise LookupError("Finding not found in product scope")
        # Historical periods use original per-period eligibility, never today's
        # inventory cohort. Finding investigations deliberately retain member scope.
        if finding_id:
            grain, scope = "store", None
            condition = " AND scope_id IN (SELECT location_id FROM members)"
        else:
            grain, scope = ("region", region) if region else ("item", product_id)
            condition = " AND scope_id=?"
        args = [str(root / "metric_period.parquet"), product_id, grain, end - timedelta(weeks=11), end]
        if not finding_id:
            args.append(scope)
        sales = con.execute("""SELECT period_start,period_end,sum(units) units,sum(dollars) dollars,
            sum(sales_days)::BIGINT sales_days,sum(expected_days)::BIGINT expected_days,
            7*sum(units)/nullif(sum(sales_days),0) units_store_week,
            sum(sales_days)::DOUBLE/nullif(sum(expected_days),0) sales_coverage
            FROM read_parquet(?) WHERE product_id=? AND grain=? AND period_kind='week'
            AND period_end BETWEEN ? AND ?""" + condition + " GROUP BY period_start,period_end ORDER BY period_start", args).to_arrow_table().to_pylist()
        inventory = con.execute("""SELECT count(*)::BIGINT stores,
            count(on_hand)::BIGINT known_stores,
            CASE WHEN count(on_hand)=count(*) AND count(*)>0 THEN sum(on_hand) END on_hand,
            count(*) FILTER(WHERE current_state='reported_zero_on_hand')::BIGINT zero_stores
            FROM read_parquet(?) JOIN members USING(location_id,product_id)""",
            [str(root / "current_store.parquet")]).to_arrow_table().to_pylist()[0]
        projections = []
        economics = []
        for file, assessment, basis in (("supply_projection", "supply_assessment", "firm"),
                                         ("expected_supply_projection", "expected_supply_assessment", "conditional")):
            if file + ".parquet" not in {f["path"] for f in manifest["files"]}:
                continue
            raw = con.execute("""SELECT p.projection_date,count(*)::BIGINT ready_stores,
                sum(p.demand_units) demand_units,sum(p.inbound_units) inbound_units,
                sum(p.ending_units) ending_units,sum(p.unfulfilled_units) unfulfilled_units,
                count(*) FILTER(WHERE p.unfulfilled_units>0)::BIGINT stores_with_unmet,
                CASE WHEN count(a.unit_retail_amount)=count(*) THEN sum(p.unfulfilled_units*a.unit_retail_amount) END retail_exposure
                FROM read_parquet(?) p JOIN members USING(location_id,product_id)
                LEFT JOIN read_parquet(?) a USING(location_id,product_id)
                WHERE p.path='base' GROUP BY p.projection_date ORDER BY p.projection_date""",
                [str(root / (file + ".parquet")), str(root / "supply_assessment.parquet")]).to_arrow_table().to_pylist()
            by_day = {r["projection_date"]: r for r in raw}
            cumulative: float | None = 0.0
            cumulative_retail: float | None = 0.0
            for offset in range(1, 29):
                day = date.fromisoformat(manifest["observation_date"]) + timedelta(days=offset)
                row = by_day.get(day)
                complete = bool(members) and row is not None and row["ready_stores"] == members
                values = {k: row[k] if complete and row is not None else None for k in
                          ("demand_units", "inbound_units", "ending_units", "unfulfilled_units", "stores_with_unmet", "retail_exposure")}
                cumulative = cumulative + values["unfulfilled_units"] if cumulative is not None and values["unfulfilled_units"] is not None else None
                cumulative_retail = cumulative_retail + values["retail_exposure"] if cumulative_retail is not None and values["retail_exposure"] is not None else None
                projections.append({"date": day, "basis": basis, "ready_stores": row["ready_stores"] if row else 0,
                                    **values, "cumulative_unmet_units": cumulative,
                                    "cumulative_retail_exposure": cumulative_retail})
            facts = con.execute("""SELECT count(a.base_unfulfilled_units)::BIGINT ready_stores,
                CASE WHEN count(a.estimated_unfulfilled_retail_amount)=count(*) AND count(*)>0
                    THEN sum(a.estimated_unfulfilled_retail_amount) END retail_exposure,
                CASE WHEN count(a.base_unfulfilled_units)=count(*) AND count(*)>0
                    THEN sum(a.base_unfulfilled_units) END unfulfilled_units,
                CASE WHEN count(a.base_unfulfilled_units)=count(*) AND count(*)>0 THEN min(a.base_unfulfilled_date) END first_shortage
                FROM members m LEFT JOIN read_parquet(?) a USING(location_id,product_id)""",
                [str(root / (assessment + ".parquet"))]).to_arrow_table().to_pylist()[0]
            economics.append({"basis": basis, **facts})
        # Region performance is published sales, not invented coordinates.
        regional = con.execute("""SELECT scope_id region,units,dollars,units_store_week,sales_coverage
            FROM read_parquet(?) WHERE grain='region' AND product_id=? AND period_kind='week' AND period_end=? ORDER BY scope_id""",
            [str(root / "metric_period.parquet"), product_id, end]).to_arrow_table().to_pylist()
    by_end = {r["period_end"]:r for r in sales}
    sales = [by_end.get(week_end, {"period_start":week_end-timedelta(days=6),"period_end":week_end,
             "units":None,"dollars":None,"sales_days":0,"expected_days":0,
             "units_store_week":None,"sales_coverage":None})
             for week_end in (end-timedelta(weeks=back) for back in range(11,-1,-1))]
    return {"view_version": VERSION, "metric_release_id": manifest["metric_release_id"], "product_id": product_id,
            "region": region, "finding_id": finding_id, "observation_date": manifest["observation_date"],
            "regions": regions, "sales_weeks": sales, "inventory": inventory, "projections": projections,
            "economics": economics, "regional_sales": regional, "capabilities": cap,
            "projection_basis": "28-day existing base demand, firm receipts and optional eligible retailer plans. Conditional plans require retailer confirmation; they are not confirmed receipts or brand-controlled allocation."}


def store_page(root: Path, manifest: dict, product_id: str, *, region: str | None = None,
               search: str = "", limit: int = 25, offset: int = 0) -> dict:
    """UI-W04: allowlisted store visibility, bounded pages, never raw cost records."""
    with duckdb.connect() as con:
        where = "product_id=? AND eligible AND (? IS NULL OR region=?) AND contains(lower(location_name||' '||source_location_id),lower(?))"
        params = [str(root / "current_store.parquet"), product_id, region, region, search]
        total = con.execute("SELECT count(*) FROM read_parquet(?) WHERE " + where, params).fetchall()[0][0]
        rows = con.execute("""SELECT location_id,source_location_id,location_name,region,on_hand,current_state
            FROM read_parquet(?) WHERE """ + where + " ORDER BY source_location_id,location_id LIMIT ? OFFSET ?",
            [*params,limit,offset]).to_arrow_table().to_pylist()
    return {"view_version": VERSION, "metric_release_id": manifest["metric_release_id"], "product_id":product_id,
            "region":region,"search":search,"total":total,"limit":limit,"offset":offset,"rows":rows}
