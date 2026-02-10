/**
 * @fileoverview Integration test for pressing Backspace at the start of the
 * paragraph that immediately follows a </details> closing tag.
 *
 * Loads test/fixtures/details.md and places the cursor at the beginning of
 * "And then this is the main doc again.".  In both source and focused view,
 * pressing Backspace once must NOT delete the entire line.
 *
 *  • Source view  – the paragraph is a top-level node whose previous sibling
 *    is an html-block container.  Backspace at offset 0 should be a no-op
 *    (there is nothing meaningful to merge into).
 *  • Focused view – Backspace at offset 0 should merge the paragraph into the
 *    last child of the preceding html-block (the "better" paragraph), so the
 *    result is "betterAnd then this is the main doc again."
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..', '..');
const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'details.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

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

test('source view: backspace at start of paragraph after </details> does not delete the line', async () => {
    // Load the fixture fresh.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, fixtureContent);
    await page.waitForTimeout(300);

    // Switch to source view.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.waitForTimeout(300);

    // Find the line that contains "And then this is the main doc again."
    const targetLine = page.locator('#editor .md-line', {
        hasText: 'And then this is the main doc again.',
    });
    // There may be a parent wrapper that also matches; narrow to the
    // innermost .md-line that has no .md-line children.
    const innerTarget = targetLine.locator(':scope:not(:has(.md-line))').first();
    await innerTarget.click();
    await page.waitForTimeout(100);

    // Move cursor to the very start of the line.
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Press Backspace.
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // The line must still exist with its full content.
    const afterLine = page.locator('#editor .md-line', {
        hasText: 'And then this is the main doc again.',
    });
    const count = await afterLine.locator(':scope:not(:has(.md-line))').count();
    expect(
        count,
        'paragraph should still exist after backspace in source view',
    ).toBeGreaterThanOrEqual(1);

    const text = await afterLine.locator(':scope:not(:has(.md-line))').first().innerText();
    expect(text).toContain('And then this is the main doc again.');
});

test('focused view: backspace at start of paragraph after </details> merges with last child inside details', async () => {
    // Reload the fixture fresh.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, fixtureContent);
    await page.waitForTimeout(300);

    // Make sure we're in focused view.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(300);

    // Click on "And then this is the main doc again."
    const targetLine = page.locator('#editor .md-line', {
        hasText: 'And then this is the main doc again.',
    });
    await targetLine.first().click();
    await page.waitForTimeout(100);

    // Move cursor to the very start.
    await page.keyboard.press('Home');
    await page.waitForTimeout(100);

    // Press Backspace — should merge into the "better" paragraph.
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // The merged text should now be "betterAnd then this is the main doc again."
    // located inside the <details> block.
    const mergedLine = page.locator('#editor details .md-line', {
        hasText: 'betterAnd then this is the main doc again.',
    });
    const mergedCount = await mergedLine.count();
    expect(mergedCount, 'merged line should exist inside details').toBe(1);

    // The standalone paragraph should no longer exist outside details.
    // Use :not(.md-html-block) to exclude the html-block wrapper whose
    // descendant text now includes the merged content.
    const standaloneLine = page.locator('#editor > .md-line:not(.md-html-block)', {
        hasText: 'And then this is the main doc again.',
    });
    const standaloneCount = await standaloneLine.count();
    expect(standaloneCount, 'standalone paragraph should be gone').toBe(0);
});
