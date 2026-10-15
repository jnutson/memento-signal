import { expect, test } from "@playwright/test";

import { types, signals, run, detailFor } from "../signal-fixtures";

test("filters and inspects all three signal types without renumbering", async ({ page }) => {
  await page.route("**/api/signals**", async (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").at(-1);
    if (id?.startsWith("sig_")) {
      const signal = signals.find((row) => row.signal_id === id)!;
      await route.fulfill({ json: detailFor(signal) });
      return;
    }
    const filter = url.searchParams.get("signal_type");
    await route.fulfill({ json: { api_contract_version: "memento-signal-api-v1", run, signals: filter ? signals.filter((row) => row.signal_type === filter) : signals } });
  });
  await page.goto("/attention");
  await expect(page.getByRole("heading", { name: "Attention", exact: true })).toBeVisible();
  await page.getByText("Filters and release context", { exact: true }).click();
  for (let index = 0; index < types.length; index += 1) {
    const label = ["Availability Risk", "Demand Momentum Gap", "Inventory Imbalance Exposure"][index];
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`#${index + 1} · ${label}`) })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`#${index + 1} · ${label}`) }).click();
    await expect(page.getByText("Confidence is an evidence-quality score, not a probability.")).toBeVisible();
    await expect(page.getByRole("table", { name: "Signal calculation evidence" }).locator("tbody tr")).toHaveCount(types[index] === "demand_momentum" ? 36 : 84);
    await page.getByRole("button", { name: "← Attention queue", exact: true }).click();
  }
});
