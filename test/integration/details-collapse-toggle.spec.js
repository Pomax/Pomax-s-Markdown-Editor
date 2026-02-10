/**
 * @fileoverview Integration test for the fake details disclosure triangle.
 *
 * Loads test/fixtures/details.md in focused view and verifies that clicking
 * the disclosure triangle collapses the body (reducing the editor's scroll
 * height) and clicking it again expands it back (restoring the original
 * height).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..', '..');
const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'details.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

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
            await new Promise((resolve) => win.once('show', /** @type {any} */ (resolve)));
        }
    });

    // Load the details fixture content into the editor.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, fixtureContent);
    await page.waitForTimeout(300);
});

test.afterAll(async () => {
    await electronApp.close();
});

test('clicking the disclosure triangle collapses and expands the details body', async () => {
    // The editor should be in focused view by default (details rendered as
    // fake details with .md-details).
    const detailsBlock = page.locator('#editor .md-details');
    await expect(detailsBlock).toBeVisible();

    // The details body should start open (default preference is open).
    await expect(detailsBlock).toHaveClass(/md-details--open/);

    // ── Step 1: Measure the details block height while expanded ──
    // We measure the .md-details element's own height rather than the
    // editor's scrollHeight, because the editor has a large min-height
    // (A4 aspect ratio) that masks content-size changes.
    const heightExpanded = await page.evaluate(() => {
        const el = document.querySelector('#editor .md-details');
        return el ? el.getBoundingClientRect().height : 0;
    });
    expect(heightExpanded).toBeGreaterThan(0);

    // ── Step 2: Click the triangle to collapse ──
    // Use page.mouse to simulate a real mouse click (mousedown → mouseup →
    // click) so the browser fires selectionchange between mousedown and
    // click, just like a real human click.  Playwright's locator.click()
    // dispatches a synthetic click that skips the selectionchange, hiding
    // bugs where the DOM is destroyed before the click handler fires.
    const triangleLoc = page.locator('#editor .md-details-triangle');
    const triangleBox = await triangleLoc.boundingBox();
    expect(triangleBox).not.toBeNull();
    const tx = triangleBox.x + triangleBox.width / 2;
    const ty = triangleBox.y + triangleBox.height / 2;
    await page.mouse.click(tx, ty);
    await page.waitForTimeout(300);

    // The details block should no longer have the open class.
    await expect(detailsBlock).not.toHaveClass(/md-details--open/);

    // The body should now be hidden.
    const detailsBody = page.locator('#editor .md-details-body');
    await expect(detailsBody).toBeHidden();

    // The details block height should be smaller than when expanded.
    const heightCollapsed = await page.evaluate(() => {
        const el = document.querySelector('#editor .md-details');
        return el ? el.getBoundingClientRect().height : 0;
    });
    expect(
        heightCollapsed,
        `collapsed height (${heightCollapsed}) should be less than expanded height (${heightExpanded})`,
    ).toBeLessThan(heightExpanded);

    // ── Step 3: Click the triangle again to expand ──
    // Re-query the bounding box because the DOM was re-rendered.
    const triangleBox2 = await triangleLoc.boundingBox();
    expect(triangleBox2).not.toBeNull();
    const tx2 = triangleBox2.x + triangleBox2.width / 2;
    const ty2 = triangleBox2.y + triangleBox2.height / 2;
    await page.mouse.click(tx2, ty2);
    await page.waitForTimeout(300);

    // The details block should be open again.
    await expect(detailsBlock).toHaveClass(/md-details--open/);

    // The body should be visible again.
    await expect(detailsBody).toBeVisible();

    // The details block height should match the original expanded height.
    const heightReexpanded = await page.evaluate(() => {
        const el = document.querySelector('#editor .md-details');
        return el ? el.getBoundingClientRect().height : 0;
    });
    expect(
        heightReexpanded,
        `re-expanded height (${heightReexpanded}) should equal original expanded height (${heightExpanded})`,
    ).toBe(heightExpanded);
});
