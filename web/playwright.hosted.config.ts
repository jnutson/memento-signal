import { readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Optional short-lived cookie jar produced by `vercel curl`, never a committed credential.
const cookies = process.env.DEMO_COOKIE_JAR ? readFileSync(process.env.DEMO_COOKIE_JAR, "utf8").split("\n").flatMap((line) => {
  if (!line || line.startsWith("#") && !line.startsWith("#HttpOnly_")) return [];
  const [rawDomain, , path, secure, expires, name, value] = line.split("\t");
  if (!name || !value) return [];
  const domain = rawDomain.replace(/^#HttpOnly_/, "");
  const host = new URL(process.env.DEMO_URL!).hostname;
  if (host !== domain.replace(/^\./, "") && !host.endsWith(domain.startsWith(".") ? domain : `.${domain}`)) throw new Error("Demo cookie origin mismatch");
  return [{ name, value, domain, path, secure: secure === "TRUE", httpOnly: rawDomain.startsWith("#HttpOnly_"), expires: Number(expires) || -1, sameSite: "Lax" as const }];
}) : [];

export default defineConfig({
  testDir: "./tests/hosted",
  use: {
    baseURL: process.env.DEMO_URL ?? "http://127.0.0.1:3200",
    // Authenticated production traces must not persist credentials.
    trace: process.env.DEMO_URL ? "off" : "retain-on-failure",
    storageState: { cookies, origins: [] },
  },
  webServer: process.env.DEMO_URL ? undefined : {
    command: "env MEMENTO_DEMO_BUNDLE=1 npm run dev -- --hostname 127.0.0.1 --port 3200",
    url: "http://127.0.0.1:3200", reuseExistingServer: false, timeout: 120_000,
  },
});
