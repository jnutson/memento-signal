"""Bounded DuckDB connections for serving approved local Parquet only."""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from threading import Timer
from collections.abc import Iterator

import duckdb


@contextmanager
def serving_connection(*roots: Path, timeout: float = 10) -> Iterator[duckdb.DuckDBPyConnection]:
    directories = [str(root.resolve(strict=True)) + "/" for root in roots if root.is_dir()]
    if not directories:
        raise ValueError("serving requires an existing approved directory")
    con = duckdb.connect(config={
        "autoload_known_extensions": False,
        "autoinstall_known_extensions": False,
        "allow_community_extensions": False,
        "allow_unsigned_extensions": False,
        "memory_limit": "256MB",
        "threads": 1,
        "temp_directory": "",
    })
    # DuckDB configuration order matters: establish local allowances first.
    try:
        con.execute("SET allowed_directories = ?", [directories])
        con.execute("SET enable_external_access=false")
        con.execute("SET lock_configuration=true")
    except Exception:
        con.close()
        raise
    timer = Timer(timeout, con.interrupt)
    timer.daemon = True
    timer.start()
    try:
        yield con
    finally:
        timer.cancel()
        timer.join()
        con.close()
