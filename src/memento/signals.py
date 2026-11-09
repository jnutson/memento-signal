from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

from .availability_inputs import build_availability_inputs
from .availability_signal import build_availability_candidates
from .demand_signal import build_demand_candidate
from .inventory_signal import build_inventory_candidate
from .manifest import sha256_file
from .metrics import clamp, confidence_score, project_inventory, reaction_metrics, timing_stability
from .models import IngestionFailure, ValidationResult
from .signal_contract import (
    SIGNAL_TYPE_ORDER,
    CandidateBatch,
    Observation,
    decimal_value,
    stable_signal_id,
)
from .signal_inputs import daily_base_forecast, load_signal_inputs, minimum_reaction
from .signal_publication import publish_signal_set
from .signal_ranking import rank_signal_candidates
from .supply import (
    SupplyModel,
    action_options,
    json_context,
    load_model,
    order_arrivals,
    projection_context,
)

__all__ = ["rank_signal_candidates", "run_signals"]


def _valid_observation(observation: Observation) -> bool:
    return (
        float(observation["on_hand"]) >= 0
        and observation["price"] is not None
        and float(observation["price"]) >= 0
        and observation["assorted"]
        and observation["replenishment_enabled"]
        and observation["location_status"] in {"O", "OPEN", "Open"}
    )


def _expected_supply_availability(
    *,
    observation: Observation,
    manifest: dict[str, object],
    source: dict[str, object],
    daily: list[float],
    selected_inbound: dict[date, float],
    selected_wape: Decimal | None,
    model: SupplyModel,
) -> tuple[dict[str, object] | None, list[dict[str, object]]]:
    band = clamp(float(selected_wape) if selected_wape is not None else 1, 0, 1)
    days = [
        observation["observation_date"] + timedelta(days=offset)
        for offset in range(1, 29)
    ]
    trace, depletion = project_inventory(
        float(observation["on_hand"]),
        days,
        {
            "low": [value * (1 - band) for value in daily],
            "base": daily,
            "high": [value * (1 + band) for value in daily],
        },
        selected_inbound,
    )
    lost = sum(row.lost_units for row in trace if row.path == "base")
    base_date = depletion["base"]
    if base_date is None or lost < model.planning_policy.minimum_lost_units:
        return None, []
    count_days = (base_date - observation["observation_date"]).days
    _, stability = timing_stability(depletion["high"], base_date, depletion["low"])
    candidate = dict(source)
    signal_id = stable_signal_id(
        str(manifest["source_release_set_id"]),
        str(manifest["as_of"]),
        str(observation["store_id"]),
        str(observation["product_id"]),
        "availability",
        str(base_date),
    )
    price = float(observation["price"] or 0)
    candidate.update(
        signal_id=signal_id,
        days_until_material_impact=count_days,
        headline_metric_value=decimal_value(lost, 6),
        estimated_retail_sales_impact_amount=decimal_value(lost * price, 2),
        primary_economic_value=decimal_value(lost * price, 2),
        estimated_contribution_impact_amount=decimal_value(
            lost * max(price - observation["unit_cost"], 0), 2
        ),
        stability_score=decimal_value(stability or 0, 6),
    )
    _, updated_confidence = confidence_score(
        1 - float(str(candidate["forecast_quality"])),
        float(str(candidate["data_completeness"])),
        stability or 0,
    )
    candidate["confidence_score"] = decimal_value(updated_confidence, 6)
    evidence = [
        {
            "signal_id": signal_id,
            "evidence_type": "inventory_projection",
            "evidence_date": row.date,
            "path": row.path,
            "actual_units": None,
            "retailer_forecast_units": None,
            "adjusted_forecast_units": None,
            "demand_units": decimal_value(row.demand_units, 6),
            "scheduled_inbound_units": decimal_value(row.inbound_units, 6),
            "opening_units": decimal_value(row.opening_units, 6),
            "ending_units": decimal_value(row.ending_units, 6),
            "lost_units": decimal_value(row.lost_units, 6),
            "target_units": None,
        }
        for row in trace
    ]
    return candidate, evidence


def run_signals(
    canonical_root: Path,
    *,
    data_root: Path,
    annual_carrying_cost_rate: Decimal,
    carrying_rate_version: str,
    supply_model_path: Path | None = None,
) -> Path:
    """Orchestrate independent candidate producers, ranking, and atomic publication."""
    canonical_root = canonical_root.resolve(strict=True)
    if not Decimal("0") <= annual_carrying_cost_rate <= Decimal("1"):
        raise ValueError("annual carrying cost rate must be between zero and one")
    if not carrying_rate_version.strip():
        raise ValueError("carrying rate version is required")
    manifest = json.loads((canonical_root / "manifest.json").read_text())
    signal_as_of = datetime.fromisoformat(
        str(manifest["as_of"]).replace("Z", "+00:00")
    )
    model = None
    if supply_model_path is not None:
        supply_config = manifest.get("supply_model") or {}
        if not isinstance(supply_config, dict):
            raise ValueError("invalid supply model configuration")
        model = load_model(
            supply_model_path,
            signal_as_of.date(),
            supply_config.get("sha256"),
        )
    files = manifest.get("files", [])
    if not isinstance(files, list):
        raise ValueError("invalid canonical file inventory")
    tables = {
        str(item["path"]).split("/", 1)[0]
        for item in files
        if isinstance(item, dict) and "path" in item
    }
    if "company_item_economics" not in tables:
        raise IngestionFailure(
            "signal_validation",
            [
                ValidationResult(
                    "SIGNAL_ECONOMICS_REQUIRED",
                    "FAIL",
                    "company_item_economics",
                    1,
                    "approved unit economics are required",
                )
            ],
        )

    availability_inputs = build_availability_inputs(canonical_root)
    inputs = load_signal_inputs(
        canonical_root,
        availability_inputs,
        signal_as_of,
        include_supply=model is not None,
    )
    if not inputs.observations:
        raise IngestionFailure(
            "signal_validation",
            [
                ValidationResult(
                    "SIGNAL_OBSERVATIONS_REQUIRED",
                    "FAIL",
                    count=1,
                    summary="no eligible observations resolved",
                )
            ],
        )

    batch = build_availability_candidates(
        inputs=availability_inputs,
        observations=inputs.observations,
        canonical_manifest=manifest,
    )
    baseline_availability = {
        (str(row["store_id"]), str(row["product_id"])): row
        for row in batch.candidates
    }
    committed_batch = (
        CandidateBatch(candidates=[dict(row) for row in batch.candidates])
        if model is not None
        else None
    )
    baseline_ranks: dict[tuple[str, str], dict[str, object]] = {}
    if model is not None:
        batch.candidates.clear()
        batch.evidence.clear()
        baseline_ranks = {
            key: dict(value) for key, value in baseline_availability.items()
        }
    supply_rows: list[dict[str, str]] = []
    projection_counts = {
        "committed": 0,
        "early": 0,
        "typical": 0,
        "conservative": 0,
    }

    for observation in inputs.observations:
        if not _valid_observation(observation):
            batch.reason_codes.extend(
                [
                    "demand_momentum_invalid_observation",
                    "inventory_imbalance_invalid_observation",
                ]
            )
            continue
        key = (str(observation["store_id"]), str(observation["product_id"]))
        history = inputs.histories.get(key, [])
        future = sorted(
            inputs.forecasts_by_key.get(key, []),
            key=lambda row: row["target_retail_year_week"],
        )
        daily = daily_base_forecast(
            observation, future, inputs.weekday_inputs, inputs.calendar_rows
        )
        if len(daily) != 28:
            batch.reason_codes.extend(
                [
                    "demand_momentum_missing_forward_horizon",
                    "inventory_imbalance_missing_forward_horizon",
                ]
            )
            continue
        reaction_days = minimum_reaction(observation, inputs.reactions)
        context = None
        selected_inbound = dict(inputs.inbounds.get(key, {}))
        first_candidate = len(batch.candidates)

        if model is not None:
            category = inputs.categories[str(observation["product_id"])]
            orders = inputs.orders_by_key.get(key, [])
            arrivals = [
                portion
                for row in orders
                for portion in order_arrivals(
                    row, observation["observation_date"], model, category
                )
            ]
            context = projection_context(
                float(observation["on_hand"]),
                daily,
                observation["observation_date"],
                arrivals,
                model,
                category,
            )
            selected_inbound = context.pop("firm_inbound")
            for plan in context["planned_replenishment"]:
                day = plan["typical"]
                selected_inbound[day] = selected_inbound.get(day, 0) + plan["quantity"]
            for scenario, result in context["supply_timing"].items():
                projection_counts[scenario] += int(
                    result["lost_units"] >= model.planning_policy.minimum_lost_units
                    and result["first_oos_date"] is not None
                )
            source = baseline_availability.get(key)
            if source is not None:
                selected_wape = future[0].get("forecast_wape") if future else None
                candidate, evidence = _expected_supply_availability(
                    observation=observation,
                    manifest=manifest,
                    source=source,
                    daily=daily,
                    selected_inbound=selected_inbound,
                    selected_wape=selected_wape,
                    model=model,
                )
                if candidate is not None:
                    batch.candidates.append(candidate)
                    batch.evidence.extend(evidence)

        demand_batch = build_demand_candidate(
            observation,
            manifest,
            weekly_history=history,
            forward_daily_forecast=daily,
            minimum_reaction_days=reaction_days,
        )
        if committed_batch is not None:
            committed_batch.candidates.extend(dict(row) for row in demand_batch.candidates)
        batch.extend(demand_batch)

        selected_wape = future[0].get("forecast_wape") if future else None
        forecast_quality = 1 - clamp(
            float(selected_wape) if selected_wape is not None else 1, 0, 1
        )
        if committed_batch is not None:
            committed_batch.extend(
                build_inventory_candidate(
                    observation,
                    manifest,
                    forward_daily_forecast=daily,
                    forecast_quality=forecast_quality,
                    history_count=len(history),
                    minimum_reaction_days=reaction_days,
                    inbound_by_date=inputs.inbounds.get(key, {}),
                    annual_carrying_cost_rate=float(annual_carrying_cost_rate),
                )
            )
        batch.extend(
            build_inventory_candidate(
                observation,
                manifest,
                forward_daily_forecast=daily,
                forecast_quality=forecast_quality,
                history_count=len(history),
                minimum_reaction_days=reaction_days,
                inbound_by_date=selected_inbound,
                annual_carrying_cost_rate=float(annual_carrying_cost_rate),
            )
        )

        if model is not None and context is not None:
            orders = inputs.orders_by_key.get(key, [])
            for candidate in batch.candidates[first_candidate:]:
                options = action_options(
                    int(str(candidate["days_until_material_impact"])),
                    model,
                    inputs.categories[str(observation["product_id"])],
                    any(
                        Decimal(str(row["invoiced_quantity"]))
                        > Decimal(str(row["received_quantity"]))
                        for row in orders
                    ),
                    (
                        "availability"
                        if candidate["signal_type"] == "availability"
                        else str(candidate["signal_direction"])
                    ),
                )
                original_score = candidate["reaction_score"]
                candidate["reaction_score"] = decimal_value(
                    max((row["score"] for row in options), default=0), 6
                )
                candidate["action_slack_days"], _ = reaction_metrics(
                    int(str(candidate["days_until_material_impact"])), reaction_days
                )
                source_context = {
                    **context,
                    "actions": options,
                    "baseline_reaction_score": str(original_score),
                    "baseline_reaction_days": reaction_days,
                    "baseline_availability_present": key in baseline_ranks,
                    "ranking_policy": (
                        "unknown prerequisites contribute zero actionability; "
                        "weights remain 0.50/0.30/0.20"
                    ),
                }
                supply_rows.append(
                    {
                        "signal_id": str(candidate["signal_id"]),
                        "context": json_context(source_context),
                    }
                )

    configuration: dict[str, object] = {
        "annual_carrying_cost_rate": format(annual_carrying_cost_rate, "f"),
        "carrying_rate_version": carrying_rate_version,
        "momentum_multiplier_range": ["0.50", "1.50"],
        "weights": {"impact": "0.50", "reaction": "0.30", "confidence": "0.20"},
        "signal_type_order": list(SIGNAL_TYPE_ORDER),
    }
    if model is not None and supply_model_path is not None:
        configuration.update(
            supply_model_sha256=sha256_file(supply_model_path),
            supply_model_version=model.version,
            supply_projection_version="expected-replenishment-v4",
            actionability_version="prerequisite-aware-v1",
            projection_counts=projection_counts,
            calibration_status=model.calibration,
        )

    ranked = rank_signal_candidates(batch.candidates)
    if model is not None:
        baseline_by_key = {
            (str(row["store_id"]), str(row["product_id"]), str(row["signal_type"])): row
            for row in rank_signal_candidates(
                committed_batch.candidates if committed_batch is not None else []
            )
        }
        current_by_id = {str(row["signal_id"]): row for row in ranked}
        for row in supply_rows:
            candidate = current_by_id[row["signal_id"]]
            baseline = baseline_by_key.get(
                (
                    str(candidate["store_id"]),
                    str(candidate["product_id"]),
                    str(candidate["signal_type"]),
                )
            )
            value = json.loads(row["context"])
            value.update(
                committed_overall_rank=(
                    baseline["overall_rank_position"] if baseline else None
                ),
                committed_rank_score=(str(baseline["rank_score"]) if baseline else None),
            )
            row["context"] = json_context(value)
        batch.evidence.sort(
            key=lambda row: (
                str(row["signal_id"]),
                str(row["evidence_date"]),
                str(row["evidence_type"]),
                str(row["path"]),
            )
        )
        supply_rows.sort(key=lambda row: row["signal_id"])

    return publish_signal_set(
        ranked,
        batch.evidence,
        canonical_manifest=manifest,
        data_root=data_root,
        configuration=configuration,
        reason_codes=batch.reason_codes,
        supply_context=supply_rows if model is not None else None,
    )
