import { describe, expect, it } from "vitest";
import { buildDetails } from "@/lib/reimagined/details-model";
import { detailsFixture } from "./details-fixture";

describe("detail ledgers use the same valuations as the attention queue", () => {
  it.each(["z", "a", "i"] as const)(
    "reconciles every %s member and display cent",
    (lane) => {
      const input = detailsFixture(lane),
        model = buildDetails(input);
      expect(model.totalCents).toBe(Math.round(input.queue.amount! * 100));
      expect(model.rows.reduce((sum, row) => sum + (row.cents ?? 0), 0)).toBe(
        model.totalCents,
      );
      expect(model.rows.map((row) => row.amount)).toEqual([10.005, 10.005]);
      expect(model.rows.map((row) => row.cents)).toEqual([1001, 1000]);
    },
  );
  it("retains missing valuation as unknown and reconciles the known subtotal", () => {
    const model = buildDetails(detailsFixture("z", [10.005, null]));
    expect(model.partial).toBe(true);
    expect(model.totalCents).toBe(1001);
    expect(model.rows[1].cents).toBeNull();
    expect(
      buildDetails(detailsFixture("z", [null, null])).totalCents,
    ).toBeNull();
  });
  it("uses conditional shortage operands for a gap and cost for excess", () => {
    const gap = buildDetails(detailsFixture("a", [20, 30]));
    expect(gap.uncoveredUnits).toBe(5);
    expect(gap.firstShortage).toBe("2026-10-03");
    const excess = buildDetails(detailsFixture("i", [20, 30]));
    expect(excess.excessUnits).toBe(5);
    expect(excess.targetUnits).toBe(80);
  });
  it("keeps planned-only excess conditional and checks the stock-versus-target calculation", () => {
    const input = detailsFixture("i", [20, 30]);
    input.finding.finding_code = "conditional_excess_inventory";
    input.evidence.forEach((row, i) => {
      row.finding_code = "conditional_excess_inventory";
      row.facts.firm_ending_units = 38;
      row.facts.conditional_ending_units = 40 + [2, 3][i];
    });
    const model = buildDetails(input);
    expect(model.conditionalExcess).toBe(true);
    expect(model.rows.map((row) => row.projected)).toEqual([43, 42]);
    input.evidence[0].facts.conditional_ending_units = 1000;
    expect(() => buildDetails(input)).toThrow("Projected excess");
  });
  it.each(["queue", "members", "operand", "release", "duplicate"])(
    "rejects %s disagreement instead of inventing a replacement estimate",
    (problem) => {
      const input = detailsFixture("a", [20, 30]);
      if (problem === "queue") input.queue = { ...input.queue, amount: 99 };
      if (problem === "members") input.attention.rows[0].members!.pop();
      if (problem === "operand")
        input.series.store_supply![0].conditional_unfulfilled_units = 99;
      if (problem === "release")
        input.series.metric_release_id = `met_${"c".repeat(64)}`;
      if (problem === "duplicate")
        input.attention.rows[0].members![1].location_id = "s0";
      expect(() => buildDetails(input)).toThrow();
    },
  );
});
