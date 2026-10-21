import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { allRows, loadReview } from "@/lib/connected/client";
import { evidenceCsv, csvCell } from "@/lib/connected/export";
import { evidenceSchema, findingSchema } from "@/lib/connected/schema";
import { money } from "@/lib/connected/presentation";

const release = `met_${"a".repeat(64)}`;
const fid = `find_${"b".repeat(64)}`;
const finding = findingSchema.parse({
  finding_id: fid,
  product_id: "prd_1",
  promise: "excess",
  finding_code: "excess_inventory",
  title: "Excess",
  interpretation: "Review the source plans; not savings.",
  supply_basis: "firm_and_conditional_separate",
  units_basis: "firm_excess_units_at_28d",
  as_of: "2026-10-17T12:00:00Z",
  affected_store_count: 1,
  eligible_store_count: 1050,
  affected_store_share: 1 / 1050,
  context_json: '{"target_cover_days":40}',
  first_event_date: "2026-11-13",
  last_event_date: "2026-11-13",
  earliest_plan_review_date: "2026-10-20",
  units: 32,
  retail_exposure_amount: null,
  inventory_capital_amount: 128,
  carrying_cost_28d_amount: null,
  retail_valued_store_count: 0,
  cost_valued_store_count: 1,
  missing_evidence: ["approved_annual_carrying_cost_rate"],
  limitations: ["Not realized savings"],
});
const rawEvidence = {
  finding_id: fid,
  evidence_id: "ev_1",
  product_id: "prd_1",
  location_id: "loc_1",
  finding_code: "excess_inventory",
  event_date: "2026-11-13",
  plan_review_date: "2026-10-20",
  units: 32,
  retail_exposure_amount: null,
  inventory_capital_amount: 128,
  carrying_cost_28d_amount: null,
  missing_evidence: [],
  facts_json: JSON.stringify({
    observation_date: "2026-10-16",
    on_hand: 100,
    store_name: "=Untrusted",
    product_name: "Test game",
    region: "West",
    tier: "high",
    promised_due: true,
    consecutive_zero_days: 0,
    firm_unfulfilled_units: 0,
    conditional_unfulfilled_units: 0,
    firm_ending_units: 72,
    conditional_ending_units: 100,
    comparison_state: "firm_only_sufficient",
    plans: [],
    source_tables: ["current_store"],
    source_key: { product_id: "prd_1", location_id: "loc_1" },
  }),
};
const respond = (value: unknown, status = 200) =>
  Promise.resolve({
    ok: status === 200,
    status,
    json: async () => value,
  } as Response);
afterEach(() => vi.unstubAllGlobals());

it("exports counterfactual operands separately and rejects incomplete valuation membership", () => {
  const evidence = evidenceSchema.parse(rawEvidence);
  const valuation = {
    model_version: "attention-exposure-v1",
    assumptions: { replenishment_days: 21 },
    members: [
      {
        location_id: "loc_1",
        product_id: "prd_1",
        amount: 128,
        retrospective_amount: null,
        forward_amount: 128,
      },
    ],
  };
  const csv = evidenceCsv(release, finding, [evidence], valuation);
  expect(csv).toContain("valuation_assumptions");
  expect(csv).toContain("attention-exposure-v1");
  expect(csv).toContain("retrospective_amount");
  expect(() =>
    evidenceCsv(release, finding, [evidence], { ...valuation, members: [] }),
  ).toThrow("valuation evidence");
});

describe("release-pinned, complete API pages", () => {
  it("loads every page and pins the same release", async () => {
    const fetcher = vi.fn((url: string) => {
      const query = new URL(url, "http://localhost").searchParams;
      expect(query.get("release_id")).toBe(release);
      const offset = Number(query.get("offset"));
      return respond({
        metric_release_id: release,
        kind: "stores",
        total: 201,
        limit: 200,
        offset,
        rows: offset
          ? [{ n: 200 }]
          : Array.from({ length: 200 }, (_, n) => ({ n })),
      });
    });
    vi.stubGlobal("fetch", fetcher);
    expect(
      await allRows("stores", z.object({ n: z.number() }), release),
    ).toHaveLength(201);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(["identity", "population", "empty", "failed"])(
    "rejects %s problems without returning a partial result",
    async (problem) => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          const offset = Number(
            new URL(url, "http://localhost").searchParams.get("offset"),
          );
          if (offset && problem === "failed") return respond({}, 503);
          return respond({
            metric_release_id:
              offset && problem === "identity"
                ? `met_${"c".repeat(64)}`
                : release,
            kind: "stores",
            total: offset && problem === "population" ? 202 : 201,
            offset,
            limit: 200,
            rows: offset
              ? problem === "empty"
                ? []
                : [{ n: 200 }]
              : Array.from({ length: 200 }, (_, n) => ({ n })),
          });
        }),
      );
      await expect(
        allRows("stores", z.object({ n: z.number() }), release),
      ).rejects.toThrow();
    },
  );
  it("rejects mismatched review identities and non-null simulated benefits", async () => {
    vi.stubGlobal("fetch", () =>
      respond({
        metric_release_id: release,
        finding_id: fid,
        cue: "Review",
        cue_basis: "Not a rank",
        options: [],
        recommendation: null,
        priority_score: null,
        estimated_action_benefit: 100,
        action_deadline: null,
        result: "Not measured",
        workflow: "Session notes",
      }),
    );
    await expect(loadReview(release, fid)).rejects.toThrow();
  });
});

describe("truthful evidence and complete export", () => {
  it("validates array fields, operands, source keys and unknown values", () => {
    const row = evidenceSchema.parse(rawEvidence);
    expect(row.facts.on_hand).toBe(100);
    expect(
      evidenceSchema.safeParse({ ...rawEvidence, facts_json: "{}" }).success,
    ).toBe(false);
    expect(
      evidenceSchema.safeParse({ ...rawEvidence, location_id: "loc_other" })
        .success,
    ).toBe(false);
    expect(
      findingSchema.safeParse({ ...finding, missing_evidence: "none" }).success,
    ).toBe(false);
    expect(money(null)).toBe("Unavailable");
    expect(money(0)).toBe("$0.00");
  });
  it("exports every member, economic basis and source operand, never a partial list", () => {
    const evidence = evidenceSchema.parse(rawEvidence);
    const csv = evidenceCsv(release, finding, [evidence]);
    expect(csv).toContain(release);
    expect(csv).toContain("firm_excess_units_at_28d");
    expect(csv).toContain("Not realized savings");
    expect(csv).toContain('"128"');
    expect(() => evidenceCsv(release, finding, [])).toThrow();
    expect(() =>
      evidenceCsv(release, finding, [{ ...evidence, product_id: "other" }]),
    ).toThrow();
  });
  it("neutralizes spreadsheet formulas while preserving negative numeric quantities", () => {
    expect(csvCell(' \t=HYPERLINK("x")')).toBe('"\' \t=HYPERLINK(""x"")"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell(null)).toBe('""');
  });
});
