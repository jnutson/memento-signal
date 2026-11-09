from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath

import duckdb

from .manifest import sha256_file


SIGNAL_ID = re.compile(r"^sig_[0-9a-f]{64}$")


def safe_member(root: Path, reference: object) -> Path:
    """Resolve one declared relative manifest member without path traversal."""
    if not isinstance(reference, str):
        raise ValueError("invalid manifest path")
    pure = PurePosixPath(reference)
    if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError("unsafe manifest path")
    path = root.joinpath(*pure.parts).resolve(strict=True)
    path.relative_to(root)
    return path


def validate_release_files(root: Path, manifest: dict[str, object]) -> None:
    """Validate the size and hash of every file declared by a release manifest."""
    files = manifest.get("files")
    if not isinstance(files, list):
        raise ValueError("invalid file inventory")
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("invalid file inventory")
        file = safe_member(root, item.get("path"))
        if (
            not file.is_file()
            or file.is_symlink()
            or file.stat().st_size != item.get("bytes")
            or sha256_file(file) != item.get("sha256")
        ):
            raise ValueError("release integrity failure")


class SignalStore:
    """Read-only boundary over immutable unified signal releases."""

    def __init__(self, signals_root: Path, canonical_root: Path):
        self.root = signals_root.resolve(strict=True)
        self.canonical_root = canonical_root.resolve(strict=True)

    def current_release(self) -> tuple[Path, dict[str, object]]:
        pointer = json.loads((self.root / "current.json").read_text(encoding="utf-8"))
        if not isinstance(pointer, dict):
            raise ValueError("invalid signal pointer")
        manifest_path = safe_member(self.root, pointer.get("manifest"))
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("invalid signal manifest")
        if manifest.get("signal_set_id") != pointer.get("signal_set_id"):
            raise ValueError("signal pointer identity mismatch")
        files = manifest.get("files")
        expected_files = {"signal.parquet", "signal_evidence.parquet"}
        if manifest.get("configuration", {}).get("supply_projection_version"):
            expected_files.add("supply_context.parquet")
        if not isinstance(files, list) or {item.get("path") for item in files if isinstance(item, dict)} != expected_files:
            raise ValueError("invalid signal file inventory")
        validate_release_files(manifest_path.parent, manifest)
        return manifest_path.parent, manifest

    def run(self) -> dict[str, object]:
        return self.current_release()[1]

    def top_signals(self, signal_type: str | None = None) -> list[dict[str, object]]:
        if signal_type is not None and signal_type not in {"availability", "demand_momentum", "inventory_imbalance"}:
            raise ValueError("invalid signal type")
        release, _ = self.current_release()
        predicate = "WHERE is_overall_top_10" + (" AND signal_type=?" if signal_type else "")
        params: list[object] = [str(release / "signal.parquet")]
        if signal_type: params.append(signal_type)
        return duckdb.connect().execute(f"SELECT * FROM read_parquet(?) {predicate} ORDER BY overall_rank_position", params).to_arrow_table().to_pylist()

    def signal(self, signal_id: str) -> dict[str, object] | None:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise ValueError("invalid signal identity")
        release, _ = self.current_release()
        rows = duckdb.connect().execute("SELECT * FROM read_parquet(?) WHERE signal_id=? AND is_overall_top_10", [str(release / "signal.parquet"), signal_id]).to_arrow_table().to_pylist()
        return rows[0] if rows else None

    def evidence(self, signal_id: str) -> list[dict[str, object]]:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise ValueError("invalid signal identity")
        release, _ = self.current_release()
        return duckdb.connect().execute("SELECT * FROM read_parquet(?) WHERE signal_id=? ORDER BY evidence_date,evidence_type,path", [str(release / "signal_evidence.parquet"), signal_id]).to_arrow_table().to_pylist()

    def supply_context(self, signal_id: str) -> dict | None:
        release, manifest = self.current_release()
        configuration = manifest.get("configuration", {})
        if not isinstance(configuration,dict):
            raise ValueError("invalid signal configuration")
        if not configuration.get("supply_projection_version"):
            return None
        with duckdb.connect() as connection:
            rows = connection.execute("SELECT context FROM read_parquet(?) WHERE signal_id=?", [str(release / "supply_context.parquet"),signal_id]).fetchall()
        if len(rows) != 1:
            raise ValueError("exactly one supply context per signal required")
        return json.loads(rows[0][0])

    def display_identities(self, signals: list[dict[str, object]]) -> dict[str, dict[str, str]]:
        _, manifest = self.current_release()
        dataset_id = manifest.get("canonical_dataset_id")
        canonical = (self.canonical_root / str(dataset_id)).resolve(strict=True)
        canonical.relative_to(self.canonical_root)
        canonical_manifest = json.loads((canonical / "manifest.json").read_text())
        validate_release_files(canonical, canonical_manifest)
        con = duckdb.connect()
        result = {}
        for signal in signals:
            item = con.execute("SELECT company_item_name,company_item_id,source_product_id FROM read_parquet(?) WHERE product_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) LIMIT 1", [str(canonical / "company_item" / "*.parquet"), signal["product_id"], signal["observation_date"], signal["observation_date"]]).fetchone()
            location = con.execute("SELECT location_name,source_location_id FROM read_parquet(?) WHERE location_id=? LIMIT 1", [str(canonical / "location" / "*.parquet"), signal["store_id"]]).fetchone()
            if item is None or location is None:
                raise ValueError("signal display identity missing")
            result[str(signal["signal_id"])] = {"item_name": item[0], "company_item_id": item[1], "source_product_id": item[2], "store_name": location[0], "source_location_id": location[1]}
        return result
