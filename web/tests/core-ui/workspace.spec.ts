import { test, expect } from "@playwright/test";

test("Weekly, catalog, scoped Sales, shared Demand/Inventory, store visibility and original evidence", async ({
  page,
  request,
}, info) => {
  const { release } = await (
    await request.get("http://127.0.0.1:8122/test-release")
  ).json();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/weekly?release=${release}`);
  await expect(
    page.getByRole("heading", { name: "Sales by SKU", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(9);
  await expect(
    page.getByText("328 units recorded", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Partial sales coverage:/).first()).toBeVisible();
  await page.screenshot({
    path: info.outputPath("weekly-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Find a product", exact: true })
    .fill("GAME-107");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await page.getByRole("link", { name: "Test game 8", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Test game 8",
  );
  await page
    .getByRole("navigation", { name: "Region", exact: true })
    .getByRole("link", { name: "East", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Weekly sales performance",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await page
    .getByRole("link", { name: "Include retailer plans", exact: true })
    .click();
  await page.getByRole("link", { name: "Next product", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Test game 1",
  );
  await expect(
    page.getByRole("link", { name: "Include retailer plans", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(new URL(page.url()).searchParams.get("region")).toBe("East");
  expect(new URL(page.url()).searchParams.get("tab")).toBe("Inventory");
  await expect(
    page.getByRole("heading", {
      name: "Estimated store inventory",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText("Store inventory visibility", { exact: true }).click();
  await expect(
    page.getByRole("table").filter({ hasText: "matching stores" }),
  ).toContainText("Store 1");
  await page
    .getByRole("searchbox", { name: "Find a store", exact: true })
    .fill("Store 2");
  await expect(
    page.getByRole("table").filter({ hasText: "matching stores" }),
  ).toContainText("1 matching stores");
  const detail = await (
    await request.get(
      `/api/metrics/product-view?release_id=${release}&product_id=prd_100&region=East`,
    )
  ).json();
  await page
    .getByText("Daily quantities and calculation", { exact: true })
    .click();
  await expect(
    page
      .getByRole("table")
      .filter({ hasText: "Published 28-day path" })
      .getByRole("row"),
  ).toHaveCount(29);
  await page.screenshot({
    path: info.outputPath("inventory-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Demand", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Total demand forecast", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Daily quantities and calculation", { exact: true })
    .click();
  const table = page
    .getByRole("table")
    .filter({ hasText: "Published 28-day path" });
  const first = detail.projections.find(
    (r: { basis: string }) => r.basis === "conditional",
  );
  await expect(
    table.getByRole("row").nth(1).getByRole("cell").nth(1),
  ).toHaveText(Math.round(first.demand_units).toLocaleString("en-US"));
  const saved = page.url();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Total demand forecast", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(saved);
  await page.getByRole("link", { name: "Weekly", exact: true }).click();
  await page
    .getByRole("button", { name: "Investigate", exact: true })
    .nth(1)
    .click();
  const modal = page.getByRole("dialog", {
    name: "Inventory investigation",
    exact: true,
  });
  await expect(modal).toBeVisible();
  await expect(
    modal.getByRole("heading", {
      name: "Estimated cumulative unmet retail sales",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  await page
    .getByRole("link", { name: "Explore evidence", exact: true })
    .click();
  await expect(page.getByPlaceholder("Search items")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("release")).toBe(release);
  expect(errors).toEqual([]);
});

test("mobile navigation, chart hover/keyboard and bounded page overflow", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/weekly");
  await expect(
    page.getByRole("heading", { name: "Sales by SKU", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("weekly-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Test game 1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Weekly units sold", exact: true }),
  ).toBeVisible();
  const chart = page.getByRole("region", {
    name: "Weekly units sold",
    exact: true,
  });
  const last = chart.getByRole("button").last();
  await last.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(chart.getByRole("button").nth(10)).toBeFocused();
  await chart.getByRole("button").nth(3).hover();
  await expect(chart.getByRole("tooltip")).toContainText("Recorded units");
  await page.screenshot({
    path: info.outputPath("sales-mobile.png"),
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.locator("select")).toHaveCount(0);
});

test("invalid publication and corrupt scoped response never substitute illustrative data", async ({
  page,
  request,
}) => {
  await page.goto("/weekly?release=met_" + "f".repeat(64));
  await expect(
    page.getByRole("heading", { name: "Report unavailable", exact: true }),
  ).toBeVisible();
  const { release } = await (
    await request.get("http://127.0.0.1:8122/test-release")
  ).json();
  const original = await (
    await request.get(
      `/api/metrics/product-view?release_id=${release}&product_id=prd_100`,
    )
  ).json();
  await page.route("**/api/metrics/product-view?**", (route) =>
    route.fulfill({ json: { ...original, product_id: "wrong-product" } }),
  );
  await page.goto(`/detail?release=${release}&product=prd_100&tab=Inventory`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "scope mismatch",
  );
  await expect(
    page.getByRole("heading", {
      name: "Estimated store inventory",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute("**/api/metrics/product-view?**");
  await page
    .getByRole("button", { name: "Retry evidence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Estimated store inventory",
      exact: true,
    }),
  ).toBeVisible();
});
