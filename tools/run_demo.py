"""Start the preflighted API and frontend; stop both when the demo is interrupted."""
from __future__ import annotations

import argparse
import signal
import subprocess
import sys
from pathlib import Path

from tools.demo import preflight


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=Path("data/demo"))
    parser.add_argument("--signal-set-id")
    args = parser.parse_args()
    try:
        result = preflight(args.data_root, args.signal_set_id)
    except (ValueError, OSError, KeyError, TypeError):
        parser.exit(1, "Demo preflight failed; no services were started.\n")
    import os
    import socket
    for port in (8000, 3000):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                listener.bind(("127.0.0.1", port))
            except OSError:
                parser.exit(1, f"Demo port {port} is already in use; no services were started.\n")
    children: list[subprocess.Popen] = []
    def stop(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop)
    exit_code = 0
    try:
        children.append(subprocess.Popen([sys.executable, "-m", "tools.demo", "serve", "--data-root", str(args.data_root), "--signal-set-id", result["signal_set_id"]], start_new_session=True))
        children.append(subprocess.Popen(["npm", "--prefix", "web", "run", "dev", "--", "--hostname", "127.0.0.1"], env={**os.environ, "MEMENTO_API_ORIGIN": "http://127.0.0.1:8000"}, start_new_session=True))
        print("Demo: http://127.0.0.1:3000/report · Ctrl-C stops both services", flush=True)
        # Waiting on either child detects API/frontend startup and runtime failures.
        import time
        while all(child.poll() is None for child in children):
            time.sleep(0.25)
        exit_code = 1
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
    if exit_code:
        raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
