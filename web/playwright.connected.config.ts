import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/connected",
  use: { baseURL: "http://127.0.0.1:3111", trace: "retain-on-failure" },
  webServer: [
    {
      command:
        "env PYTHONPATH=.. ../.venv/bin/python -m tests.e2e.serve_connected_fixture",
      url: "http://127.0.0.1:8111/test-release",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "env MEMENTO_API_ORIGIN=http://127.0.0.1:8111 npm run dev -- --port 3111",
      url: "http://127.0.0.1:3111/signal",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
