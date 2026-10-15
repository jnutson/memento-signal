from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from .metrics import impact_scores, rank_score
from .signal_contract import SIGNAL_TYPE_ORDER, decimal_value


def _number(value: object) -> float:
    if not isinstance(value, (int, float, Decimal)):
        raise TypeError("rank input must be numeric")
    return float(value)


def _integer(value: object) -> int:
    if not isinstance(value, int):
        raise TypeError("rank day input must be an integer")
    return value


def rank_signal_candidates(candidates: list[dict[str, object]], *, urgency_policy: bool = False) -> list[dict[str, object]]:
    """Assign type-relative impact and immutable overall/type ranks in place."""
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in candidates:
        signal_type = str(row["signal_type"])
        if signal_type not in SIGNAL_TYPE_ORDER:
            raise ValueError("unknown signal type")
        grouped[signal_type].append(row)
    for signal_type in SIGNAL_TYPE_ORDER:
        rows = grouped.get(signal_type, [])
        scores = impact_scores([_number(row["primary_economic_value"]) for row in rows])
        for row, impact in zip(rows, scores, strict=True):
            row["impact_score"] = decimal_value(impact, 6)
            priority = (0.40 * impact + 0.40 * _number(row["urgency_score"]) + 0.20 * _number(row["confidence_score"])) if urgency_policy else rank_score(impact, _number(row["reaction_score"]), _number(row["confidence_score"]))
            row["rank_score"] = decimal_value(priority, 6)
        rows.sort(key=lambda row: (-_number(row["rank_score"]), -_number(row["primary_economic_value"]), _integer(row["days_until_material_impact"]), str(row["store_id"]), str(row["product_id"]), str(row["signal_id"])))
        for position, row in enumerate(rows, 1):
            row["signal_type_rank_position"] = position
    candidates.sort(key=lambda row: (-_number(row["rank_score"]), -_number(row["primary_economic_value"]), _integer(row["days_until_material_impact"]), SIGNAL_TYPE_ORDER[str(row["signal_type"])], str(row["store_id"]), str(row["product_id"]), str(row["signal_id"])))
    for position, row in enumerate(candidates, 1):
        row["overall_rank_position"] = position
        row["is_overall_top_10"] = position <= 10
    return candidates
