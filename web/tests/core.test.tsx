import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  summarySchema,
  productSchema,
  storePageSchema,
} from "@/lib/core/schema";
import { loadSummary, loadProduct } from "@/lib/core/client";
import { TimeChart } from "@/components/core/TimeChart";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const release = "met_" + "a".repeat(64);
const capabilities = {
  inventory: true,
  conditional_supply: true,
  findings: true,
  demand_components: false,
  promotion_analysis: false,
  store_map: false,
};
const total = {
  units: 0,
  retail_sales: 0,
  complete: false,
  sales_days: 0,
  expected_days: 1,
  covered_products: 0,
};
const summary = {
  view_version: "workspace-view-v1",
  metric_release_id: release,
  metric_version: "existing-contract",
  issued_at: "2026-11-28T12:00:00Z",
  observation_date: "2026-11-27",
  week_start: "2026-11-21",
  week_end: "2026-11-27",
  store_count: 4,
  current: total,
  prior: total,
  units_change_pct: null,
  products: Array.from({ length: 8 }, (_, i) => ({
    product_id: `p${i}`,
    product_name: `Item ${i}`,
    source_product_id: String(i),
    company_item_id: null,
    current: null,
    prior: null,
    unit_share_pct: null,
  })),
  capabilities,
  sales_basis: "Published retailer sales",
};
const product = {
  view_version: "workspace-view-v1",
  metric_release_id: release,
  product_id: "p0",
  region: null,
  finding_id: null,
  observation_date: "2026-11-27",
  regions: [],
  sales_weeks: [],
  inventory: { stores: 2, known_stores: 1, on_hand: null, zero_stores: 0 },
  projections: [],
  economics: [],
  regional_sales: [],
  capabilities,
  projection_basis: "Existing model",
};

it("accepts variable product counts while rejecting duplicate populations and incomplete growth claims", () => {
  expect(summarySchema.parse(summary).products).toHaveLength(8);
  expect(
    summarySchema.safeParse({
      ...summary,
      products: [summary.products[0], summary.products[0]],
    }).success,
  ).toBe(false);
  expect(
    summarySchema.safeParse({ ...summary, units_change_pct: 15 }).success,
  ).toBe(false);
});
it("rejects partial store projections masquerading as a whole-scope total", () => {
  const row = {
    date: "2026-11-28",
    basis: "firm",
    ready_stores: 1,
    demand_units: 1,
    inbound_units: 0,
    ending_units: 4,
    unfulfilled_units: 0,
    stores_with_unmet: 0,
    retail_exposure: 0,
    cumulative_unmet_units: 0,
    cumulative_retail_exposure: 0,
  };
  expect(
    productSchema.safeParse({ ...product, projections: [row] }).success,
  ).toBe(false);
  expect(
    storePageSchema.safeParse({
      view_version: "workspace-view-v1",
      metric_release_id: release,
      product_id: "p0",
      region: null,
      search: "",
      limit: 1,
      offset: 0,
      total: 0,
      rows: [
        {
          location_id: "s1",
          source_location_id: "1",
          location_name: "Store",
          region: "East",
          on_hand: null,
          current_state: "unknown_inventory",
        },
      ],
    }).success,
  ).toBe(false);
});
it("rejects a successful transport with a different pinned publication or product scope", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(summary))),
  );
  await expect(loadSummary("met_" + "b".repeat(64))).rejects.toThrow(
    "identity mismatch",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(product))),
  );
  await expect(loadProduct(release, "p0", "East", null)).rejects.toThrow(
    "scope mismatch",
  );
});
it("draws a gap for unknown values and exposes the same dates through keyboard selection", () => {
  const { container } = render(
    <TimeChart
      title="Weekly sales"
      unit="Units"
      labels={["Recorded units"]}
      rows={[
        { date: "2026-11-06", values: [10] },
        { date: "2026-11-13", values: [null] },
        { date: "2026-11-20", values: [0] },
      ]}
    />,
  );
  const path = container
    .querySelector('path[stroke="#2a78d6"]')!
    .getAttribute("d")!;
  expect(path.match(/M/g)).toHaveLength(2);
  const marks = screen.getAllByRole("button");
  marks[2].focus();
  fireEvent.keyDown(marks[2], { key: "ArrowLeft" });
  expect(marks[1]).toHaveFocus();
  expect(screen.getByText(/Recorded units: Unavailable/)).toBeVisible();
  fireEvent.pointerMove(marks[0]);
  expect(screen.getByRole("tooltip")).toHaveTextContent("10 · Recorded units");
});
