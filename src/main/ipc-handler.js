/**
 * @fileoverview IPC Handler for main process.
 * Manages all IPC communication between main and renderer processes,
 * as well as external scripting API calls.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { APIRegistry } from './api-registry.js';

/**
 * Handles IPC communication for the application.
 */
export class IPCHandler {
    /**
     * @param {import('./file-manager.js').FileManager} fileManager - The file manager instance
     */
    constructor(fileManager) {
        /** @type {import('./file-manager.js').FileManager} */
        this.fileManager = fileManager;

        /** @type {APIRegistry} */
        this.apiRegistry = new APIRegistry();

        /** @type {boolean} */
        this.hasUnsavedChanges = false;
    }

    /**
     * Registers all IPC handlers.
     */
    registerHandlers() {
        this.registerFileHandlers();
        this.registerDocumentHandlers();
        this.registerViewHandlers();
        this.registerElementHandlers();
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
            return this.fileManager.save(window, content);
        });

        ipcMain.handle('file:saveAs', async (event, content) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (!window) {
                return { success: false, message: 'No active window' };
            }
            return this.fileManager.saveAs(window, content);
        });

        ipcMain.handle('file:setUnsavedChanges', async (event, hasChanges) => {
            this.hasUnsavedChanges = hasChanges;
            this.fileManager.setUnsavedChanges(hasChanges);
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

        ipcMain.handle('view:focused', async (event) => {
            const window = BrowserWindow.fromWebContents(event.sender);
            if (window) {
                window.webContents.send('menu:action', 'view:focused');
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
