/**
 * @fileoverview Integration tests for reparsing when leaving source2 mode.
 *
 * Verifies that edits made in the source2 textarea are correctly parsed
 * back into a syntax tree when switching to writing or source view (Step 7
 * of the source view migration).
 */
import { expect, test } from '@playwright/test';
import {
  MOD,
  closeApp,
  launchApp,
  loadContent,
  setSource2View,
  setWritingView,
} from '../../test-utils.js';

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

test.beforeEach(async () => {
  await setWritingView(page);
});

test.describe(`Source2 reparse on view switch`, () => {
  test(`edits in source2 are reflected when switching to writing view`, async () => {
    await loadContent(page, `hello world`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await page.keyboard.press(`${MOD}+a`);
    await page.keyboard.type(`goodbye world`);

    await setWritingView(page);

    const text = await page.locator(`#editor [data-node-id]`).first().innerText();
    expect(text).toBe(`goodbye world`);
  });
});
