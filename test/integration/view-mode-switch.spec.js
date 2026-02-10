/**
 * @fileoverview Integration test for switching between source and focused view modes.
 * Loads the project README.md, which places the cursor on the main h1,
 * then switches to focused writing mode and verifies that the heading
 * no longer shows the markdown `#` syntax prefix.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { defocusEditor, launchApp, loadContent, projectRoot } from './test-utils.js';

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
    await electronApp.close();
});

test('switching to focused mode hides heading syntax on unfocused headings', async () => {
    // Load the README.md content into the editor.
    // loadMarkdown places the cursor on the first node (the h1).
    await loadContent(page, readmeContent);

    // Sanity-check: in source view the first line should contain the `#` prefix.
    const firstLineSource = page.locator('#editor .md-line').first();
    const sourceText = await firstLineSource.innerText();
    expect(sourceText).toContain("# Pomax's Markdown Editor");

    // Switch to focused writing mode via the menu action IPC.
    // The cursor is on the h1 (set by loadMarkdown), so the h1 IS the focused
    // node and SHOULD still show the `#` prefix.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    const firstLineFocusedOnH1 = page.locator('#editor .md-line').first();
    const focusedOnH1Text = await firstLineFocusedOnH1.innerText();
    expect(focusedOnH1Text).toContain("# Pomax's Markdown Editor");

    // The second line (a paragraph) should NOT show any source syntax.
    const secondLineFocused = page.locator('#editor .md-line').nth(1);
    const secondLineFocusedText = await secondLineFocused.innerText();
    expect(secondLineFocusedText).not.toContain('#');

    // Now defocus the editor so no node is focused, then verify.
    await defocusEditor(page);

    // The first line (h1 "Markdown Editor") should NOT contain the `#` prefix
    // because it is not the focused node in focused writing mode.
    const firstLineAfterClick = page.locator('#editor .md-line').first();
    const afterClickText = await firstLineAfterClick.innerText();

    expect(afterClickText).not.toContain('#');
    expect(afterClickText).toContain("Pomax's Markdown Editor");

    // Switch back to source view — all headings must show their `#` prefixes.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    const firstLineBackToSource = page.locator('#editor .md-line').first();
    const backToSourceText = await firstLineBackToSource.innerText();

    expect(backToSourceText).toContain("# Pomax's Markdown Editor");
});
