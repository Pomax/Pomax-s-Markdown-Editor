/**
 * @fileoverview Integration tests for editing syntax prefixes in source view.
 *
 * In source view every node is rendered as plain text.  Elements with a
 * syntax prefix (headings, list items, blockquotes, etc.) split the line
 * into a `.md-syntax` span (the prefix) and a `.md-content` span (the
 * content).  Code blocks render the entire markdown — fences, language
 * tag, body, and closing fence — as a single editable `.md-content`
 * region.
 *
 * These tests verify that insert, delete, and backspace inside the prefix
 * / fence region behave like a plain-text editor: the operation modifies
 * exactly one character and the cursor stays where it logically should.
 */

import { expect, test } from '@playwright/test';
import { closeApp, launchApp, loadContent, setSource2View } from '../../test-utils.js';

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
  return page.evaluate(() => window.editorAPI?.getContent() ?? ``);
}

/**
 * Place the cursor at a character offset inside the first `.md-syntax`
 * span of the first matching element.  Uses the DOM Selection API +
 * syncCursorFromDOM() so the editor's tree cursor updates.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {string} selector  CSS selector for the block element (e.g. `.md-heading2`).
 * @param {number} offset  Character offset from the start of the prefix text.
 */
async function setCursorInPrefix(pg, selector, offset) {
  await pg.evaluate(
    ({ sel, off }) => {
      const editor = document.getElementById(`editor`);
      const block = editor?.querySelector(sel);
      if (!block) throw new Error(`no element matching ${sel}`);
      const syntaxSpan = block.querySelector(`.md-syntax`);
      if (!syntaxSpan) throw new Error(`no .md-syntax span in ${sel}`);
      const walker = document.createTreeWalker(syntaxSpan, NodeFilter.SHOW_TEXT);
      /** @type {Text | null} */
      let textNode = /** @type {Text | null} */ (walker.nextNode());
      let remaining = off;
      while (textNode && remaining > (textNode.textContent?.length ?? 0)) {
        remaining -= textNode.textContent?.length ?? 0;
        textNode = /** @type {Text | null} */ (walker.nextNode());
      }
      if (!textNode) throw new Error(`offset ${off} exceeds prefix text length`);
      const selection = window.getSelection();
      if (!selection) throw new Error(`no selection object`);
      const range = document.createRange();
      range.setStart(textNode, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      const api = /** @type {any} */ (window).__editor;
      api.syncCursorFromDOM();
    },
    { sel: selector, off: offset },
  );
}

/**
 * Place the cursor at a character offset inside the `.md-content` region
 * of a code block.  The entire sourceEditText (fences + code + closing
 * fence) is rendered as one text node inside `.md-content`.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {number} offset  Character offset from the start of the text.
 */
async function setCursorInCodeBlock(pg, offset) {
  await pg.evaluate(
    ({ off }) => {
      const editor = document.getElementById(`editor`);
      const contentDiv = editor?.querySelector(`.md-code-block .md-content`);
      if (!contentDiv) throw new Error(`no .md-code-block .md-content found`);
      const walker = document.createTreeWalker(contentDiv, NodeFilter.SHOW_TEXT);
      /** @type {Text | null} */
      let textNode = /** @type {Text | null} */ (walker.nextNode());
      let remaining = off;
      while (textNode && remaining > (textNode.textContent?.length ?? 0)) {
        remaining -= textNode.textContent?.length ?? 0;
        textNode = /** @type {Text | null} */ (walker.nextNode());
      }
      if (!textNode) throw new Error(`offset ${off} exceeds text length`);
      const selection = window.getSelection();
      if (!selection) throw new Error(`no selection object`);
      const range = document.createRange();
      range.setStart(textNode, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      const api = /** @type {any} */ (window).__editor;
      api.syncCursorFromDOM();
    },
    { off: offset },
  );
}

test.describe(`Heading1 prefix (# )`, () => {
  test(`insert in prefix`, async () => {
    await loadContent(page, `# hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between # and space): "# hello"
    //                                             ^
    await setCursorInPrefix(page, `.md-heading1`, 1);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    // "#! hello" — no longer a heading, becomes paragraph
    expect(await getMarkdown()).toBe(`#! hello`);
    // Verify cursor is at position 2 by typing another char
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`#!@ hello`);
  });

  test(`delete in prefix`, async () => {
    await loadContent(page, `# hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 0 (before #): "# hello"
    //                                  ^
    await setCursorInPrefix(page, `.md-heading1`, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // " hello" — the # is removed, space + hello remains
    expect(await getMarkdown()).toBe(` hello`);
    // Verify cursor stayed at absolute position 0
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`! hello`);
  });

  test(`backspace in prefix`, async () => {
    await loadContent(page, `# hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between # and space): "# hello"
    //                                             ^
    await setCursorInPrefix(page, `.md-heading1`, 1);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    // " hello" — the # is removed
    expect(await getMarkdown()).toBe(` hello`);
    // Verify cursor is at position 0
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`! hello`);
  });
});

test.describe(`Heading2 prefix (## )`, () => {
  test(`insert in prefix`, async () => {
    await loadContent(page, `## hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between first and second #)
    await setCursorInPrefix(page, `.md-heading2`, 1);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    // "#!# hello" — not a heading anymore
    expect(await getMarkdown()).toBe(`#!# hello`);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`#!@# hello`);
  });

  test(`delete in prefix`, async () => {
    await loadContent(page, `## hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 0 (before first #)
    await setCursorInPrefix(page, `.md-heading2`, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // "# hello" — becomes heading1
    expect(await getMarkdown()).toBe(`# hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`!# hello`);
  });

  test(`backspace in prefix`, async () => {
    await loadContent(page, `## hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 2 (between second # and space)
    await setCursorInPrefix(page, `.md-heading2`, 2);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    // "# hello" — becomes heading1
    expect(await getMarkdown()).toBe(`# hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`#! hello`);
  });
});

test.describe(`Blockquote prefix (> )`, () => {
  test(`insert in prefix`, async () => {
    await loadContent(page, `> hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between > and space)
    await setCursorInPrefix(page, `.md-blockquote`, 1);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    // "> ! hello" — stays blockquote (> alone starts one); content becomes "! hello"
    expect(await getMarkdown()).toBe(`> ! hello`);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`> @! hello`);
  });

  test(`delete in prefix`, async () => {
    await loadContent(page, `> hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 0 (before >)
    await setCursorInPrefix(page, `.md-blockquote`, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // " hello"
    expect(await getMarkdown()).toBe(` hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`! hello`);
  });

  test(`backspace in prefix`, async () => {
    await loadContent(page, `> hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between > and space)
    await setCursorInPrefix(page, `.md-blockquote`, 1);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    // " hello"
    expect(await getMarkdown()).toBe(` hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`! hello`);
  });
});

test.describe(`Unordered list prefix (- )`, () => {
  test(`insert in prefix`, async () => {
    await loadContent(page, `- hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between - and space)
    await setCursorInPrefix(page, `.md-list-item`, 1);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    // "-! hello" — not a list item anymore
    expect(await getMarkdown()).toBe(`-! hello`);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`-!@ hello`);
  });

  test(`delete in prefix`, async () => {
    await loadContent(page, `- hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 0 (before -)
    await setCursorInPrefix(page, `.md-list-item`, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // " hello"
    expect(await getMarkdown()).toBe(` hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`! hello`);
  });

  test(`backspace in prefix`, async () => {
    await loadContent(page, `- hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between - and space)
    await setCursorInPrefix(page, `.md-list-item`, 1);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    // " hello"
    expect(await getMarkdown()).toBe(` hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`! hello`);
  });
});

test.describe(`Ordered list prefix (1. )`, () => {
  test(`insert in prefix`, async () => {
    await loadContent(page, `1. hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 1 (between 1 and .)
    await setCursorInPrefix(page, `.md-list-item`, 1);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    // "1!. hello" — not a list item anymore
    expect(await getMarkdown()).toBe(`1!. hello`);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`1!@. hello`);
  });

  test(`delete in prefix`, async () => {
    await loadContent(page, `1. hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 0 (before 1)
    await setCursorInPrefix(page, `.md-list-item`, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // ". hello"
    expect(await getMarkdown()).toBe(`. hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`!. hello`);
  });

  test(`backspace in prefix`, async () => {
    await loadContent(page, `1. hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 2 (between . and space)
    await setCursorInPrefix(page, `.md-list-item`, 2);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    // "1 hello" — paragraph
    expect(await getMarkdown()).toBe(`1 hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`1! hello`);
  });
});

test.describe(`Checklist prefix (- [ ] )`, () => {
  test(`insert in prefix`, async () => {
    await loadContent(page, `- [ ] hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 3 (between [ and space): "- [ ] hello"
    //                                               ^
    await setCursorInPrefix(page, `.md-list-item`, 3);
    await page.keyboard.type(`x`);
    await page.waitForTimeout(200);
    // "- [x ] hello" — the x is inserted, space remains
    expect(await getMarkdown()).toBe(`- [x ] hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`- [x! ] hello`);
  });

  test(`delete in prefix`, async () => {
    await loadContent(page, `- [x] hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 3 (between [ and x): "- [x] hello"
    //                                            ^
    await setCursorInPrefix(page, `.md-list-item`, 3);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // "- [] hello" — x removed
    expect(await getMarkdown()).toBe(`- [] hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`- [!] hello`);
  });

  test(`backspace in prefix`, async () => {
    await loadContent(page, `- [x] hello\n\n`);
    await setSource2View(page);
    // Cursor at offset 4 (between x and ]): "- [x] hello"
    //                                             ^
    await setCursorInPrefix(page, `.md-list-item`, 4);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    // "- [] hello" — x removed
    expect(await getMarkdown()).toBe(`- [] hello`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`- [!] hello`);
  });
});

test.describe(`Code fence — three ticks, no language`, () => {
  test(`insert on opening fence`, async () => {
    await loadContent(page, `\`\`\`\ncode\n\`\`\`\n\n`);
    await setSource2View(page);
    // sourceEditText = "```\ncode\n```"
    // Cursor at offset 1 (between first and second backtick)
    await setCursorInCodeBlock(page, 1);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`!\`\`\ncode\n\`\`\``);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`!@\`\`\ncode\n\`\`\``);
  });

  test(`delete on opening fence`, async () => {
    await loadContent(page, `\`\`\`\ncode\n\`\`\`\n\n`);
    await setSource2View(page);
    // Cursor at offset 0 (before first backtick)
    await setCursorInCodeBlock(page, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\ncode\n\`\`\``);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`!\`\`\ncode\n\`\`\``);
  });

  test(`backspace on opening fence`, async () => {
    await loadContent(page, `\`\`\`\ncode\n\`\`\`\n\n`);
    await setSource2View(page);
    // Cursor at offset 2 (between second and third backtick)
    await setCursorInCodeBlock(page, 2);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\ncode\n\`\`\``);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`!\`\ncode\n\`\`\``);
  });
});

test.describe(`Code fence — three ticks, with language`, () => {
  test(`insert in language tag`, async () => {
    await loadContent(page, `\`\`\`js\ncode\n\`\`\`\n\n`);
    await setSource2View(page);
    // sourceEditText = "```js\ncode\n```"
    // Cursor at offset 4 (between j and s)
    await setCursorInCodeBlock(page, 4);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`j!s\ncode\n\`\`\``);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`j!@s\ncode\n\`\`\``);
  });

  test(`delete in language tag`, async () => {
    await loadContent(page, `\`\`\`js\ncode\n\`\`\`\n\n`);
    await setSource2View(page);
    // Cursor at offset 3 (before j): "```js..."
    //                                     ^
    await setCursorInCodeBlock(page, 3);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`s\ncode\n\`\`\``);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`!s\ncode\n\`\`\``);
  });

  test(`backspace in language tag`, async () => {
    await loadContent(page, `\`\`\`js\ncode\n\`\`\`\n\n`);
    await setSource2View(page);
    // Cursor at offset 5 (after s): "```js..."
    //                                      ^
    await setCursorInCodeBlock(page, 5);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`j\ncode\n\`\`\``);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`j!\ncode\n\`\`\``);
  });
});

test.describe(`Code fence — eight ticks, no language`, () => {
  test(`insert on opening fence`, async () => {
    const fence = `\``.repeat(8);
    await loadContent(page, `${fence}\ncode\n${fence}\n\n`);
    await setSource2View(page);
    // Cursor at offset 4 (middle of opening fence)
    await setCursorInCodeBlock(page, 4);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    const md = await getMarkdown();
    // "````!````\ncode\n````````"
    expect(md).toBe(`\`\`\`\`!\`\`\`\`\ncode\n${fence}`);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`\`!@\`\`\`\`\ncode\n${fence}`);
  });

  test(`delete on opening fence`, async () => {
    const fence = `\``.repeat(8);
    await loadContent(page, `${fence}\ncode\n${fence}\n\n`);
    await setSource2View(page);
    // Cursor at offset 0
    await setCursorInCodeBlock(page, 0);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    // Opening fence loses one tick: 7 ticks
    expect(await getMarkdown()).toBe(`\`\`\`\`\`\`\`\ncode\n${fence}`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`!\`\`\`\`\`\`\`\ncode\n${fence}`);
  });

  test(`backspace on opening fence`, async () => {
    const fence = `\``.repeat(8);
    await loadContent(page, `${fence}\ncode\n${fence}\n\n`);
    await setSource2View(page);
    // Cursor at offset 4 (middle of fence)
    await setCursorInCodeBlock(page, 4);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`\`\`\`\`\ncode\n${fence}`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`\`\`\`!\`\`\`\`\ncode\n${fence}`);
  });
});

test.describe(`Code fence — eight ticks, with language`, () => {
  test(`insert in language tag`, async () => {
    const fence = `\``.repeat(8);
    await loadContent(page, `${fence}python\ncode\n${fence}\n\n`);
    await setSource2View(page);
    // sourceEditText = "````````python\ncode\n````````"
    // Cursor at offset 11 (between "pyt" and "hon")
    await setCursorInCodeBlock(page, 11);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`${fence}pyt!hon\ncode\n${fence}`);
    await page.keyboard.type(`@`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`${fence}pyt!@hon\ncode\n${fence}`);
  });

  test(`delete in language tag`, async () => {
    const fence = `\``.repeat(8);
    await loadContent(page, `${fence}python\ncode\n${fence}\n\n`);
    await setSource2View(page);
    // Cursor at offset 8 (before 'p')
    await setCursorInCodeBlock(page, 8);
    await page.keyboard.press(`Delete`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`${fence}ython\ncode\n${fence}`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`${fence}!ython\ncode\n${fence}`);
  });

  test(`backspace in language tag`, async () => {
    const fence = `\``.repeat(8);
    await loadContent(page, `${fence}python\ncode\n${fence}\n\n`);
    await setSource2View(page);
    // Cursor at offset 14 (after 'n' in "python")
    await setCursorInCodeBlock(page, 14);
    await page.keyboard.press(`Backspace`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`${fence}pytho\ncode\n${fence}`);
    await page.keyboard.type(`!`);
    await page.waitForTimeout(200);
    expect(await getMarkdown()).toBe(`${fence}pytho!\ncode\n${fence}`);
  });
});
