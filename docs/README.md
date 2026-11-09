# Documentation map

Only current contracts and operating instructions live in this tree. Superseded plans,
handoffs, acceptance snapshots, and the retired standalone OOS product are available in
Git history rather than duplicated beside active documentation.

## Architecture

- `canonical-retail-v1.md` — canonical schemas, identifiers, and lineage
- `ingestion.md` — source validation and immutable canonical publication
- `signal-serving.md` — immutable Signal release discovery and HTTP boundary
- `data-classification.md` — handling rules by data class
- `trust-boundaries.md` — present and future system boundaries

## Product

- `finding-evidence-contract.md` — deterministic three-promise findings, exhaustive
  store evidence, formulas, financial/timing limitations and read-only API; no ranking
- `finding-evidence-acceptance.md` — tests, pinned temporal replay and demonstration
  observations for the backend finding/evidence layer
- `planned-supply-backend-contract.md` — validated planned-order feed, separate firm
  and conditional expected projections, conversion/coverage rules and read-only API
- `planned-supply-backend-acceptance.md` — pinned demo releases, all ten replay
  cutoffs, conditional comparison counts, tests and explicitly deferred UI/ranker/ontology

Proposed demo-completion reset (2026-10-19): `demo-completion-plan.md` bounds the
remaining work to three deck promises, authored stories and healthy controls, minimal
source amendments, a coherent analytical queue, and presentation/export acceptance.
Its synthetic source and planned-feed backend bridge were explicitly authorized and
implemented; the previously deferred UI/ranker work is not authorized by it.

Planned implementation sequence: synthetic data rework in `jnutson/walmart-synthetic`
-> metric/supply-map foundation in Memento -> ontology registry, including refined
action branches and lead times. These plans do not authorize implementation by themselves.

Retailer-baseline iteration: source v2 golden -> unchanged-retailer-forecast Memento
baseline and revised evaluation -> frozen holdout publication/evaluation. Ranker,
replacement UI and ontology remain deferred.

- `retailer-forecast-baseline-reset-plan.md` — controlling cross-repository amendment:
  reviewed velocity mix, explicit scenario outcomes, retailer-forecast baseline,
  separate warning/date/burden measures, freeze gates and implementation ownership
- `retailer-forecast-baseline-acceptance.md` — implementation verification, frozen
  benchmark identities and measured results for the retailer-baseline reset

- `mvp-product-shape.md` — current demo experience and non-goals
- `mvp-metric-contract.md` — current signal, priority, and investigation rules
- `descriptive-metric-contract.md` — backend v2 formulas, coverage, exhaustive firm
  supply metrics, publication/API and temporal evaluation instructions
- `descriptive-metric-acceptance.md` — golden/holdout metric evaluation, measured
  predictive limitations, test evidence and explicitly deferred ranker/UI/ontology
- `memento-glossary.md` — current source and derived terminology
- `data-scope.md` — accepted observable and internal inputs
- `supply-contract.md` — synthetic supply assumptions and planning evidence
- `focus-ui-draft.md` — alternative guided UI concept and local follow-through scope
- `availability-foundation-plan.md` — prerequisite exhaustive store-item Availability
  coverage, state classification, deadline-first ranking, and evaluation plan
- `temporal-synthetic-evaluation-source-plan.md` — implementation plan for the
  `walmart-synthetic` 10-item/1,000-store temporal release and evaluation source
- `decision-semantic-registry-plan.md` — proposed governed bridge from metrics to
  outcomes, response options, explanations, and later learning

## Operations

- `product/connected-demo-implementation.md` — connected `/signal` flow, demo-only
  review notes, confidence/prose corrections, launch and verification boundaries

- `runbooks/agent-delivery.md` — repository-local verification and handoff workflow
