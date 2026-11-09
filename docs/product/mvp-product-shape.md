# Memento Signal MVP product shape

Status: current

Memento Signal presents one immutable ranked queue containing Availability Risk,
Demand Momentum Gap, and Inventory Imbalance Exposure. Every row preserves its native
metric and economic basis. Impact normalization occurs within signal type, while the
overall priority policy combines impact, urgency, and evidence confidence.

## Experience

- **Monday** summarizes the current published queue.
- **Attention** provides the same overall top ten as a ranked feed or spatial graph.
- **Reports** shows release coverage, economics by basis, and reproducibility metadata.
- Selecting a signal opens Situation, Explanation, and Numbers layers backed by an
  immutable investigation artifact.

Filters narrow the published top ten. They never rerank, renumber, or imply a separate
top ten for each signal type. Dates come from the release rather than the visitor's
clock. Failed validation never falls back to sample metrics.

## Product semantics

- Availability Risk models projected depletion and unfulfilled base-path demand.
- Demand Momentum Gap identifies persistent stockout-aware acceleration or deceleration
  relative to matched retailer forecast history.
- Inventory Imbalance Exposure identifies projected inventory above a deterministic
  reaction-plus-safety target.
- Urgency is urgency to act before the conservative start-by deadline. It is not proof
  that an action is feasible or authorized.
- Confidence measures evidence quality. It is not probability.
- Revenue, contribution, inventory capital, and carrying cost remain separate economic
  bases and are never summed into a fabricated business-impact total.

The persisted grain is `signal_as_of x store_id x product_id x signal_type x
signal_episode`. Ranking is deterministic, and published releases are immutable.

## Current boundary

The demo includes explicit release-set ingestion, canonicalization, deterministic
signal calculation, immutable publication, read-only serving, and a local web UI.

It does not include order execution, editable scenarios, Monte Carlo simulation,
probability claims, historical report archives, authentication, tenancy, production
deployment, or a persistent operational database.
