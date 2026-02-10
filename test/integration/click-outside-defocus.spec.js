/**
 * @fileoverview Integration test for clicking outside the editor to defocus.
 *
 * In focused writing mode the active node shows raw markdown syntax (e.g. a
 * heading displays its `#` prefix).  When the user clicks outside the editor
 * element — for example on the background area around the page — the editor
 * should blur, clear its active node, and re-render so that every node shows
 * its "unfocused" presentation.
 */

import { expect, test } from '@playwright/test';
import { defocusEditor, launchApp, loadContent } from './test-utils.js';

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
    // DOM focus — so blurring would be a no-op and the heading would
    // keep showing its `#` syntax.
    await loadContent(page, markdown);
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    // Verify the editor has actual DOM focus (not just a visual cursor).
    const hasFocus = await page.evaluate(() => {
        return document.activeElement === document.querySelector('#editor');
    });
    expect(hasFocus, 'editor should have DOM focus after loadContent').toBe(true);

    // The first node (the heading) should show raw `#` syntax.
    const heading = page.locator('#editor .md-line').first();
    const focusedText = await heading.innerText();
    expect(focusedText).toContain('# My Heading');

    // Now blur — this must actually fire handleBlur because the editor
    // had real focus.  If container.focus() were missing from
    // loadMarkdown, this defocus would be a no-op and the assertion
    // below would fail.
    await defocusEditor(page);

    const defocusedText = await page.locator('#editor .md-line').first().innerText();
    expect(defocusedText).not.toContain('#');
    expect(defocusedText).toContain('My Heading');
});

test('clicking outside the editor hides heading syntax in focused mode', async () => {
    // Load content and switch to focused view.
    await loadContent(page, markdown);
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    // Click on the heading to make it the active node.
    const heading = page.locator('#editor .md-line').first();
    await heading.click();
    await page.waitForTimeout(200);

    // The heading should show its raw `#` syntax because it is focused.
    const focusedText = await heading.innerText();
    expect(focusedText).toContain('# My Heading');

    // Click outside the editor (the editor-container background).
    await defocusEditor(page);

    // The heading should now hide its `#` prefix.
    const firstLine = page.locator('#editor .md-line').first();
    const defocusedText = await firstLine.innerText();
    expect(defocusedText).not.toContain('#');
    expect(defocusedText).toContain('My Heading');
});

test('clicking back into the editor after defocus restores cursor', async () => {
    // The editor should currently be blurred from the previous test.
    // Click on the paragraph (second line) to re-focus.
    const paragraph = page.locator('#editor .md-line').nth(1);
    await paragraph.click();
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
    // Switch to source view.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    // Click the heading to place the cursor there.
    const heading = page.locator('#editor .md-line').first();
    await heading.click();
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
