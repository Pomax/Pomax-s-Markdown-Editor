/**
 * @fileoverview Shared helpers for Electron-based integration tests.
 *
 * Every test file that launches Electron should call {@link launchApp} in
 * its `beforeAll` hook instead of duplicating the launch / wait boilerplate.
 *
 * The standard viewport is 800 × 1132 px (an A4 portrait aspect ratio) so
 * that tests behave identically on CI runners whose physical screen may be
 * landscape or whose window-manager may clamp the window to a small size.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.join(__dirname, '..', '..');

/** Standard viewport: 800 wide × 1132 tall (A4 portrait ratio). */
export const VIEWPORT = { width: 800, height: 1132 };

/**
 * Launch the Electron app, wait for the window to be ready, and set a
 * predictable viewport size so tests are not affected by the CI runner's
 * physical screen dimensions.
 *
 * @param {string[]} [extraArgs]  Additional CLI arguments (e.g. a file path).
 * @returns {Promise<{ electronApp: import('@playwright/test').ElectronApplication, page: import('@playwright/test').Page }>}
 */
export async function launchApp(extraArgs = []) {
    const electronApp = await electron.launch({
        args: [
            ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
            path.join(projectRoot, 'src', 'main', 'main.js'),
            ...extraArgs,
        ],
        env: { ...process.env, TESTING: '1' },
    });
    const page = await electronApp.firstWindow();

    // Wait for the renderer to be ready.
    await page.waitForFunction(() => document.readyState === 'complete');

    // Force a consistent viewport so layout-sensitive tests pass on CI.
    await page.setViewportSize(VIEWPORT);

    return { electronApp, page };
}

/**
 * Load a fixture file's content into the editor via the IPC bridge, then
 * wait for the editor DOM to settle.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} fixtureContent  Raw markdown string to load.
 */
export async function loadContent(page, fixtureContent) {
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, fixtureContent);
    // Wait for the editor to re-render.
    await page.waitForSelector('#editor .md-line');
}

/**
 * Move focus away from the editor so that no node is "focused" in the
 * focused-writing renderer.  Useful after switching view modes when
 * you need to assert that heading syntax is hidden.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function defocusEditor(page) {
    // Blur the editor element.  The editor's handleBlur clears the
    // treeCursor and re-renders in focused view, so no node will show
    // its raw markdown syntax after this call.
    await page.evaluate(() => {
        const editor = /** @type {HTMLElement|null} */ (document.querySelector('#editor'));
        if (editor) editor.blur();
    });
    // Give the editor time to re-render.
    await page.waitForTimeout(200);
}
