/**
 * @fileoverview Integration test for heading creation via keyboard input.
 * Serves the renderer content over HTTP and tests in a real Firefox browser.
 */

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RENDERER_DIR = path.join(__dirname, '..', '..', 'src', 'renderer');

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

    await new Promise((resolve) => server.listen(0, resolve));
    const addr = /** @type {import('node:net').AddressInfo} */ (server.address());
    baseURL = `http://localhost:${addr.port}`;
});

test.afterAll(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('typing "# main" letter by letter creates a heading with correct content', async ({
    page,
}) => {
    await page.goto(baseURL);

    // Wait for the editor to initialize and render its first line
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await editor.click();

    // Type each character individually to simulate real user input
    for (const char of ['#', ' ', 'm', 'a', 'i', 'n']) {
        await page.keyboard.type(char);
    }

    // The editor should now contain a heading1 element
    const headingLine = editor.locator('.md-heading1');
    await expect(headingLine).toBeVisible();

    // The heading content span should contain "main"
    const contentSpan = headingLine.locator('.md-content');
    await expect(contentSpan).toHaveText('main');
});
