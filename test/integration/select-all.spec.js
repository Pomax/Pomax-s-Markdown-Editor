/**
 * @fileoverview Integration tests for Ctrl+A select-all cycling and
 * delete/backspace removal of empty elements after selection delete.
 */

import { expect, test } from '@playwright/test';
import { MOD, clickInEditor, launchApp, loadContent } from './test-utils.js';

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

// ── Select-All Cycling ──

test.describe('Select-All Cycling', () => {
    test('first Ctrl+A selects current paragraph content', async () => {
        await loadContent(page, 'Hello world\n\nSecond paragraph');
        const editor = page.locator('#editor');

        // Click into the first paragraph
        const firstLine = editor.locator('.md-line', { hasText: 'Hello world' }).first();
        await clickInEditor(page, firstLine);

        // First Ctrl+A — selects the paragraph
        await page.keyboard.press(`${MOD}+a`);

        const selectedText = await page.evaluate(() => window.getSelection()?.toString());
        expect(selectedText).toBe('Hello world');
    });

    test('second Ctrl+A on paragraph (no parent) selects entire document', async () => {
        await loadContent(page, 'Hello world\n\nSecond paragraph');
        const editor = page.locator('#editor');

        const firstLine = editor.locator('.md-line', { hasText: 'Hello world' }).first();
        await clickInEditor(page, firstLine);

        // First Ctrl+A — selects the paragraph
        await page.keyboard.press(`${MOD}+a`);
        // Second Ctrl+A — no parent group, so selects entire document
        await page.keyboard.press(`${MOD}+a`);

        const selectedText = await page.evaluate(() => window.getSelection()?.toString());
        // Should contain content from both paragraphs
        expect(selectedText).toContain('Hello world');
        expect(selectedText).toContain('Second paragraph');
    });

    test('first Ctrl+A on list item selects item, second selects list run', async () => {
        await loadContent(page, 'Before\n\n- apple\n- banana\n- cherry\n\nAfter');
        const editor = page.locator('#editor');

        // Click into the "banana" list item
        const bananaLine = editor.locator('.md-line', { hasText: 'banana' }).first();
        await clickInEditor(page, bananaLine);

        // First Ctrl+A — selects just "banana"
        await page.keyboard.press(`${MOD}+a`);
        let selectedText = await page.evaluate(() => window.getSelection()?.toString());
        expect(selectedText).toBe('banana');

        // Second Ctrl+A — selects the entire list run
        await page.keyboard.press(`${MOD}+a`);
        selectedText = await page.evaluate(() => window.getSelection()?.toString());
        expect(selectedText).toContain('apple');
        expect(selectedText).toContain('banana');
        expect(selectedText).toContain('cherry');
    });

    test('third Ctrl+A on list item selects entire document', async () => {
        await loadContent(page, 'Before\n\n- apple\n- banana\n- cherry\n\nAfter');
        const editor = page.locator('#editor');

        const bananaLine = editor.locator('.md-line', { hasText: 'banana' }).first();
        await clickInEditor(page, bananaLine);

        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press(`${MOD}+a`);

        const selectedText = await page.evaluate(() => window.getSelection()?.toString());
        expect(selectedText).toContain('Before');
        expect(selectedText).toContain('After');
    });

    test('clicking resets the cycling level', async () => {
        await loadContent(page, 'Hello world\n\nSecond paragraph');
        const editor = page.locator('#editor');

        const firstLine = editor.locator('.md-line', { hasText: 'Hello world' }).first();
        await clickInEditor(page, firstLine);

        // Ctrl+A then click → resets, next Ctrl+A should select node again
        await page.keyboard.press(`${MOD}+a`);
        await clickInEditor(page, firstLine);
        await page.keyboard.press(`${MOD}+a`);

        const selectedText = await page.evaluate(() => window.getSelection()?.toString());
        expect(selectedText).toBe('Hello world');
    });

    test('first Ctrl+A on heading selects heading content', async () => {
        await loadContent(page, '## My Heading\n\nSome text');
        const editor = page.locator('#editor');

        const heading = editor.locator('.md-line', { hasText: 'My Heading' }).first();
        await clickInEditor(page, heading);

        await page.keyboard.press(`${MOD}+a`);

        const selectedText = await page.evaluate(() => window.getSelection()?.toString());
        expect(selectedText).toBe('My Heading');
    });
});

// ── Delete/Backspace Removes Empty Elements ──

test.describe('Delete Empty Elements', () => {
    test('Ctrl+A then Backspace on single paragraph removes it, leaves empty doc', async () => {
        await loadContent(page, 'Only paragraph');
        const editor = page.locator('#editor');

        const line = editor.locator('.md-line').first();
        await clickInEditor(page, line);

        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press('Backspace');

        // Document should have a single empty paragraph (not a lingering empty heading etc.)
        const content = await page.evaluate(() => window.editorAPI?.getContent());
        expect(content?.trim()).toBe('');

        // Should still have one editable line in the DOM
        const lineCount = await editor.locator('.md-line').count();
        expect(lineCount).toBe(1);
    });

    test('Ctrl+A then Delete on heading removes it, cursor moves to adjacent node', async () => {
        await loadContent(page, '## Heading\n\nNext paragraph');
        const editor = page.locator('#editor');

        const heading = editor.locator('.md-line', { hasText: 'Heading' }).first();
        await clickInEditor(page, heading);

        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press('Delete');

        const content = await page.evaluate(() => window.editorAPI?.getContent());
        // The heading should be gone, only the paragraph remains
        expect(content).not.toContain('## Heading');
        expect(content).not.toContain('Heading');
        expect(content?.trim()).toContain('Next paragraph');
    });

    test('Ctrl+A then Backspace on list item removes it from list', async () => {
        await loadContent(page, '- first\n- second\n- third');
        const editor = page.locator('#editor');

        const secondItem = editor.locator('.md-line', { hasText: 'second' }).first();
        await clickInEditor(page, secondItem);

        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press('Backspace');

        const content = await page.evaluate(() => window.editorAPI?.getContent());
        expect(content).not.toContain('second');
        expect(content).toContain('first');
        expect(content).toContain('third');
    });

    test('Ctrl+A then Backspace on blockquote removes it', async () => {
        await loadContent(page, 'Before\n\n> Quoted text\n\nAfter');
        const editor = page.locator('#editor');

        const quote = editor.locator('.md-line', { hasText: 'Quoted text' }).first();
        await clickInEditor(page, quote);

        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press('Backspace');

        const content = await page.evaluate(() => window.editorAPI?.getContent());
        expect(content).not.toContain('Quoted text');
        expect(content).toContain('Before');
        expect(content).toContain('After');
    });

    test('select-all document then delete leaves single empty paragraph', async () => {
        await loadContent(page, '## Heading\n\nParagraph\n\n- item');
        const editor = page.locator('#editor');

        const heading = editor.locator('.md-line', { hasText: 'Heading' }).first();
        await clickInEditor(page, heading);

        // Cycle to document-level select-all
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press(`${MOD}+a`);
        await page.keyboard.press('Delete');

        const content = await page.evaluate(() => window.editorAPI?.getContent());
        expect(content?.trim()).toBe('');

        // Document should still have one line element
        const lineCount = await editor.locator('.md-line').count();
        expect(lineCount).toBe(1);
    });
});
