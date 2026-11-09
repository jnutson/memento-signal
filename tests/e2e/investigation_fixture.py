"""Minimized synthetic canonical fixture exercising all four investigation paths."""
import json
from pathlib import Path

import duckdb

from memento.manifest import sha256_file


def build_canonical(root: Path) -> Path:
    canonical = root / "canonical" / "mds_investigation_fixture"
    canonical.mkdir(parents=True)
    products = "(VALUES ('availability'),('acceleration'),('deceleration'),('excess')) p(kind)"
    dates = "range(DATE '2026-11-21',DATE '2027-01-30',INTERVAL 1 DAY) t(d)"
    queries = {
        "calendar_day": "SELECT d::DATE calendar_date,(202647+floor(date_diff('day',DATE '2026-11-21',d)/7))::INTEGER retail_year_week,isodow(d)::INTEGER calendar_weekday_number FROM range(DATE '2026-11-21',DATE '2027-03-06',INTERVAL 1 DAY) t(d)",
        "location": "SELECT 'loc_test'::VARCHAR location_id,'10'::VARCHAR source_location_id,'Demo Store'::VARCHAR location_name,'O'::VARCHAR source_status_code",
        "product": f"SELECT 'prd_'||kind product_id,'BRAND_A'::VARCHAR brand_name,'ACTIVE'::VARCHAR source_status_code,DATE '2026-01-01' effective_date,true replenishment_enabled,'Toys' source_fineline_name FROM {products}",
        "sales_daily": f"SELECT d::DATE business_date,'loc_test' location_id,'prd_'||kind product_id,CASE WHEN d BETWEEN DATE '2027-01-09' AND DATE '2027-01-22' AND kind='acceleration' THEN 2 WHEN d BETWEEN DATE '2027-01-09' AND DATE '2027-01-22' AND kind='deceleration' THEN 0 ELSE 1 END::BIGINT sales_quantity,10.00::DECIMAL(20,2) sales_amount FROM {products} CROSS JOIN {dates}",
        "inventory_daily": f"SELECT d::DATE business_date,'loc_test' location_id,'prd_'||kind product_id,CASE WHEN kind='availability' AND d=DATE '2027-01-29' THEN 2 ELSE 100 END::BIGINT on_hand_quantity,CASE WHEN kind='availability' AND d=DATE '2027-01-29' THEN 10 ELSE 0 END::BIGINT on_order_quantity,0::BIGINT in_transit_quantity,0::BIGINT receipt_quantity,true assorted,true replenishment_enabled,10.00::DECIMAL(20,2) current_unit_retail_amount FROM {products} CROSS JOIN {dates}",
        "demand_forecast_weekly": f"SELECT least(202646+i,202656)::INTEGER forecast_created_retail_year_week,(202647+i)::INTEGER target_retail_year_week,'loc_test' location_id,'prd_'||kind product_id,7::DECIMAL(20,6) forecast_quantity FROM {products} CROSS JOIN range(15) t(i)",
        "company_item": f"SELECT 'MIRO_TOYS' company_id,'MIRO-'||kind company_item_id,CASE WHEN kind='availability' THEN 'Demo Item' ELSE 'Demo '||kind END company_item_name,'MIRO_SPARK' display_brand_id,'prd_'||kind product_id,'0' source_company_id,kind source_product_id,DATE '2026-01-01' effective_from,NULL::DATE effective_to FROM {products}",
        "reaction_constraint": "SELECT 'MIRO_TOYS' company_id,'brand' item_scope_type_code,'MIRO_SPARK' item_scope_id,10::INTEGER minimum_reaction_days,DATE '2026-01-01' effective_from,NULL::DATE effective_to",
        "company_item_economics": f"SELECT 'MIRO_TOYS' company_id,'MIRO-'||kind company_item_id,'USD' currency_code,4.00::DECIMAL(20,2) unit_cost_amount,DATE '2026-01-01' effective_from,NULL::DATE effective_to FROM {products}",
        "replenishment_commitment": "SELECT 'test-order' retailer_order_id,1::INTEGER order_line_number,1::INTEGER event_version,'loc_test' location_id,'prd_availability' product_id,10::BIGINT ordered_quantity,0::BIGINT invoiced_quantity,0::BIGINT received_quantity,TIMESTAMPTZ '2027-01-28 12:00:00+00' order_created_at,NULL::TIMESTAMPTZ approved_to_ship_at,NULL::TIMESTAMPTZ dc_invoiced_at,DATE '2027-02-04' expected_store_receipt_date,NULL::TIMESTAMPTZ actual_store_receipt_at,'open' status_code,TIMESTAMPTZ '2027-01-28 12:00:00+00' known_at",
    }
    files = []
    with duckdb.connect() as con:
        for table, query in queries.items():
            folder = canonical / table
            folder.mkdir()
            path = folder / "part-00000.parquet"
            con.execute(f"COPY ({query}) TO ? (FORMAT PARQUET, COMPRESSION ZSTD)",[str(path)])
            files.append({"path":str(path.relative_to(canonical)),"bytes":path.stat().st_size,"sha256":sha256_file(path),"rows":con.execute(f"SELECT count(*) FROM ({query})").fetchone()[0]})
    (canonical / "manifest.json").write_text(json.dumps({"dataset_id":canonical.name,"source_classification":"synthetic","as_of":"2027-01-30T12:00:00Z","source_release_set_id":"437b6da3ad31abe0-20270130T120000Z","source_release_ids":["fixture"],"source_manifests":{},"files":files}))
    return canonical


def build_model(root: Path) -> Path:
    stages={name:[1,2,3] for name in ("decision","production","vendor_fulfillment","vendor_to_customer_dc","customer_dc_processing","customer_dc_to_store","store_receiving")}
    value={"version":"investigation-fixture-supply-v1","classification":"synthetic_assumption","effective_from":"2026-01-01","effective_to":"2028-01-01","calendar":"elapsed_calendar_days","calibration":"engineering_only","provenance":{"basis":"Minimized test fixture, not operational estimates"},"stages":stages,"category_production":{"Toys":"production"},"routes":{"synthetic_domestic":["factory","vendor_dc","customer_dc","store"]},"actions":{"expedite_existing_shipment":{"stages":["customer_dc_to_store","store_receiving"],"prerequisites":["existing_in_transit","authority"]},"incremental_production":{"stages":["decision","$production","vendor_to_customer_dc","customer_dc_processing","customer_dc_to_store","store_receiving"],"prerequisites":["capacity"]}},"planning_policy":{"reorder_cover_days":10,"target_cover_days":32,"minimum_lost_units":1}}
    path=root/"supply_model.json";path.write_text(json.dumps(value));return path
