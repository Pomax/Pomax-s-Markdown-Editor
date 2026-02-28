/**
 * @fileoverview Integration tests for editing operations in source view.
 *
 * Covers the operations that go through renderNodes() / renderNodesAndPlaceCursor():
 * - Typing (single character insertion into an existing node)
 * - Backspace (character deletion, node merging)
 * - Delete (forward deletion, node merging)
 * - Cut (Ctrl/Cmd+X with selection)
 * - Toolbar formatting (bold on selected text)
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
} from '../../test-utils.js';

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
 * Get the raw markdown content from the editor.
 * @returns {Promise<string>}
 */
async function getMarkdown() {
    return page.evaluate(() => window.editorAPI?.getContent() ?? '');
}

// ──────────────────────────────────────────────
//  Typing
// ──────────────────────────────────────────────

test.describe('Source view typing', () => {
    test('typing a character updates the node content', async () => {
        await loadContent(page, 'hello');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);
        await page.keyboard.type('!');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('hello!');
    });

    test('typing at the start of a line prepends text', async () => {
        await loadContent(page, 'world');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        await page.keyboard.type('hello ');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('hello world');
    });

    test('typing into a heading preserves heading type', async () => {
        await loadContent(page, '## Title');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);
        await page.keyboard.type(' Here');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('## Title Here');

        const nodeType = await page.evaluate(() => {
            const tree = /** @type {any} */ (window).__editor?.syntaxTree;
            return tree?.children[0]?.type;
        });
        expect(nodeType).toBe('heading2');
    });
});

// ──────────────────────────────────────────────
//  Backspace
// ──────────────────────────────────────────────

test.describe('Source view backspace', () => {
    test('backspace deletes a character within a line', async () => {
        await loadContent(page, 'abcdef');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('abcde');
        expect(md).not.toContain('abcdef');
    });

    test('backspace at start of paragraph merges with previous node', async () => {
        await loadContent(page, 'first\n\nsecond');
        await setSourceView(page);

        const lines = page.locator('#editor .md-line');
        await clickInEditor(page, lines.nth(1));
        await page.keyboard.press(HOME);
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('firstsecond');
    });

    test('backspace with selection deletes the selected text', async () => {
        await loadContent(page, 'hello beautiful world');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        // Select "hello "
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Shift+ArrowRight');
        }
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('beautiful world');
        expect(md).not.toContain('hello');
    });
});

// ──────────────────────────────────────────────
//  Delete (forward)
// ──────────────────────────────────────────────

test.describe('Source view delete', () => {
    test('delete removes the character after the cursor', async () => {
        await loadContent(page, 'abcdef');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('bcdef');
        expect(md).not.toContain('abcdef');
    });

    test('delete at end of paragraph merges with next node', async () => {
        await loadContent(page, 'first\n\nsecond');
        await setSourceView(page);

        const lines = page.locator('#editor .md-line');
        await clickInEditor(page, lines.first());
        await page.keyboard.press(END);
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('firstsecond');
    });

    test('delete with selection removes the selected text', async () => {
        await loadContent(page, 'hello beautiful world');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        // Select "hello "
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Shift+ArrowRight');
        }
        await page.keyboard.press('Delete');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('beautiful world');
        expect(md).not.toContain('hello');
    });
});

// ──────────────────────────────────────────────
//  Cut
// ──────────────────────────────────────────────

test.describe('Source view cut', () => {
    test('cut removes selected text and updates the document', async () => {
        await loadContent(page, 'cut this text');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press(`${MOD}+x`);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md.trim()).toBe('');
    });

    test('cut preserves surrounding text', async () => {
        await loadContent(page, 'keep REMOVE keep');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        // Move past "keep "
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('ArrowRight');
        }
        // Select "REMOVE"
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Shift+ArrowRight');
        }
        await page.keyboard.press(`${MOD}+x`);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('keep  keep');
        expect(md).not.toContain('REMOVE');
    });
});

// ──────────────────────────────────────────────
//  Toolbar formatting
// ──────────────────────────────────────────────

test.describe('Source view toolbar formatting', () => {
    test('bold button wraps selected text with ** delimiters', async () => {
        await loadContent(page, 'make this bold');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        // Move past "make "
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('ArrowRight');
        }
        // Select "this"
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('Shift+ArrowRight');
        }
        await page.locator('[data-button-id="bold"]').click();
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('make **this** bold');
    });

    test('italic button wraps selected text with * delimiters', async () => {
        await loadContent(page, 'make this italic');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        // Move past "make "
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('ArrowRight');
        }
        // Select "this"
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('Shift+ArrowRight');
        }
        await page.locator('[data-button-id="italic"]').click();
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('make *this* italic');
    });
});

// ──────────────────────────────────────────────
//  Enter (node splitting)
// ──────────────────────────────────────────────

test.describe('Source view enter', () => {
    test('enter splits a paragraph into two nodes', async () => {
        await loadContent(page, 'before after');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(HOME);
        // Move past "before"
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('before');
        expect(md).toContain(' after');

        const nodeCount = await page.evaluate(() => {
            const tree = /** @type {any} */ (window).__editor?.syntaxTree;
            return tree?.children?.length;
        });
        expect(nodeCount).toBe(2);
    });

    test('enter at end of paragraph creates an empty paragraph below', async () => {
        await loadContent(page, 'only line');
        await setSourceView(page);

        const line = page.locator('#editor .md-line').first();
        await clickInEditor(page, line);
        await page.keyboard.press(END);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const nodeCount = await page.evaluate(() => {
            const tree = /** @type {any} */ (window).__editor?.syntaxTree;
            return tree?.children?.length;
        });
        expect(nodeCount).toBe(2);

        const secondType = await page.evaluate(() => {
            const tree = /** @type {any} */ (window).__editor?.syntaxTree;
            return tree?.children[1]?.type;
        });
        expect(secondType).toBe('paragraph');
    });
});
