"""Pinned, synthetic-only Signal reader for MCP; separate from customer metric serving."""
from __future__ import annotations

import json
import re
from datetime import timedelta
from pathlib import Path, PurePosixPath

from .manifest import sha256_file
from .query import serving_connection
from .security import SecurityPolicy

SIGNAL_ID = re.compile(r"^sig_[0-9a-f]{64}$")
SIGNAL_SET_ID = re.compile(r"^mss_[0-9a-f]{64}$")

class CanonicalStore:
    def __init__(self, signals_root: Path, canonical_root: Path | None = None, *, policy: SecurityPolicy | None = None):
        self.policy = policy
        self.root = signals_root.resolve(strict=True)
        candidate = canonical_root if canonical_root is not None else self.root.parent / "canonical"
        self.canonical_root = candidate.resolve()

    @staticmethod
    def _safe_member(root: Path, reference: object) -> Path:
        if not isinstance(reference, str):
            raise ValueError("invalid manifest path")
        pure = PurePosixPath(reference)
        if pure.is_absolute() or "\\" in reference or any(part in {"", ".", ".."} for part in reference.split("/")):
            raise ValueError("unsafe manifest path")
        candidate = root
        for part in pure.parts:
            candidate = candidate / part
            if candidate.is_symlink():
                raise ValueError("unsafe manifest path")
        path = candidate.resolve(strict=True)
        path.relative_to(root)
        return path

    @staticmethod
    def _validate_files(root: Path, manifest: dict[str, object]) -> None:
        files = manifest.get("files")
        if not isinstance(files, list):
            raise ValueError("invalid file inventory")
        for item in files:
            if not isinstance(item, dict):
                raise ValueError("invalid file inventory")
            file = CanonicalStore._safe_member(root, item.get("path"))
            if (
                not file.is_file()
                or file.is_symlink()
                or file.stat().st_size != item.get("bytes")
                or sha256_file(file) != item.get("sha256")
            ):
                raise ValueError("release integrity failure")

    def canonical_release(self, signal_manifest: dict[str, object]) -> tuple[Path, dict[str, object]]:
        dataset_id = signal_manifest.get("canonical_dataset_id")
        if not isinstance(dataset_id, str) or not re.fullmatch(r"mds_[a-zA-Z0-9_]+", dataset_id):
            raise ValueError("invalid canonical dataset identity")
        manifest_path = self._safe_member(self.canonical_root, dataset_id + "/manifest.json")
        release = manifest_path.parent
        if not manifest_path.is_file() or manifest_path.is_symlink():
            raise ValueError("canonical manifest missing or unsafe")
        manifest = (self.policy.approved_manifest(self.root.parent, manifest_path) if self.policy
                    else json.loads(manifest_path.read_text(encoding="utf-8")))
        if not isinstance(manifest, dict) or manifest.get("dataset_id") != dataset_id:
            raise ValueError("canonical dataset identity mismatch")
        self._validate_files(release, manifest)
        return release, manifest

    def _table_files(self, release: Path, manifest: dict[str, object], table: str) -> list[str]:
        prefix = f"{table}/"
        entries = manifest.get("files", [])
        if not isinstance(entries,list):
            raise ValueError("invalid canonical file inventory")
        files = [
            str(self._safe_member(release, item.get("path")))
            for item in entries
            if isinstance(item, dict) and isinstance(item.get("path"), str) and item["path"].startswith(prefix)
        ]
        if not files:
            raise ValueError(f"canonical {table} dataset missing")
        return files

class SignalStore:
    """Read-only boundary over immutable unified signal releases."""

    def __init__(self, signals_root: Path, canonical_root: Path, signal_set_id: str | None = None, *, policy: SecurityPolicy | None = None):
        self.policy = policy
        self.root = signals_root.resolve(strict=True)
        self.canonical_root = canonical_root.resolve(strict=True)
        if signal_set_id is not None and not SIGNAL_SET_ID.fullmatch(signal_set_id):
            raise ValueError("invalid signal set identity")
        self.signal_set_id = signal_set_id
        self._release: tuple[Path, dict[str, object]] | None = None
        self._canonical: tuple[Path, dict[str, object]] | None = None

    def current_release(self) -> tuple[Path, dict[str, object]]:
        if self._release is not None:
            return self._release
        pointer = ({"signal_set_id": self.signal_set_id, "manifest": f"{self.signal_set_id}/manifest.json"}
                   if self.signal_set_id else json.loads((self.root / "current.json").read_text(encoding="utf-8")))
        if not isinstance(pointer, dict):
            raise ValueError("invalid signal pointer")
        manifest_path = CanonicalStore._safe_member(self.root, pointer.get("manifest"))
        manifest = (self.policy.approved_manifest(self.root.parent, manifest_path) if self.policy
                    else json.loads(manifest_path.read_text(encoding="utf-8")))
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
        CanonicalStore._validate_files(manifest_path.parent, manifest)
        self._release = manifest_path.parent, manifest
        return self._release

    def run(self) -> dict[str, object]:
        return self.current_release()[1]

    def top_signals(self, signal_type: str | None = None, direction: str | None = None) -> list[dict[str, object]]:
        if signal_type is not None and signal_type not in {"availability", "demand_momentum", "inventory_imbalance"}:
            raise ValueError("invalid signal type")
        if direction is not None and (signal_type != "demand_momentum" or direction not in {"acceleration", "deceleration"}):
            raise ValueError("invalid signal direction filter")
        release, _ = self.current_release()
        predicate = "WHERE signal_type=?" if signal_type else "WHERE is_overall_top_10"
        params: list[object] = [str(release / "signal.parquet")]
        if signal_type:
            params.append(signal_type)
        if direction:
            predicate += " AND signal_direction=?"
            params.append(direction)
        with serving_connection(self.root, self.canonical_root) as con:
            return con.execute(f"SELECT * FROM read_parquet(?) {predicate} ORDER BY overall_rank_position LIMIT 10", params).to_arrow_table().to_pylist()

    def category_count(self, signal_type: str, direction: str | None = None) -> int:
        release, _ = self.current_release()
        with serving_connection(self.root, self.canonical_root) as con:
            row = con.execute("SELECT count(*) FROM read_parquet(?) WHERE signal_type=? AND (? IS NULL OR signal_direction=?)",
                              [str(release / "signal.parquet"), signal_type, direction, direction]).fetchone()
        assert row is not None
        return int(row[0])

    def canonical_release(self) -> tuple[Path, dict[str, object]]:
        if self._canonical is None:
            manifest = self.run()
            helper = CanonicalStore(self.root, self.canonical_root, policy=self.policy)
            canonical, canonical_manifest = helper.canonical_release(manifest)
            if (canonical_manifest.get("source_release_set_id") != manifest.get("source_release_set_id")
                    or canonical_manifest.get("source_manifests") != manifest.get("source_manifest_hashes")):
                raise ValueError("canonical source binding mismatch")
            if canonical_manifest.get("source_classification") != "synthetic":
                raise ValueError("MCP demo requires synthetic inputs")
            self._canonical = canonical, canonical_manifest
        return self._canonical

    def report_scope(self) -> dict[str, object]:
        canonical, canonical_manifest = self.canonical_release()
        classification = canonical_manifest.get("source_classification")
        if self.policy:
            if classification != self.policy.classification:
                raise ValueError("publication classification mismatch")
        elif classification != "synthetic":
            raise ValueError("demo requires declared synthetic inputs")
        helper = CanonicalStore(self.root, self.canonical_root, policy=self.policy)
        with serving_connection(self.root, self.canonical_root) as con:
            row = con.execute("SELECT min(business_date),max(business_date),count(DISTINCT product_id),count(DISTINCT location_id) FROM read_parquet(?)",
                              [helper._table_files(canonical, canonical_manifest, "sales_daily")]).fetchone()
        if row is None or row[0] is None or row[1] is None:
            raise ValueError("demo cohort is empty")
        return {"classification": classification, "observed_from": row[0], "observed_through": row[1],
                "item_count": row[2], "store_count": row[3],
                "horizon_from": row[1] + timedelta(days=1),
                "horizon_through": row[1] + timedelta(days=28)}

    def signal(self, signal_id: str) -> dict[str, object] | None:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise ValueError("invalid signal identity")
        release, _ = self.current_release()
        with serving_connection(self.root, self.canonical_root) as con:
            rows = con.execute("SELECT * FROM read_parquet(?) WHERE signal_id=?", [str(release / "signal.parquet"), signal_id]).to_arrow_table().to_pylist()
        return rows[0] if rows else None

    def evidence(self, signal_id: str) -> list[dict[str, object]]:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise ValueError("invalid signal identity")
        release, _ = self.current_release()
        with serving_connection(self.root, self.canonical_root) as con:
            return con.execute("SELECT * FROM read_parquet(?) WHERE signal_id=? ORDER BY evidence_date,evidence_type,path", [str(release / "signal_evidence.parquet"), signal_id]).to_arrow_table().to_pylist()

    def supply_context(self, signal_id: str) -> dict | None:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise ValueError("invalid signal identity")
        release, manifest = self.current_release()
        configuration = manifest.get("configuration", {})
        if not isinstance(configuration,dict):
            raise ValueError("invalid signal configuration")
        if not configuration.get("supply_projection_version"):
            return None
        with serving_connection(self.root, self.canonical_root) as connection:
            rows = connection.execute("SELECT context FROM read_parquet(?) WHERE signal_id=?", [str(release / "supply_context.parquet"),signal_id]).fetchall()
        if len(rows) != 1:
            raise ValueError("exactly one supply context per signal required")
        return json.loads(rows[0][0])

    def display_identities(self, signals: list[dict[str, object]]) -> dict[str, dict[str, str]]:
        canonical, canonical_manifest = self.canonical_release()
        helper = CanonicalStore(self.root, self.canonical_root, policy=self.policy)
        company_files = helper._table_files(canonical, canonical_manifest, "company_item")
        location_files = helper._table_files(canonical, canonical_manifest, "location")
        result = {}
        with serving_connection(self.root, self.canonical_root) as con:
            for signal in signals:
                item = con.execute(
                    """SELECT company_item_name,company_item_id,source_product_id FROM read_parquet(?)
                       WHERE product_id=? AND company_id=? AND effective_from<=?
                         AND (effective_to IS NULL OR effective_to>=?) LIMIT 1""",
                    [company_files, signal["product_id"], signal["company_id"], signal["observation_date"], signal["observation_date"]],
                ).fetchone()
                location = con.execute(
                    "SELECT location_name,source_location_id FROM read_parquet(?) WHERE location_id=? LIMIT 1",
                    [location_files, signal["store_id"]],
                ).fetchone()
                if item is None or location is None:
                    raise ValueError("signal display identity missing")
                result[str(signal["signal_id"])] = {
                    "item_name": item[0], "company_item_id": item[1], "source_product_id": item[2],
                    "store_name": location[0], "source_location_id": location[1],
                }
        return result
