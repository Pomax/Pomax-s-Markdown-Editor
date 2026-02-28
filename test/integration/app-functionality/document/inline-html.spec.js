/**
 * @fileoverview Integration tests for inline HTML tag rendering.
 * Verifies that inline HTML tags (<sub>, <sup>, <mark>, <u>, <b>, <i>,
 * <s>, <strong>, <em>, <del>) are rendered correctly in writing mode:
 * formatting applied when unfocused, raw syntax shown when focused.
 */

import { expect, test } from '@playwright/test';
import {
    END,
    clickInEditor,
    closeApp,
    launchApp,
    loadContent,
    setSourceView,
    setWritingView,
} from '../../test-utils.js';

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
 * Helper: load markdown, switch to writing mode, focus on the second
 * paragraph so the first line is unfocused (rendered with formatting).
 *
 * @param {string} markdown - The markdown content to load.
 */
async function loadAndDefocusFirstLine(markdown) {
    await loadContent(page, markdown);

    await setWritingView(page);
    await page.waitForTimeout(200);

    // Click the second paragraph to defocus the first line.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await clickInEditor(page, secondLine);
    await page.waitForTimeout(200);
}

test('<sub> renders as subscript when unfocused', async () => {
    const markdown = 'H<sub>2</sub>O is water\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('H');
    expect(text).toContain('2');
    expect(text).not.toContain('<sub>');
    expect(text).not.toContain('</sub>');

    const sub = firstLine.locator('sub');
    await expect(sub).toBeVisible();
    expect(await sub.textContent()).toBe('2');
});

test('<sup> renders as superscript when unfocused', async () => {
    const markdown = 'x<sup>2</sup> + y<sup>2</sup>\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).not.toContain('<sup>');
    expect(text).not.toContain('</sup>');

    const sups = firstLine.locator('sup');
    expect(await sups.count()).toBe(2);
    expect(await sups.first().textContent()).toBe('2');
    expect(await sups.last().textContent()).toBe('2');
});

test('<mark> renders as highlighted text when unfocused', async () => {
    const markdown = 'This is <mark>highlighted</mark> text\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('highlighted');
    expect(text).not.toContain('<mark>');
    expect(text).not.toContain('</mark>');

    const mark = firstLine.locator('mark');
    await expect(mark).toBeVisible();
    expect(await mark.textContent()).toBe('highlighted');
});

test('<u> renders as underlined text when unfocused', async () => {
    const markdown = 'This is <u>underlined</u> text\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('underlined');
    expect(text).not.toContain('<u>');
    expect(text).not.toContain('</u>');

    const u = firstLine.locator('u');
    await expect(u).toBeVisible();
    expect(await u.textContent()).toBe('underlined');
});

test('<s> renders as strikethrough when unfocused', async () => {
    const markdown = 'This is <s>struck</s> text\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('struck');
    expect(text).not.toContain('<s>');
    expect(text).not.toContain('</s>');

    const s = firstLine.locator('s');
    await expect(s).toBeVisible();
    expect(await s.textContent()).toBe('struck');
});

test('HTML <strong> renders like markdown bold when unfocused', async () => {
    const markdown = 'HTML <strong>bold</strong> text\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('bold');
    expect(text).not.toContain('<strong>');
    expect(text).not.toContain('</strong>');

    const strong = firstLine.locator('strong');
    await expect(strong).toBeVisible();
    expect(await strong.textContent()).toBe('bold');
});

test('HTML <em> renders like markdown italic when unfocused', async () => {
    const markdown = 'HTML <em>italic</em> text\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('italic');
    expect(text).not.toContain('<em>');
    expect(text).not.toContain('</em>');

    const em = firstLine.locator('em');
    await expect(em).toBeVisible();
    expect(await em.textContent()).toBe('italic');
});

test('HTML <del> renders like markdown strikethrough when unfocused', async () => {
    const markdown = 'HTML <del>deleted</del> text\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).toContain('deleted');
    expect(text).not.toContain('<del>');
    expect(text).not.toContain('</del>');

    const del = firstLine.locator('del');
    await expect(del).toBeVisible();
    expect(await del.textContent()).toBe('deleted');
});

test('<b> and <i> render correctly when unfocused', async () => {
    const markdown = 'Use <b>bold</b> and <i>italic</i> tags\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const text = await firstLine.innerText();
    expect(text).not.toContain('<b>');
    expect(text).not.toContain('<i>');

    const b = firstLine.locator('b');
    await expect(b).toBeVisible();
    expect(await b.textContent()).toBe('bold');

    const i = firstLine.locator('i');
    await expect(i).toBeVisible();
    expect(await i.textContent()).toBe('italic');
});

test('nested markdown inside HTML tag renders correctly', async () => {
    const markdown = 'Text <mark>**bold** inside</mark> here\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();
    const mark = firstLine.locator('mark');
    await expect(mark).toBeVisible();

    const strong = mark.locator('strong');
    await expect(strong).toBeVisible();
    expect(await strong.textContent()).toBe('bold');

    const markText = await mark.textContent();
    expect(markText).toContain('bold');
    expect(markText).toContain('inside');
});

test('focused line renders inline HTML as WYSIWYG elements', async () => {
    const markdown = 'H<sub>2</sub>O is water\n\nSecond paragraph';
    await loadContent(page, markdown);

    await setWritingView(page);
    await page.waitForTimeout(200);

    // Click the first line so it IS focused — should still render WYSIWYG.
    const firstLine = page.locator('#editor .md-line').first();
    await clickInEditor(page, firstLine);
    await page.waitForTimeout(200);

    // Even on the active line, <sub> renders as a real subscript element.
    const sub = firstLine.locator('sub');
    await expect(sub).toBeVisible();
    expect(await sub.textContent()).toBe('2');
});

test('clicking <strong> text does not destroy the content', async () => {
    const markdown = 'HTML <strong>bold</strong> text\n\nSecond paragraph';
    await loadContent(page, markdown);

    await setWritingView(page);
    await page.waitForTimeout(200);

    // Defocus first: click the second paragraph.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await clickInEditor(page, secondLine);
    await page.waitForTimeout(200);

    // Now click directly on the <strong> element in the first line,
    // using discrete mouse steps so selectionchange can interleave.
    const firstLine = page.locator('#editor .md-line').first();
    const strong = firstLine.locator('strong');
    await expect(strong).toBeVisible();
    const box = await strong.boundingBox();
    if (!box) throw new Error('strong element not visible');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(300);

    // The first line must still contain the <strong> element and its text.
    await expect(firstLine.locator('strong')).toBeVisible();
    const text = await firstLine.innerText();
    expect(text).toContain('bold');
    expect(text).toContain('HTML');
    expect(text).toContain('text');
});

test('clicking <em> text does not destroy the content', async () => {
    const markdown = 'HTML <em>italic</em> text\n\nSecond paragraph';
    await loadContent(page, markdown);

    await setWritingView(page);
    await page.waitForTimeout(200);

    const secondLine = page.locator('#editor .md-line').nth(1);
    await clickInEditor(page, secondLine);
    await page.waitForTimeout(200);

    const firstLine = page.locator('#editor .md-line').first();
    const em = firstLine.locator('em');
    await expect(em).toBeVisible();
    const emBox = await em.boundingBox();
    if (!emBox) throw new Error('em element not visible');
    await page.mouse.move(emBox.x + emBox.width / 2, emBox.y + emBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(300);

    await expect(firstLine.locator('em')).toBeVisible();
    const text = await firstLine.innerText();
    expect(text).toContain('italic');
    expect(text).toContain('HTML');
    expect(text).toContain('text');
});

test('mixed markdown and HTML inline tags render correctly', async () => {
    const markdown = 'Water is H<sub>2</sub>O and **bold** with `code`\n\nSecond paragraph';
    await loadAndDefocusFirstLine(markdown);

    const firstLine = page.locator('#editor .md-line').first();

    const sub = firstLine.locator('sub');
    await expect(sub).toBeVisible();
    expect(await sub.textContent()).toBe('2');

    const strong = firstLine.locator('strong');
    await expect(strong).toBeVisible();
    expect(await strong.textContent()).toBe('bold');

    const code = firstLine.locator('code');
    await expect(code).toBeVisible();
    expect(await code.textContent()).toBe('code');
});

test('cursor offset is correct after view-mode switch with inline HTML', async () => {
    const markdown =
        '# test document\n\nIt also tests <strong>strong</strong> and <em>emphasis</em> text.';

    await loadContent(page, markdown);

    await setWritingView(page);

    // Click on the last paragraph
    const lastLine = page.locator('#editor .md-line').last();
    await clickInEditor(page, lastLine);
    await page.waitForTimeout(200);

    // Place cursor before "text." — End then Left×5
    await page.keyboard.press(END);
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press('ArrowLeft');
    }
    await page.waitForTimeout(100);

    // Switch to source view via toolbar toggle
    await setSourceView(page);
    await page.waitForTimeout(200);

    // Raw offset should point at "text." (index 60)
    const content = 'It also tests <strong>strong</strong> and <em>emphasis</em> text.';
    const expected = content.indexOf('text.');
    const actual = await page.evaluate(() => /** @type {any} */ (window).__editorCursorOffset);
    expect(actual).toBe(expected);
});
