/**
 * @fileoverview Integration tests for the search bar feature.
 *
 * Verifies that Ctrl+F opens the search bar, plain text and regex
 * search work in both source and writing view, match highlighting
 * is applied, navigation between matches works, and the bar closes
 * cleanly on Escape.
 */

import { expect, test } from '@playwright/test';
import { MOD, launchApp, loadContent, setSourceView, setWritingView } from '../../test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const FIXTURE = [
    '# Heading with cake',
    '',
    'A paragraph about cake and pie.',
    '',
    '## Another heading',
    '',
    'Some **bold text** and *italic words* here.',
    '',
    '- List item one',
    '',
    '- List item two',
    '',
    '```js',
    'const cake = true;',
    '```',
].join('\n');

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

// ─── Opening and closing ────────────────────────────────────────────

test('Ctrl+F opens the search bar', async () => {
    await loadContent(page, FIXTURE);
    // Search bar should be hidden initially.
    const bar = page.locator('.search-bar');
    await expect(bar).toBeHidden();

    // Open with Ctrl+F.
    await page.keyboard.press(`${MOD}+f`);
    await expect(bar).toBeVisible();

    // The input should be focused.
    const input = page.locator('.search-input');
    await expect(input).toBeFocused();
});

test('Escape closes the search bar', async () => {
    await loadContent(page, FIXTURE);
    await page.keyboard.press(`${MOD}+f`);
    await expect(page.locator('.search-bar')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('.search-bar')).toBeHidden();
});

test('Escape closes the search bar when editor is focused', async () => {
    await loadContent(page, FIXTURE);
    await page.keyboard.press(`${MOD}+f`);
    await expect(page.locator('.search-bar')).toBeVisible();

    // Move focus back to the editor
    await page.locator('#editor').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.search-bar')).toBeHidden();
});

test('Ctrl+F while open selects the search text', async () => {
    await loadContent(page, FIXTURE);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('hello');

    // Press Ctrl+F again — text should be selected.
    await page.keyboard.press(`${MOD}+f`);
    await expect(input).toBeFocused();
    const selected = await input.evaluate((el) => {
        const inp = /** @type {HTMLInputElement} */ (el);
        return (inp.selectionEnd ?? 0) - (inp.selectionStart ?? 0);
    });
    expect(selected).toBe(5);
});

// ─── Plain text search in source view ───────────────────────────────

test('plain text search highlights matches in source view', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('cake');

    // Should find matches.
    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).not.toHaveText('No results');

    // There should be <mark> elements in the editor.
    const marks = page.locator('#editor mark.search-highlight');
    const count = await marks.count();
    expect(count).toBeGreaterThanOrEqual(2); // heading + paragraph + code

    // One should be the active match.
    const active = page.locator('#editor mark.search-highlight--active');
    await expect(active).toHaveCount(1);

    await page.keyboard.press('Escape');
});

test('plain text search is case insensitive by default', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('Cake');

    // Should still match lowercase 'cake' in paragraph and code.
    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).not.toHaveText('No results');

    const marks = page.locator('#editor mark.search-highlight');
    const count = await marks.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Escape');
});

test('case sensitive toggle restricts matches', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('Cake');

    // Click case-sensitive toggle.
    await page.locator('.search-toggle[data-action="case"]').click();

    // 'Cake' (capital C) should not match 'cake' (lowercase).
    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toHaveText('No results');

    // Toggle off and close.
    await page.locator('.search-toggle[data-action="case"]').click();
    await page.keyboard.press('Escape');
});

// ─── Regex search ───────────────────────────────────────────────────

test('regex search finds pattern matches', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);

    // Enable regex mode.
    await page.locator('.search-toggle[data-action="regex"]').click();

    const input = page.locator('.search-input');
    await input.fill('cake|pie');

    // Should find multiple matches.
    const marks = page.locator('#editor mark.search-highlight');
    const count = await marks.count();
    expect(count).toBeGreaterThanOrEqual(3); // 'cake' in heading + paragraph + code, 'pie' in paragraph

    // Toggle off and close.
    await page.locator('.search-toggle[data-action="regex"]').click();
    await page.keyboard.press('Escape');
});

test('invalid regex shows no results instead of error', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);

    await page.locator('.search-toggle[data-action="regex"]').click();
    const input = page.locator('.search-input');
    await input.fill('[invalid');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toHaveText('No results');

    await page.locator('.search-toggle[data-action="regex"]').click();
    await page.keyboard.press('Escape');
});

// ─── Navigation ─────────────────────────────────────────────────────

test('Enter navigates to next match', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('cake');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toContainText('1 of');

    // Press Enter → next match.
    await page.keyboard.press('Enter');
    await expect(matchCount).toContainText('2 of');

    await page.keyboard.press('Escape');
});

test('Shift+Enter navigates to previous match', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('cake');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toContainText('1 of');

    // Go forward then back.
    await page.keyboard.press('Enter');
    await expect(matchCount).toContainText('2 of');
    await page.keyboard.press('Shift+Enter');
    await expect(matchCount).toContainText('1 of');

    await page.keyboard.press('Escape');
});

test('next/prev buttons navigate matches', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('cake');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toContainText('1 of');

    await page.locator('.search-nav-btn[data-action="next"]').click();
    await expect(matchCount).toContainText('2 of');

    await page.locator('.search-nav-btn[data-action="prev"]').click();
    await expect(matchCount).toContainText('1 of');

    await page.keyboard.press('Escape');
});

// ─── Writing view ───────────────────────────────────────────────────

test('search works in writing view (bare text)', async () => {
    await loadContent(page, FIXTURE);
    await setWritingView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('cake');

    // In writing view, **bold** delimiters are stripped, so searching
    // for 'cake' should still find the heading and paragraph matches.
    const marks = page.locator('#editor mark.search-highlight');
    const count = await marks.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Escape');
});

test('writing view search does not match markdown syntax', async () => {
    await loadContent(page, FIXTURE);
    await setWritingView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    // Search for markdown heading prefix — should not match in writing view
    // because toBareText strips it.
    await input.fill('##');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toHaveText('No results');

    await page.keyboard.press('Escape');
});

test('source view search matches markdown syntax', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('##');

    // Source mode should find '##' in heading lines.
    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).not.toHaveText('No results');

    await page.keyboard.press('Escape');
});

// ─── Highlights cleared on close ────────────────────────────────────

test('highlights are removed when search bar closes', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('cake');

    // Marks should exist.
    let marks = page.locator('#editor mark.search-highlight');
    expect(await marks.count()).toBeGreaterThan(0);

    // Close the search bar.
    await page.keyboard.press('Escape');

    // Marks should be gone.
    marks = page.locator('#editor mark.search-highlight');
    await expect(marks).toHaveCount(0);
});

// ─── Close button ───────────────────────────────────────────────────

test('close button closes the search bar', async () => {
    await loadContent(page, FIXTURE);
    await page.keyboard.press(`${MOD}+f`);
    await expect(page.locator('.search-bar')).toBeVisible();

    await page.locator('.search-close-btn').click();
    await expect(page.locator('.search-bar')).toBeHidden();
});

// ─── No results ─────────────────────────────────────────────────────

test('shows "No results" for unmatched query', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('xyznonexistent');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toHaveText('No results');

    await page.keyboard.press('Escape');
});

// ─── Cross-node regex match ─────────────────────────────────────────

test('regex can match across element boundaries', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);

    await page.locator('.search-toggle[data-action="regex"]').click();
    const input = page.locator('.search-input');
    // Match across the heading into the paragraph (separated by \n\n).
    await input.fill('cake\\n\\nA paragraph');

    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toContainText('1 of 1');

    // Should produce highlight marks in both the heading and paragraph.
    const marks = page.locator('#editor mark.search-highlight');
    expect(await marks.count()).toBe(2);

    await page.locator('.search-toggle[data-action="regex"]').click();
    await page.keyboard.press('Escape');
});

// ─── Minimum query length ───────────────────────────────────────────

test('plain text search requires at least 2 characters', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('c');

    // Single character should not trigger a search.
    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toHaveText('');

    const marks = page.locator('#editor mark.search-highlight');
    await expect(marks).toHaveCount(0);

    await page.keyboard.press('Escape');
});

test('regex search still works with single character', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);
    await page.keyboard.press(`${MOD}+f`);

    await page.locator('.search-toggle[data-action="regex"]').click();
    const input = page.locator('.search-input');
    await input.fill('c');

    // Regex mode should allow single char.
    const marks = page.locator('#editor mark.search-highlight');
    expect(await marks.count()).toBeGreaterThan(0);

    await page.locator('.search-toggle[data-action="regex"]').click();
    await page.keyboard.press('Escape');
});

// ─── Cursor proximity ───────────────────────────────────────────────

test('initial match is closest to cursor position', async () => {
    await loadContent(page, FIXTURE);
    await setSourceView(page);

    // Place cursor at the start of "## Another heading" by clicking it.
    const secondHeading = page.locator('#editor .md-line', { hasText: 'Another heading' });
    await secondHeading.click();

    await page.keyboard.press(`${MOD}+f`);
    const input = page.locator('.search-input');
    await input.fill('item');

    // 'item' appears in "List item one" and "List item two", both
    // after the cursor.  The active match should NOT be "1 of" if
    // there were earlier matches — there aren't any earlier "item"
    // matches here, but the key point is it picks the closest one
    // at or after the cursor, which is the first list item.
    const matchCount = page.locator('.search-match-count');
    await expect(matchCount).toContainText('1 of');

    // Now search for 'heading' — it appears in heading1 (before cursor)
    // and heading2 (at cursor).  The active match should be the one
    // at/after the cursor, i.e. the second heading.
    await input.fill('heading');
    await expect(matchCount).toContainText('2 of');

    await page.keyboard.press('Escape');
});
