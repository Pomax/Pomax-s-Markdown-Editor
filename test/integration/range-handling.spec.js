/**
 * @fileoverview Integration tests for range (selection) handling.
 * Covers: type-with-selection, backspace/delete-with-selection,
 * cross-node selection deletion, context-restricted Ctrl+A,
 * cut, copy, and paste-with-selection.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { END, HOME, MOD, clickInEditor } from './test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_DIR = path.join(__dirname, '..', '..', 'src', 'renderer');

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
};

/** @type {import('node:http').Server} */
let server;

/** @type {string} */
let baseURL;

test.beforeAll(async () => {
    server = createServer(async (req, res) => {
        let urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = path.resolve(path.join(RENDERER_DIR, urlPath));

        if (!filePath.startsWith(RENDERER_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        try {
            const content = await readFile(filePath);
            const ext = path.extname(filePath);
            res.writeHead(200, {
                'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
            });
            res.end(content);
        } catch {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    await new Promise((resolve) => server.listen(0, /** @type {() => void} */ (resolve)));
    const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
    baseURL = `http://localhost:${addr.port}`;
});

test.afterAll(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

// ──────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────

/**
 * Types a string character by character, waits for editor to settle.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function typeText(page, text) {
    for (const char of text) {
        await page.keyboard.type(char);
    }
}

/**
 * Select all text in the current element using Ctrl+A.
 * @param {import('@playwright/test').Page} page
 */
async function selectAll(page) {
    await page.keyboard.press(`${MOD}+a`);
}

/**
 * Returns the trimmed inner text of the editor.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
async function editorText(page) {
    return (await page.locator('#editor').innerText()).trim();
}

/**
 * Creates a cross-node DOM selection programmatically.
 * Finds .md-line elements whose textContent includes the given strings
 * and builds a Range from startOffset in the first match to endOffset
 * in the second.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} startText  - text fragment in the start node
 * @param {number} startOff   - character offset inside the start node's text
 * @param {string} endText    - text fragment in the end node
 * @param {number} endOff     - character offset inside the end node's text
 */
async function setCrossNodeSelection(page, startText, startOff, endText, endOff) {
    await page.evaluate(
        (args) => {
            const sText = /** @type {string} */ (args[0]);
            const sOff = /** @type {number} */ (args[1]);
            const eText = /** @type {string} */ (args[2]);
            const eOff = /** @type {number} */ (args[3]);
            const editor = /** @type {HTMLElement} */ (document.getElementById('editor'));
            const lines = editor.querySelectorAll('[data-node-id]');
            /** @type {Element|null} */
            let startEl = null;
            /** @type {Element|null} */
            let endEl = null;
            for (const line of lines) {
                if (!startEl && line.textContent?.includes(sText)) startEl = line;
                if (line.textContent?.includes(eText)) endEl = line;
            }
            if (!startEl || !endEl) {
                throw new Error(`Could not find nodes for "${sText}" / "${eText}"`);
            }
            const walker1 = document.createTreeWalker(startEl, NodeFilter.SHOW_TEXT);
            const startTN = walker1.nextNode();
            const walker2 = document.createTreeWalker(endEl, NodeFilter.SHOW_TEXT);
            const endTN = walker2.nextNode();
            if (!startTN || !endTN) throw new Error('No text nodes found');

            const range = document.createRange();
            range.setStart(startTN, sOff);
            range.setEnd(endTN, eOff);
            const sel = /** @type {Selection} */ (window.getSelection());
            sel.removeAllRanges();
            sel.addRange(range);
        },
        [startText, startOff, endText, endOff],
    );
    // Let selectionchange fire and the editor process it.
    await page.waitForTimeout(100);
}

// ──────────────────────────────────────────────
//  Type with selection replaces it
// ──────────────────────────────────────────────

test.describe('Type with selection', () => {
    test('typing with a selection replaces the selected text (single node)', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Type some text
        await typeText(page, 'hello world');

        // Select "world" using Shift+Home to select all, then retype
        // Actually, select just "world" by using keyboard: Home, then Shift+End
        // Let's use Ctrl+A to select all, then type replacement
        await selectAll(page);
        await typeText(page, 'replaced');

        const content = await editorText(page);
        expect(content).toBe('replaced');
    });

    test('typing replaces a partial selection within a node', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'abcdef');

        // Move to start, then shift+right 3 times to select "abc"
        await page.keyboard.press(HOME);
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');

        await typeText(page, 'XY');

        const content = await editorText(page);
        expect(content).toBe('XYdef');
    });
});

// ──────────────────────────────────────────────
//  Backspace with selection
// ──────────────────────────────────────────────

test.describe('Backspace with selection', () => {
    test('backspace deletes the entire selection', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'hello world');

        // Select all, then backspace
        await selectAll(page);
        await page.keyboard.press('Backspace');

        const content = await editorText(page);
        expect(content).toBe('');
    });

    test('backspace with partial selection deletes only selected text', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'abcdef');

        // Select "bcd" (positions 1-4)
        await page.keyboard.press(HOME);
        await page.keyboard.press('ArrowRight'); // after 'a'
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');
        await page.keyboard.press('Shift+ArrowRight');

        await page.keyboard.press('Backspace');

        const content = await editorText(page);
        expect(content).toBe('aef');
    });
});

// ──────────────────────────────────────────────
//  Delete with selection
// ──────────────────────────────────────────────

test.describe('Delete with selection', () => {
    test('delete key removes the entire selection', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'hello world');

        await selectAll(page);
        await page.keyboard.press('Delete');

        const content = await editorText(page);
        expect(content).toBe('');
    });
});

// ──────────────────────────────────────────────
//  Enter with selection
// ──────────────────────────────────────────────

test.describe('Enter with selection', () => {
    test('enter replaces selection and splits at cursor', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'abcdef');

        // Select "cd"
        await page.keyboard.press(HOME);
        await page.keyboard.press('ArrowRight'); // after 'a'
        await page.keyboard.press('ArrowRight'); // after 'b'
        await page.keyboard.press('Shift+ArrowRight'); // select 'c'
        await page.keyboard.press('Shift+ArrowRight'); // select 'd'

        await page.keyboard.press('Enter');

        // Should now have two lines: "ab" and "ef"
        const lines = editor.locator('.md-line');
        const count = await lines.count();
        expect(count).toBeGreaterThanOrEqual(2);

        const firstText = await lines.nth(0).innerText();
        const secondText = await lines.nth(1).innerText();
        expect(firstText.trim()).toBe('ab');
        expect(secondText.trim()).toBe('ef');
    });
});

// ──────────────────────────────────────────────
//  Ctrl+A context-restricted select-all
// ──────────────────────────────────────────────

test.describe('Ctrl+A context-restricted select-all', () => {
    test('Ctrl+A selects only the current paragraph, not the whole document', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Create two paragraphs
        await typeText(page, 'first paragraph');
        await page.keyboard.press('Enter');
        await typeText(page, 'second paragraph');

        // Cursor is in the second paragraph. Ctrl+A should select only it.
        await selectAll(page);

        // Now type to replace — only the second paragraph should be replaced
        await typeText(page, 'replaced');

        // First paragraph should still exist
        const content = await editorText(page);
        expect(content).toContain('first paragraph');
        expect(content).toContain('replaced');
        expect(content).not.toContain('second paragraph');
    });

    test('Ctrl+A on a heading selects only the heading content', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Create a heading
        await typeText(page, '# My Heading');
        await page.keyboard.press('Enter');
        await typeText(page, 'some text');

        // Go back up to the heading
        await page.keyboard.press('ArrowUp');

        await selectAll(page);
        await typeText(page, 'New Title');

        const content = await editorText(page);
        expect(content).toContain('New Title');
        expect(content).toContain('some text');
        expect(content).not.toContain('My Heading');
    });

    test('Ctrl+A then type replaces the entire node content', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'hello world');
        await selectAll(page);
        await typeText(page, 'new text');

        const content = await editorText(page);
        expect(content).toBe('new text');
    });

    test('Ctrl+A then delete empties the node', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'hello world');
        await selectAll(page);
        await page.keyboard.press('Delete');

        const content = await editorText(page);
        expect(content).toBe('');
    });
});

// ──────────────────────────────────────────────
//  Cross-node selection deletion
// ──────────────────────────────────────────────

test.describe('Cross-node selection deletion', () => {
    test('selecting across two paragraphs and deleting merges them', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Create two paragraphs: "first" and "second"
        await typeText(page, 'first');
        await page.keyboard.press('Enter');
        await typeText(page, 'second');

        // Programmatically select from offset 3 of "first" to offset 3 of "second"
        await setCrossNodeSelection(page, 'first', 3, 'second', 3);

        await page.keyboard.press('Backspace');

        // Should be merged: "fir" + "ond" = "firond"
        const content = await editorText(page);
        expect(content.replace(/\s+/g, ' ').trim()).toBe('firond');
    });

    test('typing with cross-node selection replaces all selected content', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Create two paragraphs: "alpha" and "beta"
        await typeText(page, 'alpha');
        await page.keyboard.press('Enter');
        await typeText(page, 'beta');

        // Programmatically select from offset 2 of "alpha" to offset 2 of "beta"
        await setCrossNodeSelection(page, 'alpha', 2, 'beta', 2);

        await typeText(page, 'X');

        // Should be "alXta"
        const content = await editorText(page);
        expect(content.replace(/\s+/g, ' ').trim()).toBe('alXta');
    });
});

// ──────────────────────────────────────────────
//  Paste with selection replaces it
// ──────────────────────────────────────────────

test.describe('Paste with selection', () => {
    test('pasting with a selection replaces the selected text', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'hello world');

        // Select "hello"
        await page.keyboard.press(HOME);
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Shift+ArrowRight');
        }

        // Copy "hello" (sets clipboard)
        await page.keyboard.press(`${MOD}+c`);

        // Move to end and type more
        await page.keyboard.press(END);
        await typeText(page, ' test');

        // Now select "test" at the end
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('Shift+ArrowLeft');
        }

        // Paste — should replace "test" with "hello"
        await page.keyboard.press(`${MOD}+v`);

        const content = await editorText(page);
        expect(content).toBe('hello world hello');
    });
});

// ──────────────────────────────────────────────
//  Cut (Ctrl+X)
// ──────────────────────────────────────────────

test.describe('Cut', () => {
    test('cut removes selected text and puts it on clipboard', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'hello world');

        // Select "world"
        await page.keyboard.press(END);
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Shift+ArrowLeft');
        }

        // Cut
        await page.keyboard.press(`${MOD}+x`);

        // "world" should be gone — read via evaluate to preserve trailing space
        let content = await page.evaluate(
            () => document.querySelector('#editor [data-node-id]')?.textContent ?? '',
        );
        expect(content).toBe('hello ');

        // Paste at end — should paste "world" back
        await page.keyboard.press(END);
        await page.keyboard.press(`${MOD}+v`);

        content = await editorText(page);
        expect(content).toBe('hello world');
    });
});

// ──────────────────────────────────────────────
//  Undo/redo after range operations
// ──────────────────────────────────────────────

test.describe('Undo after range operations', () => {
    test('undo restores content after select-all and type', async ({ page }) => {
        await page.goto(baseURL);
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await typeText(page, 'original');
        // Small delay to separate undo batches
        await page.waitForTimeout(400);

        await selectAll(page);
        await typeText(page, 'replaced');
        await page.waitForTimeout(400);

        // Undo should restore "original"
        await page.keyboard.press(`${MOD}+z`);
        await page.waitForTimeout(200);

        const content = await editorText(page);
        expect(content).toBe('original');
    });
});
