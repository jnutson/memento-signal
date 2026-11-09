import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import InsightDetails from "@/components/signal/reimagined/InsightDetails";
import { detailsFixture } from "./details-fixture";
import { evidenceCsv } from "@/lib/connected/export";
afterEach(cleanup);

describe("supplied-style Details MVP", () => {
  it.each(["z", "a", "i"] as const)(
    "rounds %s display only, preserving exact source values and exports",
    (lane) => {
      const input = detailsFixture(lane, [8068.98]);
      const before = JSON.stringify(input);
      const exportCsv = () =>
        evidenceCsv(
          input.attention.metric_release_id,
          input.finding,
          input.evidence,
          {
            model_version: input.attention.model_version,
            assumptions: input.attention.assumptions,
            members: input.attention.rows[0].members!,
          },
        );
      const csv = exportCsv();
      render(<InsightDetails input={input} />);
      expect(screen.getByTestId("detail-dollar-estimate")).toHaveTextContent(
        "$8.1k",
      );
      expect(screen.getByTestId("detail-ledger-total")).toHaveTextContent(
        "$8.1k",
      );
      expect(screen.getByTestId("detail-ledger-total")).toHaveAttribute(
        "data-total-cents",
        "806898",
      );
      if (lane !== "z") expect(screen.getByText("807 units")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: /Store 0/ }));
      expect(
        screen.getByText("Source estimate · rounded").parentElement,
      ).toHaveTextContent("$8.1k");
      const detailText = screen.getByTestId("insight-details").textContent!;
      expect(detailText).not.toContain("8,068.98");
      expect(detailText).not.toContain("806.898");
      expect(detailText).toContain("rounded rows may not add");
      expect(JSON.stringify(input)).toBe(before);
      expect(exportCsv()).toBe(csv);
      expect(csv).toContain("8068.98");
      if (lane === "i") {
        expect(input.evidence[0].units).not.toBe(
          Math.round(input.evidence[0].units!),
        );
        expect(csv).toContain(`"${input.evidence[0].units}"`);
      }
    },
  );
  it.each(["z", "a", "i"] as const)(
    "renders a reconciled %s view with a labeled chart and expandable store",
    (lane) => {
      render(<InsightDetails input={detailsFixture(lane, [20, 30])} />);
      expect(screen.getByTestId("detail-dollar-estimate")).toHaveTextContent(
        "$50",
      );
      expect(screen.getByTestId("detail-ledger-total")).toHaveAttribute(
        "data-total-cents",
        "5000",
      );
      expect(screen.getByRole("img")).toHaveAccessibleName(/units|stores/);
      fireEvent.click(screen.getByRole("button", { name: /Store 1/ }));
      expect(screen.getByRole("button", { name: /Store 1/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(screen.getByText("Source identity")).toBeVisible();
      expect(screen.queryByText("Decide")).not.toBeInTheDocument();
    },
  );
  it("filters and paginates only the table, never the attention total", () => {
    render(
      <InsightDetails
        input={detailsFixture(
          "z",
          Array.from({ length: 23 }, (_, i) => i + 1),
        )}
      />,
    );
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("button")).toHaveLength(10);
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 3")).toBeVisible();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search affected stores" }),
      { target: { value: "not found" } },
    );
    expect(
      screen.getByText("No affected stores match these filters."),
    ).toBeVisible();
    expect(screen.getByTestId("detail-ledger-total")).toHaveAttribute(
      "data-total-cents",
      "27600",
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search affected stores" }),
      { target: { value: "" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Filter affected stores by region",
      }),
      { target: { value: "East" } },
    );
    expect(screen.getByTestId("detail-dollar-estimate")).toHaveTextContent(
      "$276",
    );
    expect(screen.getByText(/11 matching stores/)).toBeVisible();
  });
  it("shows a local reconciliation error, not a fabricated detail total", () => {
    const input = detailsFixture();
    input.queue = { ...input.queue, amount: 1000 };
    render(<InsightDetails input={input} />);
    expect(screen.getByRole("alert")).toHaveTextContent("does not reconcile");
    expect(screen.queryByTestId("detail-ledger-total")).not.toBeInTheDocument();
  });
  it("supports keyboard chart inspection and leaves missing historical dates as gaps", () => {
    render(<InsightDetails input={detailsFixture("a", [20, 30])} />);
    const chart = screen.getByRole("img");
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByText(/2026-09-27 · Firm:/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Past 8 wks" }));
    fireEvent.focus(screen.getByRole("img"));
    expect(screen.getByText(/Observed: Unavailable/)).toBeVisible();
  });
});
