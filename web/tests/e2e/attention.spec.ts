import { expect, test } from "@playwright/test";
import { detailFixture, queueFixture } from "../fixtures";

test("restores Attention, its hidden planning/evidence view, and navigation", async ({ page }) => {
  await page.route("**/api/attention**", async (route) => {
    const isDetail = new URL(route.request().url()).pathname.endsWith(queueFixture.predictions[0].prediction_id);
    await route.fulfill({ json: isDetail ? detailFixture : queueFixture });
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/attention$/);
  await expect(page.getByRole("heading", { name: "Attention", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Attention", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();
  await expect(page.getByTestId("attention-scene").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: /Miro Spark One/ }).click();
  await page.getByRole("button", { name: "Open planning context" }).click();
  await expect(page.getByRole("heading", { name: "Daily inventory paths" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Depletion range" })).toBeVisible();
  await page.getByRole("button", { name: /Attention queue/ }).click();
  await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();
  await page.getByRole("link", { name: "Memento Signal", exact: true }).click();
  await expect(page).toHaveURL(/\/signal$/);
  await expect(page.getByRole("link", { name: "Memento Signal", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Attention", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Attention", exact: true })).toBeVisible();
});
