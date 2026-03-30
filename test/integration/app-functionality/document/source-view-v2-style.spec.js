/**
 * @fileoverview Integration tests for the source view v2 textarea styling.
 *
 * Verifies that when switching to source2 mode, the textarea has the
 * correct computed styles: monospace font, no visible border, no resize
 * handle, fills the editor area, and uses the correct colours and font
 * sizing from CSS variables.
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

const loremContent = fs.readFileSync(
  path.join(projectRoot, `test`, `fixtures`, `lorem.md`),
  `utf-8`,
);

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

test(`source2 textarea exists when in source2 mode`, async () => {
  await setSource2View(page);
  const textarea = page.locator(`#editor.source-view-v2 textarea`);
  await expect(textarea).toBeAttached();
  await setWritingView(page);
});

test(`source2 textarea uses monospace font`, async () => {
  await setSource2View(page);
  const fontFamily = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).fontFamily;
  });
  expect(fontFamily).toMatch(/SFMono|Consolas|Liberation Mono|Menlo|monospace/i);
  await setWritingView(page);
});

test(`source2 textarea has no visible border`, async () => {
  await setSource2View(page);
  const styles = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      borderTopWidth: s.borderTopWidth,
      borderRightWidth: s.borderRightWidth,
      borderBottomWidth: s.borderBottomWidth,
      borderLeftWidth: s.borderLeftWidth,
    };
  });
  expect(styles.borderTopWidth).toBe(`0px`);
  expect(styles.borderRightWidth).toBe(`0px`);
  expect(styles.borderBottomWidth).toBe(`0px`);
  expect(styles.borderLeftWidth).toBe(`0px`);
  await setWritingView(page);
});

test(`source2 textarea has no outline when focused`, async () => {
  await setSource2View(page);
  const textarea = page.locator(`#editor.source-view-v2 textarea`);
  await textarea.focus();
  const outlineStyle = await textarea.evaluate((el) => {
    return getComputedStyle(el).outlineStyle;
  });
  expect(outlineStyle).toBe(`none`);
  await setWritingView(page);
});

test(`source2 textarea is not resizable`, async () => {
  await setSource2View(page);
  const resize = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).resize;
  });
  expect(resize).toBe(`none`);
  await setWritingView(page);
});

test(`source2 textarea fills the editor width`, async () => {
  await setSource2View(page);
  const widths = await page.evaluate(() => {
    const editor = document.querySelector(`#editor`);
    const textarea = editor?.querySelector(`textarea`);
    if (!editor || !textarea) return { editor: 0, textarea: 0 };
    const editorStyle = getComputedStyle(editor);
    const editorInnerWidth =
      editor.clientWidth -
      parseFloat(editorStyle.paddingLeft) -
      parseFloat(editorStyle.paddingRight);
    return {
      editor: editorInnerWidth,
      textarea: textarea.getBoundingClientRect().width,
    };
  });
  // Textarea width should match the editor's content area
  expect(widths.textarea).toBeGreaterThan(0);
  expect(widths.textarea).toBeCloseTo(widths.editor, 0);
  await setWritingView(page);
});

test(`source2 textarea fills the editor height`, async () => {
  await setSource2View(page);
  const heights = await page.evaluate(() => {
    const editor = document.querySelector(`#editor`);
    const textarea = editor?.querySelector(`textarea`);
    if (!editor || !textarea) return { editor: 0, textarea: 0 };
    const editorStyle = getComputedStyle(editor);
    const editorInnerHeight =
      editor.clientHeight -
      parseFloat(editorStyle.paddingTop) -
      parseFloat(editorStyle.paddingBottom);
    return {
      editor: editorInnerHeight,
      textarea: textarea.getBoundingClientRect().height,
    };
  });
  expect(heights.textarea).toBeGreaterThan(0);
  expect(heights.textarea).toBeCloseTo(heights.editor, 0);
  await setWritingView(page);
});

test(`source2 textarea uses the editor font size`, async () => {
  await setSource2View(page);
  const fontSize = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).fontSize;
  });
  expect(fontSize).toBe(`16px`);
  await setWritingView(page);
});

test(`source2 textarea uses the editor line height`, async () => {
  await setSource2View(page);
  const lineHeight = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).lineHeight;
  });
  // line-height: 1.6 at 16px = 25.6px
  const lh = parseFloat(lineHeight);
  expect(lh).toBeCloseTo(25.6, 0);
  await setWritingView(page);
});

test(`source2 textarea uses the page text colour`, async () => {
  await setSource2View(page);
  const color = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).color;
  });
  expect(color).toBe(`rgb(33, 37, 41)`);
  await setWritingView(page);
});

test(`source2 textarea has transparent background`, async () => {
  await setSource2View(page);
  const bg = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).backgroundColor;
  });
  // transparent resolves to rgba(0, 0, 0, 0)
  expect(bg).toBe(`rgba(0, 0, 0, 0)`);
  await setWritingView(page);
});

test(`source2 textarea does not have its own scrollbar`, async () => {
  await setSource2View(page);
  const overflow = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return getComputedStyle(el).overflow;
  });
  expect(overflow).toBe(`hidden`);
  await setWritingView(page);
});

test(`source2 textarea shows all content without clipping`, async () => {
  await loadContent(page, loremContent);
  await setSource2View(page);
  const heights = await page.locator(`#editor.source-view-v2 textarea`).evaluate((el) => {
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  expect(heights.scrollHeight).toBeLessThanOrEqual(heights.clientHeight);
  await setWritingView(page);
});
