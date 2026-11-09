"""Strict, data-minimized explanatory contract; no ranking or execution controls."""
from datetime import date, datetime, timedelta
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

VERSION = "attention-investigation-v1"
COVER_VERSION = "attention-investigation-stock-cover-v1"
Number = Annotated[float, Field(allow_inf_nan=False)]
Units = Annotated[Number, Field(ge=0)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Day(StrictModel):
    date: date
    week: int
    phase: Literal["actual", "projected"]
    series: Literal["history", "low", "base", "high", "committed", "early", "typical", "conservative"]
    opening: Units | None = None
    stock: Units | None = None
    sales: Number | None = None
    receipts: Units | None = None
    demand: Units | None = None
    fulfilled: Units | None = None
    lost: Units | None = None
    baseline: Units | None = None
    adjusted: Units | None = None
    gap: Number | None = None
    cumulative_gap: Units | None = None
    target: Units | None = None
    within_target: Units | None = None
    excess: Units | None = None
    cover: Units | None = None
    flags: list[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def reconcile(self):
        if self.phase == "actual" and self.series != "history":
            raise ValueError("actual series mismatch")
        if self.phase == "projected" and self.demand is not None:
            if None in (self.opening, self.stock, self.receipts, self.fulfilled, self.lost):
                raise ValueError("incomplete projected balance")
            assert self.opening is not None and self.stock is not None and self.receipts is not None and self.fulfilled is not None and self.lost is not None
            if abs(self.demand - self.fulfilled - self.lost) > .00001 or abs(self.stock - (self.opening + self.receipts - self.fulfilled)) > .00001:
                raise ValueError("projected balance does not reconcile")
        if self.target is not None and self.stock is not None:
            if self.excess is None or self.within_target is None or abs(self.excess - max(self.stock - self.target, 0)) > .00001 or abs(self.stock - self.within_target - self.excess) > .00001:
                raise ValueError("excess decomposition does not reconcile")
        if self.baseline is not None:
            if self.adjusted is None or self.gap is None or abs(self.gap - self.adjusted + self.baseline) > .00001:
                raise ValueError("demand gap does not reconcile")
        return self


class Week(StrictModel):
    key: str
    week: int
    phase: Literal["actual", "projected"]
    series: str
    start: date
    end: date
    days: Annotated[int, Field(ge=1, le=7)]
    partial: bool
    opening: Units | None
    stock: Units | None
    sales: Number | None
    receipts: Units | None
    demand: Units | None
    fulfilled: Units | None
    lost: Units | None
    baseline: Units | None
    adjusted: Units | None
    gap: Number | None
    target: Units | None
    excess: Units | None
    retailer_forecast: Units | None
    forecast_vintage: int | None
    ratio: Units | None
    role: Literal["baseline", "recent", "excluded", "forward"]
    flags: list[str]


class Receipt(StrictModel):
    event_id: str
    state: Literal["open", "in_transit", "planned"]
    quantity: Units
    early: date | None
    typical: date | None
    conservative: date | None
    basis: str
    order_reference: str | None
    line: int | None
    version: int | None
    known_at: datetime | None
    reference_status: Literal["source_version", "assumed_order", "unavailable"]

    @model_validator(mode="after")
    def dates(self):
        values = (self.early, self.typical, self.conservative)
        if not (all(v is None for v in values) or self.early is not None and self.typical is not None and self.conservative is not None and self.early <= self.typical <= self.conservative):
            raise ValueError("arrival window mismatch")
        return self


class Diagnostics(StrictModel):
    baseline_ratio: Units | None = None
    recent_ratio: Units | None = None
    raw_multiplier: Units | None = None
    multiplier: Units | None = None
    error_allowance: Units | None = None
    target_cover_days: Units | None = None
    safety_days: Units | None = None
    material_date: date


class Investigation(StrictModel):
    api_contract_version: Literal["memento-signal-investigation-api-v1"] = "memento-signal-investigation-api-v1"
    contract_version: Literal["attention-investigation-v1"] = VERSION
    cover_version: Literal["attention-investigation-stock-cover-v1"] = COVER_VERSION
    signal_id: Annotated[str, Field(pattern=r"^sig_[0-9a-f]{64}$")]
    signal_set_id: Annotated[str, Field(pattern=r"^mss_[0-9a-f]{64}$")]
    canonical_dataset_id: str
    signal_manifest_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    canonical_manifest_sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    supply_model_sha256: str | None
    configuration_hash: str
    signal_as_of: datetime
    observation_date: date
    signal_type: Literal["availability", "demand_momentum", "inventory_imbalance"]
    direction: Literal["risk", "acceleration", "deceleration", "excess"]
    reference_weekly_demand: Units
    cover_status: Literal["available", "zero_reference_demand"]
    days: Annotated[list[Day], Field(max_length=420)]
    weeks: Annotated[list[Week], Field(max_length=80)]
    receipts: Annotated[list[Receipt], Field(max_length=500)]
    diagnostics: Diagnostics

    @model_validator(mode="after")
    def integrity(self):
        expected = {self.observation_date + timedelta(days=i) for i in range(1, 29)}
        keys = [(row.series, row.date) for row in self.days]
        if len(keys) != len(set(keys)) or len({w.key for w in self.weeks}) != len(self.weeks) or len({r.event_id for r in self.receipts}) != len(self.receipts):
            raise ValueError("duplicate investigation rows")
        for series in {row.series for row in self.days if row.phase == "projected"}:
            if {row.date for row in self.days if row.series == series} != expected:
                raise ValueError("incomplete projected horizon")
        if not any(row.series == "base" for row in self.days):
            raise ValueError("base series required")
        base = [row for row in self.days if row.series == "base"]
        demands = [row.baseline if self.signal_type == "demand_momentum" else row.demand for row in base]
        if any(value is None for value in demands) or abs(sum(value for value in demands if value is not None)/4-self.reference_weekly_demand)>.00001:
            raise ValueError("reference demand must match the published base path")
        for row in self.days:
            if row.phase == "actual" and row.date > self.observation_date:
                raise ValueError("future actuals prohibited")
            if row.stock is not None:
                expected_cover = row.stock / self.reference_weekly_demand if self.reference_weekly_demand else None
                if (row.cover is None) != (expected_cover is None) or expected_cover is not None and row.cover is not None and abs(row.cover - expected_cover) > .00001:
                    raise ValueError("stock cover mismatch")
        for week in self.weeks:
            rows = sorted((d for d in self.days if d.series == week.series and d.week == week.week), key=lambda d:d.date)
            if not rows or len(rows) != week.days or week.start != rows[0].date or week.end != rows[-1].date or week.partial != (week.days != 7) or week.opening != rows[0].opening or week.stock != rows[-1].stock:
                raise ValueError("weekly balances or coverage mismatch")
            for field in ("sales","receipts","demand","fulfilled","lost","baseline","adjusted","gap"):
                values = [getattr(row,field) for row in rows]
                expected = sum(values) if all(v is not None for v in values) else None
                actual = getattr(week,field)
                if (actual is None) != (expected is None) or actual is not None and expected is not None and abs(actual-expected)>.00001:
                    raise ValueError("weekly flow mismatch")
        if {(w.series,w.week) for w in self.weeks} != {(d.series,d.week) for d in self.days}:
            raise ValueError("weekly references incomplete")
        if any(r.known_at is not None and r.known_at > self.signal_as_of for r in self.receipts):
            raise ValueError("future order knowledge prohibited")
        if (self.reference_weekly_demand == 0) != (self.cover_status == "zero_reference_demand"):
            raise ValueError("stock cover status mismatch")
        return self
