"""Validated synthetic Signal projections shared by MCP and its local demo harness."""
from __future__ import annotations

from collections.abc import Callable
from datetime import date
from typing import Annotated, Literal
from pydantic import Field

from .api import ApiProblem, _signal_problem
from .api_contract import (WireModel, SignalRow, SignalDetailRow, SignalRunMetadata,
                           SignalQueueResponse, SignalEvidenceRow, SupplyContext,
                           SignalDetailResponse as BaseSignalDetailResponse,
                           SIGNAL_API_CONTRACT_VERSION)
from .api_validation import (validate_signal_queue_release as _validate_signal_queue_release,
                             validate_signal_evidence as _validated_signal_evidence)
from .mcp_signal_store import SignalStore, SIGNAL_ID

class SignalDetailResponse(BaseSignalDetailResponse):
    projected_depletion_date: date | None = None

class ReportScope(WireModel):
    classification: Literal["synthetic"]
    observed_from: date
    observed_through: date
    horizon_from: date
    horizon_through: date
    item_count: Annotated[int, Field(ge=1)]
    store_count: Annotated[int, Field(ge=1)]


class ReportCategory(WireModel):
    signal_type: Literal["availability", "inventory_imbalance", "demand_momentum"]
    signal_direction: Literal["acceleration"] | None
    candidate_count: Annotated[int, Field(ge=0)]
    leading_signal: SignalRow | None


class MondayReportResponse(WireModel):
    api_contract_version: Literal["memento-signal-api-v1"] = SIGNAL_API_CONTRACT_VERSION
    run: SignalRunMetadata
    scope: ReportScope
    categories: Annotated[list[ReportCategory], Field(min_length=3, max_length=3)]


def read_signal_queue(signal_store: Callable[[str | None], SignalStore], signal_type: Literal["availability", "demand_momentum", "inventory_imbalance"] | None = None, signal_direction: Literal["acceleration", "deceleration"] | None = None, signal_set_id: str | None = None) -> SignalQueueResponse:
    try:
        store = signal_store(signal_set_id)
        manifest = store.run()
        rows = store.top_signals(signal_type, signal_direction)
        _validate_signal_queue_release(manifest, rows, signal_type)
        identities = store.display_identities(rows) if rows else {}
        signals = []
        for row in rows:
            payload = {name: row.get(name) for name in SignalRow.model_fields if name != "identity"}
            signals.append(SignalRow.model_validate({**payload, "identity": identities[str(row["signal_id"])]}))
        run_values = {name: manifest.get(name) for name in SignalRunMetadata.model_fields}
        configuration = manifest.get("configuration", {})
        if not isinstance(configuration,dict):
            raise ValueError("invalid signal configuration")
        run_values.update(calibration_status=configuration.get("calibration_status"),
                          supply_projection_counts=configuration.get("projection_counts"))
        run = SignalRunMetadata.model_validate(run_values)
        return SignalQueueResponse(run=run, signals=signals)
    except (FileNotFoundError, OSError, ValueError, KeyError, TypeError) as exc:
        raise _signal_problem(503, "release_integrity_error", "The Memento Signal release failed integrity validation.") from exc


def read_monday_report(signal_store: Callable[[str | None], SignalStore], signal_set_id: str | None = None) -> MondayReportResponse:
    try:
        store = signal_store(signal_set_id)
        manifest = store.run()
        configuration = manifest.get("configuration", {})
        if not isinstance(configuration, dict):
            raise ValueError("invalid signal configuration")
        run_values = {name: manifest.get(name) for name in SignalRunMetadata.model_fields}
        run_values.update(calibration_status=configuration.get("calibration_status"),
                          supply_projection_counts=configuration.get("projection_counts"))
        cards = []
        selections: list[tuple[Literal["availability", "inventory_imbalance", "demand_momentum"], Literal["acceleration"] | None]] = [("availability", None), ("inventory_imbalance", None), ("demand_momentum", "acceleration")]
        for kind, direction in selections:
            rows = store.top_signals(kind, direction)
            _validate_signal_queue_release(manifest, rows, kind)
            identities = store.display_identities(rows[:1]) if rows else {}
            leader = None
            if rows:
                row = rows[0]
                leader = SignalRow.model_validate({**{name: row.get(name) for name in SignalRow.model_fields if name != "identity"},
                                                   "identity": identities[str(row["signal_id"])]})
            cards.append(ReportCategory(signal_type=kind, signal_direction=direction,
                                        candidate_count=store.category_count(kind, direction), leading_signal=leader))
        return MondayReportResponse(run=SignalRunMetadata.model_validate(run_values),
                                    scope=ReportScope.model_validate(store.report_scope()), categories=cards)
    except (FileNotFoundError, OSError, ValueError, KeyError, TypeError) as exc:
        raise _signal_problem(503, "release_integrity_error", "The synthetic demo publication failed integrity validation.") from exc


def read_signal_detail(signal_store: Callable[[str | None], SignalStore], signal_id: str, signal_set_id: str | None = None) -> SignalDetailResponse:
    if not SIGNAL_ID.fullmatch(signal_id):
        raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.")
    try:
        store = signal_store(signal_set_id)
        row = store.signal(signal_id)
        if row is None:
            raise _signal_problem(404, "signal_not_found", "The signal is not in the selected publication.")
        identity = store.display_identities([row])[signal_id]
        payload = {name: row.get(name) for name in SignalDetailRow.model_fields if name != "identity"}
        detail = SignalDetailRow.model_validate({**payload, "identity": identity})
        evidence = [SignalEvidenceRow.model_validate(item) for item in store.evidence(signal_id)]
        _validated_signal_evidence(detail, evidence)
        context = store.supply_context(signal_id)
        return SignalDetailResponse(signal=detail, evidence=evidence, supply_context=SupplyContext.model_validate(context) if context is not None else None,
                                    projected_depletion_date=min((row.evidence_date for row in evidence if row.path == "base" and row.ending_units == 0), default=None) if detail.signal_type == "availability" else None)
    except ApiProblem:
        raise
    except ValueError as exc:
        if "signal identity" in str(exc):
            raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.") from exc
        raise _signal_problem(503, "release_integrity_error", "The Memento Signal release failed integrity validation.") from exc
    except (FileNotFoundError, OSError, KeyError, TypeError) as exc:
        raise _signal_problem(503, "release_integrity_error", "The Memento Signal release failed integrity validation.") from exc
