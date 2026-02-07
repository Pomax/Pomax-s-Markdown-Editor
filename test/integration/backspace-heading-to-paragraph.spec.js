/**
 * @fileoverview Integration test for heading-to-paragraph reversion via backspace.
 * Types "# main", then presses backspace 6 times. The heading should revert
 * to an empty paragraph, not a paragraph containing "#".
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

test('typing "# main" then backspace 6 times reverts to an empty paragraph', async ({
    page,
}) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await editor.click();

    // Type "# main" character by character
    for (const char of ['#', ' ', 'm', 'a', 'i', 'n']) {
        await page.keyboard.type(char);
    }

    // Verify the heading was created
    const headingLine = editor.locator('.md-heading1');
    await expect(headingLine).toBeVisible();

    // Press backspace 6 times to delete "main", the space, and the "#"
    for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Backspace');
    }

    // The editor should now contain an empty paragraph, not a paragraph with "#"
    const paragraphLine = editor.locator('.md-paragraph');
    await expect(paragraphLine).toBeVisible();

    // There should be no heading element remaining
    const remainingHeading = editor.locator('[class*="md-heading"]');
    await expect(remainingHeading).toHaveCount(0);

    // The text content should be empty (no leftover "#" or other characters)
    const content = await editor.innerText();
    expect(content.trim()).toBe('');
});
