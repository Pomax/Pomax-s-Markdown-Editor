/**
 * @fileoverview Integration tests for checklist support (GitHub issue #88).
 *
 * Covers:
 *   - Parsing and rendering checklist items in source and writing views
 *   - Toolbar button converts paragraph to checklist
 *   - Toolbar button toggles checklist off
 *   - Switching between bullet ↔ checklist ↔ ordered via toolbar
 *   - Checkbox click toggles checked state in writing view
 *   - Enter key creates a new unchecked checklist item
 *   - Enter on empty checklist item exits to paragraph
 */

import { expect, test } from '@playwright/test';
import { HOME, MOD, launchApp, loadContent, setSourceView, setWritingView } from '../../test-utils.js';

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
    await electronApp.close();
});

test('source view renders checklist prefix for unchecked item', async () => {
    await loadContent(page, '- [ ] Unchecked task\n');
    await setSourceView(page);

    const line = page.locator('#editor .md-line').first();
    const text = await line.textContent();
    expect(text).toMatch(/^- \[ \] Unchecked task/);
});

test('source view renders checklist prefix for checked item', async () => {
    await loadContent(page, '- [x] Checked task\n');
    await setSourceView(page);

    const line = page.locator('#editor .md-line').first();
    const text = await line.textContent();
    expect(text).toMatch(/^- \[x\] Checked task/);
});

test('writing view renders checkbox for checklist item', async () => {
    await loadContent(page, '- [ ] My task\n');
    await setWritingView(page);

    const checkbox = page.locator('#editor .md-checklist-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
});

test('writing view renders checked checkbox for checked checklist item', async () => {
    await loadContent(page, '- [x] Done task\n');
    await setWritingView(page);

    const checkbox = page.locator('#editor .md-checklist-checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
});

test('clicking checklist button converts paragraph to checklist item', async () => {
    await loadContent(page, 'A simple paragraph\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'A simple paragraph' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="checklist"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^- \[ \] A simple paragraph/);
});

test('clicking checklist button on checklist item toggles back to paragraph', async () => {
    await loadContent(page, '- [ ] Task item\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Task item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="checklist"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toBe('Task item');
});

test('clicking bullet button on checklist item switches to bullet list', async () => {
    await loadContent(page, '- [ ] Checklist item\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Checklist item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="unordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^- Checklist item/);
    // Should NOT have checkbox chars
    expect(text).not.toMatch(/\[[ x]\]/);
});

test('clicking ordered button on checklist item switches to ordered list', async () => {
    await loadContent(page, '- [ ] Checklist item\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Checklist item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="ordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^1\. Checklist item/);
});

test('clicking checklist button on bullet list switches to checklist', async () => {
    await loadContent(page, '- Bullet item\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Bullet item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="checklist"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^- \[ \] Bullet item/);
});

test('clicking checklist button on ordered list switches to checklist', async () => {
    await loadContent(page, '1. Ordered item\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Ordered item' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="checklist"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^- \[ \] Ordered item/);
});

test('clicking checkbox in writing view toggles checked state', async () => {
    await loadContent(page, '- [ ] Toggle me\n');
    await setWritingView(page);

    const checkbox = page.locator('#editor .md-checklist-checkbox');
    await expect(checkbox).not.toBeChecked();

    // Use mousedown guard approach: get bounding box and use mouse steps
    const box = await checkbox.boundingBox();
    expect(box).not.toBeNull();
    const x =
        /** @type {NonNullable<typeof box>} */ (box).x +
        /** @type {NonNullable<typeof box>} */ (box).width / 2;
    const y =
        /** @type {NonNullable<typeof box>} */ (box).y +
        /** @type {NonNullable<typeof box>} */ (box).height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(200);

    // Verify checked state changed
    const checkboxAfter = page.locator('#editor .md-checklist-checkbox');
    await expect(checkboxAfter).toBeChecked();

    // Verify markdown roundtrip
    await setSourceView(page);
    const source = page.locator('#editor .md-line').first();
    const text = await source.textContent();
    expect(text).toMatch(/^- \[x\] Toggle me/);
});

test('Enter key in checklist item creates new unchecked checklist item', async () => {
    await loadContent(page, '- [x] First task\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'First task' }).first();
    await line.click();
    await page.waitForTimeout(200);

    // Move to end of line and press Enter
    await page.keyboard.press('End');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.type('Second task', { delay: 30 });
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const firstText = await lines.nth(0).textContent();
    const secondText = await lines.nth(1).textContent();
    expect(firstText).toMatch(/^- \[x\] First task/);
    expect(secondText).toMatch(/^- \[ \] Second task/);
});

test('Enter on empty checklist item exits to paragraph', async () => {
    await loadContent(page, '- [ ] Task\n- [ ] \n');
    await setWritingView(page);

    // Click the second (empty) checklist item
    const lines = page.locator('#editor .md-line.md-list-item');
    await lines.nth(1).click();
    await page.waitForTimeout(200);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    await setSourceView(page);

    const allLines = page.locator('#editor .md-line');
    const firstText = await allLines.nth(0).textContent();
    const secondText = await allLines.nth(1).textContent();
    expect(firstText).toMatch(/^- \[ \] Task/);
    // Second line should be an empty paragraph (no list marker)
    expect(secondText).not.toMatch(/^- /);
});

test('switching entire contiguous checklist run to bullet via toolbar', async () => {
    await loadContent(page, '- [ ] Task A\n- [x] Task B\n- [ ] Task C\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line', { hasText: 'Task B' }).first();
    await line.click();
    await page.waitForTimeout(200);

    await page.locator('.toolbar-button[data-button-id="unordered-list"]').click();
    await page.waitForTimeout(200);

    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    for (let i = 0; i < 3; i++) {
        const text = await lines.nth(i).textContent();
        expect(text).toMatch(/^- Task [ABC]/);
        expect(text).not.toMatch(/\[[ x]\]/);
    }
});

test('writing view does not show bullet marker for checklist items', async () => {
    await loadContent(page, '- [ ] No bullet\n');
    await setWritingView(page);

    const line = page.locator('#editor .md-line').first();
    const style = await line.evaluate((el) => window.getComputedStyle(el).listStyleType);
    expect(style).toBe('none');
});

/**
 * Programmatically sets a cross-node selection in the editor.
 *
 * Writing-mode re-renders destroy DOM selections during drag, so we can't
 * use mouse-based dragging.  Instead we:
 *   1. Click into the startText node so the editor is focused on it.
 *   2. Use `page.evaluate` to build a DOM Range and set `treeRange`.
 *
 * @param {import('@playwright/test').Page} p
 * @param {string} startText - Text content to search for (start node)
 * @param {number} startOff  - Character offset within the start node
 * @param {string} endText   - Text content to search for (end node)
 * @param {number} endOff    - Character offset within the end node
 */
async function setCrossNodeSelection(p, startText, startOff, endText, endOff) {
    // Click the start node to ensure the editor is focused and active on it.
    const startLine = p.locator('#editor .md-line', { hasText: startText }).first();
    await startLine.click();
    await p.waitForTimeout(200);

    // Now set the DOM Range and treeRange programmatically.
    await p.evaluate(
        ({ sText, sOff, eText, eOff }) => {
            const editor = /** @type {any} */ (window).__editor;
            if (!editor) throw new Error('editor not found');
            const container = editor.container;

            /**
             * Find the .md-line whose text contains the target string and
             * return its data-node-id together with a DOM text-node position.
             * @param {string} text
             * @param {number} offset
             */
            function resolve(text, offset) {
                for (const el of container.querySelectorAll('.md-line[data-node-id]')) {
                    if (el.textContent?.includes(text)) {
                        const nodeId = el.getAttribute('data-node-id');
                        const contentEl = el.querySelector('.md-content') ?? el;
                        const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
                        let remaining = offset;
                        let tn = walker.nextNode();
                        while (tn) {
                            const len = tn.textContent?.length ?? 0;
                            if (remaining <= len) return { nodeId, domNode: tn, domOff: remaining };
                            remaining -= len;
                            tn = walker.nextNode();
                        }
                        // Past end — clamp to last text node
                        if (contentEl.lastChild?.nodeType === 3) {
                            return {
                                nodeId,
                                domNode: contentEl.lastChild,
                                domOff: contentEl.lastChild.textContent?.length ?? 0,
                            };
                        }
                        return { nodeId, domNode: contentEl, domOff: 0 };
                    }
                }
                throw new Error(`Could not find .md-line containing "${text}"`);
            }

            const start = resolve(sText, sOff);
            const end = resolve(eText, eOff);

            // Build DOM Range
            const range = document.createRange();
            range.setStart(start.domNode, start.domOff);
            range.setEnd(end.domNode, end.domOff);
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }

            // Set treeRange directly — the syntax tree is the source of truth.
            editor.treeRange = {
                startNodeId: start.nodeId,
                startOffset: sOff,
                endNodeId: end.nodeId,
                endOffset: eOff,
            };
        },
        { sText: startText, sOff: startOff, eText: endText, eOff: endOff },
    );
    await p.waitForTimeout(100);
}

test('multi-select across html-block converts all nodes to checklist after confirm', async () => {
    // nested.md: heading, paragraph, <div>( paragraph, h2 )</div>, paragraph
    // Selecting from "with some..." through "...doc again" should yield 5 items.
    const md =
        '# This is a title\n\nwith some text\n\n<div>\n\ninner paragraph\n\n## inner heading\n\n</div>\n\nAnd then the main doc again.\n';

    await loadContent(page, md);
    await setWritingView(page);

    // Mock dialog.showMessageBox to auto-confirm (response 0 = "Convert")
    await electronApp.evaluate((electron) => {
        electron.dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
    });

    // Programmatically set cross-node selection (drag doesn't work reliably
    // in writing mode — re-renders destroy the DOM selection mid-drag).
    await setCrossNodeSelection(page, 'with some text', 0, 'main doc again', 28);

    // Click checklist button
    await page.locator('.toolbar-button[data-button-id="checklist"]').click();
    await page.waitForTimeout(300);

    // Switch to source view to verify
    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const lineCount = await lines.count();

    // Collect all lines that are checklist items
    const checklistLines = [];
    for (let i = 0; i < lineCount; i++) {
        const text = (await lines.nth(i).textContent()) ?? '';
        if (text.match(/^- \[[ x]\] /)) {
            checklistLines.push(text);
        }
    }

    // The selection covers 4 content blocks:
    //   1. "with some text" (paragraph)
    //   2. "inner paragraph" (paragraph inside div — lifted out)
    //   3. "inner heading" (h2 inside div — lifted out)
    //   4. "And then the main doc again." (paragraph)
    expect(checklistLines.length).toBe(4);
    expect(checklistLines[0]).toMatch(/with some text/);
    expect(checklistLines[1]).toMatch(/inner paragraph/);
    expect(checklistLines[2]).toMatch(/inner heading/);
    expect(checklistLines[3]).toMatch(/main doc again/);
});

test('multi-select across html-block aborts on cancel', async () => {
    const md = '# Title\n\nparagraph one\n\n<div>\n\ninner text\n\n</div>\n\nparagraph two\n';

    await loadContent(page, md);
    await setWritingView(page);

    // Mock dialog.showMessageBox to cancel (response 1 = "Cancel")
    await electronApp.evaluate((electron) => {
        electron.dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    });

    // Programmatically set cross-node selection.
    await setCrossNodeSelection(page, 'paragraph one', 0, 'paragraph two', 13);

    // Click checklist button
    await page.locator('.toolbar-button[data-button-id="checklist"]').click();
    await page.waitForTimeout(300);

    // Switch to source view — nothing should have changed
    await setSourceView(page);

    const lines = page.locator('#editor .md-line');
    const allText = [];
    const lineCount = await lines.count();
    for (let i = 0; i < lineCount; i++) {
        allText.push(await lines.nth(i).textContent());
    }

    // No checklist markers should be present
    for (const text of allText) {
        expect(text).not.toMatch(/^- \[[ x]\] /);
    }
});
