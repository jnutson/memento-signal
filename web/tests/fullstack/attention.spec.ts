import { expect, test } from "@playwright/test";

test("restores the real Attention queue and planning evidence", async ({ page }) => {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/attention"));
  await page.goto("/attention");
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const queue = await response.json();
  expect(queue.predictions).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "Attention", exact: true })).toBeVisible();
  await expect(page.getByTestId("attention-scene").locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: /Demo Item/ }).click();
  await page.getByRole("button", { name: "Open planning context" }).click();
  await expect(page.getByRole("heading", { name: "Daily inventory paths" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Daily calculation evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Published evidence quality" })).toBeVisible();
  await page.getByRole("button", { name: /Attention queue/ }).click();
  await expect(page.getByRole("button", { name: "Reset view" })).toBeVisible();
});

test("drives a published signal release through the Memento Signal workflow", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const queueResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/signals"));
  await page.goto("/signal");
  const queueResponse = await queueResponsePromise;
  expect(queueResponse.ok()).toBe(true);

  const queue = await queueResponse.json();
  expect(queue.run.source_release_set_id).toBe("437b6da3ad31abe0-20270130T120000Z");
  expect(queue.run.candidate_counts_by_type.availability).toBe(1);
  expect(queue.signals).toHaveLength(1);

  await expect(page.getByRole("heading", { name: "Memento Signal" })).toBeVisible();
  await expect(page.getByText("Demo Item").first()).toBeVisible();
  await expect(page.getByText("Demo Store").first()).toBeVisible();
  await expect(page.getByText("Eligible signals").locator("..").getByText("1", { exact: true })).toBeVisible();

  const detailResponsePromise = page.waitForResponse((response) =>
    /\/api\/signals\/sig_[0-9a-f]{64}$/.test(response.url()),
  );
  await page.getByRole("button", { name: /^#1 · Availability Risk/i }).click();
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.ok()).toBe(true);

  const detail = await detailResponse.json();
  expect(detail.evidence).toHaveLength(84);
  expect(detail.signal.signal_type).toBe("availability");
  await expect(page.getByText(/84 published rows/)).toBeVisible();
  await expect(page.getByText("Confidence is an evidence-quality score, not a probability.")).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
