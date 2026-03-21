/**
 * @fileoverview Integration test for heading creation via keyboard input.
 * Serves the renderer content over HTTP and tests in a real Firefox browser.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor } from '../../test-utils.js';
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
  await page.goto(`about:blank`);
});

test(`typing "# main" letter by letter creates a heading with correct content`, async ({
  page,
}) => {
  await page.goto(baseURL);

  // Wait for the editor to initialize and render its first line
  await page.waitForSelector(`#editor [data-node-id]`);

  const editor = page.locator(`#editor`);
  await clickInEditor(page, editor);

  // Type each character individually to simulate real user input
  for (const char of [`#`, ` `, `m`, `a`, `i`, `n`]) {
    await page.keyboard.type(char);
  }

  // The editor should now contain a heading1 element
  const headingLine = editor.locator(`.md-heading1`);
  await expect(headingLine).toBeVisible();

  // The heading content span should contain "main"
  const contentSpan = headingLine.locator(`.md-content`);
  await expect(contentSpan).toHaveText(`main`);
});
