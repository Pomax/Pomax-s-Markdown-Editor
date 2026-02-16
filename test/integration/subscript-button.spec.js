/**
 * @fileoverview Integration tests for the toolbar subscript button.
 *
 * Mirrors the bold-button tests but for subscript formatting:
 *   1. Subscript first word in first paragraph
 *   2. Subscript middle word in first paragraph
 *   3. Subscript first word in second paragraph
 *   4. Subscript middle word in second paragraph
 *   5. Cursor position after subscript
 *   6. Collapsed cursor: subscript word under caret
 *
 * Note: subscript uses HTML tags (<sub>...</sub>) and toggle-off is not
 * yet supported in _findFormatSpan.  Toggle tests are included so they
 * serve as regression markers once toggle support is added.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
    launchApp,
    loadContent,
    projectRoot,
    setFocusedView,
    setSourceView,
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
 * Double-click a word in the editor to select it.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {import('@playwright/test').Locator} lineLocator
 * @param {string} word
 * @param {'first'|'middle'|'last'} which
 */
async function dblclickWord(pg, lineLocator, word, which = 'first') {
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
    await pg.waitForTimeout(200);
}

/**
 * Click the subscript toolbar button.
 * @param {import('@playwright/test').Page} pg
 */
async function clickSubscriptButton(pg) {
    await pg.locator('[data-button-id="subscript"]').click();
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

// ─── Subscript first word, paragraph 1 ──────────────────────────────

test.describe('Subscript first word, paragraph 1', () => {
    test('subscript first word produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setFocusedView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'first');
        await clickSubscriptButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('<sub>text1</sub> text1 text1');
    });
});

// ─── Subscript middle word, paragraph 1 ─────────────────────────────

test.describe('Subscript middle word, paragraph 1', () => {
    test('subscript middle word produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setFocusedView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'middle');
        await clickSubscriptButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 <sub>text1</sub> text1');
    });
});

// ─── Subscript first word, paragraph 2 ──────────────────────────────

test.describe('Subscript first word, paragraph 2', () => {
    test('subscript first word of second paragraph produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setFocusedView(page);

        const secondLine = page.locator('#editor .md-line').nth(1);
        await dblclickWord(page, secondLine, 'text2', 'first');
        await clickSubscriptButton(page);

        await setSourceView(page);
        const line0 = await getSourceLineText(page, 0);
        expect(line0).toBe('text1 text1 text1');
        const line1 = await getSourceLineText(page, 1);
        expect(line1).toBe('<sub>text2</sub> text2 text2');
    });
});

// ─── Subscript middle word, paragraph 2 ─────────────────────────────

test.describe('Subscript middle word, paragraph 2', () => {
    test('subscript middle word of second paragraph produces correct markdown', async () => {
        await loadContent(page, fixtureContent);
        await setFocusedView(page);

        const secondLine = page.locator('#editor .md-line').nth(1);
        await dblclickWord(page, secondLine, 'text2', 'middle');
        await clickSubscriptButton(page);

        await setSourceView(page);
        const line0 = await getSourceLineText(page, 0);
        expect(line0).toBe('text1 text1 text1');
        const line1 = await getSourceLineText(page, 1);
        expect(line1).toBe('text2 <sub>text2</sub> text2');
    });
});

// ─── Cursor position after subscript ────────────────────────────────

test.describe('Cursor position after subscript', () => {
    test('cursor is at end of subscripted middle word', async () => {
        await loadContent(page, fixtureContent);
        await setFocusedView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await dblclickWord(page, firstLine, 'text1', 'middle');
        await clickSubscriptButton(page);

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
                    return { offset: offset + range.startOffset, collapsed: sel.isCollapsed };
                }
                offset += node.textContent?.length ?? 0;
                node = walker.nextNode();
            }
            return null;
        });

        expect(cursorInfo).not.toBeNull();
        expect(cursorInfo?.collapsed).toBe(true);
        // "text1 text1" = 11 chars
        expect(cursorInfo?.offset).toBe(11);
    });
});

// ─── Collapsed cursor: subscript word under caret ───────────────────

/**
 * Single-click inside a word to place a collapsed cursor.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {import('@playwright/test').Locator} lineLocator
 * @param {string} word
 * @param {'first'|'middle'|'last'} which
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

test.describe('Collapsed cursor — subscript word under caret', () => {
    test('clicking subscript with cursor on a plain word applies subscript', async () => {
        await loadContent(page, fixtureContent);
        await setFocusedView(page);

        const firstLine = page.locator('#editor .md-line').first();
        await clickInsideWord(page, firstLine, 'text1', 'middle');
        await clickSubscriptButton(page);

        await setSourceView(page);
        const line = await getSourceLineText(page, 0);
        expect(line).toBe('text1 <sub>text1</sub> text1');
    });
});
