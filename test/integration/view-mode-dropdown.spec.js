/**
 * @fileoverview Integration tests for the view-mode toggle button in the toolbar.
 * Verifies the toggle has a label, defaults to "Focused Writing", switches the
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

test('view mode toggle has a visible label', async () => {
    const label = page.locator('.toolbar-view-mode-label');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('View:');
});

test('view mode toggle defaults to Focused Writing', async () => {
    const toggle = page.locator('.toolbar-view-mode-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText('Focused Writing');
});

test('clicking toggle switches editor to source mode', async () => {
    // Load content so we have a heading to test against.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, readmeContent);

    const toggle = page.locator('.toolbar-view-mode-toggle');

    // Click to switch to source mode.
    await toggle.click();
    await page.waitForTimeout(200);

    await expect(toggle).toHaveText('Source View');

    // The editor's data-view-mode attribute should reflect the change.
    const editor = page.locator('#editor');
    await expect(editor).toHaveAttribute('data-view-mode', 'source');

    // In source mode, headings always show their `#` syntax.
    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('# Markdown Editor');
});

test('clicking toggle again switches editor back to focused mode', async () => {
    const toggle = page.locator('.toolbar-view-mode-toggle');

    // Click to switch back to focused mode.
    await toggle.click();
    await page.waitForTimeout(200);

    await expect(toggle).toHaveText('Focused Writing');

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

test('toggle stays in sync when view mode changes via menu', async () => {
    const toggle = page.locator('.toolbar-view-mode-toggle');

    // Start in focused mode from the previous test.
    await expect(toggle).toHaveText('Focused Writing');

    // Switch to source via the IPC (simulating a menu action).
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.waitForTimeout(200);

    // The toggle should reflect the new mode.
    await expect(toggle).toHaveText('Source View');

    // Switch back via IPC.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    await expect(toggle).toHaveText('Focused Writing');
});
