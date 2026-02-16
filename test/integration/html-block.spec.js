/**
 * @fileoverview Integration tests for HTML block container support.
 * Loads test/fixtures/nested.md which contains headings both inside and
 * outside an HTML `<div>` element, then verifies:
 *   1. The Table of Contents includes headings nested inside the div.
 *   2. The toolbar correctly identifies node types for headings after
 *      an HTML block container.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent, projectRoot } from './test-utils.js';

const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'nested.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());

    // Load the nested fixture content into the editor.
    await loadContent(page, fixtureContent);
});

test.afterAll(async () => {
    await electronApp.close();
});

test('ToC includes heading nested inside an HTML block', async () => {
    // The TOC should list both h2 headings: the one inside the <div>
    // ("and this an h2") and the one outside ("with another heading").
    const tocLinks = page.locator('#toc-sidebar .toc-link');

    // There should be at least 3 TOC entries: the h1 title plus 2 h2s.
    await expect(tocLinks).toHaveCount(3);

    const texts = await tocLinks.allInnerTexts();
    expect(texts).toContain('and this an h2');
    expect(texts).toContain('with another heading');
});

test('toolbar flags heading inside HTML block as h2', async () => {
    // Click on the heading inside the <div>.
    const nestedHeading = page.locator('#editor .md-heading2', {
        hasText: 'and this an h2',
    });
    await clickInEditor(page, nestedHeading);
    await page.waitForTimeout(200);

    // The h2 toolbar button should be active (not greyed out).
    const h2Button = page.locator('[data-button-id="heading2"]');
    await expect(h2Button).not.toBeDisabled();
    await expect(h2Button).toHaveClass(/active/);
});

test('toolbar flags heading after HTML block as h2', async () => {
    // Click on the heading that comes after the </div>.
    const trailingHeading = page.locator('#editor .md-heading2', {
        hasText: 'with another heading',
    });
    await clickInEditor(page, trailingHeading);
    await page.waitForTimeout(200);

    // The h2 toolbar button should be active (not greyed out).
    const h2Button = page.locator('[data-button-id="heading2"]');
    await expect(h2Button).not.toBeDisabled();
    await expect(h2Button).toHaveClass(/active/);
});
