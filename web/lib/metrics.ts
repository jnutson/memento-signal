import { z } from "zod";

const period = z.object({
  period_kind: z.enum(["week", "month"]),
  period_start: z.string(),
  period_end: z.string(),
});
export const metricMetadata = z.object({
  metric_release_id: z.string().regex(/^met_[a-f0-9]{64}$/),
  contract_version: z.string(),
  observation_date: z.string(),
  population: z.number().int().nonnegative(),
  states: z.record(z.string(), z.number()),
  formulas: z.record(z.string(), z.string()),
  limitations: z.array(z.string()),
  configuration: z.object({
    tier_baseline_end: z.string(),
    minimum_coverage: z.number(),
    trend_percent: z.number(),
    trend_minimum_units: z.number(),
    weekly_persistence: z.number(),
  }),
  items: z.array(
    z.object({
      product_id: z.string(),
      product_name: z.string(),
      source_product_id: z.string(),
      company_item_id: z.string().nullable(),
    }),
  ),
  periods: z.array(period),
  check_counts: z.array(
    z.object({ check_code: z.string(), count: z.number() }),
  ),
});

const cell = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
export const metricPage = z.object({
  metric_release_id: z.string(),
  kind: z.string(),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  rows: z.array(z.record(z.string(), cell)),
});

export type MetricMetadata = z.infer<typeof metricMetadata>;
export type MetricPage = z.infer<typeof metricPage>;
export type MetricRow = MetricPage["rows"][number];
export type MetricKind =
  | "periods"
  | "stores"
  | "distribution"
  | "weekday"
  | "checks";
