from __future__ import annotations

from typing import Any

import duckdb


def fetchone_required(cursor: duckdb.DuckDBPyConnection) -> tuple[Any, ...]:
    """Return one DuckDB row or fail explicitly when a scalar query returned none."""
    row = cursor.fetchone()
    if row is None:
        raise ValueError("DuckDB query returned no row")
    return row
