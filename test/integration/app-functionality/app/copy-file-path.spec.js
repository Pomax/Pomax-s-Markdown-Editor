/**
 * @fileoverview Integration tests for File → Copy File Path.
 *
 * Verifies that the menu item copies the active file's path to the
 * system clipboard, and that it is disabled when no file path exists.
 */

import path from 'node:path';
import { expect, test } from '@playwright/test';
import { closeApp, launchApp, projectRoot } from '../../test-utils.js';

const readmePath = path.join(projectRoot, `README.md`);

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

test(`Copy File Path is disabled when no file is open`, async () => {
  const enabled = await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const fileMenu = menu?.items.find((i) => i.label === `File`);
    const item = fileMenu?.submenu?.items.find((i) => i.label === `Copy File Path`);
    return item?.enabled;
  });

  expect(enabled).toBe(false);
});

test(`Copy File Path copies the active file path to the clipboard`, async () => {
  // Tell the main process that a file with a real path is active,
  // which sets fileManager.currentFilePath via the IPC handler.
  await page.evaluate((fp) => {
    window.electronAPI?.notifyOpenFiles([
      { id: `tab-1`, filePath: fp, label: `README.md`, active: true },
    ]);
  }, readmePath);

  // The menu is rebuilt when openFilesChanged fires, so the item
  // should now be enabled.  Click it via the Menu API.
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const fileMenu = menu?.items.find((i) => i.label === `File`);
    const item = fileMenu?.submenu?.items.find((i) => i.label === `Copy File Path`);
    item?.click();
  });

  const clipboardText = await electronApp.evaluate(({ clipboard }) => {
    return clipboard.readText();
  });

  expect(clipboardText).toBe(readmePath);
});
