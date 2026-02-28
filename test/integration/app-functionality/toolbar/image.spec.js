/**
 * @fileoverview Integration tests for image support.
 * Verifies the image toolbar button, image modal dialog, image parsing,
 * and image rendering in both source and writing modes.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    closeApp,
    launchApp,
    setSourceView,
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

test('image button is visible in the toolbar', async () => {
    const imageButton = page.locator('[data-button-id="image"]');
    await expect(imageButton).toBeVisible();
    await expect(imageButton).toHaveAttribute('title', 'Image');
});

test('clicking image button opens the image modal', async () => {
    const imageButton = page.locator('[data-button-id="image"]');
    await imageButton.click();

    const dialog = page.locator('.image-dialog');
    await expect(dialog).toBeVisible();

    // Verify the modal has the expected fields
    const srcInput = page.locator('#image-src');
    const altInput = page.locator('#image-alt');
    const hrefInput = page.locator('#image-href');
    const browseBtn = page.locator('.image-browse-btn');

    await expect(srcInput).toBeVisible();
    await expect(altInput).toBeVisible();
    await expect(hrefInput).toBeVisible();
    await expect(browseBtn).toBeVisible();

    // Cancel the dialog
    const cancelBtn = page.locator('.image-btn--cancel');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
});

test('inserting an image via the modal creates an image node', async () => {
    // Click the image button
    const imageButton = page.locator('[data-button-id="image"]');
    await imageButton.click();

    const dialog = page.locator('.image-dialog');
    await expect(dialog).toBeVisible();

    // Fill in the fields
    await page.fill('#image-src', 'test-image.png');
    await page.fill('#image-alt', 'Test Image');

    // Click Insert
    const insertBtn = page.locator('.image-btn--insert');
    await insertBtn.click();
    await expect(dialog).not.toBeVisible();

    // Verify the image node was created in the editor
    const imageNode = page.locator('.md-image');
    await expect(imageNode).toBeVisible();

    // Verify the markdown content includes the image syntax
    const content = await page.evaluate(() => window.editorAPI?.getContent());
    expect(content).toContain('![Test Image](test-image.png)');
});

test('image node displays raw syntax in source mode', async () => {
    // Set up: load content with an image, then switch to source view.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, '![Test Image](test-image.png)');
    await page.waitForSelector('#editor .md-line');
    await setSourceView(page);

    const imageNode = page.locator('.md-image .md-content');
    await expect(imageNode).toBeVisible();

    const text = await imageNode.textContent();
    expect(text).toContain('![Test Image](test-image.png)');
});

test('clicking image button on existing image opens edit modal with pre-filled data', async () => {
    // Set up: load content with a paragraph + image and switch to writing view.
    // The leading paragraph prevents clickInEditor from landing on the image
    // (which would trigger click-to-edit and open the modal prematurely).
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, 'some text\n\n![Test Image](test-image.png)');
    await page.waitForSelector('#editor .md-line');
    await setWritingView(page);

    // Click on the first paragraph (safe), then arrow down to the image line.
    const firstLine = page.locator('#editor .md-line').first();
    await clickInEditor(page, firstLine);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);

    // Now click the image toolbar button with cursor on the image node.
    const imageButton = page.locator('[data-button-id="image"]');
    await imageButton.click();

    const dialog = page.locator('.image-dialog[open]');

    // Check that the heading says "Edit Image"
    const heading = page.locator('.image-dialog-header h2');
    await expect(heading).toHaveText('Edit Image');

    // Check that the fields are pre-filled
    const srcInput = page.locator('#image-src');
    const altInput = page.locator('#image-alt');
    await expect(srcInput).toHaveValue('test-image.png');
    await expect(altInput).toHaveValue('Test Image');

    // Check that the button says "Update"
    const updateBtn = page.locator('.image-btn--insert');
    await expect(updateBtn).toHaveText('Update');

    // Cancel
    const cancelBtn = page.locator('.image-btn--cancel');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
});
