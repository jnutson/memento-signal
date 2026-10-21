import { expect, test } from "@playwright/test";
import { run, signals } from "../signal-fixtures";

test("preserves existing pages and exposes the Metrics navigation entry", async ({
  page,
}) => {
  await page.route("**/api/signals", (route) =>
    route.fulfill({
      json: { api_contract_version: "memento-signal-api-v1", run, signals },
    }),
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/monday$/);
  const navigation = page.getByRole("navigation", {
    name: "Product navigation",
  });
  await expect(navigation.getByRole("link")).toHaveCount(5);
  await expect(
    navigation.getByRole("link", { name: "Connected demo", exact: true }),
  ).toHaveAttribute("href", "/signal");
  await expect(
    navigation.getByRole("link", { name: "Metrics", exact: true }),
  ).toHaveAttribute("href", "/metrics");
  expect(
    await navigation.evaluate(
      (element) => element.getBoundingClientRect().width,
    ),
  ).toBe(150);
  expect(
    await page
      .locator("main")
      .evaluate((element) => getComputedStyle(element).paddingLeft),
  ).toBe("18px");
  expect(
    await page
      .getByRole("heading", { level: 1 })
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe("25px");
  await expect(
    navigation.getByRole("link", { name: "Monday", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByText("About this briefing", { exact: true }).click();
  await expect(
    page.getByText("This is a signal briefing, not a weekly POS report.", {
      exact: false,
    }),
  ).toBeVisible();
  await navigation
    .getByRole("link", { name: "Attention", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Attention", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("attention-scene").locator("canvas"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Attention feed" }),
  ).toBeVisible();
  await expect(page.getByText(/\$120 retail sales at risk/)).toBeVisible();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  await expect(
    page.getByTestId("attention-scene").locator("canvas"),
  ).toBeVisible();
  await navigation.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Signal coverage", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(run.configuration_hash)).toBeVisible();
  await navigation.getByRole("link", { name: "Monday", exact: true }).click();
  await expect(page).toHaveURL(/\/monday$/);
  await page.goto("/attention");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    navigation.getByRole("link", { name: "Reports", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("shows a release failure without prototype metrics and can retry", async ({
  page,
}) => {
  let failing = true;
  await page.route("**/api/signals", (route) =>
    failing
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({
          json: { api_contract_version: "memento-signal-api-v1", run, signals },
        }),
  );
  await page.goto("/monday");
  await expect(
    page.getByRole("heading", { name: "Release unavailable" }),
  ).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Start here", { exact: true })).toBeVisible();
});
