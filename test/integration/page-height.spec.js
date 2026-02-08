/**
 * @fileoverview Integration test for dynamic page height.
 * Verifies that the editor page grows to fit its content instead of
 * staying at a fixed height.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_DIR = path.join(__dirname, '..', '..', 'src', 'renderer');

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

test('editor page height grows when content exceeds initial min-height', async ({ page }) => {
    await page.goto(baseURL);

    // Wait for the editor to initialize
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await editor.click();

    // Measure the initial height of the editor (should be the A4 min-height)
    const initialHeight = await editor.evaluate(
        (el) => /** @type {HTMLElement} */ (el).offsetHeight,
    );
    expect(initialHeight).toBeGreaterThan(0);

    // Type enough lines to exceed the initial page height.
    // Each Enter creates a new paragraph line.
    const lineCount = 80;
    for (let i = 0; i < lineCount; i++) {
        await page.keyboard.type(`Line ${i + 1}`);
        await page.keyboard.press('Enter');
    }

    // The editor height should now be greater than the initial min-height
    const expandedHeight = await editor.evaluate(
        (el) => /** @type {HTMLElement} */ (el).offsetHeight,
    );
    expect(expandedHeight).toBeGreaterThan(initialHeight);
});
