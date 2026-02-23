/**
 * @fileoverview Integration tests for toolbar active states.
 *
 * Verifies that when the cursor is placed inside inline formatting
 * (bold, italic, strikethrough, inline code, bold-italic), the
 * corresponding toolbar buttons show the `.active` class.
 *
 * Also verifies that block-level buttons (heading, paragraph, etc.)
 * reflect the block type even when the cursor is inside inline
 * formatting within that block.
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

const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'toolbar-active.md');
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

/**
 * Clicks inside a specific inline element on a given line.
 * Uses real mouse coordinates so the full event chain fires.
 *
 * @param {import('@playwright/test').Page} pg
 * @param {number} lineIndex - 0-based index of the .md-line
 * @param {string} selector - CSS selector for the inline element within the line
 */
async function clickInlineElement(pg, lineIndex, selector) {
    const line = pg.locator('#editor .md-line').nth(lineIndex);
    // Click the line first to make it the focused node (ensures inline
    // elements are rendered in focused view).
    await clickInEditor(pg, line);
    await pg.waitForTimeout(200);

    const el = line.locator(selector).first();
    await clickInEditor(pg, el);
    await pg.waitForTimeout(200);
}

/**
 * Returns whether a toolbar button has the `.active` class.
 * @param {import('@playwright/test').Page} pg
 * @param {string} buttonId - The `data-button-id` value
 * @returns {Promise<boolean>}
 */
async function isButtonActive(pg, buttonId) {
    return pg
        .locator(`[data-button-id="${buttonId}"]`)
        .evaluate((el) => el.classList.contains('active'));
}

/**
 * Returns the active state for all inline format buttons.
 * @param {import('@playwright/test').Page} pg
 * @returns {Promise<Record<string, boolean>>}
 */
async function getFormatButtonStates(pg) {
    const ids = ['bold', 'italic', 'strikethrough', 'subscript', 'superscript', 'code', 'link'];
    /** @type {Record<string, boolean>} */
    const result = {};
    for (const id of ids) {
        result[id] = await isButtonActive(pg, id);
    }
    return result;
}

// ─── Tests ─────────────────────────────────────────────────────────

test('bold button is active when cursor is inside bold text', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 0: "This is **bold text** here."
    // Click inside the <strong> element.
    await clickInlineElement(page, 0, 'strong');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(true);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(false);
    expect(states.code).toBe(false);
});

test('italic button is active when cursor is inside italic text', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 1: "This is *italic text* here."
    await clickInlineElement(page, 1, 'em');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(true);
    expect(states.strikethrough).toBe(false);
    expect(states.code).toBe(false);
});

test('bold and italic buttons are active when cursor is inside bold-italic text', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 2: "This is ***bold italic*** here."
    // bold-italic renders as <strong><em>...</em></strong>
    await clickInlineElement(page, 2, 'strong');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(true);
    expect(states.italic).toBe(true);
    expect(states.strikethrough).toBe(false);
    expect(states.code).toBe(false);
});

test('strikethrough button is active when cursor is inside strikethrough text', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 3: "This is ~~struck~~ here."
    await clickInlineElement(page, 3, 'del');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(true);
    expect(states.code).toBe(false);
});

test('code button is active when cursor is inside inline code', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 4: "This is `code` here."
    await clickInlineElement(page, 4, 'code');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(false);
    expect(states.code).toBe(true);
});

test('no format buttons are active when cursor is in plain text', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 5: "Plain paragraph."
    const line = page.locator('#editor .md-line').nth(5);
    await clickInEditor(page, line);
    await page.waitForTimeout(200);

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(false);
    expect(states.code).toBe(false);
    expect(states.link).toBe(false);
});

test('paragraph button stays active when cursor is inside bold text in a paragraph', async () => {
    await loadContent(page, fixtureContent);
    await setFocusedView(page);

    // Line 0: paragraph with bold text
    await clickInlineElement(page, 0, 'strong');

    const paragraphActive = await isButtonActive(page, 'paragraph');
    expect(paragraphActive).toBe(true);
});
