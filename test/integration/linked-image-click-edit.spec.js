/**
 * @fileoverview Integration tests for click-to-edit linked images in writing mode.
 *
 * A linked image is `[![alt](src)](href)` — an image wrapped in a link.
 * Clicking it in writing mode should open the image edit modal (not navigate).
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent } from './test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const LINKED_IMAGE_MD = '[![Logo](logo.png)](https://example.com)';

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test.describe('Linked image click-to-edit', () => {
    test.beforeEach(async () => {
        await loadContent(page, LINKED_IMAGE_MD);
    });

    test('clicking a linked image opens the image edit modal', async () => {
        // Click the image element
        const image = page.locator('.md-line.md-image');
        await clickInEditor(page, image);

        // The image modal should appear (not the link modal)
        const dialog = page.locator('.image-dialog');
        await expect(dialog).toBeVisible();

        // Fields should be pre-filled with the image data
        const srcInput = page.locator('#image-src');
        const altInput = page.locator('#image-alt');
        await expect(srcInput).toHaveValue('logo.png');
        await expect(altInput).toHaveValue('Logo');

        // Cancel
        const cancelBtn = page.locator('.image-btn--cancel');
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible();
    });

    test('editing a linked image preserves the href', async () => {
        const image = page.locator('.md-line.md-image');
        await clickInEditor(page, image);

        const dialog = page.locator('.image-dialog');
        await expect(dialog).toBeVisible();

        // Update the alt text
        await page.fill('#image-alt', 'New Logo');

        // Submit
        const updateBtn = page.locator('.image-btn--insert');
        await updateBtn.click();
        await expect(dialog).not.toBeVisible();

        // Verify the parse tree still has the href
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('New Logo');
    });
});
