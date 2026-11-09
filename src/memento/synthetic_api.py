"""Loopback-only synthetic Signal harness; never mounted in the customer API."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .api import ApiProblem
from .mcp_signal_reader import read_monday_report, read_signal_detail, read_signal_queue
from .mcp_signal_store import SignalStore


def create_app(data_root: Path, publication_id: str | None = None) -> FastAPI:
    root = data_root.resolve(strict=True)
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    def store(selected: str | None = None) -> SignalStore:
        if publication_id is not None and selected not in {None, publication_id}:
            raise ValueError("publication unavailable")
        reader = SignalStore(root / "signals", root / "canonical", publication_id or selected)
        reader.canonical_release()  # Reject non-synthetic data before returning any row.
        return reader

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        if not request.client or request.client.host not in {"127.0.0.1", "::1", "testclient"}:
            response = JSONResponse({"code": "loopback_required"}, status_code=403)
        elif request.method != "GET":
            response = JSONResponse({"code": "read_only"}, status_code=405)
        else:
            response = await call_next(request)
        response.headers["Cache-Control"] = "private, no-store"
        return response

    @app.exception_handler(ApiProblem)
    async def unavailable(_request: Request, exc: ApiProblem):
        return JSONResponse({"code": exc.code, "message": "Synthetic publication unavailable."},
                            status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def invalid(_request: Request, _exc: RequestValidationError):
        return JSONResponse({"code": "invalid_request"}, status_code=422)

    @app.get("/v1/signals/report")
    def report(signal_set_id: str | None = None):
        return read_monday_report(store, signal_set_id)

    @app.get("/v1/signals")
    def queue(signal_type: Literal["availability", "demand_momentum", "inventory_imbalance"] | None = None,
              signal_direction: Literal["acceleration", "deceleration"] | None = None,
              signal_set_id: str | None = None):
        return read_signal_queue(store, signal_type, signal_direction, signal_set_id)

    @app.get("/v1/signals/{signal_id}")
    def detail(signal_id: str, signal_set_id: str | None = None):
        return read_signal_detail(store, signal_id, signal_set_id)

    return app
