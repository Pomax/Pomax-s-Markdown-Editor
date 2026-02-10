/**
 * @fileoverview Integration test for editing a summary line in source view.
 * Loads test/fixtures/details.md, clicks on the summary text to place the
 * cursor, switches to source view, and types a single character.  The
 * expected result is that the character is inserted into the content without
 * the line being rewritten or exploded into multiple lines.
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

    // Load the details fixture content into the editor.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, fixtureContent);
    await page.waitForTimeout(300);
});

test.afterAll(async () => {
    await electronApp.close();
});

test('typing a character on the summary line in source view inserts it without rewriting the line', async () => {
    // Step 1: click on the summary text in focused view to position the cursor.
    const summaryParagraph = page.locator('#editor .md-details-summary-content .md-paragraph');
    await summaryParagraph.click();
    await page.waitForTimeout(200);

    // Step 2: move the cursor to the end of the summary text.
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Step 3: switch to source view.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.waitForTimeout(300);

    // The summary should be rendered as a single line in source view.
    // The bareText path renders it as a .md-paragraph (not .md-html-block)
    // with .md-html-tag syntax spans.  Use a precise selector so we don't
    // also match the outer html-block container that wraps it.
    const summaryLine = page.locator('#editor .md-line.md-paragraph:has(.md-html-tag)');
    const lineCountBefore = await summaryLine.count();
    expect(lineCountBefore, 'should have exactly one summary line before edit').toBe(1);

    const textBefore = await summaryLine.innerText();
    expect(textBefore).toContain('<summary>');
    expect(textBefore).toContain('</summary>');
    expect(textBefore).toContain('This is a paragraph');

    // Step 4: click on the summary line to place the cursor there, then End.
    await summaryLine.click();
    await page.waitForTimeout(100);

    // Position cursor at the end of the content (before </summary>).
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Press left-arrow past the closing </summary> tag to land inside
    // the editable content area.  Then type a single character.
    for (let i = 0; i < '</summary>'.length; i++) {
        await page.keyboard.press('ArrowLeft');
    }
    await page.waitForTimeout(100);

    // Step 5: type a single character.
    await page.keyboard.type('X');
    await page.waitForTimeout(300);

    // Step 6: verify the summary line still exists as a single line.
    const summaryLineAfter = page.locator('#editor .md-line.md-paragraph:has(.md-html-tag)');
    const lineCountAfter = await summaryLineAfter.count();
    expect(lineCountAfter, 'should still have exactly one summary line after edit').toBe(1);

    // The content should now include the typed character.
    const textAfter = await summaryLineAfter.innerText();
    expect(textAfter).toContain('<summary>');
    expect(textAfter).toContain('</summary>');
    expect(textAfter).toContain('This is a paragraphX');
});
