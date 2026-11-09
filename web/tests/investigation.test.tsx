import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import SignalAttention from "@/components/product/SignalAttention";
import { ReleaseProvider } from "@/components/product/ReleaseProvider";
import { investigationSchema } from "@/lib/investigation/schema";
import {
  investigationDetail,
  investigationFor,
  investigationQueue,
  investigationSignals,
} from "./investigation-fixtures";

vi.mock("@/components/product/SignalScene", () => ({ default: () => <div /> }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
for (const signal of investigationSignals) {
  it(`progressively explains ${signal.signal_direction} and links ledger selection without refetch`, async () => {
    let requests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/investigation?")) {
          requests++;
          return new Response(JSON.stringify(investigationFor(signal)));
        }
        return new Response(
          JSON.stringify(
            url.endsWith(signal.signal_id)
              ? investigationDetail(signal)
              : investigationQueue,
          ),
        );
      }),
    );
    render(
      <ReleaseProvider>
        <SignalAttention initialId={signal.signal_id} />
      </ReleaseProvider>,
    );
    const chart =
      signal.signal_type === "demand_momentum"
        ? "Demand divergence"
        : signal.signal_type === "availability"
          ? "Inventory runway"
          : "Inventory versus target";
    const picker = await screen.findByRole("combobox", {
      name: `Inspect ${chart} date`,
    });
    const dates = Array.from(
      screen
        .getByRole("img", { name: new RegExp(`^${chart}\\.`) })
        .querySelectorAll("text"),
    )
      .map((node) => node.textContent ?? "")
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    expect(dates).toEqual([...dates].sort());
    expect(
      screen.queryByRole("table", { name: "Weekly investigation ledger" }),
    ).not.toBeInTheDocument();
    fireEvent.change(picker, {
      target: { value: (picker as HTMLSelectElement).options[2].value },
    });
    expect(
      screen.getByRole("button", { name: "2. Explanation" }),
    ).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Show numbers →" }));
    const ledger = screen.getByRole("table", {
      name: "Weekly investigation ledger",
    });
    fireEvent.click(
      within(ledger).getAllByRole("button", { name: /Expand week/ })[0],
    );
    const daily = screen.getByRole("table", {
      name: "Daily investigation ledger",
    });
    fireEvent.click(within(daily).getAllByRole("button")[1]);
    expect(daily.querySelectorAll('tr[data-selected="true"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "← Back one layer" }));
    expect(
      screen.getByRole("button", { name: "2. Explanation" }),
    ).toHaveAttribute("aria-current", "step");
    expect(requests).toBe(1);
  });
}
it("rejects duplicated days, wrong balances and malformed receipt ranges", () => {
  const value = investigationFor(investigationSignals[0]);
  expect(
    investigationSchema.safeParse({
      ...value,
      days: [...value.days, value.days[0]],
    }).success,
  ).toBe(false);
  expect(
    investigationSchema.safeParse({
      ...value,
      days: value.days.map((d) =>
        d.phase === "projected" ? { ...d, stock: 999 } : d,
      ),
    }).success,
  ).toBe(false);
  expect(
    investigationSchema.safeParse({
      ...value,
      receipts: [{ ...value.receipts[0], early: "2028-01-01" }],
    }).success,
  ).toBe(false);
  expect(
    investigationSchema.safeParse({
      ...value,
      weeks: value.weeks.map((w, i) => (i === 0 ? { ...w, stock: 999 } : w)),
    }).success,
  ).toBe(false);
});
