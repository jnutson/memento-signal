import { describe, expect, it } from "vitest";
import { findingSchema, evidenceSchema } from "@/lib/connected/schema";
import { caseMetrics, conciseStoryWhy } from "@/lib/reimagined/case-metrics";
import {
  checkInDate,
  demoActions,
  statusSchema,
  statuses,
} from "@/lib/reimagined/demo-workflow";
import type { Series } from "@/lib/reimagined/data";
import { compactMoney, wholeUnits } from "@/lib/reimagined/presentation";

const finding = findingSchema.parse({
  finding_id: `find_${"a".repeat(64)}`,
  product_id: "p",
  promise: "availability",
  finding_code: "future_supply_gap",
  title: "Demand exceeds retailer plans",
  interpretation: "Forecast gap",
  supply_basis: "firm_plus_plans_conditional",
  units_basis: "conditional_unfulfilled_units_28d",
  as_of: "2026-09-26T00:00:00Z",
  affected_store_count: 1,
  eligible_store_count: 1,
  affected_store_share: 1,
  first_event_date: "2026-10-03",
  last_event_date: "2026-10-23",
  earliest_plan_review_date: "2026-09-27",
  units: 20,
  retail_exposure_amount: 200,
  inventory_capital_amount: null,
  carrying_cost_28d_amount: null,
  retail_valued_store_count: 1,
  cost_valued_store_count: 0,
  context_json: "{}",
  missing_evidence: [],
  limitations: [],
});
const evidence = evidenceSchema.parse({
  finding_id: finding.finding_id,
  evidence_id: "e",
  product_id: "p",
  location_id: "s",
  finding_code: finding.finding_code,
  event_date: "2026-10-03",
  plan_review_date: "2026-09-27",
  units: 20,
  retail_exposure_amount: 200,
  inventory_capital_amount: null,
  carrying_cost_28d_amount: null,
  missing_evidence: [],
  facts_json: JSON.stringify({
    observation_date: "2026-09-25",
    on_hand: 10,
    store_name: "Store",
    product_name: "Game",
    region: "West",
    tier: "A",
    promised_due: true,
    consecutive_zero_days: 6,
    firm_unfulfilled_units: 42,
    conditional_unfulfilled_units: 20,
    firm_ending_units: 0,
    conditional_ending_units: 0,
    comparison_state: "gap_remains_under_plans",
    plans: [
      {
        plan_id: "plan",
        order_place_dt: "2026-09-27",
        sched_arvl_dt: "2026-10-01",
        remaining_planned_qty: 22,
        eligible_for_projection: true,
        status: "planned",
      },
    ],
    source_tables: ["daily"],
    source_key: { location_id: "s", product_id: "p" },
    excess_calculation: {
      target_units: 80,
      target_cover_days: 40,
      firm_excess_units: 20,
      conditional_excess_units: 42,
    },
  }),
});
const series: Series = {
  metric_release_id: `met_${"a".repeat(64)}`,
  product_id: "p",
  finding_id: finding.finding_id,
  member_count: 1,
  scope: "finding_members",
  limitation: "No action model",
  history: [],
  members: [
    {
      location_id: "s",
      product_id: "p",
      location_name: "Store",
      region: "West",
      on_hand: 10,
      current_state: "positive_reported_inventory",
    },
  ],
  firm_orders: [
    {
      retailer_order_id: "po",
      location_id: "s",
      product_id: "p",
      expected_store_receipt_date: "2026-09-26",
      outstanding_units: 4,
      receipt_timing: "dated",
    },
  ],
  projections: Array.from({ length: 28 }, (_, i) => ({
    projection_date: new Date(Date.UTC(2026, 8, 26 + i))
      .toISOString()
      .slice(0, 10),
    basis: "firm",
    ready_stores: 1,
    demand_units: 2,
    inbound_units: i === 0 ? 4 : 0,
    ending_units: 0,
    unfulfilled_units: 0,
  })),
  diagnostics: {
    last_sale_date: "2026-09-19",
    history_start_date: "2026-07-01",
    first_firm_depletion_date: "2026-10-03",
    conditional_unmet_retail_amount: 200,
    planned_receipts_28d: 22,
    planned_feed_stores: 1,
    zero_previously_stocked_stores: 1,
    zero_without_observed_stock_stores: 0,
  },
};
const values = (rows: ReturnType<typeof caseMetrics>["why"]) =>
  Object.fromEntries(rows.map((row) => [row.l, row.v]));

describe("original prototype controls, without its fabricated action model", () => {
  it("restores all original choice sets and status cycle", () => {
    expect(demoActions(finding, "Oct 3").map((row) => row.label)).toEqual([
      "Transfer",
      "Expedite PO",
      "Watch",
    ]);
    expect(
      demoActions(
        { ...finding, finding_code: "current_out_of_stock" },
        "Oct 3",
      ).map((row) => row.label),
    ).toEqual(["Expedite restock", "Resolve distribution", "Watch"]);
    expect(
      demoActions(
        { ...finding, promise: "excess", finding_code: "excess_inventory" },
        "Oct 3",
      ).map((row) => row.label),
    ).toEqual(["Cut inbound", "Markdown", "Watch"]);
    expect(statuses).toEqual([
      "proposed",
      "sent",
      "approved",
      "done",
      "declined",
    ]);
    expect(checkInDate("2026-09-25")).toBe("Oct 3");
  });
  it("preserves old session notes through status migration", () => {
    expect(statusSchema.parse("reviewed (demo)")).toBe("sent");
    expect(statusSchema.parse("complete (demo)")).toBe("done");
    expect(statusSchema.parse("approved")).toBe("approved");
  });
});
describe("case-specific Why metrics", () => {
  it("keeps summary cards compact, whole and free of italic qualifiers", () => {
    expect(compactMoney(1300)).toBe("$1.3k");
    expect(compactMoney(8068.98)).toBe("$8.1k");
    expect(compactMoney(0)).toBe("$0");
    expect(compactMoney(null)).toBe("Unavailable");
    expect(wholeUnits(146.98)).toBe("147");
    expect(wholeUnits(null)).toBe("Unavailable");
    const result = caseMetrics(
      finding,
      [
        {
          ...evidence,
          facts: { ...evidence.facts, conditional_unfulfilled_units: 146.98 },
        },
      ],
      {
        ...series,
        diagnostics: {
          ...series.diagnostics!,
          conditional_unmet_retail_amount: 8068.98,
        },
      },
    );
    expect(result.metrics.map((row) => row.val)).toEqual([
      "$8.1k",
      "5 days",
      "147 units",
    ]);
    expect(result.metrics.every((row) => row.tag === undefined)).toBe(true);
    expect(
      values(conciseStoryWhy(finding, result.why))["Uncovered demand"],
    ).toBe("147 units");
  });
  it("shows five facts tailored to each path", () => {
    const gap = caseMetrics(finding, [evidence], series);
    expect(conciseStoryWhy(finding, gap.why).map((row) => row.l)).toEqual([
      "Stock lasts",
      "Demand, next 28 days",
      "Committed supply",
      "Expected planned orders",
      "Uncovered demand",
    ]);
    const excess = {
      ...finding,
      promise: "excess" as const,
      finding_code: "excess_inventory" as const,
    };
    expect(
      conciseStoryWhy(excess, caseMetrics(excess, [evidence], series).why).map(
        (row) => row.l,
      ),
    ).toEqual([
      "Cover target",
      "Projected excess",
      "Inventory capital",
      "Firm inbound",
      "Uncommitted inbound",
    ]);
    for (const code of [
      "current_out_of_stock",
      "promised_distribution_gap",
    ] as const) {
      const zero = { ...finding, finding_code: code };
      const rows = caseMetrics(zero, [evidence], series).why;
      rows.push(
        ...[
          "Daily sales baseline",
          "Missed sales to date (est.)",
          "Forward exposure (est.)",
        ].map((l) => ({ l, v: "$10" })),
      );
      const result = conciseStoryWhy(zero, rows);
      expect(result.map((row) => row.l)).toEqual([
        "Time at zero",
        "Daily sales baseline",
        "Missed sales to date (est.)",
        "Forward exposure (est.)",
        "Replenishment on order",
      ]);
      expect(result[0].v).toBe("6 days median");
      expect(result[0].s).toContain("6 days longest");
    }
  });
  it("uses Walmart demand and separates actual firm and planned receipts", () => {
    const result = caseMetrics(finding, [evidence], series);
    expect(values(result.why)).toMatchObject({
      "Demand, next 28 days": "56 units",
      "Committed supply": "4 units",
      "Expected planned orders": "22 units",
      "Stock lasts": "2026-10-03",
    });
    expect(result.metrics[1].val).toBe("5 days");
    expect(result.why.some((row) => row.l === "Release")).toBe(false);
  });
  it("uses observed zero duration, last sale and distinct firm PO coverage", () => {
    const result = caseMetrics(
      { ...finding, finding_code: "current_out_of_stock" },
      [evidence],
      series,
    );
    expect(values(result.why)).toMatchObject({
      "Longest at zero": "6 days",
      "Stocked before, now zero": "1 stores",
      "Last sale at these stores": "2026-09-19",
      "Replenishment on order": "100% of affected stores",
    });
    expect(result.why.find((row) => row.l === "Time at zero")?.v).toBe(
      "6 days median",
    );
    expect(result.metrics[0].val).toBe("$200");
  });
  it("uses the declared excess target and actual capital, not a fixed carrying rate", () => {
    const result = caseMetrics(
      {
        ...finding,
        promise: "excess",
        finding_code: "excess_inventory",
        inventory_capital_amount: 80,
      },
      [evidence],
      series,
    );
    expect(values(result.why)).toMatchObject({
      "Cover target": "40 days",
      "Inventory capital": "$80",
      "Carrying cost, 4 wks": "Unavailable",
      "Firm inbound": "4 units",
      "Uncommitted inbound": "22 units",
    });
    const fractional = caseMetrics(
      {
        ...finding,
        promise: "excess",
        finding_code: "excess_inventory",
        inventory_capital_amount: 8068.98,
      },
      [evidence],
      series,
    );
    expect(
      values(
        conciseStoryWhy({ ...finding, promise: "excess" }, fractional.why),
      )["Inventory capital"],
    ).toBe("$8.1k");
  });
  it("does not turn missing projections into zeros or healthy coverage", () => {
    const incomplete = {
      ...series,
      diagnostics: undefined,
      projections: series.projections.map((row) => ({
        ...row,
        demand_units: null,
        inbound_units: null,
      })),
    };
    const result = caseMetrics(finding, [evidence], incomplete);
    expect(values(result.why)).toMatchObject({
      "Stock lasts": "Unavailable",
      "Demand, next 28 days": "Unavailable",
      "Expected planned orders": "Unavailable",
    });
    expect(result.metrics[0].val).toBe("Unavailable");
  });
});
