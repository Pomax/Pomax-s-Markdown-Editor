/**
 * @fileoverview Integration tests for editing code-block fences and
 * language tags in source view (issue #95).
 *
 * In source view a code-block's opening fence, language indicator, code
 * content, and closing fence are all rendered as a single editable region.
 * The user can place the cursor anywhere in that region and perform all
 * normal text operations: typing, backspacing, deleting, pressing Enter,
 * and selecting ranges.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    closeApp,
    launchApp,
    loadContent,
    setSourceView,
    setWritingView,
} from '../../test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await closeApp(electronApp);
});

/**
 * Get the raw markdown content from the editor.
 * @returns {Promise<string>}
 */
async function getMarkdown() {
    return page.evaluate(() => window.editorAPI?.getContent() ?? '');
}

/**
 * Place the cursor at a specific character offset inside the code-block's
 * `.md-content` text node.  Uses DOM Selection API + syncCursorFromDOM()
 * so that the editor's tree cursor is updated.
 *
 * This avoids HOME/END key differences across platforms — the code-block
 * text is multiline inside a single `<div>`, so HOME only goes to the
 * start of the *visual* line, not the start of the text node.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {number} offset  Character offset from the start of the text node.
 */
async function setCursorInCodeBlock(pg, offset) {
    await pg.evaluate(
        ({ off }) => {
            const editor = document.getElementById('editor');
            const contentDiv = editor?.querySelector('.md-code-block .md-content');
            if (!contentDiv) throw new Error('no .md-code-block .md-content found');
            // Walk into the first text node
            const walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT);
            /** @type {Text | null} */
            let textNode = /** @type {Text | null} */ (walker.nextNode());
            let remaining = off;
            while (textNode && remaining > (textNode.textContent?.length ?? 0)) {
                remaining -= textNode.textContent?.length ?? 0;
                textNode = /** @type {Text | null} */ (walker.nextNode());
            }
            if (!textNode) throw new Error(`offset ${off} exceeds text length`);
            const sel = window.getSelection();
            if (!sel) throw new Error('no selection object');
            const range = document.createRange();
            range.setStart(textNode, remaining);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            // Sync the editor's tree cursor from the DOM selection
            const api = /** @type {any} */ (window).__editor;
            api.syncCursorFromDOM();
        },
        { off: offset },
    );
}

// ── Basic rendering ─────────────────────────────────────────

test.describe('Source-view code-block rendering', () => {
    test('code block is rendered as a single editable region containing fences', async () => {
        await loadContent(page, '```js\nconsole.log("hi")\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        // The entire block should have one .md-content child containing
        // the fences and content as a single text node.
        const contentDiv = codeBlock.locator('.md-content');
        await expect(contentDiv).toHaveCount(1);

        const text = await contentDiv.textContent();
        expect(text).toContain('```js');
        expect(text).toContain('console.log("hi")');
        // Closing fence
        expect(text?.trim().endsWith('```')).toBe(true);
    });

    test('no separate md-code-fence divs in source view', async () => {
        await loadContent(page, '```py\nx = 1\n```');
        await setSourceView(page);

        const fenceDivs = page.locator('#editor .md-code-fence');
        await expect(fenceDivs).toHaveCount(0);
    });
});

// ── Typing into the language tag ────────────────────────────

test.describe('Editing the language tag', () => {
    test('can append to the language tag by typing after it', async () => {
        await loadContent(page, '```py\nx = 1\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await clickInEditor(page, codeBlock);

        // Place cursor right after "```py" (offset 5)
        await setCursorInCodeBlock(page, 5);
        await page.keyboard.type('thon');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('```python');
    });

    test('can delete part of the language tag with backspace', async () => {
        await loadContent(page, '```javascript\ncode\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await clickInEditor(page, codeBlock);

        // Place cursor at end of "```javascript" (offset 13)
        await setCursorInCodeBlock(page, 13);

        // Backspace 4 times to remove "ript"
        for (let i = 0; i < 4; i++) {
            await page.keyboard.press('Backspace');
        }
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('```javas');
        expect(md).not.toContain('```javascript');
    });
});

// ── Editing the code content ────────────────────────────────

test.describe('Editing code content in source view', () => {
    test('typing inside the code content area works', async () => {
        await loadContent(page, '```js\nhello\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await clickInEditor(page, codeBlock);

        // Place cursor after "hello": "```js\nhello" = 11 chars
        await setCursorInCodeBlock(page, 11);
        await page.keyboard.type(' world');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('hello world');
    });

    test('Enter key inserts newline in source edit text', async () => {
        await loadContent(page, '```js\nline1\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await clickInEditor(page, codeBlock);

        // Place cursor after "line1": "```js\nline1" = 11 chars
        await setCursorInCodeBlock(page, 11);
        await page.keyboard.press('Enter');
        await page.keyboard.type('line2');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('line1\nline2');
    });
});

// ── Editing the fences ──────────────────────────────────────

test.describe('Editing the code fences', () => {
    test('adding a backtick at the start of the opening fence', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await clickInEditor(page, codeBlock);

        // Place cursor at very start (offset 0)
        await setCursorInCodeBlock(page, 0);
        await page.keyboard.type('`');
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        // The raw text should now contain four backticks somewhere
        expect(md).toContain('````');
    });
});

// ── View mode switch finalization ───────────────────────────

test.describe('View mode switch finalization', () => {
    test('switching to writing view finalizes source edit', async () => {
        await loadContent(page, '```ts\ncontent\n```');
        await setSourceView(page);

        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await clickInEditor(page, codeBlock);

        // Place cursor after "```ts" (offset 5) and type "x"
        await setCursorInCodeBlock(page, 5);
        await page.keyboard.type('x');
        await page.waitForTimeout(200);

        // Switch to writing view — should finalize the edit
        await setWritingView(page);
        await page.waitForTimeout(200);

        const md = await getMarkdown();
        expect(md).toContain('```tsx');
    });
});
