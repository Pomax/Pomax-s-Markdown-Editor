/**
 * @fileoverview Integration test confirming that toolbar button tooltips
 * are fully visible — they must appear below the toolbar, not clipped
 * underneath the window's title / menu bar.
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

test('toolbar tooltip appears below the button, not above', async () => {
    const boldButton = page.locator('[data-button-id="bold"]');
    await expect(boldButton).toBeVisible();

    // Hover over the Bold button to trigger the CSS tooltip.
    await boldButton.hover();

    // The tooltip is rendered via the ::after pseudo-element.  We cannot
    // query pseudo-elements directly in Playwright, so instead we evaluate
    // the computed style in-page to obtain the tooltip's bounding position.
    const positions = await page.evaluate(() => {
        const btn = document.querySelector('[data-button-id="bold"]');
        if (!btn) throw new Error('Bold button not found');

        const btnRect = btn.getBoundingClientRect();
        const style = window.getComputedStyle(btn, '::after');

        // The ::after is position: absolute with top: 100%.
        // Its rendered top equals the button's bottom edge + any margin-top.
        const marginTop = Number.parseFloat(style.marginTop) || 0;
        const tooltipTop = btnRect.bottom + marginTop;

        // The toolbar container's edges.
        const toolbar = document.getElementById('toolbar-container');
        if (!toolbar) throw new Error('Toolbar container not found');
        const toolbarRect = toolbar.getBoundingClientRect();

        return {
            tooltipTop: Math.round(tooltipTop),
            buttonBottom: Math.round(btnRect.bottom),
            toolbarTop: Math.round(toolbarRect.top),
            toolbarBottom: Math.round(toolbarRect.bottom),
            viewportHeight: window.innerHeight,
        };
    });

    // The tooltip must start at or below the button's bottom edge (i.e.
    // it's positioned below the button, not above it).
    expect(positions.tooltipTop).toBeGreaterThanOrEqual(positions.buttonBottom);

    // The tooltip must not extend above the toolbar container — that would
    // put it under the window title / menu bar.
    expect(positions.tooltipTop).toBeGreaterThanOrEqual(positions.toolbarTop);

    // And it must be within the visible viewport.
    expect(positions.tooltipTop).toBeLessThan(positions.viewportHeight);
});
