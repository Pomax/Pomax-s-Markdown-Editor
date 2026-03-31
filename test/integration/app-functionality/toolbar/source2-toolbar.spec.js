/**
 * @fileoverview Integration tests for toolbar button clicks in source2 mode.
 *
 * Verifies that clicking toolbar buttons (bold, italic, strikethrough,
 * heading, blockquote, list, code, code-block) correctly modifies the
 * textarea content when the editor is in source2 mode. This exercises
 * the button-click → getFormatter() → source2-formatter code path.
 *
 * Uses the project README.md as the base fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  closeApp,
  launchApp,
  loadContent,
  projectRoot,
  setSource2View,
  setWritingView,
} from '../../test-utils.js';

const readmeContent = fs.readFileSync(path.join(projectRoot, `README.md`), `utf-8`);

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
 * Returns the current textarea value in source2 mode.
 * @param {import('@playwright/test').Page} pg
 * @returns {Promise<string>}
 */
async function getTextareaValue(pg) {
  return pg.locator(`#editor.source-view-v2 textarea`).inputValue();
}

/**
 * Click a toolbar button by its data-button-id.
 * @param {import('@playwright/test').Page} pg
 * @param {string} buttonId
 */
async function clickToolbarButton(pg, buttonId) {
  await pg.locator(`[data-button-id="${buttonId}"]`).click();
  await pg.waitForTimeout(200);
}

test.describe(`Source2 toolbar — inline formatting via button click`, () => {
  test(`bold button wraps selected text with ** delimiters`, async () => {
    await loadContent(page, readmeContent);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    // Select the first 5 characters of the textarea
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 7));
    const before = await getTextareaValue(page);
    const selected = before.substring(2, 7);

    await clickToolbarButton(page, `bold`);

    const after = await getTextareaValue(page);
    expect(after).toContain(`**${selected}**`);
  });

  test(`italic button wraps selected text with * delimiters`, async () => {
    await loadContent(page, `make this italic`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 9));

    await clickToolbarButton(page, `italic`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`make *this* italic`);
  });

  test(`strikethrough button wraps selected text with ~~ delimiters`, async () => {
    await loadContent(page, `strike this out`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 11));

    await clickToolbarButton(page, `strikethrough`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`strike ~~this~~ out`);
  });

  test(`code button wraps selected text with backtick delimiters`, async () => {
    await loadContent(page, `make this code`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 9));

    await clickToolbarButton(page, `code`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`make \`this\` code`);
  });

  test(`subscript button wraps selected text with <sub> tags`, async () => {
    await loadContent(page, `H2O`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(1, 2));

    await clickToolbarButton(page, `subscript`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`H<sub>2</sub>O`);
  });

  test(`superscript button wraps selected text with <sup> tags`, async () => {
    await loadContent(page, `x2`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(1, 2));

    await clickToolbarButton(page, `superscript`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`x<sup>2</sup>`);
  });
});

test.describe(`Source2 toolbar — block formatting via button click`, () => {
  test(`heading1 button adds # prefix to the current line`, async () => {
    await loadContent(page, `plain paragraph`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));

    await clickToolbarButton(page, `heading1`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`# plain paragraph`);
  });

  test(`heading2 button adds ## prefix to the current line`, async () => {
    await loadContent(page, `plain paragraph`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));

    await clickToolbarButton(page, `heading2`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`## plain paragraph`);
  });

  test(`heading3 button adds ### prefix to the current line`, async () => {
    await loadContent(page, `plain paragraph`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));

    await clickToolbarButton(page, `heading3`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`### plain paragraph`);
  });

  test(`paragraph button removes heading prefix`, async () => {
    await loadContent(page, `## a heading`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 5));

    await clickToolbarButton(page, `paragraph`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`a heading`);
  });

  test(`blockquote button adds > prefix to the current line`, async () => {
    await loadContent(page, `a quote`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));

    await clickToolbarButton(page, `blockquote`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`> a quote`);
  });

  test(`unordered-list button adds - prefix to the current line`, async () => {
    await loadContent(page, `a list item`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));

    await clickToolbarButton(page, `unordered-list`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`- a list item`);
  });

  test(`ordered-list button adds 1. prefix to the current line`, async () => {
    await loadContent(page, `a numbered item`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));

    await clickToolbarButton(page, `ordered-list`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`1. a numbered item`);
  });

  test(`checklist button adds - [ ] prefix to the current line`, async () => {
    await loadContent(page, `a task`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));

    await clickToolbarButton(page, `checklist`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`- [ ] a task`);
  });

  test(`code-block button wraps content with triple-backtick fences`, async () => {
    await loadContent(page, `some code`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));

    await clickToolbarButton(page, `code-block`);

    const value = await getTextareaValue(page);
    expect(value).toContain(`\`\`\``);
  });
});

test.describe(`Source2 toolbar — collapsed cursor formatting`, () => {
  test(`bold button with collapsed cursor bolds the word under the caret`, async () => {
    await loadContent(page, `bold this word`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 7));

    await clickToolbarButton(page, `bold`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`bold **this** word`);
  });

  test(`italic button with collapsed cursor italicizes the word under the caret`, async () => {
    await loadContent(page, `italic this word`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(9, 9));

    await clickToolbarButton(page, `italic`);

    const value = await getTextareaValue(page);
    expect(value).toBe(`italic *this* word`);
  });
});

test.describe(`Source2 toolbar — README.md content`, () => {
  test(`toolbar bold on README content modifies textarea correctly`, async () => {
    await loadContent(page, readmeContent);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();

    // The README starts with "# Pomax's Markdown Editor" — select "Markdown"
    const value = await getTextareaValue(page);
    const markdownIdx = value.indexOf(`Markdown`);
    expect(markdownIdx).toBeGreaterThan(-1);
    await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el, range) => el.setSelectionRange(range[0], range[1]),
      [markdownIdx, markdownIdx + 8],
    );

    await clickToolbarButton(page, `bold`);

    const after = await getTextareaValue(page);
    expect(after).toContain(`**Markdown**`);
  });
});
