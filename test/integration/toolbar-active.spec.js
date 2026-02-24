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
    setSourceView,
    setWritingView,
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
    // elements are rendered in writing view).
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
    await setWritingView(page);

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
    await setWritingView(page);

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
    await setWritingView(page);

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
    await setWritingView(page);

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
    await setWritingView(page);

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
    await setWritingView(page);

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
    await setWritingView(page);

    // Line 0: paragraph with bold text
    await clickInlineElement(page, 0, 'strong');

    const paragraphActive = await isButtonActive(page, 'paragraph');
    expect(paragraphActive).toBe(true);
});

// ─── HTML tag equivalents ──────────────────────────────────────────

test('bold button is active when cursor is inside <strong> tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 6: "This is <strong>strong text</strong> here."
    await clickInlineElement(page, 6, 'strong');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(true);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(false);
});

test('bold button is active when cursor is inside <b> tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 7: "This is <b>bold tag</b> here."
    await clickInlineElement(page, 7, 'b');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(true);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(false);
});

test('italic button is active when cursor is inside <em> tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 8: "This is <em>emphasis text</em> here."
    await clickInlineElement(page, 8, 'em');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(true);
    expect(states.strikethrough).toBe(false);
});

test('italic button is active when cursor is inside <i> tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 9: "This is <i>italic tag</i> here."
    await clickInlineElement(page, 9, 'i');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(true);
    expect(states.strikethrough).toBe(false);
});

test('strikethrough button is active when cursor is inside <del> tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 10: "This is <del>deleted text</del> here."
    await clickInlineElement(page, 10, 'del');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(true);
});

test('strikethrough button is active when cursor is inside <s> tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 11: "This is <s>struck tag</s> here."
    await clickInlineElement(page, 11, 's');

    const states = await getFormatButtonStates(page);
    expect(states.bold).toBe(false);
    expect(states.italic).toBe(false);
    expect(states.strikethrough).toBe(true);
});

// ─── HTML tag toggle-off (strip tags via toolbar button) ───────────

test('clicking bold button inside <strong> tag strips the tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 6: "This is <strong>strong text</strong> here."
    await clickInlineElement(page, 6, 'strong');
    await page.locator('[data-button-id="bold"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);
    const line = await page.locator('#editor .md-line').nth(6).innerText();
    expect(line).toBe('This is strong text here.');
});

test('clicking bold button inside <b> tag strips the tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 7: "This is <b>bold tag</b> here."
    await clickInlineElement(page, 7, 'b');
    await page.locator('[data-button-id="bold"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);
    const line = await page.locator('#editor .md-line').nth(7).innerText();
    expect(line).toBe('This is bold tag here.');
});

test('clicking italic button inside <em> tag strips the tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 8: "This is <em>emphasis text</em> here."
    await clickInlineElement(page, 8, 'em');
    await page.locator('[data-button-id="italic"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);
    const line = await page.locator('#editor .md-line').nth(8).innerText();
    expect(line).toBe('This is emphasis text here.');
});

test('clicking italic button inside <i> tag strips the tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 9: "This is <i>italic tag</i> here."
    await clickInlineElement(page, 9, 'i');
    await page.locator('[data-button-id="italic"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);
    const line = await page.locator('#editor .md-line').nth(9).innerText();
    expect(line).toBe('This is italic tag here.');
});

test('clicking strikethrough button inside <del> tag strips the tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 10: "This is <del>deleted text</del> here."
    await clickInlineElement(page, 10, 'del');
    await page.locator('[data-button-id="strikethrough"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);
    const line = await page.locator('#editor .md-line').nth(10).innerText();
    expect(line).toBe('This is deleted text here.');
});

test('clicking strikethrough button inside <s> tag strips the tag', async () => {
    await loadContent(page, fixtureContent);
    await setWritingView(page);

    // Line 11: "This is <s>struck tag</s> here."
    await clickInlineElement(page, 11, 's');
    await page.locator('[data-button-id="strikethrough"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);
    const line = await page.locator('#editor .md-line').nth(11).innerText();
    expect(line).toBe('This is struck tag here.');
});
