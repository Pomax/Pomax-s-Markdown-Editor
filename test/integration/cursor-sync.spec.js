/**
 * @fileoverview Integration tests verifying that editor.treeCursor and
 * editor.syntaxTree.treeCursor stay in sync after every editing operation.
 *
 * The syntax tree is the single source of truth for cursor state, and every
 * assignment to editor.treeCursor must be mirrored to
 * editor.syntaxTree.treeCursor.  These tests exercise the main code paths
 * and assert that both values are always identical.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    launchApp,
    loadContent,
    setFocusedView,
    setSourceView,
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
 * Read both cursor values from the editor and return them.
 * @param {import('@playwright/test').Page} pg
 */
async function readBothCursors(pg) {
    return pg.evaluate(() => {
        const editor = /** @type {any} */ (window).__editor;
        if (!editor) return null;
        return {
            editorCursor: editor.treeCursor ? { ...editor.treeCursor } : null,
            treeCursor: editor.syntaxTree?.treeCursor ? { ...editor.syntaxTree.treeCursor } : null,
        };
    });
}

/**
 * Assert that editor.treeCursor and editor.syntaxTree.treeCursor are
 * deeply equal and non-null.
 * @param {import('@playwright/test').Page} pg
 * @param {string} [context] - description of the operation for error messages
 */
async function expectCursorsInSync(pg, context = '') {
    const cursors = await readBothCursors(pg);
    if (!cursors) throw new Error(`cursors should be readable ${context}`);
    expect(cursors.editorCursor, `editor.treeCursor should be set ${context}`).not.toBeNull();
    expect(cursors.treeCursor, `syntaxTree.treeCursor should be set ${context}`).not.toBeNull();
    expect(cursors.editorCursor, `cursors should match ${context}`).toEqual(cursors.treeCursor);
}

test('cursors sync after loading content', async () => {
    await loadContent(page, '# Hello\n\nWorld');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);
    await expectCursorsInSync(page, 'after load + click');
});

test('cursors sync after typing text', async () => {
    await loadContent(page, '');
    await setSourceView(page);
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    await page.waitForTimeout(100);

    await page.keyboard.type('hello');
    await page.waitForTimeout(100);
    await expectCursorsInSync(page, 'after typing "hello"');
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
    await expectCursorsInSync(page, 'after typing "# Title"');
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
    await expectCursorsInSync(page, 'after backspace');
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
    await expectCursorsInSync(page, 'after delete');
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
    await expectCursorsInSync(page, 'after Enter');
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
    await expectCursorsInSync(page, 'after merge via backspace');
});

test('cursors sync after clicking a different node', async () => {
    await loadContent(page, '# Heading\n\nParagraph');
    await setSourceView(page);

    // Click the heading
    const heading = page.locator('#editor .md-heading1');
    await clickInEditor(page, heading);
    await page.waitForTimeout(200);
    await expectCursorsInSync(page, 'after clicking heading');

    // Now click the paragraph
    const paragraph = page.locator('#editor .md-paragraph');
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);
    await expectCursorsInSync(page, 'after clicking paragraph');
});

test('cursors sync in focused view after clicking a node', async () => {
    await loadContent(page, '# Heading\n\nParagraph text here');
    await setFocusedView(page);

    const paragraph = page.locator('#editor .md-paragraph');
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);
    await expectCursorsInSync(page, 'after clicking paragraph in focused view');
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
    await expectCursorsInSync(page, 'after typing in code block');
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
    await expectCursorsInSync(page, 'after Enter in code block');
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
    await expectCursorsInSync(page, 'after typing list item');

    // Enter to create new list item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await expectCursorsInSync(page, 'after Enter in list');

    // Enter again on empty item to exit list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await expectCursorsInSync(page, 'after exiting list');
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
    await expectCursorsInSync(page, 'after ``` + Enter');
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
    await expectCursorsInSync(page, 'after multi-line paste');
});

test('cursors are both null after blur in focused view', async () => {
    await loadContent(page, '# Heading\n\nParagraph');
    await setFocusedView(page);

    // Click a node first
    const paragraph = page.locator('#editor .md-paragraph');
    await clickInEditor(page, paragraph);
    await page.waitForTimeout(200);
    await expectCursorsInSync(page, 'before blur');

    // Blur the editor
    await page.evaluate(() => /** @type {HTMLElement|null} */ (document.activeElement)?.blur());
    await page.waitForTimeout(200);

    const cursors = await readBothCursors(page);
    if (!cursors) throw new Error('cursors should be readable after blur');
    expect(cursors.editorCursor, 'editor.treeCursor should be null after blur').toBeNull();
    expect(cursors.treeCursor, 'syntaxTree.treeCursor should be null after blur').toBeNull();
});
