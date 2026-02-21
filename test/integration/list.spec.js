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
    launchApp,
    loadContent,
    projectRoot,
    setFocusedView,
    setSourceView,
} from './test-utils.js';

const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'list-items.md');
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

test('clicking bullet list button converts paragraph to unordered list item', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Click on the first paragraph to focus it
    const firstLine = page.locator('#editor .md-line', { hasText: 'First paragraph' }).first();
    await firstLine.click();
    await page.waitForTimeout(200);

    // Click the bullet list button
    await page.locator('.toolbar-button[data-button-id="unordered-list"]').click();
    await page.waitForTimeout(200);

    // Switch to source view to verify the markdown
    await setSourceView(page);

    // The first line should now be a list item
    const firstSource = page.locator('#editor .md-line').first();
    const text = await firstSource.textContent();
    expect(text).toMatch(/^- First paragraph/);
});

test('clicking numbered list button converts paragraph to ordered list item', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Click on the first paragraph to focus it
    const firstLine = page.locator('#editor .md-line', { hasText: 'First paragraph' }).first();
    await firstLine.click();
    await page.waitForTimeout(200);

    // Click the ordered list button
    await page.locator('.toolbar-button[data-button-id="ordered-list"]').click();
    await page.waitForTimeout(200);

    // Switch to source view to verify
    await setSourceView(page);

    const firstSource = page.locator('#editor .md-line').first();
    const text = await firstSource.textContent();
    expect(text).toMatch(/^1\. First paragraph/);
});

test('clicking bullet list button on bullet list item toggles back to paragraph', async () => {
    await loadContent(page, '- Existing bullet item\n');
    await setFocusedView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Existing bullet item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Click bullet list button to toggle off
    await page.locator('.toolbar-button[data-button-id="unordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toBe('Existing bullet item');
});

test('clicking numbered list button on bullet list item switches to ordered', async () => {
    await loadContent(page, '- Bullet item\n');
    await setFocusedView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Bullet item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Click ordered list button to switch
    await page.locator('.toolbar-button[data-button-id="ordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^1\. Bullet item/);
});

test('Enter key in a list item creates a new list item', async () => {
    await loadContent(page, '- First item\n');
    await setFocusedView(page);

    const line = page.locator('#editor .md-line', { hasText: 'First item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Press End to move cursor to end of line, then Enter
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type text in the new list item
    await page.keyboard.type('Second item');
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const first = await lines.nth(0).textContent();
    const second = await lines.nth(1).textContent();
    expect(first).toMatch(/^- First item/);
    expect(second).toMatch(/^- Second item/);
});

test('Enter on empty list item exits the list to a paragraph', async () => {
    await loadContent(page, '- First item\n- \n');
    await setFocusedView(page);

    // Click on the empty list item (second line)
    const lines = page.locator('#editor .md-line');
    await lines.nth(1).click();
    await page.waitForTimeout(200);

    // Press Enter on the empty list item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    await setSourceView(page);

    // The second line should now be a plain (empty) paragraph, not a list item
    const secondLine = page.locator('#editor .md-line').nth(1);
    const text = await secondLine.textContent();
    // An empty paragraph renders as an empty line (no list marker)
    expect(text?.trim()).toBe('');
});

test('heading button on list item converts to heading', async () => {
    await loadContent(page, '- Item before\n- Target item\n- Item after\n');
    await setFocusedView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Target item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Click heading 2 button
    await page.locator('.toolbar-button[data-button-id="heading2"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const first = await lines.nth(0).textContent();
    const second = await lines.nth(1).textContent();
    const third = await lines.nth(2).textContent();

    expect(first).toMatch(/^- Item before/);
    expect(second).toMatch(/^## Target item/);
    expect(third).toMatch(/^- Item after/);
});

test('Enter in ordered list creates item with incremented number', async () => {
    await loadContent(page, '1. First\n2. Second\n');
    await setFocusedView(page);

    // Click on the first ordered item
    const line = page.locator('#editor .md-line', { hasText: 'First' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Move to end and press Enter
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    await page.keyboard.type('Inserted');
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const first = await lines.nth(0).textContent();
    const second = await lines.nth(1).textContent();
    const third = await lines.nth(2).textContent();

    expect(first).toMatch(/^1\. First/);
    expect(second).toMatch(/^2\. Inserted/);
    expect(third).toMatch(/^3\. Second/);
});

test('source view: Enter at offset 0 of list item inserts blank line before', async () => {
    await loadContent(page, '- Test item\n');
    await setSourceView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Test item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Move cursor to start (Home key)
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    const lines = page.locator('#editor .md-line');
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First line should be the blank paragraph
    const first = await lines.nth(0).textContent();
    expect(first?.trim()).toBe('');

    // Second line should still be the list item
    const second = await lines.nth(1).textContent();
    expect(second).toMatch(/^- Test item/);
});

test('toggling off a list item converts the entire contiguous list to paragraphs', async () => {
    await loadContent(page, '- Alpha\n- Beta\n- Gamma\n');
    await setFocusedView(page);

    // Click on the middle item
    const line = page.locator('#editor .md-line', { hasText: 'Beta' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Click bullet list button to toggle off
    await page.locator('.toolbar-button[data-button-id="unordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const first = await lines.nth(0).textContent();
    const second = await lines.nth(1).textContent();
    const third = await lines.nth(2).textContent();
    expect(first).toBe('Alpha');
    expect(second).toBe('Beta');
    expect(third).toBe('Gamma');
});

test('switching list type converts the entire contiguous list', async () => {
    await loadContent(page, '- Alpha\n- Beta\n- Gamma\n');
    await setFocusedView(page);

    // Click on the first item
    const line = page.locator('#editor .md-line', { hasText: 'Alpha' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Click ordered list button to switch
    await page.locator('.toolbar-button[data-button-id="ordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const first = await lines.nth(0).textContent();
    const second = await lines.nth(1).textContent();
    const third = await lines.nth(2).textContent();
    expect(first).toMatch(/^1\. Alpha/);
    expect(second).toMatch(/^2\. Beta/);
    expect(third).toMatch(/^3\. Gamma/);
});
