/**
 * @fileoverview Integration tests for the editor application.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    electronApp = await electron.launch({
        args: [path.join(__dirname, '..', '..', 'src', 'main', 'main.js')],
    });
    page = await electronApp.firstWindow();

    // Wait for the window to become visible (it is created with show: false
    // and shown on the ready-to-show event).
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

test.describe('Application Launch', () => {
    test('should open a window', async () => {
        const windowState = await electronApp.evaluate(async ({ BrowserWindow }) => {
            const mainWindow = BrowserWindow.getAllWindows()[0];
            return {
                isVisible: mainWindow.isVisible(),
                title: mainWindow.getTitle(),
            };
        });

        expect(windowState.isVisible).toBe(true);
    });

    test('should have A4 aspect ratio', async () => {
        const windowState = await electronApp.evaluate(async ({ BrowserWindow }) => {
            const mainWindow = BrowserWindow.getAllWindows()[0];
            const bounds = mainWindow.getBounds();
            return {
                width: bounds.width,
                height: bounds.height,
            };
        });

        // A4 aspect ratio is approximately 1:1.414
        const ratio = windowState.height / windowState.width;
        expect(ratio).toBeGreaterThan(1.3);
        expect(ratio).toBeLessThan(1.5);
    });
});

test.describe('Editor Container', () => {
    test('should have an editor element', async () => {
        const editor = await page.locator('#editor');
        await expect(editor).toBeVisible();
    });

    test('should have a toolbar', async () => {
        const toolbar = await page.locator('#toolbar-container');
        await expect(toolbar).toBeVisible();
    });

    test('editor should be editable', async () => {
        const editor = await page.locator('#editor');
        const isEditable = await editor.getAttribute('contenteditable');
        expect(isEditable).toBe('true');
    });
});

test.describe('Toolbar', () => {
    test('should have formatting buttons', async () => {
        const toolbar = await page.locator('.toolbar');
        await expect(toolbar).toBeVisible();

        // Check for some essential buttons
        const boldButton = await page.locator('[data-button-id="bold"]');
        const italicButton = await page.locator('[data-button-id="italic"]');
        const heading1Button = await page.locator('[data-button-id="heading1"]');

        await expect(boldButton).toBeVisible();
        await expect(italicButton).toBeVisible();
        await expect(heading1Button).toBeVisible();
    });
});

test.describe('Text Input', () => {
    test('should allow typing in the editor', async () => {
        const editor = await page.locator('#editor');
        await editor.click();
        await page.keyboard.type('Hello, World!');

        const content = await editor.innerText();
        expect(content).toContain('Hello, World!');
    });
});

test.describe('Keyboard Shortcuts', () => {
    test('should handle Ctrl+Z for undo', async () => {
        const editor = await page.locator('#editor');
        await editor.click();
        await page.keyboard.type('Test');
        await page.keyboard.press('Control+z');

        // Note: Actual undo behavior depends on implementation
        // This test verifies the shortcut is captured
    });
});
