from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from .metric_contract import MetricConfig
from .metric_publication import publish_metrics
from .metric_source import series_entry
from .orchestrator import ingest


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest a synthetic temporal cutoff and publish descriptive metrics.")
    parser.add_argument("series", type=Path)
    parser.add_argument("--cutoff", required=True)
    parser.add_argument("--tier-baseline-end", required=True, type=date.fromisoformat)
    parser.add_argument("--data-root", type=Path, default=Path("data"))
    parser.add_argument("--minimum-coverage", type=float, default=.9)
    parser.add_argument("--trend-percent", type=float, default=15)
    parser.add_argument("--trend-minimum-units", type=float, default=7)
    parser.add_argument("--weekly-persistence", type=int, default=2)
    parser.add_argument("--trend-minimum-dollars", type=float, default=50)
    parser.add_argument("--minimum-weekday-observations", type=int, default=4)
    parser.add_argument("--quality-window-days", type=int, default=28)
    parser.add_argument("--no-activate", action="store_true")
    parser.add_argument("--excess-cover-days", type=int, default=40)
    parser.add_argument("--annual-carrying-cost-rate", type=float, default=None)
    parser.add_argument("--demand-model", choices=["retailer_baseline", "historical_adjusted"], default="retailer_baseline")
    args = parser.parse_args()
    config = MetricConfig(args.tier_baseline_end, args.minimum_coverage, args.trend_percent,
                          args.trend_minimum_units, args.weekly_persistence,
                          args.trend_minimum_dollars,args.minimum_weekday_observations,args.quality_window_days,args.demand_model,
                          args.excess_cover_days,args.annual_carrying_cost_rate)
    release, distribution = series_entry(args.series, args.cutoff)
    canonical = ingest(release, data_root=args.data_root, classification="synthetic")
    result = publish_metrics(canonical, distribution, data_root=args.data_root, config=config, activate=not args.no_activate)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
