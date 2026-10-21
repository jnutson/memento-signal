"""Validate observable distribution sidecars without changing core ingestion schemas."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import hashlib
import json
from pathlib import Path, PurePosixPath

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from .manifest import canonical_json, sha256_file


def member(root: Path, reference: object) -> Path:
    if not isinstance(reference, str) or "\\" in reference:
        raise ValueError("invalid metric manifest member")
    pure = PurePosixPath(reference)
    if not pure.parts or pure.is_absolute() or ".." in pure.parts or str(pure) != reference:
        raise ValueError("unsafe metric manifest member")
    path = root.joinpath(*pure.parts)
    if path.absolute() != path.resolve(strict=True) or not path.is_file():
        raise ValueError("metric member must be a regular non-symlink file")
    path.resolve().relative_to(root.resolve())
    return path


def verified_file(root: Path, entry: dict) -> Path:
    path = member(root, entry.get("path"))
    if path.stat().st_size != entry.get("bytes") or sha256_file(path) != entry.get("sha256"):
        raise ValueError("metric input integrity failure")
    return path


@dataclass(frozen=True)
class PlannedOrderSource:
    root: Path
    descriptor: dict


@dataclass(frozen=True)
class DistributionSource:
    path: Path
    sha256: str
    bytes: int
    as_of: str
    release_set_sha256: str
    planned_orders: PlannedOrderSource | None = None


def series_entry(path: Path, cutoff: str) -> tuple[Path, DistributionSource]:
    if not path.is_absolute() or path.absolute() != path.resolve(strict=True):
        raise ValueError("explicit non-symlink series path required")
    value = json.loads(path.read_text())
    identity = value.pop("release_series_id")
    if value.get("classification") != "synthetic" or value.get("schema_version") != "temporal-release-series-v1":
        raise ValueError("unsupported metric source series")
    if hashlib.sha256(canonical_json(value)).hexdigest() != identity or path.parent.name != identity:
        raise ValueError("source series identity mismatch")
    entries = [x for x in value["releases"] if x["as_of"] == cutoff]
    if len(entries) != 1:
        raise ValueError("exactly one requested cutoff required")
    entry = entries[0]
    root = path.parents[2]
    release = member(root, entry["manifest"])
    if sha256_file(release) != entry["sha256"]:
        raise ValueError("source release integrity failure")
    descriptor = entry["distribution"]
    distribution = verified_file(root, descriptor)
    planned = None
    if "planned_orders" in entry:
        from .metric_planned_source import verify_descriptor
        planned = PlannedOrderSource(root, entry["planned_orders"])
        verify_descriptor(planned, cutoff, entry["sha256"])
    return release, DistributionSource(distribution, descriptor["sha256"], descriptor["bytes"], cutoff, entry["sha256"], planned)


PROMISE_SCHEMA = pa.schema([
    ("store_nbr", pa.int64()), ("wm_item_nbr", pa.int64()),
    ("effective_from", pa.string()), ("effective_to", pa.string()),
    ("stocking_due_date", pa.string()), ("minimum_on_hand_units", pa.int64()),
    ("known_at", pa.string()),
])


def load_distribution(source: DistributionSource, manifest: dict, con: duckdb.DuckDBPyConnection) -> pa.Table:
    if source.as_of != manifest["as_of"] or source.release_set_sha256 != manifest["source_release_set_manifest_sha256"]:
        raise ValueError("distribution/canonical cutoff or release binding mismatch")
    verified_file(source.path.parent, {"path": source.path.name, "bytes": source.bytes, "sha256": source.sha256})
    table = pq.ParquetFile(source.path).read()
    if not table.schema.equals(PROMISE_SCHEMA) or not 0 < table.num_rows <= 1_000_000:
        raise ValueError("invalid distribution schema or size")
    cutoff = datetime.fromisoformat(source.as_of.replace("Z", "+00:00"))
    for row in table.to_pylist():
        try:
            start = date.fromisoformat(row["effective_from"])
            due = date.fromisoformat(row["stocking_due_date"])
            end = date.fromisoformat(row["effective_to"]) if row["effective_to"] else None
            known = datetime.fromisoformat(row["known_at"].replace("Z", "+00:00"))
            valid = (type(row["store_nbr"]) is int and 0 < row["store_nbr"] < 2**31
                     and type(row["wm_item_nbr"]) is int and 0 < row["wm_item_nbr"] < 2**63
                     and type(row["minimum_on_hand_units"]) is int and row["minimum_on_hand_units"] == 1
                     and start <= due and (end is None or end >= due) and known.tzinfo is not None and known <= cutoff)
        except (TypeError, ValueError, AttributeError):
            valid = False
        if not valid:
            raise ValueError("invalid distribution identifiers, dates, quantity or knowledge cutoff")
    con.register("source_promises", table)
    if con.execute("SELECT count(*) FROM (SELECT store_nbr,wm_item_nbr FROM source_promises GROUP BY ALL HAVING count(*)>1)").fetchall()[0][0]:
        raise ValueError("duplicate distribution store-item")
    mapped = con.execute("""SELECT l.location_id,p.product_id,
        s.effective_from::DATE effective_from,s.effective_to::DATE effective_to,
        s.stocking_due_date::DATE stocking_due_date,s.minimum_on_hand_units,s.known_at::TIMESTAMPTZ known_at
        FROM source_promises s JOIN location l ON l.source_location_id=s.store_nbr::VARCHAR
        JOIN product p ON p.source_product_id=s.wm_item_nbr::VARCHAR""").to_arrow_table()
    if mapped.num_rows != table.num_rows:
        raise ValueError("unresolved or ambiguous distribution identity")
    return mapped
