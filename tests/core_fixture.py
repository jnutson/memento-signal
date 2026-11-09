"""Eight fictional products exercise a variable catalog through the real pipeline."""
from datetime import UTC, date, datetime
import pyarrow as pa
import pyarrow.parquet as pq

from memento.metric_publication import publish_metrics
from tests.metric_fixture import refresh_manifest, distribution_source
from tests.test_metric_backend_v2 import supply_fixture
from tests.test_planned_supply import planned_source


def core_fixture(root, products=8, complete_sales=False):
    canonical, source, config = supply_fixture(root)
    for file in sorted(canonical.rglob("*.parquet")):
        table = pq.read_table(file)
        if "product_id" not in table.column_names:
            continue
        original_rows = table.to_pylist()
        if complete_sales and file.parent.name == "sales_daily":
            original_rows.append({"business_date":date(2026,11,27),"location_id":"loc_2", "product_id":"prd_100", "sales_quantity":1,"sales_amount":10.0})
        rows = []
        for i in range(products):
            for original in original_rows:
                row = dict(original)
                row["product_id"] = f"prd_{100+i}"
                if "source_product_id" in row:
                    row["source_product_id"] = str(100+i)
                if "company_item_id" in row:
                    row["company_item_id"] = f"GAME-{100+i}"
                if "product_name" in row:
                    row["product_name"] = f"Test game {i+1}"
                rows.append(row)
        pq.write_table(pa.Table.from_pylist(rows, schema=table.schema),file)
    refresh_manifest(canonical)
    table = pq.read_table(source.path)
    rows = [{**r,"wm_item_nbr":100+i} for i in range(products) for r in table.to_pylist()]
    pq.write_table(pa.Table.from_pylist(rows,schema=table.schema),source.path)
    source = distribution_source(source.path)
    coverage = [{"store_nbr":s,"wm_item_nbr":100+i,"known_at":datetime(2026,11,28,12,tzinfo=UTC),
                 "planned_orders_available":True,"reason":"available"} for i in range(products) for s in range(1,5)]
    source = planned_source(root,source,coverage=coverage)
    return publish_metrics(canonical,source,data_root=root,config=config,activate=True)
