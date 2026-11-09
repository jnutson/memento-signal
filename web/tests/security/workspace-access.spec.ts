import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, renameSync } from "node:fs";

test("protected Craftmix Weekly, Detail and original evidence with isolation and revocation", async ({
  browser,
  request,
}) => {
  const info = JSON.parse(
    readFileSync(process.env.SECURITY_FIXTURE_INFO!, "utf8"),
  );
  const api = "/craftmix/api/metrics";
  expect((await request.get(`${api}/workspace-summary`)).status()).toBe(401);
  const context = await browser.newContext({
    baseURL: process.env.SECURITY_BASE_URL,
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": info.token },
  });
  try {
    const page = await context.newPage();
    const failures: string[] = [];
    page.on("pageerror", (e) => failures.push(e.message));
    await page.goto("/craftmix");
    await expect(
      page.getByRole("heading", { name: "Sales by SKU", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/craftmix/weekly\\?release=${info.publication}`),
    );
    expect(
      (await context.request.get("/craftmix/craftmix-logo.png")).status(),
    ).toBe(200);
    await page.getByRole("link", { name: "Test game 1", exact: true }).click();
    await expect(page).toHaveURL(/\/craftmix\/detail\?/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Test game 1",
    );
    await page.getByRole("link", { name: "Inventory", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Estimated cumulative unmet retail sales",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Demand", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Total demand forecast", exact: true }),
    ).toBeVisible();
    await page.goto(`/craftmix/signal?release=${info.publication}`);
    await expect(page.getByPlaceholder("Search items")).toBeVisible();
    const response = await context.request.get(
      `${api}/metadata?release_id=${info.publication}`,
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect((await response.json()).canonical_manifest_sha256).toBeUndefined();
    expect(
      (
        await request.get(`${api}/workspace-summary`, {
          headers: { "Cf-Access-Jwt-Assertion": info.other_token },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.get(
          `${api}/workspace-summary?release_id=${info.other_publication}`,
        )
      ).status(),
    ).toBe(503);
    expect(
      (
        await context.request.get(`${api}/workspace-summary?sql=SELECT%201`)
      ).status(),
    ).toBe(422);
    expect(
      (
        await context.request.get(
          `${api}/orders?release_id=${info.publication}`,
        )
      ).status(),
    ).toBe(404);
    expect((await request.get("/api/metrics/workspace-summary")).status()).toBe(
      404,
    );
    const policy = JSON.parse(readFileSync(info.policy, "utf8"));
    policy.members = {};
    writeFileSync(`${info.policy}.next`, JSON.stringify(policy));
    renameSync(`${info.policy}.next`, info.policy);
    expect(
      (await context.request.get(`${api}/workspace-summary`)).status(),
    ).toBe(403);
    await page.goto(`/craftmix/weekly?release=${info.publication}`);
    await expect(
      page.getByRole("alert").filter({ hasText: "The selected publication" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sales by SKU", exact: true }),
    ).toHaveCount(0);
    expect(failures).toEqual([]);
  } finally {
    await context.close();
  }
});
