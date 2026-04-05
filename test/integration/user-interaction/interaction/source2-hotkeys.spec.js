/**
 * @fileoverview Integration tests for keyboard shortcuts in source2 mode.
 *
 * Verifies that formatting hotkeys (Ctrl+B, Ctrl+I, Ctrl+K, etc.) work
 * in the source2 textarea by triggering the same code path as toolbar
 * button clicks.
 */
import { expect, test } from '@playwright/test';
import {
  MOD,
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
 * Returns the current textarea value in source2 mode.
 * @returns {Promise<string>}
 */
async function getTextareaValue() {
  return page.locator(`#editor.source-view-v2 textarea`).inputValue();
}

test.describe(`Source2 hotkey formatting`, () => {
  test(`Ctrl+B wraps selected text with ** delimiters`, async () => {
    await loadContent(page, `make this bold`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 9));
    await page.keyboard.press(`${MOD}+b`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`make **this** bold`);
  });

  test(`Ctrl+I wraps selected text with * delimiters`, async () => {
    await loadContent(page, `make this italic`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 9));
    await page.keyboard.press(`${MOD}+i`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`make *this* italic`);
  });

  test(`Ctrl+\` wraps selected text with backtick delimiters`, async () => {
    await loadContent(page, `make this code`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 9));
    await page.keyboard.press(`${MOD}+\``);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`make \`this\` code`);
  });

  test(`Ctrl+B with collapsed cursor bolds the word under the caret`, async () => {
    await loadContent(page, `bold this word`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 7));
    await page.keyboard.press(`${MOD}+b`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`bold **this** word`);
  });

  test(`Ctrl+Alt+1 changes line to heading 1`, async () => {
    await loadContent(page, `plain paragraph`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));
    await page.keyboard.press(`${MOD}+Alt+1`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`# plain paragraph`);
  });

  test(`Ctrl+Alt+0 changes heading back to paragraph`, async () => {
    await loadContent(page, `## a heading`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(5, 5));
    await page.keyboard.press(`${MOD}+Alt+0`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`a heading`);
  });

  test(`Ctrl+Shift+Q toggles blockquote prefix`, async () => {
    await loadContent(page, `a quote`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));
    await page.keyboard.press(`${MOD}+Shift+q`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`> a quote`);
  });

  test(`Ctrl+Shift+- wraps selected text with ~~ delimiters`, async () => {
    await loadContent(page, `strike this out`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 11));
    await page.keyboard.press(`${MOD}+Shift+-`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`strike ~~this~~ out`);
  });

  test(`Ctrl+Shift+ArrowDown wraps selected text with <sub> tags`, async () => {
    await loadContent(page, `H2O`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(1, 2));
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`H<sub>2</sub>O`);
  });

  test(`Ctrl+Shift+ArrowUp wraps selected text with <sup> tags`, async () => {
    await loadContent(page, `x2`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(1, 2));
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`x<sup>2</sup>`);
  });

  test(`Ctrl+Shift+B toggles unordered list prefix`, async () => {
    await loadContent(page, `a list item`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));
    await page.keyboard.press(`${MOD}+Shift+b`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`- a list item`);
  });

  test(`Ctrl+Shift+N toggles ordered list prefix`, async () => {
    await loadContent(page, `a numbered item`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));
    await page.keyboard.press(`${MOD}+Shift+n`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`1. a numbered item`);
  });

  test(`Ctrl+Shift+X toggles checklist prefix`, async () => {
    await loadContent(page, `a task`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(2, 2));
    await page.keyboard.press(`${MOD}+Shift+x`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`- [ ] a task`);
  });

  test(`Ctrl+Shift+I opens the image dialog`, async () => {
    await loadContent(page, `some text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await page.keyboard.press(`${MOD}+Shift+i`);
    await page.waitForTimeout(200);

    const dialog = page.locator(`.image-dialog`);
    await expect(dialog).toBeVisible();

    // Close the dialog
    await page.locator(`.image-btn--cancel`).click();
  });

  test(`Ctrl+Shift+T opens the table dialog`, async () => {
    await loadContent(page, `some text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await page.keyboard.press(`${MOD}+Shift+t`);
    await page.waitForTimeout(200);

    const dialog = page.locator(`.table-dialog`);
    await expect(dialog).toBeVisible();

    // Close the dialog
    await page.locator(`.table-btn--cancel`).click();
  });

  test(`Ctrl+K opens the link dialog`, async () => {
    await loadContent(page, `some text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(200);

    const dialog = page.locator(`.link-dialog`);
    await expect(dialog).toBeVisible();

    // Close the dialog
    await page.locator(`.link-btn--cancel`).click();
  });

  test(`Ctrl+K with cursor on a word prefills the link text field`, async () => {
    await loadContent(page, `click here please`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(8, 8));
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(200);

    const dialog = page.locator(`.link-dialog`);
    await expect(dialog).toBeVisible();

    const textInput = page.locator(`#link-text`);
    await expect(textInput).toHaveValue(`here`);

    // Close the dialog
    await page.locator(`.link-btn--cancel`).click();
  });

  test(`Ctrl+K link dialog inserts markdown link`, async () => {
    await loadContent(page, `click here please`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(8, 8));
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(200);

    const urlInput = page.locator(`#link-url`);
    await urlInput.fill(`https://example.com`);
    await page.locator(`.link-btn--insert`).click();
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`click [here](https://example.com) please`);
  });

  test(`Ctrl+K with selected text prefills the link text field`, async () => {
    await loadContent(page, `click here please`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 10));
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(200);

    const dialog = page.locator(`.link-dialog`);
    await expect(dialog).toBeVisible();

    const textInput = page.locator(`#link-text`);
    await expect(textInput).toHaveValue(`here`);

    await page.locator(`.link-btn--cancel`).click();
  });

  test(`Ctrl+K with no word under cursor opens dialog with empty text`, async () => {
    await loadContent(page, `hello  world`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    // Place cursor on the second space (between the two spaces)
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 6));
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(200);

    const dialog = page.locator(`.link-dialog`);
    await expect(dialog).toBeVisible();

    const textInput = page.locator(`#link-text`);
    await expect(textInput).toHaveValue(``);

    await page.locator(`.link-btn--cancel`).click();
  });

  test(`Ctrl+K with selection inserts link replacing the selection`, async () => {
    await loadContent(page, `click here please`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 10));
    await page.keyboard.press(`${MOD}+k`);
    await page.waitForTimeout(200);

    const urlInput = page.locator(`#link-url`);
    await urlInput.fill(`https://example.com`);
    await page.locator(`.link-btn--insert`).click();
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`click [here](https://example.com) please`);
  });

  test(`Ctrl+B with collapsed cursor toggles bold off on already-bold word`, async () => {
    await loadContent(page, `some **bold** text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(8, 8));
    await page.keyboard.press(`${MOD}+b`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`some bold text`);
  });

  test(`Ctrl+I with collapsed cursor toggles italic off on already-italic word`, async () => {
    await loadContent(page, `some *italic* text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 7));
    await page.keyboard.press(`${MOD}+i`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`some italic text`);
  });

  test(`Ctrl+Shift+- with collapsed cursor toggles strikethrough off`, async () => {
    await loadContent(page, `some ~~struck~~ text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(9, 9));
    await page.keyboard.press(`${MOD}+Shift+-`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`some struck text`);
  });

  test(`Ctrl+\` with collapsed cursor toggles code off on already-code word`, async () => {
    await loadContent(page, `some \`code\` text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 7));
    await page.keyboard.press(`${MOD}+\``);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`some code text`);
  });

  test(`Ctrl+I with collapsed cursor does not highlight the word`, async () => {
    await loadContent(page, `italic this word`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(9, 9));
    await page.keyboard.press(`${MOD}+i`);
    await page.waitForTimeout(200);

    const selStart = await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el) => el.selectionStart,
    );
    const selEnd = await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el) => el.selectionEnd,
    );
    expect(selStart).toBe(selEnd);
  });

  test(`Ctrl+Shift+ArrowUp with collapsed cursor does not highlight the word`, async () => {
    await loadContent(page, `x squared`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await page.waitForTimeout(200);

    const selStart = await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el) => el.selectionStart,
    );
    const selEnd = await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el) => el.selectionEnd,
    );
    expect(selStart).toBe(selEnd);
  });

  test(`Ctrl+Shift+ArrowDown with collapsed cursor does not highlight the word`, async () => {
    await loadContent(page, `H2O`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(1, 1));
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await page.waitForTimeout(200);

    const selStart = await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el) => el.selectionStart,
    );
    const selEnd = await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el) => el.selectionEnd,
    );
    expect(selStart).toBe(selEnd);
  });

  test(`Ctrl+Shift+ArrowUp with collapsed cursor toggles superscript off`, async () => {
    await loadContent(page, `x<sup>2</sup> is`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 6));
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`x2 is`);
  });

  test(`Ctrl+Shift+ArrowDown with collapsed cursor toggles subscript off`, async () => {
    await loadContent(page, `H<sub>2</sub>O`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 6));
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`H2O`);
  });

  test(`Ctrl+Shift+ArrowUp on selected subscript text replaces sub with sup`, async () => {
    await loadContent(page, `H<sub>2</sub>O`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 7));
    await page.keyboard.press(`${MOD}+Shift+ArrowUp`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`H<sup>2</sup>O`);
  });

  test(`Ctrl+Shift+ArrowDown on selected superscript text replaces sup with sub`, async () => {
    await loadContent(page, `x<sup>2</sup>`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(6, 7));
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toBe(`x<sub>2</sub>`);
  });

  test(`Ctrl+Shift+C toggles code-block prefix`, async () => {
    await loadContent(page, `some code`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(3, 3));
    await page.keyboard.press(`${MOD}+Shift+c`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue();
    expect(value).toContain(`\`\`\``);
  });

  test(`applying same format twice with collapsed cursor toggles it off`, async () => {
    await loadContent(page, `some text`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(7, 7));
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await page.waitForTimeout(200);

    let value = await getTextareaValue();
    expect(value).toBe(`some <sub>text</sub>`);

    // Move cursor back onto the word and toggle off
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) =>
      el.setSelectionRange(10, 10),
    );
    await page.keyboard.press(`${MOD}+Shift+ArrowDown`);
    await page.waitForTimeout(200);

    value = await getTextareaValue();
    expect(value).toBe(`some text`);
  });
});
