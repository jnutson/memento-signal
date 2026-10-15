from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal, cast

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator

from .signal_contract import URGENCY_RANKER_VERSION


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
    candidate_counts_by_type: dict[
        Literal["availability", "demand_momentum", "inventory_imbalance"],
        Annotated[int, Field(ge=0)],
    ]
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
        timing = (
            self.urgency_score,
            self.decision_slack_days,
            self.decision_lead_time_days,
            self.urgency_basis,
            self.urgency_action,
        )
        if any(value is not None for value in timing):
            if any(value is None for value in timing) or (
                self.decision_slack_days
                != self.days_until_material_impact - cast(int, self.decision_lead_time_days)
            ):
                raise ValueError("urgency timing must be complete and reconcile")
            expected = max(
                Decimal(0),
                min(
                    Decimal(1),
                    Decimal(1) - Decimal(cast(int, self.decision_slack_days)) / Decimal(28),
                ),
            ).quantize(Decimal("0.000001"))
            if self.urgency_score != expected:
                raise ValueError("urgency score must reconcile with deadline")
            priority = (
                Decimal("0.4") * self.impact_score
                + Decimal("0.4") * cast(Decimal, self.urgency_score)
                + Decimal("0.2") * self.confidence_score
            ).quantize(Decimal("0.000001"))
            if abs(self.rank_score - priority) > Decimal("0.000001"):
                raise ValueError("urgency priority must reconcile with weights")
        expected_direction = {
            "availability": {"risk"},
            "demand_momentum": {"acceleration", "deceleration"},
            "inventory_imbalance": {"excess"},
        }
        if self.signal_direction not in expected_direction[self.signal_type]:
            raise ValueError("signal direction does not match signal type")
        inventory_values = (
            self.estimated_cost_impact_amount,
            self.inventory_cost_exposed_amount,
            self.carrying_cost_28d_amount,
        )
        if self.signal_type == "inventory_imbalance":
            if (
                self.estimated_retail_sales_impact_amount is not None
                or self.estimated_contribution_impact_amount is not None
                or any(value is None for value in inventory_values)
            ):
                raise ValueError("inventory imbalance economics do not match contract")
        elif (
            self.estimated_retail_sales_impact_amount is None
            or self.estimated_contribution_impact_amount is None
            or any(value is not None for value in inventory_values)
        ):
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
    def priority_contract(self) -> "SignalDetailRow":
        if self.ranker_version == URGENCY_RANKER_VERSION:
            if self.urgency_score is None:
                raise ValueError("urgency publication is missing urgency")
            expected = (
                self.forecast_quality * self.data_completeness * self.stability_score
            ).quantize(Decimal("0.000001"))
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
    def ordered_dates(self) -> "SupplyArrival":
        values = (self.early, self.typical, self.conservative)
        if any(value is None for value in values):
            if not all(value is None for value in values):
                raise ValueError("partial arrival range")
        elif not cast(date, self.early) <= cast(date, self.typical) <= cast(date, self.conservative):
            raise ValueError("unordered arrival range")
        return self


class SupplyPlan(SupplyArrival):
    planned_order_date: date
    stages: list[str] = []

    @model_validator(mode="after")
    def complete_plan_dates(self) -> "SupplyPlan":
        if (
            self.early is None
            or self.typical is None
            or self.conservative is None
            or self.planned_order_date > self.early
        ):
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
    def feasible_score(self) -> "SupplyAction":
        if not self.early_days <= self.typical_days <= self.conservative_days:
            raise ValueError("unordered action lead times")
        if self.missing_prerequisites and self.score != 0:
            raise ValueError("unknown prerequisites cannot score as actionable")
        if self.feasibility in {"unknown", "not_applicable", "too_late"} and self.score != 0:
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
    supply_timing: dict[
        Literal["committed", "early", "typical", "conservative"], SupplyProjection
    ]
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
