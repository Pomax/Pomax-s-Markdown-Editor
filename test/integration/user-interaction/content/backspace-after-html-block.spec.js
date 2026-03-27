/**
 * @fileoverview Integration test for pressing Backspace at the start of the
 * paragraph that immediately follows a </details> closing tag.
 *
 * Loads test/fixtures/details.md and places the cursor at the beginning of
 * "And then this is the main doc again.".  In both source and writing view,
 * pressing Backspace once must NOT delete the entire line.
 *
 *  • Source view  – the paragraph is a top-level node whose previous sibling
 *    is an html-block container.  Backspace at offset 0 should be a no-op
 *    (there is nothing meaningful to merge into).
 *  • Writing view – Backspace at offset 0 should merge the paragraph into the
 *    last child of the preceding html-block (the "better" paragraph), so the
 *    result is "betterAnd then this is the main doc again."
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  clickInEditor,
  closeApp,
  launchApp,
  loadContent,
  projectRoot,
  setSourceView,
  setWritingView,
} from '../../test-utils.js';

const isMac = process.platform === `darwin`;
const Home = isMac ? `Meta+ArrowLeft` : `Home`;

const fixturePath = path.join(projectRoot, `test`, `fixtures`, `details.md`);
const fixtureContent = fs.readFileSync(fixturePath, `utf-8`);

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

test(`source view: backspace at start of paragraph after </details> does not delete the line`, async () => {
  // Load the fixture fresh.
  await loadContent(page, fixtureContent);

  // Switch to source view.
  await setSourceView(page);

  // Find the line that contains "And then this is the main doc again."
  const targetLine = page.locator(`#editor [data-node-id]`, {
    hasText: `And then this is the main doc again.`,
  });
  // There may be a parent wrapper that also matches; narrow to the
  // innermost [data-node-id] that has no [data-node-id] children.
  const innerTarget = targetLine.locator(`:scope:not(:has([data-node-id]))`).first();
  await clickInEditor(page, innerTarget);
  await page.waitForTimeout(100);

  // Move cursor to the very start of the line.
  await page.keyboard.press(Home);
  await page.waitForTimeout(100);

  // Press Backspace.
  await page.keyboard.press(`Backspace`);
  await page.waitForTimeout(300);

  // The line must still exist with its full content.
  const afterLine = page.locator(`#editor [data-node-id]`, {
    hasText: `And then this is the main doc again.`,
  });
  const count = await afterLine.locator(`:scope:not(:has([data-node-id]))`).count();
  expect(
    count,
    `paragraph should still exist after backspace in source view`,
  ).toBeGreaterThanOrEqual(1);

  const text = await afterLine.locator(`:scope:not(:has([data-node-id]))`).first().innerText();
  expect(text).toContain(`And then this is the main doc again.`);
});

test(`writing view: backspace at start of paragraph after </details> merges with last child inside details`, async () => {
  // Reload the fixture fresh.
  await loadContent(page, fixtureContent);

  // Make sure we're in writing view.
  await setWritingView(page);

  // Click on "And then this is the main doc again."
  const targetLine = page.locator(`#editor [data-node-id]`, {
    hasText: `And then this is the main doc again.`,
  });
  await clickInEditor(page, targetLine.first());
  await page.waitForTimeout(100);

  // Move cursor to the very start.
  await page.keyboard.press(Home);
  await page.waitForTimeout(100);

  // Press Backspace — should merge into the "better" paragraph.
  await page.keyboard.press(`Backspace`);
  await page.waitForTimeout(300);

  // The merged text should now be "betterAnd then this is the main doc again."
  // located inside the fake details block.
  const mergedLine = page.locator(`#editor .html-details [data-node-id]`, {
    hasText: `betterAnd then this is the main doc again.`,
  });
  const mergedCount = await mergedLine.count();
  expect(mergedCount, `merged line should exist inside details`).toBe(1);

  // The standalone paragraph should no longer exist outside details.
  // Use :not(.md-html-block) to exclude the html-block wrapper whose
  // descendant text now includes the merged content.
  const standaloneLine = page.locator(`#editor > [data-node-id]:not(.md-html-block)`, {
    hasText: `And then this is the main doc again.`,
  });
  const standaloneCount = await standaloneLine.count();
  expect(standaloneCount, `standalone paragraph should be gone`).toBe(0);
});
