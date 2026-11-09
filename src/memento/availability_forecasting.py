from __future__ import annotations

from collections.abc import Mapping, Sequence

from .metrics import bias_factor, forecast_wape

ForecastPair = tuple[float, float]
SignalKey = tuple[str, str]
AggregateStats = Sequence[float]


def _stats_bias(stats: AggregateStats, minimum_count: int) -> float | None:
    count, actual, forecast = stats
    if count < minimum_count or forecast <= 0:
        return None
    return min(max(actual / forecast, 0.5), 1.5)


def choose_bias(
    key: SignalKey,
    product_id: str,
    pairs_by_key: Mapping[SignalKey, list[ForecastPair]],
    item_stats: Mapping[str, AggregateStats],
    brand_stats: AggregateStats,
) -> tuple[float, str]:
    own = pairs_by_key.get(key, [])[-8:]
    own_bias = bias_factor(own) if len(own) >= 6 else None
    if own_bias is not None:
        return own_bias, "store_item"
    item_bias = _stats_bias(item_stats[product_id], 20)
    if item_bias is not None:
        return item_bias, "item"
    brand_bias = _stats_bias(brand_stats, 20)
    if brand_bias is not None:
        return brand_bias, "brand"
    return 1.0, "default"


def _stats_wape(stats: AggregateStats, minimum_count: int) -> float | None:
    count, actual, absolute_error = stats
    if count < minimum_count or actual <= 0:
        return None
    return absolute_error / actual


def choose_wape(
    key: SignalKey,
    product_id: str,
    pairs_by_key: Mapping[SignalKey, list[ForecastPair]],
    item_stats: Mapping[str, AggregateStats],
    brand_stats: AggregateStats,
) -> float | None:
    own = pairs_by_key.get(key, [])[-8:]
    if len(own) >= 6:
        return forecast_wape(own)
    item_wape = _stats_wape(item_stats[product_id], 20)
    if item_wape is not None:
        return item_wape
    return _stats_wape(brand_stats, 20)
