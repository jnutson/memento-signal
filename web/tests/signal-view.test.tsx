import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SignalView from "@/components/signal/SignalView";
import { detailFor, report, run, signals } from "./signal-fixtures";

beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mockApi(options: { empty?: boolean; brokenDetail?: boolean } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input, "http://localhost");
    const id = url.pathname.split("/").at(-1);
    if (id === "report") return new Response(JSON.stringify(report));
    if (id?.startsWith("sig_")) return new Response(JSON.stringify(options.brokenDetail ? {} : detailFor(signals.find((s) => s.signal_id === id)!)));
    const filter = url.searchParams.get("signal_type");
    return new Response(JSON.stringify({ api_contract_version: "memento-signal-api-v1", run, signals: options.empty ? [] : signals.filter((s) => !filter || s.signal_type === filter) }));
  }));
}
describe("Monday workflow states", () => {
  it("opens evidence, preserves the pinned release, and returns to the report", async () => {
    mockApi(); render(<SignalView />);
    fireEvent.click(await screen.findByRole("button", { name: "Review stockout risk →" }));
    expect(await screen.findByRole("img", { name: "Projected inventory and inbound" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "← Back to Monday report" }));
    expect(screen.getByRole("heading", { name: "Monday report" })).toBeInTheDocument();
    expect(sessionStorage.getItem("memento-demo-publication")).toBe(run.signal_set_id);
  });
  it("shows empty selections explicitly", async () => {
    mockApi({ empty: true }); render(<SignalView />);
    fireEvent.click(await screen.findByRole("button", { name: "Review stockout risk →" }));
    expect(await screen.findByText("No eligible signals in this selection.")).toBeInTheDocument();
  });
  it("rejects invalid evidence instead of retaining the previous chart", async () => {
    mockApi({ brokenDetail: true }); render(<SignalView />);
    fireEvent.click(await screen.findByRole("button", { name: "Review stockout risk →" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("evidence could not be validated");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

it("rejects a different report publication when the browser is already pinned", async () => {
  sessionStorage.setItem("memento-demo-publication", `mss_${"f".repeat(64)}`);
  mockApi(); render(<SignalView />);
  expect(await screen.findByRole("alert")).toHaveTextContent("pinned publication");
  expect(sessionStorage.getItem("memento-demo-publication")).toBe(`mss_${"f".repeat(64)}`);
});
