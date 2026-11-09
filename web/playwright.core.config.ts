import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/core-ui",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3122", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "env PYTHONPATH=.. ../.venv/bin/python -m tests.e2e.serve_core_fixture",
      url: "http://127.0.0.1:8122/test-release",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command:
        "env MEMENTO_API_ORIGIN=http://127.0.0.1:8122 npm run dev -- --hostname 127.0.0.1 --port 3122",
      url: "http://127.0.0.1:3122/weekly",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
