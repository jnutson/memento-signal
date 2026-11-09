import { expect, test } from "@playwright/test";
import {
  investigationDetail,
  investigationQueue,
  investigationSignals,
} from "../investigation-fixtures";

const headings = {
  risk: "Close the supply gap.",
  acceleration: "Meet the momentum.",
  deceleration: "Give the plan a second look.",
  excess: "Put stock back in balance.",
};

for (const signal of investigationSignals) {
  test(`draft ${signal.signal_direction}: context, evidence, response, and return`, async ({
    page,
  }) => {
    let detailRequests = 0;
    await page.route("**/api/signals", (route) =>
      route.fulfill({ json: investigationQueue }),
    );
    await page.route("**/api/signals/sig_*", (route) => {
      detailRequests++;
      return route.fulfill({ json: investigationDetail(signal) });
    });
    await page.goto(`/draft?signal=${signal.signal_id}`);
    await expect(
      page.getByRole("heading", {
        name: headings[signal.signal_direction as keyof typeof headings],
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    expect(detailRequests).toBe(0);

    await page.getByRole("button", { name: /How .* is calculated/ }).click();
    await expect(page.getByRole("tooltip")).toContainText(
      signal.signal_type === "inventory_imbalance"
        ? "capital exposed"
        : "units × applicable retail price",
    );
    await page.getByRole("button", { name: "Why now? +" }).click();
    await expect(page.getByRole("status")).toContainText("published priority");

    await page.getByRole("button", { name: /03 Look under the hood/ }).click();
    await expect(
      page.getByRole("slider", { name: "Slide to inspect a day" }),
    ).toBeVisible();
    expect(detailRequests).toBe(1);
    await page.getByRole("slider").press("End");
    await expect(page.getByRole("slider")).toHaveValue("27");
    await page.getByText("The complete ledger", { exact: true }).click();
    await expect(
      page.getByRole("table", { name: "Draft published evidence ledger" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: /02 Choose your next move/ })
      .click();
    await page.getByRole("radio").nth(1).check();
    await page.getByText("Add a note for next week", { exact: false }).click();
    await page
      .getByRole("textbox", { name: "What do you want to remember?" })
      .fill("Confirm the plan with the supply team.");
    await page
      .getByRole("button", { name: "Add to my follow-through", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your next move is saved",
    );
    await expect(
      page.getByText("Awaiting next snapshot", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Confirm the plan with the supply team.", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reopen the signal", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: headings[signal.signal_direction as keyof typeof headings],
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Memento Loop home", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Less noise. More knowing what matters.",
      }),
    ).toBeVisible();
  });
}

test("draft mobile keeps the primary journey reachable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/signals", (route) =>
    route.fulfill({ json: investigationQueue }),
  );
  await page.goto("/draft");
  await expect(
    page.getByRole("button", { name: "Let’s take a look", exact: true }),
  ).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
  await page
    .getByRole("button", { name: "Let’s take a look", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /02 Choose your next move/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /02 Choose your next move/ }).click();
  await expect(
    page.getByRole("heading", { name: "What’s your next move?" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "Why now? +" })).toBeVisible();
  await page
    .getByRole("link", { name: "Memento Loop home", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Less noise. More knowing what matters.",
    }),
  ).toBeVisible();
});
