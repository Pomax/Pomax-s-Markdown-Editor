/**
 * @fileoverview Integration tests for copy functionality.
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
    // Clear editor content before each test
    await loadContent(page, '');
  });

  test('should copy precise inline selection as markdown source', async () => {
    // Load the inline-html test content
    const testContent = `# test document

This is a paragraph with <sub>subscript</sub> and <sup>superscript</sup> text.

It also tests <strong>strong</strong> and <em>emphasis</em> text.`;
    await loadContent(page, testContent);

    const editor = page.locator('#editor');
    await editor.click();

    // Position cursor at "document" in the header (approximately)
    await page.keyboard.press('Home');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
    }

    // Start selection and extend to after "strong" in second paragraph
    await page.keyboard.down('Shift');

    // Move down to second paragraph and to after "strong"
    await page.keyboard.press('ArrowDown'); // to end of header
    await page.keyboard.press('ArrowDown'); // to blank line
    await page.keyboard.press('ArrowDown'); // to second paragraph
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('ArrowRight');
    }

    await page.keyboard.up('Shift');

    // Copy using Ctrl+C
    await page.keyboard.press('Control+c');

    // Read clipboard content
    const clipboardContent = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });

    // The clipboard should contain the exact markdown source that was selected
    // Starting from "document" in header and ending after "strong" in second paragraph
    expect(clipboardContent).toBe(
      'document\n\nThis is a paragraph with <sub>subscript</sub> and <sup>superscript</sup> text.\n\nIt also tests <strong>strong',
    );
  });

  test('should copy formatted text with markdown syntax', async () => {
    // Load content with formatting
    await loadContent(page, 'This has **bold** and *italic* text.');

    const editor = page.locator('#editor');
    await editor.click();

    // Select the entire line
    await page.keyboard.press('Home');
    await page.keyboard.down('Shift');
    await page.keyboard.press('End');
    await page.keyboard.up('Shift');

    // Copy using Ctrl+C
    await page.keyboard.press('Control+c');

    // Read clipboard content
    const clipboardContent = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });

    expect(clipboardContent).toBe('This has **bold** and *italic* text.');
  });

  test('should copy list items with proper markdown', async () => {
    // Load content with a list
    await loadContent(page, '- First item\n- Second item\n- Third item');

    const editor = page.locator('#editor');
    await editor.click();

    // Select all list items
    await page.keyboard.press('Home');
    await page.keyboard.down('Shift');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.up('Shift');

    // Copy using Ctrl+C
    await page.keyboard.press('Control+c');

    // Read clipboard content
    const clipboardContent = await page.evaluate(() => {
      return navigator.clipboard.readText();
    });

    expect(clipboardContent).toContain('- First item');
    expect(clipboardContent).toContain('- Second item');
    expect(clipboardContent).toContain('- Third item');
  });

  test('should not interfere with browser copy when no selection', async () => {
    // Load content
    await loadContent(page, 'Simple text.');

    const editor = page.locator('#editor');
    await editor.click();

    // Don't select anything (collapsed cursor)

    // Copy using Ctrl+C - should not throw error
    await page.keyboard.press('Control+c');

    // Should not crash and editor should still be responsive
    await page.keyboard.type(' More text');

    const content = await editor.innerText();
    expect(content).toContain('Simple text. More text');
  });

  test('should handle empty document gracefully', async () => {
    // Ensure editor is empty
    await loadContent(page, '');

    const editor = page.locator('#editor');
    await editor.click();

    // Try to copy (should not error)
    await page.keyboard.press('Control+c');

    // Should not crash
    await page.keyboard.type('Test');
    const content = await editor.innerText();
    expect(content).toContain('Test');
  });
});
