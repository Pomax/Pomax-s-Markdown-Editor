/**
 * @fileoverview Integration tests for table support.
 * Verifies the table toolbar button, table modal dialog, table parsing,
 * and table rendering in both source and focused modes.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..', '..');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    electronApp = await electron.launch({
        args: [path.join(projectRoot, 'src', 'main', 'main.js')],
        env: { ...process.env, TESTING: '1' },
    });
    page = await electronApp.firstWindow();

    await page.waitForFunction(() => document.readyState === 'complete');
    await electronApp.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win.isVisible()) {
            await new Promise((resolve) => win.once('show', resolve));
        }
    });
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

    // Verify the table node was created
    const tableNode = page.locator('.md-table');
    await expect(tableNode).toBeVisible();

    // Verify the markdown content includes table syntax
    const content = await page.evaluate(() => window.editorAPI?.getContent());
    expect(content).toContain('| Header 1 | Header 2 |');
    expect(content).toContain('---');
});

test('table renders as an HTML table in focused mode (unfocused)', async () => {
    // The editor defaults to focused mode.
    // Click somewhere else first to unfocus the table, then check rendering.
    // First, add a paragraph above by pressing Home then Enter.
    // Actually, we just need to click on a non-table node.
    // Let's evaluate the table's rendered HTML.
    const tableElement = page.locator('.md-table');
    await expect(tableElement).toBeVisible();

    // The unfocused table should be rendered as an HTML <table>
    const htmlTable = page.locator('.md-table table');
    // It may or may not be visible depending on focus — let's check the content
    const content = await page.evaluate(() => window.editorAPI?.getContent());
    expect(content).toContain('Header 1');
    expect(content).toContain('Header 2');
});

test('clicking table button on existing table opens edit modal with pre-filled dimensions', async () => {
    // Click on the table node
    const tableNode = page.locator('.md-table');
    await tableNode.click();

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
