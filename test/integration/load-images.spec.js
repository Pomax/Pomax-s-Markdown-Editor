/**
 * @fileoverview Integration test for loading a real markdown file with images.
 * Launches the editor with a CLI file path argument, waits for the document
 * to load, and verifies that the referenced images actually load.
 */

import { expect, test } from '@playwright/test';
import { launchApp } from './test-utils.js';

const testFile = 'c:\\Users\\Mike\\Documents\\git\\released\\are-we-flying\\docs\\index.md';

test('images in a loaded markdown file resolve and load successfully', async () => {
    // Give CI runners extra time for image loading.
    test.setTimeout(60_000);

    const { electronApp, page } = await launchApp([testFile]);

    // Wait for the editor to finish rendering the loaded document.
    await page.waitForSelector('#editor .md-line');

    // The app defaults to focused mode, so unfocused image nodes render
    // as <img class="md-image-preview"> elements.  Wait for at least one
    // to appear (the document has many images).
    const images = page.locator('img.md-image-preview');
    await expect(images.first()).toBeVisible({ timeout: 10_000 });

    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    // Wait for every image to finish loading (or erroring) before we
    // check naturalWidth — images loaded via file:// still need time.
    await page.evaluate(() =>
        Promise.all(
            [...document.querySelectorAll('img.md-image-preview')].map((img) =>
                /** @type {HTMLImageElement} */ (img).complete
                    ? Promise.resolve()
                    : new Promise((r) => {
                          img.addEventListener('load', r, { once: true });
                          img.addEventListener('error', r, { once: true });
                      }),
            ),
        ),
    );

    // Verify every rendered image actually loaded (naturalWidth > 0).
    for (let i = 0; i < count; i++) {
        const naturalWidth = await images
            .nth(i)
            .evaluate((/** @type {HTMLImageElement} */ img) => img.naturalWidth);
        const src = await images.nth(i).getAttribute('src');
        expect(naturalWidth, `image "${src}" should have loaded`).toBeGreaterThan(0);
    }

    await electronApp.close();
});
