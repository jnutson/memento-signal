import type { Evidence, Finding } from "@/lib/connected/schema";
import type { Series } from "./data";
import { chartWeeks } from "./data";
import {
  compactMoney as money,
  number,
  compactMoney,
  wholeUnits,
} from "./presentation";
import type { Tile } from "./view-model";

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const total = (values: (number | null)[]) =>
  values.length && values.every((value) => value !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
const units = (value: number | null) =>
  value === null ? "Unavailable" : `${wholeUnits(value)} units`;
const median = (values: (number | null)[]) => {
  if (!values.length || values.some((value) => value === null)) return null;
  const sorted = (values as number[]).slice().sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

// Level 2 explains the specific case; the complete operands remain in Details.
export function conciseStoryWhy(
  finding: Finding | undefined,
  rows: Tile[],
): Tile[] {
  const byLabel = new Map(rows.map((row) => [row.l, row]));
  if (
    finding &&
    ["current_out_of_stock", "promised_distribution_gap"].includes(
      finding.finding_code,
    )
  ) {
    const duration = byLabel.get("Time at zero");
    const selected = [
      duration,
      byLabel.get("Daily sales baseline"),
      byLabel.get("Missed sales to date (est.)"),
      byLabel.get("Forward exposure (est.)"),
      byLabel.get("Replenishment on order"),
    ].filter((row): row is Tile => !!row);
    return selected;
  }
  const labels =
    finding?.promise === "excess"
      ? [
          "Cover target",
          "Projected excess",
          "Inventory capital",
          "Firm inbound",
          "Uncommitted inbound",
        ]
      : finding &&
          ["future_supply_gap", "conditional_plan_dependency"].includes(
            finding.finding_code,
          )
        ? [
            "Stock lasts",
            "Demand, next 28 days",
            "Committed supply",
            "Expected planned orders",
            "Uncovered demand",
          ]
        : [];
  return labels.length
    ? labels.flatMap((label) =>
        byLabel.has(label) ? [byLabel.get(label)!] : [],
      )
    : rows.slice(0, 5);
}

// Presentation aggregates of published operands; never the prototype's synthetic
// velocity, fixed receipt multipliers, invented zero durations or carrying rate.
export function caseMetrics(
  finding: Finding | undefined,
  evidence: Evidence[],
  series: Series,
): { metrics: Tile[]; why: Tile[] } {
  const firm = series.projections.filter((row) => row.basis === "firm");
  const demand =
    firm.length === 28 ? total(firm.map((row) => row.demand_units)) : null;
  const inbound =
    firm.length === 28 ? total(firm.map((row) => row.inbound_units)) : null;
  const onHand = total(series.members.map((row) => row.on_hand));
  const planned = series.diagnostics?.planned_receipts_28d ?? null;
  const exposure = series.diagnostics?.conditional_unmet_retail_amount ?? null;
  const recent = chartWeeks(series)
    .filter((row) => row.phase === "actual")
    .at(-1);
  const arrivals = firm
    .filter((row) => row.inbound_units !== null && row.inbound_units > 0)
    .map((row) => row.projection_date);
  const plans = evidence.flatMap((row) =>
    row.facts.plans.filter((plan) => plan.eligible_for_projection),
  );
  const placement = plans.map((plan) => plan.order_place_dt).sort()[0];
  if (!finding)
    return {
      metrics: [],
      why: [
        { l: "Stock on hand", v: units(onHand) },
        {
          l: "Demand, next 28 days",
          v: units(demand),
          s: "Walmart forecast · base path",
        },
        {
          l: "Committed supply",
          v: units(inbound),
          s: "Firm receipts within 28 days",
        },
        {
          l: "Expected planned orders",
          v: units(planned),
          s: "Eligible arrivals within 28 days · not firm",
        },
      ],
    };
  if (
    ["current_out_of_stock", "promised_distribution_gap"].includes(
      finding.finding_code,
    )
  ) {
    const days = evidence.map((row) => row.facts.consecutive_zero_days);
    const med = median(days);
    const longest =
      days.length && days.every((day) => day !== null)
        ? Math.max(...(days as number[]))
        : null;
    const firstDate = firm[0]?.projection_date,
      lastDate = firm.at(-1)?.projection_date;
    const replenished = new Set(
      series.firm_orders
        .filter(
          (order) =>
            firstDate &&
            lastDate &&
            order.expected_store_receipt_date >= firstDate &&
            order.expected_store_receipt_date <= lastDate,
        )
        .map((order) => order.location_id),
    ).size;
    const noEarlier =
      series.diagnostics?.zero_without_observed_stock_stores ?? null;
    const stockedBefore =
      series.diagnostics?.zero_previously_stocked_stores ?? null;
    return {
      metrics: [
        { label: "unmet demand", val: compactMoney(exposure) },
        {
          label: "stores at zero",
          val: number(series.member_count),
        },
        {
          label: "observed sales",
          val:
            recent?.dollars === null || recent?.dollars === undefined
              ? "Unavailable"
              : `${compactMoney(recent.dollars)}/wk`,
        },
      ],
      why: [
        {
          l: "Time at zero",
          v: med === null ? "Unavailable" : `${number(med)} days median`,
          s:
            longest === null
              ? undefined
              : `${number(longest)} days longest · affected stores`,
        },
        {
          l: "Never stocked",
          v: noEarlier === null ? "Unavailable" : `${noEarlier} stores`,
          s: "No earlier positive inventory observed · not a lifetime claim",
        },
        {
          l: "Stocked before, now zero",
          v: stockedBefore === null ? "Unavailable" : `${stockedBefore} stores`,
          s:
            med === null
              ? "Zero duration unavailable"
              : `median ${number(med)} days at zero across affected stores`,
        },
        {
          l: "Longest at zero",
          v: longest === null ? "Unavailable" : `${number(longest)} days`,
        },
        {
          l: "Last sale at these stores",
          v: series.diagnostics
            ? (series.diagnostics.last_sale_date ?? "No recorded sale")
            : "Unavailable",
          s: `Available history from ${series.diagnostics?.history_start_date ?? "unknown"}`,
        },
        {
          l: "Replenishment on order",
          v: `${number((100 * replenished) / Math.max(1, series.member_count))}% of affected stores`,
          s: `${replenished} stores with dated firm receipts within 28 days · excludes plans`,
        },
      ],
    };
  }
  if (finding.promise === "excess") {
    const target = total(
      evidence.map((row) =>
        numeric(row.facts.excess_calculation?.target_units),
      ),
    );
    const cover = [
      ...new Set(
        evidence.map((row) =>
          numeric(row.facts.excess_calculation?.target_cover_days),
        ),
      ),
    ];
    return {
      metrics: [
        {
          label: "excess at cost",
          val: compactMoney(finding.inventory_capital_amount),
        },
        {
          label: "excess units",
          val: wholeUnits(finding.units),
        },
        { label: "on hand", val: units(onHand) },
      ],
      why: [
        {
          l: "Cover target",
          v:
            cover.length === 1 && cover[0] !== null
              ? `${number(cover[0])} days`
              : "Varies / unavailable",
          s: units(target),
        },
        {
          l: "Projected excess",
          v: units(finding.units),
          s: `vs target by ${finding.last_event_date ?? "day 28"} · ${finding.finding_code === "conditional_excess_inventory" ? "includes eligible plans" : "firm supply only"}`,
        },
        {
          l: "Inventory capital",
          v: money(finding.inventory_capital_amount),
          s: "At unit cost · not a markdown-loss estimate",
        },
        {
          l: "Carrying cost, 4 wks",
          v: money(finding.carrying_cost_28d_amount),
          s:
            finding.carrying_cost_28d_amount === null
              ? "Approved carrying rate not provided"
              : "Published approved carrying rate",
        },
        {
          l: "Firm inbound",
          v: units(inbound),
          s: "Dated receipts within 28 days · not assumed changeable",
        },
        {
          l: "Uncommitted inbound",
          v: units(planned),
          s: "Eligible planned arrivals within 28 days · review permissions unverified",
        },
      ],
    };
  }
  if (
    ["future_supply_gap", "conditional_plan_dependency"].includes(
      finding.finding_code,
    )
  ) {
    const gap = total(
      evidence.map((row) => row.facts.conditional_unfulfilled_units),
    );
    const cover =
      onHand !== null && demand !== null && demand > 0
        ? onHand / (demand / 28)
        : null;
    return {
      metrics: [
        {
          label: "sales at risk",
          val: compactMoney(exposure),
        },
        {
          label: "stock cover",
          val: cover === null ? "Unavailable" : `${wholeUnits(cover)} days`,
        },
        { label: "supply gap", val: units(gap) },
      ],
      why: [
        {
          l: "Stock lasts",
          v:
            series.diagnostics?.first_firm_depletion_date ??
            (demand === null ? "Unavailable" : "No depletion in 28 days"),
          s: "First affected store to reach zero · firm supply path",
        },
        {
          l: "Uncovered demand",
          v: units(gap),
          s: "Next 28 days · including eligible planned supply",
        },
        {
          l: "Committed supply",
          v: units(inbound),
          s: arrivals.length
            ? `First receipt ${arrivals[0]} · arrivals vary by store`
            : "No dated receipts within 28 days",
        },
        {
          l: "Expected planned orders",
          v: units(planned),
          s: "Eligible planned arrivals within 28 days · not firm",
        },
        {
          l: "Demand, next 28 days",
          v: units(demand),
          s: "Walmart forecast · unchanged base path",
        },
        {
          l: "Prerequisites",
          v: "Supplier confirmation · DC inventory · retailer PO",
          s: "Action feasibility not yet verified",
        },
        {
          l: "Routine replenishment",
          v: placement
            ? `Next source placement ${placement}`
            : "No eligible planned order",
          s: "Source plan dates, not an assumed weekly reorder policy",
        },
      ],
    };
  }
  return {
    metrics: [
      {
        label: "affected stores",
        val: number(series.member_count),
      },
    ],
    why: [
      { l: "Evidence", v: finding.interpretation },
      { l: "Stock on hand", v: units(onHand) },
      { l: "Demand, next 28 days", v: units(demand), s: "Published base path" },
    ],
  };
}
