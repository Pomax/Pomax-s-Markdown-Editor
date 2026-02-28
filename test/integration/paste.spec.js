/**
 * @fileoverview Integration tests for paste support (issue #91).
 *
 * Verifies that pasting text in both source and writing views:
 * - Inserts the text at the cursor position
 * - Re-parses pasted markdown so structure is preserved
 * - Handles multi-line paste correctly
 * - Replaces a selection when one is active
 * - Handles CRLF line endings
 */

import { expect, test } from '@playwright/test';
import {
    END,
    HOME,
    MOD,
    clickInEditor,
    launchApp,
    loadContent,
    setSourceView,
    setWritingView,
} from './test-utils.js';

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
 * Write text to the system clipboard via Electron's clipboard API.
 * @param {string} text
 */
async function writeClipboard(text) {
    await electronApp.evaluate(({ clipboard }, t) => {
        clipboard.writeText(t);
    }, text);
}

/**
 * Get the raw markdown content from the editor via the public API.
 * @returns {Promise<string>}
 */
async function getMarkdown() {
    return page.evaluate(() => window.editorAPI?.getContent() ?? '');
}

// Force these tests to run one by one.
test.describe().config({ mode: 'serial' });

// ──────────────────────────────────────────────
//  Source view paste
// ──────────────────────────────────────────────

test.describe('Paste in source view', () => {
    test('single-line paste inserts text at cursor', async () => {
        await loadContent(page, 'hello world');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);

        await writeClipboard('PASTED ');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('PASTED hello world');
    });

    test('multi-line paste creates correct node structure', async () => {
        await loadContent(page, 'start');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);

        await writeClipboard('\n\n# Heading\n\nA paragraph');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(300);

        const md = await getMarkdown();
        expect(md).toContain('start');
        expect(md).toContain('# Heading');
        expect(md).toContain('A paragraph');
    });

    test('paste replaces active selection', async () => {
        await loadContent(page, 'replace me');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(`${MOD}+a`);

        await writeClipboard('new text');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('new text');
        expect(md).not.toContain('replace me');
    });

    test('paste over multi-node selection removes intermediate nodes', async () => {
        await loadContent(page, 'alpha\n\nbeta\n\ngamma');
        await setSourceView(page);

        const lines = page.locator('#editor .md-line');
        await clickInEditor(page, lines.first());
        await page.keyboard.press(HOME);
        await page.keyboard.press(`${MOD}+Shift+${END}`);
        // Extend selection to last line
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press(`Shift+${END}`);

        await writeClipboard('only this');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(300);

        const md = await getMarkdown();
        expect(md).toContain('only this');
        expect(md).not.toContain('alpha');
        expect(md).not.toContain('beta');
        expect(md).not.toContain('gamma');
    });

    test('pasting markdown heading creates a heading node', async () => {
        await loadContent(page, '\n');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);

        await writeClipboard('# Source heading');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const nodeType = await page.evaluate(() => {
            const tree = /** @type {any} */ (window).__editor?.syntaxTree;
            if (!tree) return null;
            return tree.children[0]?.type;
        });
        expect(nodeType).toBe('heading1');
    });

    test('multi-line paste with CRLF line endings works correctly', async () => {
        await loadContent(page, '\n');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);

        await writeClipboard('first\r\n\r\nsecond\r\n\r\nthird');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(300);

        const md = await getMarkdown();
        expect(md).toContain('first');
        expect(md).toContain('second');
        expect(md).toContain('third');
    });

    test('paste does not trigger a full render', async () => {
        await loadContent(page, 'alpha\n\nbeta\n\ngamma');
        await setSourceView(page);

        const lines = page.locator('#editor .md-line');
        await clickInEditor(page, lines.nth(1));
        await page.keyboard.press(END);

        // Instrument fullRender AFTER clicking so click-triggered renders
        // don't produce false positives.
        await page.evaluate(() => {
            const editor = /** @type {any} */ (window).__editor;
            editor._pasteTestFullRenderCount = 0;
            const origFullRender = editor.fullRender.bind(editor);
            editor.fullRender = (/** @type {any[]} */ ...args) => {
                editor._pasteTestFullRenderCount++;
                return origFullRender(...args);
            };
        });

        await writeClipboard(' extra');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const count = await page.evaluate(
            () => /** @type {any} */ (window).__editor._pasteTestFullRenderCount,
        );
        expect(count).toBe(0);

        const md = await getMarkdown();
        expect(md).toContain('beta extra');
    });
});

// ──────────────────────────────────────────────
//  Writing view paste
// ──────────────────────────────────────────────

test.describe('Paste in writing view', () => {
    test('single-line paste inserts text at cursor', async () => {
        await loadContent(page, 'hello world');
        await setWritingView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);

        await writeClipboard(' appended');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('hello world appended');
    });

    test('multi-line paste creates correct node structure', async () => {
        await loadContent(page, 'start');
        await setWritingView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);

        await writeClipboard('\n\n## Sub Heading\n\nBody text');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(300);

        const md = await getMarkdown();
        expect(md).toContain('start');
        expect(md).toContain('## Sub Heading');
        expect(md).toContain('Body text');
    });

    test('pasting markdown heading into paragraph creates a heading node', async () => {
        await loadContent(page, '\n');
        await setWritingView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);

        await writeClipboard('# This is a heading');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const nodeType = await page.evaluate(() => {
            const tree = /** @type {any} */ (window).__editor?.syntaxTree;
            if (!tree) return null;
            return tree.children[0]?.type;
        });
        expect(nodeType).toBe('heading1');
    });

    test('paste replaces active selection', async () => {
        await loadContent(page, 'select this text');
        await setWritingView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(`${MOD}+a`);

        await writeClipboard('replacement');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('replacement');
        expect(md).not.toContain('select this text');
    });

    test('paste does not trigger a full render', async () => {
        await loadContent(page, 'alpha\n\nbeta\n\ngamma');
        await setWritingView(page);

        const lines = page.locator('#editor .md-line');
        await clickInEditor(page, lines.nth(1));
        await page.keyboard.press(END);

        // Instrument fullRender AFTER clicking so click-triggered renders
        // don't produce false positives.
        await page.evaluate(() => {
            const editor = /** @type {any} */ (window).__editor;
            editor._pasteTestFullRenderCount = 0;
            const origFullRender = editor.fullRender.bind(editor);
            editor.fullRender = (/** @type {any[]} */ ...args) => {
                editor._pasteTestFullRenderCount++;
                return origFullRender(...args);
            };
        });

        await writeClipboard(' extra');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(200);

        const count = await page.evaluate(
            () => /** @type {any} */ (window).__editor._pasteTestFullRenderCount,
        );
        expect(count).toBe(0);

        const md = await getMarkdown();
        expect(md).toContain('beta extra');
    });

    test('multi-line paste with CRLF line endings works correctly', async () => {
        await loadContent(page, '\n');
        await setWritingView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);

        await writeClipboard('first\r\n\r\nsecond\r\n\r\nthird');
        await page.keyboard.press(`${MOD}+v`);
        await page.waitForTimeout(300);

        const md = await getMarkdown();
        expect(md).toContain('first');
        expect(md).toContain('second');
        expect(md).toContain('third');
    });
});
