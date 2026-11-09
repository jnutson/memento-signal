import { investigationSchema, type Day } from "@/lib/investigation/schema";
import { detailFor, signals, run } from "./signal-fixtures";

export const investigationSignals = [
  ...signals,
  {
    ...signals[1],
    signal_id: `sig_${"4".repeat(64)}`,
    signal_direction: "deceleration",
    overall_rank_position: 4,
    signal_type_rank_position: 2,
  },
];
export const investigationRun = {
  ...run,
  candidate_count: 4,
  display_count: 4,
  candidate_counts_by_type: {
    availability: 1,
    demand_momentum: 2,
    inventory_imbalance: 1,
  },
};
export const investigationQueue = {
  api_contract_version: "memento-signal-api-v1",
  run: investigationRun,
  signals: investigationSignals,
};
const date = (offset: number) =>
  new Date(Date.UTC(2027, 0, 29 + offset)).toISOString().slice(0, 10);
const blank = {
  opening: null,
  stock: null,
  sales: null,
  receipts: null,
  demand: null,
  fulfilled: null,
  lost: null,
  baseline: null,
  adjusted: null,
  gap: null,
  cumulative_gap: null,
  target: null,
  within_target: null,
  excess: null,
  cover: null,
  flags: [] as string[],
};
export function investigationFor(
  signal: (typeof investigationSignals)[number],
) {
  const demand = signal.signal_type === "demand_momentum";
  const days: Day[] = Array.from({ length: 56 }, (_, i) => ({
    ...blank,
    date: date(i - 55),
    week: 202649 + Math.floor(i / 7),
    phase: "actual",
    series: "history",
    stock: 20,
    opening: 20,
    sales: 1,
    receipts: 0,
    cover: 20 / 7,
  }));
  for (const path of demand
    ? (["base"] as const)
    : (["low", "base", "high"] as const)) {
    let stock = signal.signal_type === "availability" ? 2 : 50;
    for (let i = 1; i <= 28; i++) {
      const receipts = i === 7 ? 10 : 0,
        opening = stock,
        needed = path === "low" ? 0.8 : path === "high" ? 1.2 : 1;
      const fulfilled = Math.min(stock + receipts, needed),
        lost = needed - fulfilled;
      stock = stock + receipts - fulfilled;
      days.push({
        ...blank,
        date: date(i),
        week: 202657 + Math.floor((i - 1) / 7),
        phase: "projected",
        series: path,
        ...(demand
          ? {
              baseline: 1,
              adjusted: signal.signal_direction === "deceleration" ? 0.5 : 1.5,
              gap: signal.signal_direction === "deceleration" ? -0.5 : 0.5,
              cumulative_gap: i * 0.5,
            }
          : {
              opening,
              stock,
              receipts,
              demand: needed,
              fulfilled,
              lost,
              cover: stock / 7,
              ...(signal.signal_type === "inventory_imbalance"
                ? {
                    target: 12,
                    within_target: Math.min(stock, 12),
                    excess: Math.max(stock - 12, 0),
                  }
                : {}),
            }),
      });
    }
  }
  const groups = new Map<string, Day[]>();
  for (const d of days) {
    const key = `${d.series}:${d.week}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const fields = [
    "sales",
    "receipts",
    "demand",
    "fulfilled",
    "lost",
    "baseline",
    "adjusted",
    "gap",
  ] as const;
  const weeks = [...groups].map(([key, rows]) => {
    const first = rows[0],
      last = rows.at(-1)!;
    return {
      key,
      week: first.week,
      phase: first.phase,
      series: first.series,
      start: first.date,
      end: last.date,
      days: rows.length,
      partial: rows.length !== 7,
      opening: first.opening,
      stock: last.stock,
      target: last.target,
      excess: last.excess,
      ...Object.fromEntries(
        fields.map((f) => [
          f,
          rows.some((d) => d[f] == null)
            ? null
            : rows.reduce((a, d) => a + (d[f] ?? 0), 0),
        ]),
      ),
      retailer_forecast: 7,
      forecast_vintage: first.week - 1,
      ratio: first.phase === "actual" ? 1 : null,
      role:
        first.phase === "actual"
          ? first.week < 202655
            ? "baseline"
            : "recent"
          : "forward",
      flags: [],
    };
  });
  return investigationSchema.parse({
    api_contract_version: "memento-signal-investigation-api-v1",
    contract_version: "attention-investigation-v1",
    cover_version: "attention-investigation-stock-cover-v1",
    signal_id: signal.signal_id,
    signal_set_id: run.signal_set_id,
    canonical_dataset_id: run.canonical_dataset_id,
    signal_manifest_sha256: "a".repeat(64),
    canonical_manifest_sha256: "b".repeat(64),
    supply_model_sha256: null,
    configuration_hash: run.configuration_hash,
    signal_as_of: run.signal_as_of,
    observation_date: signal.observation_date,
    signal_type: signal.signal_type,
    direction: signal.signal_direction,
    reference_weekly_demand: 7,
    cover_status: "available",
    days,
    weeks,
    receipts: [
      {
        event_id: "evt_test",
        state: "open",
        quantity: 10,
        early: date(7),
        typical: date(7),
        conservative: date(7),
        basis: "expected",
        order_reference: "test",
        line: 1,
        version: 1,
        known_at: "2027-01-28T12:00:00Z",
        reference_status: "source_version",
      },
    ],
    diagnostics: {
      baseline_ratio: demand ? 1 : null,
      recent_ratio: demand
        ? signal.signal_direction === "deceleration"
          ? 0.5
          : 1.5
        : null,
      raw_multiplier: demand
        ? signal.signal_direction === "deceleration"
          ? 0.5
          : 1.5
        : null,
      multiplier: demand
        ? signal.signal_direction === "deceleration"
          ? 0.5
          : 1.5
        : null,
      error_allowance: demand ? 2 : null,
      target_cover_days: demand ? null : 12,
      safety_days: demand ? null : 2,
      material_date: date(signal.days_until_material_impact),
    },
  });
}
export const investigationDetail = detailFor;
