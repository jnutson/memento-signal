"""Observable temporal acceptance and event evaluation; no ranking or private truth."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import date, datetime, timedelta
import hashlib
import json
import os
from pathlib import Path
import tempfile

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from .manifest import canonical_json, sha256_file
from .metric_contract import MetricConfig
from .metric_publication import publish_metrics, validate_release
from .metric_source import member, series_entry, verified_file
from .orchestrator import ingest


EVALUATION_VERSION = "observable-metric-replay-v2"
HORIZONS=(7,14,28)
PAIR_SCHEMA=pa.schema([
    ("metric_release_id",pa.string()),("observation_date",pa.date32()),("location_id",pa.string()),("product_id",pa.string()),
    ("horizon_days",pa.int64()),("cohort",pa.string()),("outcome_complete",pa.bool_()),
    ("valid_outcome_days",pa.int64()),("prediction_available",pa.bool_()),("predicted_event",pa.bool_()),
    ("observed_new_event",pa.bool_()),("first_observed_onset",pa.date32()),("predicted_onset",pa.date32()),
    ("result",pa.string()),("warning_lead_days",pa.int64()),("onset_error_days",pa.int64()),
    ("later_new_order",pa.bool_()),("later_order_revision",pa.bool_()),
    ("initial_forecast_velocity_band",pa.string()),
])
EVENT_SCHEMA=pa.schema([
    ("event_id",pa.string()),("location_id",pa.string()),("product_id",pa.string()),("onset_date",pa.date32()),
    ("horizon_days",pa.int64()),("opportunities",pa.int64()),("detected",pa.bool_()),("warning_lead_days",pa.int64()),
    ("advance_warning",pa.bool_()),("advance_warning_lead_days",pa.int64()),("seven_day_warning",pa.bool_()),
    ("seven_day_opportunities",pa.int64()),("initial_forecast_velocity_band",pa.string()),
])


def _hash(value):
    return hashlib.sha256(canonical_json(value)).hexdigest()


def _query(con, path, table):
    # Table names are internal constants; file names never come from a source row.
    con.read_parquet(str(path/(table+".parquet"))).create_view(table)


def verify_pair(before: Path, after: Path) -> dict:
    """Check actual prefixes, qualified tiers and completed-period metrics independently."""
    old,new=validate_release(before),validate_release(after)
    if old["configuration"]!=new["configuration"] or old["as_of"]>=new["as_of"]:
        raise ValueError("replay cutoffs must increase with one frozen configuration")
    with duckdb.connect() as con:
        con.execute("SET threads=1")
        fields="location_id,product_id,business_date,units,dollars,on_hand"
        observed="units IS NOT NULL OR dollars IS NOT NULL OR on_hand IS NOT NULL"
        changed=con.execute(f"""WITH a AS (SELECT {fields} FROM read_parquet(?) WHERE {observed}),
          b AS (SELECT {fields} FROM read_parquet(?) WHERE business_date<=?::DATE AND ({observed}))
          SELECT (SELECT count(*) FROM (SELECT * FROM a EXCEPT ALL SELECT * FROM b))+
                 (SELECT count(*) FROM (SELECT * FROM b EXCEPT ALL SELECT * FROM a))""",
          [str(before/"daily.parquet"),str(after/"daily.parquet"),old["observation_date"]]).fetchall()[0][0]
        if changed:
            raise ValueError("previously observed actuals changed during replay")
        changed=con.execute("""SELECT count(*) FROM read_parquet(?) a FULL OUTER JOIN read_parquet(?) b
          USING(location_id,product_id) WHERE a.tier IS DISTINCT FROM b.tier""",
          [str(before/"current_store.parquet"),str(after/"current_store.parquet")]).fetchall()[0][0]
        if changed:
            raise ValueError("frozen store tiers changed during replay")
        # The complete descriptive history must not be recomputed from future status or sales.
        changed=con.execute("""WITH a AS (SELECT * FROM read_parquet(?)),
          b AS (SELECT * FROM read_parquet(?) WHERE period_end<=?::DATE)
          SELECT (SELECT count(*) FROM (SELECT * FROM a EXCEPT ALL SELECT * FROM b))+
                 (SELECT count(*) FROM (SELECT * FROM b EXCEPT ALL SELECT * FROM a))""",
          [str(before/"metric_period.parquet"),str(after/"metric_period.parquet"),old["observation_date"]]).fetchall()[0][0]
        if changed:
            raise ValueError("completed metric history changed during replay")
        if old["contract_version"] in {"retail-backend-metrics-v4", "retail-backend-metrics-v5"} and new["contract_version"] in {"retail-backend-metrics-v4", "retail-backend-metrics-v5"}:
            from .metric_planned_source import PLAN_SCHEMA
            columns = ["location_id", "product_id", *[f.name for f in PLAN_SCHEMA if f.name not in {"store_nbr", "wm_item_nbr"}]]
            different = " OR ".join(f"a.{field} IS DISTINCT FROM b.{field}" for field in columns)
            changed = con.execute(f"""SELECT count(*) FROM read_parquet(?) a JOIN read_parquet(?) b USING(plan_id)
                WHERE b.plan_version<a.plan_version OR b.known_at<a.known_at OR b.issued_at<>a.issued_at
                OR a.location_id<>b.location_id OR a.product_id<>b.product_id
                OR (a.plan_version=b.plan_version AND ({different}))""",
                [str(before/"planned_order.parquet"), str(after/"planned_order.parquet")]).fetchall()[0][0]
            if changed:
                raise ValueError("planned-order version or immutable issue identity changed during replay")
            disappeared = con.execute("""SELECT count(*) FROM read_parquet(?) a LEFT JOIN read_parquet(?) b USING(plan_id)
                JOIN read_parquet(?) c ON a.location_id=c.location_id AND a.product_id=c.product_id
                WHERE b.plan_id IS NULL AND c.planned_orders_available""",
                [str(before/"planned_order.parquet"), str(after/"planned_order.parquet"), str(after/"planned_coverage.parquet")]).fetchall()[0][0]
            if disappeared:
                raise ValueError("known plan disappeared without an explicit coverage gap")
    return {"from":old["metric_release_id"],"to":new["metric_release_id"],
            "actual_prefix_immutable":True,"tiers_frozen":True,"completed_periods_immutable":True}


def verify_snapshot(path: Path) -> dict:
    meta=validate_release(path)
    with duckdb.connect() as con:
        con.execute("SET threads=1")
        for name in ("current_store","supply_assessment","supply_projection","supply_order","supply_forecast","daily","checks","distribution_summary"):
            _query(con,path,name)
        if meta.get("planned_order_source") is not None or meta["contract_version"] in {"retail-backend-metrics-v4", "retail-backend-metrics-v5"}:
            for name in ("planned_order", "planned_conversion", "planned_coverage", "expected_supply_assessment", "expected_supply_projection"):
                _query(con, path, name)
        checks={
            "exhaustive_assessments": "SELECT abs((SELECT count(*) FROM current_store)-(SELECT count(*) FROM supply_assessment))",
            "assessment_unique": "SELECT count(*) FROM (SELECT location_id,product_id FROM supply_assessment GROUP BY ALL HAVING count(*)<>1)",
            "population_reconciles": f"SELECT abs(count(*)-{int(meta['population'])}) FROM current_store",
            "daily_no_future": "SELECT count(*) FROM daily WHERE business_date>?::DATE",
            "po_no_future": "SELECT count(*) FROM supply_order WHERE known_at>?::TIMESTAMPTZ",
            "assessment_cutoff": "SELECT count(*) FROM supply_assessment WHERE as_of<>?::TIMESTAMPTZ",
            "forecast_no_future": "SELECT count(*) FROM supply_forecast WHERE forecast_created_retail_year_week>last_closed_retail_week OR creation_week_end>?::DATE",
            "trace_horizon": "SELECT count(*) FROM supply_projection WHERE projection_date<=?::DATE OR projection_date>?::DATE+28",
            "trace_quantity_conservation": "SELECT count(*) FROM supply_projection WHERE abs(opening_units+inbound_units-fulfilled_units-ending_units)>1e-8 OR ending_units<0 OR unfulfilled_units<0 OR abs(demand_units-fulfilled_units-unfulfilled_units)>1e-8",
            "distribution_reconciles": "SELECT count(*) FROM distribution_summary WHERE promised_stores<>stocked_stores+confirmed_zero_stores+unknown_stores OR unconfirmed_stores<>confirmed_zero_stores+unknown_stores",
            "coverage_bounds": "SELECT count(*) FROM current_store WHERE recent_sales_coverage NOT BETWEEN 0 AND 1 OR recent_inventory_coverage NOT BETWEEN 0 AND 1",
            "zero_checks_exact": """WITH a AS (SELECT location_id,product_id FROM current_store WHERE reported_zero_on_hand),
              b AS (SELECT location_id,product_id FROM checks WHERE check_code='reported_zero_on_hand')
              SELECT (SELECT count(*) FROM (SELECT * FROM a EXCEPT ALL SELECT * FROM b))+
                     (SELECT count(*) FROM (SELECT * FROM b EXCEPT ALL SELECT * FROM a))""",
            "unknown_checks_exact": """WITH a AS (SELECT location_id,product_id FROM current_store WHERE eligible AND on_hand IS NULL),
              b AS (SELECT location_id,product_id FROM checks WHERE check_code='inventory_unknown')
              SELECT (SELECT count(*) FROM (SELECT * FROM a EXCEPT ALL SELECT * FROM b))+
                     (SELECT count(*) FROM (SELECT * FROM b EXCEPT ALL SELECT * FROM a))""",
        }
        params={"daily_no_future":[meta["observation_date"]],"po_no_future":[meta["as_of"]],
                "assessment_cutoff":[meta["as_of"]],"trace_horizon":[meta["observation_date"]]*2,
                "forecast_no_future":[meta["observation_date"]]}
        if meta["contract_version"] in {"retail-backend-metrics-v4", "retail-backend-metrics-v5"}:
            checks.update({
                "expected_population": "SELECT abs((SELECT count(*) FROM current_store)-(SELECT count(*) FROM expected_supply_assessment))",
                "planned_coverage_population": "SELECT abs((SELECT count(*) FROM current_store)-(SELECT count(*) FROM planned_coverage))",
                "plan_quantity_partition": "SELECT count(*) FROM planned_order WHERE order_each_qty::BIGINT<>converted_qty::BIGINT+remaining_planned_qty::BIGINT+withdrawn_qty::BIGINT",
                "plans_no_future": "SELECT count(*) FROM planned_order WHERE known_at>?::TIMESTAMPTZ OR issued_at>known_at",
                "expected_unknown_not_fabricated": """SELECT count(*) FROM expected_supply_assessment WHERE
                    planned_input_status<>'available' AND (base_unfulfilled_units IS NOT NULL OR dated_planned_units IS NOT NULL)""",
                "expected_trace_conservation": """SELECT count(*) FROM expected_supply_projection WHERE
                    abs(opening_units+inbound_units-fulfilled_units-ending_units)>1e-8 OR ending_units<0
                    OR unfulfilled_units<0 OR abs(demand_units-fulfilled_units-unfulfilled_units)>1e-8
                    OR abs(inbound_units-firm_inbound_units-planned_inbound_units)>1e-8""",
                "expected_demand_and_firm_unchanged": """SELECT count(*) FROM expected_supply_projection e
                    LEFT JOIN supply_projection f USING(location_id,product_id,path,projection_date)
                    WHERE f.location_id IS NULL OR e.demand_units<>f.demand_units OR e.firm_inbound_units<>f.inbound_units""",
                "expected_requires_coverage": """SELECT count(*) FROM expected_supply_projection e LEFT JOIN
                    planned_coverage c USING(location_id,product_id) WHERE NOT coalesce(c.planned_orders_available,false)""",
                "no_missed_plan_receipts": """SELECT count(*) FROM planned_order WHERE eligible_for_projection AND
                    (remaining_planned_qty<=0 OR order_place_dt<?::DATE OR sched_arvl_dt<?::DATE OR status='placement_overdue')""",
            })
            params.update(plans_no_future=[meta["as_of"]], no_missed_plan_receipts=[meta["as_of"]]*2)
        if meta["contract_version"] == "retail-backend-metrics-v5":
            for name in ("finding", "finding_evidence"):
                _query(con, path, name)
            checks.update({
                "finding_members_reconcile": """SELECT count(*) FROM finding f FULL JOIN
                    (SELECT finding_id,count(*) n,count(DISTINCT location_id) stores,sum(units) units,
                     count(units) valued FROM finding_evidence GROUP BY ALL) e USING(finding_id)
                    WHERE f.finding_id IS NULL OR e.finding_id IS NULL OR f.affected_store_count<>e.n OR e.n<>e.stores
                    OR (e.valued=e.n AND abs(f.units-e.units)>1e-8) OR (e.valued<e.n AND f.units IS NOT NULL)""",
                "finding_valid_members": """SELECT count(*) FROM finding_evidence e LEFT JOIN current_store s USING(location_id,product_id)
                    JOIN finding f USING(finding_id) WHERE s.location_id IS NULL OR NOT s.eligible
                    OR e.product_id<>f.product_id OR e.finding_code<>f.finding_code""",
                "finding_evidence_unique": "SELECT count(*) FROM (SELECT evidence_id FROM finding_evidence GROUP BY ALL HAVING count(*)<>1)",
                "finding_unique": "SELECT count(*) FROM (SELECT finding_id FROM finding GROUP BY ALL HAVING count(*)<>1)",
                "finding_financial_reconciliation": """SELECT count(*) FROM finding f JOIN (
                    SELECT finding_id,count(*) n,count(retail_exposure_amount) retail_n,count(inventory_capital_amount) cost_n,
                    count(carrying_cost_28d_amount) carry_n,sum(retail_exposure_amount) retail,
                    sum(inventory_capital_amount) capital,sum(carrying_cost_28d_amount) carry FROM finding_evidence GROUP BY ALL
                    ) e USING(finding_id) WHERE f.retail_valued_store_count<>e.retail_n OR f.cost_valued_store_count<>e.cost_n
                    OR (e.retail_n=e.n AND (f.retail_exposure_amount IS NULL OR abs(f.retail_exposure_amount-e.retail)>1e-8))
                    OR (e.retail_n<e.n AND f.retail_exposure_amount IS NOT NULL)
                    OR (e.cost_n=e.n AND (f.inventory_capital_amount IS NULL OR abs(f.inventory_capital_amount-e.capital)>1e-8))
                    OR (e.cost_n<e.n AND f.inventory_capital_amount IS NOT NULL)
                    OR (e.carry_n=e.n AND (f.carrying_cost_28d_amount IS NULL OR abs(f.carrying_cost_28d_amount-e.carry)>1e-8))
                    OR (e.carry_n<e.n AND f.carrying_cost_28d_amount IS NOT NULL)""",
            })
        for name,sql in checks.items():
            if con.execute(sql,params.get(name,[])).fetchall()[0][0]:
                raise ValueError("metric replay invariant failed: "+name)
        if meta["configuration"].get("demand_model")=="retailer_baseline":
            invalid=con.execute("SELECT count(*) FROM supply_forecast WHERE forecast_bias<>1 OR adjusted_weekly_units<>retailer_forecast_units").fetchall()[0][0]
            if invalid:
                raise ValueError("retailer baseline changed weekly quantities")
            checks["retailer_weekly_quantities_unchanged"]="verified"
        traces=con.execute("""SELECT count(*) FROM (SELECT location_id,product_id,path,count(*) n
          FROM supply_projection GROUP BY ALL HAVING n<>28)""").fetchall()[0][0]
        if traces:
            raise ValueError("incomplete projection traces")
        result = {"metric_release_id":meta["metric_release_id"],"passed_invariants":list(checks)+["trace_completeness"]}
        if meta["contract_version"] in {"retail-backend-metrics-v4", "retail-backend-metrics-v5"}:
            result["expected_supply_summary"] = {
                "comparison_states": dict(con.sql("SELECT comparison_state,count(*) FROM expected_supply_assessment GROUP BY ALL ORDER BY comparison_state").fetchall()),
                "input_states": dict(con.sql("SELECT planned_input_status,count(*) FROM expected_supply_assessment GROUP BY ALL ORDER BY planned_input_status").fetchall()),
                "interpretation": "conditional scenario comparison, not ranked alerts or measured prevention"}
        if meta["contract_version"] == "retail-backend-metrics-v5":
            result["finding_summary"] = con.sql("SELECT promise,finding_code,count(*) findings,sum(affected_store_count)::BIGINT store_item_members FROM finding GROUP BY ALL ORDER BY ALL").to_arrow_table().to_pylist()
        return result


def evaluate_observable(scoring: list[Path], final: Path, *, evidence_releases: list[Path] | None = None) -> tuple[pa.Table,pa.Table,dict]:
    """Pair-horizon yield and deduplicated episode recall, with explicit unknown outcomes."""
    end_meta=validate_release(final)
    with duckdb.connect() as con:
        con.execute("SET threads=1")
        final_days=con.execute("SELECT location_id,product_id,business_date,eligible,inventory_valid,on_hand FROM read_parquet(?) ORDER BY location_id,product_id,business_date",[str(final/"daily.parquet")]).fetchall()
        by_pair={}
        for store,product,day,eligible,valid,hand in final_days:
            by_pair.setdefault((store,product),{})[day]=(bool(eligible),bool(valid),hand)
        episodes=con.execute("SELECT location_id,product_id,onset_date FROM read_parquet(?) WHERE NOT left_censored ORDER BY location_id,product_id,onset_date",[str(final/"stockout_episode.parquet")]).fetchall()
        events={}
        for store,product,onset in episodes:
            events.setdefault((store,product),[]).append(onset)
        # Outcome-only diagnostic: later observable commitments never enter forecasts.
        later_orders={}
        for release in evidence_releases or [*scoring,final]:
            table=con.execute("SELECT * FROM read_parquet(?)",[str(release/"supply_order.parquet")]).to_arrow_table()
            for order in table.to_pylist():
                later_orders.setdefault((order["location_id"],order["product_id"]),{})[
                    (order["retailer_order_id"],order["order_line_number"],order["event_version"])]=order
        output=[]; opportunities={}; velocity_bands={}
        earliest=None
        for path in scoring:
            meta=validate_release(path)
            observation=date.fromisoformat(meta["observation_date"])
            earliest=min(earliest,observation) if earliest else observation
            if observation+timedelta(days=28)>date.fromisoformat(end_meta["observation_date"]):
                raise ValueError("scoring cutoff lacks its full terminal outcome window")
            known={}
            for o in con.execute("SELECT * FROM read_parquet(?)",[str(path/"supply_order.parquet")]).to_arrow_table().to_pylist():
                known[(o["retailer_order_id"],o["order_line_number"])]=o
            for row in con.execute("SELECT * FROM read_parquet(?) ORDER BY location_id,product_id",[str(path/"supply_assessment.parquet")]).to_arrow_table().to_pylist():
                key=(row["location_id"],row["product_id"])
                rate=row["reference_daily_demand"]
                velocity_bands.setdefault(key,"unknown" if rate is None else "zero" if rate==0 else "slow" if rate<.5 else "core" if rate<1.5 else "faster")
                cohort=("new_event_eligible" if row["current_state"]=="positive_reported_inventory"
                        else "already_zero" if row["current_state"]=="reported_zero_on_hand"
                        else "unknown_inventory" if row["current_state"]=="unknown_inventory" else "outside_scope")
                available=row["projection_status"] not in {"insufficient_data","not_applicable"}
                predicted=row["base_depletion_date"]
                for horizon in HORIZONS:
                    last=observation+timedelta(days=horizon)
                    window=[by_pair.get(key,{}).get(observation+timedelta(days=i)) for i in range(1,horizon+1)]
                    valid_days=sum(bool(d and d[0] and d[1]) for d in window)
                    complete=valid_days==horizon
                    occurred=[d for d in events.get(key,[]) if observation<d<=last]
                    observed=bool(occurred)
                    first=occurred[0] if occurred else None
                    forecast=available and predicted is not None and observation<predicted<=last
                    subsequent=[o for o in later_orders.get(key,{}).values() if observation<o["known_at"].date()<=last]
                    new_order=any(o.get("order_created_at") is not None and observation<o["order_created_at"].date()<=last for o in subsequent)
                    revised=any((prior:=known.get((o["retailer_order_id"],o["order_line_number"]))) is not None and
                        (o["expected_store_receipt_date"]!=prior["expected_store_receipt_date"] or
                         o.get("ordered_units")!=prior.get("ordered_units") or o["status_code"]=="cancelled") for o in subsequent)
                    if cohort!="new_event_eligible":
                        result="excluded_"+cohort
                    elif not complete:
                        result="unknown_outcome"
                    elif observed and forecast:
                        result="true_positive"
                    elif observed:
                        result="false_negative" if available else "unassessed_event"
                    elif forecast:
                        result="false_positive"
                    else:
                        result="true_negative" if available else "unassessed_no_event"
                    output.append({"metric_release_id":path.name,"observation_date":observation,
                        "location_id":key[0],"product_id":key[1],"horizon_days":horizon,"cohort":cohort,
                        "outcome_complete":complete,"valid_outcome_days":valid_days,"prediction_available":available,
                        "predicted_event":forecast,"observed_new_event":observed,"first_observed_onset":first,
                        "predicted_onset":predicted,"result":result,
                        "warning_lead_days":(first-observation).days if first and result=="true_positive" and predicted<=first else None,
                        "onset_error_days":(predicted-first).days if first and forecast else None,
                        "later_new_order":new_order,"later_order_revision":revised,
                        "initial_forecast_velocity_band":velocity_bands[key]})
                    if cohort=="new_event_eligible" and complete:
                        for onset in occurred:
                            opportunities.setdefault((key,onset,horizon),[]).append((observation,forecast and predicted<=onset,forecast))
        event_rows=[]
        for key,dates in sorted(events.items()):
            for onset in dates:
                if earliest is None or onset<=earliest:
                    continue
                for horizon in HORIZONS:
                    chances=opportunities.get((key,onset,horizon),[])
                    warnings=[(onset-day).days for day,hit,_ in chances if hit]
                    advance=[(onset-day).days for day,_,flag in chances if flag]
                    event_rows.append({"event_id":_hash([*key,onset.isoformat()]),"location_id":key[0],"product_id":key[1],
                        "onset_date":onset,"horizon_days":horizon,"opportunities":len(chances),"detected":bool(warnings),
                        "warning_lead_days":max(warnings) if warnings else None,
                        "advance_warning":bool(advance),"advance_warning_lead_days":max(advance) if advance else None,
                        "seven_day_warning":bool(advance and max(advance)>=7),
                        "seven_day_opportunities":sum((onset-day).days>=7 for day,_,_ in chances),
                        "initial_forecast_velocity_band":velocity_bands.get(key,"unknown")})
    pairs=pa.Table.from_pylist(output,schema=PAIR_SCHEMA)
    event_table=pa.Table.from_pylist(event_rows,schema=EVENT_SCHEMA)
    summaries={}
    for horizon in HORIZONS:
        rows=[r for r in output if r["horizon_days"]==horizon]
        counts=Counter(r["result"] for r in rows)
        tp,fp,fn=counts["true_positive"],counts["false_positive"],counts["false_negative"]+counts["unassessed_event"]
        eligible=[e for e in event_rows if e["horizon_days"]==horizon and e["opportunities"]>0]
        warnings=sorted(e["warning_lead_days"] for e in eligible if e["detected"])
        n=len(warnings)
        errors=[abs(r["onset_error_days"]) for r in rows if r["result"]=="true_positive"]
        median=(warnings[(n-1)//2]+warnings[n//2])/2 if n else None
        summaries[str(horizon)]={"pair_horizon_results":dict(sorted(counts.items())),
            "pair_horizon_recall":tp/(tp+fn) if tp+fn else None,
            "prediction_yield":tp/(tp+fp) if tp+fp else None,
            "false_predictions_per_1000_evaluable_pairs":1000*fp/sum(r["cohort"]=="new_event_eligible" and r["outcome_complete"] for r in rows) if any(r["cohort"]=="new_event_eligible" and r["outcome_complete"] for r in rows) else None,
            "unique_episodes_with_warning_opportunity":len(eligible),
            "unique_episodes_detected":sum(e["detected"] for e in eligible),
            "unique_episode_recall":sum(e["detected"] for e in eligible)/len(eligible) if eligible else None,
            "episodes_without_warning_opportunity":sum(e["opportunities"]==0 for e in event_rows if e["horizon_days"]==horizon),
            "median_warning_lead_days":median,"warning_lead_days":warnings}
        summaries[str(horizon)]["mean_absolute_onset_error_days"]=sum(errors)/len(errors) if errors else None
        summary=summaries[str(horizon)]
        summary["advance_warning_episode_recall"]=sum(e["advance_warning"] for e in eligible)/len(eligible) if eligible else None
        summary["seven_day_warning_episode_recall"]=sum(e["seven_day_warning"] for e in eligible)/len(eligible) if eligible else None
        seven_eligible=[e for e in eligible if e["seven_day_opportunities"]>0]
        summary["episodes_with_seven_day_opportunity"]=len(seven_eligible)
        summary["seven_day_opportunity_conditioned_recall"]=sum(e["seven_day_warning"] for e in seven_eligible)/len(seven_eligible) if seven_eligible else None
        signed=[r["onset_error_days"] for r in rows if r["result"]=="true_positive"]
        summary["mean_signed_onset_error_days"]=sum(signed)/len(signed) if signed else None
        summary["onset_within_three_days_fraction"]=sum(abs(x)<=3 for x in signed)/len(signed) if signed else None
        strata={}
        for label in ("no_observed_supply_change","later_new_order","later_order_revision","new_and_revised"):
            group=[r for r in rows if r["cohort"]=="new_event_eligible" and r["outcome_complete"] and
                ("new_and_revised" if r["later_new_order"] and r["later_order_revision"] else
                 "later_new_order" if r["later_new_order"] else "later_order_revision" if r["later_order_revision"] else "no_observed_supply_change")==label]
            strata[label]=dict(Counter(r["result"] for r in group))
        summary["observable_supply_change_strata"]=strata
        by_velocity={}
        for band in sorted({r["initial_forecast_velocity_band"] for r in rows}):
            group=[r for r in rows if r["initial_forecast_velocity_band"]==band]
            episode_group=[e for e in eligible if e["initial_forecast_velocity_band"]==band]
            by_velocity[band]={"pair_results":dict(Counter(r["result"] for r in group)),
                "eligible_episodes":len(episode_group),
                "advance_warning_episode_recall":sum(e["advance_warning"] for e in episode_group)/len(episode_group) if episode_group else None}
        summary["initial_forecast_velocity_strata"]=by_velocity
    return pairs,event_table,summaries


def replay(series: Path, *, data_root: Path, config: MetricConfig, repeat_publication: bool = True) -> Path:
    """Publish all cutoffs without changing either current pointer, then evaluate."""
    value=json.loads(series.read_text())
    entries=value.get("releases",[])
    if not entries or len({e["as_of"] for e in entries})!=len(entries):
        raise ValueError("unique temporal cutoffs required")
    dates=[datetime.fromisoformat(e["as_of"].replace("Z","+00:00")) for e in entries]
    if any((b-a)!=timedelta(days=7) for a,b in zip(dates,dates[1:])):
        raise ValueError("ordered weekly temporal cutoffs required")
    if any(e.get("role") not in {"scoring","outcome_only"} for e in entries):
        raise ValueError("invalid temporal release role")
    source_identity=value.get("release_series_id")
    # Verify all source descriptors before starting canonical publication.
    resolved=[series_entry(series,e["as_of"]) for e in entries]
    pointers={p:p.read_bytes() if p.exists() else None for p in
              (data_root/"signals/current.json",data_root/"metrics/current.json")}
    published=[]; scoring=[]; snapshots=[]; transitions=[]; prior_checks=set(); prior_risks=set()
    for index,(entry,(source,distribution)) in enumerate(zip(entries,resolved)):
        canonical=ingest(source,data_root=data_root,classification="synthetic")
        path=publish_metrics(canonical,distribution,data_root=data_root,config=config,activate=False)
        if repeat_publication:
            again=publish_metrics(canonical,distribution,data_root=data_root,config=config,activate=False)
            if again!=path:
                raise ValueError("identical cutoff metric republication changed bytes")
        snapshots.append(verify_snapshot(path))
        if published:
            verify_pair(published[-1],path)
        with duckdb.connect() as con:
            current_checks=set(con.execute("SELECT location_id,product_id,check_code FROM read_parquet(?)",[str(path/"checks.parquet")]).fetchall())
            current_risks=set(con.execute("SELECT location_id,product_id FROM read_parquet(?) WHERE current_state='positive_reported_inventory' AND base_depletion_date IS NOT NULL",[str(path/"supply_assessment.parquet")]).fetchall())
        transitions.append({"metric_release_id":path.name,"as_of":entry["as_of"],"checks":len(current_checks),
                            "appeared":dict(sorted(Counter(r[2] for r in current_checks-prior_checks).items())),
                            "cleared":dict(sorted(Counter(r[2] for r in prior_checks-current_checks).items())),
                            "projected_risk_active":len(current_risks),"projected_risk_appeared":len(current_risks-prior_risks),
                            "projected_risk_cleared":len(prior_risks-current_risks)})
        prior_checks=current_checks
        prior_risks=current_risks
        published.append(path)
        if entry["role"]=="scoring": scoring.append(path)
        print(f"Verified backend cutoff {index+1}/{len(entries)}: {entry['as_of']}",flush=True)
    if not scoring:
        raise ValueError("at least one scoring cutoff required")
    pairs,events,summary=evaluate_observable(scoring,published[-1],evidence_releases=published)
    for pointer,before in pointers.items():
        if (pointer.read_bytes() if pointer.exists() else None)!=before:
            raise ValueError("replay changed a current product pointer")
    root=data_root.resolve()/"metric_evaluations"
    root.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".staging-",dir=root) as temp:
        stage=Path(temp)
        files=[]
        for name,table in (("pair_horizon",pairs),("episode_evaluation",events)):
            target=stage/(name+".parquet")
            pq.write_table(table,target,compression="zstd")
            files.append({"path":target.name,"bytes":target.stat().st_size,"sha256":sha256_file(target),"rows":table.num_rows})
        report={"version":EVALUATION_VERSION,"source_series_id":source_identity,"source_series_sha256":sha256_file(series),
            "evaluation_source_sha256":sha256_file(Path(__file__)),
            "configuration":config.document(),"releases":[p.name for p in published],"scoring_releases":[p.name for p in scoring],
            "invariants":snapshots,"adjacent_cutoff_invariants_passed":len(published)-1,
            "identical_republication_verified":repeat_publication,"current_pointers_unchanged":True,
            "check_transitions":transitions,"scores":summary,"files":files,
            "limitations":["Reported zero on hand is not on-shelf availability or causal realized lost demand.",
                           "Already-zero pairs are excluded from new-event prediction scores and reported separately.",
                           "Incomplete outcome inventory is unknown, not a negative outcome.",
                           "Prediction yield describes the published firm-supply forecast, not a ranked alert policy.",
                           "Legacy unique_episode_recall is conservative-date recall, not advance-warning coverage; separate advance and seven-day recall are reported.",
                           "Supply-change strata use later observable snapshots only and do not establish causal prevention; intermediate revisions may be absent.",
                           "Velocity strata are frozen from the first assessment's observable forecast rate, not private source design labels.",
                           "Only a 28-day horizon is scored; no 90-day production prevention claim.",
                           "No source-private labels or latent outcomes enter metrics or evaluation."]}
        identity="eval_"+_hash(report);report["evaluation_id"]=identity
        (stage/"manifest.json").write_bytes(canonical_json(report))
        target=root/identity
        if target.exists():
            old=json.loads(member(target,"manifest.json").read_text())
            if old!=report: raise ValueError("immutable metric evaluation conflict")
            for file in files: verified_file(target,file)
        else:
            os.replace(stage,target)
        return target


def main() -> int:
    parser=argparse.ArgumentParser(description="Replay observable metric cutoffs without ranking, private truth or pointer activation.")
    parser.add_argument("series",type=Path)
    parser.add_argument("--data-root",type=Path,default=Path("data"))
    parser.add_argument("--tier-baseline-end",type=date.fromisoformat,required=True)
    parser.add_argument("--skip-repeat",action="store_true",help="Exploration only; acceptance requires repeat checks.")
    parser.add_argument("--demand-model",choices=["retailer_baseline","historical_adjusted"],default="retailer_baseline")
    parser.add_argument("--excess-cover-days",type=int,default=40)
    parser.add_argument("--annual-carrying-cost-rate",type=float,default=None)
    args=parser.parse_args()
    print(replay(args.series,data_root=args.data_root,config=MetricConfig(args.tier_baseline_end,demand_model=args.demand_model,
        excess_cover_days=args.excess_cover_days,annual_carrying_cost_rate=args.annual_carrying_cost_rate),repeat_publication=not args.skip_repeat))
    return 0


if __name__=="__main__":
    raise SystemExit(main())
