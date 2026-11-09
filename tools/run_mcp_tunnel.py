"""Start the private Memento Loop test tunnel with a hidden, non-persisted key."""
from __future__ import annotations

import argparse
import getpass
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

from tools.demo import preflight

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tunnel-id", help="Defaults to the locally saved private tunnel connection")
    args = parser.parse_args()
    if args.tunnel_id is None:
        try:
            settings = ROOT / "data" / "mcp" / "tunnel-connection.json"
            if settings.is_symlink() or settings.stat().st_size > 16_384:
                raise ValueError("invalid connection settings")
            args.tunnel_id = json.loads(settings.read_text())["tunnel_id"]
        except (OSError, ValueError, KeyError, TypeError):
            parser.error("saved tunnel connection is unavailable; provide --tunnel-id")
    if not isinstance(args.tunnel_id, str) or not re.fullmatch(r"tunnel_[a-z0-9]{32}", args.tunnel_id):
        parser.error("use the exact tunnel ID from OpenAI Platform")
    binary = ROOT / "data" / "mcp" / "bin" / "tunnel-client"
    if not binary.is_file():
        parser.error("install the official OpenAI tunnel-client first")
    publication = preflight(ROOT / "data" / "demo")["signal_set_id"]
    command = shlex.join([str(ROOT / ".venv" / "bin" / "python"), "-m", "memento.mcp_cli",
                          "--data-root", str(ROOT / "data" / "demo"), "--publication-id", publication])
    environment = os.environ.copy()
    if not environment.get("CONTROL_PLANE_API_KEY"):
        if not sys.stdin.isatty():
            parser.error("run in a local terminal to enter the key securely, or supply CONTROL_PLANE_API_KEY")
        key = getpass.getpass("Restricted OpenAI tunnel runtime key (hidden): ")
        if not key or any(character.isspace() for character in key):
            parser.error("a nonblank runtime key is required")
        environment["CONTROL_PLANE_API_KEY"] = key
        del key
    # Only an environment reference is written to the generated profile. The secret
    # is never included in arguments, source, output, or configuration files.
    try:
        subprocess.run([str(binary), "runtimes", "connect", "--alias", "memento-loop",
                        "--profile", "memento-loop", "--profile-dir", str(ROOT / "data" / "mcp" / "profiles"),
                        "--tunnel-id", args.tunnel_id, "--mcp-command", command,
                        "--runtime-api-key", "env:CONTROL_PLANE_API_KEY", "--json"],
                       env=environment, cwd=ROOT, check=True, capture_output=True, text=True)
        environment.pop("CONTROL_PLANE_API_KEY", None)
        result = subprocess.run([str(binary), "runtimes", "status", "memento-loop", "--json"],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        status = json.loads(result.stdout)
    except (subprocess.CalledProcessError, ValueError):
        parser.exit(1, "Tunnel startup could not be verified. Check the tunnel ID and the runtime key's Tunnels Read + Use permissions.\n")
    finally:
        environment.pop("CONTROL_PLANE_API_KEY", None)
    # tmux.running is unrelated when tunnel-client uses its managed process mode.
    # Do not dump nested logs and process metadata into the user's terminal.
    summary = {"name": "Memento Loop", **{field: status.get(field) is True
               for field in ("process_running", "healthy", "ready")}}
    print(json.dumps(summary, indent=2))
    if not all(summary[field] for field in ("process_running", "healthy", "ready")):
        parser.exit(1, "The tunnel is not ready yet. Check the managed runtime status before testing.\n")
    print("Ready for testing. Select Memento Loop in ChatGPT. Keep this Mac awake and the tunnel running.")


if __name__ == "__main__":
    main()
