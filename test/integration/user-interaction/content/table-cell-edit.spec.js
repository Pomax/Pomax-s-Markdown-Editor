/**
 * @fileoverview Integration tests for direct table cell editing.
 *
 * Verifies that clicking into a table cell, typing, backspacing, deleting,
 * pressing Enter (move to next row), and Tab/Shift+Tab navigation all work
 * correctly in focused (WYSIWYG) mode.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent } from '../../test-utils.js';

const isMac = process.platform === 'darwin';
const Home = isMac ? 'Meta+ArrowLeft' : 'Home';
const End = isMac ? 'Meta+ArrowRight' : 'End';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

const TABLE_MD = ['| Name | Age |', '| --- | --- |', '| Alice | 30 |', '| Bob | 25 |'].join('\n');

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test.describe('Table cell editing', () => {
    test.beforeEach(async () => {
        await loadContent(page, TABLE_MD);
    });

    test('clicking a cell and typing inserts text', async () => {
        // Click into the first body cell ("Alice")
        const firstCell = page.locator('.md-line.md-table td').first();
        await clickInEditor(page, firstCell);

        // Type additional text
        await page.keyboard.type('!');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('Alice!');
    });

    test('backspace deletes a character in a cell', async () => {
        // Click into the "Alice" cell
        const firstCell = page.locator('.md-line.md-table td').first();
        await clickInEditor(page, firstCell);

        // Move to the end of the cell text and delete one character
        await page.keyboard.press(End);
        await page.keyboard.press('Backspace');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('Alic');
        expect(markdown).not.toContain('Alice');
    });

    test('delete removes a character forward in a cell', async () => {
        // Click into the "Alice" cell
        const firstCell = page.locator('.md-line.md-table td').first();
        await clickInEditor(page, firstCell);

        // Move to home and delete one character forward
        await page.keyboard.press(Home);
        await page.keyboard.press('Delete');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('lice');
        expect(markdown).not.toContain('Alice');
    });

    test('enter moves to the next row in the same column', async () => {
        // Click into the header cell "Name"
        const headerCell = page.locator('.md-line.md-table th').first();
        await clickInEditor(page, headerCell);

        // Press Enter to move to the first body row
        await page.keyboard.press('Enter');

        // Type to verify we're now in the "Alice" cell
        await page.keyboard.press(Home);
        await page.keyboard.type('X');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('XAlice');
    });

    test('tab moves to the next cell', async () => {
        // Click into the header cell "Name"
        const headerCell = page.locator('.md-line.md-table th').first();
        await clickInEditor(page, headerCell);

        // Tab should move to the next cell (header "Age")
        await page.keyboard.press('Tab');

        // Type to verify we're in the "Age" cell
        await page.keyboard.press(Home);
        await page.keyboard.type('X');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('XAge');
    });

    test('tab wraps to the first cell of the next row', async () => {
        // Click into the header cell "Age" (second column)
        const headerCells = page.locator('.md-line.md-table th');
        await clickInEditor(page, headerCells.nth(1));

        // Tab should wrap to the first cell of the next row ("Alice")
        await page.keyboard.press('Tab');

        // Type to verify we're in the "Alice" cell
        await page.keyboard.press(Home);
        await page.keyboard.type('X');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('XAlice');
    });

    test('shift+tab moves to the previous cell', async () => {
        // Click into the "Age" header cell
        const headerCells = page.locator('.md-line.md-table th');
        await clickInEditor(page, headerCells.nth(1));

        // Shift+Tab should move back to "Name"
        await page.keyboard.press('Shift+Tab');

        // Type to verify we're in the "Name" cell
        await page.keyboard.press(Home);
        await page.keyboard.type('X');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('XName');
    });

    test('tab on last cell creates a new row', async () => {
        // Click into the last cell ("25" — last row, last column)
        const lastCell = page.locator('.md-line.md-table td').last();
        await clickInEditor(page, lastCell);

        // Tab should create a new row and move to its first cell
        await page.keyboard.press('Tab');

        // Type to verify we're in a new empty cell
        await page.keyboard.type('Charlie');

        const markdown = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
        expect(markdown).toContain('Charlie');

        // Should now have 3 body rows
        const bodyRows = page.locator('.md-line.md-table tbody tr');
        await expect(bodyRows).toHaveCount(3);
    });
});
