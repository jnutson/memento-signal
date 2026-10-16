from __future__ import annotations

import json
import subprocess
from datetime import date
from pathlib import Path
from typing import cast


ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = ROOT / "web"
EXCEPTIONS_PATH = WEB_ROOT / "security-audit-exceptions.json"


def _audit(*args: str) -> dict[str, object]:
    result = subprocess.run(
        ["npm", "audit", "--json", *args],
        cwd=WEB_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("npm audit did not return valid JSON") from exc
    if not isinstance(report, dict):
        raise RuntimeError("npm audit returned an invalid report")
    return cast(dict[str, object], report)


def _vulnerabilities(report: dict[str, object]) -> dict[str, object]:
    value = report.get("vulnerabilities")
    if not isinstance(value, dict):
        raise RuntimeError("npm audit report has no vulnerability map")
    return cast(dict[str, object], value)


def main() -> None:
    runtime = _vulnerabilities(_audit("--omit=dev", "--audit-level=high"))
    if runtime:
        raise SystemExit(
            "runtime dependency audit failed: " + ", ".join(sorted(runtime))
        )

    policy = json.loads(EXCEPTIONS_PATH.read_text(encoding="utf-8"))
    entries = policy.get("exceptions") if isinstance(policy, dict) else None
    if not isinstance(entries, list) or len(entries) != 1:
        raise SystemExit("expected one explicit development audit exception")
    exception = entries[0]
    if not isinstance(exception, dict):
        raise SystemExit("development audit exception must be an object")
    if exception.get("scope") != "development":
        raise SystemExit("audit exceptions may not cover runtime dependencies")

    expiry_text = exception.get("expires_on")
    if not isinstance(expiry_text, str) or date.today() > date.fromisoformat(expiry_text):
        raise SystemExit("development audit exception expired; review the lint toolchain")
    packages = exception.get("packages")
    if not isinstance(packages, list) or not all(
        isinstance(package, str) for package in packages
    ):
        raise SystemExit("development audit exception package list is invalid")

    full = _vulnerabilities(_audit("--audit-level=high"))
    unexpected = set(full) - set(packages)
    missing = set(packages) - set(full)
    if unexpected or missing:
        details = []
        if unexpected:
            details.append("unexpected=" + ",".join(sorted(unexpected)))
        if missing:
            details.append("resolved=" + ",".join(sorted(missing)))
        raise SystemExit(
            "development audit exception requires review: " + " ".join(details)
        )

    advisory = exception.get("advisory")
    braces = full.get("braces")
    if not isinstance(advisory, str) or not isinstance(braces, dict):
        raise SystemExit("development audit exception cannot be verified")
    via = braces.get("via")
    if not isinstance(via, list) or not any(
        isinstance(item, dict) and str(item.get("url", "")).endswith(advisory)
        for item in via
    ):
        raise SystemExit("allowed advisory is not the reported root vulnerability")

    print(
        "runtime audit clean; accepted development-only advisory "
        f"{advisory} through {expiry_text}"
    )


if __name__ == "__main__":
    main()
