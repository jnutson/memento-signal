import { expect, test } from "@playwright/test";

test("supplied UI: overview, details, review, one-pager and exports use the real API", async ({
  page,
  request,
}, testInfo) => {
  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await favicon.text()).toContain("<svg");
  const { release } = await (
    await request.get("http://127.0.0.1:8111/test-release")
  ).json();
  const published = await (
    await request.get(
      "http://127.0.0.1:8111/v1/metrics/findings?release_id=" +
        release +
        "&limit=200",
    )
  ).json();
  const finding = published.rows.find(
    (row: { finding_code: string }) => row.finding_code === "excess_inventory",
  );
  expect(
    new Set(published.rows.map((row: { promise: string }) => row.promise)),
  ).toEqual(new Set(["availability", "excess", "expansion"]));
  const errors: string[] = [],
    releases: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/api/metrics/"))
      releases.push(
        new URL(request.url()).searchParams.get("release_id") ?? "missing",
      );
  });
  await page.goto("/signal?release=" + release);
  await expect(page.getByPlaceholder("Search items")).toBeVisible();
  await expect(
    page.getByText(/items?\. Estimated exposure by type/),
  ).toBeVisible();
  await expect(
    page.getByText("Supply gap", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Stores at zero", { exact: true })).toBeVisible();
  await expect(page.locator("[data-attention-dot]").first()).toHaveAttribute(
    "aria-label",
    /\$|—/,
  );
  await expect(page.getByText("$0", { exact: true }).first()).toBeVisible();
  await expect(
    page
      .getByText("Planned stores report no inventory", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(page.getByText(/^\d+ findings$/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Explore", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Case for expansion", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Weekly report", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("provided-ui-overview.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Case for expansion", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Case for expansion" }),
  ).toContainText("preceding 28-day internal baseline");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Weekly report", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Weekly review" }),
  ).toContainText("no combined impact");
  await page.keyboard.press("Escape");
  await page.goto(
    "/signal?release=" + release + "&finding=" + finding.finding_id,
  );
  await expect(
    page.getByText("Inventory exceeds the declared cover target", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Details", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Cut inbound/ })).toBeVisible();
  await expect(page.getByText("Decide", { exact: true })).toBeVisible();
  await expect(page.getByText("Cover target", { exact: true })).toBeVisible();
  await expect(page.getByText("40 days", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Uncommitted inbound", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Watch check/ }).click();
  await expect(
    page.getByRole("button", { name: "✓ Commit & share", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Watch check/ }).click();
  await expect(
    page.getByRole("button", { name: "✓", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Cut inbound/ }).click();
  await page
    .getByRole("button", { name: "✓ Commit & share", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "One-pager" })).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "One-pager" }).locator("textarea"),
  ).toHaveValue(/Proposed action: Cut inbound/);
  const png = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  expect((await png).suggestedFilename()).toMatch(/\.png$/);
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/No action counterfactual is modeled/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Store-level excess inventory" }),
  ).toContainText("Capital at cost");
  const csv = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export to Excel", exact: true })
    .click();
  expect((await csv).suggestedFilename()).toMatch(/\.csv$/);
  await page.screenshot({
    path: testInfo.outputPath("provided-ui-details.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText(/Cut inbound · proposed · check-in/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "↗ Share", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("button", { name: "proposed", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "sent", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "sent", exact: true }).click();
  await page.getByRole("button", { name: "approved", exact: true }).click();
  await page.getByRole("button", { name: "done", exact: true }).click();
  await page.getByRole("button", { name: "declined", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "proposed", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(page.getByText("WoW", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Map" })).toBeVisible();
  await page.keyboard.press("Escape");
  const stockout = published.rows.find(
    (row: { finding_code: string }) =>
      row.finding_code === "promised_distribution_gap",
  );
  await page.goto(
    "/signal?release=" + release + "&finding=" + stockout.finding_id,
  );
  await expect(
    page.getByText("Missed sales to date (est.)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Forward exposure (est.)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Forward exposure (est.)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Expedite restock/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(releases.length).toBeGreaterThan(8);
  expect(releases.every((value) => value === release)).toBe(true);
});

test("failed release keeps the supplied shell and never shows preview facts", async ({
  page,
}) => {
  await page.goto("/signal");
  await expect(
    page.getByText("Evidence unavailable", { exact: true }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("Search items")).toBeVisible();
  await expect(page.getByText("Organic Whole Milk 64oz")).toHaveCount(0);
});
