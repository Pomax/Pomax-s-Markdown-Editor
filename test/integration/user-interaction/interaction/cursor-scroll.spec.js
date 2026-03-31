/**
 * @fileoverview Integration test for scroll-to-cursor behaviour.
 *
 * Verifies that when the cursor is placed programmatically (e.g. via
 * session restore), the editor scrolls so the focused line is visible.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { clickInEditor, clickQuerySelector, resetPage } from '../../test-utils.js';
import { startServer, stopServer } from '../../test-http-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, `..`, `..`, `..`, `fixtures`);

/** The text that the target line must contain. */
const TARGET_TEXT = `Chapter 5`;

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

/**
 * Reads the lorem ipsum fixture file.
 * @returns {Promise<string>}
 */
async function loadLoremFixture() {
  return readFile(path.join(FIXTURES_DIR, `lorem.md`), `utf-8`);
}

test(`placing the cursor on an off-screen node scrolls it into view`, async ({ page }) => {
  await page.goto(baseURL);
  await page.waitForSelector(`#editor [data-node-id]`);

  // Click into the editor to initialise it
  const editor = page.locator(`#editor`);
  await clickInEditor(page, editor);

  // Load the lorem fixture so most of the document is off-screen
  const content = await loadLoremFixture();
  await page.evaluate((md) => window.editorAPI?.setContent(md), content);
  await page.waitForSelector(`#editor [data-node-id]`);

  // Scroll to the very top to ensure the target line is off-screen
  await page.evaluate(() => {
    const container = document.getElementById(`editor-container`);
    if (container) container.scrollTop = 0;
  });
  await page.waitForTimeout(100);

  // Verify the target line is NOT visible before we place the cursor
  const targetLocator = page.locator(`#editor [data-node-id]`, {
    hasText: TARGET_TEXT,
  });
  const beforeRect =
    /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
      await targetLocator.boundingBox()
    );
  const containerBox =
    /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
      await page.locator(`#editor-container`).boundingBox()
    );
  expect(beforeRect).not.toBeNull();
  expect(containerBox).not.toBeNull();
  // The target should be below the visible area
  expect(beforeRect.y).toBeGreaterThan(containerBox.y + containerBox.height);

  // Programmatically place the cursor on the target node, simulating
  // what session restore does.
  // Programmatically place the cursor on the target node, simulating
  // what session restore does.
  await page.evaluate((target) => {
    const lines = document.querySelectorAll(`#editor [data-node-id]`);
    for (const line of lines) {
      if (line.textContent?.includes(target)) {
        const nodeId = line.getAttribute(`data-node-id`);
        if (nodeId && window.editorAPI) {
          window.editorAPI.placeCursorAtNode(nodeId, 0);
        }
        break;
      }
    }
  }, TARGET_TEXT);

  // Allow time for the scroll to settle
  await page.waitForTimeout(200);

  // The target line should now be visible within the scroll container
  // (allow a few pixels of tolerance for sub-pixel rounding)
  const afterRect =
    /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
      await targetLocator.boundingBox()
    );
  expect(afterRect).not.toBeNull();
  expect(afterRect.y).toBeGreaterThanOrEqual(containerBox.y - 5);
  expect(afterRect.y + afterRect.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height + 5,
  );
});

test.skip(`placing the cursor on an off-screen node in source view scrolls it into view`, async ({
  page,
}) => {
  await page.goto(baseURL);
  await page.waitForSelector(`#editor [data-node-id]`);

  // Click into the editor, switch to source view
  const editor = page.locator(`#editor`);
  await clickInEditor(page, editor);

  // Switch to source view
  const current = await editor.getAttribute(`data-view-mode`);
  if (current !== `source`) {
    await clickQuerySelector(page, `.toolbar-view-mode-toggle`);
    await page.locator(`#editor[data-view-mode="source"]`).waitFor();
  }

  // Load the lorem fixture
  const content = await loadLoremFixture();
  await page.evaluate((md) => window.editorAPI?.setContent(md), content);
  await page.waitForSelector(`#editor [data-node-id]`);

  // Scroll to the very top
  await page.evaluate(() => {
    const container = document.getElementById(`editor-container`);
    if (container) container.scrollTop = 0;
  });
  await page.waitForTimeout(100);

  // Programmatically place cursor on the target node
  await page.evaluate((target) => {
    const lines = document.querySelectorAll(`#editor [data-node-id]`);
    for (const line of lines) {
      if (line.textContent?.includes(target)) {
        const nodeId = line.getAttribute(`data-node-id`);
        if (nodeId && window.editorAPI) {
          window.editorAPI.placeCursorAtNode(nodeId, 0);
        }
        break;
      }
    }
  }, TARGET_TEXT);

  // Allow time for the scroll to settle
  await page.waitForTimeout(200);

  // The target should now be visible
  const targetLocator = page.locator(`#editor [data-node-id]`, { hasText: TARGET_TEXT });
  const afterRect =
    /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
      await targetLocator.boundingBox()
    );
  const containerBox =
    /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
      await page.locator(`#editor-container`).boundingBox()
    );
  expect(afterRect).not.toBeNull();
  expect(containerBox).not.toBeNull();
  expect(afterRect.y).toBeGreaterThanOrEqual(containerBox.y - 5);
  expect(afterRect.y + afterRect.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height + 5,
  );
});
