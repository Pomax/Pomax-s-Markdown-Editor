/**
 * @fileoverview Integration tests for typing inside a details/summary block.
 * Loads test/fixtures/details.md, clicks into the summary element, positions
 * the cursor at the end of its text, presses Enter to create a new paragraph,
 * then types " a a" (space, a, space, a) and verifies the result is " a a".
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp, loadContent, projectRoot } from './test-utils.js';

const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'details.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    ({ electronApp, page } = await launchApp());

    // Load the details fixture content into the editor.
    await loadContent(page, fixtureContent);
});

test.afterAll(async () => {
    await electronApp.close();
});

test('pressing Enter after summary text and typing " a a" preserves leading space', async () => {
    // Click on the paragraph inside the summary element to focus it.
    // The fake details widget renders the summary content inside
    // .md-details-summary-content, which contains the .md-paragraph.
    const summaryParagraph = page.locator('#editor .md-details-summary-content .md-paragraph');
    await summaryParagraph.waitFor({ state: 'visible' });
    await clickInEditor(page, summaryParagraph);
    await page.waitForTimeout(200);

    // Move the cursor to the end of the summary text.
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Press Enter to create a new paragraph after the summary.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    /** Helper: read the textContent of the newly-created paragraph.
     *  After pressing Enter inside the summary, the new paragraph is
     *  inside the details body. */
    const readParagraph = () =>
        page.evaluate(() => {
            const details = document.querySelector('#editor .md-details');
            if (!details) return null;
            // The new paragraph is the one that is currently focused.
            const para = details.querySelector('.md-paragraph.md-focused');
            return para ? para.textContent : null;
        });

    // Type each character and verify the content after every keystroke
    // to catch delayed-rendering issues (e.g. a space not showing until
    // the next character is typed).
    const expected = [' ', ' a', ' a ', ' a a'];
    const chars = [' ', 'a', ' ', 'a'];

    for (let i = 0; i < chars.length; i++) {
        await page.keyboard.type(chars[i]);
        await page.waitForTimeout(100);
        const text = await readParagraph();
        expect(text, `after typing "${chars.slice(0, i + 1).join('')}"`).toBe(expected[i]);
    }
});
