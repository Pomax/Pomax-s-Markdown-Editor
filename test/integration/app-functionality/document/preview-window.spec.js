/**
 * @fileoverview Integration tests for the Preview window feature.
 *
 * Verifies that View → Preview opens a new window whose content is the
 * HTML representation of the current document, with script/style/link
 * tags rendered as real active elements.
 */

import { expect, test } from '@playwright/test';
import { closeApp, launchApp, loadContent } from '../../test-utils.js';

const fixture = [
    '# Preview Test',
    '',
    'A paragraph with **bold** and *italic*.',
    '',
    '- Item one',
    '- Item two',
    '',
    '<style>',
    'body { color: rgb(1, 2, 3); }',
    '</style>',
    '',
    '<script>',
    'window.__previewTestRan = true;',
    '</script>',
    '',
    '```js',
    'const x = 1;',
    '```',
].join('\n');

/**
 * Triggers the preview window from the renderer by calling the same
 * code path that the menu handler uses.
 * @param {import('@playwright/test').Page} page
 */
async function openPreview(page) {
    await page.evaluate(() => {
        const editor = /** @type {any} */ (window).__editor;
        const { head, body } = editor?.syntaxTree?.toHTML() ?? { head: '', body: '' };
        const filePath = editor?.currentFilePath ?? null;
        window.electronAPI?.openPreview(head, body, filePath);
    });
}

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

test('preview opens a new window with rendered HTML', async () => {
    await loadContent(page, fixture);
    await page.waitForTimeout(300);

    const windowsBefore = electronApp.windows().length;

    await openPreview(page);

    // Wait for the new window to appear
    await page.waitForTimeout(1500);
    const windowsAfter = electronApp.windows();
    expect(windowsAfter.length).toBeGreaterThan(windowsBefore);

    const previewPage = windowsAfter[windowsAfter.length - 1];
    await previewPage.waitForLoadState('domcontentloaded');

    // Verify the heading
    const h1Text = await previewPage.locator('h1').textContent();
    expect(h1Text).toBe('Preview Test');

    // Verify inline formatting
    const pHtml = await previewPage.locator('p').first().innerHTML();
    expect(pHtml).toContain('<strong>bold</strong>');
    expect(pHtml).toContain('<em>italic</em>');

    // Verify list items are wrapped in <ul>
    const listItems = await previewPage.locator('ul li').count();
    expect(listItems).toBe(2);

    // Verify code block
    const codeBlock = await previewPage.locator('pre code').textContent();
    expect(codeBlock).toContain('const x = 1;');

    await previewPage.close();
});

test('preview renders style tags as real active elements', async () => {
    await loadContent(page, fixture);
    await page.waitForTimeout(300);

    await openPreview(page);
    await page.waitForTimeout(1500);

    const windows = electronApp.windows();
    const previewPage = windows[windows.length - 1];
    await previewPage.waitForLoadState('domcontentloaded');

    const hasStyle = await previewPage.evaluate(() => {
        const styles = document.querySelectorAll('style');
        for (const s of styles) {
            if (s.textContent?.includes('color: rgb(1, 2, 3)')) {
                return true;
            }
        }
        return false;
    });
    expect(hasStyle).toBe(true);

    await previewPage.close();
});

test('preview renders script tags that execute', async () => {
    await loadContent(page, fixture);
    await page.waitForTimeout(300);

    await openPreview(page);
    await page.waitForTimeout(1500);

    const windows = electronApp.windows();
    const previewPage = windows[windows.length - 1];
    await previewPage.waitForLoadState('domcontentloaded');

    const scriptRan = await previewPage.evaluate(
        () => /** @type {any} */ (window).__previewTestRan === true,
    );
    expect(scriptRan).toBe(true);

    await previewPage.close();
});

test('scripts in preview cannot access the editor window', async () => {
    await loadContent(page, fixture);
    await page.waitForTimeout(300);

    await openPreview(page);
    await page.waitForTimeout(1500);

    const windows = electronApp.windows();
    const previewPage = windows[windows.length - 1];
    await previewPage.waitForLoadState('domcontentloaded');

    // The preview window should NOT have access to electronAPI
    const hasElectronAPI = await previewPage.evaluate(
        () => typeof (/** @type {any} */ (window).electronAPI) !== 'undefined',
    );
    expect(hasElectronAPI).toBe(false);

    // The script should NOT have set anything on the editor's window
    const mainWindowDirty = await page.evaluate(
        () => /** @type {any} */ (window).__previewTestRan === true,
    );
    expect(mainWindowDirty).toBe(false);

    await previewPage.close();
});
