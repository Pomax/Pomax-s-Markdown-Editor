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
 * Clicks a coordinate outside the editor (on the surrounding container
 * padding) so that the full blur event sequence fires naturally.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function defocusEditor(page) {
    // In Firefox, clicking on a non-focusable element (like the
    // editor-container padding) does NOT move focus away from a
    // contenteditable.  Use the native DOM blur() API instead —
    // this fires the full blur / focusout event chain.
    await page.evaluate(() => /** @type {HTMLElement|null} */ (document.activeElement)?.blur());
    // Give the editor time to re-render.
    await page.waitForTimeout(200);
}

/**
 * Click on a locator inside the editor using real mouse coordinates.
 *
 * `locator.click()` dispatches a synthetic event that skips the real
 * browser event sequence (mousedown → selectionchange → mouseup → click).
 * This helper gets the bounding box and fires a real `page.mouse.click()`
 * at the element's centre so the full event chain fires.
 *
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} locator
 */
export async function clickInEditor(page, locator) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('clickInEditor: element not visible');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * Switch the editor to source view by clicking the toolbar toggle.
 * If already in source view, this is a no-op.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function setSourceView(page) {
    const current = await page.locator('#editor').getAttribute('data-view-mode');
    if (current === 'source') return;
    await page.locator('.toolbar-view-mode-toggle').click();
    await page.locator('#editor[data-view-mode="source"]').waitFor();
}

/**
 * Switch the editor to focused view by clicking the toolbar toggle.
 * If already in focused view, this is a no-op.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function setFocusedView(page) {
    const current = await page.locator('#editor').getAttribute('data-view-mode');
    if (current !== 'source') return;
    await page.locator('.toolbar-view-mode-toggle').click();
    await page.locator('#editor[data-view-mode="focused"]').waitFor();
}
