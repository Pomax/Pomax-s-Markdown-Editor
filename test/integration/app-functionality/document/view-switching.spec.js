/**
 * @fileoverview Integration tests for view-mode switching behaviour.
 * Verifies scroll position, cursor preservation, and other concerns
 * that arise when switching between writing and source2 views.
 */

import { expect, test } from '@playwright/test';
import {
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

test(`switching to source2 does not scroll a short document`, async () => {
  await loadContent(page, ``);
  await setWritingView(page);

  // Increase --page-max-width so the editor's min-height (width * 1.414)
  // exceeds the viewport height, making the scroll container scrollable.
  await page.evaluate(() => {
    document.documentElement.style.setProperty(`--page-max-width`, `1000px`);
  });

  const editor = page.locator(`#editor`);
  await editor.click();
  await page.waitForTimeout(100);

  // Type text containing an inline element so the cursor ends up
  // after a closing tag — Firefox returns a zero-height rect for
  // the collapsed selection there, which used to produce a bogus
  // savedCaretTop and scroll the content off-screen.
  const text = `this is <em>a test</em>.`;
  for (const ch of text) {
    await page.keyboard.press(ch);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(100);

  const scrollTopBefore = await page.evaluate(() => {
    return document.getElementById(`editor-container`)?.scrollTop ?? 0;
  });

  await setSource2View(page);

  const scrollTopAfter = await page.evaluate(() => {
    return document.getElementById(`editor-container`)?.scrollTop ?? 0;
  });

  expect(scrollTopAfter, `switching to source2 should not change scroll position`).toBe(
    scrollTopBefore,
  );
});
