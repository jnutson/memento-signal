import { expect, test } from "@playwright/test";

test("draft preserves the published priority and carries real evidence into local follow-through", async ({
  page,
}, testInfo) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const response = page.waitForResponse((response) =>
    response.url().endsWith("/api/signals"),
  );
  await page.goto("/draft");
  const queue = await (await response).json();
  const first = queue.signals[0];
  const focus = page.getByRole("region", { name: "Your recommended focus" });
  await expect(focus).toContainText(first.identity.item_name);
  await expect(focus.getByRole("img")).toHaveAccessibleName(
    /impact 100, urgency 100, confidence 100/,
  );
  await page.screenshot({
    path: testInfo.outputPath("focus-home.jpg"),
    fullPage: true,
  });
  await focus.getByRole("button", { name: "Let’s take a look" }).click();
  const detailResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/signals/${first.signal_id}`),
  );
  await page.getByRole("button", { name: /03 Look under the hood/ }).click();
  const detail = await (await detailResponse).json();
  await expect(page.getByRole("slider")).toBeVisible();
  await page.getByRole("slider").press("End");
  await expect(
    page.getByRole("strong").filter({ hasText: "2027-02-26" }),
  ).toBeVisible();
  await page.getByText("The complete ledger", { exact: true }).click();
  await expect(
    page
      .getByRole("table", { name: "Draft published evidence ledger" })
      .locator("tbody tr"),
  ).toHaveCount(detail.evidence.length);
  await page.getByRole("button", { name: /02 Choose your next move/ }).click();
  await page.getByRole("button", { name: "Add to my follow-through" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Your next move is saved",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review the supply plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Awaiting next snapshot", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("focus-follow-through.jpg"),
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);
});
