/**
 * @fileoverview Integration test for clicking outside the editor to defocus.
 *
 * In writing mode all nodes render as WYSIWYG (formatted output, no
 * raw markdown syntax).  When the user clicks outside the editor the editor
 * should blur (handleBlur fires) and clear its active node highlight.
 *
 * All defocus actions use real mouse clicks on the #editor-container
 * padding, not synthetic blur() calls.
 */

import { expect, test } from '@playwright/test';
import {
  clickInEditor,
  closeApp,
  launchApp,
  loadContent,
  setWritingView,
} from '../../test-utils.js';

const markdown = "# My Heading\n\nA paragraph of text.\n\n\```js\nconst x = 1;\n```";

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
 * Clicks the #editor-container padding (outside #editor) using real
 * mouse coordinates.
 * @param {import('@playwright/test').Page} pg
 */
async function clickEditorContainerPadding(pg) {
  const containerBox = await pg.locator(`#editor-container`).boundingBox();
  const editorBox = await pg.locator(`#editor`).boundingBox();
  if (!containerBox || !editorBox) throw new Error(`could not get bounding boxes`);
  const x = editorBox.x + editorBox.width + (containerBox.x + containerBox.width - editorBox.x - editorBox.width) / 2;
  const y = containerBox.y + containerBox.height / 2;
  await pg.mouse.click(x, y);
  await pg.waitForTimeout(200);
}

/**
 * Returns the computed background-color of a locator's element.
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<string>}
 */
async function getComputedBg(locator) {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

test(`loading content gives the editor DOM focus so defocus works without a prior click`, async () => {
  await loadContent(page, markdown);
  await setWritingView(page);

  const hasFocus = await page.evaluate(() => {
    return document.activeElement === document.querySelector(`#editor`);
  });
  expect(hasFocus, `editor should have DOM focus after loadContent`).toBe(true);

  const heading = page.locator(`#editor [data-node-id]`).first();
  const focusedText = await heading.innerText();
  expect(focusedText).not.toContain(`#`);
  expect(focusedText).toContain(`My Heading`);

  await clickEditorContainerPadding(page);

  const defocusedText = await page.locator(`#editor [data-node-id]`).first().innerText();
  expect(defocusedText).not.toContain(`#`);
  expect(defocusedText).toContain(`My Heading`);
});

test(`clicking a node gives it a focus highlight, clicking outside clears it`, async () => {
  await loadContent(page, markdown);
  await setWritingView(page);

  const heading = page.locator(`#editor [data-node-id]`).first();
  await clickInEditor(page, heading);
  await page.waitForTimeout(200);

  const focusedBg = await getComputedBg(heading);
  expect(focusedBg).not.toBe(`rgba(0, 0, 0, 0)`);

  await clickEditorContainerPadding(page);

  const defocusedBg = await getComputedBg(page.locator(`#editor [data-node-id]`).first());
  expect(defocusedBg).toBe(`rgba(0, 0, 0, 0)`);
});

test(`clicking back into a node after defocus restores focus highlight`, async () => {
  await loadContent(page, markdown);
  await setWritingView(page);

  const heading = page.locator(`#editor [data-node-id]`).first();
  await clickInEditor(page, heading);
  await page.waitForTimeout(200);
  await clickEditorContainerPadding(page);

  await clickInEditor(page, page.locator(`#editor [data-node-id]`).first());
  await page.waitForTimeout(200);

  const refocusedBg = await getComputedBg(page.locator(`#editor [data-node-id]`).first());
  expect(refocusedBg).not.toBe(`rgba(0, 0, 0, 0)`);
});

test(`code block keeps syntax highlighting after defocus`, async () => {
  await loadContent(page, markdown);
  await setWritingView(page);

  const codeBlock = page.locator(`#editor [data-node-id]`).nth(2);
  await clickInEditor(page, codeBlock);
  await page.waitForTimeout(200);

  await clickEditorContainerPadding(page);

  const refetchedBlock = page.locator(`#editor [data-node-id]`).nth(2);
  await expect(refetchedBlock).not.toHaveAttribute(`data-has-focus`, ``);

  const highlightSpans = refetchedBlock.locator(`[class^="sh-"]`);
  expect(await highlightSpans.count()).toBeGreaterThan(0);
});

test(`clicking back into the editor after defocus restores cursor`, async () => {
  await loadContent(page, markdown);
  await setWritingView(page);
  await clickEditorContainerPadding(page);

  const paragraph = page.locator(`#editor [data-node-id]`).nth(1);
  await clickInEditor(page, paragraph);
  await page.waitForTimeout(200);

  const headingText = await page.locator(`#editor [data-node-id]`).first().innerText();
  expect(headingText).not.toContain(`#`);
  expect(headingText).toContain(`My Heading`);

  const paraText = await paragraph.innerText();
  expect(paraText).toContain(`A paragraph of text.`);
});
