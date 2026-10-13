import json
import hashlib
from pathlib import Path

import duckdb
import pytest

from memento.models import IngestionFailure
from memento.orchestrator import ingest


TABLES = {"calendar_day", "location", "product", "sales_daily", "inventory_daily", "demand_forecast_weekly", "company_item", "replenishment_commitment", "reaction_constraint", "company_item_economics"}


def test_slice_model_reference_is_validated_and_preserved(release_set_manifest: Path, tmp_path: Path):
    from test_supply import model_data
    root=release_set_manifest.parents[2]
    model=root/"supply.json"; model.write_text(json.dumps(model_data()))
    digest=hashlib.sha256(model.read_bytes()).hexdigest()
    value=json.loads(release_set_manifest.read_text())
    value.update(slice={"version":"unchanged-retail-slice-v1","parent_manifest_sha256":"a"*64,"stores":[10],"items":[100],"core_start":"2026-01-31","core_end":"2026-02-07","model_sha256":digest},supply_model={"path":"supply.json","sha256":digest})
    release_set_manifest.write_text(json.dumps(value))
    output=ingest(release_set_manifest,data_root=tmp_path/"data",classification="synthetic")
    assert json.loads((output/"manifest.json").read_text())["supply_model"]["sha256"]==digest
    model.write_text('{}')
    with pytest.raises(IngestionFailure) as failure:
        ingest(release_set_manifest,data_root=tmp_path/"other-data",classification="synthetic")
    assert any(row.rule_id=="SET_SUPPLY_MODEL" and row.severity=="FAIL" for row in failure.value.results)


def test_slice_metadata_rejects_unknown_payload_fields(release_set_manifest: Path, tmp_path: Path):
    value=json.loads(release_set_manifest.read_text()); value["slice"]={"unexpected":"synthetic fixture"}
    release_set_manifest.write_text(json.dumps(value))
    with pytest.raises(IngestionFailure) as failure:
        ingest(release_set_manifest,data_root=tmp_path/"data",classification="synthetic")
    assert any(row.rule_id=="SET_SLICE_PROFILE" for row in failure.value.results)


def test_release_set_publishes_ten_atomic_canonical_tables(release_set_manifest: Path, tmp_path: Path):
    output = ingest(release_set_manifest, data_root=tmp_path / "data", classification="synthetic")
    manifest = json.loads((output / "manifest.json").read_text())
    assert set(manifest["dataset_mapping"].values()) == TABLES
    assert manifest["source_release_set_manifest_sha256"]
    assert set(manifest["source_manifests"]) == {"walmart_sha256", "extension_sha256"}
    con = duckdb.connect()
    for table in TABLES:
        assert con.execute("SELECT count(*) FROM read_parquet(?)", [str(output / table / "*.parquet")]).fetchone()[0] > 0
    before = (output / "manifest.json").read_bytes()
    assert ingest(release_set_manifest, data_root=tmp_path / "data", classification="synthetic") == output
    assert (output / "manifest.json").read_bytes() == before


def test_release_set_rejects_overlapping_item_economics(release_set_manifest: Path, tmp_path: Path):
    release_root = release_set_manifest.parents[2]
    extension_root = release_root / "packages" / "extension"
    economics = extension_root / "company_item_economics" / "part-00000.parquet"
    replacement = economics.with_name("replacement.parquet")
    con = duckdb.connect()
    source_sql = str(economics).replace("'", "''")
    replacement_sql = str(replacement).replace("'", "''")
    con.execute(f"""COPY (
      SELECT * FROM read_parquet('{source_sql}')
      UNION ALL
      SELECT 'MIRO_TOYS'::VARCHAR,'MIRO-SPARK-001'::VARCHAR,'USD'::VARCHAR,
             1.30::DECIMAL(20,2),DATE '2026-01-01',NULL::DATE
    ) TO '{replacement_sql}' (FORMAT PARQUET, COMPRESSION ZSTD)""")
    replacement.replace(economics)

    digest = hashlib.sha256(economics.read_bytes()).hexdigest()
    tree = hashlib.sha256()
    tree.update(economics.relative_to(economics.parent).as_posix().encode())
    tree.update(bytes.fromhex(digest))
    extension_manifest_path = extension_root / "manifest.json"
    extension_manifest = json.loads(extension_manifest_path.read_text())
    dataset = next(item for item in extension_manifest["datasets"] if item["dataset_name"] == "company_item_economics")
    dataset.update(row_count=2, sha256=tree.hexdigest())
    extension_manifest_path.write_text(json.dumps(extension_manifest, sort_keys=True, separators=(",", ":")))

    release_set = json.loads(release_set_manifest.read_text())
    release_set["extension_manifest_sha256"] = hashlib.sha256(extension_manifest_path.read_bytes()).hexdigest()
    release_set_manifest.write_text(json.dumps(release_set, sort_keys=True, separators=(",", ":")))

    with pytest.raises(IngestionFailure) as failure:
        ingest(release_set_manifest, data_root=tmp_path / "data", classification="synthetic")
    assert "EXT_ECONOMICS_OVERLAP" in {result.rule_id for result in failure.value.results if result.severity == "FAIL"}
