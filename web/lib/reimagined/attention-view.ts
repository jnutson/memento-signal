import type { Finding } from "@/lib/connected/schema";
import type { AttentionRow } from "./data";
import { exposureLabel } from "./data";

export const attentionTypes = [
  { key: "a", label: "Supply gap" },
  { key: "z", label: "Stores at zero" },
  { key: "i", label: "Excess" },
] as const;
export const attentionDollars = (row: AttentionRow) => exposureLabel(row);
export function attentionOrder(a: AttentionRow, b: AttentionRow) {
  const av = a.amount ?? a.known_amount,
    bv = b.amount ?? b.known_amount;
  return (
    (av === null ? 1 : 0) - (bv === null ? 1 : 0) ||
    (bv ?? 0) - (av ?? 0) ||
    a.finding_id.localeCompare(b.finding_id)
  );
}
export function attentionQueue(
  findings: ReadonlyArray<Pick<Finding, "finding_id">>,
  valuations: AttentionRow[],
  filter: string,
  expanded: string[],
) {
  const catalog = new Map(findings.map((row) => [row.finding_id, row]));
  return attentionTypes.map((type) => {
    const all = valuations
      .filter(
        (row) =>
          row.lane === type.key &&
          catalog.has(row.finding_id) &&
          (filter === "all" || filter === type.key),
      )
      .filter((row) => row.amount === null || row.amount > 0)
      .sort(attentionOrder);
    return {
      ...type,
      all,
      visible: expanded.includes(type.key) ? all : all.slice(0, 3),
    };
  });
}
// Area scales with dollars. A small minimum preserves zero/unknown accessibility.
export function attentionDiameter(value: number | null, maximum: number) {
  return value === null
    ? 12
    : Math.sqrt(
        12 ** 2 +
          (34 ** 2 - 12 ** 2) *
            Math.min(1, Math.max(0, value) / Math.max(1, maximum)),
      );
}
