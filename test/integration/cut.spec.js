/**
 * @fileoverview Integration tests for cut functionality.
 *
 * Cut must copy the markdown source of the selected range to the clipboard
 * (same as copy) and then remove the selected content from the document,
 * merging the remaining halves when the selection spans multiple nodes.
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

test.describe('Cut Functionality', () => {
  test.beforeEach(async () => {
    await loadContent(page, '');
  });

  test('should cut a partial selection within a single node', async () => {
    await loadContent(page, 'Hello World');

    const editor = page.locator('#editor');
    await editor.click();

    // Position cursor after "Hello" (offset 5), then select to end
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
    }
    await page.keyboard.down('Shift');
    await page.keyboard.press('End');
    await page.keyboard.up('Shift');

    await page.keyboard.press('Control+x');

    // Clipboard should contain the cut portion
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toBe(' World');

    // Document should contain only the remaining text
    const markdown = await page.evaluate(() => window.editorAPI?.getContent());
    expect(markdown).toBe('Hello');
  });

  test('should cut across multiple nodes and merge remainders', async () => {
    await loadContent(page, '# heading\n\nparagraph text');

    const editor = page.locator('#editor');
    await editor.click();

    // Select everything and cut
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('Shift+Control+End');

    await page.keyboard.press('Control+x');

    // Clipboard should contain the full markdown
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toBe('# heading\n\nparagraph text');

    // Document should be empty (just an empty paragraph remains)
    const markdown = await page.evaluate(() => window.editorAPI?.getContent());
    expect(markdown).toBe('');
  });

  test('should not change document when no selection exists', async () => {
    await loadContent(page, 'Some content here.');

    const editor = page.locator('#editor');
    await editor.click();

    // No selection — collapsed cursor
    await page.keyboard.press('Control+x');

    // Document should be unchanged
    const markdown = await page.evaluate(() => window.editorAPI?.getContent());
    expect(markdown).toBe('Some content here.');
  });

  test('should cut formatted text and preserve markdown in clipboard', async () => {
    await loadContent(page, 'Text with **bold** words.');

    const editor = page.locator('#editor');
    await editor.click();

    // Select the entire line
    await page.keyboard.press('Home');
    await page.keyboard.down('Shift');
    await page.keyboard.press('End');
    await page.keyboard.up('Shift');

    await page.keyboard.press('Control+x');

    // Clipboard should contain markdown source
    const clipboardContent = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardContent).toBe('Text with **bold** words.');

    // Document should be empty
    const markdown = await page.evaluate(() => window.editorAPI?.getContent());
    expect(markdown).toBe('');
  });
});
