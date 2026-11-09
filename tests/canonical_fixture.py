from __future__ import annotations

import hashlib
import json
from pathlib import Path

import duckdb


def canonical_fixture(root: Path) -> Path:
    """Create the minimized canonical dataset shared by signal tests."""
    canonical = root / "canonical"
    canonical.mkdir()
    con = duckdb.connect()
    start = "2026-12-05"
    end = "2027-02-26"
    history_end = "2027-01-29"
    queries = {
        "calendar_day": f"""SELECT d::DATE calendar_date,(202649+floor(date_diff('day',DATE '{start}',d)/7))::INTEGER retail_year_week,isodow(d)::INTEGER calendar_weekday_number FROM range(DATE '{start}',DATE '{end}'+1,INTERVAL 1 DAY) t(d)""",
        "location": """SELECT 'loc_test'::VARCHAR location_id,'10'::VARCHAR source_location_id,'Synthetic Store 10'::VARCHAR location_name,'O'::VARCHAR source_status_code""",
        "product": """SELECT 'prd_test'::VARCHAR product_id,'BRAND_A'::VARCHAR brand_name,'ACTIVE'::VARCHAR source_status_code,DATE '2026-01-01' effective_date,true::BOOLEAN replenishment_enabled""",
        "sales_daily": f"""SELECT d::DATE business_date,'loc_test'::VARCHAR location_id,'prd_test'::VARCHAR product_id,1::BIGINT sales_quantity,10.00::DECIMAL(20,2) sales_amount FROM range(DATE '{start}',DATE '{history_end}'+1,INTERVAL 1 DAY) t(d)""",
        "inventory_daily": f"""SELECT d::DATE business_date,'loc_test'::VARCHAR location_id,'prd_test'::VARCHAR product_id,CASE WHEN d=DATE '{history_end}' THEN 2 ELSE 100 END::BIGINT on_hand_quantity,0::BIGINT on_order_quantity,0::BIGINT in_transit_quantity,0::BIGINT receipt_quantity,true::BOOLEAN assorted,true::BOOLEAN replenishment_enabled,10.00::DECIMAL(20,2) current_unit_retail_amount FROM range(DATE '{start}',DATE '{history_end}'+1,INTERVAL 1 DAY) t(d)""",
        "demand_forecast_weekly": f"""SELECT DISTINCT (202648+floor(date_diff('day',DATE '{start}',d)/7))::INTEGER forecast_created_retail_year_week,(202649+floor(date_diff('day',DATE '{start}',d)/7))::INTEGER target_retail_year_week,'loc_test'::VARCHAR location_id,'prd_test'::VARCHAR product_id,7.0::DECIMAL(20,6) forecast_quantity FROM range(DATE '{start}',DATE '{end}'+1,INTERVAL 7 DAY) t(d)""",
        "company_item": """SELECT 'MIRO_TOYS'::VARCHAR company_id,'MIRO-SPARK-001'::VARCHAR company_item_id,'Miro Spark One'::VARCHAR company_item_name,'MIRO_SPARK'::VARCHAR display_brand_id,'prd_test'::VARCHAR product_id,'0'::VARCHAR source_company_id,'100'::VARCHAR source_product_id,DATE '2026-01-01' effective_from,NULL::DATE effective_to""",
        "replenishment_commitment": """SELECT * FROM (SELECT NULL::VARCHAR retailer_order_id,NULL::INTEGER order_line_number,NULL::INTEGER event_version,NULL::VARCHAR location_id,NULL::VARCHAR product_id,NULL::BIGINT ordered_quantity,NULL::BIGINT invoiced_quantity,NULL::BIGINT received_quantity,NULL::TIMESTAMPTZ order_created_at,NULL::TIMESTAMPTZ approved_to_ship_at,NULL::TIMESTAMPTZ dc_invoiced_at,NULL::DATE expected_store_receipt_date,NULL::TIMESTAMPTZ actual_store_receipt_at,NULL::VARCHAR status_code,NULL::TIMESTAMPTZ known_at) WHERE false""",
        "reaction_constraint": """SELECT 'MIRO_TOYS'::VARCHAR company_id,'brand'::VARCHAR item_scope_type_code,'MIRO_SPARK'::VARCHAR item_scope_id,10::INTEGER minimum_reaction_days,DATE '2026-01-01' effective_from,NULL::DATE effective_to""",
        "company_item_economics": """SELECT 'MIRO_TOYS'::VARCHAR company_id,'MIRO-SPARK-001'::VARCHAR company_item_id,'USD'::VARCHAR currency_code,4.00::DECIMAL(20,2) unit_cost_amount,DATE '2026-01-01' effective_from,NULL::DATE effective_to""",
    }
    files = []
    for table, query in queries.items():
        folder = canonical / table
        folder.mkdir()
        path = folder / "part-00000.parquet"
        con.execute(f"COPY ({query}) TO '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        files.append({"path": str(path.relative_to(canonical)), "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "rows": con.execute(f"SELECT count(*) FROM ({query})").fetchone()[0]})
    manifest = {"source_classification": "synthetic", "dataset_id": "mds_fixture", "as_of": "2027-01-30T12:00:00Z", "source_release_set_id": "fixture-release-set", "source_release_set_manifest_sha256": "c" * 64, "source_release_ids": ["fixture-walmart", "fixture-extension"], "source_manifests": {"walmart_sha256": "a" * 64, "extension_sha256": "b" * 64}, "files": files}
    (canonical / "manifest.json").write_text(json.dumps(manifest, sort_keys=True, separators=(",", ":")))
    return canonical
