import { expect, test } from "@playwright/test";
test("redirects the retired Attention pane to the report", async ({ page }) => {
  await page.route("**/api/signals**", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/attention");
  await expect(page).toHaveURL(/\/report$/);
});
