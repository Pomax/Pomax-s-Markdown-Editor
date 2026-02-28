/**
 * @fileoverview Integration test verifying that <iframe> elements
 * render inside the editor and are not blocked by the Content
 * Security Policy.
 */

import { expect, test } from '@playwright/test';
import { launchApp, loadContent } from '../../test-utils.js';

const iframeMarkdown = [
    '# Iframe Test',
    '',
    '<iframe src="https://example.com" width="300" height="200">',
    '</iframe>',
].join('\n');

test('iframe elements render in the editor', async () => {
    const { electronApp, page } = await launchApp();
    await loadContent(page, iframeMarkdown);

    const iframe = page.locator('#editor iframe');
    await expect(iframe).toBeAttached();
    expect(await iframe.getAttribute('src')).toBe('https://example.com');

    await electronApp.close();
});
