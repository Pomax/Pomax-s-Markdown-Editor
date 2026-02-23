/**
 * @fileoverview Integration tests for cursor position while typing inline
 * delimiters in focused view.
 *
 * Verifies the fix for GitHub issue #44: typing `*`, `_`, `~~`, or
 * `<sub>` should leave the cursor immediately after the typed character,
 * not jump it backwards.
 */

import { expect, test } from '@playwright/test';
import { launchApp, loadContent, setFocusedView } from './test-utils.js';

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

/**
 * Types text into a fresh paragraph by loading empty content, clicking
 * the editor, then pressing each key individually.  Returns the cursor
 * offset (character position within the line) after all keys have been
 * typed.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {string} text - The text to type character by character
 * @returns {Promise<{cursorOffset: number, lineText: string}>}
 */
async function typeAndGetCursor(pg, text) {
    await loadContent(pg, '');
    await setFocusedView(pg);

    // Click the editor to focus it.
    const editor = pg.locator('#editor');
    await editor.click();
    await pg.waitForTimeout(100);

    // Type each character individually so the editor processes each keystroke.
    for (const ch of text) {
        await pg.keyboard.press(ch);
        await pg.waitForTimeout(50);
    }
    await pg.waitForTimeout(100);

    // Read the cursor position and line text content from the DOM.
    const result = await pg.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;

        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const offset = range.startOffset;

        // Walk up to find the .md-line element
        let el = node instanceof HTMLElement ? node : node.parentElement;
        while (el && !el.classList?.contains('md-line')) {
            el = el.parentElement;
        }
        if (!el) return null;

        // Compute the character offset from the start of the line's
        // text content up to the cursor position.
        const contentEl = el.querySelector('.md-content') ?? el;
        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
        let charOffset = 0;
        let textNode = walker.nextNode();
        while (textNode) {
            if (textNode === node) {
                charOffset += offset;
                break;
            }
            charOffset += textNode.textContent?.length ?? 0;
            textNode = walker.nextNode();
        }

        return {
            cursorOffset: charOffset,
            lineText: contentEl.textContent || '',
        };
    });

    return result ?? { cursorOffset: -1, lineText: '' };
}

test('cursor stays after * when typing "this is a *"', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, 'this is a *');
    expect(lineText).toContain('this is a *');
    expect(cursorOffset).toBe(lineText.length);
});

test('cursor stays after _ when typing "this is a _"', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, 'this is a _');
    expect(lineText).toContain('this is a _');
    expect(cursorOffset).toBe(lineText.length);
});

test('cursor stays after ~~ when typing "this is a ~~"', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, 'this is a ~~');
    expect(lineText).toContain('this is a ~~');
    expect(cursorOffset).toBe(lineText.length);
});

test('cursor stays after < when typing "<sub>"', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, '<sub>');
    expect(lineText).toContain('<sub>');
    expect(cursorOffset).toBe(lineText.length);
});

test('cursor stays correct when completing bold **text**', async () => {
    // Type the full sequence: **bold** — cursor should track correctly
    // through both matched delimiters.
    const { cursorOffset, lineText } = await typeAndGetCursor(page, '**bold**');
    // After the closing **, the rendered text is just "bold" and cursor
    // should be at the end of the visible text.
    expect(lineText).toBe('bold');
    expect(cursorOffset).toBe(4);
});

test('cursor stays correct when completing italic *text*', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, '*italic*');
    expect(lineText).toBe('italic');
    expect(cursorOffset).toBe(6);
});

test('cursor stays correct when completing bold+italic ***text***', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, '***word***');
    // After the closing ***, the rendered text is just "word" and cursor
    // should be at the end of the visible text.
    expect(lineText).toBe('word');
    expect(cursorOffset).toBe(4);
});

test('typing ***word*** renders as bold inside italic in source view', async () => {
    await loadContent(page, '');
    await setFocusedView(page);
    const editor = page.locator('#editor');
    await editor.click();
    await page.waitForTimeout(100);

    for (const ch of 'test ***word***') {
        await page.keyboard.press(ch === ' ' ? 'Space' : ch);
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    const { setSourceView } = await import('./test-utils.js');
    await setSourceView(page);
    const srcLine = page.locator('#editor .md-line').first();
    const srcText = await srcLine.textContent();
    expect(srcText).toContain('***word***');
});

test('typing **** is treated as plain text', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, 'test ****');
    expect(lineText).toContain('****');
    expect(cursorOffset).toBe(lineText.length);
});

test('typing after closing * produces plain text, not italic', async () => {
    // Type "this is a *test*" then type " hello"
    // The " hello" must NOT be inside the <em> — it should be plain text.
    await loadContent(page, '');
    await setFocusedView(page);
    const editor = page.locator('#editor');
    await editor.click();
    await page.waitForTimeout(100);

    for (const ch of 'this is a *test*') {
        await page.keyboard.press(ch);
        await page.waitForTimeout(50);
    }
    // Now type " hello" after the closing *
    for (const ch of ' hello') {
        await page.keyboard.press(ch === ' ' ? 'Space' : ch);
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    // Switch to source view to check the raw markdown
    const { setSourceView } = await import('./test-utils.js');
    await setSourceView(page);
    const srcLine = page.locator('#editor .md-line').first();
    const srcText = await srcLine.textContent();
    // The raw markdown should have " hello" outside the italic markers
    expect(srcText).toContain('*test*');
    expect(srcText).toContain(' hello');
    // " hello" must come after the closing *, not inside *...*
    expect(srcText).toMatch(/\*test\* hello/);
});

test('typing after closing ** produces plain text, not bold', async () => {
    await loadContent(page, '');
    await setFocusedView(page);
    const editor = page.locator('#editor');
    await editor.click();
    await page.waitForTimeout(100);

    for (const ch of '**bold**') {
        await page.keyboard.press(ch);
        await page.waitForTimeout(50);
    }
    for (const ch of ' after') {
        await page.keyboard.press(ch === ' ' ? 'Space' : ch);
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    const { setSourceView } = await import('./test-utils.js');
    await setSourceView(page);
    const srcLine = page.locator('#editor .md-line').first();
    const srcText = await srcLine.textContent();
    expect(srcText).toMatch(/\*\*bold\*\* after/);
});

test('typing after closing ~~ produces plain text, not strikethrough', async () => {
    await loadContent(page, '');
    await setFocusedView(page);
    const editor = page.locator('#editor');
    await editor.click();
    await page.waitForTimeout(100);

    for (const ch of '~~struck~~') {
        await page.keyboard.press(ch);
        await page.waitForTimeout(50);
    }
    for (const ch of ' after') {
        await page.keyboard.press(ch === ' ' ? 'Space' : ch);
        await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    const { setSourceView } = await import('./test-utils.js');
    await setSourceView(page);
    const srcLine = page.locator('#editor .md-line').first();
    const srcText = await srcLine.textContent();
    expect(srcText).toMatch(/~~struck~~ after/);
});

test('typing ***word*** produces bold-in-italic, not raw asterisks', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, '***word***');
    // In focused view the delimiters are invisible, so the rendered
    // text should just be "word".
    expect(lineText).toBe('word');
    expect(cursorOffset).toBe(4);
});

test('typing **** produces plain text (nonsense delimiter)', async () => {
    const { cursorOffset, lineText } = await typeAndGetCursor(page, 'test ****');
    expect(lineText).toContain('test ****');
    expect(cursorOffset).toBe(lineText.length);
});
