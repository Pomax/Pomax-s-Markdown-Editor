/**
 * @fileoverview Integration test for dynamic page height.
 * Verifies that the editor page grows to fit its content instead of
 * staying at a fixed height.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, resetPage } from '../../test-utils.js';
import { startServer, stopServer } from '../../test-http-server.js';

/** @type {import('node:http').Server} */
let server;

/** @type {string} */
let baseURL;

test.beforeAll(async () => {
  ({ server, baseURL } = await startServer());
});

test.afterAll(async () => {
  await stopServer(server);
});

test.afterEach(async ({ page }) => {
  await resetPage(page);
});

test(`editor page height grows when content exceeds initial min-height`, async ({ page }) => {
  await page.goto(baseURL);

  // Wait for the editor to initialize
  await page.waitForSelector(`#editor [data-node-id]`);

  const editor = page.locator(`#editor`);
  await clickInEditor(page, editor);

  // Measure the initial height of the editor (should be the A4 min-height)
  const initialHeight = await editor.evaluate((el) => /** @type {HTMLElement} */ (el).offsetHeight);
  expect(initialHeight).toBeGreaterThan(0);

  // Paste enough lines to exceed the initial page height.
  const lineCount = 80;
  const lines = Array.from({ length: lineCount }, (_, i) => `Line ${i + 1}`).join(`\n`);
  await page.evaluate((text) => navigator.clipboard.writeText(text), lines);
  await page.keyboard.press(`${process.platform === `darwin` ? `Meta` : `Control`}+v`);

  // The editor height should now be greater than the initial min-height
  const expandedHeight = await editor.evaluate(
    (el) => /** @type {HTMLElement} */ (el).offsetHeight,
  );
  expect(expandedHeight).toBeGreaterThan(initialHeight);
});
