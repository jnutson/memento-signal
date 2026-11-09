"""Exercise the frozen-demo adapter without reading or overwriting local datasets."""
from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from tools.export_demo import export_demo


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    originals = {p: p.read_bytes() for p in (root / "web/next-env.d.ts", root / "web/tsconfig.json")}
    try:
        with tempfile.TemporaryDirectory(prefix="memento-hosted-synthetic-") as temporary:
            bundle = Path(temporary).resolve() / "demo.json"
            export_demo(Path(temporary) / "unused", bundle)
            env = {key: value for key, value in os.environ.items() if key not in {"DEMO_URL", "DEMO_COOKIE_JAR"}}
            env.update(MEMENTO_DEMO_BUNDLE="1", MEMENTO_SERVING_MODE="disabled",
                       MEMENTO_CUSTOMER_PATH="", MEMENTO_SECURITY_VERIFY="1",
                       MEMENTO_SYNTHETIC_TEST_BUNDLE=str(bundle))
            subprocess.run(["npm", "run", "test:e2e:hosted"], cwd=root / "web", env=env, check=True)
    finally:
        for path, content in originals.items():
            path.write_bytes(content)


if __name__ == "__main__":
    main()
