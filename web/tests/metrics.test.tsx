import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MetricsBrowser from "../components/metrics/MetricsBrowser";

const release = `met_${"a".repeat(64)}`;
const metadata = {
  metric_release_id: release,
  contract_version: "retail-descriptive-metrics-v1",
  observation_date: "2026-10-30",
  population: 10500,
  states: { reported_zero_on_hand: 500, unknown_inventory: 0 },
  formulas: { store_day_rate: "units / valid observed store-days" },
  limitations: ["Reported inventory is not shelf availability."],
  configuration: {
    tier_baseline_end: "2026-09-25",
    minimum_coverage: 0.9,
    trend_percent: 15,
    trend_minimum_units: 7,
    weekly_persistence: 2,
  },
  items: [
    {
      product_id: "prd_one",
      product_name: "Test game",
      source_product_id: "100",
      company_item_id: "GAME-100",
    },
  ],
  periods: [
    {
      period_kind: "week",
      period_start: "2026-10-24",
      period_end: "2026-10-30",
    },
  ],
  check_counts: [{ check_code: "promised_distribution_gap", count: 500 }],
};

function response(value: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => value } as Response);
}

function setup(releaseOverride = release) {
  const fetcher = vi.fn((url: string) => {
    if (url.endsWith("metadata")) return response(metadata);
    const kind = new URL(url, "http://localhost").pathname.split("/").at(-1);
    const rows =
      kind === "checks"
        ? [
            {
              location_id: "loc_50",
              product_id: "prd_one",
              location_name: "Store 50",
              product_name: "Test game",
              check_code: "promised_distribution_gap",
              explanation: "Due promise, reported zero inventory.",
            },
          ]
        : [
            {
              scope_id: "prd_one",
              scope_name: "Test game",
              product_id: "prd_one",
              period_start: "2026-10-24",
              units: 70,
              dollars: 700,
              store_day_rate: 1,
              units_store_week: 7,
              dollars_store_week: 70,
              sales_coverage: 1,
              reported_oos_rate: 0.05,
              inventory_coverage: 1,
              trend_pct: null,
              trend_status: "from_zero",
              same_store_count: 1000,
              trend_highlight: false,
            },
          ];
    return response({
      metric_release_id: releaseOverride,
      kind,
      rows,
      total: 1,
      limit: 50,
      offset: 0,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Metrics browser", () => {
  it("shows accessible metrics, coverage, and the from-zero caveat", async () => {
    const fetcher = setup();
    render(<MetricsBrowser />);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("10,500")).toBeInTheDocument();
    expect(screen.getByText("From zero")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "U/store/week" }),
    ).toBeInTheDocument();
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain(`release_id=${release}`);
    fireEvent.click(screen.getByText("Definitions, assumptions & release"));
    expect(screen.getByText(/Tiers frozen using/)).toBeInTheDocument();
  });

  it("opens basic checks and store history outside any top ten", async () => {
    const fetcher = setup();
    render(<MetricsBrowser />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Basic checks" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "View metrics for Store 50" }),
    );
    await waitFor(() =>
      expect(fetcher.mock.calls.at(-1)?.[0]).toContain("scope_id=loc_50"),
    );
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("grain=store");
    expect(fetcher.mock.calls.at(-1)?.[0]).not.toContain("period_start=");
  });

  it("fails closed on a mixed-release response", async () => {
    setup(`met_${"b".repeat(64)}`);
    render(<MetricsBrowser />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Metric release mismatch",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains an unavailable release without sample values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response({}, false)),
    );
    render(<MetricsBrowser />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Metrics are not published or failed validation",
    );
    expect(screen.queryByText("10,500")).not.toBeInTheDocument();
  });
});
