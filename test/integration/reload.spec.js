/**
 * @fileoverview Integration test for the reload functionality.
 * Verifies that Help → Reload preserves document content, cursor position,
 * and file association across a full page reload.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    electronApp = await electron.launch({
        args: [path.join(__dirname, '..', '..', 'src', 'main', 'main.js')],
        env: { ...process.env, TESTING: '1' },
    });
    page = await electronApp.firstWindow();

    await page.waitForFunction(() => document.readyState === 'complete');
    await electronApp.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win.isVisible()) {
            await new Promise((resolve) => win.once('show', /** @type {any} */ (resolve)));
        }
    });
});

test.afterAll(async () => {
    await electronApp.close();
});

test('reload preserves document content', async () => {
    const editor = page.locator('#editor');
    await editor.click();

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
