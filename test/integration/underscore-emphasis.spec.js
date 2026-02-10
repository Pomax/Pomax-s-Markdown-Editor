/**
 * @fileoverview Integration test for underscore emphasis (_italic_) support.
 * Verifies that `_text_`, `__text__`, `**_text_**`, and `_**text**_` are
 * rendered correctly in focused mode: formatting applied when unfocused,
 * raw syntax shown when focused.
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

    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('_italic_');

    // Move focus to the second paragraph.
    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('italic');
    expect(unfocusedText).not.toContain('_italic_');

    const emElement = firstLine.locator('em');
    await expect(emElement).toBeVisible();
    expect(await emElement.textContent()).toBe('italic');
});

test('double underscore __text__ renders as <em> when unfocused', async () => {
    const markdown = 'This has __emphasis__ text\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('__emphasis__');

    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('emphasis');
    expect(unfocusedText).not.toContain('__emphasis__');

    // __ is emphasis, not bold — should be <em>, not <strong>.
    const emElement = firstLine.locator('em');
    await expect(emElement).toBeVisible();
    expect(await emElement.textContent()).toBe('emphasis');
    expect(await firstLine.locator('strong').count()).toBe(0);
});

test('nested **_text_** renders as bold+italic when unfocused', async () => {
    const markdown = 'This is **_both_** styled\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('**_both_**');

    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('both');
    expect(unfocusedText).not.toContain('**');
    expect(unfocusedText).not.toContain('_both_');

    // Outer <strong>, inner <em>
    const strong = firstLine.locator('strong');
    await expect(strong).toBeVisible();
    const em = strong.locator('em');
    await expect(em).toBeVisible();
    expect(await em.textContent()).toBe('both');
});

test('nested _**text**_ renders as italic+bold when unfocused', async () => {
    const markdown = 'This is _**both**_ styled\n\nSecond paragraph';
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, markdown);

    await page.evaluate(() => window.electronAPI?.setFocusedView());
    await page.waitForTimeout(200);

    const firstLine = page.locator('#editor .md-line').first();
    const focusedText = await firstLine.innerText();
    expect(focusedText).toContain('_**both**_');

    const secondLine = page.locator('#editor .md-line').nth(1);
    await secondLine.click();
    await page.waitForTimeout(200);

    const unfocusedText = await firstLine.innerText();
    expect(unfocusedText).toContain('both');
    expect(unfocusedText).not.toContain('**');
    expect(unfocusedText).not.toContain('_');

    // Outer <em>, inner <strong>
    const em = firstLine.locator('em');
    await expect(em).toBeVisible();
    const strong = em.locator('strong');
    await expect(strong).toBeVisible();
    expect(await strong.textContent()).toBe('both');
});
