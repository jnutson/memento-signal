"""Explicit descriptive definitions; not an ontology or action registry."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date
import math


VERSION = "retail-backend-metrics-v5"
PLANNED_SUPPLY_VERSION = "retail-backend-metrics-v4"
RETAILER_BASELINE_VERSION = "retail-backend-metrics-v3"
PREVIOUS_VERSION = "retail-backend-metrics-v2"
LEGACY_VERSION = "retail-descriptive-metrics-v1"
FORMULAS = {
    "store_day_rate": "fulfilled net units / valid eligible observed store-days",
    "units_store_week": "7 * fulfilled net units / valid eligible observed store-days",
    "dollars_store_week": "7 * actual retail sales dollars / valid eligible observed store-days",
    "reported_oos_rate": "reported zero-on-hand days / valid eligible inventory days",
    "in_stock_rate": "1 - reported_oos_rate",
    "distribution": "due promised = stocked + confirmed zero + unknown; unconfirmed = zero + unknown",
    "trend_pct": "100 * (current same-store units/day / prior same-store units/day - 1); null if prior <= 0",
    "weekday_index": "7 * weekday exposure-adjusted units/day / sum(all seven weekday rates)",
    "dollar_velocity_trend": "100 * (current same-store retail dollars/day / prior same-store retail dollars/day - 1)",
    "total_trend": "100 * (current period total / prior period total - 1); includes distribution changes",
    "days_of_cover": "fresh on-hand units / (28-day base demand / 28); null if reference demand is zero or unavailable",
    "projected_unfulfilled_units": "sum(max(daily demand - opening stock - known dated firm receipts, 0))",
    "conditional_planned_inbound": "sum(remaining_planned_qty) for available, future-placement, store-dated plans; converted/withdrawn/missed-placement units never become additional firm supply",
    "conditional_unfulfilled_reduction_units": "firm-only projected unfulfilled units minus conditional firm-plus-plan projected unfulfilled units; not causal prevented sales or savings",
}


@dataclass(frozen=True)
class MetricConfig:
    tier_baseline_end: date
    minimum_coverage: float = 0.9
    trend_percent: float = 15.0
    trend_minimum_units: float = 7.0
    weekly_persistence: int = 2
    trend_minimum_dollars: float = 50.0
    minimum_weekday_observations: int = 4
    quality_window_days: int = 28
    demand_model: str = "retailer_baseline"
    excess_cover_days: int = 40
    annual_carrying_cost_rate: float | None = None

    def __post_init__(self):
        if type(self.excess_cover_days) is not int or not 1 <= self.excess_cover_days <= 180:
            raise ValueError("invalid excess cover target")
        if self.annual_carrying_cost_rate is not None and (not math.isfinite(self.annual_carrying_cost_rate) or not 0 <= self.annual_carrying_cost_rate <= 1):
            raise ValueError("invalid carrying cost rate")
        if self.demand_model not in {"retailer_baseline", "historical_adjusted"}:
            raise ValueError("unsupported demand model")
        if self.tier_baseline_end.weekday() != 4:
            raise ValueError("tier baseline must end on a completed Friday")
        if not math.isfinite(self.minimum_coverage) or not 0 < self.minimum_coverage <= 1:
            raise ValueError("invalid coverage threshold")
        if any(not math.isfinite(x) or x <= 0 for x in (self.trend_percent, self.trend_minimum_units, self.trend_minimum_dollars)):
            raise ValueError("invalid trend threshold")
        if type(self.weekly_persistence) is not int or not 1 <= self.weekly_persistence <= 8:
            raise ValueError("invalid weekly persistence")
        if type(self.minimum_weekday_observations) is not int or not 1 <= self.minimum_weekday_observations <= 8:
            raise ValueError("invalid weekday evidence minimum")
        if type(self.quality_window_days) is not int or not 7 <= self.quality_window_days <= 56:
            raise ValueError("invalid quality window")

    def document(self) -> dict:
        return {**asdict(self), "tier_baseline_end": self.tier_baseline_end.isoformat()}
