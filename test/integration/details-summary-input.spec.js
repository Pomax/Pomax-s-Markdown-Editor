/**
 * @fileoverview Integration tests for typing inside a details/summary block.
 * Loads test/fixtures/details.md, clicks into the summary element, positions
 * the cursor at the end of its text, presses Enter to create a new paragraph,
 * then types " a a" (space, a, space, a) and verifies the result is " a a".
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..', '..');
const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'details.md');
const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
    electronApp = await electron.launch({
        args: [path.join(projectRoot, 'src', 'main', 'main.js')],
        env: { ...process.env, TESTING: '1' },
    });
    page = await electronApp.firstWindow();

    await page.waitForFunction(() => document.readyState === 'complete');
    await electronApp.evaluate(async ({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win.isVisible()) {
            await new Promise((resolve) => win.once('show', /** @type {any} */ (resolve)));
        }
    });

    // Load the details fixture content into the editor.
    await page.evaluate((content) => {
        window.editorAPI?.setContent(content);
    }, fixtureContent);
    await page.waitForTimeout(300);
});

test.afterAll(async () => {
    await electronApp.close();
});

test('pressing Enter after summary text and typing " a a" preserves leading space', async () => {
    // Click on the summary element to focus it.
    const summaryLine = page.locator('#editor summary.md-html-inline');
    await summaryLine.click();
    await page.waitForTimeout(200);

    // Move the cursor to the end of the summary text.
    await page.keyboard.press('End');
    await page.waitForTimeout(100);

    // Press Enter to create a new paragraph after the summary.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    /** Helper: read the textContent of the newly-created paragraph. */
    const readParagraph = () =>
        page.evaluate(() => {
            const details = document.querySelector('#editor details');
            if (!details) return null;
            const para = details.querySelector('.md-paragraph');
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
