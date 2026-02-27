/**
 * @fileoverview File management for the markdown editor.
 * Handles file loading, saving, and file dialogs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { dialog } from 'electron';
import { settings } from './settings-manager.js';

/**
 * Maximum number of recent files to remember.
 * @type {number}
 */
const MAX_RECENT_FILES = 10;

/**
 * Manages file operations for the markdown editor.
 */
export class FileManager {
    constructor() {
        /**
         * The current file path, or null if no file is open.
         * @type {string|null}
         */
        this.currentFilePath = null;

        /**
         * Whether the current document has unsaved changes.
         * @type {boolean}
         */
        this.hasUnsavedChanges = false;

        /**
         * List of recently opened file paths (most recent first).
         * @type {string[]}
         */
        this.recentFiles = [];

        this._loadRecentFiles();
    }

    /**
     * Opens a file dialog and loads the selected markdown file.
     * @param {Electron.BrowserWindow} window - The parent window for the dialog
     * @returns {Promise<{success: boolean, content?: string, filePath?: string, message?: string}>}
     */
    async load(window) {
        try {
            const result = await dialog.showOpenDialog(window, {
                title: 'Load Markdown File',
                filters: [
                    { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
                properties: ['openFile'],
            });

            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, message: 'Load canceled' };
            }

            const filePath = result.filePaths[0];
            const content = await fs.readFile(filePath, 'utf-8');

            this.currentFilePath = filePath;
            this.hasUnsavedChanges = false;
            this.addRecentFile(filePath);

            return {
                success: true,
                content,
                filePath,
            };
        } catch (err) {
            const error = /** @type {Error} */ (err);
            return {
                success: false,
                message: `Failed to load file: ${error.message}`,
            };
        }
    }

    /**
     * Saves content to the current file path.
     * If no file path is set, opens a save dialog.
     * @param {Electron.BrowserWindow} window - The parent window for dialogs
     * @param {string} content - The content to save
     * @returns {Promise<{success: boolean, filePath?: string, message?: string}>}
     */
    async save(window, content) {
        if (!this.currentFilePath) {
            return this.saveAs(window, content);
        }

        try {
            await fs.writeFile(this.currentFilePath, content, 'utf-8');
            this.hasUnsavedChanges = false;

            return {
                success: true,
                filePath: this.currentFilePath,
            };
        } catch (err) {
            const error = /** @type {Error} */ (err);
            return {
                success: false,
                message: `Failed to save file: ${error.message}`,
            };
        }
    }

    /**
     * Opens a save dialog and saves content to the selected path.
     * @param {Electron.BrowserWindow} window - The parent window for the dialog
     * @param {string} content - The content to save
     * @returns {Promise<{success: boolean, filePath?: string, message?: string}>}
     */
    async saveAs(window, content) {
        try {
            const result = await dialog.showSaveDialog(window, {
                title: 'Save Markdown File',
                defaultPath: this.currentFilePath || 'untitled.md',
                filters: [
                    { name: 'Markdown Files', extensions: ['md'] },
                    { name: 'All Files', extensions: ['*'] },
                ],
            });

            if (result.canceled || !result.filePath) {
                return { success: false, message: 'Save canceled' };
            }

            let filePath = result.filePath;

            // Ensure .md extension if not present
            if (!path.extname(filePath)) {
                filePath += '.md';
            }

            await fs.writeFile(filePath, content, 'utf-8');

            this.currentFilePath = filePath;
            this.hasUnsavedChanges = false;
            this.addRecentFile(filePath);

            return {
                success: true,
                filePath,
            };
        } catch (err) {
            const error = /** @type {Error} */ (err);
            return {
                success: false,
                message: `Failed to save file: ${error.message}`,
            };
        }
    }

    /**
     * Creates a new document, clearing the current file path.
     * @returns {{success: boolean}}
     */
    newDocument() {
        this.currentFilePath = null;
        this.hasUnsavedChanges = false;
        return { success: true };
    }

    /**
     * Sets the unsaved changes flag.
     * @param {boolean} hasChanges - Whether there are unsaved changes
     */
    setUnsavedChanges(hasChanges) {
        this.hasUnsavedChanges = hasChanges;
    }

    /**
     * Gets the current file name without path.
     * @returns {string|null} The file name or null if no file is open
     */
    getFileName() {
        if (!this.currentFilePath) {
            return null;
        }
        return path.basename(this.currentFilePath);
    }

    /**
     * Gets the current file path.
     * @returns {string|null} The file path or null if no file is open
     */
    getFilePath() {
        return this.currentFilePath;
    }

    /**
     * Adds a file path to the recent files list.
     * Moves it to the front if already present.
     * @param {string} filePath - The file path to add
     */
    addRecentFile(filePath) {
        if (!filePath) return;

        // Remove if already present, then prepend
        this.recentFiles = this.recentFiles.filter((f) => f !== filePath);
        this.recentFiles.unshift(filePath);

        // Trim to max size
        if (this.recentFiles.length > MAX_RECENT_FILES) {
            this.recentFiles = this.recentFiles.slice(0, MAX_RECENT_FILES);
        }

        this._saveRecentFiles();
    }

    /**
     * Returns the list of recently opened file paths.
     * @returns {string[]} Recent file paths (most recent first)
     */
    getRecentFiles() {
        return [...this.recentFiles];
    }

    /**
     * Clears the recent files list.
     */
    clearRecentFiles() {
        this.recentFiles = [];
        this._saveRecentFiles();
    }

    /**
     * Loads a file directly by path (no dialog).
     * @param {string} filePath - The file path to load
     * @returns {Promise<{success: boolean, content?: string, filePath?: string, message?: string}>}
     */
    async loadRecent(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf-8');

            this.currentFilePath = filePath;
            this.hasUnsavedChanges = false;
            this.addRecentFile(filePath);

            return {
                success: true,
                content,
                filePath,
            };
        } catch (err) {
            const error = /** @type {Error} */ (err);
            // Remove from recents if the file no longer exists
            this.recentFiles = this.recentFiles.filter((f) => f !== filePath);
            this._saveRecentFiles();
            return {
                success: false,
                message: `Failed to load file: ${error.message}`,
            };
        }
    }

    /**
     * Loads the recent files list from the settings database.
     * @private
     */
    _loadRecentFiles() {
        try {
            const stored = settings.get('recentFiles', []);
            if (Array.isArray(stored)) {
                this.recentFiles = stored;
            }
        } catch {
            this.recentFiles = [];
        }
    }

    /**
     * Saves the recent files list to the settings database.
     * @private
     */
    _saveRecentFiles() {
        try {
            settings.set('recentFiles', this.recentFiles);
        } catch {
            // Ignore write errors for recent files
        }
    }
}
