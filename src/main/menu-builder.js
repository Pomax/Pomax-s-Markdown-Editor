/**
 * @fileoverview Application menu builder.
 * Creates the application menu with File, Edit, and View menus.
 */

import path from 'node:path';
import { BrowserWindow, Menu, dialog } from 'electron';

/**
 * Builds the application menu.
 */
export class MenuBuilder {
    /**
     * Cached state for reload, stored outside the BrowserWindow instance.
     * @type {Object|null}
     */
    static _reloadState = null;

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
        const template = [
            this.buildFileMenu(),
            this.buildEditMenu(),
            this.buildViewMenu(),
            this.buildHelpMenu(),
        ];

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
                {
                    label: 'Open Recent',
                    submenu: this.buildRecentFilesSubmenu(),
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
     * Builds the submenu items for the Open Recent menu.
     * @returns {Electron.MenuItemConstructorOptions[]} The recent files submenu items
     */
    buildRecentFilesSubmenu() {
        const recentFiles = this.fileManager.getRecentFiles();

        if (recentFiles.length === 0) {
            return [{ label: 'No Recent Files', enabled: false }];
        }

        /** @type {Electron.MenuItemConstructorOptions[]} */
        const items = recentFiles.map((filePath) => ({
            label: path.basename(filePath),
            toolTip: filePath,
            click: () => this.handleLoadRecent(filePath),
        }));

        items.push({ type: 'separator' });
        items.push({
            label: 'Clear Recent',
            click: () => {
                this.fileManager.clearRecentFiles();
                this.refreshMenu();
            },
        });

        return items;
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
                { type: 'separator' },
                {
                    label: 'Preferences',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => this.sendMenuAction('edit:preferences'),
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
     * Builds the Help menu.
     * @returns {Electron.MenuItemConstructorOptions} The Help menu template
     */
    buildHelpMenu() {
        return {
            label: 'Help',
            submenu: [
                {
                    label: 'Reload',
                    accelerator: 'CmdOrCtrl+Shift+R',
                    click: () => this.handleReload(),
                },
                { type: 'separator' },
                {
                    label: 'About',
                    click: () => this.handleAbout(),
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
            this.refreshMenu();
        }
    }

    /**
     * Loads a recently opened file by path.
     * @param {string} filePath - The file path to load
     */
    async handleLoadRecent(filePath) {
        if (!this.window) return;

        const result = await this.fileManager.loadRecent(filePath);
        if (result.success) {
            this.window.webContents.send('menu:action', 'file:loaded', result);
        }
        // Refresh menu in both cases: success moves file to top,
        // failure removes a missing file from the list.
        this.refreshMenu();
    }

    /**
     * Rebuilds and applies the application menu.
     * Call this after the recent files list changes.
     */
    refreshMenu() {
        const menu = this.buildMenu();
        Menu.setApplicationMenu(menu);
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

    /**
     * Handles the Reload menu action.
     * Caches editor state, reloads the page, and restores state afterwards.
     */
    async handleReload() {
        if (!this.window) return;

        // Gather editor state from the renderer before reloading
        const state = await this.window.webContents.executeJavaScript(`
            (function() {
                const editor = window.editorAPI;
                if (!editor) return null;

                // Determine cursor node index by matching the node ID
                // against the tree children (IDs won't survive the reload).
                var cursorNodeIndex = 0;
                var cursorOffset = window.__editorCursorOffset ?? 0;
                var cursorNodeId = window.__editorCursorNodeId;
                var lines = document.querySelectorAll('#editor [data-node-id]');
                if (cursorNodeId && lines.length) {
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].getAttribute('data-node-id') === cursorNodeId) {
                            cursorNodeIndex = i;
                            break;
                        }
                    }
                }

                return {
                    content: editor.getContent(),
                    viewMode: editor.getViewMode(),
                    hasUnsavedChanges: editor.hasUnsavedChanges(),
                    filePath: window.__editorFilePath ?? null,
                    cursorNodeIndex: cursorNodeIndex,
                    cursorOffset: cursorOffset,
                };
            })()
        `);

        if (state) {
            // Store state on the class so it survives the reload
            MenuBuilder._reloadState = state;
            // Also preserve file path in the file manager
            if (state.filePath) {
                this.fileManager.currentFilePath = state.filePath;
            }
        }

        this.window.webContents.reloadIgnoringCache();

        // After the page finishes loading, restore the cached state
        this.window.webContents.once('did-finish-load', () => {
            const cached = MenuBuilder._reloadState;
            if (!cached || !this.window) return;

            this.window.webContents.executeJavaScript(`
                (function() {
                    // Wait for the app to initialise before restoring state
                    function tryRestore() {
                        const api = window.editorAPI;
                        if (!api) {
                            setTimeout(tryRestore, 50);
                            return;
                        }
                        const state = ${JSON.stringify(cached)};

                        // Restore document content
                        if (state.content) {
                            api.setContent(state.content);
                        }

                        // Restore file path (must happen after setContent
                        // because loadMarkdown resets the path)
                        if (state.filePath) {
                            window.__editorFilePath = state.filePath;
                        }

                        // Restore unsaved-changes flag and title
                        if (state.hasUnsavedChanges) {
                            api.setUnsavedChanges(true);
                        }

                        // Restore cursor position by node index
                        var lines = document.querySelectorAll('#editor [data-node-id]');
                        var idx = Math.min(state.cursorNodeIndex || 0, lines.length - 1);
                        if (idx >= 0 && lines[idx]) {
                            var nodeId = lines[idx].getAttribute('data-node-id');
                            if (nodeId) {
                                window.dispatchEvent(
                                    new CustomEvent('__restoreCursor', {
                                        detail: { nodeId: nodeId, offset: state.cursorOffset || 0 }
                                    })
                                );
                            }
                        }

                        // Restore view mode
                        if (state.viewMode && state.viewMode !== 'source') {
                            window.dispatchEvent(
                                new CustomEvent('__restoreViewMode', { detail: state.viewMode })
                            );
                        }
                    }
                    tryRestore();
                })()
            `);

            MenuBuilder._reloadState = null;
        });
    }

    /**
     * Handles the About menu action.
     * Shows a modal dialog with placeholder text.
     */
    handleAbout() {
        if (!this.window) return;

        dialog.showMessageBox(this.window, {
            type: 'info',
            title: 'About Markdown Editor',
            message: 'Markdown Editor',
            detail: 'Work in progress',
            buttons: ['OK'],
        });
    }
}
