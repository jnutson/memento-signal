import { z } from "zod";
import { allRows } from "@/lib/connected/client";
import { findingId, periodSchema, releaseId } from "@/lib/connected/schema";
import type { Finding } from "@/lib/connected/schema";

const amount = z.number().finite().nullable();
export const exposureSchema = z.object({
  metric_release_id: releaseId,
  observation_date: z.iso.date(),
  limitation: z.string(),
  buckets: z
    .array(
      z.object({
        key: z.enum(["z", "a", "i"]),
        amount,
        known_amount: amount,
        member_count: z.number().int().nonnegative(),
        valued_count: z.number().int().nonnegative(),
        basis: z.string(),
      }),
    )
    .length(3),
});
export type Exposure = z.infer<typeof exposureSchema>;
export const attentionRowSchema = z.object({
  finding_id: findingId,
  product_id: z.string(),
  lane: z.enum(["a", "z", "i"]),
  economic_basis: z.string(),
  amount,
  known_amount: amount,
  retrospective_amount: amount,
  forward_amount: amount,
  member_count: z.number().int().nonnegative(),
  valued_count: z.number().int().nonnegative(),
  historical_baseline_stores: z.number().int().nonnegative(),
  assumed_receipt_stores: z.number().int().nonnegative(),
  window_end_date: z.iso.date(),
  members: z
    .array(
      z.object({
        location_id: z.string(),
        product_id: z.string(),
        amount,
        retrospective_amount: amount,
        forward_amount: amount,
        zero_days: amount,
        in_stock_sales_days: amount,
        baseline_daily_retail: amount,
        baseline_basis: z.string(),
        receipt_basis: z.string(),
        window_end_date: z.iso.date(),
        recorded_episode_retail: amount,
        unit_retail_amount: amount,
        episode_start_date: z.iso.date().nullable(),
      }),
    )
    .optional(),
});
export const attentionSchema = exposureSchema.extend({
  model_version: z.literal("attention-exposure-v1"),
  assumptions: z
    .object({
      replenishment_days: z.number().int().positive(),
      po_authorization_days: z.number().int().positive(),
      fulfillment_days: z.number().int().positive(),
      brand_to_retailer_dc_days: z.number().int().positive(),
      retailer_dc_to_store_days: z.number().int().positive(),
    })
    .passthrough(),
  rows: z.array(attentionRowSchema),
});
export type Attention = z.infer<typeof attentionSchema>;
export type AttentionRow = z.infer<typeof attentionRowSchema>;
export async function loadAttention(
  release: string,
  signal?: AbortSignal,
  finding?: string,
) {
  const query = new URLSearchParams({ release_id: release });
  if (finding) query.set("finding_id", finding);
  const response = await fetch(`/api/metrics/attention-values?${query}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Attention valuation unavailable; no count was substituted for dollars.",
    );
  const value = attentionSchema.parse(await response.json());
  if (
    value.metric_release_id !== release ||
    new Set(value.rows.map((row) => row.finding_id)).size !==
      value.rows.length ||
    value.rows.some(
      (row) =>
        row.valued_count > row.member_count ||
        (finding && row.finding_id !== finding) ||
        (row.members &&
          (row.members.length !== row.member_count ||
            new Set(row.members.map((member) => member.location_id)).size !==
              row.member_count ||
            row.members.some(
              (member) => member.product_id !== row.product_id,
            ))),
    )
  )
    throw new Error("Attention valuation identity or coverage mismatch.");
  return value;
}
export async function loadExposure(release: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/metrics/exposure-summary?release_id=${encodeURIComponent(release)}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) throw new Error("Modeled exposure is unavailable.");
  const value = exposureSchema.parse(await response.json());
  if (
    value.metric_release_id !== release ||
    new Set(value.buckets.map((row) => row.key)).size !== 3 ||
    value.buckets.some((row) => row.valued_count > row.member_count)
  )
    throw new Error("Exposure release or coverage mismatch.");
  return value;
}
export function exposureLabel<
  T extends { amount: number | null; known_amount: number | null },
>(bucket: T) {
  const value = bucket.amount ?? bucket.known_amount;
  if (value === null) return "—";
  const dollars =
    Math.abs(value) >= 1000
      ? `$${(value / 1000).toFixed(1)}k`
      : `$${value.toFixed(0)}`;
  return dollars + (bucket.amount === null ? "+" : "");
}
export function findingCopy(finding: Finding): Finding {
  if (finding.finding_code === "future_supply_gap")
    return {
      ...finding,
      title: "Demand exceeds retailer plans",
      interpretation:
        "Forecast demand exceeds available supply, even if eligible retailer plans arrive. The projected shortage date is not an action deadline.",
    };
  if (finding.finding_code === "promised_distribution_gap")
    return {
      ...finding,
      title: "Planned stores report no inventory",
      interpretation:
        "Stores due to carry this item report zero inventory, with no earlier positive stock observed. Confirm initial distribution; reported inventory is not a shelf audit.",
    };
  return finding;
}
export const catalogPeriod = periodSchema.extend({
  scope_id: z.string(),
  scope_name: z.string(),
  period_kind: z.enum(["week", "month"]),
  trend_pct: amount,
  trend_status: z.string(),
  inventory_days: z.number().nonnegative(),
  zero_days: z.number().nonnegative(),
});
export const distribution = z.object({
  product_id: z.string(),
  scope_id: z.string(),
  scope_name: z.string(),
  promised_stores: z.number().int().nonnegative(),
  stocked_stores: z.number().int().nonnegative(),
  confirmed_zero_stores: z.number().int().nonnegative(),
  unknown_stores: z.number().int().nonnegative(),
});
export const seriesSchema = z.object({
  store_supply: z
    .array(
      z.object({
        location_id: z.string(),
        product_id: z.string(),
        demand_base_28d: amount,
        firm_depletion_date: z.iso.date().nullable(),
        firm_shortage_date: z.iso.date().nullable(),
        conditional_shortage_date: z.iso.date().nullable(),
        firm_unfulfilled_units: amount,
        conditional_unfulfilled_units: amount,
      }),
    )
    .optional(),
  metric_release_id: releaseId,
  product_id: z.string(),
  finding_id: z.string().nullable(),
  member_count: z.number().int().positive(),
  scope: z.string(),
  limitation: z.string(),
  diagnostics: z
    .object({
      last_sale_date: z.iso.date().nullable(),
      history_start_date: z.iso.date().nullable(),
      first_firm_depletion_date: z.iso.date().nullable(),
      conditional_unmet_retail_amount: amount,
      planned_receipts_28d: amount,
      planned_feed_stores: z.number().int().nonnegative(),
      zero_previously_stocked_stores: z.number().int().nonnegative(),
      zero_without_observed_stock_stores: z.number().int().nonnegative(),
    })
    .optional(),
  members: z.array(
    z.object({
      location_id: z.string(),
      product_id: z.string(),
      location_name: z.string(),
      region: z.string(),
      on_hand: amount,
      current_state: z.string(),
    }),
  ),
  history: z.array(
    z.object({
      business_date: z.iso.date(),
      expected_stores: z.number().int().nonnegative(),
      sales_stores: z.number().int().nonnegative(),
      inventory_stores: z.number().int().nonnegative(),
      units: amount,
      dollars: amount,
      on_hand: amount,
      zero_stores: z.number().int().nonnegative(),
    }),
  ),
  projections: z.array(
    z.object({
      projection_date: z.iso.date(),
      ready_stores: z.number().int().nonnegative(),
      demand_units: amount,
      inbound_units: amount,
      ending_units: amount,
      unfulfilled_units: amount,
      basis: z.enum(["firm", "conditional"]),
    }),
  ),
  firm_orders: z.array(
    z.object({
      retailer_order_id: z.string(),
      location_id: z.string(),
      product_id: z.string(),
      expected_store_receipt_date: z.iso.date(),
      outstanding_units: z.number().finite().nonnegative(),
      receipt_timing: z.string(),
    }),
  ),
});
export type Series = z.infer<typeof seriesSchema>;
export type CatalogPeriod = z.infer<typeof catalogPeriod>;
export type Distribution = z.infer<typeof distribution>;

export const periods = (
  release: string,
  grain = "item",
  signal?: AbortSignal,
) =>
  allRows(
    "periods",
    catalogPeriod,
    release,
    { grain, period_kind: "week" },
    signal,
  );
export const distributions = (
  release: string,
  grain = "item",
  signal?: AbortSignal,
) => allRows("distribution", distribution, release, { grain }, signal);
export async function loadSeries(
  release: string,
  product: string,
  finding: string | null,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    release_id: release,
    product_id: product,
  });
  if (finding) query.set("finding_id", finding);
  const response = await fetch(`/api/metrics/display-series?${query}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Chart evidence is unavailable. No synthetic series was substituted.",
    );
  const value = seriesSchema.parse(await response.json());
  if (
    value.metric_release_id !== release ||
    value.product_id !== product ||
    value.finding_id !== finding
  )
    throw new Error("Chart release or scope mismatch.");
  const keys = value.projections.map(
    (row) => `${row.basis}:${row.projection_date}`,
  );
  if (
    (value.store_supply &&
      (value.store_supply.length !== value.member_count ||
        new Set(value.store_supply.map((row) => row.location_id)).size !==
          value.member_count ||
        value.store_supply.some(
          (row) =>
            row.product_id !== product ||
            !value.members.some(
              (member) => member.location_id === row.location_id,
            ),
        ))) ||
    value.members.length !== value.member_count ||
    new Set(value.members.map((row) => row.location_id)).size !==
      value.member_count ||
    value.members.some((row) => row.product_id !== product)
  )
    throw new Error("Incomplete chart/store population.");
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate chart evidence.");
  return value;
}

export type Week = {
  date: string;
  phase: "actual" | "projected";
  units: number | null;
  dollars: number | null;
  firm: number | null;
  conditional: number | null;
  receipts: number | null;
  planned: number | null;
  zeros: number | null;
};
const dayMs = 86400000;
function saturday(date: string) {
  const time = new Date(`${date}T00:00:00Z`);
  return new Date(time.getTime() - ((time.getUTCDay() + 1) % 7) * dayMs)
    .toISOString()
    .slice(0, 10);
}
const sum = (rows: (number | null)[]) =>
  rows.length && rows.every((value) => value !== null)
    ? rows.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null;
export function chartWeeks(series: Series): Week[] {
  const history = new Map<string, Series["history"]>();
  for (const row of series.history) {
    const date = saturday(row.business_date);
    history.set(date, [...(history.get(date) ?? []), row]);
  }
  const actual = [...history]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([date, rows]): Week => ({
        date,
        phase: "actual",
        units: rows.length === 7 ? sum(rows.map((row) => row.units)) : null,
        dollars: rows.length === 7 ? sum(rows.map((row) => row.dollars)) : null,
        firm: rows.at(-1)?.on_hand ?? null,
        conditional: null,
        receipts: null,
        planned: null,
        zeros: rows.at(-1)?.zero_stores ?? null,
      }),
    );
  const future = new Map<string, Series["projections"]>();
  for (const row of series.projections) {
    const date = saturday(row.projection_date);
    future.set(date, [...(future.get(date) ?? []), row]);
  }
  const projected = [...future]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]): Week => {
      const firm = rows
        .filter((row) => row.basis === "firm")
        .sort((a, b) => a.projection_date.localeCompare(b.projection_date));
      const conditional = rows
        .filter((row) => row.basis === "conditional")
        .sort((a, b) => a.projection_date.localeCompare(b.projection_date));
      const conditionalReceipts = sum(
          conditional.map((row) => row.inbound_units),
        ),
        firmReceipts = sum(firm.map((row) => row.inbound_units));
      return {
        date,
        phase: "projected",
        units: sum(firm.map((row) => row.demand_units)),
        dollars: null,
        firm: firm.at(-1)?.ending_units ?? null,
        conditional: conditional.at(-1)?.ending_units ?? null,
        receipts: firmReceipts,
        planned:
          conditionalReceipts !== null && firmReceipts !== null
            ? conditionalReceipts - firmReceipts
            : null,
        zeros: null,
      };
    });
  return [...actual, ...projected];
}
