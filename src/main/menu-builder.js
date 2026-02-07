/**
 * @fileoverview Application menu builder.
 * Creates the application menu with File, Edit, and View menus.
 */

import { BrowserWindow, Menu } from 'electron';

/**
 * Builds the application menu.
 */
export class MenuBuilder {
    /**
     * @param {BrowserWindow} window - The main browser window
     * @param {import('./file-manager.js').FileManager} fileManager - The file manager instance
     */
    constructor(window, fileManager) {
        /** @type {BrowserWindow} */
        this.window = window;

        /** @type {import('./file-manager.js').FileManager} */
        this.fileManager = fileManager;
    }

    /**
     * Builds and returns the application menu.
     * @returns {Menu} The built menu
     */
    buildMenu() {
        const template = [this.buildFileMenu(), this.buildEditMenu(), this.buildViewMenu()];

        return Menu.buildFromTemplate(template);
    }

    /**
     * Builds the File menu.
     * @returns {Electron.MenuItemConstructorOptions} The File menu template
     */
    buildFileMenu() {
        return {
            label: 'File',
            submenu: [
                {
                    label: 'New',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => this.sendMenuAction('file:new'),
                },
                {
                    label: 'Load...',
                    accelerator: 'CmdOrCtrl+O',
                    click: () => this.handleLoad(),
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: () => this.handleSave(),
                },
                {
                    label: 'Save As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: () => this.handleSaveAs(),
                },
                { type: 'separator' },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
                    click: () => this.handleExit(),
                },
            ],
        };
    }

    /**
     * Builds the Edit menu.
     * @returns {Electron.MenuItemConstructorOptions} The Edit menu template
     */
    buildEditMenu() {
        return {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: () => this.sendMenuAction('edit:undo'),
                },
                {
                    label: 'Redo',
                    accelerator: 'CmdOrCtrl+Y',
                    click: () => this.sendMenuAction('edit:redo'),
                },
                { type: 'separator' },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    role: 'cut',
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    role: 'copy',
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    role: 'paste',
                },
                { type: 'separator' },
                {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    role: 'selectAll',
                },
            ],
        };
    }

    /**
     * Builds the View menu.
     * @returns {Electron.MenuItemConstructorOptions} The View menu template
     */
    buildViewMenu() {
        return {
            label: 'View',
            submenu: [
                {
                    label: 'Source View',
                    accelerator: 'CmdOrCtrl+1',
                    click: () => this.sendMenuAction('view:source'),
                },
                {
                    label: 'Focused Writing',
                    accelerator: 'CmdOrCtrl+2',
                    click: () => this.sendMenuAction('view:focused'),
                },
                { type: 'separator' },
                {
                    label: 'Toggle Developer Tools',
                    accelerator: 'F12',
                    click: () => {
                        if (this.window) {
                            this.window.webContents.toggleDevTools();
                        }
                    },
                },
            ],
        };
    }

    /**
     * Sends a menu action to the renderer process.
     * @param {string} action - The action identifier
     * @param {...any} args - Additional arguments
     */
    sendMenuAction(action, ...args) {
        if (this.window) {
            this.window.webContents.send('menu:action', action, ...args);
        }
    }

    /**
     * Handles the Load menu action.
     */
    async handleLoad() {
        if (!this.window) return;

        const result = await this.fileManager.load(this.window);
        if (result.success) {
            this.window.webContents.send('menu:action', 'file:loaded', result);
        }
    }

    /**
     * Handles the Save menu action.
     */
    async handleSave() {
        if (!this.window) return;
        this.sendMenuAction('file:save');
    }

    /**
     * Handles the Save As menu action.
     */
    async handleSaveAs() {
        if (!this.window) return;
        this.sendMenuAction('file:saveAs');
    }

    /**
     * Handles the Exit menu action.
     */
    handleExit() {
        if (this.window) {
            this.window.close();
        }
    }
}
