import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  chartWeeks,
  exposureLabel,
  findingCopy,
  seriesSchema,
  type Series,
} from "@/lib/reimagined/data";
import { findingSchema } from "@/lib/connected/schema";
import { chartPicture } from "@/lib/reimagined/presentation";

describe("modeled dollar summaries and plain-language finding copy", () => {
  it("shows dollars, distinguishes missing coverage, and preserves real zero", () => {
    const bucket = {
      key: "z" as const,
      amount: 40000,
      known_amount: 40000,
      member_count: 10,
      valued_count: 10,
      basis: "Projected unmet retail demand",
    };
    expect(exposureLabel(bucket)).toBe("$40.0k");
    expect(exposureLabel({ ...bucket, amount: null, valued_count: 9 })).toBe(
      "$40.0k+",
    );
    expect(
      exposureLabel({
        ...bucket,
        amount: null,
        known_amount: null,
        valued_count: 0,
      }),
    ).toBe("—");
    expect(exposureLabel({ ...bucket, amount: 0, known_amount: 0 })).toBe("$0");
  });
  it("changes only the requested copy while retaining published operands", () => {
    // Copy is a presentation mapping, not a replacement finding calculation.
    const base = {
      finding_code: "future_supply_gap",
      title: "old",
      interpretation: "old",
      units: 12,
    } as ReturnType<typeof findingSchema.parse>;
    expect(findingCopy(base).title).toBe("Demand exceeds retailer plans");
    expect(findingCopy(base).units).toBe(12);
    expect(
      findingCopy({ ...base, finding_code: "promised_distribution_gap" }).title,
    ).toBe("Planned stores report no inventory");
    const untouched = {
      ...base,
      finding_code: "conditional_plan_dependency" as const,
    };
    expect(findingCopy(untouched)).toBe(untouched);
  });
});

describe("supplied UI preservation", () => {
  it("retains every original inline layout/style object in its original order", () => {
    const text = readFileSync(
      "components/signal/reimagined/ReimaginedView.tsx",
      "utf8",
    );
    const ast = ts.createSourceFile(
      "ui.tsx",
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const styles: unknown[] = [];
    const elements: string[] = [];
    const protectedAreas: Record<string, string> = {};
    const walk = (node: ts.Node) => {
      if (
        ts.isJsxText(node) &&
        ["Tracking", "Decide"].includes(node.text.trim())
      )
        protectedAreas[node.text.trim()] = createHash("sha256")
          .update(node.parent.parent.getText(ast).replace(/\s/g, ""))
          .digest("hex");
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
        elements.push(node.tagName.getText(ast));
      if (
        ts.isJsxAttribute(node) &&
        node.name.getText(ast) === "style" &&
        node.initializer &&
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        ts.isObjectLiteralExpression(node.initializer.expression)
      ) {
        styles.push(
          node.initializer.expression.properties.map((property) =>
            ts.isPropertyAssignment(property)
              ? [
                  ts.isIdentifier(property.name) ||
                  ts.isStringLiteral(property.name)
                    ? property.name.text
                    : property.name.getText(ast),
                  ts.isStringLiteral(property.initializer) ||
                  ts.isNumericLiteral(property.initializer)
                    ? property.initializer.text
                    : property.initializer.getText(ast).replace(/\s/g, ""),
                ]
              : property.getText(ast),
          ),
        );
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
    // Fingerprint computed directly from the user-supplied render function.
    expect(styles).toHaveLength(323);
    // Authorized attention additions plus one bounded Details panel insertion.
    // Original Review/Tracking cards and literal inline styles stay untouched.
    expect(elements).toHaveLength(515);
    expect(
      createHash("sha256").update(JSON.stringify(elements)).digest("hex"),
    ).toBe("8d327a76d64bcfecc09072a5d72c0e7bfd26a1c4c2ba31f18165c17282045663");
    expect(protectedAreas).toEqual({
      Tracking:
        "8e5358d93b9a1924579c17021d5d37110260d5f82fea2c716da4a2b57e6b5ff5",
      Decide:
        "8635d60b0444ba3bf6a147ae30f2d3aa2d8d78cbb75c68bef1789de1b5f865b1",
    });
    expect(
      createHash("sha256").update(JSON.stringify(styles)).digest("hex"),
    ).toBe("348d3802948f4dd87e7e14377ffd3357e81558f3f9e1b1104855b6b320b14eb5");
    expect(text).not.toContain("@ts-nocheck");
    expect(text).not.toContain("eslint-disable");
  });
});

describe("published display data, not a replacement model", () => {
  const series: Series = {
    metric_release_id: `met_${"a".repeat(64)}`,
    product_id: "p1",
    finding_id: null,
    scope: "currently_eligible_item_stores",
    member_count: 1,
    limitation: "No action effect",
    members: [
      {
        location_id: "l1",
        product_id: "p1",
        location_name: "Store 1",
        region: "West",
        on_hand: 100,
        current_state: "positive_reported_inventory",
      },
    ],
    history: Array.from({ length: 7 }, (_, i) => ({
      business_date: `2026-09-${19 + i}`,
      expected_stores: 1,
      sales_stores: 1,
      inventory_stores: 1,
      units: 2,
      dollars: 10,
      on_hand: 100 - i,
      zero_stores: 0,
    })),
    firm_orders: [],
    projections: [
      {
        projection_date: "2026-09-26",
        basis: "firm",
        ready_stores: 1,
        demand_units: 3,
        inbound_units: 5,
        ending_units: 20,
        unfulfilled_units: 0,
      },
      {
        projection_date: "2026-09-26",
        basis: "conditional",
        ready_stores: 1,
        demand_units: 3,
        inbound_units: 12,
        ending_units: 27,
        unfulfilled_units: 0,
      },
    ],
  };
  it("sums actual weekly flows and uses period-ending inventory", () => {
    const weeks = chartWeeks(seriesSchema.parse(series));
    expect(weeks[0].units).toBe(14);
    expect(weeks[0].firm).toBe(94);
    expect(weeks[1]).toMatchObject({
      phase: "projected",
      units: 3,
      receipts: 5,
      firm: 20,
      conditional: 27,
      planned: 7,
    });
  });
  it("preserves missingness instead of filling a plausible curve", () => {
    const incomplete = structuredClone(series);
    incomplete.history[2].units = null;
    expect(chartWeeks(incomplete)[0].units).toBeNull();
    const picture = chartPicture(chartWeeks(incomplete), "stock");
    expect(picture.backgroundImage).toContain("data:image/svg+xml");
    expect(decodeURIComponent(String(picture.backgroundImage))).not.toMatch(
      /NaN|undefined/,
    );
  });
});
