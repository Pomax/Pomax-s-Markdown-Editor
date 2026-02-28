/**
 * @fileoverview Integration tests for the view-mode toggle button in the toolbar.
 * Verifies the toggle has a label, defaults to "Writing View", switches the
 * editor between source and writing modes, and stays in sync when the
 * view mode is changed externally via the menu/IPC.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
    clickQuerySelector,
    closeApp,
    defocusEditor,
    launchApp,
    loadContent,
    projectRoot,
    setSourceView,
} from '../../test-utils.js';

const readmePath = path.join(projectRoot, 'README.md');
const readmeContent = fs.readFileSync(readmePath, 'utf-8');

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

test('view mode toggle has a visible label', async () => {
    const label = page.locator('.toolbar-view-mode-label');
    await expect(label).toBeVisible();
    await expect(label).toHaveText('View:');
});

test('view mode toggle defaults to Writing View', async () => {
    const toggle = page.locator('.toolbar-view-mode-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText('Writing View');
});

test('clicking toggle switches editor to source mode', async () => {
    // Load content so we have a heading to test against.
    await loadContent(page, readmeContent);

    const toggle = page.locator('.toolbar-view-mode-toggle');

    // Click to switch to source mode.
    await clickQuerySelector(page, '.toolbar-view-mode-toggle');

    await expect(toggle).toHaveText('Source View');

    // The editor's data-view-mode attribute should reflect the change.
    const editor = page.locator('#editor');
    await expect(editor).toHaveAttribute('data-view-mode', 'source');

    // In source mode, headings always show their `#` syntax.
    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain("# Pomax's Markdown Editor");
});

test('clicking toggle again switches editor back to writing mode', async () => {
    // Set up: load content and switch to source mode first.
    await loadContent(page, readmeContent);
    const toggle = page.locator('.toolbar-view-mode-toggle');
    await setSourceView(page);

    // Click to switch back to writing mode.
    await clickQuerySelector(page, '.toolbar-view-mode-toggle');

    await expect(toggle).toHaveText('Writing View');

    const editor = page.locator('#editor');
    await expect(editor).toHaveAttribute('data-view-mode', 'writing');

    // Defocus the editor so no node is focused.
    await defocusEditor(page);

    // In writing mode, unfocused headings hide their `#` syntax.
    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).not.toContain('#');
    expect(text).toContain("Pomax's Markdown Editor");
});

test('toggle stays in sync when view mode changes via menu', async () => {
    const toggle = page.locator('.toolbar-view-mode-toggle');

    // Set up: ensure we start in writing mode.
    await page.evaluate(() => window.editorAPI?.setViewMode('writing'));
    await page.locator('#editor[data-view-mode="writing"]').waitFor();
    await expect(toggle).toHaveText('Writing View');

    // Switch to source programmatically (simulating a menu action).
    await page.evaluate(() => window.editorAPI?.setViewMode('source'));
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    // The toggle should reflect the new mode.
    await expect(toggle).toHaveText('Source View');

    // Switch back programmatically.
    await page.evaluate(() => window.editorAPI?.setViewMode('writing'));
    await page.locator('#editor[data-view-mode="writing"]').waitFor();

    await expect(toggle).toHaveText('Writing View');
});
