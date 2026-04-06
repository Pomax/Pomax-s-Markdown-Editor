/**
 * @fileoverview Integration tests for File > Restructure > Headings.
 * Verifies that headings are promoted so that the top-most level becomes `#`.
 */

import { expect, test } from '@playwright/test';
import { closeApp, launchApp, loadContent, setWritingView } from '../../test-utils.js';

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

test(`promotes ## / ### headings so that top-most becomes #`, async () => {
  await loadContent(page, `## Second\n\nSome text\n\n### Third\n\n#### Fourth`);
  await setWritingView(page);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    /** @type {any} */ (window).__editor.restructureHeadings();
  });
  await page.waitForTimeout(200);

  const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? ``);
  expect(markdown).toContain(`# Second`);
  expect(markdown).toContain(`## Third`);
  expect(markdown).toContain(`### Fourth`);
  expect(markdown).not.toContain(`## Second`);
});

test(`does nothing when document already has # headings`, async () => {
  const input = `# Top\n\nSome text\n\n## Sub`;
  await loadContent(page, input);
  await setWritingView(page);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    /** @type {any} */ (window).__editor.restructureHeadings();
  });
  await page.waitForTimeout(200);

  const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? ``);
  expect(markdown).toContain(`# Top`);
  expect(markdown).toContain(`## Sub`);
});

test(`does nothing when document has no headings`, async () => {
  const input = `Just a paragraph\n\nAnother paragraph`;
  await loadContent(page, input);
  await setWritingView(page);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    /** @type {any} */ (window).__editor.restructureHeadings();
  });
  await page.waitForTimeout(200);

  const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? ``);
  expect(markdown).toContain(`Just a paragraph`);
  expect(markdown).toContain(`Another paragraph`);
});

test(`promotes deeply nested headings (all ######)`, async () => {
  await loadContent(page, `###### Deep heading\n\nSome text`);
  await setWritingView(page);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    /** @type {any} */ (window).__editor.restructureHeadings();
  });
  await page.waitForTimeout(200);

  const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? ``);
  expect(markdown).toContain(`# Deep heading`);
  expect(markdown).not.toContain(`##`);
});

test(`restructure is undoable`, async () => {
  await loadContent(page, `### Heading\n\nText`);
  await setWritingView(page);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    /** @type {any} */ (window).__editor.restructureHeadings();
  });
  await page.waitForTimeout(200);

  let markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? ``);
  expect(markdown).toContain(`# Heading`);

  // Undo the restructure
  await page.evaluate(() => /** @type {any} */ (window).__editor.undo());
  await page.waitForTimeout(200);

  markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? ``);
  expect(markdown).toContain(`### Heading`);
});
