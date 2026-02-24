/**
 * @fileoverview IPC Handler for main process.
 * Manages all IPC communication between main and renderer processes,
 * as well as external scripting API calls.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { APIRegistry } from './api-registry.js';

/**
 * Handles IPC communication for the application.
 */
export class IPCHandler {
    /**
     * @param {import('./file-manager.js').FileManager} fileManager - The file manager instance
     * @param {import('./settings-manager.js').SettingsManager} settingsManager - The settings manager instance
     */
    constructor(fileManager, settingsManager) {
        /** @type {import('./file-manager.js').FileManager} */
        this.fileManager = fileManager;

        /** @type {import('./settings-manager.js').SettingsManager} */
        this.settingsManager = settingsManager;

        /** @type {APIRegistry} */
        this.apiRegistry = new APIRegistry();

        /** @type {boolean} */
        this.hasUnsavedChanges = false;
    }

    /**
     * Registers all IPC handlers.
     * @param {import('./menu-builder.js').MenuBuilder} [menuBuilder] - The menu builder (for reload support)
     */
    registerHandlers(menuBuilder) {
        this.menuBuilder = menuBuilder ?? null;
        this.registerFileHandlers();
        this.registerDocumentHandlers();
        this.registerViewHandlers();
        this.registerElementHandlers();
        this.registerAppHandlers();
        this.registerSettingsHandlers();
        this.registerImageHandlers();
        this.registerPathHandlers();
        this.registerAPIHandlers();
    }

    /**
     * Registers file-related IPC handlers.
     */
    registerFileHandlers() {
        ipcMain.handle('file:new', async () => {
            const result = this.fileManager.newDocument();
            this.broadcastToRenderers('document:reset');
            return result;
        });

        ipcMain.handle('file:load', async () => {
            const window = BrowserWindow.getFocusedWindow();
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            return this.fileManager.load(window);
        });

        ipcMain.handle('file:save', async (event, content) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            const result = await this.fileManager.save(window, content);
            if (result.success && this.menuBuilder) {
                this.menuBuilder.refreshMenu();
            }
            return result;
        });

        ipcMain.handle('file:saveAs', async (event, content) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            const result = await this.fileManager.saveAs(window, content);
            if (result.success && this.menuBuilder) {
                this.menuBuilder.refreshMenu();
            }
            return result;
        });

        ipcMain.handle('file:setUnsavedChanges', async (event, hasChanges) => {
            this.hasUnsavedChanges = hasChanges;
            this.fileManager.setUnsavedChanges(hasChanges);
        });

        ipcMain.handle('file:confirmClose', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { action: 'cancel' };
            }
            const result = await dialog.showMessageBox(window, {
                type: 'warning',
                buttons: ['Save', 'Save As...', 'Discard', 'Cancel'],
                defaultId: 0,
                cancelId: 3,
                title: 'Unsaved Changes',
                message: 'You have unsaved changes. What would you like to do?',
            });
            const actions = ['save', 'saveAs', 'discard', 'cancel'];
            return { action: actions[result.response] };
        });

        ipcMain.handle('file:getRecentFiles', async () => {
            return { success: true, files: this.fileManager.getRecentFiles() };
        });
    }

    /**
     * Registers document-related IPC handlers.
     */
    registerDocumentHandlers() {
        ipcMain.handle('document:undo', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'edit:undo');
            }
            return { success: true };
        });

        ipcMain.handle('document:redo', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'edit:redo');
            }
            return { success: true };
        });
    }

    /**
     * Registers view-related IPC handlers.
     */
    registerViewHandlers() {
        ipcMain.handle('view:source', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'view:source');
            }
            return { success: true };
        });

        ipcMain.handle('view:writing', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'view:writing');
            }
            return { success: true };
        });

        ipcMain.handle('view:openFilesChanged', async (_event, files) => {
            if (this.menuBuilder) {
                this.menuBuilder.openFiles = files ?? [];
                this.menuBuilder.refreshMenu();
            }
            // Keep fileManager.currentFilePath in sync with the active tab
            const fileList = files ?? [];
            const activeFile = fileList.find(/** @param {{active: boolean}} f */ (f) => f.active);
            if (activeFile) {
                this.fileManager.currentFilePath = activeFile.filePath ?? null;
            }
            return { success: true };
        });
    }

    /**
     * Registers element-related IPC handlers.
     */
    registerElementHandlers() {
        ipcMain.handle('element:changeType', async (event, elementType) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'element:changeType', elementType);
            }
            return { success: true };
        });

        ipcMain.handle('element:format', async (event, format) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'element:format', format);
            }
            return { success: true };
        });
    }

    /**
     * Registers application-level IPC handlers (reload, etc.).
     */
    registerAppHandlers() {
        ipcMain.handle('app:reload', async () => {
            if (this.menuBuilder) {
                await this.menuBuilder.handleReload();
            }
            return { success: true };
        });
    }

    /**
     * Registers settings-related IPC handlers.
     */
    registerSettingsHandlers() {
        ipcMain.handle('settings:getAll', async () => {
            return { success: true, settings: this.settingsManager.getAll() };
        });

        ipcMain.handle('settings:get', async (_event, key) => {
            return { success: true, value: this.settingsManager.get(key) };
        });

        ipcMain.handle('settings:set', async (_event, key, value) => {
            this.settingsManager.set(key, value);
            return { success: true };
        });
    }

    /**
     * Registers image-related IPC handlers.
     */
    registerImageHandlers() {
        ipcMain.handle('image:browse', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false };
            }

            const result = await dialog.showOpenDialog(window, {
                title: 'Select Image',
                filters: [
                    {
                        name: 'Images',
                        extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
                    },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false };
            }

            return { success: true, filePath: result.filePaths[0] };
        });

        ipcMain.handle('image:rename', async (_event, oldPath, newName) => {
            try {
                const dir = path.dirname(oldPath);
                const newPath = path.join(dir, newName);

                if (oldPath === newPath) {
                    return { success: true, newPath: oldPath };
                }

                // Check if the target already exists
                try {
                    await fs.access(newPath);
                    return { success: false, message: `A file named "${newName}" already exists.` };
                } catch {
                    // Target doesn't exist, safe to rename
                }

                await fs.rename(oldPath, newPath);
                return { success: true, newPath };
            } catch (err) {
                return { success: false, message: /** @type {Error} */ (err).message };
            }
        });
    }

    /**
     * Registers path-related IPC handlers.
     */
    registerPathHandlers() {
        ipcMain.handle('path:toRelative', (_event, imagePath, documentPath) => {
            if (!imagePath || !documentPath) return imagePath;

            // Normalise the image path: strip file:/// prefix, decode
            let absImage = imagePath;
            if (absImage.startsWith('file:///')) {
                absImage = decodeURIComponent(absImage.slice(8));
            }

            // Resolve both to absolute, normalised paths
            const resolved = path.resolve(absImage);
            const docDir = path.dirname(path.resolve(documentPath));

            // Check whether the image sits at or below the document directory
            const rel = path.relative(docDir, resolved);
            if (rel.startsWith('..') || path.isAbsolute(rel)) {
                return imagePath;
            }

            // Return a POSIX-style relative path prefixed with ./
            return `./${rel.replace(/\\/g, '/')}`;
        });
    }

    /**
     * Registers external API handlers for scripting.
     */
    registerAPIHandlers() {
        ipcMain.handle('api:execute', async (event, command, params) => {
            return this.apiRegistry.executeCommand(command, params, event.sender);
        });

        ipcMain.handle('api:commands', async () => {
            return this.apiRegistry.getCommandList();
        });
    }

    /**
     * Broadcasts a message to all renderer processes.
     * @param {string} channel - The IPC channel
     * @param {...any} args - The arguments to send
     */
    broadcastToRenderers(channel, ...args) {
        const windows = BrowserWindow.getAllWindows();
        for (const window of windows) {
            window.webContents.send(channel, ...args);
        }
    }
}
