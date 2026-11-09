import { expect, test } from "@playwright/test";

test("opens the published briefing and release report with real API data", async ({
  page,
}) => {
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/signals"),
  );
  // Root belongs to the current Weekly UI; retain this legacy briefing journey.
  await page.goto("/monday");
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const queue = await response.json();
  expect(queue.signals).toHaveLength(6);
  expect(queue.run.ranker_version).toBe("memento-signal-urgency-ranker-v2");
  expect(queue.signals[0].urgency_score).toBe("1.000000");
  await expect(page).toHaveURL(/\/monday$/);
  await expect(page.getByText("Start here", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Reports", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Signal coverage", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(queue.run.configuration_hash)).toBeVisible();
});

test("drives a published signal release through the Memento Signal workflow", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  const queueResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/signals"),
  );
  await page.goto("/attention");
  const queueResponse = await queueResponsePromise;
  expect(queueResponse.ok()).toBe(true);

  const queue = await queueResponse.json();
  expect(queue.run.source_release_set_id).toBe(
    "437b6da3ad31abe0-20270130T120000Z",
  );
  expect(queue.run.candidate_counts_by_type.availability).toBe(1);
  expect(queue.signals).toHaveLength(6);
  const availability = queue.signals.find(
    (row: { signal_type: string }) => row.signal_type === "availability",
  );

  await expect(
    page.getByRole("heading", { name: "Attention", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Demo Item").first()).toBeVisible();
  await expect(
    page
      .getByText("Eligible signals")
      .locator("..")
      .getByText("6", { exact: true }),
  ).toBeVisible();

  const detailResponsePromise = page.waitForResponse((response) =>
    /\/api\/signals\/sig_[0-9a-f]{64}$/.test(response.url()),
  );
  await page
    .getByRole("button", {
      name: new RegExp(
        `^#${availability.overall_rank_position} · Availability Risk`,
      ),
    })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Selected signal evidence" })
      .getByText(
        "Demo Store · observed through 2027-01-29 · cutoff 2027-01-30 12:00 UTC",
        { exact: true },
      ),
  ).toBeVisible();
  const detailResponse = await detailResponsePromise;
  expect(detailResponse.ok()).toBe(true);

  const detail = await detailResponse.json();
  expect(detail.evidence).toHaveLength(84);
  expect(detail.signal.signal_type).toBe("availability");
  await page
    .getByRole("combobox", { name: "Inspect Inventory runway date" })
    .selectOption({ index: 2 });
  await page.getByRole("button", { name: "Show numbers →" }).click();
  await page
    .getByText("Published calculation evidence and source lineage", {
      exact: true,
    })
    .click();
  await expect(page.getByText(/84 published rows/)).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "Signal calculation evidence" })
      .locator("tbody tr"),
  ).toHaveCount(84);
  await expect(
    page.getByText(
      "Confidence is an evidence-quality score, not a probability.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Attention queue" }).click();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Attention feed" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Attention feed" })
      .getByText(/retail sales at risk/),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Attention feed" })
      .getByText(/Urgency 100/)
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: new RegExp(
        `^#${availability.overall_rank_position} · Availability Risk`,
      ),
    })
    .click();
  await expect(
    page
      .getByRole("table", { name: "Signal calculation evidence" })
      .locator("tbody tr"),
  ).toHaveCount(84);
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

for (const direction of ["risk", "acceleration", "deceleration", "excess"]) {
  test(`real Parquet ${direction} investigation reaches weekly and daily evidence`, async ({
    page,
  }) => {
    const queue = await (await page.request.get("/api/signals")).json();
    const signal = queue.signals.find(
      (row: { signal_direction: string }) => row.signal_direction === direction,
    );
    expect(signal).toBeTruthy();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let investigations = 0;
    page.on("response", (response) => {
      if (response.url().includes("/investigation?")) investigations++;
    });
    await page.goto(`/attention?signal=${signal.signal_id}`);
    const chart =
      direction === "risk"
        ? "Inventory runway"
        : direction === "excess"
          ? "Inventory versus target"
          : "Demand divergence";
    await page
      .getByRole("combobox", { name: `Inspect ${chart} date` })
      .selectOption({ index: 3 });
    await expect(
      page.getByRole("button", { name: "2. Explanation" }),
    ).toHaveAttribute("aria-current", "step");
    if (direction === "risk") {
      await page
        .getByRole("button", { name: "Supply timing", exact: true })
        .click();
      await page
        .getByRole("button", { name: "conservative", exact: true })
        .click();
      await expect(page.getByText(/with base demand held fixed/)).toBeVisible();
      await page
        .getByRole("button", { name: "Demand sensitivity", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Show numbers →" }).click();
    await page
      .getByRole("button", { name: /Expand week.*actual/ })
      .first()
      .click();
    await expect(
      page
        .getByRole("table", { name: "Daily investigation ledger" })
        .locator("tbody tr"),
    ).toHaveCount(7);
    await page
      .getByRole("button", { name: /Expand week.*projected/ })
      .first()
      .click();
    await expect(
      page.getByRole("table", { name: "Daily investigation ledger" }),
    ).toBeVisible();
    await page
      .getByRole("table", { name: "Daily investigation ledger" })
      .getByRole("button")
      .last()
      .click();
    await expect(
      page
        .getByRole("table", { name: "Daily investigation ledger" })
        .locator('tr[data-selected="true"]'),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "← Back one layer" }).click();
    await expect(
      page.getByRole("button", { name: "2. Explanation" }),
    ).toHaveAttribute("aria-current", "step");
    expect(investigations).toBe(1);
    expect(errors).toEqual([]);
  });
}
