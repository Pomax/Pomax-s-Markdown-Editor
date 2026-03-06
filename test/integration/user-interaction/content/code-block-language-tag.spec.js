/**
 * @fileoverview Integration tests for the code-block language tag display
 * and click-to-edit dialog in writing view.
 *
 * In writing view every code block shows two small language-tag spans
 * (.md-code-language-tag) at the top-right and bottom-right.  When a
 * language is set they display it; otherwise they show a placeholder
 * ("lang") with an --empty modifier.  Clicking either span opens a
 * modal dialog that lets the user set or change the language.
 */

import { expect, test } from '@playwright/test';
import {
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

// ── Rendering ────────────────────────────────────────────────

test.describe('Writing-view code-block language tag spans', () => {
    test('code block with language shows language text in top tag', async () => {
        await loadContent(page, '```js\nconsole.log("hi");\n```');
        await setWritingView(page);
        const topTag = page.locator('#editor .md-code-language-tag--top');
        await expect(topTag).toHaveText('js');
    });

    test('code block without language shows placeholder with --empty modifier', async () => {
        await loadContent(page, '```\nplain code\n```');
        await setWritingView(page);
        const topTag = page.locator('#editor .md-code-language-tag--top');
        await expect(topTag).toHaveText('lang');
        await expect(topTag).toHaveClass(/md-code-language-tag--empty/);
    });

    test('bottom tag is hidden on short code blocks (< 20 lines)', async () => {
        await loadContent(page, '```js\nshort\n```');
        await setWritingView(page);
        const bottomTag = page.locator('#editor .md-code-language-tag--bottom');
        await expect(bottomTag).toBeHidden();
    });

    test('bottom tag is visible on tall code blocks (>= 20 lines)', async () => {
        const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join('\n');
        await loadContent(page, `\`\`\`js\n${lines}\n\`\`\``);
        await setWritingView(page);
        const bottomTag = page.locator('#editor .md-code-language-tag--bottom');
        await expect(bottomTag).toBeVisible();
        await expect(bottomTag).toHaveText('js');
    });

    test('top tag is positioned absolutely with pointer cursor', async () => {
        await loadContent(page, '```python\nprint("hello")\n```');
        await setWritingView(page);
        const topTag = page.locator('#editor .md-code-language-tag--top');
        await expect(topTag).toBeVisible();
        const topStyle = await topTag.evaluate((el) => {
            const s = window.getComputedStyle(el);
            return { position: s.position, cursor: s.cursor };
        });
        expect(topStyle.position).toBe('absolute');
        expect(topStyle.cursor).toBe('pointer');
    });

    test('source view does not render language tag spans', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setSourceView(page);
        const tags = page.locator('#editor .md-code-block .md-code-language-tag');
        await expect(tags).toHaveCount(0);
    });
});

// ── Click-to-edit dialog ─────────────────────────────────────

test.describe('Code-block language tag dialog', () => {
    test('single click on language tag opens dialog even when code block is not focused', async () => {
        await loadContent(page, 'some text\n\n```js\ncode\n```');
        await setWritingView(page);
        // Click the paragraph first so the code block is NOT focused.
        await page.locator('#editor .md-paragraph').first().click();

        // Use low-level mouse events with a pause between mousedown and
        // mouseup so that the browser's selectionchange event fires and
        // the writing-mode re-render runs (destroying the original span)
        // before the click event arrives — reproducing the real two-click
        // bug where the span is gone by the time handleClick inspects it.
        const topTag = page.locator('#editor .md-code-language-tag--top');
        const box = /** @type {NonNullable<Awaited<ReturnType<typeof topTag.boundingBox>>>} */ (
            await topTag.boundingBox()
        );
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        // Give selectionchange time to fire and trigger a re-render.
        await page.waitForTimeout(300);
        await page.mouse.up();

        const dialog = page.locator('.code-language-dialog');
        await expect(dialog).toBeVisible({ timeout: 3000 });
        await page.locator('.code-language-btn--cancel').click();
    });

    test('clicking the language tag opens the code-language dialog', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setWritingView(page);
        const topTag = page.locator('#editor .md-code-language-tag--top');
        await topTag.click();
        const dialog = page.locator('.code-language-dialog');
        await expect(dialog).toBeVisible();
        // Cancel to close
        await page.locator('.code-language-btn--cancel').click();
        await expect(dialog).not.toBeVisible();
    });

    test('dialog is pre-filled with the current language', async () => {
        await loadContent(page, '```python\ncode\n```');
        await setWritingView(page);
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await expect(input).toHaveValue('python');
        await page.locator('.code-language-btn--cancel').click();
    });

    test('submitting a new language updates the code block', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setWritingView(page);
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await input.fill('typescript');
        await page.locator('.code-language-btn--insert').click();
        // The tag should now show "typescript"
        const tags = page.locator('#editor .md-code-block .md-code-language-tag');
        await expect(tags.nth(0)).toHaveText('typescript');
        await expect(tags.nth(1)).toHaveText('typescript');
        // And the markdown should be updated
        const md = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(md).toContain('```typescript');
    });

    test('submitting empty string clears the language', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setWritingView(page);
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await input.fill('');
        await page.locator('.code-language-btn--insert').click();
        // Tags should now show placeholder
        const tags = page.locator('#editor .md-code-block .md-code-language-tag');
        await expect(tags.nth(0)).toHaveText('lang');
        await expect(tags.nth(0)).toHaveClass(/md-code-language-tag--empty/);
        // Markdown should have bare fences
        const md = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(md).toContain('```\n');
    });

    test('cursor offset is correct in source view after changing language in writing view', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setWritingView(page);
        // Click inside the code block content and press Home to ensure
        // the cursor is at offset 0 (start of the code body).
        await page.locator('#editor .md-code-block .md-code-content').click();
        await page.keyboard.press('Home');
        // Change the language from "js" to "python" via the dialog.
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await input.fill('python');
        await page.locator('.code-language-btn--insert').click();
        // Switch to source view — the cursor should land inside the code
        // body, not on the opening fence line.
        await setSourceView(page);
        // In source-edit mode the full text is "```python\ncode\n```\n".
        // The preamble is "```python\n" (10 chars).  A content-relative
        // offset of 0 should become sourceEditText-relative offset 10,
        // placing the cursor at the start of "code".
        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0);
            // Walk backwards from the cursor to count the character offset
            // from the start of the .md-content element.
            const content = range.startContainer.parentElement?.closest('.md-content');
            if (!content) return null;
            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
            let offset = 0;
            let node = walker.nextNode();
            while (node) {
                if (node === range.startContainer) {
                    offset += range.startOffset;
                    break;
                }
                offset += node.textContent?.length ?? 0;
                node = walker.nextNode();
            }
            return { offset };
        });
        // "```python\n" is 10 characters; cursor should be at offset 10.
        expect(cursorInfo).not.toBeNull();
        expect(cursorInfo?.offset).toBe(10);
    });

    test('cursor offset is preserved after changing language via dialog', async () => {
        await loadContent(page, '```js\nhello world\n```');
        await setWritingView(page);

        // Click inside the code content using real mouse coordinates,
        // the same way a user would — no keyboard navigation.
        const codeContent = page.locator('#editor .md-code-block .md-code-content');
        const box =
            /** @type {NonNullable<Awaited<ReturnType<typeof codeContent.boundingBox>>>} */ (
                await codeContent.boundingBox()
            );
        // Click roughly in the middle of the text.
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

        // Read treeCursor.offset before opening the dialog.
        const offsetBefore = await page.evaluate(() => {
            return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? null;
        });
        expect(offsetBefore).not.toBeNull();
        expect(offsetBefore).toBeGreaterThan(0);

        // Open the language dialog and change the language.
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await input.fill('python');
        await page.locator('.code-language-btn--insert').click();

        // Read treeCursor.offset after the dialog closes.
        const offsetAfter = await page.evaluate(() => {
            return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? null;
        });
        expect(offsetAfter).toBe(offsetBefore);
    });

    test('text selection is preserved after changing language via dialog', async () => {
        await loadContent(page, '```js\nhello world\n```');
        await setWritingView(page);

        // Click inside the code content to place the cursor first.
        const codeContent = page.locator('#editor .md-code-block .md-code-content');
        const box =
            /** @type {NonNullable<Awaited<ReturnType<typeof codeContent.boundingBox>>>} */ (
                await codeContent.boundingBox()
            );
        await page.mouse.click(box.x + 5, box.y + box.height / 2);

        // Select "hello" by double-clicking it.
        await page.mouse.dblclick(box.x + 15, box.y + box.height / 2);

        // Read treeRange before opening the dialog.
        const rangeBefore = await page.evaluate(() => {
            const editor = /** @type {any} */ (window).__editor;
            if (!editor?.treeRange) return null;
            return { ...editor.treeRange };
        });
        expect(rangeBefore).not.toBeNull();
        expect(rangeBefore.startOffset).not.toBe(rangeBefore.endOffset);

        // Open the language dialog and change the language.
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await input.fill('python');
        await page.locator('.code-language-btn--insert').click();

        // Read treeRange after the dialog closes.
        const rangeAfter = await page.evaluate(() => {
            const editor = /** @type {any} */ (window).__editor;
            if (!editor?.treeRange) return null;
            return { ...editor.treeRange };
        });
        expect(rangeAfter).toEqual(rangeBefore);
    });

    test('clicking placeholder lang tag on a bare code block opens the dialog empty', async () => {
        await loadContent(page, '```\ncode\n```');
        await setWritingView(page);
        await page.locator('#editor .md-code-language-tag--top').click();
        const input = page.locator('#code-language-input');
        await expect(input).toHaveValue('');
        // Set a language
        await input.fill('ruby');
        await page.locator('.code-language-btn--insert').click();
        const tags = page.locator('#editor .md-code-block .md-code-language-tag');
        await expect(tags.nth(0)).toHaveText('ruby');
        const md = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(md).toContain('```ruby');
    });
});
