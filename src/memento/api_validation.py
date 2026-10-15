from __future__ import annotations

from datetime import timedelta
from typing import cast

from .api_contract import SignalDetailRow, SignalEvidenceRow
from .signal_contract import URGENCY_RANKER_VERSION


def validate_signal_queue_release(
    manifest: dict[str, object],
    signals: list[dict[str, object]],
    signal_type: str | None,
) -> None:
    if manifest.get("ranker_version") == URGENCY_RANKER_VERSION and any(
        row.get("urgency_score") is None for row in signals
    ):
        raise ValueError("urgency publication is incomplete")
    candidate_count = int(cast(int, manifest["candidate_count"]))
    display_count = int(cast(int, manifest["display_count"]))
    counts = manifest["candidate_counts_by_type"]
    if not isinstance(counts, dict) or sum(int(value) for value in counts.values()) != candidate_count:
        raise ValueError("signal candidate counts do not reconcile")
    if display_count != min(candidate_count, 10):
        raise ValueError("signal display count does not reconcile")
    identities = [str(row["signal_id"]) for row in signals]
    overall_ranks = [int(cast(int, row["overall_rank_position"])) for row in signals]
    if len(identities) != len(set(identities)) or overall_ranks != sorted(set(overall_ranks)):
        raise ValueError("signal identities and overall ranks must be unique and ordered")
    if signal_type is None:
        if len(signals) != display_count or overall_ranks != list(range(1, display_count + 1)):
            raise ValueError("overall signal queue must retain contiguous published ranks")
    elif any(row["signal_type"] != signal_type for row in signals):
        raise ValueError("filtered signal queue contains another signal type")


def validate_signal_evidence(
    signal: SignalDetailRow,
    evidence: list[SignalEvidenceRow],
) -> None:
    if any(row.signal_id != signal.signal_id for row in evidence):
        raise ValueError("signal evidence identity mismatch")
    if signal.signal_type in {"availability", "inventory_imbalance"}:
        expected_dates = {
            signal.observation_date + timedelta(days=offset) for offset in range(1, 29)
        }
        if len(evidence) != 84 or any(
            row.evidence_type != "inventory_projection" for row in evidence
        ):
            raise ValueError("inventory signal evidence must contain three complete 28-day paths")
        for path in ("low", "base", "high"):
            rows = [row for row in evidence if row.path == path]
            if len(rows) != 28 or {row.evidence_date for row in rows} != expected_dates:
                raise ValueError("inventory signal evidence must contain three complete 28-day paths")
        if any(
            row.demand_units is None
            or row.scheduled_inbound_units is None
            or row.opening_units is None
            or row.ending_units is None
            or row.lost_units is None
            or row.actual_units is not None
            or row.retailer_forecast_units is not None
            or row.adjusted_forecast_units is not None
            for row in evidence
        ):
            raise ValueError("inventory signal evidence fields do not match contract")
        if signal.signal_type == "availability" and any(
            row.target_units is not None for row in evidence
        ):
            raise ValueError("availability evidence cannot contain an inventory target")
        if signal.signal_type == "inventory_imbalance" and any(
            row.target_units is None for row in evidence
        ):
            raise ValueError("inventory imbalance evidence requires an inventory target")
        return

    historical = [row for row in evidence if row.evidence_type == "historical_week"]
    forward = [row for row in evidence if row.evidence_type == "forward_demand"]
    expected_forward = {
        signal.observation_date + timedelta(days=offset) for offset in range(1, 29)
    }
    if (
        len(evidence) != 36
        or len(historical) != 8
        or len(forward) != 28
        or len({row.evidence_date for row in historical}) != 8
        or any(row.path is not None or row.evidence_date >= signal.observation_date for row in historical)
        or any(row.path != "base" for row in forward)
        or {row.evidence_date for row in forward} != expected_forward
        or any(
            row.actual_units is None
            or row.retailer_forecast_units is None
            or row.adjusted_forecast_units is not None
            or row.demand_units is not None
            or row.scheduled_inbound_units is not None
            or row.opening_units is not None
            or row.ending_units is not None
            or row.lost_units is not None
            or row.target_units is not None
            for row in historical
        )
        or any(
            row.retailer_forecast_units is None
            or row.adjusted_forecast_units is None
            or row.actual_units is not None
            or row.demand_units is not None
            or row.scheduled_inbound_units is not None
            or row.opening_units is not None
            or row.ending_units is not None
            or row.lost_units is not None
            or row.target_units is not None
            for row in forward
        )
    ):
        raise ValueError("demand momentum evidence must contain eight historical weeks and 28 forward days")
