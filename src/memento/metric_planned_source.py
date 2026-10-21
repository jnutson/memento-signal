"""Strict adapter for the synthetic retailer order-forecast sidecar, not firm POs."""
from __future__ import annotations

from datetime import datetime
import re

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from .metric_source import PlannedOrderSource, verified_file

CONTRACT = "synthetic-order-demand-forecast-v1"
PLAN_SCHEMA = pa.schema([
    ("plan_id", pa.string()), ("plan_version", pa.int32()),
    ("issued_at", pa.timestamp("us", tz="UTC")), ("known_at", pa.timestamp("us", tz="UTC")),
    ("geo_region_cd", pa.string()), ("op_cmpny_cd", pa.int32()),
    ("store_nbr", pa.int32()), ("wm_item_nbr", pa.int64()),
    ("destination_role", pa.string()), ("fcst_seq_nbr", pa.int32()),
    ("sugg_order_dt", pa.date32()), ("order_place_dt", pa.date32()),
    ("sched_arvl_dt", pa.date32()), ("order_each_qty", pa.int32()),
    ("converted_qty", pa.int32()), ("remaining_planned_qty", pa.int32()),
    ("withdrawn_qty", pa.int32()), ("status", pa.string()), ("basis", pa.string()),
])
CONVERSION_SCHEMA = pa.schema([
    ("plan_id", pa.string()), ("retailer_order_id", pa.string()),
    ("order_line_nbr", pa.int32()), ("allocated_qty", pa.int32()),
    ("known_at", pa.timestamp("us", tz="UTC")), ("basis", pa.string()),
])
COVERAGE_SCHEMA = pa.schema([
    ("store_nbr", pa.int32()), ("wm_item_nbr", pa.int64()),
    ("known_at", pa.timestamp("us", tz="UTC")),
    ("planned_orders_available", pa.bool_()), ("reason", pa.string()),
])
SCHEMAS = {"plans": PLAN_SCHEMA, "conversions": CONVERSION_SCHEMA, "coverage": COVERAGE_SCHEMA}
PLAN_BASIS = "synthetic_retailer_plan_from_issue_time_forecast_and_inventory"
LINK_BASIS = "synthetic_fifo_same_pair_not_retailer_linkage"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def verify_descriptor(source: PlannedOrderSource, cutoff: str, release_hash: str) -> dict:
    require(source.root.is_absolute() and source.root.absolute() == source.root.resolve(strict=True),
            "explicit non-symlink planned-order root required")
    value = source.descriptor
    require(isinstance(value, dict) and set(value) == {
        "contract", "classification", "as_of", "release_set_sha256", "availability", *SCHEMAS},
        "invalid planned-order descriptor")
    require(value["contract"] == CONTRACT and value["classification"] == "synthetic"
            and value["as_of"] == cutoff and value["release_set_sha256"] == release_hash
            and value["availability"] in {"available", "partial"}, "planned-order release binding mismatch")
    result = {}
    for name, schema in SCHEMAS.items():
        meta = value[name]
        require(isinstance(meta, dict) and set(meta) == {"path", "sha256", "bytes", "rows"},
                "invalid planned-order file descriptor")
        require(type(meta["rows"]) is int and 0 <= meta["rows"] <= 2_000_000
                and type(meta["bytes"]) is int and 0 < meta["bytes"] <= 256 * 1024**2
                and isinstance(meta["sha256"], str) and re.fullmatch(r"[a-f0-9]{64}", meta["sha256"]) is not None,
                "invalid planned-order file bounds")
        path = verified_file(source.root, meta)
        parquet = pq.ParquetFile(path)
        require(parquet.schema_arrow.equals(schema) and parquet.metadata.num_rows == meta["rows"],
                "planned-order schema or row count mismatch")
        require(sum(parquet.metadata.row_group(i).total_byte_size for i in range(parquet.metadata.num_row_groups)) <= 512 * 1024**2,
                "planned-order uncompressed size exceeds demo boundary")
        result[name] = path
    require(len(set(result.values())) == 3, "planned-order files must be distinct")
    return result


def load_planned(source: PlannedOrderSource | None, manifest: dict, con: duckdb.DuckDBPyConnection) -> dict | None:
    if source is None:
        return None
    require(manifest.get("source_classification", "synthetic") == "synthetic",
            "synthetic planned feed cannot be attached to non-synthetic canonical data")
    files = verify_descriptor(source, manifest["as_of"], manifest["source_release_set_manifest_sha256"])
    cutoff = datetime.fromisoformat(manifest["as_of"].replace("Z", "+00:00"))
    require(cutoff.tzinfo is not None, "planned-order cutoff must be timezone aware")
    for name, path in files.items():
        table = pq.ParquetFile(path).read()
        require(all(column.null_count == 0 for column in table.columns), "null planned-order input")
        con.register("raw_planned_" + name, table)

    def bad(sql: str, params: list | None = None) -> bool:
        return bool(con.execute(sql, params or []).fetchall()[0][0])

    require(not bad("""SELECT count(*) FROM raw_planned_plans WHERE
        NOT regexp_full_match(plan_id,'PLAN-[a-f0-9]{32}') OR plan_version<1 OR fcst_seq_nbr<1
        OR store_nbr<1 OR wm_item_nbr<1 OR geo_region_cd<>'US' OR op_cmpny_cd<>0
        OR destination_role<>'store' OR issued_at>known_at OR known_at>?
        OR sugg_order_dt<>issued_at::DATE OR order_place_dt<sugg_order_dt OR sched_arvl_dt<order_place_dt
        OR order_each_qty<0 OR converted_qty<0 OR remaining_planned_qty<0 OR withdrawn_qty<0
        OR order_each_qty::BIGINT<>converted_qty::BIGINT+remaining_planned_qty::BIGINT+withdrawn_qty::BIGINT
        OR basis<>? OR status NOT IN ('planned','partially_placed','placed','withdrawn','placement_overdue')
        OR (status='planned' AND (remaining_planned_qty<=0 OR converted_qty<>0 OR withdrawn_qty<>0))
        OR (status='partially_placed' AND (converted_qty<=0 OR remaining_planned_qty<=0 OR withdrawn_qty<>0))
        OR (status='placed' AND (remaining_planned_qty<>0 OR withdrawn_qty<>0 OR converted_qty<=0))
        OR (status='withdrawn' AND (remaining_planned_qty<>0 OR withdrawn_qty<=0))
        OR (status='placement_overdue' AND (remaining_planned_qty<=0 OR order_place_dt>=?::DATE))""",
        [cutoff, PLAN_BASIS, cutoff]), "invalid planned-order identity, quantity, status or chronology")
    require(not bad("SELECT count(*) FROM (SELECT plan_id FROM raw_planned_plans GROUP BY ALL HAVING count(*)<>1)"),
            "duplicate current plan identity")
    require(not bad("""SELECT count(*) FROM (SELECT store_nbr,wm_item_nbr,sugg_order_dt,fcst_seq_nbr
        FROM raw_planned_plans GROUP BY ALL HAVING count(*)<>1)"""), "duplicate planned-order sequence grain")
    require(not bad("""SELECT count(*) FROM raw_planned_coverage WHERE store_nbr<1 OR wm_item_nbr<1 OR known_at>?
        OR (planned_orders_available AND reason<>'available')
        OR (NOT planned_orders_available AND reason<>'synthetic_extract_gap')""", [cutoff]),
        "invalid planned-order coverage")
    require(not bad("SELECT count(*) FROM (SELECT store_nbr,wm_item_nbr FROM raw_planned_coverage GROUP BY ALL HAVING count(*)<>1)"),
            "duplicate planned-order coverage")
    partial = bad("SELECT count(*) FROM raw_planned_coverage WHERE NOT planned_orders_available")
    require(source.descriptor["availability"] == ("partial" if partial else "available"),
            "planned-order coverage binding mismatch")
    require(not bad("""SELECT count(*) FROM raw_planned_plans p LEFT JOIN raw_planned_coverage c
        USING(store_nbr,wm_item_nbr) WHERE c.store_nbr IS NULL OR NOT c.planned_orders_available"""),
        "plan without available coverage")
    require(not bad("""SELECT count(*) FROM raw_planned_coverage s WHERE
        (SELECT count(*) FROM location l WHERE l.source_location_id=s.store_nbr::VARCHAR)<>1
        OR (SELECT count(*) FROM product p WHERE p.source_product_id=s.wm_item_nbr::VARCHAR)<>1"""),
        "unresolved or ambiguous planned-order identity")
    for name in ("plans", "coverage"):
        mapped = con.execute(f"""SELECT l.location_id,p.product_id,s.* EXCLUDE(store_nbr,wm_item_nbr)
            FROM raw_planned_{name} s JOIN location l ON l.source_location_id=s.store_nbr::VARCHAR
            JOIN product p ON p.source_product_id=s.wm_item_nbr::VARCHAR""").to_arrow_table()
        count = con.execute(f"SELECT count(*) FROM raw_planned_{name}").fetchall()[0][0]
        require(mapped.num_rows == count, "unresolved or ambiguous planned-order identity")
        con.register("planned_input_" + name, mapped)
    require(not bad("""WITH a AS (SELECT location_id,product_id FROM current_store),
        b AS (SELECT location_id,product_id FROM planned_input_coverage)
        SELECT (SELECT count(*) FROM (SELECT * FROM a EXCEPT ALL SELECT * FROM b))+
               (SELECT count(*) FROM (SELECT * FROM b EXCEPT ALL SELECT * FROM a))"""),
        "planned-order coverage must match the complete assessment population")
    require(not bad("""SELECT count(*) FROM raw_planned_conversions WHERE allocated_qty<=0 OR order_line_nbr<1
        OR retailer_order_id='' OR known_at>? OR basis<>?""", [cutoff, LINK_BASIS]), "invalid plan conversion")
    require(not bad("""SELECT count(*) FROM (SELECT plan_id,retailer_order_id,order_line_nbr
        FROM raw_planned_conversions GROUP BY ALL HAVING count(*)<>1)"""), "duplicate plan conversion")
    require(not bad("""SELECT count(*) FROM raw_planned_conversions c LEFT JOIN planned_input_plans p USING(plan_id)
        WHERE p.plan_id IS NULL OR c.known_at<p.issued_at OR c.known_at>p.known_at"""), "unresolved or inconsistent plan conversion")
    require(not bad("""SELECT count(*) FROM planned_input_plans p LEFT JOIN
        (SELECT plan_id,sum(allocated_qty)::BIGINT qty FROM raw_planned_conversions GROUP BY ALL) c USING(plan_id)
        WHERE p.converted_qty<>coalesce(c.qty,0)"""), "plan converted quantity does not reconcile")
    if "replenishment_commitment" not in {r[0] for r in con.execute("SHOW TABLES").fetchall()}:
        require(not bad("SELECT count(*) FROM raw_planned_conversions"), "firm PO evidence required for conversion")
    else:
        con.execute("""CREATE TEMP VIEW planned_latest_po AS SELECT * FROM replenishment_commitment WHERE known_at<=
            (SELECT as_of FROM supply_assessment LIMIT 1)
            QUALIFY row_number() OVER(PARTITION BY retailer_order_id,order_line_number ORDER BY event_version DESC)=1""")
        require(not bad("""SELECT count(*) FROM raw_planned_conversions c JOIN planned_input_plans p USING(plan_id)
            LEFT JOIN planned_latest_po o ON c.retailer_order_id=o.retailer_order_id AND c.order_line_nbr=o.order_line_number
            WHERE o.retailer_order_id IS NULL OR p.location_id<>o.location_id OR p.product_id<>o.product_id
              OR o.order_created_at<p.issued_at OR o.order_created_at>c.known_at"""),
            "conversion lacks matching observable firm PO evidence")
        require(not bad("""SELECT count(*) FROM raw_planned_conversions c JOIN
            (SELECT retailer_order_id,order_line_number,min(known_at) first_known FROM replenishment_commitment
             GROUP BY ALL) o ON c.retailer_order_id=o.retailer_order_id AND c.order_line_nbr=o.order_line_number
            WHERE o.first_known>c.known_at"""), "conversion precedes observable PO knowledge")
        require(not bad("""SELECT count(*) FROM (SELECT c.retailer_order_id,c.order_line_nbr,sum(c.allocated_qty)::BIGINT qty,
            max(o.ordered_quantity) ordered FROM raw_planned_conversions c JOIN planned_latest_po o
            ON c.retailer_order_id=o.retailer_order_id AND c.order_line_nbr=o.order_line_number
            GROUP BY ALL HAVING qty>ordered)"""), "converted allocation exceeds firm PO quantity")
    conversions = con.execute("""SELECT p.location_id,p.product_id,c.* FROM raw_planned_conversions c
        JOIN planned_input_plans p USING(plan_id)""").to_arrow_table()
    con.register("planned_input_conversions", conversions)
    return {"contract": CONTRACT, "availability": source.descriptor["availability"],
            "as_of": manifest["as_of"], "release_set_sha256": manifest["source_release_set_manifest_sha256"],
            "classification": "synthetic", "files": {name: {k: v for k, v in source.descriptor[name].items() if k != "path"}
                                                      for name in SCHEMAS}}
