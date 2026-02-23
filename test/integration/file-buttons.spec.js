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
    setFocusedView,
} from './test-utils.js';

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
    await setFocusedView(page);
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

test('toolbar bold+italic buttons activate after switching back to a tab with formatted text', async () => {
    // Tab 1: load bold and italic text in a paragraph
    await loadContent(page, 'Some **bold** and *italic* words');
    await setFocusedView(page);

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
