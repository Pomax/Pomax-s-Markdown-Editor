/**
 * @fileoverview Integration test for clicking outside the editor to defocus.
 *
 * In writing mode all nodes render as WYSIWYG (formatted output, no
 * raw markdown syntax).  When the user clicks outside the editor the editor
 * should blur (handleBlur fires) and clear its active node.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    defocusEditor,
    launchApp,
    loadContent,
    setSourceView,
    setWritingView,
} from './test-utils.js';

const markdown = '# My Heading\n\nA paragraph of text.';

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

test('loading content gives the editor DOM focus so defocus works without a prior click', async () => {
    // This simulates the startup scenario: the app restores a file via
    // loadMarkdown, which sets the treeCursor to the first node and
    // renders.  Without an explicit container.focus() in loadMarkdown,
    // the first node *looks* focused but the editor never received real
    // DOM focus — so blurring would be a no-op.
    await loadContent(page, markdown);
    await setWritingView(page);

    // Verify the editor has actual DOM focus (not just a visual cursor).
    const hasFocus = await page.evaluate(() => {
        return document.activeElement === document.querySelector('#editor');
    });
    expect(hasFocus, 'editor should have DOM focus after loadContent').toBe(true);

    // In WYSIWYG mode the heading never shows the raw `#` prefix.
    const heading = page.locator('#editor .md-line').first();
    const focusedText = await heading.innerText();
    expect(focusedText).not.toContain('#');
    expect(focusedText).toContain('My Heading');

    // Blur — this must actually fire handleBlur because the editor
    // had real focus.  The heading should still show formatted text.
    await defocusEditor(page);

    const defocusedText = await page.locator('#editor .md-line').first().innerText();
    expect(defocusedText).not.toContain('#');
    expect(defocusedText).toContain('My Heading');
});

test('clicking outside the editor hides active-node highlight in writing mode', async () => {
    // Load content and switch to writing view.
    await loadContent(page, markdown);
    await setWritingView(page);

    // Click on the heading to make it the active node.
    const heading = page.locator('#editor .md-line').first();
    await clickInEditor(page, heading);
    await page.waitForTimeout(200);

    // In WYSIWYG mode the heading shows formatted text, not raw syntax.
    const focusedText = await heading.innerText();
    expect(focusedText).not.toContain('#');
    expect(focusedText).toContain('My Heading');

    // The heading should have the md-focused class.
    await expect(heading).toHaveClass(/md-focused/);

    // Click outside the editor (the editor-container background).
    await defocusEditor(page);

    // After defocus no node should carry the md-focused class.
    const focusedNodes = page.locator('#editor .md-focused');
    expect(await focusedNodes.count()).toBe(0);

    // The heading should still show its formatted text.
    const firstLine = page.locator('#editor .md-line').first();
    const defocusedText = await firstLine.innerText();
    expect(defocusedText).not.toContain('#');
    expect(defocusedText).toContain('My Heading');
});

test('clicking back into the editor after defocus restores cursor', async () => {
    // Set up: load content, switch to writing view, and defocus.
    await loadContent(page, markdown);
    await setWritingView(page);
    await defocusEditor(page);

    // Click on the paragraph (second line) to re-focus.
    const paragraph = page.locator('#editor .md-line').nth(1);
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);

    // The paragraph should now be the active node.  The heading (first
    // line) should still be unfocused and hide its `#` prefix.
    const headingText = await page.locator('#editor .md-line').first().innerText();
    expect(headingText).not.toContain('#');
    expect(headingText).toContain('My Heading');

    // The paragraph should show its content (no special syntax to hide).
    const paraText = await paragraph.innerText();
    expect(paraText).toContain('A paragraph of text.');
});

test('defocus is a no-op in source view', async () => {
    // Set up: load content and switch to source view.
    await loadContent(page, markdown);
    await setSourceView(page);

    // Click the heading to place the cursor there.
    const heading = page.locator('#editor .md-line').first();
    await clickInEditor(page, heading);
    await page.waitForTimeout(200);

    // In source view, headings always show `#` regardless of focus.
    const beforeText = await heading.innerText();
    expect(beforeText).toContain('# My Heading');

    // Blur the editor.
    await defocusEditor(page);

    // The `#` should still be visible — source view never hides syntax.
    const afterText = await page.locator('#editor .md-line').first().innerText();
    expect(afterText).toContain('# My Heading');
});
