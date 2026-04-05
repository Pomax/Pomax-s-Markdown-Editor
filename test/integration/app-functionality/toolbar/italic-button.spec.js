/**
 * @fileoverview Integration tests for the toolbar italic button.
 *
 * Mirrors the bold-button tests but for italic formatting:
 *   1. Italic first word in first paragraph, then toggle off
 *   2. Italic middle word in first paragraph (correct placement, no trailing space)
 *   3. Italic first word in second paragraph (should not affect first paragraph)
 *   4. Italic middle word in second paragraph (should apply to correct node)
 *   5. Cursor position after italicizing
 *   6. Collapsed cursor: italic word under caret / un-italic
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  closeApp,
  getSourceLineText,
  launchApp,
  loadContent,
  projectRoot,
  setSource2View,
  setWritingView,
} from '../../test-utils.js';

const fixturePath = path.join(projectRoot, `test`, `fixtures`, `bold-button.md`);
const fixtureContent = fs.readFileSync(fixturePath, `utf-8`);

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
 * Double-click a word in the editor to select it.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {import('@playwright/test').Locator} lineLocator
 * @param {string} word
 * @param {'first'|'middle'|'last'} which
 */
async function dblclickWord(pg, lineLocator, word, which = `first`) {
  const coords = await lineLocator.evaluate(
    (el, args) => {
      const [targetWord, occurrence] = args;
      const text = el.textContent || ``;

      let startIdx;
      if (occurrence === `first`) {
        startIdx = text.indexOf(targetWord);
      } else if (occurrence === `middle`) {
        const firstEnd = text.indexOf(targetWord) + targetWord.length;
        startIdx = text.indexOf(targetWord, firstEnd);
      } else {
        startIdx = text.lastIndexOf(targetWord);
      }
      if (startIdx === -1) return;

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node = walker.nextNode();
      while (node) {
        const nodeLen = node.textContent?.length ?? 0;
        if (offset + nodeLen > startIdx) {
          const localMid = startIdx - offset + Math.floor(targetWord.length / 2);
          const range = document.createRange();
          range.setStart(node, localMid);
          range.setEnd(node, Math.min(localMid + 1, nodeLen));
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        offset += nodeLen;
        node = walker.nextNode();
      }
    },
    [word, which],
  );

  if (!coords) throw new Error(`dblclickWord: could not find "${word}" (${which})`);

  await pg.mouse.dblclick(coords.x, coords.y);
  await pg.waitForTimeout(200);
}

/**
 * Click the italic toolbar button.
 * @param {import('@playwright/test').Page} pg
 */
async function clickItalicButton(pg) {
  await pg.locator(`[data-button-id="italic"]`).click();
  await pg.waitForTimeout(200);
}

test.describe(`Italic first word, toggle off`, () => {
  test(`italicizing first word produces correct markdown`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLine, `text1`, `first`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line = await getSourceLineText(page, 0);
    expect(line).toBe(`*text1* text1 text1`);
  });

  test(`toggling italic off restores plain text`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLine, `text1`, `first`);
    await clickItalicButton(page);

    const firstLineAgain = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLineAgain, `text1`, `first`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line = await getSourceLineText(page, 0);
    expect(line).toBe(`text1 text1 text1`);
  });
});

test.describe(`Italic middle word, paragraph 1`, () => {
  test(`italicizing middle word produces correct markdown`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLine, `text1`, `middle`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line = await getSourceLineText(page, 0);
    expect(line).toBe(`text1 *text1* text1`);
  });

  test(`toggling italic off on the middle word restores plain text`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLine, `text1`, `middle`);
    await clickItalicButton(page);

    const firstLineAgain = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLineAgain, `text1`, `middle`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line = await getSourceLineText(page, 0);
    expect(line).toBe(`text1 text1 text1`);
  });
});

test.describe(`Italic first word, paragraph 2`, () => {
  test(`italicizing first word of second paragraph produces correct markdown`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const secondLine = page.locator(`#editor [data-node-id]`).nth(1);
    await dblclickWord(page, secondLine, `text2`, `first`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line0 = await getSourceLineText(page, 0);
    expect(line0).toBe(`text1 text1 text1`);
    const line1 = await getSourceLineText(page, 2);
    expect(line1).toBe(`*text2* text2 text2`);
  });
});

test.describe(`Italic middle word, paragraph 2`, () => {
  test(`italicizing middle word of second paragraph produces correct markdown`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const secondLine = page.locator(`#editor [data-node-id]`).nth(1);
    await dblclickWord(page, secondLine, `text2`, `middle`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line0 = await getSourceLineText(page, 0);
    expect(line0).toBe(`text1 text1 text1`);
    const line1 = await getSourceLineText(page, 2);
    expect(line1).toBe(`text2 *text2* text2`);
  });
});

test.describe(`Cursor position after italic`, () => {
  test(`cursor is at end of italicized middle word`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLine, `text1`, `middle`);
    await clickItalicButton(page);

    const cursorInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const line = range.startContainer.parentElement?.closest(`[data-node-id]`);
      if (!line) return;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node = walker.nextNode();
      while (node) {
        if (node === range.startContainer) {
          return {
            offset: offset + range.startOffset,
            collapsed: sel.isCollapsed,
          };
        }
        offset += node.textContent?.length ?? 0;
        node = walker.nextNode();
      }
    });

    expect(cursorInfo).toBeDefined();
    expect(cursorInfo?.collapsed).toBe(true);
    // "text1 text1" = 11 chars
    expect(cursorInfo?.offset).toBe(11);
  });

  test(`cursor is at end of italicized first word`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await dblclickWord(page, firstLine, `text1`, `first`);
    await clickItalicButton(page);

    const cursorInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const line = range.startContainer.parentElement?.closest(`[data-node-id]`);
      if (!line) return;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node = walker.nextNode();
      while (node) {
        if (node === range.startContainer) {
          return {
            offset: offset + range.startOffset,
            collapsed: sel.isCollapsed,
          };
        }
        offset += node.textContent?.length ?? 0;
        node = walker.nextNode();
      }
    });

    expect(cursorInfo).toBeDefined();
    expect(cursorInfo?.collapsed).toBe(true);
    expect(cursorInfo?.offset).toBe(5);
  });
});

/**
 * Single-click inside a word to place a collapsed cursor.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {import('@playwright/test').Locator} lineLocator
 * @param {string} word
 * @param {'first'|'middle'|'last'} which
 */
async function clickInsideWord(pg, lineLocator, word, which = `first`) {
  const coords = await lineLocator.evaluate(
    (el, args) => {
      const [targetWord, occurrence] = args;
      const text = el.textContent || ``;

      let startIdx;
      if (occurrence === `first`) {
        startIdx = text.indexOf(targetWord);
      } else if (occurrence === `middle`) {
        const firstEnd = text.indexOf(targetWord) + targetWord.length;
        startIdx = text.indexOf(targetWord, firstEnd);
      } else {
        startIdx = text.lastIndexOf(targetWord);
      }
      if (startIdx === -1) return;

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let node = walker.nextNode();
      while (node) {
        const nodeLen = node.textContent?.length ?? 0;
        if (offset + nodeLen > startIdx) {
          const localMid = startIdx - offset + Math.floor(targetWord.length / 2);
          const range = document.createRange();
          range.setStart(node, localMid);
          range.setEnd(node, Math.min(localMid + 1, nodeLen));
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
        offset += nodeLen;
        node = walker.nextNode();
      }
    },
    [word, which],
  );

  if (!coords) throw new Error(`clickInsideWord: could not find "${word}" (${which})`);

  await pg.mouse.click(coords.x, coords.y);
  await pg.waitForTimeout(200);
}

test.describe(`Collapsed cursor — italic word under caret`, () => {
  test(`clicking italic with cursor on a plain word italicizes that word`, async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await clickInsideWord(page, firstLine, `text1`, `middle`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line = await getSourceLineText(page, 0);
    expect(line).toBe(`text1 *text1* text1`);
  });

  test(`clicking italic with cursor inside italic text removes italic`, async () => {
    const italicContent = `text1 *text1* text1\n\ntext2 text2 text2\n`;
    await loadContent(page, italicContent);
    await setWritingView(page);

    const firstLine = page.locator(`#editor [data-node-id]`).first();
    await clickInsideWord(page, firstLine, `text1`, `middle`);
    await clickItalicButton(page);

    await setSource2View(page);
    const line = await getSourceLineText(page, 0);
    expect(line).toBe(`text1 text1 text1`);
  });
});
