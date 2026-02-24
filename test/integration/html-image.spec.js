/**
 * @fileoverview Integration tests for HTML <img> tag support.
 * Verifies that HTML img tags are parsed as image nodes, rendered
 * correctly in both view modes, and that the image modal includes a
 * style field that round-trips through editing.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    launchApp,
    loadContent,
    setSourceView,
    setWritingView,
} from './test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const HTML_IMG =
    '<img src="image.png" alt="HTML image" style="display: inline-block; zoom: 80%;" />';

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test('HTML img tag is parsed as an image node in writing mode', async () => {
    await loadContent(page, HTML_IMG);
    await setWritingView(page);

    const imageNode = page.locator('.md-line.md-image');
    await expect(imageNode).toBeVisible();

    // The rendered <img> element should exist
    const img = page.locator('.md-image-preview');
    await expect(img).toBeVisible();
});

test('HTML img tag displays raw HTML syntax in source mode', async () => {
    await loadContent(page, HTML_IMG);
    await setSourceView(page);

    const imageNode = page.locator('.md-image .md-content');
    await expect(imageNode).toBeVisible();

    const text = await imageNode.textContent();
    expect(text).toContain('<img src=');
    expect(text).toContain('style="display: inline-block; zoom: 80%;"');
});

test('clicking HTML img in writing mode opens edit modal with style field', async () => {
    await loadContent(page, `some text\n\n${HTML_IMG}`);
    await setWritingView(page);

    // Click on the first paragraph, then arrow down to the image
    const firstLine = page.locator('#editor .md-line').first();
    await clickInEditor(page, firstLine);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Click the image toolbar button
    const imageButton = page.locator('[data-button-id="image"]');
    await imageButton.click();

    const dialog = page.locator('.image-dialog');
    await expect(dialog).toBeVisible();

    // Check heading says "Edit Image"
    const heading = page.locator('.image-dialog-header h2');
    await expect(heading).toHaveText('Edit Image');

    // Check fields are pre-filled
    const srcInput = page.locator('#image-src');
    const altInput = page.locator('#image-alt');
    const styleInput = page.locator('#image-style');

    await expect(srcInput).toHaveValue('image.png');
    await expect(altInput).toHaveValue('HTML image');
    await expect(styleInput).toHaveValue('display: inline-block; zoom: 80%;');

    // Cancel
    const cancelBtn = page.locator('.image-btn--cancel');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
});

test('editing style via modal updates the parse tree', async () => {
    await loadContent(page, HTML_IMG);
    await setWritingView(page);

    // Click the image to open the edit modal
    const image = page.locator('.md-line.md-image');
    await clickInEditor(page, image);

    const dialog = page.locator('.image-dialog');
    await expect(dialog).toBeVisible();

    // Update the style
    await page.fill('#image-style', 'width: 50%;');

    // Submit
    const updateBtn = page.locator('.image-btn--insert');
    await updateBtn.click();
    await expect(dialog).not.toBeVisible();

    // Verify the markdown was updated with the new style
    const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
    expect(markdown).toContain('style="width: 50%;"');
    expect(markdown).toContain('<img src=');
});

test('clearing style converts HTML img to markdown syntax', async () => {
    await loadContent(page, HTML_IMG);
    await setWritingView(page);

    // Click the image to open the edit modal
    const image = page.locator('.md-line.md-image');
    await clickInEditor(page, image);

    const dialog = page.locator('.image-dialog');
    await expect(dialog).toBeVisible();

    // Clear the style field
    await page.fill('#image-style', '');

    // Submit
    const updateBtn = page.locator('.image-btn--insert');
    await updateBtn.click();
    await expect(dialog).not.toBeVisible();

    // Verify the markdown now uses standard markdown syntax
    const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
    expect(markdown).toContain('![HTML image](image.png)');
    expect(markdown).not.toContain('<img');
});

test('markdown image without style does not show style in modal', async () => {
    await loadContent(page, 'some text\n\n![Photo](image.png)');
    await setWritingView(page);

    // Navigate to the image
    const firstLine = page.locator('#editor .md-line').first();
    await clickInEditor(page, firstLine);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Open the toolbar image modal
    const imageButton = page.locator('[data-button-id="image"]');
    await imageButton.click();

    const dialog = page.locator('.image-dialog');
    await expect(dialog).toBeVisible();

    // Style field should be empty
    const styleInput = page.locator('#image-style');
    await expect(styleInput).toHaveValue('');

    // Cancel
    const cancelBtn = page.locator('.image-btn--cancel');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
});
