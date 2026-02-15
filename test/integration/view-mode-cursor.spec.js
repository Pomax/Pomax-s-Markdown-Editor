/**
 * @fileoverview Integration test verifying that the cursor position is
 * preserved when switching between focused and source view modes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, loadContent, projectRoot } from './test-utils.js';

const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'inline-html.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test('switching to source view preserves the cursor position', async () => {
    await loadContent(page, fixtureContent);

    // Ensure focused view.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    // Click the last paragraph ("It also tests <strong>strong</strong>...")
    // to focus it.  In focused view this renders as raw markdown.
    const lastParagraph = page.locator('#editor .md-line.md-paragraph').last();
    await lastParagraph.click();
    await page.waitForTimeout(200);

    // Place the cursor at raw offset 25 in the node's content:
    // "It also tests <strong>strong</strong> and <em>emphasis</em> text."
    //  0              14      22    25
    // That's the "o" in "strong" (the word between the HTML tags).
    // In focused view the <strong> tag is hidden, so this maps to
    // rendered position 17 ("It also tests strong" → the "o").
    // In source view the raw text is shown verbatim, so offset 25
    // lands at the same character.
    const nodeId = await page.evaluate(() => window.editorAPI?.getCursor()?.nodeId);
    expect(nodeId).toBeTruthy();

    await page.evaluate((nid) => {
        window.editorAPI?.setCursor(nid, 25);
    }, nodeId);
    await page.waitForTimeout(100);

    // Read back the cursor to confirm it was placed.
    const cursorBefore = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorBefore).toBeTruthy();
    expect(cursorBefore.offset).toBe(25);

    // Switch to source view by clicking the toolbar toggle — this is what
    // a real user does.  The click triggers blur (which clears treeCursor)
    // before setViewMode runs, so this reproduces the real event sequence.
    // Use discrete mouse steps so selectionchange can interleave (see
    // ai-agent-notes.md § Playwright Pitfalls).
    const toggle = page.locator('.toolbar-view-mode-toggle');
    const box = await toggle.boundingBox();
    if (!box) throw new Error('toggle bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    // Let any async selectionchange events settle.
    await page.waitForTimeout(200);

    // The cursor should still be on the same node, at the same offset.
    const cursorAfter = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorAfter).toBeTruthy();
    expect(cursorAfter.nodeId).toBe(nodeId);
    expect(cursorAfter.offset).toBe(25);

    // The DOM selection should be inside the same line.
    const selectionNodeId = await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        let node = /** @type {HTMLElement|null} */ (sel.anchorNode);
        while (node && !/** @type {HTMLElement} */ (node).dataset?.nodeId) {
            node = /** @type {HTMLElement|null} */ (node.parentElement);
        }
        return /** @type {HTMLElement} */ (node)?.dataset?.nodeId ?? null;
    });
    expect(selectionNodeId).toBe(nodeId);
});

test('switching from source to focused view preserves the cursor position', async () => {
    await loadContent(page, fixtureContent);

    // Start in source view.
    await page.evaluate(() => window.electronAPI?.setSourceView());
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    // Click the last paragraph to place the cursor.
    const lastParagraph = page.locator('#editor .md-line.md-paragraph').last();
    await lastParagraph.click();
    await page.waitForTimeout(200);

    const nodeId = await page.evaluate(() => window.editorAPI?.getCursor()?.nodeId);
    expect(nodeId).toBeTruthy();

    // Place cursor at offset 25.
    await page.evaluate((nid) => {
        window.editorAPI?.setCursor(nid, 25);
    }, nodeId);
    await page.waitForTimeout(100);

    const cursorBefore = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorBefore).toBeTruthy();
    expect(cursorBefore.offset).toBe(25);

    // Click the toolbar toggle to switch to focused view.
    const toggle = page.locator('.toolbar-view-mode-toggle');
    const box = await toggle.boundingBox();
    if (!box) throw new Error('toggle bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    // Cursor should be preserved.
    const cursorAfter = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorAfter).toBeTruthy();
    expect(cursorAfter.nodeId).toBe(nodeId);
    expect(cursorAfter.offset).toBe(25);
});

test('cursor in plain text after HTML tags is preserved when switching to source view', async () => {
    await loadContent(page, fixtureContent);

    // Ensure focused view.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    // Click the last paragraph to focus it.
    const lastParagraph = page.locator('#editor .md-line.md-paragraph').last();
    await lastParagraph.click();
    await page.waitForTimeout(200);

    const nodeId = await page.evaluate(() => window.editorAPI?.getCursor()?.nodeId);
    expect(nodeId).toBeTruthy();

    // Place cursor at raw offset 62 — between "e" and "x" in "text."
    // which follows all the HTML tags:
    // "It also tests <strong>strong</strong> and <em>emphasis</em> text."
    //  0              14       22      28        37  42     46      54 59  62
    // In focused view the tags are hidden, so rendered offset = 36.
    await page.evaluate((nid) => {
        window.editorAPI?.setCursor(nid, 62);
    }, nodeId);
    await page.waitForTimeout(100);

    const cursorBefore = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorBefore).toBeTruthy();
    expect(cursorBefore.offset).toBe(62);

    // Click the toolbar toggle to switch to source view.
    const toggle = page.locator('.toolbar-view-mode-toggle');
    const box = await toggle.boundingBox();
    if (!box) throw new Error('toggle bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    // Let any async selectionchange events settle.
    await page.waitForTimeout(200);

    // The cursor should still be on the same node, at offset 62.
    const cursorAfter = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorAfter).toBeTruthy();
    expect(cursorAfter.nodeId).toBe(nodeId);
    expect(cursorAfter.offset).toBe(62);
});

test('keyboard-positioned cursor is preserved across focused to source switch', async () => {
    await loadContent(page, fixtureContent);

    // Ensure focused view.
    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.locator('#editor[data-view-mode="focused"]').waitFor();

    // Click the last paragraph to focus it.
    const lastParagraph = page.locator('#editor .md-line.md-paragraph').last();
    const paraBox = await lastParagraph.boundingBox();
    if (!paraBox) throw new Error('paragraph bounding box not found');
    await page.mouse.move(paraBox.x + paraBox.width / 2, paraBox.y + paraBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(200);

    const nodeId = await page.evaluate(() => window.editorAPI?.getCursor()?.nodeId);
    expect(nodeId).toBeTruthy();

    // Use keyboard to place cursor: End (go to end of line), then Left 3
    // times to land between "e" and "x" in the trailing "text."
    // Rendered text: "It also tests strong and emphasis text."
    // End → after "."; Left×3 → before "x" (between "e" and "x")
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);

    // The raw offset should be 62 — between "e" and "x" in "text."
    // at the END of the raw content (past all the HTML tags).
    const cursorBefore = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorBefore).toBeTruthy();
    expect(cursorBefore.nodeId).toBe(nodeId);
    expect(cursorBefore.offset).toBe(62);

    // Click the toolbar toggle to switch to source view.
    const toggle = page.locator('.toolbar-view-mode-toggle');
    const box = await toggle.boundingBox();
    if (!box) throw new Error('toggle bounding box not found');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.locator('#editor[data-view-mode="source"]').waitFor();

    // Let any async selectionchange events settle.
    await page.waitForTimeout(200);

    // The cursor should still be on the same node, at offset 62.
    const cursorAfter = await page.evaluate(() => window.editorAPI?.getCursor());
    expect(cursorAfter).toBeTruthy();
    expect(cursorAfter.nodeId).toBe(nodeId);
    expect(cursorAfter.offset).toBe(62);
});
