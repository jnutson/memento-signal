import { defineConfig } from "@playwright/test";
process.env.CORE_API_ORIGIN = "http://127.0.0.1:18122";
export default defineConfig({
  testDir: "./tests/core-ui",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:13122", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "env PYTHONPATH=.. ../.venv/bin/python -m tests.e2e.serve_core_fixture --port 18122",
      url: "http://127.0.0.1:18122/test-release",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command:
        "env MEMENTO_API_ORIGIN=http://127.0.0.1:18122 npm run dev -- --hostname 127.0.0.1 --port 13122",
      url: "http://127.0.0.1:13122/weekly",
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
