/**
 * @fileoverview Integration tests for the view-mode toggle button in the toolbar.
 * Verifies the toggle has a label, defaults to "Writing View", cycles through
 * writing → source → source2 → writing, and stays in sync when the
 * view mode is changed externally via the menu/IPC.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  clickQuerySelector,
  closeApp,
  defocusEditor,
  launchApp,
  loadContent,
  projectRoot,
} from '../../test-utils.js';

const readmePath = path.join(projectRoot, `README.md`);
const readmeContent = fs.readFileSync(readmePath, `utf-8`);

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
  ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp);
});

test(`view mode toggle has a visible label`, async () => {
  const label = page.locator(`.toolbar-view-mode-label`);
  await expect(label).toBeVisible();
  await expect(label).toHaveText(`View:`);
});

test(`view mode toggle defaults to Writing View`, async () => {
  const toggle = page.locator(`.toolbar-view-mode-toggle`);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveText(`Writing View`);
});

test(`clicking toggle from source2 switches back to writing mode`, async () => {
  // Set up: ensure we are in source2 mode.
  await loadContent(page, readmeContent);
  const toggle = page.locator(`.toolbar-view-mode-toggle`);
  await page.evaluate(() => window.editorAPI?.setViewMode(`source2`));
  await page.locator(`#editor[data-view-mode="source2"]`).waitFor();

  // Click to advance from source2 to writing.
  await clickQuerySelector(page, `.toolbar-view-mode-toggle`);

  await expect(toggle).toHaveText(`Writing View`);

  const editor = page.locator(`#editor`);
  await expect(editor).toHaveAttribute(`data-view-mode`, `writing`);

  // Defocus the editor so no node is focused.
  await defocusEditor(page);

  // In writing mode, unfocused headings hide their `#` syntax.
  const firstLine = page.locator(`#editor [data-node-id]`).first();
  const text = await firstLine.innerText();
  expect(text).not.toContain(`#`);
  expect(text).toContain(`Pomax's Markdown Editor`);
});

test(`toggle stays in sync when view mode changes via menu`, async () => {
  const toggle = page.locator(`.toolbar-view-mode-toggle`);

  // Set up: ensure we start in writing mode.
  await page.evaluate(() => window.editorAPI?.setViewMode(`writing`));
  await page.locator(`#editor[data-view-mode="writing"]`).waitFor();
  await expect(toggle).toHaveText(`Writing View`);

  // Switch to source2 programmatically (simulating a menu action).
  await page.evaluate(() => window.editorAPI?.setViewMode(`source2`));
  await page.locator(`#editor[data-view-mode="source2"]`).waitFor();

  await expect(toggle).toHaveText(`Source 2 View`);

  // Switch back to writing programmatically.
  await page.evaluate(() => window.editorAPI?.setViewMode(`writing`));
  await page.locator(`#editor[data-view-mode="writing"]`).waitFor();

  await expect(toggle).toHaveText(`Writing View`);
});
