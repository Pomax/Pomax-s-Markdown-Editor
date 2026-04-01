/**
 * @fileoverview Integration tests for cursor position preservation
 * across source2 ↔ writing view mode switches.
 *
 * Verifies that placing the cursor at a specific offset in one view
 * mode results in the equivalent offset after switching to the other
 * mode and back.
 */
import { expect, test } from '@playwright/test';
import {
  closeApp,
  launchApp,
  loadContent,
  setSource2View,
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

test.beforeEach(async () => {
  await setWritingView(page);
});

/**
 * Returns the treeCursor from the editor's syntax tree.
 * @param {import('@playwright/test').Page} pg
 */
async function getTreeCursor(pg) {
  return pg.evaluate(() => {
    const editor = /** @type {any} */ (window).__editor;
    return editor?.syntaxTree?.treeCursor ?? null;
  });
}

/**
 * Returns the textarea's selectionStart in source2 mode.
 * @param {import('@playwright/test').Page} pg
 */
async function getTextareaCaretOffset(pg) {
  return pg.evaluate(() => {
    const textarea = document.querySelector(`#editor.source-view-v2 textarea`);
    return /** @type {HTMLTextAreaElement|null} */ (textarea)?.selectionStart ?? -1;
  });
}

test.describe(`Source2 cursor position preservation`, () => {
  test(`cursor at end of single paragraph survives writing → source2 → writing`, async () => {
    await loadContent(page, `hello world`);

    // Place cursor at end of the paragraph (offset 11)
    await page.evaluate(() => {
      const editor = /** @type {any} */ (window).__editor;
      const first = editor.syntaxTree.children[0];
      editor.syntaxTree.treeCursor = { nodeId: first.id, offset: 11 };
      editor.placeCursor();
    });

    const cursorBefore = await getTreeCursor(page);
    expect(cursorBefore).not.toBeNull();
    expect(cursorBefore.offset).toBe(11);

    await setSource2View(page);
    await page.waitForTimeout(200);

    const textareaOffset = await getTextareaCaretOffset(page);
    expect(textareaOffset).toBe(11);

    await setWritingView(page);
    await page.waitForTimeout(200);

    const cursorAfter = await getTreeCursor(page);
    expect(cursorAfter).not.toBeNull();
    expect(cursorAfter.offset).toBe(11);
  });

  test(`cursor in middle of second paragraph survives round-trip`, async () => {
    await loadContent(page, `first paragraph\n\nsecond paragraph`);

    await page.evaluate(() => {
      const editor = /** @type {any} */ (window).__editor;
      const second = editor.syntaxTree.children[1];
      editor.syntaxTree.treeCursor = { nodeId: second.id, offset: 7 };
      editor.placeCursor();
    });

    const cursorBefore = await getTreeCursor(page);
    expect(cursorBefore).not.toBeNull();
    const nodeIdBefore = cursorBefore.nodeId;
    expect(cursorBefore.offset).toBe(7);

    await setSource2View(page);
    await page.waitForTimeout(200);

    // "first paragraph\n\n" = 17 chars, + 7 = 24
    const textareaOffset = await getTextareaCaretOffset(page);
    expect(textareaOffset).toBe(24);

    await setWritingView(page);
    await page.waitForTimeout(200);

    const cursorAfter = await getTreeCursor(page);
    expect(cursorAfter).not.toBeNull();
    expect(cursorAfter.nodeId).toBe(nodeIdBefore);
    expect(cursorAfter.offset).toBe(7);
  });

  test(`cursor at start of document survives round-trip`, async () => {
    await loadContent(page, `hello world`);

    await page.evaluate(() => {
      const editor = /** @type {any} */ (window).__editor;
      const first = editor.syntaxTree.children[0];
      editor.syntaxTree.treeCursor = { nodeId: first.id, offset: 0 };
      editor.placeCursor();
    });

    const cursorBefore = await getTreeCursor(page);
    expect(cursorBefore.offset).toBe(0);

    await setSource2View(page);
    await page.waitForTimeout(200);
    const textareaOffset = await getTextareaCaretOffset(page);
    expect(textareaOffset).toBe(0);

    await setWritingView(page);
    await page.waitForTimeout(200);
    const cursorAfter = await getTreeCursor(page);
    expect(cursorAfter.offset).toBe(0);
  });

  test(`cursor position after editing in source2 maps correctly`, async () => {
    await loadContent(page, `hello world`);

    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => {
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.keyboard.type(` extra`);
    await page.waitForTimeout(200);

    const textareaOffset = await getTextareaCaretOffset(page);
    expect(textareaOffset).toBe(17);

    await setWritingView(page);
    await page.waitForTimeout(200);

    const cursorAfter = await getTreeCursor(page);
    expect(cursorAfter).not.toBeNull();
    expect(cursorAfter.offset).toBe(17);

    const text = await page.locator(`#editor [data-node-id]`).first().innerText();
    expect(text).toBe(`hello world extra`);
  });

  test(`moving caret in source2 without editing updates cursor on switch back`, async () => {
    await loadContent(page, `hello world`);

    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => {
      el.setSelectionRange(5, 5);
    });

    const textareaOffset = await getTextareaCaretOffset(page);
    expect(textareaOffset).toBe(5);

    await setWritingView(page);
    await page.waitForTimeout(200);

    const cursorAfter = await getTreeCursor(page);
    expect(cursorAfter).not.toBeNull();
    expect(cursorAfter.offset).toBe(5);
  });
});
