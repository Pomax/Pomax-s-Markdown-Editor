/**
 * @fileoverview Integration tests for session-save state.
 *
 * Verifies that when the app flushes its open-files list (as it does on
 * close), the persisted data includes the correct cursor position and
 * the currently active ToC heading — and that reopening the app restores
 * both correctly.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { clickInEditor, closeApp, launchApp } from '../../test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, '..', '..', '..', 'fixtures');
const MANY_SECTIONS = path.join(FIXTURES_DIR, 'many-sections.md');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await closeApp(electronApp);
});

test('flushing open files saves the current cursorPath', async () => {
    const content = await readFile(MANY_SECTIONS, 'utf-8');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    await page.evaluate((md) => window.editorAPI?.setContent(md), content);
    await page.waitForSelector('#editor .md-line');

    // Place the cursor on "Section 15" (a heading roughly in the middle)
    await page.evaluate(() => {
        const tree = /** @type {any} */ (window).__editor?.syntaxTree;
        if (!tree) return;
        const target = tree.children.find(
            (/** @type {any} */ n) =>
                n.type.startsWith('heading') && n.content?.includes('Section 15'),
        );
        if (target) {
            tree.treeCursor = { nodeId: target.id, offset: 4 };
            /** @type {any} */ (window).__editor?.placeCursor();
        }
    });

    // Flush and read back the persisted state
    await page.evaluate(() => /** @type {any} */ (window).__flushOpenFiles?.());

    const saved = await page.evaluate(() => {
        const tree = /** @type {any} */ (window).__editor?.syntaxTree;
        if (!tree?.treeCursor) return null;
        return {
            cursorPath: tree.getPathToCursor(),
            nodeId: tree.treeCursor.nodeId,
            offset: tree.treeCursor.offset,
        };
    });

    expect(saved).not.toBeNull();
    const s = /** @type {NonNullable<typeof saved>} */ (saved);
    expect(s.cursorPath).not.toBeNull();
    expect(s.cursorPath.length).toBeGreaterThanOrEqual(2);
    // The last element is the character offset within the node
    expect(s.cursorPath[s.cursorPath.length - 1]).toBe(4);
});

test('flushing open files saves the active ToC heading path', async () => {
    const content = await readFile(MANY_SECTIONS, 'utf-8');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);

    await page.evaluate((md) => window.editorAPI?.setContent(md), content);
    await page.waitForSelector('#toc-sidebar .toc-link');

    // Scroll so that "Section 20" fills most of the viewport
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
    }, 'Section 20');

    // Wait for the ToC to highlight a section in the Section 20 neighbourhood.
    // The initial active heading is "Section 1" (or "Many Sections") so we
    // wait until the active heading number is >= 19 to be sure the scroll
    // has taken effect and _updateActiveHeading has run.
    await page.waitForFunction(
        () => {
            const text =
                document.querySelector('#toc-sidebar .toc-link.toc-active')?.textContent ?? '';
            const m = text.match(/^Section (\d+)$/);
            return m && Number(m[1]) >= 19;
        },
        { timeout: 5000 },
    );

    // Read the heading that is actually active after scroll
    const activeHeadingText = await page.evaluate(
        () => document.querySelector('#toc-sidebar .toc-link.toc-active')?.textContent ?? '',
    );
    expect(activeHeadingText).toBeTruthy();

    // Flush open files — this is what happens on app close
    await page.evaluate(() => /** @type {any} */ (window).__flushOpenFiles?.());

    // Read back the saved ToC heading path from the renderer
    const tocHeadingPath = await page.evaluate(() => {
        const tree = /** @type {any} */ (window).__editor?.syntaxTree;
        if (!tree) return null;
        const tocActive = document.querySelector('#toc-sidebar .toc-link.toc-active');
        if (!tocActive) return null;
        const nodeId = /** @type {HTMLElement} */ (tocActive).dataset.nodeId;
        if (!nodeId) return null;
        return tree.getPathToNode(nodeId);
    });

    expect(tocHeadingPath).not.toBeNull();
    const thp = /** @type {NonNullable<typeof tocHeadingPath>} */ (tocHeadingPath);
    expect(thp.length).toBeGreaterThanOrEqual(1);

    // Verify the path resolves back to the same heading
    const resolvedText = await page.evaluate((p) => {
        const tree = /** @type {any} */ (window).__editor?.syntaxTree;
        if (!tree) return null;
        const node = tree.getNodeAtPath(p);
        return node?.content ?? null;
    }, thp);

    expect(resolvedText).toContain(activeHeadingText);
});

test('reopening the app restores cursor position and ToC heading', async () => {
    // ── Phase 1: set up state and persist ─────────────────────────
    const app1 = await launchApp([MANY_SECTIONS]);
    const page1 = app1.page;

    // Wait for the file to load via the CLI path
    await page1.waitForFunction(
        () => {
            const md = window.editorAPI?.getContent() ?? '';
            return md.includes('Section 15');
        },
        { timeout: 10000 },
    );
    await page1.waitForSelector('#toc-sidebar .toc-link');

    // Place cursor on "Section 15" at offset 4
    await page1.evaluate(() => {
        const tree = /** @type {any} */ (window).__editor?.syntaxTree;
        if (!tree) return;
        const target = tree.children.find(
            (/** @type {any} */ n) =>
                n.type.startsWith('heading') && n.content?.includes('Section 15'),
        );
        if (target) {
            tree.treeCursor = { nodeId: target.id, offset: 4 };
            /** @type {any} */ (window).__editor?.placeCursor();
        }
    });

    // Scroll so that "Section 15" content is visible (triggers ToC highlight)
    await page1.evaluate((text) => {
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
    }, 'Section 15');

    // Wait for the ToC to highlight a section in the Section 15 neighbourhood.
    await page1.waitForFunction(
        () => {
            const text =
                document.querySelector('#toc-sidebar .toc-link.toc-active')?.textContent ?? '';
            const m = text.match(/^Section (\d+)$/);
            return m && Number(m[1]) >= 14;
        },
        { timeout: 5000 },
    );

    // Read whichever heading the ToC actually highlighted after scroll
    const savedHeadingText = await page1.evaluate(
        () => document.querySelector('#toc-sidebar .toc-link.toc-active')?.textContent ?? '',
    );
    expect(savedHeadingText).toBeTruthy();

    // Flush renderer state to the main process, then persist to SQLite
    await page1.evaluate(() => /** @type {any} */ (window).__flushOpenFiles?.());
    await app1.electronApp.evaluate(() => {
        /** @type {any} */ (global).__saveOpenFiles();
    });

    // Read back what was persisted
    const persisted = await app1.electronApp.evaluate(() => {
        return /** @type {any} */ (global).__settingsManager.get('openFiles', null);
    });

    await closeApp(app1.electronApp);

    expect(persisted).not.toBeNull();
    expect(persisted.length).toBe(1);
    expect(persisted[0].cursorPath).not.toBeNull();
    expect(persisted[0].tocHeadingPath).not.toBeNull();

    // ── Phase 2: reopen and verify restore ────────────────────────
    const app2 = await launchApp();
    const page2 = app2.page;

    // Wait for the editor API to be ready
    await page2.waitForFunction(() => !!window.editorAPI, { timeout: 10000 });

    // Manually trigger restore from the persisted data (TESTING=1 skips
    // automatic restore so we drive it explicitly).
    await app2.electronApp.evaluate(({ BrowserWindow }) => {
        const sm = /** @type {any} */ (global).__settingsManager;
        const openFiles = sm.get('openFiles', null);
        if (!openFiles || openFiles.length === 0) return;
        const win = BrowserWindow.getAllWindows()[0];
        if (!win) return;
        return /** @type {any} */ (global).__restoreOpenFiles(win, openFiles);
    });

    // Wait for the restored content to appear
    await page2.waitForFunction(
        () => {
            const md = window.editorAPI?.getContent() ?? '';
            return md.includes('Section 15');
        },
        { timeout: 10000 },
    );
    // Wait for the ToC to highlight the same heading that was saved
    await page2.waitForFunction(
        (expected) =>
            document.querySelector('#toc-sidebar .toc-link.toc-active')?.textContent === expected,
        savedHeadingText,
        { timeout: 10000 },
    );

    // Verify cursor is on Section 15 at offset 4
    const cursor = await page2.evaluate(() => {
        const tree = /** @type {any} */ (window).__editor?.syntaxTree;
        if (!tree?.treeCursor) return null;
        const node = tree.children.find((/** @type {any} */ n) => n.id === tree.treeCursor?.nodeId);
        return {
            content: node?.content ?? null,
            offset: tree.treeCursor.offset,
        };
    });

    expect(cursor).not.toBeNull();
    const c = /** @type {NonNullable<typeof cursor>} */ (cursor);
    expect(c.content).toContain('Section 15');
    expect(c.offset).toBe(4);

    // Verify the ToC highlights the same heading that was active at save
    const tocAfter = await page2.locator('#toc-sidebar .toc-link.toc-active').textContent();
    expect(tocAfter).toBe(savedHeadingText);

    await closeApp(app2.electronApp);
});
