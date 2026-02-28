/**
 * @fileoverview Integration tests for the file-button group.
 *
 * Verifies that the toolbar contains three file-operation buttons
 * (New, Open, Save) in a left-aligned group, and that the content
 * toolbar remains visually centred in the toolbar container.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
    clickInEditor,
    launchApp,
    loadContent,
    projectRoot,
    setWritingView,
} from '../../test-utils.js';

const readmePath = path.join(projectRoot, 'README.md');
const readmeContent = fs.readFileSync(readmePath, 'utf-8');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
    await loadContent(page, readmeContent);
});

test.afterAll(async () => {
    await electronApp.close();
});

test('file-button group exists and contains three buttons', async () => {
    const group = page.locator('.toolbar-file-group');
    await expect(group).toBeVisible();

    const buttons = group.locator('.toolbar-button');
    await expect(buttons).toHaveCount(3);
});

test('file buttons have correct labels', async () => {
    const newBtn = page.locator('.toolbar-button[data-button-id="file-new"]');
    const openBtn = page.locator('.toolbar-button[data-button-id="file-open"]');
    const saveBtn = page.locator('.toolbar-button[data-button-id="file-save"]');

    await expect(newBtn).toHaveAttribute('aria-label', 'New File');
    await expect(openBtn).toHaveAttribute('aria-label', 'Open File');
    await expect(saveBtn).toHaveAttribute('aria-label', 'Save File');
});

test('file buttons contain SVG icons', async () => {
    const group = page.locator('.toolbar-file-group');
    const svgs = group.locator('.toolbar-button svg');
    await expect(svgs).toHaveCount(3);
});

test('file-button group is left-aligned, content toolbar is centred', async () => {
    const container = page.locator('#toolbar-container');
    const fileGroup = page.locator('.toolbar-file-group');
    const toolbar = page.locator('.toolbar');

    const containerBox = await container.boundingBox();
    const fileGroupBox = await fileGroup.boundingBox();
    const toolbarBox = await toolbar.boundingBox();

    if (!containerBox || !fileGroupBox || !toolbarBox) {
        throw new Error('Could not get bounding boxes for layout assertions');
    }

    // File group should be near the left edge of the container
    expect(fileGroupBox.x - containerBox.x).toBeLessThan(30);

    // Content toolbar centre should be roughly at container centre
    const containerCentreX = containerBox.x + containerBox.width / 2;
    const toolbarCentreX = toolbarBox.x + toolbarBox.width / 2;
    expect(Math.abs(toolbarCentreX - containerCentreX)).toBeLessThan(containerBox.width * 0.15);
});

test('toolbar heading button activates after switching back to a tab with a heading', async () => {
    // Tab 1: load a heading, click into it, verify heading1 is active
    await loadContent(page, '# Hello\n\nWorld');
    await setWritingView(page);
    const headingLine = page.locator('#editor .md-heading1');
    await clickInEditor(page, headingLine);

    const h1Btn = page.locator('.toolbar-button[data-button-id="heading1"]');
    await expect(h1Btn).toHaveClass(/active/);

    // Open a new (empty) tab — heading1 should no longer be active
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('file:new')));
    await page.waitForTimeout(300);
    await expect(h1Btn).not.toHaveClass(/active/);

    // Switch back to the first tab and click the heading again
    const firstTab = page.locator('#tab-bar .tab-button').first();
    await firstTab.click();
    await page.waitForTimeout(300);
    await clickInEditor(page, page.locator('#editor .md-heading1'));
    await expect(h1Btn).toHaveClass(/active/);
});

test('cursor position is preserved across tab switch in writing mode', async () => {
    await loadContent(page, 'Hello world, this is a test paragraph.\n\nSecond paragraph here.');
    await setWritingView(page);

    // Click into the first line
    const firstLine = page.locator('#editor .md-line').first();
    await clickInEditor(page, firstLine);
    await page.waitForTimeout(200);

    // Place cursor at a specific offset (after "Hello world, ")
    const cursorOffset = 13;
    await page.evaluate((offset) => {
        const editor = /** @type {any} */ (window).__editor;
        if (editor?.syntaxTree) {
            const blockNode = editor.getCurrentBlockNode();
            if (blockNode) {
                editor.syntaxTree.treeCursor = {
                    nodeId: blockNode.id,
                    blockNodeId: blockNode.id,
                    offset,
                };
                editor.placeCursor();
            }
        }
    }, cursorOffset);
    await page.waitForTimeout(200);

    // Verify cursor is at the expected offset
    const offsetBefore = await page.evaluate(() => {
        return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? -1;
    });
    expect(offsetBefore).toBe(cursorOffset);

    // Open a new tab
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('file:new')));
    await page.waitForTimeout(300);

    // Switch back to the first tab
    const firstTab = page.locator('#tab-bar .tab-button').first();
    await firstTab.click();
    await page.waitForTimeout(300);

    // Verify cursor offset is preserved
    const offsetAfter = await page.evaluate(() => {
        return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? -1;
    });
    expect(offsetAfter).toBe(cursorOffset);
});

test('cursor position is preserved across tab switch with inline formatting', async () => {
    await loadContent(page, 'Some **bold** and *italic* words here.\n\nSecond paragraph.');
    await setWritingView(page);

    // Click into the first line
    const firstLine = page.locator('#editor .md-line').first();
    await clickInEditor(page, firstLine);
    await page.waitForTimeout(200);

    // Place cursor at raw offset 20 (inside "and" after bold)
    const cursorOffset = 20;
    await page.evaluate((offset) => {
        const editor = /** @type {any} */ (window).__editor;
        if (editor?.syntaxTree) {
            const blockNode = editor.getCurrentBlockNode();
            if (blockNode) {
                editor.syntaxTree.treeCursor = {
                    nodeId: blockNode.id,
                    blockNodeId: blockNode.id,
                    offset,
                };
                editor.placeCursor();
            }
        }
    }, cursorOffset);
    await page.waitForTimeout(200);

    const offsetBefore = await page.evaluate(() => {
        return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? -1;
    });
    expect(offsetBefore).toBe(cursorOffset);

    // Open a new tab
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('file:new')));
    await page.waitForTimeout(300);

    // Switch back to the first tab
    const firstTab = page.locator('#tab-bar .tab-button').first();
    await firstTab.click();
    await page.waitForTimeout(300);

    // Verify cursor offset is preserved
    const offsetAfter = await page.evaluate(() => {
        return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? -1;
    });
    expect(offsetAfter).toBe(cursorOffset);
});

test('cursor position from real click is preserved across tab switch', async () => {
    await loadContent(
        page,
        'Hello world, this is a longer test paragraph for click testing.\n\nAnother paragraph.',
    );
    await setWritingView(page);

    // Click into the first line using real mouse coordinates,
    // slightly right of the left edge so we're definitely on text
    const firstLine = page.locator('#editor .md-line').first();
    const box = await firstLine.boundingBox();
    if (!box) throw new Error('first line not visible');
    await page.mouse.move(box.x + 80, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Read the cursor offset set by the real click
    const offsetBefore = await page.evaluate(() => {
        return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? -1;
    });
    expect(offsetBefore).toBeGreaterThan(0);

    // Open a new tab
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('file:new')));
    await page.waitForTimeout(300);

    // Switch back to the first tab
    const firstTab = page.locator('#tab-bar .tab-button').first();
    await firstTab.click();
    await page.waitForTimeout(300);

    // Verify cursor offset is preserved
    const offsetAfter = await page.evaluate(() => {
        return /** @type {any} */ (window).__editor?.syntaxTree?.treeCursor?.offset ?? -1;
    });
    expect(offsetAfter).toBe(offsetBefore);
});

test('toolbar bold+italic buttons activate after switching back to a tab with formatted text', async () => {
    // Tab 1: load bold and italic text in a paragraph
    await loadContent(page, 'Some **bold** and *italic* words');
    await setWritingView(page);

    const boldBtn = page.locator('.toolbar-button[data-button-id="bold"]');
    const italicBtn = page.locator('.toolbar-button[data-button-id="italic"]');

    // Click into the bold text, verify bold is active
    const line = page.locator('#editor .md-line').first();
    await clickInEditor(page, line);
    const boldEl = line.locator('strong').first();
    await clickInEditor(page, boldEl);
    await expect(boldBtn).toHaveClass(/active/);

    // Open a new tab — bold should no longer be active
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('file:new')));
    await page.waitForTimeout(300);
    await expect(boldBtn).not.toHaveClass(/active/);

    // Switch back to the first tab, click the italic text
    const firstTab = page.locator('#tab-bar .tab-button').first();
    await firstTab.click();
    await page.waitForTimeout(300);
    const lineAgain = page.locator('#editor .md-line').first();
    await clickInEditor(page, lineAgain);
    const italicEl = lineAgain.locator('em').first();
    await clickInEditor(page, italicEl);
    await expect(italicBtn).toHaveClass(/active/);
    await expect(boldBtn).not.toHaveClass(/active/);
});
