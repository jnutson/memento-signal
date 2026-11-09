from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import TypedDict


class AvailabilityCandidate(TypedDict):
    candidate_key: str
    observation_date: date
    store_id: str
    product_id: str
    projected_depletion_date: date
    estimated_lost_units: Decimal
    estimated_lost_sales_amount: Decimal
    days_until_depletion: int
    minimum_reaction_days: int
    forecast_quality: Decimal
    data_completeness: Decimal
    timing_stability_score: Decimal


class AvailabilityEvidence(TypedDict):
    candidate_key: str
    projection_date: date
    path: str
    demand_units: Decimal
    scheduled_inbound_units: Decimal
    opening_units: Decimal
    fulfilled_units: Decimal
    lost_units: Decimal
    projected_ending_on_hand_units: Decimal


class AvailabilityForecast(TypedDict):
    signal_as_of: datetime
    store_id: str
    product_id: str
    target_retail_year_week: int
    retailer_forecast_units: Decimal
    forecast_bias_factor: Decimal
    memento_weekly_demand_base: Decimal
    forecast_wape: Decimal | None
    fallback_level: str


@dataclass(frozen=True)
class AvailabilityInputs:
    candidates: list[AvailabilityCandidate]
    evidence: list[AvailabilityEvidence]
    forecasts: list[AvailabilityForecast]
    reason_codes: list[str]
