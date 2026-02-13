/**
 * @fileoverview Integration tests for click-to-edit image in focused mode.
 *
 * Verifies that clicking an image in focused (WYSIWYG) mode opens the
 * image edit modal pre-filled with the image's current data, and that
 * submitting the modal updates the parse tree.
 */

import { expect, test } from '@playwright/test';
import { launchApp, loadContent } from './test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const IMAGE_MD = '![Photo](picture.png)';

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test.describe('Image click-to-edit', () => {
    test.beforeEach(async () => {
        await loadContent(page, IMAGE_MD);
    });

    test('clicking an image in focused mode opens the edit modal', async () => {
        // Click the image element
        const image = page.locator('.md-line.md-image');
        await image.click();

        // The image modal should appear
        const dialog = page.locator('.image-dialog');
        await expect(dialog).toBeVisible();

        // Heading should say "Edit Image"
        const heading = page.locator('.image-dialog-header h2');
        await expect(heading).toHaveText('Edit Image');

        // Fields should be pre-filled
        const srcInput = page.locator('#image-src');
        const altInput = page.locator('#image-alt');
        await expect(srcInput).toHaveValue('picture.png');
        await expect(altInput).toHaveValue('Photo');

        // Button should say "Update"
        const updateBtn = page.locator('.image-btn--insert');
        await expect(updateBtn).toHaveText('Update');

        // Cancel the dialog
        const cancelBtn = page.locator('.image-btn--cancel');
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible();
    });

    test('editing an image via the modal updates the parse tree', async () => {
        // Click the image
        const image = page.locator('.md-line.md-image');
        await image.click();

        const dialog = page.locator('.image-dialog');
        await expect(dialog).toBeVisible();

        // Clear and update the fields
        await page.fill('#image-alt', 'Updated Photo');
        await page.fill('#image-src', 'new-picture.png');

        // Submit
        const updateBtn = page.locator('.image-btn--insert');
        await updateBtn.click();
        await expect(dialog).not.toBeVisible();

        // Verify the parse tree was updated
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('![Updated Photo](new-picture.png)');
        expect(markdown).not.toContain('![Photo](picture.png)');
    });

    test('cancelling the modal does not change the image', async () => {
        // Click the image
        const image = page.locator('.md-line.md-image');
        await image.click();

        const dialog = page.locator('.image-dialog');
        await expect(dialog).toBeVisible();

        // Change fields but cancel
        await page.fill('#image-alt', 'Changed');
        const cancelBtn = page.locator('.image-btn--cancel');
        await cancelBtn.click();

        // Original content should be unchanged
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('![Photo](picture.png)');
    });
});
