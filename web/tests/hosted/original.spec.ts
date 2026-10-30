import { test, expect } from "@playwright/test";
test("original UI, weekly report, all outcomes, details and clean restart", async ({
  page,
  browser,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Start demo →" }).click();
  await expect(page.getByPlaceholder("Search items")).toBeVisible();
  await expect(page.getByText("Stores at zero", { exact: true })).toBeVisible();
  await expect(page.locator("[data-attention-dot]").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("original-overview.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Weekly report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Weekly review" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const metadata = await (
    await page.request.get("/api/metrics/metadata")
  ).json();
  const release = metadata.metric_release_id;
  const published = await (
    await page.request.get(
      `/api/metrics/findings?release_id=${release}&limit=200`,
    )
  ).json();
  expect(
    new Set(published.rows.map((r: { promise: string }) => r.promise)),
  ).toEqual(new Set(["availability", "excess", "expansion"]));
  for (const promise of ["availability", "excess", "expansion"]) {
    const finding = published.rows.find(
      (r: { promise: string }) => r.promise === promise,
    );
    await page.goto(`/signal?release=${release}&finding=${finding.finding_id}`);
    await expect(
      page.getByRole("button", { name: "Details", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await expect(page.getByRole("table").first()).toBeVisible();
  }
  await page.evaluate(
    (id) =>
      sessionStorage.setItem(
        `memento-original-ui-v1:${id}`,
        JSON.stringify({}),
      ),
    release,
  );
  await page.getByRole("button", { name: "Restart demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start demo →" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) =>
        k.startsWith("memento-original-ui-v1:"),
      ),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Start demo →" }).click();
  await expect(page.getByText("Stores at zero", { exact: true })).toBeVisible();
  const otherContext = await browser.newContext({
    storageState: { cookies: await page.context().cookies(), origins: [] },
  });
  const other = await otherContext.newPage();
  await other.goto(info.project.use.baseURL!);
  await expect(
    other.getByRole("button", { name: "Start demo →" }),
  ).toBeVisible();
  await otherContext.close();
  expect(errors).toEqual([]);
});
