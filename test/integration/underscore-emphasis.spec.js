/**
 * @fileoverview Integration test for underscore emphasis (_italic_) support.
 * Verifies that `_text_` and `__text__` are rendered correctly in focused
 * mode: emphasis stripped when unfocused, raw syntax shown when focused.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    electronApp = await electron.launch({
        args: [path.join(projectRoot, 'src', 'main', 'main.js')],
    });
    page = await electronApp.firstWindow();

    await page.waitForFunction(() => document.readyState === 'complete');
    await electronApp.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win.isVisible()) {
            await new Promise((resolve) => win.once('show', resolve));
        }
    });
});

test.afterAll(async () => {
    await electronApp.close();
});

test('underscore emphasis _text_ is stripped in focused mode when unfocused', async () => {
    // Load a document with underscore emphasis in two paragraphs.
    const markdown = 'This has _italic_ text\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    // Switch to focused mode — cursor is on the first node by default.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // The first line IS focused, so it should show raw syntax with underscores.
    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('_italic_');

    // Click on the second paragraph to move focus away from the first.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    // Now the first line is unfocused — underscores should be stripped.
    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('italic');
    expect(unfocusedText).not.toContain('_italic_');
});

test('double underscore bold __text__ is stripped in focused mode when unfocused', async () => {
    // Load a document with double-underscore bold in two paragraphs.
    const markdown = 'This has __bold__ text\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    // Switch to focused mode — cursor is on the first node by default.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // The first line IS focused, so it should show raw syntax with underscores.
    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('__bold__');

    // Click on the second paragraph to move focus away from the first.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    // Now the first line is unfocused — double underscores should be stripped.
    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('bold');
    expect(unfocusedText).not.toContain('__bold__');
});
