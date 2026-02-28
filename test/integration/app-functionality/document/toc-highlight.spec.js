/**
 * @fileoverview Integration test for the ToC scroll-spy highlighting.
 *
 * Verifies that as the user scrolls through the document, the ToC
 * sidebar highlights the heading whose section occupies the most
 * visible area in the viewport.
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
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', 'fixtures');

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

/**
 * Reads the many-sections fixture file.
 * @returns {Promise<string>}
 */
async function loadManySectionsFixture() {
    return readFile(path.join(FIXTURES_DIR, 'many-sections.md'), 'utf-8');
}

test('ToC highlights the heading whose section fills most of the viewport', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    // Load the lorem fixture — it has multiple chapters with lots of content
    const content = await loadLoremFixture();
    await page.evaluate((md) => window.editorAPI?.setContent(md), content);
    await page.waitForSelector('#toc-sidebar .toc-link');

    // Scroll to the top — "Main text" section should dominate the viewport
    await page.evaluate(() => {
        const container = document.getElementById('editor-container');
        if (container) container.scrollTop = 0;
    });
    await page.waitForTimeout(100);

    // The first real content section is under "Lorem Ipsum" (h1).
    // Its content should dominate the viewport at scroll-top.
    const activeLink = page.locator('#toc-sidebar .toc-link.toc-active');
    await expect(activeLink).toHaveCount(1);
    const initialText = await activeLink.textContent();
    // Should be either "Lorem Ipsum" or "Main text" depending on
    // which section's content is most visible at the top.
    expect(['Lorem Ipsum', 'Main text']).toContain(initialText);

    // Now scroll so that Chapter 5 content fills most of the viewport.
    await page.evaluate((text) => {
        const container = document.getElementById('editor-container');
        const lines = document.querySelectorAll('#editor > .md-line');
        for (const line of lines) {
            if (line.textContent?.includes(text)) {
                const containerRect = container?.getBoundingClientRect();
                const lineRect = line.getBoundingClientRect();
                if (container && containerRect) {
                    container.scrollTop += lineRect.top - containerRect.top;
                }
                break;
            }
        }
    }, 'Chapter 5');
    await page.waitForTimeout(100);

    // Now Chapter 5 should be the active heading
    const activeAfterScroll = page.locator('#toc-sidebar .toc-link.toc-active');
    await expect(activeAfterScroll).toHaveCount(1);
    await expect(activeAfterScroll).toHaveText('Chapter 5');
});

test('ToC highlight updates when scrolling between sections', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    const content = await loadLoremFixture();
    await page.evaluate((md) => window.editorAPI?.setContent(md), content);
    await page.waitForSelector('#toc-sidebar .toc-link');

    // Scroll to bottom of the document
    await page.evaluate(() => {
        const container = document.getElementById('editor-container');
        if (container) container.scrollTop = container.scrollHeight;
    });
    await page.waitForTimeout(100);

    // The last chapter's content should dominate; the active link should
    // NOT be "Chapter 1"
    const activeLink = page.locator('#toc-sidebar .toc-link.toc-active');
    await expect(activeLink).toHaveCount(1);
    const activeText = await activeLink.textContent();
    expect(activeText).not.toBe('Lorem Ipsum');
    expect(activeText).not.toBe('Main text');
});

test('active ToC link is scrolled to the vertical center of the sidebar', async ({ page }) => {
    await page.goto(baseURL);
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    // Build a document with many headings so the ToC itself overflows.
    const md = await loadManySectionsFixture();
    await page.evaluate((content) => window.editorAPI?.setContent(content), md);
    await page.waitForSelector('#toc-sidebar .toc-link');

    // Scroll the editor to the very bottom so that the last section is active.
    await page.evaluate(() => {
        const container = document.getElementById('editor-container');
        if (container) container.scrollTop = container.scrollHeight;
    });
    await page.waitForTimeout(100);

    // The active link should be one of the last sections.
    const activeLink = page.locator('#toc-sidebar .toc-link.toc-active');
    await expect(activeLink).toHaveCount(1);

    // Verify the active link is roughly centered in the ToC sidebar.
    const positions = await page.evaluate(() => {
        const toc = document.getElementById('toc-sidebar');
        const active = toc?.querySelector('.toc-link.toc-active');
        if (!toc || !active) return null;
        const tocRect = toc.getBoundingClientRect();
        const linkRect = active.getBoundingClientRect();
        const linkCenter = linkRect.top + linkRect.height / 2;
        const tocCenter = tocRect.top + tocRect.height / 2;
        return { linkCenter, tocCenter, tocHeight: tocRect.height };
    });

    expect(positions).not.toBeNull();
    const p = /** @type {NonNullable<typeof positions>} */ (positions);
    // The active link's center should be within 40% of the ToC's center.
    // (Some leeway because the last item can't scroll past the bottom.)
    const tolerance = p.tocHeight * 0.4;
    expect(Math.abs(p.linkCenter - p.tocCenter)).toBeLessThanOrEqual(tolerance);
});
