from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import duckdb
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .api_contract import (
    SIGNAL_API_CONTRACT_VERSION,
    HealthResponse,
    SignalApiError,
    SignalDetailResponse,
    SignalDetailRow,
    SignalEvidenceRow,
    SignalQueueResponse,
    SignalRow,
    SignalRunMetadata,
    SupplyContext,
)
from .api_validation import validate_signal_evidence, validate_signal_queue_release
from .investigation import read_investigation
from .investigation_contract import Investigation
from .serving import SIGNAL_ID, SignalStore
from .signal_contract import PRIORITY_FIELDS


OPTIONAL_PRIORITY_FIELDS = {name for name, _ in PRIORITY_FIELDS}


class ApiProblem(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        self.status_code = status_code
        self.code = code
        self.message = message


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    payload = SignalApiError(code=code, message=message)
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


def _signal_problem(status_code: int, code: str, message: str) -> ApiProblem:
    return ApiProblem(status_code, code, message)


def create_app(data_root: Path) -> FastAPI:
    root = data_root.resolve()
    app = FastAPI(title="Memento Signal API", version=SIGNAL_API_CONTRACT_VERSION)

    def signal_store() -> SignalStore:
        return SignalStore(root / "signals", root / "canonical")

    @app.exception_handler(ApiProblem)
    async def api_problem_handler(_request: Request, exc: ApiProblem) -> JSONResponse:
        return _error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(
        _request: Request, _exc: RequestValidationError
    ) -> JSONResponse:
        return _error_response(422, "invalid_request", "The request does not match the API contract.")

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
        return _error_response(
            500,
            "internal_error",
            "The Memento Signal API could not complete the request.",
        )

    @app.get("/healthz", response_model=HealthResponse)
    def healthz() -> HealthResponse:
        try:
            manifest = signal_store().run()
            return HealthResponse(signal_set_id=str(manifest["signal_set_id"]))
        except (FileNotFoundError, OSError, ValueError, KeyError, TypeError) as exc:
            raise ApiProblem(
                503,
                "release_unavailable",
                "The current signal release is unavailable or invalid.",
            ) from exc

    @app.get(
        "/v1/signals",
        response_model=SignalQueueResponse,
        responses={503: {"model": SignalApiError}},
    )
    def signal_queue(
        signal_type: Literal["availability", "demand_momentum", "inventory_imbalance"]
        | None = None,
    ) -> SignalQueueResponse:
        try:
            store = signal_store()
            manifest = store.run()
            rows = store.top_signals(signal_type)
            validate_signal_queue_release(manifest, rows, signal_type)
            identities = store.display_identities(rows) if rows else {}
            signals = []
            for row in rows:
                payload = {
                    name: row.get(name) if name in OPTIONAL_PRIORITY_FIELDS else row[name]
                    for name in SignalRow.model_fields
                    if name != "identity"
                }
                signals.append(
                    SignalRow.model_validate(
                        {**payload, "identity": identities[str(row["signal_id"])]}
                    )
                )
            run_values = {
                name: manifest.get(name) for name in SignalRunMetadata.model_fields
            }
            configuration = manifest.get("configuration", {})
            if not isinstance(configuration, dict):
                raise ValueError("invalid signal configuration")
            run_values.update(
                calibration_status=configuration.get("calibration_status"),
                supply_projection_counts=configuration.get("projection_counts"),
                priority_policy=configuration.get("priority_policy"),
                confidence_policy=configuration.get("confidence_policy"),
                source_signal_set_id=configuration.get("source_signal_set_id"),
                ranking_weights=configuration.get("weights"),
            )
            return SignalQueueResponse(
                run=SignalRunMetadata.model_validate(run_values), signals=signals
            )
        except (FileNotFoundError, OSError, ValueError, KeyError, TypeError) as exc:
            raise _signal_problem(
                503,
                "release_integrity_error",
                "The Memento Signal release failed integrity validation.",
            ) from exc

    @app.get(
        "/v1/signals/{signal_id}",
        response_model=SignalDetailResponse,
        responses={
            404: {"model": SignalApiError},
            422: {"model": SignalApiError},
            503: {"model": SignalApiError},
        },
    )
    def signal_detail(signal_id: str) -> SignalDetailResponse:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.")
        try:
            store = signal_store()
            row = store.signal(signal_id)
            if row is None:
                raise _signal_problem(
                    404,
                    "signal_not_found",
                    "The signal is not in the current overall top ten.",
                )
            identity = store.display_identities([row])[signal_id]
            payload = {
                name: row.get(name) if name in OPTIONAL_PRIORITY_FIELDS else row[name]
                for name in SignalDetailRow.model_fields
                if name != "identity"
            }
            detail = SignalDetailRow.model_validate({**payload, "identity": identity})
            evidence = [
                SignalEvidenceRow.model_validate(item) for item in store.evidence(signal_id)
            ]
            validate_signal_evidence(detail, evidence)
            context = store.supply_context(signal_id)
            return SignalDetailResponse(
                signal=detail,
                evidence=evidence,
                supply_context=(
                    SupplyContext.model_validate(context) if context is not None else None
                ),
            )
        except ApiProblem:
            raise
        except ValueError as exc:
            if "signal identity" in str(exc):
                raise _signal_problem(
                    422, "invalid_signal_id", "The signal identifier is invalid."
                ) from exc
            raise _signal_problem(
                503,
                "release_integrity_error",
                "The Memento Signal release failed integrity validation.",
            ) from exc
        except (FileNotFoundError, OSError, KeyError, TypeError) as exc:
            raise _signal_problem(
                503,
                "release_integrity_error",
                "The Memento Signal release failed integrity validation.",
            ) from exc

    @app.get("/v1/signals/{signal_id}/investigation", response_model=Investigation)
    def signal_investigation(signal_id: str, signal_set_id: str) -> Investigation:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.")
        try:
            release, manifest = signal_store().current_release()
            if signal_set_id != manifest["signal_set_id"]:
                raise _signal_problem(
                    409, "release_changed", "The release changed. Reload Attention to continue."
                )
            with duckdb.connect() as connection:
                found = connection.execute(
                    "SELECT count(*) FROM read_parquet(?) "
                    "WHERE signal_id=? AND is_overall_top_10",
                    [str(release / "signal.parquet"), signal_id],
                ).fetchone()
            if not found or found[0] != 1:
                raise _signal_problem(
                    404,
                    "signal_not_found",
                    "The signal is not in the current overall top ten.",
                )
            return read_investigation(root, release, manifest, signal_id)
        except ApiProblem:
            raise
        except FileNotFoundError as exc:
            raise _signal_problem(
                404,
                "investigation_unavailable",
                "Visual investigation has not been published for this release.",
            ) from exc
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise _signal_problem(
                503,
                "release_integrity_error",
                "The investigation failed integrity validation.",
            ) from exc

    return app


app = create_app(Path(os.environ.get("MEMENTO_DATA_ROOT", "data")))
