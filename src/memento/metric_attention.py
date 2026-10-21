"""Versioned, deterministic demo exposure estimates; not causal attribution or actions."""
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from math import fsum
from pathlib import Path

import duckdb


@dataclass(frozen=True)
class AttentionAssumptions:
    baseline_calendar_days: int = 28
    minimum_in_stock_days: int = 7
    po_authorization_days: int = 7
    fulfillment_days: int = 2
    brand_to_retailer_dc_days: int = 5
    retailer_dc_to_store_days: int = 7

    def __post_init__(self):
        values = asdict(self)
        if any(type(v) is not int or not 1 <= v <= 90 for v in values.values()):
            raise ValueError("invalid attention assumptions")
        if self.minimum_in_stock_days > self.baseline_calendar_days or self.replenishment_days > 28:
            raise ValueError("unsupported attention evidence horizon")

    @property
    def replenishment_days(self) -> int:
        return self.po_authorization_days + self.fulfillment_days + self.brand_to_retailer_dc_days + self.retailer_dc_to_store_days


def _complete(values):
    return fsum(values) if all(v is not None for v in values) else None


def attention_values(root: Path, manifest: dict, *, finding_id: str | None = None,
                     assumptions: AttentionAssumptions = AttentionAssumptions()) -> dict:
    observed = date.fromisoformat(manifest["observation_date"])
    with duckdb.connect() as con:
        con.execute("""CREATE TEMP TABLE population AS SELECT e.finding_id,e.finding_code,e.product_id,e.location_id,
            e.inventory_capital_amount,e.retail_exposure_amount,s.consecutive_zero_days,
            f.unit_retail_amount,f.demand_base_28d,e.event_date,
            x.estimated_unfulfilled_retail_amount conditional_retail
            FROM read_parquet(?) e JOIN read_parquet(?) s USING(location_id,product_id)
            JOIN read_parquet(?) f USING(location_id,product_id)
            JOIN read_parquet(?) x USING(location_id,product_id)
            WHERE e.finding_code IN ('current_out_of_stock','promised_distribution_gap','future_supply_gap',
                'excess_inventory','conditional_excess_inventory') AND (? IS NULL OR e.finding_id=?)""",
            [str(root / "finding_evidence.parquet"), str(root / "current_store.parquet"),
             str(root / "supply_assessment.parquet"), str(root / "expected_supply_assessment.parquet"), finding_id, finding_id])
        operands = con.execute("""SELECT p.*,
            count(*) FILTER(WHERE d.business_date BETWEEN ?::DATE-p.consecutive_zero_days::INTEGER-?::INTEGER+1 AND ?::DATE-p.consecutive_zero_days::INTEGER
                AND d.eligible AND d.sales_valid AND d.inventory_valid AND d.on_hand>0) baseline_days,
            sum(d.dollars ORDER BY d.business_date) FILTER(WHERE d.business_date BETWEEN ?::DATE-p.consecutive_zero_days::INTEGER-?::INTEGER+1 AND ?::DATE-p.consecutive_zero_days::INTEGER
                AND d.eligible AND d.sales_valid AND d.inventory_valid AND d.on_hand>0) baseline_dollars,
            count(*) FILTER(WHERE d.business_date>?::DATE-p.consecutive_zero_days::INTEGER AND d.eligible AND d.sales_valid) episode_sales_days,
            sum(d.dollars ORDER BY d.business_date) FILTER(WHERE d.business_date>?::DATE-p.consecutive_zero_days::INTEGER AND d.eligible AND d.sales_valid) episode_dollars
            FROM population p LEFT JOIN (SELECT * FROM read_parquet(?) WHERE business_date<=?::DATE) d USING(location_id,product_id)
            GROUP BY ALL ORDER BY p.finding_id,p.location_id""",
            [observed, assumptions.baseline_calendar_days, observed, observed, assumptions.baseline_calendar_days, observed,
             observed, observed, str(root / "daily.parquet"), observed]).to_arrow_table().to_pylist()
        traces = {}
        for row in con.execute("""SELECT t.* FROM read_parquet(?) t JOIN
            (SELECT DISTINCT location_id,product_id FROM population WHERE finding_code IN ('current_out_of_stock','promised_distribution_gap')) p
            USING(location_id,product_id) WHERE path='base' ORDER BY location_id,product_id,projection_date""",
            [str(root / "supply_projection.parquet")]).to_arrow_table().to_pylist():
            traces.setdefault((row["location_id"], row["product_id"]), []).append(row)
    groups = {}
    for row in operands:
        code = row["finding_code"]
        zero = code in {"current_out_of_stock", "promised_distribution_gap"}
        lane = "z" if zero else "a" if code == "future_supply_gap" else "i"
        past = future = rate = None
        baseline = "not_applicable"
        receipt_basis = "not_applicable"
        end = observed + timedelta(days=28)
        if zero:
            days = row["consecutive_zero_days"]
            if row["baseline_days"] >= assumptions.minimum_in_stock_days and row["baseline_dollars"] is not None and row["baseline_dollars"] >= 0:
                rate = row["baseline_dollars"] / row["baseline_days"]
                baseline = "own_store_in_stock_sales"
            elif row["demand_base_28d"] is not None and row["unit_retail_amount"] is not None:
                rate = row["demand_base_28d"] / 28 * row["unit_retail_amount"]
                baseline = "current_retailer_forecast_proxy_not_historical_sales"
            if days is not None and days > 0 and row["episode_sales_days"] == days and row["episode_dollars"] is not None and rate is not None:
                past = max(0., rate * days - row["episode_dollars"])
            projected = traces.get((row["location_id"], row["product_id"]), [])
            complete = len(projected) == 28 and [p["projection_date"] for p in projected] == [observed + timedelta(days=i) for i in range(1,29)]
            if complete:
                arrivals = [p for p in projected if p["inbound_units"] > 0]
                recovery = next((p for p in arrivals if p["ending_units"] > 0), None)
                if arrivals:
                    # A small partial receipt does not imply recovery. Use the
                    # published day-level demand/receipt simulation, not qty × days.
                    end = recovery["projection_date"] if recovery else end
                    receipt_basis = "dated_firm_receipts" if recovery else "partial_firm_receipts_no_recovery_within_28d"
                else:
                    end = observed + timedelta(days=assumptions.replenishment_days)
                    receipt_basis = "assumed_existing_brand_stock_and_new_authorized_po"
                if row["unit_retail_amount"] is not None:
                    future = fsum(p["unfulfilled_units"] for p in projected if p["projection_date"] <= end) * row["unit_retail_amount"]
            else:
                receipt_basis = "missing_complete_forecast_or_firm_supply_evidence"
            amount = _complete([past, future])
        else:
            amount = row["conditional_retail"] if lane == "a" else row["inventory_capital_amount"]
            future = amount
        member = {"location_id": row["location_id"], "product_id": row["product_id"], "amount": amount,
                  "retrospective_amount": past, "forward_amount": future, "zero_days": row["consecutive_zero_days"] if zero else None,
                  "in_stock_sales_days": row["baseline_days"] if zero else None, "baseline_daily_retail": rate,
                  "baseline_basis": baseline, "receipt_basis": receipt_basis, "window_end_date": end.isoformat(),
                  "recorded_episode_retail": row["episode_dollars"] if zero else None,
                  "unit_retail_amount": row["unit_retail_amount"],
                  "episode_start_date": (observed-timedelta(days=row["consecutive_zero_days"]-1)).isoformat() if zero and row["consecutive_zero_days"] else None}
        group = groups.setdefault(row["finding_id"], {"finding_id": row["finding_id"], "product_id": row["product_id"],
            "lane": lane, "economic_basis": "inventory_capital_at_cost" if lane == "i" else "estimated_unmet_retail_sales",
            "members": []})
        group["members"].append(member)
    rows = []
    for group in groups.values():
        members = group.pop("members")
        valued = [r["amount"] for r in members if r["amount"] is not None]
        group.update(amount=_complete([r["amount"] for r in members]), known_amount=fsum(valued) if valued else None,
            member_count=len(members), valued_count=len(valued),
            retrospective_amount=_complete([r["retrospective_amount"] for r in members]) if group["lane"] == "z" else None,
            forward_amount=_complete([r["forward_amount"] for r in members]),
            historical_baseline_stores=sum(r["baseline_basis"] == "own_store_in_stock_sales" for r in members),
            assumed_receipt_stores=sum(r["receipt_basis"] == "assumed_existing_brand_stock_and_new_authorized_po" for r in members),
            window_end_date=max(r["window_end_date"] for r in members))
        if finding_id:
            group["members"] = members
        rows.append(group)
    rows.sort(key=lambda r: r["finding_id"])
    descriptions = {
        "z": "Estimated missed retail sales during current zero-inventory episodes, plus Walmart-forecast exposure until firm recovery or the declared replenishment scenario. Not realized or causally attributed losses.",
        "a": "Next 28 days: projected unmet retail demand even if eligible retailer plans arrive. Plan-covered dependencies are excluded.",
        "i": "Projected excess inventory capital at cost above the declared cover target. Firm and planned-only excess findings retain their separate bases; not markdown losses.",
    }
    buckets = []
    for key in ("z", "a", "i"):
        chosen = [r for r in rows if r["lane"] == key]
        known = [r["known_amount"] for r in chosen if r["known_amount"] is not None]
        buckets.append({"key": key, "amount": _complete([r["amount"] for r in chosen]),
            "known_amount": fsum(known) if known or not chosen else None,
            "member_count": sum(r["member_count"] for r in chosen), "valued_count": sum(r["valued_count"] for r in chosen), "basis": descriptions[key]})
    return {"metric_release_id": manifest["metric_release_id"], "observation_date": observed.isoformat(),
        "model_version": "attention-exposure-v1", "assumptions": {**asdict(assumptions), "replenishment_days": assumptions.replenishment_days},
        "rows": rows, "buckets": buckets,
        "limitation": "Estimates, not booked losses, prevented sales or action benefits. Own in-stock sales use the last 28 calendar days before the current episode (minimum 7 observed in-stock days); otherwise the current retailer forecast is an explicit proxy. With no firm receipt within 28 days, the 21-day default assumes ready brand stock, PO authorization and delivery; feasibility is unverified. Retail exposure and inventory capital have different bases/horizons and must not be added."}
