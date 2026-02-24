/**
 * @fileoverview Integration test for the trailing-paragraph invariant.
 *
 * When a document ends with a `</details>` html-block, the user has no way
 * to place the cursor after it in writing mode.  The editor must
 * automatically append an empty paragraph so the user can "escape" the
 * details block.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent, setWritingView } from './test-utils.js';

const isMac = process.platform === 'darwin';
const Home = isMac ? 'Meta+ArrowLeft' : 'Home';
const End = isMac ? 'Meta+ArrowRight' : 'End';

/** A tiny document that ends with </details>. */
const markdownEndingInDetails =
    '# Title\n\n<details>\n\n<summary>Summary</summary>\n\nbody\n\n</details>';

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

test('loading a document that ends in </details> appends an empty paragraph', async () => {
    await loadContent(page, markdownEndingInDetails);
    await setWritingView(page);

    // The tree should have an extra empty paragraph after the details block.
    // We can't rely on getContent() because an empty paragraph serialises
    // to nothing, so instead check the DOM: the last top-level .md-line
    // should be an empty paragraph, not the html-block.
    const lastLine = page.locator('#editor > .md-line').last();
    const classList = await lastLine.evaluate((el) => [...el.classList]);
    expect(classList).not.toContain('md-html-block');

    // And it should be empty (no visible text).
    const text = await lastLine.innerText();
    expect(text.trim()).toBe('');
});

test('deleting all content after </details> re-creates the trailing paragraph', async () => {
    // Load a document with content after </details>.
    const markdown =
        '<details>\n\n<summary>Summary</summary>\n\nbody\n\n</details>\n\nTrailing text';
    await loadContent(page, markdown);
    await setWritingView(page);

    // Click on the trailing paragraph and select all its text.
    const trailingLine = page.locator('#editor > .md-line:not(.md-html-block)').last();
    await clickInEditor(page, trailingLine);
    await page.waitForTimeout(200);

    // Select all text in the line and delete it.
    await page.keyboard.press(Home);
    await page.keyboard.press(`Shift+${End}`);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Now the trailing paragraph is empty.  Press Backspace again to
    // try to merge it into the details block.
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // The invariant should have re-created an empty trailing paragraph,
    // so the document still has a node after the details block.
    const lastLine = page.locator('#editor > .md-line').last();
    const classList = await lastLine.evaluate((el) => [...el.classList]);
    // It should NOT be the html-block — it should be a paragraph.
    expect(classList).not.toContain('md-html-block');
});

test('user can type in the auto-created trailing paragraph', async () => {
    // Set up: load a document ending in </details> so the editor creates
    // a trailing empty paragraph, then switch to writing view.
    await loadContent(page, markdownEndingInDetails);
    await setWritingView(page);

    // Click the trailing empty paragraph to place the cursor there.
    const trailingPara = page.locator('#editor > .md-line:not(.md-html-block)').last();
    await clickInEditor(page, trailingPara);
    await page.waitForTimeout(200);

    await page.keyboard.type('New content after details');
    await page.waitForTimeout(200);

    const content = await page.evaluate(() => window.editorAPI?.getContent());
    expect(content).toContain('New content after details');

    // The new text should be after the </details> in the serialised markdown.
    const detailsEnd = content?.indexOf('</details>') ?? -1;
    const newText = content?.indexOf('New content after details') ?? -1;
    expect(detailsEnd).toBeGreaterThan(-1);
    expect(newText).toBeGreaterThan(detailsEnd);
});
