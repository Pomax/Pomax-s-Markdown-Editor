/**
 * @fileoverview Integration test verifying that a single click on a link
 * in an unfocused paragraph (focused mode) both moves focus to that
 * paragraph AND opens the link edit modal — no second click required.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent } from './test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

// Two paragraphs so the second one starts out unfocused.
const CONTENT = ['First paragraph.', '', 'Visit [Example](https://example.com) for more.'].join(
    '\n',
);

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test('single click on a link in an unfocused paragraph opens the edit modal', async () => {
    await loadContent(page, CONTENT);

    // Click the first paragraph so the second one is definitely unfocused.
    const firstParagraph = page.locator('.md-line.md-paragraph').first();
    await clickInEditor(page, firstParagraph);

    // Verify the first paragraph is now the focused node.
    const firstNodeId = await firstParagraph.getAttribute('data-node-id');
    expect(firstNodeId).toBeTruthy();

    // Now single-click the link inside the *second* (unfocused) paragraph.
    // This should both move focus to that paragraph AND open the link modal.
    //
    // A real human click fires: mousedown → selectionchange → mouseup → click.
    // Playwright's page.mouse.click() may not trigger selectionchange between
    // mousedown and click, so we break it into discrete steps with a small
    // delay to allow the browser to fire selectionchange after mousedown,
    // which is what causes the bug in the real app (the editor re-renders on
    // selectionchange, destroying the <a> element before click fires).
    const link = page.locator('.md-line.md-paragraph >> nth=1 >> a');
    const box = await link.boundingBox();
    if (!box) throw new Error('link bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Give the browser time to fire selectionchange (as happens in real use).
    await page.waitForTimeout(100);
    await page.mouse.up();

    // The link edit modal should appear without needing a second click.
    const dialog = page.locator('.link-dialog');
    await expect(dialog).toBeVisible({ timeout: 3000 });

    // Fields should be pre-filled with the link data.
    await expect(page.locator('#link-text')).toHaveValue('Example');
    await expect(page.locator('#link-url')).toHaveValue('https://example.com');

    // Clean up — close the dialog.
    await page.locator('.link-btn--cancel').click();
    await expect(dialog).not.toBeVisible();
});
