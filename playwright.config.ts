import { defineConfig, devices } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH ??= ".dev-data/playwright-browsers";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: ".dev-data/test-results/playwright",
  reporter: [["list"], ["html", { outputFolder: ".dev-data/playwright-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry"
  },
  webServer: {
    command:
      "MULTISERIAL_E2E_SESSION_ID=session-e2e MULTISERIAL_E2E_MOCK_SERIAL=1 corepack pnpm exec node scripts/run-with-dev-env.mjs vite --host 127.0.0.1 --port 1420 --strictPort",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
