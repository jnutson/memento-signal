import { evidenceSchema, findingSchema } from "@/lib/connected/schema";
import { attentionSchema, seriesSchema } from "@/lib/reimagined/data";
import type { DetailsInput } from "@/lib/reimagined/details-model";

export function detailsFixture(
  lane: "z" | "a" | "i" = "z",
  amounts: (number | null)[] = [10.005, 10.005],
): DetailsInput {
  const release = `met_${"a".repeat(64)}`,
    fid = `find_${"b".repeat(64)}`;
  const code =
    lane === "z"
      ? "current_out_of_stock"
      : lane === "a"
        ? "future_supply_gap"
        : "excess_inventory";
  const known = amounts
    .filter((n): n is number => n !== null)
    .reduce((a, b) => a + b, 0);
  const total = amounts.every((n) => n !== null) ? known : null;
  const finding = findingSchema.parse({
    finding_id: fid,
    product_id: "p",
    promise: lane === "i" ? "excess" : "availability",
    finding_code: code,
    title: "Test finding",
    interpretation: "Published evidence",
    supply_basis: "published",
    units_basis: "published",
    as_of: "2026-09-26T00:00:00Z",
    affected_store_count: amounts.length,
    eligible_store_count: amounts.length,
    affected_store_share: 1,
    first_event_date: "2026-10-03",
    last_event_date: "2026-10-23",
    earliest_plan_review_date: null,
    units: 2,
    retail_exposure_amount: lane === "i" ? null : total,
    inventory_capital_amount: lane === "i" ? total : null,
    carrying_cost_28d_amount: null,
    retail_valued_store_count: amounts.length,
    cost_valued_store_count: amounts.length,
    context_json: "{}",
    missing_evidence: [],
    limitations: [],
  });
  const members = amounts.map((amount, i) => ({
    location_id: `s${i}`,
    product_id: "p",
    amount,
    retrospective_amount: lane === "z" ? amount : null,
    forward_amount: lane === "z" ? 0 : amount,
    zero_days: lane === "z" ? 2 : null,
    in_stock_sales_days: lane === "z" ? 14 : null,
    baseline_daily_retail: lane === "z" && amount !== null ? amount / 2 : null,
    baseline_basis: "own_store_in_stock_sales",
    receipt_basis: "assumed_existing_brand_stock_and_new_authorized_po",
    window_end_date: "2026-10-16",
    recorded_episode_retail: 0,
    unit_retail_amount: 10,
    episode_start_date: "2026-09-24",
  }));
  const evidence = members.map((m, i) =>
    evidenceSchema.parse({
      finding_id: fid,
      evidence_id: `e${i}`,
      product_id: "p",
      location_id: m.location_id,
      finding_code: code,
      event_date: "2026-10-03",
      plan_review_date: null,
      units: lane === "i" && m.amount !== null ? m.amount / 10 : 1,
      retail_exposure_amount: lane === "i" ? null : m.amount,
      inventory_capital_amount: lane === "i" ? m.amount : null,
      carrying_cost_28d_amount: null,
      missing_evidence: [],
      facts_json: JSON.stringify({
        observation_date: "2026-09-25",
        on_hand: lane === "z" ? 0 : 50,
        store_name: `Store ${i}`,
        product_name: "Game",
        region: i % 2 ? "East" : "West",
        tier: "A",
        promised_due: true,
        consecutive_zero_days: 2,
        firm_unfulfilled_units: 10,
        conditional_unfulfilled_units: m.amount === null ? null : m.amount / 10,
        firm_ending_units:
          lane === "i" && m.amount !== null ? 40 + m.amount / 10 : 41,
        conditional_ending_units:
          lane === "i" && m.amount !== null ? 44 + m.amount / 10 : 45,
        comparison_state: "gap_remains_under_plans",
        plans: [],
        source_tables: ["daily"],
        source_key: { location_id: m.location_id, product_id: "p" },
        unit_cost_amount: m.amount === null ? null : 10,
        excess_calculation: {
          target_units: 40,
          target_cover_days: 40,
          firm_excess_units: 1,
          conditional_excess_units: 5,
        },
      }),
    }),
  );
  const series = seriesSchema.parse({
    metric_release_id: release,
    product_id: "p",
    finding_id: fid,
    member_count: members.length,
    scope: "finding_members",
    limitation: "Published projections",
    members: members.map((m, i) => ({
      location_id: m.location_id,
      product_id: "p",
      location_name: `Store ${i}`,
      region: i % 2 ? "East" : "West",
      on_hand: lane === "z" ? 0 : 50,
      current_state:
        lane === "z" ? "reported_zero_on_hand" : "positive_reported_inventory",
    })),
    store_supply: members.map((m) => ({
      location_id: m.location_id,
      product_id: "p",
      demand_base_28d: 28,
      firm_depletion_date: "2026-10-01",
      firm_shortage_date: "2026-10-02",
      conditional_shortage_date: "2026-10-03",
      firm_unfulfilled_units: 10,
      conditional_unfulfilled_units: m.amount === null ? null : m.amount / 10,
    })),
    history: Array.from({ length: 7 }, (_, i) => ({
      business_date: `2026-09-${19 + i}`,
      expected_stores: members.length,
      inventory_stores: members.length,
      sales_stores: members.length,
      units: 2,
      dollars: 20,
      on_hand: 50,
      zero_stores: 1,
    })),
    projections: ["firm", "conditional"].flatMap((basis) =>
      Array.from({ length: 28 }, (_, i) => ({
        projection_date: new Date(Date.UTC(2026, 8, 26 + i))
          .toISOString()
          .slice(0, 10),
        basis,
        ready_stores: members.length,
        demand_units: 2,
        inbound_units: 0,
        ending_units: 40,
        unfulfilled_units: 1,
      })),
    ),
    firm_orders: [],
  });
  const attention = attentionSchema.parse({
    metric_release_id: release,
    observation_date: "2026-09-25",
    model_version: "attention-exposure-v1",
    limitation: "Counterfactual, not causal loss.",
    assumptions: {
      replenishment_days: 21,
      po_authorization_days: 7,
      fulfillment_days: 2,
      brand_to_retailer_dc_days: 5,
      retailer_dc_to_store_days: 7,
    },
    buckets: ["z", "a", "i"].map((key) => ({
      key,
      amount: total,
      known_amount: known,
      member_count: members.length,
      valued_count: members.filter((m) => m.amount !== null).length,
      basis: "Published",
    })),
    rows: [
      {
        finding_id: fid,
        product_id: "p",
        lane,
        economic_basis:
          lane === "i"
            ? "inventory_capital_at_cost"
            : "estimated_unmet_retail_sales",
        amount: total,
        known_amount: members.some((m) => m.amount !== null) ? known : null,
        retrospective_amount: lane === "z" ? total : null,
        forward_amount: lane === "z" ? 0 : total,
        member_count: members.length,
        valued_count: members.filter((m) => m.amount !== null).length,
        historical_baseline_stores: members.length,
        assumed_receipt_stores: lane === "z" ? members.length : 0,
        window_end_date: "2026-10-16",
        members,
      },
    ],
  });
  return { finding, evidence, series, attention, queue: attention.rows[0] };
}
