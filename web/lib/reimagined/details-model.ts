import type { Evidence, Finding } from "@/lib/connected/schema";
import type { Attention, AttentionRow, Series } from "./data";

export type DetailsInput = {
  finding: Finding;
  evidence: Evidence[];
  series: Series;
  attention: Attention;
  queue: AttentionRow;
};
export type DetailRow = {
  id: string;
  name: string;
  region: string;
  amount: number | null;
  cents: number | null;
  zeroDays: number | null;
  baseline: number | null;
  receipt: string;
  demand: number | null;
  uncovered: number | null;
  shortage: string | null;
  projected: number | null;
  target: number | null;
  excess: number | null;
  evidence: Evidence;
  valuation: NonNullable<AttentionRow["members"]>[number];
};
const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
export const completeSum = (values: (number | null)[]) =>
  values.length && values.every((value) => value !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

export function buildDetails(input: DetailsInput) {
  const { finding, series, attention, queue, evidence } = input;
  const value = attention.rows[0];
  if (
    !value ||
    attention.rows.length !== 1 ||
    series.metric_release_id !== attention.metric_release_id ||
    series.product_id !== finding.product_id ||
    series.finding_id !== finding.finding_id ||
    value.finding_id !== finding.finding_id ||
    value.product_id !== finding.product_id ||
    queue.finding_id !== value.finding_id ||
    queue.amount !== value.amount ||
    queue.known_amount !== value.known_amount ||
    queue.valued_count !== value.valued_count ||
    queue.member_count !== value.member_count ||
    !value.members ||
    value.members.length !== finding.affected_store_count ||
    series.member_count !== value.member_count ||
    evidence.length !== value.member_count
  )
    throw new Error(
      "The detail evidence does not reconcile to this attention estimate. No replacement total was calculated.",
    );
  const members = value.members;
  const keys = new Set(members.map((row) => row.location_id));
  const facts = new Map(evidence.map((row) => [row.location_id, row]));
  if (
    keys.size !== members.length ||
    facts.size !== members.length ||
    members.some(
      (row) =>
        row.product_id !== finding.product_id || !facts.has(row.location_id),
    ) ||
    evidence.some(
      (row) =>
        row.finding_id !== finding.finding_id ||
        row.product_id !== finding.product_id,
    ) ||
    new Set(series.members.map((row) => row.location_id)).size !== keys.size ||
    series.members.some((row) => !keys.has(row.location_id))
  )
    throw new Error(
      "Incomplete or conflicting store membership in detail evidence.",
    );
  const known = members.filter((row) => row.amount !== null);
  const expectedLane = [
    "current_out_of_stock",
    "promised_distribution_gap",
  ].includes(finding.finding_code)
    ? "z"
    : finding.finding_code === "future_supply_gap"
      ? "a"
      : ["excess_inventory", "conditional_excess_inventory"].includes(
            finding.finding_code,
          )
        ? "i"
        : null;
  if (
    value.lane !== expectedLane ||
    queue.product_id !== finding.product_id ||
    known.some(
      (row) =>
        row.amount! < 0 || !Number.isSafeInteger(Math.round(row.amount! * 100)),
    )
  )
    throw new Error("Invalid detail valuation basis or currency range.");
  const rawTotal = known.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  const target = value.amount ?? value.known_amount;
  if (
    known.length !== value.valued_count ||
    (value.amount !== null && known.length !== members.length) ||
    (target === null
      ? known.length !== 0
      : Math.round(rawTotal * 100) !== Math.round(target * 100))
  )
    throw new Error(
      "Store valuations do not reconcile to the attention dollar total.",
    );
  // Largest-remainder cent allocation keeps displayed rows and the ledger total
  // identical. Raw source estimates remain unchanged in evidence and export.
  const cents = new Map(
    known.map((row) => [row.location_id, Math.floor(row.amount! * 100)]),
  );
  const pennies =
    Math.round((target ?? 0) * 100) -
    [...cents.values()].reduce((sum, n) => sum + n, 0);
  const remainders = known
    .slice()
    .sort(
      (a, b) =>
        b.amount! * 100 -
          Math.floor(b.amount! * 100) -
          (a.amount! * 100 - Math.floor(a.amount! * 100)) ||
        a.location_id.localeCompare(b.location_id),
    );
  if (pennies < 0 || pennies > remainders.length)
    throw new Error("Unable to reconcile currency rounding.");
  remainders
    .slice(0, pennies)
    .forEach((row) =>
      cents.set(row.location_id, cents.get(row.location_id)! + 1),
    );
  const supply = new Map(
    series.store_supply?.map((row) => [row.location_id, row]) ?? [],
  );
  const conditionalExcess =
    finding.finding_code === "conditional_excess_inventory";
  const firstFirm = new Map<string, Series["firm_orders"][number]>();
  series.firm_orders
    .slice()
    .sort((a, b) =>
      a.expected_store_receipt_date.localeCompare(
        b.expected_store_receipt_date,
      ),
    )
    .forEach((order) => {
      if (!firstFirm.has(order.location_id))
        firstFirm.set(order.location_id, order);
    });
  const rows: DetailRow[] = members.map((member) => {
    const e = facts.get(member.location_id)!,
      s = supply.get(member.location_id);
    const next = firstFirm.get(member.location_id);
    const receipt =
      member.receipt_basis ===
      "assumed_existing_brand_stock_and_new_authorized_po"
        ? `Scenario ${member.window_end_date}`
        : next
          ? `Firm ${next.expected_store_receipt_date}`
          : "No dated firm receipt";
    return {
      id: member.location_id,
      name: e.facts.store_name,
      region: e.facts.region ?? "Unknown",
      amount: member.amount,
      cents: cents.get(member.location_id) ?? null,
      zeroDays: member.zero_days,
      baseline: member.baseline_daily_retail,
      receipt,
      demand: s?.demand_base_28d ?? null,
      uncovered: s?.conditional_unfulfilled_units ?? null,
      shortage: s?.conditional_shortage_date ?? null,
      projected: conditionalExcess
        ? e.facts.conditional_ending_units
        : e.facts.firm_ending_units,
      target: finite(e.facts.excess_calculation?.target_units),
      excess: e.units,
      evidence: e,
      valuation: member,
    };
  });
  rows.sort(
    (a, b) =>
      (a.amount === null ? 1 : 0) - (b.amount === null ? 1 : 0) ||
      (b.amount ?? 0) - (a.amount ?? 0) ||
      a.id.localeCompare(b.id),
  );
  for (const row of rows) {
    if (
      value.lane === "i" &&
      row.projected !== null &&
      row.target !== null &&
      row.excess !== null &&
      Math.abs(Math.max(0, row.projected - row.target) - row.excess) > 1e-6
    )
      throw new Error(
        "Projected excess does not reconcile to the declared stock target.",
      );
    const calculated =
      value.lane === "z"
        ? row.valuation.retrospective_amount !== null &&
          row.valuation.forward_amount !== null
          ? row.valuation.retrospective_amount + row.valuation.forward_amount
          : null
        : value.lane === "a"
          ? row.uncovered !== null && row.valuation.unit_retail_amount !== null
            ? row.uncovered * row.valuation.unit_retail_amount
            : null
          : row.excess !== null &&
              finite(row.evidence.facts.unit_cost_amount) !== null
            ? row.excess * finite(row.evidence.facts.unit_cost_amount)!
            : null;
    if (
      row.amount !== null &&
      (calculated === null ||
        Math.round(calculated * 100) !== Math.round(row.amount * 100))
    )
      throw new Error(
        "Store calculation operands do not reconcile to the attention estimate.",
      );
  }
  return {
    ...input,
    value,
    rows,
    totalCents: target === null ? null : Math.round(target * 100),
    partial: value.amount === null,
    conditionalExcess,
    targetUnits: completeSum(rows.map((row) => row.target)),
    excessUnits: completeSum(rows.map((row) => row.excess)),
    uncoveredUnits: completeSum(rows.map((row) => row.uncovered)),
    firstShortage:
      rows.flatMap((row) => (row.shortage ? [row.shortage] : [])).sort()[0] ??
      null,
  };
}
export type DetailsModel = ReturnType<typeof buildDetails>;
