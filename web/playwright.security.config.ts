import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/security",
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.SECURITY_BASE_URL,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
