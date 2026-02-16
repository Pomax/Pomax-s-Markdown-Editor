/**
 * @fileoverview Integration tests for the code-block early-conversion feature.
 *
 * Typing ``` (with optional language) on a paragraph and pressing Enter should
 * immediately convert the paragraph into a code-block node.  Pressing Enter
 * inside an existing code block should insert a newline rather than splitting.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp } from './test-utils.js';

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

test.describe('Code-block early conversion', () => {
    test('typing ``` + Enter creates an empty code block', async () => {
        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Type the fence and press Enter
        await page.keyboard.type('```');
        await page.keyboard.press('Enter');

        // A code-block element should now be present
        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        // The underlying markdown should have fenced code block syntax
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('```\n');
    });

    test('typing ```js + Enter creates a code block with language', async () => {
        // Start fresh
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        await page.keyboard.type('```js');
        await page.keyboard.press('Enter');

        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toBeVisible();

        // The markdown source should contain the language identifier
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('```js\n');
    });

    test('Enter inside a code block inserts a newline', async () => {
        // Start fresh with a code block
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Create the code block
        await page.keyboard.type('```');
        await page.keyboard.press('Enter');

        // Now type some code with Enter in the middle
        await page.keyboard.type('line one');
        await page.keyboard.press('Enter');
        await page.keyboard.type('line two');

        // Verify the code block contains both lines
        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('line one\nline two');

        // There should still be only one code-block element (not split)
        const codeBlocks = editor.locator('.md-line.md-code-block');
        await expect(codeBlocks).toHaveCount(1);
    });

    test('backtick fence text is not converted until Enter', async () => {
        // Start fresh
        await page.evaluate(() => window.editorAPI?.setContent(''));
        await page.waitForSelector('#editor .md-line');

        const editor = page.locator('#editor');
        await clickInEditor(page, editor);

        // Type the fence but don't press Enter
        await page.keyboard.type('```');

        // The node should still be a paragraph, not a code-block
        const paragraph = editor.locator('.md-line.md-paragraph');
        await expect(paragraph).toBeVisible();

        // No code-block element should exist
        const codeBlock = editor.locator('.md-line.md-code-block');
        await expect(codeBlock).toHaveCount(0);
    });
});
