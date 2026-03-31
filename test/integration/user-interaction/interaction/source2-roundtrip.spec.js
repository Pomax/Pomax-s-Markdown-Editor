/**
 * @fileoverview Integration tests for source2 round-trip and tree identity.
 *
 * Verifies that switching to source2 mode shows the correct markdown,
 * that edits in the textarea are reflected after switching back to
 * writing view, and that node IDs are preserved for unchanged nodes
 * across the round-trip.
 *
 * Uses the project README.md as the fixture document.
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
 * Collects all data-node-id attribute values from the editor DOM.
 * @param {import('@playwright/test').Page} pg
 * @returns {Promise<string[]>}
 */
async function collectNodeIds(pg) {
  return pg.evaluate(() => {
    const nodes = document.querySelectorAll(`#editor [data-node-id]`);
    return Array.from(nodes).map((el) => el.getAttribute(`data-node-id`) ?? ``);
  });
}

/**
 * Returns the markdown content from the editor API.
 * @param {import('@playwright/test').Page} pg
 * @returns {Promise<string>}
 */
async function getEditorMarkdown(pg) {
  return pg.evaluate(() => window.editorAPI?.getContent() ?? ``);
}

test.describe(`Source2 textarea content`, () => {
  test(`switching to source2 shows a textarea with the document markdown`, async () => {
    await loadContent(page, readmeContent);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await expect(textarea).toBeAttached();

    const value = await getTextareaValue(page);
    // The textarea content should match the tree's toMarkdown() output.
    // Compare via the editor API which calls toMarkdown() internally.
    const editorMarkdown = await page.evaluate(() => {
      const editor = /** @type {any} */ (window).__editor;
      return editor?.syntaxTree?.toMarkdown() ?? ``;
    });
    expect(value).toBe(editorMarkdown);
  });

  test(`typing in the textarea modifies its value`, async () => {
    await loadContent(page, `hello world`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    // Move cursor to end and type
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => {
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.keyboard.type(` appended`);
    await page.waitForTimeout(200);

    const value = await getTextareaValue(page);
    expect(value).toContain(`hello world appended`);
  });
});

test.describe(`Source2 round-trip without edits`, () => {
  test(`writing → source2 → writing preserves the document unchanged`, async () => {
    await loadContent(page, readmeContent);

    // Capture the markdown before the round-trip.
    const markdownBefore = await getEditorMarkdown(page);

    await setSource2View(page);
    // Do not edit anything.
    await setWritingView(page);

    // Wait for render to settle.
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const markdownAfter = await getEditorMarkdown(page);
    expect(markdownAfter).toBe(markdownBefore);
  });
});

test.describe(`Source2 round-trip with edits`, () => {
  test(`editing in source2 and switching back to writing reflects the change`, async () => {
    await loadContent(page, `hello world`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    // Select "hello" and replace it
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => el.setSelectionRange(0, 5));
    await page.keyboard.type(`goodbye`);
    await page.waitForTimeout(200);

    await setWritingView(page);

    const text = await page.locator(`#editor [data-node-id]`).first().innerText();
    expect(text).toBe(`goodbye world`);
  });

  test(`adding a new paragraph in source2 shows it in writing view`, async () => {
    await loadContent(page, `first paragraph`);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    // Move to end and add a new paragraph
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => {
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.keyboard.type(`\n\nsecond paragraph`);
    await page.waitForTimeout(200);

    await setWritingView(page);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const nodes = page.locator(`#editor [data-node-id]`);
    // Should have at least 2 content nodes (original + new)
    const count = await nodes.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const texts = [];
    for (let i = 0; i < count; i++) {
      texts.push(await nodes.nth(i).innerText());
    }
    expect(texts).toContain(`first paragraph`);
    expect(texts).toContain(`second paragraph`);
  });

  test(`editing README content in source2 and switching back preserves the edit`, async () => {
    await loadContent(page, readmeContent);
    await setSource2View(page);

    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();

    // Find "Markdown Editor" in the textarea and replace "Editor" with "Tool"
    const value = await getTextareaValue(page);
    const editorIdx = value.indexOf(`Markdown Editor`);
    expect(editorIdx).toBeGreaterThan(-1);

    const replaceStart = editorIdx + `Markdown `.length;
    const replaceEnd = replaceStart + `Editor`.length;
    await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el, range) => el.setSelectionRange(range[0], range[1]),
      [replaceStart, replaceEnd],
    );
    await page.keyboard.type(`Tool`);
    await page.waitForTimeout(200);

    await setWritingView(page);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const firstNode = await page.locator(`#editor [data-node-id]`).first().innerText();
    expect(firstNode).toContain(`Markdown Tool`);
  });
});

test.describe(`Source2 tree identity preservation`, () => {
  test(`unchanged nodes keep their data-node-id after a no-edit round-trip`, async () => {
    await loadContent(page, readmeContent);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    // Collect node IDs in writing view before the round-trip.
    const idsBefore = await collectNodeIds(page);
    expect(idsBefore.length).toBeGreaterThan(0);

    await setSource2View(page);
    // No edits.
    await setWritingView(page);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const idsAfter = await collectNodeIds(page);

    // Every ID from before should still be present after the round-trip.
    for (const id of idsBefore) {
      expect(idsAfter).toContain(id);
    }
  });

  test(`unchanged nodes keep their IDs when only one node is edited`, async () => {
    await loadContent(page, `first paragraph\n\nsecond paragraph\n\nthird paragraph`);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const idsBefore = await collectNodeIds(page);
    expect(idsBefore.length).toBeGreaterThanOrEqual(3);

    await setSource2View(page);

    // Edit only the second paragraph
    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    const value = await getTextareaValue(page);
    const secondIdx = value.indexOf(`second paragraph`);
    expect(secondIdx).toBeGreaterThan(-1);
    await textarea.evaluate(
      (/** @type {HTMLTextAreaElement} */ el, range) => el.setSelectionRange(range[0], range[1]),
      [secondIdx, secondIdx + `second paragraph`.length],
    );
    await page.keyboard.type(`modified paragraph`);
    await page.waitForTimeout(200);

    await setWritingView(page);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const idsAfter = await collectNodeIds(page);

    // The first and third node IDs should be preserved.
    expect(idsAfter).toContain(idsBefore[0]);
    expect(idsAfter).toContain(idsBefore[2]);

    // The second paragraph was edited, so its content should reflect that.
    const secondNode = await page.locator(`#editor [data-node-id]`).nth(1).innerText();
    expect(secondNode).toBe(`modified paragraph`);
  });

  test(`README round-trip preserves most node IDs after a small edit`, async () => {
    await loadContent(page, readmeContent);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const idsBefore = await collectNodeIds(page);

    await setSource2View(page);

    // Make a small edit: append text at the very end
    const textarea = page.locator(`#editor.source-view-v2 textarea`);
    await textarea.focus();
    await textarea.evaluate((/** @type {HTMLTextAreaElement} */ el) => {
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.keyboard.type(`\n\nAppended test paragraph.`);
    await page.waitForTimeout(200);

    await setWritingView(page);
    await page.waitForSelector(`#editor [data-node-id]`);
    await page.waitForTimeout(300);

    const idsAfter = await collectNodeIds(page);

    // Count how many original IDs survived.
    let preserved = 0;
    for (const id of idsBefore) {
      if (idsAfter.includes(id)) preserved++;
    }

    // The vast majority of nodes should be preserved (only the last
    // node might change due to trailing paragraph adjustments).
    const preservedRatio = preserved / idsBefore.length;
    expect(preservedRatio).toBeGreaterThan(0.9);

    // The new paragraph should be in the DOM.
    const markdown = await getEditorMarkdown(page);
    expect(markdown).toContain(`Appended test paragraph.`);
  });
});
