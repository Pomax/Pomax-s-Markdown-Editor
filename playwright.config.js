/**
 * @fileoverview Playwright configuration for integration tests.
 * Uses Firefox as the browser for testing.
 */

import { defineConfig, devices } from "@playwright/test";
import os from "os"; // Import the OS module

const CI_RUN = !!process.env.GITHUB_ACTIONS;
const platform = os.platform();

const config = {
  retries: 0,
  timeout: 5_000,
  workers: 8,
};

if (CI_RUN) {
  let overrides = {};
  if (platform === `darwin`) {
    overrides = {
      retries: 1,
      timeout: 60_000,
      workers: 2,
    };
  } else if (platform === `linux`) {
    overrides = {
      timeout: 30_000,
      workers: 4,
    };
  } else if (platform === `win32`) {
    overrides = {
      retries: 2,
      timeout: 30_000,
      workers: 2,
    };
  }
  Object.assign(config, overrides);
}

export default defineConfig({
  ...config,
  testDir: `./test/integration`,
  testMatch: `**/*.spec.js`,
  fullyParallel: true,
  reporter: `list`,
  projects: [
    {
      name: `firefox`,
      use: { ...devices[`Desktop Firefox`] },
    },
  ],
  use: {
    trace: `on-first-retry`,
    screenshot: `only-on-failure`,
  },
});
