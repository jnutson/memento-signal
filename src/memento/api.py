from __future__ import annotations

import os
import duckdb
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal, cast

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

from .serving import SIGNAL_ID, SignalStore
from .signal_contract import PRIORITY_FIELDS, URGENCY_RANKER_VERSION
from .investigation_contract import Investigation
from .investigation import read_investigation

OPTIONAL_PRIORITY_FIELDS = {name for name, _ in PRIORITY_FIELDS}


SIGNAL_API_CONTRACT_VERSION = "memento-signal-api-v1"
WireDecimal = Annotated[
    Decimal,
    PlainSerializer(lambda value: format(value, "f"), return_type=str, when_used="json"),
]
Score = Annotated[WireDecimal, Field(ge=Decimal("0"), le=Decimal("1"))]


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignalApiError(WireModel):
    api_contract_version: Literal["memento-signal-api-v1"] = SIGNAL_API_CONTRACT_VERSION
    code: str
    message: str


class HealthResponse(WireModel):
    api_contract_version: Literal["memento-signal-api-v1"] = SIGNAL_API_CONTRACT_VERSION
    status: Literal["ok"] = "ok"
    signal_set_id: str


class DisplayIdentity(WireModel):
    item_name: str
    company_item_id: str
    source_product_id: str
    store_name: str
    source_location_id: str


class SignalIdentity(DisplayIdentity):
    pass


class SignalRunMetadata(WireModel):
    signal_set_id: str
    signal_as_of: datetime
    candidate_count: Annotated[int, Field(ge=0)]
    display_count: Annotated[int, Field(ge=0, le=10)]
    candidate_counts_by_type: dict[Literal["availability", "demand_momentum", "inventory_imbalance"], Annotated[int, Field(ge=0)]]
    canonical_dataset_id: str
    source_release_set_id: str
    source_release_ids: list[str]
    metric_contract_version: str
    signal_publication_version: str
    ranker_version: str
    configuration_hash: str
    calibration_status: str | None = None
    supply_projection_counts: dict[str, Annotated[int, Field(ge=0)]] | None = None
    priority_policy: str | None = None
    confidence_policy: str | None = None
    source_signal_set_id: str | None = None
    ranking_weights: dict[str, WireDecimal] | None = None


class SignalRow(WireModel):
    signal_id: Annotated[str, Field(pattern=r"^sig_[0-9a-f]{64}$")]
    signal_type: Literal["availability", "demand_momentum", "inventory_imbalance"]
    signal_direction: Literal["risk", "acceleration", "deceleration", "excess"]
    observation_date: date
    store_id: str
    product_id: str
    identity: SignalIdentity
    headline_metric_name: str
    headline_metric_value: WireDecimal
    estimated_retail_sales_impact_amount: WireDecimal | None
    estimated_contribution_impact_amount: WireDecimal | None
    estimated_cost_impact_amount: WireDecimal | None
    inventory_cost_exposed_amount: WireDecimal | None
    carrying_cost_28d_amount: WireDecimal | None
    economic_impact_basis: str
    days_until_material_impact: Annotated[int, Field(ge=1, le=28)]
    minimum_reaction_days: Annotated[int, Field(ge=0)]
    action_slack_days: int
    impact_score: Score
    reaction_score: Score
    confidence_score: Score
    rank_score: Score
    overall_rank_position: Annotated[int, Field(ge=1)]
    signal_type_rank_position: Annotated[int, Field(ge=1)]
    urgency_score: Score | None = None
    decision_slack_days: int | None = None
    decision_lead_time_days: Annotated[int, Field(ge=0)] | None = None
    urgency_basis: Literal["assumed_conservative_action", "declared_review_allowance"] | None = None
    urgency_action: Annotated[str, Field(min_length=1)] | None = None

    @model_validator(mode="after")
    def validate_type_specific_contract(self) -> "SignalRow":
        timing = (self.urgency_score, self.decision_slack_days, self.decision_lead_time_days, self.urgency_basis, self.urgency_action)
        if any(value is not None for value in timing):
            if any(value is None for value in timing) or self.decision_slack_days != self.days_until_material_impact - cast(int, self.decision_lead_time_days):
                raise ValueError("urgency timing must be complete and reconcile")
            expected = max(Decimal(0), min(Decimal(1), Decimal(1) - Decimal(cast(int, self.decision_slack_days)) / Decimal(28))).quantize(Decimal("0.000001"))
            if self.urgency_score != expected:
                raise ValueError("urgency score must reconcile with deadline")
            priority = (Decimal("0.4") * self.impact_score + Decimal("0.4") * cast(Decimal, self.urgency_score) + Decimal("0.2") * self.confidence_score).quantize(Decimal("0.000001"))
            if abs(self.rank_score - priority) > Decimal("0.000001"):
                raise ValueError("urgency priority must reconcile with weights")
        expected_direction = {"availability": {"risk"}, "demand_momentum": {"acceleration", "deceleration"}, "inventory_imbalance": {"excess"}}
        if self.signal_direction not in expected_direction[self.signal_type]:
            raise ValueError("signal direction does not match signal type")
        inventory_values = (self.estimated_cost_impact_amount, self.inventory_cost_exposed_amount, self.carrying_cost_28d_amount)
        if self.signal_type == "inventory_imbalance":
            if self.estimated_retail_sales_impact_amount is not None or self.estimated_contribution_impact_amount is not None or any(value is None for value in inventory_values):
                raise ValueError("inventory imbalance economics do not match contract")
        elif self.estimated_retail_sales_impact_amount is None or self.estimated_contribution_impact_amount is None or any(value is not None for value in inventory_values):
            raise ValueError("sales signal economics do not match contract")
        return self


class SignalQueueResponse(WireModel):
    api_contract_version: Literal["memento-signal-api-v1"] = SIGNAL_API_CONTRACT_VERSION
    run: SignalRunMetadata
    signals: Annotated[list[SignalRow], Field(max_length=10)]


class SignalEvidenceRow(WireModel):
    signal_id: Annotated[str, Field(pattern=r"^sig_[0-9a-f]{64}$")]
    evidence_type: Literal["historical_week", "forward_demand", "inventory_projection"]
    evidence_date: date
    path: Literal["low", "base", "high"] | None
    actual_units: WireDecimal | None
    retailer_forecast_units: WireDecimal | None
    adjusted_forecast_units: WireDecimal | None
    demand_units: WireDecimal | None
    scheduled_inbound_units: WireDecimal | None
    opening_units: WireDecimal | None
    ending_units: WireDecimal | None
    lost_units: WireDecimal | None
    target_units: WireDecimal | None


class SignalDetailRow(SignalRow):
    signal_as_of: datetime
    company_id: str
    brand_id: str
    forecast_quality: Score
    data_completeness: Score
    stability_score: Score
    source_release_ids: list[str]
    source_release_set_id: str
    canonical_dataset_id: str
    metric_contract_version: str
    signal_publication_version: str
    ranker_version: str
    configuration_hash: str

    @model_validator(mode="after")
    def priority_contract(self):
        if self.ranker_version == URGENCY_RANKER_VERSION:
            if self.urgency_score is None:
                raise ValueError("urgency publication is missing urgency")
            expected = (self.forecast_quality * self.data_completeness * self.stability_score).quantize(Decimal("0.000001"))
            if abs(self.confidence_score - expected) > Decimal("0.000001"):
                raise ValueError("multiplicative confidence does not reconcile")
        return self


class SupplyArrival(WireModel):
    order_state: Literal["open", "in_transit", "planned"] = "planned"
    quantity: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    basis: str
    early: date | None
    typical: date | None
    conservative: date | None
    stages: list[str]

    @model_validator(mode="after")
    def ordered_dates(self):
        if any(value is None for value in (self.early,self.typical,self.conservative)):
            if not all(value is None for value in (self.early,self.typical,self.conservative)):
                raise ValueError("partial arrival range")
        elif self.early is not None and self.typical is not None and self.conservative is not None and not self.early <= self.typical <= self.conservative:
            raise ValueError("unordered arrival range")
        return self


class SupplyPlan(SupplyArrival):
    planned_order_date: date
    stages: list[str] = []

    @model_validator(mode="after")
    def complete_plan_dates(self):
        if self.early is None or self.typical is None or self.conservative is None or self.planned_order_date > self.early:
            raise ValueError("planned arrival range must follow order date")
        return self


class SupplyProjection(WireModel):
    first_oos_date: date | None
    lost_units: Annotated[float, Field(ge=0, allow_inf_nan=False)]


class SupplyAction(WireModel):
    action: str
    early_days: Annotated[int, Field(ge=0)]
    typical_days: Annotated[int, Field(ge=0)]
    conservative_days: Annotated[int, Field(ge=0)]
    typical_slack: int
    conservative_slack: int
    timing: Literal["robust", "conditional", "too_late"]
    feasibility: Literal["robust", "conditional", "too_late", "unknown", "not_applicable"]
    missing_prerequisites: list[str]
    score: Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
    stages: list[str]

    @model_validator(mode="after")
    def feasible_score(self):
        if not self.early_days <= self.typical_days <= self.conservative_days:
            raise ValueError("unordered action lead times")
        if self.missing_prerequisites and self.score != 0:
            raise ValueError("unknown prerequisites cannot score as actionable")
        if self.feasibility in {"unknown","not_applicable","too_late"} and self.score != 0:
            raise ValueError("infeasible action cannot have positive score")
        return self


class SupplyContext(WireModel):
    assumption_version: str
    classification: Literal["synthetic_assumption"]
    calibration: str
    route: str
    category: str
    arrivals: list[SupplyArrival]
    planned_replenishment: list[SupplyPlan]
    supply_timing: dict[Literal["committed", "early", "typical", "conservative"], SupplyProjection]
    planning_prerequisites: list[str]
    actions: list[SupplyAction]
    baseline_reaction_score: Score
    baseline_reaction_days: Annotated[int, Field(ge=0)]
    baseline_availability_present: bool
    ranking_policy: str
    committed_overall_rank: Annotated[int, Field(ge=1)] | None = None
    committed_rank_score: Score | None = None


class SignalDetailResponse(WireModel):
    api_contract_version: Literal["memento-signal-api-v1"] = SIGNAL_API_CONTRACT_VERSION
    signal: SignalDetailRow
    evidence: list[SignalEvidenceRow]
    supply_context: SupplyContext | None = None


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


def _validate_signal_queue_release(
    manifest: dict[str, object], signals: list[dict[str, object]], signal_type: str | None,
) -> None:
    if manifest.get("ranker_version") == URGENCY_RANKER_VERSION and any(row.get("urgency_score") is None for row in signals):
        raise ValueError("urgency publication is incomplete")
    candidate_count = int(cast(int,manifest["candidate_count"]))
    display_count = int(cast(int,manifest["display_count"]))
    counts = manifest["candidate_counts_by_type"]
    if not isinstance(counts, dict) or sum(int(value) for value in counts.values()) != candidate_count:
        raise ValueError("signal candidate counts do not reconcile")
    if display_count != min(candidate_count, 10):
        raise ValueError("signal display count does not reconcile")
    identities = [str(row["signal_id"]) for row in signals]
    overall_ranks = [int(cast(int,row["overall_rank_position"])) for row in signals]
    if len(identities) != len(set(identities)) or overall_ranks != sorted(set(overall_ranks)):
        raise ValueError("signal identities and overall ranks must be unique and ordered")
    if signal_type is None:
        if len(signals) != display_count or overall_ranks != list(range(1, display_count + 1)):
            raise ValueError("overall signal queue must retain contiguous published ranks")
    elif any(row["signal_type"] != signal_type for row in signals):
        raise ValueError("filtered signal queue contains another signal type")


def _validated_signal_evidence(signal: SignalDetailRow, evidence: list[SignalEvidenceRow]) -> None:
    if any(row.signal_id != signal.signal_id for row in evidence):
        raise ValueError("signal evidence identity mismatch")
    if signal.signal_type in {"availability", "inventory_imbalance"}:
        expected_dates = {signal.observation_date + timedelta(days=offset) for offset in range(1, 29)}
        if len(evidence) != 84 or any(row.evidence_type != "inventory_projection" for row in evidence):
            raise ValueError("inventory signal evidence must contain three complete 28-day paths")
        for path in ("low", "base", "high"):
            rows = [row for row in evidence if row.path == path]
            if len(rows) != 28 or {row.evidence_date for row in rows} != expected_dates:
                raise ValueError("inventory signal evidence must contain three complete 28-day paths")
        if any(
            row.demand_units is None or row.scheduled_inbound_units is None or row.opening_units is None
            or row.ending_units is None or row.lost_units is None
            or row.actual_units is not None or row.retailer_forecast_units is not None or row.adjusted_forecast_units is not None
            for row in evidence
        ):
            raise ValueError("inventory signal evidence fields do not match contract")
        if signal.signal_type == "availability" and any(row.target_units is not None for row in evidence):
            raise ValueError("availability evidence cannot contain an inventory target")
        if signal.signal_type == "inventory_imbalance" and any(row.target_units is None for row in evidence):
            raise ValueError("inventory imbalance evidence requires an inventory target")
        return
    historical = [row for row in evidence if row.evidence_type == "historical_week"]
    forward = [row for row in evidence if row.evidence_type == "forward_demand"]
    expected_forward = {signal.observation_date + timedelta(days=offset) for offset in range(1, 29)}
    if (
        len(evidence) != 36 or len(historical) != 8 or len(forward) != 28
        or len({row.evidence_date for row in historical}) != 8
        or any(row.path is not None or row.evidence_date >= signal.observation_date for row in historical)
        or any(row.path != "base" for row in forward)
        or {row.evidence_date for row in forward} != expected_forward
        or any(
            row.actual_units is None or row.retailer_forecast_units is None
            or row.adjusted_forecast_units is not None or row.demand_units is not None
            or row.scheduled_inbound_units is not None or row.opening_units is not None
            or row.ending_units is not None or row.lost_units is not None or row.target_units is not None
            for row in historical
        )
        or any(
            row.retailer_forecast_units is None or row.adjusted_forecast_units is None
            or row.actual_units is not None or row.demand_units is not None
            or row.scheduled_inbound_units is not None or row.opening_units is not None
            or row.ending_units is not None or row.lost_units is not None or row.target_units is not None
            for row in forward
        )
    ):
        raise ValueError("demand momentum evidence must contain eight historical weeks and 28 forward days")


def create_app(data_root: Path) -> FastAPI:
    root = data_root.resolve()
    app = FastAPI(title="Memento Signal API", version=SIGNAL_API_CONTRACT_VERSION)

    def signal_store() -> SignalStore:
        return SignalStore(root / "signals", root / "canonical")

    @app.exception_handler(ApiProblem)
    async def api_problem_handler(_request: Request, exc: ApiProblem) -> JSONResponse:
        return _error_response(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return _error_response(422, "invalid_request", "The request does not match the API contract.")

    @app.exception_handler(Exception)
    async def unexpected_error_handler(_request: Request, _exc: Exception) -> JSONResponse:
        return _error_response(500, "internal_error", "The Memento Signal API could not complete the request.")

    @app.get("/healthz", response_model=HealthResponse)
    def healthz() -> HealthResponse:
        try:
            manifest = signal_store().run()
            return HealthResponse(signal_set_id=str(manifest["signal_set_id"]))
        except (FileNotFoundError, OSError, ValueError, KeyError, TypeError) as exc:
            raise ApiProblem(503, "release_unavailable", "The current signal release is unavailable or invalid.") from exc

    @app.get("/v1/signals", response_model=SignalQueueResponse, responses={503: {"model": SignalApiError}})
    def signal_queue(signal_type: Literal["availability", "demand_momentum", "inventory_imbalance"] | None = None) -> SignalQueueResponse:
        try:
            store = signal_store()
            manifest = store.run()
            rows = store.top_signals(signal_type)
            _validate_signal_queue_release(manifest, rows, signal_type)
            identities = store.display_identities(rows) if rows else {}
            signals = []
            for row in rows:
                payload = {name: row.get(name) if name in OPTIONAL_PRIORITY_FIELDS else row[name] for name in SignalRow.model_fields if name != "identity"}
                signals.append(SignalRow.model_validate({**payload, "identity": identities[str(row["signal_id"])]}))
            run_values = {name: manifest.get(name) for name in SignalRunMetadata.model_fields}
            configuration = manifest.get("configuration", {})
            if not isinstance(configuration,dict):
                raise ValueError("invalid signal configuration")
            run_values.update(calibration_status=configuration.get("calibration_status"),
                              supply_projection_counts=configuration.get("projection_counts"))
            run_values.update(priority_policy=configuration.get("priority_policy"), confidence_policy=configuration.get("confidence_policy"),
                              source_signal_set_id=configuration.get("source_signal_set_id"), ranking_weights=configuration.get("weights"))
            run = SignalRunMetadata.model_validate(run_values)
            return SignalQueueResponse(run=run, signals=signals)
        except (FileNotFoundError, OSError, ValueError, KeyError, TypeError) as exc:
            raise _signal_problem(503, "release_integrity_error", "The Memento Signal release failed integrity validation.") from exc

    @app.get("/v1/signals/{signal_id}", response_model=SignalDetailResponse, responses={404: {"model": SignalApiError}, 422: {"model": SignalApiError}, 503: {"model": SignalApiError}})
    def signal_detail(signal_id: str) -> SignalDetailResponse:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.")
        try:
            store = signal_store()
            row = store.signal(signal_id)
            if row is None:
                raise _signal_problem(404, "signal_not_found", "The signal is not in the current overall top ten.")
            identity = store.display_identities([row])[signal_id]
            payload = {name: row.get(name) if name in OPTIONAL_PRIORITY_FIELDS else row[name] for name in SignalDetailRow.model_fields if name != "identity"}
            detail = SignalDetailRow.model_validate({**payload, "identity": identity})
            evidence = [SignalEvidenceRow.model_validate(item) for item in store.evidence(signal_id)]
            _validated_signal_evidence(detail, evidence)
            context = store.supply_context(signal_id)
            return SignalDetailResponse(signal=detail, evidence=evidence, supply_context=SupplyContext.model_validate(context) if context is not None else None)
        except ApiProblem:
            raise
        except ValueError as exc:
            if "signal identity" in str(exc):
                raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.") from exc
            raise _signal_problem(503, "release_integrity_error", "The Memento Signal release failed integrity validation.") from exc
        except (FileNotFoundError, OSError, KeyError, TypeError) as exc:
            raise _signal_problem(503, "release_integrity_error", "The Memento Signal release failed integrity validation.") from exc

    @app.get("/v1/signals/{signal_id}/investigation", response_model=Investigation)
    def signal_investigation(signal_id: str, signal_set_id: str) -> Investigation:
        if not SIGNAL_ID.fullmatch(signal_id):
            raise _signal_problem(422, "invalid_signal_id", "The signal identifier is invalid.")
        try:
            release, manifest = signal_store().current_release()
            if signal_set_id != manifest["signal_set_id"]:
                raise _signal_problem(409, "release_changed", "The release changed. Reload Attention to continue.")
            with duckdb.connect() as connection:
                found = connection.execute("SELECT count(*) FROM read_parquet(?) WHERE signal_id=? AND is_overall_top_10", [str(release / "signal.parquet"),signal_id]).fetchone()
            if not found or found[0] != 1:
                raise _signal_problem(404, "signal_not_found", "The signal is not in the current overall top ten.")
            return read_investigation(data_root.resolve(), release, manifest, signal_id)
        except ApiProblem:
            raise
        except FileNotFoundError as exc:
            raise _signal_problem(404, "investigation_unavailable", "Visual investigation has not been published for this release.") from exc
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise _signal_problem(503, "release_integrity_error", "The investigation failed integrity validation.") from exc

    return app


app = create_app(Path(os.environ.get("MEMENTO_DATA_ROOT", "data")))
