/**
 * @fileoverview Playwright configuration for integration tests.
 * Uses Firefox as the browser for testing.
 */

import { defineConfig, devices } from "@playwright/test";
import os from "os"; // Import the OS module

const platform = os.platform();

const config = {
  retries: 0,
  timeout: 60_000,
  workers: 8,
};

if (platform === "darwin") {
  Object.assign(config, {
    retries: 1,
    timeout: 60_000,
    workers: 2
  });
} else if (platform === "linux") {
  Object.assign(config, {
    workers: 4,
  });
}

export default defineConfig({
  ...config,
  testDir: "./test/integration",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
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
