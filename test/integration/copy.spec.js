/**
 * @fileoverview Integration tests for copy functionality.
 *
 * Copy must intercept the native clipboard event and write the raw markdown
 * source of the selected range, converting rendered-text offsets back to raw
 * content offsets when the selection covers non-active (rendered) nodes in
 * focused view.
 */

import { expect, test } from '@playwright/test';
import { launchApp, loadContent } from './test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
  ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
  await electronApp.close();
});

test.describe('Copy Functionality', () => {
  test.beforeEach(async () => {
    await loadContent(page, '');
  });

  test('should copy a full line of formatted text as markdown source', async () => {
    await loadContent(page, 'This has **bold** and *italic* text.');

    const editor = page.locator('#editor');
    await editor.click();

    // Select the entire line (active node → raw text visible)
    await page.keyboard.press('Home');
    await page.keyboard.down('Shift');
    await page.keyboard.press('End');
    await page.keyboard.up('Shift');

    await page.keyboard.press('Control+c');

    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toBe('This has **bold** and *italic* text.');
  });

  test('should copy across multiple nodes', async () => {
    await loadContent(page, '# heading\n\nparagraph text');

    const editor = page.locator('#editor');
    await editor.click();

    // Select everything: Ctrl+Home → start, then Shift+Ctrl+End → end
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Shift+Control+End');

    await page.keyboard.press('Control+c');

    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toBe('# heading\n\nparagraph text');
  });

  test('should copy list items with proper markdown', async () => {
    await loadContent(page, '- First item\n- Second item\n- Third item');

    const editor = page.locator('#editor');
    await editor.click();

    // Select all list items
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Shift+Control+End');

    await page.keyboard.press('Control+c');

    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());

    expect(clipboardContent).toContain('- First item');
    expect(clipboardContent).toContain('- Second item');
    expect(clipboardContent).toContain('- Third item');
  });

  test('should not interfere with browser copy when no selection', async () => {
    await loadContent(page, 'Simple text.');

    const editor = page.locator('#editor');
    await editor.click();

    // No selection — collapsed cursor
    await page.keyboard.press('Control+c');

    // Should not crash; editor remains responsive
    await page.keyboard.type(' More text');

    const content = await editor.innerText();
    expect(content).toContain('Simple text. More text');
  });

  test('should handle empty document gracefully', async () => {
    await loadContent(page, '');

    const editor = page.locator('#editor');
    await editor.click();

    // Try to copy — should not error
    await page.keyboard.press('Control+c');

    // Editor should still be responsive
    await page.keyboard.type('Test');
    const content = await editor.innerText();
    expect(content).toContain('Test');
  });
});
