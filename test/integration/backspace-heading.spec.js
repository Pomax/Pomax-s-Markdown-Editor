/**
 * @fileoverview Integration test for heading deletion via backspace.
 * Types a heading, then deletes all characters, expecting an empty document.
 */

import { expect, test } from '@playwright/test';
import { clickInEditor, launchApp } from './test-utils.js';

const heading = '# main';

test('typing "# main" then backspace 6 times results in empty document', async () => {
    const { electronApp, page } = await launchApp();
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await clickInEditor(page, editor);
    for (const char of heading) {
        await page.keyboard.type(char);
    }
    for (let i = 0; i < heading.length; i++) {
        await page.keyboard.press('Backspace');
    }
    const content = await editor.innerText();
    expect(content.trim()).toBe('');
    await electronApp.close();
});
