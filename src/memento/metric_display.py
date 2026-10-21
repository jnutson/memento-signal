"""Complete-population display aggregates; no new forecast or decision model."""
from pathlib import Path
from datetime import date, timedelta
from math import fsum

import duckdb


def exposure_summary(root: Path, manifest: dict) -> dict:
    """Dollarize distinct finding members, not counts or hypothetical action benefits."""
    buckets = []
    with duckdb.connect() as con:
        for key, codes, basis in (
            ("z", ["current_out_of_stock", "promised_distribution_gap"],
             "Next 28 days: unmet retail demand at currently zero-inventory stores, assuming eligible retailer plans arrive."),
            ("a", ["future_supply_gap"],
             "Next 28 days: unmet retail demand at other stores, after firm supply and eligible retailer plans. Plan dependencies covered by plans are excluded."),
            ("i", ["excess_inventory"],
             "Day 28: firm excess above the declared cover target, valued at unit cost. Planned-only excess is excluded; this is capital, not markdown loss."),
        ):
            # One row per store-item even if finding groups overlap. Missing
            # valuations remain unknown, never silently zero-filled.
            if key == "i":
                query = """SELECT location_id,product_id,max(inventory_capital_amount) amount
                    FROM read_parquet(?) WHERE finding_code IN (SELECT unnest(?))
                    GROUP BY location_id,product_id"""
                args = [str(root / "finding_evidence.parquet"), codes]
            else:
                query = """SELECT m.location_id,m.product_id,s.estimated_unfulfilled_retail_amount amount
                    FROM (SELECT DISTINCT location_id,product_id FROM read_parquet(?)
                    WHERE finding_code IN (SELECT unnest(?))) m
                    LEFT JOIN read_parquet(?) s USING(location_id,product_id)"""
                args = [str(root / "finding_evidence.parquet"), codes, str(root / "expected_supply_assessment.parquet")]
            rows = con.execute(query, args).to_arrow_table().to_pylist()
            valued = [r["amount"] for r in rows if r["amount"] is not None]
            known = fsum(valued) if valued or not rows else None
            buckets.append({"key": key, "amount": known if len(valued) == len(rows) else None,
                            "known_amount": known, "member_count": len(rows), "valued_count": len(valued),
                            "basis": basis})
    return {"metric_release_id": manifest["metric_release_id"], "observation_date": manifest["observation_date"],
            "buckets": buckets, "limitation": "Retail exposure and inventory capital are different measures; do not add the cards. No action benefit or realized loss is estimated."}


def display_series(root: Path, manifest: dict, product_id: str, finding_id: str | None) -> dict:
    with duckdb.connect() as con:
        if finding_id:
            con.execute("CREATE TEMP TABLE members AS SELECT location_id,product_id FROM read_parquet(?) WHERE finding_id=? AND product_id=?",
                        [str(root / "finding_evidence.parquet"), finding_id, product_id])
        else:
            con.execute("CREATE TEMP TABLE members AS SELECT location_id,product_id FROM read_parquet(?) WHERE product_id=? AND eligible",
                        [str(root / "current_store.parquet"), product_id])
        count = con.sql("SELECT count(*) FROM members").fetchall()[0][0]
        members = con.execute("""SELECT c.location_id,c.product_id,c.location_name,c.region,c.on_hand,c.current_state
            FROM read_parquet(?) c JOIN members USING(location_id,product_id) ORDER BY c.location_id""",
            [str(root / "current_store.parquet")]).to_arrow_table().to_pylist()
        store_supply = con.execute("""SELECT m.location_id,m.product_id,f.demand_base_28d,
            f.base_depletion_date firm_depletion_date,f.base_unfulfilled_date firm_shortage_date,
            e.base_unfulfilled_date conditional_shortage_date,f.base_unfulfilled_units firm_unfulfilled_units,
            e.base_unfulfilled_units conditional_unfulfilled_units
            FROM members m LEFT JOIN read_parquet(?) f USING(location_id,product_id)
            LEFT JOIN read_parquet(?) e USING(location_id,product_id) ORDER BY m.location_id""",
            [str(root / "supply_assessment.parquet"), str(root / "expected_supply_assessment.parquet")]).to_arrow_table().to_pylist()
        history = con.execute("""SELECT business_date,
            count(*) FILTER(WHERE eligible) expected_stores,
            count(*) FILTER(WHERE sales_valid) sales_stores,
            count(*) FILTER(WHERE inventory_valid) inventory_stores,
            CASE WHEN count(*) FILTER(WHERE eligible)>0 AND count(*) FILTER(WHERE sales_valid)=count(*) FILTER(WHERE eligible)
                THEN sum(units) FILTER(WHERE sales_valid) END units,
            CASE WHEN count(*) FILTER(WHERE eligible)>0 AND count(*) FILTER(WHERE sales_valid)=count(*) FILTER(WHERE eligible)
                THEN sum(dollars ORDER BY d.location_id) FILTER(WHERE sales_valid) END dollars,
            CASE WHEN count(*) FILTER(WHERE eligible)>0 AND count(*) FILTER(WHERE inventory_valid)=count(*) FILTER(WHERE eligible)
                THEN sum(on_hand) FILTER(WHERE inventory_valid) END on_hand,
            count(*) FILTER(WHERE inventory_valid AND on_hand=0) zero_stores
            FROM read_parquet(?) d JOIN members USING(location_id,product_id)
            WHERE business_date>?::DATE-56 AND business_date<=?::DATE
            GROUP BY business_date ORDER BY business_date""", [str(root / "daily.parquet"), manifest["observation_date"], manifest["observation_date"]]).to_arrow_table().to_pylist()
        projected = []
        for file, basis in (("supply_projection", "firm"), ("expected_supply_projection", "conditional")):
            rows = con.execute("""SELECT projection_date,count(*) ready_stores,
                sum(demand_units) demand_units,sum(inbound_units) inbound_units,
                sum(ending_units) ending_units,sum(unfulfilled_units) unfulfilled_units
                FROM read_parquet(?) p JOIN members USING(location_id,product_id)
                WHERE path='base' GROUP BY projection_date ORDER BY projection_date""", [str(root / (file + ".parquet"))]).to_arrow_table().to_pylist()
            by_date = {str(row["projection_date"]): row for row in rows}
            for offset in range(1, 29):
                day = date.fromisoformat(manifest["observation_date"]) + timedelta(days=offset)
                row = by_date.get(day.isoformat(), {"projection_date": day, "ready_stores": 0,
                    "demand_units": None, "inbound_units": None, "ending_units": None, "unfulfilled_units": None})
                if row["ready_stores"] != count:
                    for field in ("demand_units", "inbound_units", "ending_units", "unfulfilled_units"):
                        row[field] = None
                projected.append({**row, "basis": basis})
        orders = con.execute("""SELECT o.* FROM read_parquet(?) o JOIN members USING(location_id,product_id)
            WHERE included_in_projection ORDER BY expected_store_receipt_date,location_id,retailer_order_id,order_line_number""",
            [str(root / "supply_order.parquet")]).to_arrow_table().to_pylist()
        # Diagnostic operands for the supplied Why panel. Historical dates use
        # only this published release, never later actuals or latent scenarios.
        history_facts = con.execute("""WITH prior AS (
            SELECT location_id,product_id,max(business_date) FILTER(WHERE sales_valid AND units>0) last_sale_date,
            min(business_date) history_start_date,bool_or(inventory_valid AND on_hand>0) positive_observed
            FROM read_parquet(?) d JOIN members USING(location_id,product_id)
            WHERE business_date<=?::DATE GROUP BY location_id,product_id)
            SELECT max(last_sale_date) last_sale_date,min(history_start_date) history_start_date,
            count(*) FILTER(WHERE c.current_state='reported_zero_on_hand' AND coalesce(p.positive_observed,false)) zero_previously_stocked_stores,
            count(*) FILTER(WHERE c.current_state='reported_zero_on_hand' AND NOT coalesce(p.positive_observed,false)) zero_without_observed_stock_stores
            FROM members m LEFT JOIN prior p USING(location_id,product_id)
            LEFT JOIN read_parquet(?) c USING(location_id,product_id)""",
            [str(root / "daily.parquet"), manifest["observation_date"], str(root / "current_store.parquet")]).to_arrow_table().to_pylist()[0]
        supply_facts = con.execute("""SELECT
            CASE WHEN count(f.base_unfulfilled_units)=count(*) THEN min(f.base_depletion_date) END first_firm_depletion_date,
            CASE WHEN count(e.estimated_unfulfilled_retail_amount)=count(*) THEN sum(e.estimated_unfulfilled_retail_amount ORDER BY m.location_id) END conditional_unmet_retail_amount,
            CASE WHEN count(*) FILTER(WHERE e.planned_input_status='available')=count(*) THEN sum(e.dated_planned_units) END planned_receipts_28d,
            count(*) FILTER(WHERE e.planned_input_status='available') planned_feed_stores
            FROM members m LEFT JOIN read_parquet(?) f USING(location_id,product_id)
            LEFT JOIN read_parquet(?) e USING(location_id,product_id)""",
            [str(root / "supply_assessment.parquet"), str(root / "expected_supply_assessment.parquet")]).to_arrow_table().to_pylist()[0]
    return {"metric_release_id": manifest["metric_release_id"], "product_id": product_id,
            "finding_id": finding_id, "member_count": count, "scope": "finding_members" if finding_id else "currently_eligible_item_stores",
            "history": history, "projections": projected, "firm_orders": orders, "members": members, "store_supply": store_supply,
            "diagnostics": {**history_facts, **supply_facts},
            "limitation": "Totals are unavailable when any required member lacks evidence. Firm and conditional views are alternatives, never additive. No action counterfactual is modeled."}
