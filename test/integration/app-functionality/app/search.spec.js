/**
 * @fileoverview Integration tests for the search bar feature.
 *
 * Verifies that Ctrl+F opens the search bar, plain text and regex
 * search work in both source and writing view, match highlighting
 * is applied, navigation between matches works, and the bar closes
 * cleanly on Escape.
 */

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  HOME,
  MOD,
  closeApp,
  launchApp,
  loadContent,
  projectRoot,
  setSource2View,
  setWritingView,
} from '../../test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const FIXTURE = [
  `# Heading with cake`,
  ``,
  `A paragraph about cake and pie.`,
  ``,
  `## Another heading`,
  ``,
  `Some **bold text** and *italic words* here.`,
  ``,
  `- List item one`,
  ``,
  `- List item two`,
  ``,
  `\`\`\`js`,
  `const cake = true;`,
  `\`\`\``,
].join(`\n`);

const LOREM = fs.readFileSync(path.join(projectRoot, `test`, `fixtures`, `lorem.md`), `utf-8`);

test.beforeAll(async () => {
  ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp);
});

test(`Ctrl+F opens the search bar`, async () => {
  await loadContent(page, FIXTURE);
  // Search bar should be hidden initially.
  const bar = page.locator(`.search-bar`);
  await expect(bar).toBeHidden();

  // Open with Ctrl+F.
  await page.keyboard.press(`${MOD}+f`);
  await expect(bar).toBeVisible();

  // The input should be focused.
  const input = page.locator(`.search-input`);
  await expect(input).toBeFocused();
});

test(`Escape closes the search bar`, async () => {
  await loadContent(page, FIXTURE);
  await page.keyboard.press(`${MOD}+f`);
  await expect(page.locator(`.search-bar`)).toBeVisible();

  await page.keyboard.press(`Escape`);
  await expect(page.locator(`.search-bar`)).toBeHidden();
});

test(`Escape closes the search bar when editor is focused`, async () => {
  await loadContent(page, FIXTURE);
  await page.keyboard.press(`${MOD}+f`);
  await expect(page.locator(`.search-bar`)).toBeVisible();

  // Move focus back to the editor
  await page.locator(`#editor`).focus();
  await page.keyboard.press(`Escape`);
  await expect(page.locator(`.search-bar`)).toBeHidden();
});

test(`Ctrl+F while open selects the search text`, async () => {
  await loadContent(page, FIXTURE);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`hello`);

  // Press Ctrl+F again — text should be selected.
  await page.keyboard.press(`${MOD}+f`);
  await expect(input).toBeFocused();
  const selected = await input.evaluate((el) => {
    const inp = /** @type {HTMLInputElement} */ (el);
    return (inp.selectionEnd ?? 0) - (inp.selectionStart ?? 0);
  });
  expect(selected).toBe(5);
});

test(`plain text search highlights matches in source view`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  // Should find matches.
  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).not.toHaveText(`No results`);

  // There should be <mark> elements in the editor.
  const marks = page.locator(`#editor mark.search-highlight`);
  const count = await marks.count();
  expect(count).toBeGreaterThanOrEqual(2); // heading + paragraph + code

  // One should be the active match.
  const active = page.locator(`#editor mark.search-highlight--active`);
  await expect(active).toHaveCount(1);

  await page.keyboard.press(`Escape`);
});

test(`plain text search is case insensitive by default`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`Cake`);

  // Should still match lowercase 'cake' in paragraph and code.
  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).not.toHaveText(`No results`);

  const marks = page.locator(`#editor mark.search-highlight`);
  const count = await marks.count();
  expect(count).toBeGreaterThanOrEqual(2);

  await page.keyboard.press(`Escape`);
});

test(`case sensitive toggle restricts matches`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`Cake`);

  // Click case-sensitive toggle.
  await page.locator(`.search-toggle[data-action="case"]`).click();

  // 'Cake' (capital C) should not match 'cake' (lowercase).
  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  // Toggle off and close.
  await page.locator(`.search-toggle[data-action="case"]`).click();
  await page.keyboard.press(`Escape`);
});

test(`regex search finds pattern matches`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);

  // Enable regex mode.
  await page.locator(`.search-toggle[data-action="regex"]`).click();

  const input = page.locator(`.search-input`);
  await input.fill(`cake|pie`);

  // Should find multiple matches.
  const marks = page.locator(`#editor mark.search-highlight`);
  const count = await marks.count();
  expect(count).toBeGreaterThanOrEqual(3); // 'cake' in heading + paragraph + code, 'pie' in paragraph

  // Toggle off and close.
  await page.locator(`.search-toggle[data-action="regex"]`).click();
  await page.keyboard.press(`Escape`);
});

test(`invalid regex shows no results instead of error`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);

  await page.locator(`.search-toggle[data-action="regex"]`).click();
  const input = page.locator(`.search-input`);
  await input.fill(`[invalid`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  await page.locator(`.search-toggle[data-action="regex"]`).click();
  await page.keyboard.press(`Escape`);
});

test(`Enter navigates to next match`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toContainText(`1 of`);

  // Press Enter → next match.
  await page.keyboard.press(`Enter`);
  await expect(matchCount).toContainText(`2 of`);

  await page.keyboard.press(`Escape`);
});

test(`Shift+Enter navigates to previous match`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toContainText(`1 of`);

  // Go forward then back.
  await page.keyboard.press(`Enter`);
  await expect(matchCount).toContainText(`2 of`);
  await page.keyboard.press(`Shift+Enter`);
  await expect(matchCount).toContainText(`1 of`);

  await page.keyboard.press(`Escape`);
});

test(`next/prev buttons navigate matches`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toContainText(`1 of`);

  await page.locator(`.search-nav-btn[data-action="next"]`).click();
  await expect(matchCount).toContainText(`2 of`);

  await page.locator(`.search-nav-btn[data-action="prev"]`).click();
  await expect(matchCount).toContainText(`1 of`);

  await page.keyboard.press(`Escape`);
});

test(`search works in writing view (bare text)`, async () => {
  await loadContent(page, FIXTURE);
  await setWritingView(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  // In writing view, **bold** delimiters are stripped, so searching
  // for 'cake' should still find the heading and paragraph matches.
  const marks = page.locator(`#editor mark.search-highlight`);
  const count = await marks.count();
  expect(count).toBeGreaterThanOrEqual(2);

  await page.keyboard.press(`Escape`);
});

test(`writing view search does not match markdown syntax`, async () => {
  await loadContent(page, FIXTURE);
  await setWritingView(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  // Search for markdown heading prefix — should not match in writing view
  // because toBareText strips it.
  await input.fill(`##`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  await page.keyboard.press(`Escape`);
});

test(`highlights are removed when search bar closes`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  // Marks should exist.
  let marks = page.locator(`#editor mark.search-highlight`);
  expect(await marks.count()).toBeGreaterThan(0);

  // Close the search bar.
  await page.keyboard.press(`Escape`);

  // Marks should be gone.
  marks = page.locator(`#editor mark.search-highlight`);
  await expect(marks).toHaveCount(0);
});

test(`close button closes the search bar`, async () => {
  await loadContent(page, FIXTURE);
  await page.keyboard.press(`${MOD}+f`);
  await expect(page.locator(`.search-bar`)).toBeVisible();

  await page.locator(`.search-close-btn`).click();
  await expect(page.locator(`.search-bar`)).toBeHidden();
});

test(`shows "No results" for unmatched query`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`xyznonexistent`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  await page.keyboard.press(`Escape`);
});

test(`plain text search requires at least 2 characters`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`c`);

  // Single character should not trigger a search.
  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(``);

  const marks = page.locator(`#editor mark.search-highlight`);
  await expect(marks).toHaveCount(0);

  await page.keyboard.press(`Escape`);
});

test(`regex search still works with single character`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);
  await page.keyboard.press(`${MOD}+f`);

  await page.locator(`.search-toggle[data-action="regex"]`).click();
  const input = page.locator(`.search-input`);
  await input.fill(`c`);

  // Regex mode should allow single char.
  const marks = page.locator(`#editor mark.search-highlight`);
  expect(await marks.count()).toBeGreaterThan(0);

  await page.locator(`.search-toggle[data-action="regex"]`).click();
  await page.keyboard.press(`Escape`);
});

test(`initial match is closest to cursor position`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);

  // Place cursor 5 characters into "## Another heading" (offset 60
  // in the textarea) so it sits between "## An" and "other heading".
  const textarea = page.locator(`#editor textarea`);
  await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el, pos) => {
    el.focus();
    el.setSelectionRange(pos, pos);
  }, 60);
  await page.waitForTimeout(200);

  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`item`);

  // 'item' appears in "List item one" and "List item two", both
  // after the cursor.  The active match should NOT be "1 of" if
  // there were earlier matches — there aren't any earlier "item"
  // matches here, but the key point is it picks the closest one
  // at or after the cursor, which is the first list item.
  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toContainText(`1 of`);

  // Now search for 'heading' — it appears in heading1 (before cursor)
  // and heading2 (at cursor).  The active match should be the one
  // at/after the cursor, i.e. the second heading.
  await input.fill(`heading`);
  await expect(matchCount).toContainText(`2 of`);

  await page.keyboard.press(`Escape`);
});

test(`writing view search does not highlight in source2 pre`, async () => {
  await loadContent(page, FIXTURE);
  await setWritingView(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`cake`);

  // Writing DOM should have highlights.
  const editorMarks = page.locator(`#editor mark.search-highlight`);
  expect(await editorMarks.count()).toBeGreaterThan(0);

  // Source2 pre must not contain any highlights.
  const preMarks = page.locator(`.source-v2-wrapper pre mark.search-highlight`);
  expect(await preMarks.count()).toBe(0);

  await page.keyboard.press(`Escape`);
});

test(`writing view search highlights inside code blocks are placed correctly`, async () => {
  await loadContent(page, FIXTURE);
  await setWritingView(page);
  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`true`);

  // The mark for "true" in the code block must be inside the
  // <code> element, not in a language-label span.
  const codeBlockMark = page.locator(`.md-code-block code mark.search-highlight`);
  expect(await codeBlockMark.count()).toBeGreaterThan(0);
  await expect(codeBlockMark.first()).toHaveText(`true`);

  await page.keyboard.press(`Escape`);
});

test(`closing search preserves cursor position in source2 view`, async () => {
  await loadContent(page, FIXTURE);
  await setSource2View(page);

  const textarea = page.locator(`#editor textarea`);
  await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el, pos) => {
    el.focus();
    el.setSelectionRange(pos, pos);
  }, 30);

  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`ckae`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  await page.keyboard.press(`Escape`);

  // The textarea must have focus and its cursor must not have moved.
  await expect(textarea).toBeFocused();
  const cursorPos = await textarea.evaluate(
    (/** @type {HTMLTextAreaElement} */ el) => el.selectionStart,
  );
  expect(cursorPos).toBe(30);
});

test(`closing search preserves cursor position in writing view`, async () => {
  await loadContent(page, FIXTURE);
  await setWritingView(page);

  // Place the cursor on the second heading at offset 4.
  await page.evaluate(() => {
    const tree = /** @type {any} */ (window).__editor?.syntaxTree;
    if (!tree) return;
    const target = tree.children.find(
      (/** @type {any} */ n) => n.type.startsWith(`heading`) && n.content?.includes(`Another`),
    );
    if (target) {
      tree.treeCursor = { nodeId: target.id, offset: 4 };
      /** @type {any} */ (window).__editor?.placeCursor();
    }
  });

  const cursorBefore = await page.evaluate(() => {
    const tc = /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor;
    return tc ? { nodeId: tc.nodeId, offset: tc.offset } : null;
  });

  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);
  await input.fill(`ckae`);

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  await page.keyboard.press(`Escape`);

  // The DOM selection must be inside the editor, not at the start.
  const selectionNodeId = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.anchorNode?.parentElement?.closest(`[data-node-id]`);
    return node?.getAttribute(`data-node-id`) ?? null;
  });
  expect(selectionNodeId).toBe(cursorBefore?.nodeId);
});

test(`scroll position is restored when search has zero results`, async () => {
  await loadContent(page, LOREM);
  await setWritingView(page);

  // Scroll to the middle of the document.
  await page.evaluate(() => {
    const container = document.getElementById(`editor-container`);
    if (container) container.scrollTop = container.scrollHeight / 2;
  });
  await page.waitForTimeout(200);

  const scrollBefore = await page.evaluate(() => {
    return document.getElementById(`editor-container`)?.scrollTop ?? 0;
  });
  expect(scrollBefore).toBeGreaterThan(0);

  await page.keyboard.press(`${MOD}+f`);
  const input = page.locator(`.search-input`);

  // Type "loremelephant" letter by letter — "lorem" will match
  // initially, scrolling to a hit, but eventually zero results.
  for (const ch of `loremelephant`) {
    await input.press(ch);
    await page.waitForTimeout(50);
  }

  const matchCount = page.locator(`.search-match-count`);
  await expect(matchCount).toHaveText(`No results`);

  // With zero results the scroll should be back where we started.
  const scrollAfter = await page.evaluate(() => {
    return document.getElementById(`editor-container`)?.scrollTop ?? 0;
  });
  expect(scrollAfter).toBe(scrollBefore);

  await page.keyboard.press(`Escape`);
});
