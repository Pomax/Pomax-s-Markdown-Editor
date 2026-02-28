/**
 * @fileoverview Integration test for the reload functionality.
 * Verifies that Help → Reload reloads the front-end and restores
 * open files from the database (same as a normal app launch).
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, projectRoot } from '../../test-utils.js';

const readmePath = path.join(projectRoot, 'README.md');
const readmeContent = fs.readFileSync(readmePath, 'utf-8');

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

test('reload restores a saved file from disk', async () => {
    // Persist the README as the open file in the settings DB so that
    // reload has something to restore.
    await electronApp.evaluate((electron, rPath) => {
        const sm = /** @type {any} */ (globalThis).__settingsManager;
        sm.set('openFiles', [
            {
                filePath: rPath,
                active: true,
                cursorOffset: 0,
                contentHash: 0,
                scrollTop: 0,
                cursorPath: null,
                tocHeadingPath: null,
            },
        ]);
    }, readmePath);

    // Trigger reload via the IPC API
    await page.evaluate(() => window.electronAPI?.reload());

    // Wait for the page to fully reload and the editor to re-initialise
    await page.waitForFunction(
        () => {
            return document.readyState === 'complete' && !!window.editorAPI;
        },
        { timeout: 10000 },
    );

    // Wait for the content to be restored from disk
    await page.waitForFunction(
        () => {
            const content = window.editorAPI?.getContent() ?? '';
            return content.includes('Markdown Editor');
        },
        { timeout: 10000 },
    );

    // Verify the content matches the on-disk file
    const contentAfter = await page.evaluate(() => window.editorAPI?.getContent() ?? '');
    expect(contentAfter).toContain("# Pomax's Markdown Editor");
});
