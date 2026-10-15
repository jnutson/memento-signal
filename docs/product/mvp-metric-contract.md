# Memento Signal metric contract

Status: current
Priority policy: `deadline-urgency-v1`
Ranker: `memento-signal-urgency-ranker-v2`

Every calculation is deterministic and reproducible from the canonical manifest,
declared configuration, and versioned assumptions. No random sampling, black-box model,
or interactive scenario state participates in publication.

## Common priority

```text
decision_lead_time_days = shortest conservative duration among potentially
  applicable actions, or the declared review allowance when none applies
decision_slack_days = days_until_material_impact - decision_lead_time_days
urgency_score = clamp(1 - decision_slack_days / 28, 0, 1)
confidence_score = forecast_quality * data_completeness * stability_score
rank_score = 0.40 * impact_score + 0.40 * urgency_score + 0.20 * confidence_score
```

Scores are rounded to six decimals. Economic impact is normalized by midrank within
signal type. Deterministic ties use signal type, store, product, direction, and stable
signal identity. Overall ranks are assigned before the display limit.

Urgency is independent of execution feasibility. Unknown prerequisites remain unknown
and cannot authorize an action. Confidence is evidence quality and cannot exceed its
weakest component apart from rounding.

## Availability Risk

Use the latest closed inventory observation, eligible firm inbound, and low/base/high
daily demand sensitivities over 28 days. The base path must deplete and produce at
least one unfulfilled unit. The headline is estimated lost units; primary economics are
estimated lost retail sales. Contribution impact is published separately.

## Demand Momentum Gap

Use six qualifying baseline weeks and two recent weeks with matched forecast vintages.
Both recent weeks must diverge in the same direction. Clamp the recent-to-baseline
multiplier to `[0.50, 1.50]` and suppress gaps that do not exceed the historical WAPE
allowance. Acceleration and deceleration retain distinct contribution semantics.

## Inventory Imbalance Exposure

Project the same 28-day demand and inbound path. Target cover is the effective reaction
allowance plus `ceil(7 * clamped_wape)` safety days. Suppress excess when the base path
depletes. Publish inventory capital and 28-day carrying cost separately.

## Investigation contract

`attention-investigation-stock-cover-v1` uses:

```text
reference_weekly_demand = sum(published base demand over 28 days) / 4
equivalent_weeks_of_supply = selected stock / reference_weekly_demand
```

Zero reference demand produces null cover. Weekly flows sum daily rows; opening and
closing inventory are balances. Actual and projected partial weeks remain separate.
Investigation artifacts do not change admission, economics, scores, or rank.

## Publication

A run publishes a complete immutable Signal set or nothing. The manifest binds source
release identities, canonical dataset identity, configuration hash, contract versions,
row counts, file sizes, and SHA-256 hashes. Serving never recomputes results.
