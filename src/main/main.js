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
import { SettingsManager } from './settings-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {BrowserWindow|null} */
let mainWindow = null;

/** @type {FileManager} */
let fileManager;

/** @type {IPCHandler} */
let ipcHandler;

/** @type {MenuBuilder} */
let menuBuilder;

/** @type {SettingsManager} */
let settingsManager;

/**
 * Debounce timeout handle for saving window bounds.
 * @type {ReturnType<typeof setTimeout>|null}
 */
let boundsDebounce = null;

/**
 * Saves the current window bounds and maximized state to the database.
 * Called on move/resize (debounced) and before close.
 */
function saveWindowBounds() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const isMaximized = mainWindow.isMaximized();
    // When maximized, persist the *restore* bounds so we remember the
    // non-maximized size/position for the next launch.
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();

    settingsManager.set('windowBounds', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized,
    });
}

/**
 * Debounced version of saveWindowBounds — waits 500 ms of inactivity.
 */
function debounceSaveWindowBounds() {
    if (boundsDebounce) clearTimeout(boundsDebounce);
    boundsDebounce = setTimeout(saveWindowBounds, 500);
}

/**
 * Creates the main application window with A4 aspect ratio.
 * @returns {BrowserWindow} The created browser window
 */
function createWindow() {
    // A4 aspect ratio is approximately 1:1.414
    const defaultWidth = 800;
    const defaultHeight = Math.round(defaultWidth * Math.SQRT2);

    // Load saved window bounds from settings
    const saved = settingsManager.get('windowBounds');

    /** @type {Electron.BrowserWindowConstructorOptions} */
    const windowOptions = {
        width: saved?.width ?? defaultWidth,
        height: saved?.height ?? defaultHeight,
        minWidth: 600,
        minHeight: 848,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
    };

    // Only set position if we have saved values (otherwise let the OS decide)
    if (saved?.x != null && saved?.y != null) {
        windowOptions.x = saved.x;
        windowOptions.y = saved.y;
    }

    mainWindow = new BrowserWindow(windowOptions);

    // Restore maximized state after the window is created
    if (saved?.isMaximized) {
        mainWindow.maximize();
    }

    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    const win = mainWindow;

    win.once('ready-to-show', () => {
        win.show();
    });

    // Persist window bounds on move/resize (debounced)
    win.on('resize', debounceSaveWindowBounds);
    win.on('move', debounceSaveWindowBounds);

    win.on('close', async (event) => {
        // Flush any pending debounced save immediately
        if (boundsDebounce) {
            clearTimeout(boundsDebounce);
            boundsDebounce = null;
        }
        saveWindowBounds();

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
    fileManager = new FileManager(settingsManager);
    ipcHandler = new IPCHandler(fileManager, settingsManager);

    // Set up the application menu
    menuBuilder = new MenuBuilder(window, fileManager);
    const menu = menuBuilder.buildMenu();
    Menu.setApplicationMenu(menu);

    // Register all IPC handlers (pass menuBuilder for reload support)
    ipcHandler.registerHandlers(menuBuilder);
}

// Electron app lifecycle events
app.whenReady().then(async () => {
    // Initialize settings before creating the window so saved bounds are available
    settingsManager = new SettingsManager();
    settingsManager.initialize();

    const window = createWindow();
    await initialize(window);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (settingsManager) {
        settingsManager.close();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Run with unlimited memory
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=0');

export { mainWindow, fileManager };
