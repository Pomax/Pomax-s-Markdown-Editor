/**
 * @fileoverview Main Electron process entry point.
 * Initializes the application, creates windows, and sets up IPC handlers.
 */

import fs from 'node:fs';
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
 * Persists the currently open file path and cursor position so the
 * same file can be reopened on next launch.  If no file is open the
 * setting is removed.
 * @param {BrowserWindow} win
 */
async function saveLastOpenFile(win) {
    const filePath = fileManager?.getFilePath() ?? null;
    if (!filePath) {
        settingsManager.delete('lastOpenFile');
        return;
    }

    let cursorNodeIndex = 0;
    let cursorOffset = 0;
    try {
        const info = await win.webContents.executeJavaScript(`
            (function () {
                var nodeId = window.__editorCursorNodeId;
                var offset = window.__editorCursorOffset ?? 0;
                var lines = document.querySelectorAll('#editor [data-node-id]');
                var index = 0;
                if (nodeId && lines.length) {
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].getAttribute('data-node-id') === nodeId) {
                            index = i;
                            break;
                        }
                    }
                }
                return { cursorNodeIndex: index, cursorOffset: offset };
            })()
        `);
        cursorNodeIndex = info.cursorNodeIndex;
        cursorOffset = info.cursorOffset;
    } catch {
        // Window may already be destroyed — save with defaults
    }

    settingsManager.set('lastOpenFile', { filePath, cursorNodeIndex, cursorOffset });
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
            // Allow the renderer to load file:// resources (e.g. images)
            // from any directory, not just the application's own folder.
            webSecurity: false,
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

        // Prevent the window from closing until we've persisted state
        event.preventDefault();

        if (process.env.TESTING) {
            win.destroy();
            return;
        }

        await saveLastOpenFile(win);

        const hasUnsavedChanges = await win.webContents.executeJavaScript(
            'window.editorAPI?.hasUnsavedChanges() ?? false',
        );

        if (hasUnsavedChanges) {
            handleUnsavedChangesOnClose(win);
        } else {
            win.destroy();
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

/**
 * Extracts a file path from process.argv.
 *
 * argv[0] is the Electron binary, argv[1] is the entry script (in dev)
 * or the app itself (when packaged).  User-supplied arguments start at
 * argv[2] in dev mode and argv[1] in a packaged app.
 *
 * @returns {string|null} The resolved absolute path, or null if none provided
 */
function getFilePathFromArgs() {
    // In dev: [electron, main.js, ...userArgs]
    // Packaged: [app, ...userArgs]
    const userArgs = process.argv.slice(app.isPackaged ? 1 : 2);

    for (const arg of userArgs) {
        if (arg.startsWith('-')) continue;
        const resolved = path.resolve(arg);
        try {
            if (fs.statSync(resolved).isFile()) return resolved;
        } catch {
            // Not a real file – keep looking
        }
    }

    return null;
}

/**
 * Loads a file from the given path and sends it to the renderer.
 * @param {BrowserWindow} window - The main window
 * @param {string} filePath - The absolute file path to load
 */
async function loadFileFromPath(window, filePath) {
    const result = await fileManager.loadRecent(filePath);
    if (result.success) {
        window.webContents.send('menu:action', 'file:loaded', result);
        menuBuilder.refreshMenu();
    }
}

/**
 * Restores the last-open file and cursor position from a previous session.
 * @param {BrowserWindow} window - The main window
 * @param {{filePath: string, cursorNodeIndex: number, cursorOffset: number}} lastOpen
 */
async function restoreLastOpenFile(window, lastOpen) {
    const result = await fileManager.loadRecent(lastOpen.filePath);
    if (!result.success) return;

    const nodeIndex = lastOpen.cursorNodeIndex ?? 0;
    const offset = lastOpen.cursorOffset ?? 0;
    const contentJSON = JSON.stringify(result.content);
    const filePathJSON = JSON.stringify(result.filePath);

    // Load the file and restore the cursor in a single executeJavaScript
    // call so we know the DOM is ready before we try to place the cursor.
    window.webContents.executeJavaScript(`
        (function () {
            function tryRestore() {
                var api = window.editorAPI;
                if (!api) { setTimeout(tryRestore, 50); return; }

                // Set the file path first so the title bar updates correctly
                // when loadMarkdown calls updateWindowTitle.
                window.__editorFilePath = ${filePathJSON};

                // Load the file content (renders the DOM)
                api.setContent(${contentJSON});

                // Wait for the DOM nodes to be created by the render
                requestAnimationFrame(function () {
                    var lines = document.querySelectorAll('#editor [data-node-id]');
                    var idx = Math.min(${nodeIndex}, lines.length - 1);
                    if (idx >= 0 && lines[idx]) {
                        var nodeId = lines[idx].getAttribute('data-node-id');
                        if (nodeId) {
                            window.dispatchEvent(
                                new CustomEvent('__restoreCursor', {
                                    detail: { nodeId: nodeId, offset: ${offset} }
                                })
                            );
                        }
                    }
                });
            }
            tryRestore();
        })()
    `);

    menuBuilder.refreshMenu();
}

// Electron app lifecycle events
app.whenReady().then(async () => {
    // Initialize settings before creating the window so saved bounds are available
    settingsManager = new SettingsManager();
    settingsManager.initialize();

    const window = createWindow();
    await initialize(window);

    // If a file path was passed on the command line, load it once the
    // renderer has finished initialising.  Otherwise, reopen the file
    // that was open when the app was last closed.
    const cliFilePath = getFilePathFromArgs();
    if (cliFilePath) {
        window.webContents.once('did-finish-load', () => {
            loadFileFromPath(window, cliFilePath);
        });
    } else if (!process.env.TESTING) {
        const lastOpen = settingsManager.get('lastOpenFile', null);
        // Clear immediately so it doesn't interfere with future launches
        // (e.g. test runs).  A new value is written on close if a file
        // is still open.
        settingsManager.delete('lastOpenFile');
        if (lastOpen?.filePath && fs.existsSync(lastOpen.filePath)) {
            window.webContents.once('did-finish-load', () => {
                restoreLastOpenFile(window, lastOpen);
            });
        }
    }

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
