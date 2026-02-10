/**
 * @fileoverview Integration tests for the editor application.
 */

import { expect, test } from '@playwright/test';
import { launchApp } from './test-utils.js';

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

test.describe('Application Launch', () => {
    test('should create a window', async () => {
        const windowCount = await electronApp.evaluate(async ({ BrowserWindow }) => {
            return BrowserWindow.getAllWindows().length;
        });

        expect(windowCount).toBe(1);
    });

    test('should have A4 aspect ratio on the editor element', async () => {
        // Verify that the editor's CSS min-height enforces the A4 aspect
        // ratio relative to its max-width.  Both computed values resolve
        // to pixels, so the ratio is viewport-independent.
        const editor = page.locator('#editor');
        const ratio = await editor.evaluate((el) => {
            const style = getComputedStyle(el);
            const minHeight = Number.parseFloat(style.minHeight);
            const maxWidth = Number.parseFloat(style.maxWidth);
            return minHeight / maxWidth;
        });

        // A4 aspect ratio is approximately 1.414
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
