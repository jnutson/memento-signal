import { z } from "zod";
import { releaseId } from "@/lib/connected/schema";

const amount = z.number().finite().nullable();
const count = z.number().int().nonnegative();
const capabilities = z.object({
  inventory: z.boolean(),
  conditional_supply: z.boolean(),
  findings: z.boolean(),
  demand_components: z.literal(false),
  promotion_analysis: z.literal(false),
  store_map: z.literal(false),
});
const sales = z.object({
  period_start: z.iso.date(),
  period_end: z.iso.date(),
  units: amount,
  dollars: amount,
  units_store_week: amount,
  sales_days: count,
  expected_days: count,
  sales_coverage: amount,
});
const total = z.object({
  units: amount,
  retail_sales: amount,
  complete: z.boolean(),
  sales_days: count,
  expected_days: count,
  covered_products: count,
});
export const summarySchema = z
  .object({
    view_version: z.literal("workspace-view-v1"),
    metric_release_id: releaseId,
    metric_version: z.string(),
    issued_at: z.iso.datetime({ offset: true }),
    observation_date: z.iso.date(),
    week_start: z.iso.date(),
    week_end: z.iso.date(),
    store_count: count,
    current: total,
    prior: total,
    units_change_pct: amount,
    products: z.array(
      z.object({
        product_id: z.string(),
        product_name: z.string(),
        source_product_id: z.string(),
        company_item_id: z.string().nullable(),
        current: sales.nullable(),
        prior: sales.nullable(),
        unit_share_pct: amount,
      }),
    ),
    capabilities,
    sales_basis: z.string(),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.products.map((p) => p.product_id)).size !==
      value.products.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate product population" });
    if (
      (!value.current.complete || !value.prior.complete) &&
      value.units_change_pct !== null
    )
      ctx.addIssue({ code: "custom", message: "Incomplete weekly comparison" });
  });
const projection = z.object({
  date: z.iso.date(),
  basis: z.enum(["firm", "conditional"]),
  ready_stores: count,
  demand_units: amount,
  inbound_units: amount,
  ending_units: amount,
  unfulfilled_units: amount,
  stores_with_unmet: amount,
  retail_exposure: amount,
  cumulative_unmet_units: amount,
  cumulative_retail_exposure: amount,
});
export const productSchema = z
  .object({
    view_version: z.literal("workspace-view-v1"),
    metric_release_id: releaseId,
    product_id: z.string(),
    region: z.string().nullable(),
    finding_id: z.string().nullable(),
    observation_date: z.iso.date(),
    regions: z.array(z.string()),
    sales_weeks: z.array(sales),
    inventory: z.object({
      stores: count,
      known_stores: count,
      on_hand: amount,
      zero_stores: count,
    }),
    projections: z.array(projection),
    economics: z.array(
      z.object({
        basis: z.enum(["firm", "conditional"]),
        ready_stores: count,
        retail_exposure: amount,
        unfulfilled_units: amount,
        first_shortage: z.iso.date().nullable(),
      }),
    ),
    regional_sales: z.array(
      z.object({
        region: z.string(),
        units: amount,
        dollars: amount,
        units_store_week: amount,
        sales_coverage: amount,
      }),
    ),
    capabilities,
    projection_basis: z.string(),
  })
  .superRefine((value, ctx) => {
    const keys = value.projections.map((r) => `${r.basis}:${r.date}`);
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Duplicate projection dates" });
    for (const row of value.projections) {
      if (
        row.ready_stores > value.inventory.stores ||
        (row.ready_stores < value.inventory.stores &&
          [row.demand_units, row.ending_units, row.unfulfilled_units].some(
            (v) => v !== null,
          ))
      )
        ctx.addIssue({
          code: "custom",
          message: "Projection coverage mismatch",
        });
    }
  });
export type Summary = z.infer<typeof summarySchema>;
export type ProductView = z.infer<typeof productSchema>;
export type Basis = "firm" | "conditional";
export type Tab = "Sales" | "Inventory" | "Demand";

export const storePageSchema = z
  .object({
    view_version: z.literal("workspace-view-v1"),
    metric_release_id: releaseId,
    product_id: z.string(),
    region: z.string().nullable(),
    search: z.string(),
    total: count,
    limit: count,
    offset: count,
    rows: z.array(
      z.object({
        location_id: z.string(),
        source_location_id: z.string(),
        location_name: z.string(),
        region: z.string(),
        on_hand: amount,
        current_state: z.string(),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    if (
      value.rows.length > value.limit ||
      value.offset + value.rows.length > value.total ||
      new Set(value.rows.map((r) => r.location_id)).size !== value.rows.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid store page population",
      });
  });
export type StorePage = z.infer<typeof storePageSchema>;
