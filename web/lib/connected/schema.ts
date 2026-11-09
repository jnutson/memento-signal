import { z } from "zod";
import { metricMetadata } from "@/lib/metrics";

export const releaseId = z.string().regex(/^met_[a-f0-9]{64}$/);
export const findingId = z.string().regex(/^find_[a-f0-9]{64}$/);
const amount = z.number().finite().nullable();
const day = z.iso.date();
export const metadataSchema = metricMetadata.extend({
  configuration: metricMetadata.shape.configuration.extend({
    demand_model: z
      .enum(["retailer_baseline", "historical_adjusted"])
      .optional(),
  }),
  capabilities: z.array(z.string()).optional(),
  files: z.array(z.object({ path: z.string() })),
});
export const findingSchema = z.object({
  finding_id: findingId,
  product_id: z.string(),
  promise: z.enum(["expansion", "availability", "excess"]),
  finding_code: z.enum([
    "sustained_outperformance",
    "promised_distribution_gap",
    "current_out_of_stock",
    "availability_unknown",
    "future_supply_gap",
    "conditional_plan_dependency",
    "excess_inventory",
    "conditional_excess_inventory",
    "observed_recovery",
  ]),
  title: z.string(),
  interpretation: z.string(),
  supply_basis: z.string(),
  units_basis: z.string(),
  as_of: z.string(),
  affected_store_count: z.number().int().nonnegative(),
  eligible_store_count: z.number().int().nonnegative(),
  affected_store_share: z.number().min(0).max(1),
  first_event_date: day.nullable(),
  last_event_date: day.nullable(),
  earliest_plan_review_date: day.nullable(),
  units: amount,
  retail_exposure_amount: amount,
  inventory_capital_amount: amount,
  carrying_cost_28d_amount: amount,
  retail_valued_store_count: z.number().int().nonnegative(),
  cost_valued_store_count: z.number().int().nonnegative(),
  context_json: z.string(),
  missing_evidence: z.array(z.string()),
  limitations: z.array(z.string()),
});
export const planSchema = z
  .object({
    plan_id: z.string(),
    order_place_dt: day,
    sched_arvl_dt: day,
    remaining_planned_qty: z.number().finite().nonnegative(),
    eligible_for_projection: z.boolean(),
    status: z.string(),
  })
  .passthrough();
export const factsSchema = z
  .object({
    observation_date: day,
    on_hand: amount,
    store_name: z.string(),
    product_name: z.string(),
    region: z.string().nullable(),
    tier: z.string().nullable(),
    promised_due: z.boolean(),
    consecutive_zero_days: z.number().int().nonnegative().nullable(),
    firm_unfulfilled_units: amount,
    conditional_unfulfilled_units: amount,
    firm_ending_units: amount,
    conditional_ending_units: amount,
    comparison_state: z.string(),
    plans: z.array(planSchema),
    source_tables: z.array(z.string()),
    source_key: z.object({ product_id: z.string(), location_id: z.string() }),
    excess_calculation: z
      .object({ firm_excess_units: amount, conditional_excess_units: amount })
      .passthrough()
      .optional(),
    expansion_comparison: z
      .object({
        baseline_units_store_week: amount,
        recent_units_store_week: amount,
        baseline_dollars_store_week: amount,
        recent_dollars_store_week: amount,
        first_change_pct: amount,
        second_change_pct: amount,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export const evidenceSchema = z
  .object({
    finding_id: findingId,
    evidence_id: z.string(),
    product_id: z.string(),
    location_id: z.string(),
    finding_code: findingSchema.shape.finding_code,
    facts_json: z.string(),
    event_date: day.nullable(),
    plan_review_date: day.nullable(),
    units: amount,
    retail_exposure_amount: amount,
    inventory_capital_amount: amount,
    carrying_cost_28d_amount: amount,
    missing_evidence: z.array(z.string()),
  })
  .transform((row, ctx) => {
    try {
      const facts = factsSchema.parse(JSON.parse(row.facts_json));
      if (
        facts.source_key.location_id !== row.location_id ||
        facts.source_key.product_id !== row.product_id
      )
        throw new Error();
      return { ...row, facts };
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid finding evidence or source identity",
      });
      return z.NEVER;
    }
  });
export const contextSchema = z
  .object({ target_cover_days: z.number().int().positive() })
  .passthrough();
export const projectionSchema = z.object({
  product_id: z.string(),
  location_id: z.string(),
  path: z.enum(["low", "base", "high"]),
  projection_date: day,
  demand_units: z.number().finite(),
  inbound_units: z.number().finite(),
  ending_units: z.number().finite(),
  unfulfilled_units: z.number().finite(),
});
export const dailySchema = z.object({
  product_id: z.string(),
  location_id: z.string(),
  business_date: day,
  eligible: z.boolean(),
  units: amount,
  dollars: amount,
  on_hand: amount,
  sales_valid: z.boolean(),
  inventory_valid: z.boolean(),
});
export const periodSchema = z.object({
  product_id: z.string(),
  period_start: day,
  period_end: day,
  units: amount,
  dollars: amount,
  store_day_rate: amount,
  units_store_week: amount,
  dollars_store_week: amount,
  sales_coverage: amount,
  inventory_coverage: amount,
  in_stock_rate: amount,
});
export const reviewSchema = z.object({
  metric_release_id: releaseId,
  finding_id: findingId,
  cue: z.string(),
  cue_basis: z.string(),
  options: z.array(
    z.object({ key: z.string(), label: z.string(), verification: z.string() }),
  ),
  recommendation: z.null(),
  priority_score: z.null(),
  estimated_action_benefit: z.null(),
  action_deadline: z.null(),
  result: z.string(),
  workflow: z.string(),
});
export type Metadata = z.infer<typeof metadataSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Projection = z.infer<typeof projectionSchema>;
export type Daily = z.infer<typeof dailySchema>;
export type Period = z.infer<typeof periodSchema>;
export type Review = z.infer<typeof reviewSchema>;
