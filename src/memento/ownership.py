"""Explicit ownership for tenant-bound batch runs; no source records are stored."""
from __future__ import annotations

import json
import re
from pathlib import Path


def verify_source_owner(manifest: dict, tenant_id: str | None) -> None:
    if "tenant_id" in manifest and manifest["tenant_id"] != tenant_id:
        raise ValueError("registered source owner does not match the job owner")


def bind_owner(data_root: Path, tenant_id: str | None) -> None:
    if tenant_id is not None and not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", tenant_id):
        raise ValueError("invalid tenant identity")
    marker = data_root / ".tenant.json"
    if marker.is_symlink():
        raise ValueError("invalid ownership marker")
    if marker.exists():
        if data_root.stat().st_mode & 0o077:
            raise ValueError("tenant batch root must have private host permissions")
        if json.loads(marker.read_bytes()) != {"tenant_id": tenant_id}:
            raise ValueError("data root belongs to a different tenant")
    elif tenant_id is not None:
        # Do not adopt an existing unclassified data tree implicitly.
        if data_root.exists() and any(data_root.iterdir()):
            raise ValueError("tenant runs require a new empty root or an existing matching ownership marker")
        data_root.mkdir(parents=True, exist_ok=True, mode=0o700)
        if data_root.stat().st_mode & 0o077:
            raise ValueError("tenant batch root must have private host permissions")
        with marker.open("x", encoding="utf-8") as handle:
            marker.chmod(0o600)
            json.dump({"tenant_id": tenant_id}, handle)


def require_owner(data_root: Path, manifest: dict) -> None:
    tenant_id = manifest.get("tenant_id")
    marker = data_root / ".tenant.json"
    if marker.exists() or marker.is_symlink() or tenant_id is not None:
        if (marker.is_symlink() or not marker.is_file()
                or json.loads(marker.read_bytes()) != {"tenant_id": tenant_id}):
            raise ValueError("publication owner does not match output root")
