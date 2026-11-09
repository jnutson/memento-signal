import { expect, test } from "@playwright/test";

test("start → existing UI and all three categories → restart, with independent sessions", async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Monday inventory review" })).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("memento-demo-publication", "stale-demo"));
  await page.getByRole("button", { name: "Start demo →" }).click();
  await expect(page.getByRole("heading", { name: "Monday report" })).toBeVisible();
  const pinned = await page.evaluate(() => sessionStorage.getItem("memento-demo-publication"));
  expect(pinned).toMatch(/^mss_[a-f0-9]{64}$/);
  for (const label of ["stockout risk", "excess inventory", "demand overperformance"]) {
    await page.getByRole("button", { name: `Review ${label} →` }).click();
    await expect(page.getByRole("heading", { name: "Attention queue" })).toBeVisible();
    await expect(page.getByRole("img", { name: label === "demand overperformance" ? "Actual demand versus forecast" : "Projected inventory and inbound" })).toBeVisible();
    await page.getByRole("button", { name: "← Back to Monday report" }).click();
  }
  const independent = await browser.newContext({ storageState: { cookies: await page.context().cookies(), origins: [] } });
  const other = await independent.newPage();
  await other.goto(testInfo.project.use.baseURL!);
  await expect(other.getByRole("button", { name: "Start demo →" })).toBeVisible();
  expect(await other.evaluate(() => sessionStorage.getItem("memento-demo-publication"))).toBeNull();
  await page.getByRole("button", { name: "Review stockout risk →" }).click();
  await expect(page.getByRole("img", { name: "Projected inventory and inbound" })).toBeVisible();
  await page.getByRole("button", { name: "← Restart demo" }).click();
  await expect(page.getByRole("button", { name: "Start demo →" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("memento-demo-publication"))).toBeNull();
  await page.getByRole("button", { name: "Start demo →" }).click();
  await expect(page.getByRole("heading", { name: "Monday report" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("memento-demo-publication"))).toBe(pinned);
  await independent.close();
  expect(errors).toEqual([]);
});
