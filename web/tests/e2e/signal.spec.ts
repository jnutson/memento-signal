import { expect, test } from "@playwright/test";
import { detailFor, report, run, signals } from "../signal-fixtures";

test("report drills into each category and preserves its publication on return", async ({ page }) => {
  await page.route("**/api/signals**", async (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").at(-1);
    if (id === "report") return route.fulfill({ json: report });
    expect(url.searchParams.get("signal_set_id")).toBe(run.signal_set_id);
    if (id?.startsWith("sig_")) return route.fulfill({ json: detailFor(signals.find((s) => s.signal_id === id)!) });
    const filter = url.searchParams.get("signal_type");
    if (filter === "demand_momentum") expect(url.searchParams.get("signal_direction")).toBe("acceleration");
    return route.fulfill({ json: { api_contract_version: "memento-signal-api-v1", run, signals: filter ? signals.filter((s) => s.signal_type === filter) : signals } });
  });
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Monday report" })).toBeVisible();
  for (const label of ["stockout risk", "excess inventory", "demand overperformance"]) {
    await page.getByRole("button", { name: `Review ${label} →` }).click();
    await expect(page.getByRole("heading", { name: "Attention queue" })).toBeVisible();
    await expect(page.getByRole("img", { name: label === "demand overperformance" ? "Actual demand versus forecast" : "Projected inventory and inbound" })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`^${label}`, "i") }).click(); // repeating the active filter must reload, not hang
    await expect(page.getByRole("img", { name: label === "demand overperformance" ? "Actual demand versus forecast" : "Projected inventory and inbound" })).toBeVisible();
    await page.getByRole("button", { name: "← Back to Monday report" }).click();
  }
  expect(await page.evaluate(() => sessionStorage.getItem("memento-demo-publication"))).toBe(run.signal_set_id);
});

test("shows publication errors without falling back silently", async ({ page }) => {
  await page.route("**/api/signals**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/report");
  await expect(page.getByRole("alert").filter({ hasText: "Demo publication unavailable" })).toContainText("Demo publication unavailable");
  await expect(page.getByRole("button", { name: "Open latest publication" })).toBeVisible();
});
