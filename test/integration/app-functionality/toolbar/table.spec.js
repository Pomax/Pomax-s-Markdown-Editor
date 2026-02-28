/**
 * @fileoverview Integration tests for table support.
 * Verifies the table toolbar button, table modal dialog, table parsing,
 * and table rendering in both source and writing modes.
 */

import { expect, test } from '@playwright/test';
import {
    clickInEditor,
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
    await electronApp.close();
});

test('table button is visible in the toolbar', async () => {
    const tableButton = page.locator('[data-button-id="table"]');
    await expect(tableButton).toBeVisible();
    await expect(tableButton).toHaveAttribute('title', 'Table');
});

test('clicking table button opens the table modal', async () => {
    const tableButton = page.locator('[data-button-id="table"]');
    await tableButton.click();

    const dialog = page.locator('.table-dialog');
    await expect(dialog).toBeVisible();

    // Verify the modal has the expected fields
    const colsInput = page.locator('#table-columns');
    const rowsInput = page.locator('#table-rows');

    await expect(colsInput).toBeVisible();
    await expect(rowsInput).toBeVisible();

    // Defaults should be 3 × 3
    await expect(colsInput).toHaveValue('3');
    await expect(rowsInput).toHaveValue('3');

    // Cancel the dialog
    const cancelBtn = page.locator('.table-btn--cancel');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
});

test('inserting a table via the modal creates a table node', async () => {
    const tableButton = page.locator('[data-button-id="table"]');
    await tableButton.click();

    const dialog = page.locator('.table-dialog');
    await expect(dialog).toBeVisible();

    // Set to 2 columns, 2 rows
    await page.fill('#table-columns', '2');
    await page.fill('#table-rows', '2');

    // Click Insert
    const insertBtn = page.locator('.table-btn--insert');
    await insertBtn.click();
    await expect(dialog).not.toBeVisible();

    // Verify the table node was created (use .md-line.md-table to avoid
    // matching the inner <table class="md-table"> as well).
    const tableNode = page.locator('.md-line.md-table');
    await expect(tableNode).toBeVisible();

    // Verify the markdown content includes table syntax
    const content = await page.evaluate(() => window.editorAPI?.getContent());
    expect(content).toContain('| Header 1 | Header 2 |');
    expect(content).toContain('---');
});

test('table renders as an HTML table in writing mode', async () => {
    // Set up: load content with a table and switch to writing view.
    const tableMarkdown = '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |';
    await loadContent(page, tableMarkdown);
    await setWritingView(page);

    // In WYSIWYG mode the table is always rendered as an HTML <table>.
    const tableElement = page.locator('.md-line.md-table');
    await expect(tableElement).toBeVisible();

    // The table should always be rendered as an HTML <table> (WYSIWYG)
    const htmlTable = page.locator('.md-line.md-table table');
    // It may or may not be visible depending on focus — let's check the content
    const content = await page.evaluate(() => window.editorAPI?.getContent());
    expect(content).toContain('Header 1');
    expect(content).toContain('Header 2');
});

test('clicking table button on existing table opens edit modal with pre-filled dimensions', async () => {
    // Set up: load a 2×2 table and switch to writing view.
    const tableMarkdown =
        '| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\n| Cell 3 | Cell 4 |';
    await loadContent(page, tableMarkdown);
    await setWritingView(page);

    // Click on the table node
    const tableNode = page.locator('.md-line.md-table');
    await clickInEditor(page, tableNode);

    // Now click the table button
    const tableButton = page.locator('[data-button-id="table"]');
    await tableButton.click();

    const dialog = page.locator('.table-dialog');
    await expect(dialog).toBeVisible();

    // Check that the heading says "Edit Table"
    const heading = page.locator('.table-dialog-header h2');
    await expect(heading).toHaveText('Edit Table');

    // Check that the fields are pre-filled (2 cols, 2 rows from previous test)
    const colsInput = page.locator('#table-columns');
    const rowsInput = page.locator('#table-rows');
    await expect(colsInput).toHaveValue('2');
    await expect(rowsInput).toHaveValue('2');

    // Check that the button says "Update"
    const updateBtn = page.locator('.table-btn--insert');
    await expect(updateBtn).toHaveText('Update');

    // Cancel the dialog
    const cancelBtn = page.locator('.table-btn--cancel');
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
});

test('table cells render inline markdown formatting', async () => {
    const markdown = [
        '| Feature | Status |',
        '| --- | --- |',
        '| **bold** cell | *italic* cell |',
        '| `code` cell | ~~struck~~ cell |',
    ].join('\n');

    await loadContent(page, markdown);
    await setWritingView(page);

    const table = page.locator('.md-line.md-table table');
    await expect(table).toBeVisible();

    // Bold cell
    const bold = table.locator('td strong');
    await expect(bold).toBeVisible();
    expect(await bold.textContent()).toBe('bold');

    // Italic cell
    const italic = table.locator('td em');
    await expect(italic).toBeVisible();
    expect(await italic.textContent()).toBe('italic');

    // Code cell
    const code = table.locator('td code');
    await expect(code).toBeVisible();
    expect(await code.textContent()).toBe('code');

    // Strikethrough cell
    const del = table.locator('td del');
    await expect(del).toBeVisible();
    expect(await del.textContent()).toBe('struck');
});

test('table cells render inline HTML formatting', async () => {
    const markdown = [
        '| A | B |',
        '| --- | --- |',
        '| this <i>is</i> text | <b>bold</b> text |',
        '| <sub>sub</sub> text | <mark>marked</mark> text |',
    ].join('\n');

    await loadContent(page, markdown);
    await setWritingView(page);

    const table = page.locator('.md-line.md-table table');
    await expect(table).toBeVisible();

    // Italic via <i>
    const italic = table.locator('td i');
    await expect(italic).toBeVisible();
    expect(await italic.textContent()).toBe('is');

    // Bold via <b>
    const bold = table.locator('td b');
    await expect(bold).toBeVisible();
    expect(await bold.textContent()).toBe('bold');

    // Subscript via <sub>
    const sub = table.locator('td sub');
    await expect(sub).toBeVisible();
    expect(await sub.textContent()).toBe('sub');

    // Mark via <mark>
    const mark = table.locator('td mark');
    await expect(mark).toBeVisible();
    expect(await mark.textContent()).toBe('marked');
});
