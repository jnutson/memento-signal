"""Freeze the original connected UI's real API using only its synthetic fixture."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from memento.api import create_app
from tests.test_metric_backend_v2 import supply_fixture, rewrite_table
from tests.test_planned_supply import planned_source, publish


def build_bundle() -> dict:
    with tempfile.TemporaryDirectory(prefix="memento-original-demo-") as temp:
        root = Path(temp).resolve()
        canonical, source, config = supply_fixture(root)
        rewrite_table(canonical, "sales_daily", """SELECT * REPLACE(
            CASE WHEN location_id='loc_1' AND business_date>=DATE '2026-10-31' THEN 2 ELSE 1 END::BIGINT AS sales_quantity,
            10.0*CASE WHEN location_id='loc_1' AND business_date>=DATE '2026-10-31' THEN 2 ELSE 1 END AS sales_amount) FROM original""")
        rewrite_table(canonical, "inventory_daily", "SELECT * REPLACE(CASE WHEN location_id='loc_1' THEN 150 ELSE on_hand_quantity END AS on_hand_quantity) FROM original")
        rewrite_table(canonical, "company_item", "SELECT *, 'MIRO_TOYS' company_id FROM original")
        rewrite_table(canonical, "company_item_economics", """SELECT 'MIRO_TOYS' company_id,'GAME-100' company_item_id,
            4.0 unit_cost_amount,DATE '2026-08-01' effective_from,NULL::DATE effective_to""")
        release = publish(root, canonical, planned_source(root, source), config).name
        client = TestClient(create_app(root))
        def read(kind: str, **filters):
            r = client.get('/v1/metrics/' + kind, params={'release_id':release, **filters})
            if r.status_code != 200:
                raise ValueError('Synthetic demo API export failed: ' + kind)
            return r.json()
        def rows(kind: str, **filters):
            result = []
            offset = 0
            while True:
                page = read(kind, limit=200, offset=offset, **filters)
                result.extend(page['rows'])
                if len(result) == page['total']:
                    return result
                if not page['rows']:
                    raise ValueError('Incomplete synthetic export')
                offset += len(page['rows'])
        # Only expose the metadata consumed by the existing client, never source paths.
        metadata = read('metadata')
        allowed = ['metric_release_id','contract_version','observation_date','population','states','formulas','limitations','configuration','items','periods','check_counts','capabilities','files']
        metadata = {k:metadata[k] for k in allowed if k in metadata}
        tables = {'findings':rows('findings'), 'finding-evidence':rows('finding-evidence')}
        for grain in ('item','store','region','tier'):
            tables['distribution:'+grain] = rows('distribution', grain=grain)
            for period in ('week','month'):
                tables[f'periods:{grain}:{period}'] = rows('periods',grain=grain,period_kind=period)
        special = {'attention-values':read('attention-values'), 'exposure-summary':read('exposure-summary')}
        for item in metadata['items']:
            special['display-series:'+item['product_id']] = read('display-series',product_id=item['product_id'])
        for finding in tables['findings']:
            identity = finding['finding_id']
            special['display-series:'+finding['product_id']+':'+identity] = read('display-series',product_id=finding['product_id'],finding_id=identity)
            special['review-context:'+identity] = read('review-context',finding_id=identity)
            if any(row['finding_id']==identity for row in special['attention-values']['rows']):
                special['attention-values:'+identity] = read('attention-values',finding_id=identity)
        if {f['promise'] for f in tables['findings']} != {'availability','excess','expansion'}:
            raise ValueError('Demo must expose all three outcomes')
        return {'demo_id':'demo-1','classification':'synthetic','metadata':metadata,'tables':tables,'special':special}


if __name__ == '__main__':
    bundle = build_bundle()
    target = Path(__file__).resolve().parents[1]/'web/.demo/original.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(bundle,sort_keys=True,separators=(',',':')))
    print(json.dumps({'release':bundle['metadata']['metric_release_id'],'findings':len(bundle['tables']['findings']),'bytes':target.stat().st_size}))
