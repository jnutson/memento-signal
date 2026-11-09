import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

test("customer path enforces identity, publication isolation, and membership revocation", async ({ browser, request }) => {
  const info = JSON.parse(readFileSync(process.env.SECURITY_FIXTURE_INFO!, "utf8"));
  const path = "/craftmix/api/signals";
  expect((await request.get(`${path}/report`)).status()).toBe(401);
  const context = await browser.newContext({ baseURL: process.env.SECURITY_BASE_URL, extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": info.token } });
  try {
    const page = await context.newPage();
    await page.goto("/craftmix");
    await expect(page.getByRole("heading", { name: "Monday report", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review stockout risk →" }).click();
    await expect(page.getByRole("img", { name: "Projected inventory and inbound" })).toBeVisible();
    const result = await context.request.get(`${path}/report`);
    expect(result.status()).toBe(200);
    expect(result.headers()["cache-control"]).toContain("no-store");
    expect((await result.json()).run.signal_set_id).toBe(info.publication);
    expect((await request.get(path, { headers: { "Cf-Access-Jwt-Assertion": info.other_token } })).status()).toBe(403);
    expect((await context.request.get(`${path}?signal_set_id=mss_${"f".repeat(64)}`)).status()).toBe(503);
    expect((await context.request.get(`${path}?signal_type=${encodeURIComponent("' OR 1=1 --")}`)).status()).toBe(422);
    expect((await request.get("/api/signals/report")).status()).toBe(404);
    const policy = JSON.parse(readFileSync(info.policy, "utf8"));
    policy.members = {};
    writeFileSync(info.policy, JSON.stringify(policy));
    expect((await context.request.get(`${path}/report`)).status()).toBe(403);
    await page.reload();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("img", { name: "Projected inventory and inbound" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
