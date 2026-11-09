# Decision semantic registry direction

Status: proposed direction; not approved for implementation

Prerequisite amendment (2026-10-18): complete and evaluate the separately proposed
`retailer-forecast-baseline-reset-plan.md` before registry work. Source v2 golden
comes before the Memento retailer-forecast baseline, followed by frozen holdout
evaluation. Historical corrections must demonstrate improvement over unchanged
retailer forecasts; they are not automatically part of the baseline. This amendment
does not authorize the ranker, UI, ontology or learned recommendations. Action-path
meaning and lead-time refinement still require substantial product-owner input.

Prerequisite: complete `availability-foundation-plan.md` before implementing this
direction. That plan establishes exhaustive store-item metric coverage, explicit
Availability states, a deadline-first ranker, complete serving, and historical
evaluation. The semantic registry should generalize proven contracts rather than
organize incomplete product truth.

Implementation order: (1) synthetic data rework under
`temporal-synthetic-evaluation-source-plan.md`; (2) metric coverage, supply-state map,
and v1 ranking under `availability-foundation-plan.md`; (3) this ontology registry.
Lead-time refinement and the action-branch matrix below are a key piece of stage 3,
not a prerequisite platform for stage 1.

## Required registry deliverable: action paths and lead-time refinement

Maintain one configurable production path across demo items. Replace the new model's
sewn/molded/assembly split with a shared production stage. Values remain versioned
assumptions until supported by operating evidence.

The central supply path connects demand planning, production readiness, brand stock,
PO authorization, fulfillment, brand-DC-to-retailer-DC transport, retailer processing,
and store availability. Actions branch from the current state of that path. Model
dependencies and concurrent work explicitly; the completion date of a dependency join
is the latest prerequisite-ready date, followed by the remaining serial stages.

| Human response option | Required branch and constraints |
| --- | --- |
| Increase demand plan | Planning/capacity and production, then authorized fulfillment and delivery; changing a plan alone produces no inventory |
| Recommend order increase | Retailer places/amends a PO after a seven-day demo allowance, then stock readiness, fulfillment, and delivery; a recommendation creates no firm commitment |
| Fulfill from existing brand stock | Bypasses new production only when stock is available and a valid PO authorizes sufficient quantity; stock alone cannot authorize shipping |
| Expedite supplier truck | Shortens eligible brand-DC-to-retailer-DC transport; retains retailer processing and store delivery; requires a suitable shipment, quantity, and authority |

Do not present "release vendor stock" as an independently executable option. Resolve
whether the existing PO has unfulfilled authorized quantity; otherwise obtaining a new
or amended PO is a prerequisite. Unknown stock, authorization, or shipment state remains
unknown. Different actions may apply to different portions of the same order.

Every branch definition must encode:

- starting supply state and the actor who can initiate it;
- prerequisite facts and required authorization, each confirmed, absent, or unknown;
- stages bypassed, changed, or retained, with concurrent dependencies;
- earliest, typical, and conservative time to additional stock available at the store;
- authorized quantity, available quantity, and the affected shortage window;
- action-specific start-by date, assumptions, provenance, and effective version; and
- outcome relation: prevent onset, reduce duration/severity, or improve a later cycle.

Evaluate timing and quantity against a frozen shortage projection. Being quick enough
does not establish sufficient quantity, authority, or causal benefit. A plan increase
whose earliest physical effect is after depletion cannot be described as preventing
that stockout; it may still address later shortages. Keep these deterministic rules
human-authored and include their results in AI explanation packets.

Required acceptance examples include a stockout in fourteen days with production
arriving too late; existing stock without a PO; an order increase with seven days to
obtain the PO plus delivery; supplier trucking expedited while retailer stages remain;
partial authorized quantities; unknown prerequisites; and parallel PO/production waits.
The user selects the response. The registry describes its applicability and limitations.

## Purpose

Memento needs a governed semantic layer between deterministic retail metrics and the
business outcomes they inform. The layer must let a human define what each metric
means, when it matters, which response options may be considered, and how later
results should be evaluated.

The immediate product promises in scope are:

- **Never miss a reorder window:** maintain explicit coverage of store-item
  availability, projected depletion, supply timing, and the deadline for a human to
  review available responses.
- **Get more doors with proof:** assemble an item-level expansion case from persistent
  store-level performance, distribution breadth, availability-adjusted velocity,
  economics, comparability, and evidence quality.

The AI may explain governed facts and relationships in clear prose. It does not define
business meaning, decide which action should be taken, change deterministic ranking,
or execute an action.

## Current state

The current implementation already provides useful foundations:

- canonical store, product, sales, inventory, forecast, replenishment, constraint,
  and economics datasets;
- deterministic Availability Risk, Demand Momentum Gap, and Inventory Imbalance
  Exposure calculations;
- store-item Signal identity, economics, confidence, urgency, evidence, and lineage;
- an optional synthetic supply model containing stages, lead-time ranges, planning
  policy, action prerequisites, and supply-arrival sensitivities;
- signal-specific explanation and response copy in the Focus UI draft.

These parts do not yet form a live business ontology:

- the active local Signal release does not publish supply context;
- the API serves the overall top ten rather than an exhaustive outcome assessment;
- non-qualifying store-item states are represented only through aggregate reason-code
  counts, not individually queryable statuses;
- observed out-of-stock status and availability history are not first-class metrics;
- Demand Momentum is a store-item signal, not an item-retailer expansion proof pack;
- outcome meanings and response choices are hard-coded in the UI rather than shared
  through one governed registry;
- human decisions and later outcomes are not retained in a durable evaluation record.

The spatial Attention visualization is a view of impact, urgency, and confidence. It
is not a graph of the retail or supply world.

## Product principles

1. Deterministic calculations remain the source of quantitative truth.
2. Every metric has a stable identifier, grain, unit, horizon, formula version, and
   declared interpretation.
3. Human-authored outcome definitions determine why a metric matters.
4. Coverage is explicit. Every in-scope entity-outcome pair has a status, including
   healthy, insufficient-data, and not-applicable states.
5. Attention is a ranked view over complete assessments, not the only record of the
   assessed world.
6. Action options are enumerated separately from action selection. Preconditions and
   authority remain explicit.
7. AI language is generated only from a validated explanation packet and remains
   traceable to metric, outcome, rule, assumption, and release identifiers.
8. The ontology is versioned and human-governed. A future learned model may score
   approved options but may not silently modify definitions or constraints.
9. Raw, canonical, metric, assessment, decision, and outcome artifacts remain
   physically and logically distinct.
10. The MVP uses DuckDB over Parquet and versioned JSON or YAML definitions. It does
    not introduce a graph database, feature store, or new persistent datastore.

## Proposed conceptual model

```text
canonical facts
    -> metric observations
    -> outcome assessments
    -> attention views and valid response options
    -> AI explanation packet
    -> human decision
    -> later outcome observation
    -> optional future recommendation score
```

The model should support these concepts and relationships:

| Concept | Responsibility |
| --- | --- |
| Entity | Retailer, store, item, calendar period, order line, receipt, and supply-stage identity |
| Metric definition | Governed meaning and calculation contract for one measurement |
| Metric observation | A metric value or explicit unavailable status at its declared grain |
| Outcome definition | A human-authored business result and the evidence relevant to it |
| Outcome assessment | The state of one entity or entity set relative to one outcome |
| Signal | A versioned attention-worthy assessment with evidence and priority |
| Response option | A possible human response with prerequisites, constraints, and lead time |
| Decision event | The option selected by a human, including no-action and rationale |
| Outcome observation | Later measurements associated with the decision and evaluation window |
| Recommendation | A future, non-authoritative score over already-approved response options |

Relationships should be expressible without requiring a graph database. Stable IDs and
foreign-key-like references in validated definitions and Parquet artifacts are enough
for the MVP. A graph representation may be projected later if relationship traversal
or interoperability justifies it.

## Registry artifacts

### Metric registry

Each metric definition should declare:

- stable ID, display name, description, owner, and version;
- entity grain and required dimensions;
- data type, unit, currency basis, aggregation behavior, and valid ranges;
- observation horizon, freshness requirement, and effective dates;
- deterministic formula or implementation reference;
- required canonical datasets and lineage expectations;
- completeness and confidence rules;
- whether higher values are favorable, unfavorable, or contextual;
- allowed and prohibited business interpretations;
- related outcomes and its role for each outcome: leading indicator, supporting
  evidence, constraint, guardrail, or result measure.

### Outcome registry

Each outcome definition should declare:

- stable ID, owner, version, and plain-language intent;
- assessment grain and eligible population;
- required and optional metrics;
- status rules for healthy, watch, attention, already impacted, insufficient data,
  and not applicable;
- minimum evidence required to make a user-facing claim;
- approved response-option IDs;
- success, guardrail, and evaluation metrics;
- evaluation horizon and known attribution limitations;
- explanation guidance and prohibited conclusions.

Initial outcome IDs should be narrowly scoped:

- `availability.protect_in_stock_sales`
- `distribution.build_expansion_case`
- `inventory.reduce_excess_exposure`

### Response-option registry

Each response option should declare:

- stable ID, owner, version, and intended outcomes;
- applicable entity grains and situation types;
- required evidence and prerequisites;
- authority, capacity, data, and timing requirements;
- lead-time range and assumptions;
- conflicts or combinations with other options;
- the deterministic counterfactual transformation, when one is supported;
- metrics to observe after a human selects it;
- language that distinguishes consideration from authorization.

An option being valid means only that it may be considered. It is not a recommendation
or authorization.

### Assessment ledger

The system should materialize one assessment per release, outcome, and assessment
entity. The core grain for availability is:

```text
release x outcome x retailer x store x item
```

Every assessment should include:

- assessment status;
- relevant metric observation IDs;
- deterministic rule IDs and ontology version;
- attention eligibility and reason;
- material-impact date and human review deadline when applicable;
- evidence completeness and confidence;
- valid response-option IDs;
- explanation-packet identity;
- source release and lineage identifiers.

The Attention Queue should select and rank eligible assessments. Outcome monitoring
should remain able to show the complete population and all non-attention statuses.

### Explanation packet

The AI-facing packet should be a small, validated structure rather than raw tables or
an unrestricted prompt. It should contain:

- entity and outcome identity;
- current assessment and deterministic reason;
- relevant metric values with labels, units, dates, and metric versions;
- comparisons and counterfactual results already calculated by deterministic code;
- confidence, data gaps, assumptions, and prohibited conclusions;
- valid response options and unmet prerequisites;
- citations to evidence, rules, ontology version, and release lineage.

The AI may summarize or answer questions from this packet. A validator should reject
unsupported metric IDs, outcome claims, response options, and causal language before
the explanation reaches the user.

## Outcome 1: availability and reorder-window coverage

The first implementation slice should create an exhaustive Availability outcome map,
not merely add another alert.

### Existing usable measurements

- store-item on-hand units;
- 28-day low, base, and high demand paths;
- outstanding firm inbound and expected receipt date;
- projected first depletion date;
- projected unfulfilled units;
- estimated lost retail sales and contribution;
- minimum reaction days, decision slack, urgency, completeness, forecast quality,
  and timing stability;
- optional early, typical, and conservative supply-arrival scenarios.

### Required additions or explicit definitions

- current observed out-of-stock state;
- consecutive and recent out-of-stock days;
- in-stock rate over a declared historical window;
- days and units of cover;
- reorder threshold crossing date;
- firm-inbound coverage and overdue or undated inbound state;
- explicit coverage status for every scoped store-item;
- separation of already out of stock from projected future risk;
- outcome-specific monitoring view that is not limited to the overall top ten.

The product claim should not be strengthened to “never miss a reorder window” until
the assessment ledger proves complete population coverage and makes data gaps visible.

## Outcome 2: item expansion proof

The second implementation slice should aggregate store-level evidence into a governed
item-retailer expansion assessment.

### Existing usable measurements

- store-item sales and retailer forecast history;
- persistent acceleration or deceleration relative to forecast;
- forecast error allowance and evidence quality;
- 28-day forward unit and retail-sales gap;
- estimated contribution magnitude;
- store and item identity and assortment/replenishment attributes present in source
  observations.

### Required additions or explicit definitions

- current, eligible, and historical door counts;
- units, retail sales, and contribution per selling store per week;
- item-level breadth: count and share of stores outperforming;
- persistence across multiple periods and forecast vintages;
- in-stock-adjusted velocity so supply constraints are not mistaken for weak demand;
- matched store, item, region, or launch-cohort benchmarks;
- new-store ramp and mature-store performance where history permits;
- economic scenarios for plausible additional-door counts;
- supply readiness and service-level evidence;
- minimum evidence required before describing a result as buyer-ready proof.

The first version should call the output an “expansion evidence assessment,” not an
expansion recommendation. The human owns the interpretation and the buyer strategy.

## Counterfactual boundary

Counterfactuals must be named, deterministic, and scoped. Examples include:

- committed supply only versus an assumed planned replenishment schedule;
- early, typical, and conservative receipt timing with demand held fixed;
- base demand versus bounded low and high sensitivities with supply held fixed;
- a declared action transformation, such as moving an existing eligible receipt to a
  specified date, when its prerequisites are satisfied.

Sensitivity paths are not confidence intervals. Scenario differences are not causal
effects. The system must not describe a counterfactual action as feasible, authorized,
or effective unless those claims are separately supported.

## Decision and learning path

Learning should improve recommendations without transferring ontology ownership away
from the human.

### Phase 1: governed manual semantics

- Human authors metrics, outcomes, status rules, response options, and success measures.
- Deterministic code calculates facts, assessments, scenarios, and priority.
- AI explains validated packets only.
- Human selects an option or records no action.

### Phase 2: decision and outcome observation

- Record the complete context and ontology version shown to the human.
- Record all options presented, the human selection, rationale, timing, and intended
  outcome.
- Observe declared result and guardrail metrics after the evaluation window.
- Distinguish association from causal attribution.

### Phase 3: retrospective decision support

- Report which contexts, options, and outcomes recur.
- Compare observed results using matched cohorts or other approved evaluation designs.
- Identify missing ontology coverage and rules that require human revision.
- Do not train a recommendation model merely to imitate which option users selected.

### Phase 4: human-approved recommendations

- Train and evaluate a model only when action vocabulary, outcome labels, sample size,
  and attribution quality are adequate.
- Score only response options allowed by the current ontology and constraints.
- Preserve uncertainty and an explicit no-recommendation result.
- Evaluate candidate policies offline before any prospective use.
- Require human approval for every operational action.
- Never allow a learned model to rewrite metric, outcome, or authority definitions.

A contextual bandit may eventually fit a repeated, finite-action problem, but only if
the system logs context, all available actions, selection probability, the selected
action, and a reliable reward. Ordinary deterministic human choice logs do not provide
the counterfactual evidence needed to learn the best action safely.

## Technology direction

For the MVP:

- define registries as versioned JSON or YAML;
- validate them with strict Pydantic models and generated JSON Schema;
- reference deterministic Python calculation implementations by stable contract IDs;
- materialize metric observations, assessments, and explanation packets as immutable
  Parquet or JSON release artifacts;
- query artifacts with DuckDB;
- bind every publication to ontology, metric, configuration, and source hashes;
- keep decision events local and append-only until a persistent operational store is
  explicitly approved.

Do not initially add dbt, a graph database, RDF infrastructure, a feature store, an ML
platform, or another analytics engine. Useful concepts can be borrowed without taking
on their infrastructure:

- dbt MetricFlow: entities, dimensions, measures, governed metrics, and semantic graph;
- OMG Decision Model and Notation: decision requirements and human-readable decision
  tables;
- SKOS: stable concept identifiers and broader, narrower, and related relationships;
- PROV-O and OpenLineage: provenance between inputs, calculations, and outputs;
- SHACL: graph validation if an RDF representation becomes useful later.

## Proposed sequence for a later implementation plan

1. Confirm that `availability-foundation-plan.md` is complete and accepted as the
   reference outcome implementation.
2. Agree on terminology, ownership, versioning, and registry schemas.
3. Register the implemented Availability metrics and rules without changing their
   formulas or ranking behavior.
4. Generate and validate explanation packets; keep initial prose deterministic.
5. Allow AI prose only after grounded-output tests are defined.
6. Define the Expansion outcome and required item-retailer aggregations.
7. Add local decision-event and later-outcome artifacts.
8. Establish evaluation criteria before considering learned recommendations.

Each step requires a separately accepted implementation scope. This document does not
authorize ingestion of customer data, a persistent datastore, AI-generated decisions,
production deployment, or model training.

## Directional acceptance criteria

The direction is ready for implementation planning when stakeholders agree that:

- metric definitions and business interpretations have separate, explicit ownership;
- every in-scope outcome has an exhaustive assessed population;
- non-attention, insufficient-data, and not-applicable states are retained;
- attention eligibility is deterministic and reproducible;
- the UI can answer “why does this matter to the outcome?” with governed evidence;
- action options and action selection are distinct;
- AI explanations cannot introduce unsupported facts, actions, or causal conclusions;
- decision logs contain enough context to evaluate results later;
- learning cannot modify the human-governed ontology or bypass human approval.

## External references

- JSON Schema Draft 2020-12: <https://json-schema.org/draft/2020-12/>
- OMG Decision Model and Notation 1.5: <https://www.omg.org/spec/DMN/1.5/>
- dbt Semantic Layer and MetricFlow:
  <https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl>
- SKOS: <https://www.w3.org/TR/skos-reference>
- PROV-O: <https://www.w3.org/TR/prov-o/>
- SHACL: <https://www.w3.org/TR/shacl/>
- OpenLineage object model: <https://openlineage.io/docs/spec/object-model/>
- Vowpal Wabbit contextual bandits:
  <https://vowpalwabbit.org/docs/vow_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html>
