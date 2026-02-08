/**
 * @fileoverview Integration tests for the view-mode dropdown in the toolbar.
 * Verifies the dropdown has a label, defaults to "Source", switches the
 * editor between source and focused modes, and stays in sync when the
 * view mode is changed externally via the menu/IPC.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..', '..');
const readmePath = path.join(projectRoot, 'README.md');
const readmeContent = fs.readFileSync(readmePath, 'utf-8');

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

test('view mode dropdown has a visible label', async () => {
    const label = page.locator('.toolbar-view-mode-label');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('View:');
});

test('view mode dropdown defaults to Focused', async () => {
    const select = page.locator('#view-mode-select');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('focused');
});

test('selecting Focused in dropdown switches editor to focused mode', async () => {
    // Load content so we have a heading to test against.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, readmeContent);

    const select = page.locator('#view-mode-select');

    // Switch to focused mode via the dropdown.
    await select.selectOption('focused');
    await page.waitForTimeout(200);

    // The editor's data-view-mode attribute should reflect the change.
    const editor = page.locator('#editor');
    await expect(editor).toHaveAttribute('data-view-mode', 'focused');

    // Click on the second line so the h1 is no longer focused.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    // In focused mode, unfocused headings hide their `#` syntax.
    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).not.toContain('#');
    expect(text).toContain('Markdown Editor');
});

test('selecting Source in dropdown switches editor back to source mode', async () => {
    const select = page.locator('#view-mode-select');

    // Switch back to source mode via the dropdown.
    await select.selectOption('source');
    await page.waitForTimeout(200);

    const editor = page.locator('#editor');
    await expect(editor).toHaveAttribute('data-view-mode', 'source');

    // In source mode, headings always show their `#` syntax.
    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('# Markdown Editor');
});

test('dropdown stays in sync when view mode changes via menu', async () => {
    const select = page.locator('#view-mode-select');

    // Start in source mode.
    await expect(select).toHaveValue('source');

    // Switch to focused via the IPC (simulating a menu action).
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // The dropdown should reflect the new mode.
    await expect(select).toHaveValue('focused');

    // Switch back via IPC.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.waitForTimeout(200);

    await expect(select).toHaveValue('source');
});
