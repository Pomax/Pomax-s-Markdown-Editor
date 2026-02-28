/**
 * @fileoverview Integration test for the Table of Contents sidebar.
 * Verifies that clicking a TOC link scrolls the heading to the top of
 * the editor container.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { clickInEditor } from '../../test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_DIR = path.join(__dirname, '..', '..', '..', '..', 'src', 'renderer');

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

test('clicking a TOC link scrolls the heading to the top of the editor container', async ({
    page,
}) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    // Build a document with enough content to force scrolling:
    // An h1, many paragraphs, then an h2 that will be off-screen.
    await page.keyboard.type('# First Heading');
    await page.keyboard.press('Enter');

    for (let i = 0; i < 60; i++) {
        await page.keyboard.type(`Paragraph line ${i + 1}`);
        await page.keyboard.press('Enter');
    }

    await page.keyboard.type('## Second Heading');
    await page.keyboard.press('Enter');

    for (let i = 0; i < 10; i++) {
        await page.keyboard.type(`More content ${i + 1}`);
        await page.keyboard.press('Enter');
    }

    // Wait for the TOC to pick up the headings
    await page.waitForSelector('#toc-sidebar .toc-link');

    // Find the TOC link for "Second Heading"
    const tocLink = page.locator('#toc-sidebar .toc-link', { hasText: 'Second Heading' });
    await expect(tocLink).toBeVisible();

    // Click the TOC link
    await tocLink.click();

    // Allow a frame for the instant scroll to take effect
    await page.waitForTimeout(100);

    // Verify that the heading is at the top of the scroll container.
    // We measure the heading's top relative to the container's top:
    // it should be ≈ 0 (within a tolerance for browser scroll adjustments).
    const offset = await page.evaluate(() => {
        const container = document.getElementById('editor-container');
        const heading = document.querySelector('.md-heading2');
        if (!container || !heading) return null;
        const containerRect = container.getBoundingClientRect();
        const headingRect = heading.getBoundingClientRect();
        return headingRect.top - containerRect.top;
    });

    expect(offset).not.toBeNull();
    // The heading should be within 100px of the container's top edge
    expect(/** @type {number} */ (offset)).toBeGreaterThanOrEqual(-100);
    expect(/** @type {number} */ (offset)).toBeLessThanOrEqual(100);
});
