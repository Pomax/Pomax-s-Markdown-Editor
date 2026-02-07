/**
 * @fileoverview Main Electron process entry point.
 * Initializes the application, creates windows, and sets up IPC handlers.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Menu, app, dialog, ipcMain } from 'electron';
import { FileManager } from './file-manager.js';
import { IPCHandler } from './ipc-handler.js';
import { MenuBuilder } from './menu-builder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {BrowserWindow|null} */
let mainWindow = null;

/** @type {FileManager} */
let fileManager;

/** @type {IPCHandler} */
let ipcHandler;

/**
 * Creates the main application window with A4 aspect ratio.
 * @returns {BrowserWindow} The created browser window
 */
function createWindow() {
    // A4 aspect ratio is approximately 1:1.414
    const baseWidth = 800;
    const height = Math.round(baseWidth * Math.SQRT2);

    mainWindow = new BrowserWindow({
        width: baseWidth,
        height: height,
        minWidth: 600,
        minHeight: 848,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    });

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    const win = mainWindow;

    win.once('ready-to-show', () => {
        win.show();
    });

    win.on('close', async (event) => {
        const hasUnsavedChanges = await win.webContents.executeJavaScript(
            'window.editorAPI?.hasUnsavedChanges() ?? false',
        );

        if (hasUnsavedChanges) {
            event.preventDefault();
            handleUnsavedChangesOnClose(win);
        }
    });

    win.on('closed', () => {
        mainWindow = null;
    });

    return win;
}

/**
 * Handles the close event when there are unsaved changes.
 * Prompts the user to save, discard, or cancel.
 * @param {BrowserWindow} window - The window being closed
 */
async function handleUnsavedChangesOnClose(window) {
    const result = await dialog.showMessageBox(window, {
        type: 'warning',
        buttons: ['Save', 'Save As...', 'Discard', 'Cancel'],
        defaultId: 0,
        cancelId: 3,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. What would you like to do?',
    });

    // Get current content from renderer
    const content = await window.webContents.executeJavaScript(
        'window.editorAPI?.getContent() ?? ""',
    );

    switch (result.response) {
        case 0: {
            // Save
            const saved = await fileManager.save(window, content);
            if (saved.success) {
                window.destroy();
            }
            break;
        }
        case 1: {
            // Save As
            const savedAs = await fileManager.saveAs(window, content);
            if (savedAs.success) {
                window.destroy();
            }
            break;
        }
        case 2: // Discard
            window.destroy();
            break;
        case 3: // Cancel
            // Do nothing, stay in the app
            break;
    }
}

/**
 * Initializes the application.
 * @param {BrowserWindow} window - The main window
 */
async function initialize(window) {
    fileManager = new FileManager();
    ipcHandler = new IPCHandler(fileManager);

    // Set up the application menu
    const menuBuilder = new MenuBuilder(window, fileManager);
    const menu = menuBuilder.buildMenu();
    Menu.setApplicationMenu(menu);

    // Register all IPC handlers
    ipcHandler.registerHandlers();
}

// Electron app lifecycle events
app.whenReady().then(async () => {
    const window = createWindow();
    await initialize(window);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Run with unlimited memory
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=0');

export { mainWindow, fileManager };
