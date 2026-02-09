/**
 * @fileoverview Application menu builder.
 * Creates the application menu with File, Edit, and View menus.
 */

import fs from 'node:fs/promises';
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

        /** @type {boolean} Whether the debug context-menu listener has been registered */
        this._debugContextMenuRegistered = false;

        /** @type {boolean} Whether DevTools is currently open */
        this._devToolsOpen = false;

        /**
         * List of currently open files, sent from the renderer.
         * @type {Array<{id: string, filePath: string|null, label: string, active: boolean}>}
         */
        this.openFiles = [];
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
                    label: 'Close',
                    accelerator: 'CmdOrCtrl+W',
                    click: () => this.sendMenuAction('file:close'),
                },
                { type: 'separator' },
                {
                    label: 'Word Count',
                    click: () => this.sendMenuAction('file:wordCount'),
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
            label: filePath,
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
                    label: 'Images',
                    submenu: [
                        {
                            label: 'Gather',
                            click: () => this.handleGatherImages(),
                        },
                    ],
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
        /** @type {Electron.MenuItemConstructorOptions[]} */
        const submenu = [
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
        ];

        // Add an entry for each open file
        if (this.openFiles.length > 0) {
            submenu.push({ type: 'separator' });
            for (const file of this.openFiles) {
                submenu.push({
                    label: file.label ?? 'Untitled',
                    type: 'checkbox',
                    checked: file.active,
                    click: () => this.sendMenuAction('view:switchFile', file.id),
                });
            }
        }

        return {
            label: 'View',
            submenu,
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
                    label: 'Debug',
                    click: () => this.handleDebug(),
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
     * Handles the "Images → Gather" menu action.
     *
     * Finds every image in the document whose path is not relative to the
     * document's directory, copies those files into the document's directory,
     * and rewrites the image references to use relative paths.
     *
     * If the document has not been saved yet, prompts the user to save first.
     */
    async handleGatherImages() {
        if (!this.window) return;

        // ── 1. Ensure the document has been saved ──
        if (!this.fileManager.currentFilePath) {
            const { response } = await dialog.showMessageBox(this.window, {
                type: 'info',
                title: 'Gather Images',
                message: 'Please save your document first',
                buttons: ['Cancel', 'Save'],
                defaultId: 1,
                cancelId: 0,
            });

            if (response === 0) return; // Cancel

            // Trigger a save and wait for the renderer to complete it
            this.sendMenuAction('file:save');

            // Wait briefly for the save to complete and check again
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Poll for up to 10 seconds waiting for the file path to be set
            let waited = 0;
            while (!this.fileManager.currentFilePath && waited < 10000) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                waited += 200;
            }

            if (!this.fileManager.currentFilePath) return;
        }

        // ── 2. Confirm the gather operation ──
        const { response } = await dialog.showMessageBox(this.window, {
            type: 'question',
            title: 'Gather Images',
            message: 'Gather all images?',
            detail:
                'This will copy all externally-referenced images into the ' +
                "document's folder and update image paths to be relative.",
            buttons: ['No', 'Yes'],
            defaultId: 1,
            cancelId: 0,
        });

        if (response === 0) return; // No

        // ── 3. Get the current document content from the renderer ──
        const markdown = await this.window.webContents.executeJavaScript(
            'window.editorAPI?.getContent() ?? ""',
        );

        if (!markdown) return;

        const docDir = path.dirname(this.fileManager.currentFilePath);

        // ── 4. Find and gather images ──
        const result = await this._gatherImages(markdown, docDir);

        if (result.changedCount === 0) {
            await dialog.showMessageBox(this.window, {
                type: 'info',
                title: 'Gather Images',
                message: 'Nothing to gather',
                detail: 'All images are already relative to the document.',
                buttons: ['OK'],
            });
            return;
        }

        // ── 5. Push the updated content back into the editor ──
        const escaped = result.updatedMarkdown
            .replace(/\\/g, '\\\\')
            .replace(/`/g, '\\`')
            .replace(/\$/g, '\\$');

        await this.window.webContents.executeJavaScript(
            `window.editorAPI?.setContent(\`${escaped}\`)`,
        );

        // Mark as unsaved since the content changed
        await this.window.webContents.executeJavaScript(
            'window.editorAPI?.setUnsavedChanges(true)',
        );

        await dialog.showMessageBox(this.window, {
            type: 'info',
            title: 'Gather Images',
            message: `Gathered ${result.changedCount} image${result.changedCount === 1 ? '' : 's'}`,
            detail: result.details.join('\n'),
            buttons: ['OK'],
        });
    }

    /**
     * Scans the markdown for image references that are not relative to
     * `docDir`, copies them into `docDir`, and returns the updated markdown.
     *
     * @param {string} markdown - The document content
     * @param {string} docDir  - The directory the document lives in
     * @returns {Promise<{updatedMarkdown: string, changedCount: number, details: string[]}>}
     */
    async _gatherImages(markdown, docDir) {
        // Match both ![alt](src) and [![alt](src)](href) image syntaxes.
        // We only care about the image source (the inner `src`).
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

        let updatedMarkdown = markdown;
        let changedCount = 0;
        /** @type {string[]} */
        const details = [];

        // Collect all matches first (to avoid mutating the string mid-iteration)
        /** @type {{match: string, src: string}[]} */
        const matches = [];
        for (const m of markdown.matchAll(imageRegex)) {
            matches.push({ match: m[0], src: m[2] });
        }

        for (const { match, src } of matches) {
            // Skip URLs (http://, https://, data:, etc.)
            if (/^(https?:|data:|blob:)/i.test(src)) continue;

            // Normalise the source path for comparison
            let srcPath = src;

            // Strip file:// prefix if present
            if (srcPath.startsWith('file:///')) {
                srcPath = srcPath.slice('file:///'.length);
            } else if (srcPath.startsWith('file://')) {
                srcPath = srcPath.slice('file://'.length);
            }

            // Decode URI-encoded characters (e.g. %20 → space)
            srcPath = decodeURIComponent(srcPath);

            // On Windows, normalise forward slashes to backslashes
            srcPath = path.normalize(srcPath);

            // If the path is already relative, check if it resolves inside docDir
            if (!path.isAbsolute(srcPath)) {
                const resolved = path.resolve(docDir, srcPath);
                if (resolved.startsWith(docDir + path.sep) || resolved === docDir) {
                    // Already relative to the document directory — skip
                    continue;
                }
                // Relative but pointing outside the doc dir — treat as needing gather
                srcPath = resolved;
            }

            // At this point, srcPath is absolute. Check if it's already in docDir.
            if (
                srcPath.startsWith(docDir + path.sep) ||
                srcPath.toLowerCase().startsWith(docDir.toLowerCase() + path.sep)
            ) {
                // Already in the document's directory — just update the reference
                // to be relative.
                const relativePath = path.relative(docDir, srcPath).replace(/\\/g, '/');
                updatedMarkdown = updatedMarkdown.replace(match, match.replace(src, relativePath));
                changedCount++;
                details.push(`${path.basename(srcPath)} → ${relativePath}`);
                continue;
            }

            // Copy the file into docDir
            const baseName = path.basename(srcPath);
            let destPath = path.join(docDir, baseName);

            // Handle name collisions by appending -2, -3, etc.
            let counter = 2;
            const ext = path.extname(baseName);
            const stem = path.basename(baseName, ext);
            while (await this._fileExists(destPath)) {
                // If it's the exact same file (same size), reuse it
                if (await this._filesMatch(srcPath, destPath)) break;
                destPath = path.join(docDir, `${stem}-${counter}${ext}`);
                counter++;
            }

            try {
                if (
                    !(await this._fileExists(destPath)) ||
                    !(await this._filesMatch(srcPath, destPath))
                ) {
                    await fs.copyFile(srcPath, destPath);
                }

                const relativePath = path.relative(docDir, destPath).replace(/\\/g, '/');
                updatedMarkdown = updatedMarkdown.replace(match, match.replace(src, relativePath));
                changedCount++;
                details.push(`${srcPath} → ${relativePath}`);
            } catch (err) {
                const error = /** @type {Error} */ (err);
                details.push(`Failed to copy ${srcPath}: ${error.message}`);
            }
        }

        return { updatedMarkdown, changedCount, details };
    }

    /**
     * Checks whether a file exists.
     * @param {string} filePath
     * @returns {Promise<boolean>}
     */
    async _fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Checks whether two files have the same size (quick equality check).
     * @param {string} fileA
     * @param {string} fileB
     * @returns {Promise<boolean>}
     */
    async _filesMatch(fileA, fileB) {
        try {
            const [statA, statB] = await Promise.all([fs.stat(fileA), fs.stat(fileB)]);
            return statA.size === statB.size;
        } catch {
            return false;
        }
    }

    /**
     * Handles the Debug menu action.
     * Opens DevTools and enables the right-click context menu.
     * The context menu is automatically disabled when DevTools is closed.
     */
    handleDebug() {
        if (!this.window) return;

        const wc = this.window.webContents;

        // Only register listeners once
        if (!this._debugContextMenuRegistered) {
            this._debugContextMenuRegistered = true;
            this._devToolsOpen = false;

            wc.on('context-menu', (_event, params) => {
                if (!this._devToolsOpen) return;

                const menu = Menu.buildFromTemplate([
                    {
                        label: 'Inspect Element',
                        click: () => wc.inspectElement(params.x, params.y),
                    },
                    { type: 'separator' },
                    { role: 'copy' },
                    { role: 'paste' },
                    { role: 'selectAll' },
                ]);
                menu.popup({ window: this.window });
            });

            wc.on('devtools-opened', () => {
                this._devToolsOpen = true;
            });

            wc.on('devtools-closed', () => {
                this._devToolsOpen = false;
            });
        }

        wc.openDevTools();
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
