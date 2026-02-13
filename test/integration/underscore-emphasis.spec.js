/**
 * @fileoverview Integration test for underscore emphasis (_italic_) support.
 * Verifies that `_text_`, `__text__`, `**_text_**`, and `_**text**_` are
 * rendered correctly in focused mode: formatting is always applied (WYSIWYG),
 * both when the node is focused and unfocused.
 */

import { expect, test } from '@playwright/test';
import { launchApp } from './test-utils.js';

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

test('underscore emphasis _text_ renders as <em> when unfocused', async () => {
    const markdown = 'This has _italic_ text\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // In WYSIWYG mode the focused node also renders formatted output.
    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('italic');
    expect(focusedText).not.toContain('_italic_');

    // The <em> element should be present even when the node is focused.
    const emElement = firstLine.locator('em');
    await expect(emElement).toBeVisible();
    expect(await emElement.textContent()).toBe('italic');

    // Move focus to the second paragraph.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('italic');
    expect(unfocusedText).not.toContain('_italic_');

    const emElementUnfocused = firstLine.locator('em');
    await expect(emElementUnfocused).toBeVisible();
    expect(await emElementUnfocused.textContent()).toBe('italic');
});

test('double underscore __text__ renders as <em> when unfocused', async () => {
    const markdown = 'This has __emphasis__ text\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // In WYSIWYG mode the focused node also renders formatted output.
    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('emphasis');
    expect(focusedText).not.toContain('__emphasis__');

    // __ is emphasis, not bold — should be <em>, not <strong>.
    const emElement = firstLine.locator('em');
    await expect(emElement).toBeVisible();
    expect(await emElement.textContent()).toBe('emphasis');
    expect(await firstLine.locator('strong').count()).toBe(0);

    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('emphasis');
    expect(unfocusedText).not.toContain('__emphasis__');

    const emElementUnfocused = firstLine.locator('em');
    await expect(emElementUnfocused).toBeVisible();
    expect(await emElementUnfocused.textContent()).toBe('emphasis');
    expect(await firstLine.locator('strong').count()).toBe(0);
});

test('nested **_text_** renders as bold+italic when unfocused', async () => {
    const markdown = 'This is **_both_** styled\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // In WYSIWYG mode the focused node renders formatted output.
    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('both');
    expect(focusedText).not.toContain('**');
    expect(focusedText).not.toContain('_both_');

    // Outer <strong>, inner <em> — even when focused.
    const strong = firstLine.locator('strong');
    await expect(strong).toBeVisible();
    const em = strong.locator('em');
    await expect(em).toBeVisible();
    expect(await em.textContent()).toBe('both');

    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('both');
    expect(unfocusedText).not.toContain('**');
    expect(unfocusedText).not.toContain('_both_');

    const strongUnfocused = firstLine.locator('strong');
    await expect(strongUnfocused).toBeVisible();
    const emUnfocused = strongUnfocused.locator('em');
    await expect(emUnfocused).toBeVisible();
    expect(await emUnfocused.textContent()).toBe('both');
});

test('nested _**text**_ renders as italic+bold when unfocused', async () => {
    const markdown = 'This is _**both**_ styled\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    // In WYSIWYG mode the focused node renders formatted output.
    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('both');
    expect(focusedText).not.toContain('**');
    expect(focusedText).not.toContain('_');

    // Outer <em>, inner <strong> — even when focused.
    const em = firstLine.locator('em');
    await expect(em).toBeVisible();
    const strong = em.locator('strong');
    await expect(strong).toBeVisible();
    expect(await strong.textContent()).toBe('both');

    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('both');
    expect(unfocusedText).not.toContain('**');
    expect(unfocusedText).not.toContain('_');

    const emUnfocused = firstLine.locator('em');
    await expect(emUnfocused).toBeVisible();
    const strongUnfocused = emUnfocused.locator('strong');
    await expect(strongUnfocused).toBeVisible();
    expect(await strongUnfocused.textContent()).toBe('both');
});
