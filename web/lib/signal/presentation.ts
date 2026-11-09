import type { SignalRow, SignalType } from "./schema";

export const labels: Record<SignalType, string> = { availability: "Stockout risk", inventory_imbalance: "Excess inventory", demand_momentum: "Demand overperformance" };
export const labelFor = (row: SignalRow) => row.signal_direction === "deceleration" ? "Demand underperformance" : labels[row.signal_type];
export const money = (value: string | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
export const number = (value: string | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Number(value));
export const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const impact = (row: SignalRow) => row.signal_type === "inventory_imbalance" ? `${money(row.inventory_cost_exposed_amount)} inventory capital exposed` : row.signal_type === "availability" ? `${money(row.estimated_retail_sales_impact_amount)} estimated retail sales exposure` : `${number(row.headline_metric_value)} units forward demand gap`;
