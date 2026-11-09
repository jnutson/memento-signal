from __future__ import annotations

from datetime import date
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from memento.manifest import canonical_json, sha256_file
from memento.metric_contract import MetricConfig
from memento.metric_source import DistributionSource, PROMISE_SCHEMA


def metric_fixture(root: Path):
    canonical = root / "canonical" / "mds_metric_fixture"
    canonical.mkdir(parents=True)
    queries = {
        "location": """SELECT 'loc_'||s location_id,s::VARCHAR source_location_id,'Store '||s location_name,
            'O' source_status_code,CASE WHEN s<3 THEN 'East' ELSE 'West' END source_region_name FROM range(1,5) t(s)""",
        "product": """SELECT 'prd_100' product_id,'100' source_product_id,'Test game' product_name,
            'ACTIVE' source_status_code,DATE '2026-08-01' effective_date""",
        "company_item": """SELECT 'prd_100' product_id,'GAME-100' company_item_id,DATE '2026-08-01' effective_from,NULL::DATE effective_to""",
        "sales_daily": """SELECT d::DATE business_date,'loc_'||s location_id,'prd_100' product_id,
            CASE WHEN s=3 THEN 0 WHEN s=1 AND d>=DATE '2026-11-14' THEN 4 ELSE 1 END::BIGINT sales_quantity,
            10*sales_quantity::DOUBLE sales_amount
            FROM range(DATE '2026-08-01',DATE '2026-11-28',INTERVAL 1 DAY) t(d) CROSS JOIN range(1,5) u(s)
            WHERE NOT(s=2 AND d=DATE '2026-11-27')""",
        "inventory_daily": """SELECT d::DATE business_date,'loc_'||s location_id,'prd_100' product_id,
            CASE WHEN s IN (2,3) THEN 0 ELSE 10 END::BIGINT on_hand_quantity,true assorted,true replenishment_enabled
            FROM range(DATE '2026-08-01',DATE '2026-11-28',INTERVAL 1 DAY) t(d) CROSS JOIN range(1,5) u(s)
            WHERE NOT(s=4 AND d=DATE '2026-11-27')""",
    }
    with duckdb.connect() as con:
        for name, query in queries.items():
            path = canonical / name / "part-00000.parquet"
            path.parent.mkdir()
            con.sql(query).write_parquet(str(path))
    refresh_manifest(canonical)
    path = root / "distribution.parquet"
    rows = [{"store_nbr": s, "wm_item_nbr": 100, "effective_from": "2026-08-01", "effective_to": None,
             "stocking_due_date": "2026-09-25" if s==3 else "2026-08-01", "minimum_on_hand_units": 1,
             "known_at": "2026-08-01T00:00:00Z"} for s in range(1,5)]
    pq.write_table(pa.Table.from_pylist(rows, schema=PROMISE_SCHEMA), path)
    return canonical, distribution_source(path), MetricConfig(date(2026,9,25))


def refresh_manifest(canonical):
    files = [{"path": str(p.relative_to(canonical)), "bytes": p.stat().st_size, "sha256": sha256_file(p)}
             for p in sorted(canonical.rglob("*.parquet"))]
    manifest = {"source_classification": "synthetic", "dataset_id": "mds_metric_fixture", "as_of": "2026-11-28T12:00:00Z",
                "source_release_set_manifest_sha256": "a"*64, "files": files}
    (canonical / "manifest.json").write_bytes(canonical_json(manifest))


def distribution_source(path):
    return DistributionSource(path.resolve(), sha256_file(path), path.stat().st_size,
                              "2026-11-28T12:00:00Z", "a"*64)
