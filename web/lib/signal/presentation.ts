import type { SignalQueue, SignalRow, SignalType } from "./schema";

export const signalLabels: Record<SignalType, string> = {
  availability: "Availability Risk",
  demand_momentum: "Demand Momentum Gap",
  inventory_imbalance: "Inventory Imbalance Exposure",
};
export const signalTypes = Object.keys(signalLabels) as SignalType[];
export const formatNumber = (value: number | string) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value));
export const formatMoney = (value: string | number | null) => value === null ? "Not applicable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
export const formatScore = (value: string) => (Number(value) * 100).toFixed(0);
export const formatCutoff = (value: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
export const humanize = (value: string) => value.replaceAll("_", " ");
export function signalWorld(signal: SignalRow): [number, number, number] {
  return [Number(signal.confidence_score) * 2 - 1, Number(signal.impact_score) * 2 - 1, Number(signal.urgency_score ?? signal.reaction_score) * 2 - 1];
}

export function impactSummary(signal: SignalRow): string {
  if (signal.signal_type === "inventory_imbalance") return `${formatMoney(signal.inventory_cost_exposed_amount)} inventory capital · ${formatMoney(signal.carrying_cost_28d_amount)} carrying cost / 28 days`;
  const basis = signal.signal_type === "availability" ? "retail sales at risk" : signal.signal_direction === "acceleration" ? "retail sales opportunity" : "retail forecast overstatement";
  return `${formatMoney(signal.estimated_retail_sales_impact_amount)} ${basis} · ${formatMoney(signal.estimated_contribution_impact_amount)} contribution / 28 days`;
}

export function decisionSummary(signal: SignalRow): string {
  const slack = signal.decision_slack_days;
  if (slack == null) return "Decision urgency unavailable in this legacy release";
  const date = new Date(`${signal.observation_date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + slack);
  return `${slack < 0 ? `${Math.abs(slack)} days past conservative start-by` : slack === 0 ? "Conservative start-by is today at snapshot" : `${slack} days left to start`} · ${formatCutoff(date.toISOString())} · ${signal.urgency_basis === "declared_review_allowance" ? "review/replan allowance" : "assumed action duration"}`;
}
// Keep different economic bases separate. These are displayed-row amounts, not whole-run totals.
export function displayedEconomics(queue: SignalQueue) {
  const sum = (type: SignalType, field: "estimated_retail_sales_impact_amount" | "inventory_cost_exposed_amount" | "carrying_cost_28d_amount") => queue.signals.filter((row) => row.signal_type === type).reduce((total, row) => total + Number(row[field] ?? 0), 0);
  return {
    availability: sum("availability", "estimated_retail_sales_impact_amount"),
    demand: sum("demand_momentum", "estimated_retail_sales_impact_amount"),
    inventory: sum("inventory_imbalance", "inventory_cost_exposed_amount"),
    carrying: sum("inventory_imbalance", "carrying_cost_28d_amount"),
  };
}
