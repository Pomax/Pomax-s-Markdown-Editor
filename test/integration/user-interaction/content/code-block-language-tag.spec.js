/**
 * @fileoverview Integration tests for displaying the code-block language
 * tag via CSS ::before / ::after pseudo-elements in writing view.
 *
 * When a code block has a language attribute, writing view should display
 * the language as a subtle label at the top-right (::before) and
 * bottom-right (::after) of the code-block element via the data-language
 * attribute.
 */

import { expect, test } from '@playwright/test';
import {
    closeApp,
    launchApp,
    loadContent,
    setSourceView,
    setWritingView,
} from '../../test-utils.js';

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

test.describe('Writing-view code-block language tag', () => {
    test('code block with language has data-language attribute in writing view', async () => {
        await loadContent(page, '```js\nconsole.log("hi");\n```');
        await setWritingView(page);
        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await expect(codeBlock).toBeVisible();
        await expect(codeBlock).toHaveAttribute('data-language', 'js');
    });

    test('code block without language does not have data-language attribute', async () => {
        await loadContent(page, '```\nplain code\n```');
        await setWritingView(page);
        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await expect(codeBlock).toBeVisible();
        const attr = await codeBlock.getAttribute('data-language');
        expect(attr).toBeNull();
    });

    test('::before pseudo-element shows language at top-right', async () => {
        await loadContent(page, '```python\nprint("hello")\n```');
        await setWritingView(page);
        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await expect(codeBlock).toHaveAttribute('data-language', 'python');
        const before = await codeBlock.evaluate((el) => {
            const style = window.getComputedStyle(el, '::before');
            return {
                content: style.content,
                position: style.position,
                right: style.right,
                top: style.top,
                pointerEvents: style.pointerEvents,
            };
        });
        expect(before.content).toContain('python');
        expect(before.position).toBe('absolute');
        expect(before.pointerEvents).toBe('none');
    });

    test('::after pseudo-element shows language at bottom-right', async () => {
        await loadContent(page, '```python\nprint("hello")\n```');
        await setWritingView(page);
        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await expect(codeBlock).toHaveAttribute('data-language', 'python');
        const after = await codeBlock.evaluate((el) => {
            const style = window.getComputedStyle(el, '::after');
            return {
                content: style.content,
                position: style.position,
                right: style.right,
                bottom: style.bottom,
                pointerEvents: style.pointerEvents,
            };
        });
        expect(after.content).toContain('python');
        expect(after.position).toBe('absolute');
        expect(after.pointerEvents).toBe('none');
    });

    test('source view does not show language pseudo-elements', async () => {
        await loadContent(page, '```js\ncode\n```');
        await setSourceView(page);
        const codeBlock = page.locator('#editor .md-line.md-code-block');
        await expect(codeBlock).toBeVisible();
        const before = await codeBlock.evaluate((el) => {
            return window.getComputedStyle(el, '::before').content;
        });
        // In source view, ::before should have no content (the CSS rules are
        // scoped to .writing-view only).
        expect(before).toBe('none');
    });
});
