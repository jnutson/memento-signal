import { expect, test } from "@playwright/test";

test("Monday report → each category → published evidence → report", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const reportResponse = page.waitForResponse((r) => r.url().includes("/api/signals/report"));
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo →" }).click();
  const response = await reportResponse;
  expect(response.ok()).toBe(true);
  const report = await response.json();
  expect(report.scope.classification).toBe("synthetic");
  expect(report.scope.item_count).toBe(4);
  expect(report.categories.map((c: { candidate_count: number }) => c.candidate_count)).toEqual([1, 3, 1]);
  await expect(page.getByRole("heading", { name: "Monday report" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("monday-report.png"), fullPage: true });
  for (const label of ["stockout risk", "excess inventory", "demand overperformance"]) {
    const queueResponse = page.waitForResponse((r) => /\/api\/signals\?/.test(r.url()));
    const detailResponse = page.waitForResponse((r) => /\/api\/signals\/sig_[0-9a-f]{64}\?/.test(r.url()));
    await page.getByRole("button", { name: `Review ${label} →` }).click();
    const queue = await (await queueResponse).json();
    const detail = await (await detailResponse).json();
    expect(queue.run.signal_set_id).toBe(report.run.signal_set_id);
    expect(detail.signal.signal_id).toBe(queue.signals[0].signal_id);
    expect(detail.signal.overall_rank_position).toBe(queue.signals[0].overall_rank_position);
    if (label === "demand overperformance") expect(detail.signal.signal_direction).toBe("acceleration");
    await expect(page.getByRole("img", { name: label === "demand overperformance" ? "Actual demand versus forecast" : "Projected inventory and inbound" })).toBeVisible();
    await page.getByText("Confidence, sensitivity, and calculation evidence", { exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(detail.evidence.length + 1);
    await page.screenshot({ path: testInfo.outputPath(`${label.replaceAll(" ", "-")}.png`), fullPage: true });
    await page.getByRole("button", { name: "← Back to Monday report" }).click();
    await expect(page.getByRole("heading", { name: "Monday report" })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
