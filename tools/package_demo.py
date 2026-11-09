"""Create an explicit, reproducible source inventory for a manual demo-1 deployment."""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path


def package_demo() -> dict:
    if os.environ.get("MEMENTO_SERVING_MODE") == "cloudflare":
        raise ValueError("customer deployments cannot package demo data")
    root = Path(__file__).resolve().parents[1]
    web = root / "web"
    bundle = json.loads((web / ".demo/demo-1.json").read_text())
    if bundle.get("classification") != "synthetic" or bundle.get("demo_id") != "demo-1":
        raise ValueError("only the declared synthetic demo may be packaged")
    paths = [web / name for name in ("package.json", "package-lock.json", "next.config.mjs", "next-env.d.ts", "tsconfig.json", "vercel.json", ".demo/demo-1.json")]
    for directory in ("app", "components", "lib"):
        paths.extend(p for p in (web / directory).rglob("*") if p.is_file() and p.suffix in {".ts", ".tsx", ".css"})
    files = []
    fingerprint = hashlib.sha256()
    for path in sorted(paths):
        if path.is_symlink():
            raise ValueError("symlink source is not allowed")
        relative = path.relative_to(web).as_posix()
        content = path.read_bytes()
        digest = hashlib.sha1(content).hexdigest()
        fingerprint.update(relative.encode() + b"\0" + hashlib.sha256(content).digest())
        files.append({"file": relative, "sha": digest, "size": len(content), "data": base64.b64encode(content).decode(), "encoding": "base64"})
    artifact = {"demo_id": "demo-1", "classification": "synthetic", "source_sha256": fingerprint.hexdigest(), "signal_set_id": bundle["report"]["run"]["signal_set_id"], "files": files}
    target = root / "data/hosting/demo-1/source.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(artifact, separators=(",", ":")))
    return {key: value for key, value in artifact.items() if key != "files"} | {"file_count": len(files), "bytes": sum(row["size"] for row in files)}


if __name__ == "__main__":
    print(json.dumps(package_demo(), indent=2))
