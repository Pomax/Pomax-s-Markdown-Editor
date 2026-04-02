/**
 * @fileoverview Integration tests for list support (GitHub issue #40).
 *
 * Covers:
 *   - Converting a paragraph to a bullet list item via toolbar
 *   - Converting a paragraph to a numbered list item via toolbar
 *   - Toggling off: clicking same list button converts back to paragraph
 *   - Switching: clicking other list button converts list type
 *   - Enter key creates a new list item
 *   - Enter on empty list item exits the list
 *   - Container button on list item converts type and splits list
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  HOME,
  MOD,
  closeApp,
  getSourceLineText,
  launchApp,
  loadContent,
  projectRoot,
  setSource2View,
  setWritingView,
} from '../../test-utils.js';

const fixturePath = path.join(projectRoot, `test`, `fixtures`, `list-items.md`);
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

test(`clicking bullet list button converts paragraph to unordered list item`, async () => {
  await loadContent(page, fixtureContent);
  await setWritingView(page);

  // Click on the first paragraph to focus it
  const firstLine = page.locator(`#editor [data-node-id]`, { hasText: `First paragraph` }).first();
  await firstLine.click();
  await page.waitForTimeout(200);

  // Click the bullet list button
  await page.locator(`.toolbar-button[data-button-id="unordered-list"]`).click();
  await page.waitForTimeout(200);

  // Switch to source view to verify the markdown
  await setSource2View(page);

  // The first line should now be a list item
  const text = await getSourceLineText(page, 0);
  expect(text).toMatch(/^- First paragraph/);
});

test(`clicking numbered list button converts paragraph to ordered list item`, async () => {
  await loadContent(page, fixtureContent);
  await setWritingView(page);

  // Click on the first paragraph to focus it
  const firstLine = page.locator(`#editor [data-node-id]`, { hasText: `First paragraph` }).first();
  await firstLine.click();
  await page.waitForTimeout(200);

  // Click the ordered list button
  await page.locator(`.toolbar-button[data-button-id="ordered-list"]`).click();
  await page.waitForTimeout(200);

  // Switch to source view to verify
  await setSource2View(page);

  const text = await getSourceLineText(page, 0);
  expect(text).toMatch(/^1\. First paragraph/);
});

test(`clicking bullet list button on bullet list item toggles back to paragraph`, async () => {
  await loadContent(page, `- Existing bullet item\n`);
  await setWritingView(page);

  const line = page.locator(`#editor [data-node-id]`, { hasText: `Existing bullet item` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Click bullet list button to toggle off
  await page.locator(`.toolbar-button[data-button-id="unordered-list"]`).click();
  await page.waitForTimeout(200);

  await setSource2View(page);

  const text = await getSourceLineText(page, 0);
  expect(text).toBe(`Existing bullet item`);
});

test(`clicking numbered list button on bullet list item switches to ordered`, async () => {
  await loadContent(page, `- Bullet item\n`);
  await setWritingView(page);

  const line = page.locator(`#editor [data-node-id]`, { hasText: `Bullet item` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Click ordered list button to switch
  await page.locator(`.toolbar-button[data-button-id="ordered-list"]`).click();
  await page.waitForTimeout(200);

  await setSource2View(page);

  const text = await getSourceLineText(page, 0);
  expect(text).toMatch(/^1\. Bullet item/);
});

test(`Enter key in a list item creates a new list item`, async () => {
  await loadContent(page, `- First item\n`);
  await setWritingView(page);

  const line = page.locator(`#editor [data-node-id]`, { hasText: `First item` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Press End to move cursor to end of line, then Enter
  await page.keyboard.press(`End`);
  await page.keyboard.press(`Enter`);
  await page.waitForTimeout(200);

  // Type text in the new list item
  await page.keyboard.type(`Second item`);
  await page.waitForTimeout(200);

  await setSource2View(page);

  const first = await getSourceLineText(page, 0);
  const second = await getSourceLineText(page, 1);
  expect(first).toMatch(/^- First item/);
  expect(second).toMatch(/^- Second item/);
});

test(`Enter on empty list item exits the list to a paragraph`, async () => {
  await loadContent(page, `- First item\n- \n`);
  await setWritingView(page);

  // Click on the empty list item (second line)
  const lines = page.locator(`#editor [data-node-id]`);
  await lines.nth(1).click();
  await page.waitForTimeout(200);

  // Press Enter on the empty list item
  await page.keyboard.press(`Enter`);
  await page.waitForTimeout(200);

  await setSource2View(page);

  // The second line should now be a plain (empty) paragraph, not a list item
  const text = await getSourceLineText(page, 1);
  // An empty paragraph renders as an empty line (no list marker)
  expect(text.trim()).toBe(``);
});

test(`heading button on list item converts to heading`, async () => {
  await loadContent(page, `- Item before\n- Target item\n- Item after\n`);
  await setWritingView(page);

  const line = page.locator(`#editor [data-node-id]`, { hasText: `Target item` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Click heading 2 button
  await page.locator(`.toolbar-button[data-button-id="heading2"]`).click();
  await page.waitForTimeout(200);

  await setSource2View(page);

  const first = await getSourceLineText(page, 0);
  const second = await getSourceLineText(page, 2);
  const third = await getSourceLineText(page, 4);

  expect(first).toMatch(/^- Item before/);
  expect(second).toMatch(/^## Target item/);
  expect(third).toMatch(/^- Item after/);
});

test(`Enter in ordered list creates item with incremented number`, async () => {
  await loadContent(page, `1. First\n2. Second\n`);
  await setWritingView(page);

  // Click on the first ordered item
  const line = page.locator(`#editor [data-node-id]`, { hasText: `First` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Move to end and press Enter
  await page.keyboard.press(`End`);
  await page.keyboard.press(`Enter`);
  await page.waitForTimeout(200);

  await page.keyboard.type(`Inserted`);
  await page.waitForTimeout(200);

  await setSource2View(page);

  const first = await getSourceLineText(page, 0);
  const second = await getSourceLineText(page, 1);
  const third = await getSourceLineText(page, 2);

  expect(first).toMatch(/^1\. First/);
  expect(second).toMatch(/^2\. Inserted/);
  expect(third).toMatch(/^3\. Second/);
});

test(`toggling off a list item converts the entire contiguous list to paragraphs`, async () => {
  await loadContent(page, `- Alpha\n- Beta\n- Gamma\n`);
  await setWritingView(page);

  // Click on the middle item
  const line = page.locator(`#editor [data-node-id]`, { hasText: `Beta` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Click bullet list button to toggle off
  await page.locator(`.toolbar-button[data-button-id="unordered-list"]`).click();
  await page.waitForTimeout(200);

  await setSource2View(page);

  const first = await getSourceLineText(page, 0);
  const second = await getSourceLineText(page, 2);
  const third = await getSourceLineText(page, 4);
  expect(first).toBe(`Alpha`);
  expect(second).toBe(`Beta`);
  expect(third).toBe(`Gamma`);
});

test(`switching list type converts the entire contiguous list`, async () => {
  await loadContent(page, `- Alpha\n- Beta\n- Gamma\n`);
  await setWritingView(page);

  // Click on the first item
  const line = page.locator(`#editor [data-node-id]`, { hasText: `Alpha` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Click ordered list button to switch
  await page.locator(`.toolbar-button[data-button-id="ordered-list"]`).click();
  await page.waitForTimeout(200);

  await setSource2View(page);

  const first = await getSourceLineText(page, 0);
  const second = await getSourceLineText(page, 1);
  const third = await getSourceLineText(page, 2);
  expect(first).toMatch(/^1\. Alpha/);
  expect(second).toMatch(/^2\. Beta/);
  expect(third).toMatch(/^3\. Gamma/);
});

test(`Enter on empty middle ordered item renumbers remaining items`, async () => {
  await loadContent(page, `1. Alpha\n2. Beta\n3. Gamma\n`);
  await setWritingView(page);

  // Click on Beta to focus it
  const line = page.locator(`#editor [data-node-id]`, { hasText: `Beta` }).first();
  await line.click();
  await page.waitForTimeout(200);

  // Select all text in Beta and delete it — the empty item is removed
  // automatically and remaining items are renumbered.
  await page.keyboard.press(`${MOD}+a`);
  await page.keyboard.press(`Backspace`);
  await page.waitForTimeout(200);

  await setSource2View(page);

  const first = await getSourceLineText(page, 0);
  const second = await getSourceLineText(page, 1);
  // Alpha keeps its number, Gamma renumbered to 2 (Beta was removed)
  expect(first).toMatch(/^1\. Alpha/);
  expect(second).toMatch(/^2\. Gamma/);
});

test(`pasting multi-line markdown with list items creates correct nodes`, async () => {
  // Start with an empty paragraph — the user's exact scenario
  await loadContent(page, `\n`);
  await setSource2View(page);

  // Focus the textarea
  const textarea = page.locator(`#editor textarea`);
  await textarea.click();
  await page.waitForTimeout(200);

  // Write the full multi-line content to the clipboard and paste via Ctrl+V.
  const pasteText = `test\n\n1. one\n2. two\n3. three`;
  await electronApp.evaluate(({ clipboard }, text) => {
    clipboard.writeText(text);
  }, pasteText);
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(300);

  const value = await textarea.inputValue();
  expect(value).toContain(`test`);
  expect(value).toContain(`1. one`);
  expect(value).toContain(`2. two`);
  expect(value).toContain(`3. three`);
});

test(`pasting multi-line markdown with CRLF line endings parses correctly`, async () => {
  await loadContent(page, `\n`);
  await setSource2View(page);

  const textarea = page.locator(`#editor textarea`);
  await textarea.click();
  await page.waitForTimeout(200);

  // Use \r\n (Windows clipboard line endings)
  const pasteText = `test\r\n\r\n1. one\r\n2. two\r\n3. three`;
  await electronApp.evaluate(({ clipboard }, text) => {
    clipboard.writeText(text);
  }, pasteText);
  await page.keyboard.press(`${MOD}+v`);
  await page.waitForTimeout(300);

  const value = await textarea.inputValue();
  expect(value).toContain(`1. one`);
  expect(value).toContain(`2. two`);
  expect(value).toContain(`3. three`);
});
