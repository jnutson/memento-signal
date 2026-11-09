import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

for (const path of [
  {
    code: "promised_distribution_gap",
    lane: "z",
    release: "release",
    table: "Store-level missed sales & exposure",
  },
  {
    code: "future_supply_gap",
    lane: "a",
    release: "gap_release",
    table: "Store-level uncovered demand",
  },
  {
    code: "excess_inventory",
    lane: "i",
    release: "release",
    table: "Store-level excess inventory",
  },
]) {
  test(`${path.code}: queue dollars, detail ledger, chart, store expansion and complete export agree`, async ({
    page,
    request,
  }, testInfo) => {
    const ids = await (
      await request.get("http://127.0.0.1:8111/test-release")
    ).json();
    const release = ids[path.release];
    const findings = await (
      await request.get(
        `http://127.0.0.1:8111/v1/metrics/findings?release_id=${release}&limit=200`,
      )
    ).json();
    const finding = findings.rows.find(
      (row: { finding_code: string }) => row.finding_code === path.code,
    );
    expect(finding).toBeTruthy();
    const all = await (
      await request.get(
        `http://127.0.0.1:8111/v1/metrics/attention-values?release_id=${release}`,
      )
    ).json();
    const queue = all.rows.find(
      (row: { finding_id: string }) => row.finding_id === finding.finding_id,
    );
    const value = queue.amount ?? queue.known_amount;
    const dollars =
      value === null
        ? "—"
        : (value >= 1000
            ? `$${(value / 1000).toFixed(1)}k`
            : `$${value.toFixed(0)}`) + (queue.amount === null ? "+" : "");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `/signal?release=${release}&finding=${finding.finding_id}&layer=story`,
    );
    const why = page.getByText("Why", { exact: true }).locator("..");
    await expect(why.locator(":scope > div")).toHaveCount(6);
    await expect(why).not.toContainText("Prerequisites");
    await expect(why).not.toContainText("Carrying cost");
    await expect(
      page.getByText("no assumed buffer", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("action effect not modeled", { exact: true }),
    ).toHaveCount(0);
    if (path.lane === "z") {
      const salesCard = page
        .getByText("observed sales", { exact: true })
        .locator("../..");
      await expect(salesCard).toContainText("—");
      await expect(salesCard).not.toContainText("Unavailable");
    }
    if (path.lane === "i") {
      await expect(
        page.getByText(/excess units across 1 store at day 28/),
      ).toBeVisible();
      const need = await page
        .getByText("Target stock", { exact: true })
        .boundingBox();
      const excess = await page
        .getByText("Above target", { exact: true })
        .boundingBox();
      expect(need!.x + need!.width).toBeLessThanOrEqual(excess!.x);
    }
    if (path.lane === "a") {
      const stockLabel = page
        .getByText("Before shortfall", {
          exact: true,
        })
        .first();
      const gapLabel = page.getByText("Unmet demand", { exact: true }).first();
      const stockBox = await stockLabel.boundingBox();
      const gapBox = await gapLabel.boundingBox();
      expect(stockBox).not.toBeNull();
      expect(gapBox).not.toBeNull();
      expect(stockBox!.x + stockBox!.width).toBeLessThanOrEqual(gapBox!.x);
      const diagram = await stockLabel.locator("..").boundingBox();
      const lastTick = await page
        .getByText("28d", { exact: true })
        .first()
        .boundingBox();
      expect(lastTick!.x + lastTick!.width).toBeLessThanOrEqual(
        diagram!.x + diagram!.width + 1,
      );
      await page.screenshot({
        path: testInfo.outputPath("supply-timing-labels.png"),
        fullPage: true,
      });
    }
    await page.goto(
      `/signal?release=${release}&finding=${finding.finding_id}&layer=details`,
    );
    await expect(page.getByTestId("insight-details")).toHaveAttribute(
      "data-path",
      path.lane,
    );
    await expect(page.getByTestId("detail-dollar-estimate")).toHaveText(
      dollars,
    );
    const ledger = page.getByTestId("detail-ledger-total");
    await expect(ledger).toHaveAttribute(
      "data-total-cents",
      value === null ? "unknown" : String(Math.round(value * 100)),
    );
    const table = page.getByRole("table", { name: path.table });
    const rowCents = await table
      .locator("tbody [data-amount-cents]")
      .evaluateAll((cells) =>
        cells.map((cell) => cell.getAttribute("data-amount-cents")),
      );
    expect(rowCents.length).toBe(queue.member_count);
    expect(
      rowCents.reduce(
        (sum, value) => sum + (value === "unknown" ? 0 : Number(value)),
        0,
      ),
    ).toBe(Math.round((value ?? 0) * 100));
    await expect(
      page.getByTestId("insight-details").getByRole("img"),
    ).toHaveAccessibleName(/units|stores/);
    const search = page.getByRole("textbox", {
      name: "Search affected stores",
    });
    await search.fill("no-such-store");
    await expect(table).toContainText(
      "No affected stores match these filters.",
    );
    await expect(page.getByTestId("detail-dollar-estimate")).toHaveText(
      dollars,
    );
    await search.fill("");
    await table.getByRole("button").first().click();
    await expect(table.getByRole("button").first()).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(table).toContainText("Source identity");
    if (path.lane === "z")
      await expect(table).toContainText("Missed sales to date (estimated)");
    if (path.lane === "a")
      await expect(table).toContainText("Retail exposure calculation");
    if (path.lane === "i")
      await expect(table).toContainText("Capital calculation");
    await page.getByText("Calculation & assumptions", { exact: true }).click();
    await expect(
      page.getByText(/Valuation: attention-exposure-v1/),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export to Excel", exact: true })
      .click();
    const csv = await download;
    const contents = await readFile((await csv.path())!, "utf8");
    expect(contents).toContain("valuation_model");
    expect(contents).toContain("attention-exposure-v1");
    expect(contents.split("\r\n")).toHaveLength(queue.member_count + 1);
    await expect(page.getByText("Decide", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Watch check/ }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${path.lane}-details.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
