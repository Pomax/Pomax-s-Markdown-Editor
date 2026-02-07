/**
 * @fileoverview Playwright configuration for integration tests.
 * Uses Firefox as the browser for testing.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './test/integration',
    testMatch: '**/*.spec.js',
    timeout: 30000,
    retries: 0,
    workers: 1,
    reporter: 'list',
    projects: [
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
    ],
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
});
