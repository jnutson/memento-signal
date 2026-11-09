"""UI-W01..04 preserve source arithmetic, missingness and scope across the UI port."""
from fastapi.testclient import TestClient
import pytest

from memento.api import create_app
from memento.manifest import sha256_file
from tests.core_fixture import core_fixture
from tests.test_descriptive_metrics import read


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    root = tmp_path_factory.mktemp("core-ui")
    release = core_fixture(root)
    return root, release, TestClient(create_app(root))


def test_common_week_variable_catalog_partial_coverage_and_no_demo_dates(world):
    root,release,client = world
    before = sha256_file(release/"manifest.json")
    result = client.get("/v1/metrics/workspace-summary",params={"release_id":release.name})
    assert result.status_code == 200
    value = result.json()
    assert value["metric_release_id"] == release.name
    assert len(value["products"]) == 8 and value["store_count"] == 4
    assert value["observation_date"] == "2026-11-27"
    assert value["week_start"] == "2026-11-21" and value["week_end"] == "2026-11-27"
    assert not value["current"]["complete"] and value["units_change_pct"] is None
    assert all(p["unit_share_pct"] is None for p in value["products"])
    source = read(release,"metric_period","grain='item' AND period_kind='week' AND period_end=DATE '2026-11-27'")
    assert value["current"]["units"] == pytest.approx(sum(p["units"] for p in source))
    assert value["current"]["retail_sales"] == pytest.approx(sum(p["dollars"] for p in source))
    assert value["products"][0]["current"]["units_store_week"] == source[0]["units_store_week"]
    assert not value["capabilities"]["demand_components"] and not value["capabilities"]["promotion_analysis"]
    assert not value["capabilities"]["store_map"]
    assert "unit_cost" not in result.text and str(root) not in result.text
    assert sha256_file(release/"manifest.json") == before


def test_region_projection_reconciles_to_existing_daily_paths_and_economics(world):
    _,release,client = world
    value = client.get("/v1/metrics/product-view",params={"release_id":release.name,"product_id":"prd_100","region":"East"}).json()
    assert value["inventory"] == {"stores":2,"known_stores":2,"on_hand":10,"zero_stores":1}
    assert len(value["projections"]) == 56
    for basis,file in (("firm","supply_projection"),("conditional","expected_supply_projection")):
        expected = read(release,file,"product_id='prd_100' AND location_id IN ('loc_1','loc_2') AND path='base'")
        actual = [r for r in value["projections"] if r["basis"]==basis]
        assert all(r["ready_stores"]==2 for r in actual)
        assert sum(r["demand_units"] for r in actual) == pytest.approx(sum(r["demand_units"] for r in expected))
        assert sum(r["inbound_units"] for r in actual) == pytest.approx(sum(r["inbound_units"] for r in expected))
        assert actual[-1]["cumulative_unmet_units"] == pytest.approx(sum(r["unfulfilled_units"] for r in expected))
        economics = next(r for r in value["economics"] if r["basis"]==basis)
        assert actual[-1]["cumulative_retail_exposure"] == pytest.approx(economics["retail_exposure"])
    current = value["sales_weeks"][-1]
    source = read(release,"metric_period","grain='region' AND scope_id='East' AND product_id='prd_100' AND period_kind='week' AND period_end=DATE '2026-11-27'")[0]
    assert current["units"] == source["units"] and current["units_store_week"] == source["units_store_week"]


def test_missing_projection_never_becomes_zero_or_a_complete_total(world):
    _,release,client = world
    value = client.get("/v1/metrics/product-view",params={"release_id":release.name,"product_id":"prd_100"}).json()
    assert value["inventory"]["known_stores"] == 3 and value["inventory"]["on_hand"] is None
    assert all(r["ending_units"] is None and r["cumulative_retail_exposure"] is None for r in value["projections"])
    assert all(r["retail_exposure"] is None for r in value["economics"])


def test_finding_scope_is_exact_and_does_not_change_published_findings(world):
    _,release,client = world
    f = read(release,"finding","product_id='prd_100' AND finding_code='conditional_plan_dependency'")[0]
    params={"release_id":release.name,"product_id":"prd_100","finding_id":f["finding_id"]}
    response = client.get("/v1/metrics/product-view",params=params)
    assert response.status_code == 200
    assert response.json()["inventory"]["stores"] == f["affected_store_count"]
    assert client.get("/v1/metrics/product-view",params={**params,"product_id":"prd_101"}).status_code==404
    assert client.get("/v1/metrics/product-view",params={**params,"region":"West"}).status_code==404
    assert read(release,"finding","finding_id='"+f["finding_id"]+"'")[0] == f


def test_queries_pin_validate_and_fail_closed(world):
    _,release,client = world
    params={"release_id":release.name,"product_id":"prd_100"}
    assert client.get("/v1/metrics/product-view",params={"product_id":"prd_100"}).status_code==422
    assert client.get("/v1/metrics/product-view",params={**params,"product_id":"missing"}).status_code==404
    assert client.get("/v1/metrics/product-view",params={**params,"region":"missing"}).status_code==404
    assert client.get("/v1/metrics/product-view",params={**params,"release_id":"../bad"}).status_code==422
    assert client.get("/v1/metrics/workspace-summary",params={"release_id":"met_"+"f"*64}).status_code==503
    assert client.post("/v1/metrics/product-view",json=params).status_code==405
    assert client.get("/v1/metrics/workspace-summary").json()["metric_release_id"]==release.name


def test_corrupt_publication_is_rejected(tmp_path):
    release=core_fixture(tmp_path,products=1)
    with (release/"metric_period.parquet").open("ab") as stream: stream.write(b"corrupt")
    client=TestClient(create_app(tmp_path))
    assert client.get("/v1/metrics/workspace-summary").status_code==503
    assert client.get("/v1/metrics/product-view",params={"release_id":release.name,"product_id":"prd_100"}).status_code==503


def test_complete_sales_enable_growth_and_shares_without_changing_velocity(tmp_path):
    release=core_fixture(tmp_path,products=2,complete_sales=True)
    value=TestClient(create_app(tmp_path)).get("/v1/metrics/workspace-summary").json()
    assert value["current"]["complete"] and value["prior"]["complete"]
    assert value["current"]["units"]==84 and value["units_change_pct"]==0
    assert [r["unit_share_pct"] for r in value["products"]]==[50,50]
    assert [r["current"]["units_store_week"] for r in value["products"]]==[10.5,10.5]
    assert value["metric_release_id"]==release.name


def test_store_visibility_is_paged_scoped_searchable_and_allowlisted(world):
    _,release,client=world
    params={"release_id":release.name,"product_id":"prd_100","region":"East","limit":1}
    first=client.get("/v1/metrics/workspace-stores",params=params).json()
    second=client.get("/v1/metrics/workspace-stores",params={**params,"offset":1}).json()
    assert first["total"]==second["total"]==2
    assert first["rows"][0]["location_id"]!=second["rows"][0]["location_id"]
    search=client.get("/v1/metrics/workspace-stores",params={**params,"search":"store 2"}).json()
    assert search["total"]==1 and search["rows"][0]["on_hand"]==0
    assert set(search["rows"][0])=={"location_id","source_location_id","location_name","region","on_hand","current_state"}
    assert client.get("/v1/metrics/workspace-stores",params={**params,"search":"' OR true --"}).json()["total"]==0
    assert client.get("/v1/metrics/workspace-stores",params={**params,"limit":1000}).status_code==422
