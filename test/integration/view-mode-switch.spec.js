/**
 * @fileoverview Integration test for switching between source and focused view modes.
 * Loads the project README.md, which places the cursor on the main h1,
 * then switches to focused writing mode and verifies that the heading
 * no longer shows the markdown `#` syntax prefix.
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

test('switching to focused mode hides heading syntax on unfocused headings', async () => {
    // Load the README.md content into the editor.
    // loadMarkdown places the cursor on the first node (the h1).
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, readmeContent);

    // Sanity-check: in source view the first line should contain the `#` prefix.
    const firstLineSource = page.locator('#editor .md-line').first();
    const sourceText = await firstLineSource.innerText();
    expect(sourceText).toContain("# Pomax's Markdown Editor");

    // Switch to focused writing mode via the menu action IPC.
    // The cursor is on the h1 (set by loadMarkdown), so the h1 IS the focused
    // node and SHOULD still show the `#` prefix.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    const firstLineFocusedOnH1 = page.locator('#editor .md-line').first();
    const focusedOnH1Text = await firstLineFocusedOnH1.innerText();
    expect(focusedOnH1Text).toContain("# Pomax's Markdown Editor");

    // The second line (a paragraph) should NOT show any source syntax.
    const secondLineFocused = page.locator('#editor .md-line').nth(1);
    const secondLineFocusedText = await secondLineFocused.innerText();
    expect(secondLineFocusedText).not.toContain('#');

    // Now click on the second line so the h1 is no longer focused.
    await secondLineFocused.click();
    await page.waitForTimeout(200);

    // The first line (h1 "Markdown Editor") should NOT contain the `#` prefix
    // because it is not the focused node in focused writing mode.
    const firstLineAfterClick = page.locator('#editor .md-line').first();
    const afterClickText = await firstLineAfterClick.innerText();

    expect(afterClickText).not.toContain('#');
    expect(afterClickText).toContain("Pomax's Markdown Editor");

    // Switch back to source view — all headings must show their `#` prefixes.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.waitForTimeout(200);

    const firstLineBackToSource = page.locator('#editor .md-line').first();
    const backToSourceText = await firstLineBackToSource.innerText();

    expect(backToSourceText).toContain("# Pomax's Markdown Editor");
});
