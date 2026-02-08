/**
 * @fileoverview Preload script for secure IPC communication between main and renderer.
 * Exposes a limited API to the renderer process via contextBridge.
 *
 * NOTE: Preload scripts must use CommonJS (.cjs) because they run in a
 * sandboxed environment that does not support ES modules.
 */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

/**
 * API version for the exposed interface.
 * @type {string}
 */
const API_VERSION = '1.0.0';

/**
 * Exposed API for the renderer process.
 * All interactions between renderer and main process go through this API.
 */
const electronAPI = {
    /** Current API version */
    version: API_VERSION,

    // ========== File Operations ==========

    /**
     * Creates a new document.
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    newDocument: () => ipcRenderer.invoke('file:new'),

    /**
     * Opens a file dialog and loads the selected markdown file.
     * @returns {Promise<{success: boolean, content?: string, filePath?: string, message?: string}>}
     */
    loadFile: () => ipcRenderer.invoke('file:load'),

    /**
     * Saves the current document to its file path.
     * @param {string} content - The markdown content to save
     * @returns {Promise<{success: boolean, filePath?: string, message?: string}>}
     */
    saveFile: (content) => ipcRenderer.invoke('file:save', content),

    /**
     * Opens a save dialog and saves the document to the selected path.
     * @param {string} content - The markdown content to save
     * @returns {Promise<{success: boolean, filePath?: string, message?: string}>}
     */
    saveFileAs: (content) => ipcRenderer.invoke('file:saveAs', content),

    /**
     * Notifies the main process of unsaved changes state.
     * @param {boolean} hasChanges - Whether there are unsaved changes
     * @returns {Promise<void>}
     */
    setUnsavedChanges: (hasChanges) => ipcRenderer.invoke('file:setUnsavedChanges', hasChanges),

    // ========== Document Operations ==========

    /**
     * Performs an undo operation.
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    undo: () => ipcRenderer.invoke('document:undo'),

    /**
     * Performs a redo operation.
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    redo: () => ipcRenderer.invoke('document:redo'),

    // ========== View Operations ==========

    /**
     * Switches to source view mode.
     * @returns {Promise<{success: boolean}>}
     */
    setSourceView: () => ipcRenderer.invoke('view:source'),

    /**
     * Switches to focused writing view mode.
     * @returns {Promise<{success: boolean}>}
     */
    setFocusedView: () => ipcRenderer.invoke('view:focused'),

    // ========== Application Operations ==========

    /**
     * Reloads the application UI, preserving document content, cursor, and file path.
     * @returns {Promise<{success: boolean}>}
     */
    reload: () => ipcRenderer.invoke('app:reload'),

    /**
     * Gets the list of recently opened file paths.
     * @returns {Promise<{success: boolean, files: string[]}>}
     */
    getRecentFiles: () => ipcRenderer.invoke('file:getRecentFiles'),

    // ========== Settings Operations ==========

    /**
     * Gets all settings as a key-value object.
     * @returns {Promise<{success: boolean, settings: Object<string, *>}>}
     */
    getSettings: () => ipcRenderer.invoke('settings:getAll'),

    /**
     * Gets a single setting value by key.
     * @param {string} key - The setting key
     * @returns {Promise<{success: boolean, value: *}>}
     */
    getSetting: (key) => ipcRenderer.invoke('settings:get', key),

    /**
     * Sets a single setting value.
     * @param {string} key - The setting key
     * @param {*} value - The value to store
     * @returns {Promise<{success: boolean}>}
     */
    setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),

    // ========== Image Operations ==========

    /**
     * Opens a file dialog to browse for an image.
     * @returns {Promise<{success: boolean, filePath?: string}>}
     */
    browseForImage: () => ipcRenderer.invoke('image:browse'),

    /**
     * Returns the absolute filesystem path for a File object obtained from
     * a drag-and-drop or file-input operation.
     * @param {File} file - The File object from a drop event
     * @returns {string} The absolute path on disk
     */
    getPathForFile: (file) => webUtils.getPathForFile(file),

    /**
     * Renames an image file on disk.
     * @param {string} oldPath - The current absolute file path
     * @param {string} newName - The new filename (not a full path)
     * @returns {Promise<{success: boolean, newPath?: string, message?: string}>}
     */
    renameImage: (oldPath, newName) => ipcRenderer.invoke('image:rename', oldPath, newName),

    // ========== Path Operations ==========

    /**
     * Converts an absolute image path to a relative path if it sits at or
     * below the document's directory.  Uses Node's `path` module in the main
     * process so comparisons are filesystem-correct.
     * @param {string} imagePath  - Absolute image path or file:// URL
     * @param {string} documentPath - Absolute path of the current document
     * @returns {Promise<string>} The relative path (./…) or the original value
     */
    toRelativeImagePath: (imagePath, documentPath) =>
        ipcRenderer.invoke('path:toRelative', imagePath, documentPath),

    // ========== Element Operations ==========

    /**
     * Changes the type of the current element.
     * @param {string} elementType - The new element type (e.g., 'heading1', 'paragraph')
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    changeElementType: (elementType) => ipcRenderer.invoke('element:changeType', elementType),

    /**
     * Applies formatting to the current selection.
     * @param {string} format - The format to apply (e.g., 'bold', 'italic')
     * @returns {Promise<{success: boolean, message?: string}>}
     */
    applyFormat: (format) => ipcRenderer.invoke('element:format', format),

    // ========== IPC Event Listeners ==========

    /**
     * Registers a callback for menu actions.
     * @param {function(string, ...any): void} callback - The callback function
     * @returns {function(): void} Cleanup function to remove the listener
     */
    onMenuAction: (callback) => {
        const handler = (event, action, ...args) => callback(action, ...args);
        ipcRenderer.on('menu:action', handler);
        return () => ipcRenderer.removeListener('menu:action', handler);
    },

    /**
     * Registers a callback for external API calls.
     * @param {function(string, ...any): void} callback - The callback function
     * @returns {function(): void} Cleanup function to remove the listener
     */
    onExternalAPI: (callback) => {
        const handler = (event, method, ...args) => callback(method, ...args);
        ipcRenderer.on('api:external', handler);
        return () => ipcRenderer.removeListener('api:external', handler);
    },

    // ========== Scripting API ==========

    /**
     * Executes a scripting API command.
     * @param {string} command - The API command to execute
     * @param {Object} params - The command parameters
     * @returns {Promise<Object>} The command result
     */
    executeCommand: (command, params) => ipcRenderer.invoke('api:execute', command, params),

    /**
     * Gets the list of available API commands.
     * @returns {Promise<Array<{name: string, description: string, params: Object}>>}
     */
    getAvailableCommands: () => ipcRenderer.invoke('api:commands'),
};

// Expose the API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
