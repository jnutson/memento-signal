"""Check source-control boundaries without opening forbidden data files."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRET = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"
    r"|\bgh[pousr]_[A-Za-z0-9]{30,}\b"
    r"|\bgithub_pat_[A-Za-z0-9_]{40,}\b"
    r"|\bAKIA[0-9A-Z]{16}\b"
    r"|\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b"
    r"|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"
)
TEXT = {".py", ".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".toml", ".yaml", ".yml", ".sh", ".txt", ".lock"}


def forbidden(path: str) -> bool:
    p = Path(path)
    return (("data" in p.parts and path != "data/.gitkeep")
            or (p.name.startswith(".env") and p.name != ".env.example")
            or p.suffix.lower() in {".parquet", ".duckdb", ".db", ".sqlite", ".sqlite3", ".pem", ".key", ".csv", ".tsv", ".xlsx", ".xls"}
            or any(part in {".demo", ".vercel", "node_modules", ".next"} for part in p.parts))


def violations(root: Path, paths: list[str]) -> list[str]:
    failures = []
    for name in paths:
        path = root / name
        if forbidden(name) or path.is_symlink():
            failures.append("forbidden tracked asset: " + name)
            continue
        if path.is_file() and (path.suffix in TEXT or path.name in {"Makefile", "Dockerfile", ".gitignore", ".dockerignore", ".vercelignore"}):
            # Output locations only; never echo candidate secret contents.
            if SECRET.search(path.read_text(encoding="utf-8")):
                failures.append("possible credential in source: " + name)
    return failures


def main() -> int:
    tracked = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT, check=True, capture_output=True).stdout
    failures = violations(ROOT, [name.decode() for name in tracked.split(b"\0") if name])
    for failure in failures:
        print(failure)
    print(f"Source security boundary: {'FAIL' if failures else 'PASS'}")
    return bool(failures)


if __name__ == "__main__":
    raise SystemExit(main())
