/**
 * @fileoverview Integration tests verifying that the syntax tree cursor
 * (editor.syntaxTree.treeCursor) is correctly set after every editing
 * operation.
 *
 * The syntax tree is the single source of truth for cursor state.
 * These tests exercise the main code paths and assert that the cursor
 * value is non-null (or null after blur).
 */

import { expect, test } from '@playwright/test';
import {
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

test('cursors sync after loading content', async () => {
    await loadContent(page, '# Hello\n\nWorld');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after load + click').not.toBeNull();
});

test('cursors sync after typing text', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    await page.keyboard.type('hello');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after typing "hello"').not.toBeNull();
});

test('cursors sync after typing a heading prefix', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    for (const ch of ['#', ' ', 'T', 'i', 't', 'l', 'e']) {
        await page.keyboard.press(ch);
    }
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after typing "# Title"').not.toBeNull();
});

test('cursors sync after backspace', async () => {
    await loadContent(page, 'abcdef');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Move to end and backspace
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after backspace').not.toBeNull();
});

test('cursors sync after delete', async () => {
    await loadContent(page, 'abcdef');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Move to start and delete
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after delete').not.toBeNull();
});

test('cursors sync after Enter splits a paragraph', async () => {
    await loadContent(page, 'first second');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Place cursor in the middle by pressing Home then ArrowRight 5 times
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowRight');
    }
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after Enter').not.toBeNull();
});

test('cursors sync after backspace merges paragraphs', async () => {
    await loadContent(page, 'first\n\nsecond');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Click the second line, go to start, backspace to merge
    const secondLine = editor.locator('.md-line:nth-child(2)');
    await clickInEditor(page, secondLine);
    await page.waitForTimeout(100);
    await page.keyboard.press('Home');
    await page.waitForTimeout(50);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after merge via backspace').not.toBeNull();
});

test('cursors sync after clicking a different node', async () => {
    await loadContent(page, '# Heading\n\nParagraph');
    await setSourceView(page);

    // Click the heading
    const heading = page.locator('#editor .md-heading1');
    await clickInEditor(page, heading);
    await page.waitForTimeout(200);
    const cursorH = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorH, 'syntaxTree.treeCursor should be set after clicking heading').not.toBeNull();

    // Now click the paragraph
    const paragraph = page.locator('#editor .md-paragraph');
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);
    const cursorP = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorP, 'syntaxTree.treeCursor should be set after clicking paragraph').not.toBeNull();
});

test('cursors sync in writing view after clicking a node', async () => {
    await loadContent(page, '# Heading\n\nParagraph text here');
    await setWritingView(page);

    const paragraph = page.locator('#editor .md-paragraph');
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(
        cursor,
        'syntaxTree.treeCursor should be set after clicking paragraph in writing view',
    ).not.toBeNull();
});

test('cursors sync after typing in a code block', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Create a code block via ``` + Enter, then type into it
    await page.keyboard.type('```');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('const x = 1;');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after typing in code block').not.toBeNull();
});

test('cursors sync after Enter inside a code block', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Create a code block via ``` + Enter, type a line, then Enter again
    await page.keyboard.type('```');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    await page.keyboard.type('line one');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after Enter in code block').not.toBeNull();
});

test('cursors sync after creating and exiting a list item', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Type a list item
    for (const ch of ['-', ' ', 'i', 't', 'e', 'm']) {
        await page.keyboard.press(ch);
    }
    await page.waitForTimeout(100);
    const cursorItem = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorItem, 'syntaxTree.treeCursor should be set after typing list item').not.toBeNull();

    // Enter to create new list item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursorEnter = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorEnter, 'syntaxTree.treeCursor should be set after Enter in list').not.toBeNull();

    // Enter again on empty item to exit list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursorExit = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorExit, 'syntaxTree.treeCursor should be set after exiting list').not.toBeNull();
});

test('cursors sync after fence-to-code-block conversion', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Type ``` + Enter to create a code block
    await page.keyboard.type('```');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after ``` + Enter').not.toBeNull();
});

test('cursors sync after multi-line paste', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    // Simulate a multi-line paste by inserting text with newlines
    await page.evaluate(() => {
        const e = /** @type {any} */ (window).__editor;
        if (e) {
            e.editOperations.insertTextAtCursor('line one\nline two\nline three');
        }
    });
    await page.waitForTimeout(100);
    const cursor = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursor, 'syntaxTree.treeCursor should be set after multi-line paste').not.toBeNull();
});

test('cursors are both null after blur in writing view', async () => {
    await loadContent(page, '# Heading\n\nParagraph');
    await setWritingView(page);

    // Click a node first
    const paragraph = page.locator('#editor .md-paragraph');
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);
    const cursorBefore = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorBefore, 'syntaxTree.treeCursor should be set before blur').not.toBeNull();

    // Blur the editor
    await page.evaluate(() => /** @type {HTMLElement|null} */ (document.activeElement)?.blur());
    await page.waitForTimeout(200);

    const cursorAfter = await page.evaluate(
        () => /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor ?? null,
    );
    expect(cursorAfter, 'syntaxTree.treeCursor should be null after blur').toBeNull();
});
