import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleaseProvider } from "@/components/product/ReleaseProvider";
import Monday from "@/components/product/Monday";
import Reports from "@/components/product/Reports";
import SignalAttention from "@/components/product/SignalAttention";
import { displayedEconomics, signalWorld } from "@/lib/signal/presentation";
import { signalQueueSchema } from "@/lib/signal/schema";
import { signals, run, detailFor } from "./signal-fixtures";

vi.mock("@/components/product/SignalScene", () => ({
  default: () => <div data-testid="attention-scene" />,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const queue = signalQueueSchema.parse({
  api_contract_version: "memento-signal-api-v1",
  run,
  signals,
});
function serve(payload: unknown = queue) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
  );
}
describe("Three-page frontend", () => {
  it("uses urgency coordinates and identical feed/graph ranks with visible financial impact", async () => {
    const prioritized = signals.map((signal) => ({
      ...signal,
      urgency_score: "1.000000",
      decision_slack_days: signal.days_until_material_impact - 10,
      decision_lead_time_days: 10,
      urgency_basis: "declared_review_allowance",
      urgency_action: "review_and_replan",
      rank_score: "0.960000",
    }));
    const payload = signalQueueSchema.parse({
      ...queue,
      run: {
        ...run,
        ranker_version: "memento-signal-urgency-ranker-v2",
        priority_policy: "deadline-urgency-v1",
      },
      signals: prioritized,
    });
    expect(signalWorld(payload.signals[0])[2]).toBe(1);
    expect(
      signalQueueSchema.safeParse({
        ...payload,
        signals: [
          { ...prioritized[0], decision_slack_days: 20 },
          ...prioritized.slice(1),
        ],
      }).success,
    ).toBe(false);
    serve(payload);
    render(
      <ReleaseProvider>
        <SignalAttention />
      </ReleaseProvider>,
    );
    await screen.findByRole("heading", { name: "Attention" });
    fireEvent.click(screen.getByRole("button", { name: "Feed" }));
    expect(
      screen.getByRole("region", { name: "Attention feed" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$120 retail sales at risk/)).toBeInTheDocument();
    expect(screen.getByText(/\$100 inventory capital/)).toBeInTheDocument();
    expect(
      screen.getByText(/8 days past conservative start-by/),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button", { name: /^#\d ·/ })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(
      prioritized.map(
        (signal) =>
          `#${signal.overall_rank_position} · ${signal.signal_type === "availability" ? "Availability Risk" : signal.signal_type === "demand_momentum" ? "Demand Momentum Gap" : "Inventory Imbalance Exposure"} · ${signal.identity.item_name} · ${signal.identity.store_name}`,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(
      screen.queryByRole("region", { name: "Attention feed" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^#1 · Availability/ }),
    ).toBeInTheDocument();
  });
  it("derives newsletter priorities from ranked rows and discloses missing POS reports", async () => {
    serve();
    render(
      <ReleaseProvider>
        <Monday />
      </ReleaseProvider>,
    );
    expect(await screen.findByText("Start here")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Review →" })[0],
    ).toHaveAttribute("href", `/attention?signal=${signals[0].signal_id}`);
    expect(screen.getByText(/not a weekly POS report/)).toBeInTheDocument();
  });
  it("keeps economics separate and exposes reproducible report metadata", async () => {
    expect(displayedEconomics(queue)).toEqual({
      availability: 120,
      demand: 120,
      inventory: 100,
      carrying: 2,
    });
    serve();
    render(
      <ReleaseProvider>
        <Reports />
      </ReleaseProvider>,
    );
    expect(
      await screen.findByRole("table", { name: "Signal coverage" }),
    ).toBeInTheDocument();
    expect(screen.getByText(run.configuration_hash)).toBeInTheDocument();
    expect(screen.getByText(/must not be added/)).toBeInTheDocument();
  });
  it("preserves score coordinates and original ranks when filtering", async () => {
    expect(signalWorld(queue.signals[0])[0]).toBeCloseTo(0.6);
    serve();
    render(
      <ReleaseProvider>
        <SignalAttention />
      </ReleaseProvider>,
    );
    await screen.findByRole("heading", { name: "Attention" });
    fireEvent.click(
      screen.getByRole("button", { name: "Inventory Imbalance Exposure" }),
    );
    expect(
      screen.getByRole("button", { name: /^#3 · Inventory/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^#1 · Availability/ }),
    ).not.toBeInTheDocument();
  });
  it("handles valid empty releases without claiming there is no business risk", async () => {
    serve({
      ...queue,
      run: {
        ...run,
        candidate_count: 0,
        display_count: 0,
        candidate_counts_by_type: {
          availability: 0,
          demand_momentum: 0,
          inventory_imbalance: 0,
        },
      },
      signals: [],
    });
    render(
      <ReleaseProvider>
        <Monday />
      </ReleaseProvider>,
    );
    expect(await screen.findByText(/does not guarantee/)).toBeInTheDocument();
  });
  it("fails closed on an invalid response", async () => {
    serve({ ...queue, run: { ...run, candidate_count: 999 } });
    render(
      <ReleaseProvider>
        <Monday />
      </ReleaseProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Release unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Start here")).not.toBeInTheDocument();
  });
  it("rejects evidence from another release without losing the queue", async () => {
    const detail = detailFor(signals[0]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith(signals[0].signal_id)
                ? {
                    ...detail,
                    signal: {
                      ...detail.signal,
                      configuration_hash: "different-release",
                    },
                  }
                : queue,
            ),
            { status: 200 },
          ),
      ),
    );
    render(
      <ReleaseProvider>
        <SignalAttention initialId={signals[0].signal_id} />
      </ReleaseProvider>,
    );
    expect(
      await screen.findByText(
        "Evidence could not be loaded or matched to this release.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Signal calculation evidence" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Attention queue" }));
    expect(
      screen.getByRole("heading", { name: "Ranked by priority" }),
    ).toBeInTheDocument();
  });
  it("rejects a truncated unfiltered queue", async () => {
    serve({ ...queue, signals: queue.signals.slice(0, 1) });
    render(
      <ReleaseProvider>
        <Monday />
      </ReleaseProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "Release unavailable" }),
    ).toBeInTheDocument();
  });
  it("accepts the same cutoff expressed with a different timezone offset", async () => {
    const detail = detailFor(signals[0]);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.endsWith(signals[0].signal_id)
                ? {
                    ...detail,
                    signal: {
                      ...detail.signal,
                      signal_as_of: "2027-01-30T04:00:00-08:00",
                    },
                  }
                : queue,
            ),
            { status: 200 },
          ),
      ),
    );
    render(
      <ReleaseProvider>
        <SignalAttention initialId={signals[0].signal_id} />
      </ReleaseProvider>,
    );
    expect(
      await screen.findByRole("table", { name: "Signal calculation evidence" }),
    ).toBeInTheDocument();
  });
});
