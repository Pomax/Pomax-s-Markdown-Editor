/**
 * @fileoverview Integration test for scroll-to-cursor behaviour.
 *
 * Verifies that when the cursor is placed programmatically (e.g. via
 * session restore), the editor scrolls so the focused line is visible.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { clickInEditor, clickQuerySelector } from './test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_DIR = path.join(__dirname, '..', '..', 'src', 'renderer');
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/** The text that the target line must contain. */
const TARGET_TEXT = 'Chapter 5';

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
};

/** @type {import('node:http').Server} */
let server;

/** @type {string} */
let baseURL;

test.beforeAll(async () => {
    server = createServer(async (req, res) => {
        let urlPath = new URL(req.url ?? '/', 'http://localhost').pathname;
        if (urlPath === '/') urlPath = '/index.html';
        const filePath = path.resolve(path.join(RENDERER_DIR, urlPath));

        if (!filePath.startsWith(RENDERER_DIR)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        try {
            const content = await readFile(filePath);
            const ext = path.extname(filePath);
            res.writeHead(200, {
                'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
            });
            res.end(content);
        } catch {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    await new Promise((resolve) => server.listen(0, /** @type {() => void} */ (resolve)));
    const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
    baseURL = `http://localhost:${addr.port}`;
});

test.afterAll(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

/**
 * Reads the lorem ipsum fixture file.
 * @returns {Promise<string>}
 */
async function loadLoremFixture() {
    return readFile(path.join(FIXTURES_DIR, 'lorem.md'), 'utf-8');
}

test('placing the cursor on an off-screen node scrolls it into view', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    // Click into the editor to initialise it
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    // Load the lorem fixture so most of the document is off-screen
    const content = await loadLoremFixture();
    await page.evaluate((md) => window.editorAPI?.setContent(md), content);
    await page.waitForSelector('#editor .md-line');

    // Scroll to the very top to ensure the target line is off-screen
    await page.evaluate(() => {
        const container = document.getElementById('editor-container');
        if (container) container.scrollTop = 0;
    });
    await page.waitForTimeout(100);

    // Verify the target line is NOT visible before we place the cursor
    const targetLocator = page.locator('#editor .md-line', {
        hasText: TARGET_TEXT,
    });
    const beforeRect =
        /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
            await targetLocator.boundingBox()
        );
    const containerBox =
        /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
            await page.locator('#editor-container').boundingBox()
        );
    expect(beforeRect).not.toBeNull();
    expect(containerBox).not.toBeNull();
    // The target should be below the visible area
    expect(beforeRect.y).toBeGreaterThan(containerBox.y + containerBox.height);

    // Programmatically place the cursor on the target node, simulating
    // what session restore does.
    // Programmatically place the cursor on the target node, simulating
    // what session restore does.
    await page.evaluate((target) => {
        const lines = document.querySelectorAll('#editor .md-line');
        for (const line of lines) {
            if (line.textContent?.includes(target)) {
                const nodeId = line.getAttribute('data-node-id');
                if (nodeId && window.editorAPI) {
                    window.editorAPI.placeCursorAtNode(nodeId, 0);
                }
                break;
            }
        }
    }, TARGET_TEXT);

    // Allow time for the scroll to settle
    await page.waitForTimeout(200);

    // The target line should now be visible within the scroll container
    // (allow a few pixels of tolerance for sub-pixel rounding)
    const afterRect =
        /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
            await targetLocator.boundingBox()
        );
    expect(afterRect).not.toBeNull();
    expect(afterRect.y).toBeGreaterThanOrEqual(containerBox.y - 5);
    expect(afterRect.y + afterRect.height).toBeLessThanOrEqual(
        containerBox.y + containerBox.height + 5,
    );
});

test('placing the cursor on an off-screen node in source view scrolls it into view', async ({
    page,
}) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    // Click into the editor, switch to source view
    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    // Switch to source view
    const current = await editor.getAttribute('data-view-mode');
    if (current !== 'source') {
        await clickQuerySelector(page, '.toolbar-view-mode-toggle');
        await page.locator('#editor[data-view-mode="source"]').waitFor();
    }

    // Load the lorem fixture
    const content = await loadLoremFixture();
    await page.evaluate((md) => window.editorAPI?.setContent(md), content);
    await page.waitForSelector('#editor .md-line');

    // Scroll to the very top
    await page.evaluate(() => {
        const container = document.getElementById('editor-container');
        if (container) container.scrollTop = 0;
    });
    await page.waitForTimeout(100);

    // Programmatically place cursor on the target node
    await page.evaluate((target) => {
        const lines = document.querySelectorAll('#editor .md-line');
        for (const line of lines) {
            if (line.textContent?.includes(target)) {
                const nodeId = line.getAttribute('data-node-id');
                if (nodeId && window.editorAPI) {
                    window.editorAPI.placeCursorAtNode(nodeId, 0);
                }
                break;
            }
        }
    }, TARGET_TEXT);

    // Allow time for the scroll to settle
    await page.waitForTimeout(200);

    // The target should now be visible
    const targetLocator = page.locator('#editor .md-line', { hasText: TARGET_TEXT });
    const afterRect =
        /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
            await targetLocator.boundingBox()
        );
    const containerBox =
        /** @type {NonNullable<Awaited<ReturnType<import('@playwright/test').Locator['boundingBox']>>>} */ (
            await page.locator('#editor-container').boundingBox()
        );
    expect(afterRect).not.toBeNull();
    expect(containerBox).not.toBeNull();
    expect(afterRect.y).toBeGreaterThanOrEqual(containerBox.y - 5);
    expect(afterRect.y + afterRect.height).toBeLessThanOrEqual(
        containerBox.y + containerBox.height + 5,
    );
});
