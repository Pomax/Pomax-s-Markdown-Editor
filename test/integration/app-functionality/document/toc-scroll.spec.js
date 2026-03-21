/**
 * @fileoverview Integration test for the Table of Contents sidebar.
 * Verifies that clicking a TOC link scrolls the heading to the top of
 * the editor container.
 */

import { expect, test } from '@playwright/test';
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

test(`clicking a TOC link scrolls the heading to the top of the editor container`, async ({
  page,
}) => {
  await page.goto(baseURL);
  await page.waitForSelector(`#editor [data-node-id]`);

  // Build a document with enough content to force scrolling:
  // An h1, many paragraphs, then an h2 that will be off-screen.
  const lines = [`# First Heading`];
  for (let i = 0; i < 60; i++) lines.push(`Paragraph line ${i + 1}`);
  lines.push(`## Second Heading`);
  for (let i = 0; i < 60; i++) lines.push(`More content ${i + 1}`);

  await page.evaluate((md) => window.editorAPI?.setContent(md), lines.join(`\n`));
  await page.waitForSelector(`#editor [data-node-id]`);

  // Wait for the TOC to pick up the headings
  await page.waitForSelector(`#toc-sidebar .toc-link`);

  // Find the TOC link for "Second Heading"
  const tocLink = page.locator(`#toc-sidebar .toc-link`, { hasText: `Second Heading` });
  await expect(tocLink).toBeVisible();

  // Click the TOC link
  await tocLink.click();

  // Allow a frame for the instant scroll to take effect
  await page.waitForTimeout(100);

  // Verify that the heading is at the top of the scroll container.
  // We measure the heading's top relative to the container's top:
  // it should be ≈ 0 (within a tolerance for browser scroll adjustments).
  const offset = await page.evaluate(() => {
    const container = document.getElementById(`editor-container`);
    const heading = document.querySelector(`.md-heading2`);
    if (!container || !heading) return null;
    const containerRect = container.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return headingRect.top - containerRect.top;
  });

  expect(offset).not.toBeNull();
  // The heading should be within 100px of the container's top edge
  expect(/** @type {number} */ (offset)).toBeGreaterThanOrEqual(-100);
  expect(/** @type {number} */ (offset)).toBeLessThanOrEqual(100);
});
