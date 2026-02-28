/**
 * @fileoverview Integration tests for the code-block early-conversion feature.
 *
 * Typing ``` (with optional language) on a paragraph and pressing Enter should
 * immediately convert the paragraph into a code-block node.  Pressing Enter
 * inside an existing code block should insert a newline rather than splitting.
 *
 * Typing tests are run in both writing view and source view to ensure the
 * fence-to-code-block conversion works in both rendering paths.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    closeApp,
    launchApp,
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

// ── Typing tests in writing view ────────────────────────────

test.describe('Code-block early conversion — writing view', () => {
    test('typing ``` + Enter creates an empty code block', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setWritingView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('```\n');
    });

    test('typing ```js + Enter creates a code block with language', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setWritingView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```js');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('```js\n');
    });

    test('typing ```` + Enter creates a code block with fenceCount 4', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setWritingView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('````');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('````\n');
    });

    test('typing ``````js + Enter creates a code block with fenceCount 6 and language', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setWritingView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('``````js');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('``````js\n');
    });

    test('Enter inside a code block inserts a newline', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setWritingView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```');
        await page.keyboard.press('Enter');
        await page.keyboard.type('line one');
        await page.keyboard.press('Enter');
        await page.keyboard.type('line two');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('line one\nline two');

        const codeBlocks = editor.locator('.md-line.md-code-block');
        await expect(codeBlocks).toHaveCount(1);
    });

    test('backtick fence text is not converted until Enter', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setWritingView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```');

        const paragraph = editor.locator('.md-line.md-paragraph');
        await expect(paragraph).toBeVisible();

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toHaveCount(0);
    });
});

// ── Typing tests in source view ─────────────────────────────

test.describe('Code-block early conversion — source view', () => {
    test('typing ``` + Enter creates an empty code block', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setSourceView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('```\n');
    });

    test('typing ```js + Enter creates a code block with language', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setSourceView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```js');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('```js\n');
    });

    test('typing ```` + Enter creates a code block with fenceCount 4', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setSourceView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('````');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('````\n');
    });

    test('typing ``````js + Enter creates a code block with fenceCount 6 and language', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setSourceView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('``````js');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('``````js\n');
    });

    test('backtick fence text is not converted until Enter', async () => {
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');
        await setSourceView(page);

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('````');

        const paragraph = editor.locator('.md-line.md-paragraph');
        await expect(paragraph).toBeVisible();

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toHaveCount(0);
    });
});

// ── Loading/parsing tests (view-independent) ────────────────

test.describe('Code-block parsing — issue #82 examples', () => {
    test('loading markdown with four-backtick fence preserves nested three-backtick fences', async () => {
        const md = '````\n```\nnested\n```\n````';
        await page.evaluate((content) => window.editorAPI?.setContent(content), md);
        await page.waitForSelector('#editor .md-line');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toBe(md);
    });

    test('issue #82 example 1: four-backtick fence with nested three-backtick literal text', async () => {
        const md = [
            'This is a paragraph of text.',
            '',
            '````',
            'This is a code block, opened with four backticks rather than three, so any sequence of backticks up to but not including four is treated as just literal text, not active markdown:',
            '```',
            'This should just show literal backticks instead of getting parsed as a nested code block (which would be against markdown specs).',
            '```',
            'The codeblock only closes on the next sequence of four backticks, marking the opening sequence:',
            '````',
            '',
            'And this is regular text again.',
        ].join('\n');

        await page.evaluate((content) => window.editorAPI?.setContent(content), md);
        await page.waitForSelector('#editor .md-line');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toBe(md);

        const nodes = await page.evaluate(() => {
            const e = /** @type {any} */ (window).__editor;
            return e?.syntaxTree?.children?.map((/** @type {any} */ n) => n.type) ?? [];
        });
        expect(nodes).toEqual(['paragraph', 'code-block', 'paragraph']);
    });

    test('issue #82 example 2: ten-backtick fence with nine-backtick literal text', async () => {
        const md = [
            'This is text',
            '',
            '``````````',
            "This is code, with ````````` in it as plain inert text because it doesn't match the opening block",
            '``````````',
            '',
            'But this is text again, because the preceding backticks was the same sequence as the opening code fence.',
        ].join('\n');

        await page.evaluate((content) => window.editorAPI?.setContent(content), md);
        await page.waitForSelector('#editor .md-line');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toBe(md);

        const nodes = await page.evaluate(() => {
            const e = /** @type {any} */ (window).__editor;
            return e?.syntaxTree?.children?.map((/** @type {any} */ n) => n.type) ?? [];
        });
        expect(nodes).toEqual(['paragraph', 'code-block', 'paragraph']);
    });
});
