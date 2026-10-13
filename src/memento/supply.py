"""Deterministic, explicitly assumed supply timing and action prerequisites."""
from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator

from .manifest import sha256_file
from .metrics import project_inventory


class ActionDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    stages: list[str] = Field(min_length=1)
    prerequisites: list[str] = Field(min_length=1)


class PlanningPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reorder_cover_days: int = Field(ge=1, le=90)
    target_cover_days: int = Field(ge=1, le=180)
    minimum_lost_units: float = Field(ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def ordered(self):
        if self.target_cover_days <= self.reorder_cover_days:
            raise ValueError("target cover must exceed reorder cover")
        return self


class SupplyModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1)
    classification: Literal["synthetic_assumption"]
    effective_from: date
    effective_to: date
    calendar: Literal["elapsed_calendar_days"]
    calibration: str
    provenance: dict[str, str]
    stages: dict[str, tuple[StrictInt, StrictInt, StrictInt]]
    category_production: dict[str, str]
    routes: dict[str, list[str] | str]
    actions: dict[str, ActionDefinition]
    planning_policy: PlanningPolicy

    @model_validator(mode="after")
    def validate_references(self):
        if self.effective_to < self.effective_from or not self.stages or not self.actions:
            raise ValueError("invalid supply model coverage")
        for values in self.stages.values():
            if not 0 <= values[0] <= values[1] <= values[2] <= 365:
                raise ValueError("invalid ordered lead-time range")
        if any(stage not in self.stages for stage in self.category_production.values()):
            raise ValueError("unknown production stage")
        for action in self.actions.values():
            if any(stage != "$production" and stage not in self.stages for stage in action.stages):
                raise ValueError("unknown action stage")
        for required in ("vendor_fulfillment", "vendor_to_customer_dc", "customer_dc_processing", "customer_dc_to_store", "store_receiving"):
            if required not in self.stages:
                raise ValueError("missing arrival stage")
        return self

    def duration(self, stages: list[str], category: str) -> tuple[int, int, int]:
        if category not in self.category_production:
            raise ValueError("category has no production profile")
        ranges = [self.stages[self.category_production[category] if stage == "$production" else stage] for stage in stages]
        return tuple(sum(values[index] for values in ranges) for index in range(3))  # type: ignore[return-value]


def load_model(path: Path, observation: date, expected_sha256: str | None = None) -> SupplyModel:
    if not path.is_file() or path.is_symlink() or path.resolve(strict=True) != path.absolute():
        raise ValueError("model must be a regular non-symlink path")
    if path.stat().st_size > 256*1024:
        raise ValueError("supply model exceeds size limit")
    if expected_sha256 is not None and sha256_file(path) != expected_sha256:
        raise ValueError("supply model checksum mismatch")
    try:
        model = SupplyModel.model_validate_json(path.read_text())
    except (ValueError,TypeError):
        raise ValueError("invalid supply model schema") from None
    if not model.effective_from <= observation <= model.effective_to:
        raise ValueError("no effective supply model")
    return model


def arrival(order: dict, observation: date, model: SupplyModel, category: str) -> dict:
    """Use outstanding quantity only; never restart elapsed milestone time."""
    quantity = max(float(order["ordered_quantity"]) - float(order["received_quantity"]), 0)
    if order["status_code"] == "cancelled":
        quantity = 0
    stages = ["customer_dc_to_store", "store_receiving"]
    milestone = order.get("dc_invoiced_at")
    if milestone is None:
        stages = ["vendor_fulfillment", "vendor_to_customer_dc", "customer_dc_processing", *stages]
        milestone = order["order_created_at"]
    milestone_day = milestone.date() if isinstance(milestone, datetime) else date.fromisoformat(str(milestone)[:10])
    durations = model.duration(stages, category)
    estimated = [milestone_day + timedelta(days=value) for value in durations]
    expected = order.get("expected_store_receipt_date")
    if expected is not None:
        if expected <= observation:
            return {"quantity": quantity, "basis": "overdue_explicit_date", "early": None, "typical": None, "conservative": None, "stages": stages}
        # Preserve the explicit central date; assumptions provide sensitivity only.
        spread = (durations[1] - durations[0], durations[2] - durations[1])
        estimated = [max(observation + timedelta(days=1), expected - timedelta(days=spread[0])), expected, expected + timedelta(days=spread[1])]
        basis = "explicit_expected_date_with_assumed_range"
    else:
        if estimated[1] <= observation:
            return {"quantity": quantity, "basis": "overdue_assumed_date", "early": None, "typical": None, "conservative": None, "stages": stages}
        estimated[0] = max(estimated[0], observation + timedelta(days=1))
        basis = "milestone_plus_assumed_lead_time"
    return {"quantity": quantity, "basis": basis, "early": estimated[0], "typical": estimated[1], "conservative": estimated[2], "stages": stages}


def order_arrivals(order: dict, observation: date, model: SupplyModel, category: str) -> list[dict]:
    """Keep unshipped and shipped-but-unreceived portions disjoint."""
    if order["status_code"] == "cancelled":
        return []
    result = []
    open_units = max(float(order["ordered_quantity"])-float(order["invoiced_quantity"]),0)
    transit_units = max(float(order["invoiced_quantity"])-float(order["received_quantity"]),0)
    if open_units:
        portion = {**order,"ordered_quantity":open_units,"received_quantity":0,"dc_invoiced_at":None}
        result.append({**arrival(portion,observation,model,category),"order_state":"open"})
    if transit_units:
        if order.get("dc_invoiced_at") is None:
            raise ValueError("in-transit quantity requires an invoice milestone")
        portion = {**order,"ordered_quantity":transit_units,"received_quantity":0}
        result.append({**arrival(portion,observation,model,category),"order_state":"in_transit"})
    return result


def plan_replenishment(on_hand: float, daily: list[float], observation: date,
                       firm: dict[date, float], model: SupplyModel, category: str,
                       undated_outstanding: float = 0) -> list[dict]:
    """Planning overlay from frozen inputs, never from later actual order outcomes.

    Firm outstanding supply is subtracted through inventory position, preventing
    duplicate planned demand for existing commitments. Plans are snapshot-local;
    a later snapshot discards/rebuilds them after re-reading firm PO state.
    """
    mean = sum(daily) / 28
    threshold = mean * model.planning_policy.reorder_cover_days
    target = mean * model.planning_policy.target_cover_days
    lead = model.duration(["vendor_fulfillment", "vendor_to_customer_dc", "customer_dc_processing", "customer_dc_to_store", "store_receiving"], category)
    outstanding = dict(firm)
    balance = on_hand
    plans = []
    for offset, demand in enumerate(daily, 1):
        day = observation + timedelta(days=offset)
        balance = max(balance + outstanding.pop(day, 0) - demand, 0)
        position = balance + undated_outstanding + sum(units for receipt, units in outstanding.items() if receipt > day)
        if mean > 0 and position <= threshold:
            quantity = math.ceil(max(target - position, 0))
            dates = [day + timedelta(days=days) for days in lead]
            outstanding[dates[1]] = outstanding.get(dates[1], 0) + quantity
            plans.append({"planned_order_date": day, "quantity": quantity, "early": dates[0], "typical": dates[1], "conservative": dates[2], "basis": "assumed_reorder_policy_not_firm_supply"})
    return plans


def action_options(days: int, model: SupplyModel, category: str, has_transit: bool,
                   kind: str, confirmed: set[str] | None = None) -> list[dict]:
    confirmed = confirmed or set()
    if kind not in {"availability", "acceleration"}:
        return []
    options = []
    for name, action in model.actions.items():
        early, typical, conservative = model.duration(action.stages, category)
        missing = [key for key in action.prerequisites if key not in confirmed and not (key == "existing_in_transit" and has_transit)]
        impossible = "existing_in_transit" in action.prerequisites and not has_transit
        timing = "robust" if days >= conservative else "conditional" if days >= early else "too_late"
        status = "not_applicable" if impossible else "unknown" if missing else timing
        score = (1.0 if timing == "robust" else 0.5 if timing == "conditional" else 0.0) if not missing and not impossible else 0.0
        options.append({"action": name, "early_days": early, "typical_days": typical, "conservative_days": conservative,
                        "typical_slack": days - typical, "conservative_slack": days - conservative,
                        "timing": timing, "feasibility": status, "missing_prerequisites": missing,
                        "score": score, "stages": [model.category_production[category] if stage=="$production" else stage for stage in action.stages]})
    return options


def projection_context(on_hand: float, daily: list[float], observation: date, arrivals: list[dict], model: SupplyModel, category: str) -> dict:
    dates = [observation + timedelta(days=i) for i in range(1, 29)]
    firm: dict[date, float] = {}
    for row in arrivals:
        if row["typical"] is not None:
            day = row["typical"]
            firm[day] = firm.get(day, 0) + row["quantity"]
    undated = sum(row["quantity"] for row in arrivals if row["typical"] is None)
    plans = plan_replenishment(on_hand, daily, observation, firm, model, category, undated)
    summary = {}
    for scenario in ("committed", "early", "typical", "conservative"):
        inbound: dict[date, float] = {}
        for row in arrivals + ([] if scenario == "committed" else plans):
            key = "typical" if scenario == "committed" else scenario
            day = row[key]
            if day is not None:
                inbound[day] = inbound.get(day, 0) + row["quantity"]
        trace, oos = project_inventory(on_hand, dates, {path: daily for path in ("low", "base", "high")}, inbound)
        summary[scenario] = {"first_oos_date": oos["base"], "lost_units": sum(row.lost_units for row in trace if row.path == "base")}
    return {"assumption_version": model.version, "classification": model.classification,
            "calibration": model.calibration, "route": "synthetic_domestic", "category": category,
            "arrivals": arrivals, "planned_replenishment": plans, "supply_timing": summary,
            "planning_prerequisites": ["vendor_stock_unverified", "fulfillment_capacity_unverified"],
            "firm_inbound": firm}


def json_context(value: dict) -> str:
    return json.dumps(value, sort_keys=True, default=lambda item: item.isoformat(), separators=(",", ":"))
