/**
 * @fileoverview Integration tests for the toolbar bold button.
 *
 * Covers the four problems from GitHub issue #26:
 *   1. Bold first word in first paragraph, then toggle off
 *   2. Bold middle word in first paragraph (correct placement, no trailing space)
 *   3. Bold first word in second paragraph (should not affect first paragraph)
 *   4. Bold middle word in second paragraph (should apply to correct node)
 *
 * All tests use writing view, double-click a word, press the bold button,
 * then switch to source view to verify the raw markdown.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
    launchApp,
    loadContent,
    projectRoot,
    setSourceView,
    setWritingView,
} from './test-utils.js';

const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'bold-button.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

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
 * Double-click a word in the editor to select it.  Uses real mouse
 * coordinates so the full event sequence fires (mousedown →
 * selectionchange → mouseup → click → dblclick).
 *
 * @param {import('@playwright/test').Page} pg
 * @param {import('@playwright/test').Locator} lineLocator
 * @param {string} word - The word to target (used to compute the x offset)
 * @param {'first'|'middle'|'last'} which - Which occurrence to click
 */
async function dblclickWord(pg, lineLocator, word, which = 'first') {
    // Use the DOM Range API to get the exact pixel coordinates of the
    // target word.  This avoids the unreliable "fraction of box width"
    // approach — .md-line is a block element that fills the full editor
    // width, so box.width has no relation to text length.
    const coords = await lineLocator.evaluate(
        (el, args) => {
            const [targetWord, occurrence] = args;
            const text = el.textContent || '';

            let startIdx;
            if (occurrence === 'first') {
                startIdx = text.indexOf(targetWord);
            } else if (occurrence === 'middle') {
                const firstEnd = text.indexOf(targetWord) + targetWord.length;
                startIdx = text.indexOf(targetWord, firstEnd);
            } else {
                startIdx = text.lastIndexOf(targetWord);
            }
            if (startIdx === -1) return null;

            // Walk text nodes to find the one containing startIdx.
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let node = walker.nextNode();
            while (node) {
                const nodeLen = node.textContent?.length ?? 0;
                if (offset + nodeLen > startIdx) {
                    const localMid = startIdx - offset + Math.floor(targetWord.length / 2);
                    const range = document.createRange();
                    range.setStart(node, localMid);
                    range.setEnd(node, Math.min(localMid + 1, nodeLen));
                    const rect = range.getBoundingClientRect();
                    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                }
                offset += nodeLen;
                node = walker.nextNode();
            }
            return null;
        },
        [word, which],
    );

    if (!coords) throw new Error(`dblclickWord: could not find "${word}" (${which})`);

    await pg.mouse.dblclick(coords.x, coords.y);
    // Let selectionchange fire and syncCursorFromDOM settle.
    await pg.waitForTimeout(200);
}

/**
 * Click the bold toolbar button.
 * @param {import('@playwright/test').Page} pg
 */
async function clickBoldButton(pg) {
    await pg.locator('[data-button-id="bold"]').click();
    // Let the render settle.
    await pg.waitForTimeout(200);
}

/**
 * Returns the raw markdown text of a specific line in source view.
 * @param {import('@playwright/test').Page} pg
 * @param {number} index - 0-based line index among .md-line elements.
 * @returns {Promise<string>}
 */
async function getSourceLineText(pg, index) {
    return pg.locator('#editor .md-line').nth(index).innerText();
}

// ─── Problem 1: bold first word, paragraph 1, then toggle off ───────

test.describe('Problem 1 — bold first word, toggle off', () => {
    test('bolding first word produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'first');
        await clickBoldButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('**text1** text1 text1');
    });

    test('toggling bold off restores plain text', async () => {
        // Content after previous test: first line is "**text1** text1 text1"
        // Reload and apply bold, then toggle off.
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        // Apply bold to first word.
        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'first');
        await clickBoldButton(page);

        // Now dblclick the bolded word and un-bold it.
        const firstLineAgain = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLineAgain, 'text1', 'first');
        await clickBoldButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 text1 text1');
    });
});

// ─── Problem 2: bold middle word, paragraph 1 ──────────────────────

test.describe('Problem 2 — bold middle word, paragraph 1', () => {
    test('bolding middle word produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'middle');
        await clickBoldButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 **text1** text1');
    });

    test('toggling bold off middle word restores plain text', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        // Apply bold.
        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'middle');
        await clickBoldButton(page);

        // Toggle off.
        const firstLineAgain = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLineAgain, 'text1', 'middle');
        await clickBoldButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 text1 text1');
    });
});

// ─── Problem 3: bold first word, paragraph 2 ───────────────────────

test.describe('Problem 3 — bold first word, paragraph 2', () => {
    test('bolding first word of second paragraph produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        // The second paragraph is the second .md-line in writing view.
        const secondLine = page.locator('#editor .md-line').nth(1);
        await dblclickWord(page, secondLine, 'text2', 'first');
        await clickBoldButton(page);

        await setSourceView(page);
        // First paragraph must be untouched.
        const line0 = await getSourceLineText(page, 0);
        expect(line0).toBe('text1 text1 text1');
        // Second paragraph should have bold on first word.
        const line1 = await getSourceLineText(page, 1);
        expect(line1).toBe('**text2** text2 text2');
    });
});

// ─── Problem 4: bold middle word, paragraph 2 ──────────────────────

test.describe('Problem 4 — bold middle word, paragraph 2', () => {
    test('bolding middle word of second paragraph produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        const secondLine = page.locator('#editor .md-line').nth(1);
        await dblclickWord(page, secondLine, 'text2', 'middle');
        await clickBoldButton(page);

        await setSourceView(page);
        // First paragraph must be untouched.
        const line0 = await getSourceLineText(page, 0);
        expect(line0).toBe('text1 text1 text1');
        // Second paragraph should have bold on middle word.
        const line1 = await getSourceLineText(page, 1);
        expect(line1).toBe('text2 **text2** text2');
    });
});

// ─── Cursor position after bolding ─────────────────────────────────

test.describe('Cursor position after bold', () => {
    test('cursor is at end of bolded word, not start of line', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        // Double-click middle word and bold it.
        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'middle');
        await clickBoldButton(page);

        // In writing view the cursor should be collapsed right after the
        // bolded word.  Read the DOM selection offset inside the editor.
        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0);
            // Walk up to the .md-line element to compute the total text
            // offset from the start of the line.
            const line = range.startContainer.parentElement?.closest('.md-line');
            if (!line) return null;
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let node = walker.nextNode();
            while (node) {
                if (node === range.startContainer) {
                    return {
                        offset: offset + range.startOffset,
                        collapsed: sel.isCollapsed,
                    };
                }
                offset += node.textContent?.length ?? 0;
                node = walker.nextNode();
            }
            return null;
        });

        expect(cursorInfo).not.toBeNull();
        expect(cursorInfo?.collapsed).toBe(true);
        // "text1 text1" = 11 chars — cursor should be right after the
        // bolded word (rendered text has no ** markers in writing view).
        expect(cursorInfo?.offset).toBe(11);
    });

    test('cursor is at end of first bolded word', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'first');
        await clickBoldButton(page);

        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0);
            const line = range.startContainer.parentElement?.closest('.md-line');
            if (!line) return null;
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let node = walker.nextNode();
            while (node) {
                if (node === range.startContainer) {
                    return {
                        offset: offset + range.startOffset,
                        collapsed: sel.isCollapsed,
                    };
                }
                offset += node.textContent?.length ?? 0;
                node = walker.nextNode();
            }
            return null;
        });

        expect(cursorInfo).not.toBeNull();
        expect(cursorInfo?.collapsed).toBe(true);
        // "text1" = 5 chars — cursor right after the bolded word.
        expect(cursorInfo?.offset).toBe(5);
    });
});

// ─── Collapsed cursor: bold word under caret / unbold ───────────────

/**
 * Single-click inside a word to place a collapsed cursor.
 * Uses the DOM Range API to get exact pixel coordinates.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {import('@playwright/test').Locator} lineLocator
 * @param {string} word - The word to click inside
 * @param {'first'|'middle'|'last'} which - Which occurrence
 */
async function clickInsideWord(pg, lineLocator, word, which = 'first') {
    const coords = await lineLocator.evaluate(
        (el, args) => {
            const [targetWord, occurrence] = args;
            const text = el.textContent || '';

            let startIdx;
            if (occurrence === 'first') {
                startIdx = text.indexOf(targetWord);
            } else if (occurrence === 'middle') {
                const firstEnd = text.indexOf(targetWord) + targetWord.length;
                startIdx = text.indexOf(targetWord, firstEnd);
            } else {
                startIdx = text.lastIndexOf(targetWord);
            }
            if (startIdx === -1) return null;

            // Place the click roughly in the middle of the word.
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let node = walker.nextNode();
            while (node) {
                const nodeLen = node.textContent?.length ?? 0;
                if (offset + nodeLen > startIdx) {
                    const localMid = startIdx - offset + Math.floor(targetWord.length / 2);
                    const range = document.createRange();
                    range.setStart(node, localMid);
                    range.setEnd(node, Math.min(localMid + 1, nodeLen));
                    const rect = range.getBoundingClientRect();
                    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                }
                offset += nodeLen;
                node = walker.nextNode();
            }
            return null;
        },
        [word, which],
    );

    if (!coords) throw new Error(`clickInsideWord: could not find "${word}" (${which})`);

    await pg.mouse.click(coords.x, coords.y);
    await pg.waitForTimeout(200);
}

test.describe('Collapsed cursor — bold word under caret', () => {
    test('clicking bold with cursor on a plain word bolds that word', async () => {
        await loadContent(page, fixtureContent);
        await setWritingView(page);

        // Place a collapsed cursor inside the middle "text1".
        const firstLine = page.locator('#editor .md-line').first();
        await clickInsideWord(page, firstLine, 'text1', 'middle');
        await clickBoldButton(page);

        // Switch to source view and verify.
        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 **text1** text1');
    });

    test('clicking bold with cursor inside bold text removes bold', async () => {
        // Start with the middle word already bold.
        const boldContent = 'text1 **text1** text1\n\ntext2 text2 text2\n';
        await loadContent(page, boldContent);
        await setWritingView(page);

        // In writing view the bold word renders without ** markers.
        // The rendered line shows "text1 text1 text1" with the middle
        // word in a <strong> tag.  Click inside that bold word.
        const firstLine = page.locator('#editor .md-line').first();
        await clickInsideWord(page, firstLine, 'text1', 'middle');
        await clickBoldButton(page);

        // Switch to source view and verify bold markers removed.
        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 text1 text1');
    });
});
