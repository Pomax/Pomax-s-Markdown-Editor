/**
 * @fileoverview Integration tests for inline image syntax during typing.
 *
 * Verifies that typing ![alt](src) in a paragraph produces an inline
 * image rather than a stray '!' + link, and that the node stays a
 * paragraph (not converted to a block-level image node).
 */

import { expect, test } from '@playwright/test';
import { launchApp, loadContent, setFocusedView, setSourceView } from './test-utils.js';

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

test('typing ![alt](src) in focused view renders an inline image', async () => {
    await setFocusedView(page);
    await loadContent(page, 'hello');

    // Click on the paragraph to focus it
    const line = page.locator('#editor .md-line', { hasText: 'hello' });
    await line.click();

    // Move to end of line and type image syntax
    await page.keyboard.press('End');
    await page.keyboard.type(' ![photo](./test.png)');

    // The node should stay a paragraph (not become a block-level image)
    const paragraph = page.locator('#editor .md-line.md-paragraph');
    await expect(paragraph).toBeVisible();

    // An inline <img> should be rendered inside the paragraph
    const img = paragraph.locator('img.md-image-preview');
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute('alt', 'photo');
});

test('typing standalone ![alt](src) suppresses block-level image conversion', async () => {
    await setFocusedView(page);
    await loadContent(page, '');

    // Click in the editor to focus
    const line = page.locator('#editor .md-line').first();
    await line.click();

    // Type a full image syntax as the only content
    await page.keyboard.type('![my image](picture.png)');

    // Should stay a paragraph, not become a block-level image node
    const paragraph = page.locator('#editor .md-line.md-paragraph');
    await expect(paragraph).toBeVisible();

    // Should contain an inline <img>
    const img = paragraph.locator('img.md-image-preview');
    await expect(img).toBeVisible();
});

test('image syntax round-trips through source view correctly', async () => {
    await setFocusedView(page);
    await loadContent(page, 'before ![alt](img.png) after');

    // In focused view, the paragraph should contain an inline image
    const paragraph = page.locator('#editor .md-line.md-paragraph');
    await expect(paragraph).toBeVisible();
    const img = paragraph.locator('img.md-image-preview');
    await expect(img).toBeVisible();

    // Switch to source view — should show raw markdown
    await setSourceView(page);
    const srcLine = page.locator('#editor .md-line', { hasText: '![alt](img.png)' });
    await expect(srcLine).toBeVisible();

    // Switch back to focused view — image should still render
    await setFocusedView(page);
    const imgAfter = page.locator('#editor .md-line.md-paragraph img.md-image-preview');
    await expect(imgAfter).toBeVisible();
});

test('removing ! in source view converts inline image to link', async () => {
    // Type the image syntax so it stays a paragraph (block conversion suppressed)
    await setFocusedView(page);
    await loadContent(page, '');
    const line = page.locator('#editor .md-line').first();
    await line.click();
    await page.keyboard.type('![alt](url)');

    // Verify it's still a paragraph with an inline image
    const paragraph = page.locator('#editor .md-line.md-paragraph');
    await expect(paragraph).toBeVisible();

    // Switch to source view
    await setSourceView(page);

    // Click on the line and move to beginning, then delete the '!'
    const srcLine = page.locator('#editor .md-line', { hasText: '![alt](url)' });
    await expect(srcLine).toBeVisible();
    await srcLine.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Delete');

    // Now the line should be [alt](url) — a link
    const updated = page.locator('#editor .md-line', { hasText: '[alt](url)' });
    await expect(updated).toBeVisible();

    // Switch to focused view — should render as a link, not an image
    await setFocusedView(page);
    const link = page.locator('#editor .md-line.md-paragraph a');
    await expect(link).toBeVisible();
    const noImg = page.locator('#editor .md-line.md-paragraph img.md-image-preview');
    await expect(noImg).toHaveCount(0);
});
