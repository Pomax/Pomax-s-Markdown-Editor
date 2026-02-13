/**
 * @fileoverview Playwright configuration for integration tests.
 * Uses Firefox as the browser for testing.
 */

import { defineConfig, devices } from "@playwright/test";
import os from "os"; // Import the OS module

const platform = os.platform();

const config = {
  timeout: 30_000,
  workersCount: 8,
};

if (platform === "darwin") {
  config.timeout = 60_000;
  config.workersCount = 2;
} else if (platform === "linux") {
  config.workersCount = 4;
}

export default defineConfig({
  testDir: "./test/integration",
  testMatch: "**/*.spec.js",
  timeout: config.timeout,
  retries: 0,
  workers: config.workersCount,
  reporter: "list",
  projects: [
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
