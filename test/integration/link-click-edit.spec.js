/**
 * @fileoverview Integration tests for link interactions in writing mode.
 *
 * Verifies that:
 * - Clicking a link in writing mode does NOT navigate away
 * - Clicking a link opens the link edit modal pre-filled
 * - Editing the link via the modal updates the parse tree
 * - Cancelling the modal preserves the original link
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent } from './test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const LINK_MD = 'Visit [Example](https://example.com) for more.';

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test.describe('Link click-to-edit', () => {
    test.beforeEach(async () => {
        await loadContent(page, LINK_MD);
    });

    test('clicking a link in writing mode opens the edit modal', async () => {
        // Click the paragraph to focus it (renders as WYSIWYG with <a>)
        const paragraph = page.locator('.md-line.md-paragraph');
        await clickInEditor(page, paragraph);

        // Now click the rendered <a> element
        const link = page.locator('.md-line.md-paragraph a');
        await clickInEditor(page, link);

        // The link modal should appear
        const dialog = page.locator('.link-dialog');
        await expect(dialog).toBeVisible();

        // Heading should say "Edit Link"
        const heading = page.locator('.link-dialog-header h2');
        await expect(heading).toHaveText('Edit Link');

        // Fields should be pre-filled
        const textInput = page.locator('#link-text');
        const urlInput = page.locator('#link-url');
        await expect(textInput).toHaveValue('Example');
        await expect(urlInput).toHaveValue('https://example.com');

        // Button should say "Update"
        const updateBtn = page.locator('.link-btn--insert');
        await expect(updateBtn).toHaveText('Update');

        // Cancel the dialog
        const cancelBtn = page.locator('.link-btn--cancel');
        await cancelBtn.click();
        await expect(dialog).not.toBeVisible();
    });

    test('editing a link via the modal updates the parse tree', async () => {
        // Click paragraph then the link
        const paragraph = page.locator('.md-line.md-paragraph');
        await clickInEditor(page, paragraph);

        const link = page.locator('.md-line.md-paragraph a');
        await clickInEditor(page, link);

        const dialog = page.locator('.link-dialog');
        await expect(dialog).toBeVisible();

        // Clear and update the fields
        await page.fill('#link-text', 'Google');
        await page.fill('#link-url', 'https://google.com');

        // Submit
        const updateBtn = page.locator('.link-btn--insert');
        await updateBtn.click();
        await expect(dialog).not.toBeVisible();

        // Verify the parse tree was updated
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('[Google](https://google.com)');
        expect(markdown).not.toContain('[Example](https://example.com)');
    });

    test('cancelling the modal does not change the link', async () => {
        // Click paragraph then the link
        const paragraph = page.locator('.md-line.md-paragraph');
        await clickInEditor(page, paragraph);

        const link = page.locator('.md-line.md-paragraph a');
        await clickInEditor(page, link);

        const dialog = page.locator('.link-dialog');
        await expect(dialog).toBeVisible();

        // Change fields but cancel
        await page.fill('#link-text', 'Changed');
        await page.fill('#link-url', 'https://changed.com');
        const cancelBtn = page.locator('.link-btn--cancel');
        await cancelBtn.click();

        // Original content should be unchanged
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('[Example](https://example.com)');
    });

    test('clicking a link does not navigate away', async () => {
        // Click paragraph then the link
        const paragraph = page.locator('.md-line.md-paragraph');
        await clickInEditor(page, paragraph);

        const link = page.locator('.md-line.md-paragraph a');
        await clickInEditor(page, link);

        // We should still be on the same page (modal opens, not navigated away)
        const dialog = page.locator('.link-dialog');
        await expect(dialog).toBeVisible();

        // The editor content should still be present
        const editorVisible = await page.locator('#editor').isVisible();
        expect(editorVisible).toBe(true);

        // Cancel
        const cancelBtn = page.locator('.link-btn--cancel');
        await cancelBtn.click();
    });
});

test.describe('Link with nested formatting', () => {
    const BOLD_LINK_MD = 'Click [**bold link**](https://bold.com) here.';

    test.beforeEach(async () => {
        await loadContent(page, BOLD_LINK_MD);
    });

    test('clicking bold text inside a link does not open the link modal', async () => {
        const paragraph = page.locator('.md-line.md-paragraph');
        await clickInEditor(page, paragraph);

        // Click the <strong> inside the <a> — this is what a real user hits.
        const bold = page.locator('.md-line.md-paragraph a strong');
        await clickInEditor(page, bold);

        // The link modal should NOT appear — the user clicked the bold text,
        // not the link itself.
        const dialog = page.locator('.link-dialog');
        await expect(dialog).not.toBeVisible();
    });

    test('clicking the link element itself still opens the modal', async () => {
        // Load content with a non-bold link so we can click the <a> directly.
        await loadContent(page, 'Click [plain link](https://bold.com) here.');

        const paragraph = page.locator('.md-line.md-paragraph');
        await clickInEditor(page, paragraph);

        const link = page.locator('.md-line.md-paragraph a');
        await clickInEditor(page, link);

        const dialog = page.locator('.link-dialog');
        await expect(dialog).toBeVisible();

        const textInput = page.locator('#link-text');
        await expect(textInput).toHaveValue('plain link');

        const urlInput = page.locator('#link-url');
        await expect(urlInput).toHaveValue('https://bold.com');

        const cancelBtn = page.locator('.link-btn--cancel');
        await cancelBtn.click();
    });
});
