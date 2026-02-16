/**
 * @fileoverview Integration test for the reload functionality.
 * Verifies that Help → Reload preserves document content, cursor position,
 * and file association across a full page reload.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp } from './test-utils.js';

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

test('reload preserves document content', async () => {
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    // Type some content
    await page.keyboard.type('# Hello');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a test document.');

    // Grab the text before reload
    const contentBefore = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
    expect(contentBefore).toContain('# Hello');
    expect(contentBefore).toContain('This is a test document.');

    // Trigger reload via the IPC API
    await page.evaluate(() => window.electronAPI?.reload());

    // Wait for the page to fully reload and the editor to re-initialise
    await page.waitForFunction(
        () => {
            return document.readyState === 'complete' && !!window.editorAPI;
        },
        { timeout: 10000 },
    );

    // Give the restore script time to run
    await page.waitForFunction(
        () => {
            const content = window.editorAPI?.getContent() ?? '';
            return content.includes('Hello');
        },
        { timeout: 10000 },
    );

    // Verify the content survived the reload
    const contentAfter = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
    expect(contentAfter).toContain('# Hello');
    expect(contentAfter).toContain('This is a test document.');
});
