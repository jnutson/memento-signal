"""Serve a minimized, entirely synthetic v5 publication for browser verification."""
from __future__ import annotations

import tempfile
from pathlib import Path

import uvicorn

from memento.api import create_app
from tests.test_metric_backend_v2 import supply_fixture, rewrite_table
from tests.test_planned_supply import planned_source, publish


def main():
    with tempfile.TemporaryDirectory(prefix="memento-connected-e2e-") as directory:
        root = Path(directory).resolve()
        canonical, source, config = supply_fixture(root)
        rewrite_table(canonical, "sales_daily", """SELECT * REPLACE(
            CASE WHEN location_id='loc_1' AND business_date>=DATE '2026-10-31' THEN 2 ELSE 1 END::BIGINT AS sales_quantity,
            10.0*CASE WHEN location_id='loc_1' AND business_date>=DATE '2026-10-31' THEN 2 ELSE 1 END AS sales_amount) FROM original""")
        rewrite_table(canonical, "inventory_daily", """SELECT * REPLACE(
            CASE WHEN location_id='loc_1' THEN 150 ELSE on_hand_quantity END AS on_hand_quantity) FROM original""")
        rewrite_table(canonical, "company_item", "SELECT *, 'MIRO_TOYS' company_id FROM original")
        rewrite_table(canonical, "company_item_economics", """SELECT 'MIRO_TOYS' company_id,'GAME-100' company_item_id,
            4.0 unit_cost_amount,DATE '2026-08-01' effective_from,NULL::DATE effective_to""")
        release=publish(root, canonical, planned_source(root, source), config)
        gap_root=root / "gap-fixture"
        gap_canonical,gap_source,gap_config=supply_fixture(gap_root)
        gap_release=publish(root,gap_canonical,planned_source(gap_root,gap_source,plans=[]),gap_config)
        # The test reads the immutable ID from this test-only endpoint. No current pointer.
        app = create_app(root)
        @app.get("/test-release")
        def test_release():
            return {"release": release.name, "gap_release":gap_release.name}
        uvicorn.run(app, host="127.0.0.1", port=8111, log_level="warning")


if __name__ == "__main__":
    main()
