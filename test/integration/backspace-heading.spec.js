/**
 * @fileoverview Integration test for heading deletion via backspace.
 * Types a heading, then deletes all characters, expecting an empty document.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, expect, test } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const heading = '# main';

test('typing "# main" then backspace 6 times results in empty document', async () => {
    const electronApp = await electron.launch({
        args: [path.join(__dirname, '..', '..', 'src', 'main', 'main.js')],
        env: { ...process.env, TESTING: '1' },
    });
    const page = await electronApp.firstWindow();
    await page.waitForSelector('#editor .md-line');

    const editor = page.locator('#editor');
    await editor.click();
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
