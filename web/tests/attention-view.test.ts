import { describe, expect, it } from "vitest";
import { attentionRowSchema } from "@/lib/reimagined/data";
import {
  attentionDiameter,
  attentionQueue,
  attentionOrder,
  attentionDollars,
} from "@/lib/reimagined/attention-view";

const valuation = (
  index: number,
  lane = "z",
  amount: number | null = index * 100,
) =>
  attentionRowSchema.parse({
    finding_id: `find_${index.toString(16).padStart(64, "0")}`,
    product_id: "p",
    lane,
    economic_basis: "estimated_unmet_retail_sales",
    amount,
    known_amount: amount,
    retrospective_amount: amount,
    forward_amount: 0,
    member_count: 1,
    valued_count: amount === null ? 0 : 1,
    historical_baseline_stores: 1,
    assumed_receipt_stores: 0,
    window_end_date: "2026-10-16",
  });
describe("financial attention, not a decision ranker", () => {
  it("shows three highest-dollar issues per type and retains the rest for expansion", () => {
    const rows = ["a", "z", "i"].flatMap((lane, group) =>
      Array.from({ length: 6 }, (_, i) => valuation(group * 6 + i + 1, lane)),
    );
    const findings = rows.map((row) => ({ finding_id: row.finding_id }));
    const preview = attentionQueue(findings, rows, "all", []);
    expect(preview.map((group) => group.visible.length)).toEqual([3, 3, 3]);
    expect(preview[0].visible.map((row) => row.amount)).toEqual([
      600, 500, 400,
    ]);
    expect(
      attentionQueue(findings, rows, "all", ["z"])[1].visible,
    ).toHaveLength(6);
    expect(
      attentionQueue(findings, rows, "z", []).flatMap((group) => group.visible),
    ).toHaveLength(3);
  });
  it("keeps missing valuation distinct from zero, with no store-count fallback", () => {
    const unknown = valuation(1, "z", null),
      known = valuation(2),
      zero = valuation(3, "z", 0);
    expect(attentionDollars(unknown)).toBe("—");
    expect(attentionOrder(unknown, known)).toBeGreaterThan(0);
    const queue = attentionQueue(
      [unknown, known, zero],
      [unknown, known, zero],
      "all",
      ["z"],
    );
    expect(queue[1].all.map((row) => row.finding_id)).toEqual([
      known.finding_id,
      unknown.finding_id,
    ]);
  });
  it("makes dot area monotonically dollar-sized with a minimum target", () => {
    expect(attentionDiameter(10000, 10000)).toBe(34);
    expect(attentionDiameter(1000, 10000)).toBeGreaterThan(
      attentionDiameter(100, 10000),
    );
    expect(attentionDiameter(null, 10000)).toBe(12);
    expect(attentionDiameter(2500, 10000) ** 2 - 12 ** 2).toBeCloseTo(
      (34 ** 2 - 12 ** 2) / 4,
    );
  });
});
