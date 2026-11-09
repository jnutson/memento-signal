# Memento Signal glossary

Status: current

| Term | Definition |
| --- | --- |
| Observation date | Latest fully closed store business date eligible at the release cutoff. |
| Eligible retailer forecast | Latest forecast created before its target Walmart week and known by the cutoff. |
| Published baseline | Frozen forward demand underlying a Signal release. |
| Availability Risk | Projected depletion with unfulfilled base-path demand inside 28 days. |
| Demand Momentum Gap | Persistent forecast-relative acceleration or deceleration outside the historical error allowance. |
| Inventory Imbalance Exposure | Projected stock above the deterministic target-cover policy. |
| Impact score | Within-type economic midrank normalized to `[0,1]`. |
| Decision lead time | Shortest conservative potentially applicable action duration, or declared review allowance. |
| Decision slack | Material-impact days minus decision lead time. |
| Urgency | `clamp(1 - decision_slack / 28, 0, 1)`; urgency to act, not execution feasibility. |
| Evidence confidence | Forecast quality × completeness × stability; not probability. |
| Priority score | 40% impact + 40% urgency + 20% evidence confidence. |
| Equivalent weeks of supply | Stock divided by fixed snapshot projected average weekly base demand. |
| Investigation | Release-bound Situation → Explanation → Numbers evidence for one displayed signal. |

Walmart Item Number is a retailer identifier, not Miro's internal item identity.
Store On Hand excludes in-transit and distribution-center inventory. Store On Order and
Store In Transit are calculated from deduplicated latest-known PO-line state and must
not be added until their quantities are known to be disjoint.

Low/base/high demand paths and early/typical/conservative supply paths are arithmetic
sensitivities, not probabilities or prediction intervals. Projected inventory is not
actual inventory. Estimated lost sales is not Walmart POS sales or realized loss.

The additive customer workspace uses view contracts **UI-W01** (common-week sales,
coverage, WoW and unit share), **UI-W02** (existing observed-store-day velocity),
**UI-W03** (published 28-day paths and cumulative unmet retail exposure) and
**UI-W04** (paged store visibility). Their implemented grains, units, coverage,
missing-value and rounding rules are defined in
[core-product-ui.md](core-product-ui.md). They do not change predecessor metric,
forecast, supply or ranking formulas and do not import the separate demo's staged
calendar, 13-week recovery or shipment-value basis.
